import { useEffect, useState, useCallback } from 'react';
import { getMe, logout } from '../../services/api';
import { getUser, setUser, clearUser, isAdmin, type AuthUser } from '../../services/auth';
import { setStorageUser, clearStorageUser, migrateAnonymousData } from '../../services/storage';
import LoginPage from './LoginPage';
import AdminDashboard from './AdminDashboard';
import App from '../../App';

type View = 'loading' | 'login' | 'app' | 'admin';

function wantsAdmin(): boolean {
  return window.location.pathname.startsWith('/admin');
}

export default function AuthGate() {
  const [view, setView] = useState<View>('loading');
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const goToApp = useCallback((authedUser: AuthUser) => {
    setUser(authedUser);
    setStorageUser(authedUser.id);
    migrateAnonymousData(authedUser.id);
    setUserState(authedUser);
    const adminRole = authedUser.role === 'admin' || authedUser.role === 'owner';
    setView(wantsAdmin() && adminRole ? 'admin' : 'app');
  }, []);

  const goToLogin = useCallback((expired = false) => {
    setSessionExpired(expired);
    clearUser();
    clearStorageUser();
    setUserState(null);
    setView('login');
  }, []);

  // On mount: check session via /api/auth/me
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      // Optimistic: if we have cached user info, render immediately then verify
      const cached = getUser();
      if (cached) {
        setStorageUser(cached.id);
        setUserState(cached);
        const adminRole = cached.role === 'admin' || cached.role === 'owner';
        setView(wantsAdmin() && adminRole ? 'admin' : 'app');
      }

      const me = await getMe();
      if (cancelled) return;

      if (me) {
        goToApp(me);
      } else if (cached) {
        goToLogin(true);
      } else {
        setView('login');
      }
    }

    checkSession();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for auth:expired events from api.ts 401 intercept
  useEffect(() => {
    function handleExpired() { goToLogin(true); }
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [goToLogin]);

  async function handleLogout() {
    await logout();
    goToLogin(false);
  }

  if (view === 'loading') {
    return (
      <div className="auth-loading" aria-label="Loading">
        <div className="auth-loading__spinner" />
      </div>
    );
  }

  if (view === 'login') {
    return <LoginPage onSuccess={goToApp} expired={sessionExpired} />;
  }

  if (view === 'admin' && user && isAdmin()) {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }

  return <App user={user!} onLogout={handleLogout} />;
}
