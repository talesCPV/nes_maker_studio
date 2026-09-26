// LEVEL DESIGN MODULE v1.4.0 - Spawns de inimigos por tela (hitboxInstances)
const LEVEL_DESIGN = (() => {
  function defaultWorld(){
    return { cols: 4, rows: 4, transitionType: "hard_cut", cells: {} };
  }

  // Variável reservada (aparece em Programação > Variáveis, mas aponta pro
  // endereço fixo do motor auto_scroll_speed em vez de gerar um novo -
  // permite trocar a velocidade do auto-scroll em runtime via Regras).
  // Criada automaticamente na 1ª vez que uma fase usa "Scroll Horizontal
  // Automático" - nunca duplicada (procura por reserved antes de criar).
  function ensureAutoScrollSpeedVar(){
    if(!Project.data.variables) Project.data.variables = [];
    let v = Project.data.variables.find(v => v.reserved === 'auto_scroll_speed');
    if(!v){
      v = { id:'var_auto_scroll_speed', name:'Velocidade do Auto-Scroll', type:'byte', zeroPage:false, initialValue:128, reserved:'auto_scroll_speed' };
      Project.data.variables.push(v);
    }
    return v;
  }
  // 2ª variável reservada (bit de controle): modo Plataforma (arrasta o
  // jogador se ele não andar) vs modo Nave (anda junto com a tela sozinho).
  function ensureAutoScrollDriftVar(){
    if(!Project.data.variables) Project.data.variables = [];
    let v = Project.data.variables.find(v => v.reserved === 'auto_scroll_drift');
    if(!v){
      v = { id:'var_auto_scroll_drift', name:'Auto-Scroll Arrasta Jogador', type:'byte', zeroPage:false, initialValue:1, reserved:'auto_scroll_drift' };
      Project.data.variables.push(v);
    }
    return v;
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
  /** Garante shape estável do levelMap (cols/rows/transitionType/cells). */
  function normalizeWorld(raw){
    const base = defaultWorld();
    if(!raw || typeof raw !== 'object') return base;
    const cols = Math.max(1, Math.min(16, parseInt(raw.cols, 10) || base.cols));
    const rows = Math.max(1, Math.min(16, parseInt(raw.rows, 10) || base.rows));
    const transitionType = raw.transitionType || base.transitionType;
    let cells = {};
    if(raw.cells && typeof raw.cells === 'object' && !Array.isArray(raw.cells)){
      // objeto { "x,y": { bgId, type, ... } }
      Object.keys(raw.cells).forEach(k => {
        const c = raw.cells[k];
        if(!c || typeof c !== 'object') return;
        cells[k] = {
          bgId: c.bgId,
          type: c.type || 'background',
          x: c.x,
          y: c.y
        };
      });
    } else if(Array.isArray(raw.cells)){
      // formato legado em lista
      raw.cells.forEach(c => {
        if(!c || c.bgId == null) return;
        const x = c.x|0, y = c.y|0;
        cells[`${x},${y}`] = {
          bgId: c.bgId,
          type: c.type || 'background',
          x, y
        };
      });
    }
    return { cols, rows, transitionType, cells };
  }

  function loadPhaseMap(phaseId){
    const phases = Project.data?.phases || [];
    const phase = phases.find(p => String(p.id) === String(phaseId)) || phases[0];
    if(!phase){ currentPhaseId = null; currentWorld = defaultWorld(); buildHTML(); return; }
    currentPhaseId = phase.id;
    currentWorld = normalizeWorld(phase.levelMap);
    // se a fase ainda não tinha levelMap, materializa já (evita persist no-op por referência perdida)
    if(!phase.levelMap) phase.levelMap = JSON.parse(JSON.stringify(currentWorld));
    buildHTML();
  }

  function buildHTML() {
    const root = document.getElementById('mod-world');
    if (!root) return;
    const phases = Project.data?.phases || [];
    if(!currentPhaseId && phases.length > 0) currentPhaseId = phases[0].id;
    const scrollOrientation = Project.data?.scrollOrientation === 'vertical' ? 'vertical' : 'horizontal';
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <!-- Topbar -->
        <div id="ldToolsToolbar" style="display:flex;gap:6px;align-items:center;padding:6px 10px;background:#252526;border-bottom:1px solid #333;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;white-space:nowrap">
          <h3 style="font-size:12px;color:#ffcc00;margin:0;flex-shrink:0">🗺️ LEVEL DESIGN</h3>
          <span style="width:1px;height:24px;background:#444;margin:0 2px;flex-shrink:0"></span>
          <span style="font-size:11px;color:#888;flex-shrink:0">Fase:</span>
          <select id="ldPhaseSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px;min-width:140px">
            ${phases.length===0 ? '<option value="">Nenhuma fase criada</option>' : phases.map(p => `<option value="${p.id}" ${p.id===currentPhaseId?'selected':''}>${p.name}</option>`).join('')}
          </select>
          <span style="font-size:11px;color:#888;flex-shrink:0">Transição:</span>
          <select id="ldTransitionType" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px">
            <option value="hard_cut" ${currentWorld.transitionType==='hard_cut'?'selected':''}>Hard-Cut (Zelda)</option>
            ${scrollOrientation === 'vertical' ? `
            <option value="scroll_v" ${currentWorld.transitionType==='scroll_v'?'selected':''}>Scroll Vertical</option>
            <option value="scroll_v_auto" ${currentWorld.transitionType==='scroll_v_auto'?'selected':''}>Scroll Vertical Automático (Cima→Baixo)</option>
            <option value="scroll_v_auto_rev" ${currentWorld.transitionType==='scroll_v_auto_rev'?'selected':''}>Scroll Vertical Automático (Baixo→Cima)</option>
            ` : `
            <option value="scroll_h" ${currentWorld.transitionType==='scroll_h'?'selected':''}>Scroll Horizontal (SMB1)</option>
            <option value="scroll_h_auto" ${currentWorld.transitionType==='scroll_h_auto'?'selected':''}>Scroll Horizontal Automático (Esquerda→Direita)</option>
            <option value="scroll_h_auto_rev" ${currentWorld.transitionType==='scroll_h_auto_rev'?'selected':''}>Scroll Horizontal Automático (Direita→Esquerda)</option>
            `}
          </select>
          <span style="font-size:9px;color:#666;flex-shrink:0" title="A direção suave é travada pra ROM inteira em Configurações > Orientação de Scroll (é uma escolha de hardware do cartucho)">ℹ️ orientação: ${scrollOrientation === 'vertical' ? 'Vertical' : 'Horizontal'}</span>
          ${isScrollTransition(currentWorld.transitionType) ? `
          <span style="font-size:10px;color:#888;flex-shrink:0">📋 lista de ${scrollAxisIsHorizontal(currentWorld.transitionType) ? currentWorld.cols : currentWorld.rows} tela(s) - use "+" no fim, ou as ferramentas Deletar/Inserir Célula</span>
          ` : `
          <span style="font-size:11px;color:#888;flex-shrink:0">Cols:</span>
          <input id="ldCols" type="number" min="1" max="16" value="${currentWorld.cols}" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px;width:45px">
          <span style="font-size:11px;color:#888;flex-shrink:0">Rows:</span>
          <input id="ldRows" type="number" min="1" max="16" value="${currentWorld.rows}" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px;width:45px">
          <button class="btn-tool" onclick="LEVEL_DESIGN.resizeGrid()" style="padding:4px 8px;flex-shrink:0">🔄 Redimensionar</button>
          `}
          <span style="margin-left:auto;font-size:10px;color:#666;flex-shrink:0">💾 salva sozinho a cada edição - use o Salvar Projeto (topo) pra gravar o .nms</span>
        </div>

        <div style="display:flex;flex:1;overflow:hidden;min-height:0">
          <!-- Painel Esquerdo: barra de ferramentas FIXA no topo (nunca rola) + conteúdo rolável embaixo -->
          <div style="width:300px;min-width:300px;background:#181818;border-right:1px solid #333;display:flex;flex-direction:column;overflow:hidden">
            <div style="flex-shrink:0;padding:8px 10px;border-bottom:1px solid #333;background:#1c1c1c;display:flex;flex-direction:column;gap:6px">
              <span style="font-size:10px;color:#888">FERRAMENTAS</span>
              <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                <button type="button" class="icon-btn ld-tool-btn active" data-tool="place" onclick="LEVEL_DESIGN.setTool('place')" title="Posicionar">🧩</button>
                <button type="button" class="icon-btn ld-tool-btn" data-tool="erase" onclick="LEVEL_DESIGN.setTool('erase')" title="Apagar">🧹</button>
                <button type="button" class="icon-btn ld-tool-btn" data-tool="spawns" onclick="LEVEL_DESIGN.setTool('spawns')" title="Spawns - clique numa tela do grid para editar spawns de inimigos">👾</button>
                <span style="width:1px;height:24px;background:#444;margin:0 2px;flex-shrink:0"></span>
                <button type="button" class="icon-btn ld-tool-btn" data-tool="delete_cell" onclick="LEVEL_DESIGN.setTool('delete_cell')" title="Deletar Célula - remove e puxa as seguintes (da mesma linha) uma casa pra trás">➖</button>
                <button type="button" class="icon-btn ld-tool-btn" data-tool="insert_cell" onclick="LEVEL_DESIGN.setTool('insert_cell')" title="Inserir Célula - abre uma casa vazia aqui, empurrando as seguintes (da mesma linha) uma casa pra frente">➕</button>
              </div>
              <div id="ldHelpText" style="font-size:10px;color:#888;line-height:1.3">Selecione um Asset e clique no grid.</div>
            </div>
            <div style="flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px">
            <!-- Painel de spawns: preview em cima, lista + form embaixo (vertical) -->
            <div id="ldSpawnPanel" style="background:#111;border:1px solid #5a2d82;border-radius:6px;padding:10px;display:none;flex-direction:column;gap:8px">
              <h4 style="font-size:11px;color:#c39bd3;margin:0">👾 SPAWNS DA TELA</h4>
              <div id="ldSpawnScreenLabel" style="font-size:10px;color:#aaa"></div>
              <div style="display:flex;flex-direction:column;gap:4px">
                <label style="font-size:10px;color:#888">Preview (clique para posicionar)</label>
                <canvas id="ldSpawnPreview" width="256" height="150" style="width:100%;background:#000;border:1px solid #555;image-rendering:pixelated;cursor:crosshair;border-radius:3px"></canvas>
                <div style="font-size:9px;color:#666">🟡 próximo spawn · 🔴 já salvos</div>
              </div>
              <div id="ldSpawnList" style="display:flex;flex-direction:column;gap:4px;max-height:120px;overflow:auto;border-top:1px solid #333;padding-top:6px"></div>
              <div style="border-top:1px solid #333;padding-top:6px;display:flex;flex-direction:column;gap:5px">
                <div style="font-size:10px;color:#888">Adicionar spawn</div>
                <select id="ldSpawnChar" style="background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:4px;font-size:11px;width:100%"></select>
                <div style="display:flex;gap:6px;align-items:center">
                  <label style="font-size:10px;color:#888">X</label>
                  <input id="ldSpawnX" type="number" min="0" max="248" value="160" oninput="LEVEL_DESIGN.updateSpawnPreview()" style="width:52px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px;font-size:11px">
                  <label style="font-size:10px;color:#888">Y</label>
                  <input id="ldSpawnY" type="number" min="0" max="232" value="160" oninput="LEVEL_DESIGN.updateSpawnPreview()" style="width:52px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px;font-size:11px">
                </div>
                <button class="btn-tool" onclick="LEVEL_DESIGN.addSpawn()" style="background:#8e44ad;color:#fff;padding:5px 8px">+ Adicionar</button>
              </div>
            </div>

            <!-- Lista de Backgrounds Desenhados -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;display:flex;flex-direction:column">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:8px">BACKGROUNDS DESENHADOS</h4>
              <div id="ldBackgroundList" style="display:flex;flex-direction:column;gap:6px;overflow:auto"></div>
            </div>
            </div>
          </div>

          <!-- Centro: Grid do Mapa de Fases -->
          <div style="flex:1;background:#111;padding:16px;overflow:auto;display:flex;flex-direction:column">
            <div id="ldGridContainer" style="display:grid;gap:6px;background:#222;padding:10px;border:2px solid #444;border-radius:6px;width:fit-content"></div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('ldPhaseSelect')?.addEventListener('change', e => loadPhaseMap(e.target.value));
    document.getElementById('ldTransitionType')?.addEventListener('change', e => {
      currentWorld.transitionType = e.target.value;
      if (['scroll_h_auto','scroll_h_auto_rev','scroll_v_auto','scroll_v_auto_rev'].includes(e.target.value)) { ensureAutoScrollSpeedVar(); ensureAutoScrollDriftVar(); }
      persistLevelMap();
      buildHTML();   // grid<->lista e Cols/Rows aparecem/somem conforme a Transição
    });
    refreshAssetLists();
    renderGrid();
  }

  function setTool(t) {
    activeTool = t;
    document.querySelectorAll('#mod-world .ld-tool-btn[data-tool]').forEach(b => {
      const on = b.getAttribute('data-tool') === t;
      b.classList.toggle('active', on);
      if(on){ b.style.background = '#007acc'; b.style.borderColor = '#007acc'; }
      else { b.style.background = ''; b.style.borderColor = ''; }
    });
    const help = document.getElementById('ldHelpText');
    if (!help) return;
    if (t === 'place') help.textContent = 'Clique em uma célula do grid para encaixar o Asset.';
    else if (t === 'erase') help.textContent = 'Clique em uma célula preenchida para removê-la.';
    else if (t === 'spawns') help.textContent = 'Clique numa tela do grid para editar spawns de inimigos (personagem + X,Y).';
    else if (t === 'delete_cell') help.textContent = 'Clique numa célula pra removê-la - as seguintes da MESMA LINHA andam uma casa pra trás.';
    else if (t === 'insert_cell') help.textContent = 'Clique numa célula pra abrir espaço ali - as seguintes da MESMA LINHA andam uma casa pra frente.';
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

  function getSelectedScreenAsset(){
    if (!selectedCell?.bgId) return null;
    const bgs = Project.data?.backgrounds || [];
    return bgs.find(b => b.id === selectedCell.bgId);
  }

  function drawSpawnPreview(){
    const canvas = document.getElementById('ldSpawnPreview');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const asset = getSelectedScreenAsset();
    if (asset && typeof RENDER_UTILS !== 'undefined' && RENDER_UTILS.drawAssetThumbnail) {
      RENDER_UTILS.drawAssetThumbnail(canvas, asset);
    }

    // spawns salvos (vermelho)
    if (selectedCell?.bgId) {
      instancesForScreen(selectedCell.bgId).forEach(inst => {
        const px = ((inst.x || 0) / 256) * canvas.width;
        const py = ((inst.y || 0) / 240) * canvas.height;
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
        // cruz pequena
        ctx.strokeStyle = '#ffcccc';
        ctx.beginPath();
        ctx.moveTo(px - 7, py); ctx.lineTo(px + 7, py);
        ctx.moveTo(px, py - 7); ctx.lineTo(px, py + 7);
        ctx.stroke();
      });
    }

    // posição atual dos inputs (amarelo) — onde o próximo spawn vai
    const x = Math.max(0, Math.min(248, parseInt(document.getElementById('ldSpawnX')?.value, 10) || 0));
    const y = Math.max(0, Math.min(232, parseInt(document.getElementById('ldSpawnY')?.value, 10) || 0));
    const cx = (x / 256) * canvas.width;
    const cy = (y / 240) * canvas.height;
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function updateSpawnPreview(){
    drawSpawnPreview();
  }

  function onSpawnPreviewClick(ev){
    const canvas = document.getElementById('ldSpawnPreview');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (ev.clientX - rect.left) * scaleX;
    const cy = (ev.clientY - rect.top) * scaleY;
    const x = Math.max(0, Math.min(248, Math.round((cx / canvas.width) * 256)));
    const y = Math.max(0, Math.min(232, Math.round((cy / canvas.height) * 240)));
    const xEl = document.getElementById('ldSpawnX');
    const yEl = document.getElementById('ldSpawnY');
    if (xEl) xEl.value = x;
    if (yEl) yEl.value = y;
    drawSpawnPreview();
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
    const asset = getSelectedScreenAsset();
    if (label) label.textContent = `${asset?.name || selectedCell.bgId} · célula (${selectedCell.x},${selectedCell.y})`;

    populateSpawnCharSelect();

    const list = document.getElementById('ldSpawnList');
    if (list) {
      const insts = instancesForScreen(selectedCell.bgId);
      if (!insts.length) {
        list.innerHTML = '<div style="font-size:10px;color:#666">Nenhum spawn nesta tela.</div>';
      } else {
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
    }

    // preview + click-to-place
    requestAnimationFrame(() => {
      drawSpawnPreview();
      const canvas = document.getElementById('ldSpawnPreview');
      if (canvas && !canvas._ldSpawnBound) {
        canvas._ldSpawnBound = true;
        canvas.addEventListener('click', onSpawnPreviewClick);
      }
    });
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
    drawSpawnPreview();
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
    // Item cutscene: não existe mais lista separada de Splash Screens aqui -
    // telas splash antigas já foram migradas pra Project.data.backgrounds
    // (ver BG.migrateSplashScreensToBackgrounds). Tipo agora é da FASE.
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
          div.draggable = true;

          const handle = document.createElement('span');
          handle.textContent = '⋮⋮';
          handle.title = 'Arraste para reordenar';
          handle.style.cssText = `color:#666;cursor:grab;flex-shrink:0;font-size:12px;line-height:1`;

          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 48;
          canvas.style.cssText = `background:#000;border:1px solid #333;border-radius:2px;flex-shrink:0`;
          renderThumbnailToCanvas(canvas, b);

          const info = document.createElement('div');
          info.style.cssText = `font-size:11px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
          info.textContent = b.name || `Background ${idx}`;

          div.appendChild(handle);
          div.appendChild(canvas);
          div.appendChild(info);
          div.onclick = () => { selectedAsset = { id: assetId, type: 'background' }; refreshAssetLists(); };

          // Drag'n'drop pra reordenar - a ordem do array Project.data.backgrounds
          // (via BG.getBackgrounds(), mesma referência) já é a ordem persistida no .nms.
          div.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', String(idx));
            e.dataTransfer.effectAllowed = 'move';
            div.style.opacity = '0.4';
          });
          div.addEventListener('dragend', () => { div.style.opacity = '1'; });
          div.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            div.style.boxShadow = 'inset 0 2px 0 #ffcc00';
          });
          div.addEventListener('dragleave', () => { div.style.boxShadow = ''; });
          div.addEventListener('drop', e => {
            e.preventDefault();
            div.style.boxShadow = '';
            const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
            if (isNaN(fromIdx) || fromIdx === idx) return;
            const [moved] = backgrounds.splice(fromIdx, 1);
            backgrounds.splice(idx, 0, moved);
            refreshAssetLists();
            Project.status('Ordem dos backgrounds atualizada');
          });

          bgContainer.appendChild(div);
        });
      }
    }
  }

  // Item lista de scroll (pedido do usuário): hard-cut continua grid de
  // verdade (navegação 2D), mas qualquer variação de Scroll (normal,
  // automático, automático reverso - H ou V) é sequência linear mesmo pro
  // motor (play_idx++/--) - vira lista, sem mudar NADA nos dados (cells
  // continua a mesma estrutura x,y; a lista só lê/escreve ao longo do
  // eixo único: linha 0 pra horizontal, coluna 0 pra vertical). Trocar de
  // volta pra Hard-Cut mostra o grid de novo, com QUALQUER outra
  // linha/coluna que já existisse intacta (nunca é apagada só por trocar
  // de visualização).
  function isScrollTransition(tt){
    return tt === 'scroll_h' || tt === 'scroll_h_auto' || tt === 'scroll_h_auto_rev' ||
           tt === 'scroll_v' || tt === 'scroll_v_auto' || tt === 'scroll_v_auto_rev';
  }
  function scrollAxisIsHorizontal(tt){
    return tt === 'scroll_h' || tt === 'scroll_h_auto' || tt === 'scroll_h_auto_rev';
  }

  function renderGrid() {
    const container = document.getElementById('ldGridContainer');
    if (!container) return;
    if (isScrollTransition(currentWorld.transitionType)) { renderScrollList(container); return; }

    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${currentWorld.cols}, 120px)`;
    container.style.gridTemplateRows = `repeat(${currentWorld.rows}, 105px)`;
    container.innerHTML = '';

    for (let y = 0; y < currentWorld.rows; y++) {
      for (let x = 0; x < currentWorld.cols; x++) {
        container.appendChild(buildCellDiv(x, y));
      }
    }
  }

  // Mesma lista de cells, só que percorrida ao longo de UM eixo só (linha 0
  // ou coluna 0, conforme a Transição) e desenhada em fila em vez de grade.
  // As ferramentas (Posicionar/Apagar/Spawns/Deletar Célula/Inserir Célula)
  // continuam idênticas - reaproveita buildCellDiv/handleCellClick sem
  // mudar a lógica de clique nenhuma, só o layout visual.
  function renderScrollList(container){
    const horiz = scrollAxisIsHorizontal(currentWorld.transitionType);
    const len = horiz ? currentWorld.cols : currentWorld.rows;
    container.style.display = 'flex';
    container.style.flexDirection = horiz ? 'row' : 'column';
    container.style.flexWrap = 'nowrap';
    container.style.gap = '6px';
    container.style.overflow = 'auto';
    container.innerHTML = '';
    for (let i = 0; i < len; i++) {
      const x = horiz ? i : 0, y = horiz ? 0 : i;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;flex-shrink:0';
      const idx = document.createElement('span');
      idx.textContent = `#${i + 1}`;
      idx.style.cssText = 'position:absolute;top:-2px;left:-2px;font-size:8px;color:#000;background:#ffcc00;padding:0 4px;border-radius:3px;z-index:1;font-weight:bold';
      wrap.appendChild(buildCellDiv(x, y));
      wrap.appendChild(idx);
      container.appendChild(wrap);
    }
    // "+ Adicionar": cresce a sequência em 1 (sempre no fim - nunca precisa
    // deslocar nada, diferente da ferramenta Inserir Célula que abre espaço
    // NO MEIO). Substitui "Redimensionar" pra fases de scroll.
    const addCard = document.createElement('div');
    addCard.style.cssText = `width:120px;height:105px;flex-shrink:0;background:#0f1f14;border:2px dashed #27ae60;border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#27ae60;font-size:24px`;
    addCard.textContent = '+';
    addCard.title = 'Adicionar tela no fim da sequência';
    addCard.onclick = () => appendScrollSlot();
    container.appendChild(addCard);
  }

  function appendScrollSlot(){
    const horiz = scrollAxisIsHorizontal(currentWorld.transitionType);
    if (horiz) currentWorld.cols += 1; else currentWorld.rows += 1;
    renderGrid(); persistLevelMap();
  }

  function buildCellDiv(x, y) {
        const key = `${x},${y}`;
        const cellData = currentWorld.cells[key];
        const cellDiv = document.createElement('div');
        cellDiv.style.cssText = `width:120px;height:105px;background:#161616;border:1px dashed #444;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;position:relative;padding:4px;gap:3px;text-align:center`;
        
        if (cellData) {
          let assetObj = null;
          let assetName = 'Tela';
          let borderColor = '#4ec9b0';
          let bgColor = '#0a221f';

          if (cellData.bgId) {
            const backgrounds = (typeof BG !== 'undefined' && BG.getBackgrounds) ? BG.getBackgrounds() : (Project.data?.backgrounds || []);
            assetObj = backgrounds.find((b, idx) => (b.id || idx) === cellData.bgId);
            if (assetObj) assetName = assetObj.name;
            borderColor = '#ffcc00';
            bgColor = '#2a2600';
          }

          cellDiv.style.border = `2px solid ${borderColor}`;
          cellDiv.style.background = bgColor;

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

        // Drag'n'drop pra trocar telas de lugar no grid - mesmo padrão da
        // lista de Backgrounds Desenhados (dragstart/dragover/drop nativos).
        // Só célula com conteúdo pode ser ARRASTADA (célula vazia não tem o
        // que mover), mas qualquer célula aceita ser ALVO do drop (troca com
        // vazia = só move; troca com preenchida = troca as duas de lugar).
        cellDiv.draggable = !!cellData;
        cellDiv.addEventListener('dragstart', e => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ x, y }));
          e.dataTransfer.effectAllowed = 'move';
          cellDiv.style.opacity = '0.4';
        });
        cellDiv.addEventListener('dragend', () => { cellDiv.style.opacity = '1'; });
        cellDiv.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          cellDiv.style.boxShadow = 'inset 0 0 0 3px #ffcc00';
        });
        cellDiv.addEventListener('dragleave', () => { cellDiv.style.boxShadow = ''; });
        cellDiv.addEventListener('drop', e => {
          e.preventDefault();
          cellDiv.style.boxShadow = '';
          let src;
          try { src = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
          if (!src || (src.x === x && src.y === y)) return;
          swapCells(src.x, src.y, x, y);
        });

        return cellDiv;
  }

  // Troca o conteúdo de duas células de lugar (ou move, se uma delas estiver
  // vazia) - usado pelo drag'n'drop do grid. Não mexe em cols/rows.
  function swapCells(x1, y1, x2, y2){
    if (!currentWorld.cells) currentWorld.cells = {};
    const key1 = `${x1},${y1}`, key2 = `${x2},${y2}`;
    const a = currentWorld.cells[key1];
    const b = currentWorld.cells[key2];
    if (a) currentWorld.cells[key2] = { ...a, x: x2, y: y2 }; else delete currentWorld.cells[key2];
    if (b) currentWorld.cells[key1] = { ...b, x: x1, y: y1 }; else delete currentWorld.cells[key1];
    renderGrid(); persistLevelMap();
    Project.status('Telas trocadas de lugar.');
  }

  function handleCellClick(x, y) {
    const key = `${x},${y}`;
    if (!currentWorld.cells || typeof currentWorld.cells !== 'object') currentWorld.cells = {};
    if (activeTool === 'place') {
      if (selectedAsset.id === null) {
        alert('Selecione uma Splash Screen ou um Background na lista lateral esquerda primeiro.');
        return;
      }
      currentWorld.cells[key] = { bgId: selectedAsset.id, x, y };
      renderGrid(); persistLevelMap();
    } else if (activeTool === 'erase') {
      delete currentWorld.cells[key];
      renderGrid(); persistLevelMap();
    } else if (activeTool === 'spawns') {
      if (!currentWorld.cells[key]) { alert('A célula precisa ter uma tela alocada primeiro.'); return; }
      const cell = currentWorld.cells[key];
      selectedCell = { x, y, bgId: cell.bgId, type: cell.type };
      renderGrid();
      renderSpawnPanel();
    } else if (activeTool === 'delete_cell') {
      deleteCellShift(x, y);
    } else if (activeTool === 'insert_cell') {
      insertCellShift(x, y);
    }
  }

  // Deleta a célula (x,y) e puxa toda célula À DIREITA dela NA MESMA LINHA
  // uma casa pra trás (estilo planilha) - a última coluna da linha fica
  // vazia. Não encolhe "cols" sozinho (usuário pode usar Redimensionar
  // depois se quiser recuperar o espaço - não fazemos isso automático pra
  // não mexer sem avisar em outras linhas que ainda usem aquela coluna).
  // Item lista de scroll: essas duas ferramentas precisam saber ao longo de
  // QUAL EIXO deslocar - grid normal (hard-cut) e lista horizontal sempre
  // foram ao longo de X (cols, linha fixa); lista vertical desloca ao
  // longo de Y (rows, coluna fixa). Resto do raciocínio (abrir/fechar
  // espaço, só cresce a dimensão se a ponta já estava ocupada) é o mesmo
  // dos dois lados, só troca qual variável é "a que anda".
  function deleteCellShift(x, y){
    if(!currentWorld.cells) return;
    const vertical = isScrollTransition(currentWorld.transitionType) && !scrollAxisIsHorizontal(currentWorld.transitionType);
    if (vertical) {
      for(let r = y; r < currentWorld.rows - 1; r++){
        const next = currentWorld.cells[`${x},${r+1}`];
        if(next) currentWorld.cells[`${x},${r}`] = { ...next, x, y: r };
        else delete currentWorld.cells[`${x},${r}`];
      }
      delete currentWorld.cells[`${x},${currentWorld.rows-1}`];
    } else {
      for(let c = x; c < currentWorld.cols - 1; c++){
        const next = currentWorld.cells[`${c+1},${y}`];
        if(next) currentWorld.cells[`${c},${y}`] = { ...next, x: c, y };
        else delete currentWorld.cells[`${c},${y}`];
      }
      delete currentWorld.cells[`${currentWorld.cols-1},${y}`];
    }
    renderGrid(); persistLevelMap();
    Project.status('Célula removida - as seguintes andaram uma casa pra trás.');
  }

  // Abre uma célula vazia em (x,y), empurrando toda célula seguinte (na
  // mesma linha, ou na mesma coluna em lista vertical) uma casa pra frente.
  // Só cresce cols/rows se a ponta já estiver ocupada - senão já tem
  // espaço sobrando, não precisa.
  function insertCellShift(x, y){
    if(!currentWorld.cells) currentWorld.cells = {};
    const vertical = isScrollTransition(currentWorld.transitionType) && !scrollAxisIsHorizontal(currentWorld.transitionType);
    if (vertical) {
      if(currentWorld.cells[`${x},${currentWorld.rows-1}`]){
        currentWorld.rows += 1;
        const rowsEl = document.getElementById('ldRows');
        if(rowsEl) rowsEl.value = currentWorld.rows;
      }
      for(let r = currentWorld.rows - 1; r > y; r--){
        const prev = currentWorld.cells[`${x},${r-1}`];
        if(prev) currentWorld.cells[`${x},${r}`] = { ...prev, x, y: r };
        else delete currentWorld.cells[`${x},${r}`];
      }
      delete currentWorld.cells[`${x},${y}`];
    } else {
      if(currentWorld.cells[`${currentWorld.cols-1},${y}`]){
        currentWorld.cols += 1;
        const colsEl = document.getElementById('ldCols');
        if(colsEl) colsEl.value = currentWorld.cols;
      }
      for(let c = currentWorld.cols - 1; c > x; c--){
        const prev = currentWorld.cells[`${c-1},${y}`];
        if(prev) currentWorld.cells[`${c},${y}`] = { ...prev, x: c, y };
        else delete currentWorld.cells[`${c},${y}`];
      }
      delete currentWorld.cells[`${x},${y}`];
    }
    renderGrid(); persistLevelMap();
    Project.status('Célula vazia aberta - as seguintes andaram uma casa pra frente.');
  }

  // Grava currentWorld em phase.levelMap a cada edição, sem precisar de um clique manual em
  // "Salvar Fase" - evita perder trabalho por esquecimento antes do save global (.nms).
  function persistLevelMap(){
    if (!Project.data) return;
    const phases = Project.data.phases || [];
    if(!phases.length) return;
    // se por algum motivo o id sumiu, amarra na fase selecionada no <select> ou na primeira
    if(!currentPhaseId){
      const sel = document.getElementById('ldPhaseSelect')?.value;
      currentPhaseId = sel || phases[0].id;
    }
    const phase = phases.find(p => String(p.id) === String(currentPhaseId)) || phases[0];
    if (!phase) return;
    currentPhaseId = phase.id;
    if(!currentWorld || typeof currentWorld !== 'object') currentWorld = defaultWorld();
    if(!currentWorld.cells || typeof currentWorld.cells !== 'object') currentWorld.cells = {};
    // grava cópia profunda — inclui cells com telas posicionadas
    phase.levelMap = normalizeWorld(currentWorld);
    return phase.levelMap;
  }

  /** Chamado no Salvar Projeto (collectProjectData) para não depender só dos cliques. */
  function flushToProject(){
    return persistLevelMap();
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
    persistLevelMap,
    flushToProject,
    addSpawn,
    removeSpawn,
    renderSpawnPanel,
    updateSpawnPreview,
    drawSpawnPreview
  };
})();