# Integração Google Health API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar a conta Google (Health Connect) do usuário ao Minhas Metas e mostrar automaticamente passos + km do dia num card do dashboard, via polling periódico (sem webhook).

**Architecture:** Botão no app redireciona pro OAuth do Google. Um workflow N8N recebe o callback, troca o código por tokens e grava em `google_health_connections` (Supabase). Um segundo workflow N8N roda em cron, varre todas as conexões, renova tokens expirados, busca o total diário (`dailyRollUp`) na Google Health API e grava em `google_health_daily`. O app lê `google_health_daily` do dia via Supabase e mostra num card. Client Secret e chave de serviço do Supabase ficam só no N8N (variáveis de ambiente do servidor), nunca no frontend.

**Tech Stack:** JS vanilla (frontend), N8N Workflow SDK (`@n8n/workflow-sdk`, via `create_workflow_from_code`/`update_workflow`), Supabase (Postgres + REST/PostgREST), Google Health API (`health.googleapis.com`) + OAuth2 padrão do Google.

## Global Constraints

- Client Secret do Google e Service Role Key do Supabase NUNCA aparecem em código commitado — só como variáveis de ambiente do N8N (`$env.GOOGLE_HEALTH_CLIENT_SECRET`, `$env.SUPABASE_SERVICE_ROLE_KEY`), configuradas manualmente no servidor.
- Client ID do Google é público — pode ficar hardcoded no frontend.
- Escopo OAuth: `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` (confirmado ao vivo no console do Google Cloud em 2026-08-10 — não é o mesmo formato usado no Strava, não confundir).
- Não existe framework de testes no projeto (vanilla JS sem build) — verificação é manual, via `node --check` para sintaxe e teste visual no navegador, seguindo o padrão do resto do projeto.
- Spec de referência: `docs/superpowers/specs/2026-08-10-google-health-integration-design.md`.
- Antes de escrever qualquer node N8N que chame `health.googleapis.com` (endpoint `dailyRollUp`, formato de `google_health_user_id`), confirmar o shape exato via chamada de teste real (ex: `test_workflow` com um HTTP Request node apontado pro endpoint, usando um access_token de teste) — a documentação pública não expõe um exemplo completo, então não adivinhar o formato de request/response.
- **Sempre incrementar a versão do cache em `sw.js`** (`CACHE_NAME`) no commit que for junto do próximo deploy — lição da integração do Strava, PWA instalado não pega `app.js` novo sem isso.

---

## Task 1: Migration Supabase — `google_health_connections` e `google_health_daily`

**Files:**
- Create: `supabase/migrations/2026-08-10_google_health.sql`

**Interfaces:**
- Produces: tabelas `google_health_connections` (PK `user_id`) e `google_health_daily` (PK `id`, unique `(user_id, metric_date)`), usadas pelas Tasks 4-6 (N8N) e Task 3 (frontend).

- [ ] **Step 1: Escrever a migration**

```sql
-- Integração Google Health API (Google Fit) — conexão + métricas diárias.

create table if not exists public.google_health_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_health_user_id text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_health_connections_ghuid_idx
  on public.google_health_connections (google_health_user_id);

create table if not exists public.google_health_daily (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_date date not null,
  steps integer,
  distance_meters numeric,
  updated_at timestamptz not null default now(),
  unique (user_id, metric_date)
);

create index if not exists google_health_daily_user_date_idx
  on public.google_health_daily (user_id, metric_date desc);

alter table public.google_health_connections enable row level security;
alter table public.google_health_daily enable row level security;

drop policy if exists "select own google health connection" on public.google_health_connections;
create policy "select own google health connection" on public.google_health_connections
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "select own google health daily" on public.google_health_daily;
create policy "select own google health daily" on public.google_health_daily
  for select to authenticated using (auth.uid() = user_id);
```

Nomes de policy escolhidos pra bater com o padrão real já confirmado em `strava_connections`/`strava_activities` (`select own strava connection` / `select own strava activities`, `cmd=SELECT`, `roles={authenticated}`, `qual=(auth.uid() = user_id)`).

- [ ] **Step 2: Aplicar a migration via Supabase MCP**

Chamar `mcp__claude_ai_Supabase__apply_migration` com `project_id: tpcawmrblanpkgoqisgw`, `name: google_health_integration`, e o SQL acima.

- [ ] **Step 3: Confirmar**

Chamar `mcp__claude_ai_Supabase__list_tables` (verbose) e conferir que `google_health_connections`/`google_health_daily` aparecem com as colunas e policies esperadas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-08-10_google_health.sql
git commit -m "feat: adiciona tabelas de integracao Google Health API"
```

---

## Task 2: Botão "Conectar com Google Fit" no menu do usuário

**Files:**
- Modify: `index.html:105` (dropdown do usuário, logo após o botão do Strava)
- Modify: `app.js` (nova função `conectarGoogleFit`, perto de `conectarStrava` em `app.js:1737-1748`)

**Interfaces:**
- Produces: `conectarGoogleFit()` — função global, chamada via `onclick`. Usa `currentUser.id`, `showToast()`, `openAuthModal()`, `trackEvent()` (todas já existentes).

- [ ] **Step 1: Adicionar o botão no dropdown**

Em `index.html:105`, logo após o botão do Strava:

```html
<button class="user-dropdown-btn" onclick="conectarStrava()">🏃 Conectar com Strava</button>
<button class="user-dropdown-btn" onclick="conectarGoogleFit()">👣 Conectar com Google Fit</button>
```

- [ ] **Step 2: Adicionar `conectarGoogleFit()` em app.js**

Logo após o fechamento de `conectarStrava()` (`app.js:1748`, antes do comentário `// Verificar retorno do Stripe` na linha 1750):

```js
  function conectarGoogleFit() {
    if (!currentUser) {
      showToast('Faça login antes de conectar o Google Fit');
      openAuthModal();
      return;
    }
    const redirectUri = encodeURIComponent('https://n8n.campostecnologia.cloud/webhook/google-health-oauth-callback');
    const state = encodeURIComponent(currentUser.id);
    const scope = encodeURIComponent('https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly');
    const clientId = '405789650795-gb49hf9qhoo99fp67v2958h45t1s4hnq.apps.googleusercontent.com';
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&access_type=offline&prompt=consent&scope=${scope}&state=${state}`;
    trackEvent('google_fit_connect_start', {});
    window.location.href = url;
  }

```

Nota: `access_type=offline&prompt=consent` é obrigatório — sem isso o Google não devolve `refresh_token` em reconexões futuras (diferente do Strava, que sempre devolve).

- [ ] **Step 3: Verificar sintaxe**

Run: `node --check "C:\Users\Administrador\Desktop\PROJETOS\Projeto app metas\app.js"`
Expected: nenhuma saída.

- [ ] **Step 4: Teste visual**

Abrir o app, logar, abrir o menu do usuário, confirmar que "👣 Conectar com Google Fit" aparece logo abaixo do botão do Strava. Clicar deve redirecionar pra uma URL `accounts.google.com/o/oauth2/v2/auth?client_id=405789650795-...`.

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "feat: adiciona botao de conexao com Google Fit"
```

---

## Task 3: Tratar retorno do OAuth + card "Google Fit hoje" no dashboard

**Files:**
- Modify: `index.html` (nova seção do dashboard, logo após a seção `strava-km-section`, `index.html:241-251`)
- Modify: `app.js` (novo `checkGoogleFitReturn()` perto de `checkStravaReturn()` em `app.js:1811-1823`; novo `renderGoogleFitCard()` perto de `renderStravaCard()` em `app.js:884-901`; chamadas em `app.js:809` e `app.js:2808`)

**Interfaces:**
- Consumes: cliente Supabase `sb`, `currentUser.id`, `todayStr()`, `showToast()`, `trackEvent()`.
- Produces: `checkGoogleFitReturn()`, `renderGoogleFitCard()` — chamadas nos mesmos pontos onde as equivalentes do Strava já são chamadas.

- [ ] **Step 1: Adicionar a seção HTML do card**

Em `index.html`, logo após o fim da seção `strava-km-section` (fecha em `index.html:251`):

```html
      <div class="dash-section" id="googlefit-section" style="display:none">
        <div class="dash-title">👣 Google Fit hoje</div>
        <div class="streak-card">
          <div class="streak-num" id="googlefit-steps-num">0</div>
          <div class="streak-info">
            <div class="streak-label">passos hoje</div>
            <div class="streak-sub" id="googlefit-km-sub">0 km percorridos</div>
          </div>
          <div class="streak-fire">👣</div>
        </div>
      </div>

```

Reaproveita `.streak-card`/`.dash-section` já existentes — sem CSS novo.

- [ ] **Step 2: Adicionar `checkGoogleFitReturn()` em app.js**

Logo após o fechamento de `checkStravaReturn()` (`app.js:1823`, antes do comentário `// ── FINANÇAS ──` na linha 1825):

```js
  // Verificar retorno do Google Fit (state = user_id, setado pelo N8N no redirect)
  function checkGoogleFitReturn() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('googlefit');
    if (status === 'conectado') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('✅ Google Fit conectado! Seus passos vão aparecer no dashboard.');
      trackEvent('google_fit_connected', {});
      if (typeof renderGoogleFitCard === 'function') renderGoogleFitCard();
    } else if (status === 'cancelado') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('Conexão com o Google Fit cancelada.');
    } else if (status === 'erro') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('⚠️ Não foi possível conectar o Google Fit. Tente novamente.');
    }
  }

```

- [ ] **Step 3: Chamar `checkGoogleFitReturn()` no fluxo de login**

Em `app.js:2808`, logo após `checkStravaReturn();`:

```js
    checkStravaReturn();
    checkGoogleFitReturn();
```

- [ ] **Step 4: Adicionar `renderGoogleFitCard()` em app.js**

Logo após o fechamento de `renderStravaCard()` (`app.js:901`):

```js
  async function renderGoogleFitCard() {
    const section = document.getElementById('googlefit-section');
    if (!section || !currentUser) return;
    try {
      const { data: conn, error: connError } = await sb.from('google_health_connections').select('user_id').eq('user_id', currentUser.id).maybeSingle();
      if (connError) console.warn('renderGoogleFitCard:', connError);
      if (!conn) { section.style.display = 'none'; return; }
      const hoje = todayStr();
      const { data: metrica, error: metricaError } = await sb.from('google_health_daily').select('steps, distance_meters').eq('user_id', currentUser.id).eq('metric_date', hoje).maybeSingle();
      if (metricaError) console.warn('renderGoogleFitCard:', metricaError);
      const steps = (metrica && metrica.steps) || 0;
      const km = ((metrica && metrica.distance_meters || 0) / 1000).toFixed(1);
      document.getElementById('googlefit-steps-num').textContent = steps.toLocaleString('pt-BR');
      document.getElementById('googlefit-km-sub').textContent = km + ' km percorridos';
      section.style.display = 'block';
    } catch (e) {
      console.warn('renderGoogleFitCard:', e);
    }
  }

```

- [ ] **Step 5: Chamar `renderGoogleFitCard()` a partir de `renderDash()`**

Em `app.js:809`, logo após `renderStravaCard();`:

```js
    renderStravaCard();
    renderGoogleFitCard();
```

- [ ] **Step 6: Verificar sintaxe**

Run: `node --check "C:\Users\Administrador\Desktop\PROJETOS\Projeto app metas\app.js"`
Expected: nenhuma saída.

- [ ] **Step 7: Teste manual**

Navegar pra `<url-do-app>/?googlefit=conectado` (logado) e confirmar toast + URL limpa. Repetir com `?googlefit=cancelado` e `?googlefit=erro`. Ir na aba "Progresso" e confirmar que a seção "👣 Google Fit hoje" fica oculta (sem conexão ainda).

- [ ] **Step 8: Commit**

```bash
git add index.html app.js
git commit -m "feat: trata retorno do OAuth e adiciona card do Google Fit no dashboard"
```

---

## Task 4: N8N Workflow — Google Health OAuth Callback

**Files:** nenhum arquivo local — workflow criado via N8N MCP.

**Interfaces:**
- Consumes: variáveis de ambiente `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` no container N8N.
- Produces: endpoint público `GET https://n8n.campostecnologia.cloud/webhook/google-health-oauth-callback` — é o `redirect_uri` já usado por `conectarGoogleFit()` (Task 2).

- [ ] **Step 1: Configurar variáveis de ambiente no container N8N (manual, no servidor — feito pelo Marcus, SSH bloqueado pro agente)**

Valores vêm de `projects/minhas-metas/.env`:

```
GOOGLE_HEALTH_CLIENT_ID=<GOOGLE_HEALTH_CLIENT_ID do .env>
GOOGLE_HEALTH_CLIENT_SECRET=<GOOGLE_HEALTH_CLIENT_SECRET do .env>
```

(`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` já devem estar configuradas desde a integração do Strava — confirmar com `docker exec n8n printenv | grep SUPABASE` antes de assumir.)

- [ ] **Step 2: Buscar referência do SDK e node types**

Chamar `mcp__claude_ai_n8n__get_sdk_reference` (`patterns`, `expressions`) e `mcp__claude_ai_n8n__get_node_types` pra `n8n-nodes-base.webhook`, `n8n-nodes-base.httpRequest`, `n8n-nodes-base.if`, `n8n-nodes-base.respondToWebhook` — confirmar que as versões/parâmetros usados no workflow do Strava (`qfuonnXY1pL79nUM`) ainda são os atuais antes de reescrever o padrão.

- [ ] **Step 3: Criar o workflow via `create_workflow_from_code`**

Estrutura (mirror do "Strava - OAuth Callback", trocando o provedor):

```javascript
import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const oauthWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Google Health OAuth Callback',
    parameters: {
      httpMethod: 'GET',
      path: 'google-health-oauth-callback',
      responseMode: 'responseNode',
      options: {}
    },
    output: { headers: {}, params: {}, query: { code: 'abc123', scope: 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly', state: 'user-uuid-example' }, body: {} }
  }
});

const checkError = ifElse({
  version: 2.3,
  config: {
    name: 'Usuario cancelou?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.query.error }}'), operator: { type: 'string', operation: 'exists' }, rightValue: '' }],
        combinator: 'and'
      }
    }
  }
});

const respondCancelado = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Redirect Cancelado',
    parameters: { respondWith: 'redirect', redirectURL: 'https://metas.campostecnologia.cloud/?googlefit=cancelado', options: {} }
  }
});

const trocarToken = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Trocar code por token',
    parameters: {
      method: 'POST',
      url: 'https://oauth2.googleapis.com/token',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { "client_id": $env.GOOGLE_HEALTH_CLIENT_ID, "client_secret": $env.GOOGLE_HEALTH_CLIENT_SECRET, "code": $json.query.code, "redirect_uri": "https://n8n.campostecnologia.cloud/webhook/google-health-oauth-callback", "grant_type": "authorization_code" } }}'),
      options: {}
    },
    onError: 'continueErrorOutput',
    output: { access_token: 'access-example', refresh_token: 'refresh-example', expires_in: 3599, scope: 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly', token_type: 'Bearer' }
  }
});

// NOTA DE IMPLEMENTAÇÃO: confirmar se a resposta do token exchange do Google já contém
// algum identificador de usuário utilizável como google_health_user_id, ou se é preciso
// uma chamada extra (ex: a um endpoint de perfil da Health API, ou decodificar um id_token
// se `openid` estiver no escopo). NÃO assumir — testar contra a API real com um token de
// teste antes de finalizar este node. Se precisar de node extra "Buscar healthUserId",
// inserir aqui entre trocarToken e gravarConexao, com onError: continueErrorOutput também.

const gravarConexao = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Gravar google_health_connections',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.SUPABASE_URL }}/rest/v1/google_health_connections?on_conflict=user_id'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('{{ "Bearer " + $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ [{ "user_id": $("Google Health OAuth Callback").item.json.query.state, "google_health_user_id": null, "access_token": $json.access_token, "refresh_token": $json.refresh_token, "expires_at": new Date(Date.now() + $json.expires_in * 1000).toISOString(), "scope": $json.scope }] }}'),
      options: {}
    },
    onError: 'continueErrorOutput',
    output: {}
  }
});

const respondErro = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Redirect Erro',
    parameters: { respondWith: 'redirect', redirectURL: 'https://metas.campostecnologia.cloud/?googlefit=erro', options: {} }
  }
});

const respondConectado = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Redirect Conectado',
    parameters: { respondWith: 'redirect', redirectURL: 'https://metas.campostecnologia.cloud/?googlefit=conectado', options: {} }
  }
});

export default workflow('google-health-oauth-callback', 'Google Health - OAuth Callback')
  .add(oauthWebhook)
  .to(checkError
    .onTrue(respondCancelado)
    .onFalse(trocarToken.to(gravarConexao.to(respondConectado))));
```

**Atenção**: `trocarToken` e `gravarConexao` precisam de branch de erro (`onError: continueErrorOutput`) conectado a `respondErro`, igual ao padrão já usado no Strava (`qfuonnXY1pL79nUM`, fix da Task 4 daquele plano) — o rascunho acima marca `onError` no `config` do node como referência de intenção, mas a forma real de expressar o output de erro (segunda branch de conexão) deve ser confirmada via `get_node_types`/`get_sdk_reference` no momento da implementação e as conexões de erro devem ser adicionadas explicitamente ao `workflow()` (ver como foi feito em `qfuonnXY1pL79nUM` como referência direta — consultar `mcp__claude_ai_n8n__get_workflow_details` nesse workflow ID pra ver o padrão exato já validado em produção).

- [ ] **Step 4: Adicionar branches de erro explícitas**

Usando `mcp__claude_ai_n8n__get_workflow_details` no workflow `qfuonnXY1pL79nUM` como referência, replicar exatamente o padrão de `onError: continueErrorOutput` + conexão do output de erro (índice 1) pra `respondErro`, nos dois nodes HTTP Request.

- [ ] **Step 5: Publicar**

Chamar `mcp__claude_ai_n8n__publish_workflow`.

- [ ] **Step 6: Testar com dados fixos**

`mcp__claude_ai_n8n__prepare_test_pin_data` + `mcp__claude_ai_n8n__test_workflow` simulando: cancelamento (`error=access_denied`), sucesso (pinar a resposta do token exchange), e falha (forçar erro no node de troca de token) — confirmar que os três caminhos terminam em redirect e nunca deixam a execução travada.

- [ ] **Step 7: Registrar no spec e commitar**

Atualizar `docs/superpowers/specs/2026-08-10-google-health-integration-design.md` com o ID/nome do workflow criado.

```bash
git add docs/superpowers/specs/2026-08-10-google-health-integration-design.md
git commit -m "docs: registra workflow N8N de OAuth callback do Google Health"
```

---

## Task 5: N8N Workflow — Google Health Poll Diário

**Files:** nenhum arquivo local — workflow criado via N8N MCP.

**Interfaces:**
- Consumes: mesmas variáveis de ambiente da Task 4.
- Produces: atualização periódica de `google_health_daily` pra todos os usuários conectados.

- [ ] **Step 1: Confirmar o shape real do endpoint `dailyRollUp` antes de escrever o node final**

Este é o item mais incerto do plano. Antes de escrever o `HTTP Request` node final:
1. Usar um access_token de teste (da conexão criada na Task 4, testada manualmente por um humano) pra fazer uma chamada real (via `test_workflow` com um HTTP Request node solto, ou instruindo o humano a testar com `curl`) contra `POST https://health.googleapis.com/v4/users/{healthUserId}/dataTypes/{dataType}/dataPoints:dailyRollUp` (path a confirmar — a doc pública dá o padrão do recurso, não um exemplo completo de request/response).
2. Confirmar: o `dataType` correto pra passos e pra distância (provavelmente dois valores diferentes, ex algo como `steps` e `distance` sob o namespace da Health API — confirmar nome exato), o formato do body de request (intervalo de datas), e os nomes de campo da resposta (onde exatamente vem o total de passos e a distância em metros).
3. Só depois de confirmado, escrever o `HTTP Request` node final com esses valores reais — não adivinhar.

- [ ] **Step 2: Criar o workflow via `create_workflow_from_code`**

Estrutura:

```javascript
import { workflow, node, trigger, expr } from '@n8n/workflow-sdk';

const cronTrigger = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.2,
  config: {
    name: 'A cada 4 horas',
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 4 }] } }
  }
});

const buscarConexoes = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Buscar google_health_connections',
    parameters: {
      method: 'GET',
      url: expr('{{ $env.SUPABASE_URL }}/rest/v1/google_health_connections'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('{{ "Bearer " + $env.SUPABASE_SERVICE_ROLE_KEY }}') }
        ]
      },
      options: {}
    },
    output: [{ user_id: 'user-uuid-example', google_health_user_id: 'ghu-example', access_token: 'access-example', refresh_token: 'refresh-example', expires_at: '2026-08-10T20:00:00.000Z' }]
  }
});

// A partir daqui, iterar por conexão (Split In Batches ou execução item-a-item nativa do n8n,
// já que o n8n processa múltiplos items automaticamente por node) — para cada item:

const precisaRenovar = /* IF node: new Date(item.expires_at).getTime() < Date.now(), mesmo padrão do "Avaliar conexao"/"Token expirado?" do workflow de webhook do Strava (DhnUyFUpBM7UmQH8) — replicar a lógica já validada em produção, incluindo o cuidado de não usar array-indexing sem checar o shape (bug real corrigido na Task 5 do plano do Strava: `Array.isArray(raw) ? raw[0] : raw`) */;

const renovarToken = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Renovar token',
    parameters: {
      method: 'POST',
      url: 'https://oauth2.googleapis.com/token',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { "client_id": $env.GOOGLE_HEALTH_CLIENT_ID, "client_secret": $env.GOOGLE_HEALTH_CLIENT_SECRET, "refresh_token": $json.refresh_token, "grant_type": "refresh_token" } }}'),
      options: {}
    },
    onError: 'continueErrorOutput'
    // ATENÇÃO: resposta de refresh do Google pode NÃO trazer um novo refresh_token —
    // ao atualizar a linha em google_health_connections, escrever access_token/expires_at
    // sempre, mas só sobrescrever refresh_token se `$json.refresh_token` estiver presente
    // na resposta (nunca gravar null/vazio por cima do valor existente).
  }
});

const atualizarConexao = node({ /* PATCH google_health_connections?user_id=eq.<id>, mesmo padrão do Strava */ });

const buscarDailyRollup = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Buscar dailyRollUp',
    parameters: {
      method: 'POST',
      url: '/* CONFIRMAR path exato no Step 1 antes de finalizar */',
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Authorization', value: expr('{{ "Bearer " + $json.access_token }}') }] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '/* CONFIRMAR shape exato no Step 1 antes de finalizar (intervalo de hoje) */',
      options: {}
    },
    onError: 'continueErrorOutput'
  }
});

const gravarDiario = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Gravar google_health_daily',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.SUPABASE_URL }}/rest/v1/google_health_daily?on_conflict=user_id,metric_date'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('{{ "Bearer " + $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: '/* mapear steps/distance_meters da resposta do dailyRollUp, confirmados no Step 1 */',
      options: {}
    },
    onError: 'continueErrorOutput'
  }
});

export default workflow('google-health-poll-diario', 'Google Health - Poll Diário')
  .add(cronTrigger)
  .to(buscarConexoes.to(/* precisaRenovar */ null /* completar conforme Step 1/2 */));
```

Este workflow tem mais lacunas conscientes que o de OAuth callback (Task 4), propositalmente — as partes marcadas como "CONFIRMAR" dependem do resultado do Step 1 (chamada real contra a API), que não pode ser antecipado sem acesso à API ao vivo com um token de teste real. Não preencher com valores inventados.

- [ ] **Step 3: Ground nodes com `get_node_types` e validar com `test_workflow`**

Usar dados fixos simulando 1-2 conexões (uma com token válido, uma com token expirado) pra confirmar que o branch de renovação funciona e que o branch sem renovação também chega em `buscarDailyRollup`.

- [ ] **Step 4: Publicar**

Chamar `mcp__claude_ai_n8n__publish_workflow`.

- [ ] **Step 5: Registrar no spec e commitar**

```bash
git add docs/superpowers/specs/2026-08-10-google-health-integration-design.md
git commit -m "docs: registra workflow N8N de poll diario do Google Health"
```

---

## Task 6: Verificação ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: Conectar conta de teste**

No app (depois de deploy — ver nota abaixo), conectar a conta Google de teste cadastrada no console (Task de setup manual, já feita em 2026-08-10). Confirmar linha em `google_health_connections` via Supabase MCP.

- [ ] **Step 2: Rodar o poll manualmente**

Executar o workflow "Google Health - Poll Diário" manualmente (não esperar o cron) via `test_workflow` ou execução direta, usando a conexão real criada no Step 1.

- [ ] **Step 3: Confirmar chegada em `google_health_daily`**

```sql
select * from google_health_daily where user_id = '<seu-user-id>' order by updated_at desc limit 1;
```

- [ ] **Step 4: Confirmar card no app**

Recarregar o dashboard — o card "👣 Google Fit hoje" deve mostrar os passos/km reais do dia.

- [ ] **Step 5: Testar renovação de token**

Forçar `expires_at` pro passado numa linha de teste, rodar o poll de novo, confirmar que `access_token`/`expires_at` mudaram e que `refresh_token` não foi sobrescrito com vazio.

- [ ] **Step 6: Deploy**

Seguir o fluxo `deploy-metas` (revisão → commit → `deploy_metas.py` → smoke check visual), lembrando de incrementar `CACHE_NAME` em `sw.js`.
