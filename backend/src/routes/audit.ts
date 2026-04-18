// Audit API - Viewing processing logs, stats, and cost tracking

import { Router } from 'express';
import { query, queryOne } from '../db';
import { logger } from '../services/logger';

const router = Router();

// GET /api/audit/log - Paginated processing log with filters
router.get('/log', async (req, res, next) => {
  try {
    const { event_type, source, email_id, date_from, date_to, limit = '50', offset = '0' } = req.query;

    let sql = 'SELECT * FROM processing_log WHERE tenant_id = $1';
    const params: any[] = [req.tenantId];
    let paramIdx = 2;

    if (event_type) {
      sql += ` AND event_type = $${paramIdx++}`;
      params.push(event_type);
    }
    if (source) {
      sql += ` AND source = $${paramIdx++}`;
      params.push(source);
    }
    if (email_id) {
      sql += ` AND email_id = $${paramIdx++}`;
      params.push(email_id);
    }
    if (date_from) {
      sql += ` AND created_at >= $${paramIdx++}`;
      params.push(date_from);
    }
    if (date_to) {
      sql += ` AND created_at <= $${paramIdx++}`;
      params.push(date_to);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(Math.min(parseInt(limit as string) || 50, 200));
    params.push(parseInt(offset as string) || 0);

    const rows = await query(sql, params);

    // Get total count for pagination
    let countSql = 'SELECT COUNT(*) as total FROM processing_log WHERE tenant_id = $1';
    const countParams: any[] = [req.tenantId];
    // Reapply same filters for count
    let cIdx = 2;
    if (event_type) { countSql += ` AND event_type = $${cIdx++}`; countParams.push(event_type); }
    if (source) { countSql += ` AND source = $${cIdx++}`; countParams.push(source); }
    if (email_id) { countSql += ` AND email_id = $${cIdx++}`; countParams.push(email_id); }
    if (date_from) { countSql += ` AND created_at >= $${cIdx++}`; countParams.push(date_from); }
    if (date_to) { countSql += ` AND created_at <= $${cIdx++}`; countParams.push(date_to); }

    const countResult = await queryOne<{ total: string }>(countSql, countParams);

    res.json({
      items: rows,
      total: parseInt(countResult?.total || '0'),
      limit: parseInt(limit as string) || 50,
      offset: parseInt(offset as string) || 0,
    });
  } catch (error) {
    logger.error('Audit log query error', { error: (error as Error).message });
    next(error);
  }
});

// GET /api/audit/email/:emailId - Complete history of a single email
router.get('/email/:emailId', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT * FROM processing_log WHERE tenant_id = $1 AND email_id = $2 ORDER BY created_at ASC',
      [req.tenantId, req.params.emailId]
    );
    res.json({ timeline: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/audit/stats - Aggregated statistics
router.get('/stats', async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    const days = period === '30d' ? 30 : period === '24h' ? 1 : 7;

    const stats = await queryOne<{
      total_events: string;
      classifications: string;
      rule_matches: string;
      actions_extracted: string;
      user_overrides: string;
      ai_events: string;
      rule_events: string;
    }>(`
      SELECT
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE event_type = 'classification') as classifications,
        COUNT(*) FILTER (WHERE event_type = 'rule_match') as rule_matches,
        COUNT(*) FILTER (WHERE event_type = 'action_extracted') as actions_extracted,
        COUNT(*) FILTER (WHERE event_type = 'user_override') as user_overrides,
        COUNT(*) FILTER (WHERE source = 'ai') as ai_events,
        COUNT(*) FILTER (WHERE source = 'rule') as rule_events
      FROM processing_log
      WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '${days} days'
    `, [req.tenantId]);

    res.json({
      period,
      ...stats,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/audit/cost - AI cost breakdown
router.get('/cost', async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '24h' ? 1 : 30;

    const cost = await queryOne<{
      total_cost: string;
      total_tokens: string;
      total_prompt_tokens: string;
      total_completion_tokens: string;
      request_count: string;
    }>(`
      SELECT
        COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
        COALESCE(SUM(tokens_total), 0) as total_tokens,
        COALESCE(SUM(tokens_prompt), 0) as total_prompt_tokens,
        COALESCE(SUM(tokens_completion), 0) as total_completion_tokens,
        COUNT(*) as request_count
      FROM processing_log
      WHERE tenant_id = $1
        AND estimated_cost_usd IS NOT NULL
        AND created_at >= NOW() - INTERVAL '${days} days'
    `, [req.tenantId]);

    // Daily breakdown
    const daily = await query<{
      date: string;
      cost: string;
      tokens: string;
      requests: string;
    }>(`
      SELECT
        DATE(created_at) as date,
        COALESCE(SUM(estimated_cost_usd), 0) as cost,
        COALESCE(SUM(tokens_total), 0) as tokens,
        COUNT(*) as requests
      FROM processing_log
      WHERE tenant_id = $1
        AND estimated_cost_usd IS NOT NULL
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [req.tenantId]);

    res.json({
      period,
      summary: cost,
      daily,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/audit/rules/effectiveness - Rule performance stats
router.get('/rules/effectiveness', async (req, res, next) => {
  try {
    const ruleStats = await query<{
      rule_id: string;
      rule_name: string;
      match_count: string;
      override_count: string;
    }>(`
      SELECT
        pl.rule_id,
        pl.rule_name,
        COUNT(*) FILTER (WHERE pl.event_type = 'rule_match') as match_count,
        COUNT(*) FILTER (WHERE pl.event_type = 'user_override' AND pl.metadata->>'originalSource' = 'rule') as override_count
      FROM processing_log pl
      WHERE pl.tenant_id = $1
        AND pl.rule_id IS NOT NULL
        AND pl.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY pl.rule_id, pl.rule_name
      ORDER BY match_count DESC
    `, [req.tenantId]);

    res.json({ rules: ruleStats });
  } catch (error) {
    next(error);
  }
});

export default router;
