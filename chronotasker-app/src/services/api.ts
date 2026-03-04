import type { Task, PomodoroSession, AppSettings } from '../types';

const API_URL = import.meta.env.VITE_API_URL || '';
const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

// Snake_case to camelCase conversion for API responses
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}

function convertKeys<T>(obj: unknown, converter: (s: string) => string): T {
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeys(item, converter)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[converter(key)] = convertKeys(value, converter);
    }
    return result as T;
  }
  return obj as T;
}

function fromApi<T>(data: unknown): T {
  return convertKeys<T>(data, snakeToCamel);
}

function toApi<T>(data: unknown): T {
  return convertKeys<T>(data, camelToSnake);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Token': API_TOKEN,
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return fromApi<T>(json);
}

// Tasks
export async function fetchTasks(date: string): Promise<Task[]> {
  return request<Task[]>(`/api/tasks?date=${date}`);
}

export async function createTask(task: Task): Promise<Task> {
  return request<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(toApi(task)),
  });
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  return request<Task>(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toApi(updates)),
  });
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/api/tasks/${id}`, { method: 'DELETE' });
}

export async function deleteRecurringTask(
  sourceId: string,
  mode: 'all' | 'future',
  fromDate?: string,
): Promise<{ deletedCount: number }> {
  const params = new URLSearchParams({ mode });
  if (fromDate) params.set('from', fromDate);
  return request(`/api/tasks/recurring/${sourceId}?${params}`, { method: 'DELETE' });
}

export async function reorderTasks(taskOrders: { id: string; sortOrder: number }[]): Promise<void> {
  await request('/api/tasks/reorder', {
    method: 'PUT',
    body: JSON.stringify(toApi({ tasks: taskOrders })),
  });
}

// Pomodoro
export async function fetchSessions(date: string): Promise<PomodoroSession[]> {
  return request<PomodoroSession[]>(`/api/pomodoro/sessions?date=${date}`);
}

export async function createSession(session: PomodoroSession): Promise<PomodoroSession> {
  return request<PomodoroSession>('/api/pomodoro/sessions', {
    method: 'POST',
    body: JSON.stringify(toApi(session)),
  });
}

export async function updateSession(id: string, updates: Partial<PomodoroSession>): Promise<PomodoroSession> {
  return request<PomodoroSession>(`/api/pomodoro/sessions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toApi(updates)),
  });
}

// Settings
export async function fetchSettings(): Promise<Partial<AppSettings>> {
  return request<Partial<AppSettings>>('/api/settings');
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  await request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(toApi(settings)),
  });
}

// Sync
export async function syncData(since: string): Promise<{
  tasks: Task[];
  pomodoroSessions: PomodoroSession[];
  settings: Partial<AppSettings>;
  serverTime: string;
}> {
  return request(`/api/sync?since=${encodeURIComponent(since)}`);
}

// Recurrence
export async function generateRecurring(date: string): Promise<{ created: Task[] }> {
  return request<{ created: Task[] }>('/api/recurrence/generate', {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
}

// Calendar
export async function fetchCalendar(url: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/calendar/fetch?url=${encodeURIComponent(url)}`, {
    headers: {
      'X-API-Token': API_TOKEN,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Calendar fetch failed: ${res.status}`);
  }

  return res.text();
}

// Analytics
export async function logInstallEvent(event: 'impression' | 'install' | 'dismiss'): Promise<void> {
  try {
    await request('/api/analytics/install', {
      method: 'POST',
      body: JSON.stringify({ event, timestamp: new Date().toISOString() }),
    });
  } catch {
    // Best-effort — don't break the app for analytics
  }
}

// Health check
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
