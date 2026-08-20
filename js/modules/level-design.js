// LEVEL DESIGN MODULE v1.4.0 - Spawns de inimigos por tela (hitboxInstances)
const LEVEL_DESIGN = (() => {
  function defaultWorld(){
    return { cols: 4, rows: 4, transitionType: "hard_cut", cells: {} };
  }
  let currentPhaseId = null;
  let currentWorld = defaultWorld();
  let selectedAsset = { id: null, type: null }; 
  let activeTool = 'place';
  // célula selecionada para editar spawns: { x, y, bgId, type }
  let selectedCell = null;

  // Carrega o levelMap salvo dentro da fase (ou cria um em branco se a fase ainda não tem um).
  // O mapa vive DENTRO da fase (Project.data.phases[i].levelMap) - não existe mais um array
  // "levels" separado, então não tem como o nome do mapa dessincronizar do nome da fase.
  function loadPhaseMap(phaseId){
    const phases = Project.data?.phases || [];
    const phase = phases.find(p => p.id === phaseId) || phases[0];
    if(!phase){ currentPhaseId = null; currentWorld = defaultWorld(); buildHTML(); return; }
    currentPhaseId = phase.id;
    currentWorld = phase.levelMap ? JSON.parse(JSON.stringify(phase.levelMap)) : defaultWorld();
    buildHTML();
  }

  function buildHTML() {
    const root = document.getElementById('mod-world');
    if (!root) return;
    const phases = Project.data?.phases || [];
    if(!currentPhaseId && phases.length > 0) currentPhaseId = phases[0].id;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <!-- Topbar -->
        <div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#ffcc00;margin:0">🗺️ LEVEL DESIGN (MAPAS DE FASES)</h3>
          <div style="display:flex;gap:6px;align-items:center;margin-left:12px">
            <span style="font-size:11px;color:#888">Fase:</span>
            <select id="ldPhaseSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px;min-width:140px">
              ${phases.length===0 ? '<option value="">Nenhuma fase criada</option>' : phases.map(p => `<option value="${p.id}" ${p.id===currentPhaseId?'selected':''}>${p.name}</option>`).join('')}
            </select>
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
            <span style="font-size:10px;color:#666">💾 salva sozinho a cada edição - use o Salvar Projeto (topo) pra gravar o .nms</span>
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
                <button class="btn-tool ld-tool-btn" data-tool="hardcut" onclick="LEVEL_DESIGN.setTool('hardcut')" style="background:#d35400;color:#fff" title="Marca/desmarca uma célula como corte seco, mesmo dentro de uma fase de scroll (splash, menu, cutscene...)">🔒 Hard-Cut</button>
                <button class="btn-tool ld-tool-btn" data-tool="spawns" onclick="LEVEL_DESIGN.setTool('spawns')" style="background:#8e44ad;color:#fff" title="Clique numa tela do grid para editar spawns de inimigos">👾 Spawns</button>
              </div>
              <div id="ldHelpText" style="font-size:10px;color:#888;background:#000;border:1px solid #222;border-radius:3px;padding:4px 6px">Selecione um Asset e clique no grid.</div>
            </div>

            <!-- Painel de spawns da célula selecionada -->
            <div id="ldSpawnPanel" style="background:#111;border:1px solid #5a2d82;border-radius:6px;padding:10px;display:none;flex-direction:column;gap:8px">
              <h4 style="font-size:11px;color:#c39bd3;margin:0">👾 SPAWNS DA TELA</h4>
              <div id="ldSpawnScreenLabel" style="font-size:10px;color:#aaa"></div>
              <div id="ldSpawnList" style="display:flex;flex-direction:column;gap:4px;max-height:160px;overflow:auto"></div>
              <div style="border-top:1px solid #333;padding-top:8px;display:flex;flex-direction:column;gap:6px">
                <div style="font-size:10px;color:#888">Adicionar spawn</div>
                <select id="ldSpawnChar" style="background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:4px;font-size:11px"></select>
                <div style="display:flex;gap:6px;align-items:center">
                  <label style="font-size:10px;color:#888">X</label>
                  <input id="ldSpawnX" type="number" min="0" max="248" value="160" style="width:52px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px;font-size:11px">
                  <label style="font-size:10px;color:#888">Y</label>
                  <input id="ldSpawnY" type="number" min="0" max="232" value="160" style="width:52px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px;font-size:11px">
                </div>
                <button class="btn-tool" onclick="LEVEL_DESIGN.addSpawn()" style="background:#8e44ad;color:#fff;padding:5px 8px">+ Adicionar</button>
              </div>
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
        </div>
      </div>
    `;
    document.getElementById('ldPhaseSelect')?.addEventListener('change', e => loadPhaseMap(e.target.value));
    document.getElementById('ldTransitionType')?.addEventListener('change', e => { currentWorld.transitionType = e.target.value; persistLevelMap(); });
    refreshAssetLists();
    renderGrid();
  }

  function setTool(t) {
    activeTool = t;
    document.querySelectorAll('.ld-tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-tool="${t}"]`)?.classList.add('active');
    const help = document.getElementById('ldHelpText');
    if (!help) return;
    if (t === 'place') help.textContent = 'Clique em uma célula do grid para encaixar o Asset.';
    else if (t === 'erase') help.textContent = 'Clique em uma célula preenchida para removê-la.';
    else if (t === 'hardcut') help.textContent = 'Clique numa célula preenchida pra marcar/desmarcar como corte seco (ignora o eixo de scroll da fase).';
    else if (t === 'spawns') help.textContent = 'Clique numa tela do grid para editar spawns de inimigos (personagem + X,Y).';
    if (t !== 'spawns') {
      selectedCell = null;
      renderSpawnPanel();
    }
  }

  function ensureHitboxInstances(){
    if (!Project.data) return [];
    if (!Array.isArray(Project.data.hitboxInstances)) Project.data.hitboxInstances = [];
    return Project.data.hitboxInstances;
  }

  function getOrCreateSpawnObject(characterId){
    if (!Project.data) return null;
    if (!Array.isArray(Project.data.hitboxObjects)) Project.data.hitboxObjects = [];
    let obj = Project.data.hitboxObjects.find(o => o.kind === 'spawn' && o.characterId === characterId);
    if (obj) return obj;
    const chars = Project.data.characters || [];
    const ch = chars.find(c => c.id === characterId);
    obj = {
      id: 'hb_' + Date.now() + Math.floor(Math.random()*1000),
      name: 'Spawn ' + (ch?.name || characterId),
      kind: 'spawn',
      characterId
    };
    Project.data.hitboxObjects.push(obj);
    return obj;
  }

  function instancesForScreen(screenId){
    return ensureHitboxInstances().filter(i => i.screenId === screenId);
  }

  function populateSpawnCharSelect(){
    const sel = document.getElementById('ldSpawnChar');
    if (!sel) return;
    const chars = (Project.data?.characters || []).filter(c => {
      const n = (c.name || '').toLowerCase();
      const t = (c.type || '').toLowerCase();
      // exclui o hero principal; aceita enemy / npc / outros
      if (n === 'hero' || t === 'player' && n.includes('hero')) return false;
      if (t === 'enemy' || n.includes('enemy') || n.includes('inimigo')) return true;
      // se type=player mas nome não é hero, ainda permite (caso do .nms atual)
      if (t === 'player' && !n.includes('hero')) return true;
      return t !== 'player';
    });
    if (!chars.length) {
      // fallback: todos menos o primeiro player chamado Hero
      const all = Project.data?.characters || [];
      sel.innerHTML = all.filter(c => !(c.name||'').toLowerCase().includes('hero'))
        .map(c => `<option value="${c.id}">${c.name || c.id}</option>`).join('')
        || '<option value="">Nenhum personagem</option>';
      return;
    }
    sel.innerHTML = chars.map(c => `<option value="${c.id}">${c.name || c.id}</option>`).join('');
  }

  function renderSpawnPanel(){
    const panel = document.getElementById('ldSpawnPanel');
    if (!panel) return;
    if (!selectedCell || !selectedCell.bgId) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';
    const label = document.getElementById('ldSpawnScreenLabel');
    const bgs = Project.data?.backgrounds || [];
    const sps = Project.data?.splashScreens || [];
    const asset = selectedCell.type === 'splash'
      ? sps.find(s => s.id === selectedCell.bgId)
      : bgs.find(b => b.id === selectedCell.bgId);
    if (label) label.textContent = `${asset?.name || selectedCell.bgId} · célula (${selectedCell.x},${selectedCell.y})`;

    populateSpawnCharSelect();

    const list = document.getElementById('ldSpawnList');
    if (!list) return;
    const insts = instancesForScreen(selectedCell.bgId);
    if (!insts.length) {
      list.innerHTML = '<div style="font-size:10px;color:#666">Nenhum spawn nesta tela.</div>';
      return;
    }
    const chars = Project.data?.characters || [];
    list.innerHTML = insts.map(inst => {
      const ch = chars.find(c => c.id === inst.characterId);
      const name = ch?.name || inst.characterId || '?';
      return `<div style="display:flex;align-items:center;gap:6px;background:#1a1a1a;border:1px solid #333;border-radius:4px;padding:4px 6px;font-size:11px;color:#ddd">
        <span style="flex:1">👾 ${name} · (${inst.x},${inst.y})</span>
        <button onclick="LEVEL_DESIGN.removeSpawn('${inst.id}')" style="background:#c0392b;color:#fff;border:none;border-radius:3px;padding:2px 6px;cursor:pointer;font-size:10px">×</button>
      </div>`;
    }).join('');
  }

  function addSpawn(){
    if (!selectedCell?.bgId) { alert('Selecione uma tela no grid (ferramenta Spawns).'); return; }
    const charId = document.getElementById('ldSpawnChar')?.value;
    if (!charId) { alert('Escolha um personagem.'); return; }
    const x = Math.max(0, Math.min(248, parseInt(document.getElementById('ldSpawnX')?.value, 10) || 160));
    const y = Math.max(0, Math.min(232, parseInt(document.getElementById('ldSpawnY')?.value, 10) || 160));
    const obj = getOrCreateSpawnObject(charId);
    const inst = {
      id: 'inst_' + Date.now() + Math.floor(Math.random()*1000),
      screenId: selectedCell.bgId,
      hitboxObjectId: obj?.id || null,
      characterId: charId,
      x, y
    };
    ensureHitboxInstances().push(inst);
    renderSpawnPanel();
    renderGrid();
    Project.status?.(`Spawn adicionado em ${selectedCell.bgId} (${x},${y})`);
  }

  function removeSpawn(instId){
    const arr = ensureHitboxInstances();
    const idx = arr.findIndex(i => i.id === instId);
    if (idx >= 0) arr.splice(idx, 1);
    renderSpawnPanel();
    renderGrid();
  }

  // Detecção de cor de fundo e desenho de nametable agora centralizados em RENDER_UTILS
  // (js/render-utils.js) - a mesma função usada pelo build-rom.js, pra thumbnail e preview
  // final nunca mais divergirem.
  function renderThumbnailToCanvas(canvas, bgObj) {
    RENDER_UTILS.drawAssetThumbnail(canvas, bgObj);
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

          if (cellData.hardCut) {
            cellDiv.style.boxShadow = 'inset 0 0 0 2px #e67e22';
            const badge = document.createElement('span');
            badge.textContent = '🔒 hard-cut';
            badge.style.cssText = `position:absolute;top:2px;left:2px;font-size:8px;color:#fff;background:#d35400;padding:1px 4px;border-radius:3px;line-height:1.4`;
            cellDiv.appendChild(badge);
          }

          // badge de quantidade de spawns nesta tela
          const nSpawns = (Project.data?.hitboxInstances || []).filter(i => i.screenId === cellData.bgId).length;
          if (nSpawns > 0) {
            const sb = document.createElement('span');
            sb.textContent = `👾${nSpawns}`;
            sb.style.cssText = `position:absolute;top:2px;right:2px;font-size:8px;color:#fff;background:#8e44ad;padding:1px 4px;border-radius:3px;line-height:1.4`;
            cellDiv.appendChild(sb);
          }

          // destaque se célula selecionada no modo spawns
          if (selectedCell && selectedCell.x === x && selectedCell.y === y && activeTool === 'spawns') {
            cellDiv.style.boxShadow = 'inset 0 0 0 2px #c39bd3';
          }

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
      renderGrid(); persistLevelMap();
    } else if (activeTool === 'erase') {
      delete currentWorld.cells[key];
      renderGrid(); persistLevelMap();
    } else if (activeTool === 'hardcut') {
      if (!currentWorld.cells[key]) { alert('A célula precisa ter uma tela alocada primeiro.'); return; }
      currentWorld.cells[key].hardCut = !currentWorld.cells[key].hardCut;
      renderGrid(); persistLevelMap();
    } else if (activeTool === 'spawns') {
      if (!currentWorld.cells[key]) { alert('A célula precisa ter uma tela alocada primeiro.'); return; }
      const cell = currentWorld.cells[key];
      selectedCell = { x, y, bgId: cell.bgId, type: cell.type };
      renderGrid();
      renderSpawnPanel();
    }
  }

  // Grava currentWorld em phase.levelMap a cada edição, sem precisar de um clique manual em
  // "Salvar Fase" - evita perder trabalho por esquecimento antes do save global (.nms).
  function persistLevelMap(){
    if (!Project.data || !currentPhaseId) return;
    const phase = (Project.data.phases || []).find(p => p.id === currentPhaseId);
    if (!phase) return;
    phase.levelMap = JSON.parse(JSON.stringify(currentWorld));
  }

  function resizeGrid() {
    const colsEl = document.getElementById('ldCols');
    const rowsEl = document.getElementById('ldRows');
    if (colsEl) currentWorld.cols = parseInt(colsEl.value) || 4;
    if (rowsEl) currentWorld.rows = parseInt(rowsEl.value) || 4;
    renderGrid(); persistLevelMap();
    Project.status('Grade de level design redimensionada.');
  }

  // O mapa vive dentro da própria fase (phase.levelMap) - sem array paralelo, sem nome pra
  // dessincronizar. Se a fase for deletada no Dashboard, o mapa some junto (sem órfão).
  // Toda edição no grid já chama persistLevelMap() sozinha (ver handleCellClick,
  // resizeGrid) - não existe mais um botão separado de "salvar fase": o único
  // save manual que resta é o Salvar Projeto global (topo), que grava o .nms.
  // A ferramenta Warp saiu daqui: destino de warp agora é responsabilidade do módulo
  // Programação (objeto de hitbox kind:'warp' + Regra "Ir para Warp"), não do mapa de fases.

  return {
    init: () => loadPhaseMap(currentPhaseId),
    setTool,
    resizeGrid,
    loadPhaseMap,
    addSpawn,
    removeSpawn,
    renderSpawnPanel
  };
})();