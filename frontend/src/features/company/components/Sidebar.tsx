import React from 'react';
import { User } from '../../../src/shared/types';

export const Sidebar: React.FC<{ user: User; onNavigate: (route:string, param?:string)=>void; onBack?: ()=>void }> = ({ user, onNavigate, onBack }) => {
  return (
    <aside className="w-72 bg-[#060717] border-r border-white/5 h-full p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-800 flex items-center justify-center text-white">{user.name?.charAt(0)}</div>
        <div>
          <div className="text-sm font-bold text-white">{user.name}</div>
          <div className="text-xs text-slate-400">{user.email}</div>
        </div>
      </div>

      <nav className="flex-1 mt-4">
        <ul className="space-y-1 text-slate-200 text-sm">
          <li className="p-2 rounded hover:bg-slate-800 cursor-pointer" onClick={() => onNavigate('dashboard')}>Dashboard</li>
          <li className="p-2 rounded hover:bg-slate-800 cursor-pointer" onClick={() => onNavigate('templates')}>Templates</li>
          <li className="p-2 rounded hover:bg-slate-800 cursor-pointer" onClick={() => onNavigate('invites')}>Convites</li>
          <li className="p-2 rounded hover:bg-slate-800 cursor-pointer" onClick={() => onNavigate('candidates')}>Candidatos</li>
          <li className="p-2 rounded hover:bg-slate-800 cursor-pointer" onClick={() => onNavigate('analytics')}>Analytics</li>
          <li className="p-2 rounded hover:bg-slate-800 cursor-pointer" onClick={() => onNavigate('users')}>Usuários</li>
          <li className="p-2 rounded hover:bg-slate-800 cursor-pointer" onClick={() => onNavigate('settings')}>Configurações</li>
        </ul>
      </nav>

      <div className="pt-4">
        <button className="w-full py-2 text-xs font-bold bg-slate-900/40 rounded" onClick={() => onBack && onBack()}>Voltar</button>
      </div>
    </aside>
  );
};

export default Sidebar;
