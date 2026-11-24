import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setAuthToken } from '../lib/api.ts';
import type {
  GeneratedScript,
  ProviderHealthStatus,
  UserPublic,
} from '../types/cinegen.ts';

export type PageId =
  | 'landing'
  | 'signup'
  | 'login'
  | 'dashboard'
  | 'text-to-video'
  | 'image-to-video'
  | 'text-to-image'
  | 'script-writer'
  | 'voice-studio'
  | 'video-editor'
  | 'youtube-creator'
  | 'projects'
  | 'history'
  | 'plans'
  | 'credits'
  | 'profile'
  | 'support'
  | 'admin';

export interface ToastItem {
  id: string;
  tone: 'success' | 'error' | 'info';
  message: string;
}

export interface StudioHandoff {
  prompt?: string;
  script?: GeneratedScript | null;
  projectId?: string | null;
  referenceImageUrl?: string | null;
  referenceImageFilename?: string | null;
  referenceImageMimeType?: string | null;
  aspectRatio?: '16:9' | '9:16';
  durationSec?: number;
  style?: string;
}

interface AppContextValue {
  page: PageId;
  navigate: (next: PageId, handoff?: StudioHandoff) => void;
  user: UserPublic | null;
  setSession: (user: UserPublic, token: string) => void;
  updateUserState: (user: UserPublic) => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  providers: ProviderHealthStatus[];
  refreshProviders: () => Promise<void>;
  handoff: StudioHandoff | null;
  clearHandoff: () => void;
  toasts: ToastItem[];
  notify: (tone: ToastItem['tone'], message: string) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const PUBLIC_PAGES: Set<PageId> = new Set(['landing', 'login', 'signup', 'plans', 'support']);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<PageId>('landing');
  const [user, setUser] = useState<UserPublic | null>(null);
  const [providers, setProviders] = useState<ProviderHealthStatus[]>([]);
  const [handoff, setHandoff] = useState<StudioHandoff | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pendingPage, setPendingPage] = useState<PageId | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((tone: ToastItem['tone'], message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  const refreshProviders = useCallback(async () => {
    try {
      const data = await apiFetch<{ providers: ProviderHealthStatus[] }>('/api/providers/status');
      setProviders(data.providers);
    } catch {
      // ignore initial network hiccup
    }
  }, []);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const navigate = useCallback(
    (next: PageId, nextHandoff?: StudioHandoff) => {
      if (nextHandoff) {
        setHandoff(nextHandoff);
      }
      if (!user && !PUBLIC_PAGES.has(next)) {
        setPendingPage(next);
        setPage('login');
        notify('info', 'Sign in or create a free account to open CINEGEN AI Studio.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setPage(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [user, notify]
  );

  const setSession = useCallback(
    (nextUser: UserPublic, token: string) => {
      setAuthToken(token);
      setUser(nextUser);
      const target = pendingPage || 'dashboard';
      setPendingPage(null);
      setPage(target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [pendingPage]
  );

  const updateUserState = useCallback((nextUser: UserPublic) => {
    setUser(nextUser);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: UserPublic }>('/api/auth/me');
      setUser(res.user);
    } catch {
      // keep existing state if transient error
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore logout error
    }
    setAuthToken(null);
    setUser(null);
    setHandoff(null);
    setPage('landing');
    notify('info', 'Signed out cleanly.');
  }, [notify]);

  const clearHandoff = useCallback(() => setHandoff(null), []);

  return (
    <AppContext.Provider
      value={{
        page,
        navigate,
        user,
        setSession,
        updateUserState,
        refreshUser,
        logout,
        providers,
        refreshProviders,
        handoff,
        clearHandoff,
        toasts,
        notify,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
