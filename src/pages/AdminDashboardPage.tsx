import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatBytes, formatDateTime } from '../lib/api.ts';
import type {
  ApiUsageLogRecord,
  PlanTier,
  ProviderHealthStatus,
  UserPublic,
} from '../types/cinegen.ts';

interface AdminOverviewData {
  metrics: {
    totalUsers: number;
    activeSubscriptions: number;
    totalGenerations: number;
    completedGenerations: number;
    failedGenerations: number;
    totalStorageBytes: number;
  };
  users: UserPublic[];
  apiLogs: ApiUsageLogRecord[];
  recentFailures: Array<{
    id: string;
    provider: string;
    prompt: string;
    error_message: string;
    created_at: string;
    user_email: string;
  }>;
  providers: ProviderHealthStatus[];
}

export function AdminDashboardPage() {
  const { user, updateUserState, notify } = useApp();
  const [bootstrapInfo, setBootstrapInfo] = useState<{
    hasAdmin: boolean;
    envPasscodeConfigured: boolean;
  } | null>(null);
  const [passcode, setPasscode] = useState('');
  const [claiming, setClaiming] = useState(false);

  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creditUserId, setCreditUserId] = useState('');
  const [creditDelta, setCreditDelta] = useState(250);
  const [creditReason, setCreditReason] = useState('Creator bonus allocation');

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    try {
      const boot = await apiFetch<{ hasAdmin: boolean; envPasscodeConfigured: boolean }>(
        '/api/admin/bootstrap-status'
      );
      setBootstrapInfo(boot);
      if (user?.role === 'admin') {
        const res = await apiFetch<AdminOverviewData>('/api/admin/overview');
        setOverview(res);
        if (!creditUserId && res.users[0]) {
          setCreditUserId(res.users[0].id);
        }
      }
    } catch (err) {
      if (user?.role === 'admin') {
        notify('error', err instanceof ApiError ? err.message : 'Failed to load admin overview.');
      }
    } finally {
      setLoading(false);
    }
  }, [creditUserId, notify, user?.role]);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaiming(true);
    try {
      const res = await apiFetch<{ user: UserPublic; message: string }>('/api/admin/claim', {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      });
      updateUserState(res.user);
      setPasscode('');
      notify('success', res.message);
      void loadAdmin();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Admin claim failed.');
    } finally {
      setClaiming(false);
    }
  };

  const handleUpdateUser = async (id: string, patch: { plan?: PlanTier; role?: 'user' | 'admin' }) => {
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      notify('success', 'User record updated.');
      void loadAdmin();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Update failed.');
    }
  };

  const handleAdjustCredits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditUserId) return;
    try {
      await apiFetch(`/api/admin/users/${creditUserId}/credits`, {
        method: 'POST',
        body: JSON.stringify({ delta: Number(creditDelta), reason: creditReason }),
      });
      notify('success', 'User credit balance updated and logged.');
      void loadAdmin();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Credit adjustment failed.');
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center gap-2 text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Verifying administrator privileges...</span>
      </div>
    );
  }

  if (user?.role !== 'admin') {
    const canClaim = !bootstrapInfo?.hasAdmin || bootstrapInfo?.envPasscodeConfigured;
    return (
      <div className="max-w-lg mx-auto my-8 rounded-2xl bg-[#11141C] border border-white/[0.1] p-7 space-y-5">
        <div className="flex items-center gap-2.5 text-amber-400">
          <Shield className="w-5 h-5" />
          <h2 className="text-lg font-display font-bold text-white">Administrator Access Required</h2>
        </div>

        {canClaim ? (
          <>
            <p className="text-xs text-slate-300 leading-relaxed">
              {bootstrapInfo?.envPasscodeConfigured
                ? 'Enter the server ADMIN_PASSCODE environment secret to activate administrator privileges on your current account.'
                : 'No administrator account has been claimed yet on this deployment. Complete first-run admin setup by entering a secure setup passcode (min 6 characters) to promote your account.'}
            </p>
            <form onSubmit={handleClaimAdmin} className="space-y-4">
              <div>
                <label htmlFor="adm-pass" className="block text-xs text-slate-300 mb-1.5">
                  {bootstrapInfo?.envPasscodeConfigured
                    ? 'Server Admin Passcode'
                    : 'First-Run Admin Setup Passcode'}
                </label>
                <input
                  id="adm-pass"
                  type="password"
                  required
                  minLength={6}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter passcode (min 6 chars)"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white"
                />
              </div>
              <button
                type="submit"
                disabled={claiming}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#090A0D] text-xs font-semibold"
              >
                {claiming ? 'Verifying...' : 'Activate Admin Dashboard'}
              </button>
            </form>
          </>
        ) : (
          <p className="text-xs text-slate-400 leading-relaxed">
            This console is restricted to authorized administrators. Contact your workspace
            administrator or configure <code className="text-slate-200">ADMIN_PASSCODE</code> in
            server secrets.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-display font-bold text-white">Administrator Console</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Live user directory, credit governance, API latency logs, and provider health.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAdmin()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#11141C] border border-white/[0.1] text-xs text-slate-200 hover:border-white/25"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* System Metrics */}
      {overview && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total Users', value: overview.metrics.totalUsers },
              { label: 'Paid Plans', value: overview.metrics.activeSubscriptions },
              { label: 'Total Jobs', value: overview.metrics.totalGenerations },
              { label: 'Completed', value: overview.metrics.completedGenerations },
              { label: 'Failed Jobs', value: overview.metrics.failedGenerations },
              { label: 'Total Storage', value: formatBytes(overview.metrics.totalStorageBytes) },
            ].map((m) => (
              <div key={m.label} className="p-4 rounded-xl bg-[#11141C] border border-white/[0.08]">
                <div className="text-xs text-slate-400">{m.label}</div>
                <div className="text-xl font-display font-bold font-mono tabular-nums text-white mt-1.5">
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Credit Adjustment + Provider Status */}
          <div className="grid lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleAdjustCredits}
              className="lg:col-span-5 rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-4"
            >
              <h3 className="text-sm font-display font-semibold text-white">
                Admin Credit Adjustment
              </h3>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target User</label>
                <select
                  value={creditUserId}
                  onChange={(e) => setCreditUserId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                >
                  {overview.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.email} ({u.credits} cr)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Credit Delta (+/-)</label>
                  <input
                    type="number"
                    value={creditDelta}
                    onChange={(e) => setCreditDelta(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Audit Reason</label>
                  <input
                    type="text"
                    required
                    value={creditReason}
                    onChange={(e) => setCreditReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
              >
                Apply Credit Adjustment
              </button>
            </form>

            <div className="lg:col-span-7 rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-3">
              <h3 className="text-sm font-display font-semibold text-white">
                Provider & Engine Health
              </h3>
              <div className="divide-y divide-white/[0.07] text-xs max-h-60 overflow-y-auto">
                {overview.providers.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{p.note}</div>
                    </div>
                    <span
                      className={`font-mono shrink-0 ${
                        p.configured ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {p.configured ? 'Ready' : 'Unconfigured'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* User Management Table */}
          <div className="rounded-xl bg-[#11141C] border border-white/[0.08] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.08]">
              <h3 className="text-sm font-display font-semibold text-white">User Management</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-[#0D1017] text-slate-400">
                    <th className="py-3 px-4 font-medium">User</th>
                    <th className="py-3 px-4 font-medium">Role</th>
                    <th className="py-3 px-4 font-medium">Plan</th>
                    <th className="py-3 px-4 font-medium text-right">Credits</th>
                    <th className="py-3 px-4 font-medium text-right">Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.07]">
                  {overview.users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-white">{u.name}</div>
                        <div className="text-[11px] text-slate-500">{u.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            void handleUpdateUser(u.id, { role: e.target.value as 'user' | 'admin' })
                          }
                          className="px-2 py-1 rounded bg-[#090B10] border border-white/[0.12] text-xs text-white"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={u.plan}
                          onChange={(e) =>
                            void handleUpdateUser(u.id, { plan: e.target.value as PlanTier })
                          }
                          className="px-2 py-1 rounded bg-[#090B10] border border-white/[0.12] text-xs text-white"
                        >
                          <option value="free">free</option>
                          <option value="basic">basic</option>
                          <option value="pro">pro</option>
                          <option value="premium">premium</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-400">
                        {u.credits.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                        {formatBytes(u.storageUsedBytes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* API Usage & Generation Failures */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-3">
              <h3 className="text-sm font-display font-semibold text-white">Recent API Telemetry</h3>
              <div className="divide-y divide-white/[0.07] text-xs max-h-72 overflow-y-auto">
                {overview.apiLogs.length === 0 ? (
                  <p className="text-slate-500 py-6 text-center">No API calls logged yet.</p>
                ) : (
                  overview.apiLogs.map((l) => (
                    <div key={l.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-white font-medium truncate">
                          {l.provider} · {l.operation}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {l.model} · {formatDateTime(l.createdAt)}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div
                          className={
                            l.status === 'success'
                              ? 'text-emerald-400'
                              : l.status === 'error'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                          }
                        >
                          {l.status}
                        </div>
                        <div className="text-[11px] text-slate-500">{l.latencyMs}ms</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-3">
              <h3 className="text-sm font-display font-semibold text-white">
                Recent Generation Failures
              </h3>
              <div className="divide-y divide-white/[0.07] text-xs max-h-72 overflow-y-auto">
                {overview.recentFailures.length === 0 ? (
                  <p className="text-slate-500 py-6 text-center">No failed generation jobs.</p>
                ) : (
                  overview.recentFailures.map((f) => (
                    <div key={f.id} className="py-2.5 space-y-1">
                      <div className="flex justify-between text-slate-300">
                        <span className="font-medium text-white">{f.user_email}</span>
                        <span className="text-slate-500">{f.provider}</span>
                      </div>
                      <p className="text-rose-300 text-[11px] leading-relaxed">{f.error_message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
