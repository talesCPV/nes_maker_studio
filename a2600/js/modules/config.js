/**
 * CONFIG — configurações do jogo Atari 2600
 * Análogo ao módulo dashboard.js do NES (metadados + “fases” = telas).
 */
const CONFIG = (() => {
  let selectedScreen = 0;

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
    return Project.data;
  }

  function buildHTML() {
    const root = document.getElementById('mod-config');
    if (!root) return;
    const d = ensureData();

    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;overflow:auto;padding:16px;gap:16px;background:#1e1e1e">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h3 style="margin:0;font-size:14px;color:#f4a261">⚙ CONFIGURAÇÕES DO JOGO</h3>
          <span style="font-size:11px;color:#666">Metadados, ROM, TV, kernel e telas</span>
        </div>

        <!-- Identidade -->
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

        <!-- Hardware / cartucho -->
        <div class="cfg-card">
          <div class="cfg-card-title">Cartucho / TV</div>
          <div class="cfg-grid">
            <label>Tamanho da ROM / mapper
              <select id="cfgRomSize">
                <option value="2048" ${d.romSize == 2048 ? 'selected' : ''}>2 KB — fixed (Pong, Combat…)</option>
                <option value="4096" ${d.romSize == 4096 || !d.romSize ? 'selected' : ''}>4 KB — fixed (maioria clássica)</option>
                <option value="8192" ${d.romSize == 8192 ? 'selected' : ''}>8 KB — F8 bankswitch</option>
                <option value="16384" ${d.romSize == 16384 ? 'selected' : ''}>16 KB — F6 bankswitch</option>
                <option value="32768" ${d.romSize == 32768 ? 'selected' : ''}>32 KB — F4 bankswitch</option>
              </select>
            </label>
            <label>Padrão de TV
              <select id="cfgTv">
                <option value="NTSC" ${(d.tv || 'NTSC') === 'NTSC' ? 'selected' : ''}>NTSC (60 Hz)</option>
                <option value="PAL" ${d.tv === 'PAL' ? 'selected' : ''}>PAL (50 Hz)</option>
              </select>
            </label>
            <label class="full">Kernel (tipo de jogo)
              <select id="cfgKernel">
                <option value="single_screen" ${d.kernel === 'single_screen' || !d.kernel ? 'selected' : ''}>Single screen (tela fixa)</option>
                <option value="adventure_rooms" ${d.kernel === 'adventure_rooms' ? 'selected' : ''}>Adventure rooms (várias salas)</option>
                <option value="vertical_scroll" ${d.kernel === 'vertical_scroll' ? 'selected' : ''}>Scroll vertical (futuro)</option>
              </select>
            </label>
          </div>
          <p style="margin:8px 0 0;font-size:11px;color:#666;line-height:1.4">
            Até <b style="color:#aaa">4 KB</b> a ROM é linear (sem bank). Acima disso usamos os
            schemes clássicos <b style="color:#aaa">F8 / F6 / F4</b> (8 / 16 / 32 KB), o suficiente
            para cobrir de Pong a River Raid, Enduro, Hero, etc. O <b style="color:#aaa">kernel</b>
            define o desenho por scanline; o tamanho da ROM define quanto código/dados cabem.
          </p>
        </div>

        <!-- Telas (análogo às fases do NES) -->
        <div class="cfg-card">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div class="cfg-card-title" style="margin:0">Telas / salas</div>
            <button type="button" class="cfg-btn" id="cfgAddScreen">+ Nova tela</button>
          </div>
          <div id="cfgScreenList" style="display:flex;flex-direction:column;gap:6px"></div>
          <div id="cfgScreenDetail" style="margin-top:12px;display:none"></div>
        </div>
      </div>
    `;

    bindFields();
    renderScreens();
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function bindFields() {
    const map = [
      ['cfgName', 'name', 'input'],
      ['cfgAuthor', 'author', 'input'],
      ['cfgDesc', 'description', 'input'],
      ['cfgRomSize', 'romSize', 'int'],
      ['cfgTv', 'tv', 'input'],
      ['cfgKernel', 'kernel', 'input'],
    ];
    map.forEach(([id, key, kind]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => {
        const d = ensureData();
        if (kind === 'int') d[key] = parseInt(el.value, 10) || 4096;
        else d[key] = el.value;
        if (key === 'name' && Project.updateHeader) Project.updateHeader();
        Project.status('alterado — salve o projeto');
      });
      if (kind !== 'int') {
        el.addEventListener('input', () => {
          ensureData()[key] = el.value;
          if (key === 'name' && Project.updateHeader) Project.updateHeader();
        });
      }
    });
    document.getElementById('cfgAddScreen')?.addEventListener('click', addScreen);
  }

  function renderScreens() {
    const d = ensureData();
    const list = document.getElementById('cfgScreenList');
    const detail = document.getElementById('cfgScreenDetail');
    if (!list) return;
    list.innerHTML = '';

    d.screens.forEach((sc, idx) => {
      const row = document.createElement('div');
      row.className = 'cfg-screen-row' + (idx === selectedScreen ? ' active' : '');
      row.innerHTML = `
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:#fff;font-weight:600">${escapeHtml(sc.name || 'Tela ' + (idx + 1))}</div>
          <div style="font-size:10px;color:#777">${escapeHtml(sc.description || 'Sem descrição')} · <code style="color:#666">${escapeHtml(sc.id || '')}</code></div>
        </div>
        <button type="button" class="cfg-btn-sm" data-act="edit" title="Editar">✎</button>
        <button type="button" class="cfg-btn-sm danger" data-act="del" title="Remover" ${d.screens.length <= 1 ? 'disabled' : ''}>🗑</button>
      `;
      row.querySelector('[data-act="edit"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedScreen = idx;
        renderScreens();
        showDetail();
      });
      row.querySelector('[data-act="del"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (d.screens.length <= 1) return;
        if (!confirm('Remover esta tela?')) return;
        d.screens.splice(idx, 1);
        if (selectedScreen >= d.screens.length) selectedScreen = d.screens.length - 1;
        renderScreens();
        showDetail();
        Project.status('Tela removida.');
      });
      row.addEventListener('click', () => {
        selectedScreen = idx;
        renderScreens();
        showDetail();
      });
      list.appendChild(row);
    });

    if (detail) {
      if (d.screens[selectedScreen]) showDetail();
      else detail.style.display = 'none';
    }
  }

  function showDetail() {
    const d = ensureData();
    const sc = d.screens[selectedScreen];
    const detail = document.getElementById('cfgScreenDetail');
    if (!detail || !sc) return;
    detail.style.display = 'block';
    detail.innerHTML = `
      <div class="cfg-card-title">Editar tela</div>
      <div class="cfg-grid">
        <label>Nome
          <input id="cfgScName" type="text" value="${escapeAttr(sc.name || '')}" />
        </label>
        <label class="full">Descrição
          <input id="cfgScDesc" type="text" value="${escapeAttr(sc.description || '')}" />
        </label>
      </div>
    `;
    document.getElementById('cfgScName')?.addEventListener('input', (e) => {
      sc.name = e.target.value;
      renderScreens();
    });
    document.getElementById('cfgScDesc')?.addEventListener('input', (e) => {
      sc.description = e.target.value;
    });
  }

  function addScreen() {
    const d = ensureData();
    d.screens.push({
      id: 'screen_' + Date.now(),
      name: 'Tela ' + (d.screens.length + 1),
      description: '',
    });
    selectedScreen = d.screens.length - 1;
    renderScreens();
    showDetail();
    Project.status('Nova tela adicionada.');
  }

  function flush() {
    const d = ensureData();
    const name = document.getElementById('cfgName');
    const author = document.getElementById('cfgAuthor');
    const desc = document.getElementById('cfgDesc');
    const rom = document.getElementById('cfgRomSize');
    const tv = document.getElementById('cfgTv');
    const kernel = document.getElementById('cfgKernel');
    if (name) d.name = name.value;
    if (author) d.author = author.value;
    if (desc) d.description = desc.value;
    if (rom) d.romSize = parseInt(rom.value, 10) || 4096;
    if (tv) d.tv = tv.value;
    if (kernel) d.kernel = kernel.value;
    return d;
  }

  function init() {
    buildHTML();
  }

  return { init, flush, buildHTML, renderScreens };
})();

window.CONFIG = CONFIG;
