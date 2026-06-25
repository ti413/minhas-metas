#!/usr/bin/env python3
"""
Minhas Metas – Process Monitor
Roda via cron a cada hora. Envia push para Marcus quando detecta problema.
Uso: python3 monitor.py           (modo cron – silencioso, push se falhar)
     python3 monitor.py --report  (modo manual – imprime relatório completo)
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
    print("ERRO: monitor_config.py não encontrado em /var/www/metas/")
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
            return {"ok": True, "name": "Supabase", "detail": "acessível"}
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
        return {"ok": True, "name": name, "detail": f"verificação começa às {alert_after_hour}h"}
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
            return {"ok": False, "name": name, "detail": "nenhuma execução encontrada"}
        last = executions[0]
        started = last.get("startedAt", "")
        today = now.strftime("%Y-%m-%d")
        if last.get("status") == "error":
            return {"ok": False, "name": name, "detail": f"falhou em {started[:16]}"}
        if started[:10] == today:
            return {"ok": True, "name": name, "detail": f"rodou hoje às {started[11:16]}"}
        return {"ok": False, "name": name, "detail": f"não rodou hoje (última: {started[:16]})"}
    except Exception as e:
        return {"ok": False, "name": name, "detail": f"erro ao consultar N8N: {e}"}


def check_n8n_coach():
    return _check_n8n_workflow(COACH_WORKFLOW_ID, "Coach Diário (N8N)", alert_after_hour=10)


def check_n8n_habitos():
    return _check_n8n_workflow(HABITOS_WORKFLOW_ID, "Hábitos Diário (N8N)", alert_after_hour=21)


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
            return {"ok": False, "name": "Push subscriptions", "detail": "0 ativas – ninguém receberá push"}
        return {"ok": True, "name": "Push subscriptions", "detail": f"{count} ativa(s)"}
    except Exception as e:
        return {"ok": False, "name": "Push subscriptions", "detail": f"erro: {e}"}


def send_alert(name, detail):
    try:
        requests.post(
            SEND_PUSH_URL,
            json={
                "user_id": MARCUS_USER_ID,
                "title": "⚠️ Minhas Metas – Problema detectado",
                "body": f"{name} com problema. Abra /processo-check para detalhes.",
            },
            timeout=TIMEOUT,
        )
    except Exception as e:
        print(f"WARN: não foi possível enviar push: {e}")


def print_report(results):
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    print(f"\n🩺 Minhas Metas – Health Check  {now}")
    print("─" * 50)
    for r in results:
        icon = "✅" if r["ok"] else "❌"
        name = r["name"].ljust(28)
        print(f"{icon} {name} {r['detail']}")
    print("─" * 50)
    failures = [r for r in results if not r["ok"]]
    if failures:
        print(f"⚠️  {len(failures)} problema(s) detectado(s)\n")
    else:
        print("Tudo operacional ✔\n")


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
        print(f"{ts} ALERT: {len(failures)} falha(s) – push enviado ({top['name']})")
    else:
        print(f"{ts} OK: todos os checks passaram")


if __name__ == "__main__":
    run()
