/**
 * Returns true if the "What's new?" banner should be shown.
 *
 * Only shows for DEFAULT (minor) or PROUD (major) version bumps.
 * SHAME (patch) bumps and brand-new users do not see the banner.
 *
 * @param stored     The value previously saved in localStorage (null if never set).
 * @param currentVersion  The full semver version string, e.g. '1.3.2'.
 */
export function shouldShowWhatsNew(stored: string | null, currentVersion: string): boolean {
  if (stored === null) return false;
  const parts = currentVersion.split('.');
  const minor = `${parts[0] ?? '0'}.${parts[1] ?? '0'}`;
  return stored !== minor;
}
