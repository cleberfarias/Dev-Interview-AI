# Plano de Correcoes e Ajustes de Custo

Este documento consolida o relatorio tecnico e define a sequencia de correcoes,
com foco em boas praticas, custo e experiencia do usuario.

## 1) Objetivos
- Reduzir custo por sessao sem perder valor percebido.
- Garantir teste gratuito controlado (sem abuso).
- Melhorar confiabilidade e previsibilidade da entrevista.
- Preparar o deploy com checklist de risco.

## 2) Decisoes de Produto (aplicadas)
- Teste gratuito: 1 credito por usuario (FREE_TRIAL_CREDITS=1).
- Duracao maxima por entrevista:
  - Free: 15 minutos
  - Pro: 25 minutos
  - Minimo tecnico: 10 minutos
- Quantidade de perguntas passa a depender da duracao (media ~ duracao/2).

Motivo: a maior parte do custo esta em chamadas de avaliacao por resposta.
Limitar tempo + perguntas corta chamadas e evita bursts de custo.

## 3) Ajustes feitos no codigo (Full Stack)
- Backend
  - Clamp de duracao no inicio da sessao com limites por plano.
  - Prompt de plano ajustado com duracao e faixa dinamica de perguntas.
  - Creditos iniciais agora usam FREE_TRIAL_CREDITS (fallback em DEFAULT_CREDITS).
- Frontend
  - Duracao limitada por plano (clamp local) antes de iniciar sessao.
  - Entrevista encerra automaticamente ao atingir o limite de tempo.
  - Mensagem de tempo limite no UI.

## 4) Pendencias do relatorio (prioridade)
P0 (antes do deploy):
- Remover token hardcoded em backend/test_requests.py. (feito)
- Corrigir TTS client usando /ai/tts (evitar /api/api/). (feito)
- Separar audio do stream de video antes de enviar (reduzir payload). (feito)

P1 (logo apos deploy):
- Cobrar creditos em /ai/tts e /ai/name-extract, ou rate-limit.
- Ajustar ordem de providers para tarefas com midia (Gemini primeiro).
- Encerrar AudioContext e liberar camera/mic no Lobby corretamente.

P2 (melhoria):
- Mostrar contador de tempo restante no InterviewRoom.
- Ajustar copy do plano Pro (evitar promessa de camera/tempo real se nao existe).

## 5) Parametros recomendados (.env)
Backend:
- FREE_TRIAL_CREDITS=1
- INTERVIEW_MIN_MINUTES=10
- INTERVIEW_MAX_MINUTES_FREE=15
- INTERVIEW_MAX_MINUTES_PRO=25

Frontend (.env.example):
- VITE_INTERVIEW_MIN_MINUTES=10
- VITE_INTERVIEW_MAX_MINUTES_FREE=15
- VITE_INTERVIEW_MAX_MINUTES_PRO=25

## 6) QA - checklist rapido
- Login (Google + email/senha)
- Start session -> plano gera 8-10 perguntas (free)
- Time limit: entrevista termina aos 15 min
- Name extract com audio curto
- Evaluate audio com resposta curta e longa
- Final report gerado e salvo
- Cancelar entrevista cedo

## 7) Notas de custo
Custo cresce com:
- Numero de perguntas (cada resposta = 1 chamada de avaliacao)
- Tamanho do audio (upload + transcricao)
- TTS por pergunta

Formula simples (estimativa):
- chamadas IA por sessao = 1 (plano) + N (avaliacoes) + 1 (relatorio) + N (tts)
- manter N entre 8 e 10 para free

## 8) Proximos passos sugeridos
1) Aplicar P0 e rodar smoke tests
2) Validar custo real com 10 entrevistas
3) Ajustar limites se necessario (5-10% abaixo do orcamento)
