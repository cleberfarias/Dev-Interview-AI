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
    <div className="fd-card-shell p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="fd-kicker text-[10px] text-fd-accent">Live Coach (Beta)</h3>
        <span className="fd-pill text-[8px]">
          Preview
        </span>
      </div>

      <p className="text-[10px] text-fd-text-secondary">
        Teste rapido da pipeline futura de suporte em tempo real durante entrevistas.
      </p>

      <button
        type="button"
        onClick={handleTest}
        disabled={loading}
        className="fd-btn-secondary w-full"
      >
        {loading ? 'Executando...' : 'Testar Pipeline'}
      </button>

      {message && (
        <div className="fd-status-success text-[10px] font-bold">
          {message}
        </div>
      )}

      {error && (
        <div className="fd-status-error text-[10px] font-bold">
          {error}
        </div>
      )}

      {result && (
        <div className="fd-list-item space-y-1 text-[10px] text-fd-text-secondary">
          <p>
            <span className="font-black text-fd-text-primary">Status:</span> {result.status}
          </p>
          <p>
            <span className="font-black text-fd-text-primary">Pergunta:</span> {result.detectedQuestion || 'N/A'}
          </p>
          <p>
            <span className="font-black text-fd-text-primary">Tipo:</span> {result.questionType || 'N/A'}
          </p>
          <p>
            <span className="font-black text-fd-text-primary">Audio recebido:</span> {result.audioReceived ? 'sim' : 'nao'}
          </p>
          <p>
            <span className="font-black text-fd-text-primary">Contexto usado:</span> {result.contextUsed ? 'sim' : 'nao'}
          </p>
          <p>
            <span className="font-black text-fd-text-primary">Sugestao:</span> {result.suggestion || 'N/A'}
          </p>
          <p>
            <span className="font-black text-fd-text-primary">Transcricao:</span> {result.transcriptionProvider || 'N/A'}
          </p>
          {result.transcriptionError && (
            <p>
              <span className="font-black text-fd-text-primary">Erro STT:</span> {result.transcriptionError}
            </p>
          )}
          {!!result.recommendedStructure?.length && (
            <p>
              <span className="font-black text-fd-text-primary">Estrutura:</span>{' '}
              {result.recommendedStructure.join(' | ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveCoachPreviewCard;
