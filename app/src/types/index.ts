export interface Task {
  id: string;
  title: string;
  durationMinutes: number;
  fixedStartTime?: string; // HH:MM format, optional
  completed: boolean;
  important: boolean;
  isBreak: boolean;
  tag?: string;
  details?: string;
  recurrencePattern?: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  recurrenceSourceId?: string;
  sortOrder: number;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface PomodoroSession {
  id: string;
  taskId: string | null;
  type: 'work' | 'shortBreak' | 'longBreak';
  durationMinutes: number;
  startedAt: string;
  completedAt?: string;
  date: string;
}

export interface PomodoroState {
  isRunning: boolean;
  type: 'work' | 'shortBreak' | 'longBreak';
  timeRemainingSeconds: number;
  completedPomodoros: number; // resets after long break
  currentTaskId: string | null;
}

export interface DayPlan {
  date: string;
  dayStartTime: string; // HH:MM
  tasks: Task[];
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  startMinutes: number; // minutes from midnight
  endMinutes: number;   // minutes from midnight
  allDay: boolean;
}

export interface AppSettings {
  workDuration: number; // minutes, default 25
  shortBreakDuration: number; // default 5
  longBreakDuration: number; // default 15
  pomodorosBeforeLongBreak: number; // default 4
  dayStartHour: number; // default 8
  dayEndHour: number; // default 18
  use24Hour: boolean;
  autoAdvance: boolean;
  theme: 'light' | 'dark' | 'system';
  colorScheme: 'nord' | 'aurora' | 'frost' | 'evergreen' | 'berry';
  icalUrl?: string;
  icalUrls: string[];
  meetingBufferMinutes: number; // gap after calendar events, default 15
  enableRecurringTasks: boolean;
  enableBacklog: boolean;
  showPomodoroTimer: boolean;
  showDaySummary: boolean;
  clockPosition: 'left' | 'right';
  advancedMode: boolean;
  enableSounds: boolean;
  flashWhenTimeUp: boolean;
  workingDays: number[]; // ISO weekday numbers: 1=Mon … 7=Sun. Empty = all days.
  weekStartDay: 1 | 7;  // 1=Monday (default), 7=Sunday
}

export const DEFAULT_SETTINGS: AppSettings = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  pomodorosBeforeLongBreak: 4,
  dayStartHour: 8,
  dayEndHour: 18,
  use24Hour: true,
  autoAdvance: true,
  theme: 'system',
  colorScheme: 'berry',
  icalUrls: [],
  meetingBufferMinutes: 15,
  enableRecurringTasks: false,
  enableBacklog: false,
  showPomodoroTimer: false,
  showDaySummary: false,
  clockPosition: 'left',
  advancedMode: false,
  enableSounds: false,
  flashWhenTimeUp: true,
  workingDays: [1, 2, 3, 4, 5], // Mon–Fri by default
  weekStartDay: 1,
};
