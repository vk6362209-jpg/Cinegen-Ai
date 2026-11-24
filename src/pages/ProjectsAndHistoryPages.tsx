import React, { useCallback, useEffect, useState } from 'react';
import {
  Download,
  FolderOpen,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ApiError, apiFetch, formatDateTime, formatDuration } from '../lib/api.ts';
import type { ProjectRecord, VideoJobRecord } from '../types/cinegen.ts';

export function ProjectsPage() {
  const { navigate, notify } = useApp();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ projects: ProjectRecord[] }>('/api/projects');
      setProjects(res.projects);
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      await apiFetch(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setEditingId(null);
      notify('success', 'Project updated.');
      void loadProjects();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Update failed.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
      notify('success', 'Project deleted.');
      void loadProjects();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Delete failed.');
    }
  };

  const filtered = projects.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.description.toLowerCase().includes(query.toLowerCase());
    const matchesMode = modeFilter === 'all' || p.mode === modeFilter;
    return matchesSearch && matchesMode;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects by title or prompt..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#11141C] border border-white/[0.1] text-sm text-white placeholder:text-slate-500"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#11141C] border border-white/[0.08]">
          {[
            { id: 'all', label: 'All' },
            { id: 'text-to-video', label: 'Text-to-Video' },
            { id: 'image-to-video', label: 'Image-to-Video' },
            { id: 'script', label: 'Scripts' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setModeFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                modeFilter === tab.id
                  ? 'bg-amber-500 text-[#090A0D] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex items-center justify-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading projects...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-[#11141C] border border-dashed border-white/[0.12] py-20 text-center space-y-3">
          <p className="text-sm text-slate-400">No matching projects found.</p>
          <button
            type="button"
            onClick={() => navigate('text-to-video')}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-xs font-semibold"
          >
            Start New Video Project
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="rounded-xl bg-[#11141C] border border-white/[0.08] overflow-hidden flex flex-col justify-between"
            >
              <div className="p-5 space-y-3">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>
                    {p.mode} · {p.aspectRatio}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatDuration(p.finalDurationSec || p.targetDurationSec)}
                  </span>
                </div>

                {editingId === p.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 rounded bg-[#090B10] border border-white/[0.15] text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleRename(p.id)}
                      className="px-2.5 py-1.5 rounded bg-amber-500 text-[#090A0D] text-xs font-semibold"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <h3 className="text-base font-display font-semibold text-white line-clamp-1">
                    {p.title}
                  </h3>
                )}

                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                  {p.description || 'No description'}
                </p>

                {p.finalVideoUrl && (
                  <video
                    src={p.finalVideoUrl}
                    controls
                    className="w-full rounded-lg bg-black max-h-40 border border-white/[0.08]"
                  />
                )}

                <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                  <span>
                    Status:{' '}
                    <span
                      className={
                        p.status === 'completed'
                          ? 'text-emerald-400'
                          : p.status === 'failed'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                      }
                    >
                      {p.status}
                    </span>
                    {p.isDemo ? ' · DEMO MODE' : ''}
                  </span>
                  <span>{formatDateTime(p.updatedAt)}</span>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-white/[0.07] bg-[#0D1017] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('video-editor', { projectId: p.id })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Studio Editor</span>
                  </button>
                  {p.finalVideoUrl && (
                    <a
                      href={`${p.finalVideoUrl}?download=1`}
                      className="p-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200"
                      title="Download MP4"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(p.id);
                      setEditTitle(p.title);
                    }}
                    title="Rename project"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(p.id)}
                    title="Delete project"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/[0.06]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HistoryPage() {
  const { navigate, notify, refreshUser } = useApp();
  const [jobs, setJobs] = useState<VideoJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<VideoJobRecord | null>(null);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ jobs: VideoJobRecord[] }>('/api/jobs');
      setJobs(res.jobs);
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Failed to load video history.');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleRetry = async (jobId: string, provider?: 'demo-mode') => {
    try {
      await apiFetch(`/api/jobs/${jobId}/retry`, {
        method: 'POST',
        body: JSON.stringify(provider ? { provider } : {}),
      });
      notify('info', 'Retry job queued.');
      void loadJobs();
      void refreshUser();
    } catch (err) {
      notify('error', err instanceof ApiError ? err.message : 'Retry failed.');
    }
  };

  const filtered = jobs.filter((j) => statusFilter === 'all' || j.status === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[#11141C] border border-white/[0.08]">
          {['all', 'completed', 'failed'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                statusFilter === st
                  ? 'bg-amber-500 text-[#090A0D] font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void loadJobs()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#11141C] border border-white/[0.1] hover:border-white/25 text-xs font-medium text-slate-200"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Queue</span>
        </button>
      </div>

      <div className="rounded-xl bg-[#11141C] border border-white/[0.08] overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading generation history...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-slate-400">No generation jobs in this view.</p>
            <button
              type="button"
              onClick={() => navigate('text-to-video')}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#090A0D] text-xs font-semibold"
            >
              Generate Video
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400 bg-[#0D1017]">
                  <th className="py-3 px-4 font-medium">Prompt</th>
                  <th className="py-3 px-4 font-medium">Provider / Mode</th>
                  <th className="py-3 px-4 font-medium text-right">Target / Actual</th>
                  <th className="py-3 px-4 font-medium text-right">Credits</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {filtered.map((job) => (
                  <tr key={job.id} className="hover:bg-white/[0.02]">
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-medium text-white truncate">{job.prompt}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {formatDateTime(job.createdAt)} · {job.scenes.length} scenes
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <div>{job.isDemo ? 'DEMO MODE Preview' : job.provider}</div>
                      <div className="text-[11px] text-slate-500">{job.type}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {formatDuration(job.targetDurationSec)} /{' '}
                      {job.actualDurationSec ? formatDuration(job.actualDurationSec) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-400">
                      {job.creditsCost}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={
                          job.status === 'completed'
                            ? 'text-emerald-400 font-medium'
                            : job.status === 'failed'
                              ? 'text-rose-400 font-medium'
                              : 'text-amber-400 font-medium'
                        }
                      >
                        {job.status === 'completed'
                          ? 'Completed'
                          : job.status === 'failed'
                            ? 'Failed'
                            : `${job.status} (${job.progress}%)`}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedJob(job)}
                          className="text-slate-300 hover:text-white underline"
                        >
                          Inspect
                        </button>
                        {job.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => void handleRetry(job.id, 'demo-mode')}
                            className="text-amber-400 hover:text-amber-300 font-medium"
                          >
                            Retry Demo
                          </button>
                        )}
                        {job.outputUrl && (
                          <a
                            href={`${job.outputUrl}?download=1`}
                            className="text-amber-400 hover:text-amber-300 font-medium"
                          >
                            MP4
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Job Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-2xl w-full max-h-[88vh] overflow-y-auto rounded-2xl bg-[#13161E] border border-white/[0.12] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-display font-bold text-white">
                  Generation Job Details ({selectedJob.id})
                </h3>
                <p className="text-xs text-slate-400 mt-1">{selectedJob.prompt}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {selectedJob.errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/35 text-xs text-rose-200">
                {selectedJob.errorMessage}
              </div>
            )}

            {selectedJob.outputUrl && (
              <video
                src={selectedJob.outputUrl}
                controls
                className="w-full rounded-xl bg-black max-h-72 border border-white/[0.08]"
              />
            )}

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                Scenes ({selectedJob.scenes.length})
              </div>
              {selectedJob.scenes.map((sc) => (
                <div
                  key={sc.id}
                  className="p-3 rounded-lg bg-[#0B0D12] border border-white/[0.07] text-xs space-y-1"
                >
                  <div className="flex justify-between">
                    <span className="font-semibold text-white">
                      {sc.sceneIndex + 1}. {sc.title}
                    </span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {Math.round(sc.durationSec)}s · {sc.status}
                    </span>
                  </div>
                  <p className="text-slate-400">{sc.visualPrompt}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
