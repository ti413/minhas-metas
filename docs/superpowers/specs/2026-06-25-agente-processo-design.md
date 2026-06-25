# Spec: Agente de Processo — Minhas Metas

> Data: 2026-06-25
> Projeto: Minhas Metas (PWA de hábitos)
> Responsável: Marcus

---

## Visão Geral

Agente de monitoramento operacional do app Minhas Metas. Roda a cada hora no servidor e envia push notification para Marcus quando detecta um problema. Inclui skill manual `/processo-check` para relatório detalhado sob demanda.

**Custo adicional:** zero — sem chamadas à Claude API. Usa apenas requests HTTP e Supabase REST.

---

## Componentes

| Componente | Localização | Responsabilidade |
|---|---|---|
| `monitor.py` | `/var/www/metas/monitor.py` | Executa todos os checks e envia push se houver falha |
| `cron` entry | `/etc/cron.d/metas-monitor` | Dispara `monitor.py` a cada hora |
| `.claude/commands/processo-check.md` | Projeto local | Skill manual — conecta ao servidor via paramiko e exibe relatório |
| `deploy_metas.py` | `C:\Users\Administrador\deploy_metas.py` | Atualizado para enviar `monitor.py` ao servidor |

---

## Checks executados

| Check | Método | Condição de falha |
|---|---|---|
| **Site no ar** | HTTP GET `http://2.24.99.6` | status ≠ 200 ou timeout > 10s |
| **Coach Diário (N8N)** | N8N API `GET /executions?workflowId=wpcNRkZXWGCYHAYB&limit=1` | hora atual ≥ 10h E última execução não é de hoje OU status = `error` |
| **Hábitos Diário (N8N)** | N8N API `GET /executions?workflowId=aKe8Ypv2akK4KijI&limit=1` | hora atual ≥ 21h E última execução não é de hoje OU status = `error` |
| **Supabase** | REST GET `https://tpcawmrblanpkgoqisgw.supabase.co/rest/v1/profiles?limit=1` | status ≠ 200 |
| **Edge Function send-push** | HTTP GET `https://tpcawmrblanpkgoqisgw.supabase.co/functions/v1/send-push` | status ∉ {200, 400, 405} (qualquer resposta válida = função ativa) |
| **Push subscriptions ativas** | Supabase REST COUNT em `push_subscriptions` | 0 registros (ninguém receberia push) |

---

## Lógica de alertas

```
monitor.py roda às HH:00

Para cada check:
  → SE falha: adiciona ao relatório de erros

SE há erros:
  → Chama send-push Edge Function com:
       user_id: MARCUS_USER_ID (configurado em /var/www/metas/monitor_config.py)
       title: "⚠️ Minhas Metas — Problema detectado"
       body: "[nome do check] com problema. Abra /processo-check para detalhes."
  → Loga em /var/log/metas-monitor.log

SE tudo ok:
  → Silêncio (sem push, sem ruído)
  → Loga "OK" em /var/log/metas-monitor.log
```

**Uma push por execução (não uma por check):** se 3 checks falharam, envia 1 push com o mais crítico. Evita spam.

**Prioridade dos alertas (mais → menos crítico):**
1. Site fora do ar
2. Supabase inacessível
3. Edge Function send-push offline
4. Coach Diário não rodou
5. Hábitos Diário não rodou
6. Push subscriptions zeradas

---

## Skill `/processo-check`

**Arquivo:** `.claude/commands/processo-check.md`

**Comportamento:**
1. Conecta ao servidor `2.24.99.6` via paramiko (mesmas credenciais do deploy)
2. Executa `python3 /var/www/metas/monitor.py --report`
3. Captura e exibe o output formatado no terminal do Claude Code

**Formato do relatório:**
```
🩺 Minhas Metas — Health Check  YYYY-MM-DD HH:MM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Site              200 OK (Xms)
✅ Coach Diário      rodou hoje às HH:MM — sucesso
✅ Hábitos Diário    rodou hoje às HH:MM — sucesso
✅ Supabase          acessível
✅ Edge Function     send-push ativa
⚠️ Push subscriptions  N ativas
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tudo operacional ✓
```

Ou em caso de falha:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ Coach Diário      NÃO rodou hoje (última: 2026-06-24 09:01)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 1 problema detectado — push enviado para Marcus
```

---

## `monitor.py` — estrutura interna

```python
# /var/www/metas/monitor.py
# Dependências: requests (já disponível no servidor Python padrão)

import sys
import requests
import json
from datetime import datetime, timezone

# Lê config local (não commitada)
from monitor_config import (
    MARCUS_USER_ID,
    N8N_API_KEY,
    SUPABASE_SERVICE_KEY,
    SUPABASE_URL,
    SEND_PUSH_URL,
)

CHECKS = [
    check_site,
    check_supabase,
    check_send_push,
    check_n8n_coach,
    check_n8n_habitos,
    check_push_subscriptions,
]

def run():
    report_mode = '--report' in sys.argv
    results = [check() for check in CHECKS]
    failures = [r for r in results if not r['ok']]

    if report_mode:
        print_report(results)
        return

    if failures:
        # Alerta com o problema mais crítico (primeiro da lista de prioridade)
        top = failures[0]
        send_alert(top['name'], top['detail'])
        log(f"ALERT: {len(failures)} falha(s) — push enviado")
    else:
        log("OK: todos os checks passaram")
```

**`monitor_config.py`** (NÃO commitado — criado manualmente no servidor):
```python
# /var/www/metas/monitor_config.py
MARCUS_USER_ID = "<uuid do Marcus no Supabase>"
N8N_API_KEY = "<chave de API do N8N>"
SUPABASE_SERVICE_KEY = "<service_role key>"
SUPABASE_URL = "https://tpcawmrblanpkgoqisgw.supabase.co"
SEND_PUSH_URL = "https://tpcawmrblanpkgoqisgw.supabase.co/functions/v1/send-push"
```

---

## Cron

Arquivo: `/etc/cron.d/metas-monitor`

```cron
# Minhas Metas — process monitor — every hour at minute 5
5 * * * * root cd /var/www/metas && python3 monitor.py >> /var/log/metas-monitor.log 2>&1
```

Roda no minuto 5 de cada hora (dá tempo para o Coach Diário das 9h terminar antes do check das 9h05).

---

## Deploy do monitor.py

`deploy_metas.py` é atualizado para enviar também `monitor.py` ao servidor.

O `monitor_config.py` **nunca** é enviado pelo deploy — é criado manualmente no servidor por Marcus na primeira configuração.

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `monitor.py` | Criar (local, depois enviado ao servidor via deploy) |
| `.claude/commands/processo-check.md` | Criar |
| `C:\Users\Administrador\deploy_metas.py` | Editar — adicionar `monitor.py` à lista de arquivos enviados |
| `.gitignore` | Editar — adicionar `monitor_config.py` |

---

## Configuração inicial (passos manuais de Marcus)

Após o deploy:

1. Criar `/var/www/metas/monitor_config.py` no servidor com as credenciais
2. Obter `MARCUS_USER_ID` via: `SELECT id FROM auth.users WHERE email = 'ti@gruporessonar.com.br'`
3. Gerar N8N API key: N8N Dashboard → Settings → API → Create API Key
4. Verificar permissão de execução: `chmod +x /var/www/metas/monitor.py`
5. Testar manualmente: `python3 /var/www/metas/monitor.py --report`
6. Verificar cron: `crontab -l` ou `cat /etc/cron.d/metas-monitor`

---

## Fora do escopo

- Dashboard visual de uptime
- Histórico de incidentes no banco de dados
- Alertas por email
- Monitoramento de performance (latência, throughput)
- Integração com serviços externos (PagerDuty, UptimeRobot)
- Auto-recovery (reiniciar serviços automaticamente)

---

## Critérios de sucesso

- Push chega no celular de Marcus quando um workflow N8N falha
- `/processo-check` exibe relatório completo em < 10 segundos
- Silêncio quando tudo está operacional (sem spam de push)
- `monitor.py --report` funciona via SSH manual também
- Cron confirmado ativo via `crontab -l` no servidor
