import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  Loader2,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatDuration } from '../lib/api.ts';
import {
  DURATION_OPTIONS,
  GeneratedScript,
  ScriptFormat,
  SUPPORTED_LANGUAGES,
} from '../types/cinegen.ts';

const SCRIPT_FORMATS: ScriptFormat[] = [
  'YouTube Shorts',
  'YouTube Long-Form',
  'Instagram Reels',
  'Facebook Video',
  'Horror Story',
  'Mythological Story',
  'Documentary',
  'Educational',
  'Motivational',
  'Facts Video',
  'Cinematic Storytelling',
];

export function ScriptWriterPage() {
  const { navigate, notify } = useApp();
  const [topic, setTopic] = useState('');
  const [format, setFormat] = useState<ScriptFormat>('YouTube Long-Form');
  const [language, setLanguage] = useState('English (US / Global)');
  const [tone, setTone] = useState('Cinematic & Engaging');
  const [durationSec, setDurationSec] = useState<number>(60);
  const [audience, setAudience] = useState('Curious global YouTube viewers');
  const [storytellingStyle, setStorytellingStyle] = useState('Visual Documentary Arc');
  const [voiceoverStyle, setVoiceoverStyle] = useState('Measured, vivid storytelling');
  const [saveProject, setSaveProject] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (topic.trim().length < 4) {
      setError('Enter a topic or story premise (at least 4 characters).');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ script: GeneratedScript; projectId: string | null }>(
        '/api/script/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            topic: topic.trim(),
            format,
            language,
            tone,
            durationSec,
            audience,
            storytellingStyle,
            voiceoverStyle,
            saveProject,
          }),
        }
      );
      setScript(res.script);
      setSavedProjectId(res.projectId);
      notify(
        'success',
        `Generated ${res.script.scenes.length}-scene original script via Gemini 4 Hydrogen.`
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Script generation failed.';
      setError(msg);
      notify('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!script) return;
    const text = [
      `TITLE: ${script.title}`,
      `LOGLINE: ${script.logline}`,
      `VISUAL CONSISTENCY: ${script.visualConsistencyBible}`,
      '',
      ...script.scenes.map(
        (s) =>
          `SCENE ${s.sceneNumber}: ${s.title} (${s.durationSec}s)\nVISUAL: ${s.visualPrompt}\nCAMERA: ${s.cameraMovement} | LIGHTING: ${s.lighting}\nNARRATION: ${s.narration}\n`
      ),
    ].join('\n');
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendToVideo = () => {
    if (!script) return;
    const isVertical =
      format === 'YouTube Shorts' || format === 'Instagram Reels';
    navigate('text-to-video', {
      prompt: script.logline || topic,
      script,
      projectId: savedProjectId,
      aspectRatio: isVertical ? '9:16' : '16:9',
      durationSec,
    });
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleGenerate}
        className="lg:col-span-5 rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-4"
      >
        <div>
          <h2 className="text-lg font-display font-bold text-white">AI Script & Scene Architect</h2>
          <p className="text-xs text-slate-400 mt-1">
            Powered by Gemini 4 Hydrogen. Creates original scripts, divides them into timed scenes,
            and builds a visual continuity guide.
          </p>
        </div>

        <div>
          <label htmlFor="sc-topic" className="block text-xs font-medium text-slate-300 mb-1.5">
            Story Premise or Topic
          </label>
          <textarea
            id="sc-topic"
            rows={4}
            required
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., How ancient stepwells in India engineered natural cooling systems centuries before modern air conditioning..."
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#090B10] border border-white/[0.12] text-sm text-white placeholder:text-slate-500"
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sc-format" className="block text-xs font-medium text-slate-300 mb-1.5">
              Format
            </label>
            <select
              id="sc-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ScriptFormat)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              {SCRIPT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sc-lang" className="block text-xs font-medium text-slate-300 mb-1.5">
              Language
            </label>
            <select
              id="sc-lang"
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

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sc-dur" className="block text-xs font-medium text-slate-300 mb-1.5">
              Target Runtime
            </label>
            <select
              id="sc-dur"
              value={durationSec}
              onChange={(e) => setDurationSec(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            >
              {DURATION_OPTIONS.map((d) => (
                <option key={d.seconds} value={d.seconds}>
                  {d.label} (~{d.defaultScenes} scenes)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sc-tone" className="block text-xs font-medium text-slate-300 mb-1.5">
              Tone
            </label>
            <input
              id="sc-tone"
              type="text"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="sc-aud" className="block text-xs font-medium text-slate-300 mb-1.5">
              Target Audience
            </label>
            <input
              id="sc-aud"
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            />
          </div>
          <div>
            <label htmlFor="sc-story" className="block text-xs font-medium text-slate-300 mb-1.5">
              Storytelling Style
            </label>
            <input
              id="sc-story"
              type="text"
              value={storytellingStyle}
              onChange={(e) => setStorytellingStyle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
            />
          </div>
        </div>

        <div>
          <label htmlFor="sc-vo" className="block text-xs font-medium text-slate-300 mb-1.5">
            Voiceover Direction
          </label>
          <input
            id="sc-vo"
            type="text"
            value={voiceoverStyle}
            onChange={(e) => setVoiceoverStyle(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={saveProject}
            onChange={(e) => setSaveProject(e.target.checked)}
            className="accent-amber-500"
          />
          <span>Automatically save script to My Projects</span>
        </label>

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
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{loading ? 'Writing Multi-Scene Script...' : 'Generate Script & Scene Breakdown'}</span>
        </button>
      </form>

      {/* Output Script Display */}
      <div className="lg:col-span-7 rounded-xl bg-[#11141C] border border-white/[0.08] p-6 space-y-5">
        {!script ? (
          <div className="py-20 text-center space-y-3 border border-dashed border-white/[0.12] rounded-xl">
            <FileText className="w-9 h-9 text-slate-600 mx-auto" />
            <div className="text-sm font-medium text-slate-300">No Script Generated Yet</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Choose a format, language (including Telugu & English), and duration to generate a
              scene-by-scene shooting script with continuity notes.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div className="space-y-1">
                <div className="text-xs text-amber-400 font-medium">
                  {script.format} · {script.language} · {formatDuration(script.totalDurationSec)} ·{' '}
                  {script.scenes.length} scenes
                </div>
                <h3 className="text-xl font-display font-bold text-white">{script.title}</h3>
                <p className="text-sm text-slate-400">{script.logline}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-xs font-medium text-white"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSendToVideo}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Send to Video Generator</span>
                </button>
              </div>
            </div>

            {/* Visual Consistency Bible */}
            <div className="p-4 rounded-lg bg-[#0B0D12] border border-white/[0.08] space-y-1">
              <div className="text-xs font-semibold text-amber-400">Visual Consistency Guide</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {script.visualConsistencyBible}
              </p>
            </div>

            {script.flaggedTerms.length > 0 && (
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/35 flex items-start gap-2.5 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Copyright / Trademark Watchlist Triggered:</strong>{' '}
                  {script.flaggedTerms.join(', ')}. Consider replacing protected names with original
                  concepts prior to export.
                </div>
              </div>
            )}

            {/* Scene Breakdown List */}
            <div className="space-y-3">
              {script.scenes.map((scene) => (
                <div
                  key={scene.sceneNumber}
                  className="p-4 rounded-xl bg-[#0B0D12] border border-white/[0.07] space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono tabular-nums text-amber-400">
                        Scene {String(scene.sceneNumber).padStart(2, '0')}
                      </span>
                      <span className="text-sm font-semibold text-white">{scene.title}</span>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-400">
                      {scene.durationSec}s
                    </span>
                  </div>
                  <div className="text-xs text-slate-200 leading-relaxed">
                    <span className="text-slate-500 font-medium">Narration: </span>
                    {scene.narration}
                  </div>
                  <div className="text-xs text-slate-400 leading-relaxed">
                    <span className="text-slate-500 font-medium">Visual Prompt: </span>
                    {scene.visualPrompt}
                  </div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-white/[0.06]">
                    <span>Camera: {scene.cameraMovement}</span>
                    <span>·</span>
                    <span>Lighting: {scene.lighting}</span>
                    <span>·</span>
                    <span>Sound: {scene.soundCue}</span>
                  </div>
                </div>
              ))}
            </div>

            {script.copyrightSafetyNotes.length > 0 && (
              <div className="p-3.5 rounded-lg bg-emerald-500/8 border border-emerald-500/25 text-xs text-emerald-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Originality Verification Notes</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-emerald-200/85">
                  {script.copyrightSafetyNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
