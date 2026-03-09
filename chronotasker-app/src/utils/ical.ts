import type { CalendarEvent } from '../types';

/**
 * Parse iCal text and return events that overlap a target date.
 * Handles: line unfolding, VEVENT extraction, DTSTART/DTEND (UTC, TZID, and DATE formats),
 * and RRULE recurring events (DAILY, WEEKLY, MONTHLY, YEARLY with INTERVAL, UNTIL, COUNT,
 * BYDAY, BYMONTHDAY, BYMONTH) plus EXDATE exclusions.
 */
export function parseIcalEvents(icsText: string, targetDate: string): CalendarEvent[] {
  // Step 1: Unfold lines (RFC 5545 §3.1 — continuation lines start with space or tab)
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Step 2: Extract VEVENT blocks
  const events: CalendarEvent[] = [];
  const vevents = unfolded.split('BEGIN:VEVENT');

  for (let i = 1; i < vevents.length; i++) {
    const block = vevents[i].split('END:VEVENT')[0];
    if (!block) continue;

    const props = parseProperties(block);

    const uid = props['UID'] || `event-${i}`;
    const summary = props['SUMMARY'] || 'Busy';

    const dtstartInfo = findPropertyWithTzid(block, 'DTSTART');
    const dtendInfo = findPropertyWithTzid(block, 'DTEND');

    if (!dtstartInfo) continue;

    const start = parseIcalDate(dtstartInfo.value, dtstartInfo.tzid);
    if (!start) continue;

    const allDay = dtstartInfo.value.length === 8; // YYYYMMDD format (no time)

    let end: { date: string; minutes: number } | null = null;
    if (dtendInfo) {
      end = parseIcalDate(dtendInfo.value, dtendInfo.tzid);
    }

    // Check if this event occurs on the target date
    const rruleStr = props['RRULE'];
    if (rruleStr) {
      // Recurring event: use RRULE to check if it occurs on targetDate
      if (!rruleOccursOnDate(start, rruleStr, block, targetDate)) continue;
    } else {
      // Non-recurring: use direct overlap check
      if (!overlapsDate(start, end, allDay, targetDate)) continue;
    }

    if (allDay) {
      events.push({ uid, summary, startMinutes: 0, endMinutes: 24 * 60, allDay: true });
    } else {
      // For recurring events, the occurrence always starts at DTSTART's time of day
      const startMin = rruleStr
        ? start.minutes
        : (start.date === targetDate ? start.minutes : 0);
      const endMin = end
        ? (rruleStr ? end.minutes : (end.date === targetDate ? end.minutes : 24 * 60))
        : Math.min(startMin + 60, 24 * 60); // default 1h if no end

      events.push({ uid, summary, startMinutes: startMin, endMinutes: endMin, allDay: false });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// RRULE support
// ---------------------------------------------------------------------------

const DAY_ABBR: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

interface RruleByDay {
  day: number;       // 0=SU, 1=MO … 6=SA
  ordinal?: number;  // e.g. 1 for "1MO" (first Monday), -1 for "-1FR" (last Friday)
}

interface ParsedRrule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  untilDate?: string;   // YYYY-MM-DD
  count?: number;
  byday?: RruleByDay[];
  bymonthday?: number[];
  bymonth?: number[];
}

function parseRrule(rruleStr: string): ParsedRrule | null {
  const parts: Record<string, string> = {};
  for (const seg of rruleStr.split(';')) {
    const eq = seg.indexOf('=');
    if (eq > 0) parts[seg.slice(0, eq)] = seg.slice(eq + 1);
  }

  const freq = parts['FREQ'] as ParsedRrule['freq'];
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;

  const interval = parts['INTERVAL'] ? Math.max(1, parseInt(parts['INTERVAL'], 10)) : 1;

  let untilDate: string | undefined;
  if (parts['UNTIL']) {
    // UNTIL can be YYYYMMDD or YYYYMMDDTHHmmssZ — extract date portion only
    const raw = parts['UNTIL'].slice(0, 8);
    if (raw.length === 8) untilDate = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }

  const count = parts['COUNT'] ? parseInt(parts['COUNT'], 10) : undefined;

  let byday: RruleByDay[] | undefined;
  if (parts['BYDAY']) {
    const parsed = parts['BYDAY'].split(',').flatMap(d => {
      const m = d.match(/^(-?\d*)([A-Z]{2})$/);
      if (!m || !(m[2] in DAY_ABBR)) return [];
      return [{ day: DAY_ABBR[m[2]], ordinal: m[1] ? parseInt(m[1], 10) : undefined }];
    });
    if (parsed.length > 0) byday = parsed;
  }

  let bymonthday: number[] | undefined;
  if (parts['BYMONTHDAY']) {
    const parsed = parts['BYMONTHDAY'].split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    if (parsed.length > 0) bymonthday = parsed;
  }

  let bymonth: number[] | undefined;
  if (parts['BYMONTH']) {
    const parsed = parts['BYMONTH'].split(',').map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    if (parsed.length > 0) bymonth = parsed;
  }

  return { freq, interval, untilDate, count, byday, bymonthday, bymonth };
}

/** Extract EXDATE values from a VEVENT block as a set of YYYY-MM-DD strings. */
function extractExdates(block: string, tzid?: string): Set<string> {
  const result = new Set<string>();
  for (const line of block.split('\n')) {
    if (!line.startsWith('EXDATE')) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    // EXDATE can have its own TZID parameter
    const paramStr = line.slice('EXDATE'.length, colonIdx);
    const tzidMatch = paramStr.match(/TZID=([^;:]+)/);
    const exTzid = tzidMatch?.[1] ?? tzid;
    for (const val of line.slice(colonIdx + 1).trim().split(',')) {
      const parsed = parseIcalDate(val.trim(), exTzid);
      if (parsed) result.add(parsed.date);
    }
  }
  return result;
}

/** Returns a YYYY-MM-DD string for a Date object (local time). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Check whether a target Date matches the recurrence pattern defined by an RRULE,
 * given the DTSTART date as the anchor.
 */
function matchesRrulePattern(target: Date, start: Date, rrule: ParsedRrule): boolean {
  const diffMs = target.getTime() - start.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return false;

  switch (rrule.freq) {
    case 'DAILY':
      return diffDays % rrule.interval === 0;

    case 'WEEKLY': {
      if (rrule.byday && rrule.byday.length > 0) {
        // Check that the target day of week is in BYDAY list
        if (!rrule.byday.some(bd => bd.day === target.getDay())) return false;
        // Check interval: which "week block" since start does target fall in?
        const weeksSinceStart = Math.floor(diffDays / 7);
        return weeksSinceStart % rrule.interval === 0;
      }
      // No BYDAY: same day of week as DTSTART, every interval weeks
      if (target.getDay() !== start.getDay()) return false;
      return (diffDays / 7) % rrule.interval === 0;
    }

    case 'MONTHLY': {
      const monthsDiff =
        (target.getFullYear() - start.getFullYear()) * 12 +
        (target.getMonth() - start.getMonth());
      if (monthsDiff < 0 || monthsDiff % rrule.interval !== 0) return false;

      if (rrule.bymonthday) {
        return rrule.bymonthday.includes(target.getDate());
      }

      if (rrule.byday && rrule.byday.length > 0) {
        const targetDow = target.getDay();
        return rrule.byday.some(bd => {
          if (bd.day !== targetDow) return false;
          if (bd.ordinal === undefined) return true;
          if (bd.ordinal > 0) {
            // e.g. "1MO" = first Monday: is target the ordinal-th occurrence of that weekday?
            const ordinal = Math.ceil(target.getDate() / 7);
            return ordinal === bd.ordinal;
          } else {
            // e.g. "-1FR" = last Friday
            const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
            const ordinalFromEnd = -Math.ceil((daysInMonth - target.getDate() + 1) / 7);
            return ordinalFromEnd === bd.ordinal;
          }
        });
      }

      // Default: same day of month as DTSTART
      return target.getDate() === start.getDate();
    }

    case 'YEARLY': {
      const yearsDiff = target.getFullYear() - start.getFullYear();
      if (yearsDiff < 0 || yearsDiff % rrule.interval !== 0) return false;

      if (rrule.bymonth) {
        if (!rrule.bymonth.includes(target.getMonth() + 1)) return false;
      } else {
        if (target.getMonth() !== start.getMonth()) return false;
      }

      if (rrule.bymonthday) {
        return rrule.bymonthday.includes(target.getDate());
      }
      if (rrule.byday && rrule.byday.length > 0) {
        return rrule.byday.some(bd => bd.day === target.getDay());
      }
      return target.getDate() === start.getDate();
    }
  }
}

/**
 * For RRULE COUNT: walk forward from start, counting occurrences.
 * Returns true if targetDate is among the first COUNT occurrences.
 */
function isOccurrenceWithinCount(
  start: Date,
  target: Date,
  rrule: ParsedRrule,
  exdates: Set<string>,
): boolean {
  if (rrule.count === undefined) return true;

  let occCount = 0;
  const cur = new Date(start);

  while (true) {
    if (cur.getTime() > target.getTime()) return false;

    const ds = localDateStr(cur);
    if (matchesRrulePattern(cur, start, rrule) && !exdates.has(ds)) {
      occCount++;
      if (cur.getTime() === target.getTime()) return true;
      if (occCount >= rrule.count) return false;
    }

    cur.setDate(cur.getDate() + 1);
  }
}

/**
 * Check whether a recurring event (defined by its DTSTART + RRULE) produces
 * an occurrence on the given targetDate, respecting EXDATE and COUNT/UNTIL.
 */
function rruleOccursOnDate(
  dtstart: { date: string; minutes: number },
  rruleStr: string,
  block: string,
  targetDate: string,
): boolean {
  const rrule = parseRrule(rruleStr);
  if (!rrule) return false;

  if (targetDate < dtstart.date) return false;
  if (rrule.untilDate && targetDate > rrule.untilDate) return false;

  const exdates = extractExdates(block);
  if (exdates.has(targetDate)) return false;

  const start = new Date(dtstart.date + 'T00:00:00');
  const target = new Date(targetDate + 'T00:00:00');

  if (!matchesRrulePattern(target, start, rrule)) return false;

  if (rrule.count !== undefined) {
    return isOccurrenceWithinCount(start, target, rrule, exdates);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Existing helpers (unchanged)
// ---------------------------------------------------------------------------

/** Parse simple KEY:VALUE properties from a VEVENT block */
function parseProperties(block: string): Record<string, string> {
  const props: Record<string, string> = {};
  const lines = block.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).trim();
    // Strip parameters (e.g., DTSTART;TZID=...:20250101T090000)
    const baseKey = key.split(';')[0];
    if (!props[baseKey]) {
      props[baseKey] = value;
    }
  }
  return props;
}

/** Find a property and extract its value and optional TZID parameter */
function findPropertyWithTzid(block: string, prefix: string): { value: string; tzid?: string } | null {
  const lines = block.split('\n');
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;
      const value = line.slice(colonIdx + 1).trim();
      if (!value) continue;

      // Extract TZID from parameters (e.g., DTSTART;TZID=Europe/London:...)
      const paramStr = line.slice(prefix.length, colonIdx);
      const tzidMatch = paramStr.match(/TZID=([^;:]+)/);
      return { value, tzid: tzidMatch?.[1] };
    }
  }
  return null;
}

/**
 * Parse an iCal datetime value into a local date string and minutes from midnight.
 * Supports:
 *   - 20250301T140000Z (UTC)
 *   - 20250301T140000 with tzid (converted from that timezone to local)
 *   - 20250301T140000 without tzid (treated as local)
 *   - 20250301 (all-day DATE)
 */
function parseIcalDate(value: string, tzid?: string): { date: string; minutes: number } | null {
  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    return { date, minutes: 0 };
  }

  // DateTime: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\w*)$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const isUtc = value.endsWith('Z');

  if (isUtc) {
    // Convert UTC to local time
    const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
    return dateToLocal(utcDate);
  }

  if (tzid) {
    // Convert from the specified timezone to local time
    const localDate = convertFromTzid(year, month, day, hour, minute, tzid);
    if (localDate) return dateToLocal(localDate);
    // Fall through to treat as local if TZID is invalid
  }

  // Local time (no TZID, no Z suffix)
  const dateStr = `${year}-${month}-${day}`;
  const minutes = parseInt(hour) * 60 + parseInt(minute);
  return { date: dateStr, minutes };
}

/** Extract local date string and minutes from a JS Date */
function dateToLocal(d: Date): { date: string; minutes: number } {
  const localYear = d.getFullYear();
  const localMonth = String(d.getMonth() + 1).padStart(2, '0');
  const localDay = String(d.getDate()).padStart(2, '0');
  return {
    date: `${localYear}-${localMonth}-${localDay}`,
    minutes: d.getHours() * 60 + d.getMinutes(),
  };
}

/**
 * Get the UTC offset in ms for a named timezone at a given UTC instant.
 * Positive = east of UTC (e.g. UTC+5 returns +5*3600000).
 */
function getUtcOffsetMs(tzid: string, utcMs: number): number {
  const d = new Date(utcMs);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tzid,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  // hour12:false can return 24 for midnight — normalise
  const h = (p.hour ?? 0) % 24;
  const tzMs = Date.UTC(p.year, p.month - 1, p.day, h, p.minute, p.second);
  return tzMs - utcMs;
}

/**
 * Convert a datetime from a named timezone to the user's local time.
 * Uses Intl.DateTimeFormat.formatToParts to determine the true UTC offset,
 * avoiding the double-local-offset bug in toLocaleString + new Date().
 */
function convertFromTzid(
  year: string, month: string, day: string,
  hour: string, minute: string, tzid: string,
): Date | null {
  try {
    // Treat the wall clock time as UTC for an initial estimate
    const naiveUtcMs = Date.UTC(
      parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10),
      parseInt(hour, 10), parseInt(minute, 10), 0,
    );
    // Get the tz offset at the approximate UTC instant, then iterate once
    // to handle DST edge cases where the initial estimate crosses a boundary
    const offsetMs = getUtcOffsetMs(tzid, naiveUtcMs);
    const approxUtcMs = naiveUtcMs - offsetMs;
    const finalOffsetMs = getUtcOffsetMs(tzid, approxUtcMs);
    return new Date(naiveUtcMs - finalOffsetMs);
  } catch {
    // Invalid TZID — fall back to treating as local
    return null;
  }
}

/** Check if an event overlaps a target date (YYYY-MM-DD) */
function overlapsDate(
  start: { date: string; minutes: number },
  end: { date: string; minutes: number } | null,
  allDay: boolean,
  targetDate: string,
): boolean {
  if (allDay) {
    // All-day event: start.date is the day, end.date (if present) is exclusive
    if (start.date === targetDate) return true;
    if (end && start.date <= targetDate && targetDate < end.date) return true;
    return false;
  }

  // Timed event
  const endDate = end?.date || start.date;

  // Event spans from start.date to endDate
  if (start.date <= targetDate && endDate >= targetDate) return true;

  return false;
}
