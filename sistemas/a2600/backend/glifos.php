<?php
declare(strict_types=1);
/**
 * Editor visual de glifos A2600 (dígitos do placar + logo).
 * Salva em glifos.json nesta mesma pasta.
 */
header('X-Content-Type-Options: nosniff');

$jsonFile = __DIR__ . '/glifos.json';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json; charset=utf-8');
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: 'null', true);
    if (!is_array($data) || !isset($data['glyphs']) || !is_array($data['glyphs'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'JSON inválido']);
        exit;
    }
    $data['version'] = (int)($data['version'] ?? 1);
    $data['system'] = 'A2600';
    $data['updated'] = date('c');
    $ok = file_put_contents(
        $jsonFile,
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n"
    );
    if ($ok === false) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Falha ao gravar glifos.json (permissão?)']);
        exit;
    }
    echo json_encode(['ok' => true, 'bytes' => $ok]);
    exit;
}

$initial = '{}';
if (is_readable($jsonFile)) {
    $initial = file_get_contents($jsonFile) ?: '{}';
}
?><!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AGC — Editor de glifos</title>
<style>
  :root {
    --bg: #12151c;
    --panel: #1a1f2a;
    --border: #2a3344;
    --accent: #f4a261;
    --ok: #2ecc71;
    --text: #e8ecf1;
    --muted: #8b95a8;
    --cell-on: #e8ecf1;
    --cell-off: #0d1017;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: system-ui, sans-serif; background: var(--bg); color: var(--text);
    min-height: 100vh;
  }
  header {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--panel);
  }
  header h1 { margin: 0; font-size: 15px; color: var(--accent); font-weight: 700; }
  header .muted { font-size: 12px; color: var(--muted); }
  button, select, input[type=number], input[type=text] {
    background: #0d1017; color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 10px; font-size: 13px;
  }
  button {
    cursor: pointer; background: #243044;
  }
  button:hover { border-color: var(--accent); }
  button.primary { background: #3d2a1a; border-color: var(--accent); color: var(--accent); font-weight: 600; }
  button.ok { background: #1a3d2a; border-color: var(--ok); color: var(--ok); }
  .layout {
    display: grid;
    grid-template-columns: 220px 1fr 260px;
    gap: 0;
    min-height: calc(100vh - 54px);
  }
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
  }
  .side {
    border-right: 1px solid var(--border); background: var(--panel);
    padding: 12px; overflow: auto;
  }
  .side h2 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .glyph-list { display: flex; flex-direction: column; gap: 4px; }
  .glyph-item {
    text-align: left; padding: 8px 10px; border-radius: 6px; border: 1px solid transparent;
    background: transparent; width: 100%;
  }
  .glyph-item.active { border-color: var(--accent); background: #2a2218; }
  .glyph-item small { display: block; color: var(--muted); font-size: 11px; }
  .main { padding: 16px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .toolbar label { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 6px; }
  .grid-wrap {
    border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: #0a0c10;
    display: inline-block;
  }
  #grid {
    display: grid;
    gap: 2px;
    background: #1e2533;
  }
  #grid .cell {
    width: 22px; height: 22px; background: var(--cell-off); cursor: crosshair;
    border-radius: 2px; user-select: none;
  }
  #grid .cell.on { background: var(--cell-on); }
  #grid .cell:hover { outline: 1px solid var(--accent); }
  .preview-row { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
  .preview-box {
    border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: #000;
  }
  .preview-box canvas { image-rendering: pixelated; display: block; }
  .preview-box .cap { font-size: 11px; color: var(--muted); margin-top: 6px; }
  .right {
    border-left: 1px solid var(--border); background: var(--panel); padding: 12px; overflow: auto;
  }
  .right pre {
    font-size: 11px; background: #0d1017; padding: 10px; border-radius: 6px;
    overflow: auto; max-height: 40vh; color: #9ecb8a;
  }
  .hint { font-size: 12px; color: var(--muted); line-height: 1.45; max-width: 520px; }
  #status { font-size: 12px; margin-left: auto; }
  #status.ok { color: var(--ok); }
  #status.err { color: #e74c3c; }
</style>
</head>
<body>
<header>
  <h1>✏ Glifos A2600</h1>
  <span class="muted">placar · logo · player 1–8 px · altura 1–16 scanlines</span>
  <button type="button" class="primary" id="btnSave">Salvar glifos.json</button>
  <button type="button" id="btnAdd">+ Glifo</button>
  <button type="button" id="btnDup">Duplicar</button>
  <button type="button" id="btnClear">Limpar</button>
  <span id="status"></span>
</header>
<div class="layout">
  <aside class="side">
    <h2>Biblioteca</h2>
    <div class="glyph-list" id="list"></div>
  </aside>
  <main class="main">
    <div class="toolbar">
      <label>Nome <input type="text" id="name" style="width:140px"/></label>
      <label>Tipo
        <select id="kind">
          <option value="digit">dígito</option>
          <option value="logo">logo</option>
          <option value="letter">letra</option>
          <option value="custom">custom</option>
        </select>
      </label>
      <label>Largura
        <input type="number" id="width" min="1" max="20" value="8"/>
      </label>
      <label>Altura
        <input type="number" id="height" min="1" max="16" value="5"/>
      </label>
      <label>Zoom
        <input type="number" id="zoom" min="12" max="40" value="22"/>
      </label>
    </div>
    <p class="hint">
      Clique / arraste no grid para pintar (esquerdo = liga, direito = apaga).
      <b>Largura 1–8</b> = sprite player (placar). <b>Até 20</b> = meia playfield (logo em PF).
      <b>Altura</b> = scanlines (mínimo 1). O JSON alimenta o build do placar/logo.
    </p>
    <div class="preview-row">
      <div class="grid-wrap"><div id="grid"></div></div>
      <div class="preview-box">
        <canvas id="prev1" width="64" height="40"></canvas>
        <div class="cap">Preview 1× (scanline = 1 px)</div>
      </div>
      <div class="preview-box">
        <canvas id="prev2" width="128" height="80"></canvas>
        <div class="cap">Preview 2×</div>
      </div>
    </div>
  </main>
  <aside class="right">
    <h2>Export ASM (.byte)</h2>
    <pre id="asmOut"></pre>
    <h2 style="margin-top:16px">JSON do glifo</h2>
    <pre id="jsonOut"></pre>
  </aside>
</div>
<script>
const INITIAL = <?= $initial ?: '{}' ?>;

const state = {
  data: null,
  index: 0,
  painting: false,
  paintValue: 1,
};

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function ensureData() {
  let d = INITIAL && typeof INITIAL === 'object' ? JSON.parse(JSON.stringify(INITIAL)) : null;
  if (!d || !Array.isArray(d.glyphs)) {
    d = { version: 1, system: 'A2600', glyphs: [] };
  }
  if (!d.glyphs.length) {
    d.glyphs.push({
      id: 'digit_0', name: 'Dígito 0', kind: 'digit', char: '0',
      width: 8, height: 5,
      pixels: Array.from({ length: 5 }, () => Array(8).fill(0)),
    });
  }
  state.data = d;
  state.index = 0;
}

function current() {
  return state.data.glyphs[state.index];
}

function resizePixels(g, w, h) {
  w = clamp(w | 0, 1, 20);
  h = clamp(h | 0, 1, 16);
  const next = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      row.push((g.pixels[y] && g.pixels[y][x]) ? 1 : 0);
    }
    next.push(row);
  }
  g.width = w;
  g.height = h;
  g.pixels = next;
}

function renderList() {
  const list = document.getElementById('list');
  list.innerHTML = state.data.glyphs.map((g, i) => {
    const active = i === state.index ? ' active' : '';
    return `<button type="button" class="glyph-item${active}" data-i="${i}">
      <b>${escapeHtml(g.name || g.id)}</b>
      <small>${g.kind || ''} · ${g.width}×${g.height}</small>
    </button>`;
  }).join('');
  list.querySelectorAll('[data-i]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.index = parseInt(btn.getAttribute('data-i'), 10);
      loadCurrentToForm();
      renderAll();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function loadCurrentToForm() {
  const g = current();
  document.getElementById('name').value = g.name || '';
  document.getElementById('kind').value = g.kind || 'custom';
  document.getElementById('width').value = g.width || 8;
  document.getElementById('height').value = g.height || 5;
}

function renderGrid() {
  const g = current();
  const zoom = clamp(parseInt(document.getElementById('zoom').value, 10) || 22, 12, 40);
  const grid = document.getElementById('grid');
  grid.style.gridTemplateColumns = `repeat(${g.width}, ${zoom}px)`;
  grid.innerHTML = '';
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell' + (g.pixels[y][x] ? ' on' : '');
      cell.style.width = zoom + 'px';
      cell.style.height = zoom + 'px';
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        state.painting = true;
        state.paintValue = e.button === 2 ? 0 : (g.pixels[y][x] ? 0 : 1);
        if (e.button === 2) state.paintValue = 0;
        if (e.button === 0) state.paintValue = g.pixels[y][x] ? 0 : 1;
        g.pixels[y][x] = state.paintValue;
        cell.classList.toggle('on', !!state.paintValue);
        renderPreview();
        renderExport();
      });
      cell.addEventListener('mouseenter', () => {
        if (!state.painting) return;
        g.pixels[y][x] = state.paintValue;
        cell.classList.toggle('on', !!state.paintValue);
        renderPreview();
        renderExport();
      });
      grid.appendChild(cell);
    }
  }
}

document.addEventListener('mouseup', () => { state.painting = false; });
document.addEventListener('contextmenu', (e) => {
  if (e.target.classList && e.target.classList.contains('cell')) e.preventDefault();
});

function renderPreview() {
  const g = current();
  drawPrev('prev1', 1);
  drawPrev('prev2', 2);
  function drawPrev(id, scale) {
    const c = document.getElementById(id);
    const px = 4 * scale;
    c.width = g.width * px;
    c.height = g.height * px;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#e8ecf1';
    for (let y = 0; y < g.height; y++) {
      for (let x = 0; x < g.width; x++) {
        if (g.pixels[y][x]) ctx.fillRect(x * px, y * px, px, px);
      }
    }
  }
}

function pixelsToBytes(g) {
  const bytes = [];
  for (let y = 0; y < g.height; y++) {
    let b = 0;
    const w = Math.min(8, g.width);
    for (let x = 0; x < w; x++) {
      if (g.pixels[y][x]) b |= (0x80 >> x);
    }
    bytes.push(b);
  }
  return bytes;
}

/** PF half: 20 bits → approx as 3 bytes PF0/PF1/PF2 style left half only for export hint */
function renderExport() {
  const g = current();
  const bytes = pixelsToBytes(g);
  const asm = bytes.map((b) => '    .byte %' + b.toString(2).padStart(8, '0')).join('\n');
  document.getElementById('asmOut').textContent =
    `; ${g.id} ${g.width}x${g.height}\n${g.id}:\n` + asm;
  document.getElementById('jsonOut').textContent = JSON.stringify({
    id: g.id, name: g.name, width: g.width, height: g.height, bytes,
  }, null, 2);
}

function renderAll() {
  renderList();
  renderGrid();
  renderPreview();
  renderExport();
}

function bindForm() {
  document.getElementById('name').addEventListener('change', (e) => {
    current().name = e.target.value;
    renderList();
    renderExport();
  });
  document.getElementById('kind').addEventListener('change', (e) => {
    current().kind = e.target.value;
    renderList();
  });
  const resize = () => {
    const w = parseInt(document.getElementById('width').value, 10) || 8;
    const h = parseInt(document.getElementById('height').value, 10) || 5;
    resizePixels(current(), w, h);
    renderAll();
  };
  document.getElementById('width').addEventListener('change', resize);
  document.getElementById('height').addEventListener('change', resize);
  document.getElementById('zoom').addEventListener('change', () => renderGrid());

  document.getElementById('btnAdd').addEventListener('click', () => {
    const id = 'glyph_' + Date.now().toString(36);
    state.data.glyphs.push({
      id, name: 'Novo glifo', kind: 'custom',
      width: 8, height: 5,
      pixels: Array.from({ length: 5 }, () => Array(8).fill(0)),
    });
    state.index = state.data.glyphs.length - 1;
    loadCurrentToForm();
    renderAll();
  });
  document.getElementById('btnDup').addEventListener('click', () => {
    const g = JSON.parse(JSON.stringify(current()));
    g.id = 'glyph_' + Date.now().toString(36);
    g.name = (g.name || 'Glifo') + ' cópia';
    state.data.glyphs.push(g);
    state.index = state.data.glyphs.length - 1;
    loadCurrentToForm();
    renderAll();
  });
  document.getElementById('btnClear').addEventListener('click', () => {
    const g = current();
    g.pixels = Array.from({ length: g.height }, () => Array(g.width).fill(0));
    renderAll();
  });
  document.getElementById('btnSave').addEventListener('click', async () => {
    const st = document.getElementById('status');
    st.textContent = 'Salvando…';
    st.className = '';
    try {
      const res = await fetch(location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.data),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'erro');
      st.textContent = 'Salvo em glifos.json';
      st.className = 'ok';
    } catch (err) {
      st.textContent = String(err.message || err);
      st.className = 'err';
    }
  });
}

ensureData();
loadCurrentToForm();
bindForm();
renderAll();
</script>
</body>
</html>
