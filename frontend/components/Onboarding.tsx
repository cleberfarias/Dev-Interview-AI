
import React, { useState } from 'react';
import { InterviewConfig, LanguageCode, Track, Seniority, InterviewStyle, PlanType } from '../types';
import { I18N, TRACKS, SENIORITIES, STACKS, STYLES, clampDuration, INTERVIEW_LIMITS } from '../constants';

interface Props {
  onComplete: (config: InterviewConfig) => void;
  initialConfig: InterviewConfig;
}

const Onboarding: React.FC<Props> = ({ onComplete, initialConfig }) => {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<InterviewConfig>(initialConfig);
  const [isKeySelecting, setIsKeySelecting] = useState(false);
  const t = I18N[config.uiLanguage];

  const totalSteps = 5;

  const toggleStack = (stack: string) => {
    setConfig(prev => ({
      ...prev,
      stacks: prev.stacks.includes(stack) 
        ? prev.stacks.filter(s => s !== stack)
        : [...prev.stacks, stack]
    }));
  };

  const applyPlan = (plan: PlanType) => {
    const targetDuration = plan === 'pro' ? INTERVIEW_LIMITS.pro : INTERVIEW_LIMITS.free;
    setConfig(prev => ({
      ...prev,
      plan,
      duration: clampDuration(targetDuration, plan),
    }));
  };

  const handleProSelection = async () => {
    setIsKeySelecting(true);
    try {
      // @ts-ignore
      if (window.aistudio) {
        await window.aistudio.openSelectKey();
        applyPlan('pro');
      }
    } catch (e) {
      console.error("Key selection failed", e);
    } finally {
      setIsKeySelecting(false);
    }
  };

  const nextStep = () => setStep(s => Math.min(s + 1, totalSteps));
  const prevStep = () => setStep(s => Math.max(s - 1, 0));

  const languages: {code: LanguageCode, label: string, flag: string}[] = [
    { code: 'pt-BR', label: 'Português', flag: '🇧🇷' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
  ];

  return (
    <div className="flex flex-col h-full space-y-8 animate-in fade-in duration-500 pb-safe">
      {/* Progress Header */}
      <div className="flex items-center gap-4 px-2">
        <div className="flex gap-1.5 flex-1">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div 
              key={i} 
              className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= i ? 'bg-indigo-500' : 'bg-slate-800'}`} 
            />
          ))}
        </div>
        <span className="text-[10px] font-black text-slate-500 tabular-nums">{step + 1}/6</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {step === 0 && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
            <header>
              <h2 className="text-3xl font-black text-white tracking-tighter">Idiomas</h2>
              <p className="text-slate-400 text-sm mt-1">Configure como deseja interagir.</p>
            </header>
            
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">{t.uiLang}</label>
                <div className="grid grid-cols-1 gap-2">
                  {languages.map(lang => (
                    <button 
                      key={lang.code}
                      onClick={() => setConfig({...config, uiLanguage: lang.code})}
                      className={`p-5 rounded-2xl flex items-center justify-between border transition-all btn-haptic ${config.uiLanguage === lang.code ? 'bg-indigo-600 border-indigo-400 text-white shadow-xl shadow-indigo-600/20' : 'bg-slate-900 border-white/5 text-slate-400'}`}
                    >
                      <span className="font-bold text-sm">{lang.label}</span>
                      <span className="text-xl">{lang.flag}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">{t.intLang}</label>
                <div className="flex gap-2">
                  {languages.map(lang => (
                    <button 
                      key={lang.code}
                      onClick={() => setConfig({...config, interviewLanguage: lang.code})}
                      className={`flex-1 py-4 rounded-xl text-[10px] font-black border transition-all btn-haptic ${config.interviewLanguage === lang.code ? 'bg-white text-slate-950' : 'bg-slate-900 border-white/5 text-slate-500'}`}
                    >
                      {lang.code.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
            <header>
              <h2 className="text-3xl font-black text-white tracking-tighter">Planos</h2>
              <p className="text-slate-400 text-sm mt-1">O plano Elite desbloqueia IA em tempo real.</p>
            </header>
            
            <div className="space-y-4">
              <button 
                onClick={() => applyPlan('free')}
                className={`w-full p-6 rounded-[2rem] border-2 transition-all text-left flex justify-between items-center btn-haptic ${config.plan === 'free' ? 'bg-slate-900 border-indigo-500 shadow-xl' : 'bg-slate-950 border-white/5'}`}
              >
                <div>
                  <h4 className="font-black text-white text-sm uppercase">Standard</h4>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Gratuito • IA por turnos</p>
                </div>
                {config.plan === 'free' && <span className="text-indigo-500 text-xl">●</span>}
              </button>

              <button 
                onClick={handleProSelection}
                disabled={isKeySelecting}
                className={`w-full p-6 rounded-[2rem] border-2 transition-all text-left flex justify-between items-center relative overflow-hidden btn-haptic ${config.plan === 'pro' ? 'bg-indigo-900/20 border-indigo-500 shadow-xl shadow-indigo-500/10' : 'bg-slate-950 border-white/5'}`}
              >
                <div className="relative z-10">
                  <h4 className="font-black text-white text-sm uppercase flex items-center gap-2">
                    Elite Pro <span className="bg-amber-500 text-slate-950 text-[8px] px-2 py-0.5 rounded-full">LIVE</span>
                  </h4>
                  <p className="text-[10px] text-indigo-300/60 font-bold uppercase mt-1">Conversa Fluida • Visão de Câmera</p>
                </div>
                {isKeySelecting ? <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full" /> : (config.plan === 'pro' && <span className="text-indigo-500 text-xl">●</span>)}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
            <header>
              <h2 className="text-3xl font-black text-white tracking-tighter">Carreira</h2>
              <p className="text-slate-400 text-sm mt-1">Defina seu objetivo profissional.</p>
            </header>

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">{t.seniority}</label>
                <div className="grid grid-cols-2 gap-2">
                  {SENIORITIES.map(level => (
                    <button 
                      key={level}
                      onClick={() => setConfig({...config, seniority: level as Seniority})}
                      className={`py-4 rounded-2xl text-[10px] font-black border transition-all btn-haptic ${config.seniority === level ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900 border-white/5 text-slate-500'}`}
                    >
                      {level.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">{t.track}</label>
                <div className="grid grid-cols-2 gap-2">
                  {TRACKS.map(tr => (
                    <button 
                      key={tr}
                      onClick={() => setConfig({...config, track: tr as Track})}
                      className={`py-4 rounded-2xl text-[10px] font-black border transition-all btn-haptic ${config.track === tr ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-900 border-white/5 text-slate-500'}`}
                    >
                      {tr.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
            <header>
              <h2 className="text-3xl font-black text-white tracking-tighter">Stack Tech</h2>
              <p className="text-slate-400 text-sm mt-1">Selecione suas tecnologias principais.</p>
            </header>

            <div className="flex flex-wrap gap-2">
              {STACKS.map(stack => {
                const isSelected = config.stacks.includes(stack);
                return (
                  <button
                    key={stack}
                    onClick={() => toggleStack(stack)}
                    className={`px-5 py-3 rounded-2xl text-[10px] font-black border transition-all btn-haptic ${isSelected ? 'bg-white border-white text-slate-950 shadow-xl' : 'bg-slate-900 border-white/5 text-slate-400'}`}
                  >
                    {stack}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
            <header>
              <h2 className="text-3xl font-black text-white tracking-tighter">Personalidade</h2>
              <p className="text-slate-400 text-sm mt-1">Como deve ser o seu entrevistador?</p>
            </header>

            <div className="grid grid-cols-3 gap-2">
              {STYLES.map(s => (
                <button
                  key={s}
                  onClick={() => setConfig({...config, style: s as any})}
                  className={`py-6 rounded-3xl text-[10px] font-black border transition-all flex flex-col items-center gap-3 btn-haptic ${config.style === s ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-900 border-white/5 text-slate-500'}`}
                >
                  <span className="text-2xl">{s === 'friendly' ? '😊' : s === 'neutral' ? '😐' : '🧐'}</span>
                  <span className="capitalize">{s}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-300">
            <header className="flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-3xl font-black text-white tracking-tighter">{t.jd}</h2>
                <p className="text-slate-400 text-sm mt-1">Personalize as perguntas com base na vaga.</p>
              </div>
              <button 
                onClick={() => onComplete(config)}
                className="text-[10px] font-black text-indigo-400 uppercase tracking-widest py-2 px-4 bg-indigo-500/10 rounded-full"
              >
                Pular Etapa
              </button>
            </header>
            <textarea
              value={config.jobDescription}
              onChange={(e) => setConfig({...config, jobDescription: e.target.value})}
              placeholder={t.jdPlaceholder}
              className="w-full bg-slate-900 border border-white/5 rounded-[2rem] px-6 py-6 text-xs font-medium focus:ring-2 focus:ring-indigo-600 outline-none min-h-[220px] text-slate-200 shadow-inner"
            />
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent z-[60]">
        <div className="max-w-md mx-auto flex gap-3">
          {step > 0 && (
            <button
              onClick={prevStep}
              className="px-8 py-6 rounded-[2rem] bg-slate-900 text-slate-300 font-black text-sm border border-white/5 btn-haptic flex items-center justify-center"
            >
              ←
            </button>
          )}
          <button
            onClick={step === totalSteps ? () => onComplete(config) : nextStep}
            className="flex-1 py-6 bg-white rounded-[2rem] text-slate-950 font-black text-sm uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all flex items-center justify-center border-b-4 border-slate-300"
          >
            {step === totalSteps ? t.start : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
