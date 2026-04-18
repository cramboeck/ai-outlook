-- Premium Feature: Microsoft 365 Copilot License Flag
-- When true, the tenant gets Context-Aware Drafts via the Copilot Retrieval API
-- grounded on their Teams/SharePoint/OneDrive content.

ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS has_copilot_license BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tenants_copilot_license
    ON tenants (has_copilot_license)
    WHERE has_copilot_license = true;
