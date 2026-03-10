import type { Task, PomodoroSession, AppSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

// ── User namespace ────────────────────────────────────────────────────────────

let _userId: string | null = null;

export function setStorageUser(userId: string): void {
  _userId = userId;
}

export function clearStorageUser(): void {
  _userId = null;
}

function uid(): string {
  return _userId || 'anonymous';
}

function keys() {
  const u = uid();
  return {
    tasks: `ct_tasks_${u}`,
    sessions: `ct_sessions_${u}`,
    settings: `ct_settings_${u}`,
    lastSync: `ct_last_sync_${u}`,
    lastUnfinishedReview: `ct_unfinished_review_${u}`,
  };
}

// ── One-time migration from legacy anonymous keys ─────────────────────────────

export function migrateAnonymousData(userId: string): void {
  const legacyKeys = {
    tasks: 'chronotasker_tasks',
    sessions: 'chronotasker_sessions',
    settings: 'chronotasker_settings',
    lastSync: 'chronotasker_last_sync',
    lastUnfinishedReview: 'chronotasker_last_unfinished_review',
  };

  const newKeys = {
    tasks: `ct_tasks_${userId}`,
    sessions: `ct_sessions_${userId}`,
    settings: `ct_settings_${userId}`,
    lastSync: `ct_last_sync_${userId}`,
    lastUnfinishedReview: `ct_unfinished_review_${userId}`,
  };

  let migrated = false;
  for (const k of Object.keys(legacyKeys) as Array<keyof typeof legacyKeys>) {
    const legacyVal = localStorage.getItem(legacyKeys[k]);
    if (legacyVal !== null && localStorage.getItem(newKeys[k]) === null) {
      localStorage.setItem(newKeys[k], legacyVal);
      migrated = true;
    }
    // Always remove legacy key once migrated
    if (legacyVal !== null) localStorage.removeItem(legacyKeys[k]);
  }

  if (migrated) {
    console.log('[storage] Migrated legacy data to user-scoped keys');
  }
}

export function clearUserData(userId: string): void {
  const keysToRemove = [
    `ct_tasks_${userId}`,
    `ct_sessions_${userId}`,
    `ct_settings_${userId}`,
    `ct_last_sync_${userId}`,
    `ct_unfinished_review_${userId}`,
  ];
  for (const k of keysToRemove) localStorage.removeItem(k);
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function getLocalTasks(date: string): Task[] {
  const all = getAllLocalTasks();
  return all.filter(t => t.date === date).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getAllLocalTasks(): Task[] {
  const raw = localStorage.getItem(keys().tasks);
  return raw ? JSON.parse(raw) : [];
}

export function saveLocalTasks(tasks: Task[]): void {
  localStorage.setItem(keys().tasks, JSON.stringify(tasks));
}

export function upsertLocalTask(task: Task): void {
  const tasks = getAllLocalTasks();
  const idx = tasks.findIndex(t => t.id === task.id);
  if (idx >= 0) {
    tasks[idx] = task;
  } else {
    tasks.push(task);
  }
  saveLocalTasks(tasks);
}

export function removeLocalTask(id: string): void {
  const tasks = getAllLocalTasks().filter(t => t.id !== id);
  saveLocalTasks(tasks);
}

export function removeLocalTasksByRecurrenceSource(sourceId: string): string[] {
  const all = getAllLocalTasks();
  const removedIds: string[] = [];
  const kept: Task[] = [];
  for (const t of all) {
    if (t.id === sourceId || t.recurrenceSourceId === sourceId) {
      removedIds.push(t.id);
    } else {
      kept.push(t);
    }
  }
  saveLocalTasks(kept);
  return removedIds;
}

export function removeLocalTasksFutureByRecurrenceSource(sourceId: string, fromDate: string): string[] {
  const all = getAllLocalTasks();
  const removedIds: string[] = [];
  const kept: Task[] = [];
  for (const t of all) {
    const isTemplate = t.id === sourceId && t.date >= fromDate;
    const isFutureInstance = t.recurrenceSourceId === sourceId && t.date >= fromDate;
    if (isTemplate || isFutureInstance) {
      removedIds.push(t.id);
    } else {
      kept.push(t);
    }
  }
  saveLocalTasks(kept);
  return removedIds;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export function getLocalSessions(date: string): PomodoroSession[] {
  const all = getAllLocalSessions();
  return all.filter(s => s.date === date);
}

export function getAllLocalSessions(): PomodoroSession[] {
  const raw = localStorage.getItem(keys().sessions);
  return raw ? JSON.parse(raw) : [];
}

export function saveLocalSessions(sessions: PomodoroSession[]): void {
  localStorage.setItem(keys().sessions, JSON.stringify(sessions));
}

export function upsertLocalSession(session: PomodoroSession): void {
  const sessions = getAllLocalSessions();
  const idx = sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.push(session);
  }
  saveLocalSessions(sessions);
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getLocalSettings(): AppSettings {
  const raw = localStorage.getItem(keys().settings);
  if (!raw) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
}

export function saveLocalSettings(settings: Partial<AppSettings>): void {
  const current = getLocalSettings();
  localStorage.setItem(keys().settings, JSON.stringify({ ...current, ...settings }));
}

// ── Unfinished tasks review tracking ──────────────────────────────────────────

export function getLastUnfinishedReview(): string {
  return localStorage.getItem(keys().lastUnfinishedReview) || '';
}

export function setLastUnfinishedReview(date: string): void {
  localStorage.setItem(keys().lastUnfinishedReview, date);
}

// ── Sync timestamp ────────────────────────────────────────────────────────────

export function getLastSync(): string {
  return localStorage.getItem(keys().lastSync) || new Date(0).toISOString();
}

export function setLastSync(timestamp: string): void {
  localStorage.setItem(keys().lastSync, timestamp);
}
