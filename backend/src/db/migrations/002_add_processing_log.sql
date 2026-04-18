-- Processing Log: 100% audit trail for all email processing events
-- Tracks: AI classifications, rule matches, user overrides, email movements, DMS forwards

CREATE TABLE IF NOT EXISTS processing_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email_id VARCHAR(500),
    email_subject VARCHAR(1000),

    -- Event classification
    event_type VARCHAR(50) NOT NULL,
    -- Values: classification, rule_match, action_extracted, action_applied,
    --         user_override, email_moved, email_deleted, document_forwarded,
    --         rule_dry_run, error

    source VARCHAR(20) NOT NULL DEFAULT 'manual',
    -- Values: rule, ai, manual, auto, system

    -- Rule reference (when event_type = rule_match)
    rule_id UUID REFERENCES rules(id) ON DELETE SET NULL,
    rule_name VARCHAR(255),

    -- Classification data
    category VARCHAR(255),
    confidence NUMERIC(4,3),
    reasoning TEXT,

    -- AI usage tracking
    model VARCHAR(100),
    tokens_prompt INTEGER,
    tokens_completion INTEGER,
    tokens_total INTEGER,
    estimated_cost_usd NUMERIC(10,6),

    -- Performance
    processing_time_ms INTEGER,

    -- State tracking (before/after for movements, overrides)
    old_state JSONB,
    new_state JSONB,

    -- Flexible metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_processing_log_tenant ON processing_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_processing_log_user ON processing_log(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_processing_log_email ON processing_log(email_id);
CREATE INDEX IF NOT EXISTS idx_processing_log_event ON processing_log(event_type);
CREATE INDEX IF NOT EXISTS idx_processing_log_created ON processing_log(created_at);
CREATE INDEX IF NOT EXISTS idx_processing_log_source ON processing_log(source);
CREATE INDEX IF NOT EXISTS idx_processing_log_rule ON processing_log(rule_id) WHERE rule_id IS NOT NULL;
-- Cost tracking index
CREATE INDEX IF NOT EXISTS idx_processing_log_cost ON processing_log(tenant_id, created_at)
    WHERE estimated_cost_usd IS NOT NULL;
