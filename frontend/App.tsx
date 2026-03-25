import React, { Suspense, useEffect, useRef, useState } from 'react';
import { AppState, AvatarResponse, CandidateProfile, InterviewConfig, InterviewPlan, FinalReport, User } from './src/shared/types';
import { I18N, clampDuration, INTERVIEW_LIMITS } from './src/shared/constants';
import { LandingPage, Login } from './src/features/auth';
import { auth } from './src/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { BackendApi } from './src/shared/services/backendApi';
import { getMissingCandidateProfileFields } from './src/shared/utils/candidateProfile';
import { ProductTour, buildTourStorageKey, getTourSteps, type ProductTourId } from './src/features/tour';

const SplashScreen: React.FC = () => (
  <div className="fd-splash-screen fixed inset-0 z-[100] flex flex-col items-center justify-center animate-in fade-in duration-500">
    <div className="fd-splash-logo flex items-center justify-center overflow-hidden animate-float">
      <img src="/img/logo.png" alt="Dev Interview AI" className="w-full h-full object-contain rounded-xl" />
    </div>
    <div className="mt-8 space-y-3 text-center">
      <h1 className="font-display text-2xl font-bold uppercase tracking-[0.22em] text-fd-text-primary">Dev Interview</h1>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-fd-text-secondary">Future Driven AI Interview Coach</p>
      <div className="fd-loading-dots justify-center">
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
);

const RouteLoading: React.FC = () => (
  <div className="h-full flex items-center justify-center">
    <div className="fd-route-loading" />
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
const retryAudioChunksInBackground = async () => {
  const audioModule = await import('./src/features/audio');
  await audioModule.retryPendingAudioChunks();
};

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

const AUTO_TOUR_BY_STATE: Partial<Record<AppState, ProductTourId>> = {
  [AppState.DASHBOARD]: 'dashboard',
  [AppState.PROFILE]: 'profile',
  [AppState.ONBOARDING]: 'onboarding',
  [AppState.LOBBY]: 'lobby',
  [AppState.REPORT]: 'report',
};

const readCompletedTour = (tourId: ProductTourId): boolean => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(buildTourStorageKey(tourId)) === 'true';
};

const writeCompletedTour = (tourId: ProductTourId): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(buildTourStorageKey(tourId), 'true');
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<AppState>(AppState.LOGIN);
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<InterviewPlan | null>(null);
  const [initialAvatar, setInitialAvatar] = useState<AvatarResponse | null>(null);
  const [report, setReport] = useState<FinalReport | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [activeTourId, setActiveTourId] = useState<ProductTourId | null>(null);
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
    interviewMode: 'candidate_coaching_mode',
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
        setInitialAvatar(null);
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

      const token = await fbUser.getIdToken(false).catch(() => null);

      try {
        const profile = token ? await BackendApi.meWithToken(token) : await BackendApi.me();
        if (!mounted) return;
        setUser(profile);
        void retryAudioChunksInBackground().catch((error) => {
          console.warn('Audio chunk retry bootstrap failed', error);
        });
      } catch (e) {
        console.warn('Nao foi possivel sincronizar /me. Mantendo perfil local do Firebase.', e);
      }

      try {
        const candidate = await BackendApi.getCandidateProfile();
        if (!mounted) return;
        setCandidateProfile(candidate);
      } catch (e) {
        if (!mounted) return;
        setCandidateProfile(null);
        console.warn('Nao foi possivel carregar /profile/candidate. Continuando sem perfil salvo.', e);
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

  useEffect(() => {
    if (!user) {
      setActiveTourId(null);
      return;
    }

    const nextTourId = AUTO_TOUR_BY_STATE[state];
    if (!nextTourId) {
      setActiveTourId(null);
      return;
    }

    if (nextTourId === 'report' && !report) {
      return;
    }

    if (readCompletedTour(nextTourId)) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setActiveTourId((current) => current || nextTourId);
    }, 350);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [report, state, user]);

  useEffect(() => {
    if (!activeTourId) return;
    const currentTourForState = AUTO_TOUR_BY_STATE[state];
    if (!currentTourForState) {
      setActiveTourId(null);
      return;
    }

    if (activeTourId === 'report' && state === AppState.REPORT && report) {
      return;
    }

    if (currentTourForState !== activeTourId) {
      setActiveTourId(null);
    }
  }, [activeTourId, report, state]);

  useEffect(() => {
    const root = document.documentElement;
    const useDocumentScroll = [AppState.DASHBOARD, AppState.PROFILE].includes(state);

    root.classList.toggle('fd-document-scroll', useDocumentScroll);

    return () => {
      root.classList.remove('fd-document-scroll');
    };
  }, [state]);

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    setCandidateProfile(null);
    setInitialAvatar(null);
    setState(AppState.DASHBOARD);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setCandidateProfile(null);
    setInitialAvatar(null);
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

  const handleOpenInterviewReport = async (targetSessionId: string) => {
    try {
      const sessionReport = await BackendApi.getSessionReport(targetSessionId);
      if (!sessionReport.hasReport || !sessionReport.report) {
        showGlobalNotice('Essa sessao ainda nao possui relatorio salvo.');
        return;
      }

      if (sessionReport.config) {
        setConfig(sessionReport.config);
      }
      setSessionId(targetSessionId);
      setPlan(null);
      setInitialAvatar(null);
      setReport(sessionReport.report);
      setState(AppState.REPORT);
    } catch (e: any) {
      showGlobalNotice(e?.message || 'Nao foi possivel abrir o relatorio da entrevista.');
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
    setInitialAvatar(null);
    setState(AppState.LOBBY);
    showGlobalNotice('Entrevista interrompida.');
  };

  const handleStartInterview = () => {
    const missingProfileFields = getMissingCandidateProfileFields(candidateProfile);
    if (missingProfileFields.length > 0) {
      setState(AppState.PROFILE);
      showGlobalNotice(
        `Antes de iniciar a entrevista, complete o perfil do candidato. Faltando: ${missingProfileFields.join(', ')}.`,
      );
      return;
    }
    setState(AppState.ONBOARDING);
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

  const showHeader = ![AppState.INTERVIEWING, AppState.LOGIN, AppState.PROFILE, AppState.REPORT].includes(state);
  const disableMainScroll = state === AppState.LOBBY;
  const useDocumentScrollLayout = [AppState.DASHBOARD, AppState.PROFILE].includes(state);
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

  const currentTourId = AUTO_TOUR_BY_STATE[state] || null;
  const activeTourSteps =
    activeTourId && user
      ? getTourSteps(activeTourId, config.uiLanguage)
      : [];

  const closeActiveTour = () => {
    if (activeTourId) {
      writeCompletedTour(activeTourId);
    }
    setActiveTourId(null);
  };

  const wideStates = [
    AppState.DASHBOARD,
    AppState.INTERVIEWING,
    AppState.ONBOARDING,
    AppState.PROFILE,
    AppState.LOBBY,
    AppState.REPORT,
  ];
  const containerClass =
    state === AppState.LOGIN
      ? 'w-full h-full'
      : wideStates.includes(state)
        ? 'w-full h-full'
        : 'max-w-md mx-auto h-full';

  return (
    <div className={`fd-app-shell flex flex-col ${useDocumentScrollLayout ? 'min-h-screen' : 'h-full overflow-hidden'}`}>
      {globalNotice && (
        <div className="fd-global-notice z-[90]">
          <div className="flex items-center justify-between gap-3">
            <span>{globalNotice}</span>
            <button
              type="button"
              onClick={clearGlobalNotice}
              className="fd-small-action"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {showHeader && (
        <header
          className={`fd-app-header flex items-center justify-between shrink-0 z-50 ${
            useDocumentScrollLayout ? 'fd-app-header-sticky' : ''
          }`}
        >
          <div className="fd-app-header-main">
            {canHeaderBack && (
              <button
                type="button"
                onClick={handleHeaderBack}
                className="fd-icon-button flex items-center justify-center active:scale-95"
                aria-label="Voltar"
              >
                {'<'}
              </button>
            )}
            <div className="fd-app-brand">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden">
                <img src="/img/logo.png" alt="Dev Interview AI" className="w-full h-full object-contain rounded-md" />
              </div>
              <div className="fd-app-brand-copy">
                <div className="fd-app-brand-meta">
                  <h1 className="fd-brand-title">{t.title}</h1>
                  <span className="fd-credit-pill">{user?.credits || 0} credits</span>
                </div>
              </div>
            </div>
          </div>
          <div className="fd-app-header-actions">
            {currentTourId && (
              <button
                type="button"
                onClick={() => setActiveTourId(currentTourId)}
                className="fd-small-action hover:scale-95"
                title="Tour guiado"
                aria-label="Abrir tour guiado"
              >
                Tour
              </button>
            )}
            <button
              onClick={() => setState(AppState.PROFILE)}
              data-tour-id="app-header-profile"
              className="fd-avatar-button text-sm"
              aria-label="Abrir perfil"
            >
              {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : (user?.name?.charAt(0) || 'U')}
            </button>
          </div>
        </header>
      )}

      <main
        className={
          useDocumentScrollLayout
            ? 'flex-1 overflow-visible'
            : disableMainScroll
              ? 'flex-1 overflow-hidden'
              : 'flex-1 overflow-y-auto no-scrollbar'
        }
      >
        <div className={containerClass}>
          <Suspense fallback={<RouteLoading />}>
            {state === AppState.LOGIN && <Login onLogin={handleLogin} />}

            {state === AppState.DASHBOARD && user && (
              <Dashboard
                user={user}
                candidateProfile={candidateProfile}
                onOpenProfile={() => setState(AppState.PROFILE)}
                onStartInterview={handleStartInterview}
                onOpenInterviewReport={handleOpenInterviewReport}
                onDeleteInterview={handleDeleteInterview}
              />
            )}

            {state === AppState.PROFILE && user && (
              <UserProfile
                user={user}
                config={config}
                onBack={() => setState(AppState.DASHBOARD)}
                onOpenTour={() => setActiveTourId('profile')}
                onLogout={handleLogout}
                onAddCredits={addCredits}
                onOpenInterviewReport={handleOpenInterviewReport}
                onDeleteInterview={handleDeleteInterview}
                onUserUpdated={(nextUser) => setUser(nextUser)}
                onCandidateProfileUpdated={(profile) => setCandidateProfile(profile)}
              />
            )}

            {state === AppState.ONBOARDING && (
              <div className="h-full">
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
              <div className="h-full overflow-hidden">
                <Lobby
                  config={config}
                  userCredits={user?.credits || 0}
                  candidateProfile={candidateProfile}
                  onOpenProfile={() => setState(AppState.PROFILE)}
                  onStart={(p, sid, credits, difficultyLevel, nextAvatar) => {
                    setPlan(p);
                    setSessionId(sid);
                    setInitialAvatar(nextAvatar || null);
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
                  sessionId={sessionId || undefined}
                  initialAvatar={initialAvatar || undefined}
                  user={user}
                  onFinish={handleInterviewFinish}
                  onBack={handleInterviewBack}
                />
              </div>
            )}

            {state === AppState.REPORT && report && (
              <div className="h-full">
                <Report
                  config={config}
                  report={report}
                  onBack={() => {
                    setReport(null);
                    setPlan(null);
                    setSessionId(null);
                    setInitialAvatar(null);
                    setState(AppState.DASHBOARD);
                  }}
                />
              </div>
            )}
          </Suspense>
        </div>
      </main>

      <ProductTour
        open={Boolean(activeTourId && activeTourSteps.length > 0)}
        steps={activeTourSteps}
        locale={config.uiLanguage}
        onClose={closeActiveTour}
        onComplete={closeActiveTour}
      />
    </div>
  );
};

export default App;
