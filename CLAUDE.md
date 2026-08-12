# CLAUDE.md — Minhas Metas

> App PWA de hábitos. Produto principal do Marcus, ativo em produção com usuários pagantes.

---

## Stack
- **Frontend:** HTML + CSS + JS vanilla (sem framework) — PWA instalável
- **Auth + DB:** Supabase (`https://tpcawmrblanpkgoqisgw.supabase.co`, projeto "Metas", `tpcawmrblanpkgoqisgw`)
- **Coach IA:** N8N webhook (`https://n8n.campostecnologia.cloud/webhook/coach-minhas-metas`)
- **Pagamento:** Stripe (ainda em modo teste)
- **Font:** DM Sans

## Arquivos do projeto
```
index.html         → HTML
styles.css          → todo CSS
app.js              → todo JS
sw.js               → service worker (cache PWA)
landing.html        → landing page v1 (clara)
landing-v2.html     → landing page v2 (escura, atual)
monitor.py          → agente de processo (roda no servidor via cron)
supabase/migrations/→ migrations do banco
docs/superpowers/   → plans/specs de features implementadas via workflow superpowers
```
`review_metas.py` (revisão estática) fica fora do repo, em `C:\Users\Administrador\`.

Documentação técnica adicional (AGENTS.md, SECURITY_AUDIT.md, PWA_PERFORMANCE.md
etc.) existiu numa branch antiga (`main`) que ficou desatualizada — o código real
e ativo é sempre a branch **`master`**. Se recriar esses docs, fazer a partir do
estado atual do código, não copiar da `main`.

## Identidade visual (paleta oficial — usar em artes e landing)
```
Dark (padrão p/ artes):          Light:
--green:   #4CAF87               --green:   #3d9e72
--green-light: #5dc496           --green-pale: #e8f5ef
--green-dark:  #7dd4aa           --green-dark: #1f5c42
--ink:     #f0f5f2 (texto)       --ink:     #1a1f1c
--muted:   #8a9e94               --muted:   #6b7c74
--surface: #1a1f1c (fundo)       --surface: #f5faf7
--border:  #2e3832               --border:  #e0ece6
```
Fonte: DM Sans. NUNCA inventar paleta — sempre ler de `styles.css`.

## Domínios
- `metas.campostecnologia.cloud` → o app (produção, `/var/www/metas/`)
- `campostecnologia.cloud/landing-v2.html` → landing page
- `n8n.campostecnologia.cloud` → N8N

## Coaches (rebrand jul/2026 — jurídico)
- `jesus` (Jesus) e `estoico` (Coach Marco — estoicismo)
- Backend N8N usa chave `huberman` por compat — **NUNCA usar o nome real "Eslen Delanogare" em nenhum arquivo**; se precisar, dizer "neurocientista"

## Deploy
- **Método:** Python/paramiko (SFTP) — **NÃO usar scp**
- **Script:** `C:\Users\Administrador\deploy_metas.py` (roda a partir de `C:\Users\Administrador\Desktop\PROJETOS\Projeto app metas`, envia os arquivos versionados no git da raiz + `monitor.py`)
- **Destino:** `/var/www/metas/` no servidor `2.24.99.6`
- Skill dedicada: `deploy-metas` (revisão estática → commit → deploy → verificação visual)
- **Não fazer deploy parcial** — esperar todas as mudanças do bloco antes de subir

## Servidor de produção
- **IP:** 2.24.99.6 | **User:** root
- **Nginx config:** `/etc/nginx/sites-enabled/stack`
- **N8N:** Docker `n8nio/n8n:latest` na porta 5678

## Supabase
- **URL:** `https://tpcawmrblanpkgoqisgw.supabase.co`
- **Tabelas principais:** `profiles`, `metas_data`, `streaks`, `daily_challenges`, `achievements`, `ai_reflections`, `push_subscriptions`, `habit_suggestions`, `user_patterns`, `agenda_tarefas`, `events`, `strava_connections`, `strava_activities`, `catalogo_produtos`, `admin_config`
- **Auth:** Google + email/senha
- Regras críticas de segurança (token só em `sessionStorage`, admin via `OWNER_EMAILS`, premium validado server-side no campo `profiles.premium`)

## Skills relacionadas
- `deploy-metas` — deploy completo
- `metas-arte-instagram` — artes pro Instagram do app
- `proximas-melhorias` — ritual de priorização de features
- `analise-concorrente` — benchmarking com concorrentes
- `migration-validator`, `supabase-sync-checker` — segurança de schema antes de aplicar mudanças no banco
