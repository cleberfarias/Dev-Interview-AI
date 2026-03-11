Dev Interview AI — Guia de Implementação para Codex
Visão Geral do Projeto

O Dev Interview AI é uma plataforma de inteligência artificial criada para ajudar desenvolvedores a se prepararem para entrevistas técnicas através de:

simulações de entrevistas

avaliação automática de respostas

coaching personalizado

análise de currículo

análise de descrição de vagas

geração de feedback com IA

plano de estudo personalizado

A plataforma combina:

Frontend

React

Vite

Capacitor (para Android)

Backend

Python

FastAPI

Banco de Dados

Firebase

Firestore

Provedores de IA

OpenAI

Gemini

Groq

Todos acessados através de um AI Router central.

O objetivo é construir um AI Interview Coach completo, não apenas um simulador simples.

Visão do Produto

A plataforma terá 3 experiências principais para o usuário.

1 — Preparação para entrevista

O usuário fornece:

currículo

descrição da vaga

O sistema deve:

analisar o currículo

analisar a vaga

comparar ambos

identificar gaps de habilidades

gerar perguntas prováveis de entrevista

2 — Simulação de entrevista

A IA conduz uma entrevista simulada.

Funcionalidades:

entrevista técnica

entrevista comportamental

entrevista mista

respostas por voz ou texto

avaliação automática das respostas

3 — Coaching de entrevista

Após cada resposta, a IA fornece feedback.

Critérios avaliados:

clareza

estrutura da resposta

relevância

precisão técnica

comunicação

A IA também sugere melhorias.

Arquitetura Atual do Projeto

Estrutura atual do projeto:

Dev-Interview-AI/

frontend/
  components/
  hooks/
  services/
  App.tsx

backend/
  app/
    main.py
    schemas.py
    ai/
      router.py
    tts.py
    firebase_admin.py

Essa estrutura funciona para um MVP, mas precisa evoluir para suportar crescimento.

Arquitetura Alvo do Backend

O backend deve ser refatorado em módulos de domínio.

backend/app/

  api/
    routes_auth.py
    routes_sessions.py
    routes_ai.py
    routes_reports.py
    routes_profile.py

  services/
    interview_service.py
    evaluation_service.py
    planning_service.py
    report_service.py
    credits_service.py

  ai/
    router.py
    prompts/
      plan_prompt.py
      evaluate_prompt.py
      next_question_prompt.py
      report_prompt.py

  repositories/
    user_repository.py
    session_repository.py
    report_repository.py

  schemas/
    interview.py
    user.py
    report.py

  resume/
    parser.py
    extractor.py
    matcher.py
Arquitetura Alvo do Frontend

O frontend deve evoluir para uma arquitetura baseada em features.

frontend/src/

  features/
    auth/
    dashboard/
    onboarding/
    interview/
    report/
    profile/
    resume/
    jobs/
    live-coach/

  shared/
    components/
    hooks/
    services/
    utils/
    types/

Cada feature deve conter:

componentes

hooks

serviços

lógica de estado

Módulo de Análise de Currículo

O sistema precisa analisar currículos.

Estrutura do módulo backend:

backend/app/resume/

  parser.py
  extractor.py
  matcher.py

Responsabilidades:

parser.py

Extrair texto de arquivos:

PDF

DOCX

TXT

extractor.py

Usar IA para identificar:

tecnologias

nível de experiência

projetos

empresas

responsabilidades

matcher.py

Comparar currículo com descrição da vaga.

Saída esperada:

Match Score
Habilidades fortes
Habilidades fracas
Habilidades faltantes
Sugestões para entrevista
Fluxo de Sessão de Entrevista

Fluxo ideal do sistema:

Usuário inicia entrevista

→ criar sessão
→ gerar plano de entrevista
→ gerar pergunta
→ usuário responde
→ avaliar resposta
→ gerar próxima pergunta
→ repetir até finalizar
→ gerar relatório final
Prompts de IA

Prompts devem ser separados por responsabilidade.

Prompt de Plano de Entrevista

Gera estrutura da entrevista.

Exemplo:

tipo de entrevista

número de perguntas

tópicos técnicos

Prompt de Pergunta

Gera a próxima pergunta.

Contexto usado:

descrição da vaga

respostas anteriores

tipo de entrevista

Prompt de Avaliação

Avalia resposta do usuário.

Retorno esperado:

score
feedback
pontos fortes
pontos fracos
sugestões de melhoria
Prompt de Relatório Final

Gera relatório completo.

Inclui:

nota geral

nota técnica

nota de comunicação

plano de melhoria

AI Router

O router de IA deve permitir alternar entre provedores.

Provedores suportados:

OpenAI

Gemini

Groq

Responsabilidades do router:

fallback de provedor

controle de custo

formato consistente de resposta

Exemplo de função:

generate_response(
  provider="auto",
  prompt=prompt,
  context=context
)
Sistema de Perfil do Candidato

O sistema deve persistir informações do candidato.

Coleção Firestore:

candidate_profiles

Estrutura:

{
  userId
  targetRole
  experienceLevel
  primarySkills
  weakSkills
  resumeSummary
}

Isso permite:

entrevistas personalizadas

perguntas mais relevantes

feedback mais preciso

Modelo de Avaliação de Respostas

Cada resposta deve gerar avaliação estruturada.

Exemplo:

{
  clareza: 7,
  precisao_tecnica: 8,
  relevancia: 7,
  comunicacao: 6,
  feedback: "Sua resposta está correta, mas poderia ser mais estruturada."
}
Coach em Tempo Real (Feature futura)

Versões futuras devem suportar assistência durante entrevistas reais.

Pipeline:

Áudio

→ speech-to-text
→ detectar pergunta
→ classificar pergunta
→ buscar contexto
→ gerar resposta sugerida
→ exibir no popup

Módulo:

backend/app/live_coach/
Prioridades de Desenvolvimento (MVP)

Codex deve seguir a seguinte ordem.

Prioridade 1

Refatorar backend.

Separar responsabilidades do main.py.

Prioridade 2

Implementar módulo de análise de currículo.

Prioridade 3

Implementar análise de descrição da vaga.

Prioridade 4

Melhorar modelo de avaliação de respostas.

Prioridade 5

Criar persistência de perfil do candidato.

Regras de Código

Codex deve seguir estas regras.

Regra 1

Não colocar lógica de negócio nas rotas.

Rotas apenas chamam services.

Regra 2

Services contêm a lógica de domínio.

Regra 3

Prompts de IA devem ficar separados da lógica de negócio.

Regra 4

Respostas de IA devem sempre retornar JSON estruturado.

Regra 5

Evitar arquivos muito grandes.

Resultado Esperado

O sistema final deve funcionar como um AI Interview Coach completo, capaz de:

preparar candidatos

simular entrevistas

avaliar respostas

identificar lacunas de conhecimento

gerar planos de estudo personalizados

💡 Dica importante para o Codex

Sempre priorizar:

modularização

separação de responsabilidades

respostas estruturadas da IA

arquitetura escalável