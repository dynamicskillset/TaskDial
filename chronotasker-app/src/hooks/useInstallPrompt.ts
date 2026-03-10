import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const FIRST_VISIT_KEY = 'td_first_visit';
const DISMISSED_KEY = 'td_install_dismissed';
const INSTALLED_KEY = 'td_app_installed';
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

type InstallEvent = 'impression' | 'install' | 'dismiss';

interface UseInstallPromptOptions {
  onEvent?: (event: InstallEvent) => void;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) &&
    !('BeforeInstallPromptEvent' in window) &&
    !isStandalone()
  );
}

function isSecondVisit(): boolean {
  const firstVisit = localStorage.getItem(FIRST_VISIT_KEY);
  if (!firstVisit) {
    localStorage.setItem(FIRST_VISIT_KEY, Date.now().toString());
    return false;
  }
  return true;
}

function isDismissedWithinTTL(): boolean {
  const dismissed = localStorage.getItem(DISMISSED_KEY);
  if (!dismissed) return false;
  const elapsed = Date.now() - parseInt(dismissed, 10);
  if (elapsed > DISMISS_TTL_MS) {
    localStorage.removeItem(DISMISSED_KEY);
    return false;
  }
  return true;
}

function isAlreadyInstalled(): boolean {
  return localStorage.getItem(INSTALLED_KEY) === '1';
}

export function useInstallPrompt(enabled: boolean, options?: UseInstallPromptOptions) {
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const impressionFired = useRef(false);

  useEffect(() => {
    if (!enabled || isStandalone() || isAlreadyInstalled() || !isSecondVisit() || isDismissedWithinTTL()) return;

    if (isIOSSafari()) {
      setIsIOS(true);
      setShowBanner(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setShowBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [enabled]);

  // Listen for appinstalled
  useEffect(() => {
    const handler = () => {
      localStorage.setItem(INSTALLED_KEY, '1');
      setShowBanner(false);
    };

    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  // Fire impression event when banner first shows
  useEffect(() => {
    if (showBanner && !impressionFired.current) {
      impressionFired.current = true;
      options?.onEvent?.('impression');
    }
  }, [showBanner, options]);

  const install = useCallback(async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    options?.onEvent?.('install');
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    deferredPrompt.current = null;
  }, [options]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    setShowBanner(false);
    options?.onEvent?.('dismiss');
  }, [options]);

  return { showBanner, isIOS, install, dismiss };
}
