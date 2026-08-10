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
