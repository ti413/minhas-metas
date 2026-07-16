---
name: growth-experimento
description: Define, ativa e mede experimentos de growth no Minhas Metas usando flags remotas do admin_config (Supabase) e a tabela events — sem redeploy. Use quando o Marcus quiser "testar preço", "rodar um A/B", "experimento de conversão", "testar copy do paywall" ou variações.
---

# Growth Experimento — Minhas Metas

Experimentos via `admin_config.config` (Supabase, id=1) — o app lê essa config no load (`loadAdminConfig` em app.js), então mudanças valem sem deploy. Medição via tabela `events`.

## Contexto de mercado (Adapty SOIS 2026)
Win-rate por tipo de experimento: **preço localizado 62% > estrutura de planos 58% > duração de trial 59% > visual/copy 34%**. Priorize preço e estrutura de planos; evite gastar experimento com copy.

## Chaves de config que o app já entende
| Chave | Efeito |
|---|---|
| `precoMensal`, `precoAnual`, `precoAnualMes` | textos de preço no paywall |
| `stripeLinkMensal`, `stripeLinkAnual` | Payment Links do checkout |
| `trialDays` | duração do trial |
| `modulos` (`{agenda,treino,extras}`) | módulos opcionais na nav |
| `msgPerfeito`, `msgBom`, `msgAmanha`, `paywallTexto` | copys |

## Fluxo

1. **Hipótese**: escreva em 1 frase: "Se mudarmos X, esperamos que [métrica] melhore de A para B, porque C."
2. **Baseline**: rode a consulta da métrica-alvo em `events` nos últimos 7–14 dias ANTES de mudar (ex: `paywall_view` → `checkout_start` rate).
3. **Ativar**: `execute_sql` UPDATE no `admin_config.config` (jsonb_set) com a variante. Confirmar com o Marcus antes de mexer em preço real.
4. **Registrar**: anotar o experimento em `docs/experimentos.md` (criar se não existir): data início, hipótese, config anterior (para rollback), métrica-alvo.
5. **Medir**: após ≥7 dias ou ≥30 usuários no funil, comparar métrica antes/depois. Reportar: variação absoluta, % e recomendação (manter/reverter).
6. **Reverter** se pior: restaurar config anterior anotada no passo 4.

## Regras
- Um experimento por vez (a base de usuários é pequena — sem tráfego para split real; é before/after).
- Nunca mudar preço exibido sem atualizar o Payment Link correspondente (senão o checkout cobra diferente do prometido).
- Sempre guardar o valor anterior da config antes do UPDATE.
