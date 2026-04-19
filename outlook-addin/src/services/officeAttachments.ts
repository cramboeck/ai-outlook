// Office.js helpers for the MailSort task pane
// Encapsulates the asynchronous Office APIs we call from multiple components:
//   - fetchFirstPdfAttachment: pull the primary business document as base64
//   - applyOutlookCategory:    assign a category to the selected email,
//                              creating it in masterCategories when missing

declare const Office: any;

export interface AttachmentBase64 {
  name: string;
  contentType: string;
  contentBytes: string;
}

/**
 * Promise wrapper around an async Office.js call.
 */
function officePromise<T>(call: (cb: (r: any) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    call((result: any) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value as T);
      } else {
        reject(new Error(result.error?.message || 'Office.js call failed'));
      }
    });
  });
}

/**
 * Return the first non-inline PDF attachment of the currently-selected
 * email as base64, suitable for shipping to /process/extract-document or
 * /integrations/:id/forward. Returns null when no PDF is attached.
 *
 * Priority: PDF by contentType > PDF by filename extension > first
 * non-inline attachment that's not an image.
 */
export async function fetchFirstPdfAttachment(): Promise<AttachmentBase64 | null> {
  const item = Office.context?.mailbox?.item;
  if (!item) return null;
  const atts: Array<{ id: string; name: string; contentType: string; isInline: boolean }>
    = item.attachments ?? [];

  const realAtts = atts.filter(a => !a.isInline);
  if (realAtts.length === 0) return null;

  const pdf = realAtts.find(a => a.contentType === 'application/pdf')
    ?? realAtts.find(a => /\.pdf$/i.test(a.name ?? ''))
    ?? realAtts.find(a => !/(image\/|png|jpg|jpeg|gif)/i.test(a.contentType ?? ''));

  if (!pdf) return null;

  // getAttachmentContentAsync returns { content, format }
  // where format is Office.MailboxEnums.AttachmentContentFormat.Base64 for most docs.
  const content = await officePromise<{ content: string; format: string }>(cb =>
    item.getAttachmentContentAsync(
      pdf.id,
      { asyncContext: null },
      cb
    )
  );

  if (!content?.content) return null;

  return {
    name: pdf.name || 'document.pdf',
    contentType: pdf.contentType || 'application/pdf',
    contentBytes: content.content,
  };
}

/**
 * Apply a category to the currently-selected Outlook email. Creates the
 * category in the user's masterCategories list first if it doesn't exist
 * yet (Outlook rejects addAsync on unknown names).
 *
 * The preset color is a best-guess default — Outlook will show whatever
 * colour the user has configured for an existing category, or assign a
 * new one from our palette when we create it.
 */
export async function applyOutlookCategory(categoryName: string): Promise<void> {
  const item = Office.context?.mailbox?.item;
  if (!item?.categories) {
    throw new Error('Categories API nicht verfügbar in diesem Outlook-Kontext');
  }

  try {
    await officePromise(cb => item.categories.addAsync([categoryName], cb));
    return;
  } catch (addErr) {
    // Most common cause: category is not in masterCategories yet.
    const master = Office.context?.mailbox?.masterCategories;
    if (!master) throw addErr;

    try {
      await officePromise(cb =>
        master.addAsync(
          [{
            displayName: categoryName,
            color: Office.MailboxEnums.CategoryColor.Preset0,
          }],
          cb
        )
      );
    } catch {
      // Already in master list (duplicate error) — fine, proceed to retry.
    }

    await officePromise(cb => item.categories.addAsync([categoryName], cb));
  }
}
