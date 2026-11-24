import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, Loader2, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatBytes, formatDateTime } from '../lib/api.ts';
import { MONETIZATION_DISCLAIMER, UserPublic } from '../types/cinegen.ts';

export function ProfilePage() {
  const { user, updateUserState, notify, logout } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = { name: name.trim() };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const res = await apiFetch<{ user: UserPublic }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      updateUserState(res.user);
      setCurrentPassword('');
      setNewPassword('');
      notify('success', 'Profile updated.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Profile update failed.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const storagePct = Math.min(
    100,
    Math.round((user.storageUsedBytes / Math.max(1, user.storageQuotaBytes)) * 100)
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-5">
        <div>
          <h2 className="text-lg font-display font-bold text-white">Creator Profile & Security</h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage your display name, account password, and vault quota.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pf-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                id="pf-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.06] text-sm text-slate-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.08] grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pf-curpw" className="block text-xs font-medium text-slate-300 mb-1.5">
                Current Password (optional)
              </label>
              <input
                id="pf-curpw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required to change password"
                className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label htmlFor="pf-newpw" className="block text-xs font-medium text-slate-300 mb-1.5">
                New Password
              </label>
              <input
                id="pf-newpw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2 rounded-lg border border-rose-500/35 text-rose-300 hover:bg-rose-500/10 text-xs font-medium"
            >
              Sign Out
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#090A0D] text-xs font-semibold inline-flex items-center gap-2"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">Media Vault Storage</span>
          <span className="font-mono tabular-nums text-slate-300">
            {formatBytes(user.storageUsedBytes)} / {formatBytes(user.storageQuotaBytes)} ({storagePct}%)
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
          <div className="h-full bg-amber-500" style={{ width: `${storagePct}%` }} />
        </div>
        <div className="text-xs text-slate-400">
          Account Role: <span className="text-white capitalize">{user.role}</span> · Active Plan:{' '}
          <span className="text-white capitalize">{user.plan}</span> · Joined:{' '}
          {formatDateTime(user.createdAt)}
        </div>
      </div>
    </div>
  );
}

interface SupportTicketRow {
  id: string;
  subject: string;
  category: string;
  message: string;
  status: string;
  created_at: string;
}

export function SupportPage() {
  const { user, providers, notify } = useApp();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('Video Generation');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch<{ tickets: SupportTicketRow[] }>('/api/support/tickets');
      setTickets(res.tickets);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      notify('info', 'Please sign in to submit a support ticket.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, category, message }),
      });
      setSubject('');
      setMessage('');
      notify('success', 'Support ticket submitted.');
      void loadTickets();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Could not submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Copyright, Licensing & YouTube Monetization Guide</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{MONETIZATION_DISCLAIMER}</p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-400">
              <div className="p-3.5 rounded-lg bg-[#0B0D12] border border-white/[0.07] space-y-1">
                <div className="font-semibold text-white">Original Scripts & Visuals</div>
                <p>
                  Avoid copyrighted movies, game characters, music lyrics, or real-person celebrity
                  impersonations in your prompts.
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-[#0B0D12] border border-white/[0.07] space-y-1">
                <div className="font-semibold text-white">Synthetic Media Disclosure</div>
                <p>
                  When uploading realistic AI-generated visuals to YouTube, review YouTube’s
                  altered or synthetic content disclosure toggle in YouTube Studio.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4">
            <div className="flex items-center gap-2 text-white text-sm font-display font-semibold">
              <HelpCircle className="w-4 h-4 text-amber-400" />
              <span>Server Provider & API Configuration Status</span>
            </div>
            <div className="divide-y divide-white/[0.07] text-xs">
              {providers.map((p) => (
                <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-white">{p.name}</div>
                    <div className="text-slate-400 mt-0.5">{p.note}</div>
                  </div>
                  <div className="shrink-0 font-mono text-[11px]">
                    <span className={p.configured ? 'text-emerald-400' : 'text-amber-400'}>
                      {p.configured ? 'Configured' : `Needs ${p.envVar}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleSubmit}
            className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4"
          >
            <h3 className="text-base font-display font-semibold text-white">Submit Support Request</h3>
            <div>
              <label htmlFor="sup-cat" className="block text-xs text-slate-300 mb-1">
                Category
              </label>
              <select
                id="sup-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              >
                <option>Video Generation</option>
                <option>AI Voice & Subtitles</option>
                <option>Credits & Subscriptions</option>
                <option>Copyright & Compliance</option>
                <option>Bug Report</option>
              </select>
            </div>
            <div>
              <label htmlFor="sup-sub" className="block text-xs text-slate-300 mb-1">
                Subject
              </label>
              <input
                id="sup-sub"
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief summary of your question"
                className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="sup-msg" className="block text-xs text-slate-300 mb-1">
                Details
              </label>
              <textarea
                id="sup-msg"
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Include job ID or steps to reproduce..."
                className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#090A0D] text-xs font-semibold flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Send Support Ticket</span>
            </button>
          </form>

          {user && tickets.length > 0 && (
            <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-3">
              <h4 className="text-xs font-semibold text-white">Your Recent Tickets</h4>
              <div className="divide-y divide-white/[0.07]">
                {tickets.map((t) => (
                  <div key={t.id} className="py-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white">{t.subject}</span>
                      <span className="inline-flex items-center gap-1 text-emerald-400 capitalize">
                        <CheckCircle2 className="w-3 h-3" />
                        {t.status}
                      </span>
                    </div>
                    <div className="text-slate-500">
                      {t.category} · {formatDateTime(t.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
