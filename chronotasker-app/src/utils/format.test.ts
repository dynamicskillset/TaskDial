import { describe, it, expect } from 'vitest';
import { tagHue, tagColor, tagBgColor, formatDuration } from './format';

const TAG_HUES = [5, 50, 95, 145, 185, 225, 270, 320];

describe('tagHue', () => {
  it('returns a value from the fixed 8-hue palette', () => {
    const hue = tagHue('work');
    expect(TAG_HUES).toContain(hue);
  });

  it('is deterministic — same tag always returns same hue', () => {
    expect(tagHue('design')).toBe(tagHue('design'));
    expect(tagHue('urgent')).toBe(tagHue('urgent'));
  });

  it('handles empty string', () => {
    const hue = tagHue('');
    expect(TAG_HUES).toContain(hue);
  });

  it('different tags return different hues', () => {
    // Not guaranteed for all pairs, but these specific tags should differ
    const tags = ['work', 'personal', 'urgent', 'design', 'admin'];
    const hues = tags.map(tagHue);
    const unique = new Set(hues);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('is case-sensitive', () => {
    // 'Work' and 'work' are different strings and may land on different slots
    const lower = tagHue('work');
    const upper = tagHue('Work');
    // Both must be valid 8-hue palette values
    expect(TAG_HUES).toContain(lower);
    expect(TAG_HUES).toContain(upper);
  });
});

describe('tagColor', () => {
  it('returns an HSL string', () => {
    const color = tagColor('work');
    expect(color).toMatch(/^hsl\(/);
  });

  it('embeds the correct hue for the tag', () => {
    const hue = tagHue('design');
    expect(tagColor('design')).toContain(String(hue));
  });

  it('is deterministic', () => {
    expect(tagColor('urgent')).toBe(tagColor('urgent'));
  });
});

describe('tagBgColor', () => {
  it('returns an HSL string', () => {
    expect(tagBgColor('work')).toMatch(/^hsl\(/);
  });

  it('embeds the correct hue for the tag', () => {
    const hue = tagHue('admin');
    expect(tagBgColor('admin')).toContain(String(hue));
  });

  it('differs from tagColor for the same tag', () => {
    // Background and text colours use different lightness variables
    expect(tagBgColor('work')).not.toBe(tagColor('work'));
  });
});

describe('formatDuration', () => {
  it('formats minutes under an hour', () => {
    expect(formatDuration(25)).toBe('25min');
    expect(formatDuration(5)).toBe('5min');
    expect(formatDuration(59)).toBe('59min');
  });

  it('formats exactly one hour', () => {
    expect(formatDuration(60)).toBe('1h');
  });

  it('formats hours with remaining minutes', () => {
    expect(formatDuration(90)).toBe('1h 30min');
    expect(formatDuration(125)).toBe('2h 5min');
  });

  it('formats exact multiples of hours', () => {
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(180)).toBe('3h');
  });
});
