/**
 * PLAYFIELD — editor de playfield Atari 2600
 *
 * Hardware real:
 *  - 20 bits por scanline (PF0 4 + PF1 8 + PF2 8) no lado esquerdo
 *  - lado direito = refletido (CTRLPF reflect) ou repetido
 *  - cada pixel de PF = 4 color clocks → 40 “pixels” na tela cheia
 *  - cores: COLUBK (fundo) e COLUPF (playfield/bola)
 *
 * No .agc: Project.data.playfields[] — um por tela (screenId)
 */
const PLAYFIELD = (() => {
  const W = 40;          // pixels lógicos na largura cheia
  const H_DEFAULT = 192; // linhas NTSC úteis (aprox.)
  // Proporção 4:3 da TV: pixels de PF são bem mais largos que altos
  const CELL_H = 3;      // px de tela por linha de scanline no editor

  /** Tamanho de célula e canvas para a tela inteira ficar ~4:3 */
  function cellSize(h) {
    const z = Math.max(1, Math.min(4, zoom | 0));
    const cellH = CELL_H * z;
    const cellW = Math.max(2, Math.round(cellH * (4 / 3) * h / W));
    return {
      cellW,
      cellH,
      canvasW: W * cellW,
      canvasH: h * cellH,
      zoom: z,
    };
  }

  function pushUndo() {
    if (!pixels) return;
    undoStack.push({
      height: height,
      pixels: new Uint8Array(pixels),
      lineColupf: lineColupf ? new Uint8Array(lineColupf) : null,
      lineColubk: lineColubk ? new Uint8Array(lineColubk) : null,
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
    if (!lineColupf || !lineColubk) ensureLineColors(height);
    const hEl = document.getElementById('pfHeight');
    if (hEl) hEl.value = height;
    persist();
    resizeCanvas();
    redraw();
    if (typeof Project.status === 'function') Project.status('desfeito');
  }

  let screenId = null;
  let height = H_DEFAULT;
  let pixels = null;     // Uint8Array length W*height, 0/1
  let colubk = 0x00;     // TIA 7-bit hue/lum packed as 0x00-0xFE even
  let colupf = 0x0A;
  let lineColupf = null; // Uint8Array — COLUPF por scanline
  let lineColubk = null; // Uint8Array — COLUBK por scanline
  let colorLineMode = false;
  let colorTarget = 'pf'; // 'pf' | 'bk' ao pintar linha
  let reflect = true;    // CTRLPF reflect bit
  let tool = 'paint';    // paint | erase | fill
  let painting = false;
  let zoom = 1;           // 1..4
  const undoStack = [];
  const UNDO_MAX = 40;


  // Paleta TIA NTSC aproximada (128 cores, índices pares 0..254)
  const TIA_NTSC = buildTiaNtsc();

  function buildTiaNtsc() {
    // Aproximação HSV→RGB das 128 cores TIA (suficiente para editor)
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
        const s = 0.75;
        out[i] = hslToRgb(h, s, l);
      }
    }
    return out;
  }

  function hslToRgb(h, s, l) {
    h /= 360;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function tiaCss(idx) {
    const i = (idx >> 1) & 0x7f;
    const c = TIA_NTSC[i] || [0, 0, 0];
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
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

  function currentScreenId() {
    const d = ensureData();
    if (screenId && d.screens.some((s) => s.id === screenId)) return screenId;
    screenId = d.screens[0].id;
    return screenId;
  }

  function findPf(sid) {
    const d = ensureData();
    return d.playfields.find((p) => p.screenId === sid) || null;
  }

  function loadForScreen(sid) {
    screenId = sid;
    const pf = findPf(sid);
    height = (pf && pf.height) ? (pf.height | 0) : H_DEFAULT;
    if (height < 16) height = 16;
    if (height > 240) height = 240;
    colubk = pf && pf.colubk != null ? pf.colubk & 0xfe : 0x00;
    colupf = pf && pf.colupf != null ? pf.colupf & 0xfe : 0x0a;
    reflect = pf ? pf.reflect !== false : true;
    pixels = pf && pf.data ? base64ToPixels(pf.data, height) : emptyPixels(height);
    lineColupf = colorsFromB64(pf && pf.lineColupf, height, colupf);
    lineColubk = colorsFromB64(pf && pf.lineColubk, height, colubk);
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
      reflect: !!reflect,
      data: pixelsToBase64(pixels),
      lineColupf: colorsToB64(lineColupf || new Uint8Array(height)),
      lineColubk: colorsToB64(lineColubk || new Uint8Array(height)),
    };
    if (pf) Object.assign(pf, payload);
    else d.playfields.push(payload);
    if (typeof Project.status === 'function') Project.status('playfield alterado — salve o projeto');
  }

  function buildHTML() {
    const root = document.getElementById('mod-playfield');
    if (!root) return;
    const d = ensureData();
    loadForScreen(currentScreenId());

    const screenOpts = d.screens.map((s) =>
      `<option value="${s.id}" ${s.id === screenId ? 'selected' : ''}>${escapeHtml(s.name || s.id)}</option>`
    ).join('');

    root.innerHTML = `
      <div class="pf-wrap">
        <div class="pf-toolbar">
          <label>Tela
            <select id="pfScreen">${screenOpts}</select>
          </label>
          <label>Altura
            <input id="pfHeight" type="number" min="16" max="240" value="${height}" style="width:64px" />
          </label>
          <div class="pf-tools">
            <button type="button" class="pf-tool active" data-tool="paint" title="Pintar">🖌</button>
            <button type="button" class="pf-tool" data-tool="erase" title="Apagar">⌫</button>
            <button type="button" class="pf-tool" data-tool="fill" title="Preencher">🪣</button>
            <button type="button" class="pf-tool" id="pfColorLine" title="Cor por scanline">🎨</button>
          </div>
          <div class="pf-tools">
            <button type="button" class="pf-tool" id="pfZoomOut" title="Zoom −">−</button>
            <span id="pfZoomLabel" style="font-size:11px;color:#aaa;min-width:28px;text-align:center">1×</span>
            <button type="button" class="pf-tool" id="pfZoomIn" title="Zoom +">+</button>
            <button type="button" class="pf-tool" id="pfUndo" title="Desfazer (Ctrl+Z)">↩</button>
          </div>
          <label class="pf-check"><input type="checkbox" id="pfReflect" ${reflect ? 'checked' : ''}/> Reflect (espelhar)</label>
          <button type="button" class="pf-btn" id="pfClear">Limpar</button>
          <span class="pf-hint">40×${height} · preview 4:3 · PF0/PF1/PF2 · clique pinta · direito apaga</span>
        </div>
        <div class="pf-body">
          <div class="pf-canvas-box">
            <canvas id="pfCanvas"></canvas>
          </div>
          <div class="pf-side">
            <div class="pf-card">
              <div class="pf-card-title">Cores TIA</div>
              <div class="tia-radios">
                <label><input type="radio" name="pfColTarget" value="bk" ${colorTarget === 'bk' ? 'checked' : ''}/> <span style="color:#5dade2">COLUBK</span> <code id="pfBkHex">$${colubk.toString(16).padStart(2,'0')}</code></label>
                <label><input type="radio" name="pfColTarget" value="pf" ${colorTarget !== 'bk' ? 'checked' : ''}/> <span style="color:#f4a261">COLUPF</span> <code id="pfPfHex">$${colupf.toString(16).padStart(2,'0')}</code></label>
              </div>
              <div class="tia-palette" id="pfPalette"></div>
              <div class="tia-legend">
                <span class="pf">Laranja</span> = COLUPF ·
                <span class="bk">Azul</span> = COLUBK ·
                borda branca = as duas iguais
              </div>
            </div>
            <div class="pf-card">
              <div class="pf-card-title">Hardware</div>
              <p class="pf-note">
                Cada linha = 20 bits (PF0–PF2). Com <b>🎨</b> muda
                <b>COLUPF/COLUBK por scanline</b> (faixa à esquerda do grid).
                Reflect espelha o lado direito.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    injectStyles();
    bind();
    redraw();
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
      .pf-tools { display:flex; gap:4px; }
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
      .pf-check { font-size:11px; color:#aaa; }
      .pf-hint { font-size:11px; color:#666; margin-left:auto; }
      .pf-body { flex:1; display:flex; min-height:0; gap:12px; padding:12px; overflow:auto; }
      .pf-canvas-box {
        background:#0a0a0a; border:1px solid #333; border-radius:8px; padding:8px;
        align-self:flex-start; line-height:0;
      }
      #pfCanvas { image-rendering: pixelated; cursor: crosshair; display:block; max-width:100%; height:auto; }
      .pf-side { width:240px; flex-shrink:0; display:flex; flex-direction:column; gap:10px; }
      .pf-card {
        background:linear-gradient(180deg,#1e222c,#161920); border:1px solid #333;
        border-radius:10px; padding:12px;
      }
      .pf-card-title { font-size:12px; color:#f4a261; font-weight:700; margin-bottom:10px; }
      .pf-card label { display:flex; flex-direction:column; gap:6px; font-size:11px; color:#888; margin-bottom:10px; }
      .pf-color-row { display:flex; align-items:center; gap:8px; }
      .pf-color-row input[type=range] { flex:1; }
      .pf-swatch { width:28px; height:28px; border-radius:6px; border:1px solid #555; flex-shrink:0; }
      .pf-card code { color:#8dcea0; font-size:12px; }
      .pf-note { font-size:11px; color:#777; line-height:1.45; margin:0; }
      .pf-note b { color:#aaa; }

      .tia-palette {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 2px;
        margin-top: 6px;
      }
      .tia-cell {
        aspect-ratio: 1;
        border-radius: 3px;
        border: 2px solid transparent;
        cursor: pointer;
        min-height: 16px;
        padding: 0;
      }
      .tia-cell:hover { outline: 1px solid #fff8; }
      .tia-cell.sel-pf { border-color: #f4a261; box-shadow: 0 0 0 1px #f4a261; }
      .tia-cell.sel-bk { border-color: #5dade2; box-shadow: 0 0 0 1px #5dade2; }
      .tia-cell.sel-both { border-color: #fff; box-shadow: inset 0 0 0 1px #000; }
      .tia-legend { font-size: 10px; color: #666; margin-top: 6px; line-height: 1.4; }
      .tia-legend span.pf { color: #f4a261; }
      .tia-legend span.bk { color: #5dade2; }
      .tia-radios { display: flex; gap: 12px; font-size: 11px; color: #aaa; margin: 6px 0; }
      .tia-radios label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
    `;
    document.head.appendChild(s);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function bind() {
    document.getElementById('pfScreen')?.addEventListener('change', (e) => {
      persist();
      loadForScreen(e.target.value);
      resizeCanvas();
      document.getElementById('pfHeight').value = height;
      document.getElementById('pfReflect').checked = reflect;
      updateSwatches();
      redraw();
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

    document.getElementById('pfReflect')?.addEventListener('change', (e) => {
      reflect = !!e.target.checked;
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
    // Ctrl+Z no módulo (evita conflito com atalho global se foco no canvas)
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    document.getElementById('mod-playfield')?.addEventListener('keydown', onKey);

    document.querySelectorAll('.pf-tool').forEach((btn) => {

      btn.addEventListener('click', () => {
        document.querySelectorAll('.pf-tool').forEach((b) => b.classList.remove('active'));
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
    resizeCanvas();

    const G = 16;
    const pos = (ev) => {
      const r = canvas.getBoundingClientRect();
      const { cellW, cellH } = cellSize(height);
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      const px = (ev.clientX - r.left) * sx;
      const py = (ev.clientY - r.top) * sy;
      const y = Math.floor(py / cellH);
      if (px < G) return { x: -1, y, gutter: true };
      return { x: Math.floor((px - G) / cellW), y, gutter: false };
    };
    const paintLineColor = (y) => {
      if (y < 0 || y >= height) return;
      if (!lineColupf || lineColupf.length !== height) ensureLineColors(height);
      if (colorTarget === 'bk') lineColubk[y] = colubk & 0xfe;
      else lineColupf[y] = colupf & 0xfe;
    };
    document.getElementById('pfColorLine')?.addEventListener('click', () => {
      colorLineMode = !colorLineMode;
      document.getElementById('pfColorLine')?.classList.toggle('active', colorLineMode);
      if (colorLineMode) {
        document.querySelectorAll('.pf-tool[data-tool]').forEach((b) => b.classList.remove('active'));
      }
    });

    const apply = (x, y, val) => {
      if (x < 0 || y < 0 || x >= W || y >= height) return;
      // Edição só no lado esquerdo lógico (0..19); 20..39 espelham/repetem na preview
      // Mas para UX: permitir clicar em qualquer lado e mapear
      let lx = x;
      if (x >= 20) {
        if (reflect) lx = 39 - x; // espelho
        else lx = x - 20;         // repeat
      }
      if (lx < 0 || lx > 19) return;
      // Escreve no half esquerdo; redraw projeta direita
      // Armazenamos full 40 para flexibilidade futura, mas ao pintar sincronizamos
      const writeHalf = (px, py, v) => {
        pixels[py * W + px] = v ? 1 : 0;
        // projeta lado direito
        if (reflect) pixels[py * W + (39 - px)] = v ? 1 : 0;
        else pixels[py * W + (px + 20)] = v ? 1 : 0;
      };
      if (tool === 'fill' || val === 2) {
        flood(lx, y, pixels[y * W + lx] ? 1 : 0, val === 0 ? 0 : 1);
      } else {
        writeHalf(lx, y, val);
      }
    };

    canvas.addEventListener('mousedown', (ev) => {
      painting = true;
      pushUndo();
      const { x, y, gutter } = pos(ev);
      if (gutter || colorLineMode) {
        paintLineColor(y);
      } else if (ev.button === 2 || tool === 'erase') apply(x, y, 0);
      else if (tool === 'fill') apply(x, y, 2);
      else apply(x, y, 1);
      redraw();
      persist();
      ev.preventDefault();
    });
    window.addEventListener('mouseup', () => { painting = false; });
    canvas.addEventListener('mousemove', (ev) => {
      if (!painting) return;
      const { x, y, gutter } = pos(ev);
      if (gutter || colorLineMode) paintLineColor(y);
      else if (tool === 'fill') return;
      else apply(x, y, tool === 'erase' || ev.buttons === 2 ? 0 : 1);
      redraw();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mouseleave', () => { if (painting) persist(); });
  }

  function flood(x, y, from, to) {
    if (from === to) return;
    const stack = [[x, y]];
    const writeHalf = (px, py, v) => {
      pixels[py * W + px] = v ? 1 : 0;
      if (reflect) pixels[py * W + (39 - px)] = v ? 1 : 0;
      else pixels[py * W + (px + 20)] = v ? 1 : 0;
    };
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx > 19 || cy >= height) continue;
      if ((pixels[cy * W + cx] ? 1 : 0) !== from) continue;
      writeHalf(cx, cy, to);
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
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

  function resizeCanvas() {
    const canvas = document.getElementById('pfCanvas');
    if (!canvas) return;
    const G = 16;
    const { cellW, cellH } = cellSize(height);
    canvas.width = G + W * cellW;
    canvas.height = height * cellH;
  }

  function redraw() {
    const canvas = document.getElementById('pfCanvas');
    if (!canvas || !pixels) return;
    if (!lineColupf || lineColupf.length !== height || !lineColubk || lineColubk.length !== height) {
      ensureLineColors(height);
    }
    const G = 16;
    const { cellW, cellH } = cellSize(height);
    const canvasW = G + W * cellW;
    const canvasH = height * cellH;
    if (canvas.width !== canvasW || canvas.height !== canvasH) {
      canvas.width = canvasW;
      canvas.height = canvasH;
    }
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(canvasW, canvasH);
    const data = img.data;
    for (let y = 0; y < height; y++) {
      const pfC = TIA_NTSC[((lineColupf[y] & 0xfe) >> 1) & 0x7f];
      const bkC = TIA_NTSC[((lineColubk[y] & 0xfe) >> 1) & 0x7f];
      // gutter: metade COLUPF / metade COLUBK da linha
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < G; dx++) {
          const c = dx < G / 2 ? pfC : bkC;
          const i = ((y * cellH + dy) * canvasW + dx) * 4;
          data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
        }
      }
      for (let x = 0; x < W; x++) {
        let on = pixels[y * W + x] & 1;
        if (x >= 20) {
          const lx = reflect ? 39 - x : x - 20;
          on = pixels[y * W + lx] & 1;
        }
        const c = on ? pfC : bkC;
        for (let dy = 0; dy < cellH; dy++) {
          for (let dx = 0; dx < cellW; dx++) {
            const i = ((y * cellH + dy) * canvasW + (G + x * cellW + dx)) * 4;
            data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
          }
        }
      }
    }
    const mid = G + 20 * cellW;
    for (let y = 0; y < canvasH; y++) {
      const i = (y * canvasW + mid) * 4;
      data[i] = 80; data[i + 1] = 80; data[i + 2] = 80; data[i + 3] = 255;
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
