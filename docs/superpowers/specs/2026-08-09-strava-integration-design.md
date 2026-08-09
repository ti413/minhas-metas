# Integração Strava — Minhas Metas

_Design aprovado em 2026-08-09._

## Objetivo

Permitir que o usuário conecte sua conta do Strava ao Minhas Metas e tenha a quilometragem percorrida no dia (corrida, pedal, caminhada etc.) exibida automaticamente no app, sem precisar registrar manualmente.

## Fora de escopo

- Contagem de passos (o Strava não fornece esse dado via API — vem de pedômetro/Google Fit/Apple Health, não de GPS de atividade).
- Auto-completar metas existentes com base em atividade do Strava (avaliado e descartado nesta rodada — metas hoje são só checklist booleano, sem campo numérico. Pode virar uma iteração futura).
- Qualquer edição na estrutura de dados `metas_data.state` (checklist de hábitos permanece intocado).

## Arquitetura

```
Usuário no app          N8N (backend)                  Strava API           Supabase
     │                        │                              │                   │
     │── clica "Conectar" ───►│                              │                   │
     │   (redirect p/ Strava) │                              │                   │
     │                        │                              │                   │
     │◄──── autoriza no Strava (fora do nosso controle) ─────┤                   │
     │                        │                              │                   │
     │──── code + state ─────►│ Workflow 1: OAuth callback   │                   │
     │  (redirect_uri = N8N)  │── troca code por tokens ────►│                   │
     │                        │◄──── access/refresh token ───┤                   │
     │                        │── upsert strava_connections ─┼──────────────────►│
     │◄── redirect de volta ──┤                              │                   │
     │   (?strava=conectado)  │                              │                   │
     │                        │                              │                   │
     │  [pessoa termina uma atividade no Strava]              │                   │
     │                        │◄──── webhook POST ────────────┤                   │
     │                        │ Workflow 2: evento de atividade                  │
     │                        │── busca detalhe da atividade ►│                   │
     │                        │◄─── distância, tipo, data ────┤                   │
     │                        │── upsert strava_activities ──┼──────────────────►│
     │                        │                              │                   │
     │── app lê strava_activities do dia (via Supabase) ──────────────────────────►│
     │◄── card "Hoje você percorreu X km" ─────────────────────────────────────────┤
```

## Componentes

### 1. App Strava (externo, já criado)
- Nome: `Minhasmetas_app`, categoria "Importador de Dados"
- Site: `https://metas.campostecnologia.cloud`
- Domínio de callback: `n8n.campostecnologia.cloud`
- Client ID / Client Secret: guardados em `.env` local (`projects/minhas-metas/.env`, gitignored) — usados apenas pelo workflow N8N, nunca no frontend.

### 2. Supabase (tabelas já existentes, migration `20260727104942_strava_integration`, reaproveitadas sem alteração de schema)
- `strava_connections` — 1 linha por usuário: `user_id`, `strava_athlete_id` (unique), `access_token`, `refresh_token`, `expires_at`, `scope`.
- `strava_activities` — 1 linha por atividade: `user_id`, `strava_activity_id` (unique, evita duplicata), `type`, `distance`, `moving_time`, `activity_date`, `calories`, `raw` (payload completo).
- RLS já habilitado em ambas (usuário só lê a própria linha).

### 3. N8N — Workflow 1: OAuth callback
- Endpoint `GET /webhook/strava-oauth-callback`.
- Recebe `code` (autorização) e `state` (= `user_id` do Supabase, passado pelo frontend na URL de autorização).
- Se vier `error=access_denied` (usuário cancelou): redireciona para `metas.campostecnologia.cloud/?strava=cancelado`, sem gravar nada.
- Caso contrário: `POST https://www.strava.com/oauth/token` trocando `code` por `access_token`/`refresh_token`/`expires_at`/`athlete.id`, usando `client_id`/`client_secret` (credenciais N8N).
- Upsert em `strava_connections` (`onConflict: user_id`).
- Redireciona de volta: `metas.campostecnologia.cloud/?strava=conectado`.

### 4. N8N — Workflow 2: recebimento de atividades (webhook Strava)
- Assinatura de push única a nível de app (não por usuário) — criada uma vez via `POST https://www.strava.com/api/v3/push_subscriptions` (`callback_url` apontando pro endpoint deste workflow, `verify_token` definido por nós). Setup manual, feito uma vez após o workflow estar no ar.
- `GET` (verificação do Strava): responde com o `hub.challenge` recebido.
- `POST` (evento real): payload traz `owner_id` (= `strava_athlete_id`), `object_type`, `aspect_type`, `object_id` (= id da atividade).
  - Ignora eventos com `object_type != "activity"`.
  - Busca `strava_connections` pelo `strava_athlete_id` para achar o `user_id` e os tokens.
  - Se `expires_at` já passou, renova o token (`POST oauth/token` com `grant_type=refresh_token`) e atualiza `strava_connections`.
  - `GET /api/v3/activities/{object_id}` para pegar `distance`, `type`, `moving_time`, `start_date_local`, `calories`.
  - Upsert em `strava_activities` (`onConflict: strava_activity_id`) — cobre tanto `aspect_type=create` quanto `update` (edição de atividade no Strava atualiza a linha).
  - Se `aspect_type=delete`: apaga a linha correspondente (`strava_activity_id`) de `strava_activities`.

### 5. Frontend (`app.js` / `index.html`)
- Botão "Conectar com Strava" nas configurações do app (perto de outras integrações, se existir seção assim — senão, seção nova simples).
  - Monta URL: `https://www.strava.com/oauth/authorize?client_id=...&redirect_uri=<callback N8N>&response_type=code&scope=activity:read&state=<user_id>`.
  - `window.location.href = url`.
- Ao voltar (`?strava=conectado` ou `?strava=cancelado` na URL), mostra toast de confirmação e limpa o parâmetro da URL.
- Card novo no dashboard: "Hoje você percorreu X km" — soma `distance` de `strava_activities` do dia (`activity_date = hoje`, `user_id = usuário logado`), convertida de metros para km. Só aparece se o usuário tiver `strava_connections` ativa. Se não houve atividade no dia, card mostra 0 km ou fica oculto (decisão de implementação, sem impacto de arquitetura).
- Consulta via cliente Supabase já existente no app (mesmo padrão usado pra `metas_data`), respeitando RLS.

## Erros e casos de borda
- Usuário desconecta o Strava (revoga acesso lá): próxima tentativa de refresh token falha (401) — workflow 2 deve simplesmente logar e pular o evento, sem crashar. Endpoint de "desconectar" no app (deletar linha de `strava_connections`) fica como melhoria futura, fora deste escopo inicial.
- Rate limit do Strava (200/15min, 2000/dia para este app): webhook de atividade individual não deve esbarrar nisso em uso normal.
- Atividade sem GPS/distância (ex: musculação): `distance` fica `null` — card soma ignorando nulos.

## Testes
- Conectar uma conta Strava de teste ponta a ponta (autorizar → callback → linha em `strava_connections`).
- Registrar uma atividade de teste no Strava → confirmar que o webhook populou `strava_activities` com os dados certos.
- Editar/apagar a atividade de teste no Strava → confirmar que o `update`/`delete` refletem na tabela.
- Verificar card no dashboard somando corretamente km de múltiplas atividades no mesmo dia.
- Verificar renovação automática de token (forçar `expires_at` no passado numa linha de teste).
