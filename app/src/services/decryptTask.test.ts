// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// These tests define the correct behaviour for Bug #26.
//
// When the E2EE key has not yet been derived (e.g. PBKDF2 is still running on
// mobile), `decryptTask` currently returns the raw ciphertext silently, causing
// encrypted blobs to appear in the UI.
//
// The fix: when `hasKey()` is false but a field value looks encrypted (starts
// with the 'enc:' prefix), throw a named error rather than returning the task
// with ciphertext intact.  This surfaces the failure explicitly so the calling
// code can keep the UI in a loading state.

// Mock the crypto service before importing api so the module picks up the mock.
vi.mock('./crypto', () => ({
  hasKey: vi.fn(() => false),
  isEncrypted: (value: string) => value.startsWith('enc:'),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  initKey: vi.fn(),
  loadKeyFromSession: vi.fn(),
  clearKey: vi.fn(),
  getCurrentUserId: vi.fn(() => null),
}));

// We need to mock global fetch so api.ts request() calls don't hit the network.
const mockTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'enc:aGVsbG8=:iv123',  // looks encrypted
  tag: null,
  details: null,
  duration_minutes: 30,
  completed: false,
  important: false,
  is_break: false,
  sort_order: 0,
  date: '2026-01-01',
  created_at: '2026-01-01T09:00:00Z',
  updated_at: '2026-01-01T09:00:00Z',
  ...overrides,
});

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeFetchResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 401,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('fetchTasks — key not ready', () => {
  it('throws an error when tasks contain encrypted values but no key is available', async () => {
    fetchSpy.mockReturnValue(makeFetchResponse([mockTask()]));

    // Dynamically import so the vi.mock above is applied
    const { fetchTasks } = await import('./api');

    await expect(fetchTasks('2026-01-01')).rejects.toThrow('Encryption key not ready');
  });

  it('does not throw when the task has no encrypted fields (plaintext / legacy data)', async () => {
    fetchSpy.mockReturnValue(makeFetchResponse([mockTask({ title: 'Plain task' })]));

    const { fetchTasks } = await import('./api');

    // Should resolve without throwing — plaintext tasks are safe to render
    await expect(fetchTasks('2026-01-01')).resolves.toBeDefined();
  });

  it('does not throw when the task list is empty', async () => {
    fetchSpy.mockReturnValue(makeFetchResponse([]));

    const { fetchTasks } = await import('./api');

    await expect(fetchTasks('2026-01-01')).resolves.toEqual([]);
  });
});
