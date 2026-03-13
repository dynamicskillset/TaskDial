import { useMemo } from 'react';
import type { ScheduledTask } from '../utils/scheduling';

/**
 * Returns the ID of the first non-completed, non-break task whose
 * scheduled end time has passed the current time.
 * Returns null when disabled, not today, or no task has timed out.
 */
export function useTimedOutTask(
  scheduledTasks: ScheduledTask[],
  currentTime: Date,
  isToday: boolean,
  enabled: boolean,
): string | null {
  return useMemo(() => {
    if (!enabled || !isToday) return null;
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    for (const task of scheduledTasks) {
      if (task.completed || task.isBreak) continue;
      if (task.scheduledEnd <= nowMinutes) return task.id;
    }
    return null;
  }, [scheduledTasks, currentTime, isToday, enabled]);
}
