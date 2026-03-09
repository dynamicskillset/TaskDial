import { useEffect, useRef } from 'react';
import type { ScheduledTask } from '../utils/scheduling';

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

    for (const task of tasks) {
      if (task.isBreak || task.completed) continue;

      const key = `${task.id}:${task.scheduledStart}`;
      if (notifiedRef.current.has(key)) continue;

      // Notify when we enter the task's starting minute
      if (task.scheduledStart === nowMinutes) {
        notifiedRef.current.add(key);
        new Notification('ChronoTasker', {
          body: `Time to start: ${task.title}`,
          icon: '/favicon.svg',
          tag: key,
        });
      }
    }
  }, [tasks, currentTime, isToday, enabled]);
}
