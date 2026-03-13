// User metadata stored in localStorage (not the token — that's in httpOnly cookies)
const USER_KEY = 'ct_user';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  onboardingComplete?: boolean;
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser(): void {
  localStorage.removeItem(USER_KEY);
}

export function isAdmin(): boolean {
  const user = getUser();
  return user?.role === 'admin' || user?.role === 'owner';
}
