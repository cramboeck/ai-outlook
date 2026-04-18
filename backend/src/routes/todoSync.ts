// Microsoft To-Do Sync API
// Syncs tasks between Microsoft To-Do (via Graph API) and MailSort actions
// Frontend fetches tasks from Graph → sends to backend for sync

import { Router } from 'express';
import { query, queryOne } from '../db';
import { logger } from '../services/logger';

const router = Router();

interface TodoTaskInput {
  id: string;           // Microsoft To-Do task ID
  listId: string;       // Microsoft To-Do list ID
  listName: string;     // List display name
  title: string;
  body?: string;
  status: string;       // notStarted, inProgress, completed, waitingOnOthers, deferred
  importance: string;   // low, normal, high
  dueDateTime?: string; // ISO date
  createdDateTime: string;
  lastModifiedDateTime: string;
  categories?: string[];
}

// Map Microsoft To-Do status to MailSort status
function mapTodoStatus(todoStatus: string): string {
  switch (todoStatus) {
    case 'notStarted': return 'open';
    case 'inProgress': return 'in_progress';
    case 'completed': return 'done';
    case 'waitingOnOthers': return 'in_progress';
    case 'deferred': return 'dismissed';
    default: return 'open';
  }
}

// Map MailSort status to Microsoft To-Do status
function mapToTodoStatus(mailsortStatus: string): string {
  switch (mailsortStatus) {
    case 'open': return 'notStarted';
    case 'in_progress': return 'inProgress';
    case 'done': return 'completed';
    case 'approved': return 'completed';
    case 'dismissed': return 'deferred';
    default: return 'notStarted';
  }
}

// Map importance
function mapTodoPriority(importance: string): string {
  switch (importance) {
    case 'high': return 'high';
    case 'low': return 'low';
    default: return 'medium';
  }
}

// POST /api/todo/sync - Sync Microsoft To-Do tasks into MailSort actions
// Frontend sends all current tasks from Graph, backend does the diff
router.post('/sync', async (req, res, next) => {
  try {
    const { tasks } = req.body as { tasks: TodoTaskInput[] };

    if (!tasks || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'tasks array is required' });
    }

    // Resolve internal user ID from Azure OID
    let internalUserId = req.userId;
    try {
      const userRow = await queryOne<any>(
        'SELECT id FROM users WHERE azure_user_id = $1 AND tenant_id = $2',
        [req.userId, req.tenantId]
      );
      if (userRow) {
        internalUserId = userRow.id;
      } else {
        // Fallback: check if req.userId is already a valid internal ID
        const directRow = await queryOne<any>(
          'SELECT id FROM users WHERE id = $1',
          [req.userId]
        );
        if (directRow) {
          internalUserId = directRow.id;
        } else {
          logger.warn('Todo sync: user not found, tasks will be imported without user_id', { userId: req.userId });
        }
      }
    } catch (err) {
      logger.warn('Todo sync: user lookup failed', { error: (err as Error).message });
    }

    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as Array<{ todoId: string; title: string; action: string; error?: string }>,
    };

    for (const task of tasks) {
      try {
        // Check if this task is already synced
        const existing = await queryOne<any>(
          'SELECT id, status, description, priority, deadline, ms_todo_synced_at FROM actions WHERE ms_todo_id = $1 AND tenant_id = $2',
          [task.id, req.tenantId]
        );

        if (existing) {
          // Task exists - check if Microsoft To-Do version is newer
          const todoModified = new Date(task.lastModifiedDateTime).getTime();
          const localSynced = existing.ms_todo_synced_at
            ? new Date(existing.ms_todo_synced_at).getTime() : 0;

          if (todoModified > localSynced) {
            // To-Do is newer → update local
            const newStatus = mapTodoStatus(task.status);
            const newPriority = mapTodoPriority(task.importance);

            await query(
              `UPDATE actions SET
                description = $1,
                priority = $2,
                status = $3,
                deadline = $4,
                ms_todo_synced_at = NOW()
              WHERE id = $5 AND tenant_id = $6`,
              [
                task.title,
                newPriority,
                newStatus,
                task.dueDateTime || null,
                existing.id,
                req.tenantId,
              ]
            );

            results.updated++;
            results.details.push({ todoId: task.id, title: task.title, action: 'updated' });
          } else {
            results.skipped++;
            results.details.push({ todoId: task.id, title: task.title, action: 'skipped (local newer)' });
          }
        } else {
          // New task → import into MailSort
          await query(
            `INSERT INTO actions (tenant_id, user_id, description, action_type, priority, status, deadline, source, ms_todo_id, ms_todo_list_id, ms_todo_synced_at, notes)
             VALUES ($1, $2, $3, 'task', $4, $5, $6, 'ms_todo', $7, $8, NOW(), $9)`,
            [
              req.tenantId,
              internalUserId,
              task.title,
              mapTodoPriority(task.importance),
              mapTodoStatus(task.status),
              task.dueDateTime || null,
              task.id,
              task.listId,
              task.body || `Aus Microsoft To-Do Liste: ${task.listName}`,
            ]
          );

          results.imported++;
          results.details.push({ todoId: task.id, title: task.title, action: 'imported' });
        }
      } catch (err) {
        results.errors++;
        results.details.push({
          todoId: task.id,
          title: task.title,
          action: 'error',
          error: (err as Error).message,
        });
        logger.error('Todo sync error for task', {
          todoId: task.id,
          error: (err as Error).message,
        });
      }
    }

    logger.info('Todo sync completed', {
      tenantId: req.tenantId,
      imported: results.imported,
      updated: results.updated,
      skipped: results.skipped,
    });

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// GET /api/todo/status - Get sync status and actions that should be pushed to To-Do
router.get('/status', async (req, res, next) => {
  try {
    // Count synced vs unsynced actions
    const synced = await queryOne<any>(
      'SELECT COUNT(*) as count FROM actions WHERE tenant_id = $1 AND ms_todo_id IS NOT NULL',
      [req.tenantId]
    );
    const unsynced = await queryOne<any>(
      'SELECT COUNT(*) as count FROM actions WHERE tenant_id = $1 AND ms_todo_id IS NULL AND source != $2',
      [req.tenantId, 'ms_todo']
    );
    const lastSync = await queryOne<any>(
      'SELECT MAX(ms_todo_synced_at) as last_sync FROM actions WHERE tenant_id = $1',
      [req.tenantId]
    );

    // Get MailSort-only actions that could be pushed to To-Do
    const pushCandidates = await query(
      `SELECT id, description, priority, status, deadline, source, action_type, created_at
       FROM actions
       WHERE tenant_id = $1 AND ms_todo_id IS NULL AND status NOT IN ('done', 'dismissed')
       ORDER BY created_at DESC LIMIT 50`,
      [req.tenantId]
    );

    res.json({
      synced_count: parseInt(synced?.count || '0', 10),
      unsynced_count: parseInt(unsynced?.count || '0', 10),
      last_sync: lastSync?.last_sync || null,
      push_candidates: pushCandidates,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/todo/push-confirm - Mark actions as synced after frontend pushes them to To-Do
router.post('/push-confirm', async (req, res, next) => {
  try {
    const { mappings } = req.body as { mappings: Array<{ actionId: string; todoId: string; listId: string }> };

    if (!mappings || !Array.isArray(mappings)) {
      return res.status(400).json({ error: 'mappings array is required' });
    }

    let updated = 0;
    for (const mapping of mappings) {
      const result = await query(
        `UPDATE actions SET ms_todo_id = $1, ms_todo_list_id = $2, ms_todo_synced_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [mapping.todoId, mapping.listId, mapping.actionId, req.tenantId]
      );
      if (result.length > 0 || (result as any).rowCount > 0 || (result as any).changes > 0) {
        updated++;
      }
    }

    res.json({ updated });
  } catch (error) {
    next(error);
  }
});

export default router;
