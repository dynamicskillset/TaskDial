import { useState, type FormEvent } from 'react';
import { login, register } from '../../services/api';
import type { AuthUser } from '../../services/auth';

interface LoginPageProps {
  onSuccess: (user: AuthUser) => void;
  expired?: boolean;
}

export default function LoginPage({ onSuccess, expired = false }: LoginPageProps) {
  const [view, setView] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, password);
      onSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!email || !password || !inviteCode) {
      setError('All fields are required');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!/^[A-Za-z0-9]{8}$/.test(inviteCode)) {
      setError('Invite code must be 8 letters or numbers');
      return;
    }

    setLoading(true);
    try {
      const user = await register(email, password, inviteCode);
      onSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  function switchView(next: 'login' | 'register') {
    setView(next);
    setError('');
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-logo">TaskDial</h1>
          <p className="auth-tagline">Plan your day visually</p>
        </div>

        {expired && (
          <p className="auth-notice">Your session has expired. Please log in again.</p>
        )}

        <p className="auth-privacy-notice">
          By using TaskDial you agree to our{' '}
          <a href="/privacy" className="auth-privacy-notice__link">Privacy Policy</a>.
        </p>

        {view === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin} noValidate>
            <h2 className="auth-form__title">Log in</h2>

            <div className="auth-field">
              <label htmlFor="login-email" className="auth-field__label">Email</label>
              <input
                id="login-email"
                type="email"
                className="auth-field__input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="login-password" className="auth-field__label">Password</label>
              <input
                id="login-password"
                type="password"
                className="auth-field__input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Logging in…' : 'Log in'}
            </button>

            <p className="auth-switch">
              Have an invite code?{' '}
              <button type="button" className="auth-switch__link" onClick={() => switchView('register')}>
                Create account
              </button>
            </p>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister} noValidate>
            <h2 className="auth-form__title">Create account</h2>

            <div className="auth-field">
              <label htmlFor="reg-email" className="auth-field__label">Email</label>
              <input
                id="reg-email"
                type="email"
                className="auth-field__input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-password" className="auth-field__label">
                Password <span className="auth-field__hint">(12 characters minimum)</span>
              </label>
              <input
                id="reg-password"
                type="password"
                className="auth-field__input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="reg-invite" className="auth-field__label">Invite code</label>
              <input
                id="reg-invite"
                type="text"
                className="auth-field__input auth-field__input--mono"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                maxLength={8}
                autoComplete="off"
                disabled={loading}
              />
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>

            <p className="auth-switch">
              Already have an account?{' '}
              <button type="button" className="auth-switch__link" onClick={() => switchView('login')}>
                Log in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
