import React from 'react';

export const StatCard: React.FC<{ icon?: React.ReactNode; title: string; value: string | number; delta?: string; positive?: boolean }> = ({ icon, title, value, delta, positive }) => {
  return (
    <div className="rounded-xl p-4 bg-gradient-to-b from-slate-900/30 to-slate-900/20 border border-white/5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-indigo-300">{icon}</div>
          <div>
            <div className="text-xs text-slate-400 font-bold">{title}</div>
            <div className="text-lg font-extrabold text-white mt-1">{value}</div>
          </div>
        </div>
        {delta && (
          <div className={`text-sm font-bold ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>{delta}</div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
