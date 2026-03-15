import React, { useState, useLayoutEffect, useRef } from 'react';
import './OnboardingWalkthrough.css';

interface Step {
  target: string; // data-onboarding value — empty string = centered, no spotlight
  title: string;
  body: string | ((version: string) => string);
  cardSide: 'left' | 'right' | 'top' | 'bottom' | 'center';
}

const STEPS: Step[] = [
  {
    target: '',
    title: "Welcome to TaskDial",
    body: (v) => `You're on v${v}. Two new things: tasks flash when they run over time, and this walkthrough. Let's take a quick tour.`,
    cardSide: 'center',
  },
  {
    target: 'clock',
    title: 'Your day at a glance',
    body: 'Tasks appear as arcs on the clock. A coloured line marks the current time. Click any arc to select that task.',
    cardSide: 'right',
  },
  {
    target: 'tasklist',
    title: 'Your task list',
    body: 'All tasks for the day are listed here. Drag to reorder, or click to select a task and see it highlighted on the clock.',
    cardSide: 'left',
  },
  {
    target: 'taskform',
    title: 'Add tasks quickly',
    body: 'Type a task title and press Enter. Set a duration and optional fixed start time to pin it to a specific slot.',
    cardSide: 'left',
  },
  {
    target: 'settings-btn',
    title: 'Make it yours',
    body: 'Open Settings to adjust working hours, theme, calendar feeds, and more. You can replay this tour any time from the Account tab.',
    cardSide: 'bottom',
  },
];

interface OnboardingWalkthroughProps {
  onComplete: () => void;
  appVersion: string;
}

const CARD_W = 280;

const OnboardingWalkthrough: React.FC<OnboardingWalkthroughProps> = ({ onComplete, appVersion }) => {
  const [step, setStep] = useState(0);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({});
  const [spotlightStyle, setSpotlightStyle] = useState<React.CSSProperties>({});
  const cardRef = useRef<HTMLDivElement>(null);

  const current = STEPS[step];

  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;
    const pad = 12;

    if (!current.target) {
      // Centered welcome step
      setCardStyle({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      setSpotlightStyle({});
      return;
    }

    const target = document.querySelector(`[data-onboarding="${current.target}"]`);
    if (!target) {
      setCardStyle({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      setSpotlightStyle({});
      return;
    }

    // Scroll target into view instantly (before measuring) so getBoundingClientRect is accurate
    target.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest' });

    const rect = target.getBoundingClientRect();

    setSpotlightStyle({
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    });

    let top = 0;
    let left = 0;
    let transform = '';

    if (current.cardSide === 'right') {
      left = rect.right + gap;
      top = rect.top + rect.height / 2;
      transform = 'translateY(-50%)';
      // Flip to left if it overflows
      if (left + CARD_W > vw - 8) left = rect.left - CARD_W - gap;
    } else if (current.cardSide === 'left') {
      left = rect.left - CARD_W - gap;
      top = rect.top + rect.height / 2;
      transform = 'translateY(-50%)';
      // Flip to right if it overflows
      if (left < 8) left = rect.right + gap;
    } else if (current.cardSide === 'bottom') {
      top = rect.bottom + gap;
      // Centre horizontally on target, then clamp so card stays on screen
      left = Math.min(
        Math.max(rect.left + rect.width / 2 - CARD_W / 2, 8),
        vw - CARD_W - 8,
      );
      transform = '';
    } else if (current.cardSide === 'top') {
      top = rect.top - gap;
      left = Math.min(
        Math.max(rect.left + rect.width / 2 - CARD_W / 2, 8),
        vw - CARD_W - 8,
      );
      transform = 'translateY(-100%)';
    }

    // Clamp left/right for side cards (transform only shifts vertically)
    if (current.cardSide === 'left' || current.cardSide === 'right') {
      left = Math.max(8, Math.min(left, vw - CARD_W - 8));
    }

    // Clamp vertical for side cards
    if (current.cardSide === 'left' || current.cardSide === 'right') {
      const estCardH = 160;
      if (top - estCardH / 2 < 8) top = estCardH / 2 + 8;
      if (top + estCardH / 2 > vh - 8) top = vh - estCardH / 2 - 8;
    }

    setCardStyle({ top, left, transform, width: CARD_W });
  }, [step, current.target, current.cardSide]);

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else onComplete();
  }

  const isLast = step === STEPS.length - 1;
  const body = typeof current.body === 'function' ? current.body(appVersion) : current.body;

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-label="Welcome walkthrough">
      <div className="onboarding__backdrop" aria-hidden="true" />
      {Object.keys(spotlightStyle).length > 0 && (
        <div className="onboarding__spotlight" style={spotlightStyle} aria-hidden="true" />
      )}

      <div className="onboarding__card" style={cardStyle} ref={cardRef} key={step}>
        <div className="onboarding__progress" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`onboarding__dot${i === step ? ' onboarding__dot--active' : ''}`}
            />
          ))}
        </div>

        <h2 className="onboarding__title">{current.title}</h2>
        <p className="onboarding__body">{body}</p>

        <div className="onboarding__footer">
          <button className="onboarding__skip" onClick={onComplete}>
            Skip
          </button>
          <button className="onboarding__next" onClick={next}>
            {isLast ? 'Get started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWalkthrough;
