# Hábitos Análise — Minhas Metas

Executa análise profunda de padrões de hábito para um usuário específico.
Útil para diagnóstico e sugestão de novos hábitos.

## O que fazer

### 1. Identificar o usuário

Se `$ARGUMENTS` não tiver user_id/email, perguntar: "Para qual usuário? Email ou user_id (UUID)."

Se email informado, buscar user_id:
```sql
SELECT id, email FROM auth.users WHERE email = '<email>';
```

### 2. Buscar dados completos no Supabase

Usar `mcp__claude_ai_Supabase__execute_sql` com `project_id: "tpcawmrblanpkgoqisgw"`:

```sql
-- Perfil
SELECT username, xp, nivel, mentor, plan FROM profiles WHERE id = '<user_id>';

-- Padrões já calculados (se existirem)
SELECT peak_days, peak_hours, weak_habits, updated_at
FROM user_patterns WHERE user_id = '<user_id>';

-- Últimas sugestões de hábitos
SELECT suggestions, created_at FROM habit_suggestions
WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 3;

-- Reflexões recentes para contexto
SELECT mentor, content, created_at FROM ai_reflections
WHERE user_id = '<user_id>' ORDER BY created_at DESC LIMIT 5;
```

### 3. Analisar padrões

Com base nos dados retornados, apresentar análise em seções:

**Seção A — Padrões detectados:**
- Dias da semana com mais engajamento (de `peak_days`)
- Horários de pico (de `peak_hours`)
- Metas com baixo engajamento (de `weak_habits`)

**Seção B — Diagnóstico:**
- O usuário está em risco de quebrar streak?
- Há metas que parecem difíceis demais?
- O mentor atual (jesus/huberman) parece adequado?

**Seção C — Sugestões:**
Gerar 3 sugestões de novos hábitos baseadas no perfil do usuário.
Tom: coerente com o mentor ativo.

### 4. Persistir sugestões (opcional)

Perguntar: "Deseja salvar essas sugestões no Supabase para o usuário ver no próximo login?"

Se sim, executar:
```sql
INSERT INTO habit_suggestions (user_id, suggestions, created_at)
VALUES (
  '<user_id>',
  '<json_das_sugestoes>',
  now()
);
```

### 5. Reportar resultado

Exibir o relatório completo formatado, incluindo:
- Nome do usuário
- Padrões detectados
- Diagnóstico
- Sugestões geradas
- Se foram salvas no Supabase
