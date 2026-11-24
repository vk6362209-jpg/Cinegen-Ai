export type UserRole = 'user' | 'admin';
export type PlanTier = 'free' | 'basic' | 'pro' | 'premium';
export type VideoProviderId = 'google-veo' | 'runway' | 'demo-mode';
export type AspectRatio = '16:9' | '9:16';
export type VideoQuality = '720p' | '1080p' | '4k';

export type VisualStyle =
  | 'Cinematic'
  | 'Realistic'
  | 'Animation'
  | 'Cartoon'
  | 'Documentary'
  | 'Horror'
  | 'Fantasy'
  | 'Educational'
  | 'Motivational'
  | 'Custom';

export type ScriptFormat =
  | 'YouTube Shorts'
  | 'YouTube Long-Form'
  | 'Instagram Reels'
  | 'Facebook Video'
  | 'Horror Story'
  | 'Mythological Story'
  | 'Documentary'
  | 'Educational'
  | 'Motivational'
  | 'Facts Video'
  | 'Cinematic Storytelling';

export type TransitionType = 'cut' | 'fade' | 'dissolve';

export type JobStatus =
  | 'queued'
  | 'scripting'
  | 'generating_scenes'
  | 'generating_audio'
  | 'assembling'
  | 'completed'
  | 'failed';

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: PlanTier;
  credits: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  createdAt: string;
}

export interface SceneItem {
  id: string;
  jobId: string;
  projectId: string;
  sceneIndex: number;
  title: string;
  visualPrompt: string;
  narrationText: string;
  cameraMovement: string;
  lighting: string;
  durationSec: number;
  trimStartSec: number;
  trimEndSec: number;
  transition: TransitionType;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  providerTaskId?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
  thumbnailUrl?: string | null;
  isDemo: boolean;
  errorMessage?: string | null;
}

export interface ScriptSceneDraft {
  sceneNumber: number;
  title: string;
  durationSec: number;
  narration: string;
  visualPrompt: string;
  cameraMovement: string;
  lighting: string;
  soundCue: string;
}

export interface GeneratedScript {
  title: string;
  logline: string;
  visualConsistencyBible: string;
  format: string;
  language: string;
  tone: string;
  totalDurationSec: number;
  scenes: ScriptSceneDraft[];
  copyrightSafetyNotes: string[];
  flaggedTerms: string[];
}

export interface YouTubeCreatorPackage {
  titles: string[];
  description: string;
  hashtags: string[];
  tags: string[];
  thumbnailPrompt: string;
  hookSuggestion: string;
  originalityScoreNotes: string[];
  copyrightRisks: string[];
  monetizationDisclaimer: string;
}

export interface ProjectRecord {
  id: string;
  userId: string;
  title: string;
  description: string;
  mode: string;
  aspectRatio: AspectRatio;
  targetDurationSec: number;
  style: string;
  status: string;
  scriptJson?: GeneratedScript | null;
  youtubeMetaJson?: YouTubeCreatorPackage | null;
  finalVideoUrl?: string | null;
  finalDurationSec?: number | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  scenes?: SceneItem[];
}

export interface VideoJobRecord {
  id: string;
  userId: string;
  projectId: string;
  type: 'text-to-video' | 'image-to-video';
  provider: VideoProviderId;
  prompt: string;
  settings: Record<string, unknown>;
  status: JobStatus;
  progress: number;
  targetDurationSec: number;
  actualDurationSec: number;
  isDemo: boolean;
  outputUrl?: string | null;
  errorMessage?: string | null;
  creditsCost: number;
  createdAt: string;
  updatedAt: string;
  scenes: SceneItem[];
}

export interface MediaAssetRecord {
  id: string;
  userId: string;
  projectId?: string | null;
  kind: 'video' | 'image' | 'audio' | 'upload';
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  prompt: string;
  provider: string;
  isDemo: boolean;
  createdAt: string;
}

export interface CreditTransactionRecord {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  type: 'grant' | 'deduction' | 'refund' | 'subscription' | 'admin_adjustment';
  description: string;
  referenceId?: string | null;
  createdAt: string;
}

export interface ApiUsageLogRecord {
  id: string;
  userId?: string | null;
  provider: string;
  model: string;
  operation: string;
  status: 'success' | 'error' | 'demo_fallback';
  latencyMs: number;
  errorDetail?: string | null;
  createdAt: string;
}

export interface ProviderHealthStatus {
  id: VideoProviderId | 'gemini-text' | 'gemini-tts' | 'gemini-image' | 'lyria-music' | 'ffmpeg' | 'stripe';
  name: string;
  configured: boolean;
  requiresPaidKey?: boolean;
  envVar: string;
  capabilities: string[];
  maxClipDurationSec?: number;
  supports4k?: boolean;
  note: string;
}

export interface PlanDefinition {
  id: PlanTier;
  name: string;
  audience: string;
  monthlyPriceUsd: number;
  monthlyCredits: number;
  maxDurationSec: number;
  maxQuality: VideoQuality;
  storageQuotaBytes: number;
  storageLabel: string;
  features: string[];
}

export const DURATION_OPTIONS = [
  { seconds: 10, label: '10 seconds', shortLabel: '10s', defaultScenes: 1 },
  { seconds: 20, label: '20 seconds', shortLabel: '20s', defaultScenes: 2 },
  { seconds: 30, label: '30 seconds', shortLabel: '30s', defaultScenes: 3 },
  { seconds: 60, label: '1 minute', shortLabel: '1m', defaultScenes: 6 },
  { seconds: 120, label: '2 minutes', shortLabel: '2m', defaultScenes: 10 },
  { seconds: 180, label: '3 minutes', shortLabel: '3m', defaultScenes: 12 },
  { seconds: 240, label: '4 minutes', shortLabel: '4m', defaultScenes: 16 },
  { seconds: 300, label: '5 minutes', shortLabel: '5m', defaultScenes: 20 },
] as const;

export const VISUAL_STYLES: VisualStyle[] = [
  'Cinematic',
  'Realistic',
  'Animation',
  'Cartoon',
  'Documentary',
  'Horror',
  'Fantasy',
  'Educational',
  'Motivational',
  'Custom',
];

export const CAMERA_MOVEMENTS = [
  'Slow Cinematic Dolly In',
  'Sweeping Aerial Crane Shot',
  'Steady Tracking Follow',
  'Gentle Handheld Documentary',
  'Wide Establishing Pan',
  'Orbiting Subject Shot',
  'Locked Tripod Frame',
  'Dynamic Push-In Reveal',
] as const;

export const LIGHTING_STYLES = [
  'Golden Hour Natural',
  'Blue Hour Twilight',
  'High-Contrast Chiaroscuro',
  'Soft Diffused Studio',
  'Warm Tungsten Practical',
  'Overcast Atmospheric Fog',
  'Moonlit Noir Shadows',
  'Bright Documentary Daylight',
] as const;

export const VOICE_PRESETS = [
  { id: 'Kore', label: 'Kore — Clear Narrator (Female)', gender: 'Female', style: 'Clear, authoritative documentary narration' },
  { id: 'Zephyr', label: 'Zephyr — Warm Storyteller (Female)', gender: 'Female', style: 'Warm, engaging cinematic storyteller' },
  { id: 'Charon', label: 'Charon — Deep Cinema Voice (Male)', gender: 'Male', style: 'Deep, resonant theatrical trailer and documentary voice' },
  { id: 'Puck', label: 'Puck — Energetic Creator (Male)', gender: 'Male', style: 'Upbeat, crisp YouTube and Shorts presenter' },
  { id: 'Fenrir', label: 'Fenrir — Dramatic Thriller (Male)', gender: 'Male', style: 'Measured, suspenseful dramatic narrator' },
] as const;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English (US / Global)' },
  { code: 'te', label: 'Telugu (తెలుగు)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'pt', label: 'Portuguese (Português)' },
] as const;

export const BUILTIN_MUSIC_BEDS = [
  { id: 'none', label: 'No Background Music', mood: 'Silent', license: 'N/A' },
  { id: 'ambient-horizon', label: 'Ambient Horizon (Warm Pad)', mood: 'Documentary / Cinematic', license: 'CC0 Procedural Audio (CINEGEN Studio)' },
  { id: 'pulse-focus', label: 'Pulse Focus (Minimal Tech)', mood: 'Educational / Explainer', license: 'CC0 Procedural Audio (CINEGEN Studio)' },
  { id: 'tension-drone', label: 'Midnight Tension (Subtle Drone)', mood: 'Horror / Mystery', license: 'CC0 Procedural Audio (CINEGEN Studio)' },
  { id: 'uplift-chord', label: 'Golden Uplift (Bright Harmony)', mood: 'Motivational / Shorts', license: 'CC0 Procedural Audio (CINEGEN Studio)' },
] as const;

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    audience: 'For evaluating workflows & storyboarding',
    monthlyPriceUsd: 0,
    monthlyCredits: 100,
    maxDurationSec: 60,
    maxQuality: '720p',
    storageQuotaBytes: 500 * 1024 * 1024,
    storageLabel: '500 MB',
    features: [
      '100 starter credits included',
      'Multi-scene generation up to 1 minute',
      '720p MP4 export & Demo Mode previews',
      'AI Script Writer & Voice Studio (English & Telugu)',
      'Copyright & Originality pre-export check',
    ],
  },
  {
    id: 'basic',
    name: 'Basic',
    audience: 'For solo YouTube Shorts & Reels creators',
    monthlyPriceUsd: 19,
    monthlyCredits: 600,
    maxDurationSec: 180,
    maxQuality: '1080p',
    storageQuotaBytes: 5 * 1024 * 1024 * 1024,
    storageLabel: '5 GB',
    features: [
      '600 monthly production credits',
      'Multi-scene videos up to 3 minutes',
      '1080p Full HD MP4 timeline export',
      'YouTube Creator Mode (Titles, SEO, Thumbnails)',
      'Custom audio uploads & burned-in subtitles',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    audience: 'For full-time channels & documentary studios',
    monthlyPriceUsd: 49,
    monthlyCredits: 2200,
    maxDurationSec: 300,
    maxQuality: '1080p',
    storageQuotaBytes: 25 * 1024 * 1024 * 1024,
    storageLabel: '25 GB',
    features: [
      '2,200 monthly production credits',
      'Full 5-minute multi-scene video orchestration',
      '1080p export with priority multi-provider queue',
      'Dual-speaker expressive AI Voice Studio',
      'Veo & Runway adapter routing + visual consistency lock',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    audience: 'For media agencies & high-volume teams',
    monthlyPriceUsd: 129,
    monthlyCredits: 7500,
    maxDurationSec: 300,
    maxQuality: '4k',
    storageQuotaBytes: 100 * 1024 * 1024 * 1024,
    storageLabel: '100 GB',
    features: [
      '7,500 monthly production credits',
      'Up to 4K export when supported by active provider',
      'Full 5-minute multi-scene assembly & Lyria soundtracks',
      '100 GB persistent project media vault',
      'Dedicated priority support & compliance audit logs',
    ],
  },
];

export function estimateVideoCreditCost(params: {
  durationSec: number;
  quality: VideoQuality;
  provider: VideoProviderId;
  includeVoiceover?: boolean;
  includeMusic?: boolean;
}): number {
  if (params.provider === 'demo-mode') {
    // Demo previews cost minimal credits (2 base + 1 per minute) so users can test full credit flow transparently
    return Math.max(2, Math.ceil(params.durationSec / 60) * 2);
  }
  const basePer10s = params.provider === 'runway' ? 8 : 6;
  const qualityMultiplier = params.quality === '4k' ? 2 : params.quality === '1080p' ? 1.35 : 1;
  const clipCost = Math.ceil((params.durationSec / 10) * basePer10s * qualityMultiplier);
  const voiceCost = params.includeVoiceover ? Math.ceil(params.durationSec / 30) * 2 : 0;
  const musicCost = params.includeMusic ? 2 : 0;
  return clipCost + voiceCost + musicCost;
}

export const MONETIZATION_DISCLAIMER =
  'CINEGEN AI assists creators with original scripts, scenes, and authorized AI voices, but cannot guarantee that any generated video is completely copyright-free or automatically eligible for YouTube monetization. YouTube independently reviews channels and videos under its current copyright, reused content, and synthetic media disclosure policies.';
