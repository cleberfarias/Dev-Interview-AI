import React, { useState } from 'react';
import { BackendApi } from '../../../shared/services/backendApi';
import type { LiveCoachProcessResponse } from '../../../shared/types';

const SAMPLE_AUDIO_BASE64 = 'ZHVtbXktYXVkaW8=';

const LiveCoachPreviewCard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveCoachProcessResponse | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const payload = await BackendApi.liveCoachProcess({
        audioBase64: SAMPLE_AUDIO_BASE64,
        context: {
          source: 'profile-beta',
          questionText: 'Como voce escalaria uma API para picos de trafego?',
          candidateProfile: {
            targetRole: 'Backend Engineer',
            primarySkills: ['python', 'fastapi', 'redis'],
            weakSkills: ['kubernetes'],
          },
        },
      });
      setResult(payload);
      setMessage('Pipeline live coach executado com sucesso.');
    } catch (e: any) {
      setError(e?.message || 'Falha ao testar live coach.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="native-glass rounded-3xl border border-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Live Coach (Beta)</h3>
        <span className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-indigo-200">
          Preview
        </span>
      </div>

      <p className="text-[10px] text-slate-400">
        Teste rapido da pipeline futura de suporte em tempo real durante entrevistas.
      </p>

      <button
        type="button"
        onClick={handleTest}
        disabled={loading}
        className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white disabled:opacity-50"
      >
        {loading ? 'Executando...' : 'Testar Pipeline'}
      </button>

      {message && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold text-emerald-200">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[10px] font-bold text-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-3 py-3 space-y-1 text-[10px] text-slate-300">
          <p>
            <span className="font-black text-slate-200">Status:</span> {result.status}
          </p>
          <p>
            <span className="font-black text-slate-200">Pergunta:</span> {result.detectedQuestion || 'N/A'}
          </p>
          <p>
            <span className="font-black text-slate-200">Tipo:</span> {result.questionType || 'N/A'}
          </p>
          <p>
            <span className="font-black text-slate-200">Audio recebido:</span> {result.audioReceived ? 'sim' : 'nao'}
          </p>
          <p>
            <span className="font-black text-slate-200">Contexto usado:</span> {result.contextUsed ? 'sim' : 'nao'}
          </p>
          <p>
            <span className="font-black text-slate-200">Sugestao:</span> {result.suggestion || 'N/A'}
          </p>
          <p>
            <span className="font-black text-slate-200">Transcricao:</span> {result.transcriptionProvider || 'N/A'}
          </p>
          {result.transcriptionError && (
            <p>
              <span className="font-black text-slate-200">Erro STT:</span> {result.transcriptionError}
            </p>
          )}
          {!!result.recommendedStructure?.length && (
            <p>
              <span className="font-black text-slate-200">Estrutura:</span>{' '}
              {result.recommendedStructure.join(' | ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveCoachPreviewCard;
