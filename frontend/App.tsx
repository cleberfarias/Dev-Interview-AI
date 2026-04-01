import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppState,
  AvatarResponse,
  CandidateProfile,
  InterviewConfig,
  InterviewPlan,
  FinalReport,
  OrchestratorContextResponse,
  User,
} from './src/shared/types';
import { I18N, clampDuration, INTERVIEW_LIMITS } from './src/shared/constants';
import { LandingPage, Login } from './src/features/auth';
import { auth } from './src/lib/firebase';
import { onAuthStateChanged, signOut, type User as FirebaseUser } from 'firebase/auth';
import { BackendApi } from './src/shared/services/backendApi';
import {
  appQueryKeys,
  useAnalyzeJob,
  useCandidateProfile,
  useDeleteSession,
  useMe,
  useSessionReport,
  useUpsertCandidateProfile,
} from './src/shared/hooks/useAppQueries';
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
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<AppState>(AppState.LOGIN);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plan, setPlan] = useState<InterviewPlan | null>(null);
  const [initialAvatar, setInitialAvatar] = useState<AvatarResponse | null>(null);
  const [interviewContext, setInterviewContext] = useState<OrchestratorContextResponse | null>(null);
  const [report, setReport] = useState<FinalReport | null>(null);
  const [candidateProfile, setCandidateProfile] = useState<CandidateProfile | null>(null);
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [activeTourId, setActiveTourId] = useState<ProductTourId | null>(null);
  const [sessionReportRequestId, setSessionReportRequestId] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const audioRetryUidRef = useRef<string | null>(null);
  const meQuery = useMe(firebaseUser);
  const candidateProfileQuery = useCandidateProfile(firebaseUser?.uid);
  const deleteSessionMutation = useDeleteSession();
  const analyzeJobMutation = useAnalyzeJob();
  const upsertCandidateProfileMutation = useUpsertCandidateProfile();
  const sessionReportQuery = useSessionReport(sessionReportRequestId);

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
    interviewModeLevel: 2,
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
        setFirebaseUser(null);
        setUser(null);
        setCandidateProfile(null);
        setInitialAvatar(null);
        setInterviewContext(null);
        setState(AppState.LOGIN);
        finishFirstLoad();
        return;
      }

      setFirebaseUser(fbUser);
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
    if (!meQuery.data) return;
    setUser(meQuery.data);

    if (audioRetryUidRef.current === meQuery.data.uid) return;
    audioRetryUidRef.current = meQuery.data.uid;
    void retryAudioChunksInBackground().catch((error) => {
      console.warn('Audio chunk retry bootstrap failed', error);
    });
  }, [meQuery.data]);

  useEffect(() => {
    if (firebaseUser) return;
    audioRetryUidRef.current = null;
  }, [firebaseUser]);

  useEffect(() => {
    if (!candidateProfileQuery.data) return;
    setCandidateProfile(candidateProfileQuery.data);
  }, [candidateProfileQuery.data]);

  useEffect(() => {
    if (!candidateProfileQuery.error) return;
    setCandidateProfile(null);
    console.warn('Nao foi possivel carregar /profile/candidate. Continuando sem perfil salvo.', candidateProfileQuery.error);
  }, [candidateProfileQuery.error]);

  useEffect(() => {
    if (!sessionReportRequestId) return;

    if (sessionReportQuery.error) {
      showGlobalNotice(sessionReportQuery.error.message || 'Nao foi possivel abrir o relatorio da entrevista.');
      setSessionReportRequestId(null);
      return;
    }

    const sessionReport = sessionReportQuery.data;
    if (!sessionReport) return;

    if (!sessionReport.hasReport || !sessionReport.report) {
      showGlobalNotice('Essa sessao ainda nao possui relatorio salvo.');
      setSessionReportRequestId(null);
      return;
    }

    if (sessionReport.config) {
      setConfig(sessionReport.config);
    }
    setSessionId(sessionReportRequestId);
    setPlan(null);
    setInitialAvatar(null);
    setReport(sessionReport.report);
    setState(AppState.REPORT);
    setSessionReportRequestId(null);
  }, [sessionReportQuery.data, sessionReportQuery.error, sessionReportRequestId]);

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
    setInterviewContext(null);
    setState(AppState.DASHBOARD);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setCandidateProfile(null);
    setInitialAvatar(null);
    setInterviewContext(null);
    setState(AppState.LOGIN);
  };

  const addCredits = async (amount: number) => {
    if (!user) return;
    try {
      const res = await BackendApi.devAddCredits(amount);
      const nextUser = { ...user, credits: res.credits };
      setUser(nextUser);
      queryClient.setQueryData(appQueryKeys.me(user.uid), nextUser);
    } catch (e: any) {
      showGlobalNotice(e?.message || 'Nao foi possivel adicionar creditos.');
    }
  };

  const handleDeleteInterview = async (targetSessionId: string) => {
    if (!user) return;
    try {
      await deleteSessionMutation.mutateAsync(targetSessionId);
      const nextUser = { ...user, interviews: user.interviews.filter((item) => item.id !== targetSessionId) };
      setUser(nextUser);
      queryClient.setQueryData(appQueryKeys.me(user.uid), nextUser);
    } catch (e: any) {
      showGlobalNotice(e?.message || 'Nao foi possivel excluir a entrevista.');
    }
  };

  const handleOpenInterviewReport = async (targetSessionId: string) => {
    setSessionReportRequestId(targetSessionId);
  };

  const handleUserUpdated = useCallback(
    (nextUser: User) => {
      setUser(nextUser);
      queryClient.setQueryData(appQueryKeys.me(nextUser.uid), nextUser);
    },
    [queryClient],
  );

  const handleCandidateProfileUpdated = useCallback(
    (profile: CandidateProfile) => {
      setCandidateProfile(profile);
      queryClient.setQueryData(appQueryKeys.candidateProfile(profile.userId), profile);
    },
    [queryClient],
  );

  const handleInterviewFinish = async (finalReport: FinalReport) => {
    setReport(finalReport);
    setState(AppState.REPORT);

    if (!sessionId) return;
    try {
      await BackendApi.finishSession(sessionId, finalReport, {
        uiLanguage: config.uiLanguage,
        interviewLanguage: config.interviewLanguage,
      });
      if (user) {
        await queryClient.invalidateQueries({ queryKey: appQueryKeys.me(user.uid) });
      }
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
    setInterviewContext(null);
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
      const existing = candidateProfileQuery.data || null;
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
          const analysis = await analyzeJobMutation.mutateAsync({
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

      const saved = await upsertCandidateProfileMutation.mutateAsync(payload);
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
                onUserUpdated={handleUserUpdated}
                onCandidateProfileUpdated={handleCandidateProfileUpdated}
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
                  onStart={(p, sid, credits, interviewModeLevel, nextAvatar, context) => {
                    setPlan(p);
                    setSessionId(sid);
                    setInitialAvatar(nextAvatar || null);
                    setInterviewContext(context || null);
                    setConfig((prev) => ({
                      ...prev,
                      interviewModeLevel: interviewModeLevel ?? prev.interviewModeLevel ?? 2,
                    }));
                    if (user) {
                      const nextUser = { ...user, credits };
                      setUser(nextUser);
                      queryClient.setQueryData(appQueryKeys.me(user.uid), nextUser);
                    }
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
                  context={interviewContext || undefined}
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
                    setInterviewContext(null);
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
