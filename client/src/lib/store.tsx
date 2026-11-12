import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getUserId, setUnauthorizedHandler, setUserId, type Health, type User } from './api';

interface Toast { id: number; text: string; tone: 'ok' | 'error' }

interface AppState {
  health: Health | null;
  healthError: string | null;
  user: User | null;
  ready: boolean;
  setUser: (u: User | null) => void;
  refreshUser: () => Promise<void>;
  toast: (text: string, tone?: Toast['tone']) => void;
  logout: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-1), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserId(u?.id ?? null);
    setUserState(u);
  }, []);
  const logout = useCallback(() => setUser(null), [setUser]);

  const refreshUser = useCallback(async () => {
    if (!getUserId()) return;
    const r = await api<{ user: User }>('/me');
    setUserState(r.user);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      try {
        setHealth(await api<Health>('/health'));
      } catch (e) {
        setHealthError((e as Error).message);
      }
      try {
        if (getUserId()) setUserState((await api<{ user: User }>('/me')).user);
      } catch {
        setUserId(null);
      }
      setReady(true);
    })();
  }, [setUser]);

  return (
    <Ctx.Provider value={{ health, healthError, user, ready, setUser, refreshUser, toast, logout }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-8" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`dandi-in pointer-events-auto max-w-md rounded-2xl px-5 py-3 text-lg font-bold text-white shadow-soft ${t.tone === 'ok' ? 'bg-leaf-700' : 'bg-red-700'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider 가 필요해요');
  return v;
}
