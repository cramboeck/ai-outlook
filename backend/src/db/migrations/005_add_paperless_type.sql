-- Migration: Add paperless-ngx integration type
-- Update the type check constraint if one exists, otherwise this is just documentation
-- The type column is text, so no schema change needed - just a documentation migration

-- Add comment for supported types
COMMENT ON COLUMN integrations.type IS 'Integration type: sharepoint, sevdesk, datev, webhook, paperless';
