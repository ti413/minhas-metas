# Spec: Agente de Deploy — Minhas Metas

> Data: 2026-06-25
> Projeto: Minhas Metas (PWA de hábitos)
> Responsável: Marcus

---

## Objetivo

Criar um agente de operações de deploy para o app Minhas Metas, composto por:
1. Uma **skill `/deploy`** que executa o fluxo completo de backup + commit + deploy + verificação
2. Um **hook de sugestão** que lembra de deploiar após edições nos arquivos principais

---

## Componentes

### 1. Skill `/deploy`

**Arquivo:** `.claude/commands/deploy.md`

**Fluxo de execução:**

```
PRÉ-DEPLOY — Backups
├── Local:    copia index.html + styles.css + app.js
│             para .backups/YYYY-MM-DD_HH-MM/
└── Servidor: via paramiko, copia index.html + styles.css + app.js
              de /var/www/metas/ para /var/www/metas_backups/YYYY-MM-DD_HH-MM/
              (site continua no ar durante o backup)

DEPLOY
1. git status  — lista arquivos modificados
2. git add .   — staging de todos os arquivos
3. git commit  — mensagem automática: "deploy: YYYY-MM-DD HH:MM"
4. python deploy_metas.py — envia index.html + styles.css + app.js via SFTP/paramiko
5. curl http://2.24.99.6  — verifica se o site retorna HTTP 200

RELATÓRIO FINAL
✅ Sucesso: informa commit hash, arquivos enviados, tempo de resposta do site
❌ Erro:    informa qual etapa falhou + caminho do backup local para restaurar
```

**Regras:**
- Se qualquer etapa falhar, interrompe e não avança para a próxima
- Em caso de erro no deploy, informa o caminho do backup local para restauração manual
- Backups locais ficam em `.backups/` na raiz do projeto (ignorado pelo git)

---

### 2. Hook de Sugestão

**Evento:** `PostToolUse`
**Matcher:** `Write|Edit`
**Condição:** arquivo editado é `index.html`, `styles.css` ou `app.js`

**Comportamento:** exibe mensagem no chat após a edição:
```
💡 Arquivos do app modificados. Digite /deploy para subir para produção.
```

Não executa nada automaticamente — apenas lembra. O usuário decide quando deploiar.

---

## Arquivos a criar/modificar

| Arquivo | Ação | Descrição |
|---|---|---|
| `.claude/commands/deploy.md` | Criar | Skill com o fluxo completo |
| `.claude/settings.json` | Criar/editar | Hook PostToolUse de sugestão |
| `.backups/` (pasta) | Criar | Destino dos backups locais (via .gitignore) |
| `.gitignore` | Editar | Adicionar `.backups/` |

---

## Infraestrutura existente

- **Script de deploy:** `C:\Users\Administrador\deploy_metas.py`
- **Servidor:** `2.24.99.6` | user: `root` | método: paramiko (SFTP)
- **Destino no servidor:** `/var/www/metas/`
- **Arquivos deployados:** `index.html`, `styles.css`, `app.js`

---

## Fora do escopo

- Rollback automático (restauração manual via backup)
- Notificações externas (Slack, email)
- Deploy de outros arquivos além dos 3 principais
- Testes automatizados antes do deploy

---

## Critérios de sucesso

- `/deploy` executa todos os passos sem intervenção manual
- Backups criados antes de qualquer envio ao servidor
- Falha em qualquer etapa interrompe o fluxo e reporta claramente
- Hook aparece após edição nos 3 arquivos principais
