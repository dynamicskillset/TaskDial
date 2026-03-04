import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

const VALID_EVENTS = ['impression', 'install', 'dismiss'] as const;

// POST /api/analytics/install — log an event
router.post('/install', (req: Request, res: Response) => {
  const { event, timestamp } = req.body;

  if (!event || !VALID_EVENTS.includes(event)) {
    res.status(400).json({ error: `event must be one of: ${VALID_EVENTS.join(', ')}` });
    return;
  }

  const db = getDb();
  db.prepare(
    'INSERT INTO analytics_events (event_type, event_data, created_at) VALUES (?, ?, ?)'
  ).run(event, JSON.stringify({ timestamp }), new Date().toISOString());

  res.json({ success: true });
});

// GET /api/analytics/install — read stats
router.get('/install', (req: Request, res: Response) => {
  const since = req.query.since as string | undefined;
  const db = getDb();

  let rows: Array<{ event_type: string; count: number }>;
  if (since) {
    rows = db.prepare(
      'SELECT event_type, COUNT(*) as count FROM analytics_events WHERE created_at >= ? GROUP BY event_type'
    ).all(since) as Array<{ event_type: string; count: number }>;
  } else {
    rows = db.prepare(
      'SELECT event_type, COUNT(*) as count FROM analytics_events GROUP BY event_type'
    ).all() as Array<{ event_type: string; count: number }>;
  }

  const counts: Record<string, number> = { impression: 0, install: 0, dismiss: 0 };
  let total = 0;
  for (const row of rows) {
    counts[row.event_type] = row.count;
    total += row.count;
  }

  res.json({ counts, total });
});

export default router;
