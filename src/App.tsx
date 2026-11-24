import React from 'react';
import { ToastViewport, WorkspaceShell } from './components/WorkspaceShell.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { ProfilePage, SupportPage } from './pages/AccountAndSupportPages.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AuthPage } from './pages/AuthPages.tsx';
import { CreditsPage, PlansPage } from './pages/BillingPages.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { HistoryPage, ProjectsPage } from './pages/ProjectsAndHistoryPages.tsx';
import { ScriptWriterPage } from './pages/ScriptWriterPage.tsx';
import { TextToImagePage } from './pages/TextToImagePage.tsx';
import { VideoEditorPage } from './pages/VideoEditorPage.tsx';
import { VideoGeneratorPage } from './pages/VideoGeneratorPage.tsx';
import { VoiceStudioPage } from './pages/VoiceStudioPage.tsx';
import { YouTubeCreatorPage } from './pages/YouTubeCreatorPage.tsx';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected UI error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090A0D] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#11141C] border border-rose-500/35 space-y-4">
            <h1 className="text-lg font-display font-bold">Application Recovery</h1>
            <p className="text-xs text-slate-300 leading-relaxed">{this.state.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 rounded-lg bg-amber-500 text-[#090A0D] text-xs font-semibold"
            >
              Reload Interface
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CinegenRouter() {
  const { page } = useApp();

  if (page === 'landing') return <LandingPage />;
  if (page === 'login') return <AuthPage mode="login" />;
  if (page === 'signup') return <AuthPage mode="signup" />;

  return (
    <WorkspaceShell>
      {page === 'dashboard' && <DashboardPage />}
      {page === 'text-to-video' && <VideoGeneratorPage mode="text-to-video" />}
      {page === 'image-to-video' && <VideoGeneratorPage mode="image-to-video" />}
      {page === 'text-to-image' && <TextToImagePage />}
      {page === 'script-writer' && <ScriptWriterPage />}
      {page === 'voice-studio' && <VoiceStudioPage />}
      {page === 'video-editor' && <VideoEditorPage />}
      {page === 'youtube-creator' && <YouTubeCreatorPage />}
      {page === 'projects' && <ProjectsPage />}
      {page === 'history' && <HistoryPage />}
      {page === 'plans' && <PlansPage />}
      {page === 'credits' && <CreditsPage />}
      {page === 'profile' && <ProfilePage />}
      {page === 'support' && <SupportPage />}
      {page === 'admin' && <AdminDashboardPage />}
    </WorkspaceShell>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <CinegenRouter />
        <ToastViewport />
      </AppProvider>
    </AppErrorBoundary>
  );
}
