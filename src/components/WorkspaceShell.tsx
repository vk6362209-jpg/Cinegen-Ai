import React, { useState } from 'react';
import {
  Clapperboard,
  Coins,
  CreditCard,
  FileText,
  Film,
  FolderKanban,
  HelpCircle,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Scissors,
  Shield,
  Sparkles,
  User,
  Video,
  X,
  Youtube,
} from 'lucide-react';
import { PageId, useApp } from '../context/AppContext.tsx';

interface NavGroup {
  label: string;
  items: Array<{ id: PageId; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'projects', label: 'My Projects', icon: FolderKanban },
      { id: 'history', label: 'Video History', icon: History },
    ],
  },
  {
    label: 'Creation Suite',
    items: [
      { id: 'text-to-video', label: 'AI Video Generator', icon: Video },
      { id: 'image-to-video', label: 'Image to Video', icon: Clapperboard },
      { id: 'text-to-image', label: 'Text to Image', icon: ImageIcon },
      { id: 'script-writer', label: 'AI Script Writer', icon: FileText },
      { id: 'voice-studio', label: 'AI Voice Studio', icon: Mic },
      { id: 'video-editor', label: 'Video Editing Studio', icon: Scissors },
      { id: 'youtube-creator', label: 'YouTube Creator Mode', icon: Youtube },
    ],
  },
  {
    label: 'Account & Governance',
    items: [
      { id: 'plans', label: 'Subscription Plans', icon: CreditCard },
      { id: 'credits', label: 'Credit Management', icon: Coins },
      { id: 'profile', label: 'User Profile', icon: User },
      { id: 'support', label: 'Help & Support', icon: HelpCircle },
      { id: 'admin', label: 'Admin Dashboard', icon: Shield },
    ],
  },
];

const PAGE_TITLES: Record<PageId, { section: string; title: string }> = {
  landing: { section: 'CINEGEN AI', title: 'Home' },
  login: { section: 'Account', title: 'Sign In' },
  signup: { section: 'Account', title: 'Create Account' },
  dashboard: { section: 'Workspace', title: 'Overview' },
  'text-to-video': { section: 'Creation Suite', title: 'AI Video Generator' },
  'image-to-video': { section: 'Creation Suite', title: 'Image to Video' },
  'text-to-image': { section: 'Creation Suite', title: 'Text to Image' },
  'script-writer': { section: 'Creation Suite', title: 'AI Script Writer' },
  'voice-studio': { section: 'Creation Suite', title: 'AI Voice Studio' },
  'video-editor': { section: 'Creation Suite', title: 'Video Editing Studio' },
  'youtube-creator': { section: 'Creation Suite', title: 'YouTube Creator Mode' },
  projects: { section: 'Workspace', title: 'My Projects' },
  history: { section: 'Workspace', title: 'Video History' },
  plans: { section: 'Billing', title: 'Subscription Plans' },
  credits: { section: 'Billing', title: 'Credit Management' },
  profile: { section: 'Account', title: 'User Profile' },
  support: { section: 'Resources', title: 'Help & Support' },
  admin: { section: 'Governance', title: 'Admin Dashboard' },
};

export function ToastViewport() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-[calc(100vw-2.5rem)]"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start justify-between gap-3 px-4 py-3 rounded-lg border backdrop-blur-md text-sm shadow-xl ${
            t.tone === 'error'
              ? 'bg-[#1D1215]/95 border-rose-500/40 text-rose-100'
              : t.tone === 'success'
                ? 'bg-[#101B16]/95 border-emerald-500/40 text-emerald-100'
                : 'bg-[#161922]/95 border-amber-500/35 text-slate-100'
          }`}
        >
          <div className="leading-relaxed">
            <span className="font-semibold mr-2">
              {t.tone === 'error' ? 'Error:' : t.tone === 'success' ? 'Done:' : 'Notice:'}
            </span>
            <span>{t.message}</span>
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-white shrink-0 p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { page, navigate, user, logout } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = PAGE_TITLES[page] || { section: 'Studio', title: 'Workspace' };

  const handleNav = (id: PageId) => {
    setMobileOpen(false);
    navigate(id);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0D0F14] border-r border-white/[0.07]">
      <div className="h-14 px-5 flex items-center justify-between border-b border-white/[0.07] shrink-0">
        <button
          type="button"
          onClick={() => handleNav('landing')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0"
        >
          <Film className="w-5 h-5 text-amber-500 shrink-0" />
          <span className="font-display font-bold text-base tracking-tight text-white">
            CINEGEN AI
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-slate-400 hover:text-white p-1"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-2 text-xs font-medium text-slate-500">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = page === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-amber-500/12 text-amber-400 border border-amber-500/25'
                        : 'text-slate-300 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {user && (
        <div className="p-4 border-t border-white/[0.07] bg-[#0B0D12] space-y-3 shrink-0">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Credits Balance</span>
            <span className="font-mono tabular-nums font-semibold text-amber-400">
              {user.credits.toLocaleString()} cr
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => handleNav('profile')}
              className="min-w-0 text-left hover:opacity-90"
            >
              <div className="text-sm font-medium text-white truncate">{user.name}</div>
              <div className="text-xs text-slate-400 truncate">
                {user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Plan · {user.role === 'admin' ? 'Admin' : 'Creator'}
              </div>
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign Out"
              aria-label="Sign Out"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#090A0D] text-[#F1F3F7] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 max-w-[82vw] h-full">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Close overlay"
            className="flex-1 bg-black/70 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 sticky top-0 z-30 bg-[#090A0D]/85 backdrop-blur-md border-b border-white/[0.07] px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:bg-white/[0.06]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">{meta.section}</span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-white truncate">{meta.title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate('credits')}
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#13161E] border border-white/[0.08] text-xs font-mono tabular-nums text-slate-200 hover:border-amber-500/40 transition-colors whitespace-nowrap shrink-0"
                >
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>{user.credits.toLocaleString()} credits</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('text-to-video')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>New Video</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => navigate('login')}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
