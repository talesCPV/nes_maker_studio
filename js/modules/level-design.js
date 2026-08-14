// LEVEL DESIGN MODULE v1.2.3 - World/Phase Map Builder com Renderização Direta no Grid
const LEVEL_DESIGN = (() => {
  let currentWorld = {
    name: "world_1",
    cols: 4,
    rows: 4,
    transitionType: "hard_cut",
    cells: {}, 
    warps: []  
  };
  let selectedAsset = { id: null, type: null }; 
  let activeTool = 'place'; 
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
          <!-- Painel Esquerdo: Assets com Miniaturas -->
          <div style="width:300px;min-width:300px;background:#181818;border-right:1px solid #333;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">FERRAMENTAS</h4>
              <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                <button class="btn-tool ld-tool-btn active" data-tool="place" onclick="LEVEL_DESIGN.setTool('place')">🧩 Posicionar</button>
                <button class="btn-tool ld-tool-btn" data-tool="erase" onclick="LEVEL_DESIGN.setTool('erase')" style="background:#c0392b;color:#fff">🧹 Apagar</button>
                <button class="btn-tool ld-tool-btn" data-tool="warp" onclick="LEVEL_DESIGN.setTool('warp')" style="background:#8e44ad;color:#fff">🌀 Warp</button>
              </div>
              <div id="ldHelpText" style="font-size:10px;color:#888;background:#000;border:1px solid #222;border-radius:3px;padding:4px 6px">Selecione um Asset e clique no grid.</div>
            </div>

            <!-- Lista de Splash Screens -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;display:flex;flex-direction:column;max-height:180px">
              <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">SPLASH SCREENS</h4>
              <div id="ldSplashList" style="display:flex;flex-direction:column;gap:6px;overflow:auto"></div>
            </div>

            <!-- Lista de Backgrounds Desenhados -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;display:flex;flex-direction:column;max-height:200px">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:8px">BACKGROUNDS DESENHADOS</h4>
              <div id="ldBackgroundList" style="display:flex;flex-direction:column;gap:6px;overflow:auto"></div>
            </div>
          </div>

          <!-- Centro: Grid do Mapa de Fases -->
          <div style="flex:1;background:#111;padding:16px;overflow:auto;display:flex;flex-direction:column;align-items:center">
            <div id="ldGridContainer" style="display:grid;gap:6px;background:#222;padding:10px;border:2px solid #444;border-radius:6px"></div>
          </div>

          <!-- Painel Direito: Warps -->
          <div style="width:280px;min-width:280px;background:#1e1e1e;padding:12px;border-left:1px solid #333;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #665500;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:8px">⚡ WARPS CONFIGURADAS</h4>
              <div id="ldWarpsList" style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow:auto"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    refreshAssetLists();
    renderGrid();
    renderWarpsList();
  }

  function setTool(t) {
    activeTool = t;
    document.querySelectorAll('.ld-tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${t}"]`)?.classList.add('active');
    const help = document.getElementById('ldHelpText');
    if (!help) return;
    if (t === 'place') help.textContent = 'Clique em uma célula do grid para encaixar o Asset.';
    else if (t === 'erase') help.textContent = 'Clique em uma célula preenchida para removê-la.';
    else if (t === 'warp') help.textContent = 'Modo Warp: Clique na origem e no destino.';
  }

  // Função auxiliar de cálculo de backdrop
  function computeBackdropColor(nt, at, pals, chrBuf) {
    const counts = {};
    for(let ty=0; ty<30; ty++) for(let tx=0; tx<32; tx++){
      const tileIdx = nt[ty*32+tx]||0;
      const off = tileIdx*16; if(off+16>chrBuf.length) continue;
      const attrX=Math.floor(tx/2), attrY=Math.floor(ty/2), blockX=Math.floor(attrX/2), blockY=Math.floor(attrY/2);
      const attrIdx=blockY*8+blockX; const attrByte=at[attrIdx]||0;
      const subX=attrX%2, subY=attrY%2; const shift=(subY*2+subX)*2; const palIdx=(attrByte>>shift)&0x03;
      for(let py=0; py<8; py++){
        const p0=chrBuf[off+py], p1=chrBuf[off+py+8];
        for(let px=0; px<8; px++){
          const sh=7-px, b0=(p0>>sh)&1, b1=(p1>>sh)&1, ci=(b1<<1)|b0;
          if(ci===0) counts[palIdx]=(counts[palIdx]||0)+1;
        }
      }
    }
    let bestPal=0, bestCount=-1;
    for(const k in counts){ if(counts[k]>bestCount){ bestCount=counts[k]; bestPal=parseInt(k); } }
    const pal = pals[bestPal]||pals[0]||[15,0,16,48];
    return { color: (pal[0]!=null?pal[0]:15), palIdx: bestPal };
  }

  // Renderização da miniatura
  function renderThumbnailToCanvas(canvas, bgObj) {
    if (!canvas || !bgObj || !bgObj.nametable) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    const nt = bgObj.nametable;
    const at = bgObj.attributes || new Array(64).fill(0);
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : new Uint8Array(8192);
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : [[15,0,16,48]];
    
    const universalBackdrop = computeBackdropColor(nt, at, pals, chrBuf).color;
    const defaultColorHex = (typeof NES_PALETTE !== 'undefined' && NES_PALETTE[universalBackdrop]) ? NES_PALETTE[universalBackdrop] : '#000000';

    ctx.fillStyle = defaultColorHex;
    ctx.fillRect(0, 0, w, h);

    const scaleX = w / 256;
    const scaleY = h / 240;

    for (let ty = 0; ty < 30; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        const tileIdx = nt[ty * 32 + tx] || 0;
        const off = tileIdx * 16;
        if (off + 16 > chrBuf.length) continue;

        const attrX = Math.floor(tx / 2), attrY = Math.floor(ty / 2);
        const blockX = Math.floor(attrX / 2), blockY = Math.floor(attrY / 2);
        const attrIdx = blockY * 8 + blockX;
        const attrByte = at[attrIdx] || 0;
        const subX = attrX % 2, subY = attrY % 2;
        const shift = (subY * 2 + subX) * 2;
        const palIdx = (attrByte >> shift) & 0x03;
        const pal = pals[palIdx] || pals[0];

        for (let py = 0; py < 8; py++) {
          const p0 = chrBuf[off + py], p1 = chrBuf[off + py + 8];
          for (let px = 0; px < 8; px++) {
            const sh = 7 - px, b0 = (p0 >> sh) & 1, b1 = (p1 >> sh) & 1, ci = (b1 << 1) | b0;
            if (ci === 0) continue;

            const nesColor = pal[ci];
            const colorHex = (typeof NES_PALETTE !== 'undefined' && NES_PALETTE[nesColor]) ? NES_PALETTE[nesColor] : '#FFFFFF';
            
            ctx.fillStyle = colorHex;
            ctx.fillRect(Math.floor((tx * 8 + px) * scaleX), Math.floor((ty * 8 + py) * scaleY), Math.ceil(scaleX), Math.ceil(scaleY));
          }
        }
      }
    }
  }

  function refreshAssetLists() {
    // 1. Splash Screens
    const splashContainer = document.getElementById('ldSplashList');
    if (splashContainer) {
      splashContainer.innerHTML = '';
      const splashes = (typeof BG !== 'undefined' && BG.getSplashScreens) ? BG.getSplashScreens() : (Project.data?.splashScreens || []);
      
      if (splashes.length === 0) {
        splashContainer.innerHTML = `<div style="font-size:10px;color:#666">Nenhuma Splash Screen criada.</div>`;
      } else {
        splashes.forEach((s, idx) => {
          const isSelected = selectedAsset.id === s.id && selectedAsset.type === 'splash';
          const div = document.createElement('div');
          div.style.cssText = `background:${isSelected?'#332a00':'#181818'};border:1px solid ${isSelected?'#ffcc00':'#444'};border-radius:4px;padding:6px;cursor:pointer;display:flex;gap:8px;align-items:center`;
          
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 48;
          canvas.style.cssText = `background:#000;border:1px solid #333;border-radius:2px;flex-shrink:0`;
          renderThumbnailToCanvas(canvas, s);

          const info = document.createElement('div');
          info.style.cssText = `font-size:11px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
          info.textContent = s.name || `Splash ${idx}`;

          div.appendChild(canvas);
          div.appendChild(info);
          div.onclick = () => { selectedAsset = { id: s.id, type: 'splash' }; refreshAssetLists(); };
          splashContainer.appendChild(div);
        });
      }
    }

    // 2. Backgrounds Desenhados
    const bgContainer = document.getElementById('ldBackgroundList');
    if (bgContainer) {
      bgContainer.innerHTML = '';
      const backgrounds = (typeof BG !== 'undefined' && BG.getBackgrounds) ? BG.getBackgrounds() : (Project.data?.backgrounds || []);
      
      if (backgrounds.length === 0) {
        bgContainer.innerHTML = `<div style="font-size:10px;color:#666">Nenhum Background desenhado.</div>`;
      } else {
        backgrounds.forEach((b, idx) => {
          const assetId = b.id || idx;
          const isSelected = selectedAsset.id === assetId && selectedAsset.type === 'background';
          const div = document.createElement('div');
          div.style.cssText = `background:${isSelected?'#333300':'#181818'};border:1px solid ${isSelected?'#ffcc00':'#444'};border-radius:4px;padding:6px;cursor:pointer;display:flex;gap:8px;align-items:center`;
          
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 48;
          canvas.style.cssText = `background:#000;border:1px solid #333;border-radius:2px;flex-shrink:0`;
          renderThumbnailToCanvas(canvas, b);

          const info = document.createElement('div');
          info.style.cssText = `font-size:11px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
          info.textContent = b.name || `Background ${idx}`;

          div.appendChild(canvas);
          div.appendChild(info);
          div.onclick = () => { selectedAsset = { id: assetId, type: 'background' }; refreshAssetLists(); };
          bgContainer.appendChild(div);
        });
      }
    }
  }

  function renderGrid() {
    const container = document.getElementById('ldGridContainer');
    if (!container) return;
    
    container.style.gridTemplateColumns = `repeat(${currentWorld.cols}, 120px)`;
    container.style.gridTemplateRows = `repeat(${currentWorld.rows}, 105px)`;
    container.innerHTML = '';

    for (let y = 0; y < currentWorld.rows; y++) {
      for (let x = 0; x < currentWorld.cols; x++) {
        const key = `${x},${y}`;
        const cellData = currentWorld.cells[key];
        const cellDiv = document.createElement('div');
        cellDiv.style.cssText = `width:120px;height:105px;background:#161616;border:1px dashed #444;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;padding:4px;gap:3px;text-align:center`;
        
        if (cellData) {
          let assetObj = null;
          let assetName = 'Tela';
          let borderColor = '#4ec9b0';
          let bgColor = '#0a221f';

          if (cellData.type === 'splash') {
            const splashes = (typeof BG !== 'undefined' && BG.getSplashScreens) ? BG.getSplashScreens() : (Project.data?.splashScreens || []);
            assetObj = splashes.find(s => s.id === cellData.bgId);
            if (assetObj) assetName = assetObj.name;
          } else if (cellData.type === 'background') {
            const backgrounds = (typeof BG !== 'undefined' && BG.getBackgrounds) ? BG.getBackgrounds() : (Project.data?.backgrounds || []);
            assetObj = backgrounds.find((b, idx) => (b.id || idx) === cellData.bgId);
            if (assetObj) assetName = assetObj.name;
            borderColor = '#ffcc00';
            bgColor = '#2a2600';
          }

          cellDiv.style.border = `2px solid ${borderColor}`;
          cellDiv.style.background = bgColor;

          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 48;
          canvas.style.cssText = `background:#000;border:1px solid #333;border-radius:2px`;
          
          if (assetObj) {
            renderThumbnailToCanvas(canvas, assetObj);
          }

          cellDiv.appendChild(canvas);
          
          const label = document.createElement('span');
          label.style.cssText = `font-size:9px;color:#fff;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px`;
          label.textContent = assetName;
          cellDiv.appendChild(label);

          const coords = document.createElement('span');
          coords.style.cssText = `font-size:8px;color:#888`;
          coords.textContent = `(${x}, ${y})`;
          cellDiv.appendChild(coords);
        } else {
          cellDiv.innerHTML = `<span style="font-size:10px;color:#555">vazio</span><span style="font-size:9px;color:#666">(${x}, ${y})</span>`;
        }

        cellDiv.onclick = () => handleCellClick(x, y);
        container.appendChild(cellDiv);
      }
    }
  }

  function handleCellClick(x, y) {
    const key = `${x},${y}`;
    if (activeTool === 'place') {
      if (selectedAsset.id === null) {
        alert('Selecione uma Splash Screen ou um Background na lista lateral esquerda primeiro.');
        return;
      }
      currentWorld.cells[key] = { bgId: selectedAsset.id, type: selectedAsset.type, x, y };
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