// Integrations API - DMS and external tool connections
// Supports: SharePoint, sevDesk, DATEV, Custom Webhook, Paperless-ngx

import { Router } from 'express';
import { query, queryOne } from '../db';
import { logEvent } from '../services/auditService';
import { forwardToIntegration } from '../services/forwardService';
import { logger } from '../services/logger';

// ---------------------------------------------------------------------------
// Paperless-ngx helper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// sevDesk helper
// ---------------------------------------------------------------------------

interface SevDeskConfig {
  api_token: string;
  contact_id?: string;
}

async function testSevDeskConnection(
  config: SevDeskConfig,
): Promise<{ success: boolean; message: string }> {
  const baseUrl = 'https://my.sevdesk.de/api/v1';
  try {
    const response = await fetch(`${baseUrl}/SevUser`, {
      method: 'GET',
      headers: {
        Authorization: config.api_token,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const users = data?.objects || [];
      const userName = users[0]?.fullname || users[0]?.username || 'unbekannt';
      return { success: true, message: `sevDesk verbunden (Benutzer: ${userName})` };
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'sevDesk: API-Token ungueltig oder abgelaufen' };
    }
    return { success: false, message: `sevDesk Fehler: HTTP ${response.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, message: `sevDesk nicht erreichbar: ${message}` };
  }
}

interface SevDeskDocumentData {
  email_id?: string;
  email_subject?: string;
  document_data?: Record<string, any>;
  action_id?: string;
  attachment?: {
    name: string;
    contentType: string;
    contentBytes: string; // base64
  };
}

async function forwardToSevDesk(
  config: SevDeskConfig,
  data: SevDeskDocumentData,
): Promise<{ success: boolean; message: string; voucher_id?: string }> {
  const baseUrl = 'https://my.sevdesk.de/api/v1';
  const apiToken = config.api_token;

  if (!apiToken) {
    return { success: false, message: 'sevDesk API-Token fehlt' };
  }

  try {
    // Step 0: Duplicate check - search by invoice/receipt number
    const docData = data.document_data || {};
    const invoiceNumber = docData.invoiceNumber || docData.invoice_number;
    const vendor = docData.vendor || 'Unbekannter Lieferant';

    if (invoiceNumber) {
      try {
        const searchResp = await fetch(
          `${baseUrl}/Voucher?limit=5&voucherType=VOU&descriptionLike=${encodeURIComponent(invoiceNumber)}`,
          { headers: { Authorization: apiToken, Accept: 'application/json' } }
        );
        if (searchResp.ok) {
          const searchData = await searchResp.json();
          const existing = (searchData.objects || []);
          if (existing.length > 0) {
            const match = existing[0];
            return {
              success: true,
              message: `Beleg mit Rechnungsnr. "${invoiceNumber}" bereits vorhanden (sevDesk ID: ${match.id}). Duplikat vermieden.`,
              voucher_id: String(match.id),
            };
          }
        }
      } catch (err) {
        logger.warn('sevDesk duplicate check failed (non-critical)', { error: (err as Error).message });
      }
    }

    let uploadedFileId: string | undefined;

    // Step 1: Upload file if we have an attachment
    if (data.attachment?.contentBytes) {
      const buffer = Buffer.from(data.attachment.contentBytes, 'base64');
      const formData = new FormData();
      const fileBlob = new Blob([buffer], { type: data.attachment.contentType || 'application/pdf' });
      formData.append('file', fileBlob, data.attachment.name || 'document.pdf');

      const uploadResp = await fetch(`${baseUrl}/Voucher/Factory/uploadTempFile`, {
        method: 'POST',
        headers: {
          Authorization: apiToken,
        },
        body: formData,
      });

      if (uploadResp.ok) {
        const uploadResult = await uploadResp.json();
        uploadedFileId = uploadResult?.objects?.filename;
        logger.info('sevDesk: file uploaded', { filename: uploadedFileId });
      } else {
        const errText = await uploadResp.text();
        logger.warn('sevDesk: file upload failed', { status: uploadResp.status, error: errText.substring(0, 200) });
      }
    }

    // Step 2: Build voucher data
    const description = data.email_subject || 'Email-Rechnung';

    // Parse amount and tax
    let sumGross = 0;
    let taxRate = 19;
    if (docData.amount) {
      sumGross = parseFloat(String(docData.amount).replace(',', '.')) || 0;
    }
    if (docData.taxRate) {
      taxRate = parseFloat(String(docData.taxRate)) || 19;
    }
    const sumNet = sumGross / (1 + taxRate / 100);

    // Parse date
    let voucherDate = new Date().toISOString().split('T')[0];
    if (docData.date) {
      try {
        const d = new Date(docData.date);
        if (!isNaN(d.getTime())) voucherDate = d.toISOString().split('T')[0];
      } catch { /* use today */ }
    }

    // Step 3: Find or reference supplier contact
    let supplierId: number | undefined;
    if (config.contact_id) {
      supplierId = parseInt(config.contact_id, 10);
    }

    // Step 4: Create voucher (Eingangsrechnung)
    const voucherPayload: any = {
      voucher: {
        objectName: 'Voucher',
        mapAll: true,
        voucherType: 'VOU',
        status: 50, // Draft
        description,
        creditDebit: 'D', // Debit = Eingangsrechnung
        voucherDate,
        supplierName: vendor,
        taxType: 'default',
        ...(supplierId ? { supplier: { id: supplierId, objectName: 'Contact' } } : {}),
      },
      voucherPosSave: sumGross > 0 ? [{
        objectName: 'VoucherPos',
        mapAll: true,
        taxRate,
        sum: sumNet.toFixed(2),
        sumGross: sumGross.toFixed(2),
        comment: docData.invoiceNumber
          ? `Rechnung ${docData.invoiceNumber} - ${description}`
          : description,
        accountingType: {
          id: 26, // Fremdleistungen (default)
          objectName: 'AccountingType',
        },
      }] : undefined,
    };

    // If we uploaded a file, include it
    if (uploadedFileId) {
      voucherPayload.filename = uploadedFileId;
    }

    const voucherResp = await fetch(`${baseUrl}/Voucher/Factory/saveVoucher`, {
      method: 'POST',
      headers: {
        Authorization: apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(voucherPayload),
    });

    if (voucherResp.ok) {
      const vResult = await voucherResp.json();
      const voucherId = vResult?.objects?.voucher?.id;
      logger.info('sevDesk: voucher created', { voucherId, vendor, sumGross });
      return {
        success: true,
        message: `Eingangsrechnung in sevDesk erstellt${voucherId ? ` (ID: ${voucherId})` : ''} - ${vendor}, ${sumGross.toFixed(2)} EUR`,
        voucher_id: voucherId ? String(voucherId) : undefined,
      };
    } else {
      const errorText = await voucherResp.text();
      logger.error('sevDesk: voucher creation failed', { status: voucherResp.status, error: errorText.substring(0, 300) });
      return { success: false, message: `sevDesk Fehler: ${voucherResp.status} ${errorText.substring(0, 200)}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('sevDesk forward error', { error: message });
    return { success: false, message: `sevDesk Verbindungsfehler: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// SharePoint helper (via Microsoft Graph)
// ---------------------------------------------------------------------------

interface SharePointConfig {
  site_url: string;
  library_name: string;
  folder_path?: string;
}

interface SharePointDocumentData {
  email_id?: string;
  email_subject?: string;
  document_data?: Record<string, any>;
  action_id?: string;
  access_token?: string; // User's Graph token from frontend
  attachment?: {
    name: string;
    contentType: string;
    contentBytes: string; // base64
  };
}

async function testSharePointConnection(
  config: SharePointConfig,
  accessToken?: string,
): Promise<{ success: boolean; message: string }> {
  if (!accessToken) {
    return { success: false, message: 'SharePoint: Graph-Token fehlt. Bitte erneut anmelden.' };
  }

  try {
    // Extract site hostname and path from URL
    // e.g. https://tenant.sharepoint.com/sites/MySite
    const url = new URL(config.site_url);
    const hostname = url.hostname;
    const sitePath = url.pathname.replace(/\/$/, '');

    const graphUrl = `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`;
    const response = await fetch(graphUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const siteData = await response.json();
      return {
        success: true,
        message: `SharePoint verbunden: ${siteData.displayName || siteData.name || 'Site gefunden'}`,
      };
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'SharePoint: Keine Berechtigung. Bitte Admin-Zustimmung einholen (Sites.ReadWrite.All).' };
    }
    if (response.status === 404) {
      return { success: false, message: `SharePoint: Site nicht gefunden (${config.site_url})` };
    }
    const errorText = await response.text();
    return { success: false, message: `SharePoint Fehler: HTTP ${response.status} ${errorText.substring(0, 100)}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, message: `SharePoint nicht erreichbar: ${message}` };
  }
}

async function forwardToSharePoint(
  config: SharePointConfig,
  data: SharePointDocumentData,
): Promise<{ success: boolean; message: string; file_url?: string }> {
  const accessToken = data.access_token;
  if (!accessToken) {
    return { success: false, message: 'SharePoint: Graph-Token fehlt' };
  }

  try {
    // 1. Resolve site ID
    const siteUrl = new URL(config.site_url);
    const hostname = siteUrl.hostname;
    const sitePath = siteUrl.pathname.replace(/\/$/, '');

    const siteResp = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${hostname}:${sitePath}`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    if (!siteResp.ok) {
      return { success: false, message: `SharePoint Site nicht gefunden: HTTP ${siteResp.status}` };
    }
    const siteData = await siteResp.json();
    const siteId = siteData.id;

    // 2. Find the document library (drive)
    const libraryName = config.library_name || 'Documents';
    const drivesResp = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`,
      { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
    );
    if (!drivesResp.ok) {
      return { success: false, message: `SharePoint Bibliotheken nicht abrufbar: HTTP ${drivesResp.status}` };
    }
    const drivesData = await drivesResp.json();
    const drive = (drivesData.value || []).find(
      (d: any) => d.name === libraryName || d.name === 'Dokumente' || d.name === 'Documents'
    );
    if (!drive) {
      return { success: false, message: `SharePoint Bibliothek "${libraryName}" nicht gefunden` };
    }
    const driveId = drive.id;

    // 3. Build folder path and filename
    const docData = data.document_data || {};
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    let folderPath = (config.folder_path || '/Eingang').replace(/^\/+|\/+$/g, '');
    folderPath = `${folderPath}/${year}/${month}`;

    // Ensure folder exists (create if needed)
    const folderParts = folderPath.split('/');
    let currentPath = '';
    for (const part of folderParts) {
      const parentPath = currentPath || 'root';
      const targetPath = currentPath ? `${currentPath}/${part}` : part;

      // Check if folder exists
      const checkUrl = currentPath
        ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${targetPath}`
        : `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${part}`;

      const checkResp = await fetch(checkUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      });

      if (!checkResp.ok) {
        // Create folder
        const createUrl = currentPath
          ? `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${currentPath}:/children`
          : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children`;

        const createResp = await fetch(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: part,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'replace',
          }),
        });

        if (!createResp.ok && createResp.status !== 409) {
          logger.warn('SharePoint: folder creation failed', { folder: part, status: createResp.status });
        }
      }
      currentPath = targetPath;
    }

    // 4. Upload file
    let fileName: string;
    let fileContent: Buffer;

    if (data.attachment?.contentBytes) {
      fileContent = Buffer.from(data.attachment.contentBytes, 'base64');
      fileName = data.attachment.name || 'document.pdf';
    } else {
      // Fallback: create a text file with metadata
      const metaParts: string[] = [];
      if (docData) {
        for (const [k, v] of Object.entries(docData)) {
          if (v != null) metaParts.push(`${k}: ${v}`);
        }
      }
      const content = [
        `Dokument: ${data.email_subject || 'Unbekannt'}`,
        `E-Mail ID: ${data.email_id || '-'}`,
        '', ...metaParts, '',
        `Importiert von MailSort am ${now.toLocaleString('de-DE')}`,
      ].join('\n');
      fileContent = Buffer.from(content, 'utf-8');
      fileName = `${(data.email_subject || 'dokument').replace(/[^a-zA-Z0-9äöüÄÖÜß\-_ ]/g, '_').substring(0, 80)}.txt`;
    }

    // Sanitize filename
    fileName = fileName.replace(/[<>:"/\\|?*]/g, '_');

    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${folderPath}/${fileName}:/content`;
    const uploadResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': data.attachment?.contentType || 'application/octet-stream',
      },
      body: new Uint8Array(fileContent),
    });

    if (uploadResp.ok) {
      const fileData = await uploadResp.json();
      const webUrl = fileData.webUrl || '';
      logger.info('SharePoint: file uploaded', { fileName, webUrl, driveId });
      return {
        success: true,
        message: `An SharePoint hochgeladen: ${folderPath}/${fileName}`,
        file_url: webUrl,
      };
    } else {
      const errorText = await uploadResp.text();
      return { success: false, message: `SharePoint Upload-Fehler: ${uploadResp.status} ${errorText.substring(0, 200)}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('SharePoint forward error', { error: message });
    return { success: false, message: `SharePoint Fehler: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// Paperless-ngx helper
// ---------------------------------------------------------------------------

interface PaperlessConfig {
  base_url: string;
  api_token: string;
  default_correspondent?: string;
  default_document_type?: string;
  default_tags?: string;
}

interface PaperlessDocumentData {
  email_id?: string;
  email_subject?: string;
  document_data?: Record<string, any>;
  attachment?: {
    name: string;
    contentType: string;
    contentBytes: string; // base64
  };
}

async function forwardToPaperless(
  config: PaperlessConfig,
  data: PaperlessDocumentData,
): Promise<{ success: boolean; message: string; document_id?: number }> {
  const baseUrl = config.base_url.replace(/\/+$/, '');
  const url = `${baseUrl}/api/documents/post_document/`;

  // Build title - include document metadata if available
  let title = data.email_subject || `Email ${data.email_id || 'unknown'}`;
  const metaParts: string[] = [];
  if (data.document_data) {
    for (const [k, v] of Object.entries(data.document_data)) {
      if (v != null) metaParts.push(`${k}: ${v}`);
    }
    if (metaParts.length > 0) title += ` | ${metaParts.join(' | ')}`;
  }

  // Build multipart/form-data with either real attachment or text fallback
  const formData = new FormData();

  if (data.attachment?.contentBytes) {
    // Real file attachment (PDF from email)
    const buffer = Buffer.from(data.attachment.contentBytes, 'base64');
    const fileBlob = new Blob([buffer], { type: data.attachment.contentType || 'application/pdf' });
    formData.append('document', fileBlob, data.attachment.name || 'document.pdf');
    logger.info('Paperless: uploading real attachment', { name: data.attachment.name, size: buffer.length });
  } else {
    // Fallback: text document with metadata
    const docContent = [
      `Dokument: ${title}`,
      `E-Mail ID: ${data.email_id || 'unbekannt'}`,
      `E-Mail Betreff: ${data.email_subject || 'unbekannt'}`,
      '',
      ...metaParts,
      '',
      `Importiert von MailSort am ${new Date().toLocaleString('de-DE')}`,
    ].join('\n');
    const fileBlob = new Blob([docContent], { type: 'text/plain' });
    formData.append('document', fileBlob, `${title.replace(/[^a-zA-Z0-9äöüÄÖÜß\-_ ]/g, '_').substring(0, 100)}.txt`);
  }
  formData.append('title', title);

  if (config.default_correspondent) {
    formData.append('correspondent', config.default_correspondent);
  }
  if (config.default_document_type) {
    formData.append('document_type', config.default_document_type);
  }
  if (config.default_tags) {
    formData.append('tags', config.default_tags);
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${config.api_token}`,
        Accept: 'application/json',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Paperless-ngx forward failed', { status: response.status, error: errorText });
      return { success: false, message: `Paperless-ngx Fehler: ${response.status} ${errorText.substring(0, 200)}` };
    }

    const taskUuid = (await response.text()).replace(/"/g, '');
    logger.info('Paperless-ngx upload accepted', { taskUuid });

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
            logger.info('Paperless document created', { documentId, taskUuid });
            break;
          } else if (task?.status === 'FAILURE') {
            logger.error('Paperless task failed', { taskUuid, result: task.result });
            break;
          }
        }
      } catch { /* continue polling */ }
    }

    // Set custom fields on the document if we got an ID
    if (documentId) {
      try {
        // Fetch existing custom field IDs
        const fieldsResp = await fetch(`${baseUrl}/api/custom_fields/`, {
          headers: { Authorization: `Token ${config.api_token}`, Accept: 'application/json' },
        });
        const fields = fieldsResp.ok ? await fieldsResp.json() : { results: [] };
        const fieldMap = new Map<string, number>();
        for (const f of (fields.results || fields)) {
          fieldMap.set(f.name, f.id);
        }

        // Build custom field values
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
            logger.info('Paperless custom fields set', { documentId, fieldCount: customFields.length });
          } else {
            logger.warn('Failed to set custom fields', { status: patchResp.status });
          }
        }
      } catch (err) {
        logger.warn('Custom fields error (non-critical)', { error: (err as Error).message });
      }
    }

    return {
      success: true,
      message: documentId
        ? `An Paperless-ngx weitergeleitet (Dokument #${documentId})`
        : `An Paperless-ngx weitergeleitet (Task: ${taskUuid.substring(0, 8)})`,
      document_id: documentId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error('Paperless-ngx forward error', { error: message });
    return { success: false, message: `Paperless-ngx Verbindungsfehler: ${message}` };
  }
}

async function testPaperlessConnection(
  config: PaperlessConfig,
): Promise<{ success: boolean; message: string; documentCount?: number }> {
  const baseUrl = config.base_url.replace(/\/+$/, '');
  const url = `${baseUrl}/api/documents/?page_size=1`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Token ${config.api_token}`,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const count = data.count || 0;
      return { success: true, message: `Paperless-ngx verbunden (${count} Dokumente)`, documentCount: count };
    }
    if (response.status === 401 || response.status === 403) {
      return { success: false, message: 'Paperless-ngx: API-Token ungueltig oder fehlende Berechtigung' };
    }
    return { success: false, message: `Paperless-ngx Fehler: HTTP ${response.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, message: `Paperless-ngx nicht erreichbar: ${message}` };
  }
}

const router = Router();

// GET /api/integrations - List configured integrations
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id, tenant_id, type, name, description, enabled, status, last_error, last_used_at, auto_forward_rules, forward_count, created_at FROM integrations WHERE tenant_id = $1 ORDER BY created_at',
      [req.tenantId]
    );
    // Don't expose config (contains credentials), but parse auto_forward_rules
    const items = rows.map((row: any) => {
      let rules = row.auto_forward_rules;
      if (typeof rules === 'string') {
        try { rules = JSON.parse(rules); } catch { rules = []; }
      }
      return { ...row, auto_forward_rules: rules || [] };
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

// GET /api/integrations/:id - Single integration (with masked config)
router.get('/:id', async (req, res, next) => {
  try {
    const row = await queryOne<any>(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!row) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    // Parse config if stored as string
    if (row.config && typeof row.config === 'string') {
      try { row.config = JSON.parse(row.config); } catch { /* keep as-is */ }
    }
    // Parse auto_forward_rules if stored as string
    if (row.auto_forward_rules && typeof row.auto_forward_rules === 'string') {
      try { row.auto_forward_rules = JSON.parse(row.auto_forward_rules); } catch { row.auto_forward_rules = []; }
    }

    res.json(row);
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations - Create integration
router.post('/', async (req, res, next) => {
  try {
    const { type, name, description, config, auto_forward_rules } = req.body;

    const validTypes = ['sharepoint', 'sevdesk', 'datev', 'webhook', 'paperless'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
    }

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const rows = await query(
      `INSERT INTO integrations (tenant_id, type, name, description, config, auto_forward_rules, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'configured')
       RETURNING id, tenant_id, type, name, description, enabled, status, created_at`,
      [req.tenantId, type, name, description || null, JSON.stringify(config || {}),
       JSON.stringify(auto_forward_rules || [])]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/integrations/:id - Update integration
router.patch('/:id', async (req, res, next) => {
  try {
    const { name, description, config, enabled, auto_forward_rules } = req.body;

    const existing = await queryOne(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (name !== undefined) { updates.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
    if (config !== undefined) { updates.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }
    if (enabled !== undefined) { updates.push(`enabled = $${idx++}`); params.push(enabled); }
    if (auto_forward_rules !== undefined) { updates.push(`auto_forward_rules = $${idx++}`); params.push(JSON.stringify(auto_forward_rules)); }

    if (updates.length === 0) {
      return res.json(existing);
    }

    params.push(req.params.id);
    params.push(req.tenantId);

    const rows = await query(
      `UPDATE integrations SET ${updates.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx++}
       RETURNING id, tenant_id, type, name, description, enabled, status, auto_forward_rules, created_at`,
      params
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/integrations/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const rows = await query(
      'DELETE FROM integrations WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/integrations/:id/forward - Forward document to integration
router.post('/:id/forward', async (req, res, next) => {
  try {
    const { email_id, email_subject, action_id, attachment } = req.body;
    let { document_data } = req.body as { document_data?: Record<string, unknown> };

    const integration = await queryOne<any>(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2 AND enabled = true',
      [req.params.id, req.tenantId]
    );

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found or disabled' });
    }

    // Quick-Forward fallback: if the caller did not pass document_data (manual
    // direct-forward path) but the email has been analysed before, reuse the
    // most recent action's extracted metadata. This lets SharePoint metadata
    // columns / sevDesk taxes / Paperless custom fields stay populated without
    // forcing the user to re-run the AI pipeline.
    if (!document_data && email_id) {
      try {
        const prior = await queryOne<{ document_data: unknown }>(
          `SELECT document_data FROM actions
           WHERE tenant_id = $1 AND email_id = $2 AND document_data IS NOT NULL
           ORDER BY created_at DESC LIMIT 1`,
          [req.tenantId, email_id]
        );
        if (prior?.document_data) {
          const parsed = typeof prior.document_data === 'string'
            ? JSON.parse(prior.document_data)
            : (prior.document_data as Record<string, unknown>);
          document_data = parsed;
          logger.info('Quick-Forward: reused prior document_data', {
            integrationId: req.params.id,
            emailId: email_id,
            fieldCount: Object.keys(parsed).length,
          });
        }
      } catch (err) {
        logger.warn('Quick-Forward: prior metadata lookup failed', {
          error: (err as Error).message,
        });
      }
    }

    // Parse config for post-forward URL construction
    const config = typeof integration.config === 'string'
      ? JSON.parse(integration.config) : integration.config;

    // Use central forwardService for ALL integration types (DRY)
    const accessToken = req.body?.access_token || req.headers['x-graph-token'];
    let forwardResult: { success: boolean; message: string; document_id?: number; voucher_id?: string; file_url?: string };

    try {
      const serviceResult = await forwardToIntegration(integration, {
        email_id,
        email_subject,
        document_data,
        action_id,
        attachment,
        access_token: accessToken as string,
      });
      forwardResult = {
        success: serviceResult.success,
        message: serviceResult.message,
        ...(serviceResult.document_id ? { document_id: serviceResult.document_id } : {}),
        ...(serviceResult.document_url ? { file_url: serviceResult.document_url } : {}),
      };
    } catch (err) {
      forwardResult = { success: false, message: `Weiterleitung fehlgeschlagen: ${(err as Error).message}` };
    }

    if (!forwardResult?.success) {
      await query(
        "UPDATE integrations SET status = 'error', last_error = $1 WHERE id = $2",
        [forwardResult?.message || 'Unbekannter Fehler', req.params.id],
      );
      return res.status(502).json({ error: forwardResult?.message || 'Weiterleitung fehlgeschlagen' });
    }

    logger.info('Document forward completed', {
      integrationId: req.params.id,
      integrationType: integration.type,
      emailId: email_id,
      documentId: forwardResult?.document_id,
    });

    // Update integration usage
    await query(
      'UPDATE integrations SET forward_count = forward_count + 1, last_used_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    // Log audit event
    await logEvent({
      tenantId: req.tenantId!,
      userId: req.userId,
      emailId: email_id,
      emailSubject: email_subject,
      eventType: 'document_forwarded',
      source: 'manual',
      metadata: {
        integrationId: req.params.id,
        integrationType: integration.type,
        integrationName: integration.name,
        documentData: document_data,
        actionId: action_id,
      },
    });

    // Update action forwarded_to if action_id provided
    if (action_id) {
      // Read existing forwarded_to, merge, and write back (works with both PostgreSQL and SQLite)
      const existing = await queryOne<any>('SELECT forwarded_to FROM actions WHERE id = $1 AND tenant_id = $2', [action_id, req.tenantId]);
      let forwardedList: any[] = [];
      if (existing?.forwarded_to) {
        try {
          forwardedList = typeof existing.forwarded_to === 'string'
            ? JSON.parse(existing.forwarded_to) : existing.forwarded_to;
        } catch { forwardedList = []; }
      }
      const forwardEntry: any = {
        integration_id: req.params.id,
        integration_name: integration.name,
        integration_type: integration.type,
        timestamp: new Date().toISOString(),
        status: 'sent',
      };
      // Add integration-specific references
      if (forwardResult?.document_id) {
        const paperlessBase = (config.base_url || '').replace(/\/+$/, '');
        forwardEntry.document_id = forwardResult.document_id;
        forwardEntry.document_url = `${paperlessBase}/documents/${forwardResult.document_id}/details`;
      }
      if (forwardResult?.voucher_id) {
        forwardEntry.voucher_id = forwardResult.voucher_id;
        forwardEntry.document_url = `https://my.sevdesk.de/#/fi/VOU/${forwardResult.voucher_id}`;
      }
      if (forwardResult?.file_url) {
        forwardEntry.document_url = forwardResult.file_url;
      }
      forwardedList.push(forwardEntry);
      await query(
        `UPDATE actions SET forwarded_to = $1 WHERE id = $2 AND tenant_id = $3`,
        [JSON.stringify(forwardedList), action_id, req.tenantId]
      );
    }

    res.json({
      success: true,
      integration: { id: integration.id, name: integration.name, type: integration.type },
      message: `Document forwarded to ${integration.name}`,
    });
  } catch (error) {
    logger.error('Forward error', { error: (error as Error).message });
    next(error);
  }
});

// POST /api/integrations/:id/test - Test integration connectivity
router.post('/:id/test', async (req, res, next) => {
  try {
    const integration = await queryOne<any>(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const testConfig = typeof integration.config === 'string'
      ? JSON.parse(integration.config) : integration.config;

    let result: { success: boolean; message: string };

    switch (integration.type) {
      case 'paperless':
        result = await testPaperlessConnection(testConfig);
        break;

      case 'sevdesk':
        result = await testSevDeskConnection(testConfig);
        break;

      case 'sharepoint': {
        const accessToken = req.body?.access_token || req.headers['x-graph-token'];
        result = await testSharePointConnection(testConfig, accessToken as string);
        break;
      }

      case 'webhook': {
        // Test webhook by sending a test payload
        const webhookUrl = testConfig.url;
        if (!webhookUrl) {
          result = { success: false, message: 'Webhook URL fehlt' };
          break;
        }
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (testConfig.secret) headers['X-Webhook-Secret'] = testConfig.secret;
          const resp = await fetch(webhookUrl, {
            method: testConfig.method || 'POST',
            headers,
            body: JSON.stringify({ test: true, source: 'mailsort', timestamp: new Date().toISOString() }),
          });
          result = resp.ok
            ? { success: true, message: `Webhook erreichbar (HTTP ${resp.status})` }
            : { success: false, message: `Webhook Fehler: HTTP ${resp.status}` };
        } catch (err) {
          result = { success: false, message: `Webhook nicht erreichbar: ${(err as Error).message}` };
        }
        break;
      }

      default:
        result = { success: true, message: 'Verbindungstest nicht implementiert fuer diesen Typ' };
    }

    if (result.success) {
      await query(
        "UPDATE integrations SET status = 'connected', last_error = NULL WHERE id = $1",
        [req.params.id],
      );
    } else {
      await query(
        "UPDATE integrations SET status = 'error', last_error = $1 WHERE id = $2",
        [result.message, req.params.id],
      );
    }

    res.json({ success: result.success, message: result.message });
  } catch (error) {
    next(error);
  }
});

// GET /api/integrations/:id/status - Check connection status
router.get('/:id/status', async (req, res, next) => {
  try {
    const integration = await queryOne<any>(
      'SELECT id, type, name, status, last_error, last_used_at, forward_count FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json(integration);
  } catch (error) {
    next(error);
  }
});

// GET /api/integrations/:id/debug - Debug endpoint: check connection + list recent documents
router.get('/:id/debug', async (req, res, next) => {
  try {
    const integration = await queryOne<any>(
      'SELECT * FROM integrations WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const config = typeof integration.config === 'string'
      ? JSON.parse(integration.config) : integration.config;

    const debug: any = {
      integration: {
        id: integration.id,
        name: integration.name,
        type: integration.type,
        enabled: integration.enabled,
        status: integration.status,
        forward_count: integration.forward_count || 0,
        last_used_at: integration.last_used_at,
        last_error: integration.last_error,
      },
      connection: { success: false, message: 'Nicht getestet' },
      remote_documents: [],
      recent_forwards: [],
    };

    // 1. Test connection based on type
    switch (integration.type) {
      case 'paperless': {
        const baseUrl = (config.base_url || '').replace(/\/+$/, '');
        try {
          const apiResponse = await fetch(`${baseUrl}/api/documents/?page_size=1`, {
            headers: { Authorization: `Token ${config.api_token}`, Accept: 'application/json' },
          });
          debug.connection = {
            success: apiResponse.ok,
            status: apiResponse.status,
            message: apiResponse.ok ? 'Verbunden' : `HTTP ${apiResponse.status}`,
            base_url: baseUrl,
          };
        } catch (err) {
          debug.connection = {
            success: false,
            message: `Verbindungsfehler: ${(err as Error).message}`,
            base_url: baseUrl,
          };
        }

        // 2. List recent documents from Paperless
        if (debug.connection.success) {
          try {
            const docsResponse = await fetch(
              `${baseUrl}/api/documents/?ordering=-added&page_size=10`,
              { headers: { Authorization: `Token ${config.api_token}`, Accept: 'application/json' } }
            );
            if (docsResponse.ok) {
              const docsData = await docsResponse.json();
              debug.remote_documents = (docsData.results || []).map((doc: any) => ({
                id: doc.id,
                title: doc.title,
                added: doc.added,
                created: doc.created,
                correspondent: doc.correspondent,
                document_type: doc.document_type,
                archive_serial_number: doc.archive_serial_number,
              }));
              debug.remote_document_count = docsData.count || 0;
            }
          } catch (err) {
            debug.remote_documents_error = (err as Error).message;
          }
        }
        break;
      }

      case 'sevdesk': {
        try {
          const testResult = await testSevDeskConnection(config);
          debug.connection = {
            success: testResult.success,
            message: testResult.message,
            base_url: 'https://my.sevdesk.de/api/v1',
          };

          // List recent vouchers
          if (testResult.success) {
            try {
              const vouchersResp = await fetch(
                `https://my.sevdesk.de/api/v1/Voucher?limit=10&status=50&voucherType=VOU`,
                { headers: { Authorization: config.api_token, Accept: 'application/json' } }
              );
              if (vouchersResp.ok) {
                const vData = await vouchersResp.json();
                debug.remote_documents = (vData.objects || []).map((v: any) => ({
                  id: v.id,
                  title: v.description || v.supplierName || 'Unbekannt',
                  added: v.create,
                  created: v.voucherDate,
                  sum_gross: v.sumGross,
                  status: v.status === '50' ? 'Entwurf' : v.status === '100' ? 'Gebucht' : v.status,
                }));
              }
            } catch { /* ignore */ }
          }
        } catch (err) {
          debug.connection = { success: false, message: `Fehler: ${(err as Error).message}` };
        }
        break;
      }

      case 'sharepoint': {
        debug.connection = {
          success: false,
          message: 'SharePoint-Debug erfordert Graph-Token (bitte "Testen" verwenden)',
          base_url: config.site_url,
        };
        break;
      }

      default: {
        debug.connection = {
          success: false,
          message: `Debug fuer Typ "${integration.type}" nicht implementiert`,
        };
      }
    }

    // 3. Recent forward audit events
    try {
      const events = await query(
        `SELECT * FROM audit_events
         WHERE tenant_id = $1 AND event_type = 'document_forwarded'
         ORDER BY created_at DESC LIMIT 10`,
        [req.tenantId]
      );
      debug.recent_forwards = events.map((e: any) => ({
        id: e.id,
        email_id: e.email_id,
        email_subject: e.email_subject,
        created_at: e.created_at,
        metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata,
      }));
    } catch { /* ignore if audit_events table doesn't exist */ }

    // 4. Actions that were forwarded to this integration
    try {
      const forwarded = await query(
        `SELECT id, email_subject, document_type, status, forwarded_to, created_at
         FROM actions WHERE tenant_id = $1 AND forwarded_to IS NOT NULL
         ORDER BY created_at DESC LIMIT 10`,
        [req.tenantId]
      );
      debug.forwarded_actions = forwarded.map((a: any) => ({
        ...a,
        forwarded_to: typeof a.forwarded_to === 'string' ? JSON.parse(a.forwarded_to) : a.forwarded_to,
      }));
    } catch { /* ignore */ }

    res.json(debug);
  } catch (error) {
    next(error);
  }
});

export default router;
