import type { Task, CalendarEvent } from '../types';

export interface ScheduledTask extends Task {
  scheduledStart: number; // minutes from midnight
  scheduledEnd: number;   // minutes from midnight
  overflows?: boolean;       // pushed past day end
  meetingConflict?: string;  // summary of conflicting meeting
}

/**
 * Check if a time range overlaps any calendar event (+ buffer).
 * Returns the first conflicting event or null.
 */
export function findMeetingConflict(
  startMinutes: number,
  durationMinutes: number,
  calendarEvents: CalendarEvent[],
  meetingBufferMinutes: number,
): CalendarEvent | null {
  const endMinutes = startMinutes + durationMinutes;
  for (const event of calendarEvents) {
    if (event.allDay) continue;
    const eventStart = event.startMinutes;
    const eventEnd = event.endMinutes + meetingBufferMinutes;
    if (startMinutes < eventEnd && endMinutes > eventStart) {
      return event;
    }
  }
  return null;
}

/**
 * Schedule tasks into the day. Fixed-time tasks go at their set time.
 * Flexible tasks fill in around them, starting from current time if auto-advance
 * is on, or from dayStartHour otherwise.
 */
export function scheduleTasks(
  tasks: Task[],
  dayStartHour: number,
  dayEndHour: number,
  currentTime: Date,
  _autoAdvance: boolean,
  calendarEvents: CalendarEvent[] = [],
  meetingBufferMinutes: number = 0,
  isToday: boolean = true,
): ScheduledTask[] {
  const dayStartMinutes = dayStartHour * 60;
  const dayEndMinutes = dayEndHour * 60;

  // Separate fixed and flexible tasks (breaks are excluded from clock scheduling)
  const fixedTasks: ScheduledTask[] = [];
  const flexibleTasks: Task[] = [];

  for (const task of tasks) {
    // Flexible breaks get scheduled into gaps like regular tasks
    if (task.isBreak && !task.fixedStartTime) {
      flexibleTasks.push(task);
      continue;
    }
    if (task.fixedStartTime) {
      const [h, m] = task.fixedStartTime.split(':').map(Number);
      const start = h * 60 + m;
      // Breaks during a meeting buffer are intentional — don't flag as conflict
      const conflict = task.isBreak ? null : findMeetingConflict(start, task.durationMinutes, calendarEvents, meetingBufferMinutes);
      fixedTasks.push({
        ...task,
        scheduledStart: start,
        scheduledEnd: start + task.durationMinutes,
        meetingConflict: conflict ? conflict.summary : undefined,
      });
    } else {
      flexibleTasks.push(task);
    }
  }

  // Sort fixed tasks by start time
  fixedTasks.sort((a, b) => a.scheduledStart - b.scheduledStart);

  // Determine where flexible tasks start
  // On today, never schedule before the current time
  let cursor: number;
  if (isToday) {
    const now = currentTime.getHours() * 60 + currentTime.getMinutes();
    cursor = Math.max(now, dayStartMinutes);
  } else {
    cursor = dayStartMinutes;
  }

  // Build occupied intervals from fixed tasks
  const occupied = fixedTasks.map(t => ({
    start: t.scheduledStart,
    end: t.scheduledEnd,
  }));

  // Add calendar events as occupied intervals (with buffer)
  for (const event of calendarEvents) {
    if (event.allDay) continue;
    occupied.push({
      start: event.startMinutes,
      end: event.endMinutes + meetingBufferMinutes,
    });
  }
  occupied.sort((a, b) => a.start - b.start);

  // Schedule flexible tasks into gaps
  const scheduledFlexible: ScheduledTask[] = [];

  // Sort flexible tasks by sortOrder, then filter out completed (they stay in list but not on clock)
  const sortedFlex = [...flexibleTasks]
    .filter(t => !t.completed)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const task of sortedFlex) {
    // Find next available slot (restart check after each push to handle cascading overlaps)
    let slotStart = cursor;
    let conflict = true;
    while (conflict) {
      conflict = false;
      for (const occ of occupied) {
        if (slotStart < occ.end && slotStart + task.durationMinutes > occ.start) {
          slotStart = occ.end;
          conflict = true;
          break;
        }
      }
    }

    // If task overflows past day end, mark it rather than clamping backwards
    const overflows = slotStart + task.durationMinutes > dayEndMinutes;

    const scheduled: ScheduledTask = {
      ...task,
      scheduledStart: slotStart,
      scheduledEnd: slotStart + task.durationMinutes,
      overflows: overflows || undefined,
    };

    scheduledFlexible.push(scheduled);
    occupied.push({ start: slotStart, end: slotStart + task.durationMinutes });
    occupied.sort((a, b) => a.start - b.start);

    cursor = slotStart + task.durationMinutes;
  }

  return [...fixedTasks, ...scheduledFlexible].sort(
    (a, b) => a.scheduledStart - b.scheduledStart
  );
}

/**
 * Try to find a task ordering that eliminates overflow using a largest-first heuristic.
 * Returns an array of task IDs in the suggested order, or null if:
 * - there is no current overflow
 * - fewer than 2 flexible tasks exist
 * - the largest-first ordering still overflows
 */
export function findNonOverflowOrdering(
  tasks: Task[],
  dayStartHour: number,
  dayEndHour: number,
  currentTime: Date,
  autoAdvance: boolean,
  calendarEvents: CalendarEvent[] = [],
  meetingBufferMinutes: number = 0,
  isToday: boolean = true,
): string[] | null {
  // Check if current ordering already overflows
  const current = scheduleTasks(tasks, dayStartHour, dayEndHour, currentTime, autoAdvance, calendarEvents, meetingBufferMinutes, isToday);
  const hasOverflow = current.some(t => t.overflows);
  if (!hasOverflow) return null;

  // Get flexible incomplete tasks (no fixed time, not completed)
  const flexibleTasks = tasks.filter(t => !t.fixedStartTime && !t.completed);
  if (flexibleTasks.length < 2) return null;

  // Sort flexible tasks largest-first
  const sortedBySize = [...flexibleTasks].sort((a, b) => b.durationMinutes - a.durationMinutes);

  // Build reordered task array preserving fixed tasks in place
  const fixedTasks = tasks.filter(t => t.fixedStartTime || t.completed);
  const reordered: Task[] = [
    ...fixedTasks,
    ...sortedBySize.map((t, i) => ({ ...t, sortOrder: i })),
  ];

  // Check if largest-first ordering eliminates overflow
  const trial = scheduleTasks(reordered, dayStartHour, dayEndHour, currentTime, autoAdvance, calendarEvents, meetingBufferMinutes, isToday);
  if (trial.some(t => t.overflows)) return null;

  // Return the new order as task IDs (fixed tasks keep their existing sortOrder influence)
  return sortedBySize.map(t => t.id);
}

/**
 * Convert minutes from midnight to HH:MM string
 */
export function minutesToTime(minutes: number, use24Hour: boolean): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  if (use24Hour) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, '0')}${period}`;
}

/**
 * Get today's date as YYYY-MM-DD
 */
export function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/**
 * Get yesterday's date as YYYY-MM-DD
 */
export function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/**
 * Get tomorrow's date as YYYY-MM-DD
 */
export function tomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/**
 * Format a date for display
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
