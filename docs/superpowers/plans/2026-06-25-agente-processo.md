# Agente de Processo â€” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um script Python de monitoramento operacional (`monitor.py`) que roda a cada hora no servidor, detecta falhas nos componentes do Minhas Metas e envia push notification para Marcus, mais uma skill `/processo-check` para diagnÃ³stico manual.

**Architecture:** `monitor.py` roda no servidor via cron, importa credenciais de `monitor_config.py` (nunca commitado), executa 6 checks HTTP/REST em sequÃªncia e â€” se houver falha â€” chama a Edge Function `send-push` jÃ¡ existente com o user_id de Marcus. A skill Claude Code `/processo-check` conecta ao servidor via paramiko e roda `monitor.py --report` para exibir o relatÃ³rio no terminal.

**Tech Stack:** Python 3 + `requests`, paramiko (jÃ¡ em uso no deploy), Supabase REST API, N8N REST API, VAPID Edge Function `send-push`.

## Global Constraints

- Deploy ao servidor via paramiko SFTP â€” nunca scp
- Servidor: `2.24.99.6`, user: `root`, password: `<SERVER_PASSWORD>`
- Destino no servidor: `/var/www/metas/`
- `monitor_config.py` NUNCA Ã© commitado no git â€” sÃ³ existe no servidor
- N8N Coach workflow ID: `wpcNRkZXWGCYHAYB`
- N8N HÃ¡bitos workflow ID: `aKe8Ypv2akK4KijI`
- N8N base URL: `https://n8n.campostecnologia.cloud/api/v1`
- Supabase project: `tpcawmrblanpkgoqisgw` â†’ URL: `https://tpcawmrblanpkgoqisgw.supabase.co`
- Edge Function: `https://tpcawmrblanpkgoqisgw.supabase.co/functions/v1/send-push`
- Coach check: sÃ³ alerta se hora atual â‰¥ 10h
- HÃ¡bitos check: sÃ³ alerta se hora atual â‰¥ 21h
- 1 push por execuÃ§Ã£o (o check mais crÃ­tico que falhou)
- Cron: minuto 5 de cada hora (`5 * * * *`)

---

## File Map

| Arquivo | AÃ§Ã£o | Responsabilidade |
|---|---|---|
| `monitor.py` | Criar | Script completo de monitoramento (local â†’ deployado ao servidor) |
| `.claude/commands/processo-check.md` | Criar | Skill manual `/processo-check` |
| `C:\Users\Administrador\deploy_metas.py` | Editar | Adicionar `monitor.py` Ã  lista de arquivos enviados |
| `.gitignore` | Editar | Adicionar `monitor_config.py` |

---

## Task 1: Criar `monitor.py` â€” script de monitoramento

**Files:**
- Create: `monitor.py` (na raiz do projeto, depois enviado ao servidor)

**Interfaces:**
- Consumes: `monitor_config.py` (no servidor), N8N API, Supabase REST, Edge Function `send-push`
- Produces: output de texto (`--report`) ou linha de log + push notification (modo cron)

- [ ] **Step 1: Criar `monitor.py` com o cÃ³digo completo**

```python
#!/usr/bin/env python3
"""
Minhas Metas â€” Process Monitor
Roda via cron a cada hora. Envia push para Marcus quando detecta problema.
Uso: python3 monitor.py           (modo cron â€” silencioso, push se falhar)
     python3 monitor.py --report  (modo manual â€” imprime relatÃ³rio completo)
"""
import sys
import requests
from datetime import datetime

try:
    from monitor_config import (
        MARCUS_USER_ID,
        N8N_API_KEY,
        SUPABASE_SERVICE_KEY,
        SUPABASE_URL,
        SEND_PUSH_URL,
    )
except ImportError:
    print("ERRO: monitor_config.py nÃ£o encontrado em /var/www/metas/")
    print("Crie o arquivo com as credenciais antes de continuar.")
    sys.exit(1)

N8N_BASE = "https://n8n.campostecnologia.cloud/api/v1"
COACH_WORKFLOW_ID = "wpcNRkZXWGCYHAYB"
HABITOS_WORKFLOW_ID = "aKe8Ypv2akK4KijI"
TIMEOUT = 10


def check_site():
    try:
        start = datetime.now()
        r = requests.get("http://2.24.99.6", timeout=TIMEOUT)
        ms = int((datetime.now() - start).total_seconds() * 1000)
        if r.status_code == 200:
            return {"ok": True, "name": "Site", "detail": f"200 OK ({ms}ms)"}
        return {"ok": False, "name": "Site", "detail": f"status {r.status_code}"}
    except Exception as e:
        return {"ok": False, "name": "Site", "detail": f"timeout/erro: {e}"}


def check_supabase():
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            },
            params={"limit": "1"},
            timeout=TIMEOUT,
        )
        if r.status_code == 200:
            return {"ok": True, "name": "Supabase", "detail": "acessÃ­vel"}
        return {"ok": False, "name": "Supabase", "detail": f"status {r.status_code}"}
    except Exception as e:
        return {"ok": False, "name": "Supabase", "detail": f"erro: {e}"}


def check_send_push():
    try:
        r = requests.get(SEND_PUSH_URL, timeout=TIMEOUT)
        if r.status_code in (200, 400, 405):
            return {"ok": True, "name": "Edge Function send-push", "detail": "ativa"}
        return {"ok": False, "name": "Edge Function send-push", "detail": f"status {r.status_code}"}
    except Exception as e:
        return {"ok": False, "name": "Edge Function send-push", "detail": f"erro: {e}"}


def _check_n8n_workflow(workflow_id, name, alert_after_hour):
    now = datetime.now()
    if now.hour < alert_after_hour:
        return {"ok": True, "name": name, "detail": f"verificaÃ§Ã£o comeÃ§a Ã s {alert_after_hour}h"}
    try:
        r = requests.get(
            f"{N8N_BASE}/executions",
            headers={"X-N8N-API-KEY": N8N_API_KEY},
            params={"workflowId": workflow_id, "limit": "1"},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return {"ok": False, "name": name, "detail": f"N8N API status {r.status_code}"}
        executions = r.json().get("data", [])
        if not executions:
            return {"ok": False, "name": name, "detail": "nenhuma execuÃ§Ã£o encontrada"}
        last = executions[0]
        started = last.get("startedAt", "")
        today = now.strftime("%Y-%m-%d")
        if last.get("status") == "error":
            return {"ok": False, "name": name, "detail": f"falhou em {started[:16]}"}
        if started[:10] == today:
            return {"ok": True, "name": name, "detail": f"rodou hoje Ã s {started[11:16]}"}
        return {"ok": False, "name": name, "detail": f"nÃ£o rodou hoje (Ãºltima: {started[:16]})"}
    except Exception as e:
        return {"ok": False, "name": name, "detail": f"erro ao consultar N8N: {e}"}


def check_n8n_coach():
    return _check_n8n_workflow(COACH_WORKFLOW_ID, "Coach DiÃ¡rio (N8N)", alert_after_hour=10)


def check_n8n_habitos():
    return _check_n8n_workflow(HABITOS_WORKFLOW_ID, "HÃ¡bitos DiÃ¡rio (N8N)", alert_after_hour=21)


def check_push_subscriptions():
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/push_subscriptions",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Prefer": "count=exact",
            },
            params={"select": "user_id"},
            timeout=TIMEOUT,
        )
        content_range = r.headers.get("content-range", "0/0")
        count = int(content_range.split("/")[-1]) if "/" in content_range else 0
        if count == 0:
            return {"ok": False, "name": "Push subscriptions", "detail": "0 ativas â€” ninguÃ©m receberÃ¡ push"}
        return {"ok": True, "name": "Push subscriptions", "detail": f"{count} ativa(s)"}
    except Exception as e:
        return {"ok": False, "name": "Push subscriptions", "detail": f"erro: {e}"}


def send_alert(name, detail):
    try:
        requests.post(
            SEND_PUSH_URL,
            json={
                "user_id": MARCUS_USER_ID,
                "title": "âš ï¸ Minhas Metas â€” Problema detectado",
                "body": f"{name} com problema. Abra /processo-check para detalhes.",
            },
            timeout=TIMEOUT,
        )
    except Exception as e:
        print(f"WARN: nÃ£o foi possÃ­vel enviar push: {e}")


def print_report(results):
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"\nðŸ©º Minhas Metas â€” Health Check  {now}")
    print("â”" * 50)
    for r in results:
        icon = "âœ…" if r["ok"] else "âŒ"
        name = r["name"].ljust(28)
        print(f"{icon} {name} {r['detail']}")
    print("â”" * 50)
    failures = [r for r in results if not r["ok"]]
    if failures:
        print(f"âš ï¸  {len(failures)} problema(s) detectado(s)\n")
    else:
        print("Tudo operacional âœ“\n")


CHECKS = [
    check_site,
    check_supabase,
    check_send_push,
    check_n8n_coach,
    check_n8n_habitos,
    check_push_subscriptions,
]


def run():
    report_mode = "--report" in sys.argv
    results = [check() for check in CHECKS]
    failures = [r for r in results if not r["ok"]]

    if report_mode:
        print_report(results)
        return

    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    if failures:
        top = failures[0]
        send_alert(top["name"], top["detail"])
        print(f"{ts} ALERT: {len(failures)} falha(s) â€” push enviado ({top['name']})")
    else:
        print(f"{ts} OK: todos os checks passaram")


if __name__ == "__main__":
    run()
```

- [ ] **Step 2: Verificar sintaxe do script**

Rodar no terminal local (Windows):
```powershell
python -m py_compile monitor.py && echo "OK â€” sem erros de sintaxe"
```
Resultado esperado: `OK â€” sem erros de sintaxe`

Se `python` nÃ£o estiver no PATH, usar `py -m py_compile monitor.py`.

- [ ] **Step 3: Commit**

```bash
git add monitor.py
git commit -m "feat: add monitor.py â€” process health check script"
```

---

## Task 2: Criar skill `/processo-check` + atualizar `.gitignore`

**Files:**
- Create: `.claude/commands/processo-check.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `monitor.py` no servidor (Task 1), paramiko (jÃ¡ em uso em `deploy_metas.py`)
- Produces: skill Claude Code `/processo-check` que exibe relatÃ³rio de saÃºde

- [ ] **Step 1: Criar `.claude/commands/processo-check.md`**

```markdown
# Processo Check â€” Minhas Metas

Executa o health check completo do app Minhas Metas conectando ao servidor de produÃ§Ã£o.

## O que fazer

### 1. Conectar ao servidor via paramiko e rodar o monitor

Executar o seguinte cÃ³digo Python (via Bash tool ou script temporÃ¡rio):

```python
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('2.24.99.6', username='root', password='<SERVER_PASSWORD>', timeout=30)

stdin, stdout, stderr = ssh.exec_command('cd /var/www/metas && python3 monitor.py --report')
output = stdout.read().decode('utf-8', errors='replace')
error = stderr.read().decode('utf-8', errors='replace')
ssh.close()

print(output)
if error:
    print("STDERR:", error)
```

### 2. Exibir o resultado

O output do comando `monitor.py --report` jÃ¡ estÃ¡ formatado â€” exibir diretamente.

Formato esperado:
```
ðŸ©º Minhas Metas â€” Health Check  YYYY-MM-DD HH:MM
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
âœ… Site                       200 OK (Xms)
âœ… Supabase                   acessÃ­vel
âœ… Edge Function send-push    ativa
âœ… Coach DiÃ¡rio (N8N)         rodou hoje Ã s 09:01
âœ… HÃ¡bitos DiÃ¡rio (N8N)       verificaÃ§Ã£o comeÃ§a Ã s 21h
âœ… Push subscriptions         N ativa(s)
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
Tudo operacional âœ“
```

### 3. Se houver erros de importaÃ§Ã£o (`monitor_config.py nÃ£o encontrado`)

Informar Marcus que a configuraÃ§Ã£o inicial precisa ser feita no servidor:

```bash
# Criar manualmente no servidor:
cat > /var/www/metas/monitor_config.py << 'EOF'
MARCUS_USER_ID = "<uuid de ti@gruporessonar.com.br>"
N8N_API_KEY = "<gerar em n8n.campostecnologia.cloud/settings/api>"
SUPABASE_SERVICE_KEY = "<service_role key do Supabase>"
SUPABASE_URL = "https://tpcawmrblanpkgoqisgw.supabase.co"
SEND_PUSH_URL = "https://tpcawmrblanpkgoqisgw.supabase.co/functions/v1/send-push"
EOF
```

Para obter o MARCUS_USER_ID, usar o Supabase MCP:
```sql
SELECT id FROM auth.users WHERE email = 'ti@gruporessonar.com.br';
```
```

- [ ] **Step 2: Adicionar `monitor_config.py` ao `.gitignore`**

Verificar se `.gitignore` existe:
```bash
ls .gitignore
```

Se existir, adicionar ao final:
```
monitor_config.py
```

Se nÃ£o existir, criar com:
```
.backups/
monitor_config.py
```

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/processo-check.md .gitignore
git commit -m "feat: add /processo-check skill + gitignore monitor_config.py"
```

---

## Task 3: Atualizar `deploy_metas.py` + deploy + configurar cron

**Files:**
- Modify: `C:\Users\Administrador\deploy_metas.py`

**Interfaces:**
- Consumes: `monitor.py` (Task 1), servidor `2.24.99.6`
- Produces: `monitor.py` no servidor + cron entry ativa

- [ ] **Step 1: Atualizar `deploy_metas.py` para incluir `monitor.py`**

O arquivo atual na linha 12:
```python
files = ['index.html', 'styles.css', 'app.js', 'sw.js', 'landing.html']
```

Substituir por:
```python
files = ['index.html', 'styles.css', 'app.js', 'sw.js', 'landing.html', 'monitor.py']
```

- [ ] **Step 2: Rodar deploy para enviar `monitor.py` ao servidor**

```powershell
python C:\Users\Administrador\deploy_metas.py
```

Resultado esperado â€” deve incluir:
```
Enviado: monitor.py
```

- [ ] **Step 3: Criar cron entry no servidor via paramiko (usando SFTP)**

Rodar o seguinte script Python local:

```python
import io
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('2.24.99.6', username='root', password='<SERVER_PASSWORD>', timeout=30)

cron_content = (
    "# Minhas Metas â€” process monitor â€” every hour at minute 5\n"
    "5 * * * * root cd /var/www/metas && python3 monitor.py >> /var/log/metas-monitor.log 2>&1\n"
)

# Usa SFTP para escrever o arquivo (evita problemas com echo + newlines no shell)
sftp = ssh.open_sftp()
with sftp.file('/etc/cron.d/metas-monitor', 'w') as f:
    f.write(cron_content)
sftp.chmod('/etc/cron.d/metas-monitor', 0o644)
sftp.close()

# Verifica
stdin, stdout, stderr = ssh.exec_command('cat /etc/cron.d/metas-monitor')
print(stdout.read().decode())

# Cria arquivo de log
ssh.exec_command('touch /var/log/metas-monitor.log && chmod 644 /var/log/metas-monitor.log')

ssh.close()
```

Resultado esperado:
```
# Minhas Metas â€” process monitor â€” every hour at minute 5
5 * * * * root cd /var/www/metas && python3 monitor.py >> /var/log/metas-monitor.log 2>&1
```

- [ ] **Step 4: Criar `monitor_config.py` no servidor**

Este passo Ã© **manual** â€” Marcus cria o arquivo com suas credenciais reais.

Conectar ao servidor (via SSH ou via Claude Code com paramiko) e criar:
```
/var/www/metas/monitor_config.py
```

Com o conteÃºdo:
```python
MARCUS_USER_ID = "<uuid de ti@gruporessonar.com.br>"
N8N_API_KEY = "<chave gerada em n8n.campostecnologia.cloud/settings/api>"
SUPABASE_SERVICE_KEY = "<service_role key do Supabase Dashboard>"
SUPABASE_URL = "https://tpcawmrblanpkgoqisgw.supabase.co"
SEND_PUSH_URL = "https://tpcawmrblanpkgoqisgw.supabase.co/functions/v1/send-push"
```

Para obter o `MARCUS_USER_ID`:
```sql
SELECT id FROM auth.users WHERE email = 'ti@gruporessonar.com.br';
```
(usar `mcp__claude_ai_Supabase__execute_sql` com `project_id: "tpcawmrblanpkgoqisgw"`)

Para obter o N8N API key: N8N Dashboard â†’ Settings â†’ API â†’ Create API Key

- [ ] **Step 5: Testar `monitor.py --report` no servidor**

```python
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('2.24.99.6', username='root', password='<SERVER_PASSWORD>', timeout=30)

stdin, stdout, stderr = ssh.exec_command('cd /var/www/metas && python3 monitor.py --report')
print(stdout.read().decode('utf-8'))
err = stderr.read().decode('utf-8')
if err:
    print("STDERR:", err)
ssh.close()
```

Resultado esperado (todos âœ… ou alguns âŒ com detalhes):
```
ðŸ©º Minhas Metas â€” Health Check  2026-06-25 HH:MM
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
âœ… Site                       200 OK (Xms)
âœ… Supabase                   acessÃ­vel
âœ… Edge Function send-push    ativa
âœ… Coach DiÃ¡rio (N8N)         rodou hoje Ã s 09:01
...
```

Se aparecer `ERRO: monitor_config.py nÃ£o encontrado`, completar Step 4 primeiro.

- [ ] **Step 6: Testar modo cron (sem --report)**

```python
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('2.24.99.6', username='root', password='<SERVER_PASSWORD>', timeout=30)

stdin, stdout, stderr = ssh.exec_command('cd /var/www/metas && python3 monitor.py')
print(stdout.read().decode('utf-8'))
ssh.close()
```

Resultado esperado:
```
2026-06-25 HH:MM OK: todos os checks passaram
```
ou:
```
2026-06-25 HH:MM ALERT: 1 falha(s) â€” push enviado (Site)
```

- [ ] **Step 7: Verificar que cron estÃ¡ ativo**

```python
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('2.24.99.6', username='root', password='<SERVER_PASSWORD>', timeout=30)

stdin, stdout, stderr = ssh.exec_command('cat /etc/cron.d/metas-monitor && systemctl status cron | head -5')
print(stdout.read().decode('utf-8'))
ssh.close()
```

Resultado esperado: arquivo com a linha do cron + status `active (running)` do serviÃ§o cron.

- [ ] **Step 8: Commit das mudanÃ§as do projeto**

`deploy_metas.py` fica em `C:\Users\Administrador\` â€” fora do repositÃ³rio git. NÃ£o Ã© commitado. A mudanÃ§a Ã© apenas editar o arquivo localmente (Step 1 jÃ¡ faz isso).

Commitar apenas os arquivos dentro do projeto:

```bash
git add monitor.py .claude/commands/processo-check.md .gitignore
git status
git commit -m "feat: agente de processo â€” monitor.py + skill /processo-check + cron"
```

---

## VerificaÃ§Ã£o Final

ApÃ³s todas as tasks:

- [ ] `python -m py_compile monitor.py` passa sem erros
- [ ] `/processo-check` no Claude Code conecta ao servidor e exibe relatÃ³rio
- [ ] `monitor.py --report` retorna output formatado com todos os 6 checks
- [ ] `monitor.py` (modo cron) retorna linha de log `OK` ou `ALERT`
- [ ] `/etc/cron.d/metas-monitor` existe e contÃ©m a linha do cron
- [ ] `systemctl status cron` mostra `active (running)`
- [ ] `/var/log/metas-monitor.log` existe (cron escreverÃ¡ nele a cada hora)
- [ ] `monitor_config.py` NÃƒO estÃ¡ no `.gitignore` exceptions (estÃ¡ ignorado)

## ConfiguraÃ§Ã£o inicial â€” checklist para Marcus

ApÃ³s o deploy, antes que o cron rode na primeira vez:

1. Criar `/var/www/metas/monitor_config.py` com as 5 variÃ¡veis (Step 4 acima)
2. Obter `MARCUS_USER_ID` via Supabase MCP: `SELECT id FROM auth.users WHERE email = 'ti@gruporessonar.com.br'`
3. Gerar N8N API key em `n8n.campostecnologia.cloud` â†’ Settings â†’ API
4. Testar manualmente: `python3 /var/www/metas/monitor.py --report`
5. Aguardar prÃ³ximo minuto 05 do horÃ¡rio e verificar `/var/log/metas-monitor.log`

