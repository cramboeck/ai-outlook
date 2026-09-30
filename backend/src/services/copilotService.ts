// Copilot Service — Context-Aware Draft generation
//
// Strategy (RAG):
//   1. Call Microsoft Graph /copilot/retrieval with the email context
//      → returns ranked snippets from the user's Teams/SharePoint/OneDrive
//   2. Feed those snippets as grounding context into Azure OpenAI to write
//      a reply draft in German business tone
//   3. Map retrieval hits to Citation objects so the UI can render
//      "[1] Teams Chat: ..." links
//
// This service is deliberately *stateless* — it does not read or write the
// database. The processing pipeline owns persistence and the feature-flag
// check; this service only orchestrates Graph + Azure OpenAI.

import { getOpenAIClient, getModel, wrapSystemPrompt } from './openaiClient';
import { getGraphTokenOnBehalfOf, OboAuthError } from './authService';
import { logger } from './logger';

const GRAPH_RETRIEVAL_URL = 'https://graph.microsoft.com/v1.0/copilot/retrieval';
const RETRIEVAL_TIMEOUT_MS = 20_000;
const SYNTHESIS_TIMEOUT_MS = 30_000;
const MAX_CITATIONS_IN_PROMPT = 5;
const MAX_SNIPPET_CHARS = 800;

// --- Public types ---------------------------------------------------------

export type CitationSource = 'teams' | 'sharepoint' | 'onedrive' | 'email' | 'other';

export interface Citation {
  index: number;            // 1-based, stable for rendering [1], [2], ...
  title: string;
  url: string | null;
  source: CitationSource;
  snippet: string;
}

export interface CopilotDraftInput {
  emailSubject: string;
  emailBody: string;
  emailSender: string;
  /** Raw inbound JWT (without "Bearer "). Used for OBO. */
  userAccessToken: string;
  /** Optional freeform tone/intent guidance from the UI. */
  instruction?: string;
  /** Display name of the user, included in the prompt for a proper sign-off. */
  userName?: string;
}

export interface CopilotDraftResult {
  draftText: string;
  citations: Citation[];
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  retrievalHitCount: number;
  processingTimeMs: number;
}

export type CopilotDraftOutcome =
  | { status: 'ok'; draft: CopilotDraftResult }
  | { status: 'unavailable'; reason: CopilotUnavailableReason; httpStatus: number };

export type CopilotUnavailableReason =
  | 'obo_not_configured'
  | 'consent_required'
  | 'no_copilot_license'
  | 'retrieval_failed'
  | 'synthesis_failed';

// --- Errors ---------------------------------------------------------------

export class CopilotServiceError extends Error {
  readonly reason: CopilotUnavailableReason;
  readonly httpStatus: number;
  constructor(reason: CopilotUnavailableReason, message: string, httpStatus = 500) {
    super(message);
    this.name = 'CopilotServiceError';
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

// --- Graph retrieval response (documented shape, partial) -----------------

interface GraphRetrievalHit {
  extracts: Array<{ text: string }>;
  resource?: {
    name?: string;
    webUrl?: string;
    id?: string;
    '@odata.type'?: string;
  };
  resourceMetadata?: Record<string, unknown>;
}

interface GraphRetrievalResponse {
  retrievalHits: GraphRetrievalHit[];
}

// --- Public API -----------------------------------------------------------

/**
 * Generate a Copilot-grounded draft reply for the given email.
 * Never throws on "expected" failures (missing license, consent missing,
 * retrieval empty) — instead returns `{ status: 'unavailable', ... }` so the
 * pipeline can fall back to the default Azure OpenAI draft generator.
 */
export async function generateContextAwareDraft(
  input: CopilotDraftInput
): Promise<CopilotDraftOutcome> {
  const startTime = Date.now();

  // Step 1 — OBO exchange
  let graphToken: string;
  try {
    const tokenResult = await getGraphTokenOnBehalfOf(input.userAccessToken);
    graphToken = tokenResult.accessToken;
  } catch (err) {
    if (err instanceof OboAuthError) {
      const reason: CopilotUnavailableReason =
        err.code === 'missing_config' ? 'obo_not_configured'
        : err.code === 'consent_required' ? 'consent_required'
        : 'retrieval_failed';
      return { status: 'unavailable', reason, httpStatus: err.httpStatus };
    }
    logger.error('copilot: unexpected OBO error', { error: (err as Error).message });
    return { status: 'unavailable', reason: 'retrieval_failed', httpStatus: 500 };
  }

  // Step 2 — Graph /copilot/retrieval
  let retrievalHits: GraphRetrievalHit[];
  try {
    retrievalHits = await callCopilotRetrieval(graphToken, input);
  } catch (err) {
    if (err instanceof CopilotServiceError) {
      return { status: 'unavailable', reason: err.reason, httpStatus: err.httpStatus };
    }
    logger.warn('copilot: retrieval failed, falling back', {
      error: (err as Error).message.slice(0, 200),
    });
    return { status: 'unavailable', reason: 'retrieval_failed', httpStatus: 502 };
  }

  const citations = mapHitsToCitations(retrievalHits);

  // Step 3 — synthesise draft with Azure OpenAI grounded on retrieval
  try {
    const synth = await synthesiseDraft(input, citations);
    return {
      status: 'ok',
      draft: {
        draftText: synth.draftText,
        citations,
        model: synth.model,
        usage: synth.usage,
        retrievalHitCount: retrievalHits.length,
        processingTimeMs: Date.now() - startTime,
      },
    };
  } catch (err) {
    logger.error('copilot: synthesis failed', {
      error: (err as Error).message.slice(0, 200),
    });
    return { status: 'unavailable', reason: 'synthesis_failed', httpStatus: 502 };
  }
}

// --- Graph retrieval ------------------------------------------------------

async function callCopilotRetrieval(
  graphToken: string,
  input: CopilotDraftInput
): Promise<GraphRetrievalHit[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RETRIEVAL_TIMEOUT_MS);

  try {
    // Build a retrieval query from the email. Keep it short — Copilot retrieval
    // performs best with focused natural-language queries, not full email bodies.
    const query = buildRetrievalQuery(input);

    const body = {
      queryString: query,
      dataSource: 'sharePoint',       // 'sharePoint' covers SP + OneDrive; Teams hits are also returned via chat references when available
      resourceMetadata: ['title', 'author', 'lastModifiedDateTime'],
      maximumNumberOfResults: 10,
    };

    const res = await fetch(GRAPH_RETRIEVAL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${graphToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (res.status === 401 || res.status === 403) {
      // 403 on /copilot/retrieval most commonly means: tenant/user has no
      // Copilot license, admin hasn't enabled semantic index, or user lacks
      // required Graph scopes.
      const text = (await safeReadText(res)).slice(0, 300);
      throw new CopilotServiceError(
        'no_copilot_license',
        `retrieval ${res.status}: ${text}`,
        res.status
      );
    }
    if (!res.ok) {
      const text = (await safeReadText(res)).slice(0, 300);
      throw new CopilotServiceError(
        'retrieval_failed',
        `retrieval ${res.status}: ${text}`,
        502
      );
    }

    const json = (await res.json()) as GraphRetrievalResponse;
    return Array.isArray(json.retrievalHits) ? json.retrievalHits : [];
  } finally {
    clearTimeout(timer);
  }
}

function buildRetrievalQuery(input: CopilotDraftInput): string {
  // Use subject + first ~500 chars of body. Strip HTML tags crudely.
  const plain = input.emailBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const trimmed = plain.slice(0, 500);
  return `${input.emailSubject}\n\n${trimmed}`;
}

function mapHitsToCitations(hits: GraphRetrievalHit[]): Citation[] {
  const out: Citation[] = [];
  let i = 1;
  for (const hit of hits) {
    const resource = hit.resource ?? {};
    const url = typeof resource.webUrl === 'string' ? resource.webUrl : null;
    const title = typeof resource.name === 'string' && resource.name.length > 0
      ? resource.name
      : 'Unbenanntes Dokument';
    const snippet = (hit.extracts ?? [])
      .map(e => e.text)
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_SNIPPET_CHARS);
    out.push({
      index: i++,
      title,
      url,
      source: classifySource(resource['@odata.type'], url),
      snippet,
    });
  }
  return out;
}

function classifySource(odataType: string | undefined, url: string | null): CitationSource {
  const lowerUrl = (url ?? '').toLowerCase();
  const lowerType = (odataType ?? '').toLowerCase();
  if (lowerType.includes('chatmessage') || lowerUrl.includes('teams.microsoft.com')) return 'teams';
  if (lowerUrl.includes('sharepoint.com')) return 'sharepoint';
  if (lowerUrl.includes('my.sharepoint.com') || lowerUrl.includes('-my.sharepoint.com')) return 'onedrive';
  if (lowerType.includes('message') || lowerType.includes('mail')) return 'email';
  return 'other';
}

// --- Azure OpenAI synthesis ----------------------------------------------

const SYSTEM_PROMPT = `Du bist ein professioneller Assistent, der deutschsprachige Antwort-Entwuerfe fuer Geschaeftsemails verfasst.

Regeln:
- Antworte IMMER auf Deutsch, wenn die Originalmail auf Deutsch ist.
- Nutze die bereitgestellten Kontext-Snippets aus den Firmen-Dokumenten (Teams / SharePoint / OneDrive) zur inhaltlichen Begruendung.
- Wenn du Informationen aus einem Kontext-Snippet verwendest, verweise darauf mit [1], [2] etc. so dass der Empfaenger weiss worauf sich die Antwort stuetzt.
- KEIN Einleitungssatz wie "Hier ist dein Entwurf:". Gib NUR den Antworttext.
- Passe den Ton an den Sender an (formell bei Externen, kollegial bei internen Kontakten).
- Halte die Antwort prägnant: 80 bis 200 Woerter.
- Wenn die Kontext-Snippets irrelevant sind, schreibe eine hoefliche, aber kontextneutrale Antwort und verweise nicht auf Quellen.`;

interface SynthesisResult {
  draftText: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

async function synthesiseDraft(
  input: CopilotDraftInput,
  citations: Citation[]
): Promise<SynthesisResult> {
  const client = getOpenAIClient();
  const model = getModel();

  const contextBlock = citations.length === 0
    ? '(Keine Firmen-Kontextinformationen gefunden.)'
    : citations
        .slice(0, MAX_CITATIONS_IN_PROMPT)
        .map(c => `[${c.index}] ${c.title} (${c.source})\n${c.snippet}`)
        .join('\n\n');

  const userMessage = [
    `# Eingangs-E-Mail`,
    `**Von:** ${input.emailSender}`,
    `**Betreff:** ${input.emailSubject}`,
    ``,
    input.emailBody.slice(0, 4000),
    ``,
    `# Firmen-Kontext (aus Teams / SharePoint / OneDrive)`,
    contextBlock,
    ``,
    input.instruction ? `# Zusaetzliche Anweisung\n${input.instruction}\n` : '',
    input.userName ? `# Signatur\nSchliesse mit "Freundliche Gruesse,\\n${input.userName}" oder einer passenden Variante.` : '',
  ].filter(Boolean).join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SYNTHESIS_TIMEOUT_MS);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: wrapSystemPrompt(SYSTEM_PROMPT) },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        max_tokens: 600,
      },
      { signal: ctrl.signal }
    );

    const draftText = response.choices[0]?.message?.content?.trim();
    if (!draftText) {
      throw new Error('synthesis: empty response');
    }

    return {
      draftText,
      model,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: response.usage?.total_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
