// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setStorageUser, clearStorageUser,
  migrateAnonymousData, clearUserData,
  getLocalTasks, saveLocalTasks, upsertLocalTask, removeLocalTask,
  getLocalSettings, saveLocalSettings,
  getLastSync, setLastSync,
} from './storage';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    durationMinutes: 25,
    completed: false,
    important: false,
    isBreak: false,
    sortOrder: 0,
    date: '2026-01-01',
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearStorageUser();
});

// ── Namespacing ───────────────────────────────────────────────────────────────

describe('storage namespacing', () => {
  it('uses anonymous namespace when no user is set', () => {
    saveLocalTasks([makeTask()]);
    expect(localStorage.getItem('ct_tasks_anonymous')).not.toBeNull();
  });

  it('uses user-scoped keys after setStorageUser', () => {
    setStorageUser('user-abc');
    saveLocalTasks([makeTask()]);
    expect(localStorage.getItem('ct_tasks_user-abc')).not.toBeNull();
    expect(localStorage.getItem('ct_tasks_anonymous')).toBeNull();
  });

  it('switches namespace when setStorageUser is called again', () => {
    setStorageUser('user-1');
    saveLocalTasks([makeTask({ id: 'u1-task' })]);

    setStorageUser('user-2');
    saveLocalTasks([makeTask({ id: 'u2-task' })]);

    // User 1 data is untouched
    setStorageUser('user-1');
    expect(getLocalTasks('2026-01-01')[0].id).toBe('u1-task');

    // User 2 data is separate
    setStorageUser('user-2');
    expect(getLocalTasks('2026-01-01')[0].id).toBe('u2-task');
  });

  it('clearStorageUser reverts to anonymous namespace', () => {
    setStorageUser('user-abc');
    clearStorageUser();
    saveLocalTasks([makeTask()]);
    expect(localStorage.getItem('ct_tasks_anonymous')).not.toBeNull();
  });
});

// ── migrateAnonymousData ──────────────────────────────────────────────────────

describe('migrateAnonymousData', () => {
  it('copies legacy keys to user-scoped keys', () => {
    localStorage.setItem('chronotasker_tasks', JSON.stringify([makeTask()]));
    localStorage.setItem('chronotasker_last_sync', '2026-01-01T00:00:00.000Z');

    migrateAnonymousData('user-xyz');

    expect(localStorage.getItem('ct_tasks_user-xyz')).not.toBeNull();
    expect(localStorage.getItem('ct_last_sync_user-xyz')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('removes legacy keys after migration', () => {
    localStorage.setItem('chronotasker_tasks', JSON.stringify([makeTask()]));
    migrateAnonymousData('user-xyz');
    expect(localStorage.getItem('chronotasker_tasks')).toBeNull();
  });

  it('does not overwrite existing user-scoped data', () => {
    localStorage.setItem('chronotasker_tasks', JSON.stringify([makeTask({ id: 'legacy' })]));
    localStorage.setItem('ct_tasks_user-xyz', JSON.stringify([makeTask({ id: 'existing' })]));

    migrateAnonymousData('user-xyz');

    const tasks = JSON.parse(localStorage.getItem('ct_tasks_user-xyz')!);
    expect(tasks[0].id).toBe('existing');
  });

  it('is a no-op when there are no legacy keys', () => {
    expect(() => migrateAnonymousData('user-xyz')).not.toThrow();
  });
});

// ── clearUserData ─────────────────────────────────────────────────────────────

describe('clearUserData', () => {
  it('removes all keys for that user', () => {
    setStorageUser('user-del');
    saveLocalTasks([makeTask()]);
    setLastSync('2026-01-01T00:00:00.000Z');

    clearUserData('user-del');

    expect(localStorage.getItem('ct_tasks_user-del')).toBeNull();
    expect(localStorage.getItem('ct_last_sync_user-del')).toBeNull();
  });

  it('does not affect other users data', () => {
    setStorageUser('user-keep');
    saveLocalTasks([makeTask()]);

    clearUserData('user-del');

    expect(localStorage.getItem('ct_tasks_user-keep')).not.toBeNull();
  });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

describe('task storage', () => {
  beforeEach(() => setStorageUser('user-1'));

  it('getLocalTasks returns empty array when nothing stored', () => {
    expect(getLocalTasks('2026-01-01')).toEqual([]);
  });

  it('saves and retrieves tasks for a specific date', () => {
    const task = makeTask({ date: '2026-01-01' });
    saveLocalTasks([task]);
    const retrieved = getLocalTasks('2026-01-01');
    expect(retrieved).toHaveLength(1);
    expect(retrieved[0].id).toBe('task-1');
  });

  it('filters by date', () => {
    saveLocalTasks([
      makeTask({ id: 'a', date: '2026-01-01' }),
      makeTask({ id: 'b', date: '2026-01-02' }),
    ]);
    expect(getLocalTasks('2026-01-01')).toHaveLength(1);
    expect(getLocalTasks('2026-01-02')).toHaveLength(1);
    expect(getLocalTasks('2026-01-03')).toHaveLength(0);
  });

  it('upsertLocalTask inserts a new task', () => {
    upsertLocalTask(makeTask());
    expect(getLocalTasks('2026-01-01')).toHaveLength(1);
  });

  it('upsertLocalTask updates an existing task', () => {
    upsertLocalTask(makeTask({ title: 'Before' }));
    upsertLocalTask(makeTask({ title: 'After' }));
    const tasks = getLocalTasks('2026-01-01');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('After');
  });

  it('removeLocalTask removes by id', () => {
    upsertLocalTask(makeTask());
    removeLocalTask('task-1');
    expect(getLocalTasks('2026-01-01')).toHaveLength(0);
  });

  it('sortOrder is respected in getLocalTasks', () => {
    saveLocalTasks([
      makeTask({ id: 'b', sortOrder: 2, date: '2026-01-01' }),
      makeTask({ id: 'a', sortOrder: 1, date: '2026-01-01' }),
    ]);
    const tasks = getLocalTasks('2026-01-01');
    expect(tasks[0].id).toBe('a');
    expect(tasks[1].id).toBe('b');
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────

describe('settings storage', () => {
  beforeEach(() => setStorageUser('user-1'));

  it('returns DEFAULT_SETTINGS when nothing is stored', () => {
    const settings = getLocalSettings();
    expect(settings).toHaveProperty('dayStartHour');
  });

  it('merges saved settings over defaults', () => {
    saveLocalSettings({ dayStartHour: 6 });
    expect(getLocalSettings().dayStartHour).toBe(6);
  });

  it('partial save does not wipe other keys', () => {
    saveLocalSettings({ dayStartHour: 6 });
    saveLocalSettings({ dayEndHour: 22 });
    const s = getLocalSettings();
    expect(s.dayStartHour).toBe(6);
    expect(s.dayEndHour).toBe(22);
  });
});

// ── Sync timestamp ────────────────────────────────────────────────────────────

describe('sync timestamp', () => {
  beforeEach(() => setStorageUser('user-1'));

  it('returns epoch when never synced', () => {
    expect(getLastSync()).toBe(new Date(0).toISOString());
  });

  it('stores and retrieves the sync timestamp', () => {
    const ts = '2026-03-10T12:00:00.000Z';
    setLastSync(ts);
    expect(getLastSync()).toBe(ts);
  });
});
