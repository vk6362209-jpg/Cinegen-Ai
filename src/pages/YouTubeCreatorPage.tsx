import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Video,
  Youtube,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch } from '../lib/api.ts';
import {
  SUPPORTED_LANGUAGES,
  YouTubeCreatorPackage,
} from '../types/cinegen.ts';

const YT_CATEGORIES = [
  'AI Storytelling',
  'Educational',
  'Documentary',
  'Motivational',
  'Facts & Science',
  'Mythology & History',
  'Mystery & Thriller',
];

export function YouTubeCreatorPage() {
  const { navigate, notify } = useApp();
  const [mode, setMode] = useState<'youtube-shorts' | 'youtube-long'>('youtube-shorts');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState(YT_CATEGORIES[0]);
  const [language, setLanguage] = useState('English (US / Global)');
  const [scriptSummary, setScriptSummary] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkg, setPkg] = useState<YouTubeCreatorPackage | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (topic.trim().length < 4) {
      setError('Enter your video topic (at least 4 characters).');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ package: YouTubeCreatorPackage }>('/api/youtube/package', {
        method: 'POST',
        body: JSON.stringify({
          topic: topic.trim(),
          mode,
          category,
          language,
          scriptSummary: scriptSummary.trim() || undefined,
        }),
      });
      setPkg(res.package);
      notify('success', 'YouTube Creator package & copyright safety check generated.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Generation failed.';
      setError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const copyText = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleGenerate}
        className="lg:col-span-5 rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-5"
      >
        <div>
          <h2 className="text-lg font-display font-bold text-white">YouTube Creator Mode</h2>
          <p className="text-xs text-slate-400 mt-1">
            Generate Shorts (9:16) or Long-Form (16:9) SEO titles, descriptions, hashtags, thumbnail
            prompts, and an originality & copyright risk audit.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode('youtube-shorts')}
            className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-colors ${
              mode === 'youtube-shorts'
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                : 'bg-[#0B0D12] border-white/[0.08] text-slate-300'
            }`}
          >
            YouTube Shorts (9:16)
          </button>
          <button
            type="button"
            onClick={() => setMode('youtube-long')}
            className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-colors ${
              mode === 'youtube-long'
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                : 'bg-[#0B0D12] border-white/[0.08] text-slate-300'
            }`}
          >
            Long-Form Video (16:9)
          </button>
        </div>

        <div>
          <label htmlFor="yt-topic" className="block text-xs font-medium text-slate-300 mb-1.5">
            Video Concept / Title Idea
          </label>
          <textarea
            id="yt-topic"
            rows={3}
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., Why deep-sea hydrothermal vents thrive without sunlight — 60-second visual explainer"
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="yt-cat" className="block text-xs font-medium text-slate-300 mb-1.5">
              Content Category
            </label>
            <select
              id="yt-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              {YT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="yt-lang" className="block text-xs font-medium text-slate-300 mb-1.5">
              Channel Language
            </label>
            <select
              id="yt-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.label}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="yt-script" className="block text-xs font-medium text-slate-300 mb-1.5">
            Optional Script Draft (for deeper copyright & originality audit)
          </label>
          <textarea
            id="yt-script"
            rows={3}
            value={scriptSummary}
            onChange={(e) => setScriptSummary(e.target.value)}
            placeholder="Paste draft narration or outline to check for originality and trademark safety..."
            className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white placeholder:text-slate-500"
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#090A0D] text-sm font-semibold flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
          <span>{loading ? 'Analyzing & Generating...' : 'Generate YouTube Creator Package'}</span>
        </button>
      </form>

      {/* Output Package */}
      <div className="lg:col-span-7 rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-5">
        {!pkg ? (
          <div className="py-20 text-center space-y-3 border border-dashed border-white/[0.12] rounded-xl">
            <Youtube className="w-9 h-9 text-slate-600 mx-auto" />
            <div className="text-sm font-medium text-slate-300">YouTube Creator Suite Ready</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Generate titles, SEO descriptions, hashtags, thumbnail prompts, and a transparent
              copyright safety audit for your next video.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Quick Production Handoffs */}
            <div className="flex flex-wrap gap-2.5 pb-4 border-b border-white/[0.08]">
              <button
                type="button"
                onClick={() =>
                  navigate('text-to-video', {
                    prompt: topic,
                    aspectRatio: mode === 'youtube-shorts' ? '9:16' : '16:9',
                    durationSec: mode === 'youtube-shorts' ? 30 : 120,
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
              >
                <Video className="w-3.5 h-3.5" />
                <span>Create {mode === 'youtube-shorts' ? '9:16 Short' : '16:9 Video'} Now</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  navigate('text-to-image', {
                    prompt: pkg.thumbnailPrompt,
                    aspectRatio: mode === 'youtube-shorts' ? '9:16' : '16:9',
                  })
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Generate Thumbnail</span>
              </button>
            </div>

            {/* Titles */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-amber-400">Title Suggestions</div>
              <div className="space-y-1.5">
                {pkg.titles.map((t, i) => (
                  <div
                    key={i}
                    className="px-3.5 py-2.5 rounded-lg bg-[#0B0D12] border border-white/[0.07] flex items-center justify-between gap-3 text-sm text-white"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => copyText(`title-${i}`, t)}
                      className="text-slate-400 hover:text-white shrink-0"
                    >
                      {copiedField === `title-${i}` ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Opening Hook */}
            {pkg.hookSuggestion && (
              <div className="p-4 rounded-lg bg-[#0B0D12] border border-white/[0.07] space-y-1">
                <div className="text-xs font-semibold text-slate-300">First 3-Second Hook</div>
                <p className="text-xs text-slate-200 leading-relaxed">{pkg.hookSuggestion}</p>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">SEO Description</span>
                <button
                  type="button"
                  onClick={() => copyText('desc', pkg.description)}
                  className="text-xs text-amber-400 hover:text-amber-300"
                >
                  {copiedField === 'desc' ? 'Copied' : 'Copy Description'}
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 p-4 rounded-lg bg-[#0B0D12] border border-white/[0.07] leading-relaxed">
                {pkg.description}
              </pre>
            </div>

            {/* Hashtags & Thumbnail Prompt */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-[#0B0D12] border border-white/[0.07] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">Hashtags</span>
                  <button
                    type="button"
                    onClick={() => copyText('tags', pkg.hashtags.join(' '))}
                    className="text-xs text-amber-400"
                  >
                    {copiedField === 'tags' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  {pkg.hashtags.join(' · ')}
                </div>
              </div>
              <div className="p-4 rounded-lg bg-[#0B0D12] border border-white/[0.07] space-y-2">
                <span className="text-xs font-semibold text-slate-300">Thumbnail Prompt</span>
                <p className="text-xs text-slate-300 leading-relaxed">{pkg.thumbnailPrompt}</p>
              </div>
            </div>

            {/* Content Originality & Copyright Risks */}
            <div className="space-y-3 pt-2 border-t border-white/[0.08]">
              {pkg.copyrightRisks.length > 0 && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/35 space-y-1.5 text-xs text-amber-200">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Copyright & Trademark Warnings</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    {pkg.copyrightRisks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-4 rounded-lg bg-emerald-500/8 border border-emerald-500/25 space-y-1.5 text-xs text-emerald-200">
                <div className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Content Originality Assistant</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-emerald-200/85">
                  {pkg.originalityScoreNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                {pkg.monetizationDisclaimer}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
