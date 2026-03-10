import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, PomodoroSession, AppSettings } from '../types';
import * as api from '../services/api';
import * as storage from '../services/storage';

interface UseSyncOptions {
  intervalMs?: number;
  onTasksUpdated: (tasks: Task[]) => void;
  onSessionsUpdated: (sessions: PomodoroSession[]) => void;
  onSettingsUpdated: (settings: AppSettings) => void;
  onAuthRequired?: () => void;
  date: string;
  enableRecurringTasks?: boolean;
  paused?: boolean;
}

export function useSync({
  intervalMs = 30000,
  onTasksUpdated,
  onSessionsUpdated,
  onSettingsUpdated,
  onAuthRequired,
  date,
  enableRecurringTasks = false,
  paused = false,
}: UseSyncOptions) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncTimeRef = useRef(storage.getLastSync());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const online = await api.healthCheck();
      setIsOnline(online);

      if (!online) {
        // Load from local storage when offline
        onTasksUpdated(storage.getLocalTasks(date));
        onSessionsUpdated(storage.getLocalSessions(date));
        onSettingsUpdated(storage.getLocalSettings());
        setIsSyncing(false);
        return;
      }

      // Pull from server
      const data = await api.syncData(lastSyncTimeRef.current);

      // Merge tasks
      if (data.tasks.length > 0) {
        for (const task of data.tasks) {
          storage.upsertLocalTask(task);
        }
      }

      // Generate recurring task instances for this date
      if (enableRecurringTasks) {
        try {
          const result = await api.generateRecurring(date);
          if (result.created.length > 0) {
            for (const task of result.created) {
              storage.upsertLocalTask(task);
            }
          }
        } catch {
          // Recurrence generation failed, continue with existing tasks
        }
      }

      onTasksUpdated(storage.getLocalTasks(date));

      // Merge sessions
      if (data.pomodoroSessions.length > 0) {
        for (const session of data.pomodoroSessions) {
          storage.upsertLocalSession(session);
        }
      }
      onSessionsUpdated(storage.getLocalSessions(date));

      // Merge settings
      if (Object.keys(data.settings).length > 0) {
        storage.saveLocalSettings(data.settings);
      }
      onSettingsUpdated(storage.getLocalSettings());

      // Update sync timestamp (ref only — no state change, no re-render loop)
      lastSyncTimeRef.current = data.serverTime;
      storage.setLastSync(data.serverTime);
    } catch (err: any) {
      if (err?.message === 'Session expired') {
        onAuthRequired?.();
        return;
      }
      setIsOnline(false);
      // Fall back to local
      onTasksUpdated(storage.getLocalTasks(date));
      onSessionsUpdated(storage.getLocalSessions(date));
      onSettingsUpdated(storage.getLocalSettings());
    } finally {
      setIsSyncing(false);
    }
  }, [date, onTasksUpdated, onSessionsUpdated, onSettingsUpdated, enableRecurringTasks]);

  // Push a task change to server (fire and forget, save locally first)
  const pushTask = useCallback(async (action: 'create' | 'update' | 'delete', task: Task) => {
    if (paused) return;
    storage.upsertLocalTask(task);

    try {
      if (action === 'create') {
        await api.createTask(task);
      } else if (action === 'update') {
        await api.updateTask(task.id, task);
      } else if (action === 'delete') {
        storage.removeLocalTask(task.id);
        await api.deleteTask(task.id);
      }
    } catch {
      // Offline — local storage has it, will sync later
    }
  }, [paused]);

  const pushRecurringDelete = useCallback(async (
    sourceId: string,
    mode: 'single' | 'all' | 'future',
    taskId?: string,
    fromDate?: string,
  ) => {
    if (paused) return;
    try {
      if (mode === 'single' && taskId) {
        await api.deleteTask(taskId);
      } else if (mode === 'all' || mode === 'future') {
        await api.deleteRecurringTask(sourceId, mode, fromDate);
      }
    } catch {
      // Offline — local storage already updated, will sync later
    }
  }, [paused]);

  const pushSession = useCallback(async (session: PomodoroSession) => {
    if (paused) return;
    storage.upsertLocalSession(session);
    try {
      if (session.completedAt) {
        await api.updateSession(session.id, session);
      } else {
        await api.createSession(session);
      }
    } catch {
      // Offline
    }
  }, [paused]);

  const pushSettings = useCallback(async (settings: Partial<AppSettings>) => {
    if (paused) return;
    storage.saveLocalSettings(settings);
    try {
      await api.saveSettings(settings);
    } catch {
      // Offline
    }
  }, [paused]);

  // Initial sync + periodic
  useEffect(() => {
    if (paused) return;
    sync();
    intervalRef.current = setInterval(sync, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sync, intervalMs, paused]);

  // Online/offline detection
  useEffect(() => {
    if (paused) return;
    const handleOnline = () => { setIsOnline(true); sync(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [sync, paused]);

  return { isOnline, isSyncing, sync, pushTask, pushRecurringDelete, pushSession, pushSettings };
}
