import React from 'react';

const Settings: React.FC = () => {
  return (
    <div className="space-y-4">
      <h2 className="text-white font-bold">Configurações da empresa</h2>
      <div className="bg-slate-900/20 p-4 rounded grid grid-cols-2 gap-4">
        <div>
          <label className="text-slate-400 text-xs">Nome da empresa</label>
          <input className="w-full mt-1 p-2 rounded bg-transparent border border-white/5 text-white" />
        </div>
        <div>
          <label className="text-slate-400 text-xs">Idioma</label>
          <select className="w-full mt-1 p-2 rounded bg-transparent border border-white/5 text-white"><option>pt-BR</option><option>en</option></select>
        </div>
      </div>
    </div>
  );
};

export default Settings;
