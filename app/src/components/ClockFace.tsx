import React, { useMemo } from 'react';
import type { PomodoroState, CalendarEvent } from '../types';
import type { ScheduledTask } from '../utils/scheduling';
import { taskArcColor } from '../utils/format';
import './ClockFace.css';

/* =============================================================
   ClockFace — Circular time visualisation for TaskDial
   ============================================================= */

interface ClockFaceProps {
  tasks: ScheduledTask[];
  calendarEvents?: CalendarEvent[];
  meetingBufferMinutes?: number;
  autoAdvance?: boolean;
  isToday?: boolean;
  dayStartHour: number;
  dayEndHour: number;
  use24Hour: boolean;
  currentTime: Date;
  activeTaskId: string | null;
  activeCalendarUid: string | null;
  pomodoroState: PomodoroState | null;
  onTaskClick: (taskId: string) => void;
  onCalendarEventClick?: (uid: string) => void;
  onSlotsResolved?: (colorMap: Map<string, string>) => void;
}

/* ---- Constants ---- */
const SVG_SIZE = 460;
const CX = SVG_SIZE / 2;
const CY = SVG_SIZE / 2;
const OUTER_R = 170;
const INNER_R = 95;
const LABEL_R = OUTER_R + 22;
const CAL_INNER_R = INNER_R;        // same band as tasks
const CAL_OUTER_R = OUTER_R;        // full ring width

/* ---- Geometry helpers ---- */

/**
 * Map a time to its real clock-face angle.
 * 12 o'clock = 0 degrees (top), each hour = 30 degrees, clockwise.
 * Works for both 12h and 24h times (uses mod 12).
 */
function timeToAngle(hours: number, minutes: number): number {
  const fractionalHour = hours + minutes / 60;
  return (fractionalHour % 12) * 30;
}

/**
 * Convert a polar angle (0 = top, clockwise) to Cartesian SVG coordinates.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

/**
 * Build an SVG path `d` attribute for an annular arc segment.
 * Handles arcs that cross the 0/360 degree boundary.
 */
function describeArc(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
): string {
  // Handle wrapping past 360
  let adjustedEnd = endAngle;
  if (adjustedEnd <= startAngle) {
    adjustedEnd += 360;
  }

  // Clamp to avoid full-circle edge case with arc commands
  const sweep = Math.min(adjustedEnd - startAngle, 359.999);
  const endClamped = startAngle + sweep;
  const largeArc = sweep > 180 ? 1 : 0;

  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endClamped);
  const innerStart = polarToCartesian(cx, cy, innerR, endClamped);
  const innerEnd = polarToCartesian(cx, cy, innerR, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}


/**
 * Parse an "HH:MM" string into { hours, minutes }.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h, minutes: m };
}

/* ---- Resolved task placement ---- */

interface ResolvedSlot {
  task: ScheduledTask;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  index: number;
}

/**
 * Resolve task positions on the clock.
 */
function resolveTaskSlots(
  tasks: ScheduledTask[],
  dayStart: number,
  dayEnd: number,
  currentTime: Date | undefined,
  _autoAdvance: boolean,
  calendarEvents: CalendarEvent[] = [],
  meetingBufferMinutes: number = 0,
  isToday: boolean = true,
): ResolvedSlot[] {
  const sorted = [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);

  const fixed: ResolvedSlot[] = [];
  const flexible: ScheduledTask[] = [];

  sorted.forEach((task) => {
    if (task.fixedStartTime) {
      const { hours, minutes } = parseTime(task.fixedStartTime);
      const endTotalMin = hours * 60 + minutes + task.durationMinutes;
      fixed.push({
        task,
        startHour: hours,
        startMinute: minutes,
        endHour: Math.floor(endTotalMin / 60),
        endMinute: endTotalMin % 60,
        index: 0,
      });
    } else {
      flexible.push(task);
    }
  });

  fixed.sort(
    (a, b) => a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute),
  );

  const allSlots: ResolvedSlot[] = [...fixed];

  const occupied = fixed.map((s) => ({
    start: s.startHour * 60 + s.startMinute,
    end: s.endHour * 60 + s.endMinute,
  }));

  // Add calendar events as occupied intervals (with buffer)
  for (const event of calendarEvents) {
    if (event.allDay) continue;
    occupied.push({
      start: event.startMinutes,
      end: event.endMinutes + meetingBufferMinutes,
    });
  }
  occupied.sort((a, b) => a.start - b.start);

  // On today, never schedule before the current time
  let cursor = dayStart * 60;
  if (isToday && currentTime) {
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    cursor = Math.max(nowMinutes, dayStart * 60);
  }

  // Filter out completed flexible tasks — they stay in the list but not on the clock
  const activeFlexible = flexible.filter(t => !t.completed);

  for (const task of activeFlexible) {
    let slotStart = cursor;

    // Find a gap that fits the full task duration (not just the start point)
    let conflict = true;
    while (conflict) {
      conflict = false;
      for (const occ of occupied) {
        if (slotStart < occ.end && slotStart + task.durationMinutes > occ.start) {
          slotStart = occ.end;
          conflict = true;
          break;
        }
      }
    }

    const slotEnd = slotStart + task.durationMinutes;
    const dayEndMin = dayEnd * 60;

    if (slotStart >= dayEndMin) continue;

    allSlots.push({
      task,
      startHour: Math.floor(slotStart / 60),
      startMinute: slotStart % 60,
      endHour: Math.floor(Math.min(slotEnd, dayEndMin) / 60),
      endMinute: Math.min(slotEnd, dayEndMin) % 60,
      index: 0,
    });

    occupied.push({ start: slotStart, end: slotEnd });
    occupied.sort((a, b) => a.start - b.start);
    cursor = slotEnd;
  }

  allSlots.sort(
    (a, b) => a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute),
  );
  allSlots.forEach((s, i) => {
    s.index = i;
  });

  return allSlots;
}

/* ---- Sub-components ---- */

/** Hour markers — all 12 hours at real clock positions */
const HourMarkers = React.memo(function HourMarkers() {
  const markers: React.ReactElement[] = [];

  // All 12 clock positions
  for (let i = 0; i < 12; i++) {
    const clockHour = i === 0 ? 12 : i; // 0 position = 12
    const angle = i * 30; // each hour = 30 degrees
    const isMajor = i % 3 === 0; // 12, 3, 6, 9 are major
    // Markers sit outside the ring (OUTER_R outward)
    const markerStart = OUTER_R;
    const markerEnd = isMajor ? OUTER_R + 10 : OUTER_R + 6;
    const p1 = polarToCartesian(CX, CY, markerStart, angle);
    const p2 = polarToCartesian(CX, CY, markerEnd, angle);

    markers.push(
      <line
        key={`marker-${i}`}
        x1={p1.x}
        y1={p1.y}
        x2={p2.x}
        y2={p2.y}
        className={`clock-face__marker${isMajor ? ' clock-face__marker--major' : ''}`}
      />,
    );

    // Hour label
    const lp = polarToCartesian(CX, CY, LABEL_R, angle);
    const label = `${clockHour}`;

    markers.push(
      <text
        key={`label-${i}`}
        x={lp.x}
        y={lp.y}
        className={`clock-face__hour-label${isMajor ? ' clock-face__hour-label--major' : ''}`}
      >
        {label}
      </text>,
    );

    // Minor tick at half-hour
    const halfAngle = angle + 15;
    const hp1 = polarToCartesian(CX, CY, OUTER_R, halfAngle);
    const hp2 = polarToCartesian(CX, CY, OUTER_R + 4, halfAngle);
    markers.push(
      <line
        key={`minor-${i}`}
        x1={hp1.x}
        y1={hp1.y}
        x2={hp2.x}
        y2={hp2.y}
        className="clock-face__marker"
        style={{ opacity: 0.3 }}
      />,
    );

    // Minor ticks at 5-minute intervals (each = 2.5 degrees)
    for (let m = 1; m < 12; m++) {
      if (m === 6) continue; // skip half-hour (already drawn)
      const tickAngle = angle + m * 2.5;
      const tp1 = polarToCartesian(CX, CY, OUTER_R, tickAngle);
      const tp2 = polarToCartesian(CX, CY, OUTER_R + 3, tickAngle);
      markers.push(
        <line
          key={`tick-${i}-${m}`}
          x1={tp1.x}
          y1={tp1.y}
          x2={tp2.x}
          y2={tp2.y}
          className="clock-face__marker"
          style={{ opacity: 0.15 }}
        />,
      );
    }
  }

  return <g>{markers}</g>;
});

/** Strikethrough hatch pattern definition */
const PatternDefs = React.memo(function PatternDefs() {
  return (
    <defs>
      <pattern
        id="completed-hatch"
        patternUnits="userSpaceOnUse"
        width="6"
        height="6"
        patternTransform="rotate(45)"
      >
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="6"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.5"
        />
      </pattern>
      <pattern
        id="break-hatch"
        patternUnits="userSpaceOnUse"
        width="5"
        height="5"
        patternTransform="rotate(-45)"
      >
        <rect width="5" height="5" className="clock-face__break-pattern-bg" />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="5"
          className="clock-face__break-pattern-line"
          strokeWidth="1.5"
        />
      </pattern>
    </defs>
  );
});

/** A single task arc segment */
const TaskArc = React.memo(function TaskArc({
  slot,
  totalTasks,
  isActive,
  onTaskClick,
}: {
  slot: ResolvedSlot;
  totalTasks: number;
  isActive: boolean;
  onTaskClick: (id: string) => void;
}) {
  const { task, startHour, startMinute, endHour, endMinute, index } = slot;

  const startAngle = timeToAngle(startHour, startMinute);
  let endAngle = timeToAngle(endHour, endMinute);

  // Handle wrapping past 12 o'clock (e.g. 11:30 to 12:30)
  if (endAngle <= startAngle) {
    endAngle += 360;
  }

  // Need a minimum arc size to be visible and clickable
  const minArc = 4;
  const adjustedEnd = Math.max(endAngle, startAngle + minArc);

  const d = describeArc(CX, CY, INNER_R, OUTER_R, startAngle, adjustedEnd);

  const fill = task.isBreak
    ? 'url(#break-hatch)'
    : task.important
      ? 'var(--color-task-important, hsl(0, 72%, 62%))'
      : taskArcColor(index, totalTasks, task.tag);

  const hasConflict = !!task.meetingConflict && !task.isBreak;

  const classNames = [
    'clock-face__task-arc',
    task.isBreak && 'clock-face__task-arc--break',
    task.completed && 'clock-face__task-arc--completed',
    task.important && 'clock-face__task-arc--important',
    isActive && 'clock-face__task-arc--active',
    hasConflict && 'clock-face__task-arc--conflict',
  ]
    .filter(Boolean)
    .join(' ');

  const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
  const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
  const tooltip = `${task.title} (${startTimeStr}–${endTimeStr}, ${task.durationMinutes}min)${task.completed ? ' [done]' : ''}`;

  return (
    <g
      onClick={() => onTaskClick(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTaskClick(task.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={tooltip}
    >
      <title>{tooltip}</title>
      {/* Main arc */}
      <path d={d} fill={fill} className={classNames} />

      {/* Hatch overlay for completed tasks */}
      {task.completed && (
        <path
          d={d}
          fill="url(#completed-hatch)"
          className="clock-face__completed-pattern"
          style={{ color: fill }}
        />
      )}
    </g>
  );
});

/** Subtle arc highlighting the working day range */
const WorkingDayArc = React.memo(function WorkingDayArc({
  dayStartHour,
  dayEndHour,
}: {
  dayStartHour: number;
  dayEndHour: number;
}) {
  const startAngle = timeToAngle(dayStartHour, 0);
  let endAngle = timeToAngle(dayEndHour, 0);
  if (endAngle <= startAngle) endAngle += 360;

  const d = describeArc(CX, CY, INNER_R, OUTER_R, startAngle, endAngle);

  return (
    <path d={d} className="clock-face__working-day" />
  );
});

/** A single calendar event arc */
const CalendarArc = React.memo(function CalendarArc({
  event,
  meetingBufferMinutes,
  showBuffer,
  isActive,
  onCalendarEventClick,
}: {
  event: CalendarEvent;
  meetingBufferMinutes: number;
  showBuffer: boolean;
  isActive: boolean;
  onCalendarEventClick?: (uid: string) => void;
}) {
  if (event.allDay) return null; // skip all-day events on the clock

  const startHour = Math.floor(event.startMinutes / 60);
  const startMinute = event.startMinutes % 60;
  const endHour = Math.floor(event.endMinutes / 60);
  const endMinute = event.endMinutes % 60;

  const startAngle = timeToAngle(startHour, startMinute);
  let endAngle = timeToAngle(endHour, endMinute);
  if (endAngle <= startAngle) endAngle += 360;

  const minArc = 4;
  const adjustedEnd = Math.max(endAngle, startAngle + minArc);

  const d = describeArc(CX, CY, CAL_INNER_R, CAL_OUTER_R, startAngle, adjustedEnd);

  const startTimeStr = `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
  const endTimeStr = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
  const tooltip = `${event.summary} (${startTimeStr}–${endTimeStr})`;

  // Buffer arc after the event
  let bufferArc: React.ReactElement | null = null;
  if (meetingBufferMinutes > 0 && showBuffer) {
    const bufferEndMinutes = event.endMinutes + meetingBufferMinutes;
    const bufferEndHour = Math.floor(bufferEndMinutes / 60);
    const bufferEndMinute = bufferEndMinutes % 60;

    const bufferStartAngle = timeToAngle(endHour, endMinute);
    let bufferEndAngle = timeToAngle(bufferEndHour, bufferEndMinute);
    if (bufferEndAngle <= bufferStartAngle) bufferEndAngle += 360;

    const bufferD = describeArc(CX, CY, CAL_INNER_R, CAL_OUTER_R, bufferStartAngle, bufferEndAngle);

    bufferArc = (
      <g aria-hidden="true">
        <title>{meetingBufferMinutes} min buffer</title>
        <path d={bufferD} fill="url(#break-hatch)" className="clock-face__task-arc--break" />
      </g>
    );
  }

  const arcClass = [
    'clock-face__calendar-arc',
    isActive && 'clock-face__calendar-arc--active',
    onCalendarEventClick && 'clock-face__calendar-arc--clickable',
  ].filter(Boolean).join(' ');

  return (
    <g
      onClick={onCalendarEventClick ? () => onCalendarEventClick(event.uid) : undefined}
      onKeyDown={onCalendarEventClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCalendarEventClick(event.uid); }
      } : undefined}
      role={onCalendarEventClick ? 'button' : undefined}
      tabIndex={onCalendarEventClick ? 0 : undefined}
      aria-label={onCalendarEventClick ? tooltip : undefined}
      aria-pressed={onCalendarEventClick ? isActive : undefined}
    >
      <title>{tooltip}</title>
      <path d={d} className={arcClass} />
      {bufferArc}
    </g>
  );
});

/** The red current-time hand */
const TimeHand = React.memo(function TimeHand({
  currentTime,
  dayStart,
  dayEnd,
}: {
  currentTime: Date;
  dayStart: number;
  dayEnd: number;
}) {
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const totalHour = hours + minutes / 60;

  // Only show if current time is within the day range
  if (totalHour < dayStart || totalHour > dayEnd) return null;

  const angle = timeToAngle(hours, minutes);
  const tip = polarToCartesian(CX, CY, OUTER_R - 2, angle);
  const base = polarToCartesian(CX, CY, INNER_R + 8, angle);

  return (
    <g>
      <line
        x1={base.x}
        y1={base.y}
        x2={tip.x}
        y2={tip.y}
        className="clock-face__time-hand"
      />
      <circle cx={tip.x} cy={tip.y} r="3.5" className="clock-face__time-hand-dot" />
    </g>
  );
});

/** Center text showing date and time */
const CenterDisplay = React.memo(function CenterDisplay({
  currentTime,
  use24Hour,
}: {
  currentTime: Date;
  use24Hour: boolean;
}) {
  const dateStr = currentTime.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  let timeStr: string;
  if (use24Hour) {
    timeStr = currentTime.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else {
    timeStr = currentTime.toLocaleTimeString('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  return (
    <g>
      <circle
        cx={CX}
        cy={CY}
        r={INNER_R - 4}
        className="clock-face__center-disc"
      />
      <text x={CX} y={CY - 12} className="clock-face__center-date">
        {dateStr}
      </text>
      <text x={CX} y={CY + 16} className="clock-face__center-time">
        {timeStr}
      </text>
    </g>
  );
});

/* ---- Main component ---- */

const ClockFace: React.FC<ClockFaceProps> = ({
  tasks,
  calendarEvents = [],
  meetingBufferMinutes = 0,
  autoAdvance = true,
  isToday = true,
  dayStartHour,
  dayEndHour,
  use24Hour,
  currentTime,
  activeTaskId,
  activeCalendarUid,
  pomodoroState,
  onTaskClick,
  onCalendarEventClick,
  onSlotsResolved,
}) => {
  // Only recalculate when minute changes (not every second)
  const currentMinuteKey = `${currentTime.getHours()}:${currentTime.getMinutes()}`;
  const slots = useMemo(
    () => resolveTaskSlots(tasks, dayStartHour, dayEndHour, currentTime, autoAdvance, calendarEvents, meetingBufferMinutes, isToday),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, dayStartHour, dayEndHour, currentMinuteKey, autoAdvance, calendarEvents, meetingBufferMinutes, isToday],
  );

  // Emit colour map to parent so TaskList can use the same colours
  const onSlotsResolvedRef = React.useRef(onSlotsResolved);
  onSlotsResolvedRef.current = onSlotsResolved;
  React.useEffect(() => {
    if (!onSlotsResolvedRef.current) return;
    const colorMap = new Map<string, string>();
    for (const slot of slots) {
      const { task, index } = slot;
      if (task.isBreak) continue;
      const color = task.important
        ? 'var(--color-task-important, hsl(0, 72%, 62%))'
        : taskArcColor(index, slots.length, task.tag);
      colorMap.set(task.id, color);
    }
    onSlotsResolvedRef.current(colorMap);
  }, [slots]);
  const activePomodoroTaskId =
    pomodoroState?.isRunning && pomodoroState.type === 'work'
      ? pomodoroState.currentTaskId
      : null;

  // Precompute which events should suppress their buffer arc — avoids O(n²) work inside JSX
  const calendarArcs = useMemo(() => calendarEvents.map((event) => {
    const bufferEnd = event.endMinutes + meetingBufferMinutes;
    const blockedByEvent = calendarEvents.some(
      (other) => !other.allDay && other !== event && other.startMinutes < bufferEnd && other.startMinutes >= event.endMinutes,
    );
    const blockedByBreak = slots.some((slot) => {
      if (!slot.task.isBreak) return false;
      const slotStart = slot.startHour * 60 + slot.startMinute;
      const slotEnd = slot.endHour * 60 + slot.endMinute;
      return slotStart < bufferEnd && slotEnd > event.endMinutes;
    });
    return (
      <CalendarArc
        key={event.uid}
        event={event}
        meetingBufferMinutes={meetingBufferMinutes}
        showBuffer={!blockedByEvent && !blockedByBreak}
        isActive={event.uid === activeCalendarUid}
        onCalendarEventClick={onCalendarEventClick}
      />
    );
  }), [calendarEvents, meetingBufferMinutes, slots, activeCalendarUid, onCalendarEventClick]);

  return (
    <div className="clock-face">
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Daily schedule clock"
        role="img"
      >
        <PatternDefs />

        {/* Outer background circle — extends past labels */}
        <circle cx={CX} cy={CY} r={LABEL_R + 16} className="clock-face__background" />

        {/* Task ring background — use circle+stroke to avoid arc seam */}
        <circle
          cx={CX}
          cy={CY}
          r={(OUTER_R + INNER_R) / 2}
          className="clock-face__ring-bg"
        />

        {/* Working day range highlight */}
        <WorkingDayArc dayStartHour={dayStartHour} dayEndHour={dayEndHour} />

        {/* Hour markers and labels */}
        <HourMarkers />

        {/* Calendar event arcs (inside the ring, behind task arcs) */}
        {calendarArcs}

        {/* Task arcs (drawn on top of calendar arcs) */}
        {slots.map((slot) => (
          <TaskArc
            key={slot.task.id}
            slot={slot}
            totalTasks={slots.length}
            isActive={
              slot.task.id === activeTaskId ||
              slot.task.id === activePomodoroTaskId
            }
            onTaskClick={onTaskClick}
          />
        ))}

        {/* Current-time hand */}
        <TimeHand
          currentTime={currentTime}
          dayStart={dayStartHour}
          dayEnd={dayEndHour}
        />

        {/* Center display */}
        <CenterDisplay currentTime={currentTime} use24Hour={use24Hour} />
      </svg>
    </div>
  );
};

export default ClockFace;
