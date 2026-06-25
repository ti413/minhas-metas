# Processo Check — Minhas Metas

Executa o health check completo do app Minhas Metas conectando ao servidor de produção.

## O que fazer

### 1. Conectar ao servidor via paramiko e rodar o monitor

Executar o seguinte código Python (via Bash tool ou script temporário):

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

O output do comando `monitor.py --report` já está formatado — exibir diretamente.

Formato esperado:
```
🩺 Minhas Metas — Health Check  YYYY-MM-DD HH:MM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Site                       200 OK (Xms)
✅ Supabase                   acessível
✅ Edge Function send-push    ativa
✅ Coach Diário (N8N)         rodou hoje às 09:01
✅ Hábitos Diário (N8N)       verificação começa às 21h
✅ Push subscriptions         N ativa(s)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tudo operacional ✓
```

### 3. Se houver erros de importação (`monitor_config.py não encontrado`)

Informar Marcus que a configuração inicial precisa ser feita no servidor:

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
