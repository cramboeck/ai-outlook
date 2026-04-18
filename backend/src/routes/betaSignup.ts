import { Router, Request, Response } from 'express';
import { query } from '../db';
import { logger } from '../services/logger';

const router = Router();

// Simple in-memory rate limiting per IP
const signupAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = signupAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    signupAttempts.set(ip, { count: 1, resetAt: now + 3600_000 }); // 1 hour window
    return true;
  }

  if (entry.count >= 5) {
    return false;
  }

  entry.count++;
  return true;
}

// POST /api/beta-signup - No auth required (public endpoint)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { email, company, name } = req.body;

    // Validate email
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'E-Mail-Adresse ist erforderlich.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Bitte geben Sie eine gueltige E-Mail-Adresse ein.' });
    }

    // Rate limiting
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Zu viele Anmeldungen. Bitte versuchen Sie es spaeter erneut.' });
    }

    // Insert into database
    await query(
      `INSERT INTO beta_signups (email, company, name, source, signed_up_at, status)
       VALUES ($1, $2, $3, 'landing_page', NOW(), 'pending')
       ON CONFLICT (email) DO NOTHING`,
      [email.trim().toLowerCase(), company?.trim() || null, name?.trim() || null]
    );

    logger.info('Beta signup', { email: email.trim().toLowerCase(), source: 'landing_page' });

    res.json({ success: true, message: 'Erfolgreich fuer die Beta registriert!' });
  } catch (err) {
    logger.error('Beta signup error', { error: (err as Error).message });
    res.status(500).json({ error: 'Registrierung fehlgeschlagen. Bitte versuchen Sie es spaeter erneut.' });
  }
});

export default router;
