// Forward Service
// Shared logic for forwarding documents to integrations
// Used by: Freigabe-Workflow (actions.ts), Auto-Forward (processing.ts), Manual Forward (integrations.ts)

import { query } from '../db';
import { logEvent } from './auditService';
import { logger } from './logger';

interface ForwardRequest {
  email_id: string;
  email_subject: string;
  document_data?: Record<string, any>;
  action_id?: string;
  attachment?: {
    name: string;
    contentType: string;
    contentBytes: string; // base64
  };
  access_token?: string; // Graph token for SharePoint
}

interface ForwardResult {
  integration_id: string;
  integration_name: string;
  integration_type: string;
  success: boolean;
  message: string;
  timestamp: string;
  document_id?: number;
  document_url?: string;
}

/**
 * Forward a document to a single integration.
 * Returns the result of the forward operation.
 */
export async function forwardToIntegration(
  integration: any,
  data: ForwardRequest
): Promise<ForwardResult> {
  const config = typeof integration.config === 'string'
    ? JSON.parse(integration.config)
    : integration.config;

  const result: ForwardResult = {
    integration_id: integration.id,
    integration_name: integration.name,
    integration_type: integration.type,
    success: false,
    message: '',
    timestamp: new Date().toISOString(),
  };

  try {
    switch (integration.type) {
      case 'paperless': {
        const baseUrl = (config.base_url || '').replace(/\/+$/, '');

        // No PDF/binary attached → refuse. Previously we uploaded a synthetic
        // .txt of metadata, which pollutes the DMS with unusable junk rows.
        if (!data.attachment?.contentBytes) {
          result.message = 'Paperless: PDF-Anhang fehlt in der E-Mail oder konnte nicht geladen werden.';
          break;
        }

        let title = data.email_subject || `Email ${data.email_id || 'unknown'}`;
        const metaParts: string[] = [];
        if (data.document_data) {
          for (const [k, v] of Object.entries(data.document_data)) {
            if (v != null) metaParts.push(`${k}: ${v}`);
          }
          if (metaParts.length > 0) title += ` | ${metaParts.join(' | ')}`;
        }

        // Paperless requires multipart/form-data with a file
        const formData = new FormData();
        const buffer = Buffer.from(data.attachment.contentBytes, 'base64');
        const fileBlob = new Blob([buffer], { type: data.attachment.contentType || 'application/pdf' });
        formData.append('document', fileBlob, data.attachment.name || 'document.pdf');
        logger.info('Paperless (forwardService): uploading real attachment', { name: data.attachment.name, size: buffer.length });
        formData.append('title', title);

        if (config.default_correspondent) formData.append('correspondent', config.default_correspondent);
        if (config.default_document_type) formData.append('document_type', config.default_document_type);
        if (config.default_tags) formData.append('tags', config.default_tags);

        const response = await fetch(`${baseUrl}/api/documents/post_document/`, {
          method: 'POST',
          headers: {
            Authorization: `Token ${config.api_token}`,
            Accept: 'application/json',
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          result.message = `Paperless Fehler: ${response.status} ${errorText.substring(0, 200)}`;
          break;
        }

        const taskUuid = (await response.text()).replace(/"/g, '');
        logger.info('Paperless upload accepted (forwardService)', { taskUuid });

        // Poll task status to get the document ID (max 30s, 2s intervals)
        let documentId: number | undefined;
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const taskResp = await fetch(`${baseUrl}/api/tasks/?task_id=${taskUuid}`, {
              headers: { Authorization: `Token ${config.api_token}`, Accept: 'application/json' },
            });
            if (taskResp.ok) {
              const tasks = await taskResp.json();
              const task = (tasks.results || tasks)?.[0];
              if (task?.status === 'SUCCESS' && task.related_document) {
                documentId = parseInt(task.related_document, 10);
                logger.info('Paperless document created (forwardService)', { documentId, taskUuid });
                break;
              } else if (task?.status === 'FAILURE') {
                logger.error('Paperless task failed (forwardService)', { taskUuid, result: task.result });
                break;
              }
            }
          } catch { /* continue polling */ }
        }

        // Set custom fields on the document if we got an ID
        if (documentId) {
          try {
            const fieldsResp = await fetch(`${baseUrl}/api/custom_fields/`, {
              headers: { Authorization: `Token ${config.api_token}`, Accept: 'application/json' },
            });
            const fields = fieldsResp.ok ? await fieldsResp.json() : { results: [] };
            const fieldMap = new Map<string, number>();
            for (const f of (fields.results || fields)) {
              fieldMap.set(f.name, f.id);
            }

            const customFields: Array<{ field: number; value: any }> = [];
            if (fieldMap.has('Email-ID') && data.email_id) {
              customFields.push({ field: fieldMap.get('Email-ID')!, value: data.email_id });
            }
            if (fieldMap.has('Rechnungsnummer') && data.document_data?.invoiceNumber) {
              customFields.push({ field: fieldMap.get('Rechnungsnummer')!, value: data.document_data.invoiceNumber });
            }
            if (fieldMap.has('Betrag') && data.document_data?.amount) {
              const currency = data.document_data.currency || 'EUR';
              customFields.push({ field: fieldMap.get('Betrag')!, value: `${currency}${data.document_data.amount}` });
            }
            if (fieldMap.has('Absender') && data.document_data?.vendor) {
              customFields.push({ field: fieldMap.get('Absender')!, value: data.document_data.vendor });
            }
            if (fieldMap.has('MailSort-Ref') && data.action_id) {
              customFields.push({ field: fieldMap.get('MailSort-Ref')!, value: data.action_id });
            }

            if (customFields.length > 0) {
              const patchResp = await fetch(`${baseUrl}/api/documents/${documentId}/`, {
                method: 'PATCH',
                headers: {
                  Authorization: `Token ${config.api_token}`,
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                },
                body: JSON.stringify({ custom_fields: customFields }),
              });
              if (patchResp.ok) {
                logger.info('Paperless custom fields set (forwardService)', { documentId, fieldCount: customFields.length });
              } else {
                logger.warn('Failed to set custom fields (forwardService)', { status: patchResp.status });
              }
            }
          } catch (err) {
            logger.warn('Custom fields error (non-critical, forwardService)', { error: (err as Error).message });
          }
        }

        result.success = true;
        result.message = documentId
          ? `An Paperless-ngx weitergeleitet (Dokument #${documentId})`
          : `An Paperless-ngx weitergeleitet (Task: ${taskUuid.substring(0, 8)})`;

        // Store document reference for forwarded_to tracking
        if (documentId) {
          result.document_id = documentId;
          result.document_url = `${baseUrl}/documents/${documentId}/details`;
        }
        break;
      }

      case 'sevdesk': {
        // sevDesk: Create incoming voucher (Eingangsrechnung) with optional file upload
        const apiToken = config.api_token;
        if (!apiToken) {
          result.message = 'sevDesk API-Token fehlt';
          break;
        }

        const sevBaseUrl = 'https://my.sevdesk.de/api/v1';
        const docData = data.document_data || {};
        const invoiceNum = docData.invoiceNumber || docData.invoice_number;

        // Step 0: Duplicate check by invoice number
        if (invoiceNum) {
          try {
            const searchResp = await fetch(
              `${sevBaseUrl}/Voucher?limit=5&voucherType=VOU&descriptionLike=${encodeURIComponent(invoiceNum)}`,
              { headers: { Authorization: apiToken, Accept: 'application/json' } }
            );
            if (searchResp.ok) {
              const searchData = await searchResp.json();
              if ((searchData.objects || []).length > 0) {
                const match = searchData.objects[0];
                result.success = true;
                result.message = `Beleg mit Rechnungsnr. "${invoiceNum}" bereits vorhanden (sevDesk ID: ${match.id}). Duplikat vermieden.`;
                result.document_id = match.id;
                result.document_url = `https://my.sevdesk.de/#/fi/VOU/${match.id}`;
                break;
              }
            }
          } catch { /* non-critical */ }
        }

        // Step 1: Upload file if we have an attachment
        let uploadedFileId: string | undefined;
        if (data.attachment?.contentBytes) {
          const buffer = Buffer.from(data.attachment.contentBytes, 'base64');
          const sevFormData = new FormData();
          const fileBlob = new Blob([buffer], { type: data.attachment.contentType || 'application/pdf' });
          sevFormData.append('file', fileBlob, data.attachment.name || 'document.pdf');

          const uploadResp = await fetch(`${sevBaseUrl}/Voucher/Factory/uploadTempFile`, {
            method: 'POST',
            headers: { Authorization: apiToken },
            body: sevFormData,
          });
          if (uploadResp.ok) {
            const uploadResult = await uploadResp.json();
            uploadedFileId = uploadResult?.objects?.filename;
          }
        }

        // Step 2: Parse amount and tax
        let sumGross = 0;
        let taxRate = 19;
        if (docData.amount) {
          sumGross = parseFloat(String(docData.amount).replace(',', '.')) || 0;
        }
        if (docData.taxRate) {
          taxRate = parseFloat(String(docData.taxRate)) || 19;
        }
        const sumNet = sumGross / (1 + taxRate / 100);

        // Step 3: Create voucher
        const voucherPayload: any = {
          voucher: {
            objectName: 'Voucher',
            mapAll: true,
            voucherType: 'VOU',
            status: 50,
            description: data.email_subject || 'Email-Rechnung',
            creditDebit: 'D',
            supplierName: docData.vendor || 'Unbekannter Lieferant',
            voucherDate: new Date().toISOString().split('T')[0],
            taxType: docData.taxType || 'default',
            ...(config.contact_id ? { supplier: { id: parseInt(config.contact_id, 10), objectName: 'Contact' } } : {}),
          },
          voucherPosSave: sumGross > 0 ? [{
            objectName: 'VoucherPos',
            mapAll: true,
            taxRate,
            sum: sumNet.toFixed(2),
            sumGross: sumGross.toFixed(2),
            comment: docData.invoiceNumber
              ? `Rechnung ${docData.invoiceNumber} - ${data.email_subject || ''}`
              : data.email_subject || 'Position 1',
            accountingType: { id: 26, objectName: 'AccountingType' },
          }] : undefined,
        };
        if (uploadedFileId) {
          voucherPayload.filename = uploadedFileId;
        }

        const voucherResponse = await fetch(`${sevBaseUrl}/Voucher/Factory/saveVoucher`, {
          method: 'POST',
          headers: { Authorization: apiToken, 'Content-Type': 'application/json' },
          body: JSON.stringify(voucherPayload),
        });

        if (voucherResponse.ok) {
          const vResult = await voucherResponse.json().catch(() => ({}));
          const voucherId = vResult?.objects?.voucher?.id;
          result.success = true;
          result.message = `Eingangsrechnung in sevDesk erstellt${voucherId ? ` (ID: ${voucherId})` : ''}`;
          if (voucherId) {
            result.document_id = voucherId;
            result.document_url = `https://my.sevdesk.de/#/fi/VOU/${voucherId}`;
          }
        } else {
          const errorText = await voucherResponse.text();
          result.message = `sevDesk Fehler: ${voucherResponse.status} ${errorText.substring(0, 200)}`;
        }
        break;
      }

      case 'webhook': {
        const webhookUrl = config.url;
        if (!webhookUrl) {
          result.message = 'Webhook URL fehlt';
          break;
        }

        const isTeamsWebhook = webhookUrl.includes('webhook.office.com') ||
          webhookUrl.includes('microsoft.com') ||
          webhookUrl.includes('logic.azure.com') ||
          webhookUrl.includes('powerplatform.com') ||
          webhookUrl.includes('powerautomate') ||
          config.format === 'teams';

        let webhookBody: any;
        const docData = data.document_data || {};
        const typeLabels: Record<string, string> = {
          invoice: 'Rechnung', order: 'Bestellung',
          contract: 'Vertrag', receipt: 'Quittung',
        };
        const docType = typeLabels[docData.type || ''] || 'Dokument';

        if (isTeamsWebhook) {
          // Power Automate / Teams: Send structured data that can be used in flows
          // AND include a pre-built Adaptive Card for direct Teams posting
          const facts: Array<{ title: string; value: string }> = [];
          if (docData.vendor) facts.push({ title: 'Lieferant', value: docData.vendor });
          if (docData.amount) facts.push({ title: 'Betrag', value: `${docData.amount} ${docData.currency || 'EUR'}` });
          if (docData.invoiceNumber) facts.push({ title: 'Rechnungsnr.', value: docData.invoiceNumber });
          if (docData.date) facts.push({ title: 'Datum', value: docData.date });
          if (docData.dueDate) facts.push({ title: 'Faellig', value: docData.dueDate });
          if (docData.taxRate) facts.push({ title: 'USt-Satz', value: `${docData.taxRate}%` });
          if (docData.iban) facts.push({ title: 'IBAN', value: docData.iban });

          webhookBody = {
            // Structured data for Power Automate to process
            source: 'mailsort',
            event: 'document_detected',
            timestamp: new Date().toISOString(),
            email_id: data.email_id,
            email_subject: data.email_subject || 'Kein Betreff',
            action_id: data.action_id,
            document_type: docType,
            document_type_key: docData.type || 'unknown',
            vendor: docData.vendor || null,
            amount: docData.amount || null,
            currency: docData.currency || 'EUR',
            invoice_number: docData.invoiceNumber || null,
            date: docData.date || null,
            due_date: docData.dueDate || null,
            tax_rate: docData.taxRate || null,
            iban: docData.iban || null,
            outlook_url: data.email_id
              ? `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(data.email_id)}`
              : null,
            // Pre-built Adaptive Card for Teams channel posting
            adaptive_card: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: [
                {
                  type: 'ColumnSet',
                  columns: [
                    {
                      type: 'Column',
                      width: 'auto',
                      items: [{
                        type: 'TextBlock',
                        text: docData.type === 'invoice' ? '\uD83D\uDCCB' : docData.type === 'order' ? '\uD83D\uDED2' : '\uD83D\uDCC4',
                        size: 'Large',
                      }],
                    },
                    {
                      type: 'Column',
                      width: 'stretch',
                      items: [
                        {
                          type: 'TextBlock',
                          text: `${docType} erkannt`,
                          weight: 'Bolder',
                          size: 'Medium',
                          color: 'Accent',
                        },
                        {
                          type: 'TextBlock',
                          text: data.email_subject || 'Kein Betreff',
                          size: 'Small',
                          isSubtle: true,
                          wrap: true,
                        },
                      ],
                    },
                  ],
                },
                ...(facts.length > 0 ? [{
                  type: 'FactSet' as const,
                  facts,
                }] : []),
                {
                  type: 'TextBlock',
                  text: `MailSort \u2022 ${new Date().toLocaleString('de-DE')}`,
                  size: 'Small',
                  isSubtle: true,
                  spacing: 'Medium',
                },
              ],
              actions: [
                ...(data.email_id ? [{
                  type: 'Action.OpenUrl',
                  title: '\uD83D\uDCE7 In Outlook oeffnen',
                  url: `https://outlook.office.com/mail/inbox/id/${encodeURIComponent(data.email_id)}`,
                }] : []),
              ],
            },
          };
        } else {
          // Generic webhook: plain JSON
          webhookBody = {
            source: 'mailsort',
            event: 'document_detected',
            email_id: data.email_id,
            email_subject: data.email_subject,
            document_type: docType,
            document_data: data.document_data,
            action_id: data.action_id,
            timestamp: new Date().toISOString(),
          };
        }

        const webhookHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (config.secret) {
          webhookHeaders['X-Webhook-Secret'] = config.secret;
        }
        if (config.headers) {
          try {
            const customHeaders = typeof config.headers === 'string'
              ? JSON.parse(config.headers) : config.headers;
            Object.assign(webhookHeaders, customHeaders);
          } catch { /* ignore parse errors */ }
        }

        const webhookResponse = await fetch(webhookUrl, {
          method: config.method || 'POST',
          headers: webhookHeaders,
          body: JSON.stringify(webhookBody),
        });

        if (webhookResponse.ok) {
          result.success = true;
          result.message = isTeamsWebhook
            ? 'Teams-Benachrichtigung gesendet'
            : 'An Webhook weitergeleitet';
        } else {
          const errText = await webhookResponse.text();
          result.message = `Webhook Fehler: ${webhookResponse.status} ${errText.substring(0, 100)}`;
        }
        break;
      }

      case 'sharepoint': {
        // SharePoint requires user's Graph token - check if it was passed via attachment metadata
        // In Freigabe-Workflow, the frontend must pass the access_token
        const graphToken = data.access_token;
        if (!graphToken) {
          result.message = 'SharePoint: Graph-Token fehlt. Bitte manuell ueber die Dokumente-Seite weiterleiten.';
          break;
        }

        const siteUrl = new URL(config.site_url || 'https://example.sharepoint.com/sites/default');
        const spHostname = siteUrl.hostname;
        const spSitePath = siteUrl.pathname.replace(/\/$/, '');

        // Resolve site
        const siteResp = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${spHostname}:${spSitePath}`,
          { headers: { Authorization: `Bearer ${graphToken}`, Accept: 'application/json' } }
        );
        if (!siteResp.ok) {
          result.message = `SharePoint Site nicht gefunden: HTTP ${siteResp.status}`;
          break;
        }
        const siteInfo = await siteResp.json();

        // Find drive
        const spLibName = config.library_name || 'Documents';
        const drivesResp = await fetch(
          `https://graph.microsoft.com/v1.0/sites/${siteInfo.id}/drives`,
          { headers: { Authorization: `Bearer ${graphToken}`, Accept: 'application/json' } }
        );
        if (!drivesResp.ok) {
          result.message = `SharePoint Bibliotheken nicht abrufbar: HTTP ${drivesResp.status}`;
          break;
        }
        const drivesInfo = await drivesResp.json();
        const spDrive = (drivesInfo.value || []).find(
          (d: any) => d.name === spLibName || d.name === 'Dokumente' || d.name === 'Documents'
        );
        if (!spDrive) {
          result.message = `SharePoint Bibliothek "${spLibName}" nicht gefunden`;
          break;
        }

        // Build path — `folder_strategy` controls how deep the structure
        // should be. Default is flat (Microsoft's modern recommendation:
        // use Views + Metadata columns, not folder hierarchies).
        //   flat       → {folder_path}/                    ← default
        //   by-year    → {folder_path}/{YYYY}/
        //   year-month → {folder_path}/{YYYY}/{MM}/        ← legacy deep layout
        const spNow = new Date();
        const year = String(spNow.getFullYear());
        const month = String(spNow.getMonth() + 1).padStart(2, '0');
        const strategy: 'flat' | 'by-year' | 'year-month'
          = (config.folder_strategy === 'by-year' || config.folder_strategy === 'year-month')
            ? config.folder_strategy
            : 'flat';
        let spFolderPath = (config.folder_path || '/Eingang').replace(/^\/+|\/+$/g, '');
        if (strategy === 'by-year') spFolderPath = `${spFolderPath}/${year}`;
        else if (strategy === 'year-month') spFolderPath = `${spFolderPath}/${year}/${month}`;

        // Upload file — require a real attachment. The old text-fallback
        // created unusable .txt placeholders in the SharePoint library.
        if (!data.attachment?.contentBytes) {
          result.message = 'SharePoint: Kein PDF-Anhang vorhanden. Bitte E-Mail mit Anhang auswählen oder Anhang manuell hochladen.';
          break;
        }
        const spFileContent: Buffer = Buffer.from(data.attachment.contentBytes, 'base64');

        // Build a deterministic, sortable filename from document metadata when
        // available: 2026-04-19_ACME-GmbH_R-2026-0042.pdf
        // Falls back to the original attachment name when nothing was
        // extracted.
        const spFileName: string = buildSharepointFilename(
          data.attachment.name,
          data.document_data,
          spNow
        );

        const spUploadUrl = `https://graph.microsoft.com/v1.0/drives/${spDrive.id}/root:/${spFolderPath}/${spFileName}:/content`;
        const spUploadResp = await fetch(spUploadUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${graphToken}`,
            'Content-Type': data.attachment?.contentType || 'application/octet-stream',
          },
          body: new Uint8Array(spFileContent),
        });

        if (spUploadResp.ok) {
          const spFileData = await spUploadResp.json();
          result.success = true;
          result.message = `An SharePoint hochgeladen: ${spFolderPath}/${spFileName}`;
          result.document_url = spFileData.webUrl || '';

          // Set metadata columns if configured and document_data available
          const metadataColumns = config.metadata_columns;
          if (metadataColumns && data.document_data && spFileData.id) {
            try {
              // Get listItem from the uploaded driveItem
              const listItemResp = await fetch(
                `https://graph.microsoft.com/v1.0/drives/${spDrive.id}/items/${spFileData.id}/listItem`,
                { headers: { Authorization: `Bearer ${graphToken}`, Accept: 'application/json' } }
              );
              if (listItemResp.ok) {
                const listItem = await listItemResp.json();
                const listId = listItem.parentReference?.listId;
                const listItemId = listItem.id;

                if (listId && listItemId) {
                  // Build fields payload from metadata_columns mapping
                  const fields: Record<string, any> = {};
                  for (const [dataField, spColumnName] of Object.entries(metadataColumns)) {
                    const value = data.document_data[dataField];
                    if (value !== undefined && value !== null && value !== '') {
                      fields[spColumnName as string] = String(value);
                    }
                  }

                  if (Object.keys(fields).length > 0) {
                    const patchResp = await fetch(
                      `https://graph.microsoft.com/v1.0/sites/${siteInfo.id}/lists/${listId}/items/${listItemId}/fields`,
                      {
                        method: 'PATCH',
                        headers: {
                          Authorization: `Bearer ${graphToken}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(fields),
                      }
                    );
                    if (patchResp.ok) {
                      result.message += ` (+ ${Object.keys(fields).length} Metadaten-Spalten gesetzt)`;
                    } else {
                      const metaErr = await patchResp.text();
                      logger.warn('SharePoint Metadaten konnten nicht gesetzt werden', {
                        status: patchResp.status,
                        error: metaErr.substring(0, 200),
                        fields,
                      });
                      result.message += ' (Metadaten konnten nicht gesetzt werden)';
                    }
                  }
                }
              }
            } catch (metaErr) {
              logger.warn('SharePoint Metadaten-Fehler', { error: (metaErr as Error).message });
              // Don't fail the upload - metadata is optional
            }
          }
        } else {
          const spErr = await spUploadResp.text();
          result.message = `SharePoint Upload-Fehler: ${spUploadResp.status} ${spErr.substring(0, 200)}`;
        }
        break;
      }

      case 'datev': {
        // DATEV MVP: Log metadata for manual export
        result.success = true;
        result.message = 'DATEV-Buchung vorgemerkt (Export ueber Integrationen-Seite)';
        break;
      }

      default:
        result.message = `Unbekannter Integrationstyp: ${integration.type}`;
    }
  } catch (err) {
    result.message = `Verbindungsfehler: ${(err as Error).message}`;
    logger.error('Forward to integration failed', {
      integrationId: integration.id,
      type: integration.type,
      error: (err as Error).message,
    });
  }

  // Update integration stats
  if (result.success) {
    try {
      await query(
        `UPDATE integrations SET forward_count = COALESCE(forward_count, 0) + 1, last_used_at = NOW(), status = 'connected', last_error = NULL WHERE id = $1`,
        [integration.id]
      );
    } catch { /* ignore */ }
  } else {
    try {
      await query(
        `UPDATE integrations SET last_error = $1, status = 'error' WHERE id = $2`,
        [result.message, integration.id]
      );
    } catch { /* ignore */ }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Auto-Forward Rule Evaluation
// ---------------------------------------------------------------------------

interface ForwardCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith';
  value: string | number;
}

interface ForwardRulesV2 {
  document_types?: string[];
  conditions?: ForwardCondition[];
}

/**
 * Build a deterministic, sortable, SharePoint-safe file name from the
 * extracted document data. Prefers the information we already know over
 * whatever Outlook shipped in the attachment name.
 *
 * Format:   YYYY-MM-DD_<Vendor>_<InvoiceNumber>.<ext>
 * Fallback: original attachment name, sanitised.
 *
 * Examples:
 *   2026-04-19_ACME-GmbH_R-2026-0042.pdf
 *   2026-04-19_dokument.pdf   (when no vendor / number available)
 */
function buildSharepointFilename(
  originalName: string | undefined,
  documentData: Record<string, any> | undefined,
  now: Date
): string {
  const original = (originalName ?? 'document.pdf');
  const extMatch = original.match(/\.[a-z0-9]{1,8}$/i);
  const ext = (extMatch?.[0] ?? '.pdf').toLowerCase();

  // SharePoint disallows <>:"/\|?* — trim + collapse whitespace too.
  const sanitise = (s: string) => s
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  // Prefer the document's own date; fall back to today.
  let datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dd = documentData?.date;
  if (typeof dd === 'string') {
    const iso = dd.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) datePart = iso[1];
  }

  const vendorRaw = documentData?.vendor ? String(documentData.vendor) : '';
  const numberRaw = documentData?.invoiceNumber
    ? String(documentData.invoiceNumber)
    : documentData?.orderNumber
    ? String(documentData.orderNumber)
    : '';

  const vendor = sanitise(vendorRaw);
  const number = sanitise(numberRaw);

  const parts = [datePart];
  if (vendor) parts.push(vendor);
  if (number) parts.push(number);

  if (parts.length === 1) {
    // No meaningful metadata — fall back to a sanitised version of the
    // original name, but prefix with the date for chronological sorting.
    const originalStem = sanitise(original.replace(/\.[a-z0-9]{1,8}$/i, '')) || 'dokument';
    return `${datePart}_${originalStem}${ext}`;
  }
  return parts.join('_') + ext;
}

function evaluateCondition(documentData: Record<string, any>, condition: ForwardCondition): boolean {
  const rawValue = documentData[condition.field];
  if (rawValue === undefined || rawValue === null) return false;

  // Numeric operators: parse both sides as numbers
  if (['gt', 'lt', 'gte', 'lte'].includes(condition.operator)) {
    const numVal = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue).replace(/[^0-9.,\-]/g, '').replace(',', '.'));
    const numCond = typeof condition.value === 'number' ? condition.value : parseFloat(String(condition.value));
    if (isNaN(numVal) || isNaN(numCond)) return false;
    switch (condition.operator) {
      case 'gt': return numVal > numCond;
      case 'lt': return numVal < numCond;
      case 'gte': return numVal >= numCond;
      case 'lte': return numVal <= numCond;
    }
  }

  // String operators
  const strVal = String(rawValue).toLowerCase();
  const strCond = String(condition.value).toLowerCase();
  switch (condition.operator) {
    case 'eq': return strVal === strCond;
    case 'neq': return strVal !== strCond;
    case 'contains': return strVal.includes(strCond);
    case 'startsWith': return strVal.startsWith(strCond);
    default: return false;
  }
}

/**
 * Evaluate auto_forward_rules (v1 array or v2 object) against a document.
 * Returns true if the document should be forwarded to this integration.
 * Exported so processing.ts can use the same logic.
 */
export function evaluateForwardRules(
  rulesRaw: any,
  documentType: string,
  documentData?: Record<string, any>,
): boolean {
  if (!rulesRaw) return true; // No rules = forward everything

  let parsed: any;
  try {
    parsed = typeof rulesRaw === 'string' ? JSON.parse(rulesRaw) : rulesRaw;
  } catch {
    return true; // Unparseable = forward everything
  }

  // V1 format: simple string array ["invoice", "order"]
  if (Array.isArray(parsed)) {
    return parsed.length === 0 || parsed.includes(documentType);
  }

  // V2 format: { document_types?: [...], conditions?: [...] }
  const rules = parsed as ForwardRulesV2;

  // Check document_types (if set)
  if (rules.document_types && rules.document_types.length > 0) {
    if (!rules.document_types.includes(documentType)) return false;
  }

  // Check conditions (all must match = AND logic)
  if (rules.conditions && rules.conditions.length > 0 && documentData) {
    for (const condition of rules.conditions) {
      if (!evaluateCondition(documentData, condition)) return false;
    }
  }

  return true;
}

/**
 * Forward a document to ALL matching integrations for a tenant.
 * Used by the Freigabe-Workflow: user approves → forward to all configured integrations.
 */
export async function forwardToAllMatchingIntegrations(
  tenantId: string,
  action: any,
  attachment?: { name: string; contentType: string; contentBytes: string },
  accessToken?: string,
): Promise<ForwardResult[]> {
  const integrations = await query(
    `SELECT * FROM integrations WHERE tenant_id = $1 AND enabled = true`,
    [tenantId]
  );

  const results: ForwardResult[] = [];

  for (const integration of integrations) {
    const documentType = action.document_type || '';
    const documentData = typeof action.document_data === 'string'
      ? (() => { try { return JSON.parse(action.document_data); } catch { return {}; } })()
      : action.document_data || {};
    const shouldForward = evaluateForwardRules(integration.auto_forward_rules, documentType, documentData);

    if (shouldForward) {
      const result = await forwardToIntegration(integration, {
        email_id: action.email_id,
        email_subject: action.email_subject,
        document_data: typeof action.document_data === 'string'
          ? JSON.parse(action.document_data) : action.document_data,
        action_id: action.id,
        attachment,
        access_token: accessToken,
      });
      results.push(result);

      // Log audit event
      await logEvent({
        tenantId,
        emailId: action.email_id,
        emailSubject: action.email_subject,
        eventType: 'document_forwarded',
        source: 'system',
        metadata: {
          actionId: action.id,
          integrationId: integration.id,
          integrationName: integration.name,
          integrationType: integration.type,
          success: result.success,
        },
      });
    }
  }

  return results;
}
