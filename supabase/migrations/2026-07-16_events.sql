-- Telemetria de produto: funil onboarding → paywall → pagamento + uso
-- Aplicar via Supabase MCP (apply_migration) ou SQL Editor.
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  evento text not null,
  props jsonb not null default '{}'::jsonb,
  client_ts timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists events_evento_idx on public.events (evento, created_at desc);
create index if not exists events_user_idx on public.events (user_id, created_at desc);

alter table public.events enable row level security;

-- Qualquer um (anon incluído, para eventos pré-login do onboarding) pode inserir;
-- ninguém lê pelo client (leitura só via service_role / MCP).
create policy "events_insert_all" on public.events
  for insert to anon, authenticated with check (true);
