// Ordnet einzelne Mails ihrer Kategorie zu und erzeugt zusaetzlich einen
// "Handlungsbedarf"-Hinweis, wo einer verdient ist. Reine Logik, keine
// Nebenwirkungen, kein Netzwerk.

import {
  categoryRules,
  displayOrder,
  type CategoryId,
  type MatchContext,
  type CategoryRule,
} from '../config/inboxCategoryRules';
import type { UnreadMail } from './graphInboxService';

export interface CategorizedMail extends UnreadMail {
  categoryId: CategoryId;
  actionHint?: string; // gesetzt, wenn diese Mail auch im Handlungsbedarf-Block erscheint
}

export interface CategoryBucket {
  rule: CategoryRule;
  mails: CategorizedMail[];
  topSenders: Array<{ address: string; name: string; count: number }>;
}

export interface Categorization {
  buckets: CategoryBucket[]; // in displayOrder, auch leere ausgefiltert
  actionable: CategorizedMail[]; // Handlungsbedarf-Block (neueste zuerst)
  total: number;
}

function buildContext(mail: UnreadMail): MatchContext {
  return {
    senderAddress: (mail.from?.emailAddress?.address ?? '').toLowerCase(),
    senderName: (mail.from?.emailAddress?.name ?? '').toLowerCase(),
    subject: (mail.subject ?? '').toLowerCase(),
    bodyPreview: (mail.bodyPreview ?? '').toLowerCase(),
  };
}

function pickCategory(ctx: MatchContext): CategoryId {
  for (const rule of categoryRules) {
    if (rule.match(ctx)) return rule.id;
  }
  return 'customers';
}

// Feld-basierte Detektion fuer Handlungsbedarf. Ergibt entweder einen
// Kurzhinweis oder null.
function detectActionHint(mail: UnreadMail, categoryId: CategoryId, ctx: MatchContext): string | null {
  // Kunden & Geschaeftliches → immer relevant
  if (categoryId === 'customers') return 'persoenliche Mail';

  // DocuSign — Signatur offen
  if (ctx.senderAddress.includes('docusign')) return 'Signatur offen';

  // Betreff-basierte kritische Signale
  if (ctx.subject.includes('sicherheitslücke') || ctx.subject.includes('sicherheitsluecke')) {
    return 'Sicherheitsluecke gemeldet';
  }
  if (ctx.subject.includes('malware')) return 'Malware-Verdacht';
  if (ctx.subject.includes('latenz')) return 'Latenz-Alarm';
  if (ctx.subject.includes('neuem gerät') || ctx.subject.includes('neuem geraet')) {
    return 'Login von neuem Geraet';
  }
  if (ctx.subject.includes('gesperrt')) return 'Konto gesperrt';
  if (ctx.subject.includes("isn't working")) return 'Service-Ausfall';
  if (ctx.subject.includes('anzahl dateien')) return 'Datei-Anzahl-Alarm';

  // Backup-Bericht mit "erneut gewaehrt" — nur der neueste, wird spaeter beim
  // Deduplizieren gehandhabt.
  if (categoryId === 'backup' && ctx.bodyPreview.includes('erneut gewährt')) {
    return 'Backup-Zugriff erneut gewaehren';
  }
  if (categoryId === 'backup' && ctx.bodyPreview.includes('erneut gewaehrt')) {
    return 'Backup-Zugriff erneut gewaehren';
  }

  return null;
}

export function categorize(mails: UnreadMail[]): Categorization {
  const withCat: CategorizedMail[] = mails.map((mail) => {
    const ctx = buildContext(mail);
    const categoryId = pickCategory(ctx);
    const hint = detectActionHint(mail, categoryId, ctx);
    return { ...mail, categoryId, actionHint: hint ?? undefined };
  });

  // Backup-Bericht dedupliziert: nur den neuesten in Handlungsbedarf lassen.
  let backupSeen = false;
  const backupSorted = [...withCat]
    .filter((m) => m.categoryId === 'backup' && m.actionHint === 'Backup-Zugriff erneut gewaehren')
    .sort((a, b) => (b.receivedDateTime ?? '').localeCompare(a.receivedDateTime ?? ''));
  const keepBackupId = backupSorted[0]?.id;
  for (const mail of withCat) {
    if (
      mail.categoryId === 'backup' &&
      mail.actionHint === 'Backup-Zugriff erneut gewaehren' &&
      mail.id !== keepBackupId
    ) {
      mail.actionHint = undefined;
    }
    // Ohne doppeltes Zaehlen sicherstellen
    if (mail.id === keepBackupId) backupSeen = true;
  }
  void backupSeen;

  // Buckets bauen
  const grouped = new Map<CategoryId, CategorizedMail[]>();
  for (const m of withCat) {
    const arr = grouped.get(m.categoryId) ?? [];
    arr.push(m);
    grouped.set(m.categoryId, arr);
  }

  const buckets: CategoryBucket[] = displayOrder
    .map((id) => {
      const rule = categoryRules.find((r) => r.id === id)!;
      const items = (grouped.get(id) ?? []).sort((a, b) =>
        (b.receivedDateTime ?? '').localeCompare(a.receivedDateTime ?? '')
      );
      const topSenders = computeTopSenders(items, 4);
      return { rule, mails: items, topSenders };
    })
    .filter((b) => b.mails.length > 0);

  const actionable = withCat
    .filter((m) => !!m.actionHint)
    .sort((a, b) => (b.receivedDateTime ?? '').localeCompare(a.receivedDateTime ?? ''));

  return { buckets, actionable, total: mails.length };
}

function computeTopSenders(
  mails: CategorizedMail[],
  limit: number
): Array<{ address: string; name: string; count: number }> {
  const map = new Map<string, { address: string; name: string; count: number }>();
  for (const m of mails) {
    const addr = (m.from?.emailAddress?.address ?? 'unbekannt').toLowerCase();
    const name = m.from?.emailAddress?.name ?? addr;
    const cur = map.get(addr);
    if (cur) {
      cur.count += 1;
    } else {
      map.set(addr, { address: addr, name, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}
