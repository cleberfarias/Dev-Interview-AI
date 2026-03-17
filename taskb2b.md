Plataforma B2B para empresas aplicarem entrevistas técnicas com IA

Sem ATS, sem vagas — foco total em avaliação de candidatos por score.

🧠 TASK — Fase 2 (B2B)
Dev Interview AI — Hiring Evaluation Platform
🎯 Objetivo

Permitir que empresas usem o Dev Interview AI para:

criar entrevistas técnicas padronizadas

convidar candidatos

coletar respostas via IA (vídeo + áudio)

gerar score automático

comparar candidatos

🧩 Visão do Produto

A empresa NÃO publica vagas.

Ela:

cria um modelo de entrevista

envia links para candidatos

recebe resultados estruturados

toma decisão baseada em score

🏗️ Parte 1 — Multi-tenant (Empresas)
Tarefa 1.1 — Criar Company
backend/app/schemas/company.py
backend/app/repositories/company_repository.py
backend/app/services/company_service.py
{
  "id": "company_id",
  "name": "Empresa X",
  "plan": "business",
  "createdAt": "timestamp"
}
Tarefa 1.2 — Usuários da empresa
{
  "userId": "uid",
  "companyId": "company_id",
  "role": "admin"
}
Roles
admin
recruiter
viewer
Tarefa 1.3 — Middleware de autorização
backend/app/middlewares/company_auth.py

Responsável por:

validar companyId

validar role

bloquear acesso cruzado

🧪 Parte 2 — Interview Templates
Objetivo

Permitir que a empresa configure o tipo de entrevista.

Tarefa 2.1 — Criar InterviewTemplate
backend/app/schemas/interview_template.py
{
  "id": "template_id",
  "companyId": "company_id",
  "name": "Frontend React Júnior",
  "seniority": "junior",
  "topics": ["React", "JS", "APIs"],
  "questionCount": 6,
  "timeLimit": 20
}
Tarefa 2.2 — CRUD Templates
POST /company/templates
GET /company/templates
PUT /company/templates/:id
DELETE /company/templates/:id
Tarefa 2.3 — Integração com IA

No início da entrevista:

{
  "templateId": "template_id"
}

O orchestrator deve usar:

topics

seniority

difficulty

para guiar perguntas da IA

📩 Parte 3 — Convites de candidatos
Objetivo

Permitir que a empresa envie entrevistas via link.

Tarefa 3.1 — Criar CandidateInvite
backend/app/schemas/candidate_invite.py
{
  "id": "invite_id",
  "companyId": "company_id",
  "templateId": "template_id",
  "candidateName": "João",
  "candidateEmail": "joao@email.com",
  "status": "sent",
  "token": "secure_link_token"
}
Tarefa 3.2 — Endpoints
POST /company/invites
GET /company/invites
Tarefa 3.3 — Link público
/interview/:token

Fluxo:

candidato entra sem login

sistema carrega template

inicia entrevista

🎤 Parte 4 — Entrevista (integração com sistema atual)
Objetivo

Reutilizar o que você já construiu.

Tarefa 4.1 — Associar entrevista ao invite
{
  "sessionId": "...",
  "inviteId": "...",
  "companyId": "...",
  "templateId": "..."
}
Tarefa 4.2 — Usar Audio Engine V3

Durante entrevista coletar:

{
  "speechMetrics": {},
  "communicationSignals": {},
  "behavioralSignals": {}
}
Tarefa 4.3 — Garantir modo correto
hiring_mode

Regras:

sem feedback em tempo real

coleta silenciosa

foco em avaliação

📊 Parte 5 — Resultado da entrevista
Objetivo

Gerar score completo para o RH.

Tarefa 5.1 — Criar CompanyInterviewResult
backend/app/schemas/company_interview_result.py
{
  "id": "result_id",
  "companyId": "...",
  "templateId": "...",
  "candidateName": "...",
  "technicalScore": 7.8,
  "communicationScore": 8.2,
  "behavioralScore": 7.1,
  "overallScore": 8.0,
  "recommendation": "Strong hire",
  "createdAt": "timestamp"
}
Tarefa 5.2 — Integrar com report_service

Arquivo:

backend/app/services/report_service.py

Combinar:

respostas do candidato

análise LLM

speech metrics

sinais comportamentais

Tarefa 5.3 — Persistência

Salvar em:

company_interview_results
📈 Parte 6 — Dashboard B2B
Inspirado no backoffice-web
Estrutura
frontend/src/features/company/
Tarefa 6.1 — Dashboard

Mostrar:

entrevistas enviadas

entrevistas concluídas

média de score

top candidatos

Tarefa 6.2 — Templates

Lista de entrevistas criadas

Tarefa 6.3 — Candidatos

Tabela:

nome

email

template

status

score técnico

score comunicação

recomendação

Tarefa 6.4 — Detalhe do candidato

Tela completa:

vídeo da entrevista

transcrição

respostas por pergunta

score detalhado

análise comportamental

🔐 Parte 7 — Permissões
Tarefa 7.1 — Guard de rota
admin → tudo
recruiter → leitura + ações
viewer → apenas leitura
Tarefa 7.2 — Separação por empresa

Nunca permitir:

❌ acesso a dados de outra empresa

⚙️ Parte 8 — Integração com IA
Tarefa 8.1 — Orchestrator
backend/app/services/interview_orchestrator.py

Adicionar contexto:

{
  "template": {},
  "speechMetrics": {},
  "behavioralSignals": {}
}
Tarefa 8.2 — Score final

Combinar:

técnico

comunicação

comportamento

📡 Parte 9 — Métricas
Criar:
company_metrics
{
  "companyId": "...",
  "totalInterviews": 120,
  "avgScore": 7.5,
  "completionRate": 0.82
}
🚫 Regras importantes
Regra 1

IA não toma decisão final.

Regra 2

Não mostrar diagnóstico psicológico.

Regra 3

Separar:

candidate_mode ≠ hiring_mode
🧱 Ordem de implementação
Fase 1 — Base

Company

Roles

Auth

Fase 2 — Templates

InterviewTemplate

CRUD

Fase 3 — Convites

CandidateInvite

Link público

Fase 4 — Resultado

Scorecard

Persistência

Fase 5 — Dashboard

UI empresa

lista candidatos

detalhes

✅ Critérios de aceite

O sistema deve permitir:

empresa criar entrevista

convidar candidato

candidato realizar entrevista

IA gerar score automático

empresa visualizar resultados

comparar candidatos

🚀 Resultado final

Após essa fase, seu produto vira:

👉 plataforma B2B de entrevistas técnicas com IA