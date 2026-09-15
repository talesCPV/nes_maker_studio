/*
 * RetroCompiler — Mega Drive / Genesis
 * Módulo: Configuração do projeto
 *
 * Filosofia deste módulo:
 * - o usuário escolhe somente parâmetros que o hardware realmente permite alterar;
 * - tudo que é característica fixa do console fica somente leitura;
 * - combinações inválidas são eliminadas por presets, em vez de depender do build.
 */

const VIDEO_PRESETS = {
  "NTSC-H32-224": {
    region: "NTSC", standard: "NTSC", horizontal: "H32", width: 256, height: 224,
    refresh: "~59,9 Hz", cpuClock: "7,670 MHz", z80Clock: "3,580 MHz"
  },
  "NTSC-H40-224": {
    region: "NTSC", standard: "NTSC", horizontal: "H40", width: 320, height: 224,
    refresh: "~59,9 Hz", cpuClock: "7,670 MHz", z80Clock: "3,580 MHz"
  },
  "PAL-H32-224": {
    region: "PAL", standard: "PAL", horizontal: "H32", width: 256, height: 224,
    refresh: "~49,7 Hz", cpuClock: "7,600 MHz", z80Clock: "3,547 MHz"
  },
  "PAL-H40-224": {
    region: "PAL", standard: "PAL", horizontal: "H40", width: 320, height: 224,
    refresh: "~49,7 Hz", cpuClock: "7,600 MHz", z80Clock: "3,547 MHz"
  },
  "PAL-H32-240": {
    region: "PAL", standard: "PAL", horizontal: "H32", width: 256, height: 240,
    refresh: "~49,7 Hz", cpuClock: "7,600 MHz", z80Clock: "3,547 MHz"
  },
  "PAL-H40-240": {
    region: "PAL", standard: "PAL", horizontal: "H40", width: 320, height: 240,
    refresh: "~49,7 Hz", cpuClock: "7,600 MHz", z80Clock: "3,547 MHz"
  }
};

const PLANE_SIZES = [
  ["32x32", "32 × 32 tiles"],
  ["64x32", "64 × 32 tiles"],
  ["128x32", "128 × 32 tiles"],
  ["32x64", "32 × 64 tiles"],
  ["64x64", "64 × 64 tiles"],
  ["32x128", "32 × 128 tiles"]
];

const DEFAULT_CONFIG = {
  metadata: {
    name: "",
    description: "",
    author: "",
    version: "1.0.0",
    genre: "",
    language: "pt-BR"
  },

  target: {
    videoPreset: "NTSC-H40-224"
  },

  cpu: {
    main: "Motorola 68000",
    clockMHz: 7.670454,
    endian: "Big-endian",
    resetVector: "ROM $000000",
    z80: "Zilog Z80 — hardware presente"
  },

  vdp: {
    mode: "Mode 5",
    horizontalMode: "H40",
    tileSize: "8 × 8 pixels",
    bitsPerPixel: 4,
    colorsPerTile: 16,
    paletteLines: 4,
    simultaneousColors: 64,
    totalColors: 512,
    vramKB: 64,
    cramBytes: 128,
    vsramBytes: 80,
    dma: "Disponível",
    planeA: "Disponível",
    planeB: "Disponível",
    window: "Disponível",
    sprites: "Disponível",
    horizontalScroll: "Disponível",
    verticalScroll: "Disponível"
  },

  planes: {
    size: "64x32",
    window: "Determinado pelo modo H32/H40 e pelo modo vertical"
  },

  sprites: {
    maxPerFrame: 80,
    maxPerScanline: 20,
    maxSpriteSize: "4 × 4 tiles (32 × 32 px)",
    tileSize: "8 × 8 pixels"
  },

  memory: {
    romStart: "$000000",
    standardRomAddressSpace: "4 MB",
    workRamStart: "$FF0000",
    workRamKB: 64,
    z80RamKB: 8,
    vramKB: 64,
    cramBytes: 128,
    vsramBytes: 80
  },

  audio: {
    ym2612: "Yamaha YM2612 — 6 canais FM",
    psg: "SN76489/PSG — 4 canais (3 tons + ruído)",
    z80: "Zilog Z80 — processador de áudio",
    dac: "Canal 6 do YM2612"
  },

  input: {
    controller: "3-button",
    ports: 2
  },

  build: {
    assembler: "Definido pelo toolchain do RetroCompiler",
    format: "ROM Mega Drive / Genesis",
    outputExtension: ".bin",
    header: "Header de ROM Mega Drive",
    checksum: "Checksum de ROM"
  }
};

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function mergeDefaults(target, defaults) {
  if (!target || typeof target !== "object") target = {};
  Object.keys(defaults).forEach(key => {
    if (defaults[key] && typeof defaults[key] === "object" && !Array.isArray(defaults[key])) {
      target[key] = mergeDefaults(target[key], defaults[key]);
    } else if (target[key] === undefined || target[key] === null) {
      target[key] = defaults[key];
    }
  });
  return target;
}

function ensureConfig(project) {
  if (!project || typeof project !== "object") return cloneDefault();
  project.config = mergeDefaults(project.config, cloneDefault());

  if (project.name && !project.config.metadata.name) project.config.metadata.name = project.name;
  if (project.description && !project.config.metadata.description) project.config.metadata.description = project.description;
  if (project.author && !project.config.metadata.author) project.config.metadata.author = project.author;

  normalizeConfig(project.config);
  return project.config;
}

function normalizeConfig(c) {
  if (!VIDEO_PRESETS[c.target.videoPreset]) c.target.videoPreset = DEFAULT_CONFIG.target.videoPreset;
  if (!PLANE_SIZES.some(([v]) => v === c.planes.size)) c.planes.size = DEFAULT_CONFIG.planes.size;
  if (!["3-button", "6-button"].includes(c.input.controller)) c.input.controller = DEFAULT_CONFIG.input.controller;

  const p = VIDEO_PRESETS[c.target.videoPreset];
  c.cpu.clockMHz = p.region === "PAL" ? 7.600489 : 7.670454;
  c.vdp.horizontalMode = p.horizontal;
  c.vdp.mode = "Mode 5";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function selected(value, current) {
  return String(value) === String(current) ? " selected" : "";
}

function field(label, id, value, type = "text", extra = "") {
  return `
    <label class="config-field">
      <span>${label}</span>
      <input id="${id}" type="${type}" value="${esc(value)}" ${extra}>
    </label>
  `;
}

function readonlyField(label, id, value) {
  return field(label, id, value, "text", 'readonly class="config-readonly"');
}

function selectField(label, id, options, current) {
  return `
    <label class="config-field">
      <span>${label}</span>
      <select id="${id}">
        ${options.map(([value, text]) => `<option value="${esc(value)}"${selected(value, current)}>${esc(text)}</option>`).join("")}
      </select>
    </label>
  `;
}

function section(title, body, note = "") {
  return `
    <section class="config-section">
      <div class="config-section-title">${title}</div>
      ${note ? `<div class="config-note">${note}</div>` : ""}
      <div class="config-grid">${body}</div>
    </section>
  `;
}

export function render(project) {
  const c = ensureConfig(project);
  const m = c.metadata;
  const t = c.target;
  const p = VIDEO_PRESETS[t.videoPreset];

  return `
    <div class="panel mdg-config">
      <div class="config-head">
        <div>
          <h2>Configuração do Projeto</h2>
          <p class="muted">Somente parâmetros que podem ser definidos pelo software no hardware real do Mega Drive / Genesis.</p>
        </div>
        <div class="config-badge">SEGA MEGA DRIVE · HARDWARE REAL</div>
      </div>

      <div class="config-warning">
        <strong>Regra do RetroCompiler:</strong> características fixas do console são somente leitura.
        Seleções são oferecidas apenas quando o VDP, CPU, áudio ou I/O realmente permitem a configuração.
      </div>

      ${section("Identidade do jogo", `
        ${field("Nome do jogo", "cfg-name", m.name)}
        ${field("Versão", "cfg-version", m.version)}
        ${field("Autor", "cfg-author", m.author)}
        ${field("Gênero", "cfg-genre", m.genre)}
        ${selectField("Idioma", "cfg-language", [["pt-BR", "Português (Brasil)"], ["en-US", "English"], ["es-ES", "Español"]], m.language)}
        <label class="config-field config-wide"><span>Descrição</span><textarea id="cfg-description" rows="3">${esc(m.description)}</textarea></label>
      `)}

      ${section("Vídeo — perfil de hardware", `
        ${selectField("Preset de vídeo", "cfg-video-preset", Object.entries(VIDEO_PRESETS).map(([id, p]) => [id, `${p.region} · ${p.horizontal} · ${p.width}×${p.height}`]), t.videoPreset)}
        ${readonlyField("Região", "cfg-region", p.region)}
        ${readonlyField("Padrão de vídeo", "cfg-standard", p.standard)}
        ${readonlyField("Modo horizontal", "cfg-horizontal", p.horizontal)}
        ${readonlyField("Resolução", "cfg-resolution", `${p.width} × ${p.height} pixels`)}
        ${readonlyField("Refresh efetivo", "cfg-refresh", p.refresh)}
        ${readonlyField("Modo vertical", "cfg-vertical", p.height === 240 ? "V30 — 30 células" : "V28 — 28 células")}
      `, "Os presets eliminam combinações inválidas. 240 linhas fica disponível somente no perfil PAL; a frequência é derivada da região e não é editável.")}

      ${section("CPU principal", `
        ${readonlyField("CPU", "cfg-cpu", c.cpu.main)}
        ${readonlyField("Clock efetivo", "cfg-cpu-clock", p.cpuClock)}
        ${readonlyField("Endian", "cfg-endian", c.cpu.endian)}
        ${readonlyField("Reset vector", "cfg-reset", c.cpu.resetVector)}
        ${readonlyField("Z80", "cfg-z80", c.cpu.z80)}
        ${readonlyField("Clock Z80 efetivo", "cfg-z80-clock", p.z80Clock)}
      `, "O 68000 e o Z80 são processadores físicos do console. Seus clocks são derivados do oscilador da região e não podem ser digitados pelo projeto.")}

      ${section("VDP — hardware gráfico", `
        ${readonlyField("VDP", "cfg-vdp-mode", c.vdp.mode)}
        ${readonlyField("Tile", "cfg-tile-size", c.vdp.tileSize)}
        ${readonlyField("Bits por pixel", "cfg-bpp", c.vdp.bitsPerPixel)}
        ${readonlyField("Cores por tile", "cfg-colors-tile", c.vdp.colorsPerTile)}
        ${readonlyField("Linhas de paleta", "cfg-palette-lines", c.vdp.paletteLines)}
        ${readonlyField("Cores simultâneas", "cfg-sim-colors", c.vdp.simultaneousColors)}
        ${readonlyField("Cores disponíveis", "cfg-total-colors", c.vdp.totalColors)}
        ${readonlyField("VRAM", "cfg-vram", `${c.vdp.vramKB} KB`)}
        ${readonlyField("CRAM", "cfg-cram", `${c.vdp.cramBytes} bytes`)}
        ${readonlyField("VSRAM", "cfg-vsram", `${c.vdp.vsramBytes} bytes`)}
        ${readonlyField("DMA", "cfg-dma", c.vdp.dma)}
        ${readonlyField("Plane A", "cfg-plane-a", c.vdp.planeA)}
        ${readonlyField("Plane B", "cfg-plane-b", c.vdp.planeB)}
        ${readonlyField("Window", "cfg-window", c.vdp.window)}
        ${readonlyField("Sprites", "cfg-sprites", c.vdp.sprites)}
      `, "Esses recursos pertencem ao hardware. O usuário não pode aumentar memória, alterar bpp ou remover componentes que fisicamente existem no Genesis.")}

      ${section("Planes / tilemaps", `
        ${selectField("Tamanho de Plane A + B", "cfg-plane-size", PLANE_SIZES, c.planes.size)}
        ${readonlyField("Window", "cfg-window-size", c.planes.window)}
        ${readonlyField("Scroll horizontal", "cfg-hscroll", c.vdp.horizontalScroll)}
        ${readonlyField("Scroll vertical", "cfg-vscroll", c.vdp.verticalScroll)}
      `, "O tamanho do tilemap é configurável pelo VDP. A lista contém somente combinações de largura/altura suportadas pelo hardware.")}

      ${section("Sprites", `
        ${readonlyField("Máximo no frame", "cfg-sprite-frame", c.sprites.maxPerFrame)}
        ${readonlyField("Máximo por scanline", "cfg-sprite-line", c.sprites.maxPerScanline)}
        ${readonlyField("Tamanho máximo", "cfg-sprite-max", c.sprites.maxSpriteSize)}
        ${readonlyField("Tile do sprite", "cfg-sprite-tile", c.sprites.tileSize)}
      `, "O tamanho de cada sprite é escolhido no módulo de sprites entre 1×1 e 4×4 tiles. Aqui mostramos apenas os limites físicos do VDP.")}

      ${section("Memória física", `
        ${readonlyField("Início da ROM", "cfg-rom-start", c.memory.romStart)}
        ${readonlyField("Espaço ROM padrão", "cfg-rom-space", c.memory.standardRomAddressSpace)}
        ${readonlyField("Work RAM", "cfg-workram", `${c.memory.workRamKB} KB`)}
        ${readonlyField("Endereço Work RAM", "cfg-workram-start", c.memory.workRamStart)}
        ${readonlyField("Z80 RAM", "cfg-z80ram", `${c.memory.z80RamKB} KB`)}
        ${readonlyField("VRAM", "cfg-mem-vram", `${c.memory.vramKB} KB`)}
        ${readonlyField("CRAM", "cfg-mem-cram", `${c.memory.cramBytes} bytes`)}
        ${readonlyField("VSRAM", "cfg-mem-vsram", `${c.memory.vsramBytes} bytes`)}
      `, "Os tamanhos de RAM/VRAM/CRAM/VSRAM são propriedades físicas do console e não são opções do usuário.")}

      ${section("Áudio", `
        ${readonlyField("FM", "cfg-ym2612", c.audio.ym2612)}
        ${readonlyField("PSG", "cfg-psg", c.audio.psg)}
        ${readonlyField("Processador de áudio", "cfg-audio-z80", c.audio.z80)}
        ${readonlyField("DAC", "cfg-dac", c.audio.dac)}
      `, "O hardware de áudio é fixo. A configuração de instrumentos, canais, música e efeitos será feita nos módulos de áudio.")}

      ${section("Controles", `
        ${selectField("Tipo de controle", "cfg-controller", [["3-button", "Controle 3 botões"], ["6-button", "Controle 6 botões"]], c.input.controller)}
        ${readonlyField("Portas físicas", "cfg-ports", c.input.ports)}
      `, "O tipo de controle é uma escolha de software/protocolo. O console possui duas portas principais de controle.")}

      ${section("Build / ROM", `
        ${readonlyField("Toolchain", "cfg-assembler", c.build.assembler)}
        ${readonlyField("Formato", "cfg-format", c.build.format)}
        ${readonlyField("Extensão", "cfg-extension", c.build.outputExtension)}
        ${readonlyField("Header", "cfg-header", c.build.header)}
        ${readonlyField("Checksum", "cfg-checksum", c.build.checksum)}
      `, "Esses valores serão definidos pelo toolchain oficial do RetroCompiler. Não são parâmetros de hardware editáveis pelo usuário.")}

      <div class="config-actions">
        <button type="button" class="btn-tool" id="cfg-reset-default">↺ Restaurar padrão Genesis</button>
        <button type="button" class="btn-tool" id="cfg-save">💾 Aplicar configuração</button>
      </div>

      <div class="config-summary" id="cfg-summary"></div>
    </div>
  `;
}

function value(id, fallback = "") {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}

function collect(project) {
  const c = ensureConfig(project);

  c.metadata.name = value("cfg-name", c.metadata.name);
  c.metadata.version = value("cfg-version", c.metadata.version);
  c.metadata.author = value("cfg-author", c.metadata.author);
  c.metadata.genre = value("cfg-genre", c.metadata.genre);
  c.metadata.language = value("cfg-language", c.metadata.language);
  c.metadata.description = value("cfg-description", c.metadata.description);

  c.target.videoPreset = value("cfg-video-preset", c.target.videoPreset);
  c.planes.size = value("cfg-plane-size", c.planes.size);
  c.input.controller = value("cfg-controller", c.input.controller);

  normalizeConfig(c);

  const p = VIDEO_PRESETS[c.target.videoPreset];
  if (c.metadata.name) project.name = c.metadata.name;
  project.description = c.metadata.description;
  project.author = c.metadata.author;
  project.system = "MEGA DRIVE";
  project.cpu = c.cpu.main;
  project.video = `${p.horizontal} ${p.width}x${p.height}`;
  project.romSize = 4 * 1024 * 1024;

  return c;
}

function renderSummary(project) {
  const c = ensureConfig(project);
  const p = VIDEO_PRESETS[c.target.videoPreset];
  const el = document.getElementById("cfg-summary");
  if (!el) return;

  el.innerHTML = `<strong>Perfil atual:</strong> ${esc(p.region)} · ${esc(p.horizontal)} · ${p.width}×${p.height} · ${esc(p.refresh)} · 68000 ${esc(p.cpuClock)} · Plane ${esc(c.planes.size)} · controle ${esc(c.input.controller)}`;
}

export function mount(panel, project, API) {
  if (!project || typeof project !== "object") return;

  ensureConfig(project);
  renderSummary(project);

  const apply = () => {
    collect(project);
    renderSummary(project);
    if (API && typeof API.setProject === "function") API.setProject(project);
  };

  document.getElementById("cfg-save")?.addEventListener("click", () => {
    try {
      apply();
      if (API && typeof API.save === "function") {
        Promise.resolve(API.save()).catch(err => alert("Erro ao salvar configuração: " + (err?.message || err)));
      }
    } catch (err) {
      alert("Erro na configuração: " + (err?.message || err));
    }
  });

  document.getElementById("cfg-reset-default")?.addEventListener("click", () => {
    if (!confirm("Restaurar os parâmetros para o perfil padrão do Mega Drive / Genesis?")) return;
    project.config = cloneDefault();
    project.name = project.config.metadata.name || "Novo projeto Mega Drive";
    project.description = "";
    project.author = "";
    project.system = "MEGA DRIVE";
    project.cpu = project.config.cpu.main;
    project.video = "H40 320x224";
    project.romSize = 4 * 1024 * 1024;
    if (API && typeof API.refresh === "function") API.refresh();
  });

  panel.querySelectorAll("input, select, textarea").forEach(el => {
    if (el.readOnly || el.disabled) return;
    el.addEventListener("change", apply);
  });

  renderSummary(project);
}

export const DEFAULTS = DEFAULT_CONFIG;
