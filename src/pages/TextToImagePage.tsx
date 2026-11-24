import React, { useCallback, useEffect, useState } from 'react';
import { Clapperboard, Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch } from '../lib/api.ts';
import { MediaAssetRecord, VISUAL_STYLES } from '../types/cinegen.ts';

export function TextToImagePage() {
  const { navigate, notify, refreshUser } = useApp();
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3' | '3:4'>('16:9');
  const [style, setStyle] = useState('Cinematic');
  const [highQuality, setHighQuality] = useState(false);
  const [useDemoMode, setUseDemoMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<{
    url: string;
    filename: string;
    mimeType: string;
    isDemo: boolean;
    provider: string;
  } | null>(null);
  const [gallery, setGallery] = useState<MediaAssetRecord[]>([]);

  const loadGallery = useCallback(async () => {
    try {
      const res = await apiFetch<{ assets: MediaAssetRecord[] }>('/api/assets?kind=image');
      setGallery(res.assets);
    } catch {
      // ignore initial error
    }
  }, []);

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  const handleGenerate = async (e: React.FormEvent, forceDemo?: boolean) => {
    e.preventDefault();
    setError(null);
    if (prompt.trim().length < 4) {
      setError('Enter a descriptive image prompt (at least 4 characters).');
      return;
    }
    const demoFlag = forceDemo ?? useDemoMode;
    setGenerating(true);
    try {
      const res = await apiFetch<{
        url: string;
        filename: string;
        mimeType: string;
        isDemo: boolean;
        provider: string;
      }>('/api/image/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspectRatio,
          style,
          highQuality,
          useDemoMode: demoFlag,
        }),
      });
      setLatest(res);
      notify(
        'success',
        res.isDemo ? 'Demo Mode concept frame generated.' : `Image generated via ${res.provider}.`
      );
      void loadGallery();
      void refreshUser();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Image generation failed.';
      setError(msg);
      notify('error', msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={(e) => void handleGenerate(e)}
        className="lg:col-span-5 rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-5"
      >
        <div>
          <h2 className="text-lg font-display font-bold text-white">Text-to-Image & Thumbnail Lab</h2>
          <p className="text-xs text-slate-400 mt-1">
            Generate reference keyframes and YouTube thumbnails via Gemini Image / Nano Banana 2.1,
            then animate them directly in Image-to-Video.
          </p>
        </div>

        <div>
          <label htmlFor="img-prompt" className="block text-xs font-medium text-slate-300 mb-1.5">
            Visual Prompt
          </label>
          <textarea
            id="img-prompt"
            rows={4}
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe subject, framing, lighting, texture, and atmosphere..."
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="img-ratio" className="block text-xs font-medium text-slate-300 mb-1.5">
              Aspect Ratio
            </label>
            <select
              id="img-ratio"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              <option value="16:9">16:9 Widescreen / Thumbnail</option>
              <option value="9:16">9:16 Shorts / Vertical</option>
              <option value="1:1">1:1 Square</option>
              <option value="4:3">4:3 Editorial</option>
              <option value="3:4">3:4 Poster</option>
            </select>
          </div>
          <div>
            <label htmlFor="img-style" className="block text-xs font-medium text-slate-300 mb-1.5">
              Visual Style
            </label>
            <select
              id="img-style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              {VISUAL_STYLES.filter((s) => s !== 'Custom').map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-white/[0.08]">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={highQuality}
              onChange={(e) => setHighQuality(e.target.checked)}
              disabled={useDemoMode}
              className="accent-amber-500"
            />
            <span>High-Resolution Mode (gemini-nano-banana-2.1 · 5 credits)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={useDemoMode}
              onChange={(e) => setUseDemoMode(e.target.checked)}
              className="accent-amber-500"
            />
            <span>Use DEMO MODE Concept Frame (1 credit · no paid key required)</span>
          </label>
        </div>

        {error && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200 space-y-2">
            <div>{error}</div>
            {!useDemoMode && (
              <button
                type="button"
                onClick={(e) => void handleGenerate(e, true)}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-[#090A0D] font-semibold"
              >
                Render DEMO MODE Concept Frame Instead
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={generating}
          className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#090A0D] text-sm font-semibold flex items-center justify-center gap-2"
        >
          {generating && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{generating ? 'Generating Frame...' : 'Generate Image'}</span>
        </button>
      </form>

      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-display font-semibold text-white">Generated Output</h3>
            {latest && (
              <span className="text-xs font-mono text-slate-400">
                {latest.isDemo ? 'DEMO MODE Concept Frame' : latest.provider}
              </span>
            )}
          </div>

          {latest ? (
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden bg-black border border-white/[0.1]">
                <img
                  src={latest.url}
                  alt="Generated studio artwork"
                  className="w-full max-h-[440px] object-contain mx-auto"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={`${latest.url}?download=1`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Image</span>
                </a>
                <button
                  type="button"
                  onClick={() =>
                    navigate('image-to-video', {
                      prompt,
                      referenceImageUrl: latest.url,
                      referenceImageFilename: latest.filename,
                      referenceImageMimeType: latest.mimeType,
                      aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
                >
                  <Clapperboard className="w-3.5 h-3.5" />
                  <span>Animate in Image-to-Video</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="aspect-[16/9] rounded-xl bg-[#090B10] border border-dashed border-white/[0.12] flex flex-col items-center justify-center text-slate-500 gap-2">
              <ImageIcon className="w-9 h-9 text-slate-600" />
              <span className="text-xs">Your generated image frame will display here.</span>
            </div>
          )}
        </div>

        {/* Saved Gallery */}
        <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4">
          <h3 className="text-sm font-display font-semibold text-white">Recent Generated Frames</h3>
          {gallery.length === 0 ? (
            <p className="text-xs text-slate-500">No saved images yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gallery.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg overflow-hidden bg-[#0B0D12] border border-white/[0.08] flex flex-col"
                >
                  <img
                    src={item.url}
                    alt={item.prompt || 'Generated frame'}
                    className="w-full aspect-video object-cover bg-black"
                  />
                  <div className="p-2.5 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-300 truncate">{item.prompt || item.filename}</span>
                    <button
                      type="button"
                      onClick={() =>
                        navigate('image-to-video', {
                          prompt: item.prompt,
                          referenceImageUrl: item.url,
                          referenceImageFilename: item.filename,
                          referenceImageMimeType: item.mimeType,
                        })
                      }
                      className="text-amber-400 hover:text-amber-300 shrink-0 font-medium"
                    >
                      Animate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
