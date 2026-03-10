import React, { useState, useCallback } from 'react';
import type { AppSettings, CalendarEvent } from '../types';
import './SettingsPanel.css';

type Tab = 'look' | 'schedule' | 'calendars' | 'timer' | 'account';

const TABS: { id: Tab; label: string }[] = [
  { id: 'look',      label: 'Look'      },
  { id: 'schedule',  label: 'Schedule'  },
  { id: 'calendars', label: 'Calendars' },
  { id: 'timer',     label: 'Timer'     },
  { id: 'account',   label: 'Account'   },
];

const SCHEME_COLORS: Record<string, string> = {
  berry:     '#B48EAD',
  nord:      '#5E81AC',
  aurora:    '#D08770',
  frost:     '#8FBCBB',
  evergreen: '#A3BE8C',
};

export interface SettingsPanelProps {
  settings: AppSettings;
  onSettingChange: (s: AppSettings) => void;
  tdTheme: 'light' | 'system' | 'dark';
  onThemeChange: (t: 'light' | 'system' | 'dark') => void;
  onClose: () => void;
  // Calendar feeds
  icalUrlInputs: string[];
  onIcalUrlsChange: (urls: string[]) => void;
  icalLoading: boolean;
  icalErrors: (string | null)[];
  calendarEvents: CalendarEvent[];
  committedIcalUrls: string[];
  onLoadCalendar: () => void;
  // Data & account
  dataActionStatus: { type: 'success' | 'error'; message: string } | null;
  exportWorking: boolean;
  onExport: () => void;
  importWorking: boolean;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenDeleteModal: () => void;
  onLogout: () => void;
  userEmail: string;
}

/* ---- Primitive controls ---- */

function Toggle({ checked, onChange, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="sp-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="sp-toggle__track" aria-hidden="true" />
    </label>
  );
}

function Stepper({ value, min, max, unit, onInc, onDec, label }: {
  value: number;
  min: number;
  max: number;
  unit?: string;
  onInc: () => void;
  onDec: () => void;
  label: string;
}) {
  return (
    <div className="sp-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="sp-stepper__btn"
        onClick={onDec}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
      >−</button>
      <span className="sp-stepper__value" aria-live="polite">{value}</span>
      <button
        type="button"
        className="sp-stepper__btn"
        onClick={onInc}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
      >+</button>
      {unit && <span className="sp-stepper__unit">{unit}</span>}
    </div>
  );
}

function Row({ label, hint, children, stacked }: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={`sp-row${stacked ? ' sp-row--stacked' : ''}`}>
      <div className="sp-row__label-group">
        <span className="sp-row__label">{label}</span>
        {hint && <span className="sp-row__hint">{hint}</span>}
      </div>
      <div className="sp-row__control">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="sp-section-label" role="heading" aria-level={3}>
      {children}
    </p>
  );
}

function Divider() {
  return <div className="sp-divider" aria-hidden="true" />;
}

/* ---- Main component ---- */

export function SettingsPanel({
  settings,
  onSettingChange,
  tdTheme,
  onThemeChange,
  onClose,
  icalUrlInputs,
  onIcalUrlsChange,
  icalLoading,
  icalErrors,
  calendarEvents,
  committedIcalUrls,
  onLoadCalendar,
  dataActionStatus,
  exportWorking,
  onExport,
  importWorking,
  onImport,
  onOpenDeleteModal,
  onLogout,
  userEmail,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('look');
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);

  const set = useCallback(
    (changes: Partial<AppSettings>) => {
      // If turning off advanced mode while on an advanced-only tab, go back to Look
      if (changes.advancedMode === false && (activeTab === 'calendars' || activeTab === 'timer')) {
        setActiveTab('look');
      }
      onSettingChange({ ...settings, ...changes });
    },
    [onSettingChange, settings, activeTab],
  );

  const formatHour = (hour: number) => {
    const h = Math.floor(hour);
    const m = Math.round((hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const parseHour = (val: string, fallback: number): number => {
    const [h, m] = val.split(':').map(Number);
    return isNaN(h) ? fallback : h + (m || 0) / 60;
  };

  return (
    <div
      className="sp-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sp"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.key === 'Escape' && onClose()}
      >
        {/* Header */}
        <div className="sp-header">
          <span className="sp-header__title">Settings</span>
          <div className="sp-header__right">
            <label className="sp-advanced-toggle" title="Advanced mode">
              <input
                type="checkbox"
                checked={settings.advancedMode}
                onChange={e => set({ advancedMode: e.target.checked })}
                aria-label="Advanced mode"
              />
              <span className="sp-advanced-toggle__track" aria-hidden="true" />
              <span className="sp-advanced-toggle__label">Advanced</span>
            </label>
            <button
              className="sp-header__close"
              onClick={onClose}
              aria-label="Close settings"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab bar — Calendars and Timer only shown in advanced mode */}
        <nav className="sp-tabs" aria-label="Settings sections">
          {TABS.filter(tab =>
            settings.advancedMode || (tab.id !== 'calendars' && tab.id !== 'timer')
          ).map(tab => (
            <button
              key={tab.id}
              role="tab"
              className={`sp-tab${activeTab === tab.id ? ' sp-tab--active' : ''}`}
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="sp-content">

          {/* ── LOOK ─────────────────────────────────── */}
          {activeTab === 'look' && (
            <div className="sp-pane">
              <SectionLabel>Theme</SectionLabel>
              <div className="sp-theme-group" role="group" aria-label="Colour scheme preference">
                {(['light', 'system', 'dark'] as const).map(opt => (
                  <button
                    key={opt}
                    className={`sp-theme-btn${tdTheme === opt ? ' sp-theme-btn--active' : ''}`}
                    onClick={() => onThemeChange(opt)}
                    aria-pressed={tdTheme === opt}
                  >
                    <span className="sp-theme-btn__icon" aria-hidden="true">
                      {opt === 'light' ? '☀' : opt === 'dark' ? '☾' : '⊙'}
                    </span>
                    <span>{opt.charAt(0).toUpperCase() + opt.slice(1)}</span>
                  </button>
                ))}
              </div>

              <SectionLabel>Colour scheme</SectionLabel>
              <div className="sp-schemes" role="radiogroup" aria-label="Colour scheme">
                {(['berry', 'nord', 'aurora', 'frost', 'evergreen'] as const).map(scheme => {
                  const active = (settings.colorScheme || 'berry') === scheme;
                  return (
                    <label
                      key={scheme}
                      className={`sp-scheme${active ? ' sp-scheme--active' : ''}`}
                      aria-label={scheme.charAt(0).toUpperCase() + scheme.slice(1)}
                    >
                      <input
                        type="radio"
                        name="sp-colorScheme"
                        value={scheme}
                        checked={active}
                        onChange={() => set({ colorScheme: scheme as AppSettings['colorScheme'] })}
                      />
                      <span
                        className="sp-scheme__dot"
                        style={{ background: SCHEME_COLORS[scheme] }}
                      />
                      <span className="sp-scheme__name">
                        {scheme.charAt(0).toUpperCase() + scheme.slice(1)}
                      </span>
                    </label>
                  );
                })}
              </div>

              <Divider />

              <Row label="24-hour time">
                <Toggle
                  checked={settings.use24Hour}
                  onChange={v => set({ use24Hour: v })}
                  label="24-hour time"
                />
              </Row>
              <Row label="Clock on right">
                <Toggle
                  checked={settings.clockPosition === 'right'}
                  onChange={v => set({ clockPosition: v ? 'right' : 'left' })}
                  label="Clock on right"
                />
              </Row>
              <Row label="Sound effects" hint="Tick on complete, chime on Pomodoro end">
                <Toggle
                  checked={!!settings.enableSounds}
                  onChange={v => set({ enableSounds: v })}
                  label="Sound effects"
                />
              </Row>

            </div>
          )}

          {/* ── SCHEDULE ─────────────────────────────── */}
          {activeTab === 'schedule' && (
            <div className="sp-pane">
              <SectionLabel>Day hours</SectionLabel>
              <div className="sp-time-range">
                <div className="sp-time-field">
                  <label className="sp-time-field__label" htmlFor="sp-day-start">Start</label>
                  <input
                    id="sp-day-start"
                    type="time"
                    className="sp-time-input"
                    aria-label="Day start time"
                    value={formatHour(settings.dayStartHour)}
                    onChange={e => set({ dayStartHour: parseHour(e.target.value, settings.dayStartHour) })}
                  />
                </div>
                <div className="sp-time-range__sep" aria-hidden="true">→</div>
                <div className="sp-time-field">
                  <label className="sp-time-field__label" htmlFor="sp-day-end">End</label>
                  <input
                    id="sp-day-end"
                    type="time"
                    className="sp-time-input"
                    aria-label="Day end time"
                    value={formatHour(settings.dayEndHour)}
                    onChange={e => set({ dayEndHour: parseHour(e.target.value, settings.dayEndHour) })}
                  />
                </div>
              </div>

              <Divider />
              <SectionLabel>Working days</SectionLabel>
              <p className="sp-hint">Only these days are shown when navigating</p>
              <div className="sp-days" role="group" aria-label="Working days">
                {([
                  { label: 'Mon', day: 1 }, { label: 'Tue', day: 2 }, { label: 'Wed', day: 3 },
                  { label: 'Thu', day: 4 }, { label: 'Fri', day: 5 },
                  { label: 'Sat', day: 6 }, { label: 'Sun', day: 7 },
                ] as { label: string; day: number }[]).map(({ label, day }) => {
                  const active = settings.workingDays.includes(day);
                  const id = `sp-wd-${day}`;
                  return (
                    <label
                      key={day}
                      htmlFor={id}
                      className={`sp-day${active ? ' sp-day--active' : ''}`}
                    >
                      <input
                        type="checkbox"
                        id={id}
                        checked={active}
                        onChange={() => {
                          const next = active
                            ? settings.workingDays.filter(d => d !== day)
                            : [...settings.workingDays, day].sort((a, b) => a - b);
                          set({ workingDays: next });
                        }}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>

              <Divider />

              <Row label="Auto-advance" hint="Schedule from the current time, not the day start">
                <Toggle
                  checked={settings.autoAdvance}
                  onChange={v => set({ autoAdvance: v })}
                  label="Auto-advance"
                />
              </Row>

              {settings.advancedMode && (
                <>
                  <Divider />
                  <Row label="Recurring tasks">
                    <Toggle
                      checked={settings.enableRecurringTasks}
                      onChange={v => set({ enableRecurringTasks: v })}
                      label="Recurring tasks"
                    />
                  </Row>
                  <Row label="Backlog">
                    <Toggle
                      checked={settings.enableBacklog}
                      onChange={v => set({ enableBacklog: v })}
                      label="Backlog"
                    />
                  </Row>
                  <Row label="Day time summary">
                    <Toggle
                      checked={settings.showDaySummary}
                      onChange={v => set({ showDaySummary: v })}
                      label="Day time summary"
                    />
                  </Row>
                </>
              )}
            </div>
          )}

          {/* ── CALENDARS ────────────────────────────── */}
          {activeTab === 'calendars' && (
            <div className="sp-pane">
              <SectionLabel>iCal feeds</SectionLabel>

              <details className="sp-ical-guide">
                <summary className="sp-ical-guide__summary">How to find your iCal URL</summary>
                <div className="sp-ical-guide__body">
                  <div className="sp-ical-guide__provider">
                    <span className="sp-ical-guide__provider-name">Google Calendar</span>
                    <ol className="sp-ical-guide__steps">
                      <li>Open Google Calendar on the web</li>
                      <li>Click the three dots next to a calendar on the left</li>
                      <li>Choose <strong>Settings and sharing</strong></li>
                      <li>Scroll to <strong>Secret address in iCal format</strong> and copy the link</li>
                    </ol>
                  </div>
                  <div className="sp-ical-guide__provider">
                    <span className="sp-ical-guide__provider-name">Apple Calendar (macOS)</span>
                    <ol className="sp-ical-guide__steps">
                      <li>Right-click a calendar in the sidebar</li>
                      <li>Choose <strong>Share Calendar…</strong></li>
                      <li>Tick <strong>Public Calendar</strong> and copy the link</li>
                    </ol>
                  </div>
                  <div className="sp-ical-guide__provider">
                    <span className="sp-ical-guide__provider-name">Proton Calendar</span>
                    <ol className="sp-ical-guide__steps">
                      <li>Go to Settings and open a calendar</li>
                      <li>Under <strong>Other settings</strong>, find <strong>Link to this calendar</strong></li>
                      <li>Copy the link</li>
                    </ol>
                  </div>
                  <div className="sp-ical-guide__provider">
                    <span className="sp-ical-guide__provider-name">Fastmail / other apps</span>
                    <ol className="sp-ical-guide__steps">
                      <li>Look for a <strong>Share</strong> or <strong>Export</strong> option in your calendar's settings</li>
                      <li>Copy the private or secret iCal/ICS link — not a public subscribe link</li>
                    </ol>
                  </div>
                </div>
              </details>

              {icalUrlInputs.map((url, i) => (
                <div key={i} className="sp-ical-entry">
                  <div className="sp-ical-row">
                    <input
                      type="url"
                      className="sp-ical-input"
                      value={url}
                      placeholder="https://…"
                      aria-label={`Calendar feed URL ${i + 1}`}
                      onChange={e => {
                        const next = [...icalUrlInputs];
                        next[i] = e.target.value;
                        onIcalUrlsChange(next);
                        if (confirmRemoveIndex === i) setConfirmRemoveIndex(null);
                      }}
                      onKeyDown={e => e.key === 'Enter' && onLoadCalendar()}
                    />
                    {confirmRemoveIndex === i ? (
                      <div className="sp-ical-confirm">
                        <button
                          type="button"
                          className="sp-ical-confirm__yes"
                          aria-label="Confirm remove calendar feed"
                          onClick={() => {
                            onIcalUrlsChange(icalUrlInputs.filter((_, j) => j !== i));
                            setConfirmRemoveIndex(null);
                          }}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="sp-ical-confirm__no"
                          aria-label="Cancel remove"
                          onClick={() => setConfirmRemoveIndex(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="sp-ical-remove"
                        aria-label="Remove calendar feed"
                        onClick={() => setConfirmRemoveIndex(i)}
                      >
                        <svg width="12" height="13" viewBox="0 0 12 13" fill="none" aria-hidden="true">
                          <path d="M1 3h10M4 3V2h4v1M5 6v4M7 6v4M2 3l.7 8h6.6L10 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Remove
                      </button>
                    )}
                  </div>
                  {icalErrors[i] && (
                    <span className="sp-error" role="alert">{icalErrors[i]}</span>
                  )}
                </div>
              ))}
              <div className="sp-ical-actions">
                {icalUrlInputs.length < 3 && (
                  <button
                    type="button"
                    className="sp-link-btn"
                    onClick={() => onIcalUrlsChange([...icalUrlInputs, ''])}
                  >
                    + Add calendar
                  </button>
                )}
                <button
                  className="sp-action-btn"
                  onClick={onLoadCalendar}
                  disabled={icalLoading}
                >
                  {icalLoading ? 'Loading…' : committedIcalUrls.length ? 'Reload' : 'Load'}
                </button>
              </div>
              {calendarEvents.length > 0 && (
                <p className="sp-status sp-status--ok">
                  {calendarEvents.length} event{calendarEvents.length !== 1 ? 's' : ''} loaded
                </p>
              )}
              {committedIcalUrls.length > 0 && !icalErrors.some(Boolean) && calendarEvents.length === 0 && !icalLoading && (
                <p className="sp-status">No events for this date</p>
              )}

              {committedIcalUrls.length > 0 && (
                <>
                  <Divider />
                  <Row label="Buffer after meetings">
                    <Stepper
                      value={settings.meetingBufferMinutes}
                      min={0} max={60} unit="min"
                      label="Meeting buffer"
                      onDec={() => set({ meetingBufferMinutes: Math.max(0, settings.meetingBufferMinutes - 5) })}
                      onInc={() => set({ meetingBufferMinutes: Math.min(60, settings.meetingBufferMinutes + 5) })}
                    />
                  </Row>
                </>
              )}

              <Divider />

              <Row label="Recurring tasks">
                <Toggle
                  checked={settings.enableRecurringTasks}
                  onChange={v => set({ enableRecurringTasks: v })}
                  label="Recurring tasks"
                />
              </Row>
              <Row label="Backlog">
                <Toggle
                  checked={settings.enableBacklog}
                  onChange={v => set({ enableBacklog: v })}
                  label="Backlog"
                />
              </Row>
              <Row label="Day time summary">
                <Toggle
                  checked={settings.showDaySummary}
                  onChange={v => set({ showDaySummary: v })}
                  label="Day time summary"
                />
              </Row>
            </div>
          )}

          {/* ── TIMER ────────────────────────────────── */}
          {activeTab === 'timer' && (
            <div className="sp-pane">
              <Row label="Pomodoro timer" hint="Show the focus timer in the main panel">
                <Toggle
                  checked={settings.showPomodoroTimer}
                  onChange={v => set({ showPomodoroTimer: v })}
                  label="Pomodoro timer"
                />
              </Row>

              {settings.showPomodoroTimer && (
                <>
                  <Divider />
                  <SectionLabel>Durations</SectionLabel>
                  <div className="sp-pomodoro-grid">
                    <div className="sp-pomodoro-item">
                      <span className="sp-pomodoro-item__label">Work</span>
                      <Stepper
                        value={settings.workDuration}
                        min={1} max={120} unit="min"
                        label="Work duration"
                        onDec={() => set({ workDuration: Math.max(1, settings.workDuration - 5) })}
                        onInc={() => set({ workDuration: Math.min(120, settings.workDuration + 5) })}
                      />
                    </div>
                    <div className="sp-pomodoro-item">
                      <span className="sp-pomodoro-item__label">Short break</span>
                      <Stepper
                        value={settings.shortBreakDuration}
                        min={1} max={30} unit="min"
                        label="Short break duration"
                        onDec={() => set({ shortBreakDuration: Math.max(1, settings.shortBreakDuration - 1) })}
                        onInc={() => set({ shortBreakDuration: Math.min(30, settings.shortBreakDuration + 1) })}
                      />
                    </div>
                    <div className="sp-pomodoro-item">
                      <span className="sp-pomodoro-item__label">Long break</span>
                      <Stepper
                        value={settings.longBreakDuration}
                        min={1} max={60} unit="min"
                        label="Long break duration"
                        onDec={() => set({ longBreakDuration: Math.max(1, settings.longBreakDuration - 5) })}
                        onInc={() => set({ longBreakDuration: Math.min(60, settings.longBreakDuration + 5) })}
                      />
                    </div>
                    <div className="sp-pomodoro-item">
                      <span className="sp-pomodoro-item__label">Long break after</span>
                      <Stepper
                        value={settings.pomodorosBeforeLongBreak}
                        min={2} max={8} unit="sessions"
                        label="Sessions before long break"
                        onDec={() => set({ pomodorosBeforeLongBreak: Math.max(2, settings.pomodorosBeforeLongBreak - 1) })}
                        onInc={() => set({ pomodorosBeforeLongBreak: Math.min(8, settings.pomodorosBeforeLongBreak + 1) })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── ACCOUNT ──────────────────────────────── */}
          {activeTab === 'account' && (
            <div className="sp-pane">
              {dataActionStatus && (
                <p
                  className={`sp-status ${dataActionStatus.type === 'success' ? 'sp-status--ok' : 'sp-status--error'}`}
                  role="alert"
                >
                  {dataActionStatus.message}
                </p>
              )}

              <div className="sp-account-action">
                <div className="sp-account-action__text">
                  <span className="sp-account-action__label">Signed in as</span>
                  <span className="sp-account-action__desc">{userEmail}</span>
                </div>
                <button className="sp-action-btn" onClick={onLogout}>
                  Sign out
                </button>
              </div>

              <Divider />
              <SectionLabel>Your data</SectionLabel>

              <div className="sp-account-action">
                <div className="sp-account-action__text">
                  <span className="sp-account-action__label">Export</span>
                  <span className="sp-account-action__desc">
                    Download all your tasks, sessions, and settings as a JSON file.
                  </span>
                </div>
                <button
                  className="sp-action-btn"
                  onClick={onExport}
                  disabled={exportWorking}
                >
                  {exportWorking ? 'Exporting…' : 'Download'}
                </button>
              </div>

              <div className="sp-account-action">
                <div className="sp-account-action__text">
                  <span className="sp-account-action__label">Import</span>
                  <span className="sp-account-action__desc">
                    Restore from a previously exported file. This replaces all current data.
                  </span>
                </div>
                <label className={`sp-action-btn${importWorking ? ' sp-action-btn--disabled' : ''}`}>
                  {importWorking ? 'Importing…' : 'Choose file'}
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={onImport}
                    disabled={importWorking}
                    style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
                    aria-label="Choose JSON export file to import"
                  />
                </label>
              </div>

              <Divider />
              <SectionLabel>Danger zone</SectionLabel>

              <div className="sp-account-action sp-account-action--danger">
                <div className="sp-account-action__text">
                  <span className="sp-account-action__label">Delete account</span>
                  <span className="sp-account-action__desc">
                    Permanently removes your account and all data. Cannot be undone.
                  </span>
                </div>
                <button
                  className="sp-action-btn sp-action-btn--danger"
                  onClick={onOpenDeleteModal}
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
