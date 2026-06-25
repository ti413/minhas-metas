# Revisão Geral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `review_metas.py` — script Python que analisa `app.js`, `index.html` e `styles.css` com heurísticas estáticas, exibe problemas com correções propostas, aguarda confirmação e aplica automaticamente antes do deploy.

**Architecture:** Script único com funções de check por categoria, motor de aplicação de correções em memória, relatório formatado no terminal e fluxo interativo y/n. Fora do repositório git, junto com `deploy_metas.py`.

**Tech Stack:** Python 3.6+ stdlib apenas (`re`, `os`, `subprocess`, `sys`)

## Global Constraints

- Sem dependências externas — apenas stdlib Python (`re`, `os`, `subprocess`, `sys`)
- Arquivo em `C:\Users\Administrador\review_metas.py` (fora do git, não commitar)
- Arquivos analisados: `C:\Users\Administrador\Desktop\PROJETO.old\Projeto app metas\app.js`, `index.html`, `styles.css`
- Deploy via `C:\Users\Administrador\deploy_metas.py` (chamado com `subprocess.run`)
- Nunca modificar arquivos sem confirmação `y` do usuário
- Análise via regex/string — não usar AST parser
- Python compatível com 3.6+

---

## File Structure

```
C:\Users\Administrador\
├── review_metas.py       ← CRIAR (script principal)
└── deploy_metas.py       ← não modificar
```

---

### Task 1: Estrutura base + checks de bugs

**Files:**
- Create: `C:\Users\Administrador\review_metas.py`

**Interfaces:**
- Produz:
  - `Issue = dict` com chaves: `file` (str), `line` (int), `category` (str), `description` (str), `fix` (str|None), `auto` (bool)
  - `check_bugs(content: str) -> list[Issue]` — retorna lista de Issues do app.js
  - `PROJECT_DIR: str` — caminho absoluto para a pasta do projeto

- [ ] **Step 1: Criar estrutura base do script**

Criar `C:\Users\Administrador\review_metas.py` com o seguinte conteúdo:

```python
#!/usr/bin/env python3
import re
import os
import sys
import subprocess

PROJECT_DIR = r'C:\Users\Administrador\Desktop\PROJETO.old\Projeto app metas'
DEPLOY_SCRIPT = r'C:\Users\Administrador\deploy_metas.py'

FILES = {
    'app.js':      os.path.join(PROJECT_DIR, 'app.js'),
    'index.html':  os.path.join(PROJECT_DIR, 'index.html'),
    'styles.css':  os.path.join(PROJECT_DIR, 'styles.css'),
}

def read_file(name):
    with open(FILES[name], 'r', encoding='utf-8', errors='replace') as f:
        return f.read()

def write_file(name, content):
    with open(FILES[name], 'w', encoding='utf-8') as f:
        f.write(content)

def make_issue(file, line, category, description, fix=None, auto=False):
    return {'file': file, 'line': line, 'category': category,
            'description': description, 'fix': fix, 'auto': auto}
```

- [ ] **Step 2: Implementar check_bugs (B1: console.log, B2: == vs ===)**

Adicionar ao final de `review_metas.py`:

```python
def check_bugs(content):
    issues = []
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # B1: console.log esquecido
        if re.search(r'\bconsole\.log\s*\(', stripped):
            issues.append(make_issue(
                'app.js', i, 'BUG',
                'console.log esquecido',
                fix=None,  # linha inteira removida
                auto=True
            ))

        # B2: == em vez de === (ignora == null, == undefined, != null, != undefined)
        if re.search(r'[^=!<>]={2}(?!=)[^=]', stripped):
            # Ignorar comparações com null/undefined
            if not re.search(r'==\s*(null|undefined)', stripped) and \
               not re.search(r'(null|undefined)\s*==', stripped):
                issues.append(make_issue(
                    'app.js', i, 'BUG',
                    '== em vez de === (comparação não-estrita)',
                    auto=True
                ))

    return issues
```

- [ ] **Step 3: Testar check_bugs manualmente**

Criar arquivo temporário `C:\Users\Administrador\test_review.py`:

```python
import sys
sys.path.insert(0, r'C:\Users\Administrador')
import review_metas as r

# Teste B1
content = 'function foo() {\n  console.log("debug");\n  return 1;\n}'
issues = r.check_bugs(content)
assert any(i['description'] == 'console.log esquecido' for i in issues), "B1 falhou"

# Teste B2
content2 = 'if (x == 1) { return true; }'
issues2 = r.check_bugs(content2)
assert any('===' in i['description'] for i in issues2), "B2 falhou"

# Teste B2 negativo (null check deve ser ignorado)
content3 = 'if (x == null) { return; }'
issues3 = r.check_bugs(content3)
assert not any('===' in i['description'] for i in issues3), "B2 falso positivo em null check"

print("check_bugs: OK")
```

Rodar: `py C:\Users\Administrador\test_review.py`
Esperado: `check_bugs: OK`

- [ ] **Step 4: Commitar o progresso (apenas o plano — review_metas.py fica fora do git)**

```bash
# review_metas.py não vai para o git (está fora do repo)
# Apenas registrar que a Task 1 foi concluída no SDD ledger
```

---

### Task 2: Checks de segurança e performance

**Files:**
- Modify: `C:\Users\Administrador\review_metas.py`

**Interfaces:**
- Consumes: `make_issue(file, line, category, description, fix, auto) -> Issue`
- Produz:
  - `check_security(content: str) -> list[Issue]`
  - `check_performance(js_content: str, html_content: str) -> list[Issue]`

- [ ] **Step 1: Implementar check_security (S1: innerHTML, S2: eval)**

Adicionar ao final de `review_metas.py`:

```python
def check_security(content):
    issues = []
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # S1: .innerHTML = variavel (não string literal)
        # Detecta: elemento.innerHTML = algo (onde algo não começa com ' ou ")
        match = re.search(r'\.innerHTML\s*=\s*(?![\'"`])', stripped)
        if match:
            issues.append(make_issue(
                'app.js', i, 'SEGURANÇA',
                'innerHTML com variável (risco XSS) → substituir por textContent ou sanitizar',
                auto=False
            ))

        # S2: eval(
        if re.search(r'\beval\s*\(', stripped):
            issues.append(make_issue(
                'app.js', i, 'SEGURANÇA',
                'eval() detectado — evitar uso de eval',
                auto=False
            ))

    return issues
```

- [ ] **Step 2: Implementar check_performance (P1: querySelector em loop, P2: img sem lazy)**

Adicionar ao final de `review_metas.py`:

```python
def check_performance(js_content, html_content):
    issues = []

    # P1: document.querySelector dentro de loop em app.js
    js_lines = js_content.split('\n')
    in_loop = False
    loop_depth = 0

    for i, line in enumerate(js_lines, 1):
        stripped = line.strip()
        # Detecta abertura de loop
        if re.search(r'\b(for|while|forEach|map|filter|reduce)\b.*[\({]', stripped):
            in_loop = True
            loop_depth += stripped.count('{') - stripped.count('}')
        elif in_loop:
            loop_depth += stripped.count('{') - stripped.count('}')
            if loop_depth <= 0:
                in_loop = False
                loop_depth = 0

        if in_loop and re.search(r'document\.querySelector(All)?\s*\(', stripped):
            issues.append(make_issue(
                'app.js', i, 'PERFORMANCE',
                'document.querySelector dentro de loop — mover seleção para fora',
                auto=False
            ))

    # P2: <img> sem loading="lazy" em index.html
    html_lines = html_content.split('\n')
    for i, line in enumerate(html_lines, 1):
        if re.search(r'<img\b', line) and 'loading=' not in line:
            issues.append(make_issue(
                'index.html', i, 'PERFORMANCE',
                '<img> sem loading="lazy"',
                fix='lazy',
                auto=True
            ))

    return issues
```

- [ ] **Step 3: Testar check_security e check_performance**

Adicionar ao `C:\Users\Administrador\test_review.py`:

```python
# Teste S1
s_content = 'el.innerHTML = userInput;'
s_issues = r.check_security(s_content)
assert any('innerHTML' in i['description'] for i in s_issues), "S1 falhou"

# Teste S1 negativo (string literal deve ser ignorado)
s_content2 = "el.innerHTML = '<span>ok</span>';"
s_issues2 = r.check_security(s_content2)
assert not any('innerHTML' in i['description'] for i in s_issues2), "S1 falso positivo"

# Teste P2
html = '<img src="foto.jpg" alt="foto">'
p_issues = r.check_performance('', html)
assert any('loading' in i['description'] for i in p_issues), "P2 falhou"

print("check_security + check_performance: OK")
```

Rodar: `py C:\Users\Administrador\test_review.py`
Esperado: ambas as linhas de OK impressas.

---

### Task 3: Checks de código morto, CSS e acessibilidade

**Files:**
- Modify: `C:\Users\Administrador\review_metas.py`

**Interfaces:**
- Consumes: `make_issue(...)` 
- Produz:
  - `check_dead_code(content: str) -> list[Issue]`
  - `check_css(content: str) -> list[Issue]`
  - `check_a11y(content: str) -> list[Issue]`

- [ ] **Step 1: Implementar check_dead_code (D1: funções não chamadas, D2: if(false))**

Adicionar ao final de `review_metas.py`:

```python
def check_dead_code(content):
    issues = []
    lines = content.split('\n')

    # D2: if (false) {
    for i, line in enumerate(lines, 1):
        if re.search(r'\bif\s*\(\s*false\s*\)', line.strip()):
            issues.append(make_issue(
                'app.js', i, 'CÓDIGO MORTO',
                'if (false) — bloco nunca executado',
                auto=False
            ))

    # D1: funções declaradas mas nunca chamadas
    # Coleta todos os nomes de funções declaradas com "function nome("
    declared = {}
    for i, line in enumerate(lines, 1):
        m = re.match(r'\s*(?:async\s+)?function\s+(\w+)\s*\(', line)
        if m:
            name = m.group(1)
            # Ignora funções muito curtas (possíveis callbacks) e construtores
            if len(name) > 3:
                declared[name] = i

    # Verifica se cada função é chamada em algum lugar
    full_content = content
    for name, line_num in declared.items():
        # Busca por nome( ou nome.call( — excluindo a própria declaração
        pattern = r'\b' + re.escape(name) + r'\s*[\(\.]'
        matches = list(re.finditer(pattern, full_content))
        # Se só aparece 1 vez (a própria declaração), é código morto
        if len(matches) <= 1:
            issues.append(make_issue(
                'app.js', line_num, 'CÓDIGO MORTO',
                f'função {name}() declarada mas nunca chamada',
                auto=False
            ))

    return issues
```

- [ ] **Step 2: Implementar check_css (C1: seletores duplicados, C2: !important excessivo)**

Adicionar ao final de `review_metas.py`:

```python
def check_css(content):
    issues = []
    lines = content.split('\n')

    # C1: seletores duplicados
    selector_lines = {}
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        # Detecta linha que parece seletor CSS (termina com { ou é só seletor)
        if re.match(r'^[\w\s\.\#\:\[\]\-\,\*\>]+\s*\{?\s*$', stripped) and stripped and not stripped.startswith('/*'):
            sel = stripped.rstrip('{').strip()
            if sel:
                if sel not in selector_lines:
                    selector_lines[sel] = []
                selector_lines[sel].append(i)

    for sel, line_nums in selector_lines.items():
        if len(line_nums) > 1:
            lines_str = ', '.join(str(n) for n in line_nums)
            issues.append(make_issue(
                'styles.css', line_nums[0], 'CSS',
                f'seletor duplicado "{sel}" nas linhas {lines_str}',
                auto=False
            ))

    # C2: !important excessivo (> 10 ocorrências)
    important_lines = [i+1 for i, l in enumerate(lines) if '!important' in l]
    if len(important_lines) > 10:
        issues.append(make_issue(
            'styles.css', important_lines[0], 'CSS',
            f'!important usado {len(important_lines)} vezes (linhas: {", ".join(str(n) for n in important_lines[:5])}...)',
            auto=False
        ))

    return issues
```

- [ ] **Step 3: Implementar check_a11y (A1: img sem alt, A2: input sem label, A3: button sem texto)**

Adicionar ao final de `review_metas.py`:

```python
def check_a11y(content):
    issues = []
    lines = content.split('\n')

    for i, line in enumerate(lines, 1):
        # A1: <img> sem atributo alt
        if re.search(r'<img\b', line) and 'alt=' not in line:
            issues.append(make_issue(
                'index.html', i, 'ACESSIBILIDADE',
                '<img> sem atributo alt',
                fix='alt=""',
                auto=True
            ))

        # A2: <input> sem label associado nem aria-label
        if re.search(r'<input\b', line):
            if 'aria-label=' not in line and 'aria-labelledby=' not in line:
                issues.append(make_issue(
                    'index.html', i, 'ACESSIBILIDADE',
                    '<input> sem aria-label',
                    fix='aria-label="campo"',
                    auto=True
                ))

        # A3: <button> sem texto nem aria-label
        if re.search(r'<button\b', line):
            if 'aria-label=' not in line:
                # Verifica se o botão tem texto visível na mesma linha
                btn_content = re.sub(r'<[^>]+>', '', line).strip()
                if not btn_content:
                    issues.append(make_issue(
                        'index.html', i, 'ACESSIBILIDADE',
                        '<button> sem texto visível nem aria-label',
                        auto=False
                    ))

    return issues
```

- [ ] **Step 4: Testar check_dead_code, check_css e check_a11y**

Adicionar ao `C:\Users\Administrador\test_review.py`:

```python
# Teste D2
d_content = 'if (false) {\n  doSomething();\n}'
d_issues = r.check_dead_code(d_content)
assert any('if (false)' in i['description'] for i in d_issues), "D2 falhou"

# Teste C2
css_content = '\n'.join(['color: red !important;'] * 11)
c_issues = r.check_css(css_content)
assert any('!important' in i['description'] for i in c_issues), "C2 falhou"

# Teste A1
html_a = '<img src="foto.jpg">'
a_issues = r.check_a11y(html_a)
assert any('alt' in i['description'] for i in a_issues), "A1 falhou"

# Teste A1 negativo
html_a2 = '<img src="foto.jpg" alt="foto">'
a_issues2 = r.check_a11y(html_a2)
assert not any('<img> sem atributo alt' in i['description'] for i in a_issues2), "A1 falso positivo"

print("check_dead_code + check_css + check_a11y: OK")
```

Rodar: `py C:\Users\Administrador\test_review.py`
Esperado: 3 linhas de OK impressas.

---

### Task 4: Motor de correção + relatório + fluxo principal

**Files:**
- Modify: `C:\Users\Administrador\review_metas.py`

**Interfaces:**
- Consumes:
  - `check_bugs(content) -> list[Issue]`
  - `check_security(content) -> list[Issue]`
  - `check_performance(js, html) -> list[Issue]`
  - `check_dead_code(content) -> list[Issue]`
  - `check_css(content) -> list[Issue]`
  - `check_a11y(content) -> list[Issue]`
  - `write_file(name, content)`
- Produz: script executável completo

- [ ] **Step 1: Implementar apply_fixes()**

Adicionar ao final de `review_metas.py`:

```python
def apply_fixes(issues):
    """Aplica correções automáticas nos arquivos. Retorna dict com contagem por arquivo."""
    # Agrupa issues auto=True por arquivo
    by_file = {}
    for issue in issues:
        if issue['auto']:
            by_file.setdefault(issue['file'], []).append(issue)

    counts = {}
    for fname, file_issues in by_file.items():
        content = read_file(fname)
        lines = content.split('\n')
        # Processa em ordem reversa de linha para não deslocar índices
        file_issues_sorted = sorted(file_issues, key=lambda x: x['line'], reverse=True)
        changed = 0

        for issue in file_issues_sorted:
            idx = issue['line'] - 1  # 0-based
            if idx >= len(lines):
                continue

            line = lines[idx]

            if issue['category'] == 'BUG' and 'console.log' in issue['description']:
                # B1: remove a linha inteira
                lines.pop(idx)
                changed += 1

            elif issue['category'] == 'BUG' and '===' in issue['description']:
                # B2: substitui == por === (cuidado com != e !==)
                new_line = re.sub(r'(?<![=!<>])={2}(?!=)', '===', line)
                if new_line != line:
                    lines[idx] = new_line
                    changed += 1

            elif issue['category'] == 'PERFORMANCE' and issue['fix'] == 'lazy':
                # P2: adiciona loading="lazy" ao <img>
                new_line = re.sub(r'(<img\b)', r'\1 loading="lazy"', line)
                if new_line != line:
                    lines[idx] = new_line
                    changed += 1

            elif issue['category'] == 'ACESSIBILIDADE' and issue['fix'] == 'alt=""':
                # A1: adiciona alt="" ao <img>
                new_line = re.sub(r'(<img\b)', r'\1 alt=""', line)
                if new_line != line:
                    lines[idx] = new_line
                    changed += 1

            elif issue['category'] == 'ACESSIBILIDADE' and issue['fix'] == 'aria-label="campo"':
                # A2: adiciona aria-label ao <input>
                new_line = re.sub(r'(<input\b)', r'\1 aria-label="campo"', line)
                if new_line != line:
                    lines[idx] = new_line
                    changed += 1

        if changed > 0:
            write_file(fname, '\n'.join(lines))
            counts[fname] = changed

    return counts
```

- [ ] **Step 2: Implementar print_report()**

Adicionar ao final de `review_metas.py`:

```python
CATEGORY_ICONS = {
    'BUG': '🐛 BUGS',
    'SEGURANÇA': '🔒 SEGURANÇA',
    'PERFORMANCE': '⚡ PERFORMANCE',
    'CÓDIGO MORTO': '💀 CÓDIGO MORTO',
    'CSS': '🎨 CSS',
    'ACESSIBILIDADE': '♿ ACESSIBILIDADE',
}

def print_report(issues):
    print('\n🔍 Revisão Geral — Minhas Metas')
    print('━' * 55)

    if not issues:
        print('✅ Nenhum problema encontrado. Código limpo!')
        print('━' * 55)
        return

    # Agrupa por categoria
    by_cat = {}
    for issue in issues:
        by_cat.setdefault(issue['category'], []).append(issue)

    for cat_key in ['BUG', 'SEGURANÇA', 'PERFORMANCE', 'CÓDIGO MORTO', 'CSS', 'ACESSIBILIDADE']:
        cat_issues = by_cat.get(cat_key, [])
        if not cat_issues:
            continue
        label = CATEGORY_ICONS.get(cat_key, cat_key)
        print(f'\n{label} ({len(cat_issues)})')
        for issue in cat_issues:
            auto_tag = '→ será corrigido automaticamente' if issue['auto'] else '→ requer correção manual'
            print(f'  {issue["file"]}:{issue["line"]:4d}  {issue["description"]}')
            print(f'           {auto_tag}')

    auto_count = sum(1 for i in issues if i['auto'])
    manual_count = len(issues) - auto_count
    print(f'\n{"━" * 55}')
    print(f'{len(issues)} problema(s) encontrado(s) '
          f'({auto_count} corrigível(is) automaticamente, {manual_count} apenas reportado(s)).')
```

- [ ] **Step 3: Implementar main()**

Adicionar ao final de `review_metas.py`:

```python
def main():
    print('Lendo arquivos...')
    js = read_file('app.js')
    html = read_file('index.html')
    css = read_file('styles.css')

    print('Analisando...')
    issues = []
    issues += check_bugs(js)
    issues += check_security(js)
    issues += check_performance(js, html)
    issues += check_dead_code(js)
    issues += check_css(css)
    issues += check_a11y(html)

    # Ordena por arquivo e linha
    issues.sort(key=lambda x: (x['file'], x['line']))

    print_report(issues)

    auto_issues = [i for i in issues if i['auto']]

    if not auto_issues:
        print('\nNenhuma correção automática disponível.')
    else:
        resposta = input(f'\nAplicar {len(auto_issues)} correção(ões) automática(s)? [y/n]: ').strip().lower()
        if resposta == 'y':
            counts = apply_fixes(auto_issues)
            print('\n✅ Correções aplicadas:')
            for fname, n in counts.items():
                print(f'  - {fname}: {n} alteração(ões)')
        else:
            print('Nenhuma correção aplicada.')

    deploy = input('\nFazer deploy agora? [y/n]: ').strip().lower()
    if deploy == 'y':
        print('Iniciando deploy...')
        result = subprocess.run([sys.executable, DEPLOY_SCRIPT], capture_output=False)
        if result.returncode == 0:
            print('✅ Deploy concluído.')
        else:
            print(f'❌ Deploy falhou (código {result.returncode}).')
    else:
        print('Deploy não realizado.')

if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Testar o script completo**

Rodar o script apontando para os arquivos reais:

```bash
py C:\Users\Administrador\review_metas.py
```

Verificar:
- Lê os 3 arquivos sem erros
- Exibe relatório formatado com emojis e separadores
- Pergunta `Aplicar correções? [y/n]` — responder `n`
- Pergunta `Fazer deploy agora? [y/n]` — responder `n`
- Sem traceback ou erro Python

- [ ] **Step 5: Testar com correções reais**

Adicionar temporariamente ao início de `app.js` (linha 1):
```javascript
console.log("teste review_metas");
```

Rodar novamente:
```bash
py C:\Users\Administrador\review_metas.py
```

Verificar:
- Detecta o `console.log` na linha 1
- Ao responder `y` na pergunta de correção: linha removida de `app.js`
- Confirmar: `app.js` não tem mais `console.log("teste review_metas")` na linha 1

Remover a linha de teste se ainda estiver lá após o teste.

- [ ] **Step 6: Limpar arquivo de teste**

```bash
del C:\Users\Administrador\test_review.py
```

---

## Self-Review

**Spec coverage:**
- ✅ B1 console.log → Task 1
- ✅ B2 == vs === → Task 1
- ✅ B3 funções duplicadas → Task 3 (D1 detecta não-chamadas; duplicadas são reportadas pelo check_bugs via B3 — **GAP:** B3 não foi implementado)
- ✅ S1 innerHTML → Task 2
- ✅ S2 eval → Task 2
- ✅ S3 URLs com tokens → **não implementado** (spec diz "reporta apenas", mas ausente do plano)
- ✅ P1 querySelector em loop → Task 2
- ✅ P2 img sem lazy → Task 2
- ✅ D1 funções não chamadas → Task 3
- ✅ D2 if(false) → Task 3
- ✅ C1 seletores duplicados → Task 3
- ✅ C2 !important excessivo → Task 3
- ✅ A1 img sem alt → Task 3
- ✅ A2 input sem aria-label → Task 3
- ✅ A3 button sem aria-label → Task 3
- ✅ Relatório formatado → Task 4
- ✅ Confirmação y/n → Task 4
- ✅ Apply fixes → Task 4
- ✅ Deploy opcional → Task 4

**Gaps encontrados e corrigidos:**

B3 (funções duplicadas) e S3 (URLs com tokens) estão na spec como "reporta apenas". Adicionado abaixo como correção inline:

**Adicionar ao final de `check_bugs()` antes do `return issues`:**

```python
    # B3: funções duplicadas (mesma assinatura)
    func_names = []
    for i, line in enumerate(lines, 1):
        m = re.match(r'\s*(?:async\s+)?function\s+(\w+)\s*\(', line)
        if m:
            func_names.append((m.group(1), i))

    seen = {}
    for name, line_num in func_names:
        if name in seen:
            issues.append(make_issue(
                'app.js', line_num, 'BUG',
                f'função {name}() declarada mais de uma vez (primeira: linha {seen[name]})',
                auto=False
            ))
        else:
            seen[name] = line_num
```

**Adicionar ao final de `check_security()` antes do `return issues`:**

```python
    # S3: URLs de API hardcoded com tokens
    for i, line in enumerate(lines, 1):
        if re.search(r'https?://[^\s\'"]+[?&](key|token|api_key|apikey)=\w+', line, re.IGNORECASE):
            issues.append(make_issue(
                'app.js', i, 'SEGURANÇA',
                'URL com token/key hardcoded visível no código',
                auto=False
            ))
```

**Placeholder scan:** Nenhum TBD/TODO encontrado.

**Type consistency:** `make_issue` usado consistentemente com os mesmos 6 parâmetros em todas as tasks. `read_file`/`write_file` usam os mesmos nomes de arquivo (`'app.js'`, `'index.html'`, `'styles.css'`).
