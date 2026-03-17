import React from 'react';
import { CANDIDATES_MOCK } from '../mockData';

const CandidateDetail: React.FC<{ id?: string | undefined }> = ({ id }) => {
  const data = CANDIDATES_MOCK.find(c=> c.id === id) || CANDIDATES_MOCK[0];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold">{data.name}</h2>
          <div className="text-sm text-slate-400">{data.email} • {data.template}</div>
        </div>
        <div className="flex gap-2">
          <div className="p-3 bg-slate-900/30 rounded text-center">
            <div className="text-xs text-slate-400">Technical</div>
            <div className="text-xl font-bold text-white">{data.techScore}</div>
          </div>
          <div className="p-3 bg-slate-900/30 rounded text-center">
            <div className="text-xs text-slate-400">Communication</div>
            <div className="text-xl font-bold text-white">{data.commScore}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900/20 p-4 rounded"> 
          <h4 className="text-white font-bold">Resumo IA</h4>
          <p className="text-slate-300 mt-2">Resumo gerado por IA descrevendo pontos fortes e fraquezas.</p>
        </div>
        <div className="bg-slate-900/20 p-4 rounded col-span-2">
          <h4 className="text-white font-bold">Transcrição</h4>
          <div className="mt-2 text-slate-300">(Transcrição fictícia) O candidato respondeu sobre arquitetura de sistemas...</div>
        </div>
      </div>
    </div>
  );
};

export default CandidateDetail;
