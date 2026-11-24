import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Mic, ShieldCheck, Upload, Volume2 } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatBytes, formatDateTime } from '../lib/api.ts';
import {
  MediaAssetRecord,
  SUPPORTED_LANGUAGES,
  VOICE_PRESETS,
} from '../types/cinegen.ts';

export function VoiceStudioPage() {
  const { notify, refreshUser } = useApp();
  const [text, setText] = useState(
    'Across ancient mountain passes, observatories once tracked every solstice with remarkable precision.'
  );
  const [voiceName, setVoiceName] = useState<string>('Kore');
  const [language, setLanguage] = useState<string>('English (US / Global)');
  const [style, setStyle] = useState('Clear, cinematic documentary narration');
  const [speed, setSpeed] = useState(1.0);
  const [pitchNote, setPitchNote] = useState<'Low' | 'Natural' | 'Bright'>('Natural');
  const [multiSpeaker, setMultiSpeaker] = useState(false);
  const [secondVoiceName, setSecondVoiceName] = useState<string>('Puck');
  const [secondSpeakerText, setSecondSpeakerText] = useState(
    'And even today, those stone alignments still match the winter horizon.'
  );

  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestAudio, setLatestAudio] = useState<{
    url: string;
    filename: string;
    model: string;
  } | null>(null);
  const [library, setLibrary] = useState<MediaAssetRecord[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadLibrary = useCallback(async () => {
    try {
      const res = await apiFetch<{ assets: MediaAssetRecord[] }>('/api/assets?kind=audio');
      setLibrary(res.assets);
    } catch {
      // ignore initial error
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed, latestAudio]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (text.trim().length < 2) {
      setError('Enter narration or dialogue text to synthesize.');
      return;
    }

    setGenerating(true);
    try {
      const pitchDirective =
        pitchNote === 'Low'
          ? 'Lower, deeper vocal resonance.'
          : pitchNote === 'Bright'
            ? 'Slightly higher, brighter vocal inflection.'
            : 'Natural vocal pitch.';
      const pacingDirective =
        speed < 0.9
          ? 'Unrushed, deliberate pacing.'
          : speed > 1.15
            ? 'Brisk, energetic pacing.'
            : 'Balanced steady pacing.';

      const res = await apiFetch<{ url: string; filename: string; model: string }>(
        '/api/voice/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            text: text.trim(),
            voiceName,
            language,
            style: `${style}. ${pitchDirective} ${pacingDirective}`,
            multiSpeaker,
            secondVoiceName,
            secondSpeakerText: multiSpeaker ? secondSpeakerText.trim() : undefined,
          }),
        }
      );

      setLatestAudio(res);
      notify('success', `Studio WAV voiceover rendered with ${res.model}.`);
      void loadLibrary();
      void refreshUser();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Voice generation failed.';
      setError(msg);
      notify('error', msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleAudioUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch<{ url: string; filename: string }>('/api/media/upload', {
        method: 'POST',
        body: formData,
      });
      setLatestAudio({ url: res.url, filename: res.filename, model: 'Uploaded Audio Track' });
      notify('success', 'Custom audio uploaded and added to your Voice Library.');
      void loadLibrary();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Audio upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleGenerate}
        className="lg:col-span-6 rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-5"
      >
        <div>
          <h2 className="text-lg font-display font-bold text-white">AI Voice Studio (Gemini 3.8 TTS)</h2>
          <p className="text-xs text-slate-400 mt-1">
            Synthesize clear studio WAV narration in English, Telugu, Hindi, and global languages
            using authorized AI voices.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="vs-lang" className="block text-xs font-medium text-slate-300 mb-1.5">
              Language
            </label>
            <select
              id="vs-lang"
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
          <div>
            <label htmlFor="vs-voice" className="block text-xs font-medium text-slate-300 mb-1.5">
              Primary Voice Talent
            </label>
            <select
              id="vs-voice"
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
        </div>

        <div>
          <label htmlFor="vs-style" className="block text-xs font-medium text-slate-300 mb-1.5">
            Delivery Direction
          </label>
          <input
            id="vs-style"
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="e.g., Warm documentary storyteller, enthusiastic YouTube host"
            className="w-full px-3.5 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-300">Playback / Pacing Speed</span>
              <span className="font-mono tabular-nums text-amber-400">{speed.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min={0.75}
              max={1.35}
              step={0.05}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="w-full accent-amber-500"
            />
          </div>
          <div>
            <div className="text-xs text-slate-300 mb-1.5">Voice Pitch Character</div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['Low', 'Natural', 'Bright'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPitchNote(p)}
                  className={`py-1.5 rounded-lg text-xs border transition-colors ${
                    pitchNote === p
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-semibold'
                      : 'bg-[#0B0D12] border-white/[0.09] text-slate-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="vs-text" className="block text-xs font-medium text-slate-300 mb-1.5">
            {multiSpeaker ? 'Speaker 1 (Host) Script' : 'Voiceover Script'}
          </label>
          <textarea
            id="vs-text"
            rows={4}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type narration in English, Telugu (తెలుగు), Hindi, or any supported language..."
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={multiSpeaker}
            onChange={(e) => setMultiSpeaker(e.target.checked)}
            className="accent-amber-500"
          />
          <span>Enable Dual-Speaker Podcast / Dialogue Mode (gemini-3.8-flash-tts)</span>
        </label>

        {multiSpeaker && (
          <div className="p-4 rounded-xl bg-[#0B0D12] border border-white/[0.08] space-y-3">
            <div>
              <label htmlFor="vs-voice2" className="block text-xs text-slate-300 mb-1">
                Speaker 2 (Guest) Voice
              </label>
              <select
                id="vs-voice2"
                value={secondVoiceName}
                onChange={(e) => setSecondVoiceName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              >
                {VOICE_PRESETS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vs-text2" className="block text-xs text-slate-300 mb-1">
                Speaker 2 Line
              </label>
              <textarea
                id="vs-text2"
                rows={2}
                value={secondSpeakerText}
                onChange={(e) => setSecondSpeakerText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
              />
            </div>
          </div>
        )}

        <div className="p-3 rounded-lg bg-[#0B0D12] border border-white/[0.07] flex items-start gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            Voice Ethics Guarantee: CINEGEN AI uses only licensed synthetic voice models and blocks
            unauthorized celebrity or real-person voice cloning.
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium text-slate-200 cursor-pointer">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{uploading ? 'Uploading...' : 'Upload Own Audio'}</span>
            <input
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp3,audio/webm,audio/ogg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAudioUpload(f);
              }}
            />
          </label>

          <button
            type="submit"
            disabled={generating}
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#090A0D] text-sm font-semibold inline-flex items-center gap-2"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
            <span>{generating ? 'Synthesizing WAV...' : 'Generate Voiceover (2 cr)'}</span>
          </button>
        </div>
      </form>

      {/* Right Preview & Voice Library */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-display font-semibold text-white">Active Voice Preview</h3>
            {latestAudio && (
              <span className="text-xs font-mono text-amber-400">{latestAudio.model}</span>
            )}
          </div>

          {latestAudio ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#0B0D12] border border-white/[0.08]">
                <audio
                  ref={audioRef}
                  key={latestAudio.url}
                  src={latestAudio.url}
                  controls
                  className="w-full"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400 truncate">{latestAudio.filename}</span>
                <a
                  href={`${latestAudio.url}?download=1`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Audio</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="py-12 rounded-xl bg-[#090B10] border border-dashed border-white/[0.12] flex flex-col items-center justify-center text-slate-500 gap-2">
              <Volume2 className="w-8 h-8 text-slate-600" />
              <span className="text-xs">Generate or upload audio to preview and sync in the editor.</span>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4">
          <h3 className="text-sm font-display font-semibold text-white">
            Saved Voiceovers & Audio Library
          </h3>
          {library.length === 0 ? (
            <p className="text-xs text-slate-500">No audio clips saved yet.</p>
          ) : (
            <div className="divide-y divide-white/[0.07] max-h-[380px] overflow-y-auto">
              {library.map((item) => (
                <div key={item.id} className="py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-white font-medium truncate">
                      {item.prompt || item.filename}
                    </span>
                    <span className="text-slate-500 font-mono tabular-nums shrink-0">
                      {formatBytes(item.sizeBytes)} · {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <audio src={item.url} controls className="h-8 flex-1" />
                    <a
                      href={`${item.url}?download=1`}
                      className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 shrink-0"
                      title="Download audio"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
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
