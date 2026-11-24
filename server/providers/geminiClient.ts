import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import {
  GeneratedScript,
  MONETIZATION_DISCLAIMER,
  YouTubeCreatorPackage,
} from '../../src/types/cinegen.ts';
import { createId, recordApiUsage, resolveSafeStoragePath } from '../db.ts';

let cachedAi: GoogleGenAI | null = null;
let cachedBetaAi: GoogleGenAI | null = null;

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 10);
}

export function getGeminiClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY in environment variables or Settings > Secrets.'
    );
  }
  if (!cachedAi) {
    cachedAi = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAi;
}

export function getGeminiBetaClient(): GoogleGenAI {
  if (!isGeminiConfigured()) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Set GEMINI_API_KEY in environment variables or Settings > Secrets.'
    );
  }
  if (!cachedBetaAi) {
    cachedBetaAi = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedBetaAi;
}

export function extractApiErrorMessage(err: unknown): string {
  if (!err) return 'Unknown upstream API error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export function isPaidKeyOrQuotaError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('403') ||
    lower.includes('429') ||
    lower.includes('permission_denied') ||
    lower.includes('resource_exhausted') ||
    lower.includes('billing') ||
    lower.includes('paid') ||
    lower.includes('quota')
  );
}

export async function withExponentialRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 1200
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = extractApiErrorMessage(err);
      // Do not retry hard auth/billing/validation errors
      if (
        msg.includes('400') ||
        msg.includes('401') ||
        msg.includes('403') ||
        msg.includes('404') ||
        msg.includes('API_KEY_INVALID')
      ) {
        throw err;
      }
      if (attempt < retries) {
        const waitMs = baseDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError;
}

const COPYRIGHT_WATCHLIST = [
  'disney',
  'marvel',
  'avengers',
  'spider-man',
  'batman',
  'superman',
  'star wars',
  'harry potter',
  'pokemon',
  'nintendo',
  'netflix',
  'taylor swift',
  'elon musk',
  'donald trump',
  'tom cruise',
  'coca-cola',
  'nike',
];

export function scanCopyrightKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return COPYRIGHT_WATCHLIST.filter((term) => lower.includes(term));
}

export function computeTargetSceneCount(targetDurationSec: number, maxClipSec = 10): number {
  const safeDur = Math.max(10, Math.min(300, targetDurationSec));
  const count = Math.ceil(safeDur / maxClipSec);
  return Math.max(1, Math.min(30, count));
}

export async function generateScriptWithGemini(params: {
  userId?: string;
  topic: string;
  format: string;
  language: string;
  tone: string;
  durationSec: number;
  audience: string;
  storytellingStyle: string;
  voiceoverStyle: string;
  visualStyle?: string;
}): Promise<GeneratedScript> {
  const start = Date.now();
  const maxClipSec = params.durationSec >= 120 ? 15 : 10;
  const sceneCount = computeTargetSceneCount(params.durationSec, maxClipSec);
  const perSceneSec = Math.max(5, Math.round(params.durationSec / sceneCount));
  const flaggedTerms = scanCopyrightKeywords(params.topic);

  const ai = getGeminiClient();
  const systemInstruction = `You are a senior film director and screenwriter for CINEGEN AI.
Write 100% ORIGINAL scripts, characters, dialogue, and visual scene descriptions.
NEVER copy copyrighted movies, TV shows, songs, trademarked franchises, or impersonate real celebrities.
Divide the script into exactly ${sceneCount} sequential scenes totaling approximately ${params.durationSec} seconds (~${perSceneSec}s each).
Maintain strict visual continuity across scenes via a clear visualConsistencyBible (recurring lighting, palette, lens, character wardrobe, setting).
Write narration in the requested language (${params.language}), while keeping visualPrompt in clear descriptive English for AI video models.`;

  const prompt = `Create a complete multi-scene production script.
Topic/Idea: ${params.topic}
Format: ${params.format}
Language for narration: ${params.language}
Tone: ${params.tone}
Target Total Duration: ${params.durationSec} seconds (${sceneCount} scenes, ~${perSceneSec} seconds each)
Target Audience: ${params.audience}
Storytelling Style: ${params.storytellingStyle}
Voiceover Style: ${params.voiceoverStyle}
Visual Style: ${params.visualStyle ?? 'Cinematic'}`;

  try {
    const response = await withExponentialRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              logline: { type: Type.STRING },
              visualConsistencyBible: { type: Type.STRING },
              copyrightSafetyNotes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    durationSec: { type: Type.INTEGER },
                    narration: { type: Type.STRING },
                    visualPrompt: { type: Type.STRING },
                    cameraMovement: { type: Type.STRING },
                    lighting: { type: Type.STRING },
                    soundCue: { type: Type.STRING },
                  },
                  required: [
                    'sceneNumber',
                    'title',
                    'durationSec',
                    'narration',
                    'visualPrompt',
                    'cameraMovement',
                    'lighting',
                    'soundCue',
                  ],
                },
              },
            },
            required: ['title', 'logline', 'visualConsistencyBible', 'copyrightSafetyNotes', 'scenes'],
          },
        },
      })
    );

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<GeneratedScript>;
    const scenes = (parsed.scenes ?? []).map((s, idx) => ({
      sceneNumber: idx + 1,
      title: s.title || `Scene ${idx + 1}`,
      durationSec: Math.max(5, Math.min(15, Number(s.durationSec) || perSceneSec)),
      narration: s.narration || '',
      visualPrompt: s.visualPrompt || params.topic,
      cameraMovement: s.cameraMovement || 'Slow Cinematic Dolly In',
      lighting: s.lighting || 'Golden Hour Natural',
      soundCue: s.soundCue || 'Subtle ambient atmosphere',
    }));

    const totalDurationSec = scenes.reduce((acc, s) => acc + s.durationSec, 0);

    recordApiUsage({
      userId: params.userId,
      provider: 'google-gemini',
      model: 'gemini-4-hydrogen',
      operation: 'script_generation',
      status: 'success',
      latencyMs: Date.now() - start,
    });

    return {
      title: parsed.title || 'Untitled Production',
      logline: parsed.logline || params.topic,
      visualConsistencyBible:
        parsed.visualConsistencyBible ||
        `${params.visualStyle ?? 'Cinematic'} color palette, consistent 35mm lens framing and lighting continuity.`,
      format: params.format,
      language: params.language,
      tone: params.tone,
      totalDurationSec,
      scenes,
      copyrightSafetyNotes: [
        ...(parsed.copyrightSafetyNotes ?? []),
        'Original script generated without copying copyrighted media.',
      ],
      flaggedTerms,
    };
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    recordApiUsage({
      userId: params.userId,
      provider: 'google-gemini',
      model: 'gemini-4-hydrogen',
      operation: 'script_generation',
      status: 'error',
      latencyMs: Date.now() - start,
      errorDetail: msg,
    });
    throw new Error(`Gemini script generation failed: ${msg}`);
  }
}

export async function generateVoiceWithGemini(params: {
  userId?: string;
  text: string;
  voiceName: string;
  style?: string;
  language?: string;
  multiSpeaker?: boolean;
  secondVoiceName?: string;
  secondSpeakerText?: string;
}): Promise<{ filename: string; filePath: string; sizeBytes: number; model: string }> {
  const start = Date.now();
  const ai = getGeminiBetaClient();
  const validVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
  const primaryVoice = validVoices.includes(params.voiceName) ? params.voiceName : 'Kore';
  const secondaryVoice = validVoices.includes(params.secondVoiceName ?? '')
    ? (params.secondVoiceName as string)
    : 'Puck';

  const useMulti = Boolean(params.multiSpeaker && params.secondSpeakerText?.trim());
  const model = useMulti ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';
  const styleDesc = [params.style || 'Clear, natural studio narration', params.language ? `Language: ${params.language}` : '']
    .filter(Boolean)
    .join('. ');

  try {
    const response = await withExponentialRetry(() =>
      useMulti
        ? ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Host: ${params.text.trim()}`,
                    speechMetadata: { speaker: 'Host', style: styleDesc },
                  },
                  {
                    text: `Guest: ${params.secondSpeakerText!.trim()}`,
                    speechMetadata: { speaker: 'Guest', style: styleDesc },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    { speaker: 'Host', voiceConfig: { prebuiltVoiceConfig: { voiceName: primaryVoice } } },
                    { speaker: 'Guest', voiceConfig: { prebuiltVoiceConfig: { voiceName: secondaryVoice } } },
                  ],
                },
              },
            },
          })
        : ai.models.generateContent({
            model,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: params.text.trim(),
                    speechMetadata: { style: styleDesc },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: primaryVoice },
                },
              },
            },
          })
    );

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error('No audio payload returned from Gemini TTS model.');
    }

    const wavBuffer = Buffer.from(base64Audio, 'base64');
    const filename = `${createId('voice')}.wav`;
    const filePath = resolveSafeStoragePath(filename);
    fs.writeFileSync(filePath, wavBuffer);

    recordApiUsage({
      userId: params.userId,
      provider: 'google-gemini-tts',
      model,
      operation: useMulti ? 'multi_speaker_tts' : 'single_speaker_tts',
      status: 'success',
      latencyMs: Date.now() - start,
    });

    return { filename, filePath, sizeBytes: wavBuffer.length, model };
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    recordApiUsage({
      userId: params.userId,
      provider: 'google-gemini-tts',
      model,
      operation: 'tts_generation',
      status: 'error',
      latencyMs: Date.now() - start,
      errorDetail: msg,
    });
    throw new Error(`AI Voice generation failed: ${msg}`);
  }
}

export async function generateImageWithGemini(params: {
  userId?: string;
  prompt: string;
  aspectRatio: string;
  highQuality?: boolean;
}): Promise<{ filename: string; filePath: string; mimeType: string; sizeBytes: number; model: string }> {
  const start = Date.now();
  const ai = getGeminiBetaClient();
  const model = params.highQuality ? 'gemini-nano-banana-2.1' : 'gemini-3.1-flash-lite-image';
  const allowedRatios = ['1:1', '3:4', '4:3', '9:16', '16:9'];
  const ratio = allowedRatios.includes(params.aspectRatio) ? params.aspectRatio : '16:9';

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text: params.prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: ratio,
          ...(params.highQuality ? { imageSize: '1K' } : {}),
        },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        const mimeType = part.inlineData.mimeType ?? 'image/png';
        const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        const filename = `${createId('img')}.${ext}`;
        const filePath = resolveSafeStoragePath(filename);
        fs.writeFileSync(filePath, buffer);

        recordApiUsage({
          userId: params.userId,
          provider: 'google-gemini-image',
          model,
          operation: 'text_to_image',
          status: 'success',
          latencyMs: Date.now() - start,
        });

        return { filename, filePath, mimeType, sizeBytes: buffer.length, model };
      }
    }
    throw new Error('No image part returned by the model.');
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    recordApiUsage({
      userId: params.userId,
      provider: 'google-gemini-image',
      model,
      operation: 'text_to_image',
      status: 'error',
      latencyMs: Date.now() - start,
      errorDetail: msg,
    });
    throw new Error(
      isPaidKeyOrQuotaError(msg)
        ? `Image model (${model}) requires a billing-enabled GEMINI_API_KEY in Settings > Secrets. (${msg})`
        : `Image generation failed: ${msg}`
    );
  }
}

export async function generateMusicWithLyria(params: {
  userId?: string;
  prompt: string;
}): Promise<{ filename: string; filePath: string; mimeType: string; sizeBytes: number; lyrics: string }> {
  const start = Date.now();
  const ai = getGeminiBetaClient();
  const model = 'lyria-3-clip-preview';

  try {
    const response = await ai.models.generateContentStream({
      model,
      contents: params.prompt,
    });

    const audioChunks: Buffer[] = [];
    let lyrics = '';
    let mimeType = 'audio/mpeg';

    for await (const chunk of response) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (audioChunks.length === 0 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
        }
        if (part.text) {
          lyrics += part.text;
        }
      }
    }

    if (audioChunks.length === 0) {
      throw new Error('No audio stream returned by Lyria.');
    }

    const buffer = Buffer.concat(audioChunks);
    const ext = mimeType.includes('wav') ? 'wav' : 'mp3';
    const filename = `${createId('lyria')}.${ext}`;
    const filePath = resolveSafeStoragePath(filename);
    fs.writeFileSync(filePath, buffer);

    recordApiUsage({
      userId: params.userId,
      provider: 'google-lyria',
      model,
      operation: 'music_generation',
      status: 'success',
      latencyMs: Date.now() - start,
    });

    return { filename, filePath, mimeType, sizeBytes: buffer.length, lyrics };
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    recordApiUsage({
      userId: params.userId,
      provider: 'google-lyria',
      model,
      operation: 'music_generation',
      status: 'error',
      latencyMs: Date.now() - start,
      errorDetail: msg,
    });
    throw new Error(
      isPaidKeyOrQuotaError(msg)
        ? `Lyria AI Music (${model}) requires a billing-enabled GEMINI_API_KEY in Settings > Secrets. You can use our built-in CC0 studio ambient beds immediately.`
        : `Lyria music generation failed: ${msg}`
    );
  }
}

export async function generateYouTubePackageWithGemini(params: {
  userId?: string;
  topic: string;
  mode: 'youtube-shorts' | 'youtube-long';
  category: string;
  language: string;
  scriptSummary?: string;
}): Promise<YouTubeCreatorPackage> {
  const start = Date.now();
  const ai = getGeminiClient();
  const localRisks = scanCopyrightKeywords(`${params.topic} ${params.scriptSummary ?? ''}`);

  const systemInstruction = `You are a YouTube Creator Strategy & Content Originality Assistant for CINEGEN AI.
Generate high-retention, honest, original metadata for ${params.mode === 'youtube-shorts' ? 'YouTube Shorts (9:16)' : 'YouTube Long-Form (16:9)'}.
Strictly check for potential trademark, celebrity impersonation, or copyrighted franchise references and report them transparently in copyrightRisks.
Never promise guaranteed monetization.`;

  const prompt = `Generate a complete YouTube Creator Package in ${params.language}.
Topic: ${params.topic}
Category: ${params.category}
Format: ${params.mode}
Script Context: ${params.scriptSummary || 'Original creator concept'}`;

  try {
    const response = await withExponentialRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              titles: { type: Type.ARRAY, items: { type: Type.STRING } },
              description: { type: Type.STRING },
              hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              thumbnailPrompt: { type: Type.STRING },
              hookSuggestion: { type: Type.STRING },
              originalityScoreNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
              copyrightRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'titles',
              'description',
              'hashtags',
              'tags',
              'thumbnailPrompt',
              'hookSuggestion',
              'originalityScoreNotes',
              'copyrightRisks',
            ],
          },
        },
      })
    );

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<YouTubeCreatorPackage>;

    recordApiUsage({
      userId: params.userId,
      provider: 'google-gemini',
      model: 'gemini-4-hydrogen',
      operation: 'youtube_creator_package',
      status: 'success',
      latencyMs: Date.now() - start,
    });

    const combinedRisks = [
      ...(parsed.copyrightRisks ?? []),
      ...localRisks.map(
        (term) => `Potential trademark/protected reference detected: "${term}". Replace with an original concept before publishing.`
      ),
    ];

    return {
      titles: parsed.titles?.length ? parsed.titles : [params.topic],
      description: parsed.description || '',
      hashtags: parsed.hashtags ?? [],
      tags: parsed.tags ?? [],
      thumbnailPrompt: parsed.thumbnailPrompt || `Cinematic high-contrast YouTube thumbnail for ${params.topic}`,
      hookSuggestion: parsed.hookSuggestion || '',
      originalityScoreNotes: parsed.originalityScoreNotes ?? [],
      copyrightRisks: combinedRisks,
      monetizationDisclaimer: MONETIZATION_DISCLAIMER,
    };
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    recordApiUsage({
      userId: params.userId,
      provider: 'google-gemini',
      model: 'gemini-4-hydrogen',
      operation: 'youtube_creator_package',
      status: 'error',
      latencyMs: Date.now() - start,
      errorDetail: msg,
    });
    throw new Error(`YouTube Creator Assistant failed: ${msg}`);
  }
}
