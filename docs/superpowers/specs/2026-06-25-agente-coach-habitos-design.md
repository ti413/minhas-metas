# Spec: Agente de Coach + Agente de Hábitos — Minhas Metas

> Data: 2026-06-25
> Projeto: Minhas Metas (PWA de hábitos)
> Responsável: Marcus

---

## Visão Geral

Dois agentes complementares que automatizam o acompanhamento dos usuários do app:

| Agente | Skill manual | Automação |
|---|---|---|
| **Coach** | `/coach-report` | N8N às 9h diariamente |
| **Hábitos** | `/habitos-analise` | app.js no login + N8N às 20h |

Ambos usam N8N (já na infra) + Supabase (já configurado) + Claude API para geração de conteúdo.

---

## Agente 1 — Coach

### Propósito
Gerar diariamente um insight motivacional + resumo de progresso personalizado pelo mentor ativo do usuário (Jesus ou Eslen Delanogare), entregue via push notification.

### Skill `/coach-report` (manual)
Executa o fluxo completo para um único usuário — útil para testes e depuração.

### Workflow N8N — 9h diariamente

```
TRIGGER: Cron às 09:00

Para cada usuário ativo no Supabase:
  1. Busca dados:
     - Metas do dia e status de conclusão
     - Streak atual
     - Histórico dos últimos 7 dias
     - Mentor ativo (jesus | huberman)

  2. Gera conteúdo via Claude API:
     - Insight do dia personalizado pelo tom do mentor
     - Resumo de progresso (streak, % de conclusão semanal)
     - Tom: Jesus → versículo + empatia pastoral
             Eslen → neurociência + "Reservatório de Dopamina"

  3. Persiste no Supabase:
     - Tabela: ai_reflections
     - Campos: user_id, mentor, content, created_at

  4. Dispara push notification:
     - Via VAPID (chave já configurada no app)
     - Payload: título + preview do insight
     - Ao abrir o app, exibe o conteúdo completo salvo no Supabase
```

### Arquivos a criar

| Arquivo | Descrição |
|---|---|
| `.claude/commands/coach-report.md` | Skill manual `/coach-report` |
| N8N workflow: `Coach Diário - Minhas Metas` | Workflow agendado às 9h |

---

## Agente 2 — Hábitos

### Propósito
Monitorar padrões de comportamento dos usuários, alertar riscos de quebra de streak e sugerir novos hábitos com base no perfil individual.

### Skill `/habitos-analise` (manual)
Executa análise profunda para um usuário específico e exibe resultado no terminal.

### Análise no Login (app.js — tempo real)

Executada a cada login do usuário:

```javascript
// Verificações em sequência (sem bloquear a UI)
1. Streak em risco?
   → Se streak ≥ 2 e nenhuma meta concluída hoje → exibe nudge card
   → "Sua sequência de X dias está em risco! Complete pelo menos 1 meta hoje."

2. Metas problemáticas?
   → Metas com 0 conclusões nos últimos 7 dias → sugere remover ou simplificar
   → Exibe sugestão discreta no card da meta

3. Horário de pico?
   → Analisa horários de conclusão históricos
   → Se lembrete configurado fora do horário de pico → sugere ajuste
```

### Workflow N8N — 20h diariamente

```
TRIGGER: Cron às 20:00

ETAPA 1 — Alertas de streak (urgente)
  → Busca usuários com streak ≥ 2 que ainda não completaram nenhuma meta hoje
  → Para cada um: dispara push notification preventiva
    "Ainda dá tempo! Sua sequência de X dias está em risco. 💪"

ETAPA 2 — Análise de padrões (todos os usuários ativos)
  → Para cada usuário:
    a. Calcula taxa de conclusão por meta (últimos 30 dias)
    b. Identifica dias da semana e horários com mais conclusões
    c. Detecta metas com taxa < 30% (candidatas a simplificação)

ETAPA 3 — Sugestões de novos hábitos (via Claude API)
  → Gera 2-3 sugestões personalizadas baseadas em:
    - Metas já existentes do usuário
    - Taxa de conclusão atual
    - Perfil (nível, XP, mentor ativo)
  → Salva em tabela habit_suggestions no Supabase

ETAPA 4 — Atualiza perfil de padrões no Supabase
  → Tabela: user_patterns
  → Campos: user_id, peak_days, peak_hours, weak_habits, updated_at
  → App lê esses dados no próximo login
```

### Arquivos a criar/modificar

| Arquivo | Ação | Descrição |
|---|---|---|
| `.claude/commands/habitos-analise.md` | Criar | Skill manual `/habitos-analise` |
| `app.js` | Editar | Adicionar análise de login (nudge, metas problemáticas, horário de pico) |
| N8N workflow: `Hábitos Diário - Minhas Metas` | Criar | Workflow agendado às 20h |
| Supabase migration | Criar | Tabelas `habit_suggestions` e `user_patterns` |

---

## Infraestrutura reutilizada

| Recurso | Uso |
|---|---|
| N8N (`n8n.campostecnologia.cloud`) | Agendamento e orquestração dos workflows |
| Supabase (`tpcawmrblanpkgoqisgw.supabase.co`) | Leitura de dados e persistência de insights |
| VAPID (chave já configurada) | Entrega de push notifications |
| Claude API | Geração de conteúdo personalizado por mentor |
| Webhook N8N existente (`/webhook/coach-minhas-metas`) | Reutilizado pelo agente de coach |

---

## Tabelas Supabase necessárias

| Tabela | Status | Campos novos |
|---|---|---|
| `ai_reflections` | Já existe | — |
| `push_subscriptions` | Já existe | — |
| `profiles` | Já existe | — |
| `habit_suggestions` | Criar | `user_id`, `suggestions (json)`, `created_at` |
| `user_patterns` | Criar | `user_id`, `peak_days (json)`, `peak_hours (json)`, `weak_habits (json)`, `updated_at` |

---

## Fora do escopo

- Interface visual para visualizar sugestões de hábitos (fase futura)
- Personalização manual das sugestões pelo usuário
- Análise de múltiplos usuários via skill manual (só via N8N)
- Rollback automático de insights gerados

---

## Critérios de sucesso

- Às 9h: todos os usuários ativos recebem push com insight personalizado pelo mentor
- No login: nudge aparece quando streak está em risco no mesmo dia
- Às 20h: usuários em risco recebem push preventiva antes dos lembretes das 20h
- Sugestões de hábitos salvas no Supabase e disponíveis no próximo login
- Skills manuais funcionando para testes e depuração individuais
