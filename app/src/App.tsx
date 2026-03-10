import { useState, useCallback, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import type { Task, AppSettings, PomodoroState, CalendarEvent } from './types';
import { DEFAULT_SETTINGS } from './types';
import ClockFace from './components/ClockFace';
import PomodoroTimer from './components/PomodoroTimer';
import TaskList from './components/TaskList';
import TaskForm from './components/TaskForm';
import BreakForm from './components/BreakForm';
import BacklogList from './components/BacklogList';
import { usePomodoro } from './hooks/usePomodoro';
import { useSync } from './hooks/useSync';
import { scheduleTasks, findNonOverflowOrdering, type ScheduledTask } from './utils/scheduling';
import { formatDuration, tagColor, tagBgColor, buildTagHueMap, tagColorFromHue, tagBgColorFromHue } from './utils/format';
import { todayString, tomorrowString, getWeekMonday, weekDayDate, shiftDate } from './utils/scheduling';
import { fetchCalendar, fetchTasks as apiFetchTasks, logInstallEvent } from './services/api';
import * as storage from './services/storage';
import { parseIcalEvents } from './utils/ical';
import { playTick } from './utils/audio';
const HelpModal = lazy(() => import('./components/HelpModal'));
const RecurringDeleteModal = lazy(() => import('./components/RecurringDeleteModal'));
const UnfinishedTasksModal = lazy(() => import('./components/UnfinishedTasksModal'));
import { useUnfinishedTasks } from './hooks/useUnfinishedTasks';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useUndoRedo } from './hooks/useUndoRedo';
import { useTaskNotifications } from './hooks/useTaskNotifications';
import { getDemoTasks, getDemoBacklogTasks, getDemoCalendarEvents, getDemoSettings } from './data/demoData';
import { isAdmin } from './services/auth';
import type { AuthUser } from './services/auth';
import { exportData, importData, deleteAccount } from './services/api';
import { SettingsPanel } from './components/SettingsPanel';
import './App.css';

interface AppProps {
  user: AuthUser;
  onLogout: () => void;
}

function App({ user, onLogout }: AppProps) {
  const [date, setDate] = useState(todayString());
  const [isFirstVisit, setIsFirstVisit] = useState(() => {
    // Migrate legacy key so existing users don't see the first-visit experience again
    if (localStorage.getItem('chronotasker-visited')) {
      localStorage.setItem('td-visited', '1');
      localStorage.removeItem('chronotasker-visited');
    }
    return !localStorage.getItem('td-visited');
  });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [, setSessions] = useState<import('./types').PomodoroSession[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeCalendarUid, setActiveCalendarUid] = useState<string | null>(null);
  // Clear task/calendar selection when navigating to a different day
  const [prevDate, setPrevDate] = useState(date);
  if (prevDate !== date) {
    setPrevDate(date);
    setActiveTaskId(null);
    setActiveCalendarUid(null);
  }
  const calendarListRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!activeCalendarUid || !calendarListRef.current) return;
    const el = calendarListRef.current.querySelector(`[data-event-uid="${activeCalendarUid}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeCalendarUid]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [showTaskList, setShowTaskList] = useState(true);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [clockColorMap, setClockColorMap] = useState<Map<string, string>>(new Map());
  const [backlogTasks, setBacklogTasks] = useState<Task[]>([]);
  const [showBacklog, setShowBacklog] = useState(false);
  const [recurringDeleteTask, setRecurringDeleteTask] = useState<Task | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  // Theme (light / system / dark)
  const [tdTheme, setTdTheme] = useState<'light' | 'system' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('td-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    return 'system';
  });

  useEffect(() => {
    function applyTheme(pref: 'light' | 'system' | 'dark') {
      if (pref === 'system') {
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', pref);
      }
    }
    applyTheme(tdTheme);

    if (tdTheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [tdTheme]);

  function handleThemeChange(next: 'light' | 'system' | 'dark') {
    setTdTheme(next);
    try {
      if (next === 'system') localStorage.removeItem('td-theme');
      else localStorage.setItem('td-theme', next);
    } catch { /* ignore */ }
  }

  // Data & account section
  const [dataActionStatus, setDataActionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [importWorking, setImportWorking] = useState(false);
  const [exportWorking, setExportWorking] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteWorking, setDeleteWorking] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const stashedState = useRef<{
    tasks: Task[];
    settings: AppSettings;
    backlogTasks: Task[];
    calendarEvents: CalendarEvent[];
    icsCache: (string | null)[];
    date: string;
    editingTask: Task | undefined;
    activeTaskId: string | null;
  } | null>(null);

  // Clock column panel order (calendar + day summary), persisted to localStorage
  const [clockPanelOrder, setClockPanelOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ct-clock-panel-order') || 'null') ?? ['calendar', 'summary']; }
    catch { return ['calendar', 'summary']; }
  });
  const clockDraggingPanelRef = useRef<string | null>(null);
  const [clockDraggingPanel, setClockDraggingPanel] = useState<string | null>(null);
  const [clockDragOverPanel, setClockDragOverPanel] = useState<string | null>(null);

  // Panel drag-to-reorder (advanced mode only, order persisted to localStorage)
  const [panelOrder, setPanelOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('ct-panel-order') || 'null') ?? ['timer', 'form', 'tasks', 'backlog']; }
    catch { return ['timer', 'form', 'tasks', 'backlog']; }
  });
  const draggingPanelRef = useRef<string | null>(null);
  const [draggingPanel, setDraggingPanel] = useState<string | null>(null);
  const [dragOverPanel, setDragOverPanel] = useState<string | null>(null);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Undo/redo
  const { push: pushUndo, handleUndo, handleRedo, canUndo, canRedo, undoLabel } = useUndoRedo();

  // Pomodoro
  const pomodoro = usePomodoro(settings);

  // Stable callback — prevents sync interval restarting on every App render
  const handleSettingsUpdated = useCallback((s: AppSettings) => {
    // Migrate removed 'yellow' scheme to 'berry'
    setSettings((s as any).colorScheme === 'yellow' ? { ...s, colorScheme: 'berry' } : s);
  }, []);

  // Sync
  const { isOnline, isSyncing, pushTask, pushRecurringDelete, pushSession, pushSettings } = useSync({
    date,
    onTasksUpdated: setTasks,
    onSessionsUpdated: setSessions,
    onSettingsUpdated: handleSettingsUpdated,
    onAuthRequired: onLogout,
    enableRecurringTasks: settings.enableRecurringTasks,
    paused: demoMode,
  });

  // Only show "syncing..." if a sync takes longer than 1.5s — avoids flash on routine background polls
  const [showSyncing, setShowSyncing] = useState(false);
  useEffect(() => {
    if (!isSyncing) { setShowSyncing(false); return; }
    const t = setTimeout(() => setShowSyncing(true), 1500);
    return () => clearTimeout(t);
  }, [isSyncing]);

  // Unfinished tasks from yesterday
  const { unfinishedTasks, setUnfinishedTasks, showPrompt, dismissPrompt } =
    useUnfinishedTasks({ currentDate: date, enabled: !demoMode });

  const installPromptOptions = useMemo(() => ({
    onEvent: (event: 'impression' | 'install' | 'dismiss') => logInstallEvent(event),
  }), []);
  const { showBanner: showInstallBanner, isIOS, install: installApp, dismiss: dismissInstall } =
    useInstallPrompt(!demoMode, installPromptOptions);

  // Debounced settings push to avoid API spam on every keystroke
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedPushSettings = useCallback((s: Partial<AppSettings>) => {
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(() => pushSettings(s), 500);
  }, [pushSettings]);

  // Single callback for SettingsPanel: updates local state + queues API push
  const handleSettingChange = useCallback((s: AppSettings) => {
    setSettings(s);
    debouncedPushSettings(s);
  }, [debouncedPushSettings]);

  // Auto-expand timer when running
  useEffect(() => {
    if (pomodoro.state.isRunning) setShowTimer(true);
  }, [pomodoro.state.isRunning]);

  // Auto-expand form when editing a task
  useEffect(() => {
    if (editingTask) setShowForm(true);
  }, [editingTask]);

  // Calendar events from iCal feeds (up to 3)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const initIcalUrls = (): string[] => {
    const stored = settings.icalUrls?.length ? settings.icalUrls : (settings.icalUrl ? [settings.icalUrl] : []);
    return stored.length ? stored : [''];
  };
  const [icalUrlInputs, setIcalUrlInputs] = useState<string[]>(initIcalUrls);
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalErrors, setIcalErrors] = useState<(string | null)[]>([null]);
  const initCommitted = (): string[] => settings.icalUrls?.length ? settings.icalUrls : (settings.icalUrl ? [settings.icalUrl] : []);
  const [committedIcalUrls, setCommittedIcalUrls] = useState<string[]>(initCommitted);
  const icsCache = useRef<(string | null)[]>([]);

  // Keep inputs in sync when settings load from server
  useEffect(() => {
    const urls = settings.icalUrls?.length ? settings.icalUrls : (settings.icalUrl ? [settings.icalUrl] : []);
    if (urls.length && !committedIcalUrls.length) {
      setIcalUrlInputs([...urls]);
      setCommittedIcalUrls(urls);
    }
  }, [settings.icalUrls, settings.icalUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const mergeCalendarEvents = (events: CalendarEvent[]): CalendarEvent[] => {
    const seen = new Set<string>();
    return events.filter(e => { if (seen.has(e.uid)) return false; seen.add(e.uid); return true; });
  };

  const loadCalendars = useCallback(async (urls: string[]) => {
    const nonEmpty = urls.filter(u => u.trim());
    if (!nonEmpty.length) {
      setCalendarEvents([]);
      icsCache.current = urls.map(() => null);
      setIcalErrors(urls.map(() => null));
      return;
    }
    setIcalLoading(true);
    const errors: (string | null)[] = urls.map(() => null);
    const caches: (string | null)[] = urls.map(() => null);
    await Promise.all(urls.map(async (url, i) => {
      if (!url.trim()) return;
      try {
        caches[i] = await fetchCalendar(url);
      } catch (err: unknown) {
        errors[i] = err instanceof Error ? err.message : 'Failed to load calendar';
      }
    }));
    icsCache.current = caches;
    setIcalErrors(errors);
    const allEvents = mergeCalendarEvents(
      caches.flatMap((c, i) => (c && !errors[i] ? parseIcalEvents(c, date) : []))
    );
    setCalendarEvents(allEvents);
    setIcalLoading(false);
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch when committed URLs change
  useEffect(() => {
    if (demoMode) return;
    if (!committedIcalUrls.length) {
      setCalendarEvents([]);
      icsCache.current = [];
      return;
    }
    loadCalendars(committedIcalUrls);
    // Refresh every 5 minutes
    const interval = setInterval(() => loadCalendars(committedIcalUrls), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [committedIcalUrls, loadCalendars, demoMode]);

  // Reload demo data when navigating days in demo mode
  useEffect(() => {
    if (!demoMode) return;
    setTasks(getDemoTasks(date));
    setCalendarEvents(getDemoCalendarEvents(date));
  }, [date, demoMode]);

  // Keyboard shortcut: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.key === 'z' && e.shiftKey)  { e.preventDefault(); handleRedo(); }
      if (e.key === 'y')                 { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  // Re-parse cached iCal data when date changes
  useEffect(() => {
    if (demoMode) return;
    const valid = icsCache.current.filter(Boolean) as string[];
    if (valid.length) {
      const seen = new Set<string>();
      const allEvents: CalendarEvent[] = [];
      valid.forEach(c => parseIcalEvents(c, date).forEach(e => {
        if (!seen.has(e.uid)) { seen.add(e.uid); allEvents.push(e); }
      }));
      setCalendarEvents(allEvents);
    }
  }, [date, demoMode]);

  const handleLoadCalendar = useCallback(() => {
    const urls = icalUrlInputs.map(u => u.trim()).filter(Boolean);
    const s = { ...settings, icalUrls: urls, icalUrl: urls[0] };
    setSettings(s);
    pushSettings(s);
    setCommittedIcalUrls(urls);
  }, [icalUrlInputs, settings, pushSettings]);

  // Fetch backlog tasks when feature is enabled
  useEffect(() => {
    if (demoMode) return;
    if (!settings.enableBacklog) return;
    const fetchBacklog = async () => {
      try {
        const data = await apiFetchTasks('backlog');
        setBacklogTasks(data);
      } catch {
        // Offline or error — ignore
      }
    };
    fetchBacklog();
  }, [settings.enableBacklog, isSyncing, demoMode]); // re-fetch after sync completes

  // Schedule tasks for the clock — only recalculate when minute changes
  const isToday = date === todayString();
  const currentMinuteKey = useMemo(
    () => `${currentTime.getHours()}:${currentTime.getMinutes()}`,
    [currentTime]
  );
  // Date rounded to the current minute — passed to ClockFace so the SVG only re-renders
  // once per minute instead of every second.
  const currentMinuteTime = useMemo(() => {
    const d = new Date(currentTime);
    d.setSeconds(0, 0);
    return d;
  }, [currentMinuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const scheduledTasks = useMemo(
    () => scheduleTasks(tasks, settings.dayStartHour, settings.dayEndHour, currentTime, settings.autoAdvance, calendarEvents, settings.meetingBufferMinutes, isToday),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, settings.dayStartHour, settings.dayEndHour, currentMinuteKey, settings.autoAdvance, calendarEvents, settings.meetingBufferMinutes, isToday]
  );

  const daySummary = useMemo(() => {
    if (!settings.showDaySummary || !settings.advancedMode) return null;
    const nonAllDayEvents = calendarEvents.filter(e => !e.allDay);
    const eventMinutes = nonAllDayEvents.reduce((sum, e) => sum + (e.endMinutes - e.startMinutes), 0);
    const taskMinutes = tasks
      .filter(t => !t.isBreak)
      .reduce((sum, t) => sum + t.durationMinutes, 0);
    const explicitBreakMinutes = tasks
      .filter(t => Boolean(t.isBreak))
      .reduce((sum, t) => sum + t.durationMinutes, 0);
    // Count non-suppressed meeting buffer periods as breaks (they appear as dedicated
    // break arcs on the clock, distinct from event and task arcs)
    const sortedEvents = [...nonAllDayEvents].sort((a, b) => a.startMinutes - b.startMinutes);
    const bufferBreakMinutes = settings.meetingBufferMinutes > 0
      ? sortedEvents.reduce((sum, event, i) => {
          const bufferEnd = event.endMinutes + settings.meetingBufferMinutes;
          if ((sortedEvents[i + 1]?.startMinutes ?? Infinity) < bufferEnd) return sum;
          return sum + settings.meetingBufferMinutes;
        }, 0)
      : 0;
    const breakMinutes = explicitBreakMinutes + bufferBreakMinutes;
    const totalMinutes = eventMinutes + taskMinutes + breakMinutes;
    return { eventMinutes, taskMinutes, breakMinutes, totalMinutes };
  }, [settings.showDaySummary, settings.advancedMode, settings.meetingBufferMinutes, calendarEvents, tasks]);

  const allTasksDone = useMemo(
    () => tasks.length > 0 && tasks.filter(t => !t.isBreak).every(t => t.completed),
    [tasks],
  );

  // Reorg suggestion: detect if a largest-first ordering would eliminate overflow
  const flexibleTaskKey = useMemo(
    () => tasks.filter(t => !t.fixedStartTime && !t.completed).map(t => `${t.id}:${t.durationMinutes}`).join(','),
    [tasks]
  );
  const suggestedOrdering = useMemo(
    () => findNonOverflowOrdering(tasks, settings.dayStartHour, settings.dayEndHour, currentTime, settings.autoAdvance, calendarEvents, settings.meetingBufferMinutes, isToday),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, settings.dayStartHour, settings.dayEndHour, currentMinuteKey, settings.autoAdvance, calendarEvents, settings.meetingBufferMinutes, isToday]
  );
  const [reorgDismissed, setReorgDismissed] = useState(false);
  const prevFlexibleTaskKey = useRef(flexibleTaskKey);
  if (prevFlexibleTaskKey.current !== flexibleTaskKey) {
    prevFlexibleTaskKey.current = flexibleTaskKey;
    if (reorgDismissed) setReorgDismissed(false);
  }
  const showReorgBanner = !!suggestedOrdering && !reorgDismissed;

  // Merge scheduling metadata (overflows, meetingConflict) into full task list for TaskList
  const tasksWithScheduleInfo: ScheduledTask[] = useMemo(() => {
    const scheduleMap = new Map<string, ScheduledTask>();
    for (const st of scheduledTasks) {
      scheduleMap.set(st.id, st);
    }
    return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder).map(t => {
      const st = scheduleMap.get(t.id);
      return {
        ...t,
        scheduledStart: st?.scheduledStart ?? 0,
        scheduledEnd: st?.scheduledEnd ?? 0,
        overflows: st?.overflows,
        meetingConflict: st?.meetingConflict,
      };
    });
  }, [tasks, scheduledTasks]);

  // Unique tags for the current day's tasks (sorted alphabetically)
  const taskTags = useMemo(() =>
    [...new Set(tasksWithScheduleInfo.map(t => t.tag).filter((t): t is string => !!t))].sort(),
    [tasksWithScheduleInfo]
  );

  // All individual tags (after splitting comma-separated values) for colour assignment
  const allIndividualTags = useMemo(() =>
    [...new Set(tasksWithScheduleInfo
      .flatMap(t => t.tag ? t.tag.split(',').map(s => s.trim()).filter(Boolean) : [])
    )].sort(),
    [tasksWithScheduleInfo]
  );

  // Colour map ensuring no two visible tags share a similar hue
  const tagHueMap = useMemo(() => buildTagHueMap(allIndividualTags), [allIndividualTags]);

  // Filtered task list (apply tag filter if active)
  const filteredTasks = useMemo(() =>
    activeTagFilter ? tasksWithScheduleInfo.filter(t => t.tag === activeTagFilter) : tasksWithScheduleInfo,
    [tasksWithScheduleInfo, activeTagFilter]
  );

  // Task start notifications
  useTaskNotifications(scheduledTasks, currentTime, isToday, !demoMode);

  // Task handlers
  const handleAddTask = useCallback((taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => {
    const now = new Date().toISOString();
    const newTask: Task = {
      ...taskData,
      id: crypto.randomUUID(),
      sortOrder: tasks.length,
      createdAt: now,
      updatedAt: now,
    };
    setTasks(prev => [...prev, newTask]);
    pushTask('create', newTask);
    if (isFirstVisit) { localStorage.setItem('td-visited', '1'); setIsFirstVisit(false); }
    pushUndo({
      label: `Add "${newTask.title}"`,
      undo: () => { setTasks(prev => prev.filter(t => t.id !== newTask.id)); pushTask('delete', newTask); },
      redo: () => { setTasks(prev => [...prev, newTask]); pushTask('create', newTask); },
    });
  }, [tasks.length, pushTask, pushUndo]);

  const handleUpdateTask = useCallback((taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => {
    if (!editingTask) return;
    const prev_task = editingTask;
    const updated: Task = {
      ...editingTask,
      ...taskData,
      updatedAt: new Date().toISOString(),
    };
    if (editingTask.date === 'backlog') {
      const backlogUpdated = { ...updated, date: 'backlog' };
      setBacklogTasks(prev => prev.map(t => t.id === backlogUpdated.id ? backlogUpdated : t));
      pushTask('update', backlogUpdated);
    } else {
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      pushTask('update', updated);
      pushUndo({
        label: `Edit "${updated.title}"`,
        undo: () => { setTasks(prev => prev.map(t => t.id === prev_task.id ? prev_task : t)); pushTask('update', prev_task); },
        redo: () => { setTasks(prev => prev.map(t => t.id === updated.id ? updated : t)); pushTask('update', updated); },
      });
    }
    setEditingTask(undefined);
  }, [editingTask, pushTask, pushUndo]);

  const handleToggleComplete = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const toggled = { ...task, completed: !task.completed, updatedAt: new Date().toISOString() };
    if (toggled.completed && settings.enableSounds) playTick();
    setTasks(prev => prev.map(t => t.id === taskId ? toggled : t));
    pushTask('update', toggled);
    pushUndo({
      label: toggled.completed ? `Complete "${toggled.title}"` : `Uncomplete "${toggled.title}"`,
      undo: () => { setTasks(prev => prev.map(t => t.id === task.id ? task : t)); pushTask('update', task); },
      redo: () => { setTasks(prev => prev.map(t => t.id === toggled.id ? toggled : t)); pushTask('update', toggled); },
    });
  }, [tasks, pushTask, pushUndo, settings.enableSounds]);

  const handleToggleImportant = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const toggled = { ...task, important: !task.important, updatedAt: new Date().toISOString() };
    setTasks(prev => prev.map(t => t.id === taskId ? toggled : t));
    pushTask('update', toggled);
    pushUndo({
      label: toggled.important ? `Mark "${toggled.title}" important` : `Unmark "${toggled.title}" important`,
      undo: () => { setTasks(prev => prev.map(t => t.id === task.id ? task : t)); pushTask('update', task); },
      redo: () => { setTasks(prev => prev.map(t => t.id === toggled.id ? toggled : t)); pushTask('update', toggled); },
    });
  }, [tasks, pushTask, pushUndo]);

  const handleDeleteTask = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Recurring tasks open the modal instead of deleting immediately
    if (task.recurrencePattern || task.recurrenceSourceId) {
      setRecurringDeleteTask(task);
      return;
    }

    setTasks(prev => prev.filter(t => t.id !== taskId));
    pushTask('delete', task);
    if (activeTaskId === taskId) setActiveTaskId(null);
    pushUndo({
      label: `Delete "${task.title}"`,
      undo: () => { setTasks(prev => [...prev, task]); pushTask('create', task); },
      redo: () => { setTasks(prev => prev.filter(t => t.id !== taskId)); pushTask('delete', task); },
    });
  }, [tasks, pushTask, pushUndo, activeTaskId]);

  const handleRecurringDeleteSingle = useCallback(() => {
    if (!recurringDeleteTask) return;
    const task = recurringDeleteTask;
    setRecurringDeleteTask(null);
    setTasks(prev => prev.filter(t => t.id !== task.id));
    storage.removeLocalTask(task.id);
    pushRecurringDelete(task.recurrenceSourceId || task.id, 'single', task.id);
    if (activeTaskId === task.id) setActiveTaskId(null);
  }, [recurringDeleteTask, pushRecurringDelete, activeTaskId]);

  const handleRecurringDeleteAll = useCallback(() => {
    if (!recurringDeleteTask) return;
    const task = recurringDeleteTask;
    const sourceId = task.recurrenceSourceId || task.id;
    setRecurringDeleteTask(null);
    setTasks(prev => prev.filter(t => t.id !== sourceId && t.recurrenceSourceId !== sourceId));
    storage.removeLocalTasksByRecurrenceSource(sourceId);
    pushRecurringDelete(sourceId, 'all');
    if (activeTaskId && (activeTaskId === sourceId || tasks.find(t => t.id === activeTaskId)?.recurrenceSourceId === sourceId)) {
      setActiveTaskId(null);
    }
  }, [recurringDeleteTask, pushRecurringDelete, activeTaskId, tasks]);

  const handleRecurringDeleteFuture = useCallback(() => {
    if (!recurringDeleteTask) return;
    const task = recurringDeleteTask;
    const sourceId = task.recurrenceSourceId || task.id;
    const fromDate = todayString();
    setRecurringDeleteTask(null);
    setTasks(prev => prev.filter(t => {
      const isTemplate = t.id === sourceId && t.date >= fromDate;
      const isFutureInstance = t.recurrenceSourceId === sourceId && t.date >= fromDate;
      return !isTemplate && !isFutureInstance;
    }));
    storage.removeLocalTasksFutureByRecurrenceSource(sourceId, fromDate);
    pushRecurringDelete(sourceId, 'future', undefined, fromDate);
    if (activeTaskId) {
      const activeTask = tasks.find(t => t.id === activeTaskId);
      if (activeTask && (activeTask.id === sourceId || activeTask.recurrenceSourceId === sourceId) && activeTask.date >= fromDate) {
        setActiveTaskId(null);
      }
    }
  }, [recurringDeleteTask, pushRecurringDelete, activeTaskId, tasks]);

  const handleReorder = useCallback((taskId: string, direction: 'up' | 'down') => {
    setTasks(prev => {
      const sorted = [...prev].sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = sorted.findIndex(t => t.id === taskId);
      if (idx < 0) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;

      const temp = sorted[idx].sortOrder;
      sorted[idx] = { ...sorted[idx], sortOrder: sorted[swapIdx].sortOrder, updatedAt: new Date().toISOString() };
      sorted[swapIdx] = { ...sorted[swapIdx], sortOrder: temp, updatedAt: new Date().toISOString() };

      pushTask('update', sorted[idx]);
      pushTask('update', sorted[swapIdx]);
      return sorted;
    });
  }, [pushTask]);

  const handleReorderAll = useCallback((orderedTaskIds: string[]) => {
    setTasks(prev => {
      const now = new Date().toISOString();
      return prev.map(t => {
        const newIndex = orderedTaskIds.indexOf(t.id);
        if (newIndex === -1) return t;
        const updated = { ...t, sortOrder: newIndex, updatedAt: now };
        pushTask('update', updated);
        return updated;
      });
    });
  }, [pushTask]);

  const handleClockPanelDrop = useCallback((targetId: string) => {
    const sourceId = clockDraggingPanelRef.current;
    clockDraggingPanelRef.current = null;
    setClockDraggingPanel(null);
    setClockDragOverPanel(null);
    if (!sourceId || sourceId === targetId) return;
    setClockPanelOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(sourceId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx >= 0 && toIdx >= 0) {
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, sourceId);
        localStorage.setItem('ct-clock-panel-order', JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const handlePanelDrop = useCallback((targetId: string) => {
    const sourceId = draggingPanelRef.current;
    draggingPanelRef.current = null;
    setDraggingPanel(null);
    setDragOverPanel(null);
    if (!sourceId || sourceId === targetId) return;
    setPanelOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(sourceId);
      const toIdx = next.indexOf(targetId);
      if (fromIdx >= 0 && toIdx >= 0) {
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, sourceId);
        localStorage.setItem('ct-panel-order', JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const handleApplyReorg = useCallback(() => {
    if (suggestedOrdering) handleReorderAll(suggestedOrdering);
    setReorgDismissed(true);
  }, [suggestedOrdering, handleReorderAll]);

  const handleRescheduleTask = useCallback((taskId: string, newDate: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updated = { ...task, date: newDate, updatedAt: new Date().toISOString() };
    pushTask('update', updated);
    setTasks(prev => prev.filter(t => t.id !== taskId));
    if (activeTaskId === taskId) setActiveTaskId(null);
  }, [tasks, pushTask, activeTaskId]);

  // Backlog handlers
  const handleAddToBacklog = useCallback((taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => {
    const now = new Date().toISOString();
    const newTask: Task = {
      ...taskData,
      date: 'backlog',
      id: crypto.randomUUID(),
      sortOrder: backlogTasks.length,
      createdAt: now,
      updatedAt: now,
    };
    setBacklogTasks(prev => [...prev, newTask]);
    pushTask('create', newTask);
  }, [backlogTasks.length, pushTask]);

  const handleAssignBacklogToDate = useCallback((taskId: string) => {
    const task = backlogTasks.find(t => t.id === taskId);
    if (!task) return;
    const updated: Task = {
      ...task,
      date,
      sortOrder: tasks.length,
      updatedAt: new Date().toISOString(),
    };
    setBacklogTasks(prev => prev.filter(t => t.id !== taskId));
    setTasks(prev => [...prev, updated]);
    pushTask('update', updated);
  }, [backlogTasks, date, tasks.length, pushTask]);

  const handleEditBacklogTask = useCallback((task: Task) => {
    setEditingTask(task);
  }, []);

  const handleDeleteBacklogTask = useCallback((taskId: string) => {
    const task = backlogTasks.find(t => t.id === taskId);
    if (!task) return;
    setBacklogTasks(prev => prev.filter(t => t.id !== taskId));
    pushTask('delete', task);
  }, [backlogTasks, pushTask]);

  const handleMoveToBacklog = useCallback((taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const updated: Task = {
      ...task,
      date: 'backlog',
      sortOrder: backlogTasks.length,
      updatedAt: new Date().toISOString(),
    };
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setBacklogTasks(prev => [...prev, updated]);
    pushTask('update', updated);
    setEditingTask(undefined);
    if (activeTaskId === taskId) setActiveTaskId(null);
  }, [tasks, backlogTasks.length, pushTask, activeTaskId]);

  // Unfinished task handlers
  const handleMoveUnfinishedToToday = useCallback((taskId: string) => {
    const task = unfinishedTasks.find(t => t.id === taskId);
    if (!task) return;
    const updated: Task = { ...task, date: todayString(), sortOrder: tasks.length, updatedAt: new Date().toISOString() };
    pushTask('update', updated);
    setTasks(prev => [...prev, updated]);
    setUnfinishedTasks(prev => {
      const remaining = prev.filter(t => t.id !== taskId);
      if (remaining.length === 0) dismissPrompt();
      return remaining;
    });
  }, [unfinishedTasks, tasks.length, pushTask, setUnfinishedTasks, dismissPrompt]);

  const handleMoveUnfinishedToBacklog = useCallback((taskId: string) => {
    const task = unfinishedTasks.find(t => t.id === taskId);
    if (!task) return;
    const updated: Task = { ...task, date: 'backlog', sortOrder: backlogTasks.length, updatedAt: new Date().toISOString() };
    pushTask('update', updated);
    setBacklogTasks(prev => [...prev, updated]);
    setUnfinishedTasks(prev => {
      const remaining = prev.filter(t => t.id !== taskId);
      if (remaining.length === 0) dismissPrompt();
      return remaining;
    });
  }, [unfinishedTasks, backlogTasks.length, pushTask, setUnfinishedTasks, dismissPrompt]);

  const handleDeleteUnfinishedTask = useCallback((taskId: string) => {
    const task = unfinishedTasks.find(t => t.id === taskId);
    if (!task) return;
    pushTask('delete', task);
    setUnfinishedTasks(prev => {
      const remaining = prev.filter(t => t.id !== taskId);
      if (remaining.length === 0) dismissPrompt();
      return remaining;
    });
  }, [unfinishedTasks, pushTask, setUnfinishedTasks, dismissPrompt]);

  const handleMoveAllUnfinishedToToday = useCallback(() => {
    const now = new Date().toISOString();
    let nextSort = tasks.length;
    const moved: Task[] = [];
    for (const task of unfinishedTasks) {
      const updated: Task = { ...task, date: todayString(), sortOrder: nextSort++, updatedAt: now };
      pushTask('update', updated);
      moved.push(updated);
    }
    setTasks(prev => [...prev, ...moved]);
    setUnfinishedTasks([]);
    dismissPrompt();
  }, [unfinishedTasks, tasks.length, pushTask, setUnfinishedTasks, dismissPrompt]);

  const handleMoveAllUnfinishedToBacklog = useCallback(() => {
    const now = new Date().toISOString();
    let nextSort = backlogTasks.length;
    const moved: Task[] = [];
    for (const task of unfinishedTasks) {
      const updated: Task = { ...task, date: 'backlog', sortOrder: nextSort++, updatedAt: now };
      pushTask('update', updated);
      moved.push(updated);
    }
    setBacklogTasks(prev => [...prev, ...moved]);
    setUnfinishedTasks([]);
    dismissPrompt();
  }, [unfinishedTasks, backlogTasks.length, pushTask, setUnfinishedTasks, dismissPrompt]);

  const handleDeleteAllUnfinished = useCallback(() => {
    for (const task of unfinishedTasks) {
      pushTask('delete', task);
    }
    setUnfinishedTasks([]);
    dismissPrompt();
  }, [unfinishedTasks, pushTask, setUnfinishedTasks, dismissPrompt]);

  const handleMoveAllToTomorrow = useCallback(async () => {
    const now = new Date().toISOString();
    const tomorrow = tomorrowString();
    const toMove = tasks.filter(t => !t.completed && !t.isBreak);

    // Fetch tomorrow's tasks to find the right starting sortOrder
    let baseSortOrder = 0;
    try {
      const tomorrowTasks = await apiFetchTasks(tomorrow);
      baseSortOrder = tomorrowTasks.length;
    } catch {
      // Offline: use a high base to avoid collisions
      baseSortOrder = 1000;
    }

    toMove.forEach((task, i) => {
      const updated: Task = { ...task, date: tomorrow, sortOrder: baseSortOrder + i, updatedAt: now };
      pushTask('update', updated);
    });
    const moveIds = new Set(toMove.map(t => t.id));
    setTasks(prev => prev.filter(t => !moveIds.has(t.id)));
  }, [tasks, pushTask]);

  // Pomodoro session tracking — only push new sessions
  const pushedSessionCount = useRef(0);
  useEffect(() => {
    const newSessions = pomodoro.sessions.slice(pushedSessionCount.current);
    for (const session of newSessions) {
      pushSession(session);
    }
    pushedSessionCount.current = pomodoro.sessions.length;
  }, [pomodoro.sessions, pushSession]);

  // Date navigation
  const goToday = () => setDate(todayString());
  const weekMonday = useMemo(() => getWeekMonday(date), [date]);
  const visibleDays = useMemo(() => {
    const days = settings.workingDays.length > 0 ? settings.workingDays : [1, 2, 3, 4, 5];
    return days.map(isoDay => weekDayDate(weekMonday, isoDay));
  }, [weekMonday, settings.workingDays]);
  const goPrevWeek = () => setDate(shiftDate(weekMonday, -7));
  const goNextWeek = () => setDate(shiftDate(weekMonday, 7));

  // Month label for the week nav — shows both months when the week spans a boundary
  const weekMonthLabel = useMemo(() => {
    if (visibleDays.length === 0) return '';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const first = new Date(visibleDays[0] + 'T00:00:00');
    const last = new Date(visibleDays[visibleDays.length - 1] + 'T00:00:00');
    const year = first.getFullYear();
    if (first.getMonth() === last.getMonth()) {
      return `${MONTHS[first.getMonth()]} ${year}`;
    }
    return `${MONTHS[first.getMonth()]} / ${MONTHS[last.getMonth()]}`;
  }, [visibleDays]);

  // Demo mode
  const enterDemoMode = useCallback(() => {
    stashedState.current = {
      tasks, settings, backlogTasks, calendarEvents, icsCache: [...icsCache.current], date,
      editingTask, activeTaskId,
    };
    icsCache.current = [];
    const demoDate = todayString();
    setTasks(getDemoTasks(demoDate));
    setSettings(getDemoSettings());
    setBacklogTasks(getDemoBacklogTasks());
    setCalendarEvents(getDemoCalendarEvents(demoDate));
    setDate(demoDate);
    setEditingTask(undefined);
    setActiveTaskId(null);
    setShowTimer(true);
    setShowForm(true);
    setShowTaskList(true);
    setShowBacklog(true);
    setDemoMode(true);
  }, [tasks, settings, backlogTasks, calendarEvents, date, editingTask, activeTaskId]);

  const exitDemoMode = useCallback(() => {
    if (stashedState.current) {
      setTasks(stashedState.current.tasks);
      setSettings(stashedState.current.settings);
      setBacklogTasks(stashedState.current.backlogTasks);
      setCalendarEvents(stashedState.current.calendarEvents);
      icsCache.current = stashedState.current.icsCache;
      setDate(stashedState.current.date);
      setEditingTask(stashedState.current.editingTask);
      setActiveTaskId(stashedState.current.activeTaskId);
      stashedState.current = null;
    }
    setDemoMode(false);
  }, []);

  const handleToggleDemoMode = useCallback(() => {
    if (demoMode) exitDemoMode();
    else enterDemoMode();
  }, [demoMode, enterDemoMode, exitDemoMode]);

  async function handleExport() {
    setExportWorking(true);
    setDataActionStatus(null);
    try {
      await exportData();
      setDataActionStatus({ type: 'success', message: 'Export downloaded.' });
    } catch (err: unknown) {
      setDataActionStatus({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setExportWorking(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportWorking(true);
    setDataActionStatus(null);
    try {
      const result = await importData(file);
      setDataActionStatus({
        type: 'success',
        message: `Imported ${result.imported.tasks} tasks and ${result.imported.sessions} Pomodoro sessions. Reload to see your data.`,
      });
    } catch (err: unknown) {
      setDataActionStatus({ type: 'error', message: err instanceof Error ? err.message : 'Import failed' });
    } finally {
      setImportWorking(false);
    }
  }

  async function handleDeleteAccount() {
    if (!deleteConfirmed || !deletePassword) return;
    setDeleteWorking(true);
    setDeleteError('');
    try {
      await deleteAccount(deletePassword);
      onLogout();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed');
      setDeleteWorking(false);
    }
  }

  const pomodoroState: PomodoroState = pomodoro.state;

  return (
    <div className={`app${settings.colorScheme && settings.colorScheme !== 'nord' ? ` scheme-${settings.colorScheme}` : ''}`}>
      <header className="app-header">
        <div className="app-title-group">
          <h1 className="app-title">
            {/* Inline SVG so currentColor inherits the theme-aware text colour */}
            <svg className="app-logo" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              {/* Arc track */}
              <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="9" opacity="0.15"/>
              {/* Outer border */}
              <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.2"/>
              {/* Arc 1: Nord blue */}
              <path d="M 46.9 15.1 A 35 35 0 0 1 84.9 46.9" fill="none" stroke="#5E81AC" strokeWidth="9" strokeLinecap="butt"/>
              {/* Arc 2: Nord teal */}
              <path d="M 84.9 53.1 A 35 35 0 0 1 53.1 84.9" fill="none" stroke="#88C0D0" strokeWidth="9" strokeLinecap="butt"/>
              {/* Arc 3: Nord green */}
              <path d="M 46.9 84.9 A 35 35 0 0 1 15 50" fill="none" stroke="#A3BE8C" strokeWidth="9" strokeLinecap="butt"/>
              {/* Checkmark */}
              <path d="M 32 50 L 44 63 L 68 37" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="app-title__wordmark">TaskDial</span>
          </h1>
          <div className="app-title-meta">
            <button
              className="help-trigger-btn"
              onClick={() => setShowHelp(true)}
              aria-label="How to use TaskDial"
              title="How to use TaskDial"
            >
              ?
            </button>
            <span className="app-version" aria-label={`Version ${APP_VERSION}`}>v{APP_VERSION}</span>
          </div>
        </div>
        <div className="header-status">
          <span className={`sync-indicator ${demoMode ? 'demo' : isOnline ? 'online' : 'offline'}`} aria-live="polite">
            {demoMode ? 'demo' : showSyncing ? 'syncing...' : isOnline ? 'online' : 'offline'}
          </span>
          {isAdmin() && (
            <a href="/admin" className="header-admin-link" title={`Signed in as ${user.email}`}>
              Admin
            </a>
          )}
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)} aria-label="Settings" aria-expanded={showSettings} aria-controls="settings-panel" title="Settings">
            &#9881;
          </button>
        </div>
      </header>

      {demoMode && (
        <div className="demo-banner" role="status">
          <span className="demo-banner__text">Demo mode: exploring with sample data. Your real tasks are safe.</span>
          <button className="demo-banner__exit" onClick={exitDemoMode}>Exit demo</button>
        </div>
      )}

      <Suspense fallback={null}>
        <UnfinishedTasksModal
          open={showPrompt}
          tasks={unfinishedTasks}
          hasBacklog={settings.advancedMode && settings.enableBacklog}
          onMoveToToday={handleMoveUnfinishedToToday}
          onMoveToBacklog={handleMoveUnfinishedToBacklog}
          onDelete={handleDeleteUnfinishedTask}
          onMoveAllToToday={handleMoveAllUnfinishedToToday}
          onMoveAllToBacklog={handleMoveAllUnfinishedToBacklog}
          onDeleteAll={handleDeleteAllUnfinished}
          onDismiss={dismissPrompt}
        />
      </Suspense>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSettingChange={handleSettingChange}
          tdTheme={tdTheme}
          onThemeChange={handleThemeChange}
          onClose={() => setShowSettings(false)}
          icalUrlInputs={icalUrlInputs}
          onIcalUrlsChange={setIcalUrlInputs}
          icalLoading={icalLoading}
          icalErrors={icalErrors}
          calendarEvents={calendarEvents}
          committedIcalUrls={committedIcalUrls}
          onLoadCalendar={handleLoadCalendar}
          dataActionStatus={dataActionStatus}
          exportWorking={exportWorking}
          onExport={handleExport}
          importWorking={importWorking}
          onImport={handleImport}
          onOpenDeleteModal={() => { setShowDeleteModal(true); setDeleteError(''); setDeletePassword(''); setDeleteConfirmed(false); }}
          onLogout={onLogout}
          userEmail={user.email}
        />
      )}

      {/* Delete account modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)} role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2 id="delete-modal-title" className="modal-box__title">Delete account</h2>
            <p className="modal-box__body">
              This will permanently delete your account, all tasks, sessions, and settings. There is no way to recover this data.
            </p>
            <label className="modal-box__checkbox-label">
              <input
                type="checkbox"
                checked={deleteConfirmed}
                onChange={e => setDeleteConfirmed(e.target.checked)}
              />
              I understand this cannot be undone
            </label>
            <div className="modal-box__field">
              <label htmlFor="delete-password" className="modal-box__field-label">Enter your password to confirm</label>
              <input
                id="delete-password"
                type="password"
                className="modal-box__input"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                disabled={deleteWorking}
              />
            </div>
            {deleteError && <p className="modal-box__error" role="alert">{deleteError}</p>}
            <div className="modal-box__actions">
              <button className="modal-box__cancel" onClick={() => setShowDeleteModal(false)} disabled={deleteWorking}>
                Cancel
              </button>
              <button
                className="modal-box__confirm modal-box__confirm--danger"
                onClick={handleDeleteAccount}
                disabled={!deleteConfirmed || !deletePassword || deleteWorking}
              >
                {deleteWorking ? 'Deleting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="date-nav" role="navigation" aria-label="Date navigation">
        <span className="date-nav__month-label" aria-label={weekMonthLabel}>{weekMonthLabel}</span>
        <button className="date-nav__week-btn" onClick={goPrevWeek} aria-label="Previous week">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {visibleDays.map(d => {
          const dayLabel = new Date(d + 'T00:00:00').toLocaleDateString('en', { weekday: 'short' });
          const dayNum = new Date(d + 'T00:00:00').getDate();
          const isActive = d === date;
          const isToday = d === todayString();
          return (
            <button
              key={d}
              className={`date-nav__day${isActive ? ' date-nav__day--active' : ''}${isToday && !isActive ? ' date-nav__day--today' : ''}`}
              onClick={() => setDate(d)}
              aria-pressed={isActive}
              aria-label={`${dayLabel} ${dayNum}${isToday ? ' (today)' : ''}`}
            >
              <span className="date-nav__day-name">{dayLabel}</span>
              <span className="date-nav__day-num">{dayNum}</span>
            </button>
          );
        })}
        <button className="date-nav__week-btn" onClick={goNextWeek} aria-label="Next week">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {date !== todayString() && (
          <button onClick={goToday} className="today-btn" title="Go to today">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M10 2 L10 8 L3 8 M5.5 5.5 L3 8 L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Today
          </button>
        )}
      </div>

      <main className={`app-main${settings.clockPosition === 'right' ? ' app-main--clock-right' : ''}`}>
        <section className="clock-section">
          <ClockFace
            tasks={scheduledTasks}
            calendarEvents={calendarEvents}
            meetingBufferMinutes={settings.meetingBufferMinutes}
            autoAdvance={settings.autoAdvance}
            isToday={isToday}
            dayStartHour={settings.dayStartHour}
            dayEndHour={settings.dayEndHour}
            use24Hour={settings.use24Hour}
            currentTime={currentMinuteTime}
            activeTaskId={activeTaskId}
            activeCalendarUid={activeCalendarUid}
            pomodoroState={pomodoroState}
            onTaskClick={setActiveTaskId}
            onCalendarEventClick={(uid) => setActiveCalendarUid(prev => prev === uid ? null : uid)}
            onSlotsResolved={setClockColorMap}
          />
          {clockPanelOrder.map(panelId => {
            if (panelId === 'calendar' && calendarEvents.length === 0) return null;
            if (panelId === 'summary' && !daySummary) return null;
            const clockDragHandle = (
              <span className="panel-drag-handle" aria-hidden="true">
                <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                  <circle cx="3" cy="2.5" r="1.2" /><circle cx="7" cy="2.5" r="1.2" />
                  <circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" />
                  <circle cx="3" cy="11.5" r="1.2" /><circle cx="7" cy="11.5" r="1.2" />
                </svg>
              </span>
            );
            return (
              <div
                key={panelId}
                className={[
                  'clock-panel',
                  clockDraggingPanel === panelId && 'clock-panel--dragging',
                  clockDragOverPanel === panelId && 'clock-panel--drag-over',
                ].filter(Boolean).join(' ')}
                draggable
                onDragStart={(e) => { e.stopPropagation(); clockDraggingPanelRef.current = panelId; setClockDraggingPanel(panelId); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setClockDragOverPanel(panelId); }}
                onDragEnd={() => { clockDraggingPanelRef.current = null; setClockDraggingPanel(null); setClockDragOverPanel(null); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleClockPanelDrop(panelId); }}
              >
                <div className="clock-panel__header">
                  {clockDragHandle}
                  <h3 className="clock-panel__title">
                    {panelId === 'calendar' ? 'Calendar' : 'Day breakdown'}
                  </h3>
                </div>
                {panelId === 'calendar' && (
                  <div className="clock-panel__body">
                  <ul ref={calendarListRef} className="calendar-events__list">
                    {[...calendarEvents]
                      .sort((a, b) => a.startMinutes - b.startMinutes)
                      .map(event => {
                        const startH = Math.floor(event.startMinutes / 60);
                        const startM = event.startMinutes % 60;
                        const endH = Math.floor(event.endMinutes / 60);
                        const endM = event.endMinutes % 60;
                        const timeStr = event.allDay
                          ? 'All day'
                          : `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}–${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
                        return (
                          <li
                            key={event.uid}
                            data-event-uid={event.uid}
                            className={`calendar-events__item${event.uid === activeCalendarUid ? ' calendar-events__item--active' : ''}`}
                          >
                            <span className="calendar-events__time">{timeStr}</span>
                            <span className="calendar-events__summary">{event.summary}</span>
                          </li>
                        );
                      })}
                  </ul>
                  </div>
                )}
                {panelId === 'summary' && daySummary && (
                  <div className="clock-panel__body">
                    {daySummary.totalMinutes > 0 && (
                      <div className="day-summary__bar" aria-hidden="true">
                        {daySummary.eventMinutes > 0 && <div className="day-summary__bar-segment day-summary__bar-segment--events" style={{ flex: daySummary.eventMinutes }} />}
                        {daySummary.taskMinutes > 0 && <div className="day-summary__bar-segment day-summary__bar-segment--tasks" style={{ flex: daySummary.taskMinutes }} />}
                        {daySummary.breakMinutes > 0 && <div className="day-summary__bar-segment day-summary__bar-segment--breaks" style={{ flex: daySummary.breakMinutes }} />}
                      </div>
                    )}
                    <ul className="day-summary__rows">
                      {daySummary.eventMinutes > 0 && (
                        <li className="day-summary__row">
                          <span className="day-summary__dot day-summary__dot--events" aria-hidden="true" />
                          <span className="day-summary__label">Events</span>
                          <span className="day-summary__value">{formatDuration(daySummary.eventMinutes)}</span>
                        </li>
                      )}
                      <li className="day-summary__row">
                        <span className="day-summary__dot day-summary__dot--tasks" aria-hidden="true" />
                        <span className="day-summary__label">Tasks</span>
                        <span className="day-summary__value">{formatDuration(daySummary.taskMinutes)}</span>
                      </li>
                      {daySummary.breakMinutes > 0 && (
                        <li className="day-summary__row">
                          <span className="day-summary__dot day-summary__dot--breaks" aria-hidden="true" />
                          <span className="day-summary__label">Breaks</span>
                          <span className="day-summary__value">{formatDuration(daySummary.breakMinutes)}</span>
                        </li>
                      )}
                      <li className="day-summary__row day-summary__row--total">
                        <span className="day-summary__label">Total</span>
                        <span className="day-summary__value">{formatDuration(daySummary.totalMinutes)}</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section className="sidebar">
          {settings.advancedMode ? (
            // Advanced mode: panels rendered in user-defined order, draggable to reorder
            panelOrder.map(panelId => {
              if (panelId === 'timer' && !settings.showPomodoroTimer) return null;
              if (panelId === 'backlog' && !settings.enableBacklog) return null;
              const dragHandle = (
                <span className="panel-drag-handle" aria-hidden="true">
                  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                    <circle cx="3" cy="2.5" r="1.2" /><circle cx="7" cy="2.5" r="1.2" />
                    <circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" />
                    <circle cx="3" cy="11.5" r="1.2" /><circle cx="7" cy="11.5" r="1.2" />
                  </svg>
                </span>
              );
              return (
                <div
                  key={panelId}
                  className={[
                    'collapsible-section',
                    draggingPanel === panelId && 'collapsible-section--dragging',
                    dragOverPanel === panelId && 'collapsible-section--drag-over',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    draggingPanelRef.current = panelId;
                    setDraggingPanel(panelId);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverPanel(panelId); }}
                  onDragEnd={() => { draggingPanelRef.current = null; setDraggingPanel(null); setDragOverPanel(null); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handlePanelDrop(panelId); }}
                >
                  {panelId === 'timer' && (
                    <>
                      <button className="collapsible-section__header" onClick={() => setShowTimer(!showTimer)} aria-expanded={showTimer}>
                        {dragHandle}
                        <svg className={`collapsible-section__chevron ${showTimer ? 'collapsible-section__chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="collapsible-section__title">Pomodoro Timer</span>
                        {!showTimer && pomodoroState.isRunning && (
                          <span className={`collapsible-section__summary collapsible-section__summary--${pomodoroState.type}`}>
                            {pomodoroState.type === 'work' ? 'Focus' : pomodoroState.type === 'shortBreak' ? 'Break' : 'Long Break'}
                            {' '}
                            {String(Math.floor(pomodoroState.timeRemainingSeconds / 60)).padStart(2, '0')}:{String(pomodoroState.timeRemainingSeconds % 60).padStart(2, '0')}
                          </span>
                        )}
                      </button>
                      {showTimer && (
                        <div className="collapsible-section__body">
                          <PomodoroTimer
                            state={pomodoroState}
                            onStart={(taskId) => {
                              const task = taskId ? tasks.find(t => t.id === taskId) : undefined;
                              const override = task && task.durationMinutes < settings.workDuration ? task.durationMinutes : undefined;
                              pomodoro.start(taskId ?? undefined, override);
                            }}
                            onPause={pomodoro.pause}
                            onResume={pomodoro.resume}
                            onSkip={pomodoro.skip}
                            onReset={pomodoro.reset}
                            currentTaskTitle={tasks.find(t => t.id === activeTaskId)?.title}
                          />
                        </div>
                      )}
                    </>
                  )}
                  {panelId === 'form' && (
                    <>
                      <button className="collapsible-section__header" onClick={() => setShowForm(!showForm)} aria-expanded={showForm}>
                        {dragHandle}
                        <svg className={`collapsible-section__chevron ${showForm ? 'collapsible-section__chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="collapsible-section__title">{editingTask ? 'Edit task' : 'Add task or break'}</span>
                      </button>
                      {showForm && (
                        <div className="collapsible-section__body">
                          <TaskForm
                            onSubmit={editingTask ? handleUpdateTask : handleAddTask}
                            editingTask={editingTask}
                            onCancel={editingTask ? () => setEditingTask(undefined) : undefined}
                            date={date}
                            existingTags={[...new Set(tasks.flatMap(t => t.tag ? t.tag.split(',').map(s => s.trim()).filter(Boolean) : []))]}
                            calendarEvents={calendarEvents}
                            meetingBufferMinutes={settings.meetingBufferMinutes}
                            use24Hour={settings.use24Hour}
                            enableRecurring={settings.enableRecurringTasks}
                            enableBacklog={settings.enableBacklog}
                            onSubmitToBacklog={handleAddToBacklog}
                            onMoveToBacklog={handleMoveToBacklog}
                            advancedMode={settings.advancedMode}
                          />
                          <BreakForm onSubmit={handleAddTask} date={date} />
                        </div>
                      )}
                    </>
                  )}
                  {panelId === 'tasks' && (
                    <>
                      <button className="collapsible-section__header" onClick={() => setShowTaskList(!showTaskList)} aria-expanded={showTaskList}>
                        {dragHandle}
                        <svg className={`collapsible-section__chevron ${showTaskList ? 'collapsible-section__chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="collapsible-section__title">Tasks</span>
                        {!showTaskList && (
                          <span className="collapsible-section__count">
                            {allTasksDone ? 'All done' : `${tasks.filter(t => !t.completed && !t.isBreak).length} remaining`}
                          </span>
                        )}
                      </button>
                      {showTaskList && (
                        <div className="collapsible-section__body collapsible-section__body--flush">
                          {showReorgBanner && (
                            <div className="reorg-banner" role="status">
                              <span className="reorg-banner__text">Tasks overflow the day, but a different order would fit.</span>
                              <div className="reorg-banner__actions">
                                <button className="reorg-banner__action" onClick={handleApplyReorg}>Reorganise</button>
                                <button className="reorg-banner__dismiss" onClick={() => setReorgDismissed(true)} aria-label="Dismiss suggestion">✕</button>
                              </div>
                            </div>
                          )}
                          {taskTags.length > 1 && (
                            <div className="tag-filter" role="group" aria-label="Filter by tag">
                              {taskTags.map(tag => {
                                const hue = tagHueMap.get(tag);
                                return (
                                  <button
                                    key={tag}
                                    className={`tag-filter__pill${activeTagFilter === tag ? ' tag-filter__pill--active' : ''}`}
                                    style={{
                                      color: hue !== undefined ? tagColorFromHue(hue) : tagColor(tag),
                                      backgroundColor: hue !== undefined ? tagBgColorFromHue(hue) : tagBgColor(tag),
                                    }}
                                    onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                                    aria-pressed={activeTagFilter === tag}
                                    aria-label={`Filter by ${tag}`}
                                  >
                                    {tag}
                                  </button>
                                );
                              })}
                              {activeTagFilter && (
                                <button className="tag-filter__clear" onClick={() => setActiveTagFilter(null)} aria-label="Clear tag filter">✕</button>
                              )}
                            </div>
                          )}
                          <TaskList
                            tasks={filteredTasks}
                            colorMap={clockColorMap}
                            tagHueMap={tagHueMap}
                            activeTaskId={activeTaskId}
                            allTasksDone={allTasksDone}
                            onToggleComplete={handleToggleComplete}
                            onToggleImportant={handleToggleImportant}
                            onDeleteTask={handleDeleteTask}
                            onEditTask={setEditingTask}
                            onReorder={handleReorder}
                            onReorderAll={handleReorderAll}
                            onSelectTask={setActiveTaskId}
                            onRescheduleTask={handleRescheduleTask}
                            onMoveAllToTomorrow={handleMoveAllToTomorrow}
                            isFirstVisit={isFirstVisit && !demoMode}
                            onTryDemo={enterDemoMode}
                          />
                        </div>
                      )}
                    </>
                  )}
                  {panelId === 'backlog' && (
                    <>
                      <button className="collapsible-section__header" onClick={() => setShowBacklog(!showBacklog)} aria-expanded={showBacklog}>
                        {dragHandle}
                        <svg className={`collapsible-section__chevron ${showBacklog ? 'collapsible-section__chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="collapsible-section__title">Backlog</span>
                        {!showBacklog && (
                          <span className="collapsible-section__count">{backlogTasks.length} task{backlogTasks.length !== 1 ? 's' : ''}</span>
                        )}
                      </button>
                      {showBacklog && (
                        <div className="collapsible-section__body collapsible-section__body--flush">
                          <BacklogList
                            tasks={backlogTasks}
                            onAssignToToday={handleAssignBacklogToDate}
                            onEditTask={handleEditBacklogTask}
                            onDeleteTask={handleDeleteBacklogTask}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          ) : (
            // Simple mode: no panel reordering
            <>
              <div className="sidebar-section">
                <TaskForm
                  onSubmit={editingTask ? handleUpdateTask : handleAddTask}
                  editingTask={editingTask}
                  onCancel={editingTask ? () => setEditingTask(undefined) : undefined}
                  date={date}
                  existingTags={[...new Set(tasks.flatMap(t => t.tag ? t.tag.split(',').map(s => s.trim()).filter(Boolean) : []))]}
                  calendarEvents={calendarEvents}
                  meetingBufferMinutes={settings.meetingBufferMinutes}
                  use24Hour={settings.use24Hour}
                  enableRecurring={settings.enableRecurringTasks}
                  enableBacklog={settings.enableBacklog}
                  onSubmitToBacklog={handleAddToBacklog}
                  onMoveToBacklog={handleMoveToBacklog}
                  advancedMode={settings.advancedMode}
                />
                <BreakForm onSubmit={handleAddTask} date={date} />
              </div>
              <div className="sidebar-section sidebar-section--flush">
                {showReorgBanner && (
                  <div className="reorg-banner" role="status">
                    <span className="reorg-banner__text">Tasks overflow the day, but a different order would fit.</span>
                    <div className="reorg-banner__actions">
                      <button className="reorg-banner__action" onClick={handleApplyReorg}>Reorganise</button>
                      <button className="reorg-banner__dismiss" onClick={() => setReorgDismissed(true)} aria-label="Dismiss suggestion">✕</button>
                    </div>
                  </div>
                )}
                {taskTags.length > 1 && (
                  <div className="tag-filter" role="group" aria-label="Filter by tag">
                    {taskTags.map(tag => {
                      const hue = tagHueMap.get(tag);
                      return (
                        <button
                          key={tag}
                          className={`tag-filter__pill${activeTagFilter === tag ? ' tag-filter__pill--active' : ''}`}
                          style={{
                            color: hue !== undefined ? tagColorFromHue(hue) : tagColor(tag),
                            backgroundColor: hue !== undefined ? tagBgColorFromHue(hue) : tagBgColor(tag),
                          }}
                          onClick={() => setActiveTagFilter(activeTagFilter === tag ? null : tag)}
                          aria-pressed={activeTagFilter === tag}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    {activeTagFilter && (
                      <button className="tag-filter__clear" onClick={() => setActiveTagFilter(null)} aria-label="Clear tag filter">✕</button>
                    )}
                  </div>
                )}
                <TaskList
                  tasks={filteredTasks}
                  colorMap={clockColorMap}
                  tagHueMap={tagHueMap}
                  activeTaskId={activeTaskId}
                  allTasksDone={allTasksDone}
                  onToggleComplete={handleToggleComplete}
                  onToggleImportant={handleToggleImportant}
                  onDeleteTask={handleDeleteTask}
                  onEditTask={setEditingTask}
                  onReorder={handleReorder}
                  onReorderAll={handleReorderAll}
                  onSelectTask={setActiveTaskId}
                  onMoveAllToTomorrow={handleMoveAllToTomorrow}
                  isFirstVisit={isFirstVisit && !demoMode}
                  onTryDemo={enterDemoMode}
                />
              </div>
            </>
          )}
        </section>
      </main>

      <Suspense fallback={null}>
        <HelpModal open={showHelp} onClose={() => setShowHelp(false)} demoMode={demoMode} onToggleDemoMode={handleToggleDemoMode} />
        <RecurringDeleteModal
          open={recurringDeleteTask !== null}
          taskTitle={recurringDeleteTask?.title ?? ''}
          onJustThisOne={handleRecurringDeleteSingle}
          onAllInSeries={handleRecurringDeleteAll}
          onThisAndFuture={handleRecurringDeleteFuture}
          onCancel={() => setRecurringDeleteTask(null)}
        />
      </Suspense>

      {(canUndo || canRedo) && (
        <div className="undo-bar" role="status" aria-live="polite">
          {canUndo && (
            <button className="undo-bar__btn" onClick={handleUndo} aria-label={`Undo: ${undoLabel}`}>
              ↩ Undo{undoLabel ? `: ${undoLabel}` : ''}
            </button>
          )}
          {canRedo && (
            <button className="undo-bar__btn undo-bar__btn--redo" onClick={handleRedo} aria-label="Redo">
              ↪ Redo
            </button>
          )}
        </div>
      )}

      {showInstallBanner && (
        <div className="install-banner" role="status">
          <span className="install-banner__text">
            {isIOS
              ? 'Install TaskDial: tap Share, then "Add to Home Screen".'
              : 'Install TaskDial for quick access from your home screen.'}
          </span>
          <div className="install-banner__actions">
            {!isIOS && (
              <button className="install-banner__action" onClick={installApp}>Install</button>
            )}
            <button
              className={`install-banner__dismiss${isIOS ? ' install-banner__dismiss--text' : ''}`}
              onClick={dismissInstall}
              aria-label="Dismiss install prompt"
            >
              {isIOS ? 'Maybe later' : '\u2715'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
