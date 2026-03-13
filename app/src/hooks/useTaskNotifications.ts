import { useEffect, useRef } from 'react';
import type { ScheduledTask } from '../utils/scheduling';

/**
 * Pure helper — returns the subset of tasks that should fire a notification
 * at `nowMinutes`, filtering out already-notified tasks, completed tasks, and
 * breaks.  Extracted for unit-testing.
 *
 * The dedup key is `task.id` only (not `task.id:scheduledStart`) so that
 * flexible tasks rescheduled each minute do not re-notify.
 *
 * TODO: fix dedup key — currently uses task.id:scheduledStart (Bug #16)
 */
export function getTasksToNotify(
  tasks: ScheduledTask[],
  nowMinutes: number,
  alreadyNotified: ReadonlySet<string>,
): ScheduledTask[] {
  const result: ScheduledTask[] = [];
  for (const task of tasks) {
    if (task.isBreak || task.completed) continue;
    if (alreadyNotified.has(task.id)) continue;
    if (task.scheduledStart === nowMinutes) {
      result.push(task);
    }
  }
  return result;
}

/**
 * Sends a browser notification when a scheduled task is about to start.
 * Fires at the task's scheduled start time (within the current minute).
 * Each task is notified at most once per scheduled slot per day.
 */
export function useTaskNotifications(
  tasks: ScheduledTask[],
  currentTime: Date,
  isToday: boolean,
  enabled: boolean,
): void {
  // Track which task ids we've already notified today
  const notifiedRef = useRef<Set<string>>(new Set());

  // Reset notified set when the date changes
  const dateKey = currentTime.toISOString().slice(0, 10);
  const prevDateRef = useRef(dateKey);
  useEffect(() => {
    if (prevDateRef.current !== dateKey) {
      notifiedRef.current = new Set();
      prevDateRef.current = dateKey;
    }
  }, [dateKey]);

  useEffect(() => {
    if (!enabled || !isToday) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const toNotify = getTasksToNotify(tasks, nowMinutes, notifiedRef.current);

    for (const task of toNotify) {
      notifiedRef.current.add(task.id);
      new Notification('TaskDial', {
        body: `Time to start: ${task.title}`,
        icon: '/favicon.svg',
        tag: task.id,
      });
    }
  }, [tasks, currentTime, isToday, enabled]);
}
