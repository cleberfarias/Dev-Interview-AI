Objetivo

Deixar o backend com estas regras:

uma rota oficial para entrevista

um dono oficial da orquestração

uma camada oficial para créditos/limites

live coach separado do fluxo normal

agents sem lógica de persistência

routes sem lógica de negócio

1. API — o que manter, fundir ou restringir
routes_orchestrator.py

Manter e promover como fluxo principal da entrevista.

Papel ideal

iniciar entrevista multiagente

processar turnos

finalizar entrevista

Ação

tornar essa a rota principal da jornada de entrevista

documentar no README interno que esse é o caminho oficial

toda entrevista nova deve passar por aqui

Critério de aceite

iniciar/avançar/finalizar entrevista funciona só via orchestrator

outras rotas não competem com esse papel

routes_interview.py

Reduzir ou transformar em compatibilidade.

Problema

Pode competir com routes_orchestrator.py se ambos fizerem a mesma coisa.

Ação

Escolha uma destas:

opção recomendada: manter apenas endpoints legados ou utilitários

ou redirecionar internamente para interview_orchestrator.py

Critério de aceite

não existe mais dúvida sobre qual rota “manda” na entrevista

routes_sessions.py

Manter, mas limitar ao ciclo de vida da sessão.

Papel ideal

criar/consultar sessão

buscar histórico

buscar trace

persistir metadados da sessão

Não deve fazer

gerar próxima pergunta

avaliar resposta

decidir fluxo da entrevista

Critério de aceite

sessions lida com sessão, não com inteligência da entrevista

routes_ai.py

Restringir para utilidades de IA e debug interno.

Problema

Se ela fizer geração de pergunta, avaliação e relatório, entra em conflito com orchestrator e interview.

Ação

Deixar aqui apenas coisas como:

teste isolado de prompt

utilitários internos

endpoints experimentais

fallback técnico

Critério de aceite

rota /ai/* não é usada como fluxo oficial da entrevista

routes_live_coach.py

Manter como subsistema separado.

Papel ideal

baixa latência

websocket/http para live coach

processamento de trechos em tempo real

Não deve fazer

assumir papel de entrevista completa

substituir orquestrador da entrevista simulada

Critério de aceite

live coach é produto irmão da entrevista, não concorrente dela

routes_credits.py

Manter, mas sem lógica duplicada.

Papel ideal

consulta de saldo

histórico de consumo

talvez administração

Não deve fazer

decidir custo de features diretamente na rota

Critério de aceite

rota consulta/expõe; service decide política

routes_profile.py, routes_resume.py, routes_jobs.py, routes_reports.py

Manter.

Essas parecem bem separadas por domínio e ajudam a reduzir acoplamento.

2. Services — onde está o maior risco de duplicidade
interview_orchestrator.py

Manter como dono oficial do fluxo multiagente.

Deve fazer

carregar contexto do candidato

chamar agents

coordenar turnos

decidir próxima etapa

finalizar relatório/plano

Não deve fazer

acesso HTTP

persistência bruta

regras espalhadas de créditos

Critério de aceite

qualquer entrevista oficial passa por esse arquivo

orchestrator_service.py

Revisar para fundir ou remover.

Problema

O nome sugere sobreposição com interview_orchestrator.py.

Ação

Abra os dois e responda:

ambos iniciam entrevista?

ambos avançam turnos?

ambos montam contexto de agentes?

Se sim:

fundir em um arquivo só

preferencialmente manter interview_orchestrator.py

Critério de aceite

existe apenas um coordenador principal da entrevista

interview_service.py

Simplificar.

Papel ideal

servir como fachada do fluxo tradicional

ou compatibilidade entre rotas antigas e o orquestrador

Não deve fazer

competir com o orquestrador

decidir lógica paralela de próxima pergunta/avaliação

Ação

Se hoje ele já faz muito do que o orquestrador faz:

mover regras para interview_orchestrator.py

deixar interview_service.py fino

Critério de aceite

interview_service.py não duplica coordenação

interview_core.py

Manter como núcleo puro.

Deve conter

funções puras

score consolidado

progressão de dificuldade

utilitários de composição de contexto

normalização de estruturas

Não deve conter

acesso a repositório

consumo de crédito

chamada de rota

websocket

Critério de aceite

pode ser testado isoladamente sem banco nem FastAPI

session_service.py

Manter como dono do estado da sessão.

Deve fazer

criar sessão

carregar sessão

atualizar estado

encerrar sessão

Não deve fazer

decidir perguntas

chamar agents diretamente, exceto via orquestrador

Critério de aceite

estado da sessão fica centralizado aqui

credits_service.py

Manter, mas transformar em policy central.

Melhor nome possível

usage_policy_service.py
ou

billing_policy_service.py

Deve fazer

validar se usuário pode usar feature

calcular consumo

debitar créditos

aplicar limite por plano

Não deve fazer

ficar duplicado dentro de outros services

Critério de aceite

nenhuma outra camada “inventa” cobrança localmente

live_coach_service.py

Manter como subsistema independente.

Deve fazer

receber chunks/turnos em tempo real

processar baixa latência

chamar STT/LLM/TTS se necessário

devolver dica rápida

Não deve fazer

assumir o mesmo pipeline da entrevista simulada completa

Critério de aceite

live coach tem ciclo próprio

evaluation_service.py, report_service.py, planning_service.py

Manter, com fronteiras claras.

evaluation_service.py

avaliação por resposta

report_service.py

consolidação final

planning_service.py

plano de entrevista ou plano de estudo, mas precisa deixar isso claro

Ação

Se planning_service.py estiver servindo para duas coisas muito diferentes, separe:

interview_planning_service.py

study_plan_service.py

Critério de aceite

cada service tem um único motivo para mudar

3. Agents — o que eles podem e não podem fazer

A pasta agents está ótima conceitualmente e é um diferencial do produto.

Todos os agents

Manter.

Regra obrigatória

Agents:

recebem contexto

chamam o router/modelo

validam saída

devolvem JSON estruturado

Agents não devem:

salvar no banco

debitar crédito

decidir rota HTTP

mexer em websocket

conhecer detalhes de Firestore

Checklist

candidate_agent.py → só perfil/contexto

job_agent.py → só vaga

match_agent.py → só comparação

interviewer_agent.py → só próxima pergunta

evaluator_agent.py → só avaliação

coach_agent.py → só melhoria/coaching

report_agent.py → só relatório

study_plan_agent.py → só trilha de estudo

Critério de aceite

se um agent persistir dado, está errado

se um agent consumir crédito, está errado

4. Repositories — manter e reforçar fronteira

A pasta repositories está bem desenhada.

Manter todos

user_repository.py

session_repository.py

candidate_profile_repository.py

resume_analysis_repository.py

job_analysis_repository.py

report_repository.py

Regra

Repositories:

leem

escrevem

atualizam

listam

Repositories não:

chamam agent

aplicam regra de negócio

calculam score

escolhem modelo

Critério de aceite

todo acesso ao Firestore passa por repository

services não montam persistência “na mão” em vários lugares

5. Estrutura-alvo recomendada
API
api/
  routes_auth.py
  routes_profile.py
  routes_resume.py
  routes_jobs.py
  routes_reports.py
  routes_sessions.py
  routes_orchestrator.py
  routes_live_coach.py
  routes_credits.py
Services
services/
  interview_core.py
  interview_orchestrator.py
  session_service.py
  evaluation_service.py
  report_service.py
  study_plan_service.py
  live_coach_service.py
  candidate_profile_service.py
  resume_service.py
  jobs_service.py
  usage_policy_service.py
Agents
agents/
  candidate_agent.py
  job_agent.py
  match_agent.py
  interviewer_agent.py
  evaluator_agent.py
  coach_agent.py
  report_agent.py
  study_plan_agent.py
Repositories
repositories/
  user_repository.py
  session_repository.py
  candidate_profile_repository.py
  resume_analysis_repository.py
  job_analysis_repository.py
  report_repository.py
6. Ordem prática de correção
Fase 1 — tirar ambiguidade

escolher routes_orchestrator.py como rota oficial da entrevista

reduzir routes_interview.py para compatibilidade

restringir routes_ai.py a utilidades

Fase 2 — consolidar services

comparar interview_orchestrator.py e orchestrator_service.py

fundir os dois se houver duplicidade

simplificar interview_service.py

manter interview_core.py só com lógica pura

Fase 3 — centralizar política

transformar credits_service.py em política única de uso

remover checagens duplicadas de limite em outros services

Fase 4 — isolar live coach

revisar live_coach_service.py e routes_live_coach.py

garantir que não disputem papel com entrevista simulada

Fase 5 — blindar contracts

revisar todos os agents para garantir que não persistem nada

revisar todos os repositories para garantir que não têm regra de negócio

7. Critérios finais de sucesso

Você corrigiu o risco quando conseguir responder assim:

Qual rota oficial inicia entrevista?

routes_orchestrator.py

Quem coordena os agents?

interview_orchestrator.py

Quem controla sessão?

session_service.py

Quem aplica crédito/plano?

usage_policy_service.py ou equivalente

Quem cuida do live coach?

live_coach_service.py + routes_live_coach.py

Quem salva dados?

repositories

Quem fala com LLM?

agents + camada ai/router

Se qualquer uma dessas respostas ainda for “mais de um arquivo”, ainda há duplicidade.

Minha recomendação final

O seu projeto não está bagunçado. Ele está entrando naquela fase em que precisa de governança arquitetural.

O melhor ganho agora não é criar mais uma feature. É fazer uma rodada de consolidação nessas áreas:

rotas oficiais

orquestração

política de uso

separação do live coach

Isso deve reduzir bastante o risco de complexidade sem sacrificar a evolução do produto.