# Integração Strava Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atividades criadas no Strava marcam automaticamente o hábito do dia correspondente no Minhas Metas, e o painel exibe as últimas atividades do Strava.

**Architecture:** Webhook do Strava → workflow N8N que renova token, busca a atividade, casa por palavra-chave com um hábito do dia em `metas_data.state` (jsonb) e grava de volta. Segundo workflow N8N (GET) expõe estatísticas recentes para o `app.js` renderizar um card no painel.

**Tech Stack:** N8N (workflow SDK via MCP), Supabase Postgres (`admin_config`, `metas_data`), Strava API v3 (OAuth2 + webhooks), HTML/CSS/JS vanilla (frontend do Minhas Metas).

## Global Constraints
- Projeto Supabase: `tpcawmrblanpkgoqisgw`. `user_id` alvo: `4144c708-b0d3-49c4-a774-f41ccc964c93`.
- N8N em `https://n8n.campostecnologia.cloud`.
- Nenhuma credencial (client_secret, tokens) pode ser escrita em specs, planos, commits ou docs — só em `admin_config` (Supabase) e nas credenciais do próprio N8N.
- Frontend: paleta oficial lida de `styles.css` (`--green`, `--surface`, `--border`, etc.), fonte DM Sans. Não inventar cores novas.
- Deploy do frontend só via `deploy_metas.py` (paramiko/SFTP), nunca `scp`.
- Repo local: `C:\Users\Administrador\Desktop\PROJETOS\Projeto app metas` (branch `master`).

---

### Task 1: Registrar app no Strava e autorizar acesso (setup manual)

**Files:** nenhum arquivo de código — só configuração externa e uma linha em `admin_config` via SQL.

**Interfaces:**
- Produces: linha `admin_config` (id=1, ou o id existente) com `config.strava = {client_id, client_secret, access_token, refresh_token, expires_at}` — chave consumida por todas as tasks seguintes (N8N lê daqui).

- [ ] **Step 1: Usuário registra o app em strava.com/settings/api**

Ação do usuário (Marcus): criar/usar um app Strava, anotar `Client ID` e `Client Secret`, e definir `Authorization Callback Domain` como `n8n.campostecnologia.cloud`.

- [ ] **Step 2: Gerar URL de autorização e obter o `code`**

Montar e abrir no browser (substituindo `CLIENT_ID`):
```
https://www.strava.com/oauth/authorize?client_id=CLIENT_ID&redirect_uri=https://n8n.campostecnologia.cloud/&response_type=code&scope=activity:read_all&approval_prompt=force
```
Após autorizar, o Strava redireciona para uma URL com `?code=...` — copiar esse `code` (válido por poucos minutos).

- [ ] **Step 3: Trocar o `code` por tokens (curl, uma vez)**

```bash
curl -s -X POST https://www.strava.com/oauth/token \
  -d client_id=CLIENT_ID \
  -d client_secret=CLIENT_SECRET \
  -d code=CODE_OBTIDO \
  -d grant_type=authorization_code
```
Resposta contém `access_token`, `refresh_token`, `expires_at` (unix timestamp).

- [ ] **Step 4: Gravar em `admin_config` via Supabase MCP (`execute_sql`)**

```sql
insert into public.admin_config (id, config)
values (1, jsonb_build_object(
  'strava', jsonb_build_object(
    'client_id', 'CLIENT_ID',
    'client_secret', 'CLIENT_SECRET',
    'access_token', 'ACCESS_TOKEN',
    'refresh_token', 'REFRESH_TOKEN',
    'expires_at', EXPIRES_AT_UNIX
  )
))
on conflict (id) do update
set config = admin_config.config || excluded.config;
```
(Se já existir uma linha `id=1` com outras chaves, o `||` faz merge sem apagar o resto.)

- [ ] **Step 5: Verificar**

`execute_sql`: `select config->'strava' from public.admin_config where id = 1;` — confirmar que os 5 campos estão presentes e não nulos. **Não imprimir os valores em nenhum documento do projeto** — só confirmar presença/ausência das chaves.

---

### Task 2: Workflow N8N "Strava Sync" — branch de verificação do webhook (GET)

**Files:** workflow N8N novo, criado via MCP (`create_workflow_from_code` / `update_workflow`), nome `Strava Sync`. Nenhum arquivo local.

**Interfaces:**
- Produces: URL pública do webhook (ex: `https://n8n.campostecnologia.cloud/webhook/strava-sync`), consumida na Task 4 (registro da subscription) e é a mesma URL/nó base da Task 3.

- [ ] **Step 1: Ler a referência do SDK do n8n**

Chamar `get_sdk_reference` (MCP n8n) antes de escrever qualquer código de workflow — não adivinhar sintaxe.

- [ ] **Step 2: Buscar nodes necessários**

Chamar `search_nodes` com `["webhook", "if", "respond to webhook"]` e anotar os discriminators retornados.

- [ ] **Step 3: Criar o workflow com o node Webhook (GET+POST) e branch condicional**

Usar `create_workflow_from_code` (via `get_sdk_reference`) para criar:
- Node `Webhook` — path `strava-sync`, métodos `GET` e `POST`, modo de resposta "usando node Respond to Webhook" (não resposta imediata).
- Node `IF` logo após — condição `{{$json.query["hub.mode"]}} exists` (true = é o GET de verificação do Strava).
- Ramo TRUE → node `Respond to Webhook` retornando JSON `{"hub.challenge": "={{$json.query[\"hub.challenge\"]}}"}`, status 200.
- Ramo FALSE → segue para a Task 3 (deixar solto por enquanto, sem node conectado ainda).

- [ ] **Step 4: Publicar o workflow (sem ativar ainda)**

Chamar `update_workflow` salvando o estado atual. Não chamar `publish_workflow` ainda — só depois que a Task 3 e 4 estiverem prontas.

- [ ] **Step 5: Testar a branch GET manualmente**

Com o workflow em modo de teste do N8N (`test_workflow` ou execução manual), simular uma chamada GET:
```bash
curl "https://n8n.campostecnologia.cloud/webhook-test/strava-sync?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=teste"
```
Esperado: resposta `{"hub.challenge":"abc123"}` com status 200.

- [ ] **Step 6: Commit (registro local, opcional)**

Não há arquivo local pra commitar (workflow vive só no N8N). Anotar no corpo da PR/relato final a URL final do webhook.

---

### Task 3: Workflow N8N "Strava Sync" — refresh de token e busca da atividade (branch POST)

**Files:** mesmo workflow `Strava Sync` da Task 2 (edição incremental via `update_workflow`).

**Interfaces:**
- Consumes: `admin_config.config.strava` (Task 1) — campos `access_token`, `refresh_token`, `expires_at`, `client_id`, `client_secret`.
- Produces: variável de fluxo `activityType` (string, ex: `"Run"`) e `activityId`, consumidos pela Task 4 (matching).

- [ ] **Step 1: Buscar nodes necessários**

`search_nodes` com `["postgres", "http request", "if", "code"]` — vai precisar de um node Postgres (ler/gravar `admin_config`), HTTP Request (chamadas à API do Strava) e um node Code para lógica de expiração.

- [ ] **Step 2: Node de filtro do evento**

Na ramo FALSE da Task 2, adicionar `IF`: `{{$json.body.object_type}} == "activity" AND {{$json.body.aspect_type}} == "create"`. Ramo FALSE deste IF → `Respond to Webhook` com status 200 vazio (Strava exige 200 rápido, mesmo se ignorarmos o evento). Ramo TRUE → segue.

- [ ] **Step 3: Node Postgres — ler `admin_config`**

Query:
```sql
select config->'strava' as strava from public.admin_config where id = 1;
```

- [ ] **Step 4: Node Code — checar expiração**

```javascript
const strava = $input.first().json.strava;
const nowUnix = Math.floor(Date.now() / 1000);
return [{ json: { ...strava, needsRefresh: nowUnix >= strava.expires_at } }];
```

- [ ] **Step 5: Node IF — `needsRefresh == true`**

Ramo TRUE → node HTTP Request `POST https://www.strava.com/oauth/token` com body `client_id`, `client_secret`, `refresh_token`, `grant_type=refresh_token` (valores vindos do node anterior via expressões `{{$json.client_id}}` etc). Em seguida, node Postgres `UPDATE`:
```sql
update public.admin_config
set config = jsonb_set(
  config, '{strava}',
  config->'strava' || jsonb_build_object(
    'access_token', $1::text,
    'refresh_token', $2::text,
    'expires_at', $3::bigint
  )
)
where id = 1;
```
(parâmetros vindos da resposta do refresh: `access_token`, `refresh_token`, `expires_at`).
Ramo FALSE → segue direto com o `access_token` já válido.

- [ ] **Step 6: Node HTTP Request — buscar detalhes da atividade**

`GET https://www.strava.com/api/v3/activities/{{$json.body.object_id}}` com header `Authorization: Bearer {{$json.access_token}}` (usar o token do ramo que rodou: refresh ou original — usar um node Merge antes se necessário para unificar os dois ramos em um único caminho com `access_token` correto).

- [ ] **Step 7: Testar manualmente com payload de exemplo**

Payload de teste (Strava manda isso no POST real):
```json
{
  "object_type": "activity",
  "object_id": 123456789,
  "aspect_type": "create",
  "owner_id": 987654,
  "subscription_id": 1,
  "event_time": 1700000000
}
```
Rodar o workflow em modo de teste com esse payload (substituindo `object_id` por uma atividade real sua no Strava) e conferir no painel do N8N que o node de HTTP Request retornou o `type` da atividade (ex: `"Run"`).

---

### Task 4: Matching de hábito e atualização do `metas_data.state`

**Files:** mesmo workflow `Strava Sync` (edição incremental).

**Interfaces:**
- Consumes: `activityType` (string) do node HTTP Request da Task 3 (campo `type` da resposta da API do Strava).
- Produces: linha `metas_data` atualizada — efeito observável, sem interface de código para outras tasks.

- [ ] **Step 1: Node Code — tabela de keywords e seleção**

```javascript
const KEYWORDS = {
  Run: ['corr', 'caminhada'],
  Walk: ['corr', 'caminhada'],
  Hike: ['corr', 'caminhada'],
  Ride: ['pedal', 'bike', 'ciclismo'],
  VirtualRide: ['pedal', 'bike', 'ciclismo'],
  WeightTraining: ['exerc', 'treino', 'muscul'],
  Workout: ['exerc', 'treino', 'muscul'],
  Crossfit: ['exerc', 'treino', 'muscul'],
  Swim: ['nata'],
  Yoga: ['yoga'],
};

const activityType = $input.first().json.type;
const keywords = KEYWORDS[activityType] || [];
return [{ json: { keywords } }];
```

- [ ] **Step 2: Node Postgres — ler `metas_data.state` do usuário**

```sql
select state from public.metas_data where user_id = '4144c708-b0d3-49c4-a774-f41ccc964c93';
```

- [ ] **Step 3: Node Code — aplicar o match e montar o novo state**

```javascript
const state = $input.first().json.state;
const keywords = $('Code - Keywords').first().json.keywords;

if (!keywords.length) {
  return [{ json: { skip: true, reason: 'tipo de atividade sem mapeamento' } }];
}

const metas = state.metas || [];
const match = metas.find(m =>
  !m.done && keywords.some(k => m.text.toLowerCase().includes(k))
);

if (!match) {
  return [{ json: { skip: true, reason: 'nenhum habito compativel ou ja feito' } }];
}

match.done = true;
return [{ json: { skip: false, newState: state } }];
```
(Ajustar `$('Code - Keywords')` para o nome real do node da Step 1 no editor N8N.)

- [ ] **Step 4: Node IF — `skip == false`**

Ramo TRUE → node Postgres `UPDATE`:
```sql
update public.metas_data
set state = $1::jsonb, updated_at = now()
where user_id = '4144c708-b0d3-49c4-a774-f41ccc964c93';
```
(parâmetro `$1` = `{{$json.newState}}` serializado como JSON.)
Ramo FALSE → `Respond to Webhook` 200 vazio, encerra sem alterar nada.

Depois do UPDATE (ramo TRUE) → `Respond to Webhook` 200 vazio também.

- [ ] **Step 5: Testar ponta a ponta com o payload de teste da Task 3**

Antes do teste, via Supabase MCP, confirmar o estado atual do hábito "Exercício 30 min" (`done: false`) para o dia de hoje:
```sql
select state->'metas' from public.metas_data where user_id = '4144c708-b0d3-49c4-a774-f41ccc964c93';
```
Rodar o workflow com o payload de teste de uma atividade `WeightTraining` ou `Workout` real. Depois, repetir a query acima e confirmar que o item com texto contendo "exerc" agora tem `done: true`.

- [ ] **Step 6: Testar idempotência**

Rodar o mesmo payload de novo. Confirmar (via `search_executions` ou log do node IF) que o ramo `skip: true` foi tomado (porque o hábito já está `done: true`) e que `metas_data.state` não mudou.

- [ ] **Step 7: Ativar o workflow**

Chamar `publish_workflow` para o workflow `Strava Sync`.

---

### Task 5: Registrar a subscription de webhook no Strava

**Files:** nenhum — chamada de API única.

**Interfaces:**
- Consumes: URL do webhook publicado na Task 2 (`https://n8n.campostecnologia.cloud/webhook/strava-sync`), `client_id`/`client_secret` de `admin_config`.

- [ ] **Step 1: Criar a subscription**

```bash
curl -s -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=CLIENT_ID \
  -F client_secret=CLIENT_SECRET \
  -F "callback_url=https://n8n.campostecnologia.cloud/webhook/strava-sync" \
  -F verify_token=UM_TOKEN_QUALQUER_SEU
```
Esperado: resposta 201 com `{"id": ...}`. O Strava chama o `callback_url` com GET antes de confirmar — o workflow (Task 2) precisa estar publicado e ativo nesse momento.

- [ ] **Step 2: Confirmar a subscription**

```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=CLIENT_ID \
  -d client_secret=CLIENT_SECRET
```
Esperado: lista contendo a subscription criada.

- [ ] **Step 3: Teste real — gravar uma atividade de teste no Strava**

Marcar manualmente uma atividade curta no app do Strava (ou editar o tipo de uma existente para forçar um evento `update`, se preferir testar sem gerar atividade nova) e conferir, via `search_executions` do N8N, que o workflow `Strava Sync` rodou e (se o tipo bater com um hábito pendente) que `metas_data.state` foi atualizado.

---

### Task 6: Workflow N8N "Strava Stats" (GET) — atividades recentes

**Files:** workflow N8N novo, nome `Strava Stats`.

**Interfaces:**
- Consumes: `admin_config.config.strava` (mesmo padrão de refresh das Tasks 3).
- Produces: endpoint `GET https://n8n.campostecnologia.cloud/webhook/strava-stats` retornando JSON:
  ```json
  {
    "activities": [
      { "name": "string", "type": "string", "distance_m": 0, "moving_time_s": 0, "start_date": "ISO8601" }
    ]
  }
  ```
  Consumido pela Task 7 (frontend).

- [ ] **Step 1: Criar o workflow com node Webhook (GET) `strava-stats`**

Reaproveitar a mesma lógica de refresh de token das Steps 3-5 da Task 3 (duplicar os nodes Postgres/Code/HTTP Request de refresh neste novo workflow — cada workflow N8N é isolado).

- [ ] **Step 2: Node HTTP Request — buscar atividades**

`GET https://www.strava.com/api/v3/athlete/activities?per_page=5` com header `Authorization: Bearer {{access_token}}`.

- [ ] **Step 3: Node Code — moldar a resposta**

```javascript
const activities = $input.first().json.map(a => ({
  name: a.name,
  type: a.type,
  distance_m: a.distance,
  moving_time_s: a.moving_time,
  start_date: a.start_date,
}));
return [{ json: { activities } }];
```

- [ ] **Step 4: Node Respond to Webhook**

Retornar `{{$json}}` como corpo, `Content-Type: application/json`, status 200.

- [ ] **Step 5: Publicar e testar**

`publish_workflow`. Testar:
```bash
curl -s https://n8n.campostecnologia.cloud/webhook/strava-stats | head -c 500
```
Esperado: JSON com `activities` (array, até 5 itens, campos `name`/`type`/`distance_m`/`moving_time_s`/`start_date` presentes).

---

### Task 7: Card "Strava" no painel do Minhas Metas

**Files:**
- Modify: `app.js` (adicionar função de fetch + render, chamada na inicialização do dashboard).
- Modify: `index.html` (adicionar container do card, ex: `<div id="strava-card"></div>` na área do dashboard).
- Modify: `styles.css` (estilos do card, reaproveitando variáveis `--green`, `--surface`, `--border`, `--muted`).

**Interfaces:**
- Consumes: `GET https://n8n.campostecnologia.cloud/webhook/strava-stats` (Task 6), formato `{ activities: [{name, type, distance_m, moving_time_s, start_date}] }`.

- [ ] **Step 1: Localizar o ponto de inicialização do dashboard em `app.js`**

Buscar a função que roda ao carregar a tela "Hoje" (mesma área de `renderHoje()`, já vista em `app.js:250` e arredores) para saber onde encaixar a chamada de inicialização do card.

- [ ] **Step 2: Adicionar o container no `index.html`**

Inserir, próximo ao bloco de hábitos do dia, um container vazio:
```html
<div id="strava-card" class="strava-card" style="display:none"></div>
```

- [ ] **Step 3: Implementar fetch + render em `app.js`**

```javascript
async function carregarStravaCard() {
  try {
    const resp = await fetch('https://n8n.campostecnologia.cloud/webhook/strava-stats');
    if (!resp.ok) return;
    const data = await resp.json();
    renderStravaCard(data.activities || []);
  } catch (e) {
    // fail silent — card simplesmente não aparece
  }
}

function renderStravaCard(activities) {
  const el = document.getElementById('strava-card');
  if (!el || !activities.length) return;

  const item = a => {
    const km = (a.distance_m / 1000).toFixed(1);
    const min = Math.round(a.moving_time_s / 60);
    const data = new Date(a.start_date).toLocaleDateString('pt-BR');
    return `<div class="strava-item">
      <span class="strava-item-type">${escapeHtml(a.type)}</span>
      <span class="strava-item-name">${escapeHtml(a.name)}</span>
      <span class="strava-item-meta">${km} km · ${min} min · ${data}</span>
    </div>`;
  };

  el.innerHTML = `<h3>Strava</h3><div class="strava-list">${activities.map(item).join('')}</div>`;
  el.style.display = 'block';
}
```
Chamar `carregarStravaCard()` no mesmo ponto de inicialização identificado na Step 1.

- [ ] **Step 4: Estilizar em `styles.css`**

```css
.strava-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-top: 16px;
}
.strava-card h3 {
  margin: 0 0 8px;
  color: var(--ink);
  font-size: 15px;
}
.strava-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.strava-item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}
.strava-item-type {
  color: var(--green);
  font-weight: 600;
}
.strava-item-name {
  color: var(--ink);
}
.strava-item-meta {
  color: var(--muted);
  font-size: 12px;
}
```

- [ ] **Step 5: Testar localmente no browser**

Abrir `index.html` localmente (ou servidor local), confirmar no console que `carregarStravaCard()` roda sem erro e que o card aparece com dados reais do endpoint `strava-stats`. Testar também o caso de falha (desligar rede/endpoint) e confirmar que o card não aparece e nada quebra no resto do app.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html styles.css
git commit -m "feat: card de atividades recentes do Strava no painel"
```

---

### Task 8: Deploy e verificação em produção

**Files:** nenhum novo — usa `deploy_metas.py` já existente.

**Interfaces:** nenhuma nova; task de verificação final.

- [ ] **Step 1: Rodar o deploy**

Invocar a skill `deploy-metas` (ou rodar `python C:\Users\Administrador\deploy_metas.py` diretamente) para subir `app.js`, `index.html`, `styles.css` atualizados para `/var/www/metas/`.

- [ ] **Step 2: Verificar visualmente em produção**

Abrir `https://metas.campostecnologia.cloud`, logar com `ti@gruporessonar.com.br`, confirmar que o card Strava aparece com as últimas atividades reais.

- [ ] **Step 3: Teste end-to-end final**

Registrar uma atividade real no Strava (tipo que bate com um hábito pendente do dia, ex: treino de força), esperar alguns segundos, recarregar `https://metas.campostecnologia.cloud` e confirmar que o hábito correspondente aparece marcado como concluído.
