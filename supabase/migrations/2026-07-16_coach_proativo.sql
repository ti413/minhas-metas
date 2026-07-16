-- NOTA (2026-07-16): as tabelas já existiam no projeto com schema próprio,
-- criadas na primeira tentativa da automação. Este arquivo documenta o schema
-- REAL em produção — não precisa ser aplicado.
--
-- public.habit_suggestions:
--   id uuid PK, user_id uuid, suggestions jsonb, created_at timestamptz
--
-- public.user_patterns:
--   id uuid PK, user_id uuid, peak_days jsonb, peak_hours jsonb,
--   weak_habits jsonb, updated_at timestamptz
--
-- Ambas com RLS habilitado. Índice adicional aplicado abaixo (idempotente):

create index if not exists habit_suggestions_user_idx on public.habit_suggestions (user_id, created_at desc);
