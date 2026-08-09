# Integração Strava Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar a conta Strava do usuário ao Minhas Metas e mostrar automaticamente a quilometragem percorrida no dia num card do dashboard.

**Architecture:** Botão no app redireciona pro OAuth do Strava. Um workflow N8N recebe o callback, troca o código por tokens e grava em `strava_connections` (Supabase). Um segundo workflow N8N recebe o webhook de atividades do Strava, busca o detalhe na API e grava em `strava_activities`. O app lê `strava_activities` do dia via Supabase e mostra num card. Client Secret e chave de serviço do Supabase ficam só no N8N (variáveis de ambiente do servidor), nunca no frontend.

**Tech Stack:** JS vanilla (frontend), N8N Workflow SDK (`@n8n/workflow-sdk`, via `create_workflow_from_code`), Supabase (Postgres + REST/PostgREST), Strava API v3.

## Global Constraints

- Client Secret do Strava e Service Role Key do Supabase NUNCA aparecem em código commitado — só como variáveis de ambiente do N8N (`$env.STRAVA_CLIENT_SECRET`, `$env.SUPABASE_SERVICE_ROLE_KEY`), configuradas manualmente no servidor.
- Client ID do Strava (`270844`) é público — pode ficar hardcoded no frontend.
- Tabelas `strava_connections` e `strava_activities` já existem no Supabase (migration `20260727104942_strava_integration`) — este plano NÃO cria nem altera schema.
- Não existe framework de testes no projeto (vanilla JS sem build) — verificação é manual, via `node --check` para sintaxe e teste visual no navegador, seguindo o padrão do resto do projeto.
- Spec de referência: `docs/superpowers/specs/2026-08-09-strava-integration-design.md`.

---

## Task 1: Botão "Conectar com Strava" no menu do usuário

**Files:**
- Modify: `index.html:103-105` (dropdown do usuário)
- Modify: `app.js` (nova função `conectarStrava`, perto de `iniciarCheckout` em `app.js:1700`)

**Interfaces:**
- Produces: `conectarStrava()` — função global, chamada via `onclick` no HTML. Usa `currentUser.id` (já existe, `app.js:1263`) e `showToast()` (já existe, `app.js:3336`).

- [ ] **Step 1: Adicionar o botão no dropdown**

Em `index.html`, entre o botão "☁️ Sincronizar" e o botão "Sair" (linhas 103-105), adicionar:

```html
<button class="user-dropdown-btn" onclick="conectarStrava()">🏃 Conectar com Strava</button>
```

O bloco completo (`index.html:103-105`) deve ficar:

```html
<button class="user-dropdown-btn" onclick="openPerfilModal()">👤 Editar perfil</button>
<button class="user-dropdown-btn" onclick="syncNow()">☁️ Sincronizar</button>
<button class="user-dropdown-btn" onclick="conectarStrava()">🏃 Conectar com Strava</button>
<button class="user-dropdown-btn danger" onclick="logoutUser()">Sair</button>
```

- [ ] **Step 2: Adicionar `conectarStrava()` em app.js**

Logo após a função `iniciarCheckout` (que termina em `app.js:1715`, antes de `checkStripeReturn` na linha 1718), adicionar:

```js
  function conectarStrava() {
    if (!currentUser) {
      showToast('Faça login antes de conectar o Strava');
      openAuthModal();
      return;
    }
    const redirectUri = encodeURIComponent('https://n8n.campostecnologia.cloud/webhook/strava-oauth-callback');
    const state = encodeURIComponent(currentUser.id);
    const url = `https://www.strava.com/oauth/authorize?client_id=270844&redirect_uri=${redirectUri}&response_type=code&approval_prompt=auto&scope=activity:read&state=${state}`;
    trackEvent('strava_connect_start', {});
    window.location.href = url;
  }

```

- [ ] **Step 3: Verificar sintaxe**

Run: `node --check "C:\Users\Administrador\Desktop\PROJETOS\Projeto app metas\app.js"`
Expected: nenhuma saída (sem erro de sintaxe).

- [ ] **Step 4: Teste visual**

Abrir `index.html` num servidor local (ex: `npx serve` na pasta do projeto, ou abrir direto no navegador), logar, abrir o menu do usuário (avatar no topo) e confirmar que o botão "🏃 Conectar com Strava" aparece entre "Sincronizar" e "Sair". Clicar nele deve redirecionar para uma URL `strava.com/oauth/authorize?client_id=270844&...` (a autorização em si vai falhar até o Workflow 1 existir — normal nesta etapa).

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "feat: adiciona botão de conexão com Strava"
```

---

## Task 2: Tratar retorno do OAuth (toast + limpeza da URL)

**Files:**
- Modify: `app.js` (nova função `checkStravaReturn`, chamada em `onUserLoggedIn`)

**Interfaces:**
- Consumes: `showToast(msg, duration)` (`app.js:3336`), `renderStravaCard()` (produzida na Task 3 — se a Task 3 ainda não rodou, deixar a chamada comentada como `// renderStravaCard();` e descomentar ao final da Task 3, ver Step 3 abaixo).
- Produces: `checkStravaReturn()` — chamada em `onUserLoggedIn()`.

- [ ] **Step 1: Adicionar `checkStravaReturn()` em app.js**

Logo após o fim de `checkStripeReturn()` (`app.js:1718-1736`, fecha na linha 1736), adicionar:

```js
  // Verificar retorno do Strava (state = user_id, setado pelo N8N no redirect)
  function checkStravaReturn() {
    const params = new URLSearchParams(window.location.search);
    const stravaStatus = params.get('strava');
    if (stravaStatus === 'conectado') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('✅ Strava conectado! Suas atividades vão aparecer no dashboard.');
      trackEvent('strava_connected', {});
      if (typeof renderStravaCard === 'function') renderStravaCard();
    } else if (stravaStatus === 'cancelado') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('Conexão com o Strava cancelada.');
    }
  }
```

Nota: a checagem `typeof renderStravaCard === 'function'` evita erro caso a Task 3 seja executada em outra sessão/ordem diferente — mas como as tasks deste plano rodam em sequência, `renderStravaCard` já vai existir quando este código rodar de verdade.

- [ ] **Step 2: Chamar `checkStravaReturn()` no fluxo de login**

Em `app.js:2760`, logo após `checkStripeReturn();` dentro de `onUserLoggedIn()`, adicionar a chamada:

```js
    checkStripeReturn();
    checkStravaReturn();
```

- [ ] **Step 3: Verificar sintaxe**

Run: `node --check "C:\Users\Administrador\Desktop\PROJETOS\Projeto app metas\app.js"`
Expected: nenhuma saída.

- [ ] **Step 4: Teste manual**

No navegador (app já logado), navegar manualmente para `<url-do-app>/?strava=conectado` e confirmar que aparece o toast "✅ Strava conectado!..." e a URL volta a ficar limpa (sem `?strava=conectado`). Repetir com `?strava=cancelado` e confirmar o toast correspondente.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: trata retorno do OAuth do Strava com toast de confirmacao"
```

---

## Task 3: Card "Strava hoje" no dashboard

**Files:**
- Modify: `index.html:225-238` (dashboard, entre a seção "Sequência atual" e "Resumo")
- Modify: `app.js:805-808` (`renderDash()`) e novo `renderStravaCard()`

**Interfaces:**
- Consumes: cliente Supabase `sb` (`app.js:2615`), `currentUser.id` (`app.js:1263`), `todayStr()` (`app.js:5`).
- Produces: `renderStravaCard()` — função global assíncrona, sem parâmetros, chamada em `renderDash()` (fire-and-forget) e em `checkStravaReturn()` (Task 2).

- [ ] **Step 1: Adicionar a seção HTML do card**

Em `index.html`, entre o fim da seção "🔥 Sequência atual" (fecha em `index.html:238`) e o início da seção "📈 Resumo" (`index.html:240`), adicionar:

```html
      <div class="dash-section" id="strava-km-section" style="display:none">
        <div class="dash-title">🏃 Strava hoje</div>
        <div class="streak-card">
          <div class="streak-num" id="strava-km-num">0</div>
          <div class="streak-info">
            <div class="streak-label">km percorridos hoje</div>
            <div class="streak-sub">Sincronizado automaticamente do Strava</div>
          </div>
          <div class="streak-fire">🏃</div>
        </div>
      </div>

```

Reaproveita a classe `.streak-card` já existente (`styles.css:523`) — sem CSS novo.

- [ ] **Step 2: Adicionar `renderStravaCard()` em app.js**

Logo após o fechamento da função `renderDash()` (localizar o `}` que fecha a função iniciada em `app.js:805` — ela é longa, buscar o próximo `function` declarado depois dela e inserir antes dele), adicionar:

```js
  async function renderStravaCard() {
    const section = document.getElementById('strava-km-section');
    if (!section || !currentUser) return;
    try {
      const { data: conn } = await sb.from('strava_connections').select('user_id').eq('user_id', currentUser.id).maybeSingle();
      if (!conn) { section.style.display = 'none'; return; }
      const hoje = todayStr();
      const { data: atividades } = await sb.from('strava_activities').select('distance').eq('user_id', currentUser.id).eq('activity_date', hoje);
      const totalMetros = (atividades || []).reduce((soma, a) => soma + (a.distance || 0), 0);
      const km = (totalMetros / 1000).toFixed(1);
      document.getElementById('strava-km-num').textContent = km;
      section.style.display = 'block';
    } catch (e) {
      console.warn('renderStravaCard:', e);
    }
  }
```

- [ ] **Step 3: Chamar `renderStravaCard()` a partir de `renderDash()`**

Em `app.js:808`, logo após `renderHumorCorr();`, adicionar (sem `await` — `renderDash()` é síncrona e este card não deve bloquear o resto do render):

```js
    renderHumorCorr();
    renderStravaCard();
```

- [ ] **Step 4: Verificar sintaxe**

Run: `node --check "C:\Users\Administrador\Desktop\PROJETOS\Projeto app metas\app.js"`
Expected: nenhuma saída.

- [ ] **Step 5: Teste manual (sem conexão Strava ainda)**

Abrir o app logado, ir na aba do dashboard. Como `strava_connections` ainda não tem linha pra esse usuário, o card "🏃 Strava hoje" deve ficar **oculto** (não deve aparecer nem vazio). Confirmar no DevTools que `#strava-km-section` tem `display:none`.

- [ ] **Step 6: Commit**

```bash
git add index.html app.js
git commit -m "feat: adiciona card de quilometragem do Strava no dashboard"
```

---

## Task 4: N8N Workflow 1 — OAuth callback do Strava

**Files:**
- Nenhum arquivo local — workflow criado via N8N MCP (`mcp__claude_ai_n8n__create_workflow_from_code`), instância `n8n.campostecnologia.cloud`.

**Interfaces:**
- Consumes: variáveis de ambiente `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` no container N8N (configuradas no Step 1).
- Produces: endpoint público `GET https://n8n.campostecnologia.cloud/webhook/strava-oauth-callback` — é o `redirect_uri` já usado por `conectarStrava()` (Task 1) e é o que o N8N Workflow 2 (Task 5) vai referenciar como domínio do app pra redirect final.

- [ ] **Step 1: Configurar variáveis de ambiente no container N8N (manual, no servidor)**

Este passo é feito por você diretamente no servidor `2.24.99.6` (não pelo agente — envolve segredos que não podem ir pro git nem pra este plano). Os valores vêm de `projects/minhas-metas/.env` (Client ID/Secret do Strava) e do painel do Supabase, projeto "Metas" (`tpcawmrblanpkgoqisgw`) → Settings → API → `service_role` key.

Se o N8N roda via `docker-compose` (mais comum pra stacks assim), localizar o arquivo compose (geralmente `/root/docker-compose.yml` ou similar) e adicionar em `services.n8n.environment`:

```yaml
    environment:
      - STRAVA_CLIENT_ID=270844
      - STRAVA_CLIENT_SECRET=<valor de projects/minhas-metas/.env>
      - SUPABASE_URL=https://tpcawmrblanpkgoqisgw.supabase.co
      - SUPABASE_SERVICE_ROLE_KEY=<service_role key do painel Supabase>
```

Depois: `docker compose up -d n8n` (recria o container com as novas variáveis).

Se o N8N roda via `docker run` direto (sem compose), adicionar `-e STRAVA_CLIENT_ID=270844 -e STRAVA_CLIENT_SECRET=... -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=...` ao comando que recria o container `n8n` (ver `docker inspect n8n` pra reconstruir o comando original com as envs novas).

Confirmar que funcionou: `docker exec n8n printenv | grep STRAVA` deve listar as duas variáveis.

- [ ] **Step 2: Buscar referência do SDK do N8N**

Chamar `mcp__claude_ai_n8n__get_sdk_reference` com `section: "patterns"` e `section: "expressions"` antes de escrever/ajustar qualquer código — os padrões de `workflow()`, `trigger()`, `node()`, `expr()` podem ter mudado desde que este plano foi escrito.

- [ ] **Step 3: Criar o workflow via `create_workflow_from_code`**

Chamar `mcp__claude_ai_n8n__create_workflow_from_code` com o código abaixo (ajustar tipos/versões de node caso `get_sdk_reference`/`get_node_types` no momento da execução indiquem versões diferentes das usadas aqui — `n8n-nodes-base.webhook` v2.1, `n8n-nodes-base.httpRequest` v4.4, `n8n-nodes-base.if` v2.3, `n8n-nodes-base.respondToWebhook` v1.5):

```javascript
import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const oauthWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Strava OAuth Callback',
    parameters: {
      httpMethod: 'GET',
      path: 'strava-oauth-callback',
      responseMode: 'responseNode',
      options: {}
    },
    output: { headers: {}, params: {}, query: { code: 'abc123', scope: 'read,activity:read', state: 'user-uuid-example' }, body: {} }
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
    parameters: {
      respondWith: 'redirect',
      redirectURL: 'https://metas.campostecnologia.cloud/?strava=cancelado',
      options: {}
    }
  }
});

const trocarToken = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Trocar code por token',
    parameters: {
      method: 'POST',
      url: 'https://www.strava.com/oauth/token',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { "client_id": $env.STRAVA_CLIENT_ID, "client_secret": $env.STRAVA_CLIENT_SECRET, "code": $json.query.code, "grant_type": "authorization_code" } }}'),
      options: {}
    },
    output: { token_type: 'Bearer', expires_at: 1893456000, expires_in: 21600, refresh_token: 'refresh-example', access_token: 'access-example', athlete: { id: 12345678 } }
  }
});

const gravarConexao = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Gravar strava_connections',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.SUPABASE_URL }}/rest/v1/strava_connections?on_conflict=user_id'),
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
      jsonBody: expr('{{ [{ "user_id": $("Strava OAuth Callback").item.json.query.state, "strava_athlete_id": $json.athlete.id, "access_token": $json.access_token, "refresh_token": $json.refresh_token, "expires_at": new Date($json.expires_at * 1000).toISOString(), "scope": "activity:read" }] }}'),
      options: {}
    },
    output: {}
  }
});

const respondConectado = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Redirect Conectado',
    parameters: {
      respondWith: 'redirect',
      redirectURL: 'https://metas.campostecnologia.cloud/?strava=conectado',
      options: {}
    }
  }
});

export default workflow('strava-oauth-callback', 'Strava - OAuth Callback')
  .add(oauthWebhook)
  .to(checkError
    .onTrue(respondCancelado)
    .onFalse(trocarToken.to(gravarConexao.to(respondConectado))));
```

- [ ] **Step 4: Publicar o workflow**

Chamar `mcp__claude_ai_n8n__publish_workflow` com o ID retornado pelo Step 3.

- [ ] **Step 5: Testar ponta a ponta**

No navegador, logado no Minhas Metas, clicar em "🏃 Conectar com Strava" (Task 1). Autorizar no Strava com uma conta de teste. Confirmar:
- Redirecionamento de volta para `metas.campostecnologia.cloud/?strava=conectado`
- Toast "✅ Strava conectado!" aparece (Task 2)
- Via Supabase MCP: `mcp__claude_ai_Supabase__execute_sql` com `select * from strava_connections where user_id = '<seu-user-id>';` retorna uma linha com `access_token`/`refresh_token` preenchidos.

Se der erro, usar `mcp__claude_ai_n8n__get_execution` na execução do workflow pra ver em qual node falhou, e `mcp__claude_ai_n8n__prepare_test_pin_data` + `mcp__claude_ai_n8n__test_workflow` pra reproduzir com dados fixos e ajustar a expressão problemática antes de re-testar ao vivo.

- [ ] **Step 6: Commit da referência do workflow**

Não há arquivo local pra commitar (workflow vive só no N8N). Registrar no spec (`docs/superpowers/specs/2026-08-09-strava-integration-design.md`) o link/nome do workflow criado, e commitar essa atualização:

```bash
git add docs/superpowers/specs/2026-08-09-strava-integration-design.md
git commit -m "docs: registra workflow N8N de OAuth callback do Strava"
```

---

## Task 5: N8N Workflow 2 — recebimento de atividades (webhook do Strava)

**Files:**
- Nenhum arquivo local — workflow criado via N8N MCP.

**Interfaces:**
- Consumes: mesmas variáveis de ambiente da Task 4 (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — já configuradas.
- Produces: endpoint público `https://n8n.campostecnologia.cloud/webhook/strava-webhook` (aceita `GET` pra verificação e `POST` pra eventos) — é o `callback_url` usado na Task 6 (assinatura de push).

- [ ] **Step 1: Buscar referência do SDK (se necessário revalidar)**

Chamar `mcp__claude_ai_n8n__get_sdk_reference` com `section: "patterns_detailed"` — este workflow usa múltiplos IFs encadeados, vale conferir o padrão de branches convergindo num node compartilhado antes de escrever o código.

- [ ] **Step 2: Criar o workflow via `create_workflow_from_code`**

Chamar `mcp__claude_ai_n8n__create_workflow_from_code` com o código abaixo. **Atenção:** os dois triggers (`GET` e `POST`) usam o mesmo `path` (`strava-webhook`) com métodos diferentes — depois de criado, abrir o workflow na UI do N8N e confirmar que ambos os webhooks aparecem registrados nesse mesmo path; se o N8N reclamar de path duplicado, ajustar um dos dois nodes para usar a opção "Multiple HTTP Methods" do node Webhook (marcando GET e POST no mesmo node) em vez de dois nodes separados, e refazer o restante da cadeia a partir dele.

```javascript
import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

// Trigger 1: verificacao do Strava (GET com hub.challenge)
const verifyWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Strava Verify',
    parameters: {
      httpMethod: 'GET',
      path: 'strava-webhook',
      responseMode: 'responseNode',
      options: {}
    },
    output: { query: { 'hub.mode': 'subscribe', 'hub.challenge': 'challenge-example', 'hub.verify_token': 'meu-verify-token' } }
  }
});

const respondChallenge = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Responder Challenge',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ { "hub.challenge": $json.query["hub.challenge"] } }}'),
      options: { responseCode: 200 }
    }
  }
});

// Trigger 2: evento real (POST)
const eventWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Strava Evento',
    parameters: {
      httpMethod: 'POST',
      path: 'strava-webhook',
      responseMode: 'onReceived',
      options: {}
    },
    output: { body: { object_type: 'activity', aspect_type: 'create', object_id: 987654321, owner_id: 12345678 } }
  }
});

const ehAtividade = ifElse({
  version: 2.3,
  config: {
    name: 'E atividade?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.body.object_type }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'activity' }],
        combinator: 'and'
      }
    }
  }
});

const buscarConexao = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Buscar strava_connections',
    parameters: {
      method: 'GET',
      url: expr('{{ $env.SUPABASE_URL }}/rest/v1/strava_connections'),
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'strava_athlete_id', value: expr('{{ "eq." + $json.body.owner_id }}') }
        ]
      },
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('{{ "Bearer " + $env.SUPABASE_SERVICE_ROLE_KEY }}') }
        ]
      },
      options: {}
    },
    output: [{ user_id: 'user-uuid-example', strava_athlete_id: 12345678, access_token: 'access-example', refresh_token: 'refresh-example', expires_at: '2026-08-09T20:00:00.000Z' }]
  }
});

const conexaoInfo = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Avaliar conexao',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const conn = ($input.first().json || [])[0];\nif (!conn) { return []; }\nconst precisaRenovar = new Date(conn.expires_at).getTime() < Date.now();\nreturn [{ json: { ...conn, precisaRenovar } }];'
    },
    output: { user_id: 'user-uuid-example', strava_athlete_id: 12345678, access_token: 'access-example', refresh_token: 'refresh-example', expires_at: '2026-08-09T20:00:00.000Z', precisaRenovar: false }
  }
});

const precisaRenovar = ifElse({
  version: 2.3,
  config: {
    name: 'Token expirado?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $json.precisaRenovar }}'), operator: { type: 'boolean', operation: 'true' }, rightValue: '' }],
        combinator: 'and'
      }
    }
  }
});

const renovarToken = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Renovar token',
    parameters: {
      method: 'POST',
      url: 'https://www.strava.com/oauth/token',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { "client_id": $env.STRAVA_CLIENT_ID, "client_secret": $env.STRAVA_CLIENT_SECRET, "refresh_token": $("Avaliar conexao").item.json.refresh_token, "grant_type": "refresh_token" } }}'),
      options: {}
    },
    output: { access_token: 'novo-access-token', refresh_token: 'novo-refresh-token', expires_at: 1893456000 }
  }
});

const atualizarConexao = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Atualizar strava_connections',
    parameters: {
      method: 'PATCH',
      url: expr('{{ $env.SUPABASE_URL }}/rest/v1/strava_connections?user_id=eq.' + '{{ $("Avaliar conexao").item.json.user_id }}'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('{{ "Bearer " + $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Prefer', value: 'return=representation' },
          { name: 'Content-Type', value: 'application/json' }
        ]
      },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { "access_token": $json.access_token, "refresh_token": $json.refresh_token, "expires_at": new Date($json.expires_at * 1000).toISOString() } }}'),
      options: {}
    },
    output: [{ user_id: 'user-uuid-example', access_token: 'novo-access-token' }]
  }
});

const tokenAtualDoisPassos = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Token apos renovacao',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: 'const row = ($input.first().json || [])[0] || $input.first().json;\nreturn [{ json: { user_id: row.user_id, access_token: row.access_token } }];'
    },
    output: { user_id: 'user-uuid-example', access_token: 'novo-access-token' }
  }
});

const ehExclusao = ifElse({
  version: 2.3,
  config: {
    name: 'E exclusao?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{ leftValue: expr('{{ $("Strava Evento").item.json.body.aspect_type }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'delete' }],
        combinator: 'and'
      }
    }
  }
});

const excluirAtividade = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Excluir strava_activities',
    parameters: {
      method: 'DELETE',
      url: expr('{{ $env.SUPABASE_URL }}/rest/v1/strava_activities'),
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'strava_activity_id', value: expr('{{ "eq." + $("Strava Evento").item.json.body.object_id }}') }
        ]
      },
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: expr('{{ $env.SUPABASE_SERVICE_ROLE_KEY }}') },
          { name: 'Authorization', value: expr('{{ "Bearer " + $env.SUPABASE_SERVICE_ROLE_KEY }}') }
        ]
      },
      options: {}
    },
    output: {}
  }
});

const buscarAtividade = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Buscar atividade no Strava',
    parameters: {
      method: 'GET',
      url: expr('{{ "https://www.strava.com/api/v3/activities/" + $("Strava Evento").item.json.body.object_id }}'),
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Authorization', value: expr('{{ "Bearer " + $json.access_token }}') }
        ]
      },
      options: {}
    },
    output: { id: 987654321, type: 'Run', name: 'Corrida matinal', distance: 5230.4, moving_time: 1620, start_date_local: '2026-08-09T07:00:00Z', calories: 320 }
  }
});

const gravarAtividade = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Gravar strava_activities',
    parameters: {
      method: 'POST',
      url: expr('{{ $env.SUPABASE_URL }}/rest/v1/strava_activities?on_conflict=strava_activity_id'),
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
      jsonBody: expr('{{ [{ "user_id": $("Avaliar conexao").item.json.user_id, "strava_activity_id": $json.id, "strava_athlete_id": $("Strava Evento").item.json.body.owner_id, "type": $json.type, "name": $json.name, "distance": $json.distance, "moving_time": $json.moving_time, "start_date_local": $json.start_date_local, "activity_date": $json.start_date_local.substring(0, 10), "calories": $json.calories, "raw": $json }] }}'),
      options: {}
    },
    output: {}
  }
});

export default workflow('strava-webhook-eventos', 'Strava - Webhook Atividades')
  .add(verifyWebhook)
  .to(respondChallenge);

export const eventFlow = workflow('strava-webhook-eventos', 'Strava - Webhook Atividades')
  .add(eventWebhook)
  .to(ehAtividade.onTrue(
    buscarConexao.to(conexaoInfo.to(precisaRenovar
      .onTrue(renovarToken.to(atualizarConexao.to(tokenAtualDoisPassos.to(ehExclusao
        .onTrue(excluirAtividade)
        .onFalse(buscarAtividade.to(gravarAtividade)))))))
      .onFalse(ehExclusao
        .onTrue(excluirAtividade)
        .onFalse(buscarAtividade.to(gravarAtividade)))
    ))
  ).onFalse(undefined);
```

**Nota importante para quem executar este step:** a `create_workflow_from_code` espera **um único** `export default` por workflow — os dois triggers (verificação e evento) precisam estar no **mesmo** objeto `workflow(...)`, não em dois `export` separados como rascunhado acima (isso foi deixado assim de propósito porque a sintaxe exata de "múltiplos triggers no mesmo workflow" deve ser confirmada em `get_sdk_reference` no momento da execução — ver Step 1 desta task). Ajustar para a forma real suportada, por exemplo caso a SDK peça `.add(verifyWebhook).to(respondChallenge)` e depois um segundo `.add(eventWebhook)` encadeado no mesmo `workflow(...)` antes do `export default` final, unificando em uma cadeia só. Validar com `test_workflow` (Step 4) antes de publicar.

- [ ] **Step 3: Ground nodes com `get_node_types` antes de publicar**

Chamar `mcp__claude_ai_n8n__get_node_types` para os node IDs usados acima (`n8n-nodes-base.webhook`, `n8n-nodes-base.httpRequest`, `n8n-nodes-base.if`, `n8n-nodes-base.code`, `n8n-nodes-base.respondToWebhook`) e comparar com os parâmetros escritos — corrigir qualquer nome de parâmetro que tenha mudado antes de chamar `create_workflow_from_code`.

- [ ] **Step 4: Testar com dados fixos antes de publicar**

Chamar `mcp__claude_ai_n8n__prepare_test_pin_data` simulando um payload de evento (`object_type: "activity"`, `aspect_type: "create"`, `object_id`, `owner_id` de uma atividade real de teste) e `mcp__claude_ai_n8n__test_workflow` — conferir na saída de cada node se os campos batem com o esperado (especialmente `$("Avaliar conexao").item.json.user_id` e o resultado de `buscarAtividade`). Ajustar expressões que não baterem.

- [ ] **Step 5: Publicar**

Chamar `mcp__claude_ai_n8n__publish_workflow`.

- [ ] **Step 6: Commit da referência**

```bash
git add docs/superpowers/specs/2026-08-09-strava-integration-design.md
git commit -m "docs: registra workflow N8N de recebimento de atividades do Strava"
```

---

## Task 6: Assinatura de push do Strava (setup único, a nível de app)

**Files:** nenhum — chamada direta à API do Strava.

**Interfaces:**
- Consumes: Workflow 2 já publicado (Task 5) — a URL `https://n8n.campostecnologia.cloud/webhook/strava-webhook` precisa estar no ar antes deste step, porque o Strava valida o `callback_url` na hora (faz um `GET` de verificação síncrono).

- [ ] **Step 1: Definir um verify_token**

Escolher uma string aleatória qualquer (ex: gerar com `openssl rand -hex 16`) — só precisa bater entre o que for enviado na criação da assinatura e o que o Workflow 2 devolveria se fosse conferir (neste plano o Workflow 2 não confere o `verify_token`, só ecoa o `hub.challenge` — o Strava aceita isso, o `verify_token` é responsabilidade nossa de escolher, não precisa validação extra pro fluxo funcionar).

- [ ] **Step 2: Criar a assinatura**

Rodar (uma vez só, de qualquer máquina com curl — não precisa ser o servidor):

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=270844 \
  -F client_secret=<valor de projects/minhas-metas/.env> \
  -F callback_url=https://n8n.campostecnologia.cloud/webhook/strava-webhook \
  -F verify_token=<o token escolhido no Step 1>
```

Resposta esperada: `{"id": <número>}`. Se vier erro de callback validation, conferir se o Workflow 2 está publicado e respondendo `GET` corretamente (testar manualmente: `curl "https://n8n.campostecnologia.cloud/webhook/strava-webhook?hub.mode=subscribe&hub.challenge=teste123&hub.verify_token=xyz"` deve devolver `{"hub.challenge":"teste123"}`).

- [ ] **Step 3: Confirmar a assinatura ativa**

```bash
curl -G https://www.strava.com/api/v3/push_subscriptions \
  -d client_id=270844 \
  -d client_secret=<valor de projects/minhas-metas/.env>
```

Deve listar a assinatura criada no Step 2.

---

## Task 7: Verificação ponta a ponta

**Files:** nenhum — só verificação.

- [ ] **Step 1: Conectar conta de teste**

No app, conectar uma conta Strava de teste (Task 1-4). Confirmar linha em `strava_connections` via `mcp__claude_ai_Supabase__execute_sql`.

- [ ] **Step 2: Gerar uma atividade real**

Registrar uma atividade de teste no Strava (pode ser manual, tipo "Caminhada", com distância qualquer). Aguardar alguns segundos.

- [ ] **Step 3: Confirmar chegada em `strava_activities`**

```sql
select * from strava_activities where user_id = '<seu-user-id>' order by created_at desc limit 1;
```
Confirmar `distance`, `activity_date`, `type` corretos.

- [ ] **Step 4: Confirmar card no app**

Recarregar o dashboard do Minhas Metas — o card "🏃 Strava hoje" deve aparecer mostrando a distância em km da atividade de teste.

- [ ] **Step 5: Testar edição/exclusão**

Editar a distância da atividade de teste no Strava — confirmar que `strava_activities` atualiza. Excluir a atividade — confirmar que a linha some de `strava_activities` e o card no app atualiza (recarregar a página).

- [ ] **Step 6: Testar renovação de token**

Via `mcp__claude_ai_Supabase__execute_sql`, forçar `expires_at` pro passado numa linha de teste (`update strava_connections set expires_at = now() - interval '1 hour' where user_id = '<seu-user-id>';`), registrar outra atividade de teste, e confirmar no `get_execution` do Workflow 2 que o branch de renovação (`Renovar token` → `Atualizar strava_connections`) foi acionado e que `strava_connections.access_token` mudou.
