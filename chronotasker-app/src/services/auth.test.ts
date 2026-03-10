// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { getUser, setUser, clearUser, isAdmin } from './auth';

const ALICE = { id: 'user-1', email: 'alice@example.com', role: 'user' };
const ADMIN = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
const OWNER = { id: 'owner-1', email: 'owner@example.com', role: 'owner' };

beforeEach(() => {
  localStorage.clear();
});

describe('getUser', () => {
  it('returns null when nothing is stored', () => {
    expect(getUser()).toBeNull();
  });

  it('returns null when stored value is malformed JSON', () => {
    localStorage.setItem('ct_user', 'not-json{');
    expect(getUser()).toBeNull();
  });
});

describe('setUser / getUser', () => {
  it('round-trips a user object', () => {
    setUser(ALICE);
    expect(getUser()).toEqual(ALICE);
  });

  it('overwrites a previously stored user', () => {
    setUser(ALICE);
    setUser(ADMIN);
    expect(getUser()).toEqual(ADMIN);
  });

  it('preserves all fields', () => {
    setUser(OWNER);
    const stored = getUser();
    expect(stored?.id).toBe('owner-1');
    expect(stored?.email).toBe('owner@example.com');
    expect(stored?.role).toBe('owner');
  });
});

describe('clearUser', () => {
  it('removes the stored user', () => {
    setUser(ALICE);
    clearUser();
    expect(getUser()).toBeNull();
  });

  it('is a no-op when nothing is stored', () => {
    expect(() => clearUser()).not.toThrow();
  });
});

describe('isAdmin', () => {
  it('returns false when no user is stored', () => {
    expect(isAdmin()).toBe(false);
  });

  it('returns false for role "user"', () => {
    setUser(ALICE);
    expect(isAdmin()).toBe(false);
  });

  it('returns true for role "admin"', () => {
    setUser(ADMIN);
    expect(isAdmin()).toBe(true);
  });

  it('returns true for role "owner"', () => {
    setUser(OWNER);
    expect(isAdmin()).toBe(true);
  });
});
