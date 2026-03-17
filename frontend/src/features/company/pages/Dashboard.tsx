import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import StatCard from '../components/StatCard';
import { KPI_MOCK, CANDIDATES_MOCK, TEMPLATES_MOCK, TIMESERIES_MOCK, SCORE_DISTRIBUTION } from '../mockData';

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    completed: 'bg-emerald-500/20 text-emerald-300',
    concluded: 'bg-emerald-500/20 text-emerald-300',
    started: 'bg-amber-500/20 text-amber-300',
    expired: 'bg-rose-500/20 text-rose-300',
  };
  const cls = map[status] || 'bg-slate-800/40 text-slate-200';
  return <span className={`px-2 py-1 rounded-full text-xs font-bold ${cls}`}>{status}</span>;
};

const Dashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Entrevistas Enviadas" value={KPI_MOCK.sent} delta="+12%" positive />
        <StatCard title="Concluídas" value={KPI_MOCK.completed} delta="+8%" positive />
        <StatCard title="Taxa de Conclusão" value={`${KPI_MOCK.completionRate}%`} delta="+3%" positive />
        <StatCard title="Score Médio" value={`${Math.round(KPI_MOCK.avgScore)}/100`} delta="-2%" positive={false} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/20 p-4 rounded">
          <h3 className="text-white font-bold mb-3">Entrevistas por Período</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={TIMESERIES_MOCK} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.6)' }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.6)' }} />
                <Tooltip wrapperStyle={{ background: '#0b1220', borderRadius: 8, color: '#fff' }} />
                <Line type="monotone" dataKey="interviews" stroke="#06b6d4" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="interviews2" stroke="#7c3aed" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900/20 p-4 rounded">
          <h3 className="text-white font-bold mb-3">Distribuição de Scores</h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SCORE_DISTRIBUTION} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="range" tick={{ fill: 'rgba(255,255,255,0.6)' }} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.6)' }} />
                <Tooltip wrapperStyle={{ background: '#0b1220', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="value" fill="#06b6d4" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900/20 p-4 rounded">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold mb-3">Candidatos Recentes</h3>
            <a className="text-xs text-emerald-400 font-bold">Ver todos</a>
          </div>
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-slate-400 text-xs"><th className="p-2 text-left">Nome</th><th>Template</th><th>Status</th><th className="text-right">Score</th></tr>
            </thead>
            <tbody>
              {CANDIDATES_MOCK.map(c => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="p-3 text-white font-semibold">{c.name}</td>
                  <td className="text-slate-300">{c.template}</td>
                  <td><StatusPill status={c.status} /></td>
                  <td className="text-right"><span className="bg-slate-800/40 px-3 py-1 rounded-full text-white font-bold">{c.overall}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-900/20 p-4 rounded">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold mb-3">Templates Mais Usados</h3>
            <a className="text-xs text-emerald-400 font-bold">Ver todos</a>
          </div>
          <ul className="space-y-3">
            {TEMPLATES_MOCK.map((t) => (
              <li key={t.id} className="p-3 bg-slate-800/20 rounded flex justify-between items-start">
                <div>
                  <div className="font-bold text-white">{t.name}</div>
                  <div className="text-xs text-slate-400">{t.seniority} • {t.stack.join(', ')} • {t.questions} perguntas</div>
                </div>
                <div className="text-xs text-slate-300">34 usos</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
