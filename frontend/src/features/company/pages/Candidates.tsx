import React from 'react';
import { CANDIDATES_MOCK } from '../mockData';

const Candidates: React.FC<{ onView?: (id:string)=>void; onCompare?: ()=>void }> = ({ onView, onCompare }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold">Candidatos</h2>
        <div className="flex gap-2">
          <input placeholder="Buscar" className="bg-slate-900/20 px-3 py-2 rounded text-white" />
          <button onClick={onCompare} className="bg-indigo-600 px-3 py-2 rounded font-bold">Comparar</button>
        </div>
      </div>

      <div className="bg-slate-900/20 p-4 rounded">
        <table className="w-full text-sm text-white">
          <thead><tr className="text-slate-400 text-xs"><th className="p-2">Nome</th><th>Email</th><th>Template</th><th>Status</th><th>Score</th><th/></tr></thead>
          <tbody>
            {CANDIDATES_MOCK.map(c=> (
              <tr key={c.id} className="border-t border-white/5"><td className="p-2">{c.name}</td><td>{c.email}</td><td>{c.template}</td><td>{c.status}</td><td>{c.overall}</td><td><button onClick={()=> onView && onView(c.id)} className="px-2 py-1 rounded bg-slate-800/30">Ver</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Candidates;
