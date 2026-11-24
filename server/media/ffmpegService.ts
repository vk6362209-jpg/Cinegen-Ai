import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { AspectRatio, TransitionType, VideoQuality } from '../../src/types/cinegen.ts';
import { createId, resolveSafeStoragePath, STORAGE_DIR } from '../db.ts';

const execFileAsync = promisify(execFile);

let ffmpegAvailableCache: boolean | null = null;

export async function checkFfmpegAvailable(): Promise<boolean> {
  if (ffmpegAvailableCache !== null) return ffmpegAvailableCache;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    ffmpegAvailableCache = true;
  } catch {
    ffmpegAvailableCache = false;
  }
  return ffmpegAvailableCache;
}

export function getResolutionDimensions(
  aspectRatio: AspectRatio,
  quality: VideoQuality
): { width: number; height: number } {
  const isVertical = aspectRatio === '9:16';
  if (quality === '4k') {
    return isVertical ? { width: 2160, height: 3840 } : { width: 3840, height: 2160 };
  }
  if (quality === '1080p') {
    return isVertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  }
  return isVertical ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\'"[\]{};]/g, '')
    .replace(/,/g, ' -')
    .replace(/:/g, ' -')
    .replace(/%/g, ' pct')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 88);
}

function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe - Math.floor(safe)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export async function probeMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { timeout: 15000 }
    );
    const parsed = parseFloat(stdout.trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10) / 10 : 0;
  } catch {
    return 0;
  }
}

const DEMO_PALETTES = [
  { bg: '0x0E1726', accent: '0xD97706' },
  { bg: '0x15131F', accent: '0xF59E0B' },
  { bg: '0x0F1C1A', accent: '0x10B981' },
  { bg: '0x1E1418', accent: '0xE11D48' },
  { bg: '0x121822', accent: '0x38BDF8' },
];

/**
 * Generates a clearly watermarked DEMO MODE storyboard preview clip using FFmpeg.
 * Supports either an uploaded reference image (with smooth Ken Burns motion)
 * or a rich dark cinema storyboard frame with animated visual motion.
 */
export async function renderDemoSceneClip(params: {
  sceneIndex: number;
  title: string;
  visualPrompt: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  referenceImagePath?: string | null;
}): Promise<{ filename: string; filePath: string; sizeBytes: number; durationSec: number }> {
  const filename = `${createId('demo_scene')}.mp4`;
  const filePath = resolveSafeStoragePath(filename);
  const { width, height } = getResolutionDimensions(
    params.aspectRatio,
    params.quality === '4k' ? '1080p' : params.quality
  );
  const safeDuration = Math.max(3, Math.min(20, Math.round(params.durationSec)));
  const palette = DEMO_PALETTES[params.sceneIndex % DEMO_PALETTES.length];

  const badgeText = escapeDrawtext('DEMO MODE - STORYBOARD PREVIEW (NOT LIVE AI VIDEO)');
  const sceneLabel = escapeDrawtext(`SCENE ${String(params.sceneIndex + 1).padStart(2, '0')} - ${params.title}`);
  const promptLine = escapeDrawtext(params.visualPrompt);

  const fontFile = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
    ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    : '';
  const fontArg = fontFile ? `fontfile=${fontFile}:` : '';

  const textOverlays = [
    `drawbox=x=0:y=0:w=iw:h=46:color=black@0.72:t=fill`,
    `drawtext=${fontArg}text='${badgeText}':fontcolor=0xF59E0B:fontsize=17:x=(w-text_w)/2:y=15`,
    `drawbox=x=36:y=ih-132:w=iw-72:h=96:color=black@0.68:t=fill`,
    `drawtext=${fontArg}text='${sceneLabel}':fontcolor=white:fontsize=24:x=56:y=h-116`,
    `drawtext=${fontArg}text='${promptLine}':fontcolor=0xD1D5DB:fontsize=16:x=56:y=h-78`,
  ].join(',');

  if (params.referenceImagePath && fs.existsSync(params.referenceImagePath)) {
    const frames = safeDuration * 24;
    const vf = [
      `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase`,
      `crop=${width * 2}:${height * 2}`,
      `zoompan=z='min(zoom+0.0012,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=24`,
      textOverlays,
      `fade=t=in:st=0:d=0.4,fade=t=out:st=${Math.max(0.5, safeDuration - 0.4)}:d=0.4`,
    ].join(',');

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-loop',
        '1',
        '-i',
        params.referenceImagePath,
        '-t',
        String(safeDuration),
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        filePath,
      ],
      { timeout: 90000 }
    );
  } else {
    // Procedural cinema storyboard plate with clean anamorphic framing bands
    const vf = [
      `drawbox=x=0:y=46:w=iw:h=2:color=${palette.accent}@0.35:t=fill`,
      `drawbox=x=36:y=ih-136:w=iw-72:h=2:color=${palette.accent}@0.45:t=fill`,
      textOverlays,
      `fade=t=in:st=0:d=0.4,fade=t=out:st=${Math.max(0.5, safeDuration - 0.4)}:d=0.4`,
    ].join(',');

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=${palette.bg}:s=${width}x${height}:r=24:d=${safeDuration}`,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        filePath,
      ],
      { timeout: 60000 }
    );
  }

  const stats = fs.statSync(filePath);
  const measured = (await probeMediaDuration(filePath)) || safeDuration;
  return { filename, filePath, sizeBytes: stats.size, durationSec: measured };
}

export async function generateAmbientMusicBed(
  bedId: string,
  durationSec: number
): Promise<{ filename: string; filePath: string; sizeBytes: number } | null> {
  if (bedId === 'none') return null;
  const filename = `${createId('music_bed')}.wav`;
  const filePath = resolveSafeStoragePath(filename);
  const safeDur = Math.max(5, Math.min(310, Math.ceil(durationSec)));

  let expr = '0.07*sin(2*PI*110*t)+0.05*sin(2*PI*164.81*t)+0.04*sin(2*PI*220*t)*(0.7+0.3*sin(0.4*t))';
  if (bedId === 'pulse-focus') {
    expr = '0.06*sin(2*PI*146.83*t)*(0.6+0.4*sin(4*t))+0.04*sin(2*PI*220*t)+0.03*sin(2*PI*293.66*t)';
  } else if (bedId === 'tension-drone') {
    expr = '0.08*sin(2*PI*65.41*t)+0.05*sin(2*PI*69.3*t)+0.03*sin(2*PI*130.81*t)*(0.5+0.5*sin(0.25*t))';
  } else if (bedId === 'uplift-chord') {
    expr = '0.06*sin(2*PI*130.81*t)+0.05*sin(2*PI*196*t)+0.04*sin(2*PI*261.63*t)*(0.75+0.25*sin(0.8*t))';
  }

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `aevalsrc=${expr}:s=24000:d=${safeDur}`,
      '-af',
      `afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(1, safeDur - 2)}:d=2`,
      filePath,
    ],
    { timeout: 60000 }
  );

  const stats = fs.statSync(filePath);
  return { filename, filePath, sizeBytes: stats.size };
}

export async function renderDemoStoryboardImage(params: {
  prompt: string;
  aspectRatio: string;
  style: string;
}): Promise<{ filename: string; filePath: string; sizeBytes: number }> {
  const filename = `${createId('demo_img')}.png`;
  const filePath = resolveSafeStoragePath(filename);

  let width = 1280;
  let height = 720;
  if (params.aspectRatio === '9:16') {
    width = 720;
    height = 1280;
  } else if (params.aspectRatio === '1:1') {
    width = 1024;
    height = 1024;
  } else if (params.aspectRatio === '4:3') {
    width = 1024;
    height = 768;
  }

  const fontFile = fs.existsSync('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
    ? '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    : '';
  const fontArg = fontFile ? `fontfile=${fontFile}:` : '';

  const header = escapeDrawtext(`DEMO MODE CONCEPT FRAME - ${params.style.toUpperCase()}`);
  const body = escapeDrawtext(params.prompt);

  const vf = [
    `drawbox=x=0:y=0:w=iw:h=52:color=black@0.75:t=fill`,
    `drawtext=${fontArg}text='${header}':fontcolor=0xF59E0B:fontsize=18:x=32:y=17`,
    `drawbox=x=32:y=ih-120:w=iw-64:h=84:color=black@0.7:t=fill`,
    `drawtext=${fontArg}text='${body}':fontcolor=white:fontsize=20:x=48:y=h-88`,
  ].join(',');

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=0x131824:s=${width}x${height}:d=1`,
      '-frames:v',
      '1',
      '-vf',
      vf,
      filePath,
    ],
    { timeout: 30000 }
  );

  const stats = fs.statSync(filePath);
  return { filename, filePath, sizeBytes: stats.size };
}

export interface AssembleSceneInput {
  videoPath: string;
  audioPath?: string | null;
  narrationText?: string;
  durationSec: number;
  trimStartSec?: number;
  trimEndSec?: number;
  transition?: TransitionType;
}

export async function assembleMultiSceneVideo(params: {
  scenes: AssembleSceneInput[];
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  musicPath?: string | null;
  voiceVolume?: number;
  musicVolume?: number;
  includeSubtitles?: boolean;
}): Promise<{ filename: string; filePath: string; sizeBytes: number; durationSec: number }> {
  if (params.scenes.length === 0) {
    throw new Error('At least one rendered scene clip is required for assembly.');
  }

  const { width, height } = getResolutionDimensions(
    params.aspectRatio,
    params.quality === '4k' ? '1080p' : params.quality
  );
  const workPrefix = createId('asm');
  const tempFiles: string[] = [];

  try {
    const normalizedPaths: string[] = [];
    const srtEntries: string[] = [];
    let cursorSec = 0;

    for (let i = 0; i < params.scenes.length; i++) {
      const s = params.scenes[i];
      const normFile = path.resolve(STORAGE_DIR, `${workPrefix}_norm_${i}.mp4`);
      tempFiles.push(normFile);

      const trimStart = Math.max(0, s.trimStartSec ?? 0);
      const rawEnd = s.trimEndSec && s.trimEndSec > trimStart ? s.trimEndSec : s.durationSec;
      const clipDur = Math.max(1, rawEnd - trimStart);

      const fadeFilter =
        s.transition === 'cut'
          ? ''
          : `,fade=t=in:st=0:d=0.35,fade=t=out:st=${Math.max(0.4, clipDur - 0.35)}:d=0.35`;

      const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=24,format=yuv420p${fadeFilter}`;

      const args: string[] = ['-y'];
      if (trimStart > 0) {
        args.push('-ss', String(trimStart));
      }
      args.push('-i', s.videoPath);

      if (s.audioPath && fs.existsSync(s.audioPath)) {
        args.push('-i', s.audioPath);
        args.push(
          '-t',
          String(clipDur),
          '-vf',
          vf,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-af',
          `apad=whole_dur=${clipDur},volume=${Math.max(0, Math.min(2, params.voiceVolume ?? 1))}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-c:a',
          'aac',
          '-ar',
          '24000',
          '-ac',
          '1',
          normFile
        );
      } else {
        args.push(
          '-f',
          'lavfi',
          '-t',
          String(clipDur),
          '-i',
          'anullsrc=r=24000:cl=mono',
          '-t',
          String(clipDur),
          '-vf',
          vf,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-c:a',
          'aac',
          '-ar',
          '24000',
          '-ac',
          '1',
          normFile
        );
      }

      await execFileAsync('ffmpeg', args, { timeout: 120000 });
      normalizedPaths.push(normFile);

      const actualClipDur = (await probeMediaDuration(normFile)) || clipDur;
      if (params.includeSubtitles && s.narrationText && s.narrationText.trim()) {
        srtEntries.push(
          `${srtEntries.length + 1}\n${formatSrtTime(cursorSec + 0.15)} --> ${formatSrtTime(
            cursorSec + Math.max(0.6, actualClipDur - 0.15)
          )}\n${s.narrationText.trim().slice(0, 180)}\n`
        );
      }
      cursorSec += actualClipDur;
    }

    const concatListFile = path.resolve(STORAGE_DIR, `${workPrefix}_list.txt`);
    tempFiles.push(concatListFile);
    const listContent = normalizedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatListFile, listContent, 'utf8');

    const mergedVideo = path.resolve(STORAGE_DIR, `${workPrefix}_merged.mp4`);
    tempFiles.push(mergedVideo);

    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatListFile,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-c:a',
        'aac',
        '-ar',
        '24000',
        '-ac',
        '1',
        mergedVideo,
      ],
      { timeout: 180000 }
    );

    const finalFilename = `${createId('render')}.mp4`;
    const finalFilePath = resolveSafeStoragePath(finalFilename);

    let srtPath: string | null = null;
    if (params.includeSubtitles && srtEntries.length > 0) {
      srtPath = path.resolve(STORAGE_DIR, `${workPrefix}_subs.srt`);
      tempFiles.push(srtPath);
      fs.writeFileSync(srtPath, srtEntries.join('\n'), 'utf8');
    }

    const hasMusic = Boolean(params.musicPath && fs.existsSync(params.musicPath));
    const musicVol = Math.max(0, Math.min(1.5, params.musicVolume ?? 0.25));

    if (!hasMusic && !srtPath) {
      fs.copyFileSync(mergedVideo, finalFilePath);
    } else {
      const finalArgs: string[] = ['-y', '-i', mergedVideo];
      if (hasMusic && params.musicPath) {
        finalArgs.push('-stream_loop', '-1', '-i', params.musicPath);
      }

      const filters: string[] = [];
      let videoMap = '0:v:0';
      let audioMap = '0:a:0';

      if (srtPath) {
        const escapedSrt = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        filters.push(
          `[0:v:0]subtitles='${escapedSrt}':force_style='FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,MarginV=24'[vout]`
        );
        videoMap = '[vout]';
      }

      if (hasMusic) {
        filters.push(
          `[1:a:0]volume=${musicVol}[bgm];[0:a:0][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`
        );
        audioMap = '[aout]';
      }

      if (filters.length > 0) {
        finalArgs.push('-filter_complex', filters.join(';'));
      }

      finalArgs.push(
        '-map',
        videoMap,
        '-map',
        audioMap,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        finalFilePath
      );

      await execFileAsync('ffmpeg', finalArgs, { timeout: 240000 });
    }

    const stats = fs.statSync(finalFilePath);
    const durationSec = (await probeMediaDuration(finalFilePath)) || cursorSec;
    return { filename: finalFilename, filePath: finalFilePath, sizeBytes: stats.size, durationSec };
  } finally {
    for (const f of tempFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // ignore cleanup error
      }
    }
  }
}
