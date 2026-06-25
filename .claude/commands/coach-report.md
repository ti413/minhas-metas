# Coach Report — Minhas Metas

Executa análise completa de coach para **um usuário específico** do app Minhas Metas.
Útil para testes, depuração e geração manual de insights.

## O que fazer

### 1. Perguntar qual usuário
Se nenhum user_id foi passado como argumento (`$ARGUMENTS`), perguntar:
"Para qual usuário? Pode ser email ou user_id (UUID do Supabase)."

Se for email, buscar o user_id:
```sql
SELECT id, email FROM auth.users WHERE email = '<email>';
```

### 2. Buscar dados do usuário no Supabase

Executar as queries abaixo via `mcp__claude_ai_Supabase__execute_sql` com `project_id: "tpcawmrblanpkgoqisgw"`:

```sql
-- Dados do perfil
SELECT username, xp, nivel, mentor, plan
FROM profiles
WHERE id = '<user_id>';

-- Últimas 7 ai_reflections do usuário
SELECT mentor, content, created_at
FROM ai_reflections
WHERE user_id = '<user_id>'
ORDER BY created_at DESC
LIMIT 7;
```

### 3. Gerar insight personalizado

Com base nos dados coletados, gerar um insight no tom do mentor ativo:

**Se mentor = "jesus":**
> Tom: pastoral, empático, usa versículo bíblico relevante, termina com encorajamento pessoal.
> Exemplo de estrutura: [versículo] → [conexão com as metas/streak] → [encorajamento]

**Se mentor = "huberman" (Eslen Delanogare):**
> Tom: neurociência aplicada, usa termos como "Reservatório de Dopamina", "janela de pico", "loop de reforço".
> Exemplo de estrutura: [fato neurocientífico] → [conexão com padrão de hábito do usuário] → [sugestão prática]

### 4. Persistir no Supabase

Salvar o insight gerado:

```sql
INSERT INTO ai_reflections (user_id, mentor, content, created_at)
VALUES ('<user_id>', '<mentor>', '<insight_gerado>', now());
```

### 5. Reportar resultado

Exibir:
- Nome do usuário e mentor
- Insight gerado (completo)
- Confirmação de que foi salvo em ai_reflections
- Se o usuário tem push_subscription (para saber se receberia a notificação automática)

```sql
SELECT COUNT(*) as tem_push FROM push_subscriptions WHERE user_id = '<user_id>';
```
