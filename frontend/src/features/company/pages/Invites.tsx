import React from 'react';
import { INVITES_MOCK, TEMPLATES_MOCK } from '../mockData';

const Invites: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold">Convites</h2>
        <div className="flex gap-2">
          <select className="bg-slate-900/20 px-3 py-2 rounded text-white">
            {TEMPLATES_MOCK.map(t=> <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="bg-indigo-600 px-3 py-2 rounded font-bold">Enviar</button>
        </div>
      </div>

      <div className="bg-slate-900/20 p-4 rounded">
        <h3 className="text-white font-bold mb-3">Convites recentes</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs"><th className="p-2">Nome</th><th>Email</th><th>Template</th><th>Status</th><th>Enviado</th><th/></tr>
          </thead>
          <tbody>
            {INVITES_MOCK.map(i=> (
              <tr key={i.id} className="border-t border-white/5 text-white"><td className="p-2">{i.name}</td><td>{i.email}</td><td>{i.template}</td><td>{i.status}</td><td>{i.sentAt}</td><td><button className="text-xs px-2 py-1 bg-slate-800/30 rounded">Copiar link</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Invites;
