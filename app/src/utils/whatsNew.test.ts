import { describe, it, expect } from 'vitest';
import { shouldShowWhatsNew } from './whatsNew';

// These tests define the correct behaviour for Bug #28.
// The function is extracted from the App.tsx useState initialiser so it can
// be tested in isolation.

describe('shouldShowWhatsNew', () => {
  // --- new users ---

  it('returns false for a brand-new user with no stored version', () => {
    // Bug: current App.tsx code returns true here (null !== '1.3' is true)
    expect(shouldShowWhatsNew(null, '1.3.2')).toBe(false);
  });

  it('returns false for a brand-new user on any version', () => {
    expect(shouldShowWhatsNew(null, '1.0.0')).toBe(false);
    expect(shouldShowWhatsNew(null, '2.1.0')).toBe(false);
  });

  // --- SHAME (patch) bumps — should NOT show ---

  it('returns false when only the SHAME segment has changed', () => {
    // User dismissed at 1.3 (stored as '1.3'), now on 1.3.2 — no banner
    expect(shouldShowWhatsNew('1.3', '1.3.2')).toBe(false);
  });

  it('returns false when the current version is a different SHAME on the same DEFAULT', () => {
    expect(shouldShowWhatsNew('1.3', '1.3.9')).toBe(false);
  });

  // --- DEFAULT (minor) bumps — should show ---

  it('returns true when the DEFAULT segment has changed', () => {
    // User last saw 1.2; app is now at 1.3.0
    expect(shouldShowWhatsNew('1.2', '1.3.0')).toBe(true);
  });

  it('returns true when the DEFAULT segment has changed, ignoring SHAME', () => {
    // User last saw 1.2; app is now at 1.3.2 (SHAME release but DEFAULT is new)
    expect(shouldShowWhatsNew('1.2', '1.3.2')).toBe(true);
  });

  // --- PROUD (major) bumps — should show ---

  it('returns true when the PROUD segment has changed', () => {
    expect(shouldShowWhatsNew('1.3', '2.0.0')).toBe(true);
  });

  // --- already dismissed at current DEFAULT ---

  it('returns false when the user has already seen this DEFAULT version', () => {
    expect(shouldShowWhatsNew('1.3', '1.3.0')).toBe(false);
  });

  it('returns false when stored value exactly matches the derived minor version', () => {
    expect(shouldShowWhatsNew('2.1', '2.1.5')).toBe(false);
  });
});
