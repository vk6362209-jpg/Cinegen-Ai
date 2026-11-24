import fs from 'fs';
import {
  AspectRatio,
  ProviderHealthStatus,
  VideoProviderId,
  VideoQuality,
} from '../../src/types/cinegen.ts';
import { createId, recordApiUsage, resolveSafeStoragePath } from '../db.ts';
import {
  checkFfmpegAvailable,
  probeMediaDuration,
  renderDemoSceneClip,
} from '../media/ffmpegService.ts';
import {
  extractApiErrorMessage,
  getGeminiClient,
  isGeminiConfigured,
  isPaidKeyOrQuotaError,
} from './geminiClient.ts';

export interface SceneClipGenerationRequest {
  userId: string;
  sceneIndex: number;
  title: string;
  prompt: string;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  durationSec: number;
  referenceImagePath?: string | null;
  referenceImageMimeType?: string | null;
  previousInteractionId?: string | null;
}

export interface SceneClipGenerationResult {
  filename: string;
  filePath: string;
  sizeBytes: number;
  durationSec: number;
  provider: VideoProviderId;
  providerTaskId?: string | null;
  isDemo: boolean;
}

export interface VideoProviderAdapter {
  id: VideoProviderId;
  name: string;
  maxClipDurationSec: number;
  supports4k: boolean;
  isConfigured(): boolean;
  generateSceneClip(req: SceneClipGenerationRequest): Promise<SceneClipGenerationResult>;
}

/**
 * Google Veo / Omni Flash Adapter (gemini-omni-1.2-flash via @google/genai Interactions API)
 * Supports Text-to-Video, Image-to-Video, 3s-15s clips, 720p/1080p/4k, and multi-turn consistency via previous_interaction_id.
 */
export class GoogleVeoOmniAdapter implements VideoProviderAdapter {
  id: VideoProviderId = 'google-veo';
  name = 'Google Veo (Gemini Omni Flash)';
  maxClipDurationSec = 15;
  supports4k = true;

  isConfigured(): boolean {
    return isGeminiConfigured();
  }

  async generateSceneClip(req: SceneClipGenerationRequest): Promise<SceneClipGenerationResult> {
    const start = Date.now();
    const ai = getGeminiClient();
    const clampedSec = Math.max(3, Math.min(15, Math.round(req.durationSec)));
    const resolutionMap: Record<VideoQuality, '720p' | '1080p' | '4k'> = {
      '720p': '720p',
      '1080p': '1080p',
      '4k': '4k',
    };

    try {
      let inputPayload: unknown = req.prompt;
      if (req.referenceImagePath && fs.existsSync(req.referenceImagePath)) {
        const imgBase64 = fs.readFileSync(req.referenceImagePath).toString('base64');
        inputPayload = [
          {
            type: 'image',
            mime_type: req.referenceImageMimeType || 'image/png',
            data: imgBase64,
          },
          {
            type: 'text',
            text: req.prompt,
          },
        ];
      }

      const interaction = (await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: inputPayload as string,
          ...(req.previousInteractionId ? { previous_interaction_id: req.previousInteractionId } : {}),
          background: false,
          store: true,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: req.aspectRatio,
            duration: `${clampedSec}s`,
            resolution: resolutionMap[req.quality],
          },
        } as Parameters<typeof ai.interactions.create>[0],
        { timeout: 300000 }
      )) as { id?: string; output_video?: { data?: string; uri?: string; mime_type?: string } | null };

      const videoPart = interaction.output_video;
      if (!videoPart?.data) {
        throw new Error('Google Veo / Omni Flash returned no video binary payload.');
      }

      const buffer = Buffer.from(videoPart.data, 'base64');
      const filename = `${createId('veo')}.mp4`;
      const filePath = resolveSafeStoragePath(filename);
      fs.writeFileSync(filePath, buffer);

      const measured = (await probeMediaDuration(filePath)) || clampedSec;

      recordApiUsage({
        userId: req.userId,
        provider: 'google-veo',
        model: 'gemini-omni-1.2-flash',
        operation: req.referenceImagePath ? 'image_to_video' : 'text_to_video',
        status: 'success',
        latencyMs: Date.now() - start,
      });

      return {
        filename,
        filePath,
        sizeBytes: buffer.length,
        durationSec: measured,
        provider: 'google-veo',
        providerTaskId: interaction.id ?? null,
        isDemo: false,
      };
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      recordApiUsage({
        userId: req.userId,
        provider: 'google-veo',
        model: 'gemini-omni-1.2-flash',
        operation: req.referenceImagePath ? 'image_to_video' : 'text_to_video',
        status: 'error',
        latencyMs: Date.now() - start,
        errorDetail: msg,
      });
      if (isPaidKeyOrQuotaError(msg)) {
        throw new Error(
          `Google Veo (gemini-omni-1.2-flash) requires a billing-enabled GEMINI_API_KEY in Settings > Secrets. You may select Demo Mode for clearly watermarked storyboard previews. Upstream error: ${msg}`
        );
      }
      throw new Error(`Google Veo generation failed: ${msg}`);
    }
  }
}

/**
 * Official RunwayML API Adapter (https://api.runwayml.com/v1)
 * Requires RUNWAY_API_KEY environment variable.
 */
export class RunwayAdapter implements VideoProviderAdapter {
  id: VideoProviderId = 'runway';
  name = 'Runway (Gen-4 Turbo API)';
  maxClipDurationSec = 10;
  supports4k = false;

  isConfigured(): boolean {
    const key = process.env.RUNWAY_API_KEY?.trim();
    return Boolean(key && key.length > 10);
  }

  async generateSceneClip(req: SceneClipGenerationRequest): Promise<SceneClipGenerationResult> {
    const start = Date.now();
    const apiKey = process.env.RUNWAY_API_KEY?.trim();
    if (!apiKey) {
      const msg =
        'RUNWAY_API_KEY is not configured on the server. Add RUNWAY_API_KEY to your server environment variables or choose Demo Mode.';
      recordApiUsage({
        userId: req.userId,
        provider: 'runway',
        model: 'gen4_turbo',
        operation: 'video_generation',
        status: 'error',
        latencyMs: 0,
        errorDetail: msg,
      });
      throw new Error(msg);
    }

    if (!req.referenceImagePath || !fs.existsSync(req.referenceImagePath)) {
      const msg =
        'Runway Gen-4 Turbo API (/v1/image_to_video) requires a reference image. Upload an image in Image-to-Video or use Google Veo / Demo Mode for pure Text-to-Video.';
      recordApiUsage({
        userId: req.userId,
        provider: 'runway',
        model: 'gen4_turbo',
        operation: 'text_to_video',
        status: 'error',
        latencyMs: 0,
        errorDetail: msg,
      });
      throw new Error(msg);
    }

    try {
      const imgBase64 = fs.readFileSync(req.referenceImagePath).toString('base64');
      const mime = req.referenceImageMimeType || 'image/png';
      const dataUri = `data:${mime};base64,${imgBase64}`;
      const duration = req.durationSec <= 5 ? 5 : 10;
      const ratio = req.aspectRatio === '9:16' ? '720:1280' : '1280:720';

      const createRes = await fetch('https://api.runwayml.com/v1/image_to_video', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Runway-Version': '2024-11-06',
        },
        body: JSON.stringify({
          model: 'gen4_turbo',
          promptImage: dataUri,
          promptText: req.prompt.slice(0, 1000),
          ratio,
          duration,
        }),
      });

      if (!createRes.ok) {
        const bodyText = await createRes.text();
        throw new Error(`Runway API HTTP ${createRes.status}: ${bodyText}`);
      }

      const created = (await createRes.json()) as { id: string };
      const taskId = created.id;

      // Poll task status up to 3 minutes
      let outputUrl: string | null = null;
      for (let i = 0; i < 36; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const pollRes = await fetch(`https://api.runwayml.com/v1/tasks/${encodeURIComponent(taskId)}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'X-Runway-Version': '2024-11-06',
          },
        });
        if (!pollRes.ok) continue;
        const task = (await pollRes.json()) as {
          status: string;
          output?: string[];
          failure?: string;
        };
        if (task.status === 'SUCCEEDED' && task.output?.[0]) {
          outputUrl = task.output[0];
          break;
        }
        if (task.status === 'FAILED' || task.status === 'CANCELLED') {
          throw new Error(task.failure || `Runway task ${task.status}`);
        }
      }

      if (!outputUrl) {
        throw new Error('Runway generation timed out waiting for task completion.');
      }

      const parsedUrl = new URL(outputUrl);
      if (parsedUrl.protocol !== 'https:') {
        throw new Error('Unexpected non-HTTPS media output URL from Runway.');
      }

      const mediaRes = await fetch(outputUrl);
      if (!mediaRes.ok) {
        throw new Error(`Failed downloading Runway clip (HTTP ${mediaRes.status})`);
      }
      const arrayBuf = await mediaRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const filename = `${createId('runway')}.mp4`;
      const filePath = resolveSafeStoragePath(filename);
      fs.writeFileSync(filePath, buffer);

      const measured = (await probeMediaDuration(filePath)) || duration;

      recordApiUsage({
        userId: req.userId,
        provider: 'runway',
        model: 'gen4_turbo',
        operation: 'image_to_video',
        status: 'success',
        latencyMs: Date.now() - start,
      });

      return {
        filename,
        filePath,
        sizeBytes: buffer.length,
        durationSec: measured,
        provider: 'runway',
        providerTaskId: taskId,
        isDemo: false,
      };
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      recordApiUsage({
        userId: req.userId,
        provider: 'runway',
        model: 'gen4_turbo',
        operation: 'image_to_video',
        status: 'error',
        latencyMs: Date.now() - start,
        errorDetail: msg,
      });
      throw new Error(`Runway generation failed: ${msg}`);
    }
  }
}

/**
 * Clearly Labeled DEMO MODE Adapter
 * Produces real, playable H.264 MP4 storyboard preview clips via FFmpeg stamped with DEMO MODE banners
 * so users can test full multi-scene assembly, voiceover sync, subtitles, music mixing, and MP4 downloads
 * without ever mistaking demo outputs for real AI video API results.
 */
export class DemoStoryboardAdapter implements VideoProviderAdapter {
  id: VideoProviderId = 'demo-mode';
  name = 'Demo Mode (Watermark Storyboard Renderer)';
  maxClipDurationSec = 15;
  supports4k = false;

  isConfigured(): boolean {
    return true;
  }

  async generateSceneClip(req: SceneClipGenerationRequest): Promise<SceneClipGenerationResult> {
    const start = Date.now();
    const rendered = await renderDemoSceneClip({
      sceneIndex: req.sceneIndex,
      title: req.title,
      visualPrompt: req.prompt,
      durationSec: req.durationSec,
      aspectRatio: req.aspectRatio,
      quality: req.quality,
      referenceImagePath: req.referenceImagePath,
    });

    recordApiUsage({
      userId: req.userId,
      provider: 'demo-mode',
      model: 'ffmpeg-storyboard-preview',
      operation: req.referenceImagePath ? 'demo_image_to_video' : 'demo_text_to_video',
      status: 'demo_fallback',
      latencyMs: Date.now() - start,
    });

    return {
      filename: rendered.filename,
      filePath: rendered.filePath,
      sizeBytes: rendered.sizeBytes,
      durationSec: rendered.durationSec,
      provider: 'demo-mode',
      providerTaskId: `demo_${Date.now()}`,
      isDemo: true,
    };
  }
}

const adapters: Record<VideoProviderId, VideoProviderAdapter> = {
  'google-veo': new GoogleVeoOmniAdapter(),
  runway: new RunwayAdapter(),
  'demo-mode': new DemoStoryboardAdapter(),
};

export function getVideoAdapter(id: VideoProviderId): VideoProviderAdapter {
  return adapters[id] ?? adapters['demo-mode'];
}

export async function getProviderHealthList(): Promise<ProviderHealthStatus[]> {
  const geminiReady = isGeminiConfigured();
  const runwayReady = adapters.runway.isConfigured();
  const ffmpegReady = await checkFfmpegAvailable();
  const stripeReady = Boolean(process.env.STRIPE_SECRET_KEY?.trim());

  return [
    {
      id: 'gemini-text',
      name: 'Google Gemini 4 Hydrogen (Scripts & Originality)',
      configured: geminiReady,
      requiresPaidKey: false,
      envVar: 'GEMINI_API_KEY',
      capabilities: ['Multi-scene scripts', 'Scene breakdown', 'YouTube SEO', 'Copyright audit'],
      note: geminiReady
        ? 'Connected via server-side GEMINI_API_KEY.'
        : 'Set GEMINI_API_KEY in environment variables.',
    },
    {
      id: 'gemini-tts',
      name: 'Google Gemini 3.8 TTS (AI Voice Studio)',
      configured: geminiReady,
      requiresPaidKey: false,
      envVar: 'GEMINI_API_KEY',
      capabilities: ['Single-speaker WAV', 'Dual-speaker dialogue', 'English, Telugu & multilingual'],
      note: geminiReady
        ? 'Connected via server-side GEMINI_API_KEY.'
        : 'Set GEMINI_API_KEY in environment variables.',
    },
    {
      id: 'google-veo',
      name: 'Google Veo / Omni Flash (gemini-omni-1.2-flash)',
      configured: geminiReady,
      requiresPaidKey: true,
      envVar: 'GEMINI_API_KEY (Billing-Enabled)',
      capabilities: ['Text-to-Video', 'Image-to-Video', 'Up to 15s/clip', '720p / 1080p / 4K'],
      maxClipDurationSec: 15,
      supports4k: true,
      note: 'Requires a billing-enabled GEMINI_API_KEY for live Veo / Omni Flash video rendering.',
    },
    {
      id: 'runway',
      name: 'RunwayML Gen-4 Turbo API',
      configured: runwayReady,
      requiresPaidKey: true,
      envVar: 'RUNWAY_API_KEY',
      capabilities: ['Image-to-Video', '5s & 10s clips', '720p / 1080p'],
      maxClipDurationSec: 10,
      supports4k: false,
      note: runwayReady
        ? 'Runway API key detected on server.'
        : 'Set RUNWAY_API_KEY in server environment variables to activate Runway Gen-4.',
    },
    {
      id: 'gemini-image',
      name: 'Gemini Image / Nano Banana 2.1',
      configured: geminiReady,
      requiresPaidKey: true,
      envVar: 'GEMINI_API_KEY (Billing-Enabled)',
      capabilities: ['Text-to-Image', 'YouTube Thumbnails', 'Reference Frames'],
      note: 'Requires a billing-enabled GEMINI_API_KEY; Demo Mode concept frames available otherwise.',
    },
    {
      id: 'lyria-music',
      name: 'Google Lyria 3 Music Engine',
      configured: geminiReady,
      requiresPaidKey: true,
      envVar: 'GEMINI_API_KEY (Billing-Enabled)',
      capabilities: ['30s AI Soundtracks', 'Image-to-Music'],
      note: 'Requires a billing-enabled GEMINI_API_KEY; built-in CC0 studio ambient beds always available.',
    },
    {
      id: 'demo-mode',
      name: 'Demo Mode Storyboard Engine',
      configured: ffmpegReady,
      requiresPaidKey: false,
      envVar: 'Local FFmpeg',
      capabilities: ['Watermarked MP4 previews', 'Multi-scene duration test', 'Voiceover & Subtitle sync'],
      maxClipDurationSec: 15,
      supports4k: false,
      note: 'Always available. Explicitly stamps every frame as DEMO MODE preview.',
    },
    {
      id: 'ffmpeg',
      name: 'FFmpeg Multi-Scene MP4 Assembly Engine',
      configured: ffmpegReady,
      requiresPaidKey: false,
      envVar: 'System Binary (/usr/bin/ffmpeg)',
      capabilities: ['Scene concat', 'Trim & Fade transitions', 'Audio mixing', 'SRT subtitle burn-in'],
      note: ffmpegReady ? 'FFmpeg detected and operational.' : 'FFmpeg binary not found on host.',
    },
    {
      id: 'stripe',
      name: 'Stripe Subscription & Billing',
      configured: stripeReady,
      requiresPaidKey: false,
      envVar: 'STRIPE_SECRET_KEY',
      capabilities: ['Checkout Sessions', 'Subscription Webhooks'],
      note: stripeReady
        ? 'Stripe secret key configured for live billing.'
        : 'Not configured. Sandbox plan switching is available for development testing only (no fake card charging).',
    },
  ];
}
