import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Film, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch } from '../lib/api.ts';
import type { UserPublic } from '../types/cinegen.ts';

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { navigate, setSession, notify } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'signup') {
      if (name.trim().length < 2) {
        setError('Please enter your full name (at least 2 characters).');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    } else if (!email.includes('@') || !password) {
      setError('Enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const payload =
        mode === 'signup'
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password };
      const res = await apiFetch<{ user: UserPublic; token: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      notify(
        'success',
        mode === 'signup'
          ? `Welcome to CINEGEN AI, ${res.user.name}. 100 starter credits added.`
          : `Welcome back, ${res.user.name}.`
      );
      setSession(res.user, res.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090A0D] text-[#F1F3F7] flex flex-col justify-between p-6">
      <div className="max-w-[1200px] w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('landing')}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
        <div className="flex items-center gap-2 font-display font-bold text-white">
          <Film className="w-5 h-5 text-amber-500" />
          <span>CINEGEN AI</span>
        </div>
      </div>

      <div className="w-full max-w-md mx-auto my-12 p-8 rounded-2xl bg-[#11141C] border border-white/[0.08]">
        <div className="space-y-2 mb-7">
          <h1 className="text-2xl font-display font-bold text-white">
            {mode === 'signup' ? 'Create your studio account' : 'Sign in to CINEGEN AI'}
          </h1>
          <p className="text-sm text-slate-400">
            {mode === 'signup'
              ? 'Start with 100 free credits to generate multi-scene scripts, voices, and videos.'
              : 'Access your projects, generation queue, and editing timeline.'}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/35 text-sm text-rose-200"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                Full Name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 focus:border-amber-500"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="creator@studio.com"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 focus:border-amber-500"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Minimum 8 characters' : 'Enter your password'}
                className="w-full px-3.5 py-2.5 pr-10 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 focus:border-amber-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-confirm" className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirm Password
              </label>
              <input
                id="auth-confirm"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 focus:border-amber-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#090A0D] text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{mode === 'signup' ? 'Create Free Account' : 'Sign In'}</span>
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/[0.08] text-center text-sm text-slate-400">
          {mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => navigate('login')}
                className="text-amber-400 hover:text-amber-300 font-medium"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New to CINEGEN AI?{' '}
              <button
                type="button"
                onClick={() => navigate('signup')}
                className="text-amber-400 hover:text-amber-300 font-medium"
              >
                Create an account
              </button>
            </>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-slate-500">
        Passwords are salted and hashed with scrypt on the server. Session tokens stay in memory.
      </div>
    </div>
  );
}
