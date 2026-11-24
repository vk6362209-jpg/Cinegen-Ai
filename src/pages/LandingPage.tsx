import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  Clapperboard,
  Film,
  Layers,
  Mic,
  Scissors,
  ShieldCheck,
  Youtube,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { MONETIZATION_DISCLAIMER, PLAN_DEFINITIONS } from '../types/cinegen.ts';

const HERO_IMG = '/src/assets/images/hero_cinegen_studio_1795492121523.jpg';
const DOC_IMG = '/src/assets/images/showcase_documentary_1795492128911.jpg';
const VERTICAL_IMG = '/src/assets/images/showcase_scifi_short_1795492123850.jpg';
const FANTASY_IMG = '/src/assets/images/showcase_fantasy_epic_1795492124560.jpg';
const AVATAR_IMG = '/src/assets/images/avatar_creator_lead_1795492130143.jpg';

function ResilientImage({
  src,
  alt,
  className,
  fallbackTitle,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#131722] to-[#0B0D13] text-slate-400 p-6 ${className || ''}`}
      >
        <Film className="w-8 h-8 text-amber-500/70 mb-2" />
        <span className="text-xs font-medium text-center">{fallbackTitle}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

const PIPELINE_STEPS = [
  { num: '01', title: 'Prompt & Script Architecture', desc: 'Gemini analyzes your idea, creates an original narrative script, and establishes a visual consistency guide.' },
  { num: '02', title: 'Multi-Scene Breakdown', desc: 'Automatically divides 10-second Shorts to 5-minute films into timed scenes with camera and lighting direction.' },
  { num: '03', title: 'Modular Video Providers', desc: 'Routes scene clips through Google Veo / Omni Flash, Runway Gen-4, or clearly watermarked Demo Mode previews.' },
  { num: '04', title: 'AI Voice & Audio Sync', desc: 'Generates studio WAV narration in English, Telugu, Hindi, and more with Gemini 3.8 TTS plus ambient beds.' },
  { num: '05', title: 'Timeline Editing & Subtitles', desc: 'Reorder scenes, trim in/out points, mix voice and music volumes, and burn crisp SRT captions.' },
  { num: '06', title: 'Server-Side MP4 Export', desc: 'FFmpeg renders your complete multi-scene timeline into a portable H.264 MP4 ready for download.' },
];

export function LandingPage() {
  const { navigate, user } = useApp();

  return (
    <div className="min-h-screen bg-[#090A0D] text-[#F1F3F7]">
      {/* Strict 3-zone Top Bar Contract */}
      <header className="sticky top-0 z-40 h-16 bg-[#090A0D]/85 backdrop-blur-md border-b border-white/[0.07]">
        <div className="max-w-[1320px] h-full mx-auto px-6 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="text-lg font-display font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            CINEGEN AI
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a href="#pipeline" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Pipeline
            </a>
            <a href="#studio" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Studio
            </a>
            <a href="#creators" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Creators
            </a>
            <a href="#pricing" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Pricing
            </a>
            <button
              type="button"
              onClick={() => navigate('support')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Support
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => navigate(user ? 'dashboard' : 'signup')}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {user ? 'Open Studio' : 'Start Creating'}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-14 pb-20 px-6">
        <div className="max-w-[1320px] mx-auto space-y-10">
          <div className="grid lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-7 space-y-5">
              <p className="text-sm font-medium text-amber-400">
                Multi-Scene AI Video Production Platform
              </p>
              <h1
                className="font-display font-bold text-white leading-[1.08] tracking-tight max-w-2xl"
                style={{ fontSize: 'clamp(2.25rem, 4.2vw, 3.75rem)', textWrap: 'balance' }}
              >
                Direct complete multi-scene films from prompt to MP4.
              </h1>
            </div>
            <div className="lg:col-span-5 space-y-6">
              <p className="text-base text-slate-300 leading-relaxed max-w-xl">
                Write original scripts, break stories into timed scenes up to five minutes, render
                clips across Google Veo and Runway adapters, synchronize multilingual AI voiceovers,
                and export finished MP4 timelines in one studio.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => navigate(user ? 'text-to-video' : 'signup')}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#090A0D] text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Launch Video Generator</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate(user ? 'dashboard' : 'login')}
                  className="px-5 py-3 rounded-lg border border-white/[0.14] hover:border-white/30 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0"
                >
                  {user ? 'Go to Dashboard' : 'Sign In'}
                </button>
              </div>
            </div>
          </div>

          {/* Dominant 16:9 Cinema Frame */}
          <div className="relative rounded-2xl overflow-hidden border border-white/[0.09] bg-[#12151D] aspect-[16/9] max-h-[620px] w-full">
            <ResilientImage
              src={HERO_IMG}
              alt="CINEGEN AI post-production suite showing a widescreen Nordic cinema sequence on a calibrated studio monitor"
              fallbackTitle="CINEGEN AI Cinema Production Suite"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090A0D]/90 via-[#090A0D]/20 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="text-xs text-amber-400 font-medium mb-1">
                  End-to-End Production Suite
                </div>
                <div className="text-lg sm:text-xl font-display font-semibold text-white">
                  Script Writer · Scene Orchestrator · AI Voice Studio · FFmpeg MP4 Renderer
                </div>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-300">
                10s – 5m Durations · 16:9 & 9:16 · 720p / 1080p / 4K
              </div>
            </div>
          </div>

          {/* 4-column quantitative capability strip below hero */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-4 border-t border-white/[0.08]">
            <div>
              <div className="text-2xl font-display font-bold font-mono tabular-nums text-white">
                10s – 5m
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Automated multi-scene orchestration & FFmpeg assembly
              </div>
            </div>
            <div>
              <div className="text-2xl font-display font-bold font-mono tabular-nums text-white">
                8 Languages
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Gemini 3.8 TTS including English, Telugu & Hindi voices
              </div>
            </div>
            <div>
              <div className="text-2xl font-display font-bold font-mono tabular-nums text-white">
                3 Adapters
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Google Veo / Omni Flash, Runway Gen-4 & Demo Mode
              </div>
            </div>
            <div>
              <div className="text-2xl font-display font-bold font-mono tabular-nums text-white">
                100% Honest
              </div>
              <div className="text-sm text-slate-400 mt-1">
                Transparent Demo Mode watermarks & copyright guidance
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* End-to-End Pipeline */}
      <section id="pipeline" className="py-20 px-6 border-t border-white/[0.07] bg-[#0C0E13]">
        <div className="max-w-[1320px] mx-auto space-y-12">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-medium text-amber-400">Production Architecture</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-white" style={{ textWrap: 'balance' }}>
              Built for full-length stories, not disconnected 5-second clips.
            </h2>
            <p className="text-slate-400 leading-relaxed">
              Every project runs through a structured server-side pipeline that tracks progress per
              scene, keeps visual continuity locked, mixes voiceovers and subtitles, and exports an
              actual MP4 file matching your chosen runtime.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-10">
            {PIPELINE_STEPS.map((step) => (
              <div key={step.num} className="pt-5 border-t border-white/[0.1] space-y-2.5">
                <div className="text-xs font-mono tabular-nums text-amber-400">{step.num}.</div>
                <h3 className="text-lg font-display font-semibold text-white">{step.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Asymmetric Studio Showcase Bento */}
      <section id="studio" className="py-20 px-6 border-t border-white/[0.07]">
        <div className="max-w-[1320px] mx-auto space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-3">
              <p className="text-sm font-medium text-amber-400">Integrated Creator Tools</p>
              <h2 className="text-3xl sm:text-4xl font-display font-bold text-white" style={{ textWrap: 'balance' }}>
                Every workstation inside a single browser studio.
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate(user ? 'video-editor' : 'signup')}
              className="text-sm font-medium text-amber-400 hover:text-amber-300 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <span>Explore Video Editing Studio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid lg:grid-cols-12 gap-6 items-stretch">
            {/* Wide Documentary Card */}
            <div className="lg:col-span-8 rounded-xl overflow-hidden border border-white/[0.08] bg-[#12151D] flex flex-col">
              <div className="relative aspect-[16/9] overflow-hidden">
                <ResilientImage
                  src={DOC_IMG}
                  alt="Aerial documentary frame of volcanic basalt sea cliffs at twilight"
                  fallbackTitle="16:9 Documentary & Long-Form Production"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#12151D] via-transparent to-transparent" />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">
                    16:9 Widescreen · 1 to 5 Minutes · Documentary & Cinematic
                  </div>
                  <h3 className="text-xl font-display font-semibold text-white">
                    Long-Form Multi-Scene Orchestrator
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed max-w-2xl">
                    Enter a single concept and generate a timed multi-scene script, scene-by-scene
                    visual prompts, synchronized Gemini 3.8 narration, and an edited MP4 timeline.
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 pt-2 text-sm">
                  <button
                    type="button"
                    onClick={() => navigate(user ? 'text-to-video' : 'signup')}
                    className="text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1.5"
                  >
                    <Clapperboard className="w-4 h-4" />
                    <span>Open Text-to-Video</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(user ? 'script-writer' : 'signup')}
                    className="text-slate-300 hover:text-white font-medium inline-flex items-center gap-1.5"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Open Script Writer</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Vertical Shorts Card */}
            <div className="lg:col-span-4 rounded-xl overflow-hidden border border-white/[0.08] bg-[#12151D] flex flex-col">
              <div className="relative aspect-[9/12] sm:aspect-[9/11] lg:aspect-auto lg:flex-1 overflow-hidden">
                <ResilientImage
                  src={VERTICAL_IMG}
                  alt="Vertical 9:16 sci-fi canyon frame designed for YouTube Shorts and Reels"
                  fallbackTitle="9:16 YouTube Shorts & Reels Mode"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#12151D] via-[#12151D]/25 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-6 space-y-2">
                  <div className="text-xs text-amber-400 font-medium">
                    9:16 Vertical · YouTube Creator Mode
                  </div>
                  <h3 className="text-xl font-display font-semibold text-white">
                    Shorts, Reels & Originality Checks
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Generate vertical 9:16 scripts, hooks, SEO titles, hashtags, thumbnail prompts,
                    and automated copyright risk checks before publishing.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate(user ? 'youtube-creator' : 'signup')}
                    className="pt-2 text-sm font-semibold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1.5"
                  >
                    <Youtube className="w-4 h-4" />
                    <span>Open YouTube Creator Mode</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Second Row Asymmetric Split */}
            <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#12151D] p-6 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <div className="text-xs text-slate-400">Audio & Post-Production</div>
                <h3 className="text-xl font-display font-semibold text-white">
                  Multilingual AI Voice Studio & Timeline Editor
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Direct single-speaker narration or dual-speaker dialogue in English, Telugu,
                  Hindi, Spanish, and more. Upload custom recordings, adjust voice and music levels,
                  trim clips, and burn subtitles cleanly into the exported MP4.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => navigate(user ? 'voice-studio' : 'signup')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1A1F2B] hover:bg-[#222838] text-sm font-medium text-white transition-colors"
                >
                  <Mic className="w-4 h-4 text-amber-400" />
                  <span>Voice Studio</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(user ? 'video-editor' : 'signup')}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#1A1F2B] hover:bg-[#222838] text-sm font-medium text-white transition-colors"
                >
                  <Scissors className="w-4 h-4 text-amber-400" />
                  <span>Video Editor</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-7 rounded-xl overflow-hidden border border-white/[0.08] bg-[#12151D] grid sm:grid-cols-2 items-stretch">
              <div className="relative min-h-[220px]">
                <ResilientImage
                  src={FANTASY_IMG}
                  alt="Ancient stone observatory above mountain clouds at dusk"
                  fallbackTitle="Image-to-Video Visual Reference Engine"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">Image-to-Video & Text-to-Image</div>
                  <h3 className="text-xl font-display font-semibold text-white">
                    Animate Keyframes with Consistent Lighting
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Generate concept frames or upload your own artwork, then animate it across
                    multi-scene sequences with explicit camera direction and lighting cues.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(user ? 'image-to-video' : 'signup')}
                  className="text-sm font-medium text-amber-400 hover:text-amber-300 inline-flex items-center gap-1.5"
                >
                  <span>Try Image-to-Video</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Creators & Copyright Responsibility Section */}
      <section id="creators" className="py-20 px-6 border-t border-white/[0.07] bg-[#0C0E13]">
        <div className="max-w-[1320px] mx-auto grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-amber-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Copyright & Monetization Safety</span>
            </div>
            <h2 className="text-3xl font-display font-bold text-white" style={{ textWrap: 'balance' }}>
              Designed for original storytelling and transparent creator compliance.
            </h2>
            <p className="text-slate-300 leading-relaxed">
              Every script, scene prompt, voice track, and CC0 studio audio bed is built to help
              creators avoid copyrighted franchises, unauthorized celebrity likenesses, and reused
              stock templates. Before any final export, CINEGEN AI runs an originality & risk
              checklist.
            </p>
            <div className="p-4 rounded-xl bg-[#13161E] border border-white/[0.08] text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-white">Policy Transparency: </span>
              {MONETIZATION_DISCLAIMER}
            </div>
          </div>

          <div className="lg:col-span-5 p-6 rounded-xl bg-[#12151D] border border-white/[0.08] space-y-5">
            <p className="text-base text-slate-200 leading-relaxed">
              “Switching our weekly 3-minute science explainers from manual B-roll sourcing to
              CINEGEN AI cut rough-cut assembly from 14 hours down to 90 minutes while keeping
              narration, captions, and scene pacing locked on one timeline.”
            </p>
            <div className="flex items-center gap-3.5 pt-3 border-t border-white/[0.07]">
              <ResilientImage
                src={AVATAR_IMG}
                alt="Portrait of Hannah Lindqvist, Documentary Producer"
                fallbackTitle="HL"
                className="w-11 h-11 rounded-full object-cover shrink-0 border border-white/10"
              />
              <div>
                <div className="text-sm font-semibold text-white">Hannah Lindqvist</div>
                <div className="text-xs text-slate-400">
                  Executive Producer · Meridian Science Media
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transparent Pricing Overview */}
      <section id="pricing" className="py-20 px-6 border-t border-white/[0.07]">
        <div className="max-w-[1320px] mx-auto space-y-12">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-medium text-amber-400">Credit & Subscription Plans</p>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">
              Predictable credits with automatic refunds on failed renders.
            </h2>
            <p className="text-slate-400">
              Start free with 100 credits. Upgrade when you scale to 5-minute 1080p or 4K pipelines.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLAN_DEFINITIONS.map((plan) => (
              <div
                key={plan.id}
                className={`p-6 rounded-xl border flex flex-col justify-between gap-6 ${
                  plan.id === 'pro'
                    ? 'bg-[#161A24] border-amber-500/40'
                    : 'bg-[#11141C] border-white/[0.08]'
                }`}
              >
                <div className="space-y-4">
                  <div>
                    <div className="text-base font-display font-semibold text-white">
                      {plan.name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{plan.audience}</div>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-display font-bold font-mono tabular-nums text-white">
                      ${plan.monthlyPriceUsd}
                    </span>
                    <span className="text-xs text-slate-400">/ month</span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-amber-400">
                    {plan.monthlyCredits.toLocaleString()} credits · {plan.storageLabel} vault · up to{' '}
                    {Math.round(plan.maxDurationSec / 60)}m
                  </div>
                  <ul className="space-y-2.5 pt-3 border-t border-white/[0.07] text-sm text-slate-300">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => navigate(user ? 'plans' : 'signup')}
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${
                    plan.id === 'pro'
                      ? 'bg-amber-500 hover:bg-amber-400 text-[#090A0D]'
                      : 'bg-white/[0.07] hover:bg-white/[0.12] text-white'
                  }`}
                >
                  {plan.monthlyPriceUsd === 0 ? 'Start Free' : `Select ${plan.name}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="py-12 px-6 border-t border-white/[0.07] bg-[#07080B]">
        <div className="max-w-[1320px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-display font-bold text-white">CINEGEN AI</div>
            <p className="text-xs text-slate-500 mt-1">
              © {new Date().getFullYear()} CINEGEN AI Video Creation Platform. Built for original
              creators.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-400">
            <button type="button" onClick={() => navigate('login')} className="hover:text-white">
              Sign In
            </button>
            <button type="button" onClick={() => navigate('signup')} className="hover:text-white">
              Create Account
            </button>
            <button type="button" onClick={() => navigate('plans')} className="hover:text-white">
              Pricing
            </button>
            <button type="button" onClick={() => navigate('support')} className="hover:text-white">
              Help & Copyright Policy
            </button>
            <button type="button" onClick={() => navigate('admin')} className="hover:text-white">
              Admin Console
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
