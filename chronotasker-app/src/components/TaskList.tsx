import { useState, useEffect, useCallback, useRef, useMemo, memo, type ReactNode } from 'react';
import type { Task } from '../types';
import type { ScheduledTask } from '../utils/scheduling';
import { tomorrowString, todayString } from '../utils/scheduling';
import { formatDuration, tagColor, tagBgColor } from '../utils/format';
import './TaskList.css';

interface TaskListProps {
  tasks: ScheduledTask[];
  colorMap?: Map<string, string>;
  activeTaskId: string | null;
  allTasksDone?: boolean;
  onToggleComplete: (taskId: string) => void;
  onToggleImportant: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onReorder: (taskId: string, direction: 'up' | 'down') => void;
  onReorderAll?: (orderedTaskIds: string[]) => void;
  onSelectTask: (taskId: string) => void;
  onRescheduleTask?: (taskId: string, newDate: string) => void;
  onMoveAllToTomorrow?: () => void;
  isFirstVisit?: boolean;
  onTryDemo?: () => void;
}

/** Lightweight markdown: bold, italic, code, [links](url), bare URLs */
function renderInline(text: string): ReactNode[] {
  // Priority: code > markdown link > bold > italic > bare URL
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(https?:\/\/[^\s<>"')\]]+)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const [full, code, link, bold, italic, url] = match;

    if (code) {
      parts.push(<code key={key++} className="task-list__details-code">{code.slice(1, -1)}</code>);
    } else if (link) {
      const m = full.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (m) {
        parts.push(<a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{m[1]}</a>);
      }
    } else if (bold) {
      parts.push(<strong key={key++}>{bold.slice(2, -2)}</strong>);
    } else if (italic) {
      parts.push(<em key={key++}>{italic.slice(1, -1)}</em>);
    } else if (url) {
      parts.push(<a key={key++} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{url}</a>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/** Render lightweight markdown: inline formatting + unordered lists */
function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${key++}`} className="task-list__details-list">{listItems}</ul>);
      listItems = [];
    }
  };

  for (const line of lines) {
    const listMatch = line.match(/^[\-\*]\s+(.+)/);
    if (listMatch) {
      listItems.push(<li key={`li-${key++}`}>{renderInline(listMatch[1])}</li>);
    } else {
      flushList();
      if (line.trim()) {
        if (elements.length > 0) elements.push(<br key={`br-${key++}`} />);
        elements.push(<span key={`s-${key++}`}>{renderInline(line)}</span>);
      }
    }
  }
  flushList();

  return <>{elements}</>;
}

/* ------------------------------------------------------------------ */
/*  Memoized task item — only re-renders when its own props change     */
/* ------------------------------------------------------------------ */

interface TaskItemProps {
  task: ScheduledTask;
  arcColor?: string;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
  isConfirmingDelete: boolean;
  isRescheduling: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  isDetailsExpanded: boolean;
  onToggleDetails: (taskId: string) => void;
  onToggleComplete: (taskId: string) => void;
  onToggleImportant: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onReorder: (taskId: string, direction: 'up' | 'down') => void;
  onSelectTask: (taskId: string) => void;
  onRescheduleTask?: (taskId: string, newDate: string) => void;
  onDeleteClick: (taskId: string) => void;
  onDeleteBlur: (taskId: string) => void;
  onToggleReschedule: (taskId: string, triggerEl?: HTMLElement) => void;
  onDragStart: (taskId: string) => void;
  onDragOver: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, taskId: string) => void;
}

const TaskItem = memo(function TaskItem({
  task,
  arcColor,
  isActive,
  isFirst,
  isLast,
  isConfirmingDelete,
  isRescheduling,
  isDragging,
  isDragOver,
  isDetailsExpanded,
  onToggleDetails,
  onToggleComplete,
  onToggleImportant,
  onEditTask,
  onReorder,
  onSelectTask,
  onRescheduleTask,
  onDeleteClick,
  onDeleteBlur,
  onToggleReschedule,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: TaskItemProps) {
  return (
    <li
      data-task-id={task.id}
      className={[
        'task-list__item',
        task.completed && 'task-list__item--completed',
        task.important && 'task-list__item--important',
        task.isBreak && 'task-list__item--break',
        isActive && 'task-list__item--active',
        isDragging && 'task-list__item--dragging',
        isDragOver && 'task-list__item--drag-over',
      ]
        .filter(Boolean)
        .join(' ')}
      style={arcColor ? { '--task-color': arcColor } as React.CSSProperties : undefined}
      draggable={!task.completed && !task.isBreak}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(task.id);
      }}
      onDragOver={(e) => onDragOver(e, task.id)}
      onDragEnd={onDragEnd}
      onDrop={(e) => onDrop(e, task.id)}
      onClick={() => onSelectTask(task.id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectTask(task.id);
        }
      }}
    >
      {/* Drag handle (desktop only) */}
      {!task.completed && !task.isBreak && (
        <div className="task-list__drag-handle" aria-hidden="true">
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="3" cy="2.5" r="1.2" /><circle cx="7" cy="2.5" r="1.2" />
            <circle cx="3" cy="7" r="1.2" /><circle cx="7" cy="7" r="1.2" />
            <circle cx="3" cy="11.5" r="1.2" /><circle cx="7" cy="11.5" r="1.2" />
          </svg>
        </div>
      )}
      {/* Checkbox */}
      <button
        className="task-list__checkbox"
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete(task.id);
        }}
        aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
        title={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {task.completed ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" />
            <path d="M5 9.5L7.5 12L13 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </button>

      {/* Task content */}
      <div className="task-list__content">
        <span className="task-list__title">
          {task.title}
          {(task.recurrencePattern || task.recurrenceSourceId) && (
            <span className="task-list__recurrence-badge" title={task.recurrencePattern ? `Repeats ${task.recurrencePattern}` : 'Recurring instance'}>
              ↻
            </span>
          )}
          {task.tag && (
            <span
              className="task-list__tag"
              style={{ color: tagColor(task.tag), backgroundColor: tagBgColor(task.tag) }}
            >
              {task.tag}
            </span>
          )}
        </span>
        <span className="task-list__meta">
          <span className="task-list__duration">{formatDuration(task.durationMinutes)}</span>
          {task.fixedStartTime && (
            <span className="task-list__fixed-time">
              @ {task.fixedStartTime}
            </span>
          )}
          {task.meetingConflict && !task.isBreak && (
            <span className="task-list__warning" title={`Overlaps: ${task.meetingConflict}`}>
              ⚠ Overlaps
            </span>
          )}
          {task.overflows && (
            <span className="task-list__warning" title="Overflows past day end">
              ⚠ Overflow
            </span>
          )}
        </span>
        {task.details && (
          <button
            type="button"
            className={`task-list__details ${isDetailsExpanded ? 'task-list__details--expanded' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDetails(task.id);
            }}
            aria-expanded={isDetailsExpanded}
            aria-label={isDetailsExpanded ? 'Collapse details' : 'Expand details'}
          >
            {renderMarkdown(task.details)}
          </button>
        )}
      </div>

      {/* Important indicator */}
      <button
        className={`task-list__important-btn ${task.important ? 'task-list__important-btn--active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleImportant(task.id);
        }}
        aria-label={task.important ? 'Remove importance' : 'Mark as important'}
        title={task.important ? 'Remove importance' : 'Mark as important'}
      >
        !
      </button>

      {/* Actions */}
      <div className="task-list__actions">
        {/* Reorder buttons (only for incomplete tasks) */}
        {!task.completed && (
          <div className="task-list__reorder">
            <button
              className="task-list__reorder-btn"
              onClick={(e) => {
                e.stopPropagation();
                onReorder(task.id, 'up');
              }}
              disabled={isFirst}
              aria-label="Move up"
              title="Move up"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 9L7 5L11 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              className="task-list__reorder-btn"
              onClick={(e) => {
                e.stopPropagation();
                onReorder(task.id, 'down');
              }}
              disabled={isLast}
              aria-label="Move down"
              title="Move down"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}

        {/* Reschedule button (incomplete tasks only) */}
        {!task.completed && onRescheduleTask && (
          <div className="task-list__reschedule-wrapper">
            <button
              className="task-list__reschedule-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleReschedule(task.id, e.currentTarget);
              }}
              aria-label="Move to another day"
              title="Move to another day"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M4.5 1.5V3.5M9.5 1.5V3.5M1.5 5.5H12.5M2.5 2.5H11.5C12.05 2.5 12.5 2.95 12.5 3.5V11.5C12.5 12.05 12.05 12.5 11.5 12.5H2.5C1.95 12.5 1.5 12.05 1.5 11.5V3.5C1.5 2.95 1.95 2.5 2.5 2.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 7.5L9 9.5L7 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isRescheduling && (
              <div className="task-list__reschedule-popover" role="dialog" aria-label="Reschedule task" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <button
                  className="task-list__reschedule-tomorrow"
                  autoFocus
                  onClick={() => {
                    onRescheduleTask(task.id, tomorrowString());
                  }}
                >
                  Tomorrow
                </button>
                <input
                  type="date"
                  className="task-list__reschedule-date"
                  min={todayString()}
                  aria-label="Reschedule to date"
                  onChange={(e) => {
                    if (e.target.value) {
                      onRescheduleTask(task.id, e.target.value);
                    }
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Edit button */}
        <button
          className="task-list__edit-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEditTask(task);
          }}
          aria-label="Edit task"
          title="Edit task"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M10 2L12 4L5 11H3V9L10 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Delete button with confirmation */}
        <button
          className={`task-list__delete-btn ${isConfirmingDelete ? 'task-list__delete-btn--confirming' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteClick(task.id);
          }}
          onBlur={() => onDeleteBlur(task.id)}
          aria-label={isConfirmingDelete ? 'Confirm delete' : 'Delete task'}
          title={isConfirmingDelete ? 'Click again to confirm' : 'Delete task'}
        >
          {isConfirmingDelete ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 7L5.5 10.5L12 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 4H11M5.5 4V3C5.5 2.45 5.95 2 6.5 2H7.5C8.05 2 8.5 2.45 8.5 3V4M6 6.5V10M8 6.5V10M4 4L4.5 11.5C4.5 12.05 4.95 12.5 5.5 12.5H8.5C9.05 12.5 9.5 12.05 9.5 11.5L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </li>
  );
});

export default function TaskList({
  tasks,
  colorMap,
  activeTaskId,
  allTasksDone,
  onToggleComplete,
  onToggleImportant,
  onDeleteTask,
  onEditTask,
  onReorder,
  onReorderAll,
  onSelectTask,
  onRescheduleTask,
  onMoveAllToTomorrow,
  isFirstVisit,
  onTryDemo,
}: TaskListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll active task into view when selection changes
  useEffect(() => {
    if (!activeTaskId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-task-id="${activeTaskId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeTaskId]);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const confirmingDeleteRef = useRef<string | null>(null);
  const [reschedulingTaskId, setReschedulingTaskId] = useState<string | null>(null);
  const rescheduleTriggerRef = useRef<HTMLElement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  // Dismiss reschedule popover on Escape or outside click
  const dismissReschedule = useCallback(() => {
    setReschedulingTaskId(null);
    rescheduleTriggerRef.current?.focus();
    rescheduleTriggerRef.current = null;
  }, []);

  useEffect(() => {
    if (!reschedulingTaskId) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissReschedule();
    };
    const handleClick = () => dismissReschedule();

    document.addEventListener('keydown', handleKey);
    // Delay adding click listener so the opening click doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('click', handleClick);
      clearTimeout(timer);
    };
  }, [reschedulingTaskId, dismissReschedule]);

  // Sort: incomplete tasks by scheduledStart (matches clock face order), completed at bottom
  const sortedTasks = useMemo(() =>
    [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.scheduledStart - b.scheduledStart;
    }),
    [tasks],
  );

  const incompleteTasks = useMemo(() => sortedTasks.filter((t) => !t.completed), [sortedTasks]);
  const unfinishedCount = useMemo(() => sortedTasks.filter((t) => !t.completed && !t.isBreak).length, [sortedTasks]);

  // Colour map comes from ClockFace via prop (single source of truth)

  const handleDeleteClick = useCallback((taskId: string) => {
    // Recurring tasks skip two-click confirmation — the modal serves as confirmation
    const task = tasks.find(t => t.id === taskId);
    if (task && (task.recurrencePattern || task.recurrenceSourceId)) {
      onDeleteTask(taskId);
      return;
    }

    if (confirmingDeleteRef.current === taskId) {
      onDeleteTask(taskId);
      confirmingDeleteRef.current = null;
      setConfirmingDeleteId(null);
    } else {
      confirmingDeleteRef.current = taskId;
      setConfirmingDeleteId(taskId);
    }
  }, [tasks, onDeleteTask]);

  const handleDeleteBlur = useCallback((taskId: string) => {
    setTimeout(() => {
      if (confirmingDeleteRef.current === taskId) {
        confirmingDeleteRef.current = null;
        setConfirmingDeleteId(null);
      }
    }, 200);
  }, []);

  const handleToggleReschedule = useCallback((taskId: string, triggerEl?: HTMLElement) => {
    setReschedulingTaskId((current) => {
      if (current === taskId) return null;
      rescheduleTriggerRef.current = triggerEl ?? null;
      return taskId;
    });
  }, []);

  const handleToggleDetails = useCallback((taskId: string) => {
    setExpandedDetailsId((current) => (current === taskId ? null : taskId));
  }, []);

  const handleDragStart = useCallback((taskId: string) => {
    setDraggingId(taskId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(taskId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId || !onReorderAll) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    // Reorder incomplete tasks: move dragged task to target position
    const incomplete = [...tasks]
      .filter(t => !t.completed)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const dragIdx = incomplete.findIndex(t => t.id === draggingId);
    const targetIdx = incomplete.findIndex(t => t.id === targetId);

    if (dragIdx >= 0 && targetIdx >= 0) {
      const [moved] = incomplete.splice(dragIdx, 1);
      incomplete.splice(targetIdx, 0, moved);
      onReorderAll(incomplete.map(t => t.id));
    }

    setDraggingId(null);
    setDragOverId(null);
  }, [draggingId, tasks, onReorderAll]);

  if (tasks.length === 0) {
    if (isFirstVisit) {
      return (
        <div className="task-list task-list--empty task-list--onboarding">
          <p className="task-list__onboarding-heading">Plan your day visually</p>
          <ul className="task-list__onboarding-tips">
            <li>Add tasks above — they appear as arcs on the clock</li>
            <li>Set a fixed time to pin a task to a specific hour</li>
            <li>Start the Pomodoro timer on any task to focus</li>
          </ul>
          {onTryDemo && (
            <button className="task-list__try-demo" onClick={onTryDemo}>
              Try demo mode
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="task-list task-list--empty">
        <p className="task-list__empty-message">Nothing scheduled yet. Add your first task above.</p>
      </div>
    );
  }

  const renderItem = (task: ScheduledTask) => (
    <TaskItem
      key={task.id}
      task={task}
      arcColor={colorMap?.get(task.id)}
      isActive={task.id === activeTaskId}
      isFirst={!task.completed && task.id === incompleteTasks[0]?.id}
      isLast={!task.completed && task.id === incompleteTasks[incompleteTasks.length - 1]?.id}
      isConfirmingDelete={confirmingDeleteId === task.id}
      isRescheduling={reschedulingTaskId === task.id}
      isDragging={draggingId === task.id}
      isDragOver={dragOverId === task.id}
      isDetailsExpanded={expandedDetailsId === task.id}
      onToggleDetails={handleToggleDetails}
      onToggleComplete={onToggleComplete}
      onToggleImportant={onToggleImportant}
      onEditTask={onEditTask}
      onReorder={onReorder}
      onSelectTask={onSelectTask}
      onRescheduleTask={onRescheduleTask}
      onDeleteClick={handleDeleteClick}
      onDeleteBlur={handleDeleteBlur}
      onToggleReschedule={handleToggleReschedule}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDrop={handleDrop}
    />
  );

  if (allTasksDone) {
    return (
      <div className="task-list task-list--all-done">
        <p className="task-list__all-done-message">All done for today. ✓</p>
        <ul ref={listRef} className="task-list__items task-list__items--done" role="list">
          {sortedTasks.map((task) => renderItem(task))}
        </ul>
      </div>
    );
  }

  return (
    <div className="task-list">
      <ul ref={listRef} className="task-list__items" role="list">
        {sortedTasks.map((task) => renderItem(task))}
      </ul>
      {onMoveAllToTomorrow && unfinishedCount > 0 && (
        <div className="task-list__batch-actions">
          <button
            className="task-list__batch-btn"
            onClick={onMoveAllToTomorrow}
          >
            Move {unfinishedCount} unfinished to tomorrow &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
