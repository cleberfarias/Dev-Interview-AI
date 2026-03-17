import React from 'react';

const TemplateEditor: React.FC<{ id?: string | undefined; onClose?: ()=>void }> = ({ id, onClose }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold">{id ? 'Editar Template' : 'Criar Template'}</h2>
        <div>
          <button onClick={onClose} className="px-3 py-2 rounded bg-slate-800/40">Fechar</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/20 p-4 rounded">
          <label className="text-xs text-slate-400">Nome</label>
          <input className="w-full mt-1 p-2 rounded bg-transparent border border-white/5 text-white" />

          <label className="text-xs text-slate-400 mt-3">Senioridade</label>
          <select className="w-full mt-1 p-2 rounded bg-transparent border border-white/5 text-white">
            <option>junior</option>
            <option>mid</option>
            <option>senior</option>
          </select>

          <label className="text-xs text-slate-400 mt-3">Staks</label>
          <input className="w-full mt-1 p-2 rounded bg-transparent border border-white/5 text-white" placeholder="React, TypeScript" />
        </div>

        <div className="bg-slate-900/20 p-4 rounded">
          <h3 className="text-white font-bold">Pré-visualização</h3>
          <div className="mt-3 text-slate-300">Este é um preview lateral do template.</div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;
