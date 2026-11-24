import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  createSession,
  hasAnyAdminAccount,
  hashPassword,
  isEnvAdminPasscodeConfigured,
  registerNewUser,
  requireAdmin,
  requireAuth,
  revokeSession,
  verifyEnvAdminPasscode,
  verifyPassword,
} from './server/auth.ts';
import {
  adjustCreditsAtomic,
  createId,
  db,
  DbUserRow,
  recordMediaAsset,
  resolveSafeStoragePath,
  toUserPublic,
} from './server/db.ts';
import {
  getJobWithScenes,
  launchVideoGenerationJob,
} from './server/jobs/orchestrator.ts';
import {
  assembleMultiSceneVideo,
  generateAmbientMusicBed,
  renderDemoStoryboardImage,
} from './server/media/ffmpegService.ts';
import {
  extractApiErrorMessage,
  generateImageWithGemini,
  generateMusicWithLyria,
  generateScriptWithGemini,
  generateVoiceWithGemini,
  generateYouTubePackageWithGemini,
} from './server/providers/geminiClient.ts';
import { getProviderHealthList } from './server/providers/videoAdapters.ts';
import {
  AspectRatio,
  estimateVideoCreditCost,
  PLAN_DEFINITIONS,
  PlanTier,
  VideoProviderId,
  VideoQuality,
} from './src/types/cinegen.ts';

const app = express();
app.use(express.json({ limit: '15mb' }));

// Security headers (iframe-compatible)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_AUDIO_MIMES = new Set([
  'audio/wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/ogg',
  'audio/x-wav',
]);

// ============================================================================
// AUTHENTICATION & ADMIN BOOTSTRAP ROUTES
// ============================================================================

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

app.post('/api/auth/signup', (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid signup data' });
    return;
  }
  try {
    const result = registerNewUser({
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
      role: 'user',
      plan: 'free',
      initialCredits: 100,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(409).json({ error: extractApiErrorMessage(err) });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post('/api/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and password are required.' });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as DbUserRow | undefined;
  if (!row || !verifyPassword(parsed.data.password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  const token = createSession(row.id);
  res.json({ user: toUserPublic(row), token });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  if (req.sessionToken) {
    revokeSession(req.sessionToken);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.patch('/api/auth/profile', requireAuth, (req, res) => {
  const schema = z.object({
    name: z.string().min(2).max(80).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(128).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile update' });
    return;
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as DbUserRow;
  if (parsed.data.newPassword) {
    if (!parsed.data.currentPassword || !verifyPassword(parsed.data.currentPassword, row.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      hashPassword(parsed.data.newPassword),
      row.id
    );
  }

  if (parsed.data.name) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(parsed.data.name.trim(), row.id);
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id) as DbUserRow;
  res.json({ user: toUserPublic(updated) });
});

app.get('/api/admin/bootstrap-status', (_req, res) => {
  res.json({
    hasAdmin: hasAnyAdminAccount(),
    envPasscodeConfigured: isEnvAdminPasscodeConfigured(),
  });
});

app.post('/api/admin/claim', requireAuth, (req, res) => {
  const schema = z.object({
    passcode: z.string().min(6, 'Passcode must be at least 6 characters').max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid passcode' });
    return;
  }

  const envConfigured = isEnvAdminPasscodeConfigured();
  const alreadyHasAdmin = hasAnyAdminAccount();

  if (envConfigured) {
    if (!verifyEnvAdminPasscode(parsed.data.passcode)) {
      res.status(403).json({ error: 'Invalid server ADMIN_PASSCODE.' });
      return;
    }
  } else if (alreadyHasAdmin) {
    res.status(403).json({
      error:
        'An administrator account has already been claimed. Ask an existing admin to grant access or configure ADMIN_PASSCODE.',
    });
    return;
  }

  db.prepare("UPDATE users SET role = 'admin', plan = 'premium' WHERE id = ?").run(req.user!.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as DbUserRow;
  res.json({ user: toUserPublic(updated), message: 'Administrator role activated.' });
});

// ============================================================================
// SYSTEM & PROVIDER STATUS
// ============================================================================

app.get('/api/providers/status', async (_req, res) => {
  const providers = await getProviderHealthList();
  res.json({ providers });
});

// ============================================================================
// MEDIA UPLOAD & SAFE STREAMING (WITH RANGE SUPPORT FOR MP4)
// ============================================================================

app.post('/api/media/upload', requireAuth, upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded.' });
    return;
  }
  const isImg = ALLOWED_IMAGE_MIMES.has(file.mimetype);
  const isAudio = ALLOWED_AUDIO_MIMES.has(file.mimetype);
  if (!isImg && !isAudio) {
    res.status(400).json({
      error: 'Unsupported file type. Upload PNG/JPG/WEBP images or WAV/MP3/WEBM/OGG audio.',
    });
    return;
  }

  const extMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
  };
  const ext = extMap[file.mimetype] || 'bin';
  const filename = `${createId('upl')}.${ext}`;
  const filePath = resolveSafeStoragePath(filename);
  fs.writeFileSync(filePath, file.buffer);

  const asset = recordMediaAsset({
    userId: req.user!.id,
    kind: isImg ? 'upload' : 'audio',
    filename,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    prompt: file.originalname.slice(0, 120),
    provider: 'user-upload',
    isDemo: false,
  });

  res.status(201).json({
    id: asset.id,
    filename,
    url: asset.url,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    kind: isImg ? 'image' : 'audio',
  });
});

app.get('/api/media/:filename', (req, res) => {
  try {
    const filePath = resolveSafeStoragePath(req.params.filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Media file not found' });
      return;
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    if (req.query.download === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }

    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.wav' || ext === '.mp3')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      if (Number.isNaN(start) || start >= stat.size || end >= stat.size) {
        res.status(416).end();
        return;
      }
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.status(400).json({ error: 'Invalid media identifier' });
  }
});

app.get('/api/assets', requireAuth, (req, res) => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : null;
  const rows = (
    kind
      ? db
          .prepare('SELECT * FROM media_assets WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 60')
          .all(req.user!.id, kind)
      : db
          .prepare('SELECT * FROM media_assets WHERE user_id = ? ORDER BY created_at DESC LIMIT 60')
          .all(req.user!.id)
  ) as Record<string, unknown>[];

  res.json({
    assets: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      kind: r.kind,
      filename: r.filename,
      url: `/api/media/${r.filename}`,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      prompt: r.prompt,
      provider: r.provider,
      isDemo: Boolean(r.is_demo),
      createdAt: r.created_at,
    })),
  });
});

// ============================================================================
// AI SCRIPT WRITER
// ============================================================================

app.post('/api/script/generate', requireAuth, async (req, res) => {
  const schema = z.object({
    topic: z.string().min(4, 'Describe your video topic in at least 4 characters').max(2000),
    format: z.string().min(2).max(80),
    language: z.string().min(2).max(40).default('English'),
    tone: z.string().min(2).max(60).default('Cinematic'),
    durationSec: z.number().int().min(10).max(300).default(30),
    audience: z.string().max(120).default('General viewers'),
    storytellingStyle: z.string().max(80).default('Visual Narrative'),
    voiceoverStyle: z.string().max(80).default('Clear Documentary'),
    visualStyle: z.string().max(80).optional(),
    saveProject: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid script parameters' });
    return;
  }

  try {
    const script = await generateScriptWithGemini({
      userId: req.user!.id,
      ...parsed.data,
    });

    let projectId: string | null = null;
    if (parsed.data.saveProject) {
      projectId = createId('prj');
      const ratio: AspectRatio =
        parsed.data.format.toLowerCase().includes('short') ||
        parsed.data.format.toLowerCase().includes('reel')
          ? '9:16'
          : '16:9';
      db.prepare(
        `INSERT INTO projects (id, user_id, title, description, mode, aspect_ratio, target_duration_sec, style, status, script_json)
         VALUES (?, ?, ?, ?, 'script', ?, ?, ?, 'draft', ?)`
      ).run(
        projectId,
        req.user!.id,
        script.title,
        script.logline,
        ratio,
        parsed.data.durationSec,
        parsed.data.tone,
        JSON.stringify(script)
      );
    }

    res.json({ script, projectId });
  } catch (err) {
    res.status(502).json({ error: extractApiErrorMessage(err) });
  }
});

// ============================================================================
// AI VOICE STUDIO (GEMINI 3.8 TTS)
// ============================================================================

app.post('/api/voice/generate', requireAuth, async (req, res) => {
  const schema = z.object({
    text: z.string().min(2, 'Enter dialogue or narration text').max(3000),
    voiceName: z.string().default('Kore'),
    language: z.string().default('English'),
    style: z.string().max(200).optional(),
    multiSpeaker: z.boolean().optional(),
    secondVoiceName: z.string().optional(),
    secondSpeakerText: z.string().max(2000).optional(),
    projectId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid voice request' });
    return;
  }

  try {
    const creditCost = 2;
    const creditTx = adjustCreditsAtomic({
      userId: req.user!.id,
      delta: -creditCost,
      type: 'deduction',
      description: `AI Voice Studio (${parsed.data.voiceName} · ${parsed.data.language})`,
    });

    try {
      const tts = await generateVoiceWithGemini({
        userId: req.user!.id,
        ...parsed.data,
      });

      const asset = recordMediaAsset({
        userId: req.user!.id,
        projectId: parsed.data.projectId ?? null,
        kind: 'audio',
        filename: tts.filename,
        mimeType: 'audio/wav',
        sizeBytes: tts.sizeBytes,
        prompt: parsed.data.text.slice(0, 200),
        provider: tts.model,
        isDemo: false,
      });

      res.json({
        id: asset.id,
        url: asset.url,
        filename: tts.filename,
        model: tts.model,
        sizeBytes: tts.sizeBytes,
        creditsRemaining: creditTx.credits,
      });
    } catch (innerErr) {
      adjustCreditsAtomic({
        userId: req.user!.id,
        delta: creditCost,
        type: 'refund',
        description: 'Refund for failed AI Voice generation',
      });
      throw innerErr;
    }
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    res.status(msg.includes('Insufficient credits') ? 402 : 502).json({ error: msg });
  }
});

// ============================================================================
// TEXT TO IMAGE GENERATOR & THUMBNAILS
// ============================================================================

app.post('/api/image/generate', requireAuth, async (req, res) => {
  const schema = z.object({
    prompt: z.string().min(4, 'Enter an image prompt').max(1500),
    aspectRatio: z.enum(['1:1', '3:4', '4:3', '9:16', '16:9']).default('16:9'),
    style: z.string().max(60).default('Cinematic'),
    highQuality: z.boolean().optional(),
    useDemoMode: z.boolean().optional(),
    projectId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid image request' });
    return;
  }

  const creditCost = parsed.data.useDemoMode ? 1 : parsed.data.highQuality ? 5 : 3;
  let creditTx: { credits: number; transactionId: string };
  try {
    creditTx = adjustCreditsAtomic({
      userId: req.user!.id,
      delta: -creditCost,
      type: 'deduction',
      description: parsed.data.useDemoMode
        ? 'Demo Mode Concept Frame'
        : `Text-to-Image (${parsed.data.aspectRatio})`,
    });
  } catch (err) {
    res.status(402).json({ error: extractApiErrorMessage(err) });
    return;
  }

  try {
    const fullPrompt = `${parsed.data.style} visual style: ${parsed.data.prompt}`;
    if (parsed.data.useDemoMode) {
      const demoImg = await renderDemoStoryboardImage({
        prompt: parsed.data.prompt,
        aspectRatio: parsed.data.aspectRatio,
        style: parsed.data.style,
      });
      const asset = recordMediaAsset({
        userId: req.user!.id,
        projectId: parsed.data.projectId ?? null,
        kind: 'image',
        filename: demoImg.filename,
        mimeType: 'image/png',
        sizeBytes: demoImg.sizeBytes,
        prompt: parsed.data.prompt,
        provider: 'demo-mode',
        isDemo: true,
      });
      res.json({
        id: asset.id,
        filename: demoImg.filename,
        url: asset.url,
        mimeType: 'image/png',
        isDemo: true,
        provider: 'demo-mode',
        creditsRemaining: creditTx.credits,
      });
      return;
    }

    const generated = await generateImageWithGemini({
      userId: req.user!.id,
      prompt: fullPrompt,
      aspectRatio: parsed.data.aspectRatio,
      highQuality: parsed.data.highQuality,
    });

    const asset = recordMediaAsset({
      userId: req.user!.id,
      projectId: parsed.data.projectId ?? null,
      kind: 'image',
      filename: generated.filename,
      mimeType: generated.mimeType,
      sizeBytes: generated.sizeBytes,
      prompt: parsed.data.prompt,
      provider: generated.model,
      isDemo: false,
    });

    res.json({
      id: asset.id,
      filename: generated.filename,
      url: asset.url,
      mimeType: generated.mimeType,
      isDemo: false,
      provider: generated.model,
      creditsRemaining: creditTx.credits,
    });
  } catch (err) {
    adjustCreditsAtomic({
      userId: req.user!.id,
      delta: creditCost,
      type: 'refund',
      description: 'Refund for failed Text-to-Image generation',
    });
    res.status(502).json({ error: extractApiErrorMessage(err) });
  }
});

// ============================================================================
// AI MUSIC (LYRIA / CC0 STUDIO BED)
// ============================================================================

app.post('/api/music/generate', requireAuth, async (req, res) => {
  const schema = z.object({
    mode: z.enum(['lyria', 'builtin']).default('builtin'),
    bedId: z.string().default('ambient-horizon'),
    prompt: z.string().max(600).optional(),
    durationSec: z.number().int().min(10).max(300).default(30),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid music request' });
    return;
  }

  try {
    if (parsed.data.mode === 'lyria') {
      const lyria = await generateMusicWithLyria({
        userId: req.user!.id,
        prompt: parsed.data.prompt || 'Generate a 30-second atmospheric cinematic score.',
      });
      const asset = recordMediaAsset({
        userId: req.user!.id,
        kind: 'audio',
        filename: lyria.filename,
        mimeType: lyria.mimeType,
        sizeBytes: lyria.sizeBytes,
        prompt: parsed.data.prompt || 'Lyria Soundtrack',
        provider: 'lyria-3-clip-preview',
        isDemo: false,
      });
      res.json({
        id: asset.id,
        url: asset.url,
        filename: lyria.filename,
        lyrics: lyria.lyrics,
        provider: 'lyria-3-clip-preview',
      });
      return;
    }

    const bed = await generateAmbientMusicBed(parsed.data.bedId, parsed.data.durationSec);
    if (!bed) {
      res.status(400).json({ error: 'Select a valid ambient music bed.' });
      return;
    }
    const asset = recordMediaAsset({
      userId: req.user!.id,
      kind: 'audio',
      filename: bed.filename,
      mimeType: 'audio/wav',
      sizeBytes: bed.sizeBytes,
      prompt: `CC0 Studio Bed: ${parsed.data.bedId}`,
      provider: 'cinegen-cc0-audio',
      isDemo: false,
    });
    res.json({
      id: asset.id,
      url: asset.url,
      filename: bed.filename,
      provider: 'cinegen-cc0-audio',
    });
  } catch (err) {
    res.status(502).json({ error: extractApiErrorMessage(err) });
  }
});

// ============================================================================
// YOUTUBE CREATOR MODE & COPYRIGHT ASSISTANT
// ============================================================================

app.post('/api/youtube/package', requireAuth, async (req, res) => {
  const schema = z.object({
    topic: z.string().min(4).max(1500),
    mode: z.enum(['youtube-shorts', 'youtube-long']).default('youtube-shorts'),
    category: z.string().min(2).max(80).default('Educational'),
    language: z.string().min(2).max(40).default('English'),
    scriptSummary: z.string().max(4000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid YouTube request' });
    return;
  }

  try {
    const pkg = await generateYouTubePackageWithGemini({
      userId: req.user!.id,
      ...parsed.data,
    });
    res.json({ package: pkg });
  } catch (err) {
    res.status(502).json({ error: extractApiErrorMessage(err) });
  }
});

// ============================================================================
// VIDEO GENERATION JOBS (TEXT-TO-VIDEO & IMAGE-TO-VIDEO)
// ============================================================================

const createJobSchema = z.object({
  projectId: z.string().optional(),
  title: z.string().max(120).optional(),
  type: z.enum(['text-to-video', 'image-to-video']).default('text-to-video'),
  provider: z.enum(['google-veo', 'runway', 'demo-mode']).default('demo-mode'),
  prompt: z.string().min(5, 'Enter a descriptive prompt (at least 5 characters)').max(3000),
  durationSec: z.number().int().min(10).max(300).default(20),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  quality: z.enum(['720p', '1080p', '4k']).default('720p'),
  style: z.string().max(60).default('Cinematic'),
  customStyle: z.string().max(120).optional(),
  cameraMovement: z.string().max(100).default('Slow Cinematic Dolly In'),
  lighting: z.string().max(100).default('Golden Hour Natural'),
  language: z.string().max(40).default('English'),
  includeVoiceover: z.boolean().default(true),
  voiceName: z.string().max(30).default('Kore'),
  musicBedId: z.string().max(60).default('ambient-horizon'),
  includeSubtitles: z.boolean().default(true),
  allowDemoFallback: z.boolean().default(false),
  referenceImageFilename: z.string().max(120).nullable().optional(),
  referenceImageMimeType: z.string().max(60).nullable().optional(),
  existingScript: z.any().optional(),
});

app.post('/api/jobs', requireAuth, (req, res) => {
  const parsed = createJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid job settings' });
    return;
  }

  const data = parsed.data;
  if (data.type === 'image-to-video' && !data.referenceImageFilename) {
    res.status(400).json({ error: 'Upload a reference image first for Image-to-Video generation.' });
    return;
  }

  if (data.quality === '4k' && data.provider !== 'google-veo') {
    res.status(400).json({
      error: '4K resolution is only supported when Google Veo / Omni Flash is selected.',
    });
    return;
  }

  const creditsCost = estimateVideoCreditCost({
    durationSec: data.durationSec,
    quality: data.quality as VideoQuality,
    provider: data.provider as VideoProviderId,
    includeVoiceover: data.includeVoiceover,
    includeMusic: data.musicBedId !== 'none',
  });

  try {
    const launched = launchVideoGenerationJob({
      userId: req.user!.id,
      projectId: data.projectId,
      title: data.title,
      type: data.type,
      provider: data.provider as VideoProviderId,
      prompt: data.prompt,
      durationSec: data.durationSec,
      aspectRatio: data.aspectRatio as AspectRatio,
      quality: data.quality as VideoQuality,
      style: data.style,
      customStyle: data.customStyle,
      cameraMovement: data.cameraMovement,
      lighting: data.lighting,
      language: data.language,
      includeVoiceover: data.includeVoiceover,
      voiceName: data.voiceName,
      musicBedId: data.musicBedId,
      includeSubtitles: data.includeSubtitles,
      allowDemoFallback: data.allowDemoFallback,
      referenceImageFilename: data.referenceImageFilename,
      referenceImageMimeType: data.referenceImageMimeType,
      existingScript: data.existingScript,
      creditsCost,
    });

    const job = getJobWithScenes(launched.jobId, req.user!.id);
    res.status(202).json({
      job,
      projectId: launched.projectId,
      creditsRemaining: launched.creditsRemaining,
    });
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    res.status(msg.includes('Insufficient credits') ? 402 : 500).json({ error: msg });
  }
});

app.get('/api/jobs', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT id FROM video_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user!.id) as Array<{ id: string }>;
  const jobs = rows.map((r) => getJobWithScenes(r.id, req.user!.id)).filter(Boolean);
  res.json({ jobs });
});

app.get('/api/jobs/:id', requireAuth, (req, res) => {
  const job = getJobWithScenes(req.params.id, req.user!.id);
  if (!job) {
    res.status(404).json({ error: 'Generation job not found.' });
    return;
  }
  res.json({ job });
});

app.post('/api/jobs/:id/retry', requireAuth, (req, res) => {
  const existing = getJobWithScenes(req.params.id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Job not found.' });
    return;
  }
  const s = existing.settings as Record<string, unknown>;
  const providerOverride =
    req.body?.provider && ['google-veo', 'runway', 'demo-mode'].includes(req.body.provider)
      ? (req.body.provider as VideoProviderId)
      : existing.provider;

  const quality = (String(s.quality || '720p') as VideoQuality);
  const creditsCost = estimateVideoCreditCost({
    durationSec: existing.targetDurationSec,
    quality,
    provider: providerOverride,
    includeVoiceover: Boolean(s.includeVoiceover),
    includeMusic: String(s.musicBedId || 'none') !== 'none',
  });

  try {
    const launched = launchVideoGenerationJob({
      userId: req.user!.id,
      projectId: existing.projectId,
      type: existing.type,
      provider: providerOverride,
      prompt: existing.prompt,
      durationSec: existing.targetDurationSec,
      aspectRatio: (String(s.aspectRatio || '16:9') as AspectRatio),
      quality,
      style: String(s.style || 'Cinematic'),
      cameraMovement: String(s.cameraMovement || 'Slow Cinematic Dolly In'),
      lighting: String(s.lighting || 'Golden Hour Natural'),
      language: String(s.language || 'English'),
      includeVoiceover: Boolean(s.includeVoiceover),
      voiceName: String(s.voiceName || 'Kore'),
      musicBedId: String(s.musicBedId || 'ambient-horizon'),
      includeSubtitles: Boolean(s.includeSubtitles),
      allowDemoFallback: Boolean(req.body?.allowDemoFallback ?? s.allowDemoFallback),
      referenceImageFilename: (s.referenceImageFilename as string | null) ?? null,
      creditsCost,
    });
    const job = getJobWithScenes(launched.jobId, req.user!.id);
    res.status(202).json({ job, creditsRemaining: launched.creditsRemaining });
  } catch (err) {
    res.status(402).json({ error: extractApiErrorMessage(err) });
  }
});

// ============================================================================
// PROJECTS & VIDEO EDITING STUDIO
// ============================================================================

app.get('/api/projects', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 60')
    .all(req.user!.id) as Record<string, unknown>[];

  const projects = rows.map((p) => ({
    id: p.id,
    userId: p.user_id,
    title: p.title,
    description: p.description,
    mode: p.mode,
    aspectRatio: p.aspect_ratio,
    targetDurationSec: p.target_duration_sec,
    style: p.style,
    status: p.status,
    scriptJson: p.script_json ? JSON.parse(String(p.script_json)) : null,
    youtubeMetaJson: p.youtube_meta_json ? JSON.parse(String(p.youtube_meta_json)) : null,
    finalVideoUrl: p.final_video_url,
    finalDurationSec: p.final_duration_sec,
    isDemo: Boolean(p.is_demo),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));

  res.json({ projects });
});

app.get('/api/projects/:id', requireAuth, (req, res) => {
  const p = db
    .prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
  if (!p) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  const latestJob = db
    .prepare('SELECT id FROM video_jobs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(req.params.id) as { id: string } | undefined;

  const scenes = latestJob
    ? (
        db
          .prepare('SELECT * FROM scenes WHERE job_id = ? ORDER BY scene_index ASC')
          .all(latestJob.id) as Record<string, unknown>[]
      ).map((s) => ({
          id: s.id,
          jobId: s.job_id,
          projectId: s.project_id,
          sceneIndex: s.scene_index,
          title: s.title,
          visualPrompt: s.visual_prompt,
          narrationText: s.narration_text,
          cameraMovement: s.camera_movement,
          lighting: s.lighting,
          durationSec: s.duration_sec,
          trimStartSec: s.trim_start_sec,
          trimEndSec: s.trim_end_sec,
          transition: s.transition,
          status: s.status,
          videoUrl: s.video_url,
          audioUrl: s.audio_url,
          isDemo: Boolean(s.is_demo),
          errorMessage: s.error_message,
        }))
    : [];

  res.json({
    project: {
      id: p.id,
      userId: p.user_id,
      title: p.title,
      description: p.description,
      mode: p.mode,
      aspectRatio: p.aspect_ratio,
      targetDurationSec: p.target_duration_sec,
      style: p.style,
      status: p.status,
      scriptJson: p.script_json ? JSON.parse(String(p.script_json)) : null,
      youtubeMetaJson: p.youtube_meta_json ? JSON.parse(String(p.youtube_meta_json)) : null,
      finalVideoUrl: p.final_video_url,
      finalDurationSec: p.final_duration_sec,
      isDemo: Boolean(p.is_demo),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      scenes,
    },
  });
});

app.patch('/api/projects/:id', requireAuth, (req, res) => {
  const schema = z.object({
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(600).optional(),
    aspectRatio: z.enum(['16:9', '9:16']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project update fields.' });
    return;
  }
  const existing = db
    .prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  if (parsed.data.title) {
    db.prepare("UPDATE projects SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
      parsed.data.title.trim(),
      req.params.id
    );
  }
  if (parsed.data.description !== undefined) {
    db.prepare("UPDATE projects SET description = ?, updated_at = datetime('now') WHERE id = ?").run(
      parsed.data.description,
      req.params.id
    );
  }
  if (parsed.data.aspectRatio) {
    db.prepare("UPDATE projects SET aspect_ratio = ?, updated_at = datetime('now') WHERE id = ?").run(
      parsed.data.aspectRatio,
      req.params.id
    );
  }
  res.json({ ok: true });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const info = db
    .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);
  if (info.changes === 0) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }
  res.json({ ok: true });
});

// Video Editing Studio: Reorder, Trim, Update Subtitles/Transitions, Mix Audio & Export Real MP4
app.post('/api/studio/export', requireAuth, async (req, res) => {
  const schema = z.object({
    projectId: z.string(),
    aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
    quality: z.enum(['720p', '1080p']).default('720p'),
    musicBedId: z.string().default('none'),
    customAudioFilename: z.string().nullable().optional(),
    voiceVolume: z.number().min(0).max(2).default(1),
    musicVolume: z.number().min(0).max(1.5).default(0.25),
    includeSubtitles: z.boolean().default(true),
    copyrightAcknowledged: z.boolean(),
    scenes: z
      .array(
        z.object({
          id: z.string(),
          sceneIndex: z.number().int().min(0),
          narrationText: z.string().max(1000).default(''),
          trimStartSec: z.number().min(0).default(0),
          trimEndSec: z.number().min(1).default(10),
          transition: z.enum(['cut', 'fade', 'dissolve']).default('fade'),
          audioUrl: z.string().nullable().optional(),
        })
      )
      .min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid studio export payload' });
    return;
  }

  if (!parsed.data.copyrightAcknowledged) {
    res.status(400).json({
      error: 'Please review and acknowledge the Copyright & Monetization Safety Notice before exporting.',
    });
    return;
  }

  const project = db
    .prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .get(parsed.data.projectId, req.user!.id) as Record<string, unknown> | undefined;
  if (!project) {
    res.status(404).json({ error: 'Project not found.' });
    return;
  }

  try {
    const ordered = [...parsed.data.scenes].sort((a, b) => a.sceneIndex - b.sceneIndex);
    const assembleInputs = [];
    let hasDemoScene = false;

    for (let i = 0; i < ordered.length; i++) {
      const edit = ordered[i];
      const dbScene = db
        .prepare('SELECT * FROM scenes WHERE id = ? AND project_id = ?')
        .get(edit.id, parsed.data.projectId) as Record<string, unknown> | undefined;
      if (!dbScene || !dbScene.video_url) continue;

      if (dbScene.is_demo) hasDemoScene = true;

      db.prepare(
        `UPDATE scenes SET scene_index = ?, narration_text = ?, trim_start_sec = ?, trim_end_sec = ?, transition = ?, audio_url = ? WHERE id = ?`
      ).run(
        i,
        edit.narrationText,
        edit.trimStartSec,
        edit.trimEndSec,
        edit.transition,
        edit.audioUrl ?? dbScene.audio_url ?? null,
        edit.id
      );

      const videoFilename = String(dbScene.video_url).replace('/api/media/', '');
      const videoPath = resolveSafeStoragePath(videoFilename);
      const effectiveAudioUrl = edit.audioUrl ?? (dbScene.audio_url ? String(dbScene.audio_url) : null);
      const audioPath = effectiveAudioUrl
        ? resolveSafeStoragePath(effectiveAudioUrl.replace('/api/media/', ''))
        : null;

      assembleInputs.push({
        videoPath,
        audioPath,
        narrationText: edit.narrationText,
        durationSec: Number(dbScene.duration_sec),
        trimStartSec: edit.trimStartSec,
        trimEndSec: edit.trimEndSec,
        transition: edit.transition,
      });
    }

    if (assembleInputs.length === 0) {
      res.status(400).json({ error: 'No rendered video clips found in this project to export.' });
      return;
    }

    let musicPath: string | null = null;
    if (parsed.data.customAudioFilename) {
      musicPath = resolveSafeStoragePath(parsed.data.customAudioFilename);
    } else if (parsed.data.musicBedId !== 'none') {
      const totalDur = assembleInputs.reduce(
        (acc, s) => acc + Math.max(1, (s.trimEndSec ?? s.durationSec) - (s.trimStartSec ?? 0)),
        0
      );
      const bed = await generateAmbientMusicBed(parsed.data.musicBedId, totalDur + 2);
      if (bed) musicPath = bed.filePath;
    }

    const exported = await assembleMultiSceneVideo({
      scenes: assembleInputs,
      aspectRatio: parsed.data.aspectRatio,
      quality: parsed.data.quality,
      musicPath,
      voiceVolume: parsed.data.voiceVolume,
      musicVolume: parsed.data.musicVolume,
      includeSubtitles: parsed.data.includeSubtitles,
    });

    const asset = recordMediaAsset({
      userId: req.user!.id,
      projectId: parsed.data.projectId,
      kind: 'video',
      filename: exported.filename,
      mimeType: 'video/mp4',
      sizeBytes: exported.sizeBytes,
      prompt: `Studio Export: ${String(project.title)}`,
      provider: hasDemoScene ? 'demo-mode' : 'ffmpeg-studio',
      isDemo: hasDemoScene,
    });

    db.prepare(
      `UPDATE projects SET final_video_url = ?, final_duration_sec = ?, aspect_ratio = ?, is_demo = ?, status = 'completed', updated_at = datetime('now') WHERE id = ?`
    ).run(asset.url, exported.durationSec, parsed.data.aspectRatio, hasDemoScene ? 1 : 0, parsed.data.projectId);

    res.json({
      outputUrl: asset.url,
      filename: exported.filename,
      durationSec: exported.durationSec,
      sizeBytes: exported.sizeBytes,
      isDemo: hasDemoScene,
    });
  } catch (err) {
    res.status(500).json({ error: `Studio MP4 export failed: ${extractApiErrorMessage(err)}` });
  }
});

// ============================================================================
// DASHBOARD, BILLING, CREDITS & SUPPORT
// ============================================================================

app.get('/api/dashboard/summary', requireAuth, (req, res) => {
  const userId = req.user!.id;
  const totalProjects = (
    db.prepare('SELECT COUNT(*) as c FROM projects WHERE user_id = ?').get(userId) as { c: number }
  ).c;
  const totalVideos = (
    db
      .prepare("SELECT COUNT(*) as c FROM video_jobs WHERE user_id = ? AND status = 'completed'")
      .get(userId) as { c: number }
  ).c;
  const activeJobs = (
    db
      .prepare(
        "SELECT COUNT(*) as c FROM video_jobs WHERE user_id = ? AND status NOT IN ('completed', 'failed')"
      )
      .get(userId) as { c: number }
  ).c;

  const recentJobIds = db
    .prepare('SELECT id FROM video_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 6')
    .all(userId) as Array<{ id: string }>;
  const recentJobs = recentJobIds.map((r) => getJobWithScenes(r.id, userId)).filter(Boolean);

  const recentProjects = (
    db
      .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 6')
      .all(userId) as Record<string, unknown>[]
  ).map((p) => ({
      id: p.id,
      userId: p.user_id,
      title: p.title,
      description: p.description,
      mode: p.mode,
      aspectRatio: p.aspect_ratio,
      targetDurationSec: p.target_duration_sec,
      style: p.style,
      status: p.status,
      finalVideoUrl: p.final_video_url,
      finalDurationSec: p.final_duration_sec,
      isDemo: Boolean(p.is_demo),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

  res.json({
    stats: {
      totalProjects,
      totalVideos,
      activeJobs,
      credits: req.user!.credits,
      plan: req.user!.plan,
      storageUsedBytes: req.user!.storageUsedBytes,
      storageQuotaBytes: req.user!.storageQuotaBytes,
    },
    recentJobs,
    recentProjects,
  });
});

app.get('/api/billing/transactions', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      'SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
    )
    .all(req.user!.id) as Record<string, unknown>[];

  res.json({
    credits: req.user!.credits,
    plan: req.user!.plan,
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    transactions: rows.map((t) => ({
      id: t.id,
      userId: t.user_id,
      amount: t.amount,
      balanceAfter: t.balance_after,
      type: t.type,
      description: t.description,
      referenceId: t.reference_id,
      createdAt: t.created_at,
    })),
  });
});

app.post('/api/billing/checkout', requireAuth, (req, res) => {
  const schema = z.object({
    planId: z.enum(['free', 'basic', 'pro', 'premium']),
    sandboxTestMode: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid subscription plan selected.' });
    return;
  }

  const plan = PLAN_DEFINITIONS.find((p) => p.id === parsed.data.planId)!;
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

  // Never fake live credit card charges. Only update plan in Free tier or explicit Development Sandbox mode.
  if (plan.id !== 'free' && !stripeKey && !parsed.data.sandboxTestMode) {
    res.status(501).json({
      error:
        'Live payment checkout requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET on the server. No fake charges are processed. You may use the explicitly labeled Sandbox Plan Switch to evaluate plan quotas locally.',
      stripeConfigured: false,
    });
    return;
  }

  db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan.id, req.user!.id);
  const delta = plan.id === 'free' ? 0 : plan.monthlyCredits;
  if (delta > 0) {
    adjustCreditsAtomic({
      userId: req.user!.id,
      delta,
      type: 'subscription',
      description: `${plan.name} plan credit allocation${stripeKey ? '' : ' (Development Sandbox — No Charge)'}`,
    });
  }

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as DbUserRow;
  res.json({
    user: toUserPublic(updated),
    sandbox: !stripeKey,
    message:
      plan.id === 'free'
        ? 'Switched to Free plan.'
        : stripeKey
          ? `Upgraded to ${plan.name} plan.`
          : `Development Sandbox mode: Switched to ${plan.name} plan (+${delta} credits, no real payment charged).`,
  });
});

app.get('/api/support/tickets', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(req.user!.id);
  res.json({ tickets: rows });
});

app.post('/api/support/tickets', requireAuth, (req, res) => {
  const schema = z.object({
    subject: z.string().min(4, 'Enter a subject (min 4 characters)').max(140),
    category: z.string().min(2).max(60),
    message: z.string().min(10, 'Describe your issue (min 10 characters)').max(3000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid support ticket' });
    return;
  }
  const id = createId('tkt');
  db.prepare(
    `INSERT INTO support_tickets (id, user_id, subject, category, message, status)
     VALUES (?, ?, ?, ?, ?, 'open')`
  ).run(id, req.user!.id, parsed.data.subject.trim(), parsed.data.category, parsed.data.message.trim());

  const ticket = db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);
  res.status(201).json({ ticket });
});

// ============================================================================
// ADMIN DASHBOARD (STRICT RBAC)
// ============================================================================

app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
  const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  const activeSubscriptions = (
    db.prepare("SELECT COUNT(*) as c FROM users WHERE plan != 'free'").get() as { c: number }
  ).c;
  const totalGenerations = (db.prepare('SELECT COUNT(*) as c FROM video_jobs').get() as { c: number }).c;
  const completedGenerations = (
    db.prepare("SELECT COUNT(*) as c FROM video_jobs WHERE status = 'completed'").get() as {
      c: number;
    }
  ).c;
  const failedGenerations = (
    db.prepare("SELECT COUNT(*) as c FROM video_jobs WHERE status = 'failed'").get() as {
      c: number;
    }
  ).c;
  const totalStorageBytes = (
    db.prepare('SELECT COALESCE(SUM(storage_used_bytes), 0) as s FROM users').get() as { s: number }
  ).s;

  const users = (
    db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 100').all() as DbUserRow[]
  ).map(toUserPublic);

  const apiLogs = (
    db
      .prepare('SELECT * FROM api_usage_logs ORDER BY created_at DESC LIMIT 80')
      .all() as Record<string, unknown>[]
  ).map((l) => ({
      id: l.id,
      userId: l.user_id,
      provider: l.provider,
      model: l.model,
      operation: l.operation,
      status: l.status,
      latencyMs: l.latency_ms,
      errorDetail: l.error_detail,
      createdAt: l.created_at,
    }));

  const recentFailures = db
    .prepare(
      `SELECT vj.id, vj.provider, vj.prompt, vj.error_message, vj.created_at, u.email as user_email
       FROM video_jobs vj JOIN users u ON u.id = vj.user_id
       WHERE vj.status = 'failed' ORDER BY vj.created_at DESC LIMIT 20`
    )
    .all();

  const providers = await getProviderHealthList();

  res.json({
    metrics: {
      totalUsers,
      activeSubscriptions,
      totalGenerations,
      completedGenerations,
      failedGenerations,
      totalStorageBytes,
    },
    users,
    apiLogs,
    recentFailures,
    providers,
  });
});

app.post('/api/admin/users/:id/credits', requireAdmin, (req, res) => {
  const schema = z.object({
    delta: z.number().int().min(-100000).max(100000),
    reason: z.string().min(3).max(200),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credit adjustment' });
    return;
  }
  try {
    const result = adjustCreditsAtomic({
      userId: req.params.id,
      delta: parsed.data.delta,
      type: 'admin_adjustment',
      description: `Admin (${req.user!.email}): ${parsed.data.reason}`,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: extractApiErrorMessage(err) });
  }
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const schema = z.object({
    plan: z.enum(['free', 'basic', 'pro', 'premium']).optional(),
    role: z.enum(['user', 'admin']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user update' });
    return;
  }
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as
    | DbUserRow
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  if (parsed.data.plan) {
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(parsed.data.plan as PlanTier, target.id);
  }
  if (parsed.data.role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(parsed.data.role, target.id);
  }
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id) as DbUserRow;
  res.json({ user: toUserPublic(updated) });
});

// ============================================================================
// ERROR HANDLER FOR API ROUTES
// ============================================================================

app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Error]', err);
  res.status(500).json({ error: extractApiErrorMessage(err) });
});

// ============================================================================
// VITE MIDDLEWARE (DEV) / STATIC DIST (PROD)
// ============================================================================

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`CINEGEN AI server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CINEGEN AI server:', err);
  process.exit(1);
});
