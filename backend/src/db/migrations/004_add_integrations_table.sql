-- Integrations: DMS and external tool connections per tenant
-- Supports: SharePoint, sevDesk, DATEV, Custom Webhook

CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Integration type and identity
    type VARCHAR(50) NOT NULL,
    -- Values: sharepoint, sevdesk, datev, webhook
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Connection configuration (encrypted at rest recommended)
    config JSONB NOT NULL DEFAULT '{}',
    -- SharePoint: { siteId, driveId, defaultFolderId, clientId }
    -- sevDesk: { apiToken, contactId }
    -- DATEV: { consultantNumber, clientNumber, apiKey }
    -- Webhook: { url, method, headers, authType }

    -- State
    enabled BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'configured',
    -- Values: configured, connected, error, disabled
    last_error TEXT,
    last_used_at TIMESTAMP WITH TIME ZONE,

    -- Auto-forward rules
    auto_forward_rules JSONB DEFAULT '[]',
    -- [{ document_type: 'invoice', category: 'Finanzen', enabled: true }]

    -- Usage tracking
    forward_count INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_integrations_enabled ON integrations(tenant_id, enabled);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;
CREATE TRIGGER update_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
