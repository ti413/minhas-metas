# Agente Coach + Hábitos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar dois agentes automáticos — Coach (insight diário às 9h via N8N + push) e Hábitos (análise no login + alertas às 20h via N8N) — usando infraestrutura existente: Supabase, N8N, VAPID, Claude API.

**Architecture:** Skills Claude Code para execução manual + N8N para automação agendada + Supabase para persistência. Push notifications via Supabase Edge Function que recebe `user_id + título + corpo` e envia o push VAPID usando a `push_subscriptions` table. app.js recebe análise de hábitos no evento de login, sem framework de testes — verificação é manual no browser.

**Tech Stack:** Vanilla JS (app.js), Supabase (SQL + Edge Functions Deno), N8N (workflow automation), Claude API (anthropic messages), VAPID Web Push, Claude Code skills (Markdown).

## Global Constraints

- Deploy sempre via `C:\Users\Administrador\deploy_metas.py` (paramiko/SFTP) — nunca scp
- Servidor: `2.24.99.6`, user: `root`, destino: `/var/www/metas/`
- Supabase project: `tpcawmrblanpkgoqisgw.supabase.co`
- N8N: `n8n.campostecnologia.cloud`
- VAPID public key: `BMnNzbaVlZJoCK3yU0oBisBbtJaau_SJhWze_UVVPQC_-BjX-hr0woPLfRAku0SB7UsLJgNqByuN2OrStwd3m38`
- Sem framework de testes — todo teste é verificação manual no browser ou no N8N test mode
- Não inventar credenciais — VAPID private key e Claude API key devem existir nas variáveis de ambiente do N8N/servidor
- app.js tem ~3800 linhas; editar apenas as seções necessárias

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `.claude/commands/coach-report.md` | Criar | Skill `/coach-report` — executa análise do coach para um usuário |
| `.claude/commands/habitos-analise.md` | Criar | Skill `/habitos-analise` — análise profunda de hábitos de um usuário |
| `app.js` | Editar | Adicionar `analisarHabitosLogin()` + call em `onUserLoggedIn()` (linha 2583) |
| Supabase migration (via MCP) | Criar | Tabelas `habit_suggestions` e `user_patterns` |
| Supabase Edge Function `send-push` | Criar | Envio server-side de push VAPID para um usuário |
| N8N workflow "Coach Diário - Minhas Metas" | Criar | Cron 9h: busca usuários → Claude API → ai_reflections → push |
| N8N workflow "Hábitos Diário - Minhas Metas" | Criar | Cron 20h: alertas streak + padrões → habit_suggestions + user_patterns |

---

## Task 1: Supabase — Criar tabelas `habit_suggestions` e `user_patterns`

**Files:**
- Create via MCP: `mcp__claude_ai_Supabase__apply_migration`

**Interfaces:**
- Produces: tabelas disponíveis para Tasks 5, 6, 7

- [ ] **Step 1: Aplicar migration via MCP Supabase**

Usar a tool `mcp__claude_ai_Supabase__apply_migration` com o seguinte SQL:

```sql
-- Tabela: habit_suggestions
-- Armazena sugestões de novos hábitos geradas pelo Claude API via N8N às 20h
CREATE TABLE IF NOT EXISTS public.habit_suggestions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestions jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.habit_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own habit_suggestions"
  ON public.habit_suggestions FOR SELECT
  USING (auth.uid() = user_id);

-- N8N usa service_role key, não precisa de policy de insert
-- mas para segurança, garantimos que o usuário não pode inserir pelo client
CREATE POLICY "No client insert on habit_suggestions"
  ON public.habit_suggestions FOR INSERT
  WITH CHECK (false);

-- Tabela: user_patterns
-- Armazena padrões de comportamento calculados pelo N8N às 20h
CREATE TABLE IF NOT EXISTS public.user_patterns (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  peak_days   jsonb NOT NULL DEFAULT '[]',
  peak_hours  jsonb NOT NULL DEFAULT '[]',
  weak_habits jsonb NOT NULL DEFAULT '[]',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own user_patterns"
  ON public.user_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "No client insert on user_patterns"
  ON public.user_patterns FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No client update on user_patterns"
  ON public.user_patterns FOR UPDATE
  USING (false);
```

Parâmetros para `apply_migration`:
- `project_id`: `tpcawmrblanpkgoqisgw`
- `name`: `add_habit_suggestions_and_user_patterns`
- `query`: SQL acima

- [ ] **Step 2: Verificar tabelas criadas**

Usar `mcp__claude_ai_Supabase__list_tables` com `project_id: "tpcawmrblanpkgoqisgw"` e confirmar que `habit_suggestions` e `user_patterns` aparecem na lista.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add habit_suggestions and user_patterns Supabase tables"
```

---

## Task 2: Supabase Edge Function — `send-push`

**Files:**
- Create via MCP: `mcp__claude_ai_Supabase__deploy_edge_function`

**Interfaces:**
- Consumes: `push_subscriptions` table (user_id, subscription jsonb)
- Produces: HTTP endpoint chamável pelo N8N: `POST /functions/v1/send-push` com body `{ user_id, title, body }`

**Notas:**
- Edge Functions rodam Deno
- A VAPID private key deve estar em `Deno.env.get('VAPID_PRIVATE_KEY')` — configurar no Supabase Dashboard > Edge Functions > Environment Variables
- A VAPID public key está hardcoded no app.js: `BMnNzbaVlZJoCK3yU0oBisBbtJaau_SJhWze_UVVPQC_-BjX-hr0woPLfRAku0SB7UsLJgNqByuN2OrStwd3m38`

- [ ] **Step 1: Deploy Edge Function via MCP**

Usar `mcp__claude_ai_Supabase__deploy_edge_function` com:
- `project_id`: `tpcawmrblanpkgoqisgw`
- `name`: `send-push`
- `entrypoint_path`: `index.ts`
- `files`: objeto com `index.ts` contendo o código abaixo

```typescript
// supabase/functions/send-push/index.ts
// Recebe { user_id, title, body } e envia push VAPID para o usuário

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// web-push para Deno: usar implementação manual do protocolo
// (web-push npm não funciona em Deno diretamente — usar jose para JWT VAPID)
import { SignJWT } from 'https://esm.sh/jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = 'BMnNzbaVlZJoCK3yU0oBisBbtJaau_SJhWze_UVVPQC_-BjX-hr0woPLfRAku0SB7UsLJgNqByuN2OrStwd3m38'
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = 'mailto:ti@gruporessonar.com.br'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { user_id, title, body } = await req.json()
  if (!user_id || !title) return new Response('Missing user_id or title', { status: 400 })

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Busca subscription do usuário
  const { data: sub, error } = await sb
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_id', user_id)
    .single()

  if (error || !sub) return new Response('No subscription found', { status: 404 })

  const subscription = sub.subscription as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }

  // Monta JWT VAPID
  const url = new URL(subscription.endpoint)
  const audience = `${url.protocol}//${url.host}`

  // Importa VAPID private key (formato PEM ou base64url raw)
  // VAPID_PRIVATE_KEY deve ser a chave privada em formato base64url (sem header PEM)
  const privateKeyBytes = base64urlToUint8Array(VAPID_PRIVATE_KEY)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', privateKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveKey']
  )

  // Nota: envio VAPID completo (com criptografia AES-GCM do payload) é complexo em Deno puro.
  // Alternativa pragmática: usar payload vazio (notification-only via service worker).
  // O service worker já tem o handler de push que exibe título e corpo do data.json.
  // Para MVP, enviamos a notificação com um fetch direto para o endpoint VAPID.

  // Para MVP: usar Web Push via fetch com VAPID Authorization header
  const vapidToken = await buildVapidToken(audience, VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  // Payload criptografado (content-encoding: aesgcm) — para MVP simplificado,
  // enviamos sem payload e o SW usa título/corpo da notificação diretamente
  // Para envio com payload, usar biblioteca web-push completa
  const payloadStr = JSON.stringify({ title, body, icon: '/icon-192.png' })
  const payloadBytes = new TextEncoder().encode(payloadStr)

  // Criptografa payload com AES-GCM usando chaves da subscription
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(
    payloadBytes,
    subscription.keys.p256dh,
    subscription.keys.auth
  )

  const pushRes = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${vapidToken.token},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aesgcm',
      'Encryption': `salt=${uint8ArrayToBase64url(salt)}`,
      'Crypto-Key': `dh=${uint8ArrayToBase64url(serverPublicKey)};p256ecdsa=${VAPID_PUBLIC_KEY}`,
      'TTL': '86400',
    },
    body: ciphertext,
  })

  if (!pushRes.ok) {
    const text = await pushRes.text()
    return new Response(`Push failed: ${pushRes.status} ${text}`, { status: 502 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

// ── helpers ──

function base64urlToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - b64.length % 4) % 4)
  const b64std = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64std)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function buildVapidToken(audience: string, subject: string, publicKey: string, privateKey: string) {
  const privKeyBytes = base64urlToUint8Array(privateKey)
  const cryptoPrivKey = await crypto.subtle.importKey(
    'raw', privKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ aud: audience, exp: now + 43200, sub: subject })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT' })
    .sign(cryptoPrivKey)
  return { token }
}

async function encryptPayload(
  payload: Uint8Array,
  p256dhBase64: string,
  authBase64: string
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  // Gera par de chaves efêmero para o servidor
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveKey', 'deriveBits']
  )

  // Importa chave pública do cliente (p256dh)
  const clientPubKeyBytes = base64urlToUint8Array(p256dhBase64)
  const clientPubKey = await crypto.subtle.importKey(
    'raw', clientPubKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  )

  // Deriva shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPubKey },
    serverKeyPair.privateKey, 256
  )

  // auth secret
  const authSecret = base64urlToUint8Array(authBase64)

  // HKDF para gerar content encryption key e nonce
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey))

  // PRK usando HKDF
  const prk = await hkdf(authSecret, new Uint8Array(sharedSecret), concat(
    new TextEncoder().encode('Content-Encoding: auth\0'),
  ), 32)

  const cek = await hkdf(salt, prk, concat(
    new TextEncoder().encode('Content-Encoding: aesgcm\0'),
    new Uint8Array([0x00, 0x41]),
    clientPubKeyBytes,
    serverPublicKeyRaw,
  ), 16)

  const nonce = await hkdf(salt, prk, concat(
    new TextEncoder().encode('Content-Encoding: nonce\0'),
    new Uint8Array([0x00, 0x41]),
    clientPubKeyBytes,
    serverPublicKeyRaw,
  ), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])

  // Adiciona padding (2 bytes de tamanho do padding = 0, depois o payload)
  const padded = concat(new Uint8Array(2), payload)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey, padded
  ))

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw }
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const keyMat = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    keyMat, length * 8
  )
  return new Uint8Array(bits)
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const arr of arrays) { result.set(arr, offset); offset += arr.length }
  return result
}
```

- [ ] **Step 2: Configurar variável de ambiente VAPID_PRIVATE_KEY**

No Supabase Dashboard:
- Ir em: Project Settings > Edge Functions > Environment Variables
- Adicionar: `VAPID_PRIVATE_KEY = <chave privada VAPID em base64url>`

A chave privada VAPID corresponde à public key `BMnNzba...`. Se não souber qual é, gerar um novo par com:
```bash
npx web-push generate-vapid-keys
```
E atualizar `VAPID_PUBLIC_KEY` no app.js (linha 3773) + no Edge Function.

- [ ] **Step 3: Testar Edge Function**

No Supabase Dashboard > Edge Functions > `send-push` > Test:
- Pegar o `user_id` de um usuário com push_subscription no banco
- POST com body: `{ "user_id": "<uuid>", "title": "Teste Push", "body": "Funcionou!" }`
- Verificar se a notificação aparece no dispositivo do usuário

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: deploy send-push Supabase Edge Function"
```

---

## Task 3: Skill `/coach-report` — Análise manual do Coach

**Files:**
- Create: `.claude/commands/coach-report.md`

**Interfaces:**
- Consumes: Supabase MCP (`mcp__claude_ai_Supabase__execute_sql`), Claude API (via texto inline)
- Produces: insight formatado no terminal + confirmação de escrita em `ai_reflections`

- [ ] **Step 1: Criar diretório e arquivo da skill**

Criar `.claude/commands/coach-report.md` com:

```markdown
# Coach Report — Minhas Metas

Executa análise completa de coach para **um usuário específico** do app Minhas Metas.
Útil para testes, depuração e geração manual de insights.

## O que fazer

### 1. Perguntar qual usuário
Se nenhum user_id foi passado como argumento (`$ARGUMENTS`), perguntar:
"Para qual usuário? Pode ser email ou user_id (UUID do Supabase)."

Se for email, buscar o user_id:
```sql
SELECT id, email FROM auth.users WHERE email = '<email>';
```

### 2. Buscar dados do usuário no Supabase

Executar as queries abaixo via `mcp__claude_ai_Supabase__execute_sql` com `project_id: "tpcawmrblanpkgoqisgw"`:

```sql
-- Dados do perfil
SELECT username, xp, nivel, mentor, plan
FROM profiles
WHERE id = '<user_id>';

-- Últimas 7 ai_reflections do usuário
SELECT mentor, content, created_at
FROM ai_reflections
WHERE user_id = '<user_id>'
ORDER BY created_at DESC
LIMIT 7;
```

### 3. Gerar insight personalizado

Com base nos dados coletados, gerar um insight no tom do mentor ativo:

**Se mentor = "jesus":**
> Tom: pastoral, empático, usa versículo bíblico relevante, termina com encorajamento pessoal.
> Exemplo de estrutura: [versículo] → [conexão com as metas/streak] → [encorajamento]

**Se mentor = "huberman" (Eslen Delanogare):**
> Tom: neurociência aplicada, usa termos como "Reservatório de Dopamina", "janela de pico", "loop de reforço".
> Exemplo de estrutura: [fato neurocientífico] → [conexão com padrão de hábito do usuário] → [sugestão prática]

### 4. Persistir no Supabase

Salvar o insight gerado:

```sql
INSERT INTO ai_reflections (user_id, mentor, content, created_at)
VALUES ('<user_id>', '<mentor>', '<insight_gerado>', now());
```

### 5. Reportar resultado

Exibir:
- Nome do usuário e mentor
- Insight gerado (completo)
- Confirmação de que foi salvo em ai_reflections
- Se o usuário tem push_subscription (para saber se receberia a notificação automática)

```sql
SELECT COUNT(*) as tem_push FROM push_subscriptions WHERE user_id = '<user_id>';
```
```

- [ ] **Step 2: Testar a skill**

No Claude Code, digitar `/coach-report` e verificar que:
1. Pergunta pelo usuário
2. Busca dados no Supabase
3. Gera insight coerente com o mentor
4. Salva em ai_reflections
5. Reporta o resultado

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/coach-report.md
git commit -m "feat: add /coach-report skill for manual coach analysis"
```

---

## Task 4: N8N workflow — "Coach Diário - Minhas Metas" (cron 9h)

**Files:**
- Create via MCP: `mcp__claude_ai_n8n__create_workflow_from_code`

**Interfaces:**
- Consumes: Supabase (profiles + push_subscriptions), Claude API, Edge Function `send-push`
- Produces: ai_reflections rows + push notifications para todos os usuários ativos

**Notas:** O N8N MCP exige que você primeiro chame `get_sdk_reference`, depois `search_nodes`, depois `get_node_types` antes de criar o workflow. Siga o processo abaixo.

- [ ] **Step 1: Ler SDK reference do N8N**

Chamar `mcp__claude_ai_n8n__get_sdk_reference` e ler a resposta completa antes de escrever código.

- [ ] **Step 2: Descobrir nodes necessários**

Chamar `mcp__claude_ai_n8n__search_nodes` com as queries:
- `"schedule trigger"` → para o cron
- `"http request"` → para Claude API e Edge Function
- `"supabase"` → para leitura de dados
- `"split in batches"` ou `"loop"` → para iterar sobre usuários
- `"code"` → para lógica customizada

- [ ] **Step 3: Obter type definitions dos nodes**

Chamar `mcp__claude_ai_n8n__get_node_types` com os IDs dos nodes descobertos no Step 2.

- [ ] **Step 4: Escrever código do workflow**

Referência de arquitetura (adaptar ao SDK após Steps 1-3):

```
TRIGGER: Schedule Trigger — todos os dias às 09:00

NODE 1 — HTTP Request (Supabase REST)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/profiles
  Method: GET
  Headers:
    apikey: <SUPABASE_SERVICE_ROLE_KEY>
    Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
  Query params:
    select: id,username,xp,nivel,mentor,plan
    plan: eq.premium (apenas usuários ativos)
  Propósito: buscar lista de usuários ativos

NODE 2 — Split in Batches (tamanho 1)
  Propósito: processar um usuário por vez

NODE 3 — HTTP Request (Supabase REST — busca push_subscription)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/push_subscriptions
  Method: GET
  Headers: mesmos do NODE 1
  Query params:
    user_id: eq.{{ $json.id }}
    select: user_id
  Propósito: verificar se usuário tem push ativo

NODE 4 — IF (tem push subscription?)
  Condition: {{ $json.length > 0 }}
  TRUE → continua | FALSE → pula para próximo (Next Batch)

NODE 5 — HTTP Request (Supabase REST — busca ai_reflections recentes)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/ai_reflections
  Method: GET
  Query params:
    user_id: eq.{{ batch.json.id }}
    select: content,created_at
    order: created_at.desc
    limit: 3
  Propósito: contexto das últimas reflexões para não repetir

NODE 6 — Code (monta prompt para Claude API)
  Propósito: construir o system prompt baseado no mentor

  Código:
  ```javascript
  const user = $('NODE 1').first().json;
  const recentReflections = $input.all().map(r => r.json.content).join('\n---\n');
  const mentor = user.mentor || 'jesus';
  
  let systemPrompt;
  if (mentor === 'jesus') {
    systemPrompt = `Você é um mentor espiritual cristão que acompanha o progresso de ${user.username || 'um usuário'} em seus hábitos diários.
  Tom: pastoral, acolhedor, esperançoso. Use um versículo bíblico relevante.
  Estrutura: versículo + conexão com os hábitos + encorajamento pessoal.
  Máximo 150 palavras.`;
  } else {
    systemPrompt = `Você é Eslen Delanogare, especialista em neurociência de hábitos, acompanhando ${user.username || 'um usuário'}.
  Tom: científico mas acessível. Use termos como "Reservatório de Dopamina", "janela de pico de dopamina", "loop de reforço".
  Estrutura: dado neurocientífico + aplicação prática + motivação baseada em dados.
  Máximo 150 palavras.`;
  }
  
  return [{
    json: {
      user_id: user.id,
      mentor,
      username: user.username,
      xp: user.xp,
      nivel: user.nivel,
      systemPrompt,
      recentContext: recentReflections,
    }
  }];
  ```

NODE 7 — HTTP Request (Claude API)
  URL: https://api.anthropic.com/v1/messages
  Method: POST
  Headers:
    x-api-key: {{ $vars.CLAUDE_API_KEY }}
    anthropic-version: 2023-06-01
    content-type: application/json
  Body (JSON):
  ```json
  {
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 300,
    "system": "{{ $json.systemPrompt }}",
    "messages": [
      {
        "role": "user",
        "content": "Gere o insight do dia para este usuário. Reflexões recentes (para não repetir): {{ $json.recentContext || 'Nenhuma ainda' }}"
      }
    ]
  }
  ```

NODE 8 — Code (extrai texto do response Claude)
  ```javascript
  const insight = $input.first().json.content[0].text;
  const prev = $('NODE 6').first().json;
  return [{ json: { ...prev, insight } }];
  ```

NODE 9 — HTTP Request (Supabase REST — INSERT ai_reflections)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/ai_reflections
  Method: POST
  Headers:
    apikey: <SERVICE_ROLE_KEY>
    Authorization: Bearer <SERVICE_ROLE_KEY>
    Content-Type: application/json
    Prefer: return=minimal
  Body:
  ```json
  {
    "user_id": "{{ $json.user_id }}",
    "mentor": "{{ $json.mentor }}",
    "content": "{{ $json.insight }}",
    "created_at": "{{ new Date().toISOString() }}"
  }
  ```

NODE 10 — HTTP Request (Edge Function send-push)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/functions/v1/send-push
  Method: POST
  Headers:
    Authorization: Bearer <SERVICE_ROLE_KEY>
    Content-Type: application/json
  Body:
  ```json
  {
    "user_id": "{{ $json.user_id }}",
    "title": "Bom dia, {{ $json.username }}! ☀️",
    "body": "{{ $json.insight.substring(0, 100) }}..."
  }
  ```

NODE 11 — Loop back para próximo usuário (Next Batch)
```

- [ ] **Step 5: Validar e criar o workflow**

1. Chamar `mcp__claude_ai_n8n__validate_workflow` com o código gerado
2. Corrigir erros se houver
3. Chamar `mcp__claude_ai_n8n__create_workflow_from_code` com o código validado e description: `"Gera insight diário personalizado via Claude API e envia push para todos usuários premium às 9h"`

- [ ] **Step 6: Configurar variáveis de ambiente no N8N**

No N8N Dashboard > Settings > Variables:
- `CLAUDE_API_KEY`: chave da API do Claude (Anthropic)
- `SUPABASE_SERVICE_ROLE_KEY`: chave service_role do Supabase

- [ ] **Step 7: Testar o workflow**

Chamar `mcp__claude_ai_n8n__test_workflow` com o workflow ID criado.
Verificar no Supabase:
```sql
SELECT * FROM ai_reflections ORDER BY created_at DESC LIMIT 5;
```
Deve aparecer uma nova linha para cada usuário premium com push_subscription.

- [ ] **Step 8: Publicar o workflow**

Chamar `mcp__claude_ai_n8n__publish_workflow` com o workflow ID.

---

## Task 5: app.js — Análise de hábitos no login

**Files:**
- Modify: `app.js` (inserir ~50 linhas; dois pontos de edição)

**Interfaces:**
- Consumes: `state.history`, `state.metas`, `calcStreak()`, `todayStr()` (todos existentes)
- Produces: nudge visual de streak + hint em metas problemáticas, aparecendo 6s após login

**Notas de contexto do código:**
- `state.history[dateStr]` = `{ pct, metas: [{text, done}], humor }`
- `state.metas` = array de `{ id, text, done, recurrent, categoria }`
- `calcStreak()` usa `state.history` e conta dias consecutivos COM `pct > 0` (excluindo hoje)
- `onUserLoggedIn()` fica na linha ~2554; as calls de setTimeout estão em ~2582-2585
- Meta items no DOM: `div.meta-item` com `data-idx="<índice no array>"`

- [ ] **Step 1: Adicionar call de análise em `onUserLoggedIn()`**

Em [app.js:2583](app.js#L2583), logo após `setTimeout(registrarPush, 5000)`, adicionar:

```javascript
    setTimeout(analisarHabitosLogin, 6000);
```

A função `onUserLoggedIn()` fica assim (linhas 2582-2585):
```javascript
    setTimeout(gerarInsightDiario, 4000);
    setTimeout(registrarPush, 5000);
    setTimeout(analisarHabitosLogin, 6000);  // ← ADICIONAR ESTA LINHA
    setTimeout(mostrarNudgeNotificacao, 12000);
```

- [ ] **Step 2: Adicionar a função `analisarHabitosLogin()` e helpers**

Encontrar o comentário `// ── PUSH NOTIFICATIONS ──` (linha ~3772) e inserir o bloco abaixo **imediatamente antes** dele:

```javascript
  // ── ANÁLISE DE HÁBITOS NO LOGIN ──
  async function analisarHabitosLogin() {
    if (!currentUser || !state.metas || !state.metas.length) return;

    const hoje = todayStr();
    const streak = calcStreak();
    const pctHoje = (state.history[hoje] && state.history[hoje].pct) || 0;

    // 1. Streak em risco? (streak ≥ 2 E nada concluído hoje)
    if (streak >= 2 && pctHoje === 0) {
      mostrarNudgeStreakRisco(streak);
    }

    // 2. Metas problemáticas? (0 conclusões nos últimos 7 dias)
    const ultimos7Dias = [];
    for (var i = 1; i <= 7; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      ultimos7Dias.push(d.toISOString().split('T')[0]);
    }

    var indicesProblematicos = new Set();
    state.metas.forEach(function(meta, idx) {
      var totalConclusoes = ultimos7Dias.reduce(function(acc, dia) {
        var hist = state.history[dia];
        if (!hist || !hist.metas) return acc;
        var metaDoDia = hist.metas.find(function(m) { return m.text === meta.text; });
        return acc + (metaDoDia && metaDoDia.done ? 1 : 0);
      }, 0);
      if (totalConclusoes === 0) indicesProblematicos.add(idx);
    });

    if (indicesProblematicos.size > 0) {
      marcarMetasProblematicas(indicesProblematicos);
    }
  }

  function mostrarNudgeStreakRisco(streak) {
    var existente = document.getElementById('nudge-streak-risco');
    if (existente) return;

    var nudge = document.createElement('div');
    nudge.id = 'nudge-streak-risco';
    nudge.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:#ff6b35',
      'color:#fff',
      'padding:12px 20px',
      'border-radius:12px',
      'font-size:14px',
      'font-weight:600',
      'z-index:9999',
      'max-width:320px',
      'text-align:center',
      'box-shadow:0 4px 20px rgba(255,107,53,0.4)',
      'cursor:pointer',
      'animation:fadeInUp 0.3s ease',
    ].join(';');
    nudge.innerHTML = '🔥 Sua sequência de <strong>' + streak + ' dias</strong> está em risco!<br><small>Complete pelo menos 1 meta hoje.</small>';
    nudge.onclick = function() { nudge.remove(); };
    document.body.appendChild(nudge);
    setTimeout(function() { if (nudge.parentNode) nudge.remove(); }, 8000);
  }

  function marcarMetasProblematicas(indices) {
    document.querySelectorAll('#metas-list .meta-item').forEach(function(el) {
      var idx = parseInt(el.dataset.idx, 10);
      if (indices.has(idx) && !el.querySelector('.hint-problematica')) {
        var hint = document.createElement('div');
        hint.className = 'hint-problematica';
        hint.style.cssText = 'font-size:11px;color:var(--muted);margin-top:4px;padding-left:36px;';
        hint.textContent = '💡 Sem conclusões em 7 dias — considere simplificar';
        el.appendChild(hint);
      }
    });
  }

```

- [ ] **Step 3: Verificação manual no browser**

1. Abrir `http://2.24.99.6` (ou o app local)
2. Fazer login com um usuário que tenha streak ≥ 2
3. Sem completar nenhuma meta hoje
4. Após ~6 segundos, deve aparecer o nudge laranja de streak
5. Inspecionar `#metas-list` no DevTools e verificar se metas sem conclusão há 7 dias têm a div `.hint-problematica`

Para simular: no console do browser após login:
```javascript
// Testar nudge de streak
mostrarNudgeStreakRisco(5);

// Testar metas problemáticas (força idx 0 como problemático)
marcarMetasProblematicas(new Set([0]));
```

- [ ] **Step 4: Deploy e commit**

```bash
git add app.js
git commit -m "feat: add habit analysis on login (streak risk nudge + problematic habits hint)"
python C:\Users\Administrador\deploy_metas.py
```

---

## Task 6: Skill `/habitos-analise` — Análise manual de hábitos

**Files:**
- Create: `.claude/commands/habitos-analise.md`

**Interfaces:**
- Consumes: Supabase MCP (profiles, ai_reflections, habit_suggestions, user_patterns)
- Produces: relatório completo de padrões + sugestões no terminal

- [ ] **Step 1: Criar arquivo da skill**

Criar `.claude/commands/habitos-analise.md`:

```markdown
# Hábitos Análise — Minhas Metas

Executa análise profunda de padrões de hábito para um usuário específico.
Útil para diagnóstico e sugestão de novos hábitos.

## O que fazer

### 1. Identificar o usuário

Se `$ARGUMENTS` não tiver user_id/email, perguntar: "Para qual usuário? Email ou user_id (UUID)."

Se email informado, buscar user_id:
```sql
SELECT id, email FROM auth.users WHERE email = '<email>';
```

### 2. Buscar dados completos no Supabase

Usar `mcp__claude_ai_Supabase__execute_sql` com `project_id: "tpcawmrblanpkgoqisgw"`:

```sql
-- Perfil
SELECT username, xp, nivel, mentor, plan FROM profiles WHERE id = '<user_id>';

-- Padrões já calculados (se existirem)
SELECT peak_days, peak_hours, weak_habits, updated_at
FROM user_patterns WHERE user_id = '<user_id>';

-- Últimas sugestões de hábitos
SELECT suggestions, created_at FROM habit_suggestions
WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 3;

-- Reflexões recentes para contexto
SELECT mentor, content, created_at FROM ai_reflections
WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 5;
```

### 3. Analisar padrões

Com base nos dados retornados, apresentar análise em seções:

**Seção A — Padrões detectados:**
- Dias da semana com mais engajamento (de `peak_days`)
- Horários de pico (de `peak_hours`)
- Metas com baixo engajamento (de `weak_habits`)

**Seção B — Diagnóstico:**
- O usuário está em risco de quebrar streak?
- Há metas que parecem difíceis demais?
- O mentor atual (jesus/huberman) parece adequado?

**Seção C — Sugestões:**
Gerar 3 sugestões de novos hábitos baseadas no perfil do usuário.
Tom: coerente com o mentor ativo.

### 4. Persistir sugestões (opcional)

Perguntar: "Deseja salvar essas sugestões no Supabase para o usuário ver no próximo login?"

Se sim, executar:
```sql
INSERT INTO habit_suggestions (user_id, suggestions, created_at)
VALUES (
  '<user_id>',
  '<json_das_sugestoes>',
  now()
);
```

### 5. Reportar resultado

Exibir o relatório completo formatado, incluindo:
- Nome do usuário
- Padrões detectados
- Diagnóstico
- Sugestões geradas
- Se foram salvas no Supabase
```

- [ ] **Step 2: Testar a skill**

Digitar `/habitos-analise` e verificar que:
1. Pede usuário
2. Busca todos os dados relevantes
3. Apresenta análise estruturada
4. Oferece salvar sugestões

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/habitos-analise.md
git commit -m "feat: add /habitos-analise skill for manual habit pattern analysis"
```

---

## Task 7: N8N workflow — "Hábitos Diário - Minhas Metas" (cron 20h)

**Files:**
- Create via MCP: `mcp__claude_ai_n8n__create_workflow_from_code`

**Interfaces:**
- Consumes: Supabase (profiles, push_subscriptions, ai_reflections)
- Produces: push notifications de streak + rows em `habit_suggestions` + rows em `user_patterns`

**Notas:** Assim como a Task 4, seguir o processo: `get_sdk_reference` → `search_nodes` → `get_node_types` → escrever código → `validate_workflow` → `create_workflow_from_code`.

- [ ] **Step 1: Ler SDK e descobrir nodes**

Repetir Steps 1-3 da Task 4 se não tiver o SDK na memória de contexto.

- [ ] **Step 2: Escrever código do workflow**

Arquitetura de referência:

```
TRIGGER: Schedule Trigger — todos os dias às 20:00

NODE 1 — HTTP Request (Supabase — buscar usuários premium com push)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/push_subscriptions
  Method: GET
  Headers: apikey + Authorization (service_role_key)
  Query params:
    select: user_id
  Propósito: lista de todos os usuários com push ativo

NODE 2 — Split in Batches (tamanho 1)

NODE 3 — HTTP Request (Supabase — buscar perfil do usuário)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/profiles
  Query params:
    id: eq.{{ $json.user_id }}
    select: id,username,xp,nivel,mentor,plan
    plan: eq.premium

NODE 4 — IF (tem perfil premium?)
  TRUE → continua | FALSE → próximo

ETAPA 1 — Alerta de streak (urgente, 20h)
==
NODE 5 — Code (verificar streak do usuário)
  Nota: o estado de hábitos fica no localStorage do browser, não no Supabase diretamente.
  O Supabase tem a coluna cloud_data em profiles (verificar se existe) ou usar ai_reflections
  como proxy de atividade.

  Alternativa pragmática: buscar a última ai_reflection do usuário e ver se é de hoje.
  Se não houver reflection de hoje → considerar "em risco" para o alerta.

  ```javascript
  const hoje = new Date().toISOString().split('T')[0];
  const userId = $('NODE 3').first().json.id;
  return [{ json: { user_id: userId, username: $('NODE 3').first().json.username,
    mentor: $('NODE 3').first().json.mentor, hoje } }];
  ```

NODE 6 — HTTP Request (Supabase — última ai_reflection de hoje)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/ai_reflections
  Query params:
    user_id: eq.{{ $json.user_id }}
    created_at: gte.{{ $json.hoje }}T00:00:00
    select: id
    limit: 1
  Propósito: proxy de "usuário esteve ativo hoje"

NODE 7 — IF (sem atividade hoje?)
  Condition: {{ $input.first().json.length === 0 }}
  TRUE → enviar alerta de streak

NODE 8 — HTTP Request (Edge Function send-push — alerta streak)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/functions/v1/send-push
  Body:
  ```json
  {
    "user_id": "{{ $('NODE 5').first().json.user_id }}",
    "title": "Ainda dá tempo! 💪",
    "body": "Complete pelo menos 1 meta hoje antes da meia-noite."
  }
  ```

ETAPA 2 — Análise de padrões + sugestões via Claude API
==
NODE 9 — HTTP Request (Supabase — buscar ai_reflections dos últimos 30 dias)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/ai_reflections
  Query params:
    user_id: eq.{{ $json.user_id }}
    created_at: gte.{{ new Date(Date.now()-30*24*3600*1000).toISOString() }}
    select: content,created_at
    order: created_at.desc

NODE 10 — Code (monta prompt para sugestões de hábitos)
  ```javascript
  const user = $('NODE 3').first().json;
  const reflections = $input.all().map(r => r.json.content).slice(0, 5).join('\n---\n');
  const mentor = user.mentor || 'jesus';

  let systemPrompt;
  if (mentor === 'jesus') {
    systemPrompt = 'Você é um mentor espiritual cristão especializado em hábitos e disciplina. ' +
      'Sugira 3 novos hábitos espirituais/práticos para o usuário baseados em seu progresso. ' +
      'Tom: bíblico, encorajador. Responda APENAS com JSON: {"sugestoes": ["hábito1", "hábito2", "hábito3"]}';
  } else {
    systemPrompt = 'Você é Eslen Delanogare, especialista em neurociência de hábitos. ' +
      'Sugira 3 novos microhábitos baseados na neurociência para o usuário. ' +
      'Tom: científico. Responda APENAS com JSON: {"sugestoes": ["hábito1", "hábito2", "hábito3"]}';
  }

  return [{ json: {
    user_id: user.id,
    username: user.username,
    mentor,
    xp: user.xp,
    systemPrompt,
    context: reflections || 'Sem reflexões anteriores',
  }}];
  ```

NODE 11 — HTTP Request (Claude API — gerar sugestões)
  URL: https://api.anthropic.com/v1/messages
  Headers: x-api-key + anthropic-version + content-type
  Body:
  ```json
  {
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 200,
    "system": "{{ $json.systemPrompt }}",
    "messages": [{
      "role": "user",
      "content": "Usuário: {{ $json.username }}, XP: {{ $json.xp }}. Reflexões recentes: {{ $json.context }}"
    }]
  }
  ```

NODE 12 — Code (parse JSON da resposta Claude)
  ```javascript
  const raw = $input.first().json.content[0].text;
  let sugestoes;
  try { sugestoes = JSON.parse(raw).sugestoes || []; }
  catch(e) { sugestoes = [raw]; }
  const prev = $('NODE 10').first().json;
  return [{ json: { ...prev, sugestoes } }];
  ```

NODE 13 — HTTP Request (Supabase — INSERT habit_suggestions)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/habit_suggestions
  Method: POST
  Headers: apikey + Authorization + Content-Type + Prefer: return=minimal
  Body:
  ```json
  {
    "user_id": "{{ $json.user_id }}",
    "suggestions": {{ JSON.stringify($json.sugestoes) }},
    "created_at": "{{ new Date().toISOString() }}"
  }
  ```

NODE 14 — HTTP Request (Supabase — UPSERT user_patterns)
  URL: https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/user_patterns
  Method: POST
  Headers: apikey + Authorization + Content-Type + Prefer: resolution=merge-duplicates
  Body:
  ```json
  {
    "user_id": "{{ $json.user_id }}",
    "peak_days": [],
    "peak_hours": [],
    "weak_habits": {{ JSON.stringify($json.sugestoes.map(s => ({ texto: s, taxa: 0 }))) }},
    "updated_at": "{{ new Date().toISOString() }}"
  }
  ```
  Nota: peak_days/peak_hours ficam vazios no MVP (não temos timestamps por conclusão).
  Fase futura: adicionar campo de timestamp ao confirmar meta em app.js.

NODE 15 — Loop back para próximo usuário (Next Batch)
```

- [ ] **Step 3: Validar e criar o workflow**

1. `mcp__claude_ai_n8n__validate_workflow` → corrigir erros
2. `mcp__claude_ai_n8n__create_workflow_from_code` com description: `"Envia alertas de streak às 20h, analisa padrões de hábito e gera sugestões personalizadas via Claude API para todos os usuários premium"`

- [ ] **Step 4: Testar o workflow**

`mcp__claude_ai_n8n__test_workflow` com o workflow ID.

Verificar no Supabase após o teste:
```sql
-- Deve ter novas sugestões
SELECT * FROM habit_suggestions ORDER BY created_at DESC LIMIT 5;

-- Deve ter padrões atualizados
SELECT * FROM user_patterns ORDER BY updated_at DESC LIMIT 5;
```

- [ ] **Step 5: Publicar o workflow**

`mcp__claude_ai_n8n__publish_workflow` com o workflow ID.

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "feat: N8N workflow habitos-diario - streak alerts + pattern analysis + habit suggestions"
```

---

## Verificação Final

Após completar todas as tasks, confirmar:

- [ ] `habit_suggestions` e `user_patterns` existem no Supabase (`list_tables`)
- [ ] Edge Function `send-push` deployada e testada com sucesso
- [ ] Skill `/coach-report` executa sem erros ao chamar no Claude Code
- [ ] Skill `/habitos-analise` executa sem erros ao chamar no Claude Code
- [ ] N8N "Coach Diário" está publicado e agendado para 9h
- [ ] N8N "Hábitos Diário" está publicado e agendado para 20h
- [ ] No browser: após login com streak ≥ 2 e sem metas do dia → nudge laranja aparece em 6s
- [ ] No browser: metas sem conclusão em 7 dias mostram hint `.hint-problematica`
- [ ] app.js deployado no servidor via `deploy_metas.py`

## Critérios de sucesso (do spec)

- Às 9h: todos os usuários premium com push_subscription recebem notificação com insight personalizado
- No login: nudge de streak aparece quando streak ≥ 2 e nada foi feito hoje
- Às 20h: usuários sem atividade hoje recebem push preventivo
- Sugestões de hábitos salvas em `habit_suggestions` e disponíveis para consulta
- Skills manuais funcionando para testes individuais
