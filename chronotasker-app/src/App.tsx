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
import { scheduleTasks, type ScheduledTask } from './utils/scheduling';
import { todayString, tomorrowString, formatDate } from './utils/scheduling';
import { fetchCalendar, fetchTasks as apiFetchTasks } from './services/api';
import * as storage from './services/storage';
import { parseIcalEvents } from './utils/ical';
const HelpModal = lazy(() => import('./components/HelpModal'));
const RecurringDeleteModal = lazy(() => import('./components/RecurringDeleteModal'));
const UnfinishedTasksModal = lazy(() => import('./components/UnfinishedTasksModal'));
import { useUnfinishedTasks } from './hooks/useUnfinishedTasks';
import { getDemoTasks, getDemoBacklogTasks, getDemoCalendarEvents, getDemoSettings } from './data/demoData';
import './App.css';

function App() {
  const [date, setDate] = useState(todayString());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [, setSessions] = useState<import('./types').PomodoroSession[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showForm, setShowForm] = useState(true);
  const [showTaskList, setShowTaskList] = useState(true);
  const [clockColorMap, setClockColorMap] = useState<Map<string, string>>(new Map());
  const [backlogTasks, setBacklogTasks] = useState<Task[]>([]);
  const [showBacklog, setShowBacklog] = useState(false);
  const [recurringDeleteTask, setRecurringDeleteTask] = useState<Task | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const stashedState = useRef<{
    tasks: Task[];
    settings: AppSettings;
    backlogTasks: Task[];
    calendarEvents: CalendarEvent[];
    icsCache: string | null;
    date: string;
    editingTask: Task | undefined;
    activeTaskId: string | null;
  } | null>(null);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Pomodoro
  const pomodoro = usePomodoro(settings);

  // Sync
  const { isOnline, isSyncing, pushTask, pushRecurringDelete, pushSession, pushSettings } = useSync({
    date,
    onTasksUpdated: setTasks,
    onSessionsUpdated: setSessions,
    onSettingsUpdated: setSettings,
    enableRecurringTasks: settings.enableRecurringTasks,
    paused: demoMode,
  });

  // Unfinished tasks from yesterday
  const { unfinishedTasks, setUnfinishedTasks, showPrompt, dismissPrompt } =
    useUnfinishedTasks({ currentDate: date, enabled: !demoMode });

  // Debounced settings push to avoid API spam on every keystroke
  const settingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedPushSettings = useCallback((s: Partial<AppSettings>) => {
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    settingsTimerRef.current = setTimeout(() => pushSettings(s), 500);
  }, [pushSettings]);

  // Auto-expand timer when running
  useEffect(() => {
    if (pomodoro.state.isRunning) setShowTimer(true);
  }, [pomodoro.state.isRunning]);

  // Auto-expand form when editing a task
  useEffect(() => {
    if (editingTask) setShowForm(true);
  }, [editingTask]);

  // Calendar events from iCal feed
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [icalUrlInput, setIcalUrlInput] = useState(settings.icalUrl || '');
  const [icalLoading, setIcalLoading] = useState(false);
  const [icalError, setIcalError] = useState<string | null>(null);
  const [committedIcalUrl, setCommittedIcalUrl] = useState(settings.icalUrl || '');
  const icsCache = useRef<string | null>(null);

  // Keep input in sync when settings load from server
  useEffect(() => {
    if (settings.icalUrl && !committedIcalUrl) {
      setIcalUrlInput(settings.icalUrl);
      setCommittedIcalUrl(settings.icalUrl);
    }
  }, [settings.icalUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCalendar = useCallback(async (url: string) => {
    if (!url) {
      setCalendarEvents([]);
      icsCache.current = null;
      setIcalError(null);
      return;
    }
    setIcalLoading(true);
    setIcalError(null);
    try {
      const text = await fetchCalendar(url);
      icsCache.current = text;
      setCalendarEvents(parseIcalEvents(text, date));
    } catch (err: unknown) {
      setIcalError(err instanceof Error ? err.message : 'Failed to load calendar');
      setCalendarEvents([]);
      icsCache.current = null;
    } finally {
      setIcalLoading(false);
    }
  }, [date]);

  // Fetch when committed URL changes
  useEffect(() => {
    if (demoMode) return;
    if (!committedIcalUrl) {
      setCalendarEvents([]);
      icsCache.current = null;
      return;
    }

    loadCalendar(committedIcalUrl);

    // Refresh every 5 minutes
    const interval = setInterval(() => loadCalendar(committedIcalUrl), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [committedIcalUrl, loadCalendar, demoMode]);

  // Re-parse cached iCal data when date changes
  useEffect(() => {
    if (demoMode) return;
    if (icsCache.current) {
      setCalendarEvents(parseIcalEvents(icsCache.current, date));
    }
  }, [date, demoMode]);

  const handleLoadCalendar = useCallback(() => {
    const url = icalUrlInput.trim() || undefined;
    const s = { ...settings, icalUrl: url };
    setSettings(s);
    pushSettings(s);
    setCommittedIcalUrl(url || '');
  }, [icalUrlInput, settings, pushSettings]);

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
  const currentMinuteKey = `${currentTime.getHours()}:${currentTime.getMinutes()}`;
  const scheduledTasks = useMemo(
    () => scheduleTasks(tasks, settings.dayStartHour, settings.dayEndHour, currentTime, settings.autoAdvance, calendarEvents, settings.meetingBufferMinutes, isToday),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, settings.dayStartHour, settings.dayEndHour, currentMinuteKey, settings.autoAdvance, calendarEvents, settings.meetingBufferMinutes, isToday]
  );

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
  }, [tasks.length, pushTask]);

  const handleUpdateTask = useCallback((taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => {
    if (!editingTask) return;
    const updated: Task = {
      ...editingTask,
      ...taskData,
      updatedAt: new Date().toISOString(),
    };
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    pushTask('update', updated);
    setEditingTask(undefined);
  }, [editingTask, pushTask]);

  const handleToggleComplete = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const toggled = { ...t, completed: !t.completed, updatedAt: new Date().toISOString() };
      pushTask('update', toggled);
      return toggled;
    }));
  }, [pushTask]);

  const handleToggleImportant = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const toggled = { ...t, important: !t.important, updatedAt: new Date().toISOString() };
      pushTask('update', toggled);
      return toggled;
    }));
  }, [pushTask]);

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
  }, [tasks, pushTask, activeTaskId]);

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
  const goPrev = () => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setDate(d.toISOString().slice(0, 10));
  };
  const goNext = () => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setDate(d.toISOString().slice(0, 10));
  };

  // Demo mode
  const enterDemoMode = useCallback(() => {
    stashedState.current = {
      tasks, settings, backlogTasks, calendarEvents, icsCache: icsCache.current, date,
      editingTask, activeTaskId,
    };
    icsCache.current = null;
    setTasks(getDemoTasks());
    setSettings(getDemoSettings());
    setBacklogTasks(getDemoBacklogTasks());
    setCalendarEvents(getDemoCalendarEvents());
    setDate(todayString());
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

  const pomodoroState: PomodoroState = pomodoro.state;

  return (
    <div className={`app ${settings.theme === 'dark' ? 'dark' : settings.theme === 'light' ? 'light' : ''}`}>
      <header className="app-header">
        <div className="app-title-group">
          <h1 className="app-title">
            <img src="/favicon.svg" alt="" className="app-logo" aria-hidden="true" />
            ChronoTasker
          </h1>
          <button
            className="help-trigger-btn"
            onClick={() => setShowHelp(true)}
            aria-label="How to use ChronoTasker"
            title="How to use ChronoTasker"
          >
            ?
          </button>
        </div>
        <div className="header-status">
          <span className={`sync-indicator ${demoMode ? 'demo' : isOnline ? 'online' : 'offline'}`} aria-live="polite">
            {demoMode ? 'demo' : isSyncing ? 'syncing...' : isOnline ? 'online' : 'offline'}
          </span>
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
        <div id="settings-panel" className="settings-panel" role="region" aria-label="Settings" onKeyDown={e => { if (e.key === 'Escape') setShowSettings(false); }}>
          <h2>Settings</h2>

          {/* Display section */}
          <h3 className="settings-panel__section-heading">Display</h3>
          <label>
            Day start:
            <input type="time" value={`${String(settings.dayStartHour).padStart(2, '0')}:00`}
              onChange={e => {
                const h = parseInt(e.target.value.split(':')[0], 10);
                if (!isNaN(h)) {
                  const s = { ...settings, dayStartHour: h };
                  setSettings(s); debouncedPushSettings(s);
                }
              }} />
          </label>
          <label>
            Day end:
            <input type="time" value={`${String(settings.dayEndHour).padStart(2, '0')}:00`}
              onChange={e => {
                const h = parseInt(e.target.value.split(':')[0], 10);
                if (!isNaN(h)) {
                  const s = { ...settings, dayEndHour: h };
                  setSettings(s); debouncedPushSettings(s);
                }
              }} />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.use24Hour}
              onChange={e => {
                const s = { ...settings, use24Hour: e.target.checked };
                setSettings(s); debouncedPushSettings(s);
              }} />
            Use 24-hour time
          </label>
          <label>
            Theme:
            <select value={settings.theme} onChange={e => {
              const s = { ...settings, theme: e.target.value as AppSettings['theme'] };
              setSettings(s); debouncedPushSettings(s);
            }}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          {/* Advanced section (only when advancedMode is on) */}
          {settings.advancedMode && (
            <>
              {/* Pomodoro section */}
              <h3 className="settings-panel__section-heading">Pomodoro</h3>
              <label className="checkbox-label">
                <input type="checkbox" checked={settings.showPomodoroTimer}
                  onChange={e => {
                    const s = { ...settings, showPomodoroTimer: e.target.checked };
                    setSettings(s); debouncedPushSettings(s);
                  }} />
                Show Pomodoro Timer
              </label>
              <label>
                Work duration (min):
                <input type="number" value={settings.workDuration} min={1} max={120}
                  onChange={e => {
                    const s = { ...settings, workDuration: Number(e.target.value) };
                    setSettings(s); debouncedPushSettings(s);
                  }} />
              </label>
              <label>
                Short break (min):
                <input type="number" value={settings.shortBreakDuration} min={1} max={30}
                  onChange={e => {
                    const s = { ...settings, shortBreakDuration: Number(e.target.value) };
                    setSettings(s); debouncedPushSettings(s);
                  }} />
              </label>
              <label>
                Long break (min):
                <input type="number" value={settings.longBreakDuration} min={1} max={60}
                  onChange={e => {
                    const s = { ...settings, longBreakDuration: Number(e.target.value) };
                    setSettings(s); debouncedPushSettings(s);
                  }} />
              </label>
              <h3 className="settings-panel__section-heading">Scheduling</h3>
              <label className="checkbox-label">
                <input type="checkbox" checked={settings.autoAdvance}
                  onChange={e => {
                    const s = { ...settings, autoAdvance: e.target.checked };
                    setSettings(s); debouncedPushSettings(s);
                  }} />
                Auto-advance (push incomplete tasks)
              </label>
              <label>
                iCal feed URL:
                <div className="ical-input-row">
                  <input
                    type="url"
                    value={icalUrlInput}
                    placeholder="https://calendar.proton.me/..."
                    onChange={e => setIcalUrlInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleLoadCalendar(); }}
                  />
                  <button
                    className="ical-load-btn"
                    onClick={handleLoadCalendar}
                    disabled={icalLoading}
                  >
                    {icalLoading ? 'Loading...' : committedIcalUrl ? 'Reload' : 'Load'}
                  </button>
                </div>
              </label>
              {committedIcalUrl && (
                <label>
                  Buffer after meetings (min):
                  <input type="number" value={settings.meetingBufferMinutes} min={0} max={60}
                    onChange={e => {
                      const s = { ...settings, meetingBufferMinutes: Number(e.target.value) };
                      setSettings(s); debouncedPushSettings(s);
                    }} />
                </label>
              )}
              {icalError && (
                <span className="settings-hint settings-hint--error" role="alert">{icalError}</span>
              )}
              {calendarEvents.length > 0 && (
                <span className="settings-hint">
                  {calendarEvents.length} event{calendarEvents.length !== 1 ? 's' : ''} loaded
                </span>
              )}
              {committedIcalUrl && !icalError && calendarEvents.length === 0 && !icalLoading && (
                <span className="settings-hint">No events for this date</span>
              )}
              <label className="checkbox-label">
                <input type="checkbox" checked={settings.enableRecurringTasks}
                  onChange={e => {
                    const s = { ...settings, enableRecurringTasks: e.target.checked };
                    setSettings(s); debouncedPushSettings(s);
                  }} />
                Recurring tasks
              </label>
              <label className="checkbox-label">
                <input type="checkbox" checked={settings.enableBacklog}
                  onChange={e => {
                    const s = { ...settings, enableBacklog: e.target.checked };
                    setSettings(s); debouncedPushSettings(s);
                  }} />
                Backlog
              </label>
            </>
          )}

          {/* Mode section (always visible, at bottom) */}
          <h3 className="settings-panel__section-heading">Mode</h3>
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.advancedMode}
              onChange={e => {
                const s = { ...settings, advancedMode: e.target.checked };
                setSettings(s); debouncedPushSettings(s);
              }} />
            Advanced mode
          </label>
          <span className="settings-hint">Adds fixed-time scheduling, calendar integration, recurring tasks, and more</span>
        </div>
      )}

      <div className="date-nav">
        <button onClick={goPrev} aria-label="Previous day" title="Previous day">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="current-date">{formatDate(date)}</span>
        <button onClick={goNext} aria-label="Next day" title="Next day">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {date !== todayString() && (
          <button onClick={goToday} className="today-btn">Today</button>
        )}
      </div>

      <main className="app-main">
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
            currentTime={currentTime}
            activeTaskId={activeTaskId}
            pomodoroState={pomodoroState}
            onTaskClick={setActiveTaskId}
            onSlotsResolved={setClockColorMap}
          />
          {calendarEvents.length > 0 && (
            <div className="calendar-events">
              <h3 className="calendar-events__heading">Calendar</h3>
              <ul className="calendar-events__list">
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
                      <li key={event.uid} className="calendar-events__item">
                        <span className="calendar-events__time">{timeStr}</span>
                        <span className="calendar-events__summary">{event.summary}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </section>

        <section className="sidebar">
          {/* Collapsible Pomodoro Timer */}
          {settings.showPomodoroTimer && (
            <div className="collapsible-section">
              <button
                className="collapsible-section__header"
                onClick={() => setShowTimer(!showTimer)}
                aria-expanded={showTimer}
              >
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
                      const override = task && task.durationMinutes < settings.workDuration
                        ? task.durationMinutes
                        : undefined;
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
            </div>
          )}

          {/* Task Form */}
          {settings.advancedMode ? (
            <div className="collapsible-section">
              <button
                className="collapsible-section__header"
                onClick={() => setShowForm(!showForm)}
                aria-expanded={showForm}
              >
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
                    existingTags={[...new Set(tasks.map(t => t.tag).filter((t): t is string => !!t))]}
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
            </div>
          ) : (
            <div className="sidebar-section">
              <TaskForm
                onSubmit={editingTask ? handleUpdateTask : handleAddTask}
                editingTask={editingTask}
                onCancel={editingTask ? () => setEditingTask(undefined) : undefined}
                date={date}
                existingTags={[...new Set(tasks.map(t => t.tag).filter((t): t is string => !!t))]}
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

          {/* Task List */}
          {settings.advancedMode ? (
            <div className="collapsible-section">
              <button
                className="collapsible-section__header"
                onClick={() => setShowTaskList(!showTaskList)}
                aria-expanded={showTaskList}
              >
                <svg className={`collapsible-section__chevron ${showTaskList ? 'collapsible-section__chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="collapsible-section__title">Tasks</span>
                {!showTaskList && (
                  <span className="collapsible-section__count">
                    {tasks.filter(t => !t.completed).length} remaining
                  </span>
                )}
              </button>
              {showTaskList && (
                <div className="collapsible-section__body collapsible-section__body--flush">
                  <TaskList
                    tasks={tasksWithScheduleInfo}
                    colorMap={clockColorMap}
                    activeTaskId={activeTaskId}
                    onToggleComplete={handleToggleComplete}
                    onToggleImportant={handleToggleImportant}
                    onDeleteTask={handleDeleteTask}
                    onEditTask={setEditingTask}
                    onReorder={handleReorder}
                    onReorderAll={handleReorderAll}
                    onSelectTask={setActiveTaskId}
                    onRescheduleTask={handleRescheduleTask}
                    onMoveAllToTomorrow={handleMoveAllToTomorrow}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="sidebar-section sidebar-section--flush">
              <TaskList
                tasks={tasksWithScheduleInfo}
                colorMap={clockColorMap}
                activeTaskId={activeTaskId}
                onToggleComplete={handleToggleComplete}
                onToggleImportant={handleToggleImportant}
                onDeleteTask={handleDeleteTask}
                onEditTask={setEditingTask}
                onReorder={handleReorder}
                onReorderAll={handleReorderAll}
                onSelectTask={setActiveTaskId}
                onMoveAllToTomorrow={handleMoveAllToTomorrow}
              />
            </div>
          )}

          {/* Collapsible Backlog (only when advanced + enabled) */}
          {settings.advancedMode && settings.enableBacklog && (
            <div className="collapsible-section">
              <button
                className="collapsible-section__header"
                onClick={() => setShowBacklog(!showBacklog)}
                aria-expanded={showBacklog}
              >
                <svg className={`collapsible-section__chevron ${showBacklog ? 'collapsible-section__chevron--open' : ''}`} width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="collapsible-section__title">Backlog</span>
                {!showBacklog && (
                  <span className="collapsible-section__count">
                    {backlogTasks.length} task{backlogTasks.length !== 1 ? 's' : ''}
                  </span>
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
            </div>
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
    </div>
  );
}

export default App;
