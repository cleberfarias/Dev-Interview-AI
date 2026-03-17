import React, { useMemo, useState } from 'react';
import { TEMPLATES_MOCK } from '../mockData';

const Templates: React.FC<{ onEdit?: (id:string)=>void }> = ({ onEdit }) => {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return TEMPLATES_MOCK;
    return TEMPLATES_MOCK.filter((t) => (t.name || '').toLowerCase().includes(q) || (t.stack || []).some((s: string) => s.toLowerCase().includes(q)));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-white font-bold">Templates de Entrevista</h2>
          <div className="text-sm text-slate-400">Gerencie seus modelos de entrevista técnica</div>
        </div>

        <div className="flex w-full sm:w-auto items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5"/></svg>
              </span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar templates..." className="w-full pl-10 bg-slate-900/20 px-3 py-2 rounded text-white placeholder:text-slate-400" />
            </div>
            <select className="bg-slate-900/20 px-3 py-2 rounded text-white text-sm">
              <option>Senioridade</option>
              <option>Junior</option>
              <option>Mid</option>
              <option>Senior</option>
            </select>
          </div>
          <button className="bg-cyan-400 text-slate-900 px-4 py-2 rounded font-bold">+ Novo Template</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedId((prev) => (prev === t.id ? null : t.id))}
            className={`group relative bg-slate-900/20 p-4 rounded min-h-[140px] flex flex-col justify-between transform transition-all duration-150 focus:outline-none ` +
              (selectedId === t.id
                ? 'ring-2 ring-cyan-400/30 border border-cyan-500/20 shadow-lg -translate-y-1'
                : 'border border-transparent hover:shadow-lg hover:-translate-y-1 hover:ring-2 hover:ring-cyan-400/30 hover:border-cyan-500/20')}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-white text-lg">{t.name}</div>
                <div className="text-xs text-slate-400 mt-1">{t.seniority}</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {t.stack.map((s: string) => (
                    <span key={s} className="text-xs text-slate-200 bg-slate-800/40 px-2 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${t.status === 'active' ? 'bg-emerald-700/20 text-emerald-300' : 'bg-slate-700/40 text-slate-300'}`}>{t.status === 'active' ? 'Ativo' : 'Arquivado'}</span>
              </div>
            </div>

            <div className="mt-3 text-slate-300 text-sm flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2v20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>{t.questions} perguntas</span>
                <span className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>{t.estimatedMinutes} min</span>
              </div>

              <div className={`flex items-center gap-3 ${selectedId === t.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}> 
                <button onClick={(e) => { e.stopPropagation(); onEdit && onEdit(t.id); }} className="text-xs text-slate-300 flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800/40">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 21v-3.75L14.06 6.19a2 2 0 012.82 0l0 0a2 2 0 010 2.83L5.83 21H3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Editar
                </button>
                <button onClick={(e) => e.stopPropagation()} className="text-xs text-slate-300 flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800/40">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 21H9a2 2 0 01-2-2V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Duplicar
                </button>
                <button onClick={(e) => e.stopPropagation()} className="text-xs text-slate-300 flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-800/40">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6h18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 6v12a2 2 0 002 2h4a2 2 0 002-2V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Arquivar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Templates;
