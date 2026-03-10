import { Router, Request, Response } from 'express';
import { getDb } from '../db';

const router = Router();

// GET /api/settings
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const db = getDb();

  const rows = db.prepare(
    'SELECT key, value FROM user_settings WHERE user_id = ?'
  ).all(userId) as Array<{ key: string; value: string }>;

  const settings: Record<string, any> = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  res.json(settings);
});

// PUT /api/settings
router.put('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const updates = req.body;

  if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
    res.status(400).json({ error: 'Request body must be an object of key-value pairs' });
    return;
  }

  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `);

  const upsertMany = db.transaction((entries: Array<[string, any]>) => {
    for (const [key, value] of entries) {
      const serialised = typeof value === 'string' ? value : JSON.stringify(value);
      stmt.run(userId, key, serialised);
    }
  });

  const entries = Object.entries(updates);
  upsertMany(entries);

  res.json({ success: true, updated: entries.length });
});

export default router;
