import { describe, it, expect } from 'vitest';
import { getTasksToNotify } from './useTaskNotifications';
import type { ScheduledTask } from '../utils/scheduling';

// These tests define the correct behaviour for Bug #16.
//
// The bug: the dedup key is `${task.id}:${task.scheduledStart}`.  For flexible
// tasks on today, `scheduledStart` is recalculated every minute from the
// current time, so the key changes each tick and the notification fires again.
//
// The fix: use only `task.id` as the dedup key so the notification fires once
// per task per day regardless of rescheduling.

function makeScheduledTask(overrides: Partial<ScheduledTask> & { id: string }): ScheduledTask {
  return {
    title: 'Task',
    durationMinutes: 30,
    completed: false,
    important: false,
    isBreak: false,
    sortOrder: 0,
    date: '2026-01-01',
    createdAt: '2026-01-01T09:00:00Z',
    updatedAt: '2026-01-01T09:00:00Z',
    scheduledStart: 540,
    scheduledEnd: 570,
    ...overrides,
  };
}

describe('getTasksToNotify', () => {
  // --- basic firing ---

  it('returns a task whose scheduledStart matches nowMinutes', () => {
    const task = makeScheduledTask({ id: 't1', scheduledStart: 600 });
    const result = getTasksToNotify([task], 600, new Set());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('returns nothing when nowMinutes does not match scheduledStart', () => {
    const task = makeScheduledTask({ id: 't1', scheduledStart: 600 });
    expect(getTasksToNotify([task], 601, new Set())).toHaveLength(0);
    expect(getTasksToNotify([task], 599, new Set())).toHaveLength(0);
  });

  // --- deduplication ---

  it('does not re-notify a task that is already in the notified set', () => {
    const task = makeScheduledTask({ id: 't1', scheduledStart: 600 });
    const alreadyNotified = new Set(['t1']);
    expect(getTasksToNotify([task], 600, alreadyNotified)).toHaveLength(0);
  });

  it('does not re-notify when scheduledStart shifts between ticks (the core bug)', () => {
    // Minute 1: task was at scheduledStart=600, notified with key 't1'
    const alreadyNotified = new Set(['t1']);

    // Minute 2: flexible rescheduling moved the task to scheduledStart=601
    const taskRescheduled = makeScheduledTask({ id: 't1', scheduledStart: 601 });

    // Should NOT notify again — task.id is the same
    // Bug: old code used 't1:600' as key, so 't1:601' is NOT in the set → fires again
    expect(getTasksToNotify([taskRescheduled], 601, alreadyNotified)).toHaveLength(0);
  });

  // --- filtering ---

  it('skips completed tasks', () => {
    const task = makeScheduledTask({ id: 't1', scheduledStart: 600, completed: true });
    expect(getTasksToNotify([task], 600, new Set())).toHaveLength(0);
  });

  it('skips break tasks', () => {
    const task = makeScheduledTask({ id: 't1', scheduledStart: 600, isBreak: true });
    expect(getTasksToNotify([task], 600, new Set())).toHaveLength(0);
  });

  it('notifies multiple tasks scheduled at the same minute', () => {
    const t1 = makeScheduledTask({ id: 't1', scheduledStart: 600 });
    const t2 = makeScheduledTask({ id: 't2', scheduledStart: 600 });
    const result = getTasksToNotify([t1, t2], 600, new Set());
    expect(result).toHaveLength(2);
  });

  it('only notifies the task whose scheduledStart matches when multiple tasks exist', () => {
    const t1 = makeScheduledTask({ id: 't1', scheduledStart: 600 });
    const t2 = makeScheduledTask({ id: 't2', scheduledStart: 630 });
    const result = getTasksToNotify([t1, t2], 600, new Set());
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('returns an empty array when the task list is empty', () => {
    expect(getTasksToNotify([], 600, new Set())).toHaveLength(0);
  });
});
