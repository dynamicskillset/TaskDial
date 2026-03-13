import type { Task, PomodoroSession, AppSettings } from '../types';
import type { AuthUser } from './auth';
import * as cryptoService from './crypto';
import { normalizeTaskForUpdate } from '../utils/taskUpdate';

const API_URL = import.meta.env.VITE_API_URL || '';

// ── 401 intercept with token refresh ─────────────────────────────────────────

let isRefreshing = false;
let refreshQueue: Array<() => void> = [];

function notifyAuthExpired(): void {
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

async function attemptRefresh(): Promise<boolean> {
  if (isRefreshing) {
    // Another request is already refreshing — wait for it
    return new Promise(resolve => {
      refreshQueue.push(() => resolve(true));
    });
  }

  isRefreshing = true;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    const ok = res.ok;
    refreshQueue.forEach(fn => fn());
    refreshQueue = [];
    return ok;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}

// ── Core request ──────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401 && !isRetry) {
    const refreshed = await attemptRefresh();
    if (refreshed) {
      return request<T>(path, options, true);
    }
    notifyAuthExpired();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return fromApi<T>(json);
}

// ── snake_case / camelCase conversion ─────────────────────────────────────────

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

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Login failed');
  }
  const data = await res.json();
  if (data.key_salt) {
    await cryptoService.initKey(password, data.key_salt, data.user.id);
  }
  return data.user as AuthUser;
}

export async function register(email: string, password: string, inviteCode: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, invite_code: inviteCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Registration failed');
  }
  const data = await res.json();
  if (data.key_salt) {
    await cryptoService.initKey(password, data.key_salt, data.user.id);
  }
  return data.user as AuthUser;
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {/* best effort */});
}

export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    credentials: 'include',
  });
  if (!res.ok) return null;
  return res.json();
}

export async function refreshToken(): Promise<boolean> {
  return attemptRefresh();
}

// ── Task encryption helpers ────────────────────────────────────────────────────

const ENCRYPTED_FIELDS = ['title', 'tag', 'details'] as const;

async function encryptTask(task: Partial<Task>): Promise<Partial<Task>> {
  if (!cryptoService.hasKey()) return task;
  const out = { ...task };
  for (const field of ENCRYPTED_FIELDS) {
    const val = (out as any)[field];
    if (typeof val === 'string' && val.length > 0) {
      (out as any)[field] = await cryptoService.encrypt(val);
    }
  }
  return out;
}

async function decryptTask(task: Task): Promise<Task> {
  if (!cryptoService.hasKey()) {
    // If any field looks encrypted but we have no key, surface a clear error
    // rather than silently returning ciphertext to the UI (Bug #26)
    for (const field of ENCRYPTED_FIELDS) {
      const val = (task as any)[field];
      if (typeof val === 'string' && cryptoService.isEncrypted(val)) {
        throw new Error('Encryption key not ready');
      }
    }
    return task;
  }
  const out = { ...task };
  for (const field of ENCRYPTED_FIELDS) {
    const val = (out as any)[field];
    if (typeof val === 'string' && val.length > 0) {
      try {
        (out as any)[field] = await cryptoService.decrypt(val);
      } catch {
        // Decryption failed — leave as-is (may be plaintext from before E2EE)
      }
    }
  }
  return out;
}

async function decryptTasks(tasks: Task[]): Promise<Task[]> {
  return Promise.all(tasks.map(decryptTask));
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function fetchTasks(date: string): Promise<Task[]> {
  const tasks = await request<Task[]>(`/api/tasks?date=${date}`);
  return decryptTasks(tasks);
}

export async function createTask(task: Task): Promise<Task> {
  const encrypted = await encryptTask(task);
  const result = await request<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(toApi(encrypted)),
  });
  return decryptTask(result);
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<Task> {
  const encrypted = await encryptTask(normalizeTaskForUpdate(updates) as Partial<Task>);
  const result = await request<Task>(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(toApi(encrypted)),
  });
  return decryptTask(result);
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

// ── Pomodoro ──────────────────────────────────────────────────────────────────

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

// ── Settings ──────────────────────────────────────────────────────────────────

export async function fetchSettings(): Promise<Partial<AppSettings>> {
  return request<Partial<AppSettings>>('/api/settings');
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  await request('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(toApi(settings)),
  });
}

// ── Sync ──────────────────────────────────────────────────────────────────────

export async function syncData(since: string): Promise<{
  tasks: Task[];
  pomodoroSessions: PomodoroSession[];
  settings: Partial<AppSettings>;
  serverTime: string;
}> {
  const data = await request<{
    tasks: Task[];
    pomodoroSessions: PomodoroSession[];
    settings: Partial<AppSettings>;
    serverTime: string;
  }>(`/api/sync?since=${encodeURIComponent(since)}`);
  data.tasks = await decryptTasks(data.tasks);
  return data;
}

// ── Recurrence ────────────────────────────────────────────────────────────────

export async function generateRecurring(date: string): Promise<{ created: Task[] }> {
  const result = await request<{ created: Task[] }>('/api/recurrence/generate', {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
  result.created = await decryptTasks(result.created);
  return result;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export async function fetchCalendar(url: string): Promise<string> {
  const res = await fetch(`${API_URL}/api/calendar/fetch?url=${encodeURIComponent(url)}`, {
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || `Calendar fetch failed: ${res.status}`);
  }

  return res.text();
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function logInstallEvent(event: 'impression' | 'install' | 'dismiss'): Promise<void> {
  try {
    await request('/api/analytics/install', {
      method: 'POST',
      body: JSON.stringify({ event, timestamp: new Date().toISOString() }),
    });
  } catch {
    // Best-effort
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  is_active: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  last_seen: string | null;
}

export interface AdminInvite {
  id: string;
  code: string;
  expiresAt: string | null;
  createdAt: string;
  useLimit: number | null;
  useCount: number;
  revoked: number;
  createdByEmail: string;
  uses: Array<{ email: string; usedAt: string }>;
}

export interface AuditEntry {
  id: number;
  action: string;
  detail: string | null;
  ip: string | null;
  created_at: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalTasks: number;
  tasksThisWeek: number;
  sessionsThisWeek: number;
  loginsToday: number;
}

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  return request<T>(`/api/admin${path}`, options);
}

export async function forgotPassword(email: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Request failed');
  }
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Password reset failed');
  }
}

export async function fetchAdminUsers(): Promise<{ active: AdminUser[]; deleted: AdminUser[] }> {
  return adminRequest('/users');
}

export async function disableUser(id: string): Promise<void> {
  await adminRequest(`/users/${id}/disable`, { method: 'PATCH' });
}

export async function enableUser(id: string): Promise<void> {
  await adminRequest(`/users/${id}/enable`, { method: 'PATCH' });
}

export async function deleteUser(id: string): Promise<void> {
  await adminRequest(`/users/${id}`, { method: 'DELETE' });
}

export async function purgeUser(id: string): Promise<void> {
  await adminRequest(`/users/${id}/purge`, { method: 'DELETE' });
}

export async function fetchAdminInvites(): Promise<AdminInvite[]> {
  return adminRequest('/invites');
}

export async function createInvite(expiresAt?: string): Promise<AdminInvite> {
  return adminRequest('/invites', {
    method: 'POST',
    body: JSON.stringify({ expires_at: expiresAt || null }),
  });
}

export async function revokeInvite(id: string): Promise<void> {
  await adminRequest(`/invites/${id}`, { method: 'DELETE' });
}

export async function fetchAuditLog(): Promise<AuditEntry[]> {
  return adminRequest('/audit');
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return adminRequest('/stats');
}

// ── User data (export / import / delete account) ──────────────────────────────

export async function exportData(): Promise<void> {
  const res = await fetch(`${API_URL}/api/user/export`, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error || 'Export failed');
  }
  const blob = await res.blob();
  const dateStr = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `taskdial-export-${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  imported: { tasks: number; sessions: number };
}

export async function importData(file: File): Promise<ImportResult> {
  const text = await file.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch {
    throw new Error('The file is not valid JSON');
  }
  const res = await fetch(`${API_URL}/api/user/import`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).error || 'Import failed');
  return body as ImportResult;
}

export async function deleteAccount(password: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/user/account`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 204) return;
  const body = await res.json().catch(() => ({}));
  throw new Error((body as any).error || 'Account deletion failed');
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
