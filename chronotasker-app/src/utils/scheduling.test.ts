import { describe, it, expect } from 'vitest';
import {
  minutesToTime,
  findMeetingConflict,
  scheduleTasks,
  findNonOverflowOrdering,
  todayString,
  yesterdayString,
  tomorrowString,
} from './scheduling';
import type { Task, CalendarEvent } from '../types';

// --- helpers ---

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: 'Task',
    durationMinutes: 30,
    completed: false,
    important: false,
    isBreak: false,
    sortOrder: 0,
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CalendarEvent> & { uid: string }): CalendarEvent {
  return {
    summary: 'Meeting',
    startMinutes: 600,
    endMinutes: 660,
    allDay: false,
    ...overrides,
  };
}

const NOW = new Date('2026-01-01T09:00:00'); // 9:00am
const DAY_START = 8;
const DAY_END = 18;

// ---

describe('minutesToTime', () => {
  it('formats 24-hour time', () => {
    expect(minutesToTime(0, true)).toBe('00:00');
    expect(minutesToTime(60, true)).toBe('01:00');
    expect(minutesToTime(540, true)).toBe('09:00');
    expect(minutesToTime(780, true)).toBe('13:00');
    expect(minutesToTime(1439, true)).toBe('23:59');
  });

  it('formats 12-hour time without minutes when on the hour', () => {
    expect(minutesToTime(0, false)).toBe('12am');
    expect(minutesToTime(60, false)).toBe('1am');
    expect(minutesToTime(720, false)).toBe('12pm');
    expect(minutesToTime(780, false)).toBe('1pm');
  });

  it('formats 12-hour time with minutes', () => {
    expect(minutesToTime(545, false)).toBe('9:05am');
    expect(minutesToTime(750, false)).toBe('12:30pm');
  });

  it('formats 11pm and 11:59pm correctly in 12-hour mode', () => {
    expect(minutesToTime(1380, false)).toBe('11pm');
    expect(minutesToTime(1439, false)).toBe('11:59pm');
  });
});

// ---

describe('todayString / yesterdayString / tomorrowString', () => {
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  it('todayString returns YYYY-MM-DD', () => {
    expect(todayString()).toMatch(ISO_DATE);
  });

  it('yesterdayString returns YYYY-MM-DD', () => {
    expect(yesterdayString()).toMatch(ISO_DATE);
  });

  it('tomorrowString returns YYYY-MM-DD', () => {
    expect(tomorrowString()).toMatch(ISO_DATE);
  });

  it('yesterday < today < tomorrow', () => {
    expect(yesterdayString() < todayString()).toBe(true);
    expect(todayString() < tomorrowString()).toBe(true);
  });
});

// ---

describe('findMeetingConflict', () => {
  const event = makeEvent({ uid: 'e1', startMinutes: 600, endMinutes: 660 }); // 10:00–11:00

  it('returns null when no overlap', () => {
    expect(findMeetingConflict(660, 30, [event], 0)).toBeNull();
  });

  it('detects overlap at start', () => {
    expect(findMeetingConflict(590, 30, [event], 0)).toBe(event);
  });

  it('detects overlap contained within event', () => {
    expect(findMeetingConflict(610, 30, [event], 0)).toBe(event);
  });

  it('respects meeting buffer', () => {
    // Task starts right after event ends (660) — with 15min buffer the occupied zone is 600–675
    expect(findMeetingConflict(660, 30, [event], 15)).toBe(event);
    // Task starts after buffer
    expect(findMeetingConflict(675, 30, [event], 15)).toBeNull();
  });

  it('skips all-day events', () => {
    const allDay = makeEvent({ uid: 'e2', allDay: true, startMinutes: 0, endMinutes: 1440 });
    expect(findMeetingConflict(600, 30, [allDay], 0)).toBeNull();
  });
});

// ---

describe('scheduleTasks', () => {
  it('places a fixed task at its set time', () => {
    const task = makeTask({ id: 't1', fixedStartTime: '10:00', durationMinutes: 60 });
    const [result] = scheduleTasks([task], DAY_START, DAY_END, NOW, true, [], 0, false);
    expect(result.scheduledStart).toBe(600);
    expect(result.scheduledEnd).toBe(660);
  });

  it('schedules flexible tasks from day start on non-today', () => {
    const t1 = makeTask({ id: 't1', durationMinutes: 60, sortOrder: 0 });
    const t2 = makeTask({ id: 't2', durationMinutes: 30, sortOrder: 1 });
    const results = scheduleTasks([t1, t2], DAY_START, DAY_END, NOW, true, [], 0, false);
    expect(results[0].scheduledStart).toBe(480); // 8:00
    expect(results[1].scheduledStart).toBe(540); // 9:00
  });

  it('schedules flexible tasks from current time on today', () => {
    const task = makeTask({ id: 't1', durationMinutes: 30 });
    const [result] = scheduleTasks([task], DAY_START, DAY_END, NOW, true, [], 0, true);
    expect(result.scheduledStart).toBe(540); // NOW = 9:00 = 540min
  });

  it('skips over fixed tasks', () => {
    const fixed = makeTask({ id: 'fixed', fixedStartTime: '08:00', durationMinutes: 60 });
    const flex = makeTask({ id: 'flex', durationMinutes: 30 });
    const results = scheduleTasks([fixed, flex], DAY_START, DAY_END, NOW, true, [], 0, false);
    const flexResult = results.find(r => r.id === 'flex')!;
    expect(flexResult.scheduledStart).toBeGreaterThanOrEqual(540); // after fixed + current time
  });

  it('skips over calendar events', () => {
    const event = makeEvent({ uid: 'e1', startMinutes: 480, endMinutes: 540 }); // 8:00–9:00
    const task = makeTask({ id: 't1', durationMinutes: 30 });
    const [result] = scheduleTasks([task], DAY_START, DAY_END, NOW, true, [event], 0, false);
    expect(result.scheduledStart).toBeGreaterThanOrEqual(540);
  });

  it('marks tasks that overflow past day end', () => {
    const task = makeTask({ id: 't1', durationMinutes: 120 });
    // Use a very late NOW so cursor is near end of day
    const lateNow = new Date('2026-01-01T17:30:00');
    const [result] = scheduleTasks([task], DAY_START, DAY_END, lateNow, true, [], 0, true);
    expect(result.overflows).toBe(true);
  });

  it('does not schedule completed tasks as flexible', () => {
    const done = makeTask({ id: 'done', durationMinutes: 60, completed: true });
    const results = scheduleTasks([done], DAY_START, DAY_END, NOW, true, [], 0, false);
    // Completed flexible tasks are excluded from the clock
    expect(results.length).toBe(0);
  });

  it('respects sortOrder for flexible tasks', () => {
    const t1 = makeTask({ id: 't1', durationMinutes: 60, sortOrder: 1 });
    const t2 = makeTask({ id: 't2', durationMinutes: 30, sortOrder: 0 });
    const results = scheduleTasks([t1, t2], DAY_START, DAY_END, NOW, true, [], 0, false);
    expect(results[0].id).toBe('t2');
    expect(results[1].id).toBe('t1');
  });

  it('clamps cursor to dayStart when current time is before the day starts', () => {
    const earlyNow = new Date('2026-01-01T06:00:00'); // 6am, before dayStart=8
    const task = makeTask({ id: 't1', durationMinutes: 30 });
    const [result] = scheduleTasks([task], DAY_START, DAY_END, earlyNow, true, [], 0, true);
    expect(result.scheduledStart).toBe(480); // should start at 8:00, not 6:00
  });

  it('flags a meeting conflict on a fixed task that overlaps a calendar event', () => {
    const event = makeEvent({ uid: 'e1', startMinutes: 600, endMinutes: 660, summary: 'Standup' });
    // Fixed task placed right in the middle of the event
    const task = makeTask({ id: 't1', fixedStartTime: '10:15', durationMinutes: 30 });
    const [result] = scheduleTasks([task], DAY_START, DAY_END, NOW, true, [event], 0, false);
    expect(result.meetingConflict).toBe('Standup');
  });

  it('does not flag a meeting conflict on a fixed break', () => {
    const event = makeEvent({ uid: 'e1', startMinutes: 600, endMinutes: 660 });
    const breakTask = makeTask({ id: 'b1', fixedStartTime: '10:15', durationMinutes: 15, isBreak: true });
    const [result] = scheduleTasks([breakTask], DAY_START, DAY_END, NOW, true, [event], 0, false);
    expect(result.meetingConflict).toBeUndefined();
  });

  it('schedules flexible break tasks like regular flexible tasks', () => {
    const breakTask = makeTask({ id: 'b1', durationMinutes: 15, isBreak: true, sortOrder: 0 });
    const [result] = scheduleTasks([breakTask], DAY_START, DAY_END, NOW, true, [], 0, false);
    // Flexible break should be scheduled (not excluded)
    expect(result.scheduledStart).toBeDefined();
  });

  it('applies meeting buffer when scheduling around calendar events', () => {
    // Event at 10:00–11:00 (600–660), buffer=15min → occupied zone is 600–675
    // With NOW=10:00 (600min), cursor starts at the event, task gets pushed past the buffer
    const event = makeEvent({ uid: 'e1', startMinutes: 600, endMinutes: 660 });
    const task = makeTask({ id: 't1', durationMinutes: 30 });
    const atEvent = new Date('2026-01-01T10:00:00');
    const [result] = scheduleTasks([task], DAY_START, DAY_END, atEvent, true, [event], 15, true);
    expect(result.scheduledStart).toBeGreaterThanOrEqual(675); // after event + 15min buffer
  });

  it('schedules tasks into the gap between two calendar events', () => {
    // Event 1: 8:00–9:00 (480–540), Event 2: 10:00–11:00 (600–660)
    // Gap: 9:00–10:00 = 60min
    const e1 = makeEvent({ uid: 'e1', startMinutes: 480, endMinutes: 540 });
    const e2 = makeEvent({ uid: 'e2', startMinutes: 600, endMinutes: 660 });
    const task = makeTask({ id: 't1', durationMinutes: 30 });
    const [result] = scheduleTasks([task], DAY_START, DAY_END, NOW, true, [e1, e2], 0, false);
    // With isToday=true and NOW=9:00 (540), cursor=540 which is the start of the gap
    expect(result.scheduledStart).toBe(540);
    expect(result.scheduledEnd).toBe(570);
  });
});

// ---

describe('findNonOverflowOrdering', () => {
  it('returns null when there is no overflow', () => {
    const task = makeTask({ id: 't1', durationMinutes: 30 });
    const result = findNonOverflowOrdering([task], DAY_START, DAY_END, NOW, true, [], 0, false);
    expect(result).toBeNull();
  });

  it('returns null with fewer than 2 flexible tasks', () => {
    const lateNow = new Date('2026-01-01T17:45:00');
    const task = makeTask({ id: 't1', durationMinutes: 120 });
    const result = findNonOverflowOrdering([task], DAY_START, DAY_END, lateNow, true, [], 0, true);
    expect(result).toBeNull();
  });

  it('suggests a reordering when largest-first eliminates overflow', () => {
    // Two tasks: small one first causes the large one to overflow; large-first fits both
    const lateNow = new Date('2026-01-01T17:00:00'); // 17:00, 60min left in day
    const small = makeTask({ id: 'small', durationMinutes: 30, sortOrder: 0 });
    const large = makeTask({ id: 'large', durationMinutes: 90, sortOrder: 1 });
    // small (30min) at 17:00–17:30, large (90min) at 17:30–19:00 → overflow
    // large-first: large at 17:00–18:30 → overflow too (90min past 18:00)
    // This case won't eliminate overflow — returns null
    const result = findNonOverflowOrdering([small, large], DAY_START, DAY_END, lateNow, true, [], 0, true);
    // Both orderings overflow (90min won't fit in 60min window), so null
    expect(result).toBeNull();
  });

  it('returns null when both orderings still overflow', () => {
    // 90min task can't fit in 60min window regardless of order
    const lateNow = new Date('2026-01-01T17:00:00');
    const small = makeTask({ id: 'small', durationMinutes: 30, sortOrder: 0 });
    const large = makeTask({ id: 'large', durationMinutes: 90, sortOrder: 1 });
    const result = findNonOverflowOrdering([small, large], DAY_START, DAY_END, lateNow, true, [], 0, true);
    expect(result).toBeNull();
  });

  it('returns reordered IDs when largest-first eliminates overflow', () => {
    // Scenario: big meeting blocks 10:00–17:00
    // Pre-meeting gap: 8:00–10:00 = 120min
    // Post-meeting gap: 17:00–18:00 = 60min
    //
    // Current order — small(40min) then large(110min):
    //   small fills 480–520, large tries 520 → blocked by meeting at 600,
    //   pushed to 1020 (17:00) → 1020+110=1130 > 1080 → OVERFLOW
    //
    // Largest-first — large(110min) then small(40min):
    //   large at 480–590 (fits in pre-meeting gap, doesn't reach 600) → ok
    //   small tries 590 → blocked by meeting at 600, pushed to 1020 → 1020+40=1060 → ok
    const bigMeeting = makeEvent({ uid: 'mtg', startMinutes: 600, endMinutes: 1020 });
    const small = makeTask({ id: 'small', durationMinutes: 40, sortOrder: 0 });
    const large = makeTask({ id: 'large', durationMinutes: 110, sortOrder: 1 });
    const result = findNonOverflowOrdering(
      [small, large], DAY_START, DAY_END,
      NOW, true, [bigMeeting], 0, false,
    );
    expect(result).not.toBeNull();
    // Should suggest large first, small second
    expect(result![0]).toBe('large');
    expect(result![1]).toBe('small');
  });
});
