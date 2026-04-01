# Roadmap - Engenharia de IA Aplicada

Este documento transforma a ementa de Engenharia de IA Aplicada em um plano de evolucao executavel para o Dev Interview AI.

Objetivo: sair de um produto com multiagentes modularizados e boas bases de producao para uma plataforma de IA aplicada madura, com:

- motor de agentes mais robusto
- memoria e contexto de alta qualidade
- RAG real
- observabilidade e governanca de IA
- UX/UI mais intencional e mais assistida por IA
- operacao pronta para escalar com custo controlado

## 1. Estado atual

O projeto ja possui uma base relevante:

- backend FastAPI em producao
- frontend React/Vite com Firebase
- fluxo oficial de entrevista
- roteador de modelos com fallback
- MCP server e MCP client interno
- memoria consolidada do candidato
- observabilidade de IA, frontend e backend
- avatar com TTS + lipsync
- CI/CD web + backend

Isso significa que a fase atual nao e de "comecar do zero". E uma fase de elevacao arquitetural e de maturidade.

## 2. Principios de evolucao

1. Primeiro consolidar o motor.
2. Depois elevar qualidade de contexto e memoria.
3. Depois introduzir tool use dinamico e workflows mais autonomos.
4. So depois acelerar fine-tuning.
5. Design e UX devem evoluir em paralelo, mas sem mascarar fragilidades do motor.

## 3. Norte arquitetural

Ao final do roadmap, o produto deve operar com estes blocos:

- `AI Core`: router, guardrails, contracts, evals, cache e fallback
- `Agent Runtime`: planner, executor, memory, tool registry e supervision
- `Knowledge Layer`: RAG, indices vetoriais, memoria episodica e rubricas versionadas
- `Interview Runtime`: entrevista real-time, avatar, audio streaming e coaching
- `Product UX`: onboarding guiado, explainability, traces visiveis e feedback acionavel
- `AI Ops`: metricas de custo, latencia, qualidade, seguranca e governanca

## 4. Roadmap por fases

## Fase 0 - Consolidacao da base

Duracao sugerida: 1 a 2 semanas

Objetivo:

- eliminar ambiguidade arquitetural
- preparar o codigo para evolucao segura

Entregas:

- definir oficialmente o fluxo de entrevista em torno do orchestrator
- revisar limites entre `routes`, `services`, `agents` e `repositories`
- padronizar contracts JSON entre agentes
- centralizar politicas de credito, custo e retries
- criar inventario de prompts, modelos e versoes

Criterios de aceite:

- existe um dono oficial para cada fluxo critico
- agents nao persistem dados
- repositories nao aplicam regra de negocio
- cada chamada de IA possui `agent`, `task`, `promptVersion`, `provider` e `model`

## Fase 1 - Motor de IA v2

Duracao sugerida: 2 a 3 semanas

Objetivo:

- evoluir de "prompt orchestration" para "engine orchestration"

Entregas de motor:

- criar uma camada `agent_runtime` com:
  - registry de agentes
  - registry de ferramentas
  - contexto ativo por sessao
  - output validation
  - politicas de retry e fallback por tarefa
- separar claramente:
  - `planner`
  - `question_generator`
  - `evaluator`
  - `coach`
  - `reporter`
- adicionar `confidence score` por resposta de agente
- criar `failure modes` padronizados por agente

Entregas de observabilidade:

- dashboard interno de execucao por agente
- traces por sessao com:
  - entrada
  - contexto usado
  - modelo escolhido
  - custo estimado
  - motivo de fallback

Entregas de design:

- criar um "AI control panel" na UI para exibir:
  - modelo usado
  - qualidade do contexto
  - status da sessao
  - eventos de fallback

Criterios de aceite:

- cada agente produz saida validada e auditavel
- o sistema consegue explicar por que escolheu determinado modelo ou fallback
- o usuario consegue ver o estado da entrevista sem depender do console/log

## Fase 2 - Memoria, contexto e RAG

Duracao sugerida: 3 a 4 semanas

Objetivo:

- melhorar qualidade das perguntas, avaliacoes e planos por contexto recuperado

Entregas de motor:

- implementar RAG para:
  - curriculo
  - descricao da vaga
  - historico de entrevistas
  - rubricas de avaliacao
  - plano de estudos
- criar camada de `knowledge retrieval`
- adicionar memoria episodica por sessao e por usuario
- adicionar memoria semantica de skills, gaps e evidencias
- definir estrategia de `context pruning` e `context stitching`

Tecnologia sugerida:

- embeddings no backend
- vector store simples para MVP:
  - Firestore + embeddings cacheados, ou
  - Qdrant/Chroma para ambiente dedicado

Entregas de UX:

- timeline de evidencias por resposta
- explicacao de quais fontes entraram no contexto
- painel de "profile confidence" para curriculo e vaga

Criterios de aceite:

- proxima pergunta usa contexto recuperado e nao apenas resumo bruto
- relatorio final referencia evidencias reais da entrevista
- plano de estudos prioriza gaps recorrentes observados

## Fase 3 - Tool Use, MCP expandido e workflows complexos

Duracao sugerida: 2 a 3 semanas

Objetivo:

- sair do uso estatico de contexto MCP para tool use controlado

Entregas:

- expandir o MCP com novas tools:
  - `get_candidate_memory`
  - `get_resume_analysis`
  - `get_job_analysis`
  - `get_session_trace`
  - `search_rubric_knowledge`
- criar `tool contracts` formais e versionados
- permitir que agentes selecionados usem ferramentas em runtime
- introduzir workflow em grafo para:
  - contexto
  - entrevista
  - relatorio
  - plano de estudo

Implementacao sugerida:

- comecar com state machine propria
- avaliar LangGraph apenas quando os estados estiverem claros

Entregas de UX:

- debugger de tools na area administrativa
- visualizacao do fluxo do agente por etapa

Criterios de aceite:

- agentes conseguem buscar contexto e evidencias via tools
- existe rastreabilidade de qual tool foi chamada e com qual retorno
- o sistema evita loops e chamadas redundantes

## Fase 4 - Interview Runtime real-time

Duracao sugerida: 3 a 4 semanas

Objetivo:

- deixar a entrevista mais proxima de uma experiencia real-time de alto valor percebido

Entregas de motor:

- pipeline streaming:
  - STT incremental
  - avaliacao parcial
  - coaching parcial
  - preparacao antecipada da proxima pergunta
- reduzir latencia percebida do avatar
- adicionar estados claros:
  - `listening`
  - `thinking`
  - `speaking`
  - `fallback`
- melhorar decisao entre:
  - coaching mode
  - hiring assessment mode

Entregas de design:

- novo layout de sala com foco em:
  - hierarquia visual melhor
  - status do entrevistador
  - status do candidato
  - coaching menos intrusivo
  - leitura de progresso da entrevista
- refinamento visual do avatar interviewer card
- motion design para transicao entre escuta, processamento e fala

Criterios de aceite:

- o usuario entende o estado atual da entrevista sem ambiguidade
- live coach nao compete visualmente com a resposta principal
- a experiencia do avatar parece intencional e nao um acoplamento tecnico

## Fase 5 - Product Design AI-first

Duracao sugerida: 2 a 3 semanas

Objetivo:

- elevar a camada de design e UX para refletir a ambicao do motor de IA

Entregas:

- criar design system leve com tokens para:
  - cor
  - tipografia
  - espaco
  - estado
  - sinais de IA
- padronizar componentes de:
  - cards de contexto
  - traces
  - score
  - evidencias
  - feedback
  - estados de confianca
- revisar fluxo de onboarding e dashboard
- melhorar narrativa visual do relatorio final

Direcao visual sugerida:

- menos "dashboard generico"
- mais "workspace de simulacao e diagnostico"
- contraste claro entre:
  - modo coaching
  - modo hiring
  - sinal fraco vs sinal confiavel

Criterios de aceite:

- a identidade visual comunica claramente que o produto e uma plataforma de IA aplicada
- o relatorio final parece produto premium, nao apenas dump de dados
- os estados do sistema ficam legiveis para usuario e operador

## Fase 6 - AI Ops, governanca e seguranca

Duracao sugerida: 2 a 3 semanas

Objetivo:

- operar IA com previsibilidade, auditoria e custo controlado

Entregas:

- metricas por agente:
  - custo
  - latencia
  - taxa de erro
  - taxa de fallback
  - qualidade percebida
- approval gates para sinais sensiveis
- trilha de auditoria para:
  - comportamento
  - culture fit
  - memoria
  - relatorio final
- rate limits por feature
- alertas para runaway loops e abuse de API
- scan de secrets e dependencia em CI

Entregas de UX/admin:

- painel interno de operacao de IA
- filtro por sessao, agente, modelo e erro
- visao de custo por entrevista

Criterios de aceite:

- existe rastreabilidade suficiente para explicar decisao automatizada
- o sistema falha de forma controlada
- custo por sessao pode ser medido e otimizado

## Fase 7 - Fine-tuning e especializacao

Duracao sugerida: apos maturidade de RAG + evals

Objetivo:

- treinar ou especializar comportamentos quando retrieval e prompting ja nao forem suficientes

Entregas:

- decision framework para fine-tuning
- dataset versionado em JSONL
- suite de avaliacao A/B entre:
  - modelo base
  - modelo com RAG
  - modelo fine-tunado
- especializacao inicial em um dominio:
  - frontend
  - backend
  - data/ML
  - system design

Regra:

- nao iniciar fine-tuning antes de:
  - ter RAG funcionando
  - ter evals automatizadas
  - ter metricas de falha e sucesso

Criterios de aceite:

- ganho de qualidade e mensuravel
- custo adicional e justificavel
- modelo especializado nao regrede em generalizacao de forma inaceitavel

## 5. Trilhas paralelas

## Trilha A - Motor

Prioridade alta:

- contracts fortes
- output validation
- confidence scoring
- memory service v2
- RAG
- tool use
- eval harness

## Trilha B - Dados e conhecimento

Prioridade alta:

- rubricas versionadas
- base de evidencias por sessao
- indexacao de curriculo/vaga
- armazenamento semantico de gaps e strengths

## Trilha C - Design e UX

Prioridade alta:

- entrevista real-time mais clara
- dashboard menos generico
- relatorio premium
- estados de IA explicitos
- explainability visual

## Trilha D - Operacao

Prioridade alta:

- custo por task
- alertas
- auditoria
- seguranca
- compliance minimo para producao

## 6. O que ja existe e deve ser preservado

Preservar:

- arquitetura `services/agents/repositories`
- MCP server e client internos
- roteador de modelos com fallback
- telemetria do frontend
- logging estruturado
- memoria consolidada do candidato
- avatar/TTS/lipsync como base de experiencia

Nao quebrar:

- fluxo oficial `/interview/*`
- modo coaching vs hiring
- persistencia em Firebase
- contratos de relatorio ja usados pelo frontend

## 7. Backlog inicial recomendado

Ordem das proximas 10 entregas:

1. Criar `agent_runtime` com contracts, errors e metadata padronizada.
2. Extrair inventario de prompts e versoes por task.
3. Implementar `confidence` e `source evidence` nas respostas dos agentes.
4. Criar indice RAG para curriculo, vaga e historico de entrevistas.
5. Expandir MCP com tools de memoria e traces.
6. Adicionar painel de trace/execucao de IA no frontend.
7. Reestruturar layout da Interview Room com estados visuais claros.
8. Reestruturar dashboard e report com design system de sinais de IA.
9. Adicionar eval harness com comparacao entre modelos e prompts.
10. So entao decidir se vale fine-tuning para dominios especificos.

## 8. Roadmap de 90 dias

Dias 1-15:

- Fase 0 completa
- desenho do `agent_runtime`
- inventario de prompts, agentes e modelos

Dias 16-35:

- Fase 1 completa
- traces melhores
- painel de IA no frontend

Dias 36-60:

- Fase 2 em producao
- RAG para curriculo, vaga e memoria

Dias 61-75:

- Fase 3 com MCP expandido e tool use controlado

Dias 76-90:

- Fase 4 iniciada
- redesign da Interview Room
- redesign do relatorio final

## 9. Metricas de sucesso

Metricas de motor:

- queda da taxa de resposta invalida da IA
- queda de repeticao de perguntas
- aumento de aderencia da pergunta ao contexto
- menor latencia media por turno
- menor custo medio por entrevista

Metricas de produto:

- maior taxa de finalizacao da entrevista
- maior uso do relatorio e plano de estudo
- menor abandono no onboarding
- maior conversao entre teste e uso recorrente

Metricas de design:

- menor confusao de estado na sala
- melhor percepcao de clareza e qualidade
- maior confianca do usuario nas avaliacoes

## 10. Recomendacao executiva

Se a meta for transformar este projeto em referencia de Engenharia de IA Aplicada, a ordem correta e:

1. consolidar governanca do motor
2. melhorar contexto e memoria com RAG
3. habilitar tool use e workflows mais autonomos
4. redesenhar a experiencia principal em cima desses ganhos
5. operar com AI Ops e governanca
6. somente depois especializar modelos com fine-tuning

Esse caminho maximiza qualidade, reduz retrabalho e evita investir cedo em fine-tuning ou redesign sobre uma base ainda subinstrumentada.
