/**
 * PROGRAM — lógica do jogo Atari 2600 (6507)
 *
 * Adaptado do módulo NES, com limites do 2600:
 *  - 6507 ≈ 6502, mas só 13 linhas de endereço (8 KB janela típica)
 *  - RAM útil: 128 bytes no RIOT ($80–$FF)
 *  - TIA $00–$2C (regs de vídeo/áudio/input)
 *  - Sem stack profundo para “objetos NES”; regras geram rotinas no overscan/vblank
 *
 * Dados em Project.data:
 *  - variables[]
 *  - rules[]  (com ruleTabs para organização visual)
 *  - gameObjects[]  (spawns: tela + x/y + player + sprite)
 *  - programMeta { notes }
 */
const PROGRAM = (() => {
  let activeTab = 'vars'; // vars | objects | events | rules | kernel
  let selectedObjectId = null;
  let activeRuleTabId = 'main';
  let selectedRuleId = null;

  const OPS = ['==', '!=', '>', '<', '>=', '<='];

  const EVENT_CATALOG = [
    { value: 'boot', label: 'Boot (início do cartucho)' },
    { value: 'vblank', label: 'Before Frame (antes do desenho)' },
    { value: 'overscan', label: 'After Frame (depois do desenho)' },
    { value: 'input', label: 'Input (joystick / botão)' },
    { value: 'timer', label: 'Timer (frames)' },
    { value: 'enter_screen', label: 'Ao entrar na tela' },
    { value: 'collision_p0pf', label: 'Player 1 × Cenário' },
    { value: 'collision_p1pf', label: 'Player 2 × Cenário' },
    { value: 'collision_blpf', label: 'Tiro × Cenário' },
    { value: 'collision_p0p1', label: 'Player 1 × Player 2' },
    { value: 'collision_blp0', label: 'Player 1 × Tiro' },
    { value: 'collision_blp1', label: 'Player 2 × Tiro' },
    { value: 'collision_m0enemy', label: 'Míssil 0 × Inimigos' },
    { value: 'collision_m0p0', label: 'Míssil 0 × P0' },
    { value: 'collision_m0p1', label: 'Míssil 0 × P1' },
  ];

  // Passos de regra (mesmo esquema do NES): SE… + DEFINIR/AÇÃO
  const STEP_TYPES = {
    if_event: { label: 'SE evento...' },
    if_var: { label: 'SE variável...' },
    if_hitbox: { label: 'SE hitbox... toca...' },
    if_screen: { label: 'SE carregar a tela...' },
    join: { label: 'COMPLEMENTO (e / ou)' },
    else: { label: 'SENÃO (else)' },
    set_var: { label: 'DEFINIR variável' },
    add_var: { label: 'SOMAR variável' },
    sub_var: { label: 'SUBTRAIR variável' },
    copy_var: { label: 'COPIAR variável' },
    action: { label: 'AÇÃO...' },
  };

  const JOIN_OPS = {
    and: { label: 'e (E — todas as condições)' },
    or: { label: 'ou (OU — qualquer condição)' },
  };

  const ACTION_CATALOG = {
    move_player: { label: 'Mover player' },
    spawn_player: { label: 'Spawnar player' },
    set_sprite: { label: 'Trocar gráfico do player' },
    play_sound: { label: 'Tocar som (TIA)' },
    stop_sound: { label: 'Parar canal de som' },
    goto_screen: { label: 'Ir para tela' },
    set_tia: { label: 'Escrever registrador TIA' },
    toggle_bool: { label: 'Inverter bool' },
    asm: { label: 'Bloco ASM livre' },
    custom: { label: 'Personalizada (livre)' },
    kill_hit_enemy: { label: 'Matar inimigo atingido (M0)' },
  };

  // Unidades de movimento (2600):
  //  X: color clocks da TIA (área útil ~160). No nosso kernel 1 passo X ≈ 1 unidade de delay grosso (~5 color clocks).
  //  Y: scanlines (1 = mínimo vertical).

  // Hitboxes / elementos TIA para “SE A toca B”
  function allHitboxRefs() {
    const refs = [
      { value: 'tia:P0', label: 'P0 (player 0)' },
      { value: 'tia:P1', label: 'P1 (player 1)' },
      { value: 'tia:M0', label: 'M0 (míssil 0)' },
      { value: 'tia:M1', label: 'M1 (míssil 1)' },
      { value: 'tia:BL', label: 'Ball' },
      { value: 'tia:PF', label: 'Playfield' },
      { value: 'native:out_of_bounds', label: '🚫 Out of bounds' },
    ];
    (Project.data?.gameObjects || []).forEach((o) => {
      if ((o.kind || 'spawn') === 'spawn') {
        refs.push({ value: 'spawn:' + o.id, label: '🎯 ' + (o.name || 'Spawn') });
      }
    });
    return refs;
  }

  // RAM 2600: $80–$FF = 128 bytes. Reservamos alguns pro runtime.
  const RAM_START = 0x80;
  const RAM_SIZE = 128;
  const RESERVED_RUNTIME = 16; // ponteiros, tmp, seed, etc.

  function ensureData() {
    if (!Project.data) Project.data = Project.defaultData();
    if (!Array.isArray(Project.data.variables)) Project.data.variables = [];
    if (typeof Project !== 'undefined' && Project.syncNativeVariables) {
      try { Project.syncNativeVariables(); } catch (e) {}
    }
    if (!Array.isArray(Project.data.rules)) Project.data.rules = [];
    Project.data.rules.forEach((r) => migrateRuleToSteps(r));
    sanitizeAllMoveRules();
    if (!Array.isArray(Project.data.ruleTabs) || !Project.data.ruleTabs.length) {
      Project.data.ruleTabs = [{ id: 'main', name: 'main' }];
    }
    if (!Array.isArray(Project.data.gameObjects)) Project.data.gameObjects = [];
    if (!Array.isArray(Project.data.sprites)) Project.data.sprites = [];
    if (!Array.isArray(Project.data.screens)) Project.data.screens = [];
    if (!Array.isArray(Project.data.events)) Project.data.events = [];
    if (!Project.data.programMeta) Project.data.programMeta = { notes: '' };
    seedBuiltinEvents();
    return Project.data;
  }

  function seedBuiltinEvents() {
    if (!Array.isArray(Project.data.events)) Project.data.events = [];
    // P0=Player1, P1=Player2, PF=Cenário, Ball=Tiro
    const builtins = [
      { id: 'ev_boot', name: 'Boot (início do cartucho)', category: 'system', builtin: true },
      { id: 'ev_vblank', name: 'Before Frame', category: 'system', builtin: true },
      { id: 'ev_overscan', name: 'After Frame', category: 'system', builtin: true },
      { id: 'ev_enter_screen', name: 'Ao entrar na tela', category: 'screen', builtin: true },
      { id: 'ev_col_p0pf', name: 'Player 1 × Cenário', category: 'collision', collision: 'p0pf', builtin: true },
      { id: 'ev_col_p1pf', name: 'Player 2 × Cenário', category: 'collision', collision: 'p1pf', builtin: true },
      { id: 'ev_col_blpf', name: 'Tiro × Cenário', category: 'collision', collision: 'blpf', builtin: true },
      { id: 'ev_col_p0p1', name: 'Player 1 × Player 2', category: 'collision', collision: 'p0p1', builtin: true },
      { id: 'ev_col_blp0', name: 'Player 1 × Tiro', category: 'collision', collision: 'blp0', builtin: true },
      { id: 'ev_col_blp1', name: 'Player 2 × Tiro', category: 'collision', collision: 'blp1', builtin: true },
      { id: 'ev_col_m0enemy', name: 'Míssil 0 × Inimigos', category: 'collision', collision: 'm0enemy', builtin: true },
      { id: 'ev_col_m0p0', name: 'Míssil 0 × P0 (fileira)', category: 'collision', collision: 'm0p0', builtin: true },
      { id: 'ev_col_m0p1', name: 'Míssil 0 × P1 (fileira)', category: 'collision', collision: 'm0p1', builtin: true },
    ];
    const byId = {};
    Project.data.events.forEach((e) => {
      if (e && e.id) byId[e.id] = e;
    });
    // atualiza nomes dos nativos existentes + adiciona faltantes
    for (const b of builtins) {
      if (byId[b.id]) {
        Object.assign(byId[b.id], b);
      } else {
        Project.data.events.push({ ...b });
      }
    }
    // remove nativos legados que não usamos mais (M0–P1 hardware cru)
    const keep = new Set(builtins.map((b) => b.id));
    Project.data.events = Project.data.events.filter((e) => {
      if (!e.builtin) return true;
      // mantém ev_col_m0*
      if (String(e.id || '').startsWith('ev_') && e.category === 'collision' && !keep.has(e.id)) {
        // só remove se for id nativo antigo conhecido
      }
      return true;
    });
    // ordena: system/timer/screen primeiro, depois colisões na ordem dos builtins
    const order = builtins.map((b) => b.id);
    Project.data.events.sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return 0;
    });
  }



  function sanitizeMoveStep(step) {
    if (!step || step.type !== 'action') return step;
    if ((step.actionId || '') !== 'move_player') return step;
    if (step.arg !== '0' && step.arg !== '1' && step.arg !== 0 && step.arg !== 1) {
      step.arg = '0';
    } else {
      step.arg = String(step.arg);
    }
    if (!['left', 'right', 'up', 'down'].includes(String(step.arg2 || ''))) {
      step.arg2 = 'left';
    }
    let d = parseInt(step.arg3, 10);
    if (!d || d < 1) d = 1;
    if (d > 8) d = 8;
    step.arg3 = d;
    return step;
  }

  function sanitizeAllMoveRules() {
    // NÃO chamar ensureData() aqui — evita recursão infinita
    const rules = (Project.data && Project.data.rules) || [];
    rules.forEach((r) => {
      if (!Array.isArray(r.steps)) return;
      r.steps.forEach((s) => sanitizeMoveStep(s));
    });
  }

  function migrateRuleToSteps(r) {
    if (!r) return;
    if (Array.isArray(r.steps) && r.steps.length) return;
    const steps = [];
    if (r.event) {
      const ev = (Project.data.events || []).find((e) => e.id === r.event || e.name === r.event || e.id === 'ev_' + r.event);
      steps.push({ type: 'if_event', eventId: ev ? ev.id : r.event });
    }
    (r.conditions || []).forEach((c) => {
      const v = (Project.data.variables || []).find((x) => x.name === c.left || x.id === c.left);
      steps.push({
        type: 'if_var',
        varId: v ? v.id : '',
        varName: c.left || '',
        op: c.op || '==',
        value: parseInt(c.right, 10) || 0,
      });
    });
    (r.actions || []).forEach((a) => {
      if (['set_var', 'add_var', 'sub_var'].includes(a.type)) {
        const v = (Project.data.variables || []).find((x) => x.name === a.arg || x.id === a.arg);
        steps.push({ type: a.type, varId: v ? v.id : '', value: parseInt(a.arg2, 10) || 0 });
      } else {
        steps.push({ type: 'action', actionId: a.type || 'custom', arg: a.arg || '', arg2: a.arg2 || '' });
      }
    });
    if (!steps.length) steps.push({ type: 'if_event', eventId: 'ev_vblank' });
    r.steps = steps;
  }


  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36);
  }

  function computeAllocation(vars) {
    let byte = RESERVED_RUNTIME;
    let bit = 0;
    let boolOpen = false;
    const list = [];
    for (const v of vars) {
      if (v.type === 'bool') {
        if (!boolOpen) {
          boolOpen = true;
          bit = 0;
        }
        list.push({
          ...v,
          address: RAM_START + byte,
          bitIndex: bit,
          sizeBytes: 0,
        });
        bit++;
        if (bit >= 8) {
          boolOpen = false;
          byte++;
        }
      } else {
        if (boolOpen) {
          boolOpen = false;
          byte++;
        }
        const size = v.type === 'word' ? 2 : 1;
        list.push({
          ...v,
          address: RAM_START + byte,
          bitIndex: null,
          sizeBytes: size,
        });
        byte += size;
      }
    }
    if (boolOpen) byte++;
    return {
      list,
      usedBytes: byte,
      freeBytes: Math.max(0, RAM_SIZE - byte),
      total: RAM_SIZE,
      reserved: RESERVED_RUNTIME,
    };
  }

  function buildHTML() {
    const root = document.getElementById('mod-program');
    if (!root) return;
    ensureData();
    root.innerHTML = `
      <div class="prog-wrap">
        <div class="prog-toolbar">
          <button type="button" class="prog-tab ${activeTab === 'vars' ? 'active' : ''}" data-tab="vars">📦 Variáveis</button>
          <button type="button" class="prog-tab ${activeTab === 'objects' ? 'active' : ''}" data-tab="objects">🎯 Objetos</button>
          <button type="button" class="prog-tab ${activeTab === 'events' ? 'active' : ''}" data-tab="events">⚡ Eventos</button>
          <button type="button" class="prog-tab ${activeTab === 'rules' ? 'active' : ''}" data-tab="rules">📜 Regras</button>
          <button type="button" class="prog-tab ${activeTab === 'kernel' ? 'active' : ''}" data-tab="kernel">⏱ Kernel / 6507</button>
          <span class="prog-hint">RAM $80–$FF · 128 bytes · TIA + RIOT</span>
        </div>
        <div class="prog-body" id="progTabContent"></div>
      </div>
    `;
    injectStyles();
    root.querySelectorAll('.prog-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        buildHTML();
      });
    });
    renderTab();
  }

  function renderTab() {
    const cont = document.getElementById('progTabContent');
    if (!cont) return;
    if (activeTab === 'vars') cont.innerHTML = renderVarsTab();
    else if (activeTab === 'objects') cont.innerHTML = renderObjectsTab();
    else if (activeTab === 'events') cont.innerHTML = renderEventsTab();
    else if (activeTab === 'rules') cont.innerHTML = renderRulesTab();
    else cont.innerHTML = renderKernelTab();
    bindTabEvents();
  }

  function renderVarsTab() {
    const d = ensureData();
    const alloc = computeAllocation(d.variables);
    // nativas primeiro
    const ordered = alloc.list.slice().sort((a, b) => {
      const an = a.native || a.builtin ? 0 : 1;
      const bn = b.native || b.builtin ? 0 : 1;
      return an - bn;
    });
    const rows = ordered
      .map((v) => {
        // computeAllocation clona objetos (...v) — indexOf falha; localizar por id/nome
        let idx = d.variables.findIndex(
          (x) => (v.id && x.id === v.id) || (v.name && x.name === v.name)
        );
        if (idx < 0) idx = 0;
        const isNative = !!(v.native || v.builtin);
        const addr =
          v.type === 'bool'
            ? `$${v.address.toString(16).toUpperCase().padStart(2, '0')} bit${v.bitIndex}`
            : `$${v.address.toString(16).toUpperCase().padStart(2, '0')}` +
              (v.sizeBytes === 2 ? ' (word)' : '');
        return `
        <tr data-idx="${idx}" class="${isNative ? 'prog-var-native' : ''}">
          <td>
            ${
              isNative
                ? `<span class="prog-native-tag">nativa</span> <code>${escapeHtml(v.name || '')}</code>`
                : `<input class="prog-inp" data-f="name" value="${escapeAttr(v.name || '')}" />`
            }
          </td>
          <td>
            ${
              isNative
                ? `<span class="muted">${escapeHtml(v.type || 'byte')}</span>`
                : `<select class="prog-inp" data-f="type">
              <option value="byte" ${v.type === 'byte' ? 'selected' : ''}>byte</option>
              <option value="word" ${v.type === 'word' ? 'selected' : ''}>word</option>
              <option value="bool" ${v.type === 'bool' ? 'selected' : ''}>bool</option>
            </select>`
            }
          </td>
          <td>
            <input class="prog-inp prog-val" data-f="value" type="number" min="0" max="255"
              value="${v.value != null ? (v.value | 0) : 0}"
              title="Valor no boot (0–255)" />
          </td>
          <td class="mono">${addr}</td>
          <td><input class="prog-inp" data-f="note" value="${escapeAttr(v.note || '')}" placeholder="nota" ${isNative ? 'readonly' : ''} /></td>
          <td>${
            isNative
              ? '<span class="muted" title="Variável nativa do setup">—</span>'
              : `<button type="button" class="prog-btn danger prog-del-var" data-idx="${idx}">🗑</button>`
          }</td>
        </tr>`;
      })
      .join('');

    const bar = Math.min(100, Math.round((alloc.usedBytes / alloc.total) * 100));
    const barColor = bar > 90 ? '#e74c3c' : bar > 70 ? '#f4a261' : '#27ae60';

    return `
      <div class="prog-panel">
        <div class="prog-panel-head">
          <div>
            <strong>Variáveis na RAM do RIOT</strong>
            <div class="muted">$80–$FF · nativas vêm do <b>Config</b> (placar, scroll, energia…) e não podem ser apagadas · livre: <b>${alloc.freeBytes}</b> / ${alloc.total}</div>
          </div>
          <button type="button" class="prog-btn" id="progAddVar">+ Variável</button>
        </div>
        <div class="prog-membar"><div style="width:${bar}%;background:${barColor}"></div></div>
        <table class="prog-table">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Valor init</th><th>Endereço</th><th>Nota</th><th></th></tr></thead>
          <tbody id="progVarBody">${rows || '<tr><td colspan="6" class="muted">Nenhuma variável</td></tr>'}</tbody>
        </table>
        <p class="muted" style="margin-top:10px">
          No 2600 quase tudo de estado do jogo precisa caber nesses 128 bytes.
          Prefira <b>bool</b> empacotado e <b>byte</b>; use word só se necessário.
        </p>
      </div>
    `;
  }


  function renderObjectsTab() {
    const d = ensureData();
    const objs = (d.gameObjects || []).filter((o) => (o.kind || 'spawn') === 'spawn');
    const screens = d.screens || [];
    const rows = objs
      .map((o) => {
        const sc = screens.find((s) => s.id === o.screenId);
        return (
          '<tr><td><b>' +
          escapeHtml(o.name || 'Spawn') +
          '</b></td><td>' +
          escapeHtml(sc ? sc.name : '—') +
          '</td><td class="mono">(' +
          (o.x | 0) +
          ',' +
          (o.y | 0) +
          ')</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="prog-panel">' +
      '<div class="prog-panel-head"><strong>Pontos de spawn</strong></div>' +
      '<p class="muted">Crie e posicione os spawns no módulo <b>Playfield</b> (ferramenta 🎯). ' +
      'Aqui só consultamos a lista. Nas <b>Regras</b>, use a ação <b>Spawnar player</b> escolhendo o ponto e o sprite.</p>' +
      '<table class="prog-table"><thead><tr><th>Nome</th><th>Tela</th><th>X,Y</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="3" class="muted">Nenhum spawn — abra Playfield e use 🎯</td></tr>') +
      '</tbody></table></div>'
    );
  }


  // ---------------- EVENTOS (análogo ao NES, adaptado 2600) ----------------
  const INPUT_BUTTONS = [
    'P1-UP', 'P1-DOWN', 'P1-LEFT', 'P1-RIGHT', 'P1-FIRE', 'P1-IDLE',
    'P2-UP', 'P2-DOWN', 'P2-LEFT', 'P2-RIGHT', 'P2-FIRE', 'P2-IDLE',
    'CONSOLE-RESET', 'CONSOLE-SELECT',
  ];

  function renderEventsTab() {
    const d = ensureData();
    const events = d.events || [];
    const rows = events
      .map((e) => {
        let detail = e.category || '';
        if (e.button) detail += ' (' + e.button + (e.trigger === 'hold' ? ' segurado' : '') + ')';
        if (e.category === 'collision' && e.collision) detail += ' [' + e.collision + ']';
        if (e.category === 'timer') {
          const fr = e.frames != null ? e.frames | 0 : (e.seconds | 0) * 60 || 1;
          detail += ' a cada ' + fr + ' frame' + (fr === 1 ? '' : 's');
        }
        return (
          '<tr style="border-bottom:1px solid #222">' +
          '<td style="padding:6px;color:#fff">' +
          escapeHtml(e.name) +
          '</td>' +
          '<td style="padding:6px;color:#888">' +
          escapeHtml(detail) +
          '</td>' +
          '<td style="padding:6px">' +
          (e.builtin
            ? '<span style="color:#4ec9b0;font-size:10px">nativo</span>'
            : '<span style="color:#ffcc00;font-size:10px">customizado</span>') +
          '</td>' +
          '<td style="padding:6px;text-align:right">' +
          '<button type="button" class="prog-btn danger" data-del-ev="' +
          escapeAttr(e.id) +
          '" style="font-size:10px">🗑</button></td></tr>'
        );
      })
      .join('');
    return `
      <div class="prog-panel" style="max-width:780px">
        <div class="prog-panel-head">
          <div>
            <strong>Eventos do jogo</strong>
            <div class="muted">Nativos do 2600 + customizados (input, colisão, timer). Use-os nas <b>Regras</b>.</div>
          </div>
        </div>
        <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;margin-bottom:12px">
          <h4 style="font-size:11px;color:#4ec9b0;margin:0 0 8px">NOVO EVENTO CUSTOMIZADO</h4>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input id="evName" class="prog-inp" type="text" placeholder="nome_do_evento" style="flex:1;min-width:140px" />
            <select id="evCategory" class="prog-inp">
              <option value="input">input (joystick)</option>
              <option value="collision">collision</option>
              <option value="timer">timer</option>
            </select>
            <select id="evButton" class="prog-inp">
              ${INPUT_BUTTONS.map((b) => `<option value="${b}">${b}</option>`).join('')}
            </select>
            <select id="evTrigger" class="prog-inp" title="Toque = borda; Segurado = todo frame">
              <option value="press">toque</option>
              <option value="hold">segurado</option>
            </select>
            <select id="evCollision" class="prog-inp" style="display:none">
              <option value="p0pf">Player 1 × Cenário</option>
              <option value="p1pf">Player 2 × Cenário</option>
              <option value="blpf">Tiro × Cenário</option>
              <option value="p0p1">Player 1 × Player 2</option>
              <option value="blp0">Player 1 × Tiro</option>
              <option value="blp1">Player 2 × Tiro</option>
            </select>
            <label id="evSecondsWrap" class="muted" style="display:none;align-items:center;gap:4px;font-size:11px">
              a cada
              <input id="evSeconds" class="prog-inp" type="number" min="1" max="255" value="1" style="width:64px" title="Frames entre disparos (1 = todo frame)" />
              frame(s)
            </label>
            <button type="button" class="prog-btn" id="evAddBtn" style="background:#27ae60;color:#fff">+ Adicionar</button>
          </div>
          <p class="muted" style="margin:8px 0 0">
            Input: joystick/botão. Colisões: TIA.
            Timer: a cada N <b>frames</b> (mín. 1). NTSC ≈ 60 frames/s — para 1 segundo use <b>60</b>. Reinicia ao zerar.
          </p>
        </div>
        <table class="prog-table">
          <thead><tr><th>Nome</th><th>Detalhe</th><th>Tipo</th><th></th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="muted">Nenhum evento</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  function onEvCategoryChange() {
    const cat = document.getElementById('evCategory')?.value;
    const btn = document.getElementById('evButton');
    const trg = document.getElementById('evTrigger');
    const col = document.getElementById('evCollision');
    const sec = document.getElementById('evSecondsWrap');
    if (!btn || !trg || !col) return;
    const isInput = cat === 'input';
    const isCol = cat === 'collision';
    const isTmr = cat === 'timer';
    btn.style.display = isInput ? '' : 'none';
    trg.style.display = isInput ? '' : 'none';
    col.style.display = isCol ? '' : 'none';
    if (sec) sec.style.display = isTmr ? 'inline-flex' : 'none';
  }

  function addEvent() {
    const d = ensureData();
    const nameEl = document.getElementById('evName');
    const catEl = document.getElementById('evCategory');
    const btnEl = document.getElementById('evButton');
    const trgEl = document.getElementById('evTrigger');
    const colEl = document.getElementById('evCollision');
    const name = (nameEl?.value || '').trim();
    if (!name) {
      alert('Informe um nome para o evento.');
      return;
    }
    const cat = catEl?.value || 'custom';
    const ev = {
      id: uid('ev'),
      name,
      category: cat,
      builtin: false,
    };
    if (cat === 'input') {
      ev.button = btnEl?.value || 'P1-FIRE';
      ev.trigger = trgEl?.value || 'press';
    }
    if (cat === 'collision') {
      ev.collision = colEl?.value || 'p0pf';
    }
    if (cat === 'timer') {
      let fr = parseInt(document.getElementById('evSeconds')?.value, 10);
      if (isNaN(fr) || fr < 1) fr = 1;
      if (fr > 255) fr = 255;
      ev.frames = fr;
      // legado: seconds mantido só se alguém ainda ler; 1s ≈ 60 frames
      ev.seconds = Math.max(1, Math.round(fr / 60));
    }
    d.events.push(ev);
    dirty();
    renderTab();
  }

  function deleteEvent(id) {
    const d = ensureData();
    const ev = d.events.find((e) => e.id === id);
    if (!ev) return;
    const msg = ev.builtin
      ? `"${ev.name}" é um evento nativo. Remover mesmo assim? Regras que o usam ficam quebradas.`
      : `Remover o evento "${ev.name}"? Regras que o usam ficam com referência quebrada.`;
    if (!confirm(msg)) return;
    d.events = d.events.filter((e) => e.id !== id);
    dirty();
    renderTab();
  }

  function renderRulesTab() {
    const d = ensureData();
    if (!d.ruleTabs.some((t) => t.id === activeRuleTabId)) {
      activeRuleTabId = d.ruleTabs[0].id;
    }

    const tabsHtml = d.ruleTabs
      .map(
        (t) => `
      <button type="button" class="rule-tab ${t.id === activeRuleTabId ? 'active' : ''}" data-tid="${t.id}">
        ${escapeHtml(t.name)}
      </button>`
      )
      .join('');

    const rules = d.rules.filter((r) => (r.tabId || 'main') === activeRuleTabId);
    const rulesHtml = rules
      .map((r) => {
        const steps = r.steps || [];
        const summary = steps
          .map((s) => {
            if (s.type === 'if_event') {
              const ev = (d.events || []).find((e) => e.id === s.eventId);
              return 'SE ' + (ev ? ev.name : s.eventId || 'evento');
            }
            if (s.type === 'if_var') return 'SE var ' + (s.op || '==');
            if (s.type === 'if_hitbox') return 'SE hitbox toca';
            if (s.type === 'if_screen') return 'SE tela';
            if (s.type === 'copy_var') {
              const vf = (d.variables || []).find((v) => v.id === s.varIdFrom);
              const vt = (d.variables || []).find((v) => v.id === s.varIdTo);
              return 'COPIAR ' + (vf ? vf.name : '?') + ' → ' + (vt ? vt.name : '?');
            }
            if (s.type === 'join') {
              const op = s.op || 'and';
              return op === 'or' ? 'OU' : 'E';
            }
            if (s.type === 'else') return 'SENÃO';
            if (s.type === 'action') return 'AÇÃO ' + (s.actionId || '');
            return (STEP_TYPES[s.type] || {}).label || s.type;
          })
          .join(' · ');
        return `
        <div class="rule-card ${selectedRuleId === r.id ? 'sel' : ''}" data-rid="${r.id}">
          <div class="rule-card-top">
            <strong>${escapeHtml(r.name || 'Regra')}</strong>
            <span class="pill">${steps.length} passo(s)</span>
            <button type="button" class="prog-btn danger rule-del" data-rid="${r.id}">🗑</button>
          </div>
          <div class="muted">${escapeHtml(summary || 'sem passos')}</div>
        </div>`;
      })
      .join('');

    const sel = d.rules.find((r) => r.id === selectedRuleId);
    const editor = sel ? renderRuleEditor(sel) : '<div class="muted">Selecione ou crie uma regra.</div>';

    return `
      <div class="prog-rules-layout">
        <div class="prog-rules-list">
          <div class="rule-tabs">
            ${tabsHtml}
            <button type="button" class="rule-tab add" id="progAddRuleTab">+</button>
          </div>
          <div class="rule-list-actions">
            <button type="button" class="prog-btn" id="progAddRule">+ Regra</button>
          </div>
          <div class="rule-list">${rulesHtml || '<div class="muted">Nenhuma regra nesta aba</div>'}</div>
        </div>
        <div class="prog-rules-edit" id="progRuleEdit">${editor}</div>
      </div>
    `;
  }

  function renderRuleEditor(r) {
    const d = ensureData();
    migrateRuleToSteps(r);
    const vars = d.variables || [];
    const events = d.events || [];
    const stepsHtml = (r.steps || [])
      .map((s, i) => renderStepRow(r, s, i, vars, events))
      .join('');
    return `
      <div class="prog-panel">
        <div class="prog-panel-head">
          <input class="prog-inp" id="ruleName" value="${escapeAttr(r.name || '')}" style="font-weight:700;min-width:180px" />
          <span class="muted">Passos em sequência (SE… / DEFINIR / AÇÃO)</span>
        </div>
        <div class="step-list">${stepsHtml || '<div class="muted">Nenhum passo ainda.</div>'}</div>
        <button type="button" class="prog-btn" id="ruleAddStep" style="margin-top:10px;background:#2980b9;color:#fff">+ Passo</button>
        <p class="muted" style="margin-top:10px">
          Use <b>SE evento</b> (Before Frame, input, colisão…), <b>SE variável</b>, <b>SE hitbox toca</b> e depois
          <b>DEFINIR/SOMAR</b> ou <b>AÇÃO</b>. Mesmo esquema do NES, com elementos TIA do 2600.
        </p>
      </div>
    `;
  }

  function renderStepRow(rule, step, idx, vars, events) {
    const typeOptions = Object.entries(STEP_TYPES)
      .map(([k, v]) => `<option value="${k}" ${step.type === k ? 'selected' : ''}>${v.label}</option>`)
      .join('');
    let fields = '';
    const sel = 'class="prog-inp step-field"';

    if (step.type === 'if_event') {
      fields = `<select ${sel} data-f="eventId">
        <option value="">— evento —</option>
        ${events
          .map(
            (e) =>
              `<option value="${escapeAttr(e.id)}" ${step.eventId === e.id ? 'selected' : ''}>${escapeHtml(e.name)}</option>`
          )
          .join('')}
      </select>`;
    } else if (step.type === 'if_var') {
      fields = `<select ${sel} data-f="varId">
        <option value="">— variável —</option>
        ${vars
          .map(
            (v) =>
              `<option value="${escapeAttr(v.id)}" ${step.varId === v.id ? 'selected' : ''}>${escapeHtml(v.name)}</option>`
          )
          .join('')}
      </select>
      <select ${sel} data-f="op">
        ${OPS.map((o) => `<option value="${o}" ${step.op === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
      <input type="number" ${sel} data-f="value" value="${step.value ?? 0}" style="width:70px" />`;
    } else if (step.type === 'if_hitbox') {
      const refs = allHitboxRefs();
      const opts = (selV) =>
        `<option value="">— elemento —</option>` +
        refs
          .map((r) => `<option value="${escapeAttr(r.value)}" ${selV === r.value ? 'selected' : ''}>${escapeHtml(r.label)}</option>`)
          .join('');
      fields = `<select ${sel} data-f="hitboxA">${opts(step.hitboxA)}</select>
        <span class="muted">toca</span>
        <select ${sel} data-f="hitboxB">${opts(step.hitboxB)}</select>`;
    } else if (step.type === 'if_screen') {
      const screens = dScreens();
      fields = `<select ${sel} data-f="screenId">
        <option value="">— tela —</option>
        ${screens
          .map(
            (s) =>
              `<option value="${escapeAttr(s.id)}" ${step.screenId === s.id ? 'selected' : ''}>${escapeHtml(s.name || s.id)}</option>`
          )
          .join('')}
      </select>`;
    } else if (step.type === 'set_var' || step.type === 'add_var' || step.type === 'sub_var') {
      fields = `<select ${sel} data-f="varId">
        <option value="">— variável —</option>
        ${vars
          .map(
            (v) =>
              `<option value="${escapeAttr(v.id)}" ${step.varId === v.id ? 'selected' : ''}>${escapeHtml(v.name)}</option>`
          )
          .join('')}
      </select>
      <input type="number" ${sel} data-f="value" value="${step.value ?? 0}" style="width:70px" />`;
    } else if (step.type === 'copy_var') {
      const varOpts = (selId) =>
        `<option value="">— variável —</option>` +
        vars
          .map(
            (v) =>
              `<option value="${escapeAttr(v.id)}" ${selId === v.id ? 'selected' : ''}>${escapeHtml(v.name)}</option>`
          )
          .join('');
      fields = `<span class="muted">copiar de</span>
        <select ${sel} data-f="varIdFrom">${varOpts(step.varIdFrom)}</select>
        <span class="muted">para</span>
        <select ${sel} data-f="varIdTo">${varOpts(step.varIdTo)}</select>`;
    } else if (step.type === 'join') {
      if (!step.op) step.op = 'and';
      const jopts = Object.entries(JOIN_OPS)
        .map(
          ([k, v]) =>
            `<option value="${k}" ${step.op === k ? 'selected' : ''}>${v.label}</option>`
        )
        .join('');
      fields = `<select ${sel} data-f="op">${jopts}</select>
        <span class="muted" style="font-size:10px">E entre SEs = um teste só (SENÃO se algum falhar) · sem E = SENÃO só no último SE</span>`;
    } else if (step.type === 'else') {
      fields = `<span class="muted">se as condições acima falharem, executa os passos seguintes</span>`;
    } else if (step.type === 'action') {
      const actOpts = Object.entries(ACTION_CATALOG)
        .map(
          ([k, v]) =>
            `<option value="${k}" ${step.actionId === k ? 'selected' : ''}>${v.label}</option>`
        )
        .join('');
      fields = `<select ${sel} data-f="actionId">${actOpts}</select>`;
      const aid = step.actionId || 'custom';
      if (aid === 'move_player') {
        sanitizeMoveStep(step);
        const dirs = [
          ['left', '← Esquerda'],
          ['right', '→ Direita'],
          ['up', '↑ Cima'],
          ['down', '↓ Baixo'],
        ];
        fields += `<select ${sel} data-f="arg" title="Player">
          <option value="0" ${String(step.arg) === '0' ? 'selected' : ''}>Player 1 (P0)</option>
          <option value="1" ${String(step.arg) === '1' ? 'selected' : ''}>Player 2 (P1)</option>
        </select>
        <select ${sel} data-f="arg2" title="Direção">
          ${dirs
            .map(
              ([v, lab]) =>
                `<option value="${v}" ${step.arg2 === v ? 'selected' : ''}>${lab}</option>`
            )
            .join('')}
        </select>
        <input type="number" ${sel} data-f="arg3" min="1" max="80" value="${step.arg3 ?? 1}"
          title="Distância: X em passos horizontais (~5 color clocks); Y em scanlines" style="width:64px" />
        <span class="muted" title="X≈color clocks/5 · Y=scanlines">passos</span>`;
      } else if (aid === 'spawn_player' || aid === 'set_sprite') {
        const sprites = (Project.data.sprites || []);
        const spawns = (Project.data.gameObjects || []).filter((o) => (o.kind || 'spawn') === 'spawn');
        fields += `<select ${sel} data-f="arg" title="Sprite">
          <option value="">— sprite —</option>
          ${sprites
            .map(
              (s) =>
                `<option value="${escapeAttr(s.id)}" ${step.arg === s.id ? 'selected' : ''}>${escapeHtml(s.name || s.id)}</option>`
            )
            .join('')}
        </select>`;
        if (aid === 'spawn_player') {
          fields += `<select ${sel} data-f="arg2" title="Ponto de spawn">
            <option value="">— spawn —</option>
            ${spawns
              .map(
                (s) =>
                  `<option value="${escapeAttr(s.id)}" ${step.arg2 === s.id ? 'selected' : ''}>${escapeHtml(s.name || s.id)}</option>`
              )
              .join('')}
          </select>`;
        }
      } else if (aid === 'goto_screen') {
        const screens = dScreens();
        fields += `<select ${sel} data-f="arg">
          <option value="">— tela —</option>
          ${screens
            .map(
              (s) =>
                `<option value="${escapeAttr(s.id)}" ${step.arg === s.id ? 'selected' : ''}>${escapeHtml(s.name || s.id)}</option>`
            )
            .join('')}
        </select>`;
      } else if (aid === 'play_sound' || aid === 'stop_sound') {
        fields += `<input ${sel} data-f="arg" placeholder="canal 0/1 ou id" value="${escapeAttr(step.arg || '')}" style="width:100px" />`;
      } else if (aid === 'set_tia') {
        fields += `<input ${sel} data-f="arg" placeholder="reg (ex: COLUP0)" value="${escapeAttr(step.arg || '')}" style="width:100px" />
          <input ${sel} data-f="arg2" placeholder="valor" value="${escapeAttr(step.arg2 || '')}" style="width:70px" />`;
      } else if (aid === 'asm' || aid === 'custom') {
        fields += `<input ${sel} data-f="arg" placeholder="nome / snippet" value="${escapeAttr(step.arg || '')}" style="min-width:120px" />`;
      }
    }

    return `
      <div class="step-row" data-i="${idx}">
        <select class="prog-inp step-type" data-i="${idx}">${typeOptions}</select>
        ${fields}
        <div class="step-ops">
          <button type="button" class="prog-btn step-up" data-i="${idx}" title="Subir">↑</button>
          <button type="button" class="prog-btn step-dn" data-i="${idx}" title="Descer">↓</button>
          <button type="button" class="prog-btn danger step-del" data-i="${idx}">×</button>
        </div>
      </div>`;
  }

  function dScreens() {
    const d = Project.data || {};
    if (Array.isArray(d.screens) && d.screens.length) return d.screens;
    if (Array.isArray(d.playfields) && d.playfields.length) {
      return d.playfields.map((p, i) => ({ id: p.id || 'pf_' + i, name: p.name || 'Tela ' + (i + 1) }));
    }
    return [];
  }

  function renderKernelTab() {
    const d = ensureData();
    const notes = d.programMeta.notes || '';
    return `
      <div class="prog-panel">
        <strong>Modelo mental do 6507 / 2600</strong>
        <ul class="prog-ul">
          <li><b>Scanline a scanline:</b> o kernel desenha PF/players enquanto a TV varre a linha.</li>
          <li><b>Before Frame / After Frame:</b> tempo entre kernels (CPU livre para regras).</li>
          <li><b>RAM 128 bytes</b> ($80–$FF): estado do jogo, posições, flags.</li>
          <li><b>ROM</b> no cartucho (2K–32K com bankswitch F8/F6/F4): código + dados.</li>
          <li><b>TIA:</b> gráficos e som por registradores; colisões lidas em bits de colisão.</li>
        </ul>
        <p class="muted">
          Diferente do NES, não há PPU com nametable. “Programar” aqui é combinar
          regras de alto nível (que viram ASM no build) com o timing do kernel.
        </p>
        <h4>Notas do projeto</h4>
        <textarea class="prog-asm" id="progNotes" rows="8" placeholder="Anotações de design / labels / TODOs...">${escapeHtml(
          notes
        )}</textarea>
      </div>
    `;
  }

  function drawObjPreview(o) {
    const canvas = document.getElementById('objPreview');
    if (!canvas || !o) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x < W; x += 10) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 10) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    const px = ((o.x | 0) / 160) * W;
    const py = ((o.y | 0) / 192) * H;
    ctx.fillStyle = (o.player | 0) === 1 ? '#58d68d' : '#5dade2';
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff8';
    ctx.stroke();
    ctx.fillStyle = '#f4a261';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('P' + (o.player | 0) + ' ' + (o.x | 0) + ',' + (o.y | 0), 6, 12);
  }

  function bindTabEvents() {
    const d = ensureData();

    // --- Eventos ---
    document.getElementById('evCategory')?.addEventListener('change', () => onEvCategoryChange());
    onEvCategoryChange();
    document.getElementById('evAddBtn')?.addEventListener('click', () => addEvent());
    document.querySelectorAll('[data-del-ev]').forEach((btn) => {
      btn.addEventListener('click', () => deleteEvent(btn.getAttribute('data-del-ev')));
    });

    document.getElementById('progAddSpawn')?.addEventListener('click', () => {
      const d0 = ensureData();
      const screenId = (d0.screens[0] && d0.screens[0].id) || '';
      const spr = (d0.sprites || []).find((s) => (s.player | 0) === 0) || (d0.sprites || [])[0];
      const o = {
        id: uid('spawn'),
        name: 'Spawn ' + (d0.gameObjects.length + 1),
        kind: 'spawn',
        screenId,
        x: 80,
        y: 80,
        player: spr ? spr.player | 0 : 0,
        spriteId: spr ? spr.id : '',
      };
      d0.gameObjects.push(o);
      selectedObjectId = o.id;
      dirty();
      renderTab();
    });
    document.querySelectorAll('.rule-card[data-oid]').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.obj-del')) return;
        selectedObjectId = card.getAttribute('data-oid');
        renderTab();
      });
    });
    document.querySelectorAll('.obj-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-oid');
        if (!confirm('Excluir spawn?')) return;
        d.gameObjects = d.gameObjects.filter((o) => o.id !== id);
        if (selectedObjectId === id) selectedObjectId = null;
        dirty();
        renderTab();
      });
    });
    const curObj = (d.gameObjects || []).find((o) => o.id === selectedObjectId);
    if (curObj) {
      document.getElementById('objName')?.addEventListener('input', (e) => { curObj.name = e.target.value; dirty(); });
      document.getElementById('objScreen')?.addEventListener('change', (e) => { curObj.screenId = e.target.value; dirty(); drawObjPreview(curObj); });
      document.getElementById('objPlayer')?.addEventListener('change', (e) => { curObj.player = parseInt(e.target.value, 10) || 0; dirty(); drawObjPreview(curObj); });
      document.getElementById('objSprite')?.addEventListener('change', (e) => { curObj.spriteId = e.target.value; dirty(); });
      document.getElementById('objX')?.addEventListener('change', (e) => {
        curObj.x = Math.max(0, Math.min(160, parseInt(e.target.value, 10) || 0));
        e.target.value = curObj.x; dirty(); drawObjPreview(curObj);
      });
      document.getElementById('objY')?.addEventListener('change', (e) => {
        curObj.y = Math.max(0, Math.min(192, parseInt(e.target.value, 10) || 0));
        e.target.value = curObj.y; dirty(); drawObjPreview(curObj);
      });
      const canvas = document.getElementById('objPreview');
      if (canvas) {
        drawObjPreview(curObj);
        canvas.addEventListener('click', (ev) => {
          const r = canvas.getBoundingClientRect();
          const px = (ev.clientX - r.left) / r.width;
          const py = (ev.clientY - r.top) / r.height;
          curObj.x = Math.max(0, Math.min(160, Math.round(px * 160)));
          curObj.y = Math.max(0, Math.min(192, Math.round(py * 192)));
          const xEl = document.getElementById('objX');
          const yEl = document.getElementById('objY');
          if (xEl) xEl.value = curObj.x;
          if (yEl) yEl.value = curObj.y;
          dirty();
          drawObjPreview(curObj);
        });
      }
    }


    // vars
    document.getElementById('progAddVar')?.addEventListener('click', () => {
      d.variables.push({
        id: uid('var'),
        name: 'var' + (d.variables.length + 1),
        type: 'byte',
        note: '',
      });
      dirty();
      renderTab();
    });
    document.querySelectorAll('#progVarBody tr[data-idx]').forEach((tr) => {
      const idx = parseInt(tr.getAttribute('data-idx'), 10);
      const applyField = (el) => {
        if (idx < 0 || !d.variables[idx]) return;
        const v = d.variables[idx];
        const f0 = el.getAttribute('data-f');
        if (v && (v.native || v.builtin) && f0 !== 'value') {
          return;
        }
        if (f0 === 'value') {
          let n = parseInt(el.value, 10);
          if (isNaN(n)) n = 0;
          n = Math.max(0, Math.min(255, n));
          el.value = n;
          d.variables[idx].value = n;
        } else {
          d.variables[idx][f0] = el.value;
        }
        dirty();
        if (f0 === 'type') renderTab();
      };
      tr.querySelectorAll('[data-f]').forEach((el) => {
        el.addEventListener('change', () => applyField(el));
        if (el.getAttribute('data-f') === 'value') {
          el.addEventListener('input', () => applyField(el));
        }
      });
    });
    document.querySelectorAll('.prog-del-var').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const v = d.variables[idx];
        if (v && (v.native || v.builtin)) {
          alert('Variável nativa do setup — não pode ser apagada.');
          return;
        }
        d.variables.splice(idx, 1);
        dirty();
        renderTab();
      });
    });
    // bloqueia rename de nativas
    document.querySelectorAll('#progVarBody tr.prog-var-native [data-f]').forEach((el) => {
      el.addEventListener('change', (e) => {
        e.stopPropagation();
      });
    });

    // rules tabs
    document.querySelectorAll('.rule-tab[data-tid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeRuleTabId = btn.getAttribute('data-tid');
        selectedRuleId = null;
        renderTab();
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const tid = btn.getAttribute('data-tid');
        const tab = d.ruleTabs.find((t) => t.id === tid);
        if (!tab) return;
        const name = prompt('Renomear aba:', tab.name);
        if (name === null) return;
        tab.name = name.trim() || tab.name;
        dirty();
        renderTab();
      });
    });
    document.getElementById('progAddRuleTab')?.addEventListener('click', () => {
      const name = prompt('Nome da nova aba de regras:', 'aba' + (d.ruleTabs.length + 1));
      if (name === null) return;
      const tab = { id: uid('rtab'), name: (name || 'aba').trim() };
      d.ruleTabs.push(tab);
      activeRuleTabId = tab.id;
      dirty();
      renderTab();
    });

    document.getElementById('progAddRule')?.addEventListener('click', () => {
      const r = {
        id: uid('rule'),
        tabId: activeRuleTabId,
        name: 'Regra ' + (d.rules.length + 1),
        steps: [{ type: 'if_event', eventId: 'ev_vblank' }],
      };
      d.rules.push(r);
      selectedRuleId = r.id;
      dirty();
      renderTab();
    });

    document.querySelectorAll('.rule-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.rule-del')) return;
        selectedRuleId = card.getAttribute('data-rid');
        renderTab();
      });
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const rid = card.getAttribute('data-rid');
        const rule = d.rules.find((x) => x.id === rid);
        if (!rule) return;
        const opts = d.ruleTabs.map((t, i) => `${i + 1}-${t.name}`).join(', ');
        const ans = prompt('Mover regra para aba (número):\n' + opts, '1');
        if (ans === null) return;
        const n = parseInt(ans, 10);
        if (!n || n < 1 || n > d.ruleTabs.length) return;
        rule.tabId = d.ruleTabs[n - 1].id;
        dirty();
        renderTab();
      });
    });
    document.querySelectorAll('.rule-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rid = btn.getAttribute('data-rid');
        if (!confirm('Excluir regra?')) return;
        d.rules = d.rules.filter((r) => r.id !== rid);
        if (selectedRuleId === rid) selectedRuleId = null;
        dirty();
        renderTab();
      });
    });

    // rule editor (passos estilo NES)
    const rule = d.rules.find((r) => r.id === selectedRuleId);
    if (rule) {
      migrateRuleToSteps(rule);
      document.getElementById('ruleName')?.addEventListener('input', (e) => {
        rule.name = e.target.value;
        dirty();
      });
      document.getElementById('ruleAddStep')?.addEventListener('click', () => {
        if (!rule.steps) rule.steps = [];
        rule.steps.push({ type: 'if_event', eventId: 'ev_vblank' });
        dirty();
        renderTab();
      });
      document.querySelectorAll('.step-type').forEach((sel) => {
        sel.addEventListener('change', (e) => {
          const i = parseInt(sel.getAttribute('data-i'), 10);
          rule.steps[i] = { type: e.target.value };
          if (e.target.value === 'if_event') rule.steps[i].eventId = 'ev_vblank';
          if (e.target.value === 'join') rule.steps[i].op = 'and';
          if (e.target.value === 'if_var') {
            rule.steps[i].op = '==';
            rule.steps[i].value = 0;
          }
          if (e.target.value === 'action') {
            rule.steps[i].actionId = 'move_player';
            rule.steps[i].arg = '0';
            rule.steps[i].arg2 = 'right';
            rule.steps[i].arg3 = 1;
          }
          dirty();
          renderTab();
        });
      });
      document.querySelectorAll('.step-row').forEach((row) => {
        const i = parseInt(row.getAttribute('data-i'), 10);
        row.querySelectorAll('.step-field').forEach((el) => {
          const f = el.getAttribute('data-f');
          const handler = () => {
            let val = el.value;
            if (f === 'value' || f === 'arg3') val = parseInt(val, 10) || 0;
            rule.steps[i][f] = val;
            if (rule.steps[i].type === 'action' && (rule.steps[i].actionId === 'move_player' || f === 'actionId')) {
              if (f === 'actionId' && val === 'move_player') {
                rule.steps[i].actionId = 'move_player';
              }
              sanitizeMoveStep(rule.steps[i]);
            }
            dirty();
            if (f === 'actionId') {
              if (val === 'move_player') {
                if (rule.steps[i].arg === undefined || rule.steps[i].arg === '' || String(rule.steps[i].arg).startsWith('spr_'))
                  rule.steps[i].arg = '0';
                if (!rule.steps[i].arg2) rule.steps[i].arg2 = 'right';
                if (!rule.steps[i].arg3) rule.steps[i].arg3 = 1;
              }
              renderTab();
            }
          };
          el.addEventListener('change', handler);
        });
      });
      document.querySelectorAll('.step-del').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.getAttribute('data-i'), 10);
          rule.steps.splice(i, 1);
          dirty();
          renderTab();
        });
      });
      document.querySelectorAll('.step-up').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.getAttribute('data-i'), 10);
          if (i <= 0) return;
          const tmp = rule.steps[i - 1];
          rule.steps[i - 1] = rule.steps[i];
          rule.steps[i] = tmp;
          dirty();
          renderTab();
        });
      });
      document.querySelectorAll('.step-dn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.getAttribute('data-i'), 10);
          if (i >= rule.steps.length - 1) return;
          const tmp = rule.steps[i + 1];
          rule.steps[i + 1] = rule.steps[i];
          rule.steps[i] = tmp;
          dirty();
          renderTab();
        });
      });
    }
  }

  function dirty() {
    if (typeof Project.status === 'function') Project.status('programa alterado — salve o projeto');
  }

  function injectStyles() {
    if (document.getElementById('prog-styles')) return;
    const s = document.createElement('style');
    s.id = 'prog-styles';
    s.textContent = `
      .prog-wrap { display:flex; flex-direction:column; height:100%; background:#1e1e1e; }
      .prog-toolbar {
        display:flex; gap:8px; align-items:center; flex-wrap:wrap;
        padding:8px 12px; background:#252526; border-bottom:1px solid #333;
      }
      .prog-tab {
        background:#2a2a2a; border:1px solid #444; color:#ccc; border-radius:6px;
        padding:6px 12px; cursor:pointer; font-size:12px;
      }
      .prog-tab.active { background:#f4a261; color:#111; border-color:#f4a261; font-weight:700; }
      .prog-hint { margin-left:auto; font-size:11px; color:#666; }
      .prog-body { flex:1; overflow:auto; padding:14px; }
      .prog-panel {
        background:linear-gradient(180deg,#1e222c,#161920); border:1px solid #333;
        border-radius:10px; padding:14px;
      }
      .prog-panel-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
      .prog-btn {
        background:#2a2a2a; border:1px solid #444; color:#ccc; border-radius:6px;
        padding:5px 10px; cursor:pointer; font-size:12px;
      }
      .prog-btn:hover { border-color:#f4a261; }
      .prog-btn.danger { background:#3a1a1a; border-color:#5a2a2a; color:#e88; }
      .prog-inp {
        background:#111; color:#eee; border:1px solid #444; border-radius:5px;
        padding:4px 6px; font-size:12px;
      }
      .prog-table { width:100%; border-collapse:collapse; font-size:12px; }
      .prog-table th { text-align:left; color:#888; padding:6px; border-bottom:1px solid #333; }
      .prog-table td { padding:6px; border-bottom:1px solid #2a2a2a; }
      .prog-table .mono { font-family:ui-monospace,monospace; color:#8dcea0; }
      .prog-membar { height:8px; background:#111; border-radius:4px; overflow:hidden; margin-bottom:12px; }
      .prog-membar > div { height:100%; border-radius:4px; }
      .muted { color:#777; font-size:12px; }
      .prog-ul { color:#aaa; font-size:13px; line-height:1.55; }
      .prog-ul b { color:#ddd; }
      .prog-asm {
        width:100%; background:#0d0d0d; color:#cde; border:1px solid #333; border-radius:6px;
        padding:8px; font-family:ui-monospace,monospace; font-size:12px; resize:vertical; box-sizing:border-box;
      }
      .prog-rules-layout { display:flex; gap:12px; min-height:100%; align-items:stretch; }
      .prog-rules-list { width:280px; flex-shrink:0; display:flex; flex-direction:column; gap:8px; }
      .prog-rules-edit { flex:1; min-width:0; }
      .rule-tabs { display:flex; flex-wrap:wrap; gap:4px; }
      .rule-tab {
        background:#2a2a2a; border:1px solid #444; color:#ccc; border-radius:6px 6px 0 0;
        padding:5px 10px; cursor:pointer; font-size:11px;
      }
      .rule-tab.active { background:#1e222c; border-bottom-color:#1e222c; color:#f4a261; }
      .rule-tab.add { font-weight:700; color:#8dcea0; }
      .rule-list { display:flex; flex-direction:column; gap:6px; max-height:60vh; overflow:auto; }
      .rule-card {
        background:#14171e; border:1px solid #2a2e38; border-radius:8px; padding:8px 10px; cursor:pointer;
      }
      .rule-card:hover { border-color:#444; }
      .rule-card.sel { border-color:#f4a26166; background:#1c1812; }
      .rule-card-top { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
      .rule-card-top strong { flex:1; color:#eee; font-size:12px; }
      .pill { font-size:10px; background:#2a2a2a; color:#f4a261; padding:2px 6px; border-radius:99px; }
      .cond-row, .act-row, .step-row { display:flex; gap:6px; margin-bottom:6px; flex-wrap:wrap; align-items:center; }
      .step-list { display:flex; flex-direction:column; gap:6px; }
      .step-ops { margin-left:auto; display:flex; gap:2px; }
      h4 { color:#f4a261; font-size:12px; margin:12px 0 8px; }
      .obj-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
      .obj-grid label { display:flex; flex-direction:column; gap:4px; font-size:11px; color:#888; }
      .obj-preview-wrap { margin-top:8px; }
      #objPreview { background:#000; border:1px solid #333; border-radius:6px; cursor:crosshair; image-rendering:pixelated; width:100%; max-width:320px; height:auto; }
    `;
    document.head.appendChild(s);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function flush() {
    ensureData();
  }

  function init() {
    buildHTML();
  }

  return { init, flush };
})();

window.PROGRAM = PROGRAM;
