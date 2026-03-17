import React, { useEffect, useState } from 'react';
import { User } from '../../shared/types';
import { BackendApi } from '../../shared/services/backendApi';
import { Sidebar } from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Templates from './pages/Templates';
import Invites from './pages/Invites';
import Candidates from './pages/Candidates';
import Analytics from './pages/Analytics';
import Users from './pages/Users';
import Settings from './pages/Settings';
import CandidateDetail from './pages/CandidateDetail';
import TemplateEditor from './pages/TemplateEditor';
import Compare from './pages/Compare';
import PublicInvite from './pages/PublicInvite';

export type CompanyRoute =
  | 'dashboard'
  | 'templates'
  | 'template.edit'
  | 'invites'
  | 'candidates'
  | 'candidate.view'
  | 'compare'
  | 'analytics'
  | 'users'
  | 'settings'
  | 'public.invite';

export const CompanyApp: React.FC<{ user: User; onBack?: () => void }> = ({ user, onBack }) => {
  const [route, setRoute] = useState<CompanyRoute>('dashboard');
  const [routeParam, setRouteParam] = useState<string | undefined>(undefined);
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const go = (r: CompanyRoute, param?: string) => {
    setRouteParam(param);
    setRoute(r);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await BackendApi.listMyCompanies();
        if (!mounted) return;
        const items = (res?.items || []).map((it: any) => ({ company: it.company, membership: it.membership }));
        setCompanies(items);
        if (items.length > 0) setSelectedCompanyId(items[0].company.id);
      } catch (err) {
        console.warn('Failed to load companies', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="h-full flex">
      <Sidebar onNavigate={go} onBack={onBack} user={user} />
      <div className="flex-1 p-6 overflow-y-auto h-full">
        {selectedCompanyId && <div className="mb-4 text-slate-300">Empresa: <span className="font-bold text-white">{companies.find(c=>c.company.id===selectedCompanyId)?.company.name}</span></div>}
        {route === 'dashboard' && <Dashboard />}
        {route === 'templates' && <Templates onEdit={(id) => go('template.edit', id)} />}
        {route === 'template.edit' && <TemplateEditor id={routeParam} onClose={() => go('templates')} />}
        {route === 'invites' && <Invites />}
        {route === 'candidates' && <Candidates onView={(id) => go('candidate.view', id)} onCompare={() => go('compare')} />}
        {route === 'candidate.view' && <CandidateDetail id={routeParam} />}
        {route === 'compare' && <Compare />}
        {route === 'analytics' && <Analytics />}
        {route === 'users' && <Users />}
        {route === 'settings' && <Settings />}
        {route === 'public.invite' && <PublicInvite token={routeParam} />}
      </div>
    </div>
  );
};

export default CompanyApp;
