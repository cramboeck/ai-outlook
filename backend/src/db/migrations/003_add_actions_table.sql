-- Actions: Persistent TODO/action items extracted from emails
-- Tracks status lifecycle: open -> in_progress -> done/dismissed

CREATE TABLE IF NOT EXISTS actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Source email reference
    email_id VARCHAR(500),
    email_subject VARCHAR(1000),
    email_sender VARCHAR(500),
    email_received_at TIMESTAMP WITH TIME ZONE,

    -- Action details
    description TEXT NOT NULL,
    action_type VARCHAR(20) NOT NULL DEFAULT 'task',
    -- Values: response, task, decision, meeting, payment, document

    priority VARCHAR(10) NOT NULL DEFAULT 'medium',
    -- Values: high, medium, low

    status VARCHAR(20) NOT NULL DEFAULT 'open',
    -- Values: open, in_progress, done, dismissed

    -- Source of the action
    source VARCHAR(20) NOT NULL DEFAULT 'ai',
    -- Values: ai, rule, manual
    confidence NUMERIC(4,3),

    -- Scheduling
    deadline DATE,
    reminder_at TIMESTAMP WITH TIME ZONE,

    -- Completion tracking
    completed_at TIMESTAMP WITH TIME ZONE,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,

    -- Document detection (for invoice/order emails)
    document_type VARCHAR(20) DEFAULT 'none',
    -- Values: invoice, order, contract, receipt, none
    document_data JSONB,
    -- { vendor, amount, currency, invoiceNumber, orderNumber, dueDate, items[] }

    -- DMS forwarding tracking
    forwarded_to JSONB,
    -- [{ integration_id, target, timestamp, status }]

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_actions_tenant_user ON actions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_actions_email ON actions(email_id);
CREATE INDEX IF NOT EXISTS idx_actions_deadline ON actions(deadline)
    WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_actions_document ON actions(document_type)
    WHERE document_type != 'none';
CREATE INDEX IF NOT EXISTS idx_actions_created ON actions(created_at);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_actions_updated_at ON actions;
CREATE TRIGGER update_actions_updated_at
    BEFORE UPDATE ON actions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
