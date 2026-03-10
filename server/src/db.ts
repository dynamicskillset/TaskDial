import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(__dirname, '..', 'chronotasker.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
    seedOwner();
    purgeOldAuditLogs();
  }
  return db;
}

function initTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 25,
      fixed_start_time TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      important INTEGER NOT NULL DEFAULT 0,
      is_break INTEGER NOT NULL DEFAULT 0,
      tag TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      type TEXT NOT NULL DEFAULT 'work',
      duration_minutes INTEGER NOT NULL DEFAULT 25,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      date TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
    CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at);
    CREATE INDEX IF NOT EXISTS idx_pomodoro_date ON pomodoro_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_pomodoro_started ON pomodoro_sessions(started_at);

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      event_data TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      token_version INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS invite_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      used_by TEXT,
      used_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (used_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_invite_code ON invite_codes(code);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      replaced_by TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_rt_hash ON refresh_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      ip TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrations for existing databases
  try { db.exec('ALTER TABLE tasks ADD COLUMN is_break INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN tag TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN details TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN recurrence_pattern TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN recurrence_source_id TEXT'); } catch { /* already exists */ }
  try { db.exec('CREATE INDEX idx_tasks_recurrence_source ON tasks(recurrence_source_id)'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN user_id TEXT'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE pomodoro_sessions ADD COLUMN user_id TEXT'); } catch { /* already exists */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date)'); } catch { /* already exists */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user_updated ON tasks(user_id, updated_at)'); } catch { /* already exists */ }
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_pomodoro_user_date ON pomodoro_sessions(user_id, date)'); } catch { /* already exists */ }
}

function seedOwner(): void {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'owner'").get();
  if (existing) return;

  const now = new Date().toISOString();
  const ownerId = uuidv4();

  // Determine password: from env (used once then warned about), or generate random
  let password = process.env.OWNER_PASSWORD;
  let generated = false;

  if (!password || password.trim() === '') {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  }

  const passwordHash = bcrypt.hashSync(password, 12);

  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail || ownerEmail.trim() === '') {
    console.error('');
    console.error('='.repeat(60));
    console.error('  ERROR: OWNER_EMAIL is not set in .env');
    console.error('  Set OWNER_EMAIL and restart to create the owner account.');
    console.error('='.repeat(60));
    console.error('');
    process.exit(1);
  }

  db.prepare(`
    INSERT INTO users (id, email, password_hash, role, is_active, token_version, created_at, updated_at)
    VALUES (?, ?, ?, 'owner', 1, 0, ?, ?)
  `).run(ownerId, ownerEmail.trim().toLowerCase(), passwordHash, now, now);

  // Claim all existing unscoped rows for the owner
  db.prepare("UPDATE tasks SET user_id = ? WHERE user_id IS NULL").run(ownerId);
  db.prepare("UPDATE pomodoro_sessions SET user_id = ? WHERE user_id IS NULL").run(ownerId);

  // Migrate legacy global settings to user_settings for owner
  const legacySettings = db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  const upsert = db.prepare(`
    INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `);
  for (const row of legacySettings) {
    upsert.run(ownerId, row.key, row.value);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('  TaskDial owner account created');
  console.log(`  Email:    ${ownerEmail.trim().toLowerCase()}`);
  if (generated) {
    console.log(`  Password: ${password}`);
    console.log('');
    console.log('  SAVE THIS PASSWORD — it will not be shown again.');
  } else {
    console.log('  Password: (from OWNER_PASSWORD env var)');
    console.log('');
    console.log('  WARNING: Remove OWNER_PASSWORD from your .env file now.');
  }
  console.log('='.repeat(60));
  console.log('');
}

function purgeOldAuditLogs(): void {
  try {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 12);
    const result = db.prepare(
      "DELETE FROM audit_log WHERE created_at < ?"
    ).run(cutoff.toISOString());
    if (result.changes > 0) {
      console.log(`[db] Purged ${result.changes} audit log entries older than 12 months`);
    }
  } catch {
    // Never crash startup on cleanup
  }
}

export function writeAuditLog(
  userId: string | null,
  action: string,
  detail: Record<string, unknown> | null,
  ip: string | null
): void {
  try {
    getDb().prepare(`
      INSERT INTO audit_log (user_id, action, detail, ip, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, action, detail ? JSON.stringify(detail) : null, ip, new Date().toISOString());
  } catch {
    // Audit log must never crash the app
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
