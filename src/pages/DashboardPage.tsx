import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Clapperboard,
  Download,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Mic,
  Pencil,
  Scissors,
  Trash2,
  Video,
  Youtube,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatBytes, formatDateTime, formatDuration } from '../lib/api.ts';
import type { ProjectRecord, VideoJobRecord } from '../types/cinegen.ts';

interface DashboardSummary {
  stats: {
    totalProjects: number;
    totalVideos: number;
    activeJobs: number;
    credits: number;
    plan: string;
    storageUsedBytes: number;
    storageQuotaBytes: number;
  };
  recentJobs: VideoJobRecord[];
  recentProjects: ProjectRecord[];
}

export function DashboardPage() {
  const { navigate, user, notify, refreshUser } = useApp();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const loadSummary = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch<DashboardSummary>('/api/dashboard/summary');
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void refreshUser();
  }, [loadSummary, refreshUser]);

  const handleRename = async (id: string) => {
    if (!renameText.trim()) return;
    try {
      await apiFetch(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: renameText.trim() }),
      });
      setRenamingId(null);
      notify('success', 'Project renamed.');
      void loadSummary();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Rename failed.');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      notify('success', 'Project deleted.');
      void loadSummary();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Delete failed.');
    }
  };

  const storagePct = data
    ? Math.min(100, Math.round((data.stats.storageUsedBytes / Math.max(1, data.stats.storageQuotaBytes)) * 100))
    : 0;

  return (
    <div className="space-y-8">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">
            Welcome back, {user?.name}
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Launch a multi-scene video pipeline, generate studio voiceovers, or continue editing
            your projects.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate('script-writer')}
            className="px-4 py-2 rounded-lg border border-white/[0.12] hover:border-white/25 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            Write Script
          </button>
          <button
            type="button"
            onClick={() => navigate('text-to-video')}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold transition-colors whitespace-nowrap"
          >
            Create AI Video
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/35 text-sm text-rose-200 flex items-center justify-between gap-4">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-medium text-white shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-5 rounded-xl bg-[#11141C] border border-white/[0.08]">
          <div className="text-xs text-slate-400">Generated Videos</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-white mt-2">
            {loading ? '—' : data?.stats.totalVideos ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">Completed MP4 renders</div>
        </div>
        <div className="p-5 rounded-xl bg-[#11141C] border border-white/[0.08]">
          <div className="text-xs text-slate-400">Total Projects</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-white mt-2">
            {loading ? '—' : data?.stats.totalProjects ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-1">Scripts & timelines</div>
        </div>
        <div className="p-5 rounded-xl bg-[#11141C] border border-white/[0.08]">
          <div className="text-xs text-slate-400">Remaining Credits</div>
          <div className="text-2xl font-display font-bold font-mono tabular-nums text-amber-400 mt-2">
            {loading ? '—' : (data?.stats.credits ?? user?.credits ?? 0).toLocaleString()}
          </div>
          <button
            type="button"
            onClick={() => navigate('credits')}
            className="text-xs text-amber-400/90 hover:text-amber-300 mt-1"
          >
            View ledger →
          </button>
        </div>
        <div className="p-5 rounded-xl bg-[#11141C] border border-white/[0.08]">
          <div className="text-xs text-slate-400">Subscription Plan</div>
          <div className="text-2xl font-display font-bold text-white capitalize mt-2">
            {user?.plan || 'free'}
          </div>
          <button
            type="button"
            onClick={() => navigate('plans')}
            className="text-xs text-slate-400 hover:text-white mt-1"
          >
            Manage plan →
          </button>
        </div>
        <div className="p-5 rounded-xl bg-[#11141C] border border-white/[0.08] col-span-2 lg:col-span-1">
          <div className="text-xs text-slate-400">Storage Used</div>
          <div className="text-lg font-display font-bold font-mono tabular-nums text-white mt-2">
            {formatBytes(data?.stats.storageUsedBytes ?? user?.storageUsedBytes ?? 0)}
          </div>
          <div className="w-full h-1.5 rounded-full bg-white/[0.08] mt-2 overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${storagePct}%` }} />
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-500 mt-1">
            {storagePct}% of {formatBytes(data?.stats.storageQuotaBytes ?? user?.storageQuotaBytes ?? 0)}
          </div>
        </div>
      </div>

      {/* Quick Generation Launchpad */}
      <div className="space-y-3">
        <h3 className="text-base font-display font-semibold text-white">Quick Creation Tools</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              id: 'text-to-video' as const,
              title: 'Text to Video Engine',
              desc: 'Generate 10s–5m multi-scene videos with Veo, Runway, or Demo Mode.',
              icon: Video,
            },
            {
              id: 'image-to-video' as const,
              title: 'Image to Video',
              desc: 'Upload a reference frame and animate it with custom camera motion.',
              icon: Clapperboard,
            },
            {
              id: 'script-writer' as const,
              title: 'AI Script Writer',
              desc: 'Build scene-by-scene scripts in English, Telugu, Hindi & more.',
              icon: FileText,
            },
            {
              id: 'voice-studio' as const,
              title: 'AI Voice Studio',
              desc: 'Generate single or dual-speaker studio WAV voiceovers.',
              icon: Mic,
            },
            {
              id: 'video-editor' as const,
              title: 'Video Editing Studio',
              desc: 'Reorder scenes, trim clips, mix audio, burn subtitles & export MP4.',
              icon: Scissors,
            },
            {
              id: 'youtube-creator' as const,
              title: 'YouTube Creator Mode',
              desc: 'Shorts & Long-Form titles, SEO descriptions, hashtags & copyright check.',
              icon: Youtube,
            },
          ].map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => navigate(tool.id)}
                className="group p-5 rounded-xl bg-[#11141C] hover:bg-[#151924] border border-white/[0.08] hover:border-amber-500/35 text-left transition-colors flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-display font-semibold text-white group-hover:text-amber-400 transition-colors">
                      {tool.title}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{tool.desc}</p>
                  </div>
                  <Icon className="w-5 h-5 text-amber-400 shrink-0" />
                </div>
                <div className="text-xs font-medium text-slate-300 inline-flex items-center gap-1">
                  <span>Open tool</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Generations & Recent Projects */}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-display font-semibold text-white">Recent Generations</h3>
            <button
              type="button"
              onClick={() => navigate('history')}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium"
            >
              View all history
            </button>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center text-slate-400 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading generation queue...</span>
            </div>
          ) : !data?.recentJobs.length ? (
            <div className="py-10 text-center space-y-3 border border-dashed border-white/[0.1] rounded-lg">
              <p className="text-sm text-slate-400">No video generations yet.</p>
              <button
                type="button"
                onClick={() => navigate('text-to-video')}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
              >
                Generate First Video
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {data.recentJobs.map((job) => (
                <div key={job.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{job.prompt}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span className="font-mono tabular-nums">
                        {formatDuration(job.actualDurationSec || job.targetDurationSec)}
                      </span>
                      <span>·</span>
                      <span>{job.scenes.length} scenes</span>
                      <span>·</span>
                      <span>{job.isDemo ? 'DEMO MODE Preview' : job.provider}</span>
                      <span>·</span>
                      <span
                        className={
                          job.status === 'completed'
                            ? 'text-emerald-400'
                            : job.status === 'failed'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                        }
                      >
                        {job.status === 'completed'
                          ? 'Completed'
                          : job.status === 'failed'
                            ? 'Failed'
                            : `${job.status} (${job.progress}%)`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {job.outputUrl && (
                      <a
                        href={`${job.outputUrl}?download=1`}
                        className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200"
                        title="Download MP4"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate('video-editor', { projectId: job.projectId })}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white whitespace-nowrap"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 rounded-xl bg-[#11141C] border border-white/[0.08] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-display font-semibold text-white">Recent Projects</h3>
            <button
              type="button"
              onClick={() => navigate('projects')}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium"
            >
              Manage all
            </button>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center text-slate-400 gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading projects...</span>
            </div>
          ) : !data?.recentProjects.length ? (
            <div className="py-10 text-center space-y-3 border border-dashed border-white/[0.1] rounded-lg">
              <p className="text-sm text-slate-400">Your saved projects will appear here.</p>
              <button
                type="button"
                onClick={() => navigate('text-to-image')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Create Concept Frame</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.07]">
              {data.recentProjects.map((prj) => (
                <div key={prj.id} className="py-3.5 space-y-2">
                  {renamingId === prj.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#090B10] border border-white/[0.15] text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => void handleRename(prj.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500 text-[#090A0D] text-xs font-semibold"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{prj.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {prj.aspectRatio} · {formatDuration(prj.finalDurationSec || prj.targetDurationSec)} ·{' '}
                          {formatDateTime(prj.updatedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => navigate('video-editor', { projectId: prj.id })}
                          title="Open in Studio"
                          className="p-1.5 rounded-lg text-slate-300 hover:text-amber-400 hover:bg-white/[0.06]"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(prj.id);
                            setRenameText(prj.title);
                          }}
                          title="Rename"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProject(prj.id)}
                          title="Delete"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/[0.06]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
