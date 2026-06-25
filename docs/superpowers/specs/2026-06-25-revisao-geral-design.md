# Spec: Agente de Revisão Geral — Minhas Metas

> Data: 2026-06-25
> Projeto: Minhas Metas (PWA de hábitos)
> Responsável: Marcus

---

## Visão Geral

Script Python `review_metas.py` que analisa o projeto com heurísticas estáticas antes de cada deploy. Detecta bugs, problemas de segurança, performance, código morto, CSS duplicado e acessibilidade nos 3 arquivos principais. Exibe correções propostas, aguarda confirmação de Marcus, aplica automaticamente e oferece deploy imediato.

**Custo adicional:** zero — sem Claude API, análise 100% estática via regex e AST.

---

## Arquivos envolvidos

| Arquivo | Ação |
|---|---|
| `review_metas.py` | Criar — script principal de revisão |
| `C:\Users\Administrador\deploy_metas.py` | Não modificado — `review_metas.py` o chama opcionalmente ao final |

---

## Fluxo de execução

```
python review_metas.py
  → lê app.js + index.html + styles.css
  → executa todos os checks por categoria
  → agrupa problemas encontrados com correção proposta para cada um
  → exibe relatório formatado no terminal
  → aguarda: "Aplicar correções? [y/n]"
    → se y: aplica todas as correções nos arquivos locais
             exibe resumo do que foi alterado (arquivo + nº de mudanças)
    → se n: encerra sem modificar arquivos
  → pergunta: "Fazer deploy agora? [y/n]"
    → se y: executa deploy_metas.py via subprocess
    → se n: encerra
```

---

## Checks implementados

### Bugs (`app.js`)
| ID | Detecta | Correção automática |
|---|---|---|
| B1 | `console.log(...)` esquecidos | Remove a linha |
| B2 | `==` em vez de `===` (fora de `null` checks) | Substitui por `===` |
| B3 | Funções duplicadas (mesma assinatura `function nome(`) | Reporta — não remove (requer decisão humana) |

### Segurança (`app.js`)
| ID | Detecta | Correção automática |
|---|---|---|
| S1 | `.innerHTML = variavel` (XSS potencial) | Substitui por `.textContent =` quando seguro |
| S2 | `eval(` | Reporta — não substitui automaticamente |
| S3 | URLs de API hardcoded com tokens/keys visíveis | Reporta — não altera |

### Performance (`app.js` + `index.html`)
| ID | Detecta | Correção automática |
|---|---|---|
| P1 | `document.querySelector` dentro de `for`/`while`/`forEach` | Reporta com sugestão de mover para fora do loop |
| P2 | `<img>` sem `loading="lazy"` em `index.html` | Adiciona `loading="lazy"` |

### Código morto (`app.js`)
| ID | Detecta | Correção automática |
|---|---|---|
| D1 | Funções declaradas com `function nome(` mas sem nenhuma chamada a `nome(` no arquivo | Remove a função inteira |
| D2 | Blocos `if (false) {` | Remove o bloco |

### CSS (`styles.css`)
| ID | Detecta | Correção automática |
|---|---|---|
| C1 | Seletores duplicados (mesmo seletor aparece 2+ vezes) | Reporta com número de linha de cada ocorrência |
| C2 | `!important` usado mais de 10 vezes | Reporta contagem e linhas |

### Acessibilidade (`index.html`)
| ID | Detecta | Correção automática |
|---|---|---|
| A1 | `<img>` sem atributo `alt` | Adiciona `alt=""` |
| A2 | `<input>` sem `<label>` associado nem `aria-label` | Adiciona `aria-label="campo"` como placeholder |
| A3 | `<button>` sem texto visível nem `aria-label` | Reporta — não corrige automaticamente |

---

## Formato do relatório no terminal

```
🔍 Revisão Geral — Minhas Metas
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🐛 BUGS (2)
  app.js:142   console.log esquecido → será removido
  app.js:891   == em vez de === → será corrigido para ===

🔒 SEGURANÇA (1)
  app.js:334   innerHTML com variável → será substituído por textContent

⚡ PERFORMANCE (1)
  app.js:556   querySelector dentro de loop (linha 558) → mover para fora do loop

💀 CÓDIGO MORTO (1)
  app.js:1204  função debugHelper() nunca chamada → será removida

🎨 CSS (1)
  styles.css:45,312  seletor .modal duplicado → reportado (requer decisão manual)

♿ ACESSIBILIDADE (2)
  index.html:45  <img> sem alt → será adicionado alt=""
  index.html:89  <input> sem aria-label → será adicionado aria-label="campo"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8 problemas encontrados (6 corrigíveis automaticamente, 2 apenas reportados).

Aplicar correções? [y/n]:
```

Após confirmação `y`:
```
✅ 6 correções aplicadas.
  - app.js: 4 alterações
  - index.html: 2 alterações

Fazer deploy agora? [y/n]:
```

Se nenhum problema encontrado:
```
✅ Nenhum problema encontrado. Código limpo!

Fazer deploy agora? [y/n]:
```

---

## Regras de correção automática

- Correções são aplicadas em memória e escritas de volta ao arquivo apenas após confirmação `y`
- Nunca modificar arquivos sem confirmação explícita
- Problemas que requerem decisão humana (funções duplicadas, `eval`, seletores CSS duplicados, `aria-label` em botões) são **reportados mas não corrigidos automaticamente**
- Se uma correção automática produziria código ambíguo, preferir reportar em vez de corrigir

---

## Restrições técnicas

- Dependências: apenas stdlib Python (`re`, `os`, `subprocess`, `sys`) — sem instalação de pacotes
- Análise via regex e busca de padrões de string — não usa AST parser (mantém compatibilidade com qualquer Python 3.6+)
- Tempo máximo esperado de análise: < 3 segundos para `app.js` (~3800 linhas)
- Arquivo `review_metas.py` fica em `C:\Users\Administrador\` junto com `deploy_metas.py` (fora do git)

---

## Fora do escopo

- Análise semântica profunda (requer AST ou Claude API)
- Detecção de race conditions ou bugs assíncronos complexos
- Revisão de `sw.js` ou `landing.html`
- Histórico de revisões / log de problemas encontrados
- Integração com git hooks
- Interface visual

---

## Critérios de sucesso

- `python review_metas.py` roda em < 5 segundos
- Detecta pelo menos 80% dos padrões listados nos checks acima
- Não produz falsos positivos em código correto
- Correções automáticas não quebram o código existente
- Fluxo completo (revisão → correção → deploy) funciona em sequência sem erros
