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
          <p className="help-modal__intro">
            ChronoTasker is a visual time-planning tool. Instead of a flat to-do list,
            you see your day as a clock, with each task shown as a coloured arc. A built-in{' '}
            <a
              href="https://en.wikipedia.org/wiki/Pomodoro_Technique"
              target="_blank"
              rel="noopener noreferrer"
            >
              Pomodoro timer
            </a>{' '}
            helps you work in focused bursts.
          </p>

          <div className="help-modal__section">
            <h3>The clock face</h3>
            <p>
              The ring shows your scheduled day. Coloured arcs are your tasks; tap one to
              select it. The red hand tracks the current time. If you connect a calendar
              feed, those events appear as purple arcs behind your tasks.
            </p>
          </div>

          <div className="help-modal__section">
            <h3>Adding and managing tasks</h3>
            <p>
              Use the form on the right to add a task with a title and duration. You can
              optionally pin it to a fixed start time. Once added, tasks can be reordered,
              marked complete, flagged as important, or moved to another day using the
              calendar icon.
            </p>
          </div>

          <div className="help-modal__section">
            <h3>The Pomodoro timer</h3>
            <p>
              Select a task, then start the timer. You will work for 25 minutes, take a
              5-minute break, and repeat. After four cycles, a longer 15-minute break kicks
              in. All of these durations are adjustable.{' '}
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
              Tap the <strong>&#9881; gear icon</strong> in the top-right corner. From there you
              can change Pomodoro durations, set your working hours, choose a light or dark
              theme, toggle 12/24-hour time, and connect an iCal calendar feed. If a calendar
              feed is connected, you can also set a buffer (in minutes) after each meeting.
            </p>
          </div>

          <div className="help-modal__divider" />

          <div className="help-faq">
            <h3 className="help-faq__heading">Common questions</h3>

            <FaqItem question="Does it work offline?">
              <p>
                Yes. All tasks are saved to your browser's local storage first, then synced
                to the server when a connection is available. The status pill in the header
                shows whether you are online or offline.
              </p>
            </FaqItem>

            <FaqItem question="How do I connect my calendar?">
              <p>
                Open Settings and paste an iCal feed URL (the kind that ends
                in <code>.ics</code> or comes from Google Calendar / Proton Calendar
                sharing). Press <strong>Load</strong> and your events will appear on the clock.
                The feed refreshes every five minutes.
              </p>
            </FaqItem>

            <FaqItem question="What does 'auto-advance' do?">
              <p>
                When enabled, flexible tasks start from the current time rather than the
                beginning of the day. This keeps your schedule looking forward, not
                backward. You can turn it off in Settings if you prefer a static layout.
              </p>
            </FaqItem>

            <FaqItem question="Can I move a task to a different day?">
              <p>
                Yes. Hover over (or tap) a task and click the calendar icon. You can send it
                to tomorrow with one click, or pick any date. The task will disappear from
                the current day and appear when you browse to that date.
              </p>
            </FaqItem>

            <FaqItem question="What does the meeting buffer do?">
              <p>
                When a calendar feed is connected, the scheduler leaves a gap after each
                meeting before placing the next task. The default is 15 minutes; you can
                change it (or set it to 0) in Settings.
              </p>
            </FaqItem>
          </div>

          {onToggleDemoMode && (
            <>
              <div className="help-modal__divider" />
              <div className="help-modal__section">
                <h3>Try it out</h3>
                <p>
                  Load sample tasks, calendar events, and backlog items to explore all features
                  without affecting your real data.
                </p>
                <button
                  className={`help-modal__demo-btn ${demoMode ? 'help-modal__demo-btn--active' : ''}`}
                  onClick={() => { onToggleDemoMode(); onClose(); }}
                >
                  {demoMode ? 'Exit demo mode' : 'Try demo mode'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
