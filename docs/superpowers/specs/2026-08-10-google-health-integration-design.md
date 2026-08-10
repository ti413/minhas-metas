# Integração Google Health API (Google Fit) — Minhas Metas

_Design aprovado em 2026-08-10._

## Objetivo

Permitir que o usuário conecte sua conta Google (Health Connect/Google Fit) ao Minhas Metas e tenha os passos e a quilometragem do dia exibidos automaticamente num card do dashboard, sem registro manual.

## Contexto e decisões

- A "Google Fit REST API" clássica está sendo desativada pelo Google até o fim de 2026 e fechada pra novos cadastros desde maio de 2024 — **não é usada aqui**. A integração usa a **Google Health API** (`health.googleapis.com`), o substituto oficial baseado em Google Cloud + OAuth2 padrão.
- **Polling periódico** (cron no N8N) em vez de webhook em tempo real — decisão explícita do Marcus. O modelo de webhook da Google Health API existe mas exige 3 camadas de configuração (subscriber + subscription + handshake de verificação em 2 etapas) com risco real de falha (`FAILED_PRECONDITION`); polling entrega o mesmo resultado visual (card atualiza algumas vezes ao dia) com muito menos superfície de erro. Webhook fica como possível iteração futura, não neste escopo.
- **Cobertura essencialmente Android** — a Google Health API lê do Health Connect, que não existe no iOS. Usuários de iPhone não conseguem conectar por essa via. Aceito pelo Marcus; fora de escopo resolver pra iOS (seria uma integração via Apple Health, totalmente separada).
- **Card separado** "Google Fit hoje" no dashboard — não soma com o card do Strava, evita contar a mesma atividade em dobro se o usuário tiver as duas fontes conectadas.
- Escala do app está bem abaixo do limite de 100 usuários que um app OAuth do Google em modo "Testing" (não verificado) permite — segue nesse modo, sem custo de verificação/avaliação CASA. **Esse teto é vitalício e não reseta** — risco documentado, não bloqueador agora.

## Setup no Google Cloud (já feito, 2026-08-10)

- Projeto: `minhas-metas` (Google Cloud Console, conta correta do Marcus — não a da igreja, que foi criada por engano e excluída)
- API ativada: **Google Health API** (`health.googleapis.com`)
- Tela de consentimento OAuth: tipo **Externo**, status **Testando**, e-mails de teste cadastrados
- Escopo habilitado: `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` (cobre passos, distância, altitude, andares)
- OAuth Client ID tipo **Aplicativo da Web**, redirect URI `https://n8n.campostecnologia.cloud/webhook/google-health-oauth-callback`
- Client ID / Client Secret: guardados em `.env` local (`projects/minhas-metas/.env`, gitignored) — usados apenas pelo workflow N8N (secret) e pelo frontend (client_id, que é público), nunca o secret no frontend.

## Arquitetura

```
Usuário no app       N8N (backend)                    Google Health API      Supabase
     │                     │                                  │                  │
     │─ clica "Conectar" ─►│                                  │                  │
     │  (redirect Google)  │                                  │                  │
     │                     │                                  │                  │
     │◄── autoriza no Google (fora do nosso controle) ────────┤                  │
     │                     │                                  │                  │
     │── code + state ────►│ Workflow: OAuth callback         │                  │
     │                     │── troca code por tokens ────────►│                  │
     │                     │◄── access/refresh token ─────────┤                  │
     │                     │── upsert google_health_connections ─────────────────►│
     │◄── redirect de volta┤                                  │                  │
     │  (?googlefit=conectado)                                │                  │
     │                     │                                  │                  │
     │  [a cada poucas horas, cron dispara]                   │                  │
     │                     │ Workflow: Poll Diário             │                  │
     │                     │── pra cada linha em google_health_connections:      │
     │                     │── renova token se expirado ─────►│                  │
     │                     │── busca dailyRollUp (steps+dist) ►│                  │
     │                     │◄── totais do dia ─────────────────┤                  │
     │                     │── upsert google_health_daily ───────────────────────►│
     │                     │                                  │                  │
     │── app lê google_health_daily do dia (via Supabase) ────────────────────────►│
     │◄── card "Google Fit hoje" ──────────────────────────────────────────────────┤
```

## Componentes

### 1. Supabase — migration nova
Sem tabela pré-existente (diferente do Strava). Duas tabelas, mesmo padrão de RLS confirmado nas tabelas do Strava (`select own ... — auth.uid() = user_id`, role `authenticated`, sem policy de insert/update/delete — escrita só via `service_role` do N8N):

- **`google_health_connections`** (1 linha por usuário): `user_id` (PK, FK `auth.users`), `google_health_user_id` (identificador retornado pela Health API, usado pra casar leituras de volta ao `user_id`), `access_token`, `refresh_token`, `expires_at`, `scope`, `connected_at`, `updated_at`.
- **`google_health_daily`** (1 linha por usuário por dia): `id` bigint identity PK, `user_id` FK, `metric_date` date, `steps` integer, `distance_meters` numeric, `updated_at`. Unique `(user_id, metric_date)`.

Por que uma linha por dia e não por "atividade" como no Strava: a Google Health API entrega totais agregados do dia (`dailyRollUp`), sem granularidade de atividade discreta — não há o que guardar em nível de "atividade individual". Upsert por `on_conflict=user_id,metric_date`.

### 2. N8N — Workflow "Google Health - OAuth Callback" (implementado 2026-08-10)
- **Workflow ID**: `8Eitipbz1aVmL1ha` — nome `Google Health - OAuth Callback`, publicado (ativo) em `https://n8n.campostecnologia.cloud/webhook/google-health-oauth-callback`.
- Mirror exato do "Strava - OAuth Callback" (`qfuonnXY1pL79nUM`), incluindo o padrão de conexão de erro (`onError: continueErrorOutput` no output 1 dos dois nodes HTTP Request, ligado a "Redirect Erro").
- `GET` webhook recebe `code` + `state` (= `user_id`).
- Se `error` presente (usuário cancelou): redireciona pra `?googlefit=cancelado`, sem gravar nada.
- `POST https://oauth2.googleapis.com/token` trocando `code` por tokens (`grant_type=authorization_code`, `client_id`/`client_secret`/`redirect_uri`).
- Upsert em `google_health_connections` (`on_conflict=user_id`) via PostgREST, headers `apikey`/`Authorization: Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}`.
- Todo HTTP node externo com `onError: continueErrorOutput` → redireciona pra `?googlefit=erro` (nunca deixa o usuário preso numa página de erro crua do N8N — lição aprendida e já corrigida na integração do Strava).
- Redireciona de volta: `?googlefit=conectado`.
- **`google_health_user_id` resolvido como `null` por enquanto**: o escopo usado (`googlehealth.activity_and_fitness.readonly`) não inclui `openid`/`profile`, então a resposta do token exchange do Google não traz `id_token` nem qualquer identificador de usuário — confirmado batendo o `state` (=`user_id` do Supabase) contra o comportamento padrão documentado do OAuth2 do Google para esse escopo, sem chamada extra de perfil. Não bloqueia a Task 5 (o Poll Diário itera todas as linhas de `google_health_connections` diretamente, sem precisar de lookup por esse ID externo). Se um uso futuro precisar do ID, adicionar `openid`/`profile` ao escopo e decodificar o `id_token`, ou chamar um endpoint de perfil à parte.
- Testado com `test_workflow` (pin data) nos três caminhos: cancelamento (`error=access_denied` → `Redirect Cancelado`), sucesso (token pinado → `Redirect Conectado`) e falha real (token exchange não pinado, sem `GOOGLE_HEALTH_CLIENT_ID` configurado ainda no servidor → Google retornou 400 `invalid_request` → branch de erro → `Redirect Erro`). Os três terminam em redirect, nenhum trava a execução.

### 3. N8N — Workflow "Google Health - Poll Diário" (implementado 2026-08-10)
- **Workflow ID**: `nhcf5fPkcvvgekpd` — nome `Google Health - Poll Diário`, publicado (ativo), projeto pessoal `marcus Campos`.
- **Schedule Trigger**: a cada 4 horas.
- `GET` PostgREST em `google_health_connections` (todas as linhas) → `Preparar conexoes` (Code node) achata o resultado (proteção `Array.isArray` — mesmo cuidado do bug real corrigido no Strava) e calcula `precisaRenovar` por linha.
- IF `Token expirado?` por conexão:
  - **true**: `Renovar token` (`POST oauth2.googleapis.com/token`, `grant_type=refresh_token`) → `Atualizar conexao` (PATCH, `Prefer: return=representation`, só sobrescreve `refresh_token` se a resposta trouxer um novo) → `Extrair conexao atualizada` (unwrap `Array.isArray`) → `Token para uso`.
  - **false**: vai direto pra `Token para uso` com o token já válido.
  - `Token para uso` (NoOp) é o ponto de convergência único usado como referência (`$("Token para uso")`) pelas chamadas seguintes, resolvendo a ambiguidade de qual node referenciar em cada branch.
- `Buscar Passos (dailyRollUp)` e `Buscar Distancia (dailyRollUp)` — duas chamadas `POST` separadas (uma por `dataType`, já que o path da Health API é `users/{user}/dataTypes/{dataType}/dataPoints:dailyRollUp`, um `dataType` por request) → `Montar payload diario` (Code) combina os dois resultados → `Gravar google_health_daily` (upsert `on_conflict=user_id,metric_date`).
- `onError: continueErrorOutput` em toda chamada externa (Buscar conexões, Renovar token, Atualizar conexão, Buscar Passos, Buscar Distancia, Gravar diário) → cada uma tem um NoOp terminal próprio (`Erro ao ...`) — nunca interrompe o loop pros outros usuários.
- Testado com `test_workflow` (pin data: 1 conexão com token válido + 1 com token expirado) — confirmado que os dois caminhos (direto e renovação) chegam ao node final `Gravar google_health_daily` com sucesso e com `user_id`/`access_token` corretamente pareados por branch (`pairedItem` do n8n rastreado corretamente através de `Token para uso`).

**⚠️ Duas premissas NÃO verificadas contra a API real do Google — pendentes de confirmação na Task 6 (primeiro teste end-to-end com token real):**

1. **Path `users/me`**: a doc oficial do Google Health API (`developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp`) mostra `users/me/dataTypes/steps` e `users/me/dataTypes/distance` como exemplo explícito no próprio texto de referência — confiança alta (é o exemplo oficial da doc, não só convenção inferida de outras APIs do Google), mas ainda não testado contra uma chamada real. Se falhar, a alternativa é usar o `google_health_user_id` — que hoje está sempre `null` (ver nota da Task 4) — o que exigiria adicionar escopo `openid`/`profile` primeiro.
2. **Shape do request/response do `dailyRollUp`**: a doc pública dá o formato geral (`range.start`/`range.end` como `CivilDateTime` com `date.year/month/day`, `windowSizeDays`) e o response (`rollupDataPoints[].steps.countSum` / `.distance.metersSum`), mas a doc não é 100% consistente na formatação exata (casing `count_sum` vs `countSum`, `date` aninhado vs campos soltos) — o node final foi escrito com a leitura mais provável (camelCase, `date` aninhado, seguindo convenção proto3-JSON padrão do Google), mas isso **precisa ser confirmado com uma chamada real** na Task 6. Se os nomes de campo do response estiverem errados, `Montar payload diario` vai gravar `steps`/`distance_meters` como `null` silenciosamente (sem quebrar o workflow) — checar visualmente o card "Google Fit hoje" depois do primeiro teste real vai revelar isso rápido.
3. **`Renovar token` usa `form-urlencoded`** (não JSON) — diferente do node "Trocar code por token" da Task 4 (`8Eitipbz1aVmL1ha`, já publicado), que usa JSON mirrorando o padrão do Strava. Isso é proposital: a doc do Google (`oauth2.googleapis.com/token`) espera `application/x-www-form-urlencoded`. Se o teste real da Task 6 confirmar que o `form-urlencoded` funciona aqui, o node JSON da Task 4 provavelmente também precisa ser corrigido (não foi corrigido nesta task — está fora do escopo da Task 5, só o node novo foi construído certo).

### 4. Frontend (`app.js` / `index.html`)
Mirror 1:1 do padrão Strava:
- `conectarGoogleFit()` — monta URL de autorização (`accounts.google.com/o/oauth2/v2/auth`), com `client_id` público, `redirect_uri`, `scope=https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`, `access_type=offline&prompt=consent` (necessário pro Google devolver `refresh_token`), `state=<user_id>`.
- `checkGoogleFitReturn()` — trata `?googlefit=conectado|cancelado|erro`, mesmo padrão de toast + limpeza de URL do `checkStravaReturn()`.
- `renderGoogleFitCard()` — lê `google_health_connections` (esconde card se não conectado) e `google_health_daily` do dia. Destrincha e `console.warn` o campo `error` das duas queries (mesma correção já aplicada no Strava — não deixar regredir pra erro engolido em silêncio).
- Botão no dropdown do usuário: `👣 Conectar com Google Fit`.
- Card novo no dashboard: reaproveita `.streak-card`/`.dash-section` — sem CSS novo. Passos como número principal (sempre presente), km como texto secundário (`distance` pode ficar nulo em dias sem atividade com GPS).

## Fora de escopo (YAGNI)
- Webhook em tempo real (fica pra iteração futura, se o polling se mostrar insuficiente).
- Suporte a iOS/Apple Health.
- Verificação pública do app / avaliação CASA (só necessário se ultrapassar 100 usuários conectados).
- Qualquer edição na estrutura de dados `metas_data.state` ou no card do Strava.

## Riscos conhecidos
- Teto vitalício de 100 usuários em modo não verificado — sem reset. Se o app crescer perto disso, decidir depois se vale pagar a avaliação CASA anual ou limitar a feature.
- Exatidão de endpoints/scopes específicos da Google Health API (`dailyRollUp`, `google_health_user_id`) precisa ser confirmada contra chamadas reais no momento da implementação.

## Testes
- Conectar uma conta Google de teste (da lista de usuários de teste) ponta a ponta.
- Rodar o workflow de poll manualmente com a conexão de teste, confirmar linha em `google_health_daily` com steps/km plausíveis.
- Verificar visualmente o card "Google Fit hoje" no app.
- Verificar renovação automática de token (forçar `expires_at` no passado numa linha de teste).
- Deploy segue o fluxo padrão (`deploy-metas`), **incrementando a versão do cache em `sw.js`** (lição aprendida na integração do Strava).
