import { useState, useEffect, useRef, useCallback } from 'react';
import './HelpModal.css';

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`help-faq__item ${open ? 'help-faq__item--open' : ''}`}>
      <button
        className="help-faq__question"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{question}</span>
        <svg
          className="help-faq__chevron"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M4 5.5L7 8.5L10 5.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && <div className="help-faq__answer">{children}</div>}
    </div>
  );
}

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  demoMode?: boolean;
  onToggleDemoMode?: () => void;
}

export default function HelpModal({ open, onClose, demoMode, onToggleDemoMode }: HelpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Focus trap and keyboard handling
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    // Save the element that had focus before opening
    previousFocusRef.current = document.activeElement as HTMLElement;

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Move focus into the modal
    requestAnimationFrame(() => {
      const closeBtn = modalRef.current?.querySelector<HTMLElement>('.help-modal__close');
      closeBtn?.focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      // Return focus to the trigger element
      previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="help-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="help-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
      >
        <div className="help-modal__header">
          <h2 id="help-modal-title" className="help-modal__title">How to use ChronoTasker</h2>
          <button
            className="help-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="help-modal__body">
          {onToggleDemoMode && (
            <div className="help-modal__section help-modal__section--demo">
              <p>
                Load sample tasks, calendar events, and backlog items to explore all
                features without affecting your real data.
              </p>
              <button
                className={`help-modal__demo-btn ${demoMode ? 'help-modal__demo-btn--active' : ''}`}
                onClick={() => { onToggleDemoMode(); onClose(); }}
              >
                {demoMode ? 'Exit demo mode' : 'Try demo mode'}
              </button>
            </div>
          )}

          <div className="help-modal__divider" />

          <p className="help-modal__intro">
            ChronoTasker is a visual time-planning tool. Instead of a flat to-do list,
            you see your day as a clock — each task is a coloured arc. A built-in
            Pomodoro timer helps you work in focused bursts.
          </p>

          <div className="help-modal__section">
            <h3>The clock face</h3>
            <p>
              The ring shows your scheduled day. Coloured arcs are your tasks; tap one to
              select it. The hand tracks the current time in your chosen highlight colour.
              If you connect a calendar feed, those events appear as purple arcs behind
              your tasks.
            </p>
          </div>

          <div className="help-modal__section">
            <h3>Adding and managing tasks</h3>
            <p>
              Use the form on the right to add a task with a name and duration. You can
              optionally pin it to a fixed start time. Once added, tasks can be reordered
              by dragging, marked complete, flagged as important, or moved to another day
              using the calendar icon. If the task order you have causes overflow, a banner
              will suggest a reordering that fits.
            </p>
          </div>

          <div className="help-modal__section">
            <h3>The Pomodoro timer</h3>
            <p>
              Select a task, then start the timer. Work for 25 minutes, take a short break,
              and repeat. After four cycles a longer break kicks in. Enable it and adjust
              durations in Settings under <strong>Pomodoro</strong>.{' '}
              <a
                href="https://francescocirillo.com/products/the-pomodoro-technique"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read more about the technique.
              </a>
            </p>
          </div>

          <div className="help-modal__section">
            <h3>Settings</h3>
            <p>
              Click the <strong>&#9881; gear icon</strong> (top right). The panel appears
              beneath it, aligned to the task list. Toggle switches control boolean options;
              use the +/− steppers for durations. The coloured dots let you pick a highlight
              colour. Turn on <strong>Advanced mode</strong> to unlock calendar integration,
              recurring tasks, fixed-time scheduling, and the Pomodoro timer.
            </p>
          </div>

          <div className="help-modal__divider" />

          <div className="help-faq">
            <h3 className="help-faq__heading">Common questions</h3>

            <FaqItem question="Does it work offline?">
              <p>
                Yes. Tasks are saved to your browser first, then synced to the server when
                online. The status pill in the header shows the current state.
              </p>
            </FaqItem>

            <FaqItem question="How do I connect my calendar?">
              <p>
                Open Settings, turn on Advanced mode, then paste an iCal feed URL (ending
                in <code>.ics</code>, from Google Calendar or Proton Calendar sharing) into
                the Calendar feed field and press <strong>Load</strong>. Events appear on
                the clock as purple arcs and the feed refreshes every five minutes.
              </p>
            </FaqItem>

            <FaqItem question="What does 'auto-advance' do?">
              <p>
                When on, flexible tasks are scheduled from the current time rather than the
                day start — so your plan always looks forward. Turn it off in Settings if
                you prefer tasks to always start from your day's start hour.
              </p>
            </FaqItem>

            <FaqItem question="Can I move a task to a different day?">
              <p>
                Yes. Hover over (or tap) a task and click the calendar icon. Send it to
                tomorrow with one click, or pick any date. Use the arrow buttons in the
                date bar to browse days; the <strong>↵ Today</strong> button returns you
                to the current day.
              </p>
            </FaqItem>

            <FaqItem question="What does the meeting buffer do?">
              <p>
                With a calendar feed connected, the scheduler adds a gap after each meeting
                before placing the next flexible task. Adjust the duration (in minutes)
                with the +/− stepper in Settings, or set it to 0 to disable.
              </p>
            </FaqItem>

            <FaqItem question="Does ChronoTasker read my calendar data?">
              <p>
                Your calendar feed is fetched directly from your browser — ChronoTasker
                never stores or transmits calendar data to the server. Events are only
                held in memory while the app is open and are not saved alongside your
                tasks.
              </p>
            </FaqItem>

            <FaqItem question="What's the backlog?">
              <p>
                The backlog holds tasks that aren't assigned to a specific day. Add
                something to the backlog when you know you want to do it eventually but
                haven't decided when. You can move backlog items to any day using the
                calendar icon, or drag them directly into the task list.
              </p>
            </FaqItem>
          </div>
        </div>
      </div>
    </div>
  );
}
