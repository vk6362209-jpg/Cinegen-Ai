import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatDuration } from '../lib/api.ts';
import {
  AspectRatio,
  BUILTIN_MUSIC_BEDS,
  CAMERA_MOVEMENTS,
  DURATION_OPTIONS,
  estimateVideoCreditCost,
  LIGHTING_STYLES,
  MONETIZATION_DISCLAIMER,
  SUPPORTED_LANGUAGES,
  VideoJobRecord,
  VideoProviderId,
  VideoQuality,
  VISUAL_STYLES,
  VOICE_PRESETS,
} from '../types/cinegen.ts';

export function VideoGeneratorPage({ mode }: { mode: 'text-to-video' | 'image-to-video' }) {
  const { handoff, clearHandoff, navigate, notify, refreshUser, providers } = useApp();

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<VideoProviderId>('demo-mode');
  const [allowDemoFallback, setAllowDemoFallback] = useState(true);
  const [durationSec, setDurationSec] = useState<number>(20);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [quality, setQuality] = useState<VideoQuality>('720p');
  const [style, setStyle] = useState<string>('Cinematic');
  const [customStyle, setCustomStyle] = useState('');
  const [cameraMovement, setCameraMovement] = useState<string>(CAMERA_MOVEMENTS[0]);
  const [lighting, setLighting] = useState<string>(LIGHTING_STYLES[0]);
  const [language, setLanguage] = useState<string>('English');
  const [includeVoiceover, setIncludeVoiceover] = useState(true);
  const [voiceName, setVoiceName] = useState<string>('Kore');
  const [musicBedId, setMusicBedId] = useState<string>('ambient-horizon');
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [copyrightAck, setCopyrightAck] = useState(false);

  // Image-to-Video reference image state
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [refImageFilename, setRefImageFilename] = useState<string | null>(null);
  const [refImageMime, setRefImageMime] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Active job tracking
  const [submitting, setSubmitting] = useState(false);
  const [activeJob, setActiveJob] = useState<VideoJobRecord | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  // Consume handoffs from Script Writer or Text-to-Image
  useEffect(() => {
    if (!handoff) return;
    if (handoff.prompt) setPrompt(handoff.prompt);
    if (handoff.aspectRatio) setAspectRatio(handoff.aspectRatio);
    if (handoff.durationSec) setDurationSec(handoff.durationSec);
    if (handoff.style) setStyle(handoff.style);
    if (handoff.referenceImageUrl && handoff.referenceImageFilename) {
      setRefImageUrl(handoff.referenceImageUrl);
      setRefImageFilename(handoff.referenceImageFilename);
      setRefImageMime(handoff.referenceImageMimeType || 'image/png');
    }
    if (handoff.script?.title) {
      setTitle(handoff.script.title);
    }
  }, [handoff]);

  useEffect(() => {
    if (quality === '4k' && provider !== 'google-veo') {
      setQuality('1080p');
    }
  }, [provider, quality]);

  // Poll active job status
  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'completed' || activeJob.status === 'failed') {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      void refreshUser();
      return;
    }

    pollTimerRef.current = window.setInterval(async () => {
      try {
        const res = await apiFetch<{ job: VideoJobRecord }>(`/api/jobs/${activeJob.id}`);
        setActiveJob(res.job);
        if (res.job.status === 'completed') {
          notify(
            'success',
            res.job.isDemo
              ? `Demo Mode storyboard MP4 rendered (${formatDuration(res.job.actualDurationSec)}).`
              : `AI Video rendered (${formatDuration(res.job.actualDurationSec)}).`
          );
        } else if (res.job.status === 'failed') {
          notify('error', res.job.errorMessage || 'Video generation failed. Credits refunded.');
        }
      } catch {
        // transient poll error ignored until next tick
      }
    }, 2200);

    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
  }, [activeJob?.id, activeJob?.status, notify, refreshUser]);

  const estimatedCredits = useMemo(
    () =>
      estimateVideoCreditCost({
        durationSec,
        quality,
        provider,
        includeVoiceover,
        includeMusic: musicBedId !== 'none',
      }),
    [durationSec, quality, provider, includeVoiceover, musicBedId]
  );

  const expectedScenes = useMemo(() => {
    const found = DURATION_OPTIONS.find((d) => d.seconds === durationSec);
    return found ? found.defaultScenes : Math.max(1, Math.ceil(durationSec / 10));
  }, [durationSec]);

  const handleImageUpload = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      notify('error', 'Upload a PNG, JPEG, or WebP reference image.');
      return;
    }
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<{ filename: string; url: string; mimeType: string }>(
        '/api/media/upload',
        { method: 'POST', body: formData }
      );
      setRefImageUrl(res.url);
      setRefImageFilename(res.filename);
      setRefImageMime(res.mimeType);
      notify('success', 'Reference image uploaded.');
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setJobError(null);

    if (prompt.trim().length < 5) {
      setJobError('Describe your video scene or story (at least 5 characters).');
      return;
    }
    if (mode === 'image-to-video' && !refImageFilename) {
      setJobError('Please upload a reference image first for Image-to-Video generation.');
      return;
    }
    if (!copyrightAck) {
      setJobError('Please confirm the Copyright & Originality check before generating.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ job: VideoJobRecord }>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || undefined,
          type: mode,
          provider,
          prompt: prompt.trim(),
          durationSec,
          aspectRatio,
          quality,
          style,
          customStyle: style === 'Custom' ? customStyle.trim() : undefined,
          cameraMovement,
          lighting,
          language,
          includeVoiceover,
          voiceName,
          musicBedId,
          includeSubtitles,
          allowDemoFallback,
          referenceImageFilename: mode === 'image-to-video' ? refImageFilename : null,
          referenceImageMimeType: mode === 'image-to-video' ? refImageMime : null,
          existingScript: handoff?.script ?? null,
        }),
      });
      setActiveJob(res.job);
      clearHandoff();
      notify('info', `Multi-scene pipeline started (${expectedScenes} scenes · target ${formatDuration(durationSec)}).`);
      void refreshUser();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not start generation job.';
      setJobError(msg);
      notify('error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (overrideProvider?: VideoProviderId) => {
    if (!activeJob) return;
    setJobError(null);
    try {
      const res = await apiFetch<{ job: VideoJobRecord }>(`/api/jobs/${activeJob.id}/retry`, {
        method: 'POST',
        body: JSON.stringify({
          provider: overrideProvider || activeJob.provider,
          allowDemoFallback,
        }),
      });
      setActiveJob(res.job);
      notify('info', 'Retrying generation job.');
      void refreshUser();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Retry failed.');
    }
  };

  const veoStatus = providers.find((p) => p.id === 'google-veo');
  const runwayStatus = providers.find((p) => p.id === 'runway');

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      {/* Left Configuration Form */}
      <form
        onSubmit={handleGenerate}
        className="lg:col-span-5 rounded-xl bg-[#11141C] border border-white/[0.08] p-5 sm:p-6 space-y-5"
      >
        <div>
          <h2 className="text-lg font-display font-bold text-white">
            {mode === 'image-to-video' ? 'Image-to-Video Studio' : 'Multi-Scene Text-to-Video'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Automatically breaks scripts into timed scenes, renders clips, synchronizes voiceover &
            subtitles, and assembles a downloadable MP4.
          </p>
        </div>

        {handoff?.script && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-2">
            <span>
              Using script: <strong>{handoff.script.title}</strong> ({handoff.script.scenes.length}{' '}
              scenes)
            </span>
            <button
              type="button"
              onClick={clearHandoff}
              className="text-amber-300 underline shrink-0"
            >
              Clear
            </button>
          </div>
        )}

        {mode === 'image-to-video' && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Reference Keyframe Image
            </label>
            <div className="rounded-xl border border-dashed border-white/[0.16] bg-[#0B0D12] p-4">
              {refImageUrl ? (
                <div className="space-y-3">
                  <img
                    src={refImageUrl}
                    alt="Uploaded visual reference frame"
                    className="w-full max-h-48 object-contain rounded-lg bg-black"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 truncate">{refImageFilename}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setRefImageUrl(null);
                        setRefImageFilename(null);
                      }}
                      className="text-rose-400 hover:text-rose-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center py-6 cursor-pointer text-center gap-2">
                  {uploadingImage ? (
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6 text-slate-400" />
                  )}
                  <span className="text-xs font-medium text-slate-200">
                    {uploadingImage ? 'Uploading image...' : 'Click to upload PNG, JPG, or WebP'}
                  </span>
                  <span className="text-[11px] text-slate-500">Maximum file size 12 MB</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleImageUpload(f);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="vid-title" className="block text-xs font-medium text-slate-300 mb-1.5">
            Project Title (optional)
          </label>
          <input
            id="vid-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Journey Across the Volcanic Fjords"
            className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div>
          <label htmlFor="vid-prompt" className="block text-xs font-medium text-slate-300 mb-1.5">
            {mode === 'image-to-video' ? 'Animation & Story Direction Prompt' : 'Video Story Prompt'}
          </label>
          <textarea
            id="vid-prompt"
            rows={4}
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'image-to-video'
                ? 'Describe how the camera moves, environmental motion, lighting evolution, and scene progression...'
                : 'Describe your original story, setting, subjects, atmosphere, and key visual beats...'
            }
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500 resize-y"
          />
        </div>

        {/* AI Video Provider Adapter */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-300">
            Video Generation Provider Adapter
          </label>
          <div className="grid grid-cols-1 gap-2">
            {[
              {
                id: 'google-veo' as const,
                name: 'Google Veo / Omni Flash',
                note: veoStatus?.configured
                  ? 'Live API (requires billing-enabled GEMINI_API_KEY) · 720p/1080p/4K'
                  : 'Requires billing-enabled GEMINI_API_KEY',
              },
              {
                id: 'runway' as const,
                name: 'Runway Gen-4 Turbo API',
                note: runwayStatus?.configured
                  ? 'Configured on server · Image-to-Video 720p/1080p'
                  : 'Requires RUNWAY_API_KEY on server',
              },
              {
                id: 'demo-mode' as const,
                name: 'DEMO MODE (Watermarked Storyboard Preview)',
                note: 'Instant FFmpeg MP4 render with real Gemini script & TTS voiceover',
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setProvider(opt.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  provider === opt.id
                    ? 'bg-amber-500/10 border-amber-500/45 text-white'
                    : 'bg-[#0B0D12] border-white/[0.08] text-slate-300 hover:border-white/20'
                }`}
              >
                <div className="text-xs font-semibold">{opt.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{opt.note}</div>
              </button>
            ))}
          </div>

          {provider !== 'demo-mode' && (
            <label className="flex items-start gap-2 pt-1 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={allowDemoFallback}
                onChange={(e) => setAllowDemoFallback(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span>
                If live video API credentials or paid quota are unavailable, fall back to clearly
                watermarked DEMO MODE preview instead of failing the job.
              </span>
            </label>
          )}
        </div>

        {/* Duration Selection (10s to 5m) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">Target Video Duration</span>
            <span className="font-mono tabular-nums text-amber-400">
              ~{expectedScenes} {expectedScenes === 1 ? 'scene' : 'scenes'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.seconds}
                type="button"
                onClick={() => setDurationSec(opt.seconds)}
                className={`py-2 px-2 rounded-lg text-xs font-mono tabular-nums font-medium border transition-colors ${
                  durationSec === opt.seconds
                    ? 'bg-amber-500 text-[#090A0D] border-amber-500 font-semibold'
                    : 'bg-[#0B0D12] text-slate-300 border-white/[0.09] hover:border-white/25'
                }`}
              >
                {opt.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio & Quality */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Aspect Ratio</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['16:9', '9:16'] as AspectRatio[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setAspectRatio(r)}
                  className={`py-2 rounded-lg text-xs font-mono border transition-colors ${
                    aspectRatio === r
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-semibold'
                      : 'bg-[#0B0D12] border-white/[0.09] text-slate-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Quality</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['720p', '1080p', '4k'] as VideoQuality[]).map((q) => {
                const disabled = q === '4k' && provider !== 'google-veo';
                return (
                  <button
                    key={q}
                    type="button"
                    disabled={disabled}
                    onClick={() => setQuality(q)}
                    title={disabled ? '4K is only supported on Google Veo' : undefined}
                    className={`py-2 rounded-lg text-xs font-mono border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                      quality === q
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-semibold'
                        : 'bg-[#0B0D12] border-white/[0.09] text-slate-300'
                    }`}
                  >
                    {q.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Style, Camera, Lighting */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="vid-style" className="block text-xs font-medium text-slate-300 mb-1.5">
              Visual Style
            </label>
            <select
              id="vid-style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              {VISUAL_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vid-camera" className="block text-xs font-medium text-slate-300 mb-1.5">
              Camera Movement
            </label>
            <select
              id="vid-camera"
              value={cameraMovement}
              onChange={(e) => setCameraMovement(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              {CAMERA_MOVEMENTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {style === 'Custom' && (
          <div>
            <label htmlFor="vid-custom-style" className="block text-xs font-medium text-slate-300 mb-1.5">
              Custom Visual Direction
            </label>
            <input
              id="vid-custom-style"
              type="text"
              value={customStyle}
              onChange={(e) => setCustomStyle(e.target.value)}
              placeholder="e.g., 1970s Kodak 35mm documentary grain with muted teal shadows"
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="vid-light" className="block text-xs font-medium text-slate-300 mb-1.5">
              Lighting Style
            </label>
            <select
              id="vid-light"
              value={lighting}
              onChange={(e) => setLighting(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              {LIGHTING_STYLES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="vid-lang" className="block text-xs font-medium text-slate-300 mb-1.5">
              Narration Language
            </label>
            <select
              id="vid-lang"
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

        {/* Voiceover, Music & Subtitles */}
        <div className="pt-3 border-t border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeVoiceover}
                onChange={(e) => setIncludeVoiceover(e.target.checked)}
                className="accent-amber-500"
              />
              <span>Synchronize AI Voiceover (Gemini 3.8 TTS)</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSubtitles}
                onChange={(e) => setIncludeSubtitles(e.target.checked)}
                className="accent-amber-500"
              />
              <span>Burn Subtitles</span>
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {includeVoiceover && (
              <div>
                <label htmlFor="vid-voice" className="block text-xs text-slate-400 mb-1">
                  AI Voice Talent
                </label>
                <select
                  id="vid-voice"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                >
                  {VOICE_PRESETS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="vid-music" className="block text-xs text-slate-400 mb-1">
                Background Music Bed (CC0)
              </label>
              <select
                id="vid-music"
                value={musicBedId}
                onChange={(e) => setMusicBedId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              >
                {BUILTIN_MUSIC_BEDS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Copyright Safety Acknowledgment */}
        <div className="p-3.5 rounded-lg bg-[#0B0D12] border border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Originality & Copyright Check</span>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer leading-relaxed">
            <input
              type="checkbox"
              checked={copyrightAck}
              onChange={(e) => setCopyrightAck(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span>
              I confirm this prompt does not reproduce copyrighted movies, songs, trademarks, or
              impersonate real people. I understand YouTube independently evaluates monetization.
            </span>
          </label>
        </div>

        {jobError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200 leading-relaxed"
          >
            {jobError}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-400">
            Estimated cost:{' '}
            <span className="font-mono tabular-nums font-semibold text-amber-400">
              {estimatedCredits} credits
            </span>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#090A0D] text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{submitting ? 'Starting Pipeline...' : 'Generate Multi-Scene Video'}</span>
          </button>
        </div>
      </form>

      {/* Right Stage: Live Progress, Final Video Player & Per-Scene Breakdown */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-display font-semibold text-white">
                Production Monitor & Output Player
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeJob
                  ? `Job ${activeJob.id} · Target ${formatDuration(activeJob.targetDurationSec)}`
                  : 'Configure your prompt and click Generate to launch the multi-scene pipeline.'}
              </p>
            </div>
            {activeJob && (
              <div className="text-xs font-mono tabular-nums">
                {activeJob.isDemo ? (
                  <span className="text-amber-400 font-semibold">
                    DEMO MODE — STORYBOARD PREVIEW
                  </span>
                ) : (
                  <span className="text-emerald-400 font-semibold">
                    LIVE PROVIDER ({activeJob.provider})
                  </span>
                )}
              </div>
            )}
          </div>

          {!activeJob ? (
            <div className="aspect-[16/9] rounded-xl bg-[#090B10] border border-dashed border-white/[0.12] flex flex-col items-center justify-center p-8 text-center space-y-3">
              <Film className="w-10 h-10 text-slate-600" />
              <div className="text-sm font-medium text-slate-300">Ready to Render</div>
              <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                Your assembled MP4 video, exact measured runtime, and scene-by-scene generation
                timeline will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200 capitalize">
                    Stage: {activeJob.status.replace('_', ' ')}
                  </span>
                  <span className="font-mono tabular-nums text-amber-400">
                    {activeJob.progress}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      activeJob.status === 'failed'
                        ? 'bg-rose-500'
                        : activeJob.status === 'completed'
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                    }`}
                    style={{ width: `${activeJob.progress}%` }}
                  />
                </div>
              </div>

              {/* Error Recovery Panel */}
              {activeJob.status === 'failed' && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/35 space-y-3">
                  <div className="flex items-start gap-2.5 text-sm text-rose-200">
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold">Generation Failed (Credits Automatically Refunded)</div>
                      <p className="text-xs text-rose-200/90 leading-relaxed">
                        {activeJob.errorMessage}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleRetry()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.1] hover:bg-white/[0.16] text-xs font-medium text-white"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Retry Same Provider</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRetry('demo-mode')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
                    >
                      <span>Run in Watermarked DEMO MODE</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Completed Final MP4 Player */}
              {activeJob.status === 'completed' && activeJob.outputUrl && (
                <div className="space-y-4">
                  {activeJob.isDemo && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/35 flex items-start gap-2.5 text-xs text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        <strong>DEMO MODE Preview:</strong> This MP4 was rendered by CINEGEN AI’s
                        local FFmpeg storyboard renderer (not a live Veo or Runway AI video model).
                        Configure a billing-enabled GEMINI_API_KEY or RUNWAY_API_KEY on the server
                        for live AI video frames.
                      </span>
                    </div>
                  )}

                  <div className="rounded-xl overflow-hidden bg-black border border-white/[0.1]">
                    <video
                      key={activeJob.outputUrl}
                      src={activeJob.outputUrl}
                      controls
                      className="w-full max-h-[460px] mx-auto"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="text-xs font-mono tabular-nums text-slate-300">
                      Target: {formatDuration(activeJob.targetDurationSec)} · Rendered Actual:{' '}
                      <span className="text-emerald-400 font-semibold">
                        {formatDuration(activeJob.actualDurationSec)}
                      </span>{' '}
                      · {activeJob.scenes.length} scenes
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          navigate('video-editor', { projectId: activeJob.projectId })
                        }
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>Open in Studio Editor</span>
                      </button>
                      <a
                        href={`${activeJob.outputUrl}?download=1`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download MP4</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Scene-by-Scene Progress List */}
              {activeJob.scenes.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-white/[0.08]">
                  <div className="text-xs font-medium text-slate-300">
                    Scene-by-Scene Progress ({activeJob.scenes.filter((s) => s.status === 'completed').length}/
                    {activeJob.scenes.length} completed)
                  </div>
                  <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                    {activeJob.scenes.map((sc) => (
                      <div
                        key={sc.id}
                        className="p-3.5 rounded-lg bg-[#0B0D12] border border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono tabular-nums text-amber-400">
                              {String(sc.sceneIndex + 1).padStart(2, '0')}
                            </span>
                            <span className="font-semibold text-white truncate">{sc.title}</span>
                            <span className="text-slate-500 font-mono tabular-nums">
                              {Math.round(sc.durationSec)}s
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2">{sc.visualPrompt}</p>
                          {sc.narrationText && (
                            <p className="text-[11px] text-slate-500 italic line-clamp-1">
                              Voiceover: “{sc.narrationText}”
                            </p>
                          )}
                          {sc.errorMessage && (
                            <p className="text-[11px] text-amber-300">{sc.errorMessage}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-xs">
                          {sc.status === 'completed' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{sc.isDemo ? 'Demo Clip' : 'Rendered'}</span>
                            </span>
                          ) : sc.status === 'generating' ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Rendering</span>
                            </span>
                          ) : sc.status === 'failed' ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-medium">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Failed</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">Queued</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 rounded-xl bg-[#11141C] border border-white/[0.08] text-xs text-slate-400 leading-relaxed">
          <span className="font-semibold text-slate-200">Monetization & Policy Notice: </span>
          {MONETIZATION_DISCLAIMER}
        </div>
      </div>
    </div>
  );
}
