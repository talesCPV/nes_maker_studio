/**
 * SPRITES — players do Atari 2600
 *
 * Hardware: GRP0/GRP1 = 8 bits de largura fixos.
 * Altura livre (1 byte por scanline).
 * NUSIZ: cópias e largura 1x/2x/4x (não muda resolução do bitmap).
 * Cor por scanline: COLUPx (barra à direita do grid).
 */
const SPRITES = (() => {
  const PW = 8;
  const H_DEFAULT = 16;
  const CELL_H = 10;
  const GUTTER = 16;
  const GAP = 8;
  const UNDO_MAX = 40;

  let selectedId = null;
  let pixels = null;
  let height = H_DEFAULT;
  let color = 0x2a;
  let lineColors = null;
  let nusiz = 0;
  let player = 0;
  let tool = 'paint';
  let painting = false;
  let zoom = 2;
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
    const z = Math.max(1, Math.min(6, zoom | 0));
    const cellH = CELL_H * z;
    const cellW = Math.max(3, Math.round(cellH * (160 / 192)));
    return { cellW, cellH, zoom: z };
  }

  function canvasDims(h) {
    const { cellW, cellH } = cellSize(h);
    return {
      cellW,
      cellH,
      gridW: PW * cellW,
      canvasW: PW * cellW + GAP + GUTTER,
      canvasH: h * cellH,
    };
  }

  function ensureData() {
    if (!Project.data) Project.data = Project.defaultData();
    if (!Array.isArray(Project.data.sprites)) Project.data.sprites = [];
    return Project.data;
  }

  function emptyPixels(h) {
    return new Uint8Array(PW * h);
  }

  function toB64(u8) {
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i] & 1);
    return btoa(bin);
  }
  function fromB64(b64, h) {
    const u8 = emptyPixels(h);
    if (!b64) return u8;
    try {
      const bin = atob(b64);
      const n = Math.min(bin.length, u8.length);
      for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i) & 1;
    } catch (e) {}
    return u8;
  }

  function lineColorsToB64(u8) {
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i] & 0xff);
    return btoa(bin);
  }
  function lineColorsFromB64(b64, h, fill) {
    const next = new Uint8Array(h);
    const base = (fill != null ? fill : 0x2a) & 0xfe;
    next.fill(base);
    if (!b64) return next;
    try {
      const bin = atob(b64);
      const n = Math.min(bin.length, h);
      for (let i = 0; i < n; i++) next[i] = bin.charCodeAt(i) & 0xfe;
    } catch (e) {}
    return next;
  }

  function ensureLineColors(h, fill) {
    const next = new Uint8Array(h);
    const base = (fill != null ? fill : color) & 0xfe;
    if (lineColors && lineColors.length) {
      for (let i = 0; i < h; i++) next[i] = i < lineColors.length ? (lineColors[i] & 0xfe) : base;
    } else next.fill(base);
    lineColors = next;
  }

  function uid() {
    return 'spr_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36);
  }

  function list() {
    return ensureData().sprites;
  }

  function find(id) {
    return list().find((s) => s.id === id) || null;
  }

  function ensureSelection() {
    const arr = list();
    if (!arr.length) {
      const s = {
        id: uid(),
        name: 'Player 0',
        player: 0,
        height: H_DEFAULT,
        color: 0x2a,
        nusiz: 0,
        data: toB64(emptyPixels(H_DEFAULT)),
        lineColors: lineColorsToB64(new Uint8Array(H_DEFAULT).fill(0x2a)),
      };
      arr.push(s);
      selectedId = s.id;
    }
    if (!selectedId || !find(selectedId)) selectedId = arr[0].id;
    return find(selectedId);
  }

  function loadSelected() {
    const s = ensureSelection();
    height = Math.max(1, Math.min(192, s.height | 0) || H_DEFAULT);
    color = (s.color != null ? s.color : 0x2a) & 0xfe;
    nusiz = s.nusiz | 0;
    player = s.player | 0;
    pixels = fromB64(s.data, height);
    lineColors = lineColorsFromB64(s.lineColors, height, color);
  }

  function persist() {
    const s = find(selectedId);
    if (!s || !pixels) return;
    s.height = height;
    s.color = color & 0xfe;
    s.nusiz = nusiz | 0;
    s.player = player | 0;
    s.data = toB64(pixels);
    s.lineColors = lineColorsToB64(lineColors || new Uint8Array(height));
    if (typeof Project.status === 'function') Project.status('sprite alterado — salve o projeto');
  }

  function pushUndo() {
    if (!pixels) return;
    undoStack.push({
      height,
      pixels: new Uint8Array(pixels),
      lineColors: lineColors ? new Uint8Array(lineColors) : null,
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
    lineColors = snap.lineColors ? new Uint8Array(snap.lineColors) : null;
    if (!lineColors) ensureLineColors(height, color);
    const hEl = document.getElementById('spHeight');
    if (hEl) hEl.value = height;
    persist();
    resizeCanvas();
    redraw();
    if (typeof Project.status === 'function') Project.status('desfeito');
  }

  function floodFill(x, y, toVal) {
    if (x < 0 || y < 0 || x >= PW || y >= height) return;
    const from = pixels[y * PW + x] & 1;
    const to = toVal ? 1 : 0;
    if (from === to) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= PW || cy >= height) continue;
      if ((pixels[cy * PW + cx] & 1) !== from) continue;
      pixels[cy * PW + cx] = to;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  function buildHTML() {
    const root = document.getElementById('mod-sprites');
    if (!root) return;
    loadSelected();
    const arr = list();
    const s = find(selectedId);

    const listHtml = arr
      .map(
        (sp) => `
      <div class="sp-item ${sp.id === selectedId ? 'active' : ''}" data-id="${sp.id}">
        <canvas class="sp-thumb" width="32" height="32" data-thumb="${sp.id}"></canvas>
        <div class="sp-item-meta">
          <div class="sp-item-name">${escapeHtml(sp.name || 'Sprite')}</div>
          <div class="sp-item-sub">P${sp.player | 0} · ${sp.height | 0} linhas</div>
        </div>
      </div>`
      )
      .join('');

    root.innerHTML = `
      <div class="sp-wrap">
        <div class="sp-left">
          <div class="sp-left-head">
            <span>Sprites (players)</span>
            <button type="button" class="sp-btn" id="spAdd">+</button>
          </div>
          <div class="sp-list" id="spList">${listHtml}</div>
        </div>
        <div class="sp-main">
          <div class="sp-toolbar">
            <label>Nome <input type="text" id="spName" value="${escapeAttr(s.name || '')}" /></label>
            <label>Player
              <select id="spPlayer">
                <option value="0" ${player === 0 ? 'selected' : ''}>P0</option>
                <option value="1" ${player === 1 ? 'selected' : ''}>P1</option>
              </select>
            </label>
            <label>Altura <input type="number" id="spHeight" min="1" max="192" value="${height}" style="width:56px" /></label>
            <label title="Largura do bitmap é sempre 8 bits (GRP). NUSIZ só estica/copia na tela.">NUSIZ
              <select id="spNusiz">
                <option value="0" ${nusiz === 0 ? 'selected' : ''}>1 cópia · 1x</option>
                <option value="1" ${nusiz === 1 ? 'selected' : ''}>2 cópias próximas</option>
                <option value="2" ${nusiz === 2 ? 'selected' : ''}>3 cópias próximas</option>
                <option value="3" ${nusiz === 3 ? 'selected' : ''}>2 cópias médias</option>
                <option value="4" ${nusiz === 4 ? 'selected' : ''}>1 cópia · 2x largo</option>
                <option value="5" ${nusiz === 5 ? 'selected' : ''}>2 cópias · 2x largo</option>
                <option value="6" ${nusiz === 6 ? 'selected' : ''}>1 cópia · 4x largo</option>
                <option value="7" ${nusiz === 7 ? 'selected' : ''}>3 cópias médias</option>
              </select>
            </label>
            <div class="sp-tools">
              <button type="button" class="sp-tool active" data-tool="paint" title="Pincel">🖌</button>
              <button type="button" class="sp-tool" data-tool="erase" title="Borracha">⌫</button>
              <button type="button" class="sp-tool" data-tool="fill" title="Balde">🪣</button>
            </div>
            <div class="sp-tools">
              <button type="button" class="sp-tool" id="spZoomOut" title="Zoom −">−</button>
              <span id="spZoomLabel" style="font-size:11px;color:#aaa;min-width:28px;text-align:center">${zoom}×</span>
              <button type="button" class="sp-tool" id="spZoomIn" title="Zoom +">+</button>
              <button type="button" class="sp-tool" id="spUndo" title="Desfazer (Ctrl+Z)">↩</button>
            </div>
            <button type="button" class="sp-btn danger" id="spDelete">🗑</button>
            <span class="sp-hint">8×${height} fixo · NUSIZ estica na TV · cores na barra à direita</span>
          </div>
          <div class="sp-body">
            <div class="sp-canvas-box">
              <canvas id="spCanvas"></canvas>
            </div>
            <div class="sp-side">
              <div class="sp-card">
                <div class="sp-card-title">COLUP${player} <code id="spHex" style="float:right;color:#8dcea0">$${(
      color & 0xff
    )
      .toString(16)
      .padStart(2, '0')}</code></div>
                <div class="tia-palette" id="spPalette"></div>
                <div class="tia-legend">Selecione a cor e clique na <span class="pf">barra à direita</span> do grid para pintar a scanline.</div>
              </div>
              <div class="sp-card">
                <div class="sp-card-title">Hardware</div>
                <p class="sp-note">
                  Largura do bitmap = <b>8 pixels</b> (registrador GRP0/GRP1).
                  Não há seletor de largura em pixels: só <b>NUSIZ</b> (1x / 2x / 4x e cópias na tela).
                  Altura é livre (um byte por linha).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    injectStyles();
    bind();
    resizeCanvas();
    redraw();
    drawThumbs();
  }

  function injectStyles() {
    if (document.getElementById('sp-styles')) return;
    const s = document.createElement('style');
    s.id = 'sp-styles';
    s.textContent = `
      .sp-wrap { display:flex; height:100%; background:#1e1e1e; min-height:0; }
      .sp-left { width:200px; border-right:1px solid #333; display:flex; flex-direction:column; background:#181818; flex-shrink:0; }
      .sp-left-head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; font-size:12px; color:#f4a261; font-weight:700; border-bottom:1px solid #2a2a2a; }
      .sp-list { flex:1; overflow:auto; padding:8px; display:flex; flex-direction:column; gap:6px; }
      .sp-item { display:flex; gap:8px; align-items:center; padding:8px; border-radius:8px; border:1px solid #2a2e38; background:#14171e; cursor:pointer; }
      .sp-item:hover { border-color:#444; }
      .sp-item.active { border-color:#f4a26166; background:#1c1812; }
      .sp-thumb { width:32px; height:32px; image-rendering:pixelated; background:#000; border-radius:4px; border:1px solid #333; flex-shrink:0; }
      .sp-item-name { font-size:12px; color:#eee; font-weight:600; }
      .sp-item-sub { font-size:10px; color:#777; }
      .sp-main { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
      .sp-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; padding:8px 12px; background:#252526; border-bottom:1px solid #333; }
      .sp-toolbar label { font-size:11px; color:#888; display:flex; align-items:center; gap:6px; }
      .sp-toolbar input, .sp-toolbar select { background:#111; color:#eee; border:1px solid #444; border-radius:5px; padding:4px 6px; font-size:12px; }
      .sp-tools { display:flex; gap:4px; align-items:center; }
      .sp-tool { width:32px; height:32px; border-radius:6px; border:1px solid #444; background:#2a2a2a; color:#ccc; cursor:pointer; }
      .sp-tool.active { border-color:#f4a261; background:#2a2218; color:#f4a261; }
      .sp-btn { background:#2a2a2a; border:1px solid #444; color:#ccc; border-radius:6px; padding:5px 10px; cursor:pointer; font-size:12px; }
      .sp-btn:hover { border-color:#f4a261; }
      .sp-btn.danger { background:#3a1a1a; border-color:#5a2a2a; color:#e88; }
      .sp-hint { font-size:11px; color:#666; margin-left:auto; }
      .sp-body { flex:1; display:flex; gap:12px; padding:12px; overflow:auto; min-height:0; }
      .sp-canvas-box { background:#0a0a0a; border:1px solid #333; border-radius:8px; padding:10px; align-self:flex-start; }
      #spCanvas { image-rendering:pixelated; cursor:crosshair; display:block; }
      .sp-side { width:240px; flex-shrink:0; display:flex; flex-direction:column; gap:10px; }
      .sp-card { background:linear-gradient(180deg,#1e222c,#161920); border:1px solid #333; border-radius:10px; padding:12px; }
      .sp-card-title { font-size:12px; color:#f4a261; font-weight:700; margin-bottom:10px; }
      .sp-note { font-size:11px; color:#777; line-height:1.45; margin:0; }
      .sp-note b { color:#aaa; }
      .tia-palette { display:grid; grid-template-columns:repeat(8,1fr); gap:2px; margin-top:6px; }
      .tia-cell { aspect-ratio:1; border-radius:3px; border:2px solid transparent; cursor:pointer; min-height:16px; padding:0; }
      .tia-cell:hover { outline:1px solid #fff8; }
      .tia-cell.sel-pf { border-color:#f4a261; box-shadow:0 0 0 1px #f4a261; }
      .tia-legend { font-size:10px; color:#666; margin-top:6px; line-height:1.4; }
      .tia-legend span.pf { color:#f4a261; }
    `;
    document.head.appendChild(s);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function updateSwatch() {
    const hx = document.getElementById('spHex');
    if (hx) hx.textContent = '$' + (color & 0xff).toString(16).padStart(2, '0');
    document.querySelectorAll('#spPalette .tia-cell').forEach((el) => {
      const v = parseInt(el.getAttribute('data-c'), 10);
      el.classList.toggle('sel-pf', v === (color & 0xfe));
    });
  }

  function buildPalette() {
    const root = document.getElementById('spPalette');
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
        color = reg;
        updateSwatch();
        persist();
        redraw();
        drawThumbs();
      });
      root.appendChild(btn);
    }
    updateSwatch();
  }

  function bind() {
    document.getElementById('spAdd')?.addEventListener('click', () => {
      persist();
      const n = list().length;
      const s = {
        id: uid(),
        name: 'Sprite ' + (n + 1),
        player: n % 2,
        height: H_DEFAULT,
        color: n % 2 ? 0x4a : 0x2a,
        nusiz: 0,
        data: toB64(emptyPixels(H_DEFAULT)),
        lineColors: lineColorsToB64(new Uint8Array(H_DEFAULT).fill(n % 2 ? 0x4a : 0x2a)),
      };
      list().push(s);
      selectedId = s.id;
      undoStack.length = 0;
      buildHTML();
    });

    document.getElementById('spDelete')?.addEventListener('click', () => {
      if (list().length <= 1) {
        alert('Precisa de pelo menos um sprite.');
        return;
      }
      if (!confirm('Remover este sprite?')) return;
      const arr = list();
      const i = arr.findIndex((x) => x.id === selectedId);
      if (i >= 0) arr.splice(i, 1);
      selectedId = arr[0].id;
      undoStack.length = 0;
      buildHTML();
      Project.status('sprite removido — salve o projeto');
    });

    document.querySelectorAll('.sp-item').forEach((el) => {
      el.addEventListener('click', () => {
        persist();
        selectedId = el.getAttribute('data-id');
        undoStack.length = 0;
        buildHTML();
      });
    });

    document.getElementById('spName')?.addEventListener('input', (e) => {
      const s = find(selectedId);
      if (s) s.name = e.target.value;
      const label = document.querySelector('.sp-item.active .sp-item-name');
      if (label) label.textContent = e.target.value || 'Sprite';
    });
    document.getElementById('spPlayer')?.addEventListener('change', (e) => {
      player = parseInt(e.target.value, 10) || 0;
      persist();
      const t = document.querySelector('.sp-card-title');
      if (t) {
        const hx = document.getElementById('spHex');
        t.childNodes[0].textContent = 'COLUP' + player + ' ';
        if (hx) t.appendChild(hx);
      }
    });
    document.getElementById('spNusiz')?.addEventListener('change', (e) => {
      nusiz = parseInt(e.target.value, 10) || 0;
      persist();
    });
    document.getElementById('spHeight')?.addEventListener('change', (e) => {
      let h = parseInt(e.target.value, 10) || H_DEFAULT;
      h = Math.max(1, Math.min(192, h));
      e.target.value = h;
      pushUndo();
      const next = emptyPixels(h);
      next.set(pixels.subarray(0, Math.min(pixels.length, next.length)));
      height = h;
      pixels = next;
      ensureLineColors(h, color);
      persist();
      resizeCanvas();
      redraw();
    });

    function setZoom(z) {
      zoom = Math.max(1, Math.min(6, z | 0));
      const lab = document.getElementById('spZoomLabel');
      if (lab) lab.textContent = zoom + '×';
      resizeCanvas();
      redraw();
    }
    document.getElementById('spZoomIn')?.addEventListener('click', () => setZoom(zoom + 1));
    document.getElementById('spZoomOut')?.addEventListener('click', () => setZoom(zoom - 1));
    document.getElementById('spUndo')?.addEventListener('click', () => undo());
    document.getElementById('mod-sprites')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    });

    document.querySelectorAll('.sp-tool[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sp-tool[data-tool]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        tool = btn.getAttribute('data-tool');
      });
    });

    buildPalette();

    const canvas = document.getElementById('spCanvas');
    if (!canvas) return;

    const pos = (ev) => {
      const r = canvas.getBoundingClientRect();
      const { cellW, cellH, gridW } = canvasDims(height);
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      const px = (ev.clientX - r.left) * sx;
      const py = (ev.clientY - r.top) * sy;
      const y = Math.floor(py / cellH);
      if (px >= gridW + GAP) return { x: -1, y, gutter: true };
      if (px >= gridW) return { x: -1, y, gap: true };
      return { x: Math.floor(px / cellW), y, gutter: false };
    };

    const paintLineColor = (y) => {
      if (y < 0 || y >= height) return;
      if (!lineColors || lineColors.length !== height) ensureLineColors(height, color);
      lineColors[y] = color & 0xfe;
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
        const val = tool === 'erase' || ev.button === 2 ? 0 : 1;
        if (p.x >= 0 && p.y >= 0 && p.x < PW && p.y < height) pixels[p.y * PW + p.x] = val;
      }
      redraw();
      drawThumbs();
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
      else {
        const val = tool === 'erase' || ev.buttons === 2 ? 0 : 1;
        if (p.x >= 0 && p.y >= 0 && p.x < PW && p.y < height) pixels[p.y * PW + p.x] = val;
      }
      redraw();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function resizeCanvas() {
    const canvas = document.getElementById('spCanvas');
    if (!canvas) return;
    const { canvasW, canvasH } = canvasDims(height);
    canvas.width = canvasW;
    canvas.height = canvasH;
  }

  function redraw() {
    const canvas = document.getElementById('spCanvas');
    if (!canvas || !pixels) return;
    if (!lineColors || lineColors.length !== height) ensureLineColors(height, color);
    const { cellW, cellH, gridW, canvasW, canvasH } = canvasDims(height);
    if (canvas.width !== canvasW || canvas.height !== canvasH) {
      canvas.width = canvasW;
      canvas.height = canvasH;
    }
    const ctx = canvas.getContext('2d');
    const bg = [20, 20, 24];
    const img = ctx.createImageData(canvasW, canvasH);
    const data = img.data;

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
      const lc = (lineColors[y] != null ? lineColors[y] : color) & 0xfe;
      const fg = TIA_NTSC[(lc >> 1) & 0x7f];
      const gx0 = gridW + GAP;
      for (let dy = 0; dy < cellH; dy++) {
        for (let dx = 0; dx < GUTTER; dx++) {
          const i = ((y * cellH + dy) * canvasW + (gx0 + dx)) * 4;
          data[i] = fg[0];
          data[i + 1] = fg[1];
          data[i + 2] = fg[2];
          data[i + 3] = 255;
        }
      }
      for (let x = 0; x < PW; x++) {
        const on = pixels[y * PW + x] & 1;
        const c = on ? fg : bg;
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
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let x = 0; x <= PW; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellW + 0.5, 0);
      ctx.lineTo(x * cellW + 0.5, canvasH);
      ctx.stroke();
    }
  }

  function drawThumbs() {
    document.querySelectorAll('canvas[data-thumb]').forEach((cv) => {
      const id = cv.getAttribute('data-thumb');
      const s = find(id);
      if (!s) return;
      const h = Math.max(1, s.height | 0);
      const pix = fromB64(s.data, h);
      const lcols = lineColorsFromB64(s.lineColors, h, s.color || 0x2a);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 32, 32);
      const scaleX = 32 / PW;
      const scaleY = 32 / h;
      for (let y = 0; y < h; y++) {
        const fg = TIA_NTSC[((lcols[y] & 0xfe) >> 1) & 0x7f];
        for (let x = 0; x < PW; x++) {
          if (!(pix[y * PW + x] & 1)) continue;
          ctx.fillStyle = 'rgb(' + fg[0] + ',' + fg[1] + ',' + fg[2] + ')';
          ctx.fillRect(x * scaleX, y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
        }
      }
    });
  }

  function flush() {
    if (pixels) persist();
  }

  function init() {
    buildHTML();
  }

  return { init, flush };
})();

window.SPRITES = SPRITES;
