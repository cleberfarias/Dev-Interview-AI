import React, { useState, useEffect, useRef } from 'react';
import { InterviewConfig, InterviewPlan } from '../types';
import type { DifficultyLevel } from '../types/interview';
import { clampDuration } from '../constants';
import { BackendApi } from '../services/backendApi';

interface Props {
  config: InterviewConfig;
  userCredits: number;
  onStart: (plan: InterviewPlan, sessionId: string, credits: number, difficultyLevel?: DifficultyLevel) => void;
  onBack: () => void;
}

const START_QUESTION_TIMEOUT_MS = 1800;
const PLAN_GENERATE_TIMEOUT_MS = 8000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
};

const starterPrompt = (language: string): string => {
  const prompts: Record<string, string> = {
    'pt-BR':
      'Para aquecer, conte sobre um projeto recente e qual foi o desafio tecnico mais dificil que voce resolveu.',
    en: 'To warm up, tell me about a recent project and the hardest technical challenge you solved.',
    es: 'Para empezar, cuentame sobre un proyecto reciente y cual fue el desafio tecnico mas dificil que resolviste.',
  };
  return prompts[language] || prompts['pt-BR'];
};

const starterDifficulty = (level: DifficultyLevel): number => {
  if (level <= 1) return 2;
  if (level === 2) return 3;
  return 4;
};

const buildStarterPlan = (config: InterviewConfig, level: DifficultyLevel): InterviewPlan => ({
  roleTitleGuess: config.track || 'Entrevista',
  seniorityGuess: config.seniority,
  mustHaveSkills: config.stacks || [],
  blueprint: { hr: 15, technical: 50, design: 20, behavioral: 15 },
  questions: [
    {
      id: 'q1',
      section: 'technical',
      difficulty: starterDifficulty(level),
      prompt: starterPrompt(config.interviewLanguage),
    },
  ],
});

const Lobby: React.FC<Props> = ({ config, userCredits, onStart, onBack }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<DifficultyLevel>(config.difficultyLevel ?? 3);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioIntervalRef = useRef<number | null>(null);
  const hasCredits = userCredits > 0;

  useEffect(() => {
    async function setupMedia() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(s);
        setError(null);
        if (videoRef.current) videoRef.current.srcObject = s;

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(s);
        source.connect(analyser);
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setAudioLevel(average);
          audioIntervalRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      } catch (err) {
        console.error(err);
        setError('Nao foi possivel acessar camera/microfone. Libere as permissoes e tente novamente.');
      }
    }
    setupMedia();
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      if (audioIntervalRef.current) cancelAnimationFrame(audioIntervalRef.current);
    };
  }, []);

  const handleEnter = async () => {
    if (!hasCredits) return;
    setLoading(true);
    setError(null);

    try {
      const { difficultyLevel, ...restConfig } = config;
      const effectiveConfig = { ...restConfig, duration: clampDuration(config.duration, config.plan) };
      const res = await BackendApi.startSession(effectiveConfig);

      const nextQuestionPromise = BackendApi.nextQuestion({
        config: effectiveConfig,
        history: [],
        remainingSeconds: Math.max(0, Math.round(effectiveConfig.duration * 60)),
        difficultyLevel: selectedLevel,
      }).catch(() => null);

      const timeoutPromise = new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), START_QUESTION_TIMEOUT_MS);
      });

      const nextRes = await Promise.race([nextQuestionPromise, timeoutPromise]);

      if (nextRes?.question) {
        const planStub: InterviewPlan = {
          roleTitleGuess: effectiveConfig.track || 'Entrevista',
          seniorityGuess: effectiveConfig.seniority,
          mustHaveSkills: effectiveConfig.stacks || [],
          blueprint: { hr: 15, technical: 50, design: 20, behavioral: 15 },
          questions: [nextRes.question],
        };
        onStart(planStub, res.sessionId, res.credits, selectedLevel);
        return;
      }

      try {
        const generated = await withTimeout(
          BackendApi.generatePlan(res.sessionId),
          PLAN_GENERATE_TIMEOUT_MS,
        );
        if (generated?.plan?.questions?.length) {
          onStart(generated.plan, generated.sessionId, generated.credits, selectedLevel);
          return;
        }
      } catch (planErr) {
        console.warn('Plan generation fallback failed', planErr);
      }

      onStart(buildStarterPlan(effectiveConfig, selectedLevel), res.sessionId, res.credits, selectedLevel);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Erro ao iniciar sessao.';
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="h-full animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl mx-auto w-full flex flex-col gap-5 overflow-hidden">
      <p className="text-slate-400 text-sm font-medium">Sua sessao de treino tecnico comeca agora.</p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs font-semibold rounded-2xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="relative flex-1 min-h-0 max-h-[52dvh] bg-slate-900 rounded-[3rem] overflow-hidden border-2 border-slate-800 shadow-3xl shadow-indigo-900/10">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover mirror grayscale-[20%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />

        {!stream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 gap-4">
            <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="absolute top-6 left-6 right-6 flex justify-between">
          <div className="native-glass px-4 py-2 rounded-2xl flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-black text-white uppercase tracking-widest">Live Preview</span>
          </div>
          <div className="native-glass px-4 py-2 rounded-2xl flex items-center gap-3">
            <div className="flex gap-0.5 items-center">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full ${audioLevel > i * 10 ? 'bg-indigo-400' : 'bg-slate-700'}`}
                  style={{ height: '8px' }}
                />
              ))}
            </div>
            <span className="text-[9px] font-black text-white uppercase tracking-widest">Mic Active</span>
          </div>
        </div>

        <div className="absolute bottom-8 left-8 right-8 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="native-glass p-4 rounded-[2rem] border-white/5 space-y-1">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Custo</p>
              <p className="text-[10px] font-black text-amber-400 uppercase">1 Credito</p>
            </div>
            <div className="native-glass p-4 rounded-[2rem] border-white/5 space-y-1">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Saldo</p>
              <p className="text-[10px] font-black text-white uppercase">{userCredits} Disp.</p>
            </div>
          </div>
        </div>
      </div>

      {!hasCredits && (
        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-[2rem] text-center space-y-2">
          <p className="text-red-400 text-xs font-black uppercase tracking-widest">Creditos Insuficientes</p>
          <p className="text-slate-400 text-[10px] font-medium leading-relaxed">
            Voce precisa de pelo menos 1 credito para iniciar uma simulacao.
          </p>
        </div>
      )}

      <div className="bg-slate-900/70 border border-white/5 rounded-[2rem] p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Nivel da Entrevista</p>
          <p className="text-[11px] text-slate-400 font-medium mt-1">Escolha a dificuldade antes de iniciar</p>
        </div>
        <div className="flex gap-2">
          {([1, 2, 3] as DifficultyLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setSelectedLevel(level)}
              aria-pressed={selectedLevel === level}
              className={`w-10 h-10 rounded-xl text-xs font-black border transition-all ${
                selectedLevel === level
                  ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/30'
                  : 'bg-slate-800 text-slate-400 border-white/5'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={onBack}
          className="col-span-1 py-7 rounded-[2.5rem] bg-slate-900 text-slate-400 font-black border border-white/5 active:scale-95 transition-all flex items-center justify-center"
        >
          {'<'}
        </button>
        <button
          onClick={handleEnter}
          disabled={loading || !stream || !hasCredits}
          className={`col-span-3 py-7 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.3em] transition-all shadow-2xl flex items-center justify-center gap-4 btn-haptic border-b-8 ${
            loading || !stream || !hasCredits
              ? 'bg-slate-800 text-slate-600 border-slate-900'
              : 'bg-indigo-600 text-white border-indigo-800'
          }`}
        >
          {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Iniciar Treino'}
        </button>
      </div>
    </div>
  );
};

export default Lobby;
