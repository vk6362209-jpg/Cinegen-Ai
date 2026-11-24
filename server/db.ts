import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PLAN_DEFINITIONS, PlanTier, UserPublic, UserRole } from '../src/types/cinegen.ts';

const baseDataDir = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.resolve(process.cwd(), 'data');

export const STORAGE_DIR = path.resolve(baseDataDir, 'storage');
const DB_PATH = path.resolve(baseDataDir, 'cinegen.db');

fs.mkdirSync(STORAGE_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    plan TEXT NOT NULL DEFAULT 'free',
    credits INTEGER NOT NULL DEFAULT 100,
    storage_used_bytes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'text-to-video',
    aspect_ratio TEXT NOT NULL DEFAULT '16:9',
    target_duration_sec INTEGER NOT NULL DEFAULT 30,
    style TEXT NOT NULL DEFAULT 'Cinematic',
    status TEXT NOT NULL DEFAULT 'draft',
    script_json TEXT,
    youtube_meta_json TEXT,
    final_video_url TEXT,
    final_duration_sec REAL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS video_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text-to-video',
    provider TEXT NOT NULL DEFAULT 'google-veo',
    prompt TEXT NOT NULL,
    settings_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    target_duration_sec INTEGER NOT NULL DEFAULT 30,
    actual_duration_sec REAL NOT NULL DEFAULT 0,
    is_demo INTEGER NOT NULL DEFAULT 0,
    output_url TEXT,
    error_message TEXT,
    credits_cost INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    scene_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    visual_prompt TEXT NOT NULL,
    narration_text TEXT NOT NULL DEFAULT '',
    camera_movement TEXT NOT NULL DEFAULT 'Slow Cinematic Dolly In',
    lighting TEXT NOT NULL DEFAULT 'Golden Hour Natural',
    duration_sec REAL NOT NULL DEFAULT 10,
    trim_start_sec REAL NOT NULL DEFAULT 0,
    trim_end_sec REAL NOT NULL DEFAULT 10,
    transition TEXT NOT NULL DEFAULT 'fade',
    status TEXT NOT NULL DEFAULT 'pending',
    provider_task_id TEXT,
    video_url TEXT,
    audio_url TEXT,
    thumbnail_url TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (job_id) REFERENCES video_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT,
    kind TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    prompt TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT 'local',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS credit_transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    reference_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS api_usage_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT NOT NULL,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    error_detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
  CREATE INDEX IF NOT EXISTS idx_jobs_user ON video_jobs(user_id);
  CREATE INDEX IF NOT EXISTS idx_scenes_job ON scenes(job_id);
  CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);
  CREATE INDEX IF NOT EXISTS idx_credits_user ON credit_transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_assets_user ON media_assets(user_id);
`);

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function resolveSafeStoragePath(filename: string): string {
  const clean = path.basename(filename);
  if (!/^[a-zA-Z0-9._-]+$/.test(clean)) {
    throw new Error('Invalid storage filename');
  }
  const resolved = path.resolve(STORAGE_DIR, clean);
  if (!resolved.startsWith(STORAGE_DIR + path.sep)) {
    throw new Error('Path traversal rejected');
  }
  return resolved;
}

export function getPlanQuotaBytes(plan: string): number {
  const found = PLAN_DEFINITIONS.find((p) => p.id === plan);
  return found ? found.storageQuotaBytes : PLAN_DEFINITIONS[0].storageQuotaBytes;
}

export interface DbUserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  plan: PlanTier;
  credits: number;
  storage_used_bytes: number;
  created_at: string;
}

export function toUserPublic(row: DbUserRow): UserPublic {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    plan: row.plan,
    credits: row.credits,
    storageUsedBytes: row.storage_used_bytes,
    storageQuotaBytes: getPlanQuotaBytes(row.plan),
    createdAt: row.created_at,
  };
}

export function adjustCreditsAtomic(params: {
  userId: string;
  delta: number;
  type: 'grant' | 'deduction' | 'refund' | 'subscription' | 'admin_adjustment';
  description: string;
  referenceId?: string;
}): { credits: number; transactionId: string } {
  const tx = db.transaction(() => {
    const user = db.prepare('SELECT credits FROM users WHERE id = ?').get(params.userId) as
      | { credits: number }
      | undefined;
    if (!user) {
      throw new Error('User not found');
    }
    const nextBalance = user.credits + params.delta;
    if (nextBalance < 0) {
      throw new Error('Insufficient credits for this operation');
    }
    db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(nextBalance, params.userId);
    const txId = createId('ctx');
    db.prepare(
      `INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description, reference_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(txId, params.userId, params.delta, nextBalance, params.type, params.description, params.referenceId ?? null);
    return { credits: nextBalance, transactionId: txId };
  });
  return tx();
}

export function recordApiUsage(params: {
  userId?: string | null;
  provider: string;
  model: string;
  operation: string;
  status: 'success' | 'error' | 'demo_fallback';
  latencyMs: number;
  errorDetail?: string | null;
}): void {
  db.prepare(
    `INSERT INTO api_usage_logs (id, user_id, provider, model, operation, status, latency_ms, error_detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    createId('log'),
    params.userId ?? null,
    params.provider,
    params.model,
    params.operation,
    params.status,
    Math.max(0, Math.round(params.latencyMs)),
    params.errorDetail ? params.errorDetail.slice(0, 600) : null
  );
}

export function recordMediaAsset(params: {
  userId: string;
  projectId?: string | null;
  kind: 'video' | 'image' | 'audio' | 'upload';
  filename: string;
  mimeType: string;
  sizeBytes: number;
  prompt?: string;
  provider: string;
  isDemo: boolean;
}): { id: string; url: string } {
  const id = createId('ast');
  db.prepare(
    `INSERT INTO media_assets (id, user_id, project_id, kind, filename, mime_type, size_bytes, prompt, provider, is_demo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.userId,
    params.projectId ?? null,
    params.kind,
    params.filename,
    params.mimeType,
    params.sizeBytes,
    params.prompt ?? '',
    params.provider,
    params.isDemo ? 1 : 0
  );
  db.prepare('UPDATE users SET storage_used_bytes = storage_used_bytes + ? WHERE id = ?').run(
    params.sizeBytes,
    params.userId
  );
  return { id, url: `/api/media/${params.filename}` };
}
