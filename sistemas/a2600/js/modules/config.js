/**
 * CONFIG — configurações do jogo Atari 2600
 * Inclui gameStyle + kernelProfile (contrato de hardware/editor vivo).
 */
const CONFIG = (() => {
  let selectedScreen = 0;

  /**
   * Profiles técnicos — o build/kernel lê isto.
   * Estilos de jogo são atalhos amigáveis que aplicam um profile + defaults.
   */
  const KERNEL_PROFILES = {
    free: {
      id: 'free',
      label: 'Avançado (livre)',
      blurb: 'P0 e P1 livres, playfield completo, regras soltas. Útil para testar o motor.',
      channels: { p0: 'free', p1: 'free', m0: 'free', m1: 'free', ball: 'free' },
      heroMove: ['left', 'right', 'up', 'down'],
      playfield: 'full',
      enemies: { mode: 'free', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: false },
      objects: { allowFreeSpawn: true, allowMissile: true, allowBall: true },
      options: [],
    },
    two_fighter: {
      id: 'two_fighter',
      label: 'Dois lutadores (Boxing)',
      blurb: 'P0 + P1 sempre na tela, kernel 2 linhas + VDEL. Sem fileiras NUSIZ.',
      channels: { p0: 'hero', p1: 'hero2', m0: 'off', m1: 'off', ball: 'off' },
      heroMove: ['left', 'right', 'up', 'down'],
      playfield: 'static',
      enemies: { mode: 'none', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: true },
      objects: { allowFreeSpawn: false, allowMissile: false, allowBall: false },
      options: [
        { key: 'mirrorArena', label: 'Arena espelhada (reflect)', type: 'bool', default: true },
      ],
    },
    hero_p0_nusiz_rows: {
      id: 'hero_p0_nusiz_rows',
      label: 'Herói + fileiras NUSIZ (Megamania)',
      blurb: 'P0 = herói. P1 = fileiras de inimigos iguais (1–3 cópias via NUSIZ).',
      channels: { p0: 'hero', p1: 'enemy_row', m0: 'hero_shot', m1: 'enemy_shot', ball: 'off' },
      heroMove: ['left', 'right'],
      playfield: 'none',
      enemies: { mode: 'rows', maxRows: 6, maxCopiesPerRow: 3, sameGraphicPerRow: true },
      objects: { allowFreeSpawn: false, allowMissile: true, allowBall: false },
      options: [
        { key: 'enemyRows', label: 'Fileiras de inimigos', type: 'number', min: 1, max: 6, default: 3 },
        { key: 'enemyCopies', label: 'Cópias por fileira (NUSIZ)', type: 'select',
          choices: [
            { v: 1, t: '1 (simples)' },
            { v: 2, t: '2 cópias' },
            { v: 3, t: '3 cópias' },
          ], default: 3 },
        { key: 'heroVertical', label: 'Permitir movimento vertical do herói', type: 'bool', default: false },
        { key: 'twoPlayerAlternating', label: '2 jogadores alternados (sempre P0)', type: 'bool', default: false },
        { key: 'playfield', label: 'Playfield', type: 'select',
          choices: [
            { v: 'none', t: 'Nenhum (tela preta)' },
            { v: 'minimal', t: 'Minimal (reflect/repeat)' },
          ], default: 'none' },
        { key: 'enemyShots', label: 'Tiros inimigos (M1)', type: 'bool', default: false },
      ],
    },
    hero_p0_mux_y: {
      id: 'hero_p0_mux_y',
      label: 'Herói + multiplex vertical (River Raid-like)',
      blurb: 'P0 = herói. P1 reutilizado em faixas de Y (inimigos sem sobrepor a mesma linha).',
      channels: { p0: 'hero', p1: 'mux_enemy', m0: 'hero_shot', m1: 'enemy_shot', ball: 'optional' },
      heroMove: ['left', 'right', 'up', 'down'],
      playfield: 'scroll_v',
      enemies: { mode: 'mux_y', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: false },
      objects: { allowFreeSpawn: true, allowMissile: true, allowBall: true },
      options: [
        { key: 'seedMode', label: 'Seed do mapa', type: 'select',
          choices: [
            { v: 'title_entropy', t: 'Aleatória (contador na tela título)' },
            { v: 'fixed', t: 'Fixa (mesmo rio sempre)' },
          ], default: 'title_entropy' },
        { key: 'seedFixed', label: 'Valor da seed fixa (0–255)', type: 'number', min: 0, max: 255, default: 42 },
        { key: 'riverEdges', label: 'Bordas do rio', type: 'select',
          choices: [
            { v: 2, t: '2 (um canal)' },
            { v: 4, t: '4 (canal + ilha)' },
          ], default: 2 },
        { key: 'minRiverWidth', label: 'Largura mínima do rio (células PF)', type: 'number', min: 4, max: 16, default: 6 },
        { key: 'maxMuxSlots', label: 'Máx. inimigos na tela (multiplex)', type: 'number', min: 2, max: 12, default: 6 },
      ],
    },
    single_screen_adventure: {
      id: 'single_screen_adventure',
      label: 'Adventure / salas',
      blurb: 'Telas estáticas, poucos objetos, playfield por sala, itens com ball/míssil.',
      channels: { p0: 'hero', p1: 'npc_or_enemy', m0: 'optional', m1: 'optional', ball: 'item' },
      heroMove: ['left', 'right', 'up', 'down'],
      playfield: 'full',
      enemies: { mode: 'free', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: false },
      objects: { allowFreeSpawn: true, allowMissile: true, allowBall: true },
      options: [
        { key: 'rooms', label: 'Usar várias salas (telas)', type: 'bool', default: true },
      ],
    },
    racing_rail: {
      id: 'racing_rail',
      label: 'Corrida / trilha',
      blurb: 'Playfield como pista; P0 veículo; obstáculos via multiplex ou PF.',
      channels: { p0: 'vehicle', p1: 'obstacle', m0: 'optional', m1: 'off', ball: 'off' },
      heroMove: ['left', 'right'],
      playfield: 'scroll_v',
      enemies: { mode: 'mux_y', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: false },
      objects: { allowFreeSpawn: true, allowMissile: false, allowBall: false },
      options: [
        { key: 'lanes', label: 'Faixas laterais do herói', type: 'number', min: 2, max: 6, default: 3 },
      ],
    },
  };


  /**
   * Contrato por estilo — editor e build consultam isto.
   * vertical_shooter: P0 herói, P1 fileiras NUSIZ, 2P alternado, PF none/minimal.
   */
  const STYLE_CONTRACTS = {
    vertical_shooter: {
      id: 'vertical_shooter',
      kernelProfile: 'hero_p0_nusiz_rows',
      players: {
        mode: 'alternating',
        maxPlayers: 2,
        activeChannel: 'p0',
        move: ['left', 'right'],
        moveOptional: ['up', 'down'],
      },
      channels: {
        p0: 'hero',
        p1: 'enemy_row',
        m0: 'hero_shot',
        m1: 'enemy_shot',
        ball: 'off',
      },
      enemies: {
        mode: 'rows',
        maxRows: 6,
        maxCopiesPerRow: 3,
        sameGraphicPerRow: true,
        movement: 'horizontal_in_band',
      },
      playfield: {
        allowedModes: ['none', 'reflect', 'repeat'],
        defaultMode: 'none',
        allowAsymmetric: false,
        showBandEditor: true,
      },
      editor: {
        showPlayfieldPaint: true, // false se mode none
        showBands: true,
        spriteRoles: ['hero', 'enemy_row', 'hero_shot'],
        hide: ['asymmetric_pf', 'free_mux_y', 'ball'],
      },
    },
    river_scroll: {
      id: 'river_scroll',
      kernelProfile: 'hero_p0_mux_y',
      players: {
        mode: 'single',
        maxPlayers: 1,
        activeChannel: 'p0',
        move: ['left', 'right'],
        moveOptional: ['speed'],
      },
      channels: {
        p0: 'hero',
        p1: 'mux_enemy',
        m0: 'hero_shot',
        m1: 'enemy_shot',
        ball: 'off',
      },
      enemies: {
        mode: 'mux_y',
        maxRows: 0,
        maxCopiesPerRow: 1,
        sameGraphicPerRow: false,
        movement: 'world_y',
      },
      playfield: {
        // reflect = metade + espelho (rio); none = céu / 1942-like
        allowedModes: ['none', 'reflect'],
        defaultMode: 'reflect',
        allowAsymmetric: false,
        showBandEditor: false,
        showRiverMapEditor: true,
      },
      mapgen: {
        drift: [-1, 0, 1], // fixo no engine
        stepFrames: 12,    // fixo no engine
        seedMode: 'title_entropy',
      },
      editor: {
        showBands: false,
        showRiverMap: true,
        hide: ['asymmetric_pf', 'repeat_pf', 'nusiz_rows', 'spawn_waves'],
      },
    },
    // demais estilos: fallback livre até detalharmos
    advanced: {
      id: 'advanced',
      kernelProfile: 'free',
      playfield: {
        allowedModes: ['none', 'reflect', 'repeat', 'asymmetric'],
        defaultMode: 'reflect',
        allowAsymmetric: true,
        showBandEditor: false,
      },
      editor: { showBands: false },
    },
  };


  /** Estilos amigáveis → profile + overrides de opções */
  const GAME_STYLES = [
    {
      id: 'vertical_shooter',
      label: 'Shooter vertical (Megamania)',
      profile: 'hero_p0_nusiz_rows',
      options: {
        enemyRows: 3,
        enemyCopies: 3,
        heroVertical: false,
        twoPlayerAlternating: false,
        playfield: 'none',
        enemyShots: false,
      },
    },
    {
      id: 'river_scroll',
      label: 'Scroll vertical com inimigos (River Raid)',
      profile: 'hero_p0_mux_y',
      options: {
        seedMode: 'title_entropy',
        seedFixed: 42,
        riverEdges: 2,
        minRiverWidth: 6,
        maxMuxSlots: 6,
      },
    },
    {
      id: 'boxing',
      label: 'Luta 1×1 (Boxing)',
      profile: 'two_fighter',
      options: { mirrorArena: true },
    },
    {
      id: 'adventure',
      label: 'Adventure / exploração',
      profile: 'single_screen_adventure',
      options: { rooms: true },
    },
    {
      id: 'racing',
      label: 'Corrida',
      profile: 'racing_rail',
      options: { lanes: 3 },
    },
    {
      id: 'advanced',
      label: 'Avançado (livre)',
      profile: 'free',
      options: {},
    },
  ];

  function escapeAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function ensureData() {
    if (!Project.data) Project.data = Project.defaultData();
    if (!Array.isArray(Project.data.screens)) Project.data.screens = [];
    if (!Project.data.screens.length) {
      Project.data.screens.push({
        id: 'screen_' + Date.now(),
        name: 'Tela 1',
        description: '',
      });
    }
    if (!Project.data.gameStyle || Project.data.gameStyle === 'experimental') {
      Project.data.gameStyle = 'advanced';
    }
    if (!Project.data.kernelProfile) Project.data.kernelProfile = 'free';
    if (!Project.data.profileOptions || typeof Project.data.profileOptions !== 'object') {
      Project.data.profileOptions = {};
    }
    // migração: kernel antigo → style aproximado
    if (Project.data.kernel && !Project.data._profileMigrated) {
      if (Project.data.kernel === 'vertical_scroll' && Project.data.kernelProfile === 'free') {
        Project.data.gameStyle = 'river_scroll';
        Project.data.kernelProfile = 'hero_p0_mux_y';
      } else if (Project.data.kernel === 'adventure_rooms') {
        Project.data.gameStyle = 'adventure';
        Project.data.kernelProfile = 'single_screen_adventure';
      }
      Project.data._profileMigrated = true;
    }
    return Project.data;
  }

  function getProfile(id) {
    return KERNEL_PROFILES[id] || KERNEL_PROFILES.free;
  }

  function getStyle(id) {
    return GAME_STYLES.find((s) => s.id === id) || GAME_STYLES[0];
  }

  /** Aplica estilo: troca profile e mescla options default */
  function applyStyle(styleId) {
    const d = ensureData();
    const style = getStyle(styleId);
    d.gameStyle = style.id;
    d.kernelProfile = style.profile;
    const prof = getProfile(style.profile);
    const opts = {};
    (prof.options || []).forEach((o) => {
      opts[o.key] = o.default;
    });
    Object.assign(opts, style.options || {});
    d.profileOptions = opts;
    // espelha kernel legado para builds antigos
    d.kernel =
      style.profile === 'single_screen_adventure'
        ? 'adventure_rooms'
        : style.profile === 'hero_p0_mux_y' || style.profile === 'racing_rail'
          ? 'vertical_scroll'
          : 'single_screen';
  }

  function channelLabel(role) {
    const map = {
      free: 'livre',
      hero: 'herói',
      hero2: 'herói 2',
      enemy_row: 'fileira inimigos',
      mux_enemy: 'inimigo multiplex',
      hero_shot: 'tiro herói',
      enemy_shot: 'tiro inimigo',
      vehicle: 'veículo',
      obstacle: 'obstáculo',
      npc_or_enemy: 'NPC/inimigo',
      item: 'item',
      optional: 'opcional',
      off: 'desligado',
    };
    return map[role] || role;
  }

  function renderBudget(prof, opts) {
    const ch = prof.channels || {};
    const rows = [
      ['P0', channelLabel(ch.p0)],
      ['P1', channelLabel(ch.p1)],
      ['M0', channelLabel(ch.m0)],
      ['M1', channelLabel(ch.m1)],
      ['Ball', channelLabel(ch.ball)],
    ];
    const move = (prof.heroMove || []).join(', ') || '—';
    const pf = prof.playfield || '—';
    let extra = '';
    if (prof.enemies?.mode === 'rows') {
      extra = `Fileiras: ${opts.enemyRows ?? prof.enemies.maxRows} × ${opts.enemyCopies ?? 1} cópias (NUSIZ)`;
    } else if (prof.enemies?.mode === 'mux_y') {
      extra = `Multiplex Y: até ${opts.maxMuxSlots ?? 6} faixas`;
    }
    return `
      <div class="cfg-budget">
        <div class="cfg-budget-title">Orçamento de hardware (este profile)</div>
        <div class="cfg-budget-grid">
          ${rows
            .map(
              ([k, v]) =>
                `<div><span class="k">${k}</span> <span class="v">${escapeHtml(v)}</span></div>`
            )
            .join('')}
        </div>
        <div class="cfg-budget-meta">
          <div>Movimento herói: <b>${escapeHtml(move)}</b></div>
          <div>Playfield: <b>${escapeHtml(pf)}</b></div>
          ${extra ? `<div>${escapeHtml(extra)}</div>` : ''}
        </div>
        <p class="cfg-budget-blurb">${escapeHtml(prof.blurb || '')}</p>
      </div>`;
  }

  function renderProfileOptions(prof, opts) {
    const list = prof.options || [];
    if (!list.length) {
      return `<p style="margin:0;font-size:12px;color:#666">Este profile não tem opções extras.</p>`;
    }
    return list
      .map((o) => {
        const val = opts[o.key] !== undefined ? opts[o.key] : o.default;
        if (o.type === 'bool') {
          return `<label class="cfg-opt"><input type="checkbox" data-opt="${escapeAttr(o.key)}" ${
            val ? 'checked' : ''
          }/> ${escapeHtml(o.label)}</label>`;
        }
        if (o.type === 'number') {
          return `<label class="cfg-opt">${escapeHtml(o.label)}
            <input type="number" data-opt="${escapeAttr(o.key)}" min="${o.min ?? 0}" max="${
            o.max ?? 99
          }" value="${escapeAttr(val)}" style="width:72px"/></label>`;
        }
        if (o.type === 'select') {
          const choices = o.choices || [];
          return `<label class="cfg-opt">${escapeHtml(o.label)}
            <select data-opt="${escapeAttr(o.key)}">
              ${choices
                .map(
                  (c) =>
                    `<option value="${escapeAttr(c.v)}" ${
                      String(val) === String(c.v) ? 'selected' : ''
                    }>${escapeHtml(c.t)}</option>`
                )
                .join('')}
            </select></label>`;
        }
        return '';
      })
      .join('');
  }

  function buildHTML() {
    const root = document.getElementById('mod-config');
    if (!root) return;
    const d = ensureData();
    const style = getStyle(d.gameStyle);
    const prof = getProfile(d.kernelProfile || style.profile);
    const opts = d.profileOptions || {};

    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;overflow:auto;padding:16px;gap:16px;background:#1e1e1e">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h3 style="margin:0;font-size:14px;color:#f4a261">⚙ CONFIGURAÇÕES DO JOGO</h3>
          <span style="font-size:11px;color:#666">Metadados, estilo, kernel profile e telas</span>
        </div>

        <div class="cfg-card">
          <div class="cfg-card-title">Identidade</div>
          <div class="cfg-grid">
            <label>Nome
              <input id="cfgName" type="text" value="${escapeAttr(d.name || '')}" />
            </label>
            <label>Autor
              <input id="cfgAuthor" type="text" value="${escapeAttr(d.author || '')}" />
            </label>
            <label class="full">Descrição
              <textarea id="cfgDesc" rows="2">${escapeHtml(d.description || '')}</textarea>
            </label>
          </div>
        </div>

        <div class="cfg-card">
          <div class="cfg-card-title">Estilo de jogo</div>
          <div class="cfg-grid">
            <label class="full">Estilo
              <select id="cfgGameStyle">
                ${GAME_STYLES.map(
                  (s) =>
                    `<option value="${escapeAttr(s.id)}" ${
                      d.gameStyle === s.id ? 'selected' : ''
                    }>${escapeHtml(s.label)}</option>`
                ).join('')}
              </select>
            </label>
          </div>
          <div id="cfgBudgetWrap" style="margin-top:12px">
            ${renderBudget(prof, opts)}
          </div>
          <div id="cfgProfileOpts" class="cfg-opts" style="margin-top:12px">
            ${renderProfileOptions(prof, opts)}
          </div>
          <p style="margin:10px 0 0;font-size:11px;color:#666;line-height:1.45">
            O <b style="color:#aaa">estilo</b> define o kernel por baixo dos panos
            (canais P0/P1, fileiras NUSIZ, multiplex, etc.).
            Outros módulos consultam
            <code style="color:#f4a261">CONFIG.getKernelProfile()</code>
            para mostrar ou esconder ferramentas.
          </p>
        </div>

        <div class="cfg-card">
          <div class="cfg-card-title">Cartucho / TV</div>
          <div class="cfg-grid">
            <label>Tamanho da ROM / mapper
              <select id="cfgRomSize">
                <option value="2048" ${d.romSize == 2048 ? 'selected' : ''}>2 KB — fixed</option>
                <option value="4096" ${d.romSize == 4096 || !d.romSize ? 'selected' : ''}>4 KB — fixed</option>
                <option value="8192" ${d.romSize == 8192 ? 'selected' : ''}>8 KB — F8</option>
                <option value="16384" ${d.romSize == 16384 ? 'selected' : ''}>16 KB — F6</option>
                <option value="32768" ${d.romSize == 32768 ? 'selected' : ''}>32 KB — F4</option>
              </select>
            </label>
            <label>Padrão de TV
              <select id="cfgTv">
                <option value="NTSC" ${(d.tv || 'NTSC') === 'NTSC' ? 'selected' : ''}>NTSC (60 Hz)</option>
                <option value="PAL" ${d.tv === 'PAL' ? 'selected' : ''}>PAL (50 Hz)</option>
              </select>
            </label>
          </div>
        </div>

        <div class="cfg-card">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div class="cfg-card-title" style="margin:0">Telas / salas</div>
            <button type="button" class="cfg-btn" id="cfgAddScreen">+ Nova tela</button>
          </div>
          <div id="cfgScreenList" style="display:flex;flex-direction:column;gap:6px"></div>
          <div id="cfgScreenDetail" style="margin-top:12px;display:none" class="cfg-grid">
            <label>Nome da tela
              <input id="cfgScreenName" type="text" />
            </label>
            <label class="full">Descrição
              <input id="cfgScreenDesc" type="text" />
            </label>
          </div>
        </div>
      </div>
    `;

    injectStyles();
    bind();
    renderScreens();
  }

  function refreshProfileUI() {
    const d = ensureData();
    const prof = getProfile(d.kernelProfile);
    const opts = d.profileOptions || {};
    const bw = document.getElementById('cfgBudgetWrap');
    const ow = document.getElementById('cfgProfileOpts');
    if (bw) bw.innerHTML = renderBudget(prof, opts);
    if (ow) {
      ow.innerHTML = renderProfileOptions(prof, opts);
      bindOptHandlers();
    }
    const gs = document.getElementById('cfgGameStyle');
    if (gs) gs.value = d.gameStyle;
  }

  function bindOptHandlers() {
    document.querySelectorAll('#cfgProfileOpts [data-opt]').forEach((el) => {
      const key = el.getAttribute('data-opt');
      const handler = () => {
        const d = ensureData();
        if (!d.profileOptions) d.profileOptions = {};
        if (el.type === 'checkbox') d.profileOptions[key] = !!el.checked;
        else if (el.type === 'number') d.profileOptions[key] = parseInt(el.value, 10) || 0;
        else d.profileOptions[key] = el.value;
        dirty();
        const prof = getProfile(d.kernelProfile);
        const bw = document.getElementById('cfgBudgetWrap');
        if (bw) bw.innerHTML = renderBudget(prof, d.profileOptions);
      };
      el.addEventListener('change', handler);
      el.addEventListener('input', handler);
    });
  }

  function bind() {
    const d = ensureData();

    document.getElementById('cfgName')?.addEventListener('input', (e) => {
      d.name = e.target.value;
      dirty();
      if (typeof Project.updateHeader === 'function') Project.updateHeader();
    });
    document.getElementById('cfgAuthor')?.addEventListener('input', (e) => {
      d.author = e.target.value;
      dirty();
    });
    document.getElementById('cfgDesc')?.addEventListener('input', (e) => {
      d.description = e.target.value;
      dirty();
    });
    document.getElementById('cfgRomSize')?.addEventListener('change', (e) => {
      d.romSize = parseInt(e.target.value, 10) || 4096;
      dirty();
    });
    document.getElementById('cfgTv')?.addEventListener('change', (e) => {
      d.tv = e.target.value;
      dirty();
    });

    document.getElementById('cfgGameStyle')?.addEventListener('change', (e) => {
      applyStyle(e.target.value);
      dirty();
      refreshProfileUI();
      try {
        if (typeof PLAYFIELD !== 'undefined' && PLAYFIELD.applyStyleFromConfig) {
          PLAYFIELD.applyStyleFromConfig();
        } else if (typeof PLAYFIELD !== 'undefined' && PLAYFIELD.init) {
          // reconstrói o módulo se estiver montado
          const root = document.getElementById('mod-playfield');
          if (root && root.innerHTML.trim()) PLAYFIELD.init();
        }
      } catch (err) { console.warn(err); }
    });

    bindOptHandlers();

    document.getElementById('cfgAddScreen')?.addEventListener('click', () => {
      const d2 = ensureData();
      d2.screens.push({
        id: 'screen_' + Date.now(),
        name: 'Tela ' + (d2.screens.length + 1),
        description: '',
      });
      selectedScreen = d2.screens.length - 1;
      dirty();
      renderScreens();
    });
  }

  function renderScreens() {
    const d = ensureData();
    const list = document.getElementById('cfgScreenList');
    const detail = document.getElementById('cfgScreenDetail');
    if (!list) return;
    list.innerHTML = d.screens
      .map(
        (s, i) => `
      <div class="cfg-screen-row ${i === selectedScreen ? 'active' : ''}" data-i="${i}">
        <span class="cfg-screen-name">${escapeHtml(s.name || 'Tela')}</span>
        <button type="button" class="cfg-btn cfg-screen-del" data-i="${i}" title="Excluir">✕</button>
      </div>`
      )
      .join('');

    list.querySelectorAll('.cfg-screen-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.cfg-screen-del')) return;
        selectedScreen = parseInt(row.getAttribute('data-i'), 10);
        renderScreens();
      });
    });
    list.querySelectorAll('.cfg-screen-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-i'), 10);
        if (d.screens.length <= 1) {
          alert('Precisa haver pelo menos uma tela.');
          return;
        }
        if (!confirm('Excluir esta tela?')) return;
        d.screens.splice(i, 1);
        if (selectedScreen >= d.screens.length) selectedScreen = d.screens.length - 1;
        dirty();
        renderScreens();
      });
    });

    if (detail) {
      const s = d.screens[selectedScreen];
      if (!s) {
        detail.style.display = 'none';
        return;
      }
      detail.style.display = 'grid';
      const name = document.getElementById('cfgScreenName');
      const desc = document.getElementById('cfgScreenDesc');
      if (name) {
        name.value = s.name || '';
        name.oninput = () => {
          s.name = name.value;
          dirty();
          const label = list.querySelector(`.cfg-screen-row[data-i="${selectedScreen}"] .cfg-screen-name`);
          if (label) label.textContent = s.name || 'Tela';
        };
      }
      if (desc) {
        desc.value = s.description || '';
        desc.oninput = () => {
          s.description = desc.value;
          dirty();
        };
      }
    }
  }

  function dirty() {
    if (typeof Project.status === 'function') {
      Project.status('config alterada — salve o projeto');
    }
  }

  function flush() {
    const d = ensureData();
    const name = document.getElementById('cfgName');
    const author = document.getElementById('cfgAuthor');
    const desc = document.getElementById('cfgDesc');
    const rom = document.getElementById('cfgRomSize');
    const tv = document.getElementById('cfgTv');
    const style = document.getElementById('cfgGameStyle');
    if (name) d.name = name.value;
    if (author) d.author = author.value;
    if (desc) d.description = desc.value;
    if (rom) d.romSize = parseInt(rom.value, 10) || 4096;
    if (tv) d.tv = tv.value;
    if (style) {
      // estilo manda: recalcula profile + defaults se mudou
      if (style.value !== d.gameStyle) applyStyle(style.value);
      else d.gameStyle = style.value;
    }
    // options
    document.querySelectorAll('#cfgProfileOpts [data-opt]').forEach((el) => {
      const key = el.getAttribute('data-opt');
      if (!d.profileOptions) d.profileOptions = {};
      if (el.type === 'checkbox') d.profileOptions[key] = !!el.checked;
      else if (el.type === 'number') d.profileOptions[key] = parseInt(el.value, 10) || 0;
      else d.profileOptions[key] = el.value;
    });
    return d;
  }

  function injectStyles() {
    if (document.getElementById('cfg-styles')) return;
    const s = document.createElement('style');
    s.id = 'cfg-styles';
    s.textContent = `
      .cfg-card {
        background: linear-gradient(180deg, #1e222c, #161920);
        border: 1px solid #333; border-radius: 10px; padding: 14px;
      }
      .cfg-card-title {
        font-size: 12px; font-weight: 700; color: #f4a261; margin-bottom: 10px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .cfg-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px;
      }
      .cfg-grid label, .cfg-opt {
        display: flex; flex-direction: column; gap: 4px;
        font-size: 11px; color: #aaa;
      }
      .cfg-grid label.full { grid-column: 1 / -1; }
      .cfg-grid input, .cfg-grid select, .cfg-grid textarea,
      .cfg-opt input, .cfg-opt select {
        background: #12151c; border: 1px solid #333; color: #ddd;
        border-radius: 6px; padding: 6px 8px; font-size: 13px;
      }
      .cfg-btn {
        background: #2a2a2a; border: 1px solid #444; color: #ccc;
        border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px;
      }
      .cfg-btn:hover { border-color: #f4a261; }
      .cfg-screen-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 10px; background: #12151c; border: 1px solid #333;
        border-radius: 6px; cursor: pointer;
      }
      .cfg-screen-row.active { border-color: #f4a261; background: #1a1e28; }
      .cfg-screen-name { font-size: 13px; color: #ddd; }
      .cfg-opts {
        display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: flex-end;
      }
      .cfg-opt { flex-direction: row; align-items: center; gap: 8px; }
      .cfg-opt input[type=checkbox] { width: auto; }
      .cfg-budget {
        background: #12151c; border: 1px solid #2a2f3a; border-radius: 8px; padding: 10px 12px;
      }
      .cfg-budget-title { font-size: 11px; color: #f4a261; font-weight: 700; margin-bottom: 8px; }
      .cfg-budget-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 4px 12px;
        font-size: 12px;
      }
      .cfg-budget-grid .k { color: #888; font-family: monospace; margin-right: 6px; }
      .cfg-budget-grid .v { color: #ccc; }
      .cfg-budget-meta { margin-top: 8px; font-size: 12px; color: #aaa; display: flex; flex-direction: column; gap: 2px; }
      .cfg-budget-meta b { color: #ddd; }
      .cfg-budget-blurb { margin: 8px 0 0; font-size: 11px; color: #777; line-height: 1.4; }
    `;
    document.head.appendChild(s);
  }

  function init() {
    buildHTML();
  }

  /** API para outros módulos (editor vivo) */
  function getKernelProfile() {
    const d = ensureData();
    return getProfile(d.kernelProfile);
  }

  function getProfileOptions() {
    return ensureData().profileOptions || {};
  }

  function getGameStyle() {
    return ensureData().gameStyle || 'advanced';
  }

  function allowsHeroMove(dir) {
    const p = getKernelProfile();
    return (p.heroMove || []).includes(dir);
  }

  function playfieldMode() {
    return getKernelProfile().playfield || 'full';
  }


  function getStyleContract(styleId) {
    const id = styleId || getGameStyle();
    return (
      STYLE_CONTRACTS[id] ||
      STYLE_CONTRACTS.advanced || {
        id: id,
        playfield: {
          allowedModes: ['none', 'reflect', 'repeat', 'asymmetric'],
          defaultMode: 'reflect',
          showBandEditor: false,
        },
        editor: { showBands: false },
      }
    );
  }

  function allowedPfModes() {
    const c = getStyleContract();
    if (c.playfield && Array.isArray(c.playfield.allowedModes)) {
      return c.playfield.allowedModes.slice();
    }
    const st = getGameStyle();
    if (st === 'vertical_shooter') return ['none', 'reflect', 'repeat'];
    if (st === 'river_scroll') return ['none', 'reflect'];
    return ['none', 'reflect', 'repeat', 'asymmetric'];
  }

  function showBandEditor() {
    const c = getStyleContract();
    if (c.editor && c.editor.showBands) return true;
    if (c.playfield && c.playfield.showBandEditor) return true;
    return getGameStyle() === 'vertical_shooter';
  }

  function showRiverMapEditor() {
    const c = getStyleContract();
    if (c.playfield && c.playfield.showRiverMapEditor) return true;
    if (c.editor && c.editor.showRiverMap) return true;
    return getGameStyle() === 'river_scroll';
  }

  return {
    init,
    flush,
    buildHTML,
    renderScreens,
    getKernelProfile,
    getProfileOptions,
    getGameStyle,
    getStyleContract,
    allowsHeroMove,
    playfieldMode,
    allowedPfModes,
    showBandEditor,
    showRiverMapEditor,
    KERNEL_PROFILES,
    GAME_STYLES,
    STYLE_CONTRACTS,
  };
})();

window.CONFIG = CONFIG;
