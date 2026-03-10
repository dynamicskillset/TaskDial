// 8 hues, 45° apart — each maps to a clearly distinct perceptual colour:
// red, amber, yellow-green, green, teal, blue, purple, pink.
// Wider gaps mean tags that hash to adjacent slots still look obviously different.
const TAG_HUES = [5, 50, 95, 145, 185, 225, 270, 320];

/** Deterministic hue from a tag string. Same tag always returns the same hue;
 *  different tags are distributed across 12 evenly-spaced hue slots. */
export function tagHue(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_HUES[Math.abs(hash) % TAG_HUES.length];
}

export function tagColor(tag: string): string {
  return `hsl(${tagHue(tag)}, var(--tag-saturation, 55%), var(--tag-text-lightness, 40%))`;
}

export function tagBgColor(tag: string): string {
  return `hsl(${tagHue(tag)}, var(--tag-saturation, 55%), var(--tag-bg-lightness, 92%))`;
}

/**
 * Read the accent hue from the CSS custom property --color-accent-hue.
 * Falls back to 210 (Nord blue) if not set.
 */
export function getAccentHue(): number {
  const h = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--color-accent-hue'),
  );
  return isNaN(h) ? 210 : h;
}

/**
 * Shift a hue away from the accent hue if it falls within `clearance` degrees.
 */
export function shiftFromAccent(hue: number, accentHue: number, clearance = 40): number {
  const diff = ((hue - accentHue + 180 + 360) % 360) - 180;
  if (Math.abs(diff) < clearance) {
    return (accentHue + (diff >= 0 ? clearance : -clearance) + 360) % 360;
  }
  return hue;
}

/**
 * Generate a pastel HSL colour for a task arc.
 * If the task has a tag, use a deterministic colour from the tag.
 * Otherwise, fall back to index-based colour distribution.
 * In both cases, hues too close to the accent colour are shifted away.
 */
export function taskArcColor(index: number, total: number, tag?: string): string {
  const accentHue = getAccentHue();
  const raw = tag
    ? tagHue(tag)
    : (index * (360 / Math.max(total, 1)) + 200) % 360;
  const hue = shiftFromAccent(raw, accentHue);
  return `hsl(${hue}, var(--color-task-saturation, 62%), var(--color-task-lightness, 68%))`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
