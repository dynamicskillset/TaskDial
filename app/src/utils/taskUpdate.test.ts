import { describe, it, expect } from 'vitest';
import { normalizeTaskForUpdate } from './taskUpdate';
import type { Task } from '../types';

// These tests define the correct behaviour for Bug #22.
// When a user removes a time value from a task, `fixedStartTime` becomes
// `undefined` in the Partial<Task> update object.  TypeScript optional fields
// with value `undefined` are silently dropped by JSON.stringify, so the server
// never receives the null and the old value survives in the DB.
//
// `normalizeTaskForUpdate` converts any undefined optional-nullable fields to
// `null` so they are present in the serialised body and the server can clear them.

function makeUpdates(overrides: Partial<Task> = {}): Partial<Task> {
  return { title: 'Task', durationMinutes: 30, ...overrides };
}

describe('normalizeTaskForUpdate', () => {
  // --- fixedStartTime ---

  it('converts undefined fixedStartTime to null', () => {
    const result = normalizeTaskForUpdate(makeUpdates({ fixedStartTime: undefined }));
    // Key must be present in the object (not absent) so JSON.stringify includes it
    expect(Object.prototype.hasOwnProperty.call(result, 'fixedStartTime')).toBe(true);
    expect(result.fixedStartTime).toBeNull();
  });

  it('preserves an explicit null fixedStartTime', () => {
    // null as any because the type is `string | undefined` — we're loosening it
    const result = normalizeTaskForUpdate(makeUpdates({ fixedStartTime: null as any }));
    expect(result.fixedStartTime).toBeNull();
  });

  it('preserves a set fixedStartTime string', () => {
    const result = normalizeTaskForUpdate(makeUpdates({ fixedStartTime: '09:30' }));
    expect(result.fixedStartTime).toBe('09:30');
  });

  // --- serialisation round-trip ---

  it('null fixedStartTime survives JSON.stringify (key is present)', () => {
    const result = normalizeTaskForUpdate(makeUpdates({ fixedStartTime: undefined }));
    const json = JSON.stringify(result);
    expect(json).toContain('"fixedStartTime":null');
  });

  it('undefined fixedStartTime is dropped by JSON.stringify — documents the root-cause bug', () => {
    // This test exists to document WHY the normalisation is needed.
    // It does NOT test normalizeTaskForUpdate — it tests native JS behaviour.
    const raw = makeUpdates({ fixedStartTime: undefined });
    const json = JSON.stringify(raw);
    expect(json).not.toContain('fixedStartTime');
  });

  // --- other fields are unchanged ---

  it('does not mutate fields that are already set', () => {
    const input = makeUpdates({ title: 'Keep', durationMinutes: 45 });
    const result = normalizeTaskForUpdate(input);
    expect(result.title).toBe('Keep');
    expect(result.durationMinutes).toBe(45);
  });

  it('does not mutate the original object', () => {
    const input = makeUpdates({ fixedStartTime: undefined });
    normalizeTaskForUpdate(input);
    // Original should still have undefined, not null
    expect(input.fixedStartTime).toBeUndefined();
  });

  it('returns a new object reference', () => {
    const input = makeUpdates({ fixedStartTime: undefined });
    const result = normalizeTaskForUpdate(input);
    expect(result).not.toBe(input);
  });
});
