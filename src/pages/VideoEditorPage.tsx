import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Download,
  Film,
  Loader2,
  Music,
  Scissors,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatDuration } from '../lib/api.ts';
import {
  AspectRatio,
  BUILTIN_MUSIC_BEDS,
  MediaAssetRecord,
  MONETIZATION_DISCLAIMER,
  ProjectRecord,
  SceneItem,
  TransitionType,
} from '../types/cinegen.ts';

export function VideoEditorPage() {
  const { handoff, clearHandoff, navigate, notify } = useApp();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [activeSceneIdx, setActiveSceneIdx] = useState<number>(0);
  const [audioAssets, setAudioAssets] = useState<MediaAssetRecord[]>([]);

  // Master studio settings
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [quality, setQuality] = useState<'720p' | '1080p'>('720p');
  const [musicBedId, setMusicBedId] = useState<string>('ambient-horizon');
  const [voiceVolume, setVoiceVolume] = useState<number>(1.0);
  const [musicVolume, setMusicVolume] = useState<number>(0.25);
  const [includeSubtitles, setIncludeSubtitles] = useState<boolean>(true);

  // Export & Copyright modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [copyrightAck, setCopyrightAck] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportedResult, setExportedResult] = useState<{
    outputUrl: string;
    durationSec: number;
    isDemo: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProjectDetail = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ project: ProjectRecord }>(`/api/projects/${id}`);
      setProject(res.project);
      setAspectRatio(res.project.aspectRatio || '16:9');
      const loadedScenes = (res.project.scenes || []).filter((s) => Boolean(s.videoUrl));
      setScenes(loadedScenes);
      setActiveSceneIdx(0);
      setExportedResult(
        res.project.finalVideoUrl
          ? {
              outputUrl: res.project.finalVideoUrl,
              durationSec: res.project.finalDurationSec || res.project.targetDurationSec,
              isDemo: res.project.isDemo,
            }
          : null
      );
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to load project timeline.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const boot = async () => {
      try {
        const [pRes, aRes] = await Promise.all([
          apiFetch<{ projects: ProjectRecord[] }>('/api/projects'),
          apiFetch<{ assets: MediaAssetRecord[] }>('/api/assets?kind=audio'),
        ]);
        setProjects(pRes.projects);
        setAudioAssets(aRes.assets);

        const initialId =
          handoff?.projectId ||
          pRes.projects.find((p) => p.finalVideoUrl)?.id ||
          pRes.projects[0]?.id ||
          '';
        if (handoff?.projectId) clearHandoff();
        if (initialId) {
          setSelectedProjectId(initialId);
          await loadProjectDetail(initialId);
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
    };
    void boot();
  }, [clearHandoff, handoff?.projectId, loadProjectDetail]);

  const activeScene = scenes[activeSceneIdx] || null;

  const updateActiveScene = (patch: Partial<SceneItem>) => {
    setScenes((prev) =>
      prev.map((s, idx) => (idx === activeSceneIdx ? { ...s, ...patch } : s))
    );
  };

  const moveScene = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= scenes.length) return;
    setScenes((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, moved);
      return copy.map((s, i) => ({ ...s, sceneIndex: i }));
    });
    setActiveSceneIdx(nextIdx);
  };

  const removeScene = (index: number) => {
    if (scenes.length <= 1) {
      notify('error', 'At least one clip must remain in the timeline.');
      return;
    }
    setScenes((prev) =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, sceneIndex: i }))
    );
    setActiveSceneIdx((prev) => Math.max(0, Math.min(prev, scenes.length - 2)));
  };

  const totalTimelineSec = scenes.reduce(
    (acc, s) => acc + Math.max(1, (s.trimEndSec || s.durationSec) - (s.trimStartSec || 0)),
    0
  );

  const handleExport = async () => {
    if (!project || scenes.length === 0) return;
    if (!copyrightAck) {
      notify('error', 'Please acknowledge the Copyright & Monetization notice first.');
      return;
    }
    setExporting(true);
    try {
      const res = await apiFetch<{
        outputUrl: string;
        durationSec: number;
        isDemo: boolean;
      }>('/api/studio/export', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          aspectRatio,
          quality,
          musicBedId,
          voiceVolume,
          musicVolume,
          includeSubtitles,
          copyrightAcknowledged: true,
          scenes: scenes.map((s, idx) => ({
            id: s.id,
            sceneIndex: idx,
            narrationText: s.narrationText,
            trimStartSec: s.trimStartSec || 0,
            trimEndSec: s.trimEndSec || s.durationSec,
            transition: s.transition || 'fade',
            audioUrl: s.audioUrl || null,
          })),
        }),
      });
      setExportedResult(res);
      setShowExportModal(false);
      notify('success', `MP4 exported (${formatDuration(res.durationSec)}). Ready for download.`);
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Studio Top Bar */}
      <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="ed-project" className="text-xs font-medium text-slate-400">
            Active Project
          </label>
          <select
            id="ed-project"
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              void loadProjectDetail(e.target.value);
            }}
            className="px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white min-w-[220px]"
          >
            {projects.length === 0 ? (
              <option value="">No projects available</option>
            ) : (
              projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.aspectRatio})
                </option>
              ))
            )}
          </select>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            Timeline: {formatDuration(totalTimelineSec)} · {scenes.length} clips
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {exportedResult && (
            <a
              href={`${exportedResult.outputUrl}?download=1`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Latest MP4</span>
            </a>
          )}
          <button
            type="button"
            disabled={scenes.length === 0}
            onClick={() => {
              setCopyrightAck(false);
              setShowExportModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-[#090A0D] text-xs font-semibold whitespace-nowrap"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Merge & Export MP4</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex items-center justify-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading timeline workspace...</span>
        </div>
      ) : scenes.length === 0 ? (
        <div className="rounded-xl bg-[#11141C] border border-dashed border-white/[0.12] py-20 px-6 text-center space-y-4">
          <Film className="w-10 h-10 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-display font-semibold text-white">
              No Rendered Video Clips in This Project
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Generate a multi-scene video first (via Google Veo, Runway, or Demo Mode), then open
              it here to reorder clips, trim timing, mix audio, and burn subtitles.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('text-to-video')}
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
          >
            Open AI Video Generator
          </button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Preview Monitor + Timeline Strip */}
          <div className="lg:col-span-8 space-y-5">
            <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-200">
                  Previewing Scene {activeSceneIdx + 1}: {activeScene?.title}
                </span>
                <span className="font-mono tabular-nums text-slate-400">
                  {aspectRatio} · {quality} {activeScene?.isDemo ? '· DEMO MODE CLIP' : ''}
                </span>
              </div>

              <div className="relative rounded-xl overflow-hidden bg-black border border-white/[0.1] flex items-center justify-center min-h-[300px]">
                {activeScene?.videoUrl && (
                  <video
                    key={activeScene.videoUrl}
                    src={activeScene.videoUrl}
                    controls
                    className={`max-h-[420px] ${
                      aspectRatio === '9:16' ? 'aspect-[9/16] h-[420px]' : 'w-full aspect-video'
                    }`}
                  />
                )}
                {includeSubtitles && activeScene?.narrationText && (
                  <div className="pointer-events-none absolute bottom-12 inset-x-6 flex justify-center">
                    <div className="px-3.5 py-1.5 rounded bg-black/80 text-white text-xs sm:text-sm text-center max-w-xl">
                      {activeScene.narrationText}
                    </div>
                  </div>
                )}
              </div>

              {exportedResult && (
                <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="text-emerald-200">
                    <strong>Final Export Ready:</strong> {formatDuration(exportedResult.durationSec)}
                    {exportedResult.isDemo ? ' (Watermarked DEMO MODE)' : ''}
                  </div>
                  <a
                    href={`${exportedResult.outputUrl}?download=1`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-[#090A0D] font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download MP4</span>
                  </a>
                </div>
              )}
            </div>

            {/* Scene Track Timeline */}
            <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-semibold text-white">
                  Scene Track & Rearrangement
                </h3>
                <span className="text-xs text-slate-400">Click a scene to trim or edit captions</span>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2">
                {scenes.map((sc, idx) => {
                  const selected = idx === activeSceneIdx;
                  const clippedDur = Math.max(
                    1,
                    (sc.trimEndSec || sc.durationSec) - (sc.trimStartSec || 0)
                  );
                  return (
                    <div
                      key={sc.id}
                      onClick={() => setActiveSceneIdx(idx)}
                      className={`w-52 shrink-0 p-3.5 rounded-xl border cursor-pointer transition-colors space-y-2.5 ${
                        selected
                          ? 'bg-amber-500/12 border-amber-500/50'
                          : 'bg-[#0B0D12] border-white/[0.08] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono tabular-nums text-amber-400 font-semibold">
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="font-mono tabular-nums text-slate-400">
                          {clippedDur.toFixed(1)}s · {sc.transition}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-white truncate">{sc.title}</div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        {sc.narrationText || sc.visualPrompt}
                      </p>
                      <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.07]">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveScene(idx, -1);
                            }}
                            title="Move earlier"
                            className="p-1 rounded hover:bg-white/[0.1] disabled:opacity-30 text-slate-300"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === scenes.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              moveScene(idx, 1);
                            }}
                            title="Move later"
                            className="p-1 rounded hover:bg-white/[0.1] disabled:opacity-30 text-slate-300"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeScene(idx);
                          }}
                          title="Remove scene from timeline"
                          className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Inspector: Clip Trim, Subtitles, Transitions & Master Audio */}
          <div className="lg:col-span-4 space-y-5">
            {activeScene && (
              <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-4">
                <h3 className="text-sm font-display font-semibold text-white">
                  Scene #{activeSceneIdx + 1} Inspector
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Trim Start ({(activeScene.trimStartSec || 0).toFixed(1)}s)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, activeScene.durationSec - 1)}
                      step={0.5}
                      value={activeScene.trimStartSec || 0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateActiveScene({
                          trimStartSec: val,
                          trimEndSec: Math.max(val + 1, activeScene.trimEndSec || activeScene.durationSec),
                        });
                      }}
                      className="w-full accent-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Trim End ({(activeScene.trimEndSec || activeScene.durationSec).toFixed(1)}s)
                    </label>
                    <input
                      type="range"
                      min={Math.min(activeScene.durationSec, (activeScene.trimStartSec || 0) + 1)}
                      max={activeScene.durationSec}
                      step={0.5}
                      value={activeScene.trimEndSec || activeScene.durationSec}
                      onChange={(e) => updateActiveScene({ trimEndSec: parseFloat(e.target.value) })}
                      className="w-full accent-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Transition Style</label>
                  <select
                    value={activeScene.transition || 'fade'}
                    onChange={(e) => updateActiveScene({ transition: e.target.value as TransitionType })}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                  >
                    <option value="fade">Smooth Fade In / Out</option>
                    <option value="dissolve">Soft Dissolve</option>
                    <option value="cut">Hard Cut</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Subtitle / Narration Caption
                  </label>
                  <textarea
                    rows={3}
                    value={activeScene.narrationText}
                    onChange={(e) => updateActiveScene({ narrationText: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Attached Voiceover Track
                  </label>
                  <select
                    value={activeScene.audioUrl || ''}
                    onChange={(e) => updateActiveScene({ audioUrl: e.target.value || null })}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                  >
                    <option value="">No Voiceover Track</option>
                    {activeScene.audioUrl &&
                      !audioAssets.some((a) => a.url === activeScene.audioUrl) && (
                        <option value={activeScene.audioUrl}>Generated Scene Voiceover</option>
                      )}
                    {audioAssets.map((a) => (
                      <option key={a.id} value={a.url}>
                        {a.prompt?.slice(0, 42) || a.filename}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Master Output & Audio Mix */}
            <div className="rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-display font-semibold text-white">
                <Music className="w-4 h-4 text-amber-400" />
                <span>Audio Mix & Output Format</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Aspect Ratio</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                  >
                    <option value="16:9">16:9 Horizontal</option>
                    <option value="9:16">9:16 Vertical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Export Quality</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as '720p' | '1080p')}
                    className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                  >
                    <option value="720p">720p HD</option>
                    <option value="1080p">1080p Full HD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Background Music (CC0 Licensed)
                </label>
                <select
                  value={musicBedId}
                  onChange={(e) => setMusicBedId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#090B10] border border-white/[0.12] text-xs text-white"
                >
                  {BUILTIN_MUSIC_BEDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Voiceover Volume</span>
                    <span className="font-mono tabular-nums text-white">
                      {Math.round(voiceVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={voiceVolume}
                    onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Music Volume</span>
                    <span className="font-mono tabular-nums text-white">
                      {Math.round(musicVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={includeSubtitles}
                  onChange={(e) => setIncludeSubtitles(e.target.checked)}
                  className="accent-amber-500"
                />
                <span>Burn SRT Subtitles into Final MP4</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Export Copyright & Monetization Risk Warning Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-2xl bg-[#13161E] border border-white/[0.12] p-6 space-y-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-display font-bold text-white">
                  Pre-Export Copyright & Monetization Check
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Review originality safeguards before FFmpeg renders your final MP4.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0B0D12] border border-white/[0.08] space-y-2 text-xs text-slate-300 leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Creator Compliance Checklist</span>
              </div>
              <p>{MONETIZATION_DISCLAIMER}</p>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-200 cursor-pointer leading-relaxed">
              <input
                type="checkbox"
                checked={copyrightAck}
                onChange={(e) => setCopyrightAck(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <span>
                I confirm my script, captions, and any uploaded assets are original or properly
                licensed, and I understand YouTube independently reviews monetization eligibility.
              </span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={exporting}
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exporting || !copyrightAck}
                onClick={() => void handleExport()}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-[#090A0D] text-xs font-semibold"
              >
                {exporting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{exporting ? 'Rendering MP4 via FFmpeg...' : 'Render & Export MP4'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
