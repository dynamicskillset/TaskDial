import React from 'react';
import './ExtendTaskPrompt.css';

interface ExtendTaskPromptProps {
  taskTitle: string;
  onExtend: () => void;
  onMarkDone: () => void;
  onDismiss: () => void;
}

const ExtendTaskPrompt: React.FC<ExtendTaskPromptProps> = ({
  taskTitle,
  onExtend,
  onMarkDone,
  onDismiss,
}) => {
  return (
    <div className="extend-prompt" role="alertdialog" aria-live="assertive" aria-label="Task time up">
      <div className="extend-prompt__icon" aria-hidden="true">⏰</div>
      <div className="extend-prompt__body">
        <p className="extend-prompt__title">Time's up</p>
        <p className="extend-prompt__task">{taskTitle}</p>
      </div>
      <div className="extend-prompt__actions">
        <button className="extend-prompt__btn extend-prompt__btn--extend" onClick={onExtend}>
          +15 min
        </button>
        <button className="extend-prompt__btn extend-prompt__btn--done" onClick={onMarkDone}>
          Done
        </button>
        <button className="extend-prompt__btn extend-prompt__btn--dismiss" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
};

export default ExtendTaskPrompt;
