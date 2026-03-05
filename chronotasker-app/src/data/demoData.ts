import type { Task, CalendarEvent, AppSettings } from '../types';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDemoTasks(): Task[] {
  const date = todayString();
  const now = new Date().toISOString();

  return [
    {
      id: 'demo-1',
      title: 'Morning review',
      durationMinutes: 15,
      completed: true,
      important: false,
      isBreak: false,
      tag: 'admin',
      sortOrder: 0,
      date,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-2',
      title: 'Write project proposal',
      durationMinutes: 50,
      fixedStartTime: '09:30',
      completed: false,
      important: true,
      isBreak: false,
      tag: 'deep work',
      details: '- Outline key objectives\n- Draft budget section\n- Review [brief](https://example.com)',
      sortOrder: 1,
      date,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-3',
      title: 'Team standup',
      durationMinutes: 15,
      fixedStartTime: '10:30',
      completed: false,
      important: false,
      isBreak: false,
      sortOrder: 2,
      date,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-4',
      title: 'Design new landing page',
      durationMinutes: 25,
      completed: false,
      important: false,
      isBreak: false,
      tag: 'design',
      recurrencePattern: 'weekdays',
      sortOrder: 3,
      date,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-5',
      title: 'Email follow-ups',
      durationMinutes: 15,
      completed: false,
      important: false,
      isBreak: false,
      tag: 'admin',
      sortOrder: 4,
      date,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-6',
      title: 'Lunch break',
      durationMinutes: 45,
      completed: false,
      important: false,
      isBreak: true,
      sortOrder: 5,
      date,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-7',
      title: 'Code review',
      durationMinutes: 25,
      completed: false,
      important: false,
      isBreak: false,
      tag: 'dev',
      sortOrder: 6,
      date,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-8',
      title: 'Plan tomorrow',
      durationMinutes: 15,
      completed: false,
      important: false,
      isBreak: false,
      sortOrder: 7,
      date,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function getDemoBacklogTasks(): Task[] {
  const now = new Date().toISOString();

  return [
    {
      id: 'demo-backlog-1',
      title: 'Research analytics tools',
      durationMinutes: 45,
      completed: false,
      important: false,
      isBreak: false,
      tag: 'research',
      sortOrder: 0,
      date: 'backlog',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-backlog-2',
      title: 'Update documentation',
      durationMinutes: 30,
      completed: false,
      important: false,
      isBreak: false,
      tag: 'admin',
      sortOrder: 1,
      date: 'backlog',
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function getDemoCalendarEvents(): CalendarEvent[] {
  return [
    {
      uid: 'demo-cal-1',
      summary: 'Product sync',
      startMinutes: 11 * 60,       // 11:00
      endMinutes: 11 * 60 + 30,    // 11:30
      allDay: false,
    },
    {
      uid: 'demo-cal-2',
      summary: '1:1 with Alex',
      startMinutes: 14 * 60,       // 14:00
      endMinutes: 14 * 60 + 30,    // 14:30
      allDay: false,
    },
  ];
}

export function getDemoSettings(): AppSettings {
  return {
    workDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    pomodorosBeforeLongBreak: 4,
    dayStartHour: 8,
    dayEndHour: 18,
    use24Hour: true,
    autoAdvance: true,
    theme: 'system',
    colorScheme: 'nord',
    meetingBufferMinutes: 15,
    enableRecurringTasks: true,
    enableBacklog: true,
    showPomodoroTimer: true,
    showDaySummary: false,
    clockPosition: 'left',
    advancedMode: true,
  };
}
