-- SQLite Schema for PostPilot Local Development
-- Auto-generated from PostgreSQL migrations

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    azure_tenant_id TEXT UNIQUE NOT NULL,
    name TEXT,
    plan TEXT DEFAULT 'free',
    settings TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    azure_user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'user',
    preferences TEXT DEFAULT '{}',
    last_login_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(tenant_id, azure_user_id)
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6B7280',
    emoji TEXT DEFAULT '',
    description TEXT,
    keywords TEXT DEFAULT '[]',
    outlook_category TEXT,
    is_active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    criteria TEXT DEFAULT '{}',
    actions TEXT DEFAULT '[]',
    priority INTEGER DEFAULT 0,
    stop_processing INTEGER DEFAULT 0,
    trigger_count INTEGER DEFAULT 0,
    last_triggered_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_macros (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    criteria TEXT DEFAULT '{}',
    is_shared INTEGER DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    category TEXT,
    is_shared INTEGER DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS signatures (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT DEFAULT 'Standard',
    content TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Processing log (audit trail)
CREATE TABLE IF NOT EXISTS processing_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    email_id TEXT,
    email_subject TEXT,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'system',
    rule_id TEXT,
    rule_name TEXT,
    category TEXT,
    confidence REAL,
    reasoning TEXT,
    model TEXT,
    tokens_prompt INTEGER,
    tokens_completion INTEGER,
    tokens_total INTEGER,
    estimated_cost_usd REAL,
    processing_time_ms INTEGER,
    old_state TEXT,
    new_state TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Actions table
CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    tenant_id TEXT NOT NULL,
    user_id TEXT,
    email_id TEXT,
    email_subject TEXT,
    email_sender TEXT,
    description TEXT NOT NULL,
    action_type TEXT NOT NULL DEFAULT 'other',
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    deadline TEXT,
    notes TEXT,
    source TEXT DEFAULT 'manual',
    document_type TEXT,
    document_data TEXT DEFAULT '{}',
    forwarded_to TEXT DEFAULT '[]',
    completed_at TEXT,
    dismissed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Integrations table
CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6)))),
    tenant_id TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    config TEXT DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    status TEXT DEFAULT 'configured',
    last_error TEXT,
    last_used_at TEXT,
    auto_forward_rules TEXT DEFAULT '[]',
    forward_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rules_tenant ON rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rules_priority ON rules(tenant_id, priority);
CREATE INDEX IF NOT EXISTS idx_activity_tenant ON activity_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_log_tenant ON processing_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_processing_log_email ON processing_log(email_id);
CREATE INDEX IF NOT EXISTS idx_processing_log_type ON processing_log(event_type);
CREATE INDEX IF NOT EXISTS idx_actions_tenant ON actions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_actions_email ON actions(email_id);
CREATE INDEX IF NOT EXISTS idx_actions_deadline ON actions(deadline);
CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id);

-- Insert dev tenant for local development
INSERT OR IGNORE INTO tenants (id, azure_tenant_id, name, plan)
VALUES ('dev-tenant-123', 'dev-tenant-123', 'Development', 'enterprise');
