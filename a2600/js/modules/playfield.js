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

  let screenId = null;
  let height = H_DEFAULT;
  let pixels = null;
  let colubk = 0x00;
  let colupf = 0x0a;
  let lineColupf = null;
  let lineColubk = null;
  let colorTarget = 'pf';
  let pfMode = 'reflect'; // reflect | repeat | asymmetric
  let tool = 'paint';
  let painting = false;
  let zoom = 1;
  const undoStack = [];

  const TIA_NTSC = buildTiaNtsc();

  function buildTiaNtsc() {
    const out = new Array(128);
    for (let i = 0; i < 128; i++) {
      const hue = (i >> 1) & 0x0f;
      const lum = i & 0x0e;
      if (hue === 0) {
        const g = Math.min(255, 16 + lum * 16);
        out[i] = [g, g, g];
      } else {
        const h = ((hue - 1) / 14) * 360;
        const l = 0.18 + (lum / 14) * 0.55;
        out[i] = hslToRgb(h, 0.75, l);
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
    const z = Math.max(1, Math.min(4, zoom | 0));
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
    return Project.data;
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
    height = pf && pf.height ? pf.height | 0 : H_DEFAULT;
    if (height < 16) height = 16;
    if (height > 240) height = 240;
    colubk = pf && pf.colubk != null ? pf.colubk & 0xfe : 0x00;
    colupf = pf && pf.colupf != null ? pf.colupf & 0xfe : 0x0a;
    // migração: reflect boolean antigo → pfMode
    if (pf && pf.mode) pfMode = pf.mode;
    else if (pf && pf.reflect === false) pfMode = 'repeat';
    else pfMode = 'reflect';
    if (pfMode !== 'reflect' && pfMode !== 'repeat' && pfMode !== 'asymmetric') pfMode = 'reflect';
    pixels = pf && pf.data ? base64ToPixels(pf.data, height) : emptyPixels(height);
    lineColupf = colorsFromB64(pf && pf.lineColupf, height, colupf);
    lineColubk = colorsFromB64(pf && pf.lineColubk, height, colubk);
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
    const hEl = document.getElementById('pfHeight');
    if (hEl) hEl.value = height;
    const mEl = document.getElementById('pfMode');
    if (mEl) mEl.value = pfMode;
    persist();
    resizeCanvas();
    redraw();
    if (typeof Project.status === 'function') Project.status('desfeito');
  }

  function buildHTML() {
    const root = document.getElementById('mod-playfield');
    if (!root) return;
    const d = ensureData();
    loadForScreen(currentScreenId());

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
          <label>Altura
            <input id="pfHeight" type="number" min="16" max="240" value="${height}" style="width:64px" />
          </label>
          <label>Modo PF
            <select id="pfMode">
              <option value="reflect" ${pfMode === 'reflect' ? 'selected' : ''}>Reflect (espelho)</option>
              <option value="repeat" ${pfMode === 'repeat' ? 'selected' : ''}>Repeat (repete)</option>
              <option value="asymmetric" ${pfMode === 'asymmetric' ? 'selected' : ''}>Assimétrico (40 bits)</option>
            </select>
          </label>
          <div class="pf-tools">
            <button type="button" class="pf-tool active" data-tool="paint" title="Pincel">🖌</button>
            <button type="button" class="pf-tool" data-tool="erase" title="Borracha">⌫</button>
            <button type="button" class="pf-tool" data-tool="fill" title="Balde (preencher)">🪣</button>
          </div>
          <div class="pf-tools">
            <button type="button" class="pf-tool" id="pfZoomOut" title="Zoom −">−</button>
            <span id="pfZoomLabel" style="font-size:11px;color:#aaa;min-width:28px;text-align:center">${zoom}×</span>
            <button type="button" class="pf-tool" id="pfZoomIn" title="Zoom +">+</button>
            <button type="button" class="pf-tool" id="pfUndo" title="Desfazer (Ctrl+Z)">↩</button>
          </div>
          <button type="button" class="pf-btn" id="pfClear">Limpar</button>
          <span class="pf-hint">40×${height} · 4:3 · cores na barra à direita</span>
        </div>
        <div class="pf-body">
          <div class="pf-canvas-box">
            <canvas id="pfCanvas"></canvas>
          </div>
          <div class="pf-side">
            <div class="pf-card">
              <div class="pf-card-title">Cores TIA</div>
              <div class="tia-radios">
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
              </div>
              <div class="tia-palette" id="pfPalette"></div>
              <div class="tia-legend">
                Selecione a cor e clique na <b>barra à direita</b> do grid para pintar a scanline.
                <span class="pf">Laranja</span> = COLUPF · <span class="bk">Azul</span> = COLUBK
              </div>
            </div>
            <div class="pf-card">
              <div class="pf-card-title">Modo</div>
              <p class="pf-note" id="pfModeHelp"></p>
            </div>
          </div>
        </div>
      </div>
    `;
    injectStyles();
    updateModeHelp();
    bind();
    resizeCanvas();
    redraw();
  }

  function updateModeHelp() {
    const el = document.getElementById('pfModeHelp');
    if (!el) return;
    if (pfMode === 'asymmetric') {
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

  function injectStyles() {
    if (document.getElementById('pf-styles')) return;
    const s = document.createElement('style');
    s.id = 'pf-styles';
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
      .pf-body { flex:1; display:flex; min-height:0; gap:12px; padding:12px; overflow:auto; }
      .pf-canvas-box {
        background:#0a0a0a; border:1px solid #333; border-radius:8px; padding:8px;
        align-self:flex-start; line-height:0;
      }
      #pfCanvas { image-rendering: pixelated; cursor: crosshair; display:block; max-width:100%; height:auto; }
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
        display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; margin-top: 6px;
      }
      .tia-cell {
        aspect-ratio: 1; border-radius: 3px; border: 2px solid transparent;
        cursor: pointer; min-height: 16px; padding: 0;
      }
      .tia-cell:hover { outline: 1px solid #fff8; }
      .tia-cell.sel-pf { border-color: #f4a261; box-shadow: 0 0 0 1px #f4a261; }
      .tia-cell.sel-bk { border-color: #5dade2; box-shadow: 0 0 0 1px #5dade2; }
      .tia-cell.sel-both { border-color: #fff; box-shadow: inset 0 0 0 1px #000; }
      .tia-legend { font-size: 10px; color: #666; margin-top: 6px; line-height: 1.4; }
      .tia-legend span.pf { color: #f4a261; }
      .tia-legend span.bk { color: #5dade2; }
      .tia-radios { display: flex; flex-direction: column; gap: 6px; font-size: 11px; color: #aaa; margin: 6px 0; }
      .tia-radios label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    `;
    document.head.appendChild(s);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    for (let i = 0; i < 128; i++) {
      const reg = (i << 1) & 0xfe;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tia-cell';
      btn.setAttribute('data-c', String(reg));
      btn.title = '$' + reg.toString(16).padStart(2, '0');
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
    updateSwatches();
  }


  function floodFill(x, y, toVal) {
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
      document.getElementById('pfHeight').value = height;
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

    document.getElementById('pfHeight')?.addEventListener('change', (e) => {
      let h = parseInt(e.target.value, 10) || H_DEFAULT;
      h = Math.max(16, Math.min(240, h));
      e.target.value = h;
      const next = emptyPixels(h);
      next.set(pixels.subarray(0, Math.min(pixels.length, next.length)));
      height = h;
      pixels = next;
      ensureLineColors(h);
      resizeCanvas();
      persist();
      redraw();
    });

    document.getElementById('pfMode')?.addEventListener('change', (e) => {
      pushUndo();
      pfMode = e.target.value;
      if (pfMode !== 'asymmetric') syncAllRight();
      updateModeHelp();
      persist();
      redraw();
    });

    function setZoom(z) {
      zoom = Math.max(1, Math.min(4, z | 0));
      const lab = document.getElementById('pfZoomLabel');
      if (lab) lab.textContent = zoom + '×';
      resizeCanvas();
      redraw();
    }
    document.getElementById('pfZoomIn')?.addEventListener('click', () => setZoom(zoom + 1));
    document.getElementById('pfZoomOut')?.addEventListener('click', () => setZoom(zoom - 1));
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
      });
    });

    document.getElementById('pfClear')?.addEventListener('click', () => {
      if (!confirm('Limpar todo o playfield desta tela?')) return;
      pushUndo();
      pixels = emptyPixels(height);
      persist();
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

    const paintLineColor = (y) => {
      if (y < 0 || y >= height) return;
      if (!lineColupf || lineColupf.length !== height) ensureLineColors(height);
      if (colorTarget === 'bk') lineColubk[y] = colubk & 0xfe;
      else lineColupf[y] = colupf & 0xfe;
    };

    const writePixel = (x, y, val) => {
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
      painting = true;
      pushUndo();
      const p = pos(ev);
      if (p.gap) {
        painting = false;
        return;
      }
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
    });
    canvas.addEventListener('mousemove', (ev) => {
      if (!painting) return;
      const p = pos(ev);
      if (p.gap) return;
      if (p.gutter) paintLineColor(p.y);
      else if (tool === 'fill') return;
      else writePixel(p.x, p.y, tool === 'erase' || ev.buttons === 2 ? 0 : 1);
      redraw();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function resizeCanvas() {
    const canvas = document.getElementById('pfCanvas');
    if (!canvas) return;
    const { canvasW, canvasH } = canvasDims(height);
    canvas.width = canvasW;
    canvas.height = canvasH;
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
  }

  function flush() {
    if (pixels) persist();
  }

  function init() {
    buildHTML();
  }

  return { init, flush };
})();

window.PLAYFIELD = PLAYFIELD;
