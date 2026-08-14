// LEVEL DESIGN MODULE v1.0.0 - World/Phase Map Builder
const LEVEL_DESIGN = (() => {
  let currentWorld = {
    name: "world_1",
    cols: 4,
    rows: 4,
    transitionType: "hard_cut", // 'hard_cut', 'scroll_h', 'scroll_v'
    cells: {}, // Ex: "0,0": { bgId: "...", x: 0, y: 0 }
    warps: []  // Ex: { from: {x,y}, to: {x,y} }
  };
  let selectedSplashId = null;
  let activeTool = 'place'; // 'place', 'erase', 'warp'
  let warpSource = null;

  function buildHTML() {
    const root = document.getElementById('mod-world');
    if (!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <!-- Topbar -->
        <div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#ffcc00;margin:0">🗺️ LEVEL DESIGN (MAPAS DE FASES)</h3>
          <div style="display:flex;gap:6px;align-items:center;margin-left:12px">
            <span style="font-size:11px;color:#888">Fase:</span>
            <input id="ldWorldName" type="text" value="${currentWorld.name}" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px;width:100px">
            <span style="font-size:11px;color:#888">Transição:</span>
            <select id="ldTransitionType" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px">
              <option value="hard_cut" ${currentWorld.transitionType==='hard_cut'?'selected':''}>Hard-Cut (Zelda)</option>
              <option value="scroll_h" ${currentWorld.transitionType==='scroll_h'?'selected':''}>Scroll Horizontal (SMB1)</option>
              <option value="scroll_v" ${currentWorld.transitionType==='scroll_v'?'selected':''}>Scroll Vertical</option>
            </select>
            <span style="font-size:11px;color:#888">Cols:</span>
            <input id="ldCols" type="number" min="1" max="16" value="${currentWorld.cols}" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px;width:45px">
            <span style="font-size:11px;color:#888">Rows:</span>
            <input id="ldRows" type="number" min="1" max="16" value="${currentWorld.rows}" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px;width:45px">
            <button class="btn-tool" onclick="LEVEL_DESIGN.resizeGrid()" style="padding:4px 8px">🔄 Redimensionar</button>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <button class="btn-tool" onclick="LEVEL_DESIGN.saveToProject()" style="background:#27ae60;color:#fff">💾 Salvar Fase</button>
          </div>
        </div>

        <div style="display:flex;flex:1;overflow:hidden;min-height:0">
          <!-- Painel Esquerdo: Splash Screens Disponíveis -->
          <div style="width:280px;min-width:280px;background:#181818;border-right:1px solid #333;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">FERRAMENTAS</h4>
              <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                <button class="btn-tool ld-tool-btn active" data-tool="place" onclick="LEVEL_DESIGN.setTool('place')">🧩 Posicionar</button>
                <button class="btn-tool ld-tool-btn" data-tool="erase" onclick="LEVEL_DESIGN.setTool('erase')" style="background:#c0392b;color:#fff">🧹 Apagar</button>
                <button class="btn-tool ld-tool-btn" data-tool="warp" onclick="LEVEL_DESIGN.setTool('warp')" style="background:#8e44ad;color:#fff">🌀 Warp (Exceção)</button>
              </div>
              <div id="ldHelpText" style="font-size:10px;color:#888;background:#000;border:1px solid #222;border-radius:3px;padding:4px 6px">Selecione uma Splash Screen abaixo e clique numa célula da grade para alocá-la.</div>
            </div>

            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;flex:1;display:flex;flex-direction:column">
              <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">SPLASH SCREENS (TELAS)</h4>
              <div id="ldSplashList" style="display:flex;flex-direction:column;gap:6px;flex:1;overflow:auto"></div>
            </div>
          </div>

          <!-- Centro: Grid do Mapa de Fases -->
          <div style="flex:1;background:#111;padding:16px;overflow:auto;display:flex;flex-direction:column;align-items:center">
            <div id="ldGridContainer" style="display:grid;gap:4px;background:#222;padding:8px;border:2px solid #444;border-radius:6px"></div>
          </div>

          <!-- Painel Direito: Warps Configuradas -->
          <div style="width:280px;min-width:280px;background:#1e1e1e;padding:12px;border-left:1px solid #333;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #665500;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:8px">⚡ WARPS CONFIGURADAS</h4>
              <div id="ldWarpsList" style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow:auto"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    refreshSplashList();
    renderGrid();
    renderWarpsList();
  }

  function setTool(t) {
    activeTool = t;
    document.querySelectorAll('.ld-tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${t}"]`)?.classList.add('active');
    const help = document.getElementById('ldHelpText');
    if (!help) return;
    if (t === 'place') help.textContent = 'Clique em uma célula do grid para encaixar a Splash Screen selecionada.';
    else if (t === 'erase') help.textContent = 'Clique em uma célula preenchida para removê-la do mapa.';
    else if (t === 'warp') help.textContent = 'Modo Warp: Clique na sala de origem e depois na sala de destino para criar um atalho.';
  }

  function refreshSplashList() {
    const container = document.getElementById('ldSplashList');
    if (!container) return;
    container.innerHTML = '';
    const splashes = (typeof BG !== 'undefined' && BG.getSplashScreens) ? BG.getSplashScreens() : (Project.data?.splashScreens || []);
    
    if (splashes.length === 0) {
      container.innerHTML = `<div style="font-size:10px;color:#666">Nenhuma Splash Screen criada ainda.</div>`;
      return;
    }

    splashes.forEach((s, idx) => {
      const isSelected = selectedSplashId === s.id;
      const div = document.createElement('div');
      div.style.cssText = `background:${isSelected?'#332a00':'#181818'};border:1px solid ${isSelected?'#ffcc00':'#444'};border-radius:4px;padding:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center`;
      div.innerHTML = `<span style="font-size:11px;color:#fff">${s.name || 'Splash '+idx}</span>`;
      div.onclick = () => { selectedSplashId = s.id; refreshSplashList(); };
      container.appendChild(div);
    });
  }

  function renderGrid() {
    const container = document.getElementById('ldGridContainer');
    if (!container) return;
    
    container.style.gridTemplateColumns = `repeat(${currentWorld.cols}, 100px)`;
    container.style.gridTemplateRows = `repeat(${currentWorld.rows}, 90px)`;
    container.innerHTML = '';

    for (let y = 0; y < currentWorld.rows; y++) {
      for (let x = 0; x < currentWorld.cols; x++) {
        const key = `${x},${y}`;
        const cellData = currentWorld.cells[key];
        const cellDiv = document.createElement('div');
        cellDiv.style.cssText = `width:100px;height:90px;background:#111;border:1px dashed #444;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;padding:4px;text-align:center`;
        
        if (cellData) {
          const splashes = (typeof BG !== 'undefined' && BG.getSplashScreens) ? BG.getSplashScreens() : (Project.data?.splashScreens || []);
          const sp = splashes.find(s => s.id === cellData.bgId);
          cellDiv.style.border = '2px solid #4ec9b0';
          cellDiv.style.background = '#0a221f';
          cellDiv.innerHTML = `<span style="font-size:10px;color:#4ec9b0;font-weight:bold">${sp ? sp.name : 'Tela'}</span><span style="font-size:9px;color:#888">(${x}, ${y})</span>`;
        } else {
          cellDiv.innerHTML = `<span style="font-size:9px;color:#555">(${x}, ${y})</span>`;
        }

        cellDiv.onclick = () => handleCellClick(x, y);
        container.appendChild(cellDiv);
      }
    }
  }

  function handleCellClick(x, y) {
    const key = `${x},${y}`;
    if (activeTool === 'place') {
      if (!selectedSplashId) {
        alert('Selecione uma Splash Screen na lista lateral esquerda primeiro.');
        return;
      }
      currentWorld.cells[key] = { bgId: selectedSplashId, x, y };
      renderGrid();
    } else if (activeTool === 'erase') {
      delete currentWorld.cells[key];
      renderGrid();
    } else if (activeTool === 'warp') {
      if (!warpSource) {
        if (!currentWorld.cells[key]) { alert('A sala de origem precisa ter uma tela alocada.'); return; }
        warpSource = { x, y };
        alert(`Warp origem definida em (${x}, ${y}). Agora clique na sala de destino.`);
      } else {
        if (!currentWorld.cells[key]) { alert('A sala de destino precisa ter uma tela alocada.'); return; }
        currentWorld.warps.push({ from: warpSource, to: { x, y } });
        warpSource = null;
        renderWarpsList();
        alert('Warp criada com sucesso!');
      }
    }
  }

  function renderWarpsList() {
    const container = document.getElementById('ldWarpsList');
    if (!container) return;
    if (currentWorld.warps.length === 0) {
      container.innerHTML = `<div style="font-size:10px;color:#666">Nenhuma warp cadastrada.</div>`;
      return;
    }
    container.innerHTML = '';
    currentWorld.warps.forEach((w, idx) => {
      const d = document.createElement('div');
      d.style.cssText = `background:#111;border:1px solid #444;border-radius:4px;padding:4px 6px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#ccc`;
      d.innerHTML = `<span>(${w.from.x},${w.from.y}) ➡️ (${w.to.x},${w.to.y})</span><button onclick="LEVEL_DESIGN.removeWarp(${idx})" style="background:#c33;color:#fff;border:none;border-radius:2px;cursor:pointer;padding:1px 4px">X</button>`;
      container.appendChild(d);
    });
  }

  function removeWarp(idx) {
    currentWorld.warps.splice(idx, 1);
    renderWarpsList();
  }

  function resizeGrid() {
    const colsEl = document.getElementById('ldCols');
    const rowsEl = document.getElementById('ldRows');
    const nameEl = document.getElementById('ldWorldName');
    if (colsEl) currentWorld.cols = parseInt(colsEl.value) || 4;
    if (rowsEl) currentWorld.rows = parseInt(rowsEl.value) || 4;
    if (nameEl) currentWorld.name = nameEl.value || 'world_1';
    renderGrid();
    Project.status('Grade de level design redimensionada.');
  }

  function saveToProject() {
    if (!Project.data) return;
    const nameEl = document.getElementById('ldWorldName');
    const transEl = document.getElementById('ldTransitionType');
    if (nameEl) currentWorld.name = nameEl.value;
    if (transEl) currentWorld.transitionType = transEl.value;

    if (!Project.data.levels) Project.data.levels = [];
    const existingIdx = Project.data.levels.findIndex(l => l.name === currentWorld.name);
    if (existingIdx >= 0) {
      Project.data.levels[existingIdx] = JSON.parse(JSON.stringify(currentWorld));
    } else {
      Project.data.levels.push(JSON.parse(JSON.stringify(currentWorld)));
    }
    Project.status(`Fase "${currentWorld.name}" salva com sucesso no projeto!`);
  }

  return {
    init: buildHTML,
    setTool,
    resizeGrid,
    removeWarp,
    saveToProject,
    loadLevel: (lvl) => { currentWorld = JSON.parse(JSON.stringify(lvl)); buildHTML(); }
  };
})();