# 🛠️ Guia Prático: Como Implementar ECC Passo a Passo

## 📍 Você está aqui

```
PASSO 0: Verificação Prévia
         ↓
PASSO 1: Instalar Plugin ECC
         ↓
PASSO 2: Copiar Arquivos
         ↓
PASSO 3: Customizar para SEU Projeto
         ↓
PASSO 4: Commit & Push
         ↓
PASSO 5: Testar
         ↓
✅ PRONTO!
```

---

## ⚠️ PASSO 0: Verificação Prévia

### O que você precisa
- [ ] Acesso ao projeto via `claude` (Claude Code)
- [ ] Git configurado no projeto
- [ ] Permissão para fazer commit

### Verificar
```bash
# 1. Abrir projeto
cd ~/metas  # ou seu projeto

# 2. Verificar se é um repo git
git status
# Esperado: On branch main (ou sua branch)
# Se não for repo git:
git init
git add .
git commit -m "Initial commit"
```

---

## 🚀 PASSO 1: Instalar Plugin ECC (5 minutos)

### Opção A: Instalar Globalmente (Recomendado)

```bash
# Pode ser em qualquer pasta
claude /plugin install everything-claude-code

# Verificar instalação
claude /plugin list
# Esperado output:
# everything-claude-code  ✅ installed
```

✅ **Pronto!** Plugin instalado uma única vez. Usado em TODOS seus projetos.

### Opção B: Se der erro

```bash
# Tentar com caminho completo
~/.local/bin/claude /plugin install everything-claude-code

# Ou atualizar Claude Code
claude update
```

---

## 📋 PASSO 2: Copiar Arquivos para Seu Projeto (5 minutos)

### Local dos Arquivos

Você baixou 6 arquivos. Vou supor que estão em `~/Downloads`:

```bash
# Navegar para seu projeto
cd ~/metas
# ou cd ~/seu-projeto

# Copiar os arquivos
cp ~/Downloads/AGENTS.md .
cp ~/Downloads/SECURITY_AUDIT.md .
cp ~/Downloads/PWA_PERFORMANCE.md .
cp ~/Downloads/IMPLEMENTATION_GUIDE.md .
cp ~/Downloads/README_RESUMO.md .

# Criar pasta para scripts
mkdir -p scripts
cp ~/Downloads/validate-database.js scripts/

# Verificar que foram copiados
ls -la | grep AGENTS
ls -la | grep SECURITY
ls -la | grep PWA
ls scripts/validate-database.js
# Esperado: todos os arquivos listados
```

---

## ✏️ PASSO 3: Customizar AGENTS.md para SEU Projeto

### IMPORTANTE: Cada projeto é diferente!

**Para Metas PWA**: Usar AGENTS.md já customizado ✅  
**Para Clinic Bot**: Customizar com agents diferentes  
**Para Aprisco App**: Customizar com agents diferentes

### Como Customizar (Exemplo Clinic Bot)

```bash
# Abrir AGENTS.md para editar
nano AGENTS.md
# ou vim AGENTS.md
# ou abrir em editor favorito
```

**Encontrar essa seção:**

```markdown
## 📋 Project Context

**Application**: Minhas Metas — Personal Goals & Habits Tracking PWA  
**Stack**: Vanilla HTML/JS, Supabase, PWA (offline-first)  
```

**Modificar para seu projeto (Clinic Bot):**

```markdown
## 📋 Project Context

**Application**: Clinic Bot — WhatsApp Automation for Healthcare
**Stack**: n8n, Evolution API, Chatwoot, Supabase, Python
**Infrastructure**: Hostinger VPS (Ubuntu 22), Docker Compose
**Environments**:
- 🟢 Production: evolution.campostecnologia.cloud
- 🔵 Staging: [sua-staging-url]

**Database**: Supabase Project `[seu-project-id]`
**Authentication**: WhatsApp via Evolution API + Supabase
**Criticality**: Healthcare data (HIPAA relevant)
```

**Depois encontrar:**

```markdown
## 🎯 Active Agents (ENABLED)

### 1. **security-reviewer** ⚠️ CRITICAL
```

**Para Clinic Bot, manter security-reviewer MAS adicionar:**

```markdown
### 1. **security-reviewer** ⚠️ CRITICAL
**Purpose**: Webhook security, API keys, patient data protection
**Validates**:
- Evolution API keys not in code
- Webhook signatures verified
- Patient data encrypted at rest
- No PII in logs
- Message filtering correct (source_id check)

### 2. **api-reviewer** (NOVO para Clinic Bot)
**Purpose**: Evolution API calls validation
**Validates**:
- Webhook format correct
- Message routing proper
- Error handling robust
```

**Para Aprisco App, seria:**

```markdown
### 1. **security-reviewer** ⚠️ CRITICAL
**Purpose**: User authentication, prayer request privacy
**Validates**:
- Google OAuth tokens secure
- User data encrypted
- Admin functions gated
- No user data in logs

### 2. **typescript-reviewer** (NOVO)
**Purpose**: Type safety in React Native
**Validates**:
- Supabase types correct
- Component props typed
- No any types
```

---

## 📝 PASSO 4: Commit & Push (3 minutos)

### Confirmar mudanças

```bash
# Ver o que mudou
cd ~/seu-projeto
git status

# Esperado:
# Untracked files:
#   AGENTS.md
#   SECURITY_AUDIT.md
#   PWA_PERFORMANCE.md
#   IMPLEMENTATION_GUIDE.md
#   README_RESUMO.md
#   scripts/validate-database.js
```

### Adicionar ao Git

```bash
git add AGENTS.md SECURITY_AUDIT.md PWA_PERFORMANCE.md \
        IMPLEMENTATION_GUIDE.md README_RESUMO.md \
        scripts/validate-database.js

# Verificar
git status
# Esperado: Changes to be committed
```

### Fazer Commit

```bash
git commit -m "feat: add Everything Claude Code configuration

- AGENTS.md: 5 specialized agents for security, database, performance
- SECURITY_AUDIT.md: Monthly security checklist
- validate-database.js: Automated Supabase validation
- PWA_PERFORMANCE.md: Performance optimization guide
- Additional documentation for ECC setup and usage

ECC provides automated code review, security scanning, and
performance validation on every Claude Code session.
"
```

### Push para GitHub

```bash
git push origin main
# ou sua branch: git push origin [sua-branch]

# Verificar no GitHub
# Abrir: github.com/seu-repo
# Deve mostrar os novos arquivos
```

---

## 🧪 PASSO 5: Testar (5 minutos)

### Test 1: Plugin Detectado?

```bash
cd ~/seu-projeto
claude /plugin list

# Esperado:
# everything-claude-code  ✅
```

### Test 2: AGENTS.md Detectado?

```bash
cd ~/seu-projeto
claude

# Dentro da sessão Claude Code:
> What agents are loaded?

# Esperado:
# Agents loaded from AGENTS.md:
# - security-reviewer (enabled)
# - database-reviewer (enabled) 
# - code-quality-reviewer (enabled)
# - integration-tester (enabled)
```

### Test 3: Agent Funciona?

```bash
# Ainda dentro de Claude Code:
> Review my authentication code for security issues

# Esperado:
# ✅ security-reviewer activated
# I've reviewed your auth code:
# - Token storage: sessionStorage ✓
# - No console.log(token) ✓
# - CORS headers correct ✓
```

### Test 4: Validação de Database (opcional)

```bash
# Sair de Claude Code
exit

# Rodar script de validação
export SUPABASE_ANON_KEY="sua-key-aqui"
node scripts/validate-database.js

# Esperado:
# ✅ PASS: Supabase connection
# ✅ PASS: Table exists: users
# etc.
```

---

## ✅ CHECKLIST DE CONCLUSÃO

- [ ] Plugin instalado: `claude /plugin list` mostra ECC
- [ ] 6 arquivos no projeto: `ls -la | grep AGENTS`
- [ ] AGENTS.md customizado para SEU projeto
- [ ] Git commit feito: `git log --oneline` mostra novo commit
- [ ] Git push feito: `git status` mostra "working tree clean"
- [ ] Teste 1 passou: Plugin detectado
- [ ] Teste 2 passou: AGENTS.md lido
- [ ] Teste 3 passou: Agent respondeu à prompt

---

## 🎯 Próximas Ações (Após Implementação)

### Hoje (após completar acima)
```bash
# Ler documentação
cat README_RESUMO.md

# Entender seus agentes
cat AGENTS.md | less
```

### Esta Semana
```bash
# Usar ECC em seu workflow
claude

> Describe what you're building and what to check for
# ECC vai revisar automaticamente
```

### Este Mês
```bash
# Implementar Quick Wins de performance
cat PWA_PERFORMANCE.md | grep "Quick Wins" -A 50

# Rodar primeira auditoria
cat SECURITY_AUDIT.md
# Follow checklist linha por linha
```

---

## 🚨 Troubleshooting

### Problema: "Plugin not found"

```bash
# Solução 1: Reinstalar
claude /plugin uninstall everything-claude-code
claude /plugin install everything-claude-code

# Solução 2: Atualizar Claude Code
claude update

# Solução 3: Usar caminho completo
/usr/local/bin/claude /plugin install everything-claude-code
```

### Problema: "AGENTS.md not detected"

```bash
# Verificar se arquivo existe
ls AGENTS.md
# Se não: cp ~/Downloads/AGENTS.md .

# Verificar conteúdo
head AGENTS.md
# Deve começar com: # Minhas Metas PWA...

# Reiniciar Claude Code
exit
claude
```

### Problema: "Validation fails: SUPABASE_ANON_KEY not set"

```bash
# Adicionar variável de ambiente
export SUPABASE_ANON_KEY="pk_anon_xxxxx"

# Verificar
echo $SUPABASE_ANON_KEY
# Deve mostrar sua chave

# Rodar validação novamente
node scripts/validate-database.js
```

### Problema: "Git push rejected"

```bash
# Pull antes de push
git pull origin main

# Resolver conflitos se houver
# Depois push
git push origin main

# Se ainda falhar, verificar permissões
git config user.email
git config user.name
```

---

## 💡 Dicas Importantes

### Dica 1: Clonar em Outro Computador

Uma vez commitado, qualquer dev pode pegar:

```bash
# Dev 2, em outro PC
git clone seu-repo
cd seu-projeto
claude /plugin install everything-claude-code

# ✅ Mesma configuração, mesmo AGENTS.md
```

### Dica 2: Atualizar Quando Necessário

```bash
# Se modificar AGENTS.md
nano AGENTS.md
# ... fazer mudanças ...
git add AGENTS.md
git commit -m "update: add new agent for project"
git push

# Outros devs pegam automaticamente no próximo pull
```

### Dica 3: Usar em Múltiplos Projetos

```bash
# Plugin instalado UMA VEZ
/plugin install everything-claude-code

# Mas cada projeto tem seu AGENTS.md
~/metas/AGENTS.md          # Config para Metas
~/clinic-bot/AGENTS.md     # Config para Clinic Bot
~/aprisco-app/AGENTS.md    # Config para Aprisco App

# Claude Code automaticamente usa o AGENTS.md do projeto atual
```

### Dica 4: Backup & Restore

```bash
# Se algo quebrar, restaurar do Git
git checkout AGENTS.md

# Se perder tudo
git clone seu-repo
```

---

## 📊 Tempo Total Esperado

```
PASSO 0: Verificação          5 min
PASSO 1: Instalar Plugin      5 min
PASSO 2: Copiar Arquivos      5 min
PASSO 3: Customizar           10 min
PASSO 4: Commit & Push        5 min
PASSO 5: Testar              10 min
─────────────────────────────────
TOTAL:                       40 min
```

---

## 🎊 Quando Terminar

```
✅ Plugin instalado
✅ Arquivos no projeto
✅ AGENTS.md customizado
✅ Commit feito
✅ Testes passando

🎉 IMPLEMENTAÇÃO COMPLETA!

Agora você pode usar ECC todo dia:
  claude
  > Review my [code] for [concern]
  ✨ ECC faz validação automática
```

---

## 📞 Se Travar em Algum Passo

1. **Qual passo?** (0-5 acima)
2. **Qual erro?** (mensagem exata)
3. **Qual projeto?** (Metas, Clinic Bot, Aprisco?)

Com essas 3 infos, consigo ajudar rapidinho!

---

## 🔒 Próximo: Implementação no Clinic Bot

Quando terminar no Metas, replicar para:

```bash
cd ~/clinic-bot
# Copiar AGENTS.md do Metas
cp ~/metas/AGENTS.md ./AGENTS_template.md

# Modificar para Clinic Bot
# - Stack: n8n, Evolution, Chatwoot
# - Agents: security, api, webhook, integration
# - Criticality: healthcare data

# Repetir PASSO 2-5
```

---

**Você está pronto! Comece pelo PASSO 0.** 🚀
