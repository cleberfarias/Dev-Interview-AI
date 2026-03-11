import React, { Suspense, useEffect, useRef, useState } from 'react';
import { AppState, CandidateProfile, InterviewConfig, InterviewPlan, FinalReport, User } from './src/shared/types';
import { I18N, clampDuration, INTERVIEW_LIMITS } from './src/shared/constants';
import { LandingPage, Login } from './src/features/auth';
import { auth } from './src/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { BackendApi } from './src/shared/services/backendApi';

const SplashScreen: React.FC = () => (
  <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center animate-in fade-in duration-500">
    <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-indigo-500/40 animate-float">
      <span className="text-white text-5xl font-black">D</span>
    </div>
    <div className="mt-8 space-y-2 text-center">
      <h1 className="text-xl font-extrabold tracking-tighter text-white uppercase">Dev Interview</h1>
      <div className="flex gap-1 justify-center">
        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.2s]" />
        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.4s]" />
      </div>
    </div>
  </div>
);

const RouteLoading: React.FC = () => (
  <div className="h-full flex items-center justify-center">
    <div className="w-10 h-10 border-4 border-indigo-500/40 border-t-indigo-300 rounded-full animate-spin" />
  </div>
);

const Dashboard = React.lazy(() =>
  import('./src/features/dashboard').then((module) => ({ default: module.Dashboard })),
);
const Lobby = React.lazy(() =>
  import('./src/features/interview').then((module) => ({ default: module.Lobby })),
);
const InterviewRoom = React.lazy(() =>
  import('./src/features/interview').then((module) => ({ default: module.InterviewRoom })),
);
const Onboarding = React.lazy(() =>
  import('./src/features/onboarding').then((module) => ({ default: module.Onboarding })),
);
const UserProfile = React.lazy(() =>
  import('./src/features/profile').then((module) => ({ default: module.UserProfile })),
);
const Report = React.lazy(() =>
  import('./src/features/report').then((module) => ({ default: module.Report })),
);

const defaultRoleFromTrack = (track: string): string => {
  const map: Record<string, string> = {
    frontend: 'Frontend Engineer',
    backend: 'Backend Engineer',
    fullstack: 'Fullstack Engineer',
    mobile: 'Mobile Engineer',
    devops: 'DevOps Engineer',
    data: 'Data Engineer',
  };
  return map[track] || 'Software Engineer';
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<AppState>(AppState.LOGIN);
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<InterviewPlan | null>(null);
  const [report, setReport] = useState<FinalReport | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const [config, setConfig] = useState<InterviewConfig>({
    uiLanguage: 'pt-BR',
    interviewLanguage: 'pt-BR',
    track: 'frontend',
    seniority: 'mid',
    stacks: ['JavaScript', 'TypeScript', 'React'],
    style: 'friendly',
    duration: clampDuration(INTERVIEW_LIMITS.free, 'free'),
    plan: 'free',
    jobDescription: '',
    difficultyLevel: 3,
  });

  const showGlobalNotice = (message: string) => {
    setGlobalNotice(message);
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setGlobalNotice(null);
      noticeTimerRef.current = null;
    }, 5000);
  };

  const clearGlobalNotice = () => {
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setGlobalNotice(null);
  };

  useEffect(() => {
    BackendApi.warmup().catch(() => null);

    let mounted = true;
    let first = true;

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      const finishFirstLoad = () => {
        if (first) {
          setLoading(false);
          first = false;
        }
      };

      if (!mounted) return;

      if (!fbUser) {
        setUser(null);
        setCandidateProfile(null);
        setState(AppState.LOGIN);
        finishFirstLoad();
        return;
      }

      setState(AppState.DASHBOARD);
      setUser((prev) =>
        prev && prev.uid === fbUser.uid
          ? prev
          : {
              uid: fbUser.uid,
              name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Usuario',
              email: fbUser.email || '',
              avatar: fbUser.photoURL || undefined,
              credits: 0,
              provider: 'firebase',
              interviews: [],
            },
      );
      finishFirstLoad();

      try {
        const token = await fbUser.getIdToken(false).catch(() => null);
        const profile = token ? await BackendApi.meWithToken(token) : await BackendApi.me();
        if (!mounted) return;
        setUser(profile);

        const candidate = await BackendApi.getCandidateProfile().catch(() => null);
        if (!mounted) return;
        setCandidateProfile(candidate);
      } catch (e) {
        console.error('Auth handler error', e);
        showGlobalNotice('Nao foi possivel carregar seu perfil agora.');
      }
    });

    return () => {
      mounted = false;
      unsub();
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason: any = event?.reason;
      const message =
        reason?.message ||
        (typeof reason === 'string' ? reason : null) ||
        'Ocorreu um problema inesperado.';
      showGlobalNotice(message);
    };

    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    setCandidateProfile(null);
    setState(AppState.DASHBOARD);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setCandidateProfile(null);
    setState(AppState.LOGIN);
  };

  const addCredits = async (amount: number) => {
    if (!user) return;
    try {
      const res = await BackendApi.devAddCredits(amount);
      setUser({ ...user, credits: res.credits });
    } catch (e: any) {
      showGlobalNotice(e?.message || 'Nao foi possivel adicionar creditos.');
    }
  };

  const handleDeleteInterview = async (targetSessionId: string) => {
    if (!user) return;
    try {
      await BackendApi.deleteSession(targetSessionId);
      const profile = await BackendApi.me().catch(() => null);
      if (profile) {
        setUser(profile);
      } else {
        setUser({ ...user, interviews: user.interviews.filter((item) => item.id !== targetSessionId) });
      }
    } catch (e: any) {
      showGlobalNotice(e?.message || 'Nao foi possivel excluir a entrevista.');
    }
  };

  const handleInterviewFinish = async (finalReport: FinalReport) => {
    setReport(finalReport);
    setState(AppState.REPORT);

    if (!sessionId) return;
    try {
      await BackendApi.finishSession(sessionId, finalReport, {
        uiLanguage: config.uiLanguage,
        interviewLanguage: config.interviewLanguage,
      });
      const profile = await BackendApi.me();
      setUser(profile);
    } catch (e) {
      console.error(e);
      showGlobalNotice('Falha ao salvar o resultado da entrevista.');
    }
  };

  const handleInterviewBack = () => {
    const shouldExit = window.confirm('Deseja sair da entrevista agora? O progresso atual sera perdido.');
    if (!shouldExit) return;
    setPlan(null);
    setSessionId(null);
    setState(AppState.LOBBY);
    showGlobalNotice('Entrevista interrompida.');
  };

  const syncCandidateProfileFromOnboarding = async (nextConfig: InterviewConfig) => {
    try {
      const existing = await BackendApi.getCandidateProfile().catch(() => null);
      const payload = {
        targetRole: existing?.targetRole || defaultRoleFromTrack(nextConfig.track),
        experienceLevel: existing?.experienceLevel || nextConfig.seniority,
        primarySkills: existing?.primarySkills?.length ? existing.primarySkills : (nextConfig.stacks || []),
        weakSkills: existing?.weakSkills || [],
        resumeSummary: existing?.resumeSummary || null,
        jobDescription: (nextConfig.jobDescription || '').trim() || existing?.jobDescription || null,
      };

      if (payload.jobDescription) {
        try {
          const analysis = await BackendApi.analyzeJob({
            jobDescription: payload.jobDescription,
            resumeTechnologies: payload.primarySkills,
          });
          if (!existing?.targetRole && analysis.analysis.roleTitleGuess) {
            payload.targetRole = analysis.analysis.roleTitleGuess;
          }
          if ((!existing?.weakSkills || existing.weakSkills.length === 0) && analysis.gap?.missingSkills?.length) {
            payload.weakSkills = analysis.gap.missingSkills;
          }
        } catch (analysisErr) {
          console.warn('Onboarding job analysis sync failed', analysisErr);
        }
      }

      const saved = await BackendApi.upsertCandidateProfile(payload);
      setCandidateProfile(saved);
    } catch (e) {
      console.error('Failed to sync candidate profile from onboarding', e);
    }
  };

  const t = I18N[config.uiLanguage];

  if (loading) return <SplashScreen />;
  if (state === AppState.LANDING) return <LandingPage onGetStarted={() => setState(AppState.LOGIN)} />;

  const showHeader = ![AppState.INTERVIEWING, AppState.LOGIN, AppState.PROFILE].includes(state);
  const disableMainScroll = state === AppState.LOBBY;
  const canHeaderBack = [AppState.ONBOARDING, AppState.LOBBY, AppState.REPORT].includes(state);

  const handleHeaderBack = () => {
    if (state === AppState.ONBOARDING) {
      setState(AppState.DASHBOARD);
      return;
    }
    if (state === AppState.LOBBY) {
      setState(AppState.ONBOARDING);
      return;
    }
    if (state === AppState.REPORT) {
      setState(AppState.DASHBOARD);
    }
  };

  const wideStates = [AppState.DASHBOARD, AppState.INTERVIEWING];
  const mediumStates = [AppState.ONBOARDING, AppState.LOBBY, AppState.PROFILE, AppState.REPORT];
  const containerClass = wideStates.includes(state)
    ? 'w-full h-full'
    : mediumStates.includes(state)
      ? 'w-full h-full max-w-5xl mx-auto'
      : 'max-w-md mx-auto h-full';

  return (
    <div className="h-full flex flex-col bg-[#020617] overflow-hidden">
      {globalNotice && (
        <div className="mx-4 mt-3 rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-xs font-semibold text-red-100 shadow-lg z-[90]">
          <div className="flex items-center justify-between gap-3">
            <span>{globalNotice}</span>
            <button
              type="button"
              onClick={clearGlobalNotice}
              className="rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-100/90 hover:bg-red-500/20"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {showHeader && (
        <header className="px-6 py-4 flex items-center justify-between shrink-0 native-glass z-50">
          <div className="flex items-center gap-3">
            {canHeaderBack && (
              <button
                type="button"
                onClick={handleHeaderBack}
                className="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 text-slate-200 font-black flex items-center justify-center active:scale-95"
                aria-label="Voltar"
              >
                {'<'}
              </button>
            )}
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white text-sm">D</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs font-black text-white uppercase">{t.title}</h1>
                <span className="text-[7px] text-amber-400 font-black bg-slate-800 px-1.5 py-0.5 rounded-full">{user?.credits || 0}</span>
              </div>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{user?.name?.split(' ')[0] || ''}</p>
            </div>
          </div>
          <button
            onClick={() => setState(AppState.PROFILE)}
            className="w-10 h-10 rounded-full bg-slate-800 border border-white/5 flex items-center justify-center text-sm overflow-hidden"
          >
            {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : (user?.name?.charAt(0) || 'U')}
          </button>
        </header>
      )}

      <main className={disableMainScroll ? 'flex-1 overflow-hidden' : 'flex-1 overflow-y-auto no-scrollbar'}>
        <div className={containerClass}>
          <Suspense fallback={<RouteLoading />}>
            {state === AppState.LOGIN && <Login onLogin={handleLogin} />}

            {state === AppState.DASHBOARD && user && (
              <Dashboard
                user={user}
                candidateProfile={candidateProfile}
                onOpenProfile={() => setState(AppState.PROFILE)}
                onStartInterview={() => setState(AppState.ONBOARDING)}
                onDeleteInterview={handleDeleteInterview}
              />
            )}

            {state === AppState.PROFILE && user && (
              <UserProfile
                user={user}
                config={config}
                onBack={() => setState(AppState.DASHBOARD)}
                onLogout={handleLogout}
                onAddCredits={addCredits}
                onDeleteInterview={handleDeleteInterview}
                onCandidateProfileUpdated={(profile) => setCandidateProfile(profile)}
              />
            )}

            {state === AppState.ONBOARDING && (
              <div className="p-4 h-full">
                <Onboarding
                  onComplete={(c) => {
                    setConfig(c);
                    setState(AppState.LOBBY);
                    void syncCandidateProfileFromOnboarding(c);
                  }}
                  initialConfig={config}
                />
              </div>
            )}

            {state === AppState.LOBBY && (
              <div className="p-4 h-full overflow-hidden">
                <Lobby
                  config={config}
                  userCredits={user?.credits || 0}
                  onStart={(p, sid, credits, difficultyLevel) => {
                    setPlan(p);
                    setSessionId(sid);
                    setConfig((prev) => ({
                      ...prev,
                      difficultyLevel: difficultyLevel ?? prev.difficultyLevel ?? 3,
                    }));
                    if (user) setUser({ ...user, credits });
                    setState(AppState.INTERVIEWING);
                  }}
                  onBack={() => setState(AppState.ONBOARDING)}
                />
              </div>
            )}

            {state === AppState.INTERVIEWING && plan && user && (
              <div className="max-w-none h-full">
                <InterviewRoom
                  config={config}
                  plan={plan}
                  user={user}
                  onFinish={handleInterviewFinish}
                  onBack={handleInterviewBack}
                />
              </div>
            )}

            {state === AppState.REPORT && report && (
              <div className="p-4">
                <Report
                  config={config}
                  report={report}
                  onBack={() => {
                    setReport(null);
                    setPlan(null);
                    setSessionId(null);
                    setState(AppState.DASHBOARD);
                  }}
                />
              </div>
            )}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default App;
