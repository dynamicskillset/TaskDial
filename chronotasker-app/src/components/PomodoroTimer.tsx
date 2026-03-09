import { useState, useEffect, useRef } from 'react';
import type { PomodoroState } from '../types';
import './PomodoroTimer.css';

interface PomodoroTimerProps {
  state: PomodoroState;
  onStart: (taskId?: string) => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onReset: () => void;
  currentTaskTitle?: string;
}

const PHASE_LABELS: Record<PomodoroState['type'], string> = {
  work: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getTotalDurationSeconds(
  type: PomodoroState['type'],
  timeRemaining: number
): number {
  // We infer total duration from the type's standard durations.
  // Since the hook resets timeRemaining to full on each phase start,
  // we can derive total from the maximum of timeRemaining and known defaults.
  // However, since settings can vary, we accept that progress starts at 1.0
  // and counts down. We use a fallback based on common defaults.
  const defaults: Record<PomodoroState['type'], number> = {
    work: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60,
  };
  // The total is at least as large as the current remaining time
  return Math.max(defaults[type], timeRemaining);
}

// SVG constants
const RING_SIZE = 100; // viewBox is 100x100
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 42;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export default function PomodoroTimer({
  state,
  onStart,
  onPause,
  onResume,
  onSkip,
  onReset,
  currentTaskTitle,
}: PomodoroTimerProps) {
  const { isRunning, type, timeRemainingSeconds, completedPomodoros } = state;
  const totalSeconds = getTotalDurationSeconds(type, timeRemainingSeconds);
  const progress = timeRemainingSeconds / totalSeconds; // 1 = full, 0 = done
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);

  // Determine how many dots to render (pomodorosBeforeLongBreak, default 4)
  // We render 4 dots; completed ones are filled
  const dotCount = 4;

  const hasStarted =
    isRunning || timeRemainingSeconds < totalSeconds;

  // Milestone: show a brief message when a long break is earned
  const [showMilestone, setShowMilestone] = useState(false);
  const prevTypeRef = useRef(type);
  useEffect(() => {
    if (prevTypeRef.current !== 'longBreak' && type === 'longBreak') {
      setShowMilestone(true);
      const t = setTimeout(() => setShowMilestone(false), 3000);
      return () => clearTimeout(t);
    }
    prevTypeRef.current = type;
  }, [type]);

  return (
    <div className="pomodoro-timer">
      {/* Progress ring */}
      <div className="pomodoro-timer__ring-container">
        <svg
          className="pomodoro-timer__ring-svg"
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        >
          <circle
            className="pomodoro-timer__ring-bg"
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
          />
          <circle
            className={`pomodoro-timer__ring-progress pomodoro-timer__ring-progress--${type}`}
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>

        {/* Centre overlay */}
        <div className="pomodoro-timer__center">
          <span
            className={`pomodoro-timer__phase-label pomodoro-timer__phase-label--${type}${showMilestone ? ' pomodoro-timer__phase-label--milestone' : ''}`}
          >
            {showMilestone ? 'Cycle done' : PHASE_LABELS[type]}
          </span>
          <span className="pomodoro-timer__time" role="timer" aria-live="polite" aria-atomic="true" aria-label="Pomodoro timer">
            {formatTime(timeRemainingSeconds)}
          </span>
          {currentTaskTitle && (
            <span className="pomodoro-timer__task-title">
              {currentTaskTitle}
            </span>
          )}
        </div>
      </div>

      {/* Pomodoro count dots */}
      <div className="pomodoro-timer__dots" aria-label={`${completedPomodoros} of ${dotCount} pomodoros completed`} role="status">
        {Array.from({ length: dotCount }, (_, i) => (
          <span
            key={i}
            className={`pomodoro-timer__dot${
              i < completedPomodoros ? ' pomodoro-timer__dot--filled' : ''
            }`}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="pomodoro-timer__controls">
        {!hasStarted ? (
          <button
            className={`pomodoro-timer__btn pomodoro-timer__btn--primary pomodoro-timer__btn--primary--${type}`}
            onClick={() => onStart()}
            aria-label="Start focus session"
          >
            Start
          </button>
        ) : isRunning ? (
          <button
            className={`pomodoro-timer__btn pomodoro-timer__btn--primary pomodoro-timer__btn--primary--${type}`}
            onClick={onPause}
            aria-label="Pause timer"
          >
            Pause
          </button>
        ) : (
          <button
            className={`pomodoro-timer__btn pomodoro-timer__btn--primary pomodoro-timer__btn--primary--${type}`}
            onClick={onResume}
            aria-label="Resume timer"
          >
            Resume
          </button>
        )}

        <button
          className="pomodoro-timer__btn pomodoro-timer__btn--secondary"
          onClick={onSkip}
          disabled={!hasStarted && !isRunning}
          aria-label="Skip to next phase"
        >
          Skip
        </button>

        <button
          className="pomodoro-timer__btn pomodoro-timer__btn--secondary"
          onClick={onReset}
          disabled={!hasStarted && !isRunning}
          aria-label="Reset timer"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
