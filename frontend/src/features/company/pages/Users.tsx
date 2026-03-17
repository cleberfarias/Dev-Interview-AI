import React from 'react';

const Users: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold">Usuários da empresa</h2>
        <button className="bg-indigo-600 px-3 py-2 rounded font-bold">Convidar usuário</button>
      </div>

      <div className="bg-slate-900/20 p-4 rounded">
        <table className="w-full text-sm text-white">
          <thead><tr className="text-slate-400 text-xs"><th className="p-2">Nome</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>
            <tr className="border-t border-white/5"><td className="p-2">Cleber Delgado</td><td>cleber@ex.com</td><td>admin</td><td>active</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Users;
