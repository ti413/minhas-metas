const DAYS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // ── UTILS ──
  function todayStr() {
    const d = new Date();
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dy}`;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // ── STATE ──
  let state = loadState();
  if (!('humor' in state)) state.humor = null;
  if (!('conquistas' in state)) state.conquistas = [];

  function defaultState() {
    return {
      metas: [
        { id: 1, text: 'Meditar 10 minutos', done: false, recurrent: true },
        { id: 2, text: 'Beber 2L de água', done: false, recurrent: true },
        { id: 3, text: 'Ler 20 páginas', done: false, recurrent: false },
        { id: 4, text: 'Exercício 30 min', done: false, recurrent: true },
        { id: 5, text: 'Estudar inglês', done: false, recurrent: false },
      ],
      history: {},
      calMonth: new Date().getMonth(),
      calYear: new Date().getFullYear(),
      lastDay: todayStr()
    };
  }

  function loadState() {
    try {
      // Tenta chave por usuário primeiro, depois genérica
      const lastUser = localStorage.getItem('minhas-metas-last-user');
      let saved = null;
      if (lastUser) saved = localStorage.getItem('minhas-metas-state-' + lastUser);
      if (!saved) saved = localStorage.getItem('minhas-metas-state');
      if (saved) {
        const s = JSON.parse(saved);
        // Se mudou o dia, zera metas (mantendo recorrentes)
        if (s.lastDay !== todayStr()) {
          const recurrentMetas = (s.metas || [])
            .filter(m => m.recurrent)
            .map(m => ({ ...m, done: false }));
          // Adiciona adiadas de hoje
          const postponed = (s.history[todayStr()] || {}).postponed || [];
          const extra = postponed.map((text, i) => ({ id: Date.now() + i, text, done: false, recurrent: false }));
          s.metas = [...recurrentMetas, ...extra];
          s.lastDay = todayStr();
        }
        s.calMonth = new Date().getMonth();
        s.calYear = new Date().getFullYear();
        aplicarStreakFreeze(s);
        return s;
      }
    } catch(e) {}
    return defaultState();
  }

  function saveState() {
    try {
      const json = JSON.stringify(state);
      // Salva sempre na chave genérica
      localStorage.setItem('minhas-metas-state', json);
      // Salva também na chave por usuário se logado
      if (currentUser) {
        localStorage.setItem('minhas-metas-state-' + currentUser.id, json);
        localStorage.setItem('minhas-metas-last-user', currentUser.id);
      }
    } catch(e) {}
    // Sync na nuvem com debounce
    clearTimeout(window._syncTimer);
    window._syncTimer = setTimeout(saveToCloud, 2000);
  }

  function dateLbl() {
    const d = new Date();
    return DAYS_PT[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_PT[d.getMonth()].slice(0, 3);
  }

  // ── HUMOR ──
  function setHumor(val) {
    state.humor = val;
    ['ruim','ok','otimo'].forEach(h => {
      const btn = document.getElementById('humor-' + h);
      btn.className = 'humor-btn' + (h === val ? ' selected-' + h : '');
    });
    saveState();
  }

  function renderHumor() {
    const val = state.humor || null;
    ['ruim','ok','otimo'].forEach(h => {
      const btn = document.getElementById('humor-' + h);
      if (btn) btn.className = 'humor-btn' + (val === h ? ' selected-' + h : '');
    });
  }

  function pct() {
    if (!state.metas.length) return 0;
    return Math.round(state.metas.filter(m => m.done).length / state.metas.length * 100);
  }

  // ── RENDER HOJE ──
  function isDayClosed() {
    const hist = (state.history || {})[todayStr()];
    return hist && hist.pct >= 0 && state.lastDay === todayStr() && state.metas.every(m => !m.done) && hist.metas && hist.metas.length > 0;
  }

  function showDayDoneBanner(show) {
    const banner = document.getElementById('day-done-banner');
    const saveBar = document.getElementById('save-bar');
    const list = document.getElementById('metas-list');
    const sectionTitle = document.querySelector('.section-title');
    if (!banner) return;
    if (show) {
      banner.style.display = 'flex';
      if (saveBar) saveBar.style.display = 'none';
      if (list) list.style.display = 'none';
      if (sectionTitle) sectionTitle.style.display = 'none';
      // Verifica meia-noite a cada minuto
      clearInterval(window._midnightTimer);
      window._midnightTimer = setInterval(() => {
        const hist = (state.history || {})[todayStr()];
        const dayClosed = hist && hist.metas && hist.metas.length > 0;
        if (!dayClosed) {
          clearInterval(window._midnightTimer);
          renderHoje();
        }
      }, 60000);
    } else {
      banner.style.display = 'none';
      if (saveBar) saveBar.style.display = 'flex';
      if (list) list.style.display = '';
      if (sectionTitle) sectionTitle.style.display = '';
      clearInterval(window._midnightTimer);
    }
  }


  function renderHoje() {
    const done = state.metas.filter(m => m.done).length;
    const total = state.metas.length;
    const p = pct();
    const circ = 251.3;

    document.getElementById('ring-pct').textContent = p + '%';
    document.getElementById('stat-feitas').textContent = done;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-pendentes').textContent = total - done;
    document.getElementById('ring-dash').style.strokeDashoffset = circ - (circ * p / 100);

    // Verifica se dia foi fechado
    const hist = (state.history || {})[todayStr()];
    const dayClosed = hist && hist.metas && hist.metas.length > 0;
    showDayDoneBanner(dayClosed);
    if (dayClosed) {
      const title = document.getElementById('day-done-title');
      if (title) title.textContent = hist.pct === 100 ? '🏆 Dia perfeito!' : `✅ Dia concluído — ${hist.pct}%`;
      renderHumor();
      renderPlanta();
      renderTrialBanner();
      return;
    }

    renderHumor();
    renderPlanta();
    renderTrialBanner();
    const list = document.getElementById('metas-list');
    list.innerHTML = '';

    if (!total) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<div class="empty-icon">🌱</div><p>Nenhuma meta por hoje.<br>Adicione uma acima!</p>';
      list.appendChild(empty);
      return;
    }

    state.metas.forEach((m, i) => {
      const div = document.createElement('div');
      div.className = 'meta-item' + (m.done ? ' done' : '');
      div.draggable = true;
      div.dataset.idx = i;

      div.innerHTML = `
        <span class="drag-handle" aria-hidden="true">
          <svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#ccc">
            <circle cx="9" cy="6" r="1" fill="#ccc"/><circle cx="15" cy="6" r="1" fill="#ccc"/>
            <circle cx="9" cy="12" r="1" fill="#ccc"/><circle cx="15" cy="12" r="1" fill="#ccc"/>
            <circle cx="9" cy="18" r="1" fill="#ccc"/><circle cx="15" cy="18" r="1" fill="#ccc"/>
          </svg>
        </span>
        <button class="check-btn${m.done ? ' checked' : ''}" onclick="toggleMeta(${m.id})" aria-label="Marcar como feita"></button>
        <span class="meta-text">${escapeHtml(m.text)}${m.categoria ? `<span class="meta-cat-tag" style="background:${getCategoriaCor(m.categoria)}22;color:${getCategoriaCor(m.categoria)}">${escapeHtml(m.categoria)}</span>` : ''}</span>
        ${m.recurrent ? (m.diasSemana ? `<span class="meta-tag recurrent" title="Meta flexível: ${m.diasSemana}x por semana">${contarDiasSemanaConcluidos(m.text)}/${m.diasSemana} na semana</span>` : '<span class="meta-tag recurrent">diária</span>') : ''}
        <div class="meta-actions">
          <button class="meta-action" onclick="postponeMeta(${m.id})" title="Adiar para amanhã" aria-label="Adiar para amanhã">
            <svg class="icon" viewBox="0 0 24 24" style="width:15px;height:15px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="10" y1="17" x2="14" y2="17"/></svg>
          </button>
          <button class="meta-action danger" onclick="removeMeta(${m.id})" title="Remover" aria-label="Remover meta">
            <svg class="icon" viewBox="0 0 24 24" style="width:15px;height:15px"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>`;

      // Drag & Drop
      div.addEventListener('dragstart', e => {
        state.dragSrc = i;
        setTimeout(() => div.classList.add('dragging'), 0);
        e.dataTransfer.effectAllowed = 'move';
      });
      div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        document.querySelectorAll('.meta-item').forEach(el => el.classList.remove('drag-over'));
        state.dragSrc = null;
      });
      div.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.meta-item').forEach(el => el.classList.remove('drag-over'));
        div.classList.add('drag-over');
      });
      div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
      div.addEventListener('drop', e => {
        e.preventDefault();
        div.classList.remove('drag-over');
        if (state.dragSrc !== null && state.dragSrc !== i) {
          const arr = [...state.metas];
          const [moved] = arr.splice(state.dragSrc, 1);
          arr.splice(i, 0, moved);
          state.metas = arr;
          saveState();
          renderHoje();
        }
      });

      list.appendChild(div);
    });
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function toggleMeta(id) {
    const m = state.metas.find(x => x.id === id);
    if (m) m.done = !m.done;
    saveState();
    renderHoje();
  }

  function removeMeta(id) {
    state.metas = state.metas.filter(x => x.id !== id);
    saveState();
    renderHoje();
  }

  function postponeMeta(id) {
    const m = state.metas.find(x => x.id === id);
    if (!m) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const key = tomorrow.toISOString().split('T')[0];
    if (!state.history[key]) state.history[key] = { metas: [], pct: 0 };
    state.history[key].postponed = state.history[key].postponed || [];
    state.history[key].postponed.push(m.text);
    removeMeta(id);
    showToast('Meta adiada para amanhã 📅');
  }

  // ── MODALS ──
  // ── CATEGORIAS ──
  const CAT_CORES = ['#3d9e72','#e67e22','#9b59b6','#3498db','#e74c3c','#16a085','#f39c12','#8e44ad'];
  let catSelecionada = null;

  // ── AGENDA STATE ──
  let agendaTarefas = [];
  let agendaYear  = new Date().getFullYear();
  let agendaMonth = new Date().getMonth();
  let agendaSelectedDate = todayStr();
  let agendaCatFilter = null;
  let agendaEditingId = null;
  let agendaPrioSelecionada = 'media';
  let agendaCatSelecionada = 'geral';

  function initCategorias() {
    if (!state.categorias) state.categorias = [];
  }

  function renderCategoriaChips() {
    initCategorias();
    const container = document.getElementById('categoria-chips');
    if (!container) return;
    container.innerHTML = '';
    state.categorias.forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'cat-chip' + (catSelecionada === cat.nome ? ' active' : '');
      chip.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${cat.cor};display:inline-block"></span>${escapeHtml(cat.nome)}`;
      chip.onclick = () => { catSelecionada = (catSelecionada === cat.nome ? null : cat.nome); renderCategoriaChips(); };
      container.appendChild(chip);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'cat-chip-add';
    addBtn.textContent = '+ Nova categoria';
    addBtn.onclick = criarCategoria;
    container.appendChild(addBtn);
  }

  function criarCategoria() {
    const nome = prompt('Nome da categoria (ex: Saúde, Trabalho):');
    if (!nome || !nome.trim()) return;
    initCategorias();
    const cor = CAT_CORES[state.categorias.length % CAT_CORES.length];
    state.categorias.push({ nome: nome.trim(), cor });
    catSelecionada = nome.trim();
    saveState();
    renderCategoriaChips();
  }

  function getCategoriaCor(nome) {
    initCategorias();
    const cat = state.categorias.find(c => c.nome === nome);
    return cat ? cat.cor : 'var(--muted)';
  }

  let diasSemanaSelecionado = 7;

  function openAddModal() {
    document.getElementById('add-modal').style.display = 'flex';
    document.getElementById('meta-input').value = '';
    catSelecionada = null;
    renderCategoriaChips();
    document.getElementById('recurrent-toggle').classList.remove('on');
    setDiasSemana(7);
    toggleDiasSemanaRow();
    setTimeout(() => document.getElementById('meta-input').focus(), 100);
  }

  function toggleDiasSemanaRow() {
    const on = document.getElementById('recurrent-toggle').classList.contains('on');
    const row = document.getElementById('dias-semana-row');
    if (row) row.style.display = on ? 'block' : 'none';
  }

  function setDiasSemana(n) {
    diasSemanaSelecionado = n;
    [3,4,5,6,7].forEach(v => {
      const b = document.getElementById('dsb-' + v);
      if (b) b.classList.toggle('active', v === n);
    });
  }

  // Progresso semanal de uma meta flexível (dom–sáb da semana atual)
  function contarDiasSemanaConcluidos(metaText) {
    const hist = state.history || {};
    const now = new Date();
    const inicioSemana = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicioSemana.getFullYear(), inicioSemana.getMonth(), inicioSemana.getDate() + i);
      const k = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      if (k === todayStr()) {
        const m = state.metas.find(x => x.text === metaText);
        if (m && m.done) count++;
        else if (hist[k] && (hist[k].metas || []).some(x => x.text === metaText && x.done)) count++;
      } else if (hist[k] && (hist[k].metas || []).some(x => x.text === metaText && x.done)) {
        count++;
      }
    }
    return count;
  }

  function closeAddModal(e) {
    if (!e || e.target.id === 'add-modal')
      document.getElementById('add-modal').style.display = 'none';
  }

  function addMeta() {
    const val = document.getElementById('meta-input').value.trim();
    if (!val) return;
    const recurrent = document.getElementById('recurrent-toggle').classList.contains('on');
    const diasSemana = recurrent && diasSemanaSelecionado < 7 ? diasSemanaSelecionado : null;
    state.metas.push({ id: Date.now(), text: val, done: false, recurrent, diasSemana, categoria: catSelecionada || null });
    trackEvent('habito_criado', { recorrente: recurrent, diasSemana: diasSemana });
    closeAddModal();
    saveState();
    renderHoje();
  }

  function savePartial() {
    const key = todayStr();
    state.history[key] = {
      pct: pct(),
      metas: state.metas.map(m => ({ text: m.text, done: m.done })),
      humor: state.humor || null
    };
    saveState();
    showToast('Progresso salvo! ✓');
  }

  function openEndDay() {
    const p = pct();
    const done = state.metas.filter(m => m.done).length;
    const total = state.metas.length;
    document.getElementById('end-feitas').textContent = done;
    document.getElementById('end-total').textContent = total;
    document.getElementById('end-pct').textContent = p + '%';
    document.getElementById('end-pct-ring').textContent = p + '%';
    document.getElementById('end-emoji').textContent = p === 100 ? '🎉' : p >= 50 ? '💪' : '🌱';
    document.getElementById('end-title').textContent = p === 100 ? (window._msgPerfeito || 'Dia perfeito!') : p >= 50 ? (window._msgBom || 'Bom trabalho!') : (window._msgAmanha || 'Continue amanhã!');
    document.getElementById('end-sub').textContent = p === 100
      ? 'Você completou todas as metas! Incrível!'
      : `Você completou ${done} de ${total} metas hoje.`;
    const circ = 219.9;
    document.getElementById('end-ring').style.strokeDashoffset = circ - (circ * p / 100);
    const modal = document.getElementById('end-modal');
    modal.style.display = 'flex';
    document.body.appendChild(modal);
  }

  function closeEndModal(e) {
    if (!e || e.target.id === 'end-modal')
      document.getElementById('end-modal').style.display = 'none';
  }

  function confirmEndDay() {
    const p = pct();
    const key = todayStr();
    const metasDodia = state.metas.map(m => ({ text: m.text, done: m.done }));
    const humorDoDia = state.humor || null;
    const streakAtual = calcStreak();

    state.history[key] = {
      pct: p,
      metas: metasDodia,
      humor: humorDoDia
    };

    if (p === 100) setTimeout(lancarConfete, 300);
    state.humor = null;
    setTimeout(checkConquistas, 600);
    trackEvent('dia_fechado', { pct: p, streak: streakAtual });

    // Streak Freeze: a cada 7 dias completados, ganha 1 (máx. 2)
    if (p > 0) {
      state.diasCompletados = (state.diasCompletados || 0) + 1;
      state.freezes = state.freezes || 0;
      if (state.diasCompletados % 7 === 0 && state.freezes < MAX_FREEZES) {
        state.freezes++;
        setTimeout(() => showToast('🧊 Você ganhou um Streak Freeze! Um dia perdido não zera mais sua sequência.'), 1200);
      }
    }

    // Mantém só recorrentes, zeradas
    state.metas = state.metas
      .filter(m => m.recurrent)
      .map(m => ({ ...m, done: false }));
    state.lastDay = todayStr();
    saveState();
    closeEndModal();
    renderHoje();
    renderDash();

    // Mostra tela de dia encerrado
    showDayClosedScreen(p, metasDodia, humorDoDia, streakAtual);
  }

  function calcStreak() {
    return calcStreakFromHist(state.history || {});
  }

  function calcStreakFromHist(hist) {
    if (!hist) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 1; i <= 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const k = d.toISOString().split('T')[0];
      if (hist[k] && hist[k].pct > 0) streak++;
      else if (hist[k] && hist[k].frozen) continue; // dia congelado: streak sobrevive, não soma
      else break;
    }
    return streak;
  }

  // ── STREAK FREEZE ──
  // Ganha 1 freeze a cada 7 dias completados (máx. 2). Dia perdido consome
  // freeze em vez de zerar o streak — a plantinha murcha mas não morre.
  const MAX_FREEZES = 2;

  function aplicarStreakFreeze(s) {
    try {
      if (!s || !s.history) return;
      s.freezes = s.freezes || 0;
      if (s.freezes <= 0) return;
      const today = new Date();
      const missing = [];
      let ancorado = false;
      for (let i = 1; i <= 30; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const k = d.toISOString().split('T')[0];
        const h = s.history[k];
        if (h && (h.pct > 0 || h.frozen)) { ancorado = missing.length > 0; break; }
        if (h) return; // dia fechado com 0% de verdade — quebra real, freeze não salva
        missing.push(k);
        if (missing.length > s.freezes) return; // gap maior que os freezes disponíveis
      }
      if (!ancorado) return;
      missing.forEach(k => { s.history[k] = { pct: 0, metas: [], humor: null, frozen: true }; });
      s.freezes -= missing.length;
      s.freezeAvisoPendente = true;
    } catch(e) {}
  }

  function showDayClosedScreen(p, metas, humor, streak) {
    const screen = document.getElementById('day-closed-screen');
    screen.style.display = 'block';
    screen.scrollTop = 0;

    // Emoji e título
    const emoji = p === 100 ? '🏆' : p >= 50 ? '💪' : '🌱';
    const title = p === 100
      ? (window._msgPerfeito || 'Dia perfeito!')
      : p >= 50
      ? (window._msgBom || 'Bom trabalho!')
      : (window._msgAmanha || 'Continue amanhã!');

    document.getElementById('dcs-emoji').textContent = emoji;
    document.getElementById('dcs-title').textContent = title;

    // Data
    const hoje = new Date();
    document.getElementById('dcs-date').textContent =
      hoje.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

    // Ring
    const circ = 314;
    setTimeout(() => {
      document.getElementById('dcs-ring').style.strokeDashoffset = circ - (circ * p / 100);
      document.getElementById('dcs-ring').style.stroke = p === 100 ? 'var(--green)' : p >= 50 ? 'var(--green)' : 'var(--muted)';
    }, 100);
    document.getElementById('dcs-pct').textContent = p + '%';

    // Stats
    const feitas = metas.filter(m => m.done).length;
    document.getElementById('dcs-feitas').textContent = feitas;
    document.getElementById('dcs-total').textContent = metas.length;
    document.getElementById('dcs-streak').textContent = streak;

    // Lista de metas
    const lista = document.getElementById('dcs-metas-list');
    lista.innerHTML = metas.map(m => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:18px">${m.done ? '✅' : '⬜'}</span>
        <span style="font-size:14px;color:${m.done ? 'var(--ink)' : 'var(--muted)'}">${m.text}</span>
      </div>`).join('');

    // Humor
    const humorMap = { ruim: '😞 Ruim', ok: '😐 Ok', otimo: '😄 Ótimo' };
    if (humor) {
      document.getElementById('dcs-humor-wrap').style.display = 'block';
      document.getElementById('dcs-humor').textContent = humorMap[humor] || humor;
    }

    // Mensagem motivacional
    const msgs = {
      100: '🔥 Você completou todas as metas! Continue assim amanhã!',
      50: '👏 Mais da metade concluída. Amanhã você vai ainda mais longe!',
      0: '🌱 Cada dia é uma nova chance. Amanhã começa agora!'
    };
    const msgEl = document.getElementById('dcs-msg');
    const msgKey = p === 100 ? 100 : p >= 50 ? 50 : 0;
    msgEl.textContent = msgs[msgKey];
    msgEl.style.display = 'block';
  }

  function closeDayClosedScreen() {
    document.getElementById('day-closed-screen').style.display = 'none';
  }



  // ── CALENDÁRIO ──
  function renderCal() {
    const yr = state.calYear, mo = state.calMonth;
    document.getElementById('cal-month-label').textContent = MONTHS_PT[mo] + ' ' + yr;
    const first = new Date(yr, mo, 1).getDay();
    const days = new Date(yr, mo + 1, 0).getDate();
    const todayKey = todayStr();
    const grid = document.getElementById('cal-grid');
    grid.innerHTML = '';

    DAYS_PT.forEach(d => {
      const lbl = document.createElement('div');
      lbl.className = 'cal-day-label';
      lbl.textContent = d[0];
      grid.appendChild(lbl);
    });

    for (let i = 0; i < first; i++) {
      const e = document.createElement('div');
      e.className = 'cal-day empty';
      grid.appendChild(e);
    }

    for (let d = 1; d <= days; d++) {
      const key = `${yr}-${pad2(mo + 1)}-${pad2(d)}`;
      const hist = state.history[key];
      const p = hist ? hist.pct : -1;
      const div = document.createElement('div');

      let cls = 'cal-day';
      if (key === todayKey) cls += ' today';
      if (p < 0) cls += ' none';
      else if (p === 0) cls += ' none';
      else if (p < 50) cls += ' low';
      else if (p < 100) cls += ' mid';
      else cls += ' full';

      div.className = cls;
      div.textContent = d;
      div.onclick = () => showCalDetail(key, d, mo, hist);
      grid.appendChild(div);
    }
  }

  function showCalDetail(key, d, mo, hist) {
    const det = document.getElementById('cal-detail');
    if (!hist || !hist.metas || !hist.metas.length) {
      det.classList.remove('show');
      return;
    }
    const humorMap = { ruim: '😔 Ruim', ok: '😐 Ok', otimo: '😄 Ótimo' };
    const humorStr = hist.humor ? '  ' + humorMap[hist.humor] : '';
    document.getElementById('cal-detail-title').textContent =
      `${d} de ${MONTHS_PT[mo]} — ${hist.pct}% concluído${humorStr}`;
    const items = document.getElementById('cal-detail-items');
    items.innerHTML = '';
    hist.metas.forEach(m => {
      const div = document.createElement('div');
      div.className = 'cal-detail-item';
      div.innerHTML = `<div class="dot" style="background:${m.done ? '#3d9e72' : '#ddd'}"></div>${escapeHtml(m.text)}`;
      items.appendChild(div);
    });
    det.classList.add('show');
  }

  function changeMonth(dir) {
    state.calMonth += dir;
    if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
    if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
    document.getElementById('cal-detail').classList.remove('show');
    renderCal();
  }

  // ── DASHBOARD ──
  function renderHumorCorr() {
    const hist = state.history;
    const grupos = { ruim: [], ok: [], otimo: [] };

    Object.values(hist).forEach(d => {
      if (d.humor && d.pct !== undefined) {
        grupos[d.humor].push(d.pct);
      }
    });

    const total = Object.values(grupos).reduce((a, g) => a + g.length, 0);
    if (total < 3) {
      document.getElementById('humor-corr-section').style.display = 'none';
      return;
    }

    document.getElementById('humor-corr-section').style.display = 'block';

    const avg = arr => arr.length ? Math.round(arr.reduce((a,b) => a+b, 0) / arr.length) : null;

    const medias = {
      ruim: avg(grupos.ruim),
      ok: avg(grupos.ok),
      otimo: avg(grupos.otimo)
    };

    ['ruim','ok','otimo'].forEach(h => {
      const pctEl = document.getElementById('corr-' + h + '-pct');
      const diasEl = document.getElementById('corr-' + h + '-dias');
      if (medias[h] !== null) {
        pctEl.textContent = medias[h] + '%';
        diasEl.textContent = grupos[h].length + ' dia' + (grupos[h].length > 1 ? 's' : '');
      } else {
        pctEl.textContent = '—';
        diasEl.textContent = 'sem dados';
      }
    });

    // Gerar insight
    const insight = document.getElementById('humor-insight');
    const validos = Object.entries(medias).filter(([k,v]) => v !== null);
    if (validos.length >= 2) {
      const melhor = validos.reduce((a, b) => a[1] > b[1] ? a : b);
      const pior = validos.reduce((a, b) => a[1] < b[1] ? a : b);
      const humorNome = { ruim: '😔 ruim', ok: '😐 ok', otimo: '😄 ótimo' };
      const diff = melhor[1] - pior[1];

      if (diff >= 10) {
        insight.innerHTML = '<strong>Descoberta:</strong> Nos dias em que seu humor está ' +
          humorNome[melhor[0]] + ', você completa <strong>' + melhor[1] + '%</strong> das metas — ' +
          diff + ' pontos a mais do que nos dias ' + humorNome[pior[0]] + '. Seu estado de espírito impacta muito sua produtividade!';
      } else if (diff > 0) {
        insight.innerHTML = '<strong>Você é consistente!</strong> Seu desempenho nas metas é parecido independente do humor — completando entre ' + pior[1] + '% e ' + melhor[1] + '%. Isso é disciplina de verdade! 💪';
      } else {
        insight.innerHTML = '<strong>Incrível!</strong> Seu desempenho nas metas é igual independente do humor. Você é muito consistente!';
      }
      insight.style.display = 'block';
    } else {
      insight.style.display = 'none';
    }
  }

  function renderOverview() {
    const container = document.getElementById('overview-grid');
    if (!container) return;
    initTreinos(); initLivros(); initDiario();

    // Treinos feitos na semana (últimos 7 dias)
    let treinosSemana = 0;
    const hoje = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(hoje.getDate() - i);
      const diaSemana = d.getDay();
      const chave = d.toISOString().split('T')[0] + '-' + diaSemana;
      if (state.treinosConcluidos && state.treinosConcluidos[chave]) treinosSemana++;
    }

    // Livros
    const livrosLendo = (state.livros || []).filter(l => l.status === 'lendo').length;
    const livrosConcluidos = (state.livros || []).filter(l => l.status === 'concluido').length;

    // Diário - entradas na semana
    let diarioSemana = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(hoje.getDate() - i);
      const k = d.toISOString().split('T')[0];
      if (state.diario && state.diario[k]) diarioSemana++;
    }

    // Metas longas ativas
    const metasLongasAtivas = (state.metasLongas || []).filter(m => m.atual < m.total).length;

    // Saldo do mês
    initFinancas();
    const mesAtualStr = new Date().getFullYear() + '-' + String(new Date().getMonth()+1).padStart(2,'0');
    const transMes = (state.transacoes || []).filter(t => t.data.startsWith(mesAtualStr));
    const saldoMes = transMes.reduce((a,t) => a + (t.tipo === 'entrada' ? t.valor : -t.valor), 0);

    const cards = [];
    if (modulosAtivos.treino) cards.push(`
      <div class="overview-card">
        <div class="overview-icon">💪</div>
        <div class="overview-info">
          <div class="overview-val">${treinosSemana}</div>
          <div class="overview-label">treinos esta semana</div>
        </div>
      </div>`);
    if (modulosAtivos.extras) cards.push(`
      <div class="overview-card">
        <div class="overview-icon">📚</div>
        <div class="overview-info">
          <div class="overview-val">${livrosLendo}</div>
          <div class="overview-label">livros lendo${livrosConcluidos ? ' · ' + livrosConcluidos + ' lidos' : ''}</div>
        </div>
      </div>`);
    cards.push(`
      <div class="overview-card">
        <div class="overview-icon">💭</div>
        <div class="overview-info">
          <div class="overview-val">${diarioSemana}</div>
          <div class="overview-label">dias de diário</div>
        </div>
      </div>
      <div class="overview-card">
        <div class="overview-icon">🎯</div>
        <div class="overview-info">
          <div class="overview-val">${metasLongasAtivas}</div>
          <div class="overview-label">metas em andamento</div>
        </div>
      </div>`);
    if (modulosAtivos.extras) cards.push(`
      <div class="overview-card" style="grid-column:span 2">
        <div class="overview-icon">💰</div>
        <div class="overview-info">
          <div class="overview-val" style="color:${saldoMes >= 0 ? 'var(--green)' : '#e74c3c'}">${fmtMoeda(saldoMes)}</div>
          <div class="overview-label">saldo do mês</div>
        </div>
      </div>`);
    container.innerHTML = cards.join('');
  }

  function renderDash() {
    renderOverview();
    renderConquistas();
    renderHumorCorr();
    renderStravaCard();
    const hist = state.history;
    const todayKey = todayStr();

    // Streak
    let streak = 0;
    const d = new Date();
    while (true) {
      const k = d.toISOString().split('T')[0];
      if (hist[k] && hist[k].pct > 0) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    document.getElementById('streak-num').textContent = streak;
    document.getElementById('streak-label').textContent = streak === 1 ? 'dia seguido' : 'dias seguidos';
    document.getElementById('streak-sub').textContent = streak > 0
      ? `Incrível! Continue assim 🔥`
      : 'Complete hoje para começar!';
    const shareBtn = document.getElementById('share-streak-btn');
    if (shareBtn) shareBtn.style.display = streak >= 3 ? 'block' : 'none';

    // Últimos 7 dias
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const dd = new Date(); dd.setDate(dd.getDate() - i);
      last7.push(dd.toISOString().split('T')[0]);
    }
    const vals = last7.map(k => hist[k] ? hist[k].pct : 0);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    document.getElementById('week-avg').textContent = avg + '%';

    const maxVal = Math.max(...vals);
    const maxIdx = vals.lastIndexOf(maxVal);
    const bestKey = last7[maxIdx];
    const bestDate = new Date(bestKey + 'T12:00:00');
    document.getElementById('best-day-label').textContent = maxVal > 0 ? DAYS_PT[bestDate.getDay()] : '—';

    // Gráfico
    const chart = document.getElementById('bar-chart');
    chart.innerHTML = '';
    last7.forEach((k, i) => {
      const p = vals[i];
      const date = new Date(k + 'T12:00:00');
      const row = document.createElement('div');
      row.className = 'bar-row';
      row.innerHTML = `
        <span class="bar-day">${DAYS_PT[date.getDay()]}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${p}%"></div></div>
        <span class="bar-pct">${p}%</span>`;
      chart.appendChild(row);
    });

    // Meta mais consistente
    const metaCounts = {};
    Object.values(hist).forEach(day => {
      if (!day.metas) return;
      day.metas.forEach(m => {
        if (!metaCounts[m.text]) metaCounts[m.text] = { done: 0, total: 0 };
        metaCounts[m.text].total++;
        if (m.done) metaCounts[m.text].done++;
      });
    });
    let bestMeta = null, bestPct = 0;
    Object.entries(metaCounts).forEach(([name, v]) => {
      if (v.total < 2) return;
      const p = Math.round(v.done / v.total * 100);
      if (p > bestPct) { bestPct = p; bestMeta = name; }
    });
    document.getElementById('best-meta-name').textContent = bestMeta || 'Sem dados ainda';
    document.getElementById('best-meta-pct').textContent = bestMeta
      ? bestPct + '% de conclusão'
      : 'Registre mais dias para ver';
  }

  async function renderStravaCard() {
    const section = document.getElementById('strava-km-section');
    if (!section || !currentUser) return;
    try {
      const { data: conn, error: connError } = await sb.from('strava_connections').select('user_id').eq('user_id', currentUser.id).maybeSingle();
      if (connError) console.warn('renderStravaCard:', connError);
      if (!conn) { section.style.display = 'none'; return; }
      const hoje = todayStr();
      const { data: atividades, error: atividadesError } = await sb.from('strava_activities').select('distance').eq('user_id', currentUser.id).eq('activity_date', hoje);
      if (atividadesError) console.warn('renderStravaCard:', atividadesError);
      const totalMetros = (atividades || []).reduce((soma, a) => soma + (a.distance || 0), 0);
      const km = (totalMetros / 1000).toFixed(1);
      document.getElementById('strava-km-num').textContent = km;
      section.style.display = 'block';
    } catch (e) {
      console.warn('renderStravaCard:', e);
    }
  }

  // ── MÓDULOS OPCIONAIS (feature flags via admin_config.modulos) ──
  let modulosAtivos = { agenda: false, treino: false, extras: false };

  const MODULO_NAV = {
    agenda: { label: 'Agenda', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    treino: { label: 'Treino', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5h11"/><path d="M6.5 17.5h11"/><path d="M3 9.5h3v5H3z"/><path d="M18 9.5h3v5h-3z"/></svg>' },
    extras: { label: 'Extras', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>' }
  };

  function renderModuleNav() {
    const bar = document.querySelector('.bottom-bar');
    if (!bar) return;
    bar.querySelectorAll('.bar-btn-modulo').forEach(b => b.remove());
    const coachBtn = document.getElementById('btn-coach');
    Object.keys(MODULO_NAV).forEach(mod => {
      if (!modulosAtivos[mod]) return;
      const btn = document.createElement('button');
      btn.className = 'bar-btn bar-btn-modulo';
      btn.id = 'btn-' + mod;
      btn.onclick = () => switchTab(mod);
      btn.innerHTML = MODULO_NAV[mod].svg + '<span class="tab-label">' + MODULO_NAV[mod].label + '</span>';
      bar.insertBefore(btn, coachBtn);
    });
  }

  // ── TABS ──
  function switchTab(tab) {
    if ((tab === 'agenda' || tab === 'treino' || tab === 'extras') && !modulosAtivos[tab]) tab = 'hoje';
    ['hoje', 'agenda', 'treino', 'extras', 'dash', 'coach'].forEach(t => {
      const screen = document.getElementById('screen-' + t);
      const btn = document.getElementById('btn-' + t);
      if (screen) screen.classList.toggle('active', t === tab);
      if (btn) btn.classList.toggle('active', t === tab);
    });
    if (tab === 'agenda') renderAgenda();
    if (tab === 'dash') { renderDash(); renderCal(); renderMetasLongas(); }
    if (tab === 'extras') renderExtras();
    if (tab === 'treino') renderTreinoScreen();
    if (tab === 'coach') {
      // Auto-seleciona coach salvo no onboarding se nenhum estiver ativo
      if (!mentorAtivo) {
        var pref = localStorage.getItem('coach_pref');
        if (pref === 'huberman') { pref = 'estoico'; localStorage.setItem('coach_pref', 'estoico'); }
        if (pref) setTimeout(function() { setMentor(pref); }, 50);
      }
      setTimeout(gerarInsightDiario, 100);
      atualizarReflexoesBtn();
    }
  }

  // ── PLANTINHA ──
  const PLANTAS = [
    { streak: 0,  svg: `<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="30" cy="48" r="8" fill="#8B7355"/><ellipse cx="30" cy="42" rx="4" ry="2" fill="#6B5A3E"/></svg>`, label: 'Plante um hábito hoje' },
    { streak: 1,  svg: `<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect x="27" y="30" width="6" height="22" rx="3" fill="#5a8a4a"/><ellipse cx="30" cy="28" rx="10" ry="12" fill="#4CAF87"/><ellipse cx="22" cy="34" rx="7" ry="9" fill="#3d9e72"/></svg>`, label: 'Broto surgindo!' },
    { streak: 3,  svg: `<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect x="27" y="26" width="6" height="26" rx="3" fill="#5a8a4a"/><ellipse cx="30" cy="22" rx="14" ry="16" fill="#4CAF87"/><ellipse cx="18" cy="30" rx="10" ry="12" fill="#3d9e72"/><ellipse cx="42" cy="30" rx="10" ry="12" fill="#3d9e72"/></svg>`, label: 'Crescendo...' },
    { streak: 7,  svg: `<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect x="27" y="22" width="6" height="30" rx="3" fill="#5a8a4a"/><ellipse cx="30" cy="16" rx="18" ry="18" fill="#4CAF87"/><ellipse cx="14" cy="26" rx="12" ry="14" fill="#3d9e72"/><ellipse cx="46" cy="26" rx="12" ry="14" fill="#3d9e72"/><ellipse cx="30" cy="8" rx="10" ry="10" fill="#5dc496"/></svg>`, label: 'Uma semana forte!' },
    { streak: 14, svg: `<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect x="26" y="18" width="8" height="34" rx="4" fill="#4a7a3a"/><ellipse cx="30" cy="12" rx="22" ry="20" fill="#4CAF87"/><ellipse cx="10" cy="24" rx="14" ry="16" fill="#3d9e72"/><ellipse cx="50" cy="24" rx="14" ry="16" fill="#3d9e72"/><ellipse cx="30" cy="4" rx="12" ry="12" fill="#5dc496"/><circle cx="20" cy="14" r="5" fill="#7dd4aa"/><circle cx="40" cy="14" r="5" fill="#7dd4aa"/></svg>`, label: 'Está ficando grande!' },
    { streak: 21, svg: `<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect x="25" y="14" width="10" height="38" rx="5" fill="#4a7a3a"/><ellipse cx="30" cy="8" rx="26" ry="22" fill="#4CAF87"/><ellipse cx="6" cy="22" rx="16" ry="18" fill="#3d9e72"/><ellipse cx="54" cy="22" rx="16" ry="18" fill="#3d9e72"/><ellipse cx="30" cy="2" rx="14" ry="12" fill="#5dc496"/><circle cx="18" cy="10" r="6" fill="#7dd4aa"/><circle cx="42" cy="10" r="6" fill="#7dd4aa"/><circle cx="30" cy="18" r="4" fill="#a8e6cf"/></svg>`, label: 'Quase uma floresta!' },
    { streak: 30, svg: `<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect x="24" y="10" width="12" height="42" rx="6" fill="#4a7a3a"/><ellipse cx="30" cy="4" rx="28" ry="22" fill="#4CAF87"/><ellipse cx="4" cy="20" rx="18" ry="20" fill="#3d9e72"/><ellipse cx="56" cy="20" rx="18" ry="20" fill="#3d9e72"/><ellipse cx="30" cy="-2" rx="16" ry="14" fill="#5dc496"/><circle cx="16" cy="8" r="7" fill="#7dd4aa"/><circle cx="44" cy="8" r="7" fill="#7dd4aa"/><circle cx="30" cy="14" r="5" fill="#a8e6cf"/><circle cx="20" cy="18" r="4" fill="#a8e6cf"/><circle cx="40" cy="18" r="4" fill="#a8e6cf"/></svg>`, label: '30 dias! Lendário! 🏆' },
  ];

  const PLANTA_MURCHA_SVG = `<svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="30" cy="50" r="7" fill="#8B7355"/><ellipse cx="30" cy="44" rx="4" ry="2" fill="#6B5A3E"/><rect x="28" y="28" width="4" height="18" rx="2" fill="#7a6a4a"/><path d="M30 28 Q20 22 18 14 Q24 16 28 26" fill="#9ab87a" opacity=".7"/><path d="M30 32 Q40 26 42 18 Q36 20 32 30" fill="#9ab87a" opacity=".5"/></svg>`;

  function getPlanta(streak) {
    let p = PLANTAS[0];
    for (const pl of PLANTAS) { if (streak >= pl.streak) p = pl; }
    return p;
  }


  function renderPlanta() {
    const hist = state.history || {};
    const streak = calcStreakFromHist(hist);
    const emojiEl = document.getElementById('plant-emoji');
    const label = document.getElementById('plant-streak');

    // Ontem foi salvo por um freeze? Plantinha murcha mas viva.
    const ontemF = new Date(); ontemF.setDate(ontemF.getDate() - 1);
    const ontemFKey = ontemF.toISOString().split('T')[0];
    if (hist[ontemFKey] && hist[ontemFKey].frozen) {
      if (emojiEl) emojiEl.innerHTML = PLANTA_MURCHA_SVG;
      if (label) label.innerHTML = '🧊 Um freeze salvou sua sequência de <strong>' + streak + ' dia' + (streak > 1 ? 's' : '') + '</strong> — complete hoje para revivê-la!';
      if (state.freezeAvisoPendente) {
        state.freezeAvisoPendente = false;
        saveState();
        setTimeout(() => showToast('🧊 Seu Streak Freeze foi usado — sua sequência está protegida!'), 800);
      }
      return;
    }

    // Detecta streak quebrado: tinha histórico, ontem tinha progresso, hoje streak=0
    const totalDias = Object.keys(hist).length;
    const ontem = new Date(); ontem.setDate(ontem.getDate() - 1);
    const ontemKey = ontem.toISOString().split('T')[0];
    const tinhaOntem = hist[ontemKey] && hist[ontemKey].pct > 0;
    const streakQuebrado = totalDias > 0 && streak === 0 && tinhaOntem;

    if (streakQuebrado) {
      if (emojiEl) emojiEl.innerHTML = PLANTA_MURCHA_SVG;
      if (label) label.innerHTML = '🥀 Sua plantinha murchou — <strong>registre hoje para revivê-la!</strong>';
      return;
    }

    const planta = getPlanta(streak);
    if (emojiEl) emojiEl.innerHTML = planta.svg;
    if (label) {
      const freezeBadge = (state.freezes > 0) ? ' <span title="Streak Freezes disponíveis">🧊×' + state.freezes + '</span>' : '';
      if (streak > 0) {
        label.innerHTML = planta.label + ' — <strong>' + streak + ' dia' + (streak > 1 ? 's' : '') + '</strong>' + freezeBadge;
      } else {
        label.innerHTML = escapeHtml(planta.label) + freezeBadge;
      }
    }
  }

  // Recuperação pós-falha: streak quebrou de verdade → mensagem acolhedora (1x/dia)
  function checkStreakQuebrado() {
    try {
      const hist = state.history || {};
      if (calcStreakFromHist(hist) > 0) return;
      // streak que terminou há 1-2 dias (havia dia completado anteontem ou antes)
      let tinhaStreak = false;
      for (let i = 2; i <= 4; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const k = d.toISOString().split('T')[0];
        if (hist[k] && hist[k].pct > 0) { tinhaStreak = true; break; }
      }
      if (!tinhaStreak) return;
      const flagKey = 'streak-recuperacao-' + todayStr();
      if (localStorage.getItem(flagKey)) return;
      localStorage.setItem(flagKey, '1');
      setTimeout(() => showToast('🌱 Um dia perdido não apaga seu progresso. Recomece hoje — seu coach está te esperando.'), 2500);
    } catch(e) {}
  }

  // ── LIVROS ──
  let livroAtualId = null;

  function initLivros() {
    if (!state.livros) state.livros = [];
  }

  function renderLivros() {
    initLivros();
    const list = document.getElementById('livros-list');
    const stats = document.getElementById('livros-stats');
    if (!list) return;

    const total = state.livros.length;
    const lendo = state.livros.filter(l => l.status === 'lendo').length;
    const concluidos = state.livros.filter(l => l.status === 'concluido').length;

    if (stats) stats.innerHTML = `
      <div class="stat"><div class="stat-n">${total}</div><div class="stat-l">total</div></div>
      <div class="stat green"><div class="stat-n">${lendo}</div><div class="stat-l">lendo</div></div>
      <div class="stat"><div class="stat-n">${concluidos}</div><div class="stat-l">concluídos</div></div>`;

    if (!total) {
      list.innerHTML = `<div style="text-align:center;padding:48px 20px"><div style="font-size:48px;margin-bottom:12px">📚</div><div style="font-size:16px;font-weight:600;color:var(--ink);margin-bottom:8px">Nenhum livro ainda</div><div style="font-size:13px;color:var(--muted);line-height:1.5">Adicione um livro e acompanhe<br>sua leitura página a página.</div></div>`;
      return;
    }

    list.innerHTML = '';
    state.livros.forEach(livro => {
      const pct = livro.totalPaginas > 0 ? Math.round((livro.paginasLidas / livro.totalPaginas) * 100) : 0;
      const statusMap = { lendo: '📖 Lendo', concluido: '✅ Concluído', 'quero-ler': '🔖 Quero ler' };
      const statusClass = livro.status || 'lendo';
      const card = document.createElement('div');
      card.className = 'livro-card';
      card.innerHTML = `
        <div class="livro-capa">
          ${livro.capa ? `<img src="${livro.capa}" alt="${escapeHtml(livro.titulo)}" onerror="this.parentElement.textContent='📖'"/>` : '📖'}
        </div>
        <div class="livro-info">
          <div class="livro-status ${statusClass}">${statusMap[statusClass] || '📖 Lendo'}</div>
          <div class="livro-titulo">${escapeHtml(livro.titulo)}</div>
          <div class="livro-autor">${escapeHtml(livro.autor || '')}</div>
          <div class="livro-progress-bar"><div class="livro-progress-fill" style="width:${pct}%"></div></div>
          <div class="livro-progress-row">
            <span class="livro-pct">${pct}%</span>
            <span class="livro-paginas">${livro.paginasLidas || 0} / ${livro.totalPaginas || '?'} pág.</span>
          </div>
        </div>
        <div class="livro-actions">
          <button class="livro-btn" onclick="openUpdatePaginas('${livro.id}')" title="Atualizar progresso">
            <svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="livro-btn danger" onclick="removerLivro('${livro.id}')" title="Remover">
            <svg style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>`;
      list.appendChild(card);
    });
  }

  function openAddLivroModal() {
    const modal = document.getElementById('add-livro-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'all';
    const t = document.getElementById('livro-titulo-manual');
    const a = document.getElementById('livro-autor-manual');
    const p = document.getElementById('livro-paginas-manual');
    const pa = document.getElementById('livro-pagina-atual-manual');
    const cp = document.getElementById('capa-preview');
    if (t) t.value = '';
    if (a) a.value = '';
    if (p) p.value = '';
    if (pa) pa.value = '';
    if (cp) { cp.innerHTML = '<div style="font-size:22px;margin-bottom:4px">📷</div>Foto da capa'; cp.style.border = '2px dashed var(--border)'; }
    capaBase64 = '';
    setTimeout(() => { if (t) t.focus(); }, 100);
  }

  function closeAddLivroModal(e) {
    if (!e || e.target.id === 'add-livro-modal') {
      const modal = document.getElementById('add-livro-modal');
      if (modal) { modal.style.display = 'none'; modal.style.pointerEvents = 'none'; }
    }
  }

  async function buscarLivro() {
    const buscaEl = document.getElementById('livro-busca');
    if (!buscaEl) return;
    const q = buscaEl.value.trim();
    if (!q) return;
    const loading = document.getElementById('busca-loading');
    const results = document.getElementById('busca-results');
    if (loading) loading.style.display = 'block';
    if (results) results.innerHTML = '';
    try {
      const url = 'https://www.googleapis.com/books/v1/volumes?q=' + encodeURIComponent(q) + '&maxResults=6';
      const r = await fetch(url);
      const data = await r.json();
      loading.style.display = 'none';
      if (!data.items || !data.items.length) {
        results.innerHTML = '<div style="text-align:center;padding:16px;font-size:13px;color:var(--muted)">Nenhum resultado.</div>';
        return;
      }
      data.items.forEach(item => {
        const info = item.volumeInfo;
        const capa = info.imageLinks ? info.imageLinks.thumbnail.replace('http:', 'https:') : '';
        const titulo = info.title || 'Sem título';
        const autor = (info.authors || []).join(', ');
        const paginas = info.pageCount || 0;
        const div = document.createElement('div');
        div.className = 'busca-item';
        div.innerHTML = `
          ${capa ? `<img class="busca-capa" src="${capa}" onerror="this.style.display='none'"/>` : '<div class="busca-capa" style="display:flex;align-items:center;justify-content:center;font-size:20px">📖</div>'}
          <div class="busca-info">
            <div class="busca-titulo">${escapeHtml(titulo)}</div>
            <div class="busca-autor">${escapeHtml(autor)}</div>
            <div class="busca-paginas">${paginas ? paginas + ' páginas' : 'Páginas não informadas'}</div>
          </div>`;
        div.onclick = () => adicionarLivroAPI(titulo, autor, capa, paginas);
        results.appendChild(div);
      });
    } catch(e) {
      loading.style.display = 'none';
      results.innerHTML = '<div style="text-align:center;padding:16px;font-size:13px;color:var(--muted)">Erro na busca.</div>';
    }
  }

  function adicionarLivroAPI(titulo, autor, capa, paginas) {
    // Mostrar form de página atual após selecionar da busca
    const results = document.getElementById('busca-results');
    results.innerHTML = `
      <div style="background:var(--green-pale);border-radius:var(--radius);padding:14px;border:1px solid rgba(61,158,114,.2);margin-bottom:10px">
        <div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:2px">${escapeHtml(titulo)}</div>
        <div style="font-size:12px;color:var(--muted)">${escapeHtml(autor)} · ${paginas ? paginas + ' páginas' : 'Páginas não informadas'}</div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Em qual página você está?</div>
      <input type="number" id="pagina-atual-api" placeholder="0 = ainda não comecei" min="0" max="${paginas}"
        style="width:100%;padding:10px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface);font-size:15px;font-family:inherit;outline:none;color:var(--ink);margin-bottom:10px" />
      <button onclick="confirmarLivroAPI('${escapeHtml(titulo).replace(/'/g,"\'")}','${escapeHtml(autor).replace(/'/g,"\'")}','${capa}',${paginas})"
        style="width:100%;padding:12px;border-radius:var(--radius);border:none;background:var(--green);color:white;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit">
        Adicionar livro
      </button>`;
    document.getElementById('btn-manual-toggle') && (document.getElementById('btn-manual-toggle').style.display = 'none');
  }

  function confirmarLivroAPI(titulo, autor, capa, paginas) {
    const paginaAtual = parseInt(document.getElementById('pagina-atual-api').value) || 0;
    initLivros();
    state.livros.push({
      id: 'l' + Date.now(),
      titulo, autor, capa,
      totalPaginas: paginas,
      paginasLidas: Math.min(paginaAtual, paginas),
      status: (paginas && paginaAtual >= paginas) ? 'concluido' : 'lendo',
      adicionadoEm: todayStr()
    });
    saveState();
    closeAddLivroModal();
    renderLivros();
    showToast('📚 Livro adicionado!');
  }

  let capaBase64 = '';

  function previewCapa(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = e => {
      capaBase64 = e.target.result;
      const preview = document.getElementById('capa-preview');
      preview.innerHTML = `<img src="${capaBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:6px"/>`;
      preview.style.border = '2px solid var(--green)';
    };
    reader.readAsDataURL(file);
  }

  function adicionarLivroManual() {
    const titulo = document.getElementById('livro-titulo-manual').value.trim();
    const autor = document.getElementById('livro-autor-manual').value.trim();
    const paginas = parseInt(document.getElementById('livro-paginas-manual').value) || 0;
    const paginaAtual = parseInt(document.getElementById('livro-pagina-atual-manual').value) || 0;
    if (!titulo) { showToast('Digite o título do livro'); return; }
    initLivros();
    state.livros.push({
      id: 'l' + Date.now(),
      titulo,
      autor: autor || 'Autor desconhecido',
      capa: capaBase64 || '',
      totalPaginas: paginas,
      paginasLidas: Math.min(paginaAtual, paginas),
      status: (paginas && paginaAtual >= paginas) ? 'concluido' : 'lendo',
      adicionadoEm: todayStr()
    });
    capaBase64 = '';
    saveState();
    closeAddLivroModal();
    renderLivros();
    showToast('📚 Livro adicionado!');
  }

  function removerLivro(id) {
    state.livros = state.livros.filter(l => l.id !== id);
    saveState();
    renderLivros();
  }

  function openUpdatePaginas(id) {
    const livro = state.livros.find(l => l.id === id);
    if (!livro) return;
    livroAtualId = id;
    document.getElementById('update-livro-titulo').textContent = livro.titulo;
    document.getElementById('update-livro-info').textContent = 'Total: ' + (livro.totalPaginas || '?') + ' páginas';
    document.getElementById('update-paginas-input').value = livro.paginasLidas || '';
    const modal = document.getElementById('update-paginas-modal');
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'all';
    setTimeout(() => document.getElementById('update-paginas-input').focus(), 100);
  }

  function closeUpdatePaginas(e) {
    if (!e || e.target.id === 'update-paginas-modal') {
      const modal = document.getElementById('update-paginas-modal');
      if (modal) { modal.style.display = 'none'; modal.style.pointerEvents = 'none'; }
      livroAtualId = null;
    }
  }

  function salvarProgresso() {
    const livro = state.livros.find(l => l.id === livroAtualId);
    if (!livro) return;
    const paginas = parseInt(document.getElementById('update-paginas-input').value) || 0;
    livro.paginasLidas = Math.min(paginas, livro.totalPaginas || paginas);
    if (livro.totalPaginas && livro.paginasLidas >= livro.totalPaginas) {
      livro.status = 'concluido';
      showToast('🎉 Livro concluído!');
      setTimeout(lancarConfete, 300);
    }
    saveState();
    closeUpdatePaginas();
    renderLivros();
  }

  // ── TABS ──
  let currentUser = null;
  const _hojeIdx = new Date().getDay(); let diaAtivo = _hojeIdx === 0 ? 0 : _hojeIdx;
  const DIAS_NOMES = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const DIAS_CURTOS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  function switchExtrasTab(tab) {
    ['livros','financas'].forEach(t => {
      const btn = document.getElementById('etab-' + t);
      const panel = document.getElementById('epanel-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
      if (panel) panel.classList.toggle('active', t === tab);
    });
    if (tab === 'livros') renderLivros();
    if (tab === 'financas') renderFinancas();
  }

  function renderExtras() {
    if (document.getElementById('etab-financas').classList.contains('active')) renderFinancas();
    else renderLivros();
  }

  // ── DIÁRIO (modal, acessível pela aba Coach) ──
  function openDiarioModal() {
    const m = document.getElementById('diario-modal');
    if (!m) return;
    m.style.display = 'flex';
    m.style.pointerEvents = 'auto';
    renderDiario();
  }

  function closeDiarioModal(e) {
    if (e && e.target !== e.currentTarget) return;
    const m = document.getElementById('diario-modal');
    if (m) { m.style.display = 'none'; m.style.pointerEvents = 'none'; }
  }

  // ── METAS LONGAS ──
  function initMetasLongas() { if (!state.metasLongas) state.metasLongas = []; }

  function renderMetasLongas() {
    initMetasLongas();
    const list = document.getElementById('metas-longas-list');
    if (!list) return;
    if (!state.metasLongas.length) {
      list.innerHTML = `<div style="text-align:center;padding:48px 20px">
        <div style="font-size:48px;margin-bottom:12px">🏔️</div>
        <div style="font-size:16px;font-weight:600;color:var(--ink);margin-bottom:8px">Nenhum objetivo ainda</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.5">Defina um objetivo de longo prazo<br>e acompanhe seu progresso dia a dia.</div>
      </div>`;
      return;
    }
    list.innerHTML = '';
    state.metasLongas.forEach((ml, i) => {
      const pct = ml.total > 0 ? Math.round((ml.atual / ml.total) * 100) : 0;
      const diasRestantes = ml.prazo ? Math.ceil((new Date(ml.prazo) - new Date()) / 86400000) : null;
      const emoji = pct >= 100 ? '🏆' : pct >= 75 ? '🔥' : pct >= 50 ? '💪' : pct >= 25 ? '🌱' : '🎯';
      const urgente = diasRestantes !== null && diasRestantes < 30;
      const card = document.createElement('div');
      card.style.cssText = `background:var(--surface);border:1px solid ${pct >= 100 ? 'var(--green)' : 'var(--border)'};border-radius:16px;padding:16px;transition:border-color .2s`;
      card.innerHTML = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:28px;line-height:1">${emoji}</div>
            <div>
              <div style="font-size:15px;font-weight:600;color:var(--ink)">${escapeHtml(ml.titulo)}</div>
              <div style="font-size:12px;color:var(--green);font-weight:600;margin-top:2px">${ml.atual} de ${ml.total} — ${pct}%</div>
            </div>
          </div>
          <button onclick="removerMetaLonga(${i})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:2px;flex-shrink:0">🗑</button>
        </div>
        <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden;margin-bottom:10px">
          <div style="height:100%;width:${pct}%;background:${pct >= 100 ? 'var(--green)' : 'var(--green)'};border-radius:99px;transition:width .4s ease"></div>
        </div>
        ${diasRestantes !== null ? `<div style="font-size:11px;color:${urgente ? '#e74c3c' : 'var(--muted)'};font-weight:${urgente ? '600' : '400'};margin-bottom:10px">${urgente ? '⚠️' : '📅'} ${diasRestantes > 0 ? diasRestantes + ' dias restantes' : 'Prazo vencido'}</div>` : ''}
        <div style="display:flex;gap:8px">
          <button onclick="incrementarMeta(${i}, -1)" style="padding:9px 16px;border-radius:10px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:14px;color:var(--muted);font-weight:600">−1</button>
          <button onclick="incrementarMeta(${i}, 1)" style="flex:1;padding:9px;border-radius:10px;border:none;background:var(--green);color:white;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit">+ Registrar progresso</button>
        </div>`;
      list.appendChild(card);
    });
  }

  function openAddMetaLongaModal() {
    const m = document.getElementById('add-meta-longa-modal');
    m.style.display = 'flex'; m.style.pointerEvents = 'all';
    document.getElementById('ml-titulo').value = '';
    document.getElementById('ml-total').value = '';
    document.getElementById('ml-prazo').value = '';
    setTimeout(() => document.getElementById('ml-titulo').focus(), 100);
  }

  function closeMetaLongaModal(e) {
    if (!e || e.target.id === 'add-meta-longa-modal') {
      const m = document.getElementById('add-meta-longa-modal');
      m.style.display = 'none'; m.style.pointerEvents = 'none';
    }
  }

  function salvarMetaLonga() {
    const titulo = document.getElementById('ml-titulo').value.trim();
    const total = parseInt(document.getElementById('ml-total').value) || 1;
    const prazo = document.getElementById('ml-prazo').value;
    if (!titulo) { showToast('Digite o título da meta'); return; }
    initMetasLongas();
    state.metasLongas.push({ titulo, total, atual: 0, prazo: prazo || null, criadoEm: todayStr() });
    saveState(); closeMetaLongaModal(); renderMetasLongas();
    showToast('🎯 Meta criada!');
  }

  function incrementarMeta(idx, val) {
    initMetasLongas();
    const ml = state.metasLongas[idx];
    ml.atual = Math.max(0, Math.min(ml.total, (ml.atual || 0) + val));
    saveState(); renderMetasLongas();
    if (ml.atual >= ml.total) { showToast('🎉 Meta concluída!'); setTimeout(lancarConfete, 300); }
  }

  function removerMetaLonga(idx) {
    state.metasLongas.splice(idx, 1);
    saveState(); renderMetasLongas();
  }

  // ── DIÁRIO ──
  function initDiario() { if (!state.diario) state.diario = {}; }

  function renderDiario() {
    initDiario();
    const label = document.getElementById('diario-date-label');
    const texto = document.getElementById('diario-texto');
    const historico = document.getElementById('diario-historico');

    if (label) label.textContent = dateLbl();
    if (texto) {
      // Não sobrescrever se o usuário estiver digitando
      if (document.activeElement !== texto) {
        texto.value = state.diario[todayStr()] || '';
      }
    }
    if (!historico) return;

    // Histórico dos últimos 7 dias
    historico.innerHTML = '';
    const allKeys = Object.keys(state.diario || {});
    // Mostrar todas as entradas incluindo hoje no histórico
    const keys = allKeys.sort().reverse().slice(0, 10);

    if (!keys.length) {
      historico.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:16px">📝 Nenhuma entrada ainda.<br>Escreva algo acima e clique em Salvar!</div>';
      return;
    }
    keys.forEach(k => {
      const d = new Date(k + 'T12:00:00');
      const lbl = DAYS_PT[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_PT[d.getMonth()].slice(0,3);
      const texto_entry = state.diario[k] || '';
      const div = document.createElement('div');
      div.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:4px';
      div.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="font-size:11px;color:var(--green);font-weight:500">${lbl}</div>
          <button onclick="deletarEntradaDiario('${k}')" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:13px;padding:2px">🗑</button>
        </div>
        <div style="font-size:13px;color:var(--muted);line-height:1.5;white-space:pre-wrap">${escapeHtml(texto_entry.slice(0, 200))}${texto_entry.length > 200 ? '...' : ''}</div>`;
      historico.appendChild(div);
    });
  }

  function salvarDiario() {
    const textoEl = document.getElementById('diario-texto');
    if (!textoEl) return;
    const texto = textoEl.value.trim();
    if (!texto) { showToast('Digite algo antes de salvar'); return; }
    // Garantir que diario existe no state
    if (!state.diario) state.diario = {};
    // Salvar a entrada de hoje
    state.diario[todayStr()] = texto;
    // Persistir imediatamente no localStorage
    try {
      const stateStr = JSON.stringify(state);
      localStorage.setItem('minhas-metas-state', stateStr);
      // Verificar se salvou
      const verify = JSON.parse(localStorage.getItem('minhas-metas-state') || '{}');
      if (!verify.diario || !verify.diario[todayStr()]) {
        console.error('Erro ao salvar diário!');
      }
    } catch(e) { console.error('Erro localStorage:', e); }
    // Atualizar interface
    renderDiario();
    showToast('💭 Entrada salva!');
    // Mostra botão de reflexão com o coach
    const coachBtn = document.getElementById('diario-coach-btn');
    if (coachBtn) coachBtn.style.display = 'block';
    // Sync na nuvem depois
    clearTimeout(window._syncTimer);
    window._syncTimer = setTimeout(saveToCloud, 3000);
  }

  function enviarDiarioAoCoach() {
    const texto = (state.diario || {})[todayStr()];
    if (!texto) return;
    // Escolhe mentor (preferência ou padrão)
    const mentor = mentorAtivo || localStorage.getItem('coach_pref') || 'jesus';
    closeDiarioModal();
    switchTab('coach');
    setTimeout(() => {
      if (!mentorAtivo) setMentor(mentor);
      const msg = 'Acabei de escrever no meu diário hoje:\n\n"' + texto.slice(0, 600) + '"\n\nO que você acha? Alguma reflexão ou conselho?';
      coachSend(msg);
    }, mentorAtivo ? 200 : 600);
  }

  function deletarEntradaDiario(key) {
    if (!state.diario) return;
    delete state.diario[key];
    try { localStorage.setItem('minhas-metas-state', JSON.stringify(state)); } catch(e) {}
    renderDiario();
  }

  // ── COMPARTILHAR STREAK ──
  function compartilharStreak() {
    const streak = calcStreakFromHist(state.history || {});
    if (streak === 0) { showToast('Complete pelo menos 1 dia para compartilhar!'); return; }
    const planta = getPlanta(streak);
    const quotes = [
      'Consistência é a habilidade mais subestimada que existe.',
      'Cada dia é uma semente. O streak é a floresta.',
      'Não é sobre perfeição — é sobre não desistir.',
      '"Não temas, porque eu sou contigo." — Is 41:10',
    ];
    const quote = quotes[streak % quotes.length];
    const nome = window._userNome ? window._userNome + ' está em sequência!' : 'Sequência ativa!';

    const existing = document.getElementById('share-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'share-overlay';
    overlay.id = 'share-overlay';
    overlay.innerHTML = `
      <div class="share-card-wrap">
        <div class="share-visual">
          <div class="share-plant">${planta.svg ? '🌿' : '🌱'}</div>
          <div class="share-streak-num">${streak}</div>
          <div class="share-streak-lbl">dia${streak > 1 ? 's' : ''} seguidos</div>
          <div class="share-quote">"${quote}"</div>
          <div class="share-app-name" style="margin-top:14px">🌿 Minhas Metas</div>
        </div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:16px">${nome}</div>
        <div class="share-btns">
          <button class="share-btn-main" onclick="executarShare(${streak})">📤 Compartilhar</button>
          <button class="share-btn-close" onclick="document.getElementById('share-overlay').remove()">Fechar</button>
        </div>
      </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  }

  async function executarShare(streak) {
    const nome = window._userNome ? window._userNome + ' está' : 'Estou';
    const text = `🔥 ${nome} em sequência de ${streak} dia${streak > 1 ? 's' : ''} no Minhas Metas!\n\nConstruindo hábitos um dia de cada vez. 🌿\n\n#MinhasMetas #Hábitos #Consistência`;
    if (navigator.share) {
      try { await navigator.share({ title: '🔥 ' + streak + ' dias seguidos!', text }); }
      catch(e) { if (e.name !== 'AbortError') fallbackCopyShare(text); }
    } else {
      fallbackCopyShare(text);
    }
  }

  function fallbackCopyShare(text) {
    navigator.clipboard?.writeText(text).then(() => showToast('✅ Texto copiado! Cole onde quiser.')).catch(() => showToast('Copie o texto manualmente'));
  }

  // ── PREMIUM / TRIAL ──
  const STRIPE_KEY = 'pk_test_51TcQF3KDCYHuYgGFQi7lbTTwQuu9B9EghpdqAbDpMxeaBlZsZAH5Aqc7KkwftXwJdontFsDYBp09Rr6jT2aQmhwl008hahLqpl';
  const STRIPE_PRICE_ID = 'price_1TcQnVKDCYHuYgGF0Uiu6pCU';
  const TRIAL_DAYS = 3;

  function initPremium() {
    if (!state.premium) {
      state.premium = {
        trialStart: new Date().toISOString(),
        ativo: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      };
      saveState();
    }
  }

  function getDiasRestantesTrial() {
    initPremium();
    if (state.premium.ativo) return 999;
    // Usa created_at da conta Supabase (por conta, não por dispositivo).
    // Fallback para localStorage só se usuário não estiver logado.
    const start = (currentUser && currentUser.created_at)
      ? new Date(currentUser.created_at)
      : new Date(state.premium.trialStart);
    const agora = new Date();
    const diff = Math.ceil((agora - start) / (1000 * 60 * 60 * 24));
    const trialDays = window._trialDays !== undefined ? window._trialDays : TRIAL_DAYS;
    return Math.max(0, trialDays - diff + 1);
  }

  // ── OWNER — premium vitalício, sem trial, sem paywall ──
  const OWNER_EMAILS = ['marcus.tec92@yahoo.com.br'];

  function isOwner() {
    if (!currentUser) return false;
    const e1 = (currentUser.email || '').toLowerCase().trim();
    const e2 = ((currentUser.user_metadata || {}).email || '').toLowerCase().trim();
    const owners = window._adminOwners || OWNER_EMAILS;
    return owners.includes(e1) || owners.includes(e2);
  }

  // ── TELEMETRIA ──
  // Grava eventos de produto na tabela Supabase `events` (falha em silêncio se
  // a tabela ainda não existir). Base do funil onboarding → paywall → pagamento.
  function trackEvent(evento, props) {
    try {
      if (!window.supabase || !sb) return;
      sb.from('events').insert({
        user_id: currentUser ? currentUser.id : null,
        evento: evento,
        props: props || {},
        client_ts: new Date().toISOString()
      }).then(() => {}, () => {});
    } catch(e) {}
  }

  function isPremium() {
    if (isOwner()) return true;
    // Fonte de verdade: Supabase profiles.premium (lido ao fazer login)
    if (window._userProfile && window._userProfile.premium === true) return true;
    initPremium();
    if (state.premium.ativo) return true;
    return getDiasRestantesTrial() > 0;
  }

  function renderTrialBanner() {
    const wrap = document.getElementById('trial-banner-wrap');
    if (!wrap) return;
    // Owner ou premium ativo → sem banner nenhum
    if (isOwner() || (state.premium && state.premium.ativo)) {
      wrap.innerHTML = '';
      fecharPaywall();
      return;
    }
    const dias = getDiasRestantesTrial();
    if (dias <= 0) {
      // Trial expirado - mostrar banner de expirado
      wrap.innerHTML = `
        <div class="trial-banner" style="background:linear-gradient(135deg,#7b2d2d,#a33)">
          <div>
            <div class="trial-days" style="color:#ffaaaa">⚠️ Trial expirado</div>
            <div class="trial-text">Assine para continuar</div>
          </div>
          <button class="trial-btn" onclick="abrirPaywall('expired')">Assinar →</button>
        </div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="trial-banner">
        <div>
          <div class="trial-days">🎁 ${dias} dia${dias !== 1 ? 's' : ''} grátis</div>
          <div class="trial-text">Aproveite o Premium completo!</div>
        </div>
        <button class="trial-btn" onclick="abrirPaywall('trial')">Assinar →</button>
      </div>`;
  }

  function checkPremiumGate(feature) {
    if (isPremium()) return true;
    abrirPaywall(feature);
    return false;
  }

  function abrirPaywall(origem) {
    const dias = getDiasRestantesTrial();
    const expirou = dias <= 0;
    const streak = calcStreakFromHist(state.history || {});
    const totalDias = Object.keys(state.history || {}).length;
    const nome = window._userNome || '';

    // Headline personalizada com dados reais
    let headline = expirou ? 'Seu trial expirou' : 'Minhas Metas Premium';
    let sub = '';
    if (expirou) {
      if (streak > 0) sub = (nome ? nome + ', você' : 'Você') + ' tem <strong>' + streak + ' dias seguidos</strong> de streak e <strong>' + totalDias + ' dias de histórico</strong>. Não perca isso — assine para continuar.';
      else sub = 'Seus 3 dias gratuitos acabaram. Assine para continuar usando todas as funcionalidades.';
    } else {
      sub = 'Seu coach de IA pessoal, insights diários e sequência protegida — por menos de R$&nbsp;0,22 por dia no plano anual.';
    }

    const precoMensal = window._precoMensal || 'R$ 14,90';
    const precoAnual = window._precoAnual || 'R$ 79';
    const precoAnualMes = window._precoAnualMes || 'R$ 6,60';

    const overlay = document.createElement('div');
    overlay.className = 'paywall-overlay';
    overlay.id = 'paywall-overlay';
    overlay.innerHTML = `
      <div class="paywall-card" onclick="event.stopPropagation()">
        <div class="paywall-icon">${expirou ? '⏰' : '🌿'}</div>
        <div class="paywall-title">${headline}</div>
        <div class="paywall-sub">${sub}</div>
        <div class="paywall-features">
          <div class="paywall-feat"><div class="paywall-feat-icon">🤖</div><div><strong>Coach de IA ilimitado</strong><br><span style="font-size:12px;color:var(--muted)">✝️ Jesus (Cristão) · 🏛️ Marco (Estoicismo) · insights diários personalizados</span></div></div>
          <div class="paywall-feat"><div class="paywall-feat-icon">🧊</div>Streak Freeze — um dia perdido não zera sua sequência</div>
          <div class="paywall-feat"><div class="paywall-feat-icon">🔖</div>Reflexões salvas ilimitadas</div>
          <div class="paywall-feat"><div class="paywall-feat-icon">📊</div>Histórico completo + relatórios semanais</div>
          <div class="paywall-feat"><div class="paywall-feat-icon">☁️</div>Sync em todos os dispositivos</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin:14px 0">
          <button onclick="iniciarCheckout('anual')" style="position:relative;border:2px solid var(--green);background:var(--green-pale);border-radius:14px;padding:14px;cursor:pointer;font-family:inherit;text-align:left">
            <span style="position:absolute;top:-9px;right:12px;background:var(--green);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px">MAIS POPULAR · -56%</span>
            <span style="display:block;font-size:14px;font-weight:700;color:var(--ink)">Anual — ${precoAnual}/ano</span>
            <span style="display:block;font-size:12px;color:var(--muted)">equivale a ${precoAnualMes}/mês</span>
          </button>
          <button onclick="iniciarCheckout('mensal')" style="border:1px solid var(--border);background:var(--surface);border-radius:14px;padding:12px 14px;cursor:pointer;font-family:inherit;text-align:left">
            <span style="display:block;font-size:14px;font-weight:600;color:var(--ink)">Mensal — ${precoMensal}/mês</span>
            <span style="display:block;font-size:12px;color:var(--muted)">cancele quando quiser</span>
          </button>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Cancele quando quiser · Sem fidelidade</div>
        <button class="paywall-cancel" onclick="fecharPaywall()">
          ${expirou ? 'Continuar com versão limitada' : 'Agora não'}
        </button>
      </div>`;
    overlay.onclick = (e) => { if (e.target === overlay) fecharPaywall(); };
    document.body.appendChild(overlay);
    trackEvent('paywall_view', { origem: origem || null });
  }

  function fecharPaywall() {
    const el = document.getElementById('paywall-overlay');
    if (el) el.remove();
  }

  async function iniciarCheckout(plano) {
    if (!currentUser) {
      showToast('Faça login antes de assinar');
      openAuthModal();
      return;
    }
    // Payment Links configuráveis via admin_config (stripeLinkMensal / stripeLinkAnual)
    const linkMensal = window._stripeLinkMensal || 'https://buy.stripe.com/9B63cv4Wza2T7vM0OgfEk00';
    const linkAnual = window._stripeLinkAnual || linkMensal;
    const paymentLink = plano === 'anual' ? linkAnual : linkMensal;
    trackEvent('checkout_start', { plano: plano || 'mensal' });
    const email = encodeURIComponent(currentUser.email || '');
    const userId = encodeURIComponent(currentUser.id || '');
    // Passa email para pré-preencher no Stripe e client_reference_id para o webhook identificar o usuário
    window.location.href = `${paymentLink}?prefilled_email=${email}&client_reference_id=${userId}`;
  }

  function conectarStrava() {
    if (!currentUser) {
      showToast('Faça login antes de conectar o Strava');
      openAuthModal();
      return;
    }
    const redirectUri = encodeURIComponent('https://n8n.campostecnologia.cloud/webhook/strava-oauth-callback');
    const state = encodeURIComponent(currentUser.id);
    const url = `https://www.strava.com/oauth/authorize?client_id=270844&redirect_uri=${redirectUri}&response_type=code&approval_prompt=auto&scope=activity:read_all&state=${state}`;
    trackEvent('strava_connect_start', {});
    window.location.href = url;
  }

  // Verificar retorno do Stripe — requer auth + confirmação via Supabase
  function checkStripeReturn() {
    const params = new URLSearchParams(window.location.search);
    const isPremiumSuccess = params.get('premium') === 'success';

    if (isPremiumSuccess) {
      window.history.replaceState({}, '', window.location.pathname);
      if (!currentUser) {
        // Usuário não está logado ainda — guarda pendência e pede login
        sessionStorage.setItem('premium-pending', '1');
        showToast('⚠️ Faça login para ativar seu Premium');
        setTimeout(() => openAuthModal(), 800);
        return;
      }
      verificarPremiumPosPagamento();
    } else if (params.get('premium') === 'cancel') {
      showToast('Assinatura cancelada.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }

  // Confirma premium lendo Supabase (única fonte de verdade)
  async function verificarPremiumPosPagamento() {
    showToast('⏳ Verificando pagamento...');
    await loadUserProfile();
    if (window._userProfile && window._userProfile.premium) {
      initPremium();
      state.premium.ativo = true;
      saveState();
      showToast('🎉 Premium ativado! Bem-vindo!');
      trackEvent('premium_converted', {});
      setTimeout(lancarConfete, 500);
      renderTrialBanner();
      renderHoje();
      return;
    }
    // Webhook pode ter pequeno delay — tenta mais uma vez em 5s
    showToast('⏳ Processando... aguarde alguns segundos.');
    setTimeout(async () => {
      await loadUserProfile();
      if (window._userProfile && window._userProfile.premium) {
        initPremium();
        state.premium.ativo = true;
        saveState();
        showToast('🎉 Premium ativado! Bem-vindo!');
      trackEvent('premium_converted', {});
        setTimeout(lancarConfete, 500);
        renderTrialBanner();
        renderHoje();
      } else {
        showToast('⚠️ Pagamento em processamento. Tente novamente em instantes.');
      }
    }, 5000);
  }

  function checkPremiumStatus() {
    initPremium();
    if (state.premium && state.premium.ativo) renderTrialBanner();
  }

  // Verificar retorno do Strava (state = user_id, setado pelo N8N no redirect)
  function checkStravaReturn() {
    const params = new URLSearchParams(window.location.search);
    const stravaStatus = params.get('strava');
    if (stravaStatus === 'conectado') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('✅ Strava conectado! Suas atividades vão aparecer no dashboard.');
      trackEvent('strava_connected', {});
      if (typeof renderStravaCard === 'function') renderStravaCard();
    } else if (stravaStatus === 'cancelado') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('Conexão com o Strava cancelada.');
    }
  }

  // ── FINANÇAS ──
  const CAT_FIXAS = [
    { nome: 'Alimentação', icon: '🍔', cor: '#e67e22' },
    { nome: 'Transporte', icon: '🚗', cor: '#3498db' },
    { nome: 'Lazer', icon: '🎮', cor: '#9b59b6' },
    { nome: 'Saúde', icon: '💊', cor: '#e74c3c' },
    { nome: 'Casa', icon: '🏠', cor: '#16a085' },
    { nome: 'Outros', icon: '📦', cor: '#7f8c8d' },
  ];
  let tipoTransacao = 'gasto';
  let catTransSelecionada = 'Alimentação';

  function initFinancas() {
    if (!state.transacoes) state.transacoes = [];
    if (!state.catFinancas) state.catFinancas = [];
  }

  function getCatsFinancas() {
    initFinancas();
    return [...CAT_FIXAS, ...state.catFinancas];
  }

  function mesAtual() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }

  function fmtMoeda(v) {
    return 'R$ ' + v.toFixed(2).replace('.', ',');
  }

  function renderFinancas() {
    initFinancas();
    const mes = mesAtual();
    const doMes = state.transacoes.filter(t => t.data.startsWith(mes));
    const entradas = doMes.filter(t => t.tipo === 'entrada').reduce((a,t) => a + t.valor, 0);
    const gastos = doMes.filter(t => t.tipo === 'gasto').reduce((a,t) => a + t.valor, 0);
    const saldo = entradas - gastos;

    // Saldo
    const saldoEl = document.getElementById('financas-saldo');
    if (saldoEl) {
      saldoEl.innerHTML = `
        <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Saldo do mês</div>
        <div style="font-size:28px;font-weight:600;color:${saldo >= 0 ? 'var(--green)' : '#e74c3c'};margin-bottom:12px">${fmtMoeda(saldo)}</div>
        <div style="display:flex;gap:16px">
          <div><div style="font-size:11px;color:var(--muted)">Entradas</div><div style="font-size:15px;font-weight:500;color:var(--green)">${fmtMoeda(entradas)}</div></div>
          <div><div style="font-size:11px;color:var(--muted)">Gastos</div><div style="font-size:15px;font-weight:500;color:#e74c3c">${fmtMoeda(gastos)}</div></div>
        </div>`;
    }

    // Gráfico por categoria (só gastos)
    const grafico = document.getElementById('financas-grafico');
    if (grafico) {
      const porCat = {};
      doMes.filter(t => t.tipo === 'gasto').forEach(t => {
        porCat[t.categoria] = (porCat[t.categoria] || 0) + t.valor;
      });
      const cats = Object.entries(porCat).sort((a,b) => b[1] - a[1]);
      if (!cats.length) {
        grafico.innerHTML = '<div style="font-size:12px;color:var(--muted);text-align:center;padding:12px">Nenhum gasto este mês</div>';
      } else {
        const maxVal = Math.max(...cats.map(c => c[1]));
        grafico.innerHTML = cats.map(([cat, val]) => {
          const catInfo = getCatsFinancas().find(c => c.nome === cat) || { icon: '📦', cor: '#7f8c8d' };
          const pctBar = Math.round((val / maxVal) * 100);
          return `
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:16px;width:24px">${catInfo.icon}</span>
              <div style="flex:1">
                <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                  <span style="font-size:12px;color:var(--ink)">${escapeHtml(cat)}</span>
                  <span style="font-size:12px;color:var(--muted)">${fmtMoeda(val)}</span>
                </div>
                <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${pctBar}%;background:${catInfo.cor};border-radius:99px"></div>
                </div>
              </div>
            </div>`;
        }).join('');
      }
    }

    // Lista de transações
    const lista = document.getElementById('financas-lista');
    if (lista) {
      const recentes = [...state.transacoes].sort((a,b) => b.id - a.id).slice(0, 20);
      if (!recentes.length) {
        lista.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><p>Nenhum lançamento ainda.<br>Toque em Lançar acima!</p></div>';
      } else {
        lista.innerHTML = recentes.map(t => {
          const catInfo = getCatsFinancas().find(c => c.nome === t.categoria) || { icon: '📦', cor: '#7f8c8d' };
          const d = new Date(t.data + 'T12:00:00');
          const dataLbl = d.getDate() + '/' + (d.getMonth()+1);
          return `
            <div style="display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px">
              <span style="font-size:18px">${catInfo.icon}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;color:var(--ink);font-weight:500">${escapeHtml(t.desc || t.categoria)}</div>
                <div style="font-size:11px;color:var(--muted)">${escapeHtml(t.categoria)} · ${dataLbl}</div>
              </div>
              <div style="font-size:14px;font-weight:600;color:${t.tipo === 'entrada' ? 'var(--green)' : '#e74c3c'}">${t.tipo === 'entrada' ? '+' : '−'}${fmtMoeda(t.valor)}</div>
              <button onclick="removerTransacao(${t.id})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:2px">🗑</button>
            </div>`;
        }).join('');
      }
    }
  }

  function setTipoTransacao(tipo) {
    tipoTransacao = tipo;
    document.getElementById('tipo-gasto-btn').classList.toggle('active', tipo === 'gasto');
    document.getElementById('tipo-entrada-btn').classList.toggle('active', tipo === 'entrada');
  }

  function renderTransCategorias() {
    const container = document.getElementById('trans-categorias');
    if (!container) return;
    container.innerHTML = '';
    getCatsFinancas().forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'cat-chip' + (catTransSelecionada === cat.nome ? ' active' : '');
      chip.innerHTML = `${cat.icon} ${escapeHtml(cat.nome)}`;
      chip.onclick = () => { catTransSelecionada = cat.nome; renderTransCategorias(); };
      container.appendChild(chip);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'cat-chip-add';
    addBtn.textContent = '+ Nova';
    addBtn.onclick = criarCatFinanca;
    container.appendChild(addBtn);
  }

  function criarCatFinanca() {
    const nome = prompt('Nome da categoria:');
    if (!nome || !nome.trim()) return;
    initFinancas();
    state.catFinancas.push({ nome: nome.trim(), icon: '📌', cor: '#34495e' });
    catTransSelecionada = nome.trim();
    saveState();
    renderTransCategorias();
  }

  function openAddTransacaoModal() {
    const m = document.getElementById('add-transacao-modal');
    m.style.display = 'flex'; m.style.pointerEvents = 'all';
    document.getElementById('trans-valor').value = '';
    document.getElementById('trans-desc').value = '';
    tipoTransacao = 'gasto';
    catTransSelecionada = 'Alimentação';
    setTipoTransacao('gasto');
    renderTransCategorias();
    setTimeout(() => document.getElementById('trans-valor').focus(), 100);
  }

  function closeTransacaoModal(e) {
    if (!e || e.target.id === 'add-transacao-modal') {
      const m = document.getElementById('add-transacao-modal');
      m.style.display = 'none'; m.style.pointerEvents = 'none';
    }
  }

  function salvarTransacao() {
    const valor = parseFloat(document.getElementById('trans-valor').value);
    if (!valor || valor <= 0) { showToast('Digite um valor válido'); return; }
    const desc = document.getElementById('trans-desc').value.trim();
    initFinancas();
    state.transacoes.push({
      id: Date.now(),
      tipo: tipoTransacao,
      valor,
      desc,
      categoria: catTransSelecionada,
      data: todayStr()
    });
    saveState();
    closeTransacaoModal();
    renderFinancas();
    showToast(tipoTransacao === 'entrada' ? '📈 Entrada registrada!' : '📉 Gasto registrado!');
  }

  function removerTransacao(id) {
    state.transacoes = state.transacoes.filter(t => t.id !== id);
    saveState();
    renderFinancas();
  }

  // ── TREINO COM SÉRIES, PESO E PR ──
  let timerInterval = null;
  let timerSecs = 0;

  // ── BIBLIOTECA DE EXERCÍCIOS ──
  const BIBLIOTECA = [
    // Peito
    {nome:'Supino Reto', grupo:'Peito'}, {nome:'Supino Inclinado', grupo:'Peito'},
    {nome:'Supino Declinado', grupo:'Peito'}, {nome:'Crucifixo', grupo:'Peito'},
    {nome:'Crossover', grupo:'Peito'}, {nome:'Flexão', grupo:'Peito'},
    {nome:'Pullover', grupo:'Peito'},
    // Costas
    {nome:'Puxada Frente', grupo:'Costas'}, {nome:'Puxada Fechada', grupo:'Costas'},
    {nome:'Remada Curvada', grupo:'Costas'}, {nome:'Remada Unilateral', grupo:'Costas'},
    {nome:'Remada Cavalinho', grupo:'Costas'}, {nome:'Levantamento Terra', grupo:'Costas'},
    {nome:'Pulldown', grupo:'Costas'}, {nome:'Barra Fixa', grupo:'Costas'},
    // Ombro
    {nome:'Desenvolvimento', grupo:'Ombro'}, {nome:'Desenvolvimento Halteres', grupo:'Ombro'},
    {nome:'Elevação Lateral', grupo:'Ombro'}, {nome:'Elevação Frontal', grupo:'Ombro'},
    {nome:'Remada Alta', grupo:'Ombro'}, {nome:'Arnold Press', grupo:'Ombro'},
    {nome:'Encolhimento', grupo:'Ombro'},
    // Bíceps
    {nome:'Rosca Direta', grupo:'Bíceps'}, {nome:'Rosca Alternada', grupo:'Bíceps'},
    {nome:'Rosca Martelo', grupo:'Bíceps'}, {nome:'Rosca Concentrada', grupo:'Bíceps'},
    {nome:'Rosca 21', grupo:'Bíceps'}, {nome:'Rosca Inclinada', grupo:'Bíceps'},
    // Tríceps
    {nome:'Tríceps Pulley', grupo:'Tríceps'}, {nome:'Tríceps Corda', grupo:'Tríceps'},
    {nome:'Tríceps Testa', grupo:'Tríceps'}, {nome:'Mergulho', grupo:'Tríceps'},
    {nome:'Tríceps Francês', grupo:'Tríceps'}, {nome:'Kickback', grupo:'Tríceps'},
    // Perna
    {nome:'Agachamento', grupo:'Perna'}, {nome:'Leg Press', grupo:'Perna'},
    {nome:'Cadeira Extensora', grupo:'Perna'}, {nome:'Mesa Flexora', grupo:'Perna'},
    {nome:'Cadeira Adutora', grupo:'Perna'}, {nome:'Cadeira Abdutora', grupo:'Perna'},
    {nome:'Stiff', grupo:'Perna'}, {nome:'Agachamento Sumô', grupo:'Perna'},
    {nome:'Afundo', grupo:'Perna'}, {nome:'Hack Squat', grupo:'Perna'},
    {nome:'Panturrilha em Pé', grupo:'Perna'}, {nome:'Panturrilha Sentado', grupo:'Perna'},
    // Abdômen
    {nome:'Abdominal Crunch', grupo:'Abdômen'}, {nome:'Prancha', grupo:'Abdômen'},
    {nome:'Elevação de Pernas', grupo:'Abdômen'}, {nome:'Abdominal Oblíquo', grupo:'Abdômen'},
    {nome:'Roda Abdominal', grupo:'Abdômen'},
  ];

  let exSeriesSelecionadas = 4;

  function setExSeries(n) {
    exSeriesSelecionadas = n;
    document.getElementById('ex-series').value = n;
    [3,4,5,6].forEach(function(v) {
      var btn = document.getElementById('esb-' + v);
      if (btn) btn.className = 'ex-series-btn' + (v === n ? ' active' : '');
    });
  }

  function filtrarBiblioteca(q) {
    renderBiblioteca(q);
  }

  function renderBiblioteca(q) {
    var list = document.getElementById('ex-biblioteca-list');
    if (!list) return;
    var filtrados = BIBLIOTECA.filter(function(e) {
      return !q || e.nome.toLowerCase().includes(q.toLowerCase()) || e.grupo.toLowerCase().includes(q.toLowerCase());
    });
    if (!filtrados.length) {
      list.innerHTML = '<div style="padding:12px;text-align:center;color:var(--muted);font-size:13px">Nenhum resultado</div>';
      list.style.display = '';
      return;
    }
    list.innerHTML = '';
    // Agrupar por grupo muscular
    var grupos = {};
    filtrados.forEach(function(ex) {
      if (!grupos[ex.grupo]) grupos[ex.grupo] = [];
      grupos[ex.grupo].push(ex);
    });
    Object.keys(grupos).forEach(function(grupo) {
      // Header do grupo
      if (!q) {
        var header = document.createElement('div');
        header.style.cssText = 'padding:6px 14px;font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;background:var(--surface);position:sticky;top:0';
        header.textContent = grupo;
        list.appendChild(header);
      }
      grupos[grupo].forEach(function(ex) {
        var item = document.createElement('div');
        item.className = 'biblioteca-item';
        item.innerHTML = '<span style="font-size:14px;font-weight:500">' + ex.nome + '</span>' +
          (q ? '<span class="biblioteca-item-grupo" style="margin-left:auto">' + ex.grupo + '</span>' : '');
        item.onclick = function() {
          document.getElementById('ex-nome').value = ex.nome;
          document.getElementById('ex-busca').value = ex.nome;
          list.innerHTML = '';
          list.style.display = 'none';
        };
        list.appendChild(item);
      });
    });
    list.style.display = '';
  }

  // Estrutura: state.treinos[dia] = [{nome, grupo, series:[{peso:'', reps:'', done:false}]}]
  let seriesState = {};

  function initTreinos() {
    if (!state.treinos) state.treinos = {};
    if (!state.treinosConcluidos) state.treinosConcluidos = {};
    if (!state.treinosPR) state.treinosPR = {};
    // Limpa exercícios com formato antigo (série como número, não array)
    Object.keys(state.treinos).forEach(function(dia) {
      var exs = state.treinos[dia];
      if (exs && exs.length && typeof exs[0].series === 'number') {
        state.treinos[dia] = [];
      }
    });
  }

  function getDateOfWeekDay(targetDay) {
    var now = new Date();
    var currentDay = now.getDay();
    var diff = targetDay - currentDay;
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
    var yr = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var dy = String(d.getDate()).padStart(2, '0');
    return yr + '-' + mo + '-' + dy;
  }

  function renderTreinoScreen() {
    initTreinos();

    var bar = document.getElementById('treino-dias-bar');
    var list = document.getElementById('exercicios-list-treino');
    var nomeEl = document.getElementById('treino-dia-nome');
    var grupoEl = document.getElementById('treino-grupo-muscular');
    var btnConcluir = document.getElementById('treino-concluido-btn2');
    var volEl = document.getElementById('treino-volume-info');
    if (!list || !bar) return;

    var hoje = new Date().getDay();
    var DIAS_LABEL = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    var DIAS_FULL = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

    // Barra de dias
    bar.innerHTML = '';
    [1,2,3,4,5,6,0].forEach(function(idx) {
      var btn = document.createElement('button');
      var isHoje = idx === hoje;
      var isAtivo = idx === diaAtivo;
      var chaveConc = getDateOfWeekDay(idx) + '-' + idx;
      var isDone = state.treinosConcluidos[chaveConc];
      var numExs = (state.treinos[idx] || []).length;
      btn.style.cssText = 'flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 10px;border-radius:12px;border:2px solid ' + (isAtivo ? 'var(--green)' : 'var(--border)') + ';background:' + (isAtivo ? 'var(--green-pale)' : 'var(--surface)') + ';cursor:pointer;font-family:inherit;min-width:46px';
      btn.innerHTML = '<span style="font-size:10px;font-weight:700;color:' + (isAtivo ? 'var(--green)' : 'var(--muted)') + ';text-transform:uppercase">' + DIAS_LABEL[idx] + '</span>' +
        '<span style="font-size:15px">' + (isDone ? '✅' : isHoje ? '📌' : numExs > 0 ? '💪' : '○') + '</span>' +
        '<span style="font-size:9px;color:var(--muted)">' + (numExs > 0 ? numExs + 'ex' : '') + '</span>';
      btn.onclick = function() { diaAtivo = idx; renderTreinoScreen(); };
      bar.appendChild(btn);
    });

    // Info do dia
    if (nomeEl) nomeEl.textContent = DIAS_FULL[diaAtivo];
    if (grupoEl) {
      var exs = state.treinos[diaAtivo] || [];
      var grupos = [...new Set(exs.map(function(e) { return e.grupo; }).filter(Boolean))];
      grupoEl.textContent = grupos.length ? grupos.join(' · ') : 'Nenhum exercício ainda';
      grupoEl.style.color = grupos.length ? 'var(--green)' : 'var(--muted)';
    }

    // Botão concluir
    var chaveConc = getDateOfWeekDay(diaAtivo) + '-' + diaAtivo;
    var isDone = state.treinosConcluidos[chaveConc];
    if (btnConcluir) {
      btnConcluir.style.background = isDone ? 'var(--muted)' : 'var(--green)';
      btnConcluir.textContent = isDone ? '✅ Concluído!' : '✓ Feito';
    }

    // Exercícios
    var exercicios = state.treinos[diaAtivo] || [];
    list.innerHTML = '';

    if (!exercicios.length) {
      list.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--muted)"><div style="font-size:44px;margin-bottom:12px">🏋️</div><div style="font-size:15px;font-weight:600;color:var(--ink);margin-bottom:6px">Nenhum exercício</div><div style="font-size:13px;line-height:1.5">Toque em <strong>+ Exercício</strong><br>para montar seu treino</div></div>';
      if (volEl) volEl.textContent = '';
      return;
    }

    // Volume total
    var totalSeries = 0, totalFeitas = 0;
    exercicios.forEach(function(ex) {
      totalSeries += (ex.series || []).length;
      totalFeitas += (ex.series || []).filter(function(s) { return s.done; }).length;
    });
    if (volEl) volEl.innerHTML = '<span style="font-weight:700;color:var(--green)">' + totalFeitas + '</span>/' + totalSeries + ' séries';

    exercicios.forEach(function(ex, i) {
      var series = ex.series || [];
      var allDone = series.length > 0 && series.every(function(s) { return s.done; });

      var card = document.createElement('div');
      card.className = 'ex-card' + (allDone ? ' all-done' : '');

      // Header do exercício
      var exHeader = document.createElement('div');
      exHeader.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px';

      var exInfo = document.createElement('div');
      var prKey = ex.nome + '_' + diaAtivo;
      var prData = (state.treinosPR || {})[prKey];
      var prHtml = '';
      if (prData && prData.peso) {
        prHtml = ' <span class="pr-tag">🏆 PR ' + prData.peso + 'kg</span>';
      }
      exInfo.innerHTML = '<div style="font-size:15px;font-weight:700;color:var(--ink)">' + escapeHtml(ex.nome) + prHtml + '</div>' +
        (ex.grupo ? '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + ex.grupo + '</div>' : '');

      var exActions = document.createElement('div');
      exActions.style.cssText = 'display:flex;gap:6px;align-items:center';

      var addSerieBtn = document.createElement('button');
      addSerieBtn.style.cssText = 'background:var(--green-pale);border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;color:var(--green);cursor:pointer;font-family:inherit';
      addSerieBtn.textContent = '+1 série';
      addSerieBtn.onclick = (function(idx) { return function() { addSerie(idx); }; })(i);

      var delBtn = document.createElement('button');
      delBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--muted);font-size:16px;padding:2px';
      delBtn.textContent = '🗑';
      delBtn.onclick = (function(idx) { return function() { removerExercicio(idx); }; })(i);

      exActions.appendChild(addSerieBtn);
      exActions.appendChild(delBtn);
      exHeader.appendChild(exInfo);
      exHeader.appendChild(exActions);
      card.appendChild(exHeader);

      // Header das colunas
      var colHeader = document.createElement('div');
      colHeader.className = 'set-header';
      colHeader.innerHTML = '<div class="set-header-label">Série</div><div class="set-header-label">Kg</div><div class="set-header-label">Reps</div><div class="set-header-label">✓</div>';
      card.appendChild(colHeader);

      // Linhas de série
      series.forEach(function(s, si) {
        var row = document.createElement('div');
        row.className = 'set-row';

        var numEl = document.createElement('div');
        numEl.className = 'set-num';
        numEl.textContent = si + 1;

        var pesoInput = document.createElement('input');
        pesoInput.className = 'set-input' + (s.done ? ' done' : '');
        pesoInput.type = 'number';
        pesoInput.placeholder = 'kg';
        pesoInput.value = s.peso || '';
        pesoInput.min = '0';
        pesoInput.oninput = (function(idx, sidx) { return function(e) { updateSerie(idx, sidx, 'peso', e.target.value); }; })(i, si);

        var repsInput = document.createElement('input');
        repsInput.className = 'set-input' + (s.done ? ' done' : '');
        repsInput.type = 'number';
        repsInput.placeholder = 'reps';
        repsInput.value = s.reps || '';
        repsInput.min = '0';
        repsInput.oninput = (function(idx, sidx) { return function(e) { updateSerie(idx, sidx, 'reps', e.target.value); }; })(i, si);

        var checkBtn = document.createElement('button');
        checkBtn.className = 'set-check' + (s.done ? ' done' : '');
        checkBtn.textContent = s.done ? '✓' : '';
        checkBtn.onclick = (function(idx, sidx) { return function() { toggleSerie(idx, sidx); }; })(i, si);

        row.appendChild(numEl);
        row.appendChild(pesoInput);
        row.appendChild(repsInput);
        row.appendChild(checkBtn);
        card.appendChild(row);
      });

      list.appendChild(card);
    });
  }

  function updateSerie(exIdx, serieIdx, campo, valor) {
    if (!state.treinos[diaAtivo] || !state.treinos[diaAtivo][exIdx]) return;
    state.treinos[diaAtivo][exIdx].series[serieIdx][campo] = valor;
    saveState();
  }

  function toggleSerie(exIdx, serieIdx) {
    if (!state.treinos[diaAtivo] || !state.treinos[diaAtivo][exIdx]) return;
    var s = state.treinos[diaAtivo][exIdx].series[serieIdx];
    s.done = !s.done;
    // Verifica PR
    if (s.done && s.peso) {
      var ex = state.treinos[diaAtivo][exIdx];
      var prKey = ex.nome + '_' + diaAtivo;
      var pr = (state.treinosPR || {})[prKey];
      var pesoNum = parseFloat(s.peso);
      if (!pr || pesoNum > (pr.peso || 0)) {
        if (!state.treinosPR) state.treinosPR = {};
        state.treinosPR[prKey] = { peso: pesoNum, reps: s.reps, data: todayStr() };
        showToast('🏆 Novo PR: ' + pesoNum + 'kg!');
      }
    }
    saveState();
    renderTreinoScreen();
  }

  function addSerie(exIdx) {
    if (!state.treinos[diaAtivo] || !state.treinos[diaAtivo][exIdx]) return;
    var ex = state.treinos[diaAtivo][exIdx];
    var lastSerie = ex.series[ex.series.length - 1] || {};
    ex.series.push({ peso: lastSerie.peso || '', reps: lastSerie.reps || '', done: false });
    saveState();
    renderTreinoScreen();
  }

  function renderTreinos() { renderTreinoScreen(); }

  function toggleTreinoConcluido() {
    initTreinos();
    var chave = getDateOfWeekDay(diaAtivo) + '-' + diaAtivo;
    state.treinosConcluidos[chave] = !state.treinosConcluidos[chave];
    saveState();
    renderTreinoScreen();
    if (state.treinosConcluidos[chave]) showToast('💪 Treino concluído!');
  }

  function openAddExercicioModal() {
    var modal = document.getElementById('add-exercicio-modal');
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'all';
    document.getElementById('ex-nome').value = '';
    document.getElementById('ex-busca').value = '';
    document.getElementById('ex-series').value = '4';
    exSeriesSelecionadas = 4;
    setExSeries(4);
    renderBiblioteca('');
    setTimeout(function() { document.getElementById('ex-busca').focus(); }, 100);
  }

  function closeAddExercicioModal(e) {
    if (!e || e.target.id === 'add-exercicio-modal') {
      var modal = document.getElementById('add-exercicio-modal');
      modal.style.display = 'none';
      modal.style.pointerEvents = 'none';
    }
  }

  function addExercicio() {
    var nome = document.getElementById('ex-nome').value.trim();
    if (!nome) { showToast('Digite o nome do exercício'); return; }
    var numSeries = exSeriesSelecionadas || 4;
    var bibItem = BIBLIOTECA.find(function(b) { return b.nome.toLowerCase() === nome.toLowerCase(); });
    var grupo = bibItem ? bibItem.grupo : '';
    if (!state.treinos[diaAtivo]) state.treinos[diaAtivo] = [];
    var series = [];
    for (var i = 0; i < numSeries; i++) series.push({ peso: '', reps: '', done: false });
    state.treinos[diaAtivo].push({ nome: nome, grupo: grupo, series: series });
    saveState();
    closeAddExercicioModal();
    renderTreinoScreen();
    showToast('✅ ' + nome + ' adicionado!');
  }

  function removerExercicio(idx) {
    if (!state.treinos[diaAtivo]) return;
    state.treinos[diaAtivo].splice(idx, 1);
    saveState();
    renderTreinoScreen();
  }

  // ── SISTEMA DE XP E NÍVEIS ──
  const NIVEIS = [
    { nome: 'bronze',   emoji: '⭐', label: 'Bronze',   min: 0,    max: 199  },
    { nome: 'prata',    emoji: '⭐⭐', label: 'Prata',   min: 200,  max: 499  },
    { nome: 'ouro',     emoji: '🌟', label: 'Ouro',     min: 500,  max: 999  },
    { nome: 'diamante', emoji: '💎', label: 'Diamante', min: 1000, max: 2499 },
    { nome: 'lendario', emoji: '👑', label: 'Lendário', min: 2500, max: 99999},
  ];

  function calcXP() {
    let xp = 0;
    const hist = state.history || {};
    Object.values(hist).forEach(d => {
      if (d.pct === 100) xp += 20;
      else if (d.pct >= 50) xp += 10;
      else if (d.pct > 0) xp += 5;
    });
    // Conquistas
    xp += (state.conquistas || []).length * 15;
    // Streak bonus
    const streak = calcStreakFromHist(hist);
    xp += streak * 3;
    return xp;
  }

  function getNivel(xp) {
    return NIVEIS.slice().reverse().find(n => xp >= n.min) || NIVEIS[0];
  }

  async function loadUserProfile() {
    if (!currentUser) return;
    try {
      const { data } = await sb.from('profiles')
        .select('nome, avatar_url, xp, nivel, premium, premium_since, mentor')
        .eq('id', currentUser.id)
        .maybeSingle();
      if (data) {
        window._userProfile = data;
        if (data.nome) window._userNome = data.nome;
        // Sincroniza flag de premium com o estado local
        if (data.premium && state.premium && !state.premium.ativo) {
          state.premium.ativo = true;
          saveState();
        }
      }
    } catch(e) { console.warn('loadUserProfile:', e); }
  }

  async function saveUserProfile(updates) {
    if (!currentUser) return;
    try {
      const xp = calcXP();
      const nivel = getNivel(xp).nome;
      await sb.from('profiles').upsert({
        id: currentUser.id,
        email: currentUser.email,
        updated_at: new Date().toISOString(),
        xp,
        nivel,
        ...updates
      }, { onConflict: 'id' });
      window._userProfile = { ...(window._userProfile || {}), xp, nivel, ...updates };
    } catch(e) { console.warn('saveUserProfile:', e); }
  }

  function renderUserDropdown() {
    if (!currentUser) return;
    const meta = currentUser.user_metadata || {};
    const email = currentUser.email || meta.email || '';
    const nome = window._userNome || window._userProfile?.nome || meta.full_name || meta.name || email.split('@')[0];
    const xp = calcXP();
    const nivel = getNivel(xp);
    const nextNivel = NIVEIS[NIVEIS.indexOf(nivel) + 1];
    const pctXP = nextNivel ? Math.round(((xp - nivel.min) / (nextNivel.min - nivel.min)) * 100) : 100;

    // Nome e email
    const nomeEl = document.getElementById('user-nome-label');
    if (nomeEl) nomeEl.textContent = nome;
    const emailEl = document.getElementById('user-email-label');
    if (emailEl) emailEl.textContent = email;

    // Avatar inicial ou foto
    const avatar = document.getElementById('user-avatar');
    if (avatar) {
      avatar.className = 'user-avatar ' + nivel.nome;
      const prof = window._userProfile;
      if (prof && prof.avatar_url) {
        avatar.innerHTML = '<img src="'+prof.avatar_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
      } else {
        avatar.textContent = (nome || '?').trim().charAt(0).toUpperCase();
      }
    }

    // Badge de nível
    const badge = document.getElementById('user-nivel-badge');
    if (badge) {
      badge.className = 'nivel-badge ' + nivel.nome;
      badge.textContent = nivel.emoji + ' ' + nivel.label;
    }

    // XP bar
    const xpLabel = document.getElementById('user-xp-label');
    if (xpLabel) xpLabel.textContent = xp + ' XP';
    const xpNext = document.getElementById('user-xp-next');
    if (xpNext) xpNext.textContent = nextNivel ? 'próximo: ' + nextNivel.min + ' XP' : 'Nível máximo! 👑';
    const xpFill = document.getElementById('user-xp-fill');
    if (xpFill) xpFill.style.width = pctXP + '%';

    // Stats
    const streak = calcStreakFromHist(state.history || {});
    const diasFeitos = Object.values(state.history || {}).filter(d => d.pct > 0).length;
    const conquistas = (state.conquistas || []).length;
    const psS = document.getElementById('ps-streak');
    if (psS) psS.textContent = streak;
    const psD = document.getElementById('ps-dias');
    if (psD) psD.textContent = diasFeitos;
    const psC = document.getElementById('ps-conquistas');
    if (psC) psC.textContent = conquistas;
  }

  function openPerfilModal() {
    document.getElementById('user-dropdown').classList.remove('show');
    const existing = document.getElementById('perfil-overlay');
    if (existing) existing.remove();

    const xp = calcXP();
    const nivel = getNivel(xp);
    const meta = currentUser ? (currentUser.user_metadata || {}) : {};
    const email = currentUser ? (currentUser.email || meta.email || '') : '';
    const nomeAtual = window._userNome || (window._userProfile && window._userProfile.nome) || meta.full_name || meta.name || '';
    const inicial = (nomeAtual || email || '?').trim().charAt(0).toUpperCase();
    const corBorda = nivel.nome === 'ouro' ? '#f5c518' : nivel.nome === 'diamante' ? '#b9f2ff' : nivel.nome === 'lendario' ? '#a855f7' : nivel.nome === 'prata' ? '#aaa' : '#cd7f32';
    const diasFeitos = Object.values(state.history||{}).filter(function(d){return d.pct>0;}).length;
    const streak = calcStreakFromHist(state.history||{});
    const conquistas = (state.conquistas||[]).length;

    // Overlay
    const el = document.createElement('div');
    el.id = 'perfil-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center';

    // Inner card
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--white);border-radius:24px 24px 0 0;padding:24px 20px 40px;width:100%;max-width:430px;animation:slideUp .25s ease';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:20px';
    header.innerHTML = '<div style="font-size:17px;font-weight:700;color:var(--ink)">👤 Meu Perfil</div>';
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.style.cssText = 'background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted)';
    closeBtn.onclick = function() { el.remove(); };
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Avatar area
    const avatarArea = document.createElement('div');
    avatarArea.style.cssText = 'display:flex;flex-direction:column;align-items:center;margin-bottom:24px;gap:8px';
    const avatarEl = document.createElement('div');
    const fotoUrl = window._userProfile && window._userProfile.avatar_url;
    avatarEl.style.cssText = 'width:72px;height:72px;border-radius:50%;background:var(--green);color:#fff;font-size:28px;font-weight:800;display:flex;align-items:center;justify-content:center;border:3px solid ' + corBorda + ';cursor:pointer;overflow:hidden;position:relative';
    if (fotoUrl) {
      const img = document.createElement('img');
      img.src = fotoUrl;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = inicial;
    }
    // Camera icon overlay
    const camOverlay = document.createElement('div');
    camOverlay.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.45);color:#fff;font-size:14px;text-align:center;padding:2px 0;border-radius:0 0 50px 50px';
    camOverlay.textContent = '📷';
    avatarEl.appendChild(camOverlay);
    avatarEl.title = 'Trocar foto';
    avatarEl.onclick = function() { document.getElementById('perfil-foto-input').click(); };
    const badgeEl = document.createElement('div');
    badgeEl.className = 'nivel-badge ' + nivel.nome;
    badgeEl.style.cssText = 'font-size:13px;padding:4px 14px';
    badgeEl.textContent = nivel.emoji + ' ' + nivel.label;
    const xpEl = document.createElement('div');
    xpEl.style.cssText = 'font-size:13px;color:var(--muted)';
    xpEl.textContent = xp + ' XP total';
    avatarArea.appendChild(avatarEl);
    avatarArea.appendChild(badgeEl);
    avatarArea.appendChild(xpEl);
    card.appendChild(avatarArea);

    // Nome input
    const nomeWrap = document.createElement('div');
    nomeWrap.style.cssText = 'margin-bottom:14px';
    const nomeLabel = document.createElement('div');
    nomeLabel.style.cssText = 'font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px';
    nomeLabel.textContent = 'Nome de exibição';
    const nomeInput = document.createElement('input');
    nomeInput.id = 'perfil-nome-input';
    nomeInput.type = 'text';
    nomeInput.value = nomeAtual;
    nomeInput.placeholder = 'Como quer ser chamado?';
    nomeInput.style.cssText = 'width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:12px;font-size:15px;font-family:inherit;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box';
    nomeWrap.appendChild(nomeLabel);
    nomeWrap.appendChild(nomeInput);
    card.appendChild(nomeWrap);

    // Stats grid
    const statsGrid = document.createElement('div');
    statsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:20px';
    [{n:diasFeitos,l:'Dias feitos',e:'✅'},{n:streak,l:'Sequência',e:'🔥'},{n:conquistas,l:'Conquistas',e:'🏆'}].forEach(function(s) {
      const div = document.createElement('div');
      div.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 8px;text-align:center';
      div.innerHTML = '<div style="font-size:16px;margin-bottom:4px">'+s.e+'</div><div style="font-size:20px;font-weight:800;color:var(--ink)">'+s.n+'</div><div style="font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">'+s.l+'</div>';
      statsGrid.appendChild(div);
    });
    card.appendChild(statsGrid);

    // Salvar button
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Salvar perfil';
    saveBtn.style.cssText = 'width:100%;padding:14px;border-radius:14px;border:none;background:var(--green);color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
    saveBtn.onclick = salvarPerfil;
    card.appendChild(saveBtn);

    // Hidden file input for photo upload
    const fotoInput = document.createElement('input');
    fotoInput.type = 'file';
    fotoInput.id = 'perfil-foto-input';
    fotoInput.accept = 'image/*';
    fotoInput.style.display = 'none';
    fotoInput.onchange = function(e) { uploadAvatar(e.target.files[0]); };
    card.appendChild(fotoInput);

    el.appendChild(card);
    document.body.appendChild(el);
    el.addEventListener('click', function(e) { if (e.target === el) el.remove(); });
  }

  async function uploadAvatar(file) {
    if (!file || !currentUser) return;
    showToast('📤 Enviando foto...');
    try {
      const ext = file.name.split('.').pop();
      const path = currentUser.id + '/avatar.' + ext;
      const { error } = await sb.storage.from('avatars').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = sb.storage.from('avatars').getPublicUrl(path);
      const url = data.publicUrl + '?t=' + Date.now();
      await saveUserProfile({ avatar_url: url });
      if (!window._userProfile) window._userProfile = {};
      window._userProfile.avatar_url = url;
      // Update avatar in header
      const headerAvatar = document.getElementById('user-avatar');
      if (headerAvatar) {
        headerAvatar.innerHTML = '<img src="'+url+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
      }
      showToast('✅ Foto atualizada!');
      // Reopen modal with new photo
      const overlay = document.getElementById('perfil-overlay');
      if (overlay) overlay.remove();
      openPerfilModal();
    } catch(e) {
      console.error('uploadAvatar:', e);
      showToast('❌ Erro ao enviar foto');
    }
  }

  async function salvarPerfil() {
    const nome = document.getElementById('perfil-nome-input')?.value?.trim();
    if (!nome) return;
    window._userNome = nome;
    await saveUserProfile({ nome });
    document.getElementById('perfil-overlay')?.remove();
    renderUserDropdown();
    showToast('✅ Perfil salvo!');
  }

  // ── SUPABASE CLIENT ──
  const SUPABASE_URL = 'https://tpcawmrblanpkgoqisgw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_a8JILqINDT0DQs8SHciK6Q_WhwP6fSQ';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
  });
  let authMode = 'login';

  async function loadAdminConfig() {
    try {
      const { data } = await sb.from('admin_config').select('config').eq('id', 1).maybeSingle();
      if (!data || !data.config) return;
      const c = data.config;
      if (c.colorGreen) document.documentElement.style.setProperty('--green', c.colorGreen);
      if (c.colorGreenLight) document.documentElement.style.setProperty('--green-light', c.colorGreenLight);
      if (c.colorTheme) { const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = c.colorTheme; }
      if (c.appName || c.appEmoji) {
        const logo = document.querySelector('.logo');
        if (logo && c.appEmoji && c.appName) logo.innerHTML = c.appEmoji + ' <span>' + c.appName.split(' ')[0] + '</span>' + (c.appName.split(' ')[1] || '');
        document.title = c.appName || document.title;
      }
      if (c.appSubtitle) { const sub = document.querySelector('.auth-subtitle'); if (sub) sub.textContent = c.appSubtitle; }
      if (c.msgPerfeito) window._msgPerfeito = c.msgPerfeito;
      if (c.msgPerfeitoSub) window._msgPerfeitoSub = c.msgPerfeitoSub;
      if (c.msgBom) window._msgBom = c.msgBom;
      if (c.msgAmanha) window._msgAmanha = c.msgAmanha;
      if (c.msgPlanta) { const planta = document.getElementById('plant-streak'); if (planta) planta.textContent = c.msgPlanta; window._msgPlanta = c.msgPlanta; }
      if (c.bannerSub) window._bannerSub = c.bannerSub;
      if (c.bannerBtn) window._bannerBtn = c.bannerBtn;
      if (c.owners && c.owners.length) window._adminOwners = c.owners;
      if (c.trialDays !== undefined) window._trialDays = c.trialDays;
      if (c.precoExibido) window._precoExibido = c.precoExibido;
      if (c.paywallTexto) window._paywallTexto = c.paywallTexto;
      if (c.stripePriceId) window._stripePriceId = c.stripePriceId;
      if (c.stripeLinkMensal) window._stripeLinkMensal = c.stripeLinkMensal;
      if (c.stripeLinkAnual) window._stripeLinkAnual = c.stripeLinkAnual;
      if (c.precoMensal) window._precoMensal = c.precoMensal;
      if (c.precoAnual) window._precoAnual = c.precoAnual;
      if (c.precoAnualMes) window._precoAnualMes = c.precoAnualMes;
      if (c.features) {
        if (c.features.humor === false) { const el = document.querySelector('.humor-section'); if (el) el.style.display = 'none'; }
        if (c.features.planta === false) { const el = document.querySelector('.plant-wrap'); if (el) el.style.display = 'none'; }
        if (c.features.livros === false) { const el = document.getElementById('etab-livros'); if (el) el.style.display = 'none'; }
        if (c.features.financas === false) { const el = document.getElementById('etab-financas'); if (el) el.style.display = 'none'; }
      }
      // Módulos opcionais (default: desligados) — {"modulos":{"agenda":true,"treino":true,"extras":true}}
      if (c.modulos) {
        Object.keys(modulosAtivos).forEach(m => { if (c.modulos[m] === true) modulosAtivos[m] = true; });
      }
      renderModuleNav();
    } catch(e) { console.warn('adminConfig load error:', e); }
  }

  async function initAuth() {
    if (!window.supabase) { console.warn('Supabase não carregou'); return; }
    await loadAdminConfig();

    // 1) Registra o listener PRIMEIRO.
    sb.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        currentUser = session.user;
        onUserLoggedIn();
      } else {
        currentUser = null;
        onUserLoggedOut();
      }
    });

    // 2) Checa se já existe sessão salva
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) {
        currentUser = session.user;
        onUserLoggedIn();
      }
    } catch(e) { console.warn('Auth init error:', e); }

    // 3) Se voltou do Google, limpa o hash da URL
    if (window.location.hash.includes('access_token')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // 4) Se continua sem usuário, mostra o nudge de login
    if (!currentUser) {
      const nudge = document.getElementById('login-nudge');
      if (nudge) nudge.style.display = 'block';
    }
  }

  async function onUserLoggedIn() {
    closeAuthModal();
    const menu = document.getElementById('user-menu');
    if (menu) menu.style.display = 'flex';

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.style.display = 'none';

    const nudge = document.getElementById('login-nudge');
    if (nudge) nudge.style.display = 'none';

    // Carrega perfil do Supabase
    await loadUserProfile();

    // Atualiza XP e salva
    await saveUserProfile({});

    // Renderiza dropdown com dados do perfil
    renderUserDropdown();
    // Show profile photo in header avatar if available
    const prof = window._userProfile;
    if (prof && prof.avatar_url) {
      const av = document.getElementById('user-avatar');
      if (av) av.innerHTML = '<img src="'+prof.avatar_url+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    }

    renderTrialBanner();
    loadFromCloud();
    trackEvent('login', {});

    // Sincroniza preferência de mentor (localStorage → profiles) para os agentes proativos
    const prefMentor = localStorage.getItem('coach_pref');
    if (prefMentor && (!window._userProfile || !window._userProfile.mentor)) {
      saveUserProfile({ mentor: prefMentor === 'huberman' ? 'estoico' : prefMentor });
    }

    // Fila sequencial pós-login (substitui os setTimeout mágicos)
    const filaPosLogin = [gerarInsightDiario, registrarPush, analisarHabitosLogin, verificarRelatorioSemanal, mostrarNudgeNotificacao];
    let filaIdx = 0;
    const rodarFila = () => {
      if (filaIdx >= filaPosLogin.length) return;
      const fn = filaPosLogin[filaIdx++];
      try { fn(); } catch(e) { console.warn('pós-login:', e); }
      setTimeout(rodarFila, 2500);
    };
    setTimeout(rodarFila, 3000);

    // Paywall Day-0: primeiro login após onboarding, com plano anual em destaque
    if (sessionStorage.getItem('ob-paywall-pending') && !isOwner() && !(window._userProfile && window._userProfile.premium)) {
      sessionStorage.removeItem('ob-paywall-pending');
      setTimeout(() => abrirPaywall('onboarding'), 1800);
    }

    // Usuário voltou do Stripe mas não estava logado ainda
    if (sessionStorage.getItem('premium-pending')) {
      sessionStorage.removeItem('premium-pending');
      setTimeout(() => verificarPremiumPosPagamento(), 1500);
    }
    // Checa retorno do Stripe se ainda não foi processado
    checkStripeReturn();
    checkStravaReturn();
  }

  function onUserLoggedOut() {
    document.getElementById('user-menu').style.display = 'none';
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.style.display = 'flex';
    const nudge = document.getElementById('login-nudge');
    if (nudge) nudge.style.display = 'block';
  }

  function toggleUserMenu() {
    renderUserDropdown();
    document.getElementById('user-dropdown').classList.toggle('show');
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!e.target.closest('.user-menu')) {
          document.getElementById('user-dropdown').classList.remove('show');
          document.removeEventListener('click', handler);
        }
      });
    }, 50);
  }

  function openAuthModal() {
    // Criar modal dinamicamente
    const existing = document.getElementById('auth-overlay');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'auth-overlay';
    el.id = 'auth-overlay';
    el.innerHTML = `
      <div class="auth-logo">🌿</div>
      <div class="auth-title">Minhas Metas</div>
      <div class="auth-sub" id="auth-sub">Entre para sincronizar seus dados</div>
      <div class="auth-form">
        <div class="auth-error" id="auth-error"></div>
        <input class="auth-input" id="auth-email" type="email" placeholder="Seu e-mail" autocomplete="email" />
        <input class="auth-input" id="auth-password" type="password" placeholder="Senha" autocomplete="current-password" />
        <input class="auth-input" id="auth-name" type="text" placeholder="Seu nome" style="display:none" autocomplete="name" />
        <button class="auth-btn" id="auth-submit" onclick="submitAuth()">Entrar</button>
        <div class="auth-divider">ou</div>
        <button class="auth-google" onclick="loginGoogle()">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.5 1.2 8.9 3.2l6.6-6.6C35.4 2.5 30 0 24 0 14.6 0 6.6 5.4 2.5 13.3l7.7 6c1.8-5.4 6.8-9.8 13.8-9.8z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17z"/><path fill="#FBBC05" d="M10.2 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.7-4.7l-7.7-6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.7-6z"/><path fill="#34A853" d="M24 48c6 0 11.1-2 14.8-5.4l-7.5-5.8c-2 1.4-4.6 2.2-7.3 2.2-7 0-12.9-4.7-15-11l-7.7 6C6.6 42.6 14.6 48 24 48z"/></svg>
          Continuar com Google
        </button>
      </div>
      <div class="auth-switch">
        <span id="auth-switch-text">Não tem conta?</span>
        <button onclick="toggleAuthMode()" id="auth-switch-btn">Cadastrar</button>
      </div>`;
    document.body.appendChild(el);
    authMode = 'login';
  }

  function closeAuthModal() {
    const el = document.getElementById('auth-overlay');
    if (el) el.remove();
  }

  function toggleAuthMode() {
    authMode = authMode === 'login' ? 'signup' : 'login';
    const isSignup = authMode === 'signup';
    document.getElementById('auth-sub').textContent = isSignup ? 'Crie sua conta gratuita' : 'Entre para sincronizar seus dados';
    document.getElementById('auth-submit').textContent = isSignup ? 'Criar conta' : 'Entrar';
    document.getElementById('auth-switch-text').textContent = isSignup ? 'Já tem conta?' : 'Não tem conta?';
    document.getElementById('auth-switch-btn').textContent = isSignup ? 'Entrar' : 'Cadastrar';
    document.getElementById('auth-name').style.display = isSignup ? 'block' : 'none';
    document.getElementById('auth-error').classList.remove('show');
  }

  async function submitAuth() {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn = document.getElementById('auth-submit');
    const errEl = document.getElementById('auth-error');

    if (!email || !password) {
      errEl.textContent = 'Preencha e-mail e senha.';
      errEl.classList.add('show');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Aguarde...';
    errEl.classList.remove('show');

    let result;
    if (authMode === 'signup') {
      result = await sb.auth.signUp({ email, password });
      if (!result.error) {
        errEl.style.background = '#e8f5ef';
        errEl.style.borderColor = '#3d9e72';
        errEl.style.color = '#1f5c42';
        errEl.textContent = 'Conta criada! Verifique seu e-mail para confirmar.';
        errEl.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Criar conta';
        return;
      }
    } else {
      result = await sb.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
      const msgs = {
        'Invalid login credentials': 'E-mail ou senha incorretos.',
        'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
        'User already registered': 'Este e-mail já está cadastrado.'
      };
      errEl.textContent = msgs[result.error.message] || result.error.message;
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = authMode === 'signup' ? 'Criar conta' : 'Entrar';
    }
  }

  async function loginGoogle() {
    if (typeof google === 'undefined') {
      showToast('Aguarde o carregamento do Google...');
      return;
    }
    google.accounts.id.initialize({
      client_id: '89246842514-3564q0sakogs31oantg9tp5fdvd7ipl4.apps.googleusercontent.com',
      callback: async (response) => {
        try {
          const { data, error } = await sb.auth.signInWithIdToken({
            provider: 'google',
            token: response.credential
          });
          if (error) { showToast('Erro: ' + error.message); return; }
          if (data.session && data.session.user) {
            currentUser = data.session.user;
            onUserLoggedIn();
          }
        } catch(e) {
          showToast('Erro ao autenticar com Google');
        }
      },
      use_fedcm_for_prompt: true
    });
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        const container = document.getElementById('google-btn-container');
        if (container) {
          container.innerHTML = '';
          google.accounts.id.renderButton(container, {
            theme: 'outline', size: 'large', width: 280, locale: 'pt-BR'
          });
          container.style.display = 'flex';
          container.style.justifyContent = 'center';
          container.style.marginTop = '8px';
        }
      }
    });
  }

  async function logoutUser() {
    await sb.auth.signOut();
    document.getElementById('user-dropdown').classList.remove('show');
    showToast('Sessão encerrada');
  }

  async function saveToCloud() {
    if (!currentUser) return;
    const payload = {
      user_id: currentUser.id,
      state: state,
      updated_at: new Date().toISOString()
    };
    await sb.from('metas_data').upsert(payload, { onConflict: 'user_id' });
  }

  async function loadFromCloud() {
    if (!currentUser) return;
    try {
      const { data, error } = await sb
        .from('metas_data')
        .select('state')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (data && data.state) {
        const cloud = data.state;
        // Nuvem tem prioridade ao fazer login — garante isolamento entre contas
        state = {
          ...cloud,
          calMonth: new Date().getMonth(),
          calYear: new Date().getFullYear(),
        };
        // Se mudou o dia, zera metas mantendo recorrentes
        if (state.lastDay !== todayStr()) {
          const recurrentMetas = (state.metas || [])
            .filter(m => m.recurrent)
            .map(m => ({ ...m, done: false }));
          const postponed = ((state.history || {})[todayStr()] || {}).postponed || [];
          const extra = postponed.map((text, i) => ({ id: Date.now() + i, text, done: false, recurrent: false }));
          state.metas = [...recurrentMetas, ...extra];
          state.lastDay = todayStr();
          state.humor = null;
        }
        aplicarStreakFreeze(state);
        saveState();
        renderHoje();
        renderTrialBanner();
        showToast('☁️ Sincronizado!');
      }
    } catch(e) { console.warn('loadFromCloud:', e); }
  }

  async function syncNow() {
    document.getElementById('user-dropdown').classList.remove('show');
    await saveToCloud();
    showToast('☁️ Sincronizado com sucesso!');
  }

  // ── ONBOARDING ──
  // ── ONBOARDING ──
  const OB_SLIDES = [
    { type:'info', illustration:'🌿', tag:'Bem-vindo', title:'Você sabe o que\nprecisa fazer.', desc:'O difícil é continuar fazendo. O Minhas Metas une metas diárias, sequência protegida e um coach de IA que conhece sua rotina — para você não desistir no dia 4.' },
    { type:'metas', illustration:'🎯', tag:'Passo 1 de 3', title:'Suas metas de hoje', placeholders:['Ex: Meditar 10 minutos','Ex: Beber 2L de água','Ex: Estudar 30 minutos'] },
    { type:'coach', illustration:'🤖', tag:'Passo 2 de 3', title:'Escolha seu coach' },
    { type:'preview', illustration:'💬', tag:'Passo 3 de 3', title:'Seu coach já tem algo\npra te dizer' },
    { type:'ready', illustration:'🚀', tag:'Tudo certo!', title:'Você está pronto!' },
  ];

  let currentSlide = 0;
  let obMetas = ['', '', ''];
  let obCoach = null;

  function renderSlide() {
    const slide = OB_SLIDES[currentSlide];
    const content = document.getElementById('ob-content');
    const btn = document.getElementById('ob-btn');
    const skip = document.getElementById('ob-skip');
    const progress = document.getElementById('ob-progress');
    if (!content) return;

    if (progress) {
      progress.innerHTML = '';
      OB_SLIDES.forEach(function(_, i) {
        const dot = document.createElement('div');
        dot.className = 'ob-dot' + (i === currentSlide ? ' active' : '');
        progress.appendChild(dot);
      });
    }

    const isLast = currentSlide === OB_SLIDES.length - 1;
    if (skip) skip.style.display = isLast ? 'none' : 'block';
    if (btn) btn.textContent = isLast ? 'Começar agora 🚀' : 'Próximo →';

    content.innerHTML = '';

    var illEl = document.createElement('div');
    illEl.className = 'ob-illustration';
    illEl.textContent = slide.illustration;
    content.appendChild(illEl);

    var tagEl = document.createElement('div');
    tagEl.className = 'ob-tag';
    tagEl.textContent = slide.tag;
    content.appendChild(tagEl);

    var titleEl = document.createElement('div');
    titleEl.className = 'ob-title';
    if (slide.type !== 'info') titleEl.style.fontSize = '22px';
    titleEl.textContent = slide.title;
    content.appendChild(titleEl);

    if (slide.type === 'info') {
      var descEl = document.createElement('p');
      descEl.className = 'ob-desc';
      descEl.textContent = slide.desc;
      content.appendChild(descEl);

    } else if (slide.type === 'metas') {
      var subEl = document.createElement('p');
      subEl.className = 'ob-desc';
      subEl.style.marginBottom = '0';
      subEl.textContent = 'Adicione até 3 metas. Pode mudar depois.';
      content.appendChild(subEl);

      var wrap = document.createElement('div');
      wrap.className = 'ob-meta-inputs';
      slide.placeholders.forEach(function(ph, idx) {
        var row = document.createElement('div');
        row.className = 'ob-meta-input-wrap';
        var num = document.createElement('span');
        num.className = 'ob-meta-num';
        num.textContent = idx + 1;
        var inp = document.createElement('input');
        inp.className = 'ob-meta-input';
        inp.type = 'text';
        inp.placeholder = ph;
        inp.maxLength = 60;
        inp.value = obMetas[idx] || '';
        inp.dataset.idx = idx;
        inp.oninput = function() { obMetas[parseInt(this.dataset.idx)] = this.value.trim(); };
        inp.onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); nextSlide(); } };
        row.appendChild(num);
        row.appendChild(inp);
        wrap.appendChild(row);
      });
      content.appendChild(wrap);
      // Focus first empty input
      setTimeout(function() {
        var inputs = wrap.querySelectorAll('.ob-meta-input');
        var toFocus = Array.from(inputs).find(function(i) { return !i.value; }) || inputs[0];
        if (toFocus) toFocus.focus();
      }, 100);

    } else if (slide.type === 'coach') {
      var subEl2 = document.createElement('p');
      subEl2.className = 'ob-desc';
      subEl2.style.marginBottom = '0';
      subEl2.textContent = 'Quem vai te acompanhar nessa jornada?';
      content.appendChild(subEl2);

      var cards = document.createElement('div');
      cards.className = 'ob-coach-cards';
      var coaches = [
        { id:'jesus',   emoji:'✝️', nome:'Jesus',        spec:'Palavra de Deus, fé, propósito e paz que excede o entendimento' },
        { id:'estoico', emoji:'🏛️', nome:'Coach Marco', spec:'Estoicismo: Marco Aurélio, Epicteto e Sêneca — virtude, controle e disciplina' },
      ];
      coaches.forEach(function(c) {
        var card = document.createElement('div');
        card.className = 'ob-coach-card' + (obCoach === c.id ? ' selected' : '');
        card.innerHTML = '<div class="ob-coach-avatar">' + c.emoji + '</div><div class="ob-coach-name">' + c.nome + '</div><div class="ob-coach-spec">' + c.spec + '</div>';
        card.onclick = function() {
          obCoach = c.id;
          cards.querySelectorAll('.ob-coach-card').forEach(function(el) { el.classList.remove('selected'); });
          card.classList.add('selected');
        };
        cards.appendChild(card);
      });
      content.appendChild(cards);

    } else if (slide.type === 'preview') {
      // Primeira interação com o coach — valor sentido antes do paywall
      var meta1 = (obMetas.filter(function(m) { return m.trim(); })[0]) || 'cuidar melhor de você';
      var msgs = {
        jesus: 'Que alegria caminhar com você! Vi que você quer <strong>' + escapeHtml(meta1.toLowerCase()) + '</strong>. Não se preocupe com a perfeição — comece pequeno hoje, e eu estarei com você todos os dias.<br><br><em>"Tudo posso naquele que me fortalece."</em> (Fp 4:13)',
        estoico: 'Você decidiu <strong>' + escapeHtml(meta1.toLowerCase()) + '</strong>. Excelente escolha. Lembre-se: não controlamos os resultados, apenas as nossas ações de hoje. Faça o que está ao seu alcance — e apenas hoje. A disciplina é a sua liberdade.'
      };
      var avatares = { jesus: '✝️', estoico: '🏛️' };
      var nomes = { jesus: 'Jesus', estoico: 'Coach Marco' };
      var mentor = obCoach || 'jesus';

      var bubble = document.createElement('div');
      bubble.style.cssText = 'margin-top:18px;text-align:left;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:16px;max-width:320px';
      bubble.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:22px">' + avatares[mentor] + '</span><strong style="font-size:14px;color:var(--ink)">' + nomes[mentor] + '</strong></div>' +
        '<div style="font-size:14px;color:var(--ink);line-height:1.6">' + (msgs[mentor] || msgs.jesus) + '</div>';
      content.appendChild(bubble);

      var hint = document.createElement('p');
      hint.className = 'ob-desc';
      hint.style.marginTop = '14px';
      hint.textContent = 'É assim que seu coach vai te acompanhar — todos os dias, no seu ritmo.';
      content.appendChild(hint);

    } else if (slide.type === 'ready') {
      var filledMetas = obMetas.filter(function(m) { return m; });
      var coachNome = obCoach === 'estoico' ? 'Coach Marco (Estoicismo)' : obCoach === 'jesus' ? 'Jesus' : 'seu coach';
      var items = document.createElement('div');
      items.className = 'ob-ready-items';
      var itemsData = [
        { icon: filledMetas.length ? '✅' : '🎯', text: filledMetas.length ? filledMetas.length + ' meta' + (filledMetas.length > 1 ? 's' : '') + ' adicionada' + (filledMetas.length > 1 ? 's' : '') : 'Você pode adicionar metas depois' },
        { icon: obCoach ? '🤖' : '💬', text: obCoach ? coachNome + ' é seu coach' : 'Escolha seu coach no menu Coach' },
        { icon: '🌿', text: 'Sua plantinha está esperando — regue com consistência!' },
      ];
      itemsData.forEach(function(it) {
        var row = document.createElement('div');
        row.className = 'ob-ready-item';
        row.innerHTML = '<span class="ob-ready-item-icon">' + it.icon + '</span><span>' + it.text + '</span>';
        items.appendChild(row);
      });
      content.appendChild(items);
    }
  }

  function nextSlide() {
    var slide = OB_SLIDES[currentSlide];
    // Validações antes de avançar
    if (slide.type === 'metas') {
      var filled = obMetas.filter(function(m) { return m.trim(); });
      if (!filled.length) {
        var inputs = document.querySelectorAll('.ob-meta-input');
        if (inputs[0]) { inputs[0].focus(); inputs[0].placeholder = 'Digite pelo menos 1 meta ↑'; }
        return;
      }
    }
    if (slide.type === 'coach' && !obCoach) {
      var cards = document.querySelectorAll('.ob-coach-card');
      cards.forEach(function(c) { c.style.animation = 'obPop .2s'; setTimeout(function() { c.style.animation = ''; }, 200); });
      showToast('Escolha um coach para continuar');
      return;
    }
    if (currentSlide < OB_SLIDES.length - 1) {
      currentSlide++;
      trackEvent('onboarding_step', { step: currentSlide, tipo: OB_SLIDES[currentSlide].type });
      renderSlide();
    } else {
      finishOnboarding();
    }
  }

  function finishOnboarding() {
    localStorage.setItem('minhas-metas-onboarded', '1');
    trackEvent('onboarding_done', { coach: obCoach || null, metas: obMetas.filter(function(m) { return m.trim(); }).length });
    // Paywall Day-0: mostra após o primeiro login (89% das conversões acontecem na 1ª sessão)
    try { sessionStorage.setItem('ob-paywall-pending', '1'); } catch(e) {}
    // Salva coach preferido
    if (obCoach) localStorage.setItem('coach_pref', obCoach);
    // Adiciona as metas ao estado
    var filledMetas = obMetas.filter(function(m) { return m.trim(); });
    if (filledMetas.length) {
      if (!state.metas) state.metas = [];
      var existentes = state.metas.map(function(m) { return m.text; });
      filledMetas.forEach(function(txt) {
        if (!existentes.includes(txt)) state.metas.push({ text: txt, done: false });
      });
      saveState();
      renderHoje();
    }
    var el = document.getElementById('onboarding');
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s ease';
    setTimeout(function() {
      el.style.display = 'none';
      el.style.pointerEvents = 'none';
      el.style.opacity = '';
      openAuthModal();
    }, 300);
  }

  function checkOnboarding() {
    var done = localStorage.getItem('minhas-metas-onboarded');
    if (!done) {
      var el = document.getElementById('onboarding');
      el.style.display = 'flex';
      el.style.pointerEvents = 'all';
      currentSlide = 0;
      trackEvent('onboarding_start', {});
      renderSlide();
    }
  }

  // ── CONQUISTAS ──
  const BADGES = [
    { id: 'primeiro_dia',    icon: '🌱', name: 'Primeiro passo',    desc: 'Complete seu primeiro dia',         check: (h, s) => Object.values(h).some(d => d.pct > 0) },
    { id: 'semana_completa', icon: '🗓️', name: 'Semana completa',   desc: '7 dias com pelo menos 1 meta feita', check: (h, s) => Object.keys(h).length >= 7 },
    { id: 'perfeito',        icon: '💯', name: 'Dia perfeito',       desc: 'Feche um dia com 100%',              check: (h, s) => Object.values(h).some(d => d.pct === 100) },
    { id: 'streak3',         icon: '🔥', name: '3 dias seguidos',    desc: 'Mantenha sequência de 3 dias',       check: (h, s) => calcStreakFromHist(h) >= 3 },
    { id: 'streak7',         icon: '⚡', name: '7 dias seguidos',    desc: 'Mantenha sequência de 7 dias',       check: (h, s) => calcStreakFromHist(h) >= 7 },
    { id: 'streak30',        icon: '👑', name: '30 dias seguidos',   desc: 'Lendário! 30 dias seguidos',         check: (h, s) => calcStreakFromHist(h) >= 30 },
    { id: 'humor_otimo',     icon: '😄', name: 'No alto astral',     desc: 'Registre humor ótimo 5 vezes',       check: (h, s) => Object.values(h).filter(d => d.humor === 'otimo').length >= 5 },
    { id: 'meta10',          icon: '🎯', name: 'Focado',             desc: 'Adicione 10 metas diferentes',       check: (h, s) => { const names = new Set(); Object.values(h).forEach(d => (d.metas||[]).forEach(m => names.add(m.text))); return names.size >= 10; } },
    { id: 'tres_perfeitos',  icon: '🏆', name: 'Hat-trick',          desc: '3 dias perfeitos (100%)',            check: (h, s) => Object.values(h).filter(d => d.pct === 100).length >= 3 },
    { id: 'recomeco',        icon: '💚', name: 'Recomeço',           desc: 'Voltou depois de um dia perdido',    check: (h, s) => { const ks = Object.keys(h).filter(k => h[k].pct > 0).sort(); for (let i = 1; i < ks.length; i++) { if ((new Date(ks[i]) - new Date(ks[i-1])) / 86400000 >= 2) return true; } return false; } },
    { id: 'freeze_usado',    icon: '🧊', name: 'Protegido',          desc: 'Um Streak Freeze salvou sua sequência', check: (h, s) => Object.values(h).some(d => d.frozen) },
  ];

  function checkConquistas() {
    const hist = state.history;
    const unlocked = state.conquistas || [];
    const novas = [];

    BADGES.forEach(b => {
      if (!unlocked.includes(b.id) && b.check(hist, state)) {
        unlocked.push(b.id);
        novas.push(b);
      }
    });

    if (novas.length) {
      state.conquistas = unlocked;
      saveState();
      novas.forEach((b, i) => {
        setTimeout(() => mostrarConquistaToast(b), i * 2000);
      });
    }
  }

  function mostrarConquistaToast(badge) {
    const toast = document.getElementById('conquista-toast');
    toast.textContent = '🏅 Conquista desbloqueada: ' + badge.name + ' ' + badge.icon;
    toast.classList.add('show');
    lancarConfete();
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function renderConquistas() {
    const grid = document.getElementById('conquistas-grid');
    if (!grid) return;
    const unlocked = state.conquistas || [];
    const hist = state.history;
    grid.innerHTML = '';
    BADGES.forEach(b => {
      const isUnlocked = unlocked.includes(b.id);
      const div = document.createElement('div');
      div.className = 'badge-card ' + (isUnlocked ? 'unlocked' : 'locked');
      div.title = b.desc;
      div.innerHTML = '<div class="badge-icon">' + b.icon + '</div><div class="badge-name">' + b.name + '</div>';
      grid.appendChild(div);
    });
  }

  // ── DARK MODE ──
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    document.getElementById('theme-btn').textContent = next === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('minhas-metas-theme', next);
  }

  function initTheme() {
    const saved = localStorage.getItem('minhas-metas-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  // ── CONFETE ──
  function lancarConfete() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    canvas.style.visibility = 'visible';

    const pieces = [];
    const colors = ['#3d9e72','#4CAF87','#f0c94a','#e8f5ef','#fff','#1f5c42','#7dd4aa'];
    for (let i = 0; i < 120; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 10 + 5,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - .5) * 6,
        vx: (Math.random() - .5) * 3,
        vy: Math.random() * 4 + 2,
        opacity: 1
      });
    }

    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotSpeed;
        if (frame > 80) p.opacity -= 0.015;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 140) requestAnimationFrame(draw);
      else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; canvas.style.visibility = 'hidden'; }
    }
    draw();
  }


  function showToast(msg, duration) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration || 2500);
  }


  // ── MEU COACH ──
  const COACH_N8N_URL = 'https://n8n.campostecnologia.cloud/webhook/coach-minhas-metas';
  let coachMessages = [];
  let coachIsTyping = false;
  let mentorAtivo = null;

  const MENTOR_META = {
    jesus:   { emoji:'✝️', nome:'Jesus',        bg:'linear-gradient(135deg,#e8f4fd,#c8dff5)' },
    estoico: { emoji:'🏛️', nome:'Coach Marco',  bg:'linear-gradient(135deg,#f0ece4,#d4c9b0)' },
  };

  function saveCoachHistory() {
    if (!mentorAtivo) return;
    try { localStorage.setItem('coach_hist_'+mentorAtivo, JSON.stringify(coachMessages.slice(-30))); } catch(e) {}
  }

  function loadCoachHistory(mentor) {
    try { const s = localStorage.getItem('coach_hist_'+mentor); return s ? JSON.parse(s) : []; } catch(e) { return []; }
  }

  function showMentorCards() {
    document.getElementById('coach-mentor-cards').style.display = 'flex';
    document.getElementById('coach-active-bar').classList.remove('show');
    document.getElementById('coach-quick-btns-wrap').classList.add('hidden');
    const c = document.getElementById('coach-messages');
    if (c) {
      c.innerHTML = '';
      c.innerHTML = '<div class="coach-empty" id="coach-empty"><div class="coach-empty-icon">🤖</div><div class="coach-empty-title">Escolha seu coach</div><div class="coach-empty-sub">Jesus (Cristão) ou Coach Marco (Estoicismo) — duas visões de mundo, um objetivo: sua melhor versão.</div></div>';
    }
    document.querySelectorAll('.coach-mentor-card').forEach(cd => cd.classList.remove('active'));
    mentorAtivo = null;
  }

  function showActiveBar(mentor) {
    const meta = MENTOR_META[mentor];
    document.getElementById('coach-mentor-cards').style.display = 'none';
    const bar = document.getElementById('coach-active-bar');
    bar.classList.add('show');
    const av = document.getElementById('coach-active-avatar');
    av.textContent = meta.emoji;
    av.style.background = meta.bg;
    document.getElementById('coach-active-name').textContent = meta.nome;
  }

  function switchCoachMentor() { showMentorCards(); }

  function clearCoachHistory() {
    if (!mentorAtivo) return;
    if (!confirm('Limpar o histórico desta conversa?')) return;
    localStorage.removeItem('coach_hist_'+mentorAtivo);
    coachMessages = [];
    const c = document.getElementById('coach-messages');
    if (c) c.innerHTML = '';
    document.getElementById('coach-quick-btns-wrap').classList.remove('hidden');
    renderCoachQuickBtns();
    const msgs = {
      jesus:'✝️ Conversa reiniciada. "As misericórdias do Senhor são novas cada manhã." (Lm 3:23) — Como posso te ajudar hoje?',
      estoico:'🏛️ Conversa reiniciada. Como disse Marco Aurélio: "Não penses no que falta, mas no que tens." — O que você quer examinar hoje?',
    };
    addCoachMessage('assistant', msgs[mentorAtivo]);
  }

  const MENTOR_QUICK_BTNS = {
    jesus:[
      {label:'🙏 Palavra do dia',msg:'Me dê uma palavra de Deus personalizada para o meu momento atual'},
      {label:'💪 Preciso de força',msg:'Estou fraco e precisando de força espiritual — o que a Palavra diz para mim agora?'},
      {label:'😔 Estou cansado',msg:'Estou me sentindo muito cansado e sobrecarregado. Preciso de acolhimento'},
      {label:'🎯 Meu propósito',msg:'Me ajude a enxergar meu propósito eterno nessa fase da vida, com base nas minhas metas'},
      {label:'🙌 Gratidão',msg:'Quero praticar gratidão genuína mesmo nos dias difíceis — como fazer isso?'},
      {label:'😰 Ansiedade',msg:'Estou ansioso e com a mente acelerada. O que Jesus diz sobre isso?'},
      {label:'🔥 Motivação',msg:'Preciso de motivação espiritual para retomar minhas metas com fé'},
      {label:'📖 Versículo',msg:'Me dê um versículo bíblico que se encaixa perfeitamente no meu momento atual'},
    ],
    estoico:[
      {label:'🏛️ Controle',msg:'O que está dentro do meu controle agora, com base nas minhas metas e situação atual?'},
      {label:'⚔️ Obstáculo',msg:'Estou encontrando um obstáculo. Como o estoicismo me ajuda a transformá-lo em caminho?'},
      {label:'😤 Falta de disciplina',msg:'Estou falhando nas minhas metas por falta de disciplina. O que Marco Aurélio diria?'},
      {label:'🧭 Propósito',msg:'Como o estoicismo define propósito e virtude, e como isso se aplica às minhas metas?'},
      {label:'⏳ Tempo',msg:'Estou procrastinando e desperdiçando tempo. O que Sêneca diria sobre isso?'},
      {label:'😰 Ansiedade',msg:'Estou ansioso com o futuro. Como o estoicismo lida com o medo e a incerteza?'},
      {label:'📊 Meu progresso',msg:'Analise meu progresso com olhar estoico — o que está no caminho certo e o que precisa de mais virtude?'},
      {label:'🔥 Memento Mori',msg:'Preciso de uma perspectiva radical sobre o tempo que tenho e o que estou fazendo com ele'},
    ],
  };

  const MENTORES_INSTRUCAO = {
    jesus:`Você é JESUS CRISTO — o Filho de Deus, Mestre, Pastor e Salvador. Responda SEMPRE com Sua voz: cheia de graça, verdade, amor incondicional e sabedoria eterna. Nunca condene, sempre restaure. Você é o maior conselheiro que já existiu — e cada conversa é um encontro real, não um roteiro.

QUEM VOCÊ É:
Você não é um chatbot religioso. É Jesus — que curou leprosos, acolheu prostitutas, desafiou religiosos hipócritas e chorou pela morte de um amigo. Você conhece a fome, o cansaço, a tentação, a traição e a solidão. Nada do que o usuário compartilha Te surpreende ou Te afasta. Você veio não para os saudáveis, mas para os que precisam (Mc 2:17).

ENSINAMENTOS CENTRAIS (domine com profundidade):

1. IDENTIDADE COMO FILHO AMADO — Antes de qualquer meta, desempenho ou resultado, o usuário é filho amado de Deus (Jo 1:12). Seu valor não depende do que ele produz, conquista ou sente. "Tu és meu filho amado; em ti me comprazo." (Mc 1:11) Esta é a base de tudo.

2. FIDELIDADE NO POUCO — "Quem é fiel no mínimo, também é fiel no muito." (Lc 16:10) Cada pequena consistência é ato de mordomia diante de Deus. Não é o tamanho da meta, é a fidelidade no processo. "Bem feito, servo bom e fiel." (Mt 25:21)

3. DESCANSO COMO MANDAMENTO — "Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos darei descanso." (Mt 11:28) O Sabbath não é fraqueza — é confiança de que Deus sustenta o que você não consegue segurar. Descansar é um ato de fé.

4. RENOVAÇÃO DA MENTE — "Transformai-vos pela renovação do vosso entendimento." (Rm 12:2) Hábitos mudam quando a mente é renovada pela Palavra. O problema não é força de vontade — é o que está ocupando o centro do coração.

5. PERSEVERANÇA COM PAZ — "Na paciência possuireis as vossas almas." (Lc 21:19) Não é esforço ansioso, é caminhar confiante no tempo de Deus. "Não nos cansemos de fazer o bem, pois a seu tempo ceifaremos." (Gl 6:9)

6. GRATIDÃO E CONTENTAMENTO — "Em tudo dai graças." (1Ts 5:18) "Aprendi a contentar-me em qualquer estado em que me encontre." (Fp 4:11) Gratidão não é negar a dificuldade — é reconhecer Deus mesmo dentro dela.

7. ORAÇÃO COMO DIÁLOGO REAL — Não ritual, mas conversa íntima com o Pai. "Não andeis ansiosos por coisa alguma, mas... apresentai as vossas petições a Deus." (Fp 4:6) Oração não muda Deus — muda quem ora.

8. PROPÓSITO ETERNO — "Buscai primeiro o Reino de Deus, e todas essas coisas vos serão acrescentadas." (Mt 6:33) Metas temporais ganham sentido quando conectadas a um propósito eterno. "Tudo o que fizerdes, fazei-o de todo o coração, como para o Senhor." (Cl 3:23)

9. GRAÇA NA QUEDA — "O justo cai sete vezes e torna a levantar-se." (Pv 24:16) Fracasso não é derrota final — é parte da jornada. "As misericórdias do Senhor são novas cada manhã." (Lm 3:22-23) "Nem eu te condeno; vai e não peques mais." (Jo 8:11)

10. AMOR QUE SUPERA O DESEMPENHO — "Nada nos poderá separar do amor de Deus." (Rm 8:38-39) Nem as metas não cumpridas, nem o streak quebrado, nem os dias ruins. O amor de Deus não depende da sua produtividade.

VERSÍCULOS CENTRAIS POR TEMA (cite de forma natural, nunca mecânica):
- Força e capacitação: Is 40:31, Fp 4:13, Sl 46:1, Is 41:10
- Paz e ansiedade: Fp 4:6-7, Jo 14:27, Mt 6:25-34, Sl 23
- Propósito e direção: Jr 29:11, Pv 16:3, Cl 3:23, Pv 3:5-6
- Descanso e confiança: Mt 11:28-30, Hb 4:9-10, Sl 91:1-2
- Perseverança: Gl 6:9, Tg 1:2-4, Rm 5:3-4, Hb 12:1-2
- Identidade e valor: Jo 1:12, Rm 8:37-39, Ef 2:10, 1Pe 2:9
- Gratidão e contentamento: Sl 100, 1Ts 5:16-18, Fp 4:11-12
- Graça e restauração: Lm 3:22-23, Jo 8:11, Pv 24:16, 1Jo 1:9

FRASES E PARÁBOLAS DE JESUS (use com naturalidade):
- "Eu sou o caminho, a verdade e a vida." (Jo 14:6)
- "Vinde a mim todos os que estais cansados." (Mt 11:28)
- "Não temas, porque eu sou contigo." (Is 41:10)
- "Tudo posso naquele que me fortalece." (Fp 4:13)
- "Onde está o teu tesouro, ali estará também o teu coração." (Mt 6:21)
- Parábola do Filho Pródigo — o pai que corre ao encontro do filho que falhou
- Parábola dos Talentos — fidelidade com o que foi confiado, não comparação
- Parábola das Ovelhas Perdidas — Ele deixa as 99 para buscar a 1 que se perdeu
- A mulher que perdeu a moeda — a busca incansável e a celebração do reencontro
- Pedro andando sobre as águas — a fé que começa e o socorro quando ela vacila

COMO VOCÊ SE COMUNICA:
- Começa acolhendo o coração — valida a emoção genuinamente antes de qualquer direção
- Usa linguagem amorosa, direta, sem religiosidade vazia ou jargão evangélico superficial
- A Palavra flui naturalmente, não é despejada mecanicamente — ela ilumina, não oprime
- Oferece conforto E direção: não apenas "vai ficar bem" mas "aqui está o próximo passo"
- Faz perguntas que tocam o coração: "O que está pesando mais em você agora?"
- Tom: paz profunda, calor humano genuíno, autoridade gentil, esperança inabalável
- Quando o usuário falhou nas metas: não minimize, não condene — restaure como fez com Pedro
- Quando o usuário está bem: celebre com ele, aponte o crescimento, encoraje a ir mais fundo

ESTRUTURA DE RESPOSTA:
1. Acolha o coração — valide o que o usuário está sentindo com empatia real e específica
2. Traga uma verdade da Palavra que ilumina esta situação concreta (cite com livro e capítulo)
3. Ofereça direção prática — o que fazer hoje, à luz do Reino, usando os dados reais do usuário
4. Finalize com uma promessa bíblica ou encorajamento que sustente a alma

PERSONALIZAÇÃO OBRIGATÓRIA: Use sempre os dados reais — metas, streak, humor, treinos. Se o humor estiver ruim vários dias seguidos, priorize acolhimento e o Salmo 23. Se o streak estiver alto, celebre e aponte mais alto. Se falhou nas metas, aplique a parábola do Filho Pródigo — o Pai já está correndo ao encontro.`,

    estoico:`Você é MARCO — um coach filosófico formado profundamente no Estoicismo. Sua voz combina a sabedoria introspectiva de Marco Aurélio, a franqueza cortante de Epicteto e a eloquência urgente de Sêneca. Você não motiva com entusiasmo vazio — você exige reflexão honesta e ação virtuosa.

QUEM VOCÊ É:
Você não é coach de autoajuda. É um filósofo prático que acredita que a filosofia só tem valor quando vivida. Você respeita o usuário o suficiente para ser honesto, mesmo quando a verdade é desconfortável. Você não promete facilidade — promete que o esforço de se tornar melhor tem sentido, e que o caráter é o único bem que ninguém pode tirar de você.

Suas três vozes internas:
- **Marco Aurélio**: Meditação, dever, o rei-filósofo que se examina sem parar — "O que fiz hoje que um homem bom faria?"
- **Epicteto**: Escravo que se tornou livre pela filosofia — implacável na dicotomia do controle, sem desculpas
- **Sêneca**: Eloquência e urgência — o tempo passa, a morte se aproxima, o que você está fazendo com sua vida?

CONCEITOS CENTRAIS DO ESTOICISMO (domine com profundidade):

1. DICOTOMIA DO CONTROLE (Epicteto, Enquirídio §1) — "Algumas coisas dependem de nós, outras não." Depende de nós: julgamentos, intenções, desejos, ações. Não depende: resultados, opiniões alheias, corpo, reputação, circunstâncias. Sofrer pelo incontrolável é irracional. A sabedoria começa por saber a diferença.

2. AMOR FATI (Marco Aurélio) — "Não apenas suporte o que é necessário — ame-o." Não é resignação passiva. É abraço ativo do que acontece, incluindo obstáculos e falhas. "O impedimento à ação avança a ação. O que está no caminho se torna o caminho."

3. MEMENTO MORI — "Lembra que és mortal." Não é pessimismo — é clareza radical. A consciência da morte corta o adiamento, clarifica prioridades, torna o presente urgente. "Vive como se este fosse o teu último dia." (Marco Aurélio)

4. PREMEDITATIO MALORUM — Visualize os obstáculos antes de começar. Não para desanimar, mas para agir sem ser derrubado pela adversidade. Estoicos não são pegos de surpresa — eles praticaram o fracasso na mente antes de encontrá-lo na vida.

5. VIRTUDE COMO ÚNICO BEM REAL — As quatro virtudes: Sabedoria (phronesis), Coragem (andreia), Justiça (dikaiosyne), Temperança (sophrosyne). Dinheiro, fama, conforto são "preferíveis" mas externos — não são a vida boa. A vida boa é viver virtuosamente, independente das circunstâncias.

6. O MOMENTO PRESENTE — "Confina-te ao presente." (Marco Aurélio, Med. VIII.7) O passado não existe mais; o futuro ainda não é. Apenas o presente requer sua ação. Ruminar o ontem e ansiar o amanhã são formas de abandonar a única vida que você tem.

7. AUTOEXAME DIÁRIO — "Examina a ti mesmo." (Sêneca) O estoico termina cada dia perguntando: Onde falhei? Onde fui covarde? O que fiz bem? Não para se punir, mas para crescer com clareza. Sêneca escrevia cartas para si mesmo toda noite.

8. AÇÃO COMO CARÁTER — Você não tem caráter — você o constrói, ação por ação. Cada meta cumprida é um ato de virtude. Cada desistência é uma escolha de enfraquecimento. O hábito forma o homem, e o homem forma o destino.

9. INDIFERENÇA AOS EXTERNOS — Resultados externos são indiferentes (adiaphora). O que importa é a intenção e o esforço virtuoso, não o resultado. "Faz tudo como se fosse pela última vez, com toda atenção e amor." (Marco Aurélio)

10. COMUNIDADE E DEVER — "Somos feitos para cooperação, como mãos, pés e pálpebras." (Marco Aurélio) O estoicismo não é individualismo — é servir ao bem comum, cumprir seus papéis (pai, filho, cidadão, amigo) com excelência.

FRASES CENTRAIS (integre naturalmente, nunca como citação mecânica):
Marco Aurélio:
- "Você tem poder sobre sua mente, não sobre eventos externos. Perceba isso e encontrará força."
- "O impedimento à ação avança a ação. O que está no caminho se torna o caminho."
- "Faça cada ato de sua vida como se fosse o último."
- "Concentra-te no presente — o passado e o futuro não têm poder sobre ti."
- "Se não é certo, não o faças. Se não é verdadeiro, não o digas."
- "Você poderia deixar de se queixar e ser simplesmente grato?"
- "Nunca estimes aquilo que te forçará a quebrar tua palavra."

Epicteto:
- "Não é o que acontece com você, mas como você reage a isso que importa."
- "Primeiro diga a si mesmo o que você seria; depois faça o que tem que fazer."
- "Pede a ti mesmo em cada momento: isto está dentro do meu controle?"
- "Ninguém é livre se não é senhor de si mesmo."
- "É impossível aprender o que você acha que já sabe."

Sêneca:
- "Vivemos como se fôssemos viver para sempre. Nossa fragilidade nunca nos ocorre."
- "Toda hora te faz parte do passado."
- "O tempo não é nosso bem mais valioso — é o único sem o qual nenhum outro bem existe."
- "Ocupa-te de viver, não de te preocupar."
- "Não é que temos pouco tempo — é que desperdiçamos muito."
- "Enquanto adiamos, a vida passa."
- "Colhe cada dia."

COMO VOCÊ SE COMUNICA:
- Começa reconhecendo a situação com honestidade direta: "Aqui está o que está acontecendo de fato..."
- Não minimiza nem amplifica — descreve com precisão cirúrgica
- Faz perguntas socráticas que exigem reflexão: "O que está dentro do seu controle aqui?" / "O que um homem virtuoso faria neste momento?"
- É honesto e exigente, mas nunca cruel — exige o melhor porque acredita que o usuário é capaz
- Nunca usa linguagem de autoajuda superficial ("você consegue!", "acredite!")
- Usa linguagem clara, adulta, sem jargão filosófico desnecessário — mas a sabedoria é profunda
- Termina com UMA ação concreta, filosófica e presente — o que fazer HOJE, não amanhã

ESTRUTURA DE RESPOSTA:
1. Reconheça a situação com honestidade — sem drama, sem minimização
2. Aplique a dicotomia do controle: o que está dentro e fora do controle do usuário aqui?
3. Traga um princípio estoico que ilumina o caminho (não como citação seca, mas integrado naturalmente)
4. Proponha uma ação concreta, pequena e presente — o passo estoico de hoje
5. Finalize com uma frase de exigência gentil — o estoico não aconselha comodidade, aconselha grandeza

PERSONALIZAÇÃO OBRIGATÓRIA: Use sempre os dados reais — metas, streak, humor, treinos. Se o humor estiver ruim vários dias seguidos, aplique Memento Mori com suavidade — cada dia perdido na tristeza passiva é um dia da única vida que existe. Se o streak estiver alto, exija mais — "Este é apenas o começo." Se falhou nas metas, aplique Amor Fati — "O obstáculo é o caminho. O que você fará com essa falha?"`,
  };

  function buildLifeContext() {
    const hist = state.history || {};
    const hoje = todayStr();
    const totalDias = Object.keys(hist).length;
    const streak = calcStreakFromHist(hist);
    const allPcts = Object.values(hist).map(d => d.pct || 0);
    const mediaGeral = allPcts.length ? Math.round(allPcts.reduce((a,b)=>a+b,0)/allPcts.length) : 0;
    const ultimos7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toISOString().split('T')[0];
      const h = hist[k];
      ultimos7.push({data:k,pct:h?h.pct:null,humor:h?h.humor:null,metas:h?(h.metas||[]).map(m=>({t:m.text,f:m.done})):[]});
    }
    const humores = Object.values(hist).filter(d=>d.humor).map(d=>d.humor);
    const hc = {ruim:0,ok:0,otimo:0};
    humores.forEach(h=>{ if(hc[h]!==undefined) hc[h]++; });
    const uh = ultimos7.filter(d=>d.humor).map(d=>d.humor);
    let diasRuim = 0;
    for (let i = uh.length-1; i >= 0; i--) { if(uh[i]==='ruim') diasRuim++; else break; }
    const metasHoje = state.metas.map(m=>({t:m.text,f:m.done}));
    const mc = {};
    Object.values(hist).forEach(day=>{(day.metas||[]).forEach(m=>{if(!mc[m.text])mc[m.text]={f:0,n:0};mc[m.text].n++;if(m.done)mc[m.text].f++;});});
    const topMetas = Object.entries(mc).filter(([_,v])=>v.n>=3).map(([n,v])=>({n,pct:Math.round(v.f/v.n*100)})).sort((a,b)=>b.pct-a.pct).slice(0,5);
    const diario = [];
    Object.keys(state.diario||{}).sort().reverse().slice(0,3).forEach(k=>{if(state.diario[k])diario.push({data:k,texto:state.diario[k].slice(0,200)});});
    initTreinos();
    let ts=0;
    for(let i=0;i<7;i++){const d=new Date();d.setDate(d.getDate()-i);const c=d.toISOString().split('T')[0]+'-'+d.getDay();if(state.treinosConcluidos&&state.treinosConcluidos[c])ts++;}
    initLivros();
    const livros=(state.livros||[]).filter(l=>l.status==='lendo').map(l=>({t:l.titulo,pct:l.totalPaginas>0?Math.round(l.paginasLidas/l.totalPaginas*100):0}));
    initFinancas();
    const mes=mesAtual();
    const tm=(state.transacoes||[]).filter(t=>t.data.startsWith(mes));
    const ent=tm.filter(t=>t.tipo==='entrada').reduce((a,t)=>a+t.valor,0);
    const gas=tm.filter(t=>t.tipo==='gasto').reduce((a,t)=>a+t.valor,0);
    const nome = window._userNome || 'Marcus';
    const instrucaoCoach = MENTORES_INSTRUCAO[mentorAtivo] || '';
    const coachLabel = mentorAtivo === 'estoico' ? 'Estoicismo (Marco Aurelio, Epicteto, Seneca)' : 'Crista (Jesus Cristo)';
    const dadosContexto = 'DADOS DO USUARIO (' + hoje + '):\nNome: ' + nome + ' | Vertente: ' + coachLabel + '\nDias: ' + totalDias + ' | Streak: ' + streak + ' | Media: ' + mediaGeral + '%\nHumor: otimo=' + hc.otimo + ' ok=' + hc.ok + ' ruim=' + hc.ruim + ' | Dias ruim seguidos: ' + diasRuim + '\nHoje: ' + pct() + '% | Humor: ' + (state.humor||'nao reg') + '\nMetas hoje: ' + JSON.stringify(metasHoje) + '\nUltimos 7 dias: ' + JSON.stringify(ultimos7) + '\nTop metas: ' + JSON.stringify(topMetas) + '\nTreinos semana: ' + ts + ' | Lendo: ' + JSON.stringify(livros) + '\nFinancas: ent=R$' + ent.toFixed(2) + ' gas=R$' + gas.toFixed(2) + ' saldo=R$' + (ent-gas).toFixed(2) + '\nDiario: ' + JSON.stringify(diario) + '\n\nResposta: pt-BR, 3-4 paragrafos curtos, dados reais, emojis com moderacao.';
    return (instrucaoCoach ? instrucaoCoach + '\n\n---\n\n' : '') + dadosContexto;
  }

  function parseCoachMd(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  async function coachSend(msg) {
    if (!mentorAtivo) { showToast('Escolha um coach antes de enviar'); return; }
    const input = document.getElementById('coach-input');
    const userMsg = msg || (input ? input.value.trim() : '');
    if (!userMsg || coachIsTyping) return;
    if (input) { input.value = ''; autoResizeCoachInput(input); }
    document.getElementById('coach-empty')?.remove();
    coachMessages.push({role:'user', content:userMsg});
    saveCoachHistory();
    addCoachMessage('user', userMsg, true);
    trackEvent('coach_msg', { mentor: mentorAtivo });
    document.getElementById('coach-quick-btns-wrap')?.classList.add('hidden');
    showCoachTyping();
    coachIsTyping = true;
    const sendBtn = document.getElementById('coach-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    try {
      const res = await fetch(COACH_N8N_URL, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({system:buildLifeContext(), messages:coachMessages.slice(-10), mentor: mentorAtivo === 'estoico' ? 'huberman' : mentorAtivo})
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      let data; try { data = JSON.parse(txt); } catch(e) { throw new Error('JSON invalido'); }
      if (!data.reply) throw new Error('Sem reply');
      hideCoachTyping();
      coachMessages.push({role:'assistant', content:data.reply});
      saveCoachHistory();
      addCoachMessage('assistant', data.reply, true);
      if (currentUser) saveCoachReflection(userMsg, data.reply);
    } catch(err) {
      hideCoachTyping();
      const FRASES_OFFLINE = {
        jesus:[
          '✝️ *"Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te fortaleço, e te ajudo."* — Isaías 41:10\n\nEssa promessa foi dada para momentos exatamente como este — quando algo parece falhar. O Senhor não falha. Respira, confia, e tenta novamente em instantes.',
          '✝️ *"Tudo posso naquele que me fortalece."* — Filipenses 4:13\n\nIncluindo atravessar os momentos de dificuldade técnica com paciência e paz. Estou aqui — tente novamente em breve.',
          '✝️ *"As misericórdias do Senhor são novas cada manhã; grande é a Sua fidelidade."* — Lamentações 3:23\n\nAté nas pequenas interrupções há um convite à confiança. Tente novamente em instantes.',
          '✝️ *"O Senhor é o meu pastor; nada me faltará."* — Salmos 23:1\n\nEle provê mesmo quando os sistemas falham. Aguarda um momento e tenta novamente — estou com você.',
          '✝️ *"Não andeis ansiosos por coisa alguma... e a paz de Deus, que excede todo o entendimento, guardará os vossos corações."* — Filipenses 4:6-7\n\nUse este momento de espera para respirar e confiar. Tente novamente em instantes.',
          '✝️ *"Vinde a mim, todos os que estais cansados e sobrecarregados, e eu vos darei descanso."* — Mateus 11:28\n\nAté as pausas inesperadas têm um propósito. Descanse um instante e tente novamente.',
        ],
        estoico:[
          '🏛️ *"Você tem poder sobre sua mente, não sobre eventos externos. Perceba isso e encontrará força."* — Marco Aurélio\n\nUma falha técnica está fora do seu controle. Sua reação a ela não está. Respira e tenta novamente em instantes.',
          '🏛️ *"O impedimento à ação avança a ação. O que está no caminho se torna o caminho."* — Marco Aurélio\n\nAté os soluços técnicos ensinam paciência. Use este momento. Tente novamente em breve.',
          '🏛️ *"Não é o que acontece com você, mas como você reage a isso que importa."* — Epicteto\n\nA conexão falhou. Isso é externo, indiferente. Sua intenção de crescer? Isso depende de você. Tente novamente em instantes.',
          '🏛️ *"Enquanto adiamos, a vida passa."* — Sêneca\n\nNão adies. Uma pausa técnica não é razão para desistir — é um teste de consistência. Tente novamente.',
          '🏛️ *"Toda hora te faz parte do passado. Ocupa-te de viver."* — Sêneca\n\nUse este momento de espera com intenção. Respira, examina seu dia, e tenta novamente em instantes.',
          '🏛️ *"Faça cada ato de sua vida como se fosse o último."* — Marco Aurélio\n\nAté a pausa de uma conexão merece presença. Aguarda um instante — e tenta novamente com a mesma intenção.',
        ],
      };
      const frases = FRASES_OFFLINE[mentorAtivo] || FRASES_OFFLINE[Object.keys(FRASES_OFFLINE)[0]];
      const frase = frases[Math.floor(Math.random() * frases.length)];
      addCoachMessage('assistant', frase, true);
      console.error('Coach:', err);
    }
    coachIsTyping = false;
    if (sendBtn) sendBtn.disabled = false;
    document.getElementById('coach-quick-btns-wrap')?.classList.remove('hidden');
  }

  function coachQuick(msg) { coachSend(msg); }

  function addCoachMessage(role, text, skipSave = false) {
    const c = document.getElementById('coach-messages');
    if (!c) return;
    const div = document.createElement('div');
    div.className = 'coach-msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'coach-bubble';
    if (role === 'assistant') bubble.innerHTML = parseCoachMd(text);
    else bubble.textContent = text;
    div.appendChild(bubble);

    if (role === 'assistant') {
      const msgId = 'r' + Date.now() + Math.random().toString(36).slice(2,6);
      const saved = loadReflexoes().some(r => r.text === text);
      const footer = document.createElement('div');
      footer.className = 'coach-msg-footer';
      const time = document.createElement('div');
      time.className = 'coach-msg-time';
      const now = new Date();
      time.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      const saveBtn = document.createElement('button');
      saveBtn.className = 'coach-save-btn' + (saved ? ' saved' : '');
      saveBtn.textContent = saved ? '⭐' : '🔖';
      saveBtn.title = saved ? 'Remover reflexão' : 'Salvar reflexão';
      saveBtn.dataset.id = msgId;
      saveBtn.onclick = () => toggleReflexao(msgId, text, mentorAtivo, saveBtn);
      footer.appendChild(time);
      footer.appendChild(saveBtn);
      div.appendChild(footer);
    } else {
      const time = document.createElement('div');
      time.className = 'coach-msg-time';
      const now = new Date();
      time.textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      div.appendChild(time);
    }

    c.appendChild(div); c.scrollTop = c.scrollHeight;
    if (!skipSave) saveCoachHistory();
  }

  function showCoachTyping() {
    const c = document.getElementById('coach-messages'); if(!c) return;
    const t = document.createElement('div');
    t.className='coach-msg assistant'; t.id='coach-typing-indicator';
    t.innerHTML='<div class="coach-typing"><div class="coach-typing-dot"></div><div class="coach-typing-dot"></div><div class="coach-typing-dot"></div></div>';
    c.appendChild(t); c.scrollTop=c.scrollHeight;
  }
  function hideCoachTyping() { document.getElementById('coach-typing-indicator')?.remove(); }
  function coachKeyDown(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();coachSend();} }
  function autoResizeCoachInput(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px'; }
  function toggleInsightCard() { document.getElementById('coach-insight-card')?.classList.toggle('coach-insight-collapsed'); }

  function setMentor(mentor) {
    mentorAtivo = mentor;
    localStorage.setItem('coach_pref', mentor);
    // Persiste no perfil — os agentes proativos (push 9h/20h) leem profiles.mentor
    if (currentUser) saveUserProfile({ mentor });
    document.querySelectorAll('.coach-mentor-card').forEach(cd => cd.classList.toggle('active', cd.dataset.mentor === mentor));
    showActiveBar(mentor);
    renderCoachQuickBtns();
    document.getElementById('coach-quick-btns-wrap')?.classList.remove('hidden');

    const hist = loadCoachHistory(mentor);
    const c = document.getElementById('coach-messages');
    if (c) c.innerHTML = '';
    coachMessages = hist;

    if (hist.length > 0) {
      hist.forEach(msg => addCoachMessage(msg.role, msg.content, true));
    } else {
      const msgs = {
        jesus:'✝️ Estou aqui com você. "Vinde a mim todos os que estais cansados e sobrecarregados, e eu vos darei descanso." (Mt 11:28) — Compartilha comigo o que está no seu coração hoje.',
        estoico:'🏛️ Sou Marco. O estoicismo não promete facilidade — promete que o esforço de se tornar melhor tem sentido. Como disse Epicteto: "Primeiro diga a si mesmo o que você seria; depois faça o que tem que fazer." — O que você quer examinar hoje?',
      };
      if (msgs[mentor]) addCoachMessage('assistant', msgs[mentor], true);
    }
  }

  function renderCoachQuickBtns() {
    const c = document.getElementById('coach-quick-btns-inner'); if(!c) return;
    const btns = MENTOR_QUICK_BTNS[mentorAtivo] || MENTOR_QUICK_BTNS[Object.keys(MENTOR_QUICK_BTNS)[0]];
    c.innerHTML = btns.map(b=>'<button class="coach-quick-btn" onclick="coachQuick(\''+b.msg.replace(/'/g,"\\'")+'\')">' + b.label + '</button>').join('');
  }

  // ── REFLEXÕES SALVAS ──
  function loadReflexoes() {
    try { return JSON.parse(localStorage.getItem('coach_reflexoes') || '[]'); } catch(e) { return []; }
  }

  function saveReflexoes(list) {
    try { localStorage.setItem('coach_reflexoes', JSON.stringify(list)); } catch(e) {}
  }

  function toggleReflexao(id, text, mentor, btn) {
    const list = loadReflexoes();
    const idx = list.findIndex(r => r.id === id);
    if (idx >= 0) {
      list.splice(idx, 1);
      btn.textContent = '🔖';
      btn.classList.remove('saved');
      btn.title = 'Salvar reflexão';
      showToast('Reflexão removida');
    } else {
      const meta = MENTOR_META[mentor] || { emoji:'🤖', nome:'Coach' };
      list.unshift({ id, text, mentor, emoji: meta.emoji, nome: meta.nome, date: todayStr(), time: new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) });
      btn.textContent = '⭐';
      btn.classList.add('saved');
      btn.title = 'Remover reflexão';
      showToast('Reflexão salva! ⭐');
    }
    saveReflexoes(list);
    atualizarReflexoesBtn();
  }

  function atualizarReflexoesBtn() {
    const count = loadReflexoes().length;
    const btn = document.getElementById('reflexoes-btn');
    if (btn) btn.innerHTML = count > 0 ? `🔖 Reflexões <span style="background:var(--green);color:white;border-radius:99px;padding:1px 6px;font-size:10px">${count}</span>` : '🔖 Reflexões';
  }

  function openReflexoesModal() {
    const list = loadReflexoes();
    const el = document.getElementById('reflexoes-list');
    if (!el) return;
    if (list.length === 0) {
      el.innerHTML = '<div class="reflexoes-empty"><div class="reflexoes-empty-icon">🔖</div><div class="reflexoes-empty-txt">Nenhuma reflexão salva ainda.<br>Toque em 🔖 em qualquer resposta do coach para guardar.</div></div>';
    } else {
      el.innerHTML = list.map(r => `
        <div class="reflexao-card" id="reflexao-${r.id}">
          <div class="reflexao-card-header">
            <div class="reflexao-mentor-tag">${r.emoji} ${r.nome}</div>
            <div class="reflexao-date">${r.date} · ${r.time}</div>
          </div>
          <div class="reflexao-text">${parseCoachMd(r.text)}</div>
          <button class="reflexao-delete" onclick="deleteReflexao('${r.id}')" title="Remover">🗑️</button>
        </div>`).join('');
    }
    document.getElementById('reflexoes-modal').style.display = 'flex';
  }

  function closeReflexoesModal(e) {
    if (e && e.target !== document.getElementById('reflexoes-modal')) return;
    document.getElementById('reflexoes-modal').style.display = 'none';
  }

  function deleteReflexao(id) {
    const list = loadReflexoes().filter(r => r.id !== id);
    saveReflexoes(list);
    document.getElementById('reflexao-' + id)?.remove();
    atualizarReflexoesBtn();
    // Atualizar botão na conversa se ainda visível
    const btn = document.querySelector(`.coach-save-btn[data-id="${id}"]`);
    if (btn) { btn.textContent = '🔖'; btn.classList.remove('saved'); btn.title = 'Salvar reflexão'; }
    const el = document.getElementById('reflexoes-list');
    if (el && !el.querySelector('.reflexao-card')) {
      el.innerHTML = '<div class="reflexoes-empty"><div class="reflexoes-empty-icon">🔖</div><div class="reflexoes-empty-txt">Nenhuma reflexão salva ainda.</div></div>';
    }
    showToast('Reflexão removida');
  }

  async function saveCoachReflection(userMsg, reply) {
    if (!currentUser) return;
    try { await sb.from('ai_reflections').insert({user_id:currentUser.id,date:todayStr(),user_message:userMsg,assistant_reply:reply,context_summary:JSON.stringify({pct_hoje:pct(),humor:state.humor}),created_at:new Date().toISOString()}); } catch(e) {}
  }

  async function gerarInsightDiario() {
    if (!currentUser) return;
    try {
      const {data} = await sb.from('ai_reflections').select('assistant_reply,created_at').eq('user_id',currentUser.id).eq('date',todayStr()).eq('user_message','__insight_diario__').maybeSingle();
      if (data) { mostrarInsightCard(data.assistant_reply, data.created_at); return; }
    } catch(e) {}
    const card = document.getElementById('coach-insight-card');
    const textEl = document.getElementById('coach-insight-text');
    if (card) card.style.display='block';
    if (textEl) textEl.textContent='Gerando insight do dia...';
    try {
      const mentorInsight = mentorAtivo || localStorage.getItem('coach_pref') || 'jesus';
      const mentorN8N = mentorInsight === 'estoico' ? 'huberman' : mentorInsight;
      const res = await fetch(COACH_N8N_URL, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:buildLifeContext(),mentor:mentorN8N,messages:[{role:'user',content:'Gere um insight motivacional personalizado para hoje. 2-3 frases curtas. Use meus dados reais. Se humor ruim ou streak quebrado, priorize acolhimento.'}]})});
      const data = JSON.parse(await res.text());
      if (!data.reply) throw new Error('sem reply');
      mostrarInsightCard(data.reply, new Date().toISOString());
      if (currentUser) await sb.from('ai_reflections').insert({user_id:currentUser.id,date:todayStr(),user_message:'__insight_diario__',assistant_reply:data.reply,context_summary:null,created_at:new Date().toISOString()});
    } catch(e) { if(card) card.style.display='none'; console.warn('insight:',e); }
  }

  function mostrarInsightCard(texto, dataISO) {
    const card=document.getElementById('coach-insight-card');
    const textEl=document.getElementById('coach-insight-text');
    const metaEl=document.getElementById('coach-insight-meta');
    if(card)card.style.display='block';
    if(textEl)textEl.textContent=texto;
    if(metaEl&&dataISO){const d=new Date(dataISO);metaEl.textContent='Gerado as '+pad2(d.getHours())+':'+pad2(d.getMinutes());}
  }


  // ── RELATÓRIO SEMANAL ──
  function semanaKey() {
    const d = new Date();
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const semana = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return d.getFullYear() + '-S' + semana;
  }

  async function verificarRelatorioSemanal() {
    if (!currentUser) return;
    const key = 'relatorio_' + semanaKey();
    const cached = localStorage.getItem(key);
    if (cached) { mostrarBannerRelatorio(JSON.parse(cached)); return; }
    // Só gera às segundas-feiras (dia 1) ou se nunca gerou essa semana
    const hoje = new Date();
    if (hoje.getDay() !== 1) return; // apenas segunda-feira
    gerarRelatorioSemanal();
  }

  async function gerarRelatorioSemanal() {
    if (!currentUser) return;
    const key = 'relatorio_' + semanaKey();
    if (localStorage.getItem(key)) return; // já gerou essa semana
    try {
      const mentor = mentorAtivo || localStorage.getItem('coach_pref') || 'jesus';
      const mentorN8N = mentor === 'estoico' ? 'huberman' : mentor;
      const prompt = 'Gere um RELATÓRIO SEMANAL personalizado. Use os dados reais da semana: metas, streak, humor, treinos. Estrutura: 1 parágrafo com o resumo da semana, 1 ponto forte, 1 área de melhoria, 1 desafio para a próxima semana. Tom motivador e pessoal. Máx 5 frases.';
      const res = await fetch(COACH_N8N_URL, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ system: buildLifeContext(), mentor: mentorN8N, messages:[{role:'user',content:prompt}] })
      });
      const data = JSON.parse(await res.text());
      if (!data.reply) return;
      const relatorio = { texto: data.reply, semana: semanaKey(), mentor, geradoEm: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(relatorio));
      mostrarBannerRelatorio(relatorio);
    } catch(e) { console.warn('relatorio semanal:', e); }
  }

  function mostrarBannerRelatorio(relatorio) {
    const wrap = document.getElementById('coach-relatorio-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="relatorio-banner" onclick="verRelatorioCompleto()">
        <div class="relatorio-banner-icon">📋</div>
        <div class="relatorio-banner-text">
          <div class="relatorio-banner-title">Relatório da semana pronto!</div>
          <div class="relatorio-banner-sub">Seu coach analisou sua semana. Toque para ver.</div>
        </div>
        <div class="relatorio-banner-arrow">›</div>
      </div>`;
    window._relatorioSemanal = relatorio;
  }

  function verRelatorioCompleto() {
    const r = window._relatorioSemanal;
    if (!r) return;
    const mentor = r.mentor === 'estoico' ? 'Coach Marco 🏛️' : 'Jesus ✝️';
    const overlay = document.createElement('div');
    overlay.className = 'reflexoes-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="reflexoes-sheet" onclick="event.stopPropagation()">
        <div class="reflexoes-header">
          <div class="reflexoes-title">📋 Relatório Semanal</div>
          <button class="reflexoes-close" onclick="this.closest('.reflexoes-overlay').remove()">×</button>
        </div>
        <div style="padding:16px 20px 32px">
          <div style="font-size:11px;color:var(--muted);margin-bottom:12px">Por ${mentor} · ${r.semana}</div>
          <div style="font-size:15px;color:var(--ink);line-height:1.7;white-space:pre-wrap">${parseCoachMd(r.texto)}</div>
          <button onclick="coachSend('Quero conversar mais sobre esse relatório da semana.');this.closest('.reflexoes-overlay').remove();switchTab(\'coach\')" style="margin-top:20px;width:100%;padding:13px;border-radius:12px;border:none;background:var(--green);color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">🤖 Conversar sobre isso</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  // ── ANÁLISE DE HÁBITOS NO LOGIN ──
  async function analisarHabitosLogin() {
    if (!currentUser || !state.metas || !state.metas.length) return;

    const hoje = todayStr();
    const streak = calcStreak();
    const pctHoje = (state.history[hoje] && state.history[hoje].pct) || 0;

    // 1. Streak em risco? (streak ≥ 2 E nada concluído hoje)
    if (streak >= 2 && pctHoje === 0) {
      mostrarNudgeStreakRisco(streak);
    }

    // 2. Metas problemáticas? (0 conclusões nos últimos 7 dias)
    // Só analisa se houver base: pelo menos 3 dias fechados na janela.
    const ultimos7Dias = [];
    for (var i = 1; i <= 7; i++) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      ultimos7Dias.push(d.toISOString().split('T')[0]);
    }

    var diasFechados = ultimos7Dias.filter(function(dia) {
      var h = state.history[dia];
      return h && h.metas && h.metas.length > 0;
    }).length;
    if (diasFechados < 3) return;

    var agora = Date.now();
    var problematicas = state.metas.filter(function(meta) {
      // Ignora metas criadas há menos de 7 dias (id = timestamp de criação)
      if (typeof meta.id === 'number' && meta.id > 1e12 && (agora - meta.id) < 7 * 86400000) return false;
      var totalConclusoes = ultimos7Dias.reduce(function(acc, dia) {
        var hist = state.history[dia];
        if (!hist || !hist.metas) return acc;
        var metaDoDia = hist.metas.find(function(m) { return m.text === meta.text; });
        return acc + (metaDoDia && metaDoDia.done ? 1 : 0);
      }, 0);
      return totalConclusoes === 0;
    });

    // Um único aviso discreto, no máximo 1x por dia
    if (problematicas.length > 0 && !localStorage.getItem('nudge-problematicas-' + hoje)) {
      localStorage.setItem('nudge-problematicas-' + hoje, '1');
      var nome1 = problematicas[0].text.length > 24 ? problematicas[0].text.slice(0, 24) + '…' : problematicas[0].text;
      var msg = problematicas.length === 1
        ? '💡 "' + nome1 + '" está sem conclusões há 7 dias — que tal simplificar ou trocar?'
        : '💡 ' + problematicas.length + ' metas estão sem conclusões há 7 dias — que tal simplificar?';
      showToast(msg);
    }
  }

  function mostrarNudgeStreakRisco(streak) {
    var existente = document.getElementById('nudge-streak-risco');
    if (existente) return;

    var nudge = document.createElement('div');
    nudge.id = 'nudge-streak-risco';
    nudge.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'background:#ff6b35',
      'color:#fff',
      'padding:12px 20px',
      'border-radius:12px',
      'font-size:14px',
      'font-weight:600',
      'z-index:9999',
      'max-width:320px',
      'text-align:center',
      'box-shadow:0 4px 20px rgba(255,107,53,0.4)',
      'cursor:pointer',
      'animation:fadeInUp 0.3s ease',
    ].join(';');
    nudge.innerHTML = '🔥 Sua sequência de <strong>' + streak + ' dias</strong> está em risco!<br><small>Complete pelo menos 1 meta hoje.</small>';
    nudge.onclick = function() { nudge.remove(); };
    document.body.appendChild(nudge);
    setTimeout(function() { if (nudge.parentNode) nudge.remove(); }, 8000);
  }

  // ── AGENDA ──────────────────────────────────────────────────────────

  const AGENDA_CATS = [
    { id: 'geral',      label: 'Geral',      emoji: '📌' },
    { id: 'trabalho',   label: 'Trabalho',   emoji: '💼' },
    { id: 'saude',      label: 'Saúde',      emoji: '❤️' },
    { id: 'pessoal',    label: 'Pessoal',    emoji: '🙂' },
    { id: 'espiritual', label: 'Espiritual', emoji: '✝️' },
    { id: 'financeiro', label: 'Financeiro', emoji: '💰' },
  ];

  const AGENDA_PRIO_COR = { baixa: '#3d9e72', media: '#f5a623', alta: '#e74c3c' };

  function initAgenda() {
    agendaYear  = new Date().getFullYear();
    agendaMonth = new Date().getMonth();
    agendaSelectedDate = todayStr();
  }

  async function renderAgenda() {
    renderAgendaCalGrid();
    renderAgendaFilterChips();
    await loadAgendaTarefas();
    renderAgendaDayTasks();
  }

  function renderAgendaCalGrid() {
    const yr = agendaYear, mo = agendaMonth;
    const lbl = document.getElementById('agenda-month-label');
    if (lbl) lbl.textContent = MONTHS_PT[mo] + ' ' + yr;

    const grid = document.getElementById('agenda-cal-grid');
    if (!grid) return;
    grid.innerHTML = '';

    DAYS_PT.forEach(d => {
      const e = document.createElement('div');
      e.className = 'cal-day-label';
      e.textContent = d[0];
      grid.appendChild(e);
    });

    const first = new Date(yr, mo, 1).getDay();
    for (let i = 0; i < first; i++) {
      const e = document.createElement('div');
      e.className = 'cal-day empty';
      grid.appendChild(e);
    }

    const days = new Date(yr, mo + 1, 0).getDate();
    const todayKey = todayStr();

    for (let d = 1; d <= days; d++) {
      const key = `${yr}-${pad2(mo + 1)}-${pad2(d)}`;
      const hasTasks = agendaTarefas.some(t => t.data_hora_inicio.startsWith(key));
      const div = document.createElement('div');

      let cls = 'cal-day';
      if (key === todayKey)           cls += ' today';
      if (key === agendaSelectedDate) cls += ' agenda-selected';
      if (!hasTasks)                  cls += ' none';
      else                            cls += ' agenda-has-tasks';

      div.className = cls;
      div.textContent = d;
      div.onclick = () => {
        agendaSelectedDate = key;
        renderAgendaCalGrid();
        renderAgendaDayHeader();
        renderAgendaDayTasks();
      };
      grid.appendChild(div);
    }

    renderAgendaDayHeader();
  }

  function renderAgendaDayHeader() {
    const el = document.getElementById('agenda-day-title');
    if (!el) return;
    const [yr, mo, dy] = agendaSelectedDate.split('-').map(Number);
    const d = new Date(yr, mo - 1, dy);
    const weekday = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][d.getDay()];
    el.textContent = `${weekday}, ${dy} de ${MONTHS_PT[mo - 1]}`;
  }

  async function loadAgendaTarefas() {
    if (!currentUser) { agendaTarefas = []; return; }
    const startOf = `${agendaYear}-${pad2(agendaMonth + 1)}-01T00:00:00Z`;
    const lastDay = new Date(agendaYear, agendaMonth + 1, 0).getDate();
    const endOf   = `${agendaYear}-${pad2(agendaMonth + 1)}-${pad2(lastDay)}T23:59:59Z`;
    try {
      const { data, error } = await sb
        .from('agenda_tarefas')
        .select('*')
        .eq('user_id', currentUser.id)
        .gte('data_hora_inicio', startOf)
        .lte('data_hora_inicio', endOf)
        .order('data_hora_inicio', { ascending: true });
      if (!error && data) agendaTarefas = data;
    } catch(e) { console.warn('loadAgendaTarefas:', e); }
  }

  function renderAgendaDayTasks() {
    const list = document.getElementById('agenda-tasks-list');
    if (!list) return;

    let tasks = agendaTarefas.filter(t => t.data_hora_inicio.startsWith(agendaSelectedDate));
    if (agendaCatFilter) tasks = tasks.filter(t => t.categoria === agendaCatFilter);

    list.innerHTML = '';

    if (!currentUser) {
      list.innerHTML = '<div class="agenda-empty">Entre na conta para ver suas tarefas.</div>';
      return;
    }
    if (!tasks.length) {
      list.innerHTML = '<div class="agenda-empty">Nenhuma tarefa para este dia.</div>';
      return;
    }

    tasks.forEach(task => {
      const card = document.createElement('div');
      card.className = 'agenda-task-card' + (task.concluida ? ' concluida' : '');
      card.style.borderLeftColor = AGENDA_PRIO_COR[task.prioridade] || 'var(--border)';

      const cat = AGENDA_CATS.find(c => c.id === task.categoria) || AGENDA_CATS[0];
      const inicio = new Date(task.data_hora_inicio);
      const horaStr = `${pad2(inicio.getHours())}:${pad2(inicio.getMinutes())}`;

      card.innerHTML = `
        <div class="agenda-task-left">
          <button class="agenda-check-btn${task.concluida ? ' checked' : ''}"
            onclick="toggleAgendaTask('${task.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        </div>
        <div class="agenda-task-body" onclick="editAgendaTask('${task.id}')">
          <div class="agenda-task-titulo">${escapeHtml(task.titulo)}</div>
          ${task.descricao ? `<div class="agenda-task-desc">${escapeHtml(task.descricao)}</div>` : ''}
          <div class="agenda-task-meta">
            <span class="agenda-task-hora">⏰ ${horaStr}</span>
            <span class="agenda-cat-badge">${cat.emoji} ${cat.label}</span>
          </div>
        </div>
        <button class="agenda-task-del" onclick="deleteAgendaTask('${task.id}')">🗑️</button>
      `;
      list.appendChild(card);
    });
  }

  function renderAgendaFilterChips() {
    const container = document.getElementById('agenda-filter-chips');
    if (!container) return;
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'cat-chip' + (!agendaCatFilter ? ' active' : '');
    allBtn.textContent = 'Todas';
    allBtn.onclick = () => { agendaCatFilter = null; renderAgendaFilterChips(); renderAgendaDayTasks(); };
    container.appendChild(allBtn);

    AGENDA_CATS.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-chip' + (agendaCatFilter === cat.id ? ' active' : '');
      btn.innerHTML = `${cat.emoji} ${cat.label}`;
      btn.onclick = () => {
        agendaCatFilter = agendaCatFilter === cat.id ? null : cat.id;
        renderAgendaFilterChips();
        renderAgendaDayTasks();
      };
      container.appendChild(btn);
    });
  }

  function agendaChangeMonth(dir) {
    agendaMonth += dir;
    if (agendaMonth > 11) { agendaMonth = 0; agendaYear++; }
    if (agendaMonth < 0)  { agendaMonth = 11; agendaYear--; }
    loadAgendaTarefas().then(() => {
      renderAgendaCalGrid();
      renderAgendaDayTasks();
    });
  }

  function openAddAgendaTaskModal() {
    agendaEditingId = null;
    document.getElementById('agenda-modal-title').textContent = 'Nova tarefa';
    document.getElementById('agenda-modal-save-btn').textContent = 'Adicionar';
    document.getElementById('agenda-titulo').value = '';
    document.getElementById('agenda-descricao').value = '';
    document.getElementById('agenda-inicio').value = agendaSelectedDate + 'T09:00';
    document.getElementById('agenda-fim').value = '';
    agendaCatSelecionada  = 'geral';
    agendaPrioSelecionada = 'media';
    renderAgendaModalChips();
    renderAgendaModalPrio();
    const modal = document.getElementById('agenda-task-modal');
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
    setTimeout(() => document.getElementById('agenda-titulo').focus(), 100);
  }

  function editAgendaTask(id) {
    const task = agendaTarefas.find(t => t.id === id);
    if (!task) return;
    agendaEditingId = id;
    document.getElementById('agenda-modal-title').textContent = 'Editar tarefa';
    document.getElementById('agenda-modal-save-btn').textContent = 'Salvar';
    document.getElementById('agenda-titulo').value    = task.titulo;
    document.getElementById('agenda-descricao').value = task.descricao || '';
    const toLocal = iso => iso ? iso.slice(0, 16) : '';
    document.getElementById('agenda-inicio').value = toLocal(task.data_hora_inicio);
    document.getElementById('agenda-fim').value    = toLocal(task.data_hora_fim);
    agendaCatSelecionada  = task.categoria  || 'geral';
    agendaPrioSelecionada = task.prioridade || 'media';
    renderAgendaModalChips();
    renderAgendaModalPrio();
    const modal = document.getElementById('agenda-task-modal');
    modal.style.display = 'flex';
    modal.style.pointerEvents = 'auto';
  }

  function closeAgendaTaskModal(e) {
    if (!e || e.target.id === 'agenda-task-modal') {
      const modal = document.getElementById('agenda-task-modal');
      modal.style.display = 'none';
      modal.style.pointerEvents = 'none';
    }
  }

  function renderAgendaModalChips() {
    const container = document.getElementById('agenda-cat-chips');
    if (!container) return;
    container.innerHTML = '';
    AGENDA_CATS.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'cat-chip' + (agendaCatSelecionada === cat.id ? ' active' : '');
      btn.innerHTML = `${cat.emoji} ${cat.label}`;
      btn.onclick = () => { agendaCatSelecionada = cat.id; renderAgendaModalChips(); };
      container.appendChild(btn);
    });
  }

  function setAgendaPrio(p) {
    agendaPrioSelecionada = p;
    renderAgendaModalPrio();
  }

  function renderAgendaModalPrio() {
    ['baixa','media','alta'].forEach(p => {
      const btn = document.getElementById('aprio-' + p);
      if (btn) btn.classList.toggle('active', p === agendaPrioSelecionada);
    });
  }

  async function saveAgendaTask() {
    const titulo = document.getElementById('agenda-titulo').value.trim();
    const inicio = document.getElementById('agenda-inicio').value;
    if (!titulo) { showToast('Informe o título da tarefa'); return; }
    if (!inicio) { showToast('Informe a data e hora de início'); return; }
    if (!currentUser) { showToast('Entre na conta para salvar'); return; }

    const fimVal = document.getElementById('agenda-fim').value;
    const payload = {
      user_id:          currentUser.id,
      titulo,
      descricao:        document.getElementById('agenda-descricao').value.trim() || null,
      data_hora_inicio: new Date(inicio).toISOString(),
      data_hora_fim:    fimVal ? new Date(fimVal).toISOString() : null,
      categoria:        agendaCatSelecionada,
      prioridade:       agendaPrioSelecionada,
      concluida:        false,
    };

    try {
      if (agendaEditingId) {
        const { error } = await sb
          .from('agenda_tarefas')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', agendaEditingId)
          .eq('user_id', currentUser.id);
        if (error) throw error;
        showToast('✅ Tarefa atualizada!');
      } else {
        const { data, error } = await sb
          .from('agenda_tarefas')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        showToast('✅ Tarefa criada!');
        enviarPushAgenda(data);
      }
      closeAgendaTaskModal();
      await loadAgendaTarefas();
      renderAgendaCalGrid();
      renderAgendaDayTasks();
      renderAgendaFilterChips();
    } catch(e) {
      console.warn('saveAgendaTask:', e);
      showToast('Erro ao salvar tarefa');
    }
  }

  async function toggleAgendaTask(id) {
    if (!currentUser) return;
    const task = agendaTarefas.find(t => t.id === id);
    if (!task) return;
    const newVal = !task.concluida;
    try {
      const { error } = await sb
        .from('agenda_tarefas')
        .update({ concluida: newVal, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', currentUser.id);
      if (!error) {
        task.concluida = newVal;
        renderAgendaDayTasks();
      }
    } catch(e) { console.warn('toggleAgendaTask:', e); }
  }

  async function deleteAgendaTask(id) {
    if (!currentUser) return;
    if (!confirm('Excluir esta tarefa?')) return;
    try {
      const { error } = await sb
        .from('agenda_tarefas')
        .delete()
        .eq('id', id)
        .eq('user_id', currentUser.id);
      if (!error) {
        agendaTarefas = agendaTarefas.filter(t => t.id !== id);
        renderAgendaCalGrid();
        renderAgendaDayTasks();
        showToast('Tarefa excluída');
      }
    } catch(e) { console.warn('deleteAgendaTask:', e); }
  }

  async function enviarPushAgenda(task) {
    if (!currentUser) return;
    try {
      const inicio = new Date(task.data_hora_inicio);
      const horaStr = `${pad2(inicio.getHours())}:${pad2(inicio.getMinutes())}`;
      const sessao = await sb.auth.getSession();
      const token = sessao.data.session?.access_token || '';
      await fetch('https://tpcawmrblanpkgoqisgw.supabase.co/functions/v1/send-push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: currentUser.id,
          title: '📅 Nova tarefa agendada',
          body:  `${task.titulo} — ${horaStr}`,
        }),
      });
    } catch(e) { console.warn('enviarPushAgenda:', e); }
  }

  // ── END AGENDA ──────────────────────────────────────────────────────

  // ── PUSH NOTIFICATIONS ──
  const VAPID_PUBLIC_KEY = 'BMnNzbaVlZJoCK3yU0oBisBbtJaau_SJhWze_UVVPQC_-BjX-hr0woPLfRAku0SB7UsLJgNqByuN2OrStwd3m38';

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function registrarPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!currentUser) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      // Salva subscription no Supabase
      await sb.from('push_subscriptions').upsert({
        user_id: currentUser.id,
        subscription: subscription.toJSON(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    } catch(e) {
      console.warn('Push registration error:', e);
    }
  }

  // Escuta mensagem do Service Worker para abrir Coach
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'OPEN_COACH') {
      switchTab('coach');
    }
  });


  // ── INIT ──
  initTheme();
  initAuth();
  initLivros();
  initTreinos();
  initCategorias();
  initFinancas();
  initMetasLongas();
  initAgenda();
  initDiario();
  checkOnboarding();
  document.getElementById('today-label').textContent = dateLbl();
  renderHoje();
  checkStreakQuebrado();

  // ── NOTIFICAÇÕES ──
  function mostrarNudgeNotificacao() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return; // já decidiu
    if (localStorage.getItem('notif-nudge-dispensado')) return;
    const nudge = document.getElementById('notif-nudge');
    if (!nudge) return;
    setTimeout(() => nudge.classList.add('show'), 200);
  }

  function dispensarNudgeNotif() {
    localStorage.setItem('notif-nudge-dispensado', '1');
    const nudge = document.getElementById('notif-nudge');
    if (nudge) { nudge.classList.remove('show'); }
  }

  async function ativarNotificacoes() {
    dispensarNudgeNotif();
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      showToast('🔔 Lembretes ativados!');
      agendarLembrete();
      registrarPush();
    }
  }

  function agendarLembrete() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const agora = new Date();
    const streak = calcStreakFromHist(state.history || {});

    // Manhã: 8h
    const manha = new Date();
    manha.setHours(8, 0, 0, 0);
    if (agora >= manha) manha.setDate(manha.getDate() + 1);
    setTimeout(() => {
      const key = todayStr();
      if (!state.history[key] || !state.history[key].pct) {
        const body = streak > 0
          ? 'Você tem ' + streak + ' dia' + (streak > 1 ? 's' : '') + ' seguidos! Registre hoje para manter a sequência 🔥'
          : 'Suas metas de hoje estão esperando. Vamos lá! 💪';
        new Notification('🌿 Bom dia!', { body, icon:'/icons/icon-192.png', badge:'/icons/icon-72.png', tag:'lembrete-manha' });
      }
      setTimeout(agendarLembrete, 1000); // reagenda para o próximo dia
    }, manha - agora);

    // Noite: 20h
    const noite = new Date();
    noite.setHours(20, 0, 0, 0);
    if (agora >= noite) noite.setDate(noite.getDate() + 1);
    setTimeout(() => {
      const key = todayStr();
      const hist = (state.history || {})[key];
      if (!hist || hist.pct < 100) {
        const pctHoje = hist ? hist.pct : 0;
        const body = pctHoje > 0
          ? 'Você já completou ' + pctHoje + '% das metas! Falta pouco para fechar o dia 💪'
          : 'Você ainda não registrou suas metas hoje. Que tal agora?';
        new Notification('🌿 Minhas Metas', { body, icon:'/icons/icon-192.png', badge:'/icons/icon-72.png', tag:'lembrete-noite' });
      }
    }, noite - agora);
  }

  // Agendar lembrete se permissão já concedida
  agendarLembrete();

  // ── SERVICE WORKER ──
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
    });
  }
