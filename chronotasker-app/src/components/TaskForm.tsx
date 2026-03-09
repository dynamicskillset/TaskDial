import { useState, useEffect, useRef, useMemo } from 'react';
import type { Task, CalendarEvent } from '../types';
import { findMeetingConflict, minutesToTime } from '../utils/scheduling';
import './TaskForm.css';

interface TaskFormProps {
  onSubmit: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => void;
  editingTask?: Task;
  onCancel?: () => void;
  date: string;
  existingTags?: string[];
  calendarEvents?: CalendarEvent[];
  meetingBufferMinutes?: number;
  use24Hour?: boolean;
  enableRecurring?: boolean;
  enableBacklog?: boolean;
  onSubmitToBacklog?: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => void;
  onMoveToBacklog?: (taskId: string) => void;
  advancedMode?: boolean;
}

const DURATION_PRESETS = [15, 25, 30, 45, 60] as const;

export default function TaskForm({ onSubmit, editingTask, onCancel, date, existingTags = [], calendarEvents = [], meetingBufferMinutes = 0, use24Hour = true, enableRecurring = false, enableBacklog = false, onSubmitToBacklog, onMoveToBacklog, advancedMode = false }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [customDuration, setCustomDuration] = useState('');
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [fixedStartTime, setFixedStartTime] = useState('');
  const [hasFixedTime, setHasFixedTime] = useState(false);
  const [important, setImportant] = useState(false);
  const [tag, setTag] = useState('');
  const [details, setDetails] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<Task['recurrencePattern']>(undefined);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // Check for meeting conflicts when fixed time is set
  const meetingConflict = useMemo(() => {
    if (!hasFixedTime || !fixedStartTime || calendarEvents.length === 0) return null;
    const [h, m] = fixedStartTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const startMin = h * 60 + m;
    const dur = isCustomDuration ? Math.max(1, parseInt(customDuration, 10) || 25) : durationMinutes;
    return findMeetingConflict(startMin, dur, calendarEvents, meetingBufferMinutes);
  }, [hasFixedTime, fixedStartTime, durationMinutes, isCustomDuration, customDuration, calendarEvents, meetingBufferMinutes]);

  // Populate form when editing, reset when editing is cancelled
  useEffect(() => {
    if (editingTask) {
      setTitle(editingTask.title);
      setDurationMinutes(editingTask.durationMinutes);
      setImportant(editingTask.important);
      setTag(editingTask.tag ?? '');
      setDetails(editingTask.details ?? '');
      setShowDetails(!!editingTask.details);
      setRecurrencePattern(editingTask.recurrencePattern);

      // Auto-expand "More options" if any optional fields are set
      const hasOptionalFields = editingTask.important || !!editingTask.tag || !!editingTask.details || !!editingTask.fixedStartTime || !!editingTask.recurrencePattern;
      setShowMore(hasOptionalFields);

      const isPreset = (DURATION_PRESETS as readonly number[]).includes(editingTask.durationMinutes);
      if (!isPreset) {
        setIsCustomDuration(true);
        setCustomDuration(String(editingTask.durationMinutes));
      } else {
        setIsCustomDuration(false);
        setCustomDuration('');
      }

      if (editingTask.fixedStartTime) {
        setHasFixedTime(true);
        setFixedStartTime(editingTask.fixedStartTime);
      } else {
        setHasFixedTime(false);
        setFixedStartTime('');
      }
    } else {
      resetForm();
    }
  }, [editingTask]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus title input when switching to edit mode (not on initial mount)
  useEffect(() => {
    if (editingTask) titleInputRef.current?.focus();
  }, [editingTask]);

  function resetForm() {
    setTitle('');
    setDurationMinutes(25);
    setCustomDuration('');
    setIsCustomDuration(false);
    setFixedStartTime('');
    setHasFixedTime(false);
    setImportant(false);
    setTag('');
    setDetails('');
    setShowDetails(false);
    setShowMore(false);
    setRecurrencePattern(undefined);
    titleInputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const finalDuration = isCustomDuration
      ? Math.max(1, Math.min(480, parseInt(customDuration, 10) || 25))
      : durationMinutes;

    onSubmit({
      title: trimmedTitle,
      durationMinutes: finalDuration,
      fixedStartTime: hasFixedTime && fixedStartTime ? fixedStartTime : undefined,
      completed: editingTask?.completed ?? false,
      important,
      isBreak: editingTask?.isBreak ?? false,
      tag: tag.trim() || undefined,
      details: details.trim() || undefined,
      recurrencePattern: recurrencePattern || undefined,
      date,
    });

    if (!editingTask) {
      resetForm();
    }
  }

  function handleDurationPreset(minutes: number) {
    setDurationMinutes(minutes);
    setIsCustomDuration(false);
    setCustomDuration('');
  }

  function handleCustomDurationFocus() {
    setIsCustomDuration(true);
  }

  function handleCustomDurationChange(value: string) {
    setCustomDuration(value);
    setIsCustomDuration(true);
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setDurationMinutes(parsed);
    }
  }

  function handleSubmitToBacklog() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !onSubmitToBacklog) return;

    const finalDuration = isCustomDuration
      ? Math.max(1, Math.min(480, parseInt(customDuration, 10) || 25))
      : durationMinutes;

    onSubmitToBacklog({
      title: trimmedTitle,
      durationMinutes: finalDuration,
      fixedStartTime: undefined,
      completed: false,
      important,
      isBreak: false,
      tag: tag.trim() || undefined,
      details: details.trim() || undefined,
      date: 'backlog',
    });

    resetForm();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && onCancel) {
      onCancel();
    }
  }

  return (
    <form
      className={`task-form ${editingTask ? 'task-form--editing' : ''}`}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
    >
      {/* Title */}
      <div className="task-form__row task-form__row--title">
        <input
          ref={titleInputRef}
          type="text"
          className="task-form__title-input"
          placeholder="Task name..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoComplete="off"
          aria-label="Task name"
        />
      </div>

      {/* Duration */}
      <div className="task-form__row task-form__row--duration">
        <label className="task-form__label">Duration</label>
        <div className="task-form__duration-options">
          {DURATION_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`task-form__duration-pill ${!isCustomDuration && durationMinutes === preset ? 'task-form__duration-pill--active' : ''}`}
              onClick={() => handleDurationPreset(preset)}
              aria-pressed={!isCustomDuration && durationMinutes === preset}
            >
              {preset}m
            </button>
          ))}
          <input
            type="number"
            className={`task-form__duration-custom ${isCustomDuration ? 'task-form__duration-custom--active' : ''}`}
            placeholder="Custom"
            min="1"
            max="480"
            value={customDuration}
            onFocus={handleCustomDurationFocus}
            onChange={(e) => handleCustomDurationChange(e.target.value)}
            aria-label="Custom duration in minutes"
          />
          <span className="task-form__duration-unit">min</span>
        </div>
      </div>

      {/* More options toggle */}
      {!showMore && (
        <div className="task-form__row">
          <button
            type="button"
            className="task-form__more-toggle"
            onClick={() => setShowMore(true)}
            aria-expanded={false}
          >
            More options
          </button>
        </div>
      )}

      {showMore && (
        <>
          {/* Options row: important + fixed time */}
          <div className="task-form__row task-form__row--options">
            <label className="task-form__time-toggle">
              <input
                type="checkbox"
                checked={hasFixedTime}
                onChange={(e) => {
                  setHasFixedTime(e.target.checked);
                  if (!e.target.checked) setFixedStartTime('');
                }}
              />
              <span>Fixed time</span>
            </label>
            {hasFixedTime && (
              <input
                type="time"
                className="task-form__time-input"
                value={fixedStartTime}
                onChange={(e) => setFixedStartTime(e.target.value)}
                aria-label="Fixed start time"
              />
            )}
            {meetingConflict && (
              <span className="task-form__conflict-warning" role="alert">
                <span aria-hidden="true">⚠</span> Overlaps with: {meetingConflict.summary} ({minutesToTime(meetingConflict.startMinutes, use24Hour)}–{minutesToTime(meetingConflict.endMinutes, use24Hour)})
              </span>
            )}
            <label className="task-form__important-toggle">
              <input
                type="checkbox"
                checked={important}
                onChange={(e) => setImportant(e.target.checked)}
              />
              <span className="task-form__important-label">
                <span className="task-form__important-icon">!</span>
                Important
              </span>
            </label>
          </div>

          {/* Tag */}
          <div className="task-form__row task-form__row--tag">
            <label className="task-form__label">Tag</label>
            <input
              type="text"
              className="task-form__tag-input"
              placeholder="e.g. admin, deep work"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              list="tag-suggestions"
              autoComplete="off"
              aria-label="Tag"
            />
            {existingTags.length > 0 && (
              <datalist id="tag-suggestions">
                {existingTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            )}
          </div>

          {/* Repeat (only when advanced + recurring tasks enabled) */}
          {advancedMode && enableRecurring && (
            <div className="task-form__row task-form__row--repeat">
              <label className="task-form__label">Repeat</label>
              <select
                className="task-form__repeat-select"
                value={recurrencePattern || ''}
                onChange={(e) => setRecurrencePattern(e.target.value as Task['recurrencePattern'] || undefined)}
              >
                <option value="">None</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays (Mon-Fri)</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          )}

          {/* Details */}
          <div className="task-form__row task-form__row--details">
            {!showDetails ? (
              <button
                type="button"
                className="task-form__details-toggle"
                onClick={() => setShowDetails(true)}
              >
                + Details
              </button>
            ) : (
              <textarea
                className="task-form__details-input"
                placeholder="Notes, links, context..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={2}
                aria-label="Task details"
              />
            )}
          </div>
        </>
      )}

      {/* Submit */}
      <div className="task-form__row task-form__row--actions">
        <div className="task-form__buttons">
          {editingTask && onCancel && (
            <button
              type="button"
              className="task-form__cancel-btn"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button type="submit" className="task-form__submit-btn">
            {editingTask ? 'Update Task' : 'Add Task'}
          </button>
          {advancedMode && enableBacklog && !editingTask && onSubmitToBacklog && (
            <button
              type="button"
              className="task-form__backlog-btn"
              onClick={handleSubmitToBacklog}
            >
              Add to Backlog
            </button>
          )}
          {advancedMode && enableBacklog && editingTask && onMoveToBacklog && editingTask.date !== 'backlog' && (
            <button
              type="button"
              className="task-form__backlog-btn"
              onClick={() => onMoveToBacklog(editingTask.id)}
            >
              Move to Backlog
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
