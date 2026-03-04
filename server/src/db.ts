import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'chronotasker.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
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
  `);

  // Migrations for existing databases
  try { db.exec('ALTER TABLE tasks ADD COLUMN is_break INTEGER NOT NULL DEFAULT 0'); } catch { /* column already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN tag TEXT'); } catch { /* column already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN details TEXT'); } catch { /* column already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN recurrence_pattern TEXT'); } catch { /* column already exists */ }
  try { db.exec('ALTER TABLE tasks ADD COLUMN recurrence_source_id TEXT'); } catch { /* column already exists */ }
  try { db.exec('CREATE INDEX idx_tasks_recurrence_source ON tasks(recurrence_source_id)'); } catch { /* index already exists */ }
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
