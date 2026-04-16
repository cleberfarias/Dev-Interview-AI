# Plano de Correcoes e Ajustes de Custo

Este documento consolida o relatorio tecnico e define a sequencia de correcoes,
com foco em boas praticas, custo e experiencia do usuario.

## 1) Objetivos
- Reduzir custo por sessao sem perder valor percebido.
- Garantir teste gratuito controlado (sem abuso).
- Melhorar confiabilidade e previsibilidade da entrevista.
- Preparar o deploy com checklist de risco.

## 2) Decisoes de Produto (aplicadas)
- Teste gratuito: 3 creditos por usuario (FREE_TRIAL_CREDITS=3).
- Duracao da entrevista padronizada em 10 minutos.
- Quantidade fixa de 5 perguntas por entrevista.

Motivo: a maior parte do custo esta em chamadas de avaliacao por resposta.
Limitar tempo + perguntas corta chamadas e evita bursts de custo.

## 3) Ajustes feitos no codigo (Full Stack)
- Backend
  - Normalizacao da sessao para 10 minutos.
  - Quantidade fixa de 5 perguntas.
  - Creditos iniciais agora usam FREE_TRIAL_CREDITS (fallback em DEFAULT_CREDITS).
- Frontend
  - Duracao fixa alinhada ao backend.
  - Quantidade fixa de perguntas alinhada ao backend.
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
- FREE_TRIAL_CREDITS=3
- INTERVIEW_FIXED_MINUTES=10
- INTERVIEW_FIXED_QUESTION_COUNT=5

Frontend (.env.example):
- VITE_INTERVIEW_FIXED_MINUTES=10
- VITE_INTERVIEW_FIXED_QUESTION_COUNT=5

## 6) QA - checklist rapido
- Login (Google + email/senha)
- Start session -> entrevista configurada para 5 perguntas
- Time limit: entrevista termina aos 10 min
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
- manter N em 5 por sessao

## 8) Proximos passos sugeridos
1) Aplicar P0 e rodar smoke tests
2) Validar custo real com 10 entrevistas
3) Ajustar limites se necessario (5-10% abaixo do orcamento)
