
import React, { useState, useEffect, useRef } from 'react';
import { InterviewConfig, InterviewPlan, FinalReport, AnswerEvaluation, User } from '../types';
import { I18N, clampDuration } from '../constants';
import { BackendApi } from '../services/backendApi';

interface Props {
  config: InterviewConfig;
  plan: InterviewPlan;
  user: User;
  onFinish: (report: FinalReport) => void;
}

const InterviewRoom: React.FC<Props> = ({ config, plan, user, onFinish }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1); // -1: Intro, 0+: Questions
  const [confirmedName, setConfirmedName] = useState(user.name.split(' ')[0]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionTime, setSessionTime] = useState(0);
  const [history, setHistory] = useState<Array<{ question: string, evaluation: AnswerEvaluation }>>([]);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);
  const speechNonceRef = useRef(0);
  const timeLimitReachedRef = useRef(false);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const t = I18N[config.uiLanguage];
  const maxDurationMinutes = clampDuration(config.duration, config.plan);
  const maxDurationSeconds = maxDurationMinutes * 60;
  const formatStepLabel = () => {
    const template = t.stepLabel || 'Stage {current} of {total}';
    return template
      .replace('{current}', String(currentQuestionIndex + 1))
      .replace('{total}', String(plan.questions.length));
  };

  // Helper: Decode base64 to Uint8Array (Standard manual implementation)
  const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Helper: Decode raw PCM data (as returned by Gemini TTS)
  const decodeAudioData = async (
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> => {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  };

  const stopCurrentAudio = () => {
    if (audioElemRef.current) {
      try { audioElemRef.current.pause(); audioElemRef.current.src = ''; } catch (e) {}
      audioElemRef.current = null;
    }
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch (e) {}
      currentSourceRef.current = null;
    }
    setIsAiSpeaking(false);
  };

  useEffect(() => {
    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (videoRef.current) videoRef.current.srcObject = stream;
        const audioTracks = stream.getAudioTracks();
        audioStreamRef.current = audioTracks.length ? new MediaStream(audioTracks) : null;
        
        // Start Interview Intro (shorter delay for more fluid experience)
        setTimeout(() => {
          const greeting = `${t.introGreeting} ${t.askName}`.trim();
          speakQuestion(greeting);
        }, 800);
      } catch (err) {
        console.error("Camera error:", err);
      }
    }
    init();

    const timer = setInterval(() => setSessionTime(s => s + 1), 1000);
    return () => {
      clearInterval(timer);
      stopCurrentAudio();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      audioStreamRef.current = null;
    };
  }, []);

  const speakQuestion = async (text: string) => {
    stopCurrentAudio();
    const nonce = ++speechNonceRef.current;
    setIsAiSpeaking(true);
    // Try server-side TTS first (more natural voices). Fallback to browser TTS.
    try {
      const res = await BackendApi.tts(text, config.interviewLanguage || 'pt-BR');
      if (speechNonceRef.current !== nonce) return;
      if (res && res.audioBase64) {
        const src = `data:${res.mimeType};base64,${res.audioBase64}`;
        const audio = new Audio(src);
        audioElemRef.current = audio;
        audio.onended = () => setIsAiSpeaking(false);
        audio.onerror = () => setIsAiSpeaking(false);
        await audio.play();
        return;
      }
    } catch (e) {
      console.warn('Server TTS failed, falling back to speechSynthesis', e);
    }

    if (speechNonceRef.current !== nonce) return;
    const synth = window.speechSynthesis;
    if (!synth) {
      setIsAiSpeaking(false);
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = config.interviewLanguage || 'pt-BR';
    try {
      const voices = synth.getVoices();
      const preferred = voices.find(v => v.lang && v.lang.toLowerCase().startsWith((utter.lang || 'pt').toLowerCase()) && /google|microsoft|narrator|samantha|alva|brasilia/i.test(v.name))
                      || voices.find(v => v.lang && v.lang.toLowerCase().startsWith((utter.lang || 'pt').toLowerCase()));
      if (preferred) utter.voice = preferred;
    } catch (e) {}

    utter.rate = 1.05;
    utter.pitch = 1.02;

    utter.onend = () => setIsAiSpeaking(false);
    utter.onerror = () => setIsAiSpeaking(false);

    synth.cancel();
    synth.speak(utter);
  };

  const toggleRecording = () => {
    if (isAiSpeaking || isProcessing || timeLimitReachedRef.current) return;
    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      audioChunksRef.current = [];
      const stream = audioStreamRef.current || (videoRef.current?.srcObject as MediaStream | null);
      if (!stream) return;
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) return;

      const recordStream = new MediaStream(audioTracks);
      let options: MediaRecorderOptions | undefined;
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      }

      const recorder = new MediaRecorder(recordStream, options);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = handleRecordingStop;
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    }
  };

  const handleRecordingStop = async () => {
    setIsRecording(false);
    setIsProcessing(true);
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = async () => {
      const base64Audio = (reader.result as string).split(',')[1];
      await processResponse(base64Audio);
    };
  };

  const processResponse = async (audioBase64: string) => {
    try {
      if (currentQuestionIndex === -1) {
        const res = await BackendApi.nameExtract(audioBase64, 'audio/webm', config.uiLanguage);
        const extractedName = (res.name || confirmedName || 'Candidato').trim();
        setConfirmedName(extractedName);

        setCurrentQuestionIndex(0);
        setIsProcessing(false);
        const firstQuestion = plan.questions[0].prompt;
        // shorter gap for more fluid conversation
        const intro = (t.niceToMeet || 'Nice to meet you, {name}. Let’s start.')
          .replace('{name}', extractedName);
        setTimeout(() => speakQuestion(`${intro} ${firstQuestion}`), 150);
      } else {
        const questionPrompt = plan.questions[currentQuestionIndex].prompt;
        const evaluation = await evaluateWithBackend(questionPrompt, audioBase64);
        const updatedHistory = [...history, { question: questionPrompt, evaluation }];
        setHistory(updatedHistory);

        const timeUp = timeLimitReachedRef.current || sessionTime >= maxDurationSeconds;
        if (currentQuestionIndex < plan.questions.length - 1 && !timeUp) {
          const nextIdx = currentQuestionIndex + 1;
          setCurrentQuestionIndex(nextIdx);
          setIsProcessing(false);
          const nextQuestion = plan.questions[nextIdx].prompt;
          setTimeout(() => speakQuestion(`${confirmedName}, ${nextQuestion}`), 150);
        } else {
          await finalize(updatedHistory);
        }
      }
    } catch (err) {
      console.error("Process error:", err);
      setIsProcessing(false);
      const message = err instanceof Error ? err.message : "Houve um erro na análise. Pode repetir, por favor?";
      setError(message);
    }
  };

  const evaluateWithBackend = async (question: string, audioBase64: string): Promise<AnswerEvaluation> => {
    return await BackendApi.evaluateAudio({
      config,
      question,
      audioBase64,
      mimeType: 'audio/webm',
      confirmedName,
    });
  };

  const handleFinishEarly = () => {
    if (isProcessing) return;
    if (window.confirm(t.confirmFinish)) {
      stopCurrentAudio();
      if (history.length > 0) {
        finalize(history);
      } else {
        window.location.reload();
      }
    }
  };

  const finalize = async (finalHistory: any) => {
    setIsProcessing(true);
    try {
      const report = await BackendApi.finalReport({ config, history: finalHistory });

      onFinish(report);
    } catch (err) {
      console.error("Finalize error:", err);
      setIsProcessing(false);
      const message = err instanceof Error ? err.message : "Erro ao gerar relatório. Tente finalizar novamente.";
      setError(message);
    }
  };

  useEffect(() => {
    if (timeLimitReachedRef.current) return;
    if (sessionTime < maxDurationSeconds) return;
    timeLimitReachedRef.current = true;
    stopCurrentAudio();
    setError(t.timeLimitReached || `Tempo limite (${maxDurationMinutes} min) atingido. Finalizando...`);

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!isProcessing) {
      if (history.length > 0) {
        finalize(history);
      } else {
        setIsProcessing(false);
      }
    }
  }, [sessionTime, maxDurationSeconds, maxDurationMinutes, isRecording, isProcessing, history, t.timeLimitReached]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-slate-950 relative overflow-hidden pb-safe">
      {error && (
        <div className="absolute top-24 left-6 right-6 z-[60]">
          <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs font-semibold rounded-2xl px-4 py-3 flex items-start justify-between gap-3">
            <span className="leading-relaxed">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-200/70 hover:text-red-100 text-xs font-black uppercase tracking-widest"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
      {/* HUD */}
      <div className="absolute top-6 left-6 right-6 z-50 flex justify-between items-start">
        <div className="flex flex-col gap-2">
          <div className="native-glass px-4 py-2 rounded-2xl flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-black text-white tabular-nums">{formatTime(sessionTime)}</span>
          </div>
          <div className="native-glass px-4 py-2 rounded-2xl">
             <span className="text-[10px] font-black text-indigo-400 uppercase">
               {currentQuestionIndex === -1 ? (t.introLabel || 'Introduction') : formatStepLabel()}
             </span>
          </div>
        </div>
        
        <button 
          onClick={handleFinishEarly}
          disabled={isProcessing}
          className="native-glass px-5 py-2.5 rounded-2xl bg-red-500/10 border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl disabled:opacity-50"
        >
          {t.finishEarly}
        </button>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 relative flex flex-col">
        <div className="flex-1 bg-slate-900 flex items-center justify-center relative overflow-hidden">
          <div className="w-full h-full flex flex-col items-center justify-center">
            <div className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-700 shadow-2xl relative ${
              isAiSpeaking ? 'bg-indigo-600/30 scale-110 shadow-indigo-500/20 ring-4 ring-indigo-500/20' : 'bg-slate-800 scale-100'
            }`}>
              <span className="text-7xl drop-shadow-lg">{isAiSpeaking ? '🗣️' : '👤'}</span>
              
              {isAiSpeaking && (
                <div className="absolute -bottom-6 flex gap-1.5 items-end h-8">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-1.5 bg-indigo-400 rounded-full animate-bounce" style={{height: `${Math.random()*100}%`, animationDelay: `${i*0.1}s`}} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* User Inset */}
        <div className="absolute top-32 right-6 w-28 aspect-[3/4] rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl z-40 bg-black">
          <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover mirror grayscale-[10%]" />
        </div>
      </div>

      {/* Controls */}
      <div className="p-8 pb-12 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent relative z-50">
        <div className="max-w-xs mx-auto space-y-4">
          <button
            onClick={toggleRecording}
            disabled={isAiSpeaking || isProcessing}
            className={`w-full py-8 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-all btn-haptic border-b-8 ${
              isRecording 
                ? 'bg-red-500 text-white border-red-700 shadow-2xl shadow-red-600/30' 
                : isProcessing 
                ? 'bg-slate-800 text-slate-500 border-slate-900'
                : 'bg-white text-slate-950 border-slate-300 shadow-2xl'
            } ${isAiSpeaking ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
          >
            {isProcessing ? (
              <div className="w-6 h-6 border-4 border-slate-600 border-t-indigo-500 rounded-full animate-spin" />
            ) : isRecording ? (
              <>
                <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                {t.stopRecording}
              </>
            ) : (
              t.startRecording
            )}
          </button>
          <p className="text-center text-[9px] font-black text-slate-500 uppercase tracking-widest animate-pulse h-4">
            {isAiSpeaking ? (t.interviewerSpeaking || 'Interviewer speaking...') : isRecording ? (t.recordingAnswer || 'Recording your answer...') : !isProcessing ? (t.yourTurn || 'Your turn to speak') : ''}
          </p>
        </div>
      </div>

      {/* Processing Screen */}
      {isProcessing && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-500">
           <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-8 shadow-2xl shadow-indigo-500/20" />
           <h2 className="text-2xl font-black text-white tracking-tighter mb-4 uppercase">Analisando</h2>
           <p className="text-slate-400 text-sm max-w-[240px] font-medium leading-relaxed">
             {currentQuestionIndex === -1 ? `Identificando você...` : `Avaliando sua resposta técnica...`}
           </p>
        </div>
      )}
    </div>
  );
};

export default InterviewRoom;
