/**
 * PLAYFIELD — editor de playfield Atari 2600
 *
 * Modos:
 *  - reflect: lado direito = espelho (CTRLPF reflect)
 *  - repeat:  lado direito = cópia dos mesmos 20 bits
 *  - asymmetric: 40 bits livres (kernel reescreve PF no meio da scanline)
 *
 * Cores por linha: COLUPF / COLUBK (faixa à direita do grid)
 */
const PLAYFIELD = (() => {
  const W = 40;
  const H_DEFAULT = 192;
  const CELL_H = 3;
  const GUTTER = 18;
  const GAP = 8; // espaço entre grid e barra de cores
  const UNDO_MAX = 40;

  /** Glifos 8x8 internos (placar). */
  const SCORE_DIGITS = [
    [0x3c, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c],
    [0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x18, 0x7e],
    [0x3c, 0x66, 0x06, 0x0c, 0x18, 0x30, 0x60, 0x7e],
    [0x3c, 0x66, 0x06, 0x1c, 0x06, 0x06, 0x66, 0x3c],
    [0x0c, 0x1c, 0x3c, 0x6c, 0x7e, 0x0c, 0x0c, 0x0c],
    [0x7e, 0x60, 0x60, 0x7c, 0x06, 0x06, 0x66, 0x3c],
    [0x3c, 0x66, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x3c],
    [0x7e, 0x06, 0x0c, 0x18, 0x18, 0x30, 0x30, 0x30],
    [0x3c, 0x66, 0x66, 0x3c, 0x66, 0x66, 0x66, 0x3c],
    [0x3c, 0x66, 0x66, 0x66, 0x3e, 0x06, 0x66, 0x3c],
  ];

  let screenId = null;
  let height = H_DEFAULT;
  let pixels = null;
  let colubk = 0x00;
  let colupf = 0x0a;
  let lineColupf = null;
  let lineColubk = null;
  let colorTarget = 'pf';
  let pfMode = 'reflect'; // none | reflect | repeat | asymmetric
  let selectedBandId = null;
  let bandDrag = null; // { type, bandId, idx?, startScanY, startColorX, origY, origH, origBaseX, origXs }
  let tool = 'paint';
  let painting = false;
  let zoom = 1;
  const undoStack = [];

  const TIA_NTSC = buildTiaNtsc();

  function buildTiaNtsc() {
    // i = reg>>1 (0..127). Hue = nibble alto; luminância = 0..7.
    const out = new Array(128);
    for (let i = 0; i < 128; i++) {
      const reg = (i << 1) & 0xfe;
      const hue = (reg >> 4) & 0x0f;
      const lum = (reg >> 1) & 0x07;
      if (hue === 0) {
        const g = Math.min(255, 8 + lum * 32);
        out[i] = [g, g, g];
      } else {
        const h = ((hue - 1) / 14) * 360;
        const l = 0.16 + (lum / 7) * 0.62;
        out[i] = hslToRgb(h, 0.78, l);
      }
    }
    return out;
  }
  function hslToRgb(h, s, l) {
    h /= 360;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) {
      const g = Math.round(l * 255);
      return [g, g, g];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    ];
  }
  function tiaCss(idx) {
    const c = TIA_NTSC[(idx >> 1) & 0x7f] || [0, 0, 0];
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  function cellSize(h) {
    const z = zoom === 2 ? 2 : 1;
    const cellH = CELL_H * z;
    const cellW = Math.max(2, Math.round(cellH * (4 / 3) * h / W));
    return { cellW, cellH, zoom: z };
  }

  function canvasDims(h) {
    const { cellW, cellH } = cellSize(h);
    return {
      cellW,
      cellH,
      gridW: W * cellW,
      canvasW: W * cellW + GAP + GUTTER,
      canvasH: h * cellH,
    };
  }

  function ensureData() {
    if (!Project.data) Project.data = Project.defaultData();
    if (!Array.isArray(Project.data.playfields)) Project.data.playfields = [];
    if (!Array.isArray(Project.data.screens) || !Project.data.screens.length) {
      Project.data.screens = [{ id: 'screen_' + Date.now(), name: 'Tela 1', description: '' }];
    }
    if (!Project.data.scoreBar || typeof Project.data.scoreBar !== 'object') {
      Project.data.scoreBar = {};
    }
    const sb0 = Project.data.scoreBar;
    if (sb0.position == null) sb0.position = sb0.enabled ? 'bottom' : 'none';
    if (!['none', 'top', 'bottom'].includes(sb0.position)) sb0.position = 'none';
    if (!['left', 'center', 'right', 'both'].includes(sb0.align)) sb0.align = 'center';
    if (sb0.background == null) sb0.background = true;
    sb0.lines = Math.max(8, Math.min(32, sb0.lines | 0) || 16);
    sb0.digits = Math.max(2, Math.min(6, sb0.digits | 0) || 6);
    if (typeof sb0.variable !== 'string' || !sb0.variable) sb0.variable = 'score';
    if (typeof sb0.variable2 !== 'string' || !sb0.variable2) sb0.variable2 = 'scoreP1';
    sb0.logoAlways = true;
    sb0.showLogo = true;
    sb0.logoLines = Math.max(6, Math.min(16, sb0.logoLines | 0) || 10);
    sb0.enabled = sb0.position !== 'none';
    sb0.variable = 'scoreP0';
    sb0.variable2 = 'scoreP1';
    if (sb0.previewValue == null) sb0.previewValue = 0;
    if (!Array.isArray(Project.data.gameObjects)) Project.data.gameObjects = [];
    if (!Array.isArray(Project.data.bands)) Project.data.bands = [];
    return Project.data;
  }


  function styleUsesBands() {
    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.showBandEditor === 'function')
        return !!CONFIG.showBandEditor();
    } catch (e) {}
    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.getGameStyle === 'function')
        return CONFIG.getGameStyle() === 'vertical_shooter';
    } catch (e) {}
    try {
      return !!(Project.data && Project.data.gameStyle === 'vertical_shooter');
    } catch (e) {}
    return false;
  }

  function allowsAsymmetric() {
    return allowedModes().indexOf('asymmetric') >= 0;
  }

  function allowsRepeat() {
    return allowedModes().indexOf('repeat') >= 0;
  }

  function allowedModes() {
    let modes = null;
    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.allowedPfModes === 'function') {
        modes = CONFIG.allowedPfModes();
      }
    } catch (e) {}
    if (!modes) {
      try {
        const st = (Project.data && Project.data.gameStyle) || '';
        if (st === 'vertical_shooter') modes = ['none', 'reflect', 'repeat'];
        else if (st === 'river_scroll') modes = ['none', 'reflect'];
        else if (st === 'boxing') modes = ['none', 'reflect'];
        else if (st === 'racing') modes = ['none', 'reflect'];
        else if (st === 'adventure') modes = ['none', 'reflect', 'repeat', 'asymmetric'];
        else modes = ['none', 'reflect', 'repeat', 'asymmetric'];
      } catch (e) {
        modes = ['none', 'reflect', 'repeat', 'asymmetric'];
      }
    }
    // adventure: pode desligar asymmetric nas opções
    try {
      if (styleUsesAdventure()) {
        const o =
          (Project.data && Project.data.profileOptions) || {};
        if (o.allowAsymmetricRooms === false || o.allowAsymmetricRooms === 0 || o.allowAsymmetricRooms === '0') {
          modes = modes.filter((m) => m !== 'asymmetric');
        }
      }
    } catch (e) {}
    return modes;
  }

  function styleUsesRacing() {
    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.showRacingEditor === 'function') {
        return !!CONFIG.showRacingEditor();
      }
    } catch (e) {}
    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.getGameStyle === 'function') {
        return CONFIG.getGameStyle() === 'racing';
      }
    } catch (e) {}
    try {
      return !!(Project.data && Project.data.gameStyle === 'racing');
    } catch (e) {}
    return false;
  }

  function styleUsesAdventure() {

    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.showAdventureEditor === 'function') {
        return !!CONFIG.showAdventureEditor();
      }
    } catch (e) {}
    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.getGameStyle === 'function') {
        return CONFIG.getGameStyle() === 'adventure';
      }
    } catch (e) {}
    try {
      return !!(Project.data && Project.data.gameStyle === 'adventure');
    } catch (e) {}
    return false;
  }

  function styleUsesFight() {

    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.showFightEditor === 'function') {
        return !!CONFIG.showFightEditor();
      }
    } catch (e) {}
    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.getGameStyle === 'function') {
        return CONFIG.getGameStyle() === 'boxing';
      }
    } catch (e) {}
    try {
      return !!(Project.data && Project.data.gameStyle === 'boxing');
    } catch (e) {}
    return false;
  }

  function styleUsesRiverMap() {

    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.showRiverMapEditor === 'function') {
        return !!CONFIG.showRiverMapEditor();
      }
    } catch (e) {}
    try {
      if (typeof CONFIG !== 'undefined' && typeof CONFIG.getGameStyle === 'function') {
        return CONFIG.getGameStyle() === 'river_scroll';
      }
    } catch (e) {}
    try {
      return !!(Project.data && Project.data.gameStyle === 'river_scroll');
    } catch (e) {}
    return false;
  }

  function coercePfMode(mode) {
    const ok = allowedModes();
    if (ok.indexOf(mode) >= 0) return mode;
    return 'reflect';
  }

  function bandsForScreen(sid) {
    const d = ensureData();
    return (d.bands || []).filter((b) => b.screenId === sid);
  }

  function uidBand() {
    return 'band_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36);
  }

  /**
   * Offsets relativos das instâncias (0 = baseX).
   * 1–3: NUSIZ clássico num único player.
   * 4–6: P0×3 + P1×3 intercalados (estilo Space Invaders / Megamania).
   *   medium gap=32 → posições a cada 16; close gap=16 → a cada 8.
   */
  function nusizOffsets(copies, spacing) {
    const n = Math.max(1, Math.min(6, copies | 0));
    const gap = spacing === 'wide' ? 64 : spacing === 'medium' ? 32 : 16;
    if (n <= 3) {
      if (n === 1) return [0];
      if (n === 2) return [0, gap];
      return [0, gap, gap * 2];
    }
    // 4–6: intercalado P0/P1 (passo = gap/2)
    const step = gap / 2;
    const out = [];
    for (let i = 0; i < n; i++) out.push(i * step);
    return out;
  }

  /** Sempre recalcula a partir de baseX + spacing (xs nunca é editado à mão). */
  function bandXs(band) {
    const copies = Math.max(1, Math.min(6, band.copies | 0) || 1);
    const base = Math.max(0, Math.min(152, band.baseX | 0));
    return nusizOffsets(copies, band.spacing || 'close').map((o) => Math.min(152, base + o));
  }

  /** Máscara de vivos (bit0 = 1ª instância à esquerda). Default todos vivos. */
  function defaultAliveMask(copies) {
    const n = Math.max(1, Math.min(6, copies | 0));
    return (1 << n) - 1;
  }

  function spriteOptionsHtml(selectedId) {
    const sprites = (Project.data && Project.data.sprites) || [];
    if (!sprites.length) return '<option value="">(nenhum sprite — crie em Sprites)</option>';
    return sprites
      .map(
        (s) =>
          '<option value="' +
          escapeAttr(s.id) +
          '" ' +
          (s.id === selectedId ? 'selected' : '') +
          '>' +
          escapeHtml(s.name || s.id) +
          '</option>'
      )
      .join('');
  }


  function spawnsForScreen(sid) {
    const d = ensureData();
    return (d.gameObjects || []).filter(
      (o) => (o.kind || 'spawn') === 'spawn' && o.screenId === sid
    );
  }

  function uidSpawn() {
    return 'spawn_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36);
  }

  /** grid x 0..39 → color clocks ~0..160 */
  function gridToColorX(gx) {
    return Math.max(0, Math.min(160, Math.round((gx / W) * 160)));
  }

  function colorXToGrid(cx) {
    return Math.max(0, Math.min(W - 1, Math.round(((cx | 0) / 160) * W)));
  }

  function emptyPixels(h) {
    return new Uint8Array(W * h);
  }

  function pixelsToBase64(u8) {
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i] & 1);
    return btoa(bin);
  }
  function base64ToPixels(b64, h) {
    const u8 = emptyPixels(h);
    if (!b64) return u8;
    try {
      const bin = atob(b64);
      const n = Math.min(bin.length, u8.length);
      for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i) & 1;
    } catch (e) {}
    return u8;
  }

  function colorsToB64(u8) {
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i] & 0xff);
    return btoa(bin);
  }
  function colorsFromB64(b64, h, fill) {
    const next = new Uint8Array(h);
    next.fill((fill != null ? fill : 0) & 0xfe);
    if (!b64) return next;
    try {
      const bin = atob(b64);
      const n = Math.min(bin.length, h);
      for (let i = 0; i < n; i++) next[i] = bin.charCodeAt(i) & 0xfe;
    } catch (e) {}
    return next;
  }

  function ensureLineColors(h) {
    const mk = (arr, fill) => {
      const next = new Uint8Array(h);
      const base = fill & 0xfe;
      if (arr && arr.length) {
        for (let i = 0; i < h; i++) next[i] = i < arr.length ? (arr[i] & 0xfe) : base;
      } else next.fill(base);
      return next;
    };
    lineColupf = mk(lineColupf, colupf);
    lineColubk = mk(lineColubk, colubk);
  }

  /** Projeta lado direito conforme modo (exceto asymmetric) */
  function syncRightFromLeft(y) {
    if (pfMode === 'asymmetric') return;
    for (let lx = 0; lx < 20; lx++) {
      const v = pixels[y * W + lx] & 1;
      const rx = pfMode === 'reflect' ? 39 - lx : lx + 20;
      pixels[y * W + rx] = v;
    }
  }

  function syncAllRight() {
    if (pfMode === 'asymmetric') return;
    for (let y = 0; y < height; y++) syncRightFromLeft(y);
  }

  function currentScreenId() {
    const d = ensureData();
    if (screenId && d.screens.some((s) => s.id === screenId)) return screenId;
    screenId = d.screens[0].id;
    return screenId;
  }

  function findPf(sid) {
    return ensureData().playfields.find((p) => p.screenId === sid) || null;
  }

  function loadForScreen(sid) {
    screenId = sid;
    const pf = findPf(sid);
    // Altura sempre = área útil (placar/logo definem no Config)
    const wantH = targetPlayHeight();
    height = wantH;
    colubk = pf && pf.colubk != null ? pf.colubk & 0xfe : 0x00;
    colupf = pf && pf.colupf != null ? pf.colupf & 0xfe : 0x0a;
    // migração: reflect boolean antigo → pfMode
    if (pf && pf.mode) pfMode = pf.mode;
    else if (pf && pf.reflect === false) pfMode = 'repeat';
    else pfMode = 'reflect';
    if (pfMode !== 'reflect' && pfMode !== 'repeat' && pfMode !== 'asymmetric' && pfMode !== 'none') pfMode = 'reflect';
    if (typeof coercePfMode === 'function') pfMode = coercePfMode(pfMode);
    // carrega dados antigos e recorta/expande para wantH
    const srcH = pf && pf.height ? pf.height | 0 : wantH;
    const loaded = pf && pf.data ? base64ToPixels(pf.data, srcH) : emptyPixels(wantH);
    pixels = emptyPixels(wantH);
    pixels.set(loaded.subarray(0, Math.min(loaded.length, pixels.length)));
    lineColupf = colorsFromB64(pf && pf.lineColupf, wantH, colupf);
    lineColubk = colorsFromB64(pf && pf.lineColubk, wantH, colubk);
    // se o orçamento mudou, persiste a nova altura
    if (!pf || (pf.height | 0) !== wantH) {
      // defer persist até ter modo ok
    }
    if (pfMode !== 'asymmetric') syncAllRight();
  }

  function persist() {
    const d = ensureData();
    const sid = currentScreenId();
    let pf = findPf(sid);
    const payload = {
      screenId: sid,
      width: W,
      height: height,
      colubk: colubk & 0xfe,
      colupf: colupf & 0xfe,
      mode: pfMode,
      reflect: pfMode === 'reflect',
      data: pixelsToBase64(pixels),
      lineColupf: colorsToB64(lineColupf || new Uint8Array(height)),
      lineColubk: colorsToB64(lineColubk || new Uint8Array(height)),
    };
    if (pf) Object.assign(pf, payload);
    else d.playfields.push(payload);
    if (typeof Project.status === 'function') Project.status('playfield alterado — salve o projeto');
  }

  function pushUndo() {
    if (!pixels) return;
    undoStack.push({
      height,
      pixels: new Uint8Array(pixels),
      lineColupf: lineColupf ? new Uint8Array(lineColupf) : null,
      lineColubk: lineColubk ? new Uint8Array(lineColubk) : null,
      pfMode,
    });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }

  function undo() {
    if (!undoStack.length) {
      if (typeof Project.status === 'function') Project.status('nada para desfazer');
      return;
    }
    const snap = undoStack.pop();
    height = snap.height;
    pixels = snap.pixels;
    lineColupf = snap.lineColupf ? new Uint8Array(snap.lineColupf) : null;
    lineColubk = snap.lineColubk ? new Uint8Array(snap.lineColubk) : null;
    if (snap.pfMode) pfMode = snap.pfMode;
    if (!lineColupf || !lineColubk) ensureLineColors(height);
    // altura sempre amarrada ao orçamento (placar/logo)
    applyPlayHeight(targetPlayHeight());
    const mEl = document.getElementById('pfMode');
    if (mEl) mEl.value = pfMode;
    persist();
    resizeCanvas();
    redraw();
    if (typeof Project.status === 'function') Project.status('desfeito');
  }


  function scoreBarCfg() {
    return ensureData().scoreBar;
  }

  /** Orçamento de scanlines (mesmo critério do Config / AgcBuilder). */
  function getScanlineBudget() {
    if (typeof CONFIG !== 'undefined' && typeof CONFIG.computeScanlineBudget === 'function') {
      try {
        return CONFIG.computeScanlineBudget(ensureData());
      } catch (e) {}
    }
    const sb = scoreBarCfg();
    const tv = ensureData().tv === 'PAL' ? 'PAL' : 'NTSC';
    const scanlines = tv === 'PAL' ? 242 : 192;
    const logoL = Math.max(6, Math.min(16, (sb.logoLines | 0) || 10));
    let scoreL = 0;
    if (sb && sb.position && sb.position !== 'none') {
      const players = Math.max(1, Math.min(2, (sb.players | 0) || 1));
      let bandH = Math.max(7, Math.min(12, (sb.lines | 0) || 8));
      if (players >= 2) bandH = Math.max(6, Math.min(7, bandH));
      scoreL = Math.min(24, bandH * players + (players >= 2 ? 2 : 0));
    }
    return {
      tv,
      scanlines,
      scoreLines: scoreL,
      logoLines: logoL,
      playLines: Math.max(16, scanlines - scoreL - logoL),
    };
  }

  function scoreBarLines() {
    return getScanlineBudget().scoreLines;
  }

  function logoLines() {
    return getScanlineBudget().logoLines;
  }

  /** Altura do editor = só área útil (playLines). */
  function targetPlayHeight() {
    return getScanlineBudget().playLines;
  }

  function applyPlayHeight(nextH) {
    nextH = Math.max(16, Math.min(240, nextH | 0));
    if (nextH === height && pixels && pixels.length === W * height) return false;
    const next = emptyPixels(nextH);
    if (pixels) next.set(pixels.subarray(0, Math.min(pixels.length, next.length)));
    height = nextH;
    pixels = next;
    ensureLineColors(nextH);
    return true;
  }

  function scorePlayableHeight() {
    return targetPlayHeight();
  }

  function ensureScoreVariable() {
    const d = ensureData();
    if (!Array.isArray(d.variables)) d.variables = [];
    const name = scoreBarCfg().variable || 'score';
    if (!d.variables.some((v) => v.name === name)) {
      d.variables.push({
        id: 'var_score_' + Date.now().toString(36),
        name: name,
        type: 'word',
        note: 'Placar (barra inferior)',
      });
    }
  }

  function buildHTML() {
    const root = document.getElementById('mod-playfield');
    if (!root) return;
    const d = ensureData();
    loadForScreen(currentScreenId());
    // garante height = playLines persistido no projeto
    persist();
    const sb = scoreBarCfg();
    const varOpts = (d.variables || [])
      .map(function (v) {
        return (
          '<option value="' +
          escapeAttr(v.name) +
          '" ' +
          (v.name === sb.variable ? 'selected' : '') +
          '>' +
          escapeHtml(v.name) +
          '</option>'
        );
      })
      .join('');

    const screenOpts = d.screens
      .map(
        (s) =>
          `<option value="${s.id}" ${s.id === screenId ? 'selected' : ''}>${escapeHtml(
            s.name || s.id
          )}</option>`
      )
      .join('');

    root.innerHTML = `
      <div class="pf-wrap">
        <div class="pf-toolbar">
          <label>Tela
            <select id="pfScreen">${screenOpts}</select>
          </label>
          <button type="button" class="pf-btn" id="pfAddScreen" title="Nova tela">+ Tela</button>
          <label>Modo PF
            <select id="pfMode">
              ${allowedModes()
                .map((m) => {
                  const labels = {
                    none: 'None (céu / tela preta)',
                    reflect: 'Reflect (rio / metade+espelho)',
                    repeat: 'Repeat (repete)',
                    asymmetric: 'Assimétrico (40 bits)',
                  };
                  return (
                    '<option value="' +
                    m +
                    '" ' +
                    (pfMode === m ? 'selected' : '') +
                    '>' +
                    (labels[m] || m) +
                    '</option>'
                  );
                })
                .join('')}
            </select>
          </label>
          <div class="pf-tools" id="pfEditTools">
            <button type="button" class="pf-tool active" data-tool="paint" title="Pincel (pixels PF)">🖌</button>
            <button type="button" class="pf-tool" data-tool="erase" title="Borracha">⌫</button>
            <button type="button" class="pf-tool" data-tool="fill" title="Balde (preencher)">🪣</button>
            <button type="button" class="pf-tool" data-tool="colbk" title="Pintar COLUBK (fundo da scanline)">BG</button>
            <button type="button" class="pf-tool" data-tool="colpf" title="Pintar COLUPF (cor do PF na scanline)">PF</button>
            <button type="button" class="pf-tool" data-tool="spawn" title="Ponto de spawn">🎯</button>
          </div>
          <div class="pf-tools">
            <label style="font-size:11px;color:#888;display:flex;align-items:center;gap:6px">Zoom
              <select id="pfZoom" style="background:#111;color:#eee;border:1px solid #444;border-radius:5px;padding:4px 6px;font-size:12px">
                <option value="1" ${zoom === 1 ? 'selected' : ''}>1×</option>
                <option value="2" ${zoom === 2 ? 'selected' : ''}>2×</option>
              </select>
            </label>
            <button type="button" class="pf-tool" id="pfUndo" title="Desfazer (Ctrl+Z)">↩</button>
          </div>
          <button type="button" class="pf-btn" id="pfClear">Limpar</button>
          <span class="pf-hint" title="Definido em Configurações (placar + logo)">${(() => {
            const b = getScanlineBudget();
            return `Área útil: <b>40×${b.playLines}</b> · placar ${b.scoreLines} · logo ${b.logoLines} · ${b.tv}`;
          })()}</span>
        </div>
        <div class="pf-body">
          <div class="pf-main-col">
            <div class="pf-canvas-box">
              <canvas id="pfCanvas"></canvas>
            </div>
            <div class="pf-card pf-palette-card" id="pfColorsCard">
              <div class="pf-palette-head">
                <span class="pf-card-title" style="margin:0">Cores TIA</span>
                <div class="tia-radios tia-radios-inline">
                  <label><input type="radio" name="pfColTarget" value="bk" ${
                    colorTarget === 'bk' ? 'checked' : ''
                  }/> <span style="color:#5dade2">COLUBK</span> <code id="pfBkHex">$${(
      colubk & 0xff
    )
      .toString(16)
      .padStart(2, '0')}</code></label>
                  <label><input type="radio" name="pfColTarget" value="pf" ${
                    colorTarget !== 'bk' ? 'checked' : ''
                  }/> <span style="color:#f4a261">COLUPF</span> <code id="pfPfHex">$${(
      colupf & 0xff
    )
      .toString(16)
      .padStart(2, '0')}</code></label>
                  <button type="button" class="pf-btn" id="pfFillAllBk" title="Pintar todas as scanlines com COLUBK selecionado">BG todas</button>
                  <button type="button" class="pf-btn" id="pfFillAllPf" title="Pintar todas as scanlines com COLUPF selecionado">PF todas</button>
                </div>
              </div>
              <div class="tia-palette" id="pfPalette"></div>
            </div>
          </div>
          <div class="pf-bands-col" id="pfBandsCol" style="${styleUsesBands() ? '' : 'display:none'}">
            <div class="pf-card" id="pfBandsCard">
              <div class="pf-card-title">Faixas (herói / inimigos)</div>
              <p class="pf-note">
                Shooter vertical: cada faixa é uma banda horizontal (Y + altura).
                Inimigos usam P1 + NUSIZ (1–3 cópias). Posições X são color clocks (0–152).
              </p>
              <div id="pfBandList" class="pf-band-list"></div>
              <button type="button" class="pf-btn" id="pfAddBand" style="margin-top:8px">+ Faixa inimigos</button>
              <button type="button" class="pf-btn" id="pfAddHeroBand" style="margin-top:6px">+ Faixa herói (P0)</button>
              <div id="pfBandDetail" class="pf-band-detail" style="display:none;margin-top:10px"></div>
            </div>
          </div>
          <div class="pf-side">
            <div class="pf-card">
              <div class="pf-card-title">Modo</div>
              <p class="pf-note" id="pfModeHelp"></p>
            </div>
            
            <div class="pf-card" id="pfRiverCard" style="${styleUsesRiverMap() ? '' : 'display:none'}">
              <div class="pf-card-title">Opções do jogo (River / scroll)</div>
              <p class="pf-note">
                Caminho gerado por algoritmo — sem desenho livre no grid.
                Use Reflect para o rio (metade+espelho) ou None para céu / full-screen.
              </p>
              <div class="pf-band-fields" id="pfRiverFields"></div>
            </div>

            <div class="pf-card" id="pfRacingCard" style="${styleUsesRacing() ? '' : 'display:none'}">
              <div class="pf-card-title">Opções Corrida</div>
              <p class="pf-note">
                <b>Enduro:</b> curvas com bordas em M0/M1/Ball + tabelas HMOVE (não PF assimétrico).
                <b>Top:</b> pista em PF reflect + faixas. P0=carro · P1=oponente mux.
              </p>
              <div class="pf-band-fields" id="pfRacingFields"></div>
            </div>
            <div class="pf-card" id="pfAdventureCard" style="${styleUsesAdventure() ? '' : 'display:none'}">
              <div class="pf-card-title">Opções Adventure / salas</div>
              <p class="pf-note">
                Telas fixas com hard cut. <b>Modo PF é por tela</b> (reflect/repeat baratos;
                none = boss; asymmetric = labirinto, P1 mais limitado).
                P0 = herói · P1 = item ou inimigo (um por vez) · Ball = 2º item opcional.
              </p>
              <div class="pf-band-fields" id="pfAdventureFields"></div>
            </div>
            <div class="pf-card" id="pfFightCard" style="${styleUsesFight() ? '' : 'display:none'}">
              <div class="pf-card-title">Opções de luta (1×1)</div>
              <p class="pf-note">
                P0 e P1 sempre na tela (kernel 2 linhas + VDEL).
                Desenhe o ring no PF em <b>Reflect</b> (cordas/chão simétricos) ou use None.
              </p>
              <div class="pf-band-fields" id="pfFightFields"></div>
            </div>
            <div class="pf-card">
              <div class="pf-card-title">Spawns nesta tela</div>
              <p class="pf-note">Ferramenta 🎯: clique no playfield, dê um nome. Em Programação use Spawnar player → ponto + sprite.</p>
              <div id="pfSpawnList" class="pf-spawn-list"></div>
            </div>
            <div class="pf-card">
              <div class="pf-card-title">Placar / logo</div>
              <p class="pf-note">
                Configuração <b>global</b> em <b>Configurações</b> (acima do estilo de jogo).<br/>
                Agora: <b>${sb.position || 'none'}</b>
                ${sb.position !== 'none' ? ' · ' + (sb.align || 'center') + ' · ' + (sb.digits | 0) + ' dígitos' : ''}<br/>
                Logo rodapé: <b>${sb.logoAlways !== false ? 'sim (' + (sb.logoLines | 0) + ' linhas)' : 'não'}</b>
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
    injectStyles();
    updateModeHelp();
    bind();
    resizeCanvas();
    renderSpawnList();
    renderBandsPanel();
    redraw();
    redraw();
  }

  function updateModeHelp() {
    const el = document.getElementById('pfModeHelp');
    if (el) {
      if (pfMode === 'none') {
        el.innerHTML =
          '<b>None:</b> sem playfield (tela preta). Sem pintura/spawn — arraste as <b>faixas</b> na tela (mover, altura, posição X).';
      } else if (pfMode === 'asymmetric') {
        el.innerHTML =
          '<b>Assimétrico:</b> 40 pixels livres por linha. O kernel precisa reescrever PF0–PF2 no meio da scanline.';
      } else if (pfMode === 'repeat') {
        el.innerHTML =
          '<b>Repeat:</b> só a metade esquerda é editável; a direita repete os mesmos 20 bits (CTRLPF reflect=0).';
      } else {
        el.innerHTML =
          '<b>Reflect:</b> só a metade esquerda é editável; a direita é espelho (CTRLPF reflect=1).';
      }
    }
    updateNoneModeUI();
  }

  /** None: desliga pintura PF e esconde cores TIA */
  function updateNoneModeUI() {
    const isNone = pfMode === 'none';
    const shooter = styleUsesBands();
    const river = styleUsesRiverMap();
    // river: mapa é procedural — sem desenho livre de PF
    const noPaint = isNone || river;
    const noSpawn = shooter || river;
    const tools = document.getElementById('pfEditTools');
    if (tools) {
      const spawnBtn = tools.querySelector('.pf-tool[data-tool="spawn"]');
      if (spawnBtn) {
        spawnBtn.disabled = !!noSpawn;
        spawnBtn.style.opacity = noSpawn ? '0.35' : '';
        spawnBtn.style.pointerEvents = noSpawn ? 'none' : '';
        spawnBtn.title = river
          ? 'River scroll: objetos vêm do gerador de mapa'
          : shooter
            ? 'Shooter vertical: use faixas'
            : 'Ponto de spawn';
        if (noSpawn && tool === 'spawn') {
          spawnBtn.classList.remove('active');
          tool = noPaint ? '' : 'paint';
          const paintBtn = tools.querySelector('.pf-tool[data-tool="paint"]');
          if (paintBtn && !noPaint) paintBtn.classList.add('active');
        }
      }

      tools.querySelectorAll('.pf-tool[data-tool="paint"], .pf-tool[data-tool="erase"], .pf-tool[data-tool="fill"]').forEach((btn) => {
        btn.disabled = !!noPaint;
        btn.style.opacity = noPaint ? '0.35' : '';
        btn.style.pointerEvents = noPaint ? 'none' : '';
        if (noPaint) btn.classList.remove('active');
      });
      if (noPaint && (tool === 'paint' || tool === 'erase' || tool === 'fill' || tool === 'spawn')) {
        tool = '';
      }

      tools.title = river
        ? 'River scroll: PF gerado por algoritmo — use o painel Mapa'
        : shooter
          ? (isNone ? 'Shooter: faixas na tela' : 'Shooter: spawn desligado')
          : '';
    }
    const clearBtn = document.getElementById('pfClear');
    if (clearBtn) {
      clearBtn.disabled = !!noPaint;
      clearBtn.style.opacity = noPaint ? '0.35' : '';
      clearBtn.style.pointerEvents = noPaint ? 'none' : '';
    }
    const colors = document.getElementById('pfColorsCard');
    if (colors) colors.style.display = noPaint ? 'none' : '';
    const canvas = document.getElementById('pfCanvas');
    if (canvas && !shooter && !river) {
      canvas.style.cursor = isNone ? 'default' : 'crosshair';
    }
  }

  function injectStyles() {
    let s = document.getElementById('pf-styles');
    if (!s) {
      s = document.createElement('style');
      s.id = 'pf-styles';
      document.head.appendChild(s);
    }
    s.textContent = `
      .pf-wrap { display:flex; flex-direction:column; height:100%; background:#1e1e1e; }
      .pf-toolbar {
        display:flex; flex-wrap:wrap; gap:10px; align-items:center;
        padding:8px 12px; background:#252526; border-bottom:1px solid #333;
      }
      .pf-toolbar label { font-size:11px; color:#888; display:flex; align-items:center; gap:6px; }
      .pf-toolbar select, .pf-toolbar input[type=number] {
        background:#111; color:#eee; border:1px solid #444; border-radius:5px; padding:4px 6px; font-size:12px;
      }
      .pf-tools { display:flex; gap:4px; align-items:center; }
      .pf-tool {
        width:32px; height:32px; border-radius:6px; border:1px solid #444; background:#2a2a2a;
        color:#ccc; cursor:pointer; font-size:14px;
      }
      .pf-tool.active { border-color:#f4a261; background:#2a2218; color:#f4a261; }
      .pf-btn {
        background:#2a2a2a; border:1px solid #444; color:#ccc; border-radius:6px;
        padding:5px 10px; cursor:pointer; font-size:12px;
      }
      .pf-btn:hover { border-color:#f4a261; }
      .pf-hint { font-size:11px; color:#666; margin-left:auto; }
      .pf-check { font-size:11px; color:#ccc; display:flex; align-items:center; gap:4px; white-space:nowrap; }
      .pf-score-opts { font-size:11px; color:#888; display:flex; align-items:center; gap:4px; }
      .pf-body {
        flex:1; display:flex; flex-wrap:wrap; min-height:0; gap:12px; padding:12px; overflow:auto;
        align-items:flex-start;
      }
      .pf-main-col {
        display:flex; flex-direction:column; gap:10px; align-items:stretch;
        width:max-content; max-width:100%; flex:0 1 auto;
      }
      .pf-canvas-box {
        background:#0a0a0a; border:1px solid #333; border-radius:8px; padding:8px;
        align-self:stretch; line-height:0; box-sizing:border-box;
      }
      #pfCanvas { image-rendering: pixelated; cursor: crosshair; display:block; max-width:100%; height:auto; }
      .pf-palette-card {
        padding:10px 12px !important; width:100%; box-sizing:border-box;
      }
      .pf-palette-head {
        display:flex; flex-wrap:wrap; align-items:center; gap:10px 14px; margin-bottom:8px;
      }
      .pf-bands-col {
        min-width:234px; width:234px; flex:0 0 234px;
        display:flex; flex-direction:column; gap:10px;
      }
      .pf-bands-col .pf-card { flex:1; }
      .pf-tool[data-tool="colbk"] { color:#5dade2; font-size:11px; font-weight:700; }
      .pf-tool[data-tool="colpf"] { color:#f4a261; font-size:11px; font-weight:700; }
      .pf-tool[data-tool="colbk"].active { background:#13202a; border-color:#5dade2; }
      .pf-tool[data-tool="colpf"].active { background:#2a2218; border-color:#f4a261; }
      .pf-spawn-list { display:flex; flex-direction:column; gap:6px; margin-top:8px; max-height:180px; overflow:auto; }
      .pf-spawn-item { display:flex; align-items:center; gap:6px; font-size:11px; background:#111; border:1px solid #333; border-radius:6px; padding:6px 8px; }
      .pf-spawn-item button { margin-left:auto; background:#333; border:1px solid #555; color:#ccc; border-radius:4px; cursor:pointer; font-size:10px; padding:2px 6px; }
      .pf-spawn-item .xy { color:#888; font-family:monospace; }
      .pf-side { width:260px; flex-shrink:0; display:flex; flex-direction:column; gap:10px; }
      .pf-card {
        background:linear-gradient(180deg,#1e222c,#161920); border:1px solid #333;
        border-radius:10px; padding:12px;
      }
      .pf-card-title { font-size:12px; color:#f4a261; font-weight:700; margin-bottom:10px; }
      .pf-card code { color:#8dcea0; font-size:12px; }
      .pf-note { font-size:11px; color:#777; line-height:1.45; margin:0; }
      .pf-note b { color:#aaa; }
      .tia-palette {
        /* 16 hues × 8 luminâncias — largura = canvas (pai) */
        display: grid; grid-template-columns: repeat(16, 1fr); gap: 2px; margin-top: 4px;
        width: 100%;
      }
      .tia-cell {
        aspect-ratio: 2; border-radius: 2px; border: 2px solid transparent;
        cursor: pointer; min-height: 0; min-width: 0; width: 100%; padding: 0;
      }
      .tia-cell:hover { outline: 1px solid #fff8; }
      .tia-cell.sel-pf { border-color: #f4a261; box-shadow: 0 0 0 1px #f4a261; }
      .tia-cell.sel-bk { border-color: #5dade2; box-shadow: 0 0 0 1px #5dade2; }
      .tia-cell.sel-both { border-color: #fff; box-shadow: inset 0 0 0 1px #000; }
      .tia-legend { font-size: 10px; color: #666; margin-top: 6px; line-height: 1.4; }
      .tia-legend span.pf { color: #f4a261; }
      .tia-legend span.bk { color: #5dade2; }
      .tia-radios { display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: #aaa; margin: 6px 0; }
      .tia-radios-inline { flex-direction: row; flex-wrap: wrap; gap: 12px 16px; margin: 0; }
      .tia-radios label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
      .pf-band-list { display:flex; flex-direction:column; gap:4px; max-height:160px; overflow:auto; }
      .pf-band-item {
        padding:6px 8px; background:#12151c; border:1px solid #333; border-radius:6px;
        cursor:pointer; font-size:11px; color:#ccc;
      }
      .pf-band-item.active { border-color:#f4a261; background:#1a1e28; }
      .pf-band-fields {
        display:flex; flex-direction:column; gap:6px; font-size:11px; color:#aaa;
      }
      .pf-band-fields label { display:flex; flex-direction:column; gap:2px; }
      .pf-band-fields input, .pf-band-fields select {
        background:#0d0f14; border:1px solid #333; color:#ddd; border-radius:4px; padding:4px 6px;
      }
      .pf-btn.danger { border-color:#5a2a2a; color:#e88; }
      .pf-river-sec {
        font-size: 10px; font-weight: 700; color: #f4a261; text-transform: uppercase;
        letter-spacing: 0.04em; margin: 10px 0 4px; border-top: 1px solid #333; padding-top: 8px;
      }
      .pf-river-sec:first-child { border-top: none; margin-top: 0; padding-top: 0; }
      #pfRiverFields code { color: #8dcea0; font-size: 11px; }
    `;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function updateSwatches() {
    const bkH = document.getElementById('pfBkHex');
    const pfH = document.getElementById('pfPfHex');
    if (bkH) bkH.textContent = '$' + (colubk & 0xff).toString(16).padStart(2, '0');
    if (pfH) pfH.textContent = '$' + (colupf & 0xff).toString(16).padStart(2, '0');
    document.querySelectorAll('#pfPalette .tia-cell').forEach((el) => {
      const v = parseInt(el.getAttribute('data-c'), 10) & 0xfe;
      const isPf = v === (colupf & 0xfe);
      const isBk = v === (colubk & 0xfe);
      el.classList.remove('sel-pf', 'sel-bk', 'sel-both');
      if (isPf && isBk) el.classList.add('sel-both');
      else if (isPf) el.classList.add('sel-pf');
      else if (isBk) el.classList.add('sel-bk');
    });
  }

  function buildPalette() {
    const root = document.getElementById('pfPalette');
    if (!root) return;
    root.innerHTML = '';
    // Layout clássico Stella: linhas = luminância (8), colunas = hue (16)
    // → 8 fileiras × 16 cores, sem “repetir” visualmente a mesma faixa.
    for (let lum = 0; lum < 8; lum++) {
      for (let hue = 0; hue < 16; hue++) {
        const reg = ((hue << 4) | (lum << 1)) & 0xfe;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tia-cell';
        btn.setAttribute('data-c', String(reg));
        btn.title = '$' + reg.toString(16).padStart(2, '0') + '  hue=' + hue + ' lum=' + lum;
        btn.style.background = tiaCss(reg);
        btn.addEventListener('click', () => {
          if (colorTarget === 'bk') colubk = reg;
          else colupf = reg;
          updateSwatches();
          persist();
          redraw();
        });
        root.appendChild(btn);
      }
    }
    updateSwatches();
  }


  function floodFill(x, y, toVal) {
    if (pfMode === 'none') return;
    // mapeia para metade editável se não assimétrico
    let sx = x;
    if (pfMode !== 'asymmetric') {
      if (x >= 20) sx = pfMode === 'reflect' ? 39 - x : x - 20;
      if (sx < 0 || sx > 19) return;
    } else {
      if (x < 0 || x >= W) return;
    }
    if (y < 0 || y >= height) return;
    const from = pixels[y * W + sx] & 1;
    const to = toVal ? 1 : 0;
    if (from === to) return;
    const maxX = pfMode === 'asymmetric' ? W - 1 : 19;
    const stack = [[sx, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx > maxX || cy >= height) continue;
      if ((pixels[cy * W + cx] & 1) !== from) continue;
      pixels[cy * W + cx] = to;
      if (pfMode !== 'asymmetric') syncRightFromLeft(cy);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  function bind() {
    document.getElementById('pfScreen')?.addEventListener('change', (e) => {
      persist();
      loadForScreen(e.target.value);
      const mEl = document.getElementById('pfMode');
      if (mEl) mEl.value = pfMode;
      updateModeHelp();
      updateSwatches();
      resizeCanvas();
      redraw();
    });

    document.getElementById('pfAddScreen')?.addEventListener('click', () => {
      persist();
      const d = ensureData();
      const n = d.screens.length + 1;
      const name = prompt('Nome da nova tela:', 'Tela ' + n);
      if (name === null) return;
      const id = 'screen_' + Date.now();
      d.screens.push({
        id,
        name: (name || ('Tela ' + n)).trim() || ('Tela ' + n),
        description: '',
      });
      // playfield vazio para a nova tela
      d.playfields.push({
        screenId: id,
        width: W,
        height: H_DEFAULT,
        colubk: 0x00,
        colupf: 0x0a,
        mode: pfMode,
        reflect: pfMode === 'reflect',
        data: pixelsToBase64(emptyPixels(H_DEFAULT)),
        lineColupf: colorsToB64(new Uint8Array(H_DEFAULT).fill(0x0a)),
        lineColubk: colorsToB64(new Uint8Array(H_DEFAULT)),
      });
      screenId = id;
      if (typeof Project.status === 'function') Project.status('nova tela — salve o projeto');
      buildHTML();
    });

    document.getElementById('pfMode')?.addEventListener('change', (e) => {
      pushUndo();
      pfMode = coercePfMode(e.target.value);
      e.target.value = pfMode;
      if (pfMode !== 'asymmetric' && pfMode !== 'none') syncAllRight();
      updateModeHelp();
      persist();
      redraw();
      if (typeof renderAdventurePanel === 'function') renderAdventurePanel();
    });

    document.getElementById('pfAddBand')?.addEventListener('click', () => {
      const d = ensureData();
      const opts =
        typeof CONFIG !== 'undefined' && CONFIG.getProfileOptions
          ? CONFIG.getProfileOptions()
          : {};
      const copies = Math.max(1, Math.min(6, parseInt(opts.enemyCopies, 10) || 6));
      const band = {
        id: uidBand(),
        screenId: currentScreenId(),
        role: 'enemy_row',
        y: 24 + bandsForScreen(currentScreenId()).length * 20,
        height: 16,
        spriteId: (Project.data.sprites && Project.data.sprites[0] && Project.data.sprites[0].id) || '',
        copies,
        spacing: 'close',
        wrap: true,
        baseX: 24,
        xs: [],
        aliveMask: defaultAliveMask(copies),
      };
      band.xs = bandXs(band);
      d.bands.push(band);
      selectedBandId = band.id;
      if (typeof Project.status === 'function') Project.status('faixa criada — salve o projeto');
      renderBandsPanel();
      redraw();
    });

    document.getElementById('pfAddHeroBand')?.addEventListener('click', () => {
      const d = ensureData();
      // só uma faixa herói por tela
      const existing = bandsForScreen(currentScreenId()).find((b) => b.role === 'hero');
      if (existing) {
        selectedBandId = existing.id;
        renderBandsPanel();
        redraw();
        return;
      }
      const band = {
        id: uidBand(),
        screenId: currentScreenId(),
        role: 'hero',
        y: Math.max(0, height - 40),
        height: 16,
        spriteId: (Project.data.sprites && Project.data.sprites[0] && Project.data.sprites[0].id) || '',
        copies: 1,
        spacing: 'close',
        wrap: false,
        baseX: 72,
        xs: [72],
      };
      d.bands.push(band);
      selectedBandId = band.id;
      if (typeof Project.status === 'function') Project.status('faixa herói — salve o projeto');
      renderBandsPanel();
      redraw();
    });

    function setZoom(z) {
      zoom = z === 2 ? 2 : 1;
      const sel = document.getElementById('pfZoom');
      if (sel) sel.value = String(zoom);
      resizeCanvas();
      redraw();
    }
    document.getElementById('pfZoom')?.addEventListener('change', (e) => {
      setZoom(parseInt(e.target.value, 10) === 2 ? 2 : 1);
    });
    document.getElementById('pfUndo')?.addEventListener('click', () => undo());
    document.getElementById('mod-playfield')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    });

    document.querySelectorAll('.pf-tool[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pf-tool[data-tool]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        tool = btn.getAttribute('data-tool');
        if (tool === 'colbk' || tool === 'colpf') {
          colorTarget = tool === 'colbk' ? 'bk' : 'pf';
          const radio = document.querySelector(
            'input[name="pfColTarget"][value="' + colorTarget + '"]'
          );
          if (radio) radio.checked = true;
        }
      });
    });

    document.getElementById('pfFillAllBk')?.addEventListener('click', () => {
      const hex = '$' + (colubk & 0xff).toString(16).padStart(2, '0');
      if (!confirm('Pintar COLUBK em TODAS as ' + height + ' scanlines com a cor ' + hex + '?')) return;
      pushUndo();
      if (!lineColubk || lineColubk.length !== height) ensureLineColors(height);
      const c = colubk & 0xfe;
      for (let y = 0; y < height; y++) lineColubk[y] = c;
      if (typeof Project.status === 'function') Project.status('COLUBK preenchido em todas as linhas — salve');
      persist();
      redraw();
    });
    document.getElementById('pfFillAllPf')?.addEventListener('click', () => {
      const hex = '$' + (colupf & 0xff).toString(16).padStart(2, '0');
      if (!confirm('Pintar COLUPF em TODAS as ' + height + ' scanlines com a cor ' + hex + '?')) return;
      pushUndo();
      if (!lineColupf || lineColupf.length !== height) ensureLineColors(height);
      const c = colupf & 0xfe;
      for (let y = 0; y < height; y++) lineColupf[y] = c;
      if (typeof Project.status === 'function') Project.status('COLUPF preenchido em todas as linhas — salve');
      persist();
      redraw();
    });

    document.getElementById('pfClear')?.addEventListener('click', () => {
      if (!confirm('Limpar todo o playfield desta tela?')) return;
      pushUndo();
      const playH = scorePlayableHeight();
      for (let y = 0; y < playH; y++) {
        for (let x = 0; x < W; x++) pixels[y * W + x] = 0;
      }
      persist();
      redraw();
    });

    function refreshScoreOpts() {
      const on = scoreBarCfg().enabled;
      document.querySelectorAll('.pf-score-opts').forEach((el) => {
        el.style.opacity = on ? '' : '0.45';
        el.style.pointerEvents = on ? '' : 'none';
      });
    }

    document.getElementById('pfScoreBar')?.addEventListener('change', (e) => {
      const sb = scoreBarCfg();
      sb.enabled = !!e.target.checked;
      if (sb.enabled) ensureScoreVariable();
      refreshScoreOpts();
      if (typeof Project.status === 'function') {
        Project.status(sb.enabled ? 'barra de placar ligada — salve o projeto' : 'barra de placar desligada');
      }
      redraw();
    });
    document.getElementById('pfScoreVar')?.addEventListener('change', (e) => {
      scoreBarCfg().variable = e.target.value || 'score';
      ensureScoreVariable();
      if (typeof Project.status === 'function') Project.status('variavel do placar — salve o projeto');
    });
    document.getElementById('pfScoreDigits')?.addEventListener('change', (e) => {
      scoreBarCfg().digits = parseInt(e.target.value, 10) || 6;
      redraw();
      if (typeof Project.status === 'function') Project.status('digitos do placar — salve o projeto');
    });
    document.getElementById('pfScoreLogo')?.addEventListener('change', (e) => {
      scoreBarCfg().showLogo = !!e.target.checked;
      redraw();
      if (typeof Project.status === 'function') Project.status('logo placar — salve o projeto');
    });

    document.getElementById('pfScoreBarSide')?.addEventListener('change', (e) => {
      const sb = scoreBarCfg();
      sb.enabled = !!e.target.checked;
      const main = document.getElementById('pfScoreBar');
      if (main) main.checked = sb.enabled;
      if (sb.enabled) ensureScoreVariable();
      refreshScoreOpts();
      if (typeof Project.status === 'function') {
        Project.status(sb.enabled ? 'barra de placar ligada — salve o projeto' : 'barra de placar desligada');
      }
      redraw();
    });

    document.querySelectorAll('input[name="pfColTarget"]').forEach((r) => {
      r.addEventListener('change', () => {
        colorTarget = r.value === 'bk' ? 'bk' : 'pf';
      });
    });
    buildPalette();

    const canvas = document.getElementById('pfCanvas');
    if (!canvas) return;

    const pos = (ev) => {
      const r = canvas.getBoundingClientRect();
      const { cellW, cellH, gridW } = canvasDims(height);
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      const px = (ev.clientX - r.left) * sx;
      const py = (ev.clientY - r.top) * sy;
      const y = Math.floor(py / cellH);
      // barra de cores à direita (após gap)
      if (px >= gridW + GAP) return { x: -1, y, gutter: true };
      if (px >= gridW) return { x: -1, y, gutter: false, gap: true };
      return { x: Math.floor(px / cellW), y, gutter: false };
    };

    const paintLineColor = (y, forceTarget) => {
      if (y < 0 || y >= height) return;
      if (!lineColupf || lineColupf.length !== height) ensureLineColors(height);
      const tgt = forceTarget || (tool === 'colbk' ? 'bk' : tool === 'colpf' ? 'pf' : colorTarget);
      if (tgt === 'bk') {
        lineColubk[y] = colubk & 0xfe;
        // também atualiza default global se pintar várias linhas
        colorTarget = 'bk';
      } else {
        if (pfMode === 'none') return; // COLUPF irrelevante em none
        lineColupf[y] = colupf & 0xfe;
        colorTarget = 'pf';
      }
    };

    const writePixel = (x, y, val) => {
      if (pfMode === 'none') return;
      if (x < 0 || y < 0 || x >= W || y >= height) return;
      if (pfMode === 'asymmetric') {
        pixels[y * W + x] = val ? 1 : 0;
        return;
      }
      // só edita esquerda 0..19; projeta direita
      let lx = x;
      if (x >= 20) {
        lx = pfMode === 'reflect' ? 39 - x : x - 20;
      }
      if (lx < 0 || lx > 19) return;
      pixels[y * W + lx] = val ? 1 : 0;
      syncRightFromLeft(y);
    };

    canvas.addEventListener('mousedown', (ev) => {
      const p = pos(ev);
      if (p.gap) return;

      // --- interação de faixas (shooter): mover / redimensionar / X inimigos ---
      if (styleUsesBands() && !p.gutter) {
        const { cellW, cellH, gridW } = canvasDims(height);
        const hit = hitTestBand(p.x, p.y, cellW, cellH, gridW);
        if (hit) {
          selectedBandId = hit.band.id;
          bandDrag = {
            type: hit.type,
            bandId: hit.band.id,
            idx: hit.idx != null ? hit.idx : 0,
            startScanY: p.y | 0,
            startColorX: gridToColorX(p.x),
            origY: hit.band.y | 0,
            origH: hit.band.height | 0,
            origBaseX: hit.band.baseX | 0,
            origXs: (hit.band.xs || []).slice(),
          };
          renderBandsPanel();
          redraw();
          ev.preventDefault();
          return;
        }
      }

      // ferramentas de cor de linha: funcionam mesmo em none (COLUBK)
      if (tool === 'colbk' || tool === 'colpf') {
        if (p.y < 0 || p.y >= height) return;
        painting = true;
        pushUndo();
        paintLineColor(p.y, tool === 'colbk' ? 'bk' : 'pf');
        // sincroniza rádio da paleta
        const radio = document.querySelector('input[name="pfColTarget"][value="' + (tool === 'colbk' ? 'bk' : 'pf') + '"]');
        if (radio) radio.checked = true;
        redraw();
        persist();
        ev.preventDefault();
        return;
      }
      // none ou river procedural: sem pintura livre de pixels
      if (pfMode === 'none' || styleUsesRiverMap()) {
        ev.preventDefault();
        return;
      }
      // shooter vertical: sem spawn — inimigos/herói vêm das faixas
      if (styleUsesBands() && tool === 'spawn') {
        ev.preventDefault();
        return;
      }
      if (tool === 'spawn') {
        if (p.gutter || p.x < 0) return;
        const playH = typeof scorePlayableHeight === 'function' ? scorePlayableHeight() : height;
        if (p.y < 0 || p.y >= playH) {
          alert('Spawn deve ficar na área jogável (acima da barra de placar).');
          return;
        }
        const name = prompt('Nome do ponto de spawn:', 'Spawn ' + (spawnsForScreen(currentScreenId()).length + 1));
        if (name === null) return;
        const d = ensureData();
        d.gameObjects.push({
          id: uidSpawn(),
          name: (name || 'Spawn').trim() || 'Spawn',
          kind: 'spawn',
          screenId: currentScreenId(),
          x: gridToColorX(p.x),
          y: p.y | 0,
        });
        if (typeof Project.status === 'function') Project.status('spawn criado');
        renderSpawnList();
        redraw();
        ev.preventDefault();
        return;
      }
      painting = true;
      pushUndo();
      if (p.gutter) {
        paintLineColor(p.y);
      } else if (tool === 'fill') {
        floodFill(p.x, p.y, !(ev.button === 2));
        painting = false;
      } else {
        writePixel(p.x, p.y, tool === 'erase' || ev.button === 2 ? 0 : 1);
      }
      redraw();
      persist();
      ev.preventDefault();
    });
    window.addEventListener('mouseup', () => {
      painting = false;
      if (bandDrag) {
        bandDrag = null;
        if (typeof Project.status === 'function') Project.status('faixa ajustada — salve o projeto');
        renderBandsPanel();
        redraw();
      }
    });
    canvas.addEventListener('mousemove', (ev) => {
      const p = pos(ev);

      // drag de faixa
      if (bandDrag && styleUsesBands()) {
        if (!p.gap && !p.gutter) {
          applyBandDrag(p.y | 0, gridToColorX(p.x));
          redraw();
        }
        // cursor
        const c = document.getElementById('pfCanvas');
        if (c) {
          c.style.cursor =
            bandDrag.type === 'resize-top' || bandDrag.type === 'resize-bottom'
              ? 'ns-resize'
              : bandDrag.type === 'enemy'
                ? 'ew-resize'
                : 'move';
        }
        return;
      }

      // hover cursor sobre faixas
      if (styleUsesBands() && !painting && !p.gap && !p.gutter) {
        const { cellW, cellH, gridW } = canvasDims(height);
        const hit = hitTestBand(p.x, p.y, cellW, cellH, gridW);
        const c = document.getElementById('pfCanvas');
        if (c) {
          if (!hit) c.style.cursor = pfMode === 'none' ? 'default' : 'crosshair';
          else if (hit.type === 'resize-top' || hit.type === 'resize-bottom') c.style.cursor = 'ns-resize';
          else if (hit.type === 'enemy') c.style.cursor = 'ew-resize';
          else c.style.cursor = 'move';
        }
      }

      if (!painting) return;
      if (tool === 'colbk' || tool === 'colpf') {
        if (p.y >= 0 && p.y < height) {
          paintLineColor(p.y, tool === 'colbk' ? 'bk' : 'pf');
          redraw();
        }
        return;
      }
      if (pfMode === 'none') return;
      if (p.gap) return;
      if (p.gutter) paintLineColor(p.y);
      else if (tool === 'fill') return;
      else writePixel(p.x, p.y, tool === 'erase' || ev.buttons === 2 ? 0 : 1);
      redraw();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    renderSpawnList();
  }

  function resizeCanvas() {
    const canvas = document.getElementById('pfCanvas');
    if (!canvas) return;
    const { canvasW, canvasH } = canvasDims(height);
    canvas.width = canvasW;
    canvas.height = canvasH;
  }

  function renderSpawnList() {
    const box = document.getElementById('pfSpawnList');
    if (!box) return;
    const sid = currentScreenId();
    const list = spawnsForScreen(sid);
    if (!list.length) {
      box.innerHTML = '<div class="muted" style="color:#666;font-size:11px">Nenhum spawn nesta tela</div>';
      return;
    }
    box.innerHTML = list
      .map(
        (o) =>
          '<div class="pf-spawn-item" data-id="' +
          o.id +
          '"><span>🎯 <b>' +
          escapeHtml(o.name || 'Spawn') +
          '</b></span><span class="xy">(' +
          (o.x | 0) +
          ',' +
          (o.y | 0) +
          ')</span><button type="button" data-act="ren" title="Renomear">✎</button><button type="button" data-act="del" title="Excluir">🗑</button></div>'
      )
      .join('');
    box.querySelectorAll('.pf-spawn-item').forEach((row) => {
      const id = row.getAttribute('data-id');
      row.querySelector('[data-act="ren"]')?.addEventListener('click', () => {
        const o = ensureData().gameObjects.find((g) => g.id === id);
        if (!o) return;
        const n = prompt('Nome do spawn:', o.name || '');
        if (n === null) return;
        o.name = (n || o.name).trim() || o.name;
        if (typeof Project.status === 'function') Project.status('spawn renomeado');
        renderSpawnList();
        redraw();
      });
      row.querySelector('[data-act="del"]')?.addEventListener('click', () => {
        if (!confirm('Excluir este spawn?')) return;
        const d = ensureData();
        d.gameObjects = d.gameObjects.filter((g) => g.id !== id);
        if (typeof Project.status === 'function') Project.status('spawn removido');
        renderSpawnList();
        redraw();
      });
    });
  }

  function redraw() {
    const canvas = document.getElementById('pfCanvas');
    if (!canvas || !pixels) return;
    if (!lineColupf || lineColupf.length !== height || !lineColubk || lineColubk.length !== height) {
      ensureLineColors(height);
    }
    const { cellW, cellH, gridW, canvasW, canvasH } = canvasDims(height);
    if (canvas.width !== canvasW || canvas.height !== canvasH) {
      canvas.width = canvasW;
      canvas.height = canvasH;
    }
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(canvasW, canvasH);
    const data = img.data;

    // fundo do gap
    for (let y = 0; y < canvasH; y++) {
      for (let x = gridW; x < gridW + GAP; x++) {
        const i = (y * canvasW + x) * 4;
        data[i] = 14;
        data[i + 1] = 14;
        data[i + 2] = 18;
        data[i + 3] = 255;
      }
    }

    for (let y = 0; y < height; y++) {
      const pfC = TIA_NTSC[((lineColupf[y] & 0xfe) >> 1) & 0x7f];
      const bkC = TIA_NTSC[((lineColubk[y] & 0xfe) >> 1) & 0x7f];

      // barra de cores à direita
      const gx0 = gridW + GAP;
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < GUTTER; dx++) {
          const c = dx < GUTTER / 2 ? pfC : bkC;
          const i = ((y * cellH + dy) * canvasW + (gx0 + dx)) * 4;
          data[i] = c[0];
          data[i + 1] = c[1];
          data[i + 2] = c[2];
          data[i + 3] = 255;
        }
      }

      for (let x = 0; x < W; x++) {
        let on;
        if (pfMode === 'asymmetric') {
          on = pixels[y * W + x] & 1;
        } else if (x >= 20) {
          const lx = pfMode === 'reflect' ? 39 - x : x - 20;
          on = pixels[y * W + lx] & 1;
        } else {
          on = pixels[y * W + x] & 1;
        }
        const c = on ? pfC : bkC;
        for (let dy = 0; dy < cellH; dy++) {
          for (let dx = 0; dx < cellW; dx++) {
            const i = ((y * cellH + dy) * canvasW + (x * cellW + dx)) * 4;
            data[i] = c[0];
            data[i + 1] = c[1];
            data[i + 2] = c[2];
            data[i + 3] = 255;
          }
        }
      }
    }

    // separador metade (só visual)
    const mid = 20 * cellW;
    for (let y = 0; y < canvasH; y++) {
      const i = (y * canvasW + mid) * 4;
      data[i] = 80;
      data[i + 1] = 80;
      data[i + 2] = 80;
      data[i + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);

    if (pfMode === 'none') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, gridW, canvasH);
    }

    // Placar e logo ficam FORA desta grade (altura = só playLines do Config).

    // Overlay: pontos de spawn desta tela
    const spawns = spawnsForScreen(currentScreenId());
    const { cellW: cw, cellH: ch, gridW: gw } = canvasDims(height);
    for (const o of spawns) {
      const gx = colorXToGrid(o.x | 0);
      const gy = Math.max(0, Math.min(height - 1, o.y | 0));
      const cx = gx * cw + cw / 2;
      const cy = gy * ch + ch / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(4, cw * 0.7), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(244,162,97,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#f4a261';
      ctx.font = 'bold ' + Math.max(9, Math.floor(ch * 1.2)) + 'px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const label = o.name || 'spawn';
      ctx.fillText(label, cx + 6, cy - 2);
    }

    drawBandsOverlay(ctx, cw, ch, gw);
  }






  function getRacingOpts() {
    const opts =
      (typeof CONFIG !== 'undefined' && CONFIG.getProfileOptions && CONFIG.getProfileOptions()) ||
      (Project.data && Project.data.profileOptions) ||
      {};
    const num = (k, d) => (opts[k] != null && opts[k] !== '' ? Number(opts[k]) : d);
    return {
      camera: opts.camera === 'top' ? 'top' : 'enduro',
      players: Math.max(1, Math.min(2, num('players', 1) || 1)),
      lanes: Math.max(2, Math.min(4, num('lanes', 3) || 3)),
      minRoadWidth: Math.max(4, Math.min(20, num('minRoadWidth', 8) || 8)),
      scrollSpeed: ['slow', 'normal', 'fast'].includes(opts.scrollSpeed) ? opts.scrollSpeed : 'normal',
      maxOpponents: Math.max(1, Math.min(6, num('maxOpponents', 3) || 3)),
      seedMode: opts.seedMode === 'fixed' ? 'fixed' : 'title_entropy',
      seedFixed: Math.max(0, Math.min(255, num('seedFixed', 42) | 0)),
      hmoveStepLines: Math.max(2, Math.min(8, num('hmoveStepLines', 4) || 4)),
    };
  }

  function setRacingOpt(key, val) {
    if (!Project.data) return;
    if (!Project.data.profileOptions) Project.data.profileOptions = {};
    Project.data.profileOptions[key] = val;
    if (key === 'scrollSpeed') {
      if (!Array.isArray(Project.data.variables)) Project.data.variables = [];
      const map = { slow: 1, normal: 2, fast: 3 };
      const n = map[val] != null ? map[val] : 2;
      let v = Project.data.variables.find((x) => x.name === 'scrollSpeed');
      if (!v) {
        Project.data.variables.push({
          id: 'var_scrollSpeed',
          name: 'scrollSpeed',
          value: n,
          note: 'Velocidade scroll pista (1 lento · 2 normal · 3 rápido)',
        });
      } else v.value = n;
    }
    if (typeof Project.status === 'function') Project.status('corrida alterada — salve o projeto');
  }

  function renderRacingPanel() {
    const card = document.getElementById('pfRacingCard');
    const box = document.getElementById('pfRacingFields');
    const banner = document.getElementById('pfRacingBanner');
    const show = styleUsesRacing();
    if (card) card.style.display = show ? '' : 'none';
    if (banner) banner.style.display = show ? '' : 'none';
    if (!box || !show) {
      if (box) box.innerHTML = '';
      return;
    }
    const o = getRacingOpts();
    const enduroOnly = o.camera === 'enduro' ? '' : 'opacity:0.4;pointer-events:none';
    const topOnly = o.camera === 'top' ? '' : 'opacity:0.4;pointer-events:none';
    box.innerHTML =
      '<div class="pf-river-sec">Motor de pista</div>' +
      '<label>Câmera' +
      '<select id="pfRaceCamera">' +
      '<option value="enduro"' +
      (o.camera === 'enduro' ? ' selected' : '') +
      '>Enduro — bordas M/Ball + HMOVE (curvas)</option>' +
      '<option value="top"' +
      (o.camera === 'top' ? ' selected' : '') +
      '>Superior — PF reflect + faixas</option>' +
      '</select></label>' +
      '<label>Jogadores (alternados)' +
      '<input type="number" id="pfRacePlayers" min="1" max="2" value="' +
      o.players +
      '"/></label>' +
      '<div class="pf-river-sec">Pista</div>' +
      '<div style="' +
      topOnly +
      '"><label>Faixas (modo top)' +
      '<input type="number" id="pfRaceLanes" min="2" max="4" value="' +
      o.lanes +
      '"/></label></div>' +
      '<label>Largura mínima' +
      '<input type="number" id="pfRaceMinW" min="4" max="20" value="' +
      o.minRoadWidth +
      '"/></label>' +
      '<label>Velocidade scroll (<code>scrollSpeed</code>)' +
      '<select id="pfRaceSpeed">' +
      '<option value="slow"' +
      (o.scrollSpeed === 'slow' ? ' selected' : '') +
      '>Lento (1)</option>' +
      '<option value="normal"' +
      (o.scrollSpeed === 'normal' ? ' selected' : '') +
      '>Normal (2)</option>' +
      '<option value="fast"' +
      (o.scrollSpeed === 'fast' ? ' selected' : '') +
      '>Rápido (3)</option>' +
      '</select></label>' +
      '<div class="pf-river-sec">Enduro / curvas</div>' +
      '<div style="' +
      enduroOnly +
      '">' +
      '<label>Seed' +
      '<select id="pfRaceSeedMode">' +
      '<option value="title_entropy"' +
      (o.seedMode === 'title_entropy' ? ' selected' : '') +
      '>Aleatória (título)</option>' +
      '<option value="fixed"' +
      (o.seedMode === 'fixed' ? ' selected' : '') +
      '>Fixa</option>' +
      '</select></label>' +
      '<label style="' +
      (o.seedMode === 'fixed' ? '' : 'opacity:0.4;pointer-events:none') +
      '">Seed 0–255' +
      '<input type="number" id="pfRaceSeed" min="0" max="255" value="' +
      o.seedFixed +
      '"/></label>' +
      '<label>HMOVE a cada N linhas' +
      '<input type="number" id="pfRaceHmove" min="2" max="8" value="' +
      o.hmoveStepLines +
      '"/></label>' +
      '<p class="pf-note">Build: tabelas HMOVE L/R independentes; M0/M1/Ball = margens. PF asymmetric <b>não</b> usado para curvar.</p>' +
      '</div>' +
      '<div class="pf-river-sec">Oponentes</div>' +
      '<label>Máx. na tela (P1 mux)' +
      '<input type="number" id="pfRaceOpp" min="1" max="6" value="' +
      o.maxOpponents +
      '"/></label>';

    document.getElementById('pfRaceCamera')?.addEventListener('change', (e) => {
      setRacingOpt('camera', e.target.value);
      renderRacingPanel();
    });
    document.getElementById('pfRacePlayers')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 1;
      v = Math.max(1, Math.min(2, v));
      e.target.value = v;
      setRacingOpt('players', v);
    });
    document.getElementById('pfRaceLanes')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 3;
      v = Math.max(2, Math.min(4, v));
      e.target.value = v;
      setRacingOpt('lanes', v);
    });
    document.getElementById('pfRaceMinW')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 8;
      v = Math.max(4, Math.min(20, v));
      e.target.value = v;
      setRacingOpt('minRoadWidth', v);
    });
    document.getElementById('pfRaceSpeed')?.addEventListener('change', (e) => {
      setRacingOpt('scrollSpeed', e.target.value);
    });
    document.getElementById('pfRaceSeedMode')?.addEventListener('change', (e) => {
      setRacingOpt('seedMode', e.target.value);
      renderRacingPanel();
    });
    document.getElementById('pfRaceSeed')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 0;
      v = Math.max(0, Math.min(255, v));
      e.target.value = v;
      setRacingOpt('seedFixed', v);
    });
    document.getElementById('pfRaceHmove')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 4;
      v = Math.max(2, Math.min(8, v));
      e.target.value = v;
      setRacingOpt('hmoveStepLines', v);
    });
    document.getElementById('pfRaceOpp')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 3;
      v = Math.max(1, Math.min(6, v));
      e.target.value = v;
      setRacingOpt('maxOpponents', v);
    });
  }


  function getAdventureOpts() {
    const opts =
      (typeof CONFIG !== 'undefined' && CONFIG.getProfileOptions && CONFIG.getProfileOptions()) ||
      (Project.data && Project.data.profileOptions) ||
      {};
    const num = (k, d) => (opts[k] != null && opts[k] !== '' ? Number(opts[k]) : d);
    return {
      players: Math.max(1, Math.min(2, num('players', 1) || 1)),
      rooms: opts.rooms !== false && opts.rooms !== 0 && opts.rooms !== '0',
      useBall: opts.useBall !== false && opts.useBall !== 0 && opts.useBall !== '0',
      p1Role: ['auto', 'enemy', 'item'].includes(opts.p1Role) ? opts.p1Role : 'auto',
      allowAsymmetricRooms: opts.allowAsymmetricRooms !== false && opts.allowAsymmetricRooms !== 0 && opts.allowAsymmetricRooms !== '0',
      scoreModePf: !!opts.scoreModePf && opts.scoreModePf !== '0',
    };
  }

  function setAdventureOpt(key, val) {
    if (!Project.data) return;
    if (!Project.data.profileOptions) Project.data.profileOptions = {};
    Project.data.profileOptions[key] = val;
    // se desligar asymmetric rooms e tela atual for asymmetric → coerce
    if (key === 'allowAsymmetricRooms' && !val && pfMode === 'asymmetric') {
      pfMode = 'reflect';
      const mEl = document.getElementById('pfMode');
      if (mEl) mEl.value = 'reflect';
    }
    if (typeof Project.status === 'function') Project.status('adventure alterado — salve o projeto');
  }

  function renderAdventurePanel() {
    const card = document.getElementById('pfAdventureCard');
    const box = document.getElementById('pfAdventureFields');
    const banner = document.getElementById('pfAdventureBanner');
    const show = styleUsesAdventure();
    if (card) card.style.display = show ? '' : 'none';
    if (banner) banner.style.display = show ? '' : 'none';
    if (!box || !show) {
      if (box) box.innerHTML = '';
      return;
    }
    const o = getAdventureOpts();
    // aviso se sala atual asymmetric
    const asymNote =
      pfMode === 'asymmetric'
        ? '<p class="pf-note" style="color:#f4a261">Esta sala está em <b>asymmetric</b>: labirinto livre, mas P1 (item/inimigo) pode falhar na mesma faixa do herói.</p>'
        : pfMode === 'none'
          ? '<p class="pf-note">Sala <b>none</b>: boa para boss / arena aberta.</p>'
          : '<p class="pf-note">Sala <b>' +
            pfMode +
            '</b>: barata no TIA — ideal com inimigo/item estável.</p>';

    box.innerHTML =
      '<div class="pf-river-sec">Jogadores</div>' +
      '<label>Humanos (alternados no P0)' +
      '<input type="number" id="pfAdvPlayers" min="1" max="2" value="' +
      o.players +
      '"/></label>' +
      '<div class="pf-river-sec">Mundo</div>' +
      '<label class="pf-check"><input type="checkbox" id="pfAdvRooms" ' +
      (o.rooms ? 'checked' : '') +
      '/> Várias salas (hard cut entre telas)</label>' +
      '<label>Papel padrão do P1' +
      '<select id="pfAdvP1Role">' +
      '<option value="auto"' +
      (o.p1Role === 'auto' ? ' selected' : '') +
      '>Auto (inimigo ou item)</option>' +
      '<option value="enemy"' +
      (o.p1Role === 'enemy' ? ' selected' : '') +
      '>Inimigo / NPC</option>' +
      '<option value="item"' +
      (o.p1Role === 'item' ? ' selected' : '') +
      '>Item carregável</option>' +
      '</select></label>' +
      '<label class="pf-check"><input type="checkbox" id="pfAdvBall" ' +
      (o.useBall ? 'checked' : '') +
      '/> Ball como segundo item</label>' +
      '<div class="pf-river-sec">Playfield por sala</div>' +
      '<label class="pf-check"><input type="checkbox" id="pfAdvAsym" ' +
      (o.allowAsymmetricRooms ? 'checked' : '') +
      '/> Permitir asymmetric (labirinto)</label>' +
      '<label class="pf-check"><input type="checkbox" id="pfAdvScore" ' +
      (o.scoreModePf ? 'checked' : '') +
      '/> Score mode (cores L/R baratas, geometria ainda simétrica)</label>' +
      asymNote +
      '<p class="pf-note">Troque o <b>Modo PF</b> desta tela no select acima. Reflect/repeat = barato · None = boss · Asymmetric = labirinto (pago).</p>';

    document.getElementById('pfAdvPlayers')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 1;
      v = Math.max(1, Math.min(2, v));
      e.target.value = v;
      setAdventureOpt('players', v);
    });
    document.getElementById('pfAdvRooms')?.addEventListener('change', (e) => {
      setAdventureOpt('rooms', !!e.target.checked);
    });
    document.getElementById('pfAdvP1Role')?.addEventListener('change', (e) => {
      setAdventureOpt('p1Role', e.target.value);
    });
    document.getElementById('pfAdvBall')?.addEventListener('change', (e) => {
      setAdventureOpt('useBall', !!e.target.checked);
    });
    document.getElementById('pfAdvAsym')?.addEventListener('change', (e) => {
      setAdventureOpt('allowAsymmetricRooms', !!e.target.checked);
      // rebuild mode select if asymmetric toggled off
      const mEl = document.getElementById('pfMode');
      if (mEl && !e.target.checked) {
        // remove asymmetric option visually by rebuild
        applyStyleFromConfig();
      } else {
        renderAdventurePanel();
      }
    });
    document.getElementById('pfAdvScore')?.addEventListener('change', (e) => {
      setAdventureOpt('scoreModePf', !!e.target.checked);
    });
  }


  function getFightOpts() {
    const opts =
      (typeof CONFIG !== 'undefined' && CONFIG.getProfileOptions && CONFIG.getProfileOptions()) ||
      (Project.data && Project.data.profileOptions) ||
      {};
    const num = (k, d) => (opts[k] != null && opts[k] !== '' ? Number(opts[k]) : d);
    return {
      camera: opts.camera === 'side' ? 'side' : 'top',
      players: Math.max(1, Math.min(2, num('players', 2) || 2)),
      mirrorArena: opts.mirrorArena !== false && opts.mirrorArena !== 0 && opts.mirrorArena !== '0',
      allowJump: !!opts.allowJump && opts.allowJump !== '0',
      allowCrouch: !!opts.allowCrouch && opts.allowCrouch !== '0',
      rounds: Math.max(1, Math.min(5, num('rounds', 3) || 3)),
      energyStyle: opts.energyStyle === 'street_fighter' ? 'street_fighter' : 'final_fight',
      energyMax: Math.max(8, Math.min(99, num('energyMax', 32) || 32)),
      hudLines: Math.max(4, Math.min(12, num('hudLines', 6) || 6)),
      timerDigits: opts.timerDigits !== false && opts.timerDigits !== 0 && opts.timerDigits !== '0',
      timerStart: Math.max(10, Math.min(99, num('timerStart', 99) || 99)),
    };
  }

  function setFightOpt(key, val) {
    if (!Project.data) return;
    if (!Project.data.profileOptions) Project.data.profileOptions = {};
    Project.data.profileOptions[key] = val;
    if (key === 'mirrorArena' && val && pfMode === 'none') {
      // sugere reflect
    }
    if (key === 'mirrorArena' && val) {
      pfMode = 'reflect';
      const mEl = document.getElementById('pfMode');
      if (mEl) mEl.value = 'reflect';
    }
    // variáveis úteis para programação
    if (!Array.isArray(Project.data.variables)) Project.data.variables = [];
    const ensureVar = (name, value, note) => {
      let v = Project.data.variables.find((x) => x.name === name);
      if (!v) Project.data.variables.push({ id: 'var_' + name, name, value, note });
      else v.value = value;
    };
    if (key === 'energyMax') {
      ensureVar('energyMax', val | 0, 'Energia máxima por lutador');
      ensureVar('energyP0', val | 0, 'Energia atual P0');
      ensureVar('energyP1', val | 0, 'Energia atual P1');
    }
    if (key === 'rounds') ensureVar('rounds', val | 0, 'Rounds da partida');
    if (key === 'timerStart') ensureVar('timer', val | 0, 'Timer do round (HUD)');
    if (key === 'energyStyle') {
      ensureVar('energyStyle', val === 'street_fighter' ? 1 : 0, '0=Final Fight · 1=Street Fighter');
    }
    if (typeof Project.status === 'function') Project.status('luta alterada — salve o projeto');
  }

  function renderFightPanel() {
    const card = document.getElementById('pfFightCard');
    const box = document.getElementById('pfFightFields');
    const banner = document.getElementById('pfFightBanner');
    const show = styleUsesFight();
    if (card) card.style.display = show ? '' : 'none';
    if (banner) banner.style.display = show ? '' : 'none';
    if (!box || !show) {
      if (box) box.innerHTML = '';
      return;
    }
    const o = getFightOpts();
    const sideOnly = o.camera === 'side' ? '' : 'opacity:0.4;pointer-events:none';
    box.innerHTML =
      '<div class="pf-river-sec">Câmera</div>' +
      '<label>Visão' +
      '<select id="pfFightCamera">' +
      '<option value="top"' +
      (o.camera === 'top' ? ' selected' : '') +
      '>Superior (Boxing)</option>' +
      '<option value="side"' +
      (o.camera === 'side' ? ' selected' : '') +
      '>Lateral (Kung-Fu)</option>' +
      '</select></label>' +
      '<div class="pf-river-sec">Jogadores</div>' +
      '<label>Humanos (1 = vs CPU depois)' +
      '<input type="number" id="pfFightPlayers" min="1" max="2" value="' +
      o.players +
      '"/></label>' +
      '<div class="pf-river-sec">Arena</div>' +
      '<label class="pf-check"><input type="checkbox" id="pfFightMirror" ' +
      (o.mirrorArena ? 'checked' : '') +
      '/> Arena espelhada (força Reflect)</label>' +
      '<p class="pf-note">Desenhe cordas/chão na metade esquerda; Reflect completa o ring.</p>' +
      '<div class="pf-river-sec">Movimento (lateral)</div>' +
      '<div style="' +
      sideOnly +
      '">' +
      '<label class="pf-check"><input type="checkbox" id="pfFightJump" ' +
      (o.allowJump ? 'checked' : '') +
      '/> Permitir pulo</label>' +
      '<label class="pf-check"><input type="checkbox" id="pfFightCrouch" ' +
      (o.allowCrouch ? 'checked' : '') +
      '/> Permitir agachar</label>' +
      '</div>' +
      '<div class="pf-river-sec">Partida / HUD</div>' +
      '<label>Rounds' +
      '<input type="number" id="pfFightRounds" min="1" max="5" value="' +
      o.rounds +
      '"/></label>' +
      '<label>Energia (visual no topo)' +
      '<select id="pfEnergyStyle">' +
      '<option value="street_fighter"' +
      (o.energyStyle === 'street_fighter' ? ' selected' : '') +
      '>Street Fighter — barras L e R + timer no centro</option>' +
      '<option value="final_fight"' +
      (o.energyStyle === 'final_fight' ? ' selected' : '') +
      '>Final Fight — barras empilhadas à esquerda</option>' +
      '</select></label>' +
      '<label>Energia máxima' +
      '<input type="number" id="pfFightEnergy" min="8" max="99" value="' +
      o.energyMax +
      '"/></label>' +
      '<label>Linhas do HUD (topo)' +
      '<input type="number" id="pfHudLines" min="4" max="12" value="' +
      o.hudLines +
      '"/></label>' +
      '<label class="pf-check"><input type="checkbox" id="pfTimerDigits" ' +
      (o.timerDigits ? 'checked' : '') +
      '/> Timer 2 dígitos no HUD</label>' +
      '<label>Timer inicial' +
      '<input type="number" id="pfTimerStart" min="10" max="99" value="' +
      o.timerStart +
      '"/></label>' +
      '<p class="pf-note"><b>Street Fighter:</b> PF assimétrico só no topo (barra P0 | timer sprite | barra P1). <b>Final Fight:</b> duas barras uma sobre a outra à esquerda — mais leve no TIA. Ring embaixo continua Reflect. Build do HUD fica para a etapa de kernel.</p>' +
      '<p class="pf-note">Variáveis: <code>energyP0</code>, <code>energyP1</code>, <code>energyMax</code>, <code>rounds</code>, <code>timer</code>.</p>';

    document.getElementById('pfFightCamera')?.addEventListener('change', (e) => {
      setFightOpt('camera', e.target.value);
      renderFightPanel();
    });
    document.getElementById('pfFightPlayers')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 2;
      v = Math.max(1, Math.min(2, v));
      e.target.value = v;
      setFightOpt('players', v);
    });
    document.getElementById('pfFightMirror')?.addEventListener('change', (e) => {
      setFightOpt('mirrorArena', !!e.target.checked);
      updateModeHelp();
      redraw();
    });
    document.getElementById('pfFightJump')?.addEventListener('change', (e) => {
      setFightOpt('allowJump', !!e.target.checked);
    });
    document.getElementById('pfFightCrouch')?.addEventListener('change', (e) => {
      setFightOpt('allowCrouch', !!e.target.checked);
    });
    document.getElementById('pfFightRounds')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 3;
      v = Math.max(1, Math.min(5, v));
      e.target.value = v;
      setFightOpt('rounds', v);
    });
    document.getElementById('pfFightEnergy')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 32;
      v = Math.max(8, Math.min(99, v));
      e.target.value = v;
      setFightOpt('energyMax', v);
    });
    document.getElementById('pfEnergyStyle')?.addEventListener('change', (e) => {
      setFightOpt('energyStyle', e.target.value);
      renderFightPanel();
    });
    document.getElementById('pfHudLines')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 6;
      v = Math.max(4, Math.min(12, v));
      e.target.value = v;
      setFightOpt('hudLines', v);
    });
    document.getElementById('pfTimerDigits')?.addEventListener('change', (e) => {
      setFightOpt('timerDigits', !!e.target.checked);
    });
    document.getElementById('pfTimerStart')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 99;
      v = Math.max(10, Math.min(99, v));
      e.target.value = v;
      setFightOpt('timerStart', v);
    });
  }


  function getMapgenOpts() {
    const opts =
      (typeof CONFIG !== 'undefined' && CONFIG.getProfileOptions && CONFIG.getProfileOptions()) ||
      (Project.data && Project.data.profileOptions) ||
      {};
    const num = (k, d) => (opts[k] != null && opts[k] !== '' ? Number(opts[k]) : d);
    return {
      players: Math.max(1, Math.min(2, num('players', 1) || 1)),
      seedMode: opts.seedMode || 'title_entropy',
      seedFixed: Math.max(0, Math.min(255, num('seedFixed', 42) | 0)),
      riverEdges: (num('riverEdges', 2) | 0) === 4 ? 4 : 2,
      minRiverWidth: Math.max(4, Math.min(16, num('minRiverWidth', 6) || 6)),
      minEdgeGapY: Math.max(4, Math.min(48, num('minEdgeGapY', 12) || 12)),
      checkpointEvery: Math.max(0, Math.min(32, num('checkpointEvery', 8) | 0)),
      checkpointKind: opts.checkpointKind === 'sprite' ? 'sprite' : 'bridge',
      scrollSpeed: ['slow', 'normal', 'fast'].includes(opts.scrollSpeed) ? opts.scrollSpeed : 'normal',
      fuelEnabled: opts.fuelEnabled !== false && opts.fuelEnabled !== 0 && opts.fuelEnabled !== '0',
      fuelMax: Math.max(16, Math.min(255, num('fuelMax', 128) || 128)),
      fuelDrain: Math.max(1, Math.min(8, num('fuelDrain', 1) || 1)),
      fuelDrainFrames: Math.max(1, Math.min(60, num('fuelDrainFrames', 8) || 8)),
      maxMuxSlots: Math.max(2, Math.min(12, num('maxMuxSlots', 6) || 6)),
    };
  }

  function setMapgenOpt(key, val) {
    if (!Project.data) return;
    if (!Project.data.profileOptions) Project.data.profileOptions = {};
    Project.data.profileOptions[key] = val;
    // variável de programa para velocidade (program.js / build)
    if (key === 'scrollSpeed') {
      if (!Array.isArray(Project.data.variables)) Project.data.variables = [];
      let v = Project.data.variables.find((x) => x.name === 'scrollSpeed');
      const map = { slow: 1, normal: 2, fast: 3 };
      const n = map[val] != null ? map[val] : 2;
      if (!v) {
        Project.data.variables.push({
          id: 'var_scrollSpeed',
          name: 'scrollSpeed',
          value: n,
          note: 'Velocidade do scroll PF (1 lento · 2 normal · 3 rápido)',
        });
      } else {
        v.value = n;
      }
    }
    if (typeof Project.status === 'function') Project.status('mapa/rio alterado — salve o projeto');
  }

  function renderRiverMapPanel() {
    const card = document.getElementById('pfRiverCard');
    const box = document.getElementById('pfRiverFields');
    const banner = document.getElementById('pfRiverBanner');
    const show = styleUsesRiverMap();
    if (card) card.style.display = show ? '' : 'none';
    if (banner) banner.style.display = show ? '' : 'none';
    if (!box || !show) {
      if (box) box.innerHTML = '';
      return;
    }
    const o = getMapgenOpts();
    const fuelDisp = o.fuelEnabled ? '' : 'opacity:0.4;pointer-events:none';
    box.innerHTML =
      '<div class="pf-river-sec">Jogadores</div>' +
      '<label>Número (não simultâneos)' +
      '<input type="number" id="pfRiverPlayers" min="1" max="2" value="' +
      o.players +
      '"/></label>' +
      '<div class="pf-river-sec">Mapa / seed</div>' +
      '<label>Seed' +
      '<select id="pfSeedMode">' +
      '<option value="title_entropy"' +
      (o.seedMode === 'title_entropy' ? ' selected' : '') +
      '>Aleatória (contador na tela título)</option>' +
      '<option value="fixed"' +
      (o.seedMode === 'fixed' ? ' selected' : '') +
      '>Fixa (mesmo rio sempre)</option>' +
      '</select></label>' +
      '<label style="' +
      (o.seedMode === 'fixed' ? '' : 'opacity:0.4;pointer-events:none') +
      '">Valor 0–255' +
      '<input type="number" id="pfSeedFixed" min="0" max="255" value="' +
      o.seedFixed +
      '"/></label>' +
      '<div class="pf-river-sec">Geometria do rio</div>' +
      '<label>Bordas no eixo X' +
      '<select id="pfRiverEdges">' +
      '<option value="2"' +
      (o.riverEdges === 2 ? ' selected' : '') +
      '>2 — um canal</option>' +
      '<option value="4"' +
      (o.riverEdges === 4 ? ' selected' : '') +
      '>4 — canal + ilha</option>' +
      '</select></label>' +
      '<label>Largura mínima X (células PF)' +
      '<input type="number" id="pfMinRiverW" min="4" max="16" value="' +
      o.minRiverWidth +
      '"/></label>' +
      '<label>Distância mínima Y entre curvas' +
      '<input type="number" id="pfMinEdgeGapY" min="4" max="48" value="' +
      o.minEdgeGapY +
      '"/></label>' +
      '<p class="pf-note">Drift das bordas (−1/0/+1) é fixo no engine. Y mín. evita zigue-zague injusto.</p>' +
      '<div class="pf-river-sec">Checkpoints</div>' +
      '<label>A cada N blocos (0 = desliga)' +
      '<input type="number" id="pfCheckpointEvery" min="0" max="32" value="' +
      o.checkpointEvery +
      '"/></label>' +
      '<label>Tipo' +
      '<select id="pfCheckpointKind">' +
      '<option value="bridge"' +
      (o.checkpointKind === 'bridge' ? ' selected' : '') +
      '>Ponte (desenhada no PF)</option>' +
      '<option value="sprite"' +
      (o.checkpointKind === 'sprite' ? ' selected' : '') +
      '>Sprite / objeto</option>' +
      '</select></label>' +
      '<div class="pf-river-sec">Velocidade do scroll (PF)</div>' +
      '<label>Preset (variável <code>scrollSpeed</code>)' +
      '<select id="pfScrollSpeed">' +
      '<option value="slow"' +
      (o.scrollSpeed === 'slow' ? ' selected' : '') +
      '>Lento (1)</option>' +
      '<option value="normal"' +
      (o.scrollSpeed === 'normal' ? ' selected' : '') +
      '>Normal (2)</option>' +
      '<option value="fast"' +
      (o.scrollSpeed === 'fast' ? ' selected' : '') +
      '>Rápido (3)</option>' +
      '</select></label>' +
      '<p class="pf-note">Em Programação: altere <b>scrollSpeed</b> por controle ou hitbox (ex.: power-up).</p>' +
      '<div class="pf-river-sec">Combustível</div>' +
      '<label class="pf-check"><input type="checkbox" id="pfFuelEnabled" ' +
      (o.fuelEnabled ? 'checked' : '') +
      '/> Ativar combustível</label>' +
      '<div style="' +
      fuelDisp +
      '">' +
      '<label>Máximo' +
      '<input type="number" id="pfFuelMax" min="16" max="255" value="' +
      o.fuelMax +
      '"/></label>' +
      '<label>Drain (unidades)' +
      '<input type="number" id="pfFuelDrain" min="1" max="8" value="' +
      o.fuelDrain +
      '"/></label>' +
      '<label>A cada N frames' +
      '<input type="number" id="pfFuelDrainFrames" min="1" max="60" value="' +
      o.fuelDrainFrames +
      '"/></label>' +
      '</div>' +
      '<div class="pf-river-sec">Inimigos</div>' +
      '<label>Máx. na tela (multiplex P1)' +
      '<input type="number" id="pfMaxMux" min="2" max="12" value="' +
      o.maxMuxSlots +
      '"/></label>';

    const bindNum = (id, key, min, max) => {
      document.getElementById(id)?.addEventListener('change', (e) => {
        let v = parseInt(e.target.value, 10);
        if (isNaN(v)) v = min;
        v = Math.max(min, Math.min(max, v));
        e.target.value = v;
        setMapgenOpt(key, v);
      });
    };
    bindNum('pfRiverPlayers', 'players', 1, 2);
    document.getElementById('pfSeedMode')?.addEventListener('change', (e) => {
      setMapgenOpt('seedMode', e.target.value);
      renderRiverMapPanel();
    });
    bindNum('pfSeedFixed', 'seedFixed', 0, 255);
    document.getElementById('pfRiverEdges')?.addEventListener('change', (e) => {
      setMapgenOpt('riverEdges', parseInt(e.target.value, 10) || 2);
    });
    bindNum('pfMinRiverW', 'minRiverWidth', 4, 16);
    bindNum('pfMinEdgeGapY', 'minEdgeGapY', 4, 48);
    bindNum('pfCheckpointEvery', 'checkpointEvery', 0, 32);
    document.getElementById('pfCheckpointKind')?.addEventListener('change', (e) => {
      setMapgenOpt('checkpointKind', e.target.value);
    });
    document.getElementById('pfScrollSpeed')?.addEventListener('change', (e) => {
      setMapgenOpt('scrollSpeed', e.target.value);
    });
    document.getElementById('pfFuelEnabled')?.addEventListener('change', (e) => {
      setMapgenOpt('fuelEnabled', !!e.target.checked);
      renderRiverMapPanel();
    });
    bindNum('pfFuelMax', 'fuelMax', 16, 255);
    bindNum('pfFuelDrain', 'fuelDrain', 1, 8);
    bindNum('pfFuelDrainFrames', 'fuelDrainFrames', 1, 60);
    bindNum('pfMaxMux', 'maxMuxSlots', 2, 12);
  }

  function renderBandsPanel() {
    const list = document.getElementById('pfBandList');
    const detail = document.getElementById('pfBandDetail');
    const card = document.getElementById('pfBandsCard');
    if (card) card.style.display = styleUsesBands() ? '' : 'none';
    if (!list) return;
    const sid = currentScreenId();
    const bands = bandsForScreen(sid).sort((a, b) => (a.y | 0) - (b.y | 0));
    if (!bands.length) {
      list.innerHTML =
        '<div style="color:#666;font-size:11px">Nenhuma faixa. Adicione fileiras de inimigos ou a faixa do herói.</div>';
    } else {
      list.innerHTML = bands
        .map((b) => {
          const role = b.role === 'hero' ? '🦸 Herói' : '👾 Inimigos';
          const active = b.id === selectedBandId ? ' active' : '';
          return (
            '<div class="pf-band-item' +
            active +
            '" data-id="' +
            escapeAttr(b.id) +
            '"><span>' +
            role +
            ' · Y=' +
            (b.y | 0) +
            ' h=' +
            (b.height | 0) +
            ' ×' +
            (b.copies | 1) +
            '</span></div>'
          );
        })
        .join('');
      list.querySelectorAll('.pf-band-item').forEach((row) => {
        row.addEventListener('click', () => {
          selectedBandId = row.getAttribute('data-id');
          renderBandsPanel();
          redraw();
        });
      });
    }

    if (!detail) return;
    const band = bands.find((b) => b.id === selectedBandId) || null;
    if (!band) {
      detail.style.display = 'none';
      detail.innerHTML = '';
      return;
    }
    detail.style.display = 'block';
    const xs = bandXs(band);
    const copies = Math.max(1, Math.min(6, band.copies | 0) || 1);
    if (band.aliveMask == null) band.aliveMask = defaultAliveMask(copies);
    detail.innerHTML = `
      <div class="pf-band-fields">
        <label>Papel
          <select id="pfBandRole">
            <option value="enemy_row" ${band.role !== 'hero' ? 'selected' : ''}>Inimigos (fileira)</option>
            <option value="hero" ${band.role === 'hero' ? 'selected' : ''}>Herói (P0)</option>
          </select>
        </label>
        <label>Y (scanline topo)
          <input type="number" id="pfBandY" min="0" max="${height - 1}" value="${band.y | 0}" />
        </label>
        <label>Altura da faixa
          <input type="number" id="pfBandH" min="4" max="48" value="${band.height | 16}" />
        </label>
        <label>Sprite
          <select id="pfBandSprite">${spriteOptionsHtml(band.spriteId || '')}</select>
        </label>
        <label>Instâncias (1–6)
          <input type="number" id="pfBandCopies" min="1" max="6" value="${copies}" ${
            band.role === 'hero' ? 'disabled title="Herói = 1"' : ''
          } />
        </label>
        <label>Espaçamento NUSIZ
          <select id="pfBandSpacing" ${copies <= 1 || band.role === 'hero' ? 'disabled' : ''}>
            <option value="close" ${(band.spacing || 'close') === 'close' ? 'selected' : ''}>Close</option>
            <option value="medium" ${band.spacing === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="wide" ${band.spacing === 'wide' ? 'selected' : ''}>Wide</option>
          </select>
        </label>
        <label>X base / scroll (color clocks)
          <input type="number" id="pfBandBaseX" min="0" max="152" value="${band.baseX | 0}" />
        </label>
        <label>Velocidade H (quadros/passo)
          <input type="number" id="pfBandMoveDelay" min="0" max="255" value="${
            band.moveDelay != null ? band.moveDelay | 0 : 0
          }" ${band.role === 'hero' ? 'disabled' : ''} title="0=parado · 1=1px/frame · N=1px a cada N frames" />
        </label>
        <label>Modo horizontal
          <select id="pfBandMoveMode" ${band.role === 'hero' ? 'disabled' : ''}>
            <option value="wrap" ${(band.moveMode || (band.wrap !== false ? 'wrap' : 'zigzag')) === 'wrap' ? 'selected' : ''}>Wrap (some de um lado, nasce do outro)</option>
            <option value="zigzag" ${(band.moveMode || (band.wrap !== false ? 'wrap' : 'zigzag')) === 'zigzag' ? 'selected' : ''}>Zigue-zague (bate e volta)</option>
          </select>
        </label>
        <div class="pf-note">Xs dos 6 slots (derivados de baseX + NUSIZ): ${xs.join(', ')}</div>
        <div class="pf-note">X inicial = baseX → RAM <b>rowX</b>. No jogo, mova com regras/timer em Programação (variável nativa rowX).</div>
        <div class="pf-note">Âncoras: P0=rowX · P1=rowX+passo · 6 cópias NUSIZ. Vivos: <b>enemyAlive</b> (0–63).</div>
        <button type="button" class="pf-btn danger" id="pfBandDel">Excluir faixa</button>
      </div>`;

    const syncXs = () => {
      const c = band.role === 'hero' ? 1 : Math.max(1, Math.min(6, parseInt(document.getElementById('pfBandCopies').value, 10) || 1));
      band.copies = c;
      band.spacing = document.getElementById('pfBandSpacing').value || 'close';
      band.baseX = Math.max(0, Math.min(152, parseInt(document.getElementById('pfBandBaseX').value, 10) || 0));
      const mdEl = document.getElementById('pfBandMoveDelay');
      if (mdEl) band.moveDelay = Math.max(0, Math.min(255, parseInt(mdEl.value, 10) || 0));
      const mmEl = document.getElementById('pfBandMoveMode');
      if (mmEl) {
        band.moveMode = mmEl.value === 'zigzag' ? 'zigzag' : 'wrap';
        band.wrap = band.moveMode === 'wrap';
      }
      band.xs = bandXs(band);
      const full = defaultAliveMask(c);
      band.aliveMask = (band.aliveMask != null ? band.aliveMask : full) & full;
      if ((band.aliveMask & full) === 0) band.aliveMask = full;
    };

    const commitBandFields = () => {
      const yEl = document.getElementById('pfBandY');
      const hEl = document.getElementById('pfBandH');
      if (yEl) band.y = Math.max(0, Math.min(height - 1, parseInt(yEl.value, 10) || 0));
      if (hEl) band.height = Math.max(4, Math.min(48, parseInt(hEl.value, 10) || 16));
      syncXs();
    };

    document.getElementById('pfBandRole')?.addEventListener('change', (e) => {
      band.role = e.target.value;
      if (band.role === 'hero') {
        band.copies = 1;
        band.xs = [band.baseX | 0];
      }
      if (typeof Project.status === 'function') Project.status('faixa alterada — salve');
      renderBandsPanel();
      redraw();
    });
    // input = enquanto digita/spina; change = ao sair do campo
    ['pfBandY', 'pfBandH', 'pfBandCopies', 'pfBandBaseX', 'pfBandMoveDelay'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const onEdit = () => {
        commitBandFields();
        if (typeof Project.status === 'function') Project.status('faixa alterada — salve');
        // não re-renderiza o painel no input (evita perder foco); só no change
      };
      el.addEventListener('input', onEdit);
      el.addEventListener('change', () => {
        onEdit();
        renderBandsPanel();
        redraw();
      });
    });
    document.getElementById('pfBandSpacing')?.addEventListener('change', () => {
      syncXs();
      if (typeof Project.status === 'function') Project.status('faixa alterada — salve');
      renderBandsPanel();
      redraw();
    });
    document.getElementById('pfBandMoveMode')?.addEventListener('change', (e) => {
      band.moveMode = e.target.value === 'zigzag' ? 'zigzag' : 'wrap';
      band.wrap = band.moveMode === 'wrap';
      if (typeof Project.status === 'function') Project.status('faixa alterada — salve');
      renderBandsPanel();
      redraw();
    });
    document.getElementById('pfBandSprite')?.addEventListener('change', (e) => {
      band.spriteId = e.target.value || '';
      if (typeof Project.status === 'function') Project.status('faixa alterada — salve');
      redraw();
    });
    document.getElementById('pfBandDel')?.addEventListener('click', () => {
      if (!confirm('Excluir esta faixa?')) return;
      const d = ensureData();
      d.bands = (d.bands || []).filter((b) => b.id !== band.id);
      selectedBandId = null;
      if (typeof Project.status === 'function') Project.status('faixa removida — salve');
      renderBandsPanel();
      redraw();
    });
  }


  function findBandById(id) {
    return (ensureData().bands || []).find((b) => b.id === id) || null;
  }

  /**
   * Hit-test sobre faixas no canvas (coords de grid x 0..39, y scanline).
   * Prioridade: marcador inimigo → borda resize → corpo (mover).
   */
  function hitTestBand(gridX, scanY, cellW, cellH, gridW) {
    if (!styleUsesBands()) return null;
    const bands = bandsForScreen(currentScreenId());
    // inimigos (marcadores) primeiro — invertido para pegar o de cima na lista visual
    for (let bi = bands.length - 1; bi >= 0; bi--) {
      const b = bands[bi];
      const y0 = b.y | 0;
      const h = Math.max(1, b.height | 0);
      if (scanY < y0 || scanY >= y0 + h) continue;
      const xs = bandXs(b);
      for (let i = 0; i < xs.length; i++) {
        const gx = colorXToGrid(xs[i]);
        // tolerância ~1 célula
        if (Math.abs(gridX - gx) <= 1) {
          return { type: 'enemy', band: b, idx: i };
        }
      }
    }
    // bordas e corpo (selecionada tem prioridade nas bordas)
    const ordered = bands.slice().sort((a, b) => {
      if (a.id === selectedBandId) return -1;
      if (b.id === selectedBandId) return 1;
      return 0;
    });
    for (const b of ordered) {
      const y0 = b.y | 0;
      const h = Math.max(1, b.height | 0);
      const y1 = y0 + h - 1;
      // resize top: 1 scanline na borda
      if (scanY === y0 || scanY === y0 - 1) {
        return { type: 'resize-top', band: b };
      }
      if (scanY === y1 || scanY === y1 + 1) {
        return { type: 'resize-bottom', band: b };
      }
      if (scanY >= y0 && scanY <= y1) {
        return { type: 'move', band: b };
      }
    }
    return null;
  }


  /** Folga mínima entre faixas (scanlines). Hardware: 1 canal P1 por faixa. */
  const BAND_GAP = 1;

  function otherBands(bandId) {
    return bandsForScreen(currentScreenId()).filter((b) => b.id !== bandId);
  }

  /** Limites verticais para não sobrepor vizinhos (com BAND_GAP de folga). */
  function bandVerticalLimits(bandId) {
    const others = otherBands(bandId);
    let minY = 0;
    let maxBottom = height; // exclusive end scanline index+1 style: max y+h
    for (const o of others) {
      const oy = o.y | 0;
      const oh = Math.max(1, o.height | 0);
      const oEnd = oy + oh; // first free line after band (before gap)
      // se o outro está acima, empurra minY
      // classificamos por centro relativo ao band atual se existir
      const cur = findBandById(bandId);
      const cy = cur ? (cur.y | 0) + ((cur.height | 1) / 2) : oy;
      const oc = oy + oh / 2;
      if (oc <= cy) {
        // other is above (or same): floor is oEnd + GAP
        minY = Math.max(minY, oEnd + BAND_GAP);
      } else {
        // other is below: ceiling is oy - GAP
        maxBottom = Math.min(maxBottom, oy - BAND_GAP);
      }
    }
    return { minY, maxBottom };
  }

  function clampBandNoOverlap(b) {
    if (!b) return;
    let y = Math.max(0, b.y | 0);
    let h = Math.max(4, Math.min(48, b.height | 0));
    const { minY, maxBottom } = bandVerticalLimits(b.id);
    y = Math.max(y, minY);
    if (y + h > maxBottom) {
      // tenta reduzir altura; se não couber, gruda no teto
      h = Math.max(4, maxBottom - y);
      if (y + h > maxBottom) {
        y = Math.max(minY, maxBottom - h);
        h = Math.max(4, maxBottom - y);
      }
    }
    if (y + h > height) {
      h = Math.max(4, height - y);
    }
    b.y = y;
    b.height = h;
  }


  function applyBandDrag(scanY, colorX) {
    if (!bandDrag) return;
    const b = findBandById(bandDrag.bandId);
    if (!b) return;
    if (bandDrag.type === 'move') {
      let ny = (bandDrag.origY | 0) + (scanY - bandDrag.startScanY);
      b.y = ny;
      clampBandNoOverlap(b);
    } else if (bandDrag.type === 'resize-top') {
      const bottom = (bandDrag.origY | 0) + (bandDrag.origH | 1);
      let ny = (bandDrag.origY | 0) + (scanY - bandDrag.startScanY);
      ny = Math.min(ny, bottom - 4);
      b.y = ny;
      b.height = bottom - ny;
      clampBandNoOverlap(b);
      // preserva o fundo original se o clamp empurrar
      const newBottom = (b.y | 0) + (b.height | 0);
      if (newBottom !== bottom && bottom <= height) {
        // ok
      }
    } else if (bandDrag.type === 'resize-bottom') {
      let nh = (bandDrag.origH | 1) + (scanY - bandDrag.startScanY);
      nh = Math.max(4, Math.min(48, nh));
      b.height = nh;
      clampBandNoOverlap(b);
    } else if (bandDrag.type === 'enemy') {
      const dx = colorX - bandDrag.startColorX;
      let nb = (bandDrag.origBaseX | 0) + dx;
      nb = Math.max(0, Math.min(152, nb));
      b.baseX = nb;
      b.xs = bandXs(b);
    }
  }


  function drawBandsOverlay(ctx, cellW, cellH, gridW) {
    if (!styleUsesBands()) return;
    const bands = bandsForScreen(currentScreenId());
    for (const b of bands) {
      const y0 = (b.y | 0) * cellH;
      const h = Math.max(1, b.height | 0) * cellH;
      const sel = b.id === selectedBandId;
      ctx.fillStyle = b.role === 'hero' ? 'rgba(52,152,219,0.18)' : 'rgba(231,76,60,0.16)';
      if (sel) ctx.fillStyle = b.role === 'hero' ? 'rgba(52,152,219,0.32)' : 'rgba(231,76,60,0.28)';
      ctx.fillRect(0, y0, gridW, h);
      ctx.strokeStyle = sel ? '#f4a261' : b.role === 'hero' ? '#3498db' : '#e74c3c';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash(sel ? [] : [4, 3]);
      ctx.strokeRect(0.5, y0 + 0.5, gridW - 1, h - 1);
      ctx.setLineDash([]);
      // handles de altura (crop vertical) na faixa selecionada
      if (sel) {
        const hw = Math.min(48, gridW * 0.25);
        const hx = (gridW - hw) / 2;
        const hh = Math.max(4, Math.min(8, cellH));
        ctx.fillStyle = '#f4a261';
        ctx.fillRect(hx, y0 - hh / 2, hw, hh);
        ctx.fillRect(hx, y0 + h - hh / 2, hw, hh);
      }
      // markers X (arrastáveis)
      const xs = bandXs(b);
      for (const x of xs) {
        const gx = colorXToGrid(x);
        const cx = gx * cellW + cellW / 2;
        const cy = y0 + h / 2;
        const r = Math.max(5, cellW * 0.7);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = b.role === 'hero' ? '#3498db' : '#e74c3c';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.fillStyle = '#ddd';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(
        (b.role === 'hero'
          ? 'P0 '
          : (b.copies | 0) >= 4
            ? 'P0+P1×' + (b.copies | 0) + ' '
            : 'P1×' + (b.copies | 1) + ' ') +
          'Y' +
          (b.y | 0) +
          ' h' +
          (b.height | 0),
        4,
        y0 + 2
      );
    }
  }


  function flush() {
    if (pixels) persist();
    // Garante que copies/spacing/baseX do formulário da faixa selecionada
    // entram no Project.data antes do Build (mesmo sem blur no input).
    if (selectedBandId) {
      const band = findBandById(selectedBandId);
      if (band) {
        const cEl = document.getElementById('pfBandCopies');
        const sEl = document.getElementById('pfBandSpacing');
        const xEl = document.getElementById('pfBandBaseX');
        const yEl = document.getElementById('pfBandY');
        const hEl = document.getElementById('pfBandH');
        if (yEl) band.y = Math.max(0, Math.min(height - 1, parseInt(yEl.value, 10) || 0));
        if (hEl) band.height = Math.max(4, Math.min(48, parseInt(hEl.value, 10) || 16));
        if (cEl) band.copies = band.role === 'hero' ? 1 : Math.max(1, Math.min(6, parseInt(cEl.value, 10) || 1));
        if (sEl) band.spacing = sEl.value || 'close';
        if (xEl) band.baseX = Math.max(0, Math.min(152, parseInt(xEl.value, 10) || 0));
        const mdEl = document.getElementById('pfBandMoveDelay');
        if (mdEl) band.moveDelay = Math.max(0, Math.min(255, parseInt(mdEl.value, 10) || 0));
        const mmEl = document.getElementById('pfBandMoveMode');
        if (mmEl) {
          band.moveMode = mmEl.value === 'zigzag' ? 'zigzag' : 'wrap';
          band.wrap = band.moveMode === 'wrap';
        }
        band.xs = bandXs(band);
        if (band.role !== 'hero') {
          const full = defaultAliveMask(band.copies);
          band.aliveMask = (band.aliveMask != null ? band.aliveMask : full) & full;
        }
      }
    }
  }

  function init() {
    buildHTML();
  }

  function applyStyleFromConfig() {
    if (typeof coercePfMode === 'function') pfMode = coercePfMode(pfMode);
    buildHTML();
  }

  return { init, flush, applyStyleFromConfig, buildHTML };
})();

window.PLAYFIELD = PLAYFIELD;
