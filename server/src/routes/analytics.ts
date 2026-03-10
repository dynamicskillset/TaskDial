import { Router, Request, Response } from 'express';
import { incrementUsageStat, getDb } from '../db';

const router = Router();

const VALID_EVENTS = ['impression', 'install', 'dismiss'] as const;

// POST /api/analytics/install — log a PWA install prompt event
router.post('/install', (req: Request, res: Response) => {
  const { event } = req.body;

  if (!event || !VALID_EVENTS.includes(event)) {
    res.status(400).json({ error: `event must be one of: ${VALID_EVENTS.join(', ')}` });
    return;
  }

  incrementUsageStat(`pwa_${event}`);
  res.json({ success: true });
});

// GET /api/analytics/install — aggregate PWA stats from usage_stats
router.get('/install', (_req: Request, res: Response) => {
  const db = getDb();

  const rows = db.prepare(
    "SELECT event, SUM(count) as count FROM usage_stats WHERE event LIKE 'pwa_%' GROUP BY event"
  ).all() as Array<{ event: string; count: number }>;

  const counts: Record<string, number> = { impression: 0, install: 0, dismiss: 0 };
  let total = 0;
  for (const row of rows) {
    const key = row.event.replace('pwa_', '');
    counts[key] = row.count;
    total += row.count;
  }

  res.json({ counts, total });
});

export default router;
