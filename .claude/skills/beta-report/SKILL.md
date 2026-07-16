---
name: beta-report
description: Gera o relatório semanal do beta do Minhas Metas a partir da tabela Supabase `events` — funil onboarding→paywall→pagamento, retenção D1/D7/D30, uso do coach e pontos de abandono. Use SEMPRE que o Marcus pedir "relatório do beta", "como estão os números", "funil da semana", "métricas do app" ou variações.
---

# Beta Report — Minhas Metas

Você vai gerar um relatório de métricas do beta consultando o Supabase (projeto `tpcawmrblanpkgoqisgw`) via Supabase MCP (`execute_sql`, somente leitura).

## Passos

1. **Período**: padrão = últimos 7 dias. Se o Marcus pedir outro período, ajuste.

2. **Funil de conversão** (eventos: `onboarding_start`, `onboarding_step`, `onboarding_done`, `login`, `paywall_view`, `checkout_start`, `premium_converted`):
```sql
select evento, count(distinct coalesce(user_id::text, props->>'anon')) as usuarios, count(*) as total
from events where created_at > now() - interval '7 days'
group by evento order by 2 desc;
```
Monte o funil na ordem: onboarding_start → onboarding_done → login → paywall_view → checkout_start → premium_converted. Calcule % de queda em cada etapa.

3. **Retenção D1/D7** (evento `dia_fechado` ou `login` por usuário):
```sql
with primeiro as (select user_id, min(created_at)::date as d0 from events where user_id is not null group by 1)
select
  count(*) filter (where exists (select 1 from events e where e.user_id = p.user_id and e.created_at::date = p.d0 + 1)) as d1,
  count(*) filter (where exists (select 1 from events e where e.user_id = p.user_id and e.created_at::date between p.d0 + 5 and p.d0 + 9)) as d7,
  count(*) as coorte
from primeiro p where p.d0 > now()::date - 30;
```

4. **Uso do coach**: eventos `coach_msg` por usuário/semana; % dos usuários ativos que usaram o coach ≥2x.

5. **Hábitos**: `habito_criado` (média por usuário), `dia_fechado` (pct médio via `props->>'pct'`), uso de freeze (badge `freeze_usado` não gera evento — pular por ora).

6. **Relatório final** em poucas linhas:
   - Funil com números absolutos e % (destaque o maior buraco)
   - Retenção D1/D7 vs metas do beta (D7 ≥ 25%)
   - Uso do coach ≥ 2x/semana (meta de saída do beta)
   - 2–3 recomendações acionáveis baseadas nos buracos

## Regras
- Somente SELECT — nunca INSERT/UPDATE/DELETE.
- Se a tabela `events` não existir ainda, avisar e apontar a migration `supabase/migrations/2026-07-16_events.sql`.
- Números pequenos (<10 usuários): reportar em absoluto, não em %, e avisar da baixa significância.
