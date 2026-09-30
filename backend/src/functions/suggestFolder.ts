import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { AzureOpenAI } from 'openai';

interface FolderInfo {
  id: string;
  displayName: string;
  path: string; // e.g., "Partner/Microsoft"
}

interface SuggestFolderRequest {
  email: {
    subject: string;
    senderEmail: string;
    senderName: string;
    bodyPreview: string;
  };
  folders: FolderInfo[];
}

interface SuggestFolderResponse {
  suggestedFolderId: string | null;
  suggestedFolderPath: string | null;
  confidence: number;
  reasoning: string;
  alternativeFolders: Array<{
    folderId: string;
    folderPath: string;
    confidence: number;
  }>;
}

const SYSTEM_PROMPT = `Du bist ein intelligenter E-Mail-Assistent, der E-Mails in die passenden Ordner einsortiert.

Analysiere die E-Mail und die verfügbaren Ordner. Schlage den passendsten Ordner vor.

Strategie:
1. **Absender-Domain**: Prüfe ob die Domain (@firma.de) zu einem Ordnernamen passt
2. **Absender-Name**: Prüfe ob der Name des Absenders zu einem Ordner passt
3. **Betreff-Keywords**: Analysiere Schlüsselwörter im Betreff
4. **Ordner-Hierarchie**: Verstehe die Struktur (z.B. "Partner/Microsoft", "Kunden/GMI")

Typische Ordnerstrukturen:
- Kunden/[Kundenname] - E-Mails von Kunden
- Partner/[Partnername] - E-Mails von Geschäftspartnern
- Hersteller/[Herstellername] - E-Mails von Herstellern/Vendors
- Finanzen - Rechnungen, Buchhaltung
- _PRIVAT - Private E-Mails
- _Monitoring - Automatische Benachrichtigungen

Antworte NUR mit einem JSON-Objekt:
{
  "suggestedFolderId": "<folder-id oder null wenn unsicher>",
  "suggestedFolderPath": "<Ordnerpfad z.B. 'Partner/Microsoft'>",
  "confidence": <0.0-1.0>,
  "reasoning": "<Kurze Begründung auf Deutsch, max 100 Zeichen>",
  "alternativeFolders": [
    {"folderId": "<id>", "folderPath": "<pfad>", "confidence": <0.0-1.0>}
  ]
}

Regeln:
- Nur vorschlagen wenn confidence > 0.5
- Bei Unsicherheit: suggestedFolderId = null
- Max 2 Alternativen
- Keine Newsletter in spezifische Ordner (außer _Monitoring)`;

function getOpenAIClient(): AzureOpenAI {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;

  if (!endpoint || !apiKey) {
    throw new Error('Azure OpenAI configuration missing');
  }

  return new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion: '2024-08-01-preview',
  });
}

// Quick domain-based matching (no AI needed)
function quickDomainMatch(senderEmail: string, folders: FolderInfo[]): FolderInfo | null {
  const domain = senderEmail.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  // Extract company name from domain (e.g., "microsoft.com" -> "microsoft")
  const domainParts = domain.split('.');
  const companyName = domainParts[0];

  // Direct match
  for (const folder of folders) {
    const folderLower = folder.displayName.toLowerCase();
    if (folderLower === companyName || folderLower.includes(companyName)) {
      return folder;
    }
  }

  // Known mappings
  const knownMappings: Record<string, string[]> = {
    'microsoft': ['microsoft', 'ms', 'office365', 'azure'],
    'google': ['google', 'gmail', 'gcp'],
    'amazon': ['amazon', 'aws', 'amzn'],
    'veeam': ['veeam'],
    'bitdefender': ['bitdefender'],
    'hornetsecurity': ['hornetsecurity', 'hornet'],
  };

  for (const [key, aliases] of Object.entries(knownMappings)) {
    if (aliases.some(alias => domain.includes(alias))) {
      const match = folders.find(f =>
        f.displayName.toLowerCase().includes(key) ||
        f.path.toLowerCase().includes(key)
      );
      if (match) return match;
    }
  }

  return null;
}

export async function suggestFolder(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('Suggest-folder function processed a request.');

  try {
    const body = await request.json() as SuggestFolderRequest;

    if (!body.email || !body.folders || body.folders.length === 0) {
      return {
        status: 400,
        jsonBody: { error: 'Email and folders are required' },
      };
    }

    const { email, folders } = body;

    // Try quick domain match first (faster, no API call)
    const quickMatch = quickDomainMatch(email.senderEmail, folders);
    if (quickMatch) {
      const response: SuggestFolderResponse = {
        suggestedFolderId: quickMatch.id,
        suggestedFolderPath: quickMatch.path || quickMatch.displayName,
        confidence: 0.9,
        reasoning: `Absender-Domain passt zu "${quickMatch.displayName}"`,
        alternativeFolders: [],
      };
      return { status: 200, jsonBody: response };
    }

    // Use AI for complex matching
    const client = getOpenAIClient();
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1-mini';

    // Format folders for prompt (limit to prevent token overflow)
    const folderList = folders
      .slice(0, 50)
      .map(f => `- ID: ${f.id} | Pfad: ${f.path || f.displayName}`)
      .join('\n');

    const userMessage = `E-Mail analysieren:

Absender: ${email.senderName} <${email.senderEmail}>
Betreff: ${email.subject}
Vorschau: ${email.bodyPreview.substring(0, 200)}

Verfügbare Ordner:
${folderList}`;

    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 100,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content) as SuggestFolderResponse;

    // Validate folder ID exists
    if (parsed.suggestedFolderId) {
      const folderExists = folders.some(f => f.id === parsed.suggestedFolderId);
      if (!folderExists) {
        parsed.suggestedFolderId = null;
        parsed.suggestedFolderPath = null;
        parsed.confidence = 0;
      }
    }

    return { status: 200, jsonBody: parsed };
  } catch (error) {
    context.error('Folder suggestion error:', error);

    return {
      status: 500,
      jsonBody: {
        error: 'Folder suggestion failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

app.http('suggest-folder', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: suggestFolder,
});
