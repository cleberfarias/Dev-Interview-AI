export const KPI_MOCK = {
  sent: 124,
  completed: 98,
  completionRate: 79,
  avgScore: 78.4,
};

export const TEMPLATES_MOCK = [
  { id: 't-1', name: 'React Senior Frontend', seniority: 'Senior', stack: ['React','TypeScript','Next.js'], topics: ['Frontend','UX'], questions: 8, estimatedMinutes: 45, status: 'active' },
  { id: 't-2', name: 'Node.js Backend Mid', seniority: 'Mid', stack: ['Node.js','Express','PostgreSQL'], topics: ['API','DB'], questions: 6, estimatedMinutes: 35, status: 'active' },
  { id: 't-3', name: 'Full Stack Junior', seniority: 'Junior', stack: ['React','Node.js','MongoDB'], topics: ['Fullstack'], questions: 5, estimatedMinutes: 30, status: 'active' },
  { id: 't-4', name: 'Python Data Engineer', seniority: 'Senior', stack: ['Python','SQL','Spark','Airflow'], topics: ['Data'], questions: 7, estimatedMinutes: 40, status: 'active' },
  { id: 't-5', name: 'DevOps Lead', seniority: 'Lead', stack: ['AWS','Terraform','Docker','K8s'], topics: ['Infra'], questions: 8, estimatedMinutes: 50, status: 'active' },
  { id: 't-6', name: 'Mobile React Native', seniority: 'Mid', stack: ['React Native','TypeScript','Expo'], topics: ['Mobile'], questions: 6, estimatedMinutes: 35, status: 'archived' },
];

export const CANDIDATES_MOCK = [
  { id: 'c-1', name: 'Ana Silva', email: 'ana@ex.com', template: 'Frontend JS Mid', status: 'completed', techScore: 82, commScore: 75, overall: 79, recommendation: 'Hire' },
  { id: 'c-2', name: 'Bruno Costa', email: 'bruno@ex.com', template: 'Backend Node Senior', status: 'started', techScore: 70, commScore: 68, overall: 69, recommendation: 'Maybe' },
];

export const INVITES_MOCK = [
  { id: 'i-1', name: 'Ana Silva', email: 'ana@ex.com', template: 'Frontend JS Mid', status: 'concluded', sentAt: '2026-03-10' },
  { id: 'i-2', name: 'Bruno Costa', email: 'bruno@ex.com', template: 'Backend Node Senior', status: 'started', sentAt: '2026-03-12' },
];

export const TIMESERIES_MOCK = [
  { month: 'Oct', interviews: 6, interviews2: 4 },
  { month: 'Nov', interviews: 12, interviews2: 8 },
  { month: 'Dec', interviews: 10, interviews2: 6 },
  { month: 'Jan', interviews: 14, interviews2: 9 },
  { month: 'Feb', interviews: 18, interviews2: 12 },
  { month: 'Mar', interviews: 22, interviews2: 16 },
];

export const SCORE_DISTRIBUTION = [
  { range: '0-20', value: 1 },
  { range: '21-40', value: 2 },
  { range: '41-60', value: 4 },
  { range: '61-80', value: 8 },
  { range: '81-100', value: 6 },
];
