# Integração Strava — Minhas Metas

## Contexto
O app Minhas Metas guarda hábitos e progresso diário como um blob jsonb por usuário na tabela `metas_data.state` (não há tabela relacional de hábitos). O usuário quer que atividades registradas no Strava (corrida, pedalada, etc.) marquem automaticamente o hábito correspondente como concluído, e que dados/estatísticas do Strava apareçam no painel do app.

Escopo: uso pessoal do Marcus por enquanto (single-user). `user_id` = `4144c708-b0d3-49c4-a774-f41ccc964c93` (profile `ti@gruporessonar.com.br`). Sem fluxo OAuth por usuário — expansão multi-usuário fica para depois, se necessário.

## Objetivo
1. Quando uma atividade é criada no Strava, marcar automaticamente como feito o hábito do dia que corresponde a ela (match por tipo/palavra-chave), em tempo real via webhook.
2. Exibir no painel do Minhas Metas as atividades recentes / estatísticas do Strava.

## Armazenamento de credenciais
Reaproveitar a tabela `admin_config` (jsonb livre, 1 linha) — sem migration nova. Guardar em `config.strava`:
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1234567890,
  "client_id": "...",
  "client_secret": "..."
}
```

## Setup inicial (manual, uma vez)
1. Registrar app em strava.com/settings/api (obter `client_id`/`client_secret`).
2. Autorizar manualmente via browser (fluxo OAuth padrão do Strava, escopo `activity:read_all`), trocar o `code` por tokens.
3. Gravar tokens iniciais em `admin_config.config.strava` via SQL.
4. Criar a subscription de webhook do Strava (`POST /push_subscriptions`) apontando para a URL do workflow N8N, com `verify_token` definido.

## Arquitetura
```
Strava --webhook--> N8N workflow "Strava Sync" --> Supabase (metas_data.state)
                                                 --> admin_config (refresh de token)

app.js --GET--> N8N workflow "Strava Stats" --> Strava API --> JSON (atividades recentes)
```

## Workflow N8N "Strava Sync"
- **Branch GET** (verificação de subscription): responde `{"hub.challenge": "<valor recebido>"}` para o `hub.challenge` enviado pelo Strava.
- **Branch POST** (evento de atividade):
  1. Filtrar `object_type == "activity"` e `aspect_type == "create"`.
  2. Ler `admin_config.config.strava`; se `expires_at` no passado, chamar `POST /oauth/token` (grant_type=refresh_token) e regravar `access_token`/`refresh_token`/`expires_at` (o Strava rotaciona o refresh_token a cada uso).
  3. `GET /activities/{id}` para obter `type` da atividade.
  4. Node de matching (tabela fixa, case-insensitive, busca por substring no texto do hábito):
     - `Run`, `Walk`, `Hike` → "corr", "caminhada"
     - `Ride`, `VirtualRide` → "pedal", "bike", "ciclismo"
     - `WeightTraining`, `Workout`, `Crossfit` → "exerc", "treino", "muscul"
     - `Swim` → "nata"
     - `Yoga` → "yoga"
  5. `SELECT state FROM metas_data WHERE user_id = '4144c708-b0d3-49c4-a774-f41ccc964c93'`.
  6. No JSON de `state.metas` (lista do dia), procurar o primeiro item com `done: false` cujo `text` contenha alguma palavra-chave do tipo casado.
     - Se achou: setar `done: true` nesse item.
     - Se não achou (nenhum hábito bate, ou já estava feito): não faz nada, encerra o fluxo.
  7. `UPDATE metas_data SET state = <jsonb atualizado>, updated_at = now() WHERE user_id = '...'`.

## Workflow N8N "Strava Stats" (GET, sem autenticação — single-user)
1. Garantir token válido (mesmo refresh do passo acima).
2. `GET /athlete/activities?per_page=5` → últimas atividades (nome, tipo, distância, data).
3. Retornar JSON simples para o frontend.

## Frontend (index.html / app.js / styles.css)
- Novo card "Strava" no dashboard, seguindo a paleta oficial (`--green`, `--surface`, `--border`, fonte DM Sans).
- `app.js` faz `fetch` no endpoint "Strava Stats" ao carregar o painel e renderiza as últimas atividades (ícone por tipo, nome, distância, data relativa).
- Sem estado de loading complexo: se a chamada falhar, o card simplesmente não aparece (fail silent, não bloqueia o resto do app).

## Erros e edge cases
- Nenhum hábito compatível com o tipo de atividade → não cria hábito novo, não altera nada.
- Hábito já `done: true` → idempotente, não mexe.
- Token expirado no momento do evento → refresh automático antes de qualquer chamada à API do Strava.
- Falha ao contatar Strava (rede, rate limit) → erro fica logado na execução do N8N; não afeta o funcionamento normal do app.
- Virada de dia: como o processamento é em tempo real (webhook), assume-se que a atividade pertence ao `state.metas` do dia corrente já carregado pelo app.

## Fora de escopo (YAGNI)
- OAuth por usuário / múltiplas contas Strava conectadas.
- Tela de configuração de mapeamento hábito↔atividade (mapeamento é hardcoded no node de matching do N8N).
- Notificação push ao marcar hábito automaticamente (extensível depois, reaproveitando `push_subscriptions`).
- Importação retroativa de atividades antigas do Strava (só atividades novas, via webhook, a partir da subscription criada).

## Testes
- Disparar manualmente o evento de webhook (payload de exemplo do Strava) contra o workflow N8N e conferir que `metas_data.state` do usuário é atualizado corretamente.
- Testar caso "nenhum hábito compatível" e caso "hábito já feito" — confirmar que nada é alterado.
- Testar refresh de token expirado (forçar `expires_at` no passado) e confirmar que `admin_config` é atualizado com o novo par de tokens.
- Verificar visualmente o card de estatísticas no painel (dados corretos, sem quebrar layout em mobile).
