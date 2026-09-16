/* RetroCompiler — Mega Drive / Genesis — Módulo Gráficos
 * Esqueleto inicial: Tiles, Metatiles e Importação.
 * A lógica de edição/exportação será refinada nas próximas etapas.
 */

const TILESETS = ["MAIN", "PLAYER", "ENEMIES", "ITEMS", "SCENERY", "UI"];
const METATILES = ["BLOCK_00", "BLOCK_01", "FLOOR", "WALL", "CUSTOM"];

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
    </div>`;
}

function renderTiles(g) {
  const ui = g.ui;

  const sheet = Array.from({ length: 48 }, (_, i) => `
    <button class="gfx-sheet-tile ${i === ui.selectedTile ? "selected" : ""}" data-tile="${i}">
      <span>${i.toString(16).toUpperCase().padStart(2, "0")}</span>
    </button>`).join("");

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
          <div class="gfx-subtitle">Tabela de tiles · ${esc(ui.tileset)}</div>
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
              ${label}
            </label>`).join("")}
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

export function render(project) {
  const g = normalize(project);
  const ui = g.ui;

  let body = renderTiles(g);

  if (ui.view === "metatiles") body = renderMetatiles(g);
  if (ui.view === "import") body = renderImport(g);

  return `
    <div class="mdg-graphics">

      <div class="gfx-head">
        <div>
          <div class="gfx-kicker">MEGA DRIVE / GENESIS</div>
          <h2>Gráficos</h2>
          <p>Tiles, paletas e metatiles — matéria-prima para personagens e backgrounds.</p>
        </div>

        <div class="gfx-status">VDP · MODE 5</div>
      </div>

      ${renderTabs(ui)}
      ${body}

    </div>`;
}

export function mount(panel, project, API) {
  const g = normalize(project);
  const ui = g.ui;

  panel.querySelectorAll("[data-view]").forEach(el => {
    el.addEventListener("click", () => {
      ui.view = el.dataset.view;
      API.render();
    });
  });

  panel.querySelectorAll("[data-tileset]").forEach(el => {
    el.addEventListener("click", () => {
      ui.tileset = el.dataset.tileset;
      API.render();
    });
  });

  panel.querySelectorAll("[data-tile]").forEach(el => {
    el.addEventListener("click", () => {
      ui.selectedTile = Number(el.dataset.tile);
      API.render();
    });
  });

  panel.querySelectorAll("[data-metatile]").forEach(el => {
    el.addEventListener("click", () => {
      ui.selectedMetatile = el.dataset.metatile;
      API.render();
    });
  });

  panel.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", () => {
      const action = el.dataset.action;

      if (["pencil", "eraser", "fill", "eyedropper", "select"].includes(action)) {
        ui.tool = action;
        API.render();
        return;
      }

      /* Reservados para as próximas etapas de edição. */
      if (["flipH", "flipV", "undo", "redo"].includes(action)) {
        return;
      }
    });
  });

  panel.querySelector("#gfx-palette")?.addEventListener("change", e => {
    ui.selectedPalette = Number(e.target.value);
    API.render();
  });

  panel.querySelector("#gfx-metatile-size")?.addEventListener("change", e => {
    ui.metatileSize = e.target.value;
    API.render();
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

    if (preview && file) {
      preview.textContent = `Imagem selecionada: ${file.name}`;
    }
  });

  panel.querySelector("#gfx-analyze")?.addEventListener("click", () => {
    const preview = panel.querySelector(".gfx-preview-empty");

    if (preview) {
      preview.textContent =
        "Estrutura pronta para análise. O processador de imagem será conectado na próxima etapa.";
    }
  });
}

export function collect(project) {
  normalize(project);
  return project;
}

export const DEFAULTS = clone(INITIAL_STATE);
