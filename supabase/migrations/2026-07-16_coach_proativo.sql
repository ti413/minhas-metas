-- Tabelas do agente coach proativo (plano docs/superpowers/plans/2026-06-25-agente-coach-habitos.md)
-- Aplicar via Supabase MCP (apply_migration) ou SQL Editor.
create table if not exists public.habit_suggestions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sugestao text not null,
  motivo text,
  aceita boolean,
  created_at timestamptz not null default now()
);

create table if not exists public.user_patterns (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  padrao jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (user_id)
);

alter table public.habit_suggestions enable row level security;
alter table public.user_patterns enable row level security;

create policy "habit_suggestions_own" on public.habit_suggestions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_patterns_own" on public.user_patterns
  for select to authenticated using (auth.uid() = user_id);
