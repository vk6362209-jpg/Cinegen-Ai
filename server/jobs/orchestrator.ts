import fs from 'fs';
import {
  AspectRatio,
  GeneratedScript,
  SceneItem,
  ScriptSceneDraft,
  VideoJobRecord,
  VideoProviderId,
  VideoQuality,
} from '../../src/types/cinegen.ts';
import {
  adjustCreditsAtomic,
  createId,
  db,
  recordMediaAsset,
  resolveSafeStoragePath,
} from '../db.ts';
import {
  assembleMultiSceneVideo,
  generateAmbientMusicBed,
} from '../media/ffmpegService.ts';
import {
  computeTargetSceneCount,
  extractApiErrorMessage,
  generateScriptWithGemini,
  generateVoiceWithGemini,
  isGeminiConfigured,
} from '../providers/geminiClient.ts';
import { getVideoAdapter } from '../providers/videoAdapters.ts';

export interface StartVideoJobInput {
  userId: string;
  projectId?: string;
  title?: string;
  type: 'text-to-video' | 'image-to-video';
  provider: VideoProviderId;
  prompt: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  quality: VideoQuality;
  style: string;
  customStyle?: string;
  cameraMovement: string;
  lighting: string;
  language: string;
  includeVoiceover: boolean;
  voiceName: string;
  musicBedId: string;
  includeSubtitles: boolean;
  allowDemoFallback: boolean;
  referenceImageFilename?: string | null;
  referenceImageMimeType?: string | null;
  existingScript?: GeneratedScript | null;
  creditsCost: number;
}

function buildFallbackScenePlan(input: StartVideoJobInput): GeneratedScript {
  const maxClipSec = input.durationSec >= 120 ? 15 : 10;
  const count = computeTargetSceneCount(input.durationSec, maxClipSec);
  const perScene = Math.max(5, Math.round(input.durationSec / count));
  const styleLabel = input.style === 'Custom' && input.customStyle ? input.customStyle : input.style;

  const beats = [
    'Opening Establishing Shot',
    'Subject Introduction',
    'Developing Visual Momentum',
    'Atmospheric Transition',
    'Core Narrative Beat',
    'Emotional Peak Frame',
    'Perspective Shift',
    'Closing Resolution',
  ];

  const scenes: ScriptSceneDraft[] = [];
  let remaining = input.durationSec;
  for (let i = 0; i < count; i++) {
    const dur = i === count - 1 ? Math.max(5, Math.min(15, remaining)) : Math.min(15, perScene);
    remaining = Math.max(5, remaining - dur);
    const beat = beats[i % beats.length];
    scenes.push({
      sceneNumber: i + 1,
      title: `${beat} (${i + 1}/${count})`,
      durationSec: dur,
      narration:
        i === 0
          ? `${input.prompt.slice(0, 110)}.`
          : `Part ${i + 1}: Continuing the visual sequence with ${input.cameraMovement.toLowerCase()} and ${input.lighting.toLowerCase()}.`,
      visualPrompt: `${styleLabel} style, ${input.lighting}, ${input.cameraMovement}. Scene ${i + 1} of ${count}: ${input.prompt}`,
      cameraMovement: input.cameraMovement,
      lighting: input.lighting,
      soundCue: 'Balanced cinema atmosphere',
    });
  }

  return {
    title: input.title || input.prompt.slice(0, 56),
    logline: input.prompt,
    visualConsistencyBible: `${styleLabel} color grading, ${input.lighting}, ${input.cameraMovement}`,
    format: input.aspectRatio === '9:16' ? 'Vertical Short' : 'Widescreen Production',
    language: input.language,
    tone: styleLabel,
    totalDurationSec: scenes.reduce((acc, s) => acc + s.durationSec, 0),
    scenes,
    copyrightSafetyNotes: ['Original creator prompt processed by CINEGEN AI.'],
    flaggedTerms: [],
  };
}

export function getJobWithScenes(jobId: string, userId?: string): VideoJobRecord | null {
  const jobRow = (
    userId
      ? db.prepare('SELECT * FROM video_jobs WHERE id = ? AND user_id = ?').get(jobId, userId)
      : db.prepare('SELECT * FROM video_jobs WHERE id = ?').get(jobId)
  ) as Record<string, unknown> | undefined;

  if (!jobRow) return null;

  const sceneRows = db
    .prepare('SELECT * FROM scenes WHERE job_id = ? ORDER BY scene_index ASC')
    .all(jobId) as Record<string, unknown>[];

  const scenes: SceneItem[] = sceneRows.map((s) => ({
    id: String(s.id),
    jobId: String(s.job_id),
    projectId: String(s.project_id),
    sceneIndex: Number(s.scene_index),
    title: String(s.title),
    visualPrompt: String(s.visual_prompt),
    narrationText: String(s.narration_text ?? ''),
    cameraMovement: String(s.camera_movement ?? ''),
    lighting: String(s.lighting ?? ''),
    durationSec: Number(s.duration_sec),
    trimStartSec: Number(s.trim_start_sec ?? 0),
    trimEndSec: Number(s.trim_end_sec ?? s.duration_sec),
    transition: (String(s.transition || 'fade') as SceneItem['transition']),
    status: String(s.status) as SceneItem['status'],
    providerTaskId: s.provider_task_id ? String(s.provider_task_id) : null,
    videoUrl: s.video_url ? String(s.video_url) : null,
    audioUrl: s.audio_url ? String(s.audio_url) : null,
    thumbnailUrl: s.thumbnail_url ? String(s.thumbnail_url) : null,
    isDemo: Boolean(s.is_demo),
    errorMessage: s.error_message ? String(s.error_message) : null,
  }));

  return {
    id: String(jobRow.id),
    userId: String(jobRow.user_id),
    projectId: String(jobRow.project_id),
    type: String(jobRow.type) as VideoJobRecord['type'],
    provider: String(jobRow.provider) as VideoProviderId,
    prompt: String(jobRow.prompt),
    settings: JSON.parse(String(jobRow.settings_json || '{}')),
    status: String(jobRow.status) as VideoJobRecord['status'],
    progress: Number(jobRow.progress ?? 0),
    targetDurationSec: Number(jobRow.target_duration_sec),
    actualDurationSec: Number(jobRow.actual_duration_sec ?? 0),
    isDemo: Boolean(jobRow.is_demo),
    outputUrl: jobRow.output_url ? String(jobRow.output_url) : null,
    errorMessage: jobRow.error_message ? String(jobRow.error_message) : null,
    creditsCost: Number(jobRow.credits_cost ?? 0),
    createdAt: String(jobRow.created_at),
    updatedAt: String(jobRow.updated_at),
    scenes,
  };
}

export function launchVideoGenerationJob(input: StartVideoJobInput): {
  jobId: string;
  projectId: string;
  creditsRemaining: number;
} {
  // Deduct credits atomically first
  const creditResult = adjustCreditsAtomic({
    userId: input.userId,
    delta: -input.creditsCost,
    type: 'deduction',
    description: `${input.type === 'image-to-video' ? 'Image-to-Video' : 'Text-to-Video'} (${input.durationSec}s · ${input.provider})`,
  });

  const projectId = input.projectId || createId('prj');
  const jobId = createId('job');
  const styleLabel = input.style === 'Custom' && input.customStyle ? input.customStyle : input.style;

  if (!input.projectId) {
    db.prepare(
      `INSERT INTO projects (id, user_id, title, description, mode, aspect_ratio, target_duration_sec, style, status, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generating', ?)`
    ).run(
      projectId,
      input.userId,
      (input.title || input.prompt.slice(0, 64)).trim() || 'Untitled Video Project',
      input.prompt.slice(0, 300),
      input.type,
      input.aspectRatio,
      input.durationSec,
      styleLabel,
      input.provider === 'demo-mode' ? 1 : 0
    );
  } else {
    db.prepare(
      `UPDATE projects SET status = 'generating', target_duration_sec = ?, aspect_ratio = ?, style = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(input.durationSec, input.aspectRatio, styleLabel, projectId, input.userId);
  }

  db.prepare(
    `INSERT INTO video_jobs (id, user_id, project_id, type, provider, prompt, settings_json, status, progress, target_duration_sec, is_demo, credits_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 5, ?, ?, ?)`
  ).run(
    jobId,
    input.userId,
    projectId,
    input.type,
    input.provider,
    input.prompt,
    JSON.stringify({
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      style: styleLabel,
      cameraMovement: input.cameraMovement,
      lighting: input.lighting,
      language: input.language,
      includeVoiceover: input.includeVoiceover,
      voiceName: input.voiceName,
      musicBedId: input.musicBedId,
      includeSubtitles: input.includeSubtitles,
      allowDemoFallback: input.allowDemoFallback,
      referenceImageFilename: input.referenceImageFilename ?? null,
    }),
    input.durationSec,
    input.provider === 'demo-mode' ? 1 : 0,
    input.creditsCost
  );

  // Fire asynchronous pipeline without blocking HTTP response
  void executeJobPipeline(jobId, projectId, input);

  return { jobId, projectId, creditsRemaining: creditResult.credits };
}

async function executeJobPipeline(
  jobId: string,
  projectId: string,
  input: StartVideoJobInput
): Promise<void> {
  const updateJob = (fields: {
    status?: string;
    progress?: number;
    actualDurationSec?: number;
    isDemo?: boolean;
    outputUrl?: string | null;
    errorMessage?: string | null;
  }) => {
    const sets: string[] = ["updated_at = datetime('now')"];
    const vals: unknown[] = [];
    if (fields.status !== undefined) {
      sets.push('status = ?');
      vals.push(fields.status);
    }
    if (fields.progress !== undefined) {
      sets.push('progress = ?');
      vals.push(Math.max(0, Math.min(100, Math.round(fields.progress))));
    }
    if (fields.actualDurationSec !== undefined) {
      sets.push('actual_duration_sec = ?');
      vals.push(fields.actualDurationSec);
    }
    if (fields.isDemo !== undefined) {
      sets.push('is_demo = ?');
      vals.push(fields.isDemo ? 1 : 0);
    }
    if (fields.outputUrl !== undefined) {
      sets.push('output_url = ?');
      vals.push(fields.outputUrl);
    }
    if (fields.errorMessage !== undefined) {
      sets.push('error_message = ?');
      vals.push(fields.errorMessage);
    }
    vals.push(jobId);
    db.prepare(`UPDATE video_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  };

  try {
    // 1. Multi-scene script & breakdown
    updateJob({ status: 'scripting', progress: 12 });
    let scriptPlan: GeneratedScript;
    if (input.existingScript && input.existingScript.scenes?.length) {
      scriptPlan = input.existingScript;
    } else if (isGeminiConfigured()) {
      try {
        scriptPlan = await generateScriptWithGemini({
          userId: input.userId,
          topic: input.prompt,
          format: input.aspectRatio === '9:16' ? 'YouTube Shorts' : 'Cinematic Storytelling',
          language: input.language,
          tone: input.style,
          durationSec: input.durationSec,
          audience: 'General creators & viewers',
          storytellingStyle: input.style,
          voiceoverStyle: 'Clear cinematic narration',
          visualStyle: input.style,
        });
      } catch {
        scriptPlan = buildFallbackScenePlan(input);
      }
    } else {
      scriptPlan = buildFallbackScenePlan(input);
    }

    db.prepare(
      `UPDATE projects SET script_json = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(JSON.stringify(scriptPlan), projectId);

    // Clear previous scenes for this job if retrying, insert fresh scene plan
    db.prepare('DELETE FROM scenes WHERE job_id = ?').run(jobId);
    const sceneIds: string[] = [];
    for (let i = 0; i < scriptPlan.scenes.length; i++) {
      const sc = scriptPlan.scenes[i];
      const sceneId = createId('scn');
      sceneIds.push(sceneId);
      db.prepare(
        `INSERT INTO scenes (id, job_id, project_id, scene_index, title, visual_prompt, narration_text, camera_movement, lighting, duration_sec, trim_start_sec, trim_end_sec, transition, status, is_demo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'fade', 'pending', ?)`
      ).run(
        sceneId,
        jobId,
        projectId,
        i,
        sc.title,
        sc.visualPrompt,
        sc.narration,
        sc.cameraMovement || input.cameraMovement,
        sc.lighting || input.lighting,
        sc.durationSec,
        sc.durationSec,
        input.provider === 'demo-mode' ? 1 : 0
      );
    }

    // 2. Generate individual scene video clips
    updateJob({ status: 'generating_scenes', progress: 22 });

    const refImgPath = input.referenceImageFilename
      ? resolveSafeStoragePath(input.referenceImageFilename)
      : null;

    let anyDemoClip = input.provider === 'demo-mode';
    let previousInteractionId: string | null = null;
    const assembledInputs: Array<{
      sceneId: string;
      videoPath: string;
      audioPath: string | null;
      narrationText: string;
      durationSec: number;
    }> = [];

    const totalScenes = scriptPlan.scenes.length;

    for (let i = 0; i < totalScenes; i++) {
      const sc = scriptPlan.scenes[i];
      const sceneId = sceneIds[i];

      db.prepare("UPDATE scenes SET status = 'generating' WHERE id = ?").run(sceneId);

      const enrichedPrompt = `${sc.visualPrompt}. Visual continuity: ${scriptPlan.visualConsistencyBible}. Camera: ${sc.cameraMovement || input.cameraMovement}. Lighting: ${sc.lighting || input.lighting}.`;

      let adapter = getVideoAdapter(input.provider);
      let clipResult;

      try {
        clipResult = await adapter.generateSceneClip({
          userId: input.userId,
          sceneIndex: i,
          title: sc.title,
          prompt: enrichedPrompt,
          aspectRatio: input.aspectRatio,
          quality: input.quality,
          durationSec: sc.durationSec,
          referenceImagePath: i === 0 ? refImgPath : refImgPath && input.type === 'image-to-video' ? refImgPath : null,
          referenceImageMimeType: input.referenceImageMimeType,
          previousInteractionId,
        });
      } catch (sceneErr) {
        const errMsg = extractApiErrorMessage(sceneErr);
        if (input.allowDemoFallback && input.provider !== 'demo-mode') {
          anyDemoClip = true;
          adapter = getVideoAdapter('demo-mode');
          clipResult = await adapter.generateSceneClip({
            userId: input.userId,
            sceneIndex: i,
            title: sc.title,
            prompt: enrichedPrompt,
            aspectRatio: input.aspectRatio,
            quality: input.quality,
            durationSec: sc.durationSec,
            referenceImagePath: refImgPath,
            referenceImageMimeType: input.referenceImageMimeType,
          });
          db.prepare('UPDATE scenes SET error_message = ? WHERE id = ?').run(
            `Live provider unavailable (${errMsg.slice(0, 140)}). Rendered clearly labeled DEMO MODE clip.`,
            sceneId
          );
        } else {
          db.prepare("UPDATE scenes SET status = 'failed', error_message = ? WHERE id = ?").run(
            errMsg.slice(0, 500),
            sceneId
          );
          throw sceneErr;
        }
      }

      if (clipResult.provider === 'google-veo' && clipResult.providerTaskId) {
        previousInteractionId = clipResult.providerTaskId;
      }
      if (clipResult.isDemo) {
        anyDemoClip = true;
      }

      const videoAsset = recordMediaAsset({
        userId: input.userId,
        projectId,
        kind: 'video',
        filename: clipResult.filename,
        mimeType: 'video/mp4',
        sizeBytes: clipResult.sizeBytes,
        prompt: sc.visualPrompt,
        provider: clipResult.provider,
        isDemo: clipResult.isDemo,
      });

      db.prepare(
        `UPDATE scenes SET status = 'completed', provider_task_id = ?, video_url = ?, duration_sec = ?, trim_end_sec = ?, is_demo = ? WHERE id = ?`
      ).run(
        clipResult.providerTaskId ?? null,
        videoAsset.url,
        clipResult.durationSec,
        clipResult.durationSec,
        clipResult.isDemo ? 1 : 0,
        sceneId
      );

      assembledInputs.push({
        sceneId,
        videoPath: clipResult.filePath,
        audioPath: null,
        narrationText: sc.narration,
        durationSec: clipResult.durationSec,
      });

      const pct = 22 + Math.round(((i + 1) / totalScenes) * 44);
      updateJob({ progress: pct, isDemo: anyDemoClip });
    }

    // 3. Optional Voiceover & Music Generation
    updateJob({ status: 'generating_audio', progress: 70 });

    if (input.includeVoiceover && isGeminiConfigured()) {
      for (let i = 0; i < assembledInputs.length; i++) {
        const item = assembledInputs[i];
        if (!item.narrationText.trim()) continue;
        try {
          const tts = await generateVoiceWithGemini({
            userId: input.userId,
            text: item.narrationText,
            voiceName: input.voiceName || 'Kore',
            language: input.language,
            style: `${input.style} narrator`,
          });
          const audioAsset = recordMediaAsset({
            userId: input.userId,
            projectId,
            kind: 'audio',
            filename: tts.filename,
            mimeType: 'audio/wav',
            sizeBytes: tts.sizeBytes,
            prompt: item.narrationText.slice(0, 200),
            provider: 'google-gemini-tts',
            isDemo: false,
          });
          item.audioPath = tts.filePath;
          db.prepare('UPDATE scenes SET audio_url = ? WHERE id = ?').run(audioAsset.url, item.sceneId);
        } catch {
          // Continue assembly even if a single scene TTS call rate-limits
        }
        updateJob({ progress: 70 + Math.round(((i + 1) / assembledInputs.length) * 14) });
      }
    }

    let musicPath: string | null = null;
    if (input.musicBedId && input.musicBedId !== 'none') {
      const totalApprox = assembledInputs.reduce((acc, s) => acc + s.durationSec, 0);
      const bed = await generateAmbientMusicBed(input.musicBedId, totalApprox + 2);
      if (bed) {
        musicPath = bed.filePath;
      }
    }

    // 4. Multi-Scene FFmpeg Video Assembly + Subtitles + Final MP4 Render
    updateJob({ status: 'assembling', progress: 88 });

    const finalRender = await assembleMultiSceneVideo({
      scenes: assembledInputs.map((s) => ({
        videoPath: s.videoPath,
        audioPath: s.audioPath,
        narrationText: s.narrationText,
        durationSec: s.durationSec,
        transition: 'fade',
      })),
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      musicPath,
      voiceVolume: 1.0,
      musicVolume: 0.28,
      includeSubtitles: input.includeSubtitles,
    });

    const finalAsset = recordMediaAsset({
      userId: input.userId,
      projectId,
      kind: 'video',
      filename: finalRender.filename,
      mimeType: 'video/mp4',
      sizeBytes: finalRender.sizeBytes,
      prompt: input.prompt,
      provider: anyDemoClip ? 'demo-mode' : input.provider,
      isDemo: anyDemoClip,
    });

    updateJob({
      status: 'completed',
      progress: 100,
      actualDurationSec: finalRender.durationSec,
      isDemo: anyDemoClip,
      outputUrl: finalAsset.url,
    });

    db.prepare(
      `UPDATE projects SET status = 'completed', final_video_url = ?, final_duration_sec = ?, is_demo = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(finalAsset.url, finalRender.durationSec, anyDemoClip ? 1 : 0, projectId);
  } catch (err) {
    const msg = extractApiErrorMessage(err);
    updateJob({
      status: 'failed',
      errorMessage: msg.slice(0, 600),
    });
    db.prepare("UPDATE projects SET status = 'failed', updated_at = datetime('now') WHERE id = ?").run(
      projectId
    );
    // Refund credits automatically on failed generation
    try {
      adjustCreditsAtomic({
        userId: input.userId,
        delta: input.creditsCost,
        type: 'refund',
        description: `Automatic credit refund for failed job ${jobId}`,
        referenceId: jobId,
      });
    } catch {
      // ignore refund failure
    }
  }
}
