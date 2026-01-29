import React, { useState, useEffect } from 'react';
import { AppState, InterviewConfig, InterviewPlan, FinalReport, User } from './types';
import { I18N, clampDuration, INTERVIEW_LIMITS } from './constants';
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import Lobby from './components/Lobby';
import InterviewRoom from './components/InterviewRoom';
import Report from './components/Report';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import UserProfile from './components/UserProfile';
import { auth } from './src/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { BackendApi } from './services/backendApi';

const SplashScreen: React.FC = () => (
  <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center animate-in fade-in duration-500">
    <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-2xl shadow-indigo-500/40 animate-float">
      <span className="text-white text-5xl font-black">D</span>
    </div>
    <div className="mt-8 space-y-2 text-center">
      <h1 className="text-xl font-extrabold tracking-tighter text-white uppercase">Dev Interview</h1>
      <div className="flex gap-1 justify-center">
        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  // start the app directly on the login screen (no public landing)
  const [state, setState] = useState<AppState>(AppState.LOGIN);
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [config, setConfig] = useState<InterviewConfig>({
    uiLanguage: 'pt-BR',
    interviewLanguage: 'pt-BR',
    track: 'frontend',
    seniority: 'mid',
    stacks: ['JavaScript', 'TypeScript', 'React'],
    style: 'friendly',
    duration: clampDuration(INTERVIEW_LIMITS.free, 'free'),
    plan: 'free',
    jobDescription: ''
  });

  const [plan, setPlan] = useState<InterviewPlan | null>(null);
  const [report, setReport] = useState<FinalReport | null>(null);

  useEffect(() => {
    let first = true;
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      console.debug('onAuthStateChanged: fbUser=', fbUser);
      try {
        if (fbUser) {
          // get fresh token and call backend with it to avoid timing issues
          const token = await fbUser.getIdToken(/* forceRefresh */ false).catch(() => null);
          console.debug('onAuthStateChanged: token length=', token ? token.length : 0);
          const profile = token ? await BackendApi.meWithToken(token) : await BackendApi.me();
          console.debug('onAuthStateChanged: profile=', profile);
          setUser(profile);
          if (state === AppState.LANDING || state === AppState.LOGIN) {
            setState(AppState.DASHBOARD);
          }
        } else {
          setUser(null);
          setState(AppState.LOGIN);
        }
      } catch (e) {
        console.error('Auth handler error', e);
        setUser(null);
        setState(AppState.LOGIN);
      } finally {
        if (first) {
          setLoading(false);
          first = false;
        }
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    setState(AppState.DASHBOARD);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setState(AppState.LOGIN);
  };

  const addCredits = async (amount: number) => {
    if (!user) return;
    try {
      const res = await BackendApi.devAddCredits(amount);
      setUser({ ...user, credits: res.credits });
    } catch (e: any) {
      alert(e?.message || 'Não foi possível adicionar créditos (dev)');
    }
  };

  const handleDeleteInterview = async (sessionId: string) => {
    if (!user) return;
    try {
      await BackendApi.deleteSession(sessionId);
      const profile = await BackendApi.me().catch(() => null);
      if (profile) {
        setUser(profile);
      } else {
        setUser({ ...user, interviews: user.interviews.filter((item) => item.id !== sessionId) });
      }
    } catch (e: any) {
      alert(e?.message || 'N??o foi poss??vel excluir a entrevista');
    }
  };


  const handleInterviewFinish = async (finalReport: FinalReport) => {
    setReport(finalReport);
    setState(AppState.REPORT);

    // Persist in Firestore
    if (!sessionId) return;
    try {
      await BackendApi.finishSession(sessionId, finalReport, {
        uiLanguage: config.uiLanguage,
        interviewLanguage: config.interviewLanguage,
      });
      // refresh profile (credits + history)
      const profile = await BackendApi.me();
      setUser(profile);
    } catch (e) {
      console.error(e);
    }
  };

  const t = I18N[config.uiLanguage];

  if (loading) return <SplashScreen />;
  if (state === AppState.LANDING) return <LandingPage onGetStarted={() => setState(AppState.LOGIN)} />;

  const showHeader = ![AppState.INTERVIEWING, AppState.LOGIN, AppState.PROFILE].includes(state);

  const containerClass =
    state === AppState.DASHBOARD || state === AppState.INTERVIEWING
      ? 'w-full h-full'
      : 'max-w-md mx-auto h-full';

  return (
    <div className="h-full flex flex-col bg-[#020617] overflow-hidden">
      {showHeader && (
        <header className="px-6 py-4 flex items-center justify-between shrink-0 native-glass z-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white text-sm">D</div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xs font-black text-white uppercase">{t.title}</h1>
                <span className="text-[7px] text-amber-400 font-black bg-slate-800 px-1.5 py-0.5 rounded-full">🪙 {user?.credits || 0}</span>
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

      <main className="flex-1 overflow-y-auto no-scrollbar">
        <div className={containerClass}>
          {state === AppState.LOGIN && <Login onLogin={handleLogin} />}
          {state === AppState.DASHBOARD && user && (
            <Dashboard
              user={user}
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
            />
          )}
          {state === AppState.ONBOARDING && (
            <div className="p-4 h-full">
              <Onboarding onComplete={(c) => { setConfig(c); setState(AppState.LOBBY); }} initialConfig={config} />
            </div>
          )}
          {state === AppState.LOBBY && (
            <div className="p-4">
              <Lobby
                config={config}
                userCredits={user?.credits || 0}
                onStart={(p, sid, credits) => {
                  setPlan(p);
                  setSessionId(sid);
                  if (user) setUser({ ...user, credits });
                  setState(AppState.INTERVIEWING);
                }}
                onBack={() => setState(AppState.ONBOARDING)}
              />
            </div>
          )}
          {state === AppState.INTERVIEWING && plan && user && (
            <div className="max-w-none h-full">
              <InterviewRoom config={config} plan={plan} user={user} onFinish={handleInterviewFinish} />
            </div>
          )}
          {state === AppState.REPORT && report && (
            <div className="p-4">
              <Report config={config} report={report} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
