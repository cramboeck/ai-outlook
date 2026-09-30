-- Add Microsoft To-Do sync fields to actions table
-- Enables bidirectional sync between MailSort actions and Microsoft To-Do tasks

ALTER TABLE actions ADD COLUMN IF NOT EXISTS ms_todo_id VARCHAR(500);
ALTER TABLE actions ADD COLUMN IF NOT EXISTS ms_todo_list_id VARCHAR(500);
ALTER TABLE actions ADD COLUMN IF NOT EXISTS ms_todo_synced_at TIMESTAMP WITH TIME ZONE;
