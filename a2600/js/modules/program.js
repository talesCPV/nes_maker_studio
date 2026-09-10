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
 *  - programMeta { notes }
 */
const PROGRAM = (() => {
  let activeTab = 'vars'; // vars | rules | kernel
  let activeRuleTabId = 'main';
  let selectedRuleId = null;

  const OPS = ['==', '!=', '>', '<', '>=', '<='];

  const EVENT_CATALOG = [
    { value: 'boot', label: 'Boot (início do cartucho)' },
    { value: 'vblank', label: 'VBlank (lógica entre frames)' },
    { value: 'overscan', label: 'Overscan (após desenhar tela)' },
    { value: 'input', label: 'Input (joystick / botão)' },
    { value: 'timer', label: 'Timer RIOT' },
    { value: 'enter_screen', label: 'Ao entrar na tela' },
    { value: 'collision_m0p1', label: 'Colisão M0–P1' },
    { value: 'collision_p0pf', label: 'Colisão P0–PF' },
    { value: 'collision_p1pf', label: 'Colisão P1–PF' },
    { value: 'custom', label: 'Custom (label ASM)' },
  ];

  const ACTION_CATALOG = [
    { value: 'set_var', label: 'Definir variável' },
    { value: 'add_var', label: 'Somar à variável' },
    { value: 'sub_var', label: 'Subtrair da variável' },
    { value: 'toggle_bool', label: 'Inverter bool' },
    { value: 'play_sound', label: 'Tocar som (TIA)' },
    { value: 'stop_sound', label: 'Parar canal de som' },
    { value: 'set_sprite', label: 'Trocar gráfico do player' },
    { value: 'goto_screen', label: 'Ir para tela' },
    { value: 'set_tia', label: 'Escrever registrador TIA' },
    { value: 'asm', label: 'Bloco ASM livre' },
  ];

  // RAM 2600: $80–$FF = 128 bytes. Reservamos alguns pro runtime.
  const RAM_START = 0x80;
  const RAM_SIZE = 128;
  const RESERVED_RUNTIME = 16; // ponteiros, tmp, seed, etc.

  function ensureData() {
    if (!Project.data) Project.data = Project.defaultData();
    if (!Array.isArray(Project.data.variables)) Project.data.variables = [];
    if (!Array.isArray(Project.data.rules)) Project.data.rules = [];
    if (!Array.isArray(Project.data.ruleTabs) || !Project.data.ruleTabs.length) {
      Project.data.ruleTabs = [{ id: 'main', name: 'main' }];
    }
    if (!Project.data.programMeta) Project.data.programMeta = { notes: '' };
    return Project.data;
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
    else if (activeTab === 'rules') cont.innerHTML = renderRulesTab();
    else cont.innerHTML = renderKernelTab();
    bindTabEvents();
  }

  function renderVarsTab() {
    const d = ensureData();
    const alloc = computeAllocation(d.variables);
    const rows = alloc.list
      .map((v, idx) => {
        const addr =
          v.type === 'bool'
            ? `$${v.address.toString(16).toUpperCase().padStart(2, '0')} bit${v.bitIndex}`
            : `$${v.address.toString(16).toUpperCase().padStart(2, '0')}` +
              (v.sizeBytes === 2 ? ' (word)' : '');
        return `
        <tr data-idx="${idx}">
          <td><input class="prog-inp" data-f="name" value="${escapeAttr(v.name || '')}" /></td>
          <td>
            <select class="prog-inp" data-f="type">
              <option value="byte" ${v.type === 'byte' ? 'selected' : ''}>byte</option>
              <option value="word" ${v.type === 'word' ? 'selected' : ''}>word</option>
              <option value="bool" ${v.type === 'bool' ? 'selected' : ''}>bool</option>
            </select>
          </td>
          <td class="mono">${addr}</td>
          <td><input class="prog-inp" data-f="note" value="${escapeAttr(v.note || '')}" placeholder="nota" /></td>
          <td><button type="button" class="prog-btn danger prog-del-var" data-idx="${idx}">🗑</button></td>
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
            <div class="muted">$80–$FF · ${alloc.reserved} bytes reservados ao runtime · livre: <b>${alloc.freeBytes}</b> / ${alloc.total}</div>
          </div>
          <button type="button" class="prog-btn" id="progAddVar">+ Variável</button>
        </div>
        <div class="prog-membar"><div style="width:${bar}%;background:${barColor}"></div></div>
        <table class="prog-table">
          <thead><tr><th>Nome</th><th>Tipo</th><th>Endereço</th><th>Nota</th><th></th></tr></thead>
          <tbody id="progVarBody">${rows || '<tr><td colspan="5" class="muted">Nenhuma variável</td></tr>'}</tbody>
        </table>
        <p class="muted" style="margin-top:10px">
          No 2600 quase tudo de estado do jogo precisa caber nesses 128 bytes.
          Prefira <b>bool</b> empacotado e <b>byte</b>; use word só se necessário.
        </p>
      </div>
    `;
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
        const cond = (r.conditions || [])
          .map((c) => `${c.left || '?'} ${c.op || '=='} ${c.right || '0'}`)
          .join(' && ') || '(sempre)';
        const acts = (r.actions || []).map((a) => a.type || 'ação').join(', ') || '—';
        return `
        <div class="rule-card ${selectedRuleId === r.id ? 'sel' : ''}" data-rid="${r.id}">
          <div class="rule-card-top">
            <strong>${escapeHtml(r.name || 'Regra')}</strong>
            <span class="pill">${escapeHtml(r.event || 'vblank')}</span>
            <button type="button" class="prog-btn danger rule-del" data-rid="${r.id}">🗑</button>
          </div>
          <div class="muted">se ${escapeHtml(cond)}</div>
          <div class="muted">então ${escapeHtml(acts)}</div>
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
    const varOpts = d.variables
      .map((v) => `<option value="${escapeAttr(v.name)}" ${false ? 'selected' : ''}>${escapeHtml(v.name)}</option>`)
      .join('');
    const eventOpts = EVENT_CATALOG.map(
      (e) => `<option value="${e.value}" ${r.event === e.value ? 'selected' : ''}>${e.label}</option>`
    ).join('');

    const conds = (r.conditions || [])
      .map(
        (c, i) => `
      <div class="cond-row" data-i="${i}">
        <input class="prog-inp cond-left" value="${escapeAttr(c.left || '')}" placeholder="var / reg" list="progVarList" />
        <select class="prog-inp cond-op">${OPS.map(
          (op) => `<option ${c.op === op ? 'selected' : ''}>${op}</option>`
        ).join('')}</select>
        <input class="prog-inp cond-right" value="${escapeAttr(c.right || '')}" placeholder="valor" />
        <button type="button" class="prog-btn danger cond-del" data-i="${i}">×</button>
      </div>`
      )
      .join('');

    const acts = (r.actions || [])
      .map((a, i) => {
        const typeOpts = ACTION_CATALOG.map(
          (t) => `<option value="${t.value}" ${a.type === t.value ? 'selected' : ''}>${t.label}</option>`
        ).join('');
        return `
        <div class="act-row" data-i="${i}">
          <select class="prog-inp act-type">${typeOpts}</select>
          <input class="prog-inp act-arg" value="${escapeAttr(a.arg || '')}" placeholder="arg / nome / valor" />
          <input class="prog-inp act-arg2" value="${escapeAttr(a.arg2 || '')}" placeholder="arg2 (opcional)" />
          <button type="button" class="prog-btn danger act-del" data-i="${i}">×</button>
        </div>`;
      })
      .join('');

    return `
      <div class="prog-panel">
        <div class="prog-panel-head">
          <input class="prog-inp" id="ruleName" value="${escapeAttr(r.name || '')}" style="font-weight:700;min-width:180px" />
          <select class="prog-inp" id="ruleEvent">${eventOpts}</select>
        </div>
        <datalist id="progVarList">${d.variables.map((v) => `<option value="${escapeAttr(v.name)}">`).join('')}</datalist>

        <h4>Condições (E)</h4>
        <div id="ruleConds">${conds || '<div class="muted">Sem condições = sempre verdadeiro</div>'}</div>
        <button type="button" class="prog-btn" id="ruleAddCond">+ Condição</button>

        <h4 style="margin-top:14px">Ações</h4>
        <div id="ruleActs">${acts || '<div class="muted">Nenhuma ação</div>'}</div>
        <button type="button" class="prog-btn" id="ruleAddAct">+ Ação</button>

        <h4 style="margin-top:14px">ASM extra (opcional)</h4>
        <textarea class="prog-asm" id="ruleAsm" rows="4" placeholder="; código 6507 inserido nesta regra">${escapeHtml(
          r.asm || ''
        )}</textarea>

        <p class="muted" style="margin-top:8px">
          Eventos como <b>vblank</b> e <b>overscan</b> são os lugares seguros para lógica.
          Evite trabalho pesado durante o kernel de desenho.
        </p>
      </div>
    `;
  }

  function renderKernelTab() {
    const d = ensureData();
    const notes = d.programMeta.notes || '';
    return `
      <div class="prog-panel">
        <strong>Modelo mental do 6507 / 2600</strong>
        <ul class="prog-ul">
          <li><b>Scanline a scanline:</b> o kernel desenha PF/players enquanto a TV varre a linha.</li>
          <li><b>VBlank / Overscan:</b> onde as regras de jogo devem rodar (tempo de CPU “livre”).</li>
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

  function bindTabEvents() {
    const d = ensureData();

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
      tr.querySelectorAll('[data-f]').forEach((el) => {
        el.addEventListener('change', () => {
          const f = el.getAttribute('data-f');
          d.variables[idx][f] = el.value;
          dirty();
          if (f === 'type') renderTab();
        });
      });
    });
    document.querySelectorAll('.prog-del-var').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        d.variables.splice(idx, 1);
        dirty();
        renderTab();
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
        event: 'vblank',
        conditions: [],
        actions: [],
        asm: '',
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

    // rule editor
    const rule = d.rules.find((r) => r.id === selectedRuleId);
    if (rule) {
      document.getElementById('ruleName')?.addEventListener('input', (e) => {
        rule.name = e.target.value;
        dirty();
      });
      document.getElementById('ruleEvent')?.addEventListener('change', (e) => {
        rule.event = e.target.value;
        dirty();
      });
      document.getElementById('ruleAsm')?.addEventListener('change', (e) => {
        rule.asm = e.target.value;
        dirty();
      });
      document.getElementById('ruleAddCond')?.addEventListener('click', () => {
        if (!rule.conditions) rule.conditions = [];
        rule.conditions.push({ left: '', op: '==', right: '0' });
        dirty();
        renderTab();
      });
      document.getElementById('ruleAddAct')?.addEventListener('click', () => {
        if (!rule.actions) rule.actions = [];
        rule.actions.push({ type: 'set_var', arg: '', arg2: '' });
        dirty();
        renderTab();
      });
      document.querySelectorAll('.cond-row').forEach((row) => {
        const i = parseInt(row.getAttribute('data-i'), 10);
        row.querySelector('.cond-left')?.addEventListener('change', (e) => {
          rule.conditions[i].left = e.target.value;
          dirty();
        });
        row.querySelector('.cond-op')?.addEventListener('change', (e) => {
          rule.conditions[i].op = e.target.value;
          dirty();
        });
        row.querySelector('.cond-right')?.addEventListener('change', (e) => {
          rule.conditions[i].right = e.target.value;
          dirty();
        });
        row.querySelector('.cond-del')?.addEventListener('click', () => {
          rule.conditions.splice(i, 1);
          dirty();
          renderTab();
        });
      });
      document.querySelectorAll('.act-row').forEach((row) => {
        const i = parseInt(row.getAttribute('data-i'), 10);
        row.querySelector('.act-type')?.addEventListener('change', (e) => {
          rule.actions[i].type = e.target.value;
          dirty();
        });
        row.querySelector('.act-arg')?.addEventListener('change', (e) => {
          rule.actions[i].arg = e.target.value;
          dirty();
        });
        row.querySelector('.act-arg2')?.addEventListener('change', (e) => {
          rule.actions[i].arg2 = e.target.value;
          dirty();
        });
        row.querySelector('.act-del')?.addEventListener('click', () => {
          rule.actions.splice(i, 1);
          dirty();
          renderTab();
        });
      });
    }

    document.getElementById('progNotes')?.addEventListener('change', (e) => {
      d.programMeta.notes = e.target.value;
      dirty();
    });
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
      .cond-row, .act-row { display:flex; gap:6px; margin-bottom:6px; flex-wrap:wrap; align-items:center; }
      h4 { color:#f4a261; font-size:12px; margin:12px 0 8px; }
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
