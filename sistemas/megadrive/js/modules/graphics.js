/* RetroCompiler — Mega Drive / Genesis — Módulo Gráficos
 * Tiles, Metatiles, importação de imagens e importação de tilesets de ROM.
 *
 * Importação de ROM (primeira etapa):
 * - lê a ROM localmente no navegador;
 * - reconhece cabeçalho Genesis e formato SMD simples;
 * - procura regiões candidatas de tiles 8x8 / 4bpp (32 bytes/tile);
 * - permite escolher a região encontrada e importar os tiles crus para o tileset.
 *
 * Observação: esta etapa não tenta descomprimir gráficos proprietários do jogo.
 * Quando uma ROM usa compressão, a região correspondente precisa ser descomprimida
 * antes de ser interpretada como tiles nativos do VDP.
 */

const TILESETS = ["MAIN", "PLAYER", "ENEMIES", "ITEMS", "SCENERY", "UI"];
const METATILES = ["BLOCK_00", "BLOCK_01", "FLOOR", "WALL", "CUSTOM"];
const TILE_BYTES = 32;
const TILE_SIZE = 8;
const MAX_ROM_SCAN_BYTES = 8 * 1024 * 1024;
const ROM_CANDIDATE_TILES = 64;
const ROM_MAX_CANDIDATES = 12;
let ROM_BUFFER = null;

const INITIAL_STATE = {
  view: "tiles",
  tileset: "MAIN",
  selectedTile: 0,
  selectedPalette: 0,
  metatileSize: "2x2",
  selectedMetatile: "BLOCK_00",
  tool: "pencil",
  import: {
    destination: "MAIN",
    removeDuplicates: true,
    detectFlips: true,
    organizePalettes: true,
    generateMetatiles: false
  },
  romImport: {
    destination: "MAIN",
    mode: "candidates",
    offset: 0,
    tileCount: 64,
    selectedCandidate: -1,
    fileName: "",
    fileSize: 0,
    format: "",
    candidates: []
  }
};

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hex(value, width = 6) {
  return "$" + Math.max(0, Number(value) || 0).toString(16).toUpperCase().padStart(width, "0");
}

function normalize(project) {
  project.graphics ||= {
    tilesets: [],
    palettes: [],
    metatiles: [],
    imports: []
  };

  project.graphics.tilesets ||= [];
  project.graphics.palettes ||= [];
  project.graphics.metatiles ||= [];
  project.graphics.imports ||= [];
  project.graphics.ui ||= clone(INITIAL_STATE);

  const ui = project.graphics.ui;

  if (!ui.view) ui.view = "tiles";
  if (!ui.tileset) ui.tileset = "MAIN";
  if (ui.selectedTile == null) ui.selectedTile = 0;
  if (ui.selectedPalette == null) ui.selectedPalette = 0;
  if (!ui.metatileSize) ui.metatileSize = "2x2";
  if (!ui.selectedMetatile) ui.selectedMetatile = "BLOCK_00";
  if (!ui.tool) ui.tool = "pencil";
  ui.import ||= clone(INITIAL_STATE.import);
  ui.romImport ||= clone(INITIAL_STATE.romImport);

  // Compatibilidade com estados criados pelo esqueleto anterior.
  for (const key of Object.keys(INITIAL_STATE.romImport)) {
    if (ui.romImport[key] == null) ui.romImport[key] = clone(INITIAL_STATE.romImport[key]);
  }

  return project.graphics;
}

function button(icon, title, action, active) {
  return `
    <button
      class="gfx-icon-btn ${active ? "active" : ""}"
      data-action="${esc(action)}"
      title="${esc(title)}"
      aria-label="${esc(title)}">${icon}</button>`;
}

function renderTabs(ui) {
  return `
    <div class="gfx-tabs">
      <button class="gfx-tab ${ui.view === "tiles" ? "active" : ""}" data-view="tiles">Tiles</button>
      <button class="gfx-tab ${ui.view === "metatiles" ? "active" : ""}" data-view="metatiles">Metatiles</button>
      <button class="gfx-tab ${ui.view === "import" ? "active" : ""}" data-view="import">Importar imagem</button>
      <button class="gfx-tab ${ui.view === "rom" ? "active" : ""}" data-view="rom">Importar ROM</button>
    </div>`;
}

function getTileset(project, name) {
  const list = project.graphics?.tilesets || [];
  return list.find(t => t && t.name === name) || null;
}

function ensureTileset(project, name) {
  project.graphics ||= { tilesets: [], palettes: [], metatiles: [], imports: [] };
  project.graphics.tilesets ||= [];

  let ts = getTileset(project, name);
  if (!ts) {
    ts = {
      id: `tileset_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      format: "md-4bpp",
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      tileBytes: TILE_BYTES,
      tiles: []
    };
    project.graphics.tilesets.push(ts);
  }
  ts.tiles ||= [];
  return ts;
}

function bytesToPixels(bytes) {
  const pixels = new Array(64).fill(0);
  for (let y = 0; y < 8; y++) {
    const row = y * 4;
    for (let x = 0; x < 8; x += 2) {
      const b = bytes[row + (x >> 1)] || 0;
      pixels[y * 8 + x] = (b >> 4) & 0x0F;
      pixels[y * 8 + x + 1] = b & 0x0F;
    }
  }
  return pixels;
}

function pixelsToBytes(pixels) {
  const out = new Uint8Array(32);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x += 2) {
      const a = Number(pixels[y * 8 + x] || 0) & 0x0F;
      const b = Number(pixels[y * 8 + x + 1] || 0) & 0x0F;
      out[y * 4 + (x >> 1)] = (a << 4) | b;
    }
  }
  return out;
}

function tileKey(tile) {
  return Array.from(tile).map(v => v.toString(16).padStart(2, "0")).join("");
}

function flipTile(tile, horizontal, vertical) {
  const src = bytesToPixels(tile);
  const dst = new Array(64).fill(0);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const sx = horizontal ? 7 - x : x;
      const sy = vertical ? 7 - y : y;
      dst[y * 8 + x] = src[sy * 8 + sx];
    }
  }
  return pixelsToBytes(dst);
}

function getCanonicalTile(bytes, detectFlips) {
  const original = new Uint8Array(bytes);
  const variants = [{ bytes: original, flipH: false, flipV: false }];

  if (detectFlips) {
    variants.push({ bytes: flipTile(original, true, false), flipH: true, flipV: false });
    variants.push({ bytes: flipTile(original, false, true), flipH: false, flipV: true });
    variants.push({ bytes: flipTile(original, true, true), flipH: true, flipV: true });
  }

  variants.sort((a, b) => tileKey(a.bytes).localeCompare(tileKey(b.bytes)));
  const best = variants[0];
  return { key: tileKey(best.bytes), flipH: best.flipH, flipV: best.flipV };
}

function scoreTile(bytes) {
  // Heurística apenas para localizar regiões gráficas. Não afirma que um bloco
  // encontrado é realmente um tile do jogo.
  let nonZero = 0;
  const nibbleSeen = new Uint8Array(16);
  let distinct = 0;
  let sameByte = 0;

  for (let i = 0; i < 32; i++) {
    const b = bytes[i] || 0;
    if (b !== 0) nonZero += 2;
    const a = (b >> 4) & 15;
    const c = b & 15;
    if (!nibbleSeen[a]) { nibbleSeen[a] = 1; distinct++; }
    if (!nibbleSeen[c]) { nibbleSeen[c] = 1; distinct++; }
    if (i > 0 && b === bytes[i - 1]) sameByte++;
  }

  const density = nonZero / 64;
  let score = 0;
  if (density > 0.02 && density < 0.95) score += 0.30;
  if (distinct >= 2 && distinct <= 12) score += 0.30;
  if (sameByte >= 4) score += 0.15;
  if (density > 0.08 && density < 0.80) score += 0.15;
  if (distinct <= 8) score += 0.10;
  return score;
}

function scanRomCandidates(buffer) {
  const bytes = new Uint8Array(buffer);
  const start = bytes.length > 0x200 ? 0x200 : 0;
  const tileCount = Math.floor((bytes.length - start) / TILE_BYTES);
  if (tileCount <= 0) return [];

  const scores = new Float32Array(tileCount);
  for (let i = 0; i < tileCount; i++) {
    scores[i] = scoreTile(bytes.subarray(start + i * TILE_BYTES, start + i * TILE_BYTES + TILE_BYTES));
  }

  const window = Math.min(ROM_CANDIDATE_TILES, tileCount);
  const candidates = [];
  let sum = 0;
  for (let i = 0; i < window; i++) sum += scores[i];

  for (let i = 0; i <= tileCount - window; i++) {
    if (i > 0) {
      sum -= scores[i - 1];
      sum += scores[i + window - 1];
    }

    const avg = sum / window;
    if (avg < 0.58) continue;

    const offset = start + i * TILE_BYTES;
    candidates.push({
      offset,
      tileCount: window,
      score: avg
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.offset - b.offset);

  // Evita mostrar várias janelas sobrepostas da mesma região.
  const filtered = [];
  const span = window * TILE_BYTES;
  for (const candidate of candidates) {
    const overlaps = filtered.some(c => Math.abs(c.offset - candidate.offset) < span / 2);
    if (!overlaps) filtered.push(candidate);
    if (filtered.length >= ROM_MAX_CANDIDATES) break;
  }
  return filtered;
}

function detectRomFormat(bytes) {
  const sega = bytes.length >= 0x104 &&
    bytes[0x100] === 0x53 && bytes[0x101] === 0x45 && bytes[0x102] === 0x47 && bytes[0x103] === 0x41;

  const possibleSmd = bytes.length >= 512 && (bytes.length % 0x4000) === 512;
  return {
    segaHeader: sega,
    smd: possibleSmd,
    label: sega ? (possibleSmd ? "Mega Drive / SMD" : "Mega Drive / BIN") : "BIN sem assinatura SEGA"
  };
}

function deinterleaveSmd(bytes) {
  // Formato SMD tradicional: 512-byte header + blocos de 16 KiB interleaved.
  // Mantemos a conversão local e não modificamos o arquivo original.
  if (bytes.length < 512 || (bytes.length - 512) % 0x4000 !== 0) return bytes;

  const payload = bytes.subarray(512);
  const out = new Uint8Array(payload.length);
  for (let block = 0; block < payload.length; block += 0x4000) {
    const src = payload.subarray(block, block + 0x4000);
    const dst = out.subarray(block, block + 0x4000);
    for (let i = 0; i < 0x2000; i++) {
      dst[i * 2] = src[0x2000 + i];
      dst[i * 2 + 1] = src[i];
    }
  }
  return out;
}

function importRomRegion(project, bytes, offset, tileCount, destination, options = {}) {
  const ts = ensureTileset(project, destination);
  const maxTiles = Math.max(0, Math.min(Number(tileCount) || 0, Math.floor((bytes.length - offset) / TILE_BYTES)));
  if (!maxTiles) return { imported: 0, skipped: 0, startIndex: ts.tiles.length };

  const removeDuplicates = options.removeDuplicates !== false;
  const detectFlips = options.detectFlips !== false;

  const existing = new Map();
  ts.tiles.forEach((tile, index) => {
    if (tile?.data) {
      try {
        const raw = Uint8Array.from(tile.data);
        existing.set(getCanonicalTile(raw, detectFlips).key, index);
      } catch (_) {}
    }
  });

  let imported = 0;
  let skipped = 0;
  const startIndex = ts.tiles.length;

  for (let i = 0; i < maxTiles; i++) {
    const raw = new Uint8Array(bytes.subarray(offset + i * TILE_BYTES, offset + (i + 1) * TILE_BYTES));
    const canonical = getCanonicalTile(raw, detectFlips);

    if (removeDuplicates && existing.has(canonical.key)) {
      skipped++;
      continue;
    }

    const tile = {
      id: ts.tiles.length,
      data: Array.from(raw),
      pixels: bytesToPixels(raw),
      palette: 0,
      source: {
        type: "rom",
        romOffset: offset + i * TILE_BYTES,
        romTile: i
      }
    };

    ts.tiles.push(tile);
    existing.set(canonical.key, tile.id);
    imported++;
  }

  project.graphics.imports.push({
    type: "rom",
    fileName: project.graphics.ui?.romImport?.fileName || "ROM",
    format: project.graphics.ui?.romImport?.format || "BIN",
    destination,
    offset,
    tileCount: maxTiles,
    imported,
    skippedDuplicates: skipped,
    tileBytes: TILE_BYTES,
    createdAt: new Date().toISOString()
  });

  return { imported, skipped, startIndex };
}

function renderTiles(project, g) {
  const ui = g.ui;
  const ts = getTileset(project, ui.tileset);
  const tileCount = ts?.tiles?.length || 0;

  const sheetCount = Math.max(48, Math.min(256, tileCount || 48));
  const sheet = Array.from({ length: sheetCount }, (_, i) => {
    const exists = !!ts?.tiles?.[i];
    return `<button class="gfx-sheet-tile ${i === ui.selectedTile ? "selected" : ""} ${exists ? "has-data" : ""}" data-tile="${i}">
      <span>${i.toString(16).toUpperCase().padStart(2, "0")}</span>
    </button>`;
  }).join("");

  const colors = Array.from({ length: 16 }, (_, i) =>
    `<button class="gfx-color" data-color="${i}" title="Índice de cor ${i}"></button>`
  ).join("");

  const pixels = Array.from({ length: 64 }, (_, i) =>
    `<button class="gfx-pixel" data-pixel="${i}" title="Pixel ${i}"></button>`
  ).join("");

  return `
    <div class="gfx-workspace">

      <aside class="gfx-library">
        <div class="gfx-panel-title">Tilesets</div>

        <div class="gfx-list">
          ${TILESETS.map(name => `
            <button class="gfx-list-item ${name === ui.tileset ? "selected" : ""}"
                    data-tileset="${name}">
              <span class="gfx-folder">▦</span>${name}
            </button>`).join("")}
        </div>

        <button class="gfx-add" data-action="new-tileset">＋ Novo tileset</button>

        <div class="gfx-rom-shortcut">
          <div class="gfx-label">ROM</div>
          <button class="gfx-wide-btn gfx-rom-button" data-action="select-rom-file">▦ Importar tileset de uma ROM</button>
          <div class="gfx-note">Lê BIN/SMD localmente e procura regiões 8×8 / 4 BPP.</div>
        </div>
      </aside>

      <section class="gfx-editor">

        <div class="gfx-toolbar">
          <div class="gfx-tool-group">
            ${button("✎", "Lápis", "pencil", ui.tool === "pencil")}
            ${button("⌫", "Borracha", "eraser", ui.tool === "eraser")}
            ${button("▧", "Preencher", "fill", ui.tool === "fill")}
            ${button("⌁", "Conta-gotas", "eyedropper", ui.tool === "eyedropper")}
            ${button("□", "Seleção", "select", ui.tool === "select")}
          </div>

          <div class="gfx-tool-group">
            ${button("↶", "Desfazer", "undo")}
            ${button("↷", "Refazer", "redo")}
          </div>

          <div class="gfx-tool-group">
            ${button("⇆", "Inverter horizontalmente", "flipH")}
            ${button("⇅", "Inverter verticalmente", "flipV")}
          </div>
        </div>

        <div class="gfx-canvas-area">
          <div class="gfx-canvas-label">Tile ${ui.selectedTile.toString(16).toUpperCase().padStart(2, "0")} · 8 × 8 · 4 BPP</div>

          <div class="gfx-pixel-grid" aria-label="Editor de tile 8 por 8">
            ${pixels}
          </div>

          <div class="gfx-zoom">Zoom: 8×</div>
        </div>

        <div class="gfx-sheet">
          <div class="gfx-subtitle">Tabela de tiles · ${esc(ui.tileset)} · ${tileCount} tiles importados</div>
          <div class="gfx-sheet-grid">${sheet}</div>
        </div>
      </section>

      <aside class="gfx-properties">
        <div class="gfx-panel-title">Propriedades</div>

        <label>
          Tile selecionado
          <input value="${ui.selectedTile.toString(16).toUpperCase().padStart(2, "0")}" readonly>
        </label>

        <label>
          Paleta
          <select id="gfx-palette">
            ${[0, 1, 2, 3].map(i =>
              `<option value="${i}" ${i === ui.selectedPalette ? "selected" : ""}>PAL${i}</option>`
            ).join("")}
          </select>
        </label>

        <div class="gfx-prop-block">
          <div class="gfx-label">Exibição</div>
          <label class="gfx-check"><input type="checkbox" checked> Grade</label>
          <label class="gfx-check"><input type="checkbox" checked> Índices</label>
          <label class="gfx-check"><input type="checkbox"> Transparência</label>
        </div>

        <div class="gfx-prop-block">
          <div class="gfx-label">Paleta · 16 cores</div>
          <div class="gfx-palette">${colors}</div>
        </div>

        <div class="gfx-info">
          <b>Mega Drive / Genesis</b>
          <span>Tile: 8 × 8 px</span>
          <span>Formato: 4 BPP</span>
          <span>32 bytes por tile</span>
          <span>Paletas: PAL0–PAL3</span>
        </div>
      </aside>

    </div>`;
}

function renderMetatiles(g) {
  const ui = g.ui;
  const sizes = ["2x2", "2x3", "2x4", "3x3", "4x4"];

  return `
    <div class="gfx-workspace">

      <aside class="gfx-library">
        <div class="gfx-panel-title">Metatiles</div>

        <div class="gfx-list">
          ${METATILES.map(name => `
            <button class="gfx-list-item ${name === ui.selectedMetatile ? "selected" : ""}"
                    data-metatile="${name}">
              <span class="gfx-folder">◆</span>${name}
            </button>`).join("")}
        </div>

        <button class="gfx-add" data-action="new-metatile">＋ Novo metatile</button>
      </aside>

      <section class="gfx-editor">

        <div class="gfx-toolbar">
          <span class="gfx-toolbar-caption">Composição</span>

          <select id="gfx-metatile-size">
            ${sizes.map(size => `
              <option value="${size}" ${size === ui.metatileSize ? "selected" : ""}>
                ${size} tiles
              </option>`).join("")}
          </select>

          ${button("↶", "Desfazer", "undo")}
          ${button("↷", "Refazer", "redo")}
        </div>

        <div class="gfx-meta-canvas">
          <div class="gfx-meta-grid">
            ${Array.from({ length: 16 }, (_, i) => `
              <button class="gfx-meta-cell" data-meta-cell="${i}">
                ${i.toString(16).toUpperCase()}
              </button>`).join("")}
          </div>
        </div>

        <div class="gfx-sheet">
          <div class="gfx-subtitle">Tiles disponíveis</div>

          <div class="gfx-sheet-grid">
            ${Array.from({ length: 24 }, (_, i) => `
              <button class="gfx-sheet-tile">
                <span>${i.toString(16).toUpperCase().padStart(2, "0")}</span>
              </button>`).join("")}
          </div>
        </div>
      </section>

      <aside class="gfx-properties">
        <div class="gfx-panel-title">Composição</div>

        <label>
          Nome
          <input value="${esc(ui.selectedMetatile)}">
        </label>

        <label>
          Tamanho
          <input value="${esc(ui.metatileSize)} tiles" readonly>
        </label>

        <div class="gfx-prop-block">
          <div class="gfx-label">Tile selecionado</div>
          <div class="gfx-mini-value">—</div>
        </div>

        <div class="gfx-prop-block">
          <div class="gfx-label">Transformação</div>
          <button class="gfx-wide-btn" data-action="flipH">⇆ Flip H</button>
          <button class="gfx-wide-btn" data-action="flipV">⇅ Flip V</button>
        </div>

        <div class="gfx-info">
          <b>Asset reutilizável</b>
          <span>Os metatiles serão matéria-prima</span>
          <span>para Personagens e Backgrounds.</span>
        </div>
      </aside>

    </div>`;
}

function renderImport(g) {
  const im = g.ui.import;

  const checks = [
    ["removeDuplicates", "Remover tiles duplicados"],
    ["detectFlips", "Detectar Flip H / Flip V"],
    ["organizePalettes", "Detectar e organizar paletas"],
    ["generateMetatiles", "Gerar metatiles automaticamente"]
  ];

  return `
    <div class="gfx-import">

      <div class="gfx-import-head">
        <div>
          <div class="gfx-kicker">PIPELINE DE GRÁFICOS</div>
          <h2>Importar imagem</h2>
          <p>Preparar uma imagem para o formato gráfico do Mega Drive.</p>
        </div>

        <span class="gfx-badge">8 × 8 · 4 BPP</span>
      </div>

      <div class="gfx-import-grid">

        <section class="gfx-import-card">
          <div class="gfx-panel-title">Origem</div>

          <label class="gfx-file">
            <input id="gfx-image-file" type="file"
                   accept="image/png,image/bmp,image/gif,image/jpeg">
            <span>Selecionar imagem</span>
          </label>

          <div class="gfx-dropzone">
            Arraste uma imagem para esta área
          </div>

          <div class="gfx-note">
            A imagem será analisada antes de qualquer asset ser gravado.
          </div>
        </section>

        <section class="gfx-import-card">
          <div class="gfx-panel-title">Destino</div>

          <label>
            Tileset
            <select id="gfx-import-destination">
              ${TILESETS.map(name =>
                `<option value="${name}" ${name === im.destination ? "selected" : ""}>${name}</option>`
              ).join("")}
            </select>
          </label>

          <label>
            Paletas
            <select>
              <option>Usar paletas existentes</option>
              <option>Criar novas paletas</option>
              <option>Mesclar com paletas compatíveis</option>
            </select>
          </label>
        </section>

        <section class="gfx-import-card">
          <div class="gfx-panel-title">Otimização</div>

          ${checks.map(([key, label]) => `
            <label class="gfx-check">
              <input type="checkbox" data-import="${key}" ${im[key] ? "checked" : ""}>
              ${label}</label>`).join("")}
        </section>

      </div>

      <div class="gfx-import-preview">
        <div class="gfx-panel-title">Pré-visualização</div>
        <div class="gfx-preview-empty">Nenhuma imagem selecionada</div>
      </div>

      <div class="gfx-import-actions">
        <button class="gfx-secondary">Cancelar</button>
        <button class="gfx-primary" id="gfx-analyze">Analisar imagem</button>
      </div>
    </div>`;
}

function renderRomImport(project, g) {
  const ui = g.ui;
  const ri = ui.romImport;
  const candidates = Array.isArray(ri.candidates) ? ri.candidates : [];
  const selected = ri.selectedCandidate >= 0 ? candidates[ri.selectedCandidate] : null;

  return `
    <div class="gfx-rom-import">
      <div class="gfx-rom-head">
        <div>
          <div class="gfx-kicker">MEGA DRIVE / GENESIS</div>
          <h2>Importar tileset de uma ROM</h2>
          <p>Analisa a ROM localmente e procura regiões que possam conter tiles nativos de 8 × 8 / 4 BPP.</p>
        </div>
        <span class="gfx-badge">32 bytes / tile</span>
      </div>

      <section class="gfx-rom-card gfx-rom-source">
        <div class="gfx-panel-title">1 · Selecionar ROM</div>
        <label class="gfx-file gfx-rom-file">
          <input id="gfx-rom-file" type="file" accept=".bin,.md,.gen,.smd,application/octet-stream">
          <span>Selecionar ROM Mega Drive</span>
        </label>

        <div class="gfx-rom-info" id="gfx-rom-info">
          ${ri.fileName
            ? `<b>${esc(ri.fileName)}</b><span>${(ri.fileSize / 1024 / 1024).toFixed(2)} MB · ${esc(ri.format || "BIN")}</span>`
            : `<span>Nenhuma ROM selecionada.</span>`}
        </div>

        <div class="gfx-note">
          A ROM é lida somente no navegador. O arquivo original não é enviado ao servidor.
        </div>
      </section>

      <div class="gfx-rom-grid">
        <section class="gfx-rom-card">
          <div class="gfx-panel-title">2 · Região gráfica</div>
          ${candidates.length
            ? `<div class="gfx-rom-candidates">
                ${candidates.map((c, i) => `
                  <button class="gfx-rom-candidate ${i === ri.selectedCandidate ? "selected" : ""}" data-rom-candidate="${i}">
                    <span>#${i + 1}</span>
                    <b>${hex(c.offset)}</b>
                    <small>${c.tileCount} tiles · ${(c.score * 100).toFixed(0)}% confiança heurística</small>
                  </button>`).join("")}
              </div>`
            : `<div class="gfx-preview-empty">Selecione uma ROM para procurar regiões candidatas.</div>`}

          <div class="gfx-rom-manual">
            <div class="gfx-label">Extração manual</div>
            <div class="gfx-rom-fields">
              <label>Offset (hex)
                <input id="gfx-rom-offset" value="${hex(ri.offset)}" placeholder="$000000">
              </label>
              <label>Quantidade de tiles
                <input id="gfx-rom-count" type="number" min="1" max="65535" value="${Math.max(1, ri.tileCount || 64)}">
              </label>
            </div>
          </div>
        </section>

        <section class="gfx-rom-card">
          <div class="gfx-panel-title">3 · Destino</div>
          <label>Tileset
            <select id="gfx-rom-destination">
              ${TILESETS.map(name => `<option value="${name}" ${name === ri.destination ? "selected" : ""}>${name}</option>`).join("")}
            </select>
          </label>

          <div class="gfx-rom-options">
            <label class="gfx-check"><input id="gfx-rom-duplicates" type="checkbox" ${g.ui.import.removeDuplicates ? "checked" : ""}> Remover tiles duplicados</label>
            <label class="gfx-check"><input id="gfx-rom-flips" type="checkbox" ${g.ui.import.detectFlips ? "checked" : ""}> Detectar H/V Flip</label>
          </div>

          <div class="gfx-rom-selection">
            ${selected
              ? `<b>Região selecionada</b><span>Offset ${hex(selected.offset)} · ${selected.tileCount} tiles</span>`
              : `<span>Escolha uma região ou informe um offset manual.</span>`}
          </div>
        </section>
      </div>

      <section class="gfx-rom-card gfx-rom-preview">
        <div class="gfx-panel-title">Prévia dos tiles</div>
        <div class="gfx-rom-tile-preview" id="gfx-rom-tile-preview">
          ${selected ? renderRomPreview(selected.preview || null) : `<span>Após selecionar uma região, os primeiros tiles aparecerão aqui.</span>`}
        </div>
      </section>

      <div class="gfx-import-actions">
        <button class="gfx-secondary" data-action="back-to-tiles">Voltar para Tiles</button>
        <button class="gfx-primary" id="gfx-rom-import-button" ${ri.fileName ? "" : "disabled"}>Importar tiles para ${esc(ri.destination)}</button>
      </div>

      <input id="gfx-rom-hidden-file" type="file" accept=".bin,.md,.gen,.smd,application/octet-stream" style="display:none">
    </div>`;
}

function renderRomPreview(preview) {
  if (!Array.isArray(preview) || !preview.length) return `<span>Nenhum tile de prévia.</span>`;
  return preview.map((tile, i) => {
    const pixels = bytesToPixels(Uint8Array.from(tile));
    const dots = pixels.map(p => `<i style="opacity:${p === 0 ? 0.16 : 0.25 + p / 20}"></i>`).join("");
    return `<div class="gfx-rom-preview-tile" title="Tile ${i}"><div>${dots}</div><span>${i.toString(16).toUpperCase().padStart(2, "0")}</span></div>`;
  }).join("");
}

export function render(project) {
  const g = normalize(project);
  const ui = g.ui;

  let body = renderTiles(project, g);
  if (ui.view === "metatiles") body = renderMetatiles(g);
  if (ui.view === "import") body = renderImport(g);
  if (ui.view === "rom") body = renderRomImport(project, g);

  return `
    <div class="mdg-graphics">

      <div class="gfx-head">
        <div>
          <div class="gfx-kicker">MEGA DRIVE / GENESIS</div>
          <h2>Gráficos</h2>
          <p>Tiles, paletas e metatiles — matéria-prima para personagens e backgrounds.</p>
        </div>

        <div class="gfx-head-actions">
          <button class="gfx-rom-top-btn" data-action="select-rom-file">▦ Importar tileset de uma ROM</button>
          <div class="gfx-status">VDP · MODE 5</div>
        </div>
      </div>

      ${renderTabs(ui)}
      ${body}

    </div>`;
}

function parseOffset(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  if (/^\$[0-9a-f]+$/i.test(text)) return parseInt(text.slice(1), 16) || 0;
  if (/^0x[0-9a-f]+$/i.test(text)) return parseInt(text, 16) || 0;
  return parseInt(text, 10) || 0;
}

function setRomCandidatePreview(project, candidate, bytes) {
  if (!candidate) return;
  const preview = [];
  const count = Math.min(24, candidate.tileCount);
  for (let i = 0; i < count; i++) {
    const off = candidate.offset + i * TILE_BYTES;
    preview.push(Array.from(bytes.subarray(off, off + TILE_BYTES)));
  }
  candidate.preview = preview;
}

async function handleRomFile(file, project, API) {
  const g = normalize(project);
  const ri = g.ui.romImport;
  if (!file) return;

  if (file.size > MAX_ROM_SCAN_BYTES) {
    alert(`ROM muito grande para a análise automática nesta primeira versão. Limite: ${MAX_ROM_SCAN_BYTES / 1024 / 1024} MB.`);
    return;
  }

  const buffer = await file.arrayBuffer();
  let bytes = new Uint8Array(buffer);
  const format = detectRomFormat(bytes);

  if (format.smd) bytes = deinterleaveSmd(bytes);

  const candidates = scanRomCandidates(bytes.buffer);
  candidates.forEach(c => setRomCandidatePreview(project, c, bytes));

  ri.fileName = file.name;
  ri.fileSize = file.size;
  ri.format = format.label;
  ri.candidates = candidates;
  ri.selectedCandidate = candidates.length ? 0 : -1;

  if (candidates[0]) {
    ri.offset = candidates[0].offset;
    ri.tileCount = candidates[0].tileCount;
  } else {
    ri.offset = 0;
    ri.tileCount = Math.min(64, Math.floor(bytes.length / TILE_BYTES));
  }

  // Mantemos a ROM somente em memória do módulo; ela nunca entra no .mdg.
  ROM_BUFFER = bytes;
  API.refresh();
}

export function mount(panel, project, API) {
  const g = normalize(project);
  const ui = g.ui;

  panel.querySelectorAll("[data-view]").forEach(el => {
    el.addEventListener("click", () => {
      ui.view = el.dataset.view;
      API.refresh();
    });
  });

  panel.querySelectorAll("[data-tileset]").forEach(el => {
    el.addEventListener("click", () => {
      ui.tileset = el.dataset.tileset;
      API.refresh();
    });
  });

  panel.querySelectorAll("[data-tile]").forEach(el => {
    el.addEventListener("click", () => {
      ui.selectedTile = Number(el.dataset.tile);
      API.refresh();
    });
  });

  panel.querySelectorAll("[data-metatile]").forEach(el => {
    el.addEventListener("click", () => {
      ui.selectedMetatile = el.dataset.metatile;
      API.refresh();
    });
  });

  panel.querySelectorAll("[data-rom-candidate]").forEach(el => {
    el.addEventListener("click", () => {
      const index = Number(el.dataset.romCandidate);
      const c = ui.romImport.candidates?.[index];
      if (!c) return;
      ui.romImport.selectedCandidate = index;
      ui.romImport.offset = c.offset;
      ui.romImport.tileCount = c.tileCount;
      API.refresh();
    });
  });

  panel.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", () => {
      const action = el.dataset.action;

      if (action === "select-rom-file") {
        ui.view = "rom";
        API.refresh();
        setTimeout(() => panel.querySelector("#gfx-rom-file")?.click(), 0);
        return;
      }

      if (action === "back-to-tiles") {
        ui.view = "tiles";
        API.refresh();
        return;
      }

      if (["pencil", "eraser", "fill", "eyedropper", "select"].includes(action)) {
        ui.tool = action;
        API.refresh();
        return;
      }

      if (["flipH", "flipV", "undo", "redo"].includes(action)) {
        return;
      }
    });
  });

  panel.querySelector("#gfx-palette")?.addEventListener("change", e => {
    ui.selectedPalette = Number(e.target.value);
    API.refresh();
  });

  panel.querySelector("#gfx-metatile-size")?.addEventListener("change", e => {
    ui.metatileSize = e.target.value;
    API.refresh();
  });

  panel.querySelectorAll("[data-import]").forEach(el => {
    el.addEventListener("change", e => {
      ui.import[el.dataset.import] = e.target.checked;
    });
  });

  panel.querySelector("#gfx-import-destination")?.addEventListener("change", e => {
    ui.import.destination = e.target.value;
  });

  panel.querySelector("#gfx-image-file")?.addEventListener("change", e => {
    const preview = panel.querySelector(".gfx-preview-empty");
    const file = e.target.files?.[0];
    if (preview && file) preview.textContent = `Imagem selecionada: ${file.name}`;
  });

  panel.querySelector("#gfx-analyze")?.addEventListener("click", () => {
    const preview = panel.querySelector(".gfx-preview-empty");
    if (preview) preview.textContent = "Estrutura pronta para análise. O processador de imagem será conectado na próxima etapa.";
  });

  panel.querySelector("#gfx-rom-file")?.addEventListener("change", async e => {
    try {
      await handleRomFile(e.target.files?.[0], project, API);
    } catch (error) {
      console.error(error);
      alert("Não foi possível analisar a ROM: " + (error.message || error));
    }
  });

  panel.querySelector("#gfx-rom-offset")?.addEventListener("change", e => {
    ui.romImport.offset = parseOffset(e.target.value);
    ui.romImport.selectedCandidate = -1;
  });

  panel.querySelector("#gfx-rom-count")?.addEventListener("change", e => {
    ui.romImport.tileCount = Math.max(1, Math.min(65535, Number(e.target.value) || 1));
    ui.romImport.selectedCandidate = -1;
  });

  panel.querySelector("#gfx-rom-destination")?.addEventListener("change", e => {
    ui.romImport.destination = e.target.value;
  });

  panel.querySelector("#gfx-rom-duplicates")?.addEventListener("change", e => {
    ui.import.removeDuplicates = e.target.checked;
  });

  panel.querySelector("#gfx-rom-flips")?.addEventListener("change", e => {
    ui.import.detectFlips = e.target.checked;
  });

  panel.querySelector("#gfx-rom-import-button")?.addEventListener("click", () => {
    const bytes = ROM_BUFFER ? Uint8Array.from(ROM_BUFFER) : null;
    if (!bytes) {
      alert("Selecione uma ROM primeiro.");
      return;
    }

    const offset = Math.max(0, Number(ui.romImport.offset) || 0);
    const count = Math.max(1, Number(ui.romImport.tileCount) || 1);
    if (offset >= bytes.length || offset + TILE_BYTES > bytes.length) {
      alert("O offset informado está fora da ROM.");
      return;
    }

    const result = importRomRegion(project, bytes, offset, count, ui.romImport.destination, {
      removeDuplicates: ui.import.removeDuplicates,
      detectFlips: ui.import.detectFlips
    });

    ui.tileset = ui.romImport.destination;
    ui.selectedTile = result.startIndex;
    ui.view = "tiles";
    ROM_BUFFER = null;

    API.setProject?.(project);
    API.refresh();

    setTimeout(() => {
      alert(`Importação concluída.\n\nTiles adicionados: ${result.imported}\nDuplicados ignorados: ${result.skipped}`);
    }, 0);
  });
}

export function collect(project) {
  const g = normalize(project);

  // A ROM é mantida somente em memória do módulo e nunca entra no .mdg.
  return project;
}

export const DEFAULTS = clone(INITIAL_STATE);

// Exportado para testes internos e futuras etapas do importador.
export const MDG_TILE = Object.freeze({
  TILE_BYTES,
  TILE_SIZE,
  bytesToPixels,
  pixelsToBytes,
  flipTile,
  scanRomCandidates
});
