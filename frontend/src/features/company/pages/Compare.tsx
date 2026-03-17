import React from 'react';
import { CANDIDATES_MOCK } from '../mockData';

const Compare: React.FC = () => {
  const left = CANDIDATES_MOCK[0];
  const right = CANDIDATES_MOCK[1];
  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold">Comparar Candidatos</h2>
      <div className="grid grid-cols-2 gap-4">
        {[left,right].map(c=> (
          <div key={c.id} className="bg-slate-900/20 p-4 rounded">
            <div className="font-bold text-white">{c.name}</div>
            <div className="text-slate-300">Overall: {c.overall}</div>
            <div className="text-slate-300">Tech: {c.techScore} • Comm: {c.commScore}</div>
            <div className="mt-2 text-xs text-slate-400">{c.recommendation}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Compare;
