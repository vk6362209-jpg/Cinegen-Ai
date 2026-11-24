import React, { useCallback, useEffect, useState } from 'react';
import { Check, Info, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatDateTime } from '../lib/api.ts';
import {
  CreditTransactionRecord,
  DURATION_OPTIONS,
  estimateVideoCreditCost,
  PLAN_DEFINITIONS,
  PlanTier,
  UserPublic,
  VideoProviderId,
  VideoQuality,
} from '../types/cinegen.ts';

export function PlansPage() {
  const { user, navigate, notify, updateUserState } = useApp();
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [switchingPlan, setSwitchingPlan] = useState<PlanTier | null>(null);

  useEffect(() => {
    if (!user) return;
    void apiFetch<{ stripeConfigured: boolean }>('/api/billing/transactions')
      .then((res) => setStripeConfigured(res.stripeConfigured))
      .catch(() => {});
  }, [user]);

  const handleSelectPlan = async (planId: PlanTier, sandboxTestMode = false) => {
    if (!user) {
      navigate('signup');
      return;
    }
    setSwitchingPlan(planId);
    try {
      const res = await apiFetch<{ user: UserPublic; message: string }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ planId, sandboxTestMode }),
      });
      updateUserState(res.user);
      notify('success', res.message);
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Plan change failed.');
    } finally {
      setSwitchingPlan(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-display font-bold text-white">Subscription Plans</h2>
        <p className="text-sm text-slate-400 max-w-2xl">
          Choose a production tier tailored to your video runtime, resolution, and vault storage.
          Failed generations are automatically refunded to your credit balance.
        </p>
      </div>

      {/* Honest Payment Architecture Banner */}
      <div className="p-4 rounded-xl bg-[#11141C] border border-amber-500/30 flex items-start gap-3 text-xs text-slate-300 leading-relaxed">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white">Payment Integration Architecture: </strong>
          {stripeConfigured
            ? 'Stripe server credentials are configured for live checkout.'
            : 'STRIPE_SECRET_KEY is not configured in this environment. CINEGEN AI never simulates fake credit card charges. To test plan credit allocations locally, you may use the explicitly labeled Sandbox Plan Switch buttons below.'}
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
        {PLAN_DEFINITIONS.map((plan) => {
          const isCurrent = user?.plan === plan.id;
          return (
            <div
              key={plan.id}
              className={`p-6 rounded-xl border flex flex-col justify-between gap-6 ${
                isCurrent
                  ? 'bg-[#161A25] border-amber-500/60'
                  : 'bg-[#11141C] border-white/[0.08]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-base font-display font-bold text-white">{plan.name}</span>
                  {isCurrent && <span className="text-xs font-medium text-amber-400">Active</span>}
                </div>
                <p className="text-xs text-slate-400">{plan.audience}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-display font-bold font-mono tabular-nums text-white">
                    ${plan.monthlyPriceUsd}
                  </span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
                <div className="text-xs font-mono tabular-nums text-amber-400">
                  {plan.monthlyCredits.toLocaleString()} credits · {plan.storageLabel} ·{' '}
                  {plan.maxQuality.toUpperCase()}
                </div>
                <ul className="space-y-2 pt-3 border-t border-white/[0.07] text-xs text-slate-300">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                {isCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 px-4 rounded-lg bg-white/[0.06] text-slate-400 text-xs font-semibold cursor-default"
                  >
                    Current Plan
                  </button>
                ) : plan.id === 'free' || stripeConfigured ? (
                  <button
                    type="button"
                    disabled={switchingPlan === plan.id}
                    onClick={() => void handleSelectPlan(plan.id, false)}
                    className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
                  >
                    {switchingPlan === plan.id ? 'Updating...' : `Switch to ${plan.name}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={switchingPlan === plan.id}
                    onClick={() => void handleSelectPlan(plan.id, true)}
                    className="w-full py-2.5 px-4 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold"
                  >
                    {switchingPlan === plan.id
                      ? 'Switching...'
                      : `Sandbox Switch to ${plan.name} (No Charge)`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CreditsPage() {
  const { user, navigate, notify } = useApp();
  const [transactions, setTransactions] = useState<CreditTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Interactive Cost Estimator state
  const [calcDuration, setCalcDuration] = useState(60);
  const [calcQuality, setCalcQuality] = useState<VideoQuality>('1080p');
  const [calcProvider, setCalcProvider] = useState<VideoProviderId>('google-veo');
  const [calcVoice, setCalcVoice] = useState(true);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ transactions: CreditTransactionRecord[] }>(
        '/api/billing/transactions'
      );
      setTransactions(res.transactions);
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Could not load credit ledger.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const estimated = estimateVideoCreditCost({
    durationSec: calcDuration,
    quality: calcQuality,
    provider: calcProvider,
    includeVoiceover: calcVoice,
    includeMusic: true,
  });

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4">
          <div className="text-xs text-slate-400">Available Credit Balance</div>
          <div className="text-4xl font-display font-bold font-mono tabular-nums text-amber-400">
            {(user?.credits ?? 0).toLocaleString()}{' '}
            <span className="text-base font-normal text-slate-400">credits</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Active plan: <strong className="text-white capitalize">{user?.plan}</strong>. Credits
            are deducted atomically when jobs start and refunded automatically if an upstream API
            fails.
          </p>
          <button
            type="button"
            onClick={() => navigate('plans')}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
          >
            Manage Subscription Plan
          </button>
        </div>

        <div className="lg:col-span-7 rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-display font-semibold text-white">
              Generation Cost Estimator
            </h3>
            <span className="text-lg font-mono tabular-nums font-bold text-amber-400">
              {estimated} credits
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Provider</label>
              <select
                value={calcProvider}
                onChange={(e) => setCalcProvider(e.target.value as VideoProviderId)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              >
                <option value="google-veo">Google Veo / Omni</option>
                <option value="runway">Runway Gen-4</option>
                <option value="demo-mode">DEMO MODE Preview</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Duration</label>
              <select
                value={calcDuration}
                onChange={(e) => setCalcDuration(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.seconds} value={d.seconds}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Quality</label>
              <select
                value={calcQuality}
                onChange={(e) => setCalcQuality(e.target.value as VideoQuality)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              >
                <option value="720p">720p HD</option>
                <option value="1080p">1080p Full HD</option>
                <option value="4k">4K (Veo only)</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={calcVoice}
              onChange={(e) => setCalcVoice(e.target.checked)}
              className="accent-amber-500"
            />
            <span>Include synchronized AI Voiceover & CC0 Ambient Bed</span>
          </label>
        </div>
      </div>

      {/* Transaction History Ledger */}
      <div className="rounded-xl bg-[#11141C] border border-white/[0.08] overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.08]">
          <h3 className="text-sm font-display font-semibold text-white">Credit Transaction Ledger</h3>
        </div>
        {loading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading transactions...</span>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">No transactions recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#0D1017] text-slate-400">
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Description</th>
                  <th className="py-3 px-4 font-medium text-right">Change</th>
                  <th className="py-3 px-4 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td className="py-3 px-4 capitalize text-slate-300">{tx.type.replace('_', ' ')}</td>
                    <td className="py-3 px-4 text-slate-200">{tx.description}</td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                        tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-white">
                      {tx.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
