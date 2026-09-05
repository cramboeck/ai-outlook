-- Microsoft To-Do subtask support on actions
-- Stores the task's checklistItems (fetched via Graph $expand) so the
-- Aufgaben-Board can render and toggle them without an extra Graph round-trip.
-- Shape: [{ id, displayName, isChecked, ms_todo_list_id (for PATCH) }]

ALTER TABLE actions
    ADD COLUMN IF NOT EXISTS subtasks JSONB NOT NULL DEFAULT '[]';
