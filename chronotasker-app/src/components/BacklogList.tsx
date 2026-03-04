import { useState, useCallback, useRef } from 'react';
import type { Task } from '../types';
import { tagColor, tagBgColor } from './TaskList';
import './BacklogList.css';

interface BacklogListProps {
  tasks: Task[];
  onAssignToToday: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export default function BacklogList({ tasks, onAssignToToday, onEditTask, onDeleteTask }: BacklogListProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const confirmingDeleteRef = useRef<string | null>(null);

  const handleDeleteClick = useCallback((taskId: string) => {
    if (confirmingDeleteRef.current === taskId) {
      onDeleteTask(taskId);
      confirmingDeleteRef.current = null;
      setConfirmingDeleteId(null);
    } else {
      confirmingDeleteRef.current = taskId;
      setConfirmingDeleteId(taskId);
    }
  }, [onDeleteTask]);

  const handleDeleteBlur = useCallback((taskId: string) => {
    setTimeout(() => {
      if (confirmingDeleteRef.current === taskId) {
        confirmingDeleteRef.current = null;
        setConfirmingDeleteId(null);
      }
    }, 200);
  }, []);

  if (tasks.length === 0) {
    return (
      <div className="backlog-list backlog-list--empty">
        <p className="backlog-list__empty-message">
          No backlog tasks. Use "Add to Backlog" when creating a task.
        </p>
      </div>
    );
  }

  return (
    <div className="backlog-list">
      <ul className="backlog-list__items" role="list">
        {tasks.map((task) => (
          <li key={task.id} className="backlog-list__item">
            <div className="backlog-list__content">
              <span className="backlog-list__title">
                {task.title}
                {task.tag && (
                  <span
                    className="backlog-list__tag"
                    style={{ color: tagColor(task.tag), backgroundColor: tagBgColor(task.tag) }}
                  >
                    {task.tag}
                  </span>
                )}
              </span>
              <span className="backlog-list__meta">
                <span className="backlog-list__duration">{formatDuration(task.durationMinutes)}</span>
              </span>
            </div>

            <div className="backlog-list__actions">
              <button
                className="backlog-list__assign-btn"
                onClick={() => onAssignToToday(task.id)}
                aria-label="Assign to today"
                title="Assign to today"
              >
                Today
              </button>
              <button
                className="backlog-list__edit-btn"
                onClick={() => onEditTask(task)}
                aria-label="Edit task"
                title="Edit task"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M10 2L12 4L5 11H3V9L10 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                className={`backlog-list__delete-btn ${confirmingDeleteId === task.id ? 'backlog-list__delete-btn--confirming' : ''}`}
                onClick={() => handleDeleteClick(task.id)}
                onBlur={() => handleDeleteBlur(task.id)}
                aria-label={confirmingDeleteId === task.id ? 'Confirm delete' : 'Delete task'}
                title={confirmingDeleteId === task.id ? 'Click again to confirm' : 'Delete task'}
              >
                {confirmingDeleteId === task.id ? (
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
        ))}
      </ul>
    </div>
  );
}
