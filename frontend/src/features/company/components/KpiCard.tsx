import React from 'react';

export const KpiCard: React.FC<{ title: string; value: string | number; delta?: string }> = ({ title, value, delta }) => {
  return (
    <div className="bg-gradient-to-b from-slate-900/40 to-slate-900/20 border border-white/5 rounded-lg p-4">
      <div className="text-xs text-slate-400 font-bold">{title}</div>
      <div className="mt-2 text-2xl font-extrabold text-white">{value}</div>
      {delta && <div className="text-xs text-slate-400 mt-1">{delta}</div>}
    </div>
  );
};

export default KpiCard;
