// SPLASH SCREEN MODULE v0.9.5 - Ported with BG tools
const SPLASH = (() => {
  let nametable = new Array(32 * 30).fill(0);    // 960 tiles (0-255)
  let attributes = new Array(64).fill(0);        // 64 bytes de atributos
  let currentSplashIndex = 0;
  let globalEventsAttached = false;
  let selectedMetatile = null;
  let activePalette = 0;
  let isDrawing = false;
  let textMode = false;
  let textCursor = { x: 0, y: 0 };
  let textPalette = 0;
  let splashCanvas, splashCtx;
  let currentTool = 'paint';
  let selectedTextIdx = null;
  let movingTextMode = false;
  let textLayers = [];
  let currentChrPage = 0;

  function isValidForSplash(mt) {
    return mt && mt.w >= 2 && mt.h >= 2 && mt.w % 2 === 0 && mt.h % 2 === 0;
  }

  function buildHTML(){
    const root = document.getElementById('mod-splash');
    if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <!-- Topbar -->
        <div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#ffcc00;margin:0">🖼 SPLASH SCREEN v0.9.5</h3>
          <div style="display:flex;gap:6px;align-items:center;margin-left:12px">
            <span style="font-size:11px;color:#888">Splash:</span>
            <select id="splashSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px;min-width:140px"></select>
            <button class="btn-tool" onclick="SPLASH.newSplash()" style="padding:4px 8px">✨ Novo</button>
            <button class="btn-tool" onclick="SPLASH.saveAsNew()" style="background:#2980b9;color:#fff">💾 Save As</button>
            <button class="btn-tool" onclick="SPLASH.saveToProject()" style="background:#27ae60;color:#fff">💾 Salvar</button>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <span id="splashModeLabel" style="font-size:10px;color:#4ec9b0;background:#111;border:1px solid #333;border-radius:3px;padding:2px 6px">Modo: Pintura</span>
            <button class="btn-tool" onclick="SPLASH.exportASM()">📄 Exportar .asm</button>
          </div>
        </div>

        <div style="display:flex;flex:1;overflow:hidden;min-height:0">
          <!-- Painel Esquerdo -->
          <div style="width:340px;min-width:340px;background:#181818;border-right:1px solid #333;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            
            <!-- Ferramentas Principais -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">FERRAMENTAS</h4>
              <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                <button class="btn-tool tool-btn active" data-splash-tool="paint" onclick="SPLASH.setTool('paint')">🎨 Pintar</button>
                <button class="btn-tool tool-btn" data-splash-tool="flood" onclick="SPLASH.setTool('flood')" style="background:#8e44ad;color:#fff;border:1px solid #9b59b6">🌊 Flood</button>
                <button class="btn-tool tool-btn" data-splash-tool="attr" onclick="SPLASH.setTool('attr')" style="background:#2980b9;color:#fff;border:1px solid #3498db">🖌 Paleta</button>
                <button class="btn-tool tool-btn" data-splash-tool="text" onclick="SPLASH.setTool('text')">🔤 Texto</button>
                <button class="btn-tool tool-btn" data-splash-tool="fill" onclick="SPLASH.setTool('fill')">🪣 Auto-Fill</button>
              </div>
              <div id="splashHelpText" style="font-size:10px;color:#888;background:#000;border:1px solid #222;border-radius:3px;padding:4px 6px">Pintura livre. Alt+clique sobre o canvas para clonar. Shift+clique apaga.</div>
              
              <!-- Painel Fill/Ações -->
              <div id="splashFillPanel" style="display:none;background:#1a1a00;border:1px solid #665500;border-radius:6px;padding:8px;margin-top:8px">
                <h4 style="font-size:10px;color:#ffcc00;margin-bottom:6px">AÇÕES DE PREENCHIMENTO</h4>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn-tool" onclick="SPLASH.fillAllEmpty()" style="font-size:10px">⬜ Só Vazios</button>
                  <button class="btn-tool" onclick="SPLASH.fillEntireScreen()" style="font-size:10px;background:#ffcc00;color:#000">🌟 Tela toda</button>
                  <button class="btn-tool" onclick="SPLASH.applyAttrToAll()" style="font-size:10px;background:#2980b9;color:#fff">🎨 Paleta Global</button>
                  <button class="btn-tool" onclick="SPLASH.clearSplash()" style="font-size:10px;background:#c0392b;color:#fff">🧹 Limpar</button>
                </div>
              </div>

              <!-- Painel Texto -->
              <div id="splashTextPanel" style="display:none;background:#1a1a00;border:1px solid #665500;border-radius:6px;padding:8px;margin-top:8px">
                <h4 style="font-size:10px;color:#ffcc00;margin-bottom:6px">🔤 TEXTO ASCII</h4>
                <div style="display:flex;gap:4px;margin:4px 0">
                  <input id="splashTextInput" type="text" placeholder="Texto + Enter" style="flex:1;background:#000;color:#ffcc00;border:1px solid #665500;border-radius:4px;padding:6px;font-size:12px;font-family:monospace">
                  <button class="btn-tool" onclick="SPLASH.insertText()" style="background:#ffcc00;color:#000">Inserir</button>
                </div>
                <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
                  <label style="font-size:10px;color:#888">Paleta:</label>
                  <div id="splashTextPalettes" style="display:flex;gap:4px"></div>
                  <span style="margin-left:auto;font-size:10px;color:#666">Cursor: <span id="splashCursorPos" style="color:#ffcc00">0,0</span></span>
                </div>
              </div>
            </div>

            <!-- Metatiles Lista -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <h4 style="font-size:11px;color:#4ec9b0;margin:0">METATILES (2x2+)</h4>
                <div style="display:flex;align-items:center;gap:4px">
                  <span style="font-size:10px;color:#888">Pág CHR:</span>
                  <select id="splashChrPageSelect" style="background:#000;color:#ffcc00;border:1px solid #444;border-radius:3px;font-size:10px;padding:2px"></select>
                </div>
              </div>
              <div id="metatilePalette" style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow:auto;padding-right:4px"></div>
            </div>

            <!-- Preview do Metatile Selecionado -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;gap:12px;align-items:center">
                <div>
                  <h4 style="font-size:10px;color:#888;margin-bottom:6px">PALETA (0-3)</h4>
                  <div id="attrPaletteSelect" style="display:flex;gap:6px;flex-direction:column"></div>
                </div>
                
                <div style="flex:1;display:flex;flex-direction:column;align-items:center">
                  <div id="selectedInfo" style="font-size:10px;color:#aaa;text-align:center;margin-bottom:4px">Nenhum</div>
                  <div style="position:relative">
                    <canvas id="selectedPreview" width="80" height="80" style="border:1px solid #ffcc00;background:#000;image-rendering:pixelated;display:block"></canvas>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- Centro: Canvas Nametable -->
          <div style="flex:1;background:#111;padding:12px;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:8px">
            <div style="display:flex;gap:12px;align-items:center;font-size:11px;color:#888">
              <label style="display:flex;align-items:center;gap:4px">Grid:
                <select id="splashGridSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:11px">
                  <option value="none">Sem grid</option>
                  <option value="1x1">1x1</option>
                  <option value="2x2" selected>2x2</option>
                  <option value="4x4">4x4</option>
                </select>
              </label>
              <span id="hoverPos" style="color:#4ec9b0;background:#000;padding:2px 6px;border-radius:3px;border:1px solid #333">x:0 y:0</span>
            </div>
            <canvas id="splashCanvas" width="512" height="480" style="border:2px solid #665500;background:#000;image-rendering:pixelated;cursor:crosshair;display:block"></canvas>
          </div>

          <!-- Direita: Camadas de Texto e Info -->
          <div style="width:280px;min-width:280px;background:#1e1e1e;padding:12px;border-left:1px solid #333;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #665500;border-radius:6px;padding:10px;flex:1;display:flex;flex-direction:column">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:8px">📝 CAMADAS DE TEXTO</h4>
              <div id="splashTextLayers" style="display:flex;flex-direction:column;gap:6px;flex:1;overflow:auto"></div>
            </div>
            <div>
              <div style="font-size:11px;color:#888;background:#111;border:1px solid #333;padding:8px;border-radius:4px">
                Tiles Pintados: <b id="splashStats" style="color:#fff">0/960</b><br>
                Textos Ativos: <b id="textCount" style="color:#fff">0</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    splashCanvas = document.getElementById('splashCanvas');
    splashCtx = splashCanvas ? splashCanvas.getContext('2d') : null;
    
    attachEvents();
    initChrPageSelect();
    
    if (Project.data?.splashScreens && Project.data.splashScreens.length > 0) {
      if (currentSplashIndex < 0 || currentSplashIndex >= Project.data.splashScreens.length) {
        currentSplashIndex = 0;
      }
      loadSplash(currentSplashIndex);
    } else {
      updateSplashSelect();
    }

    refreshMetatileList();
    updateAttrPaletteUI();
    updateTextPaletteUI();
    render();
  }

  function setTool(t) {
    currentTool = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-splash-tool="${t}"]`)?.classList.add('active');
    
    document.getElementById('splashFillPanel').style.display = (t === 'fill') ? 'block' : 'none';
    document.getElementById('splashTextPanel').style.display = (t === 'text') ? 'block' : 'none';

    const label = document.getElementById('splashModeLabel');
    const help = document.getElementById('splashHelpText');
    textMode = (t === 'text');

    if(t === 'flood') { label.textContent = 'Modo: Flood Fill'; help.textContent = 'Preenche área contígua com o metatile selecionado.'; }
    else if(t === 'attr') { label.textContent = 'Modo: Pincel de Atributo'; help.textContent = 'Pinta a paleta mantendo as estampas de tiles.'; }
    else if(t === 'fill') { label.textContent = 'Modo: Auto-Fill'; help.textContent = 'Preenchimento em massa.'; }
    else if(t === 'text') { label.textContent = 'Modo: Texto ASCII'; help.textContent = 'Clique para posicionar e digite seu texto.'; }
    else { label.textContent = 'Modo: Pintura Metatile'; help.textContent = 'Aplica Metatile + Atributo automaticamente.'; }
    render();
  }

  function selectMetatileObj(mt) {
    selectedMetatile = mt;
    document.querySelectorAll('#metatilePalette div').forEach(d => {
      d.style.borderColor = (mt && d.dataset.mtId === mt.id) ? '#ffcc00' : '#333';
    });
    updateSelectedInfo();
  }

  function updateSelectedInfo(){
    const info = document.getElementById('selectedInfo');
    const canv = document.getElementById('selectedPreview');
    if(!info || !canv) return;
    if(!selectedMetatile){ 
      info.textContent = 'Nenhum'; 
      const ctx = canv.getContext('2d'); ctx.fillStyle='#000'; ctx.fillRect(0,0,80,80); 
      return; 
    }

    info.innerHTML = `<b style="color:#fff">${selectedMetatile.name}</b> (${selectedMetatile.w}x${selectedMetatile.h})`;
    
    const cctx = canv.getContext('2d');
    cctx.fillStyle = '#000'; cctx.fillRect(0,0,80,80);
    
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : (Project.data?.chr || new Uint8Array(8192));
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : (Project.data?.palettes || [[15,0,16,48]]);
    const pal = pals[activePalette] || pals[0];
    const w = selectedMetatile.w, h = selectedMetatile.h;
    const tilePxW = 80 / w, tilePxH = 80 / h;

    selectedMetatile.tiles.forEach((t, tIdx)=>{
      const off = (t % 512) * 16; if(off + 16 > chrBuf.length) return;
      const gx = (tIdx % w), gy = Math.floor(tIdx / w);
      for(let py=0; py<8; py++){
        const p0 = chrBuf[off+py], p1 = chrBuf[off+py+8];
        for(let px=0; px<8; px++){
          const sh = 7-px, b0 = (p0>>sh)&1, b1 = (p1>>sh)&1, ci = (b1<<1)|b0;
          cctx.fillStyle = NES_PALETTE[pal[ci]];
          cctx.fillRect(gx*tilePxW + px*(tilePxW/8), gy*tilePxH + py*(tilePxH/8), (tilePxW/8)+0.5, (tilePxH/8)+0.5);
        }
      }
    });

    for(let gy=0; gy<h; gy++){
      for(let gx=0; gx<w; gx++){
        cctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        cctx.strokeRect(gx*tilePxW, gy*tilePxH, tilePxW, tilePxH);
      }
    }
  }

  function floodFillAt(tx, ty) {
    if(!selectedMetatile) return;
    const mt = selectedMetatile;
    
    const snapX = Math.floor(tx / mt.w) * mt.w;
    const snapY = Math.floor(ty / mt.h) * mt.h;
    
    const targetTile = nametable[snapY * 32 + snapX];
    const replacementTile = mt.tiles[0] % 256;
    
    if (targetTile === replacementTile) return;

    const queue = [{x: snapX, y: snapY}];
    const visited = new Set();

    while(queue.length > 0) {
      const curr = queue.shift();
      const cx = curr.x, cy = curr.y;
      const key = `${cx},${cy}`;
      
      if(visited.has(key)) continue;
      if(cx < 0 || cx >= 32 || cy < 0 || cy >= 30) continue;
      if(nametable[cy * 32 + cx] !== targetTile) continue;

      visited.add(key);

      for(let dy=0; dy<mt.h; dy++){
        for(let dx=0; dx<mt.w; dx++){
          const nx = cx + dx, ny = cy + dy;
          if(nx >= 0 && nx < 32 && ny >= 0 && ny < 30) {
            const subIdx = dy * mt.w + dx;
            nametable[ny * 32 + nx] = mt.tiles[subIdx] % 256;
            
            const attrX = Math.floor(nx/2), attrY = Math.floor(ny/2);
            const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
            const attrIdx = blockY*8 + blockX;
            const shift = ((attrY%2)*2 + (attrX%2))*2;
            attributes[attrIdx] = (attributes[attrIdx] & ~(0x03 << shift)) | ((activePalette & 0x03) << shift);
          }
        }
      }

      queue.push({x: cx + mt.w, y: cy});
      queue.push({x: cx - mt.w, y: cy});
      queue.push({x: cx, y: cy + mt.h});
      queue.push({x: cx, y: cy - mt.h});
    }
    render();
  }

  function paintAt(mx, my, erasing = false, isAlt = false, isInitialClick = false) {
    if(!splashCanvas) return;
    const rect = splashCanvas.getBoundingClientRect();
    const scaleX = 512 / rect.width, scaleY = 480 / rect.height;
    const tx = Math.floor((mx * scaleX) / 16), ty = Math.floor((my * scaleY) / 16);
    if(tx < 0 || tx >= 32 || ty < 0 || ty >= 30) return;

    if(isAlt) {
      if(isInitialClick) pickMetatileAt(tx, ty);
      return;
    }

    if(currentTool === 'flood') {
      if(isInitialClick) floodFillAt(tx, ty);
      return;
    }

    if(currentTool === 'attr') {
      const attrX = Math.floor(tx/2), attrY = Math.floor(ty/2);
      const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
      const attrIdx = blockY*8 + blockX;
      const shift = ((attrY%2)*2 + (attrX%2))*2;
      attributes[attrIdx] = (attributes[attrIdx] & ~(0x03 << shift)) | ((activePalette & 0x03) << shift);
      render();
      return;
    }

    if(!selectedMetatile && !erasing) return;
    if(erasing){ 
      nametable[ty*32+tx] = 0; 
      render(); 
      return; 
    }

    const mt = selectedMetatile;
    const snapX = Math.floor(tx / mt.w) * mt.w;
    const snapY = Math.floor(ty / mt.h) * mt.h;

    for(let dy=0; dy<mt.h; dy++){
      for(let dx=0; dx<mt.w; dx++){
        const nx = snapX + dx, ny = snapY + dy;
        if(nx < 0 || nx >= 32 || ny < 0 || ny >= 30) continue;
        const subIdx = dy * mt.w + dx;
        
        nametable[ny*32+nx] = (mt.tiles[subIdx] || 0) % 256;

        const attrX = Math.floor(nx/2), attrY = Math.floor(ny/2);
        const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
        const attrIdx = blockY*8 + blockX;
        const shift = ((attrY%2)*2 + (attrX%2))*2;
        attributes[attrIdx] = (attributes[attrIdx] & ~(0x03 << shift)) | ((activePalette & 0x03) << shift);
      }
    }
    render();
  }

  function attachEvents(){
    if(!splashCanvas) return;
    splashCanvas.addEventListener('mousedown', e => {
      isDrawing = true;
      const r = splashCanvas.getBoundingClientRect();
      paintAt(e.clientX - r.left, e.clientY - r.top, e.shiftKey, e.altKey, true);
    });
    splashCanvas.addEventListener('mousemove', e => {
      const r = splashCanvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const tx = Math.floor((mx / r.width) * 32), ty = Math.floor((my / r.height) * 30);
      const hover = document.getElementById('hoverPos');
      if(hover) hover.textContent = `x:${tx} y:${ty} • Tile: $${(nametable[ty*32+tx]||0).toString(16).padStart(2,"0").toUpperCase()}`;
      
      if(isDrawing) paintAt(mx, my, e.shiftKey, e.altKey, false);
    });
    document.getElementById('splashGridSelect')?.addEventListener('change', render);

    // BUG FIX: listener global só pode ser registrado uma vez, senão acumula
    // um handler a cada troca de aba (Dashboard <-> Splash).
    if(!globalEventsAttached){
      globalEventsAttached = true;
      window.addEventListener('mouseup', () => isDrawing = false);
    }
  }

  function pickMetatileAt(tx, ty) {
    const attrX = Math.floor(tx/2), attrY = Math.floor(ty/2);
    const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
    const attrIdx = blockY*8 + blockX;
    const shift = ((attrY%2)*2 + (attrX%2))*2;
    activePalette = ((attributes[attrIdx]||0) >> shift) & 0x03;
    updateAttrPaletteUI();

    const boardTile = nametable[ty * 32 + tx];
    if (boardTile === 0) return;

    let mets = (typeof CHR !== 'undefined' && CHR.getMetatiles) ? CHR.getMetatiles() : (Project.data?.metatiles || []);
    mets = mets.filter(isValidForSplash);
    
    let foundMt = null;
    for (let mt of mets) {
      const snapX = Math.floor(tx / mt.w) * mt.w;
      const snapY = Math.floor(ty / mt.h) * mt.h;
      let match = true;
      for(let dy=0; dy<mt.h; dy++){
        for(let dx=0; dx<mt.w; dx++){
          const nx = snapX + dx, ny = snapY + dy;
          if(nx < 32 && ny < 30) {
            if(nametable[ny * 32 + nx] !== (mt.tiles[dy * mt.w + dx] % 256)) {
              match = false; break;
            }
          }
        }
        if(!match) break;
      }
      if(match) { foundMt = mt; break; }
    }

    if (foundMt) selectMetatileObj(foundMt);
  }

  function initChrPageSelect(){
    const sel = document.getElementById('splashChrPageSelect'); if(!sel) return;
    sel.innerHTML = '';
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : (Project.data?.chr || new Uint8Array(8192));
    const totalPages = Math.max(1, Math.ceil(chrBuf.length / 4096));

    for(let i = 0; i < totalPages; i++){
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = `Pág ${i}`;
      sel.appendChild(opt);
    }
    if(currentChrPage >= totalPages) currentChrPage = 0;
    sel.value = currentChrPage;
    sel.onchange = (e) => { currentChrPage = parseInt(e.target.value) || 0; refreshMetatileList(); };
  }

  function refreshMetatileList(){
    const container = document.getElementById('metatilePalette'); if(!container) return;
    let mets = (typeof CHR !== 'undefined' && CHR.getMetatiles) ? CHR.getMetatiles() : (Project.data?.metatiles || []);
    mets = mets.filter(isValidForSplash);
    container.innerHTML = '';

    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : (Project.data?.chr || new Uint8Array(8192));
    const startTile = currentChrPage * 256;
    const endTile = startTile + 256;

    const pageMetatiles = mets.filter(mt => {
      if(!mt.tiles || mt.tiles.length === 0) return true;
      return mt.tiles.some(t => t >= startTile && t < endTile);
    });

    if(pageMetatiles.length === 0){ container.innerHTML = `<div style="font-size:10px;color:#666;padding:8px">Nenhum metatile na pág</div>`; return; }

    pageMetatiles.forEach((mt, idx) => {
      const div = document.createElement('div');
      const isSelected = selectedMetatile && selectedMetatile.id === mt.id;
      div.style.cssText = `width:44px;height:44px;border:2px solid ${isSelected ? '#ffcc00' : '#333'};background:#000;cursor:pointer;display:flex;align-items:center;justify-content:center;image-rendering:pixelated`;
      div.title = mt.name || `mt_${idx}`;
      div.dataset.mtId = mt.id;
      
      const canv = document.createElement('canvas'); canv.width = 44; canv.height = 44;
      canv.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;';
      
      const cctx = canv.getContext('2d');
      const w = mt.w || 2, h = mt.h || 2;
      const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : (Project.data?.palettes || [[15,0,16,48]]);
      const pal = pals[mt.palette || 0] || pals[0];

      mt.tiles.forEach((t, tIdx) => {
        const off = (t % 512) * 16; if(off + 16 > chrBuf.length) return;
        const gx = (tIdx % w), gy = Math.floor(tIdx / w);
        for(let py=0; py<8; py++){
          const p0 = chrBuf[off+py], p1 = chrBuf[off+py+8];
          for(let px=0; px<8; px++){
            const sh = 7-px, b0 = (p0>>sh)&1, b1 = (p1>>sh)&1, ci = (b1<<1)|b0;
            cctx.fillStyle = NES_PALETTE[pal[ci]];
            cctx.fillRect(gx * (22 / (w / 2)) + px * (22 / (w / 2) / 8), gy * (22 / (h / 2)) + py * (22 / (h / 2) / 8), (22 / (w / 2) / 8) + 0.5, (22 / (h / 2) / 8) + 0.5);
          }
        }
      });
      div.appendChild(canv);
      div.onclick = () => { selectMetatileObj(mt); };
      container.appendChild(div);
    });
  }

  function updateAttrPaletteUI(){
    const container = document.getElementById('attrPaletteSelect'); if(!container) return;
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : (Project.data?.palettes || [[15,0,16,48]]);
    container.innerHTML = '';
    for(let i=0; i<4; i++){
      const btn = document.createElement('div');
      btn.style.cssText = `width:70px;height:20px;border:2px solid ${i===activePalette?'#ffcc00':'#333'};cursor:pointer;display:flex;border-radius:3px;overflow:hidden`;
      btn.onclick = () => { activePalette = i; updateAttrPaletteUI(); if(selectedMetatile) updateSelectedInfo(); };
      for(let c=0; c<4; c++){ 
        const d = document.createElement('div'); 
        d.style.flex = '1'; 
        d.style.background = NES_PALETTE[pals[i] ? pals[i][c] : 0]; 
        btn.appendChild(d); 
      }
      container.appendChild(btn);
    }
  }

  function updateTextPaletteUI(){
    const container = document.getElementById('splashTextPalettes'); if(!container) return;
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : (Project.data?.palettes || [[15,0,16,48]]);
    container.innerHTML = '';
    for(let i=0; i<4; i++){
      const b = document.createElement('div');
      b.style.cssText = `width:20px;height:20px;border:2px solid ${i===textPalette?'#ffcc00':'#333'};cursor:pointer;background:${NES_PALETTE[pals[i] ? pals[i][1] : 0]};border-radius:2px`;
      b.onclick = () => { textPalette = i; updateTextPaletteUI(); };
      container.appendChild(b);
    }
  }

  function render(){
    if(!splashCtx || !splashCanvas) return;
    splashCtx.fillStyle = '#000'; splashCtx.fillRect(0,0,512,480);
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : (Project.data?.chr || new Uint8Array(8192));
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : (Project.data?.palettes || [[15,0,16,48]]);
    
    for(let ty=0; ty<30; ty++){
      for(let tx=0; tx<32; tx++){
        const tileIdx = nametable[ty*32+tx] || 0;
        if(tileIdx === 0) continue;
        const off = (tileIdx % 256) * 16; if(off + 16 > chrBuf.length) continue;
        
        const attrX = Math.floor(tx/2), attrY = Math.floor(ty/2);
        const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
        const attrIdx = blockY*8 + blockX;
        const shift = ((attrY%2)*2 + (attrX%2))*2;
        const palIdx = (attributes[attrIdx] >> shift) & 0x03;
        const pal = pals[palIdx] || pals[0];
        
        for(let py=0; py<8; py++){
          const p0 = chrBuf[off+py], p1 = chrBuf[off+py+8];
          for(let px=0; px<8; px++){
            const sh = 7-px, b0 = (p0>>sh)&1, b1 = (p1>>sh)&1, ci = (b1<<1)|b0;
            splashCtx.fillStyle = NES_PALETTE[pal[ci]];
            splashCtx.fillRect(tx*16 + px*2, ty*16 + py*2, 2, 2);
          }
        }
      }
    }

    if(selectedTextIdx !== null && textLayers[selectedTextIdx]){
      const layer = textLayers[selectedTextIdx];
      splashCtx.strokeStyle = movingTextMode ? '#ffcc00' : '#00ff00';
      splashCtx.lineWidth = 2;
      splashCtx.setLineDash(movingTextMode ? [6,3] : []);
      splashCtx.strokeRect(layer.x*16, layer.y*16, layer.text.length*16, 16);
      splashCtx.setLineDash([]);
    }

    if(textMode){
      splashCtx.strokeStyle = '#ffcc00'; splashCtx.lineWidth = 2;
      splashCtx.strokeRect(textCursor.x*16, textCursor.y*16, 16, 16);
    }
    
    const gridMode = document.getElementById('splashGridSelect')?.value || '2x2';
    if(gridMode !== 'none'){
      const step = gridMode === '1x1' ? 1 : gridMode === '4x4' ? 4 : 2;
      splashCtx.strokeStyle = step===1 ? 'rgba(255,255,255,0.08)' : 'rgba(255,204,0,0.2)';
      for(let y=0; y<=30; y+=step){ splashCtx.beginPath(); splashCtx.moveTo(0,y*16); splashCtx.lineTo(512,y*16); splashCtx.stroke(); }
      for(let x=0; x<=32; x+=step){ splashCtx.beginPath(); splashCtx.moveTo(x*16,0); splashCtx.lineTo(x*16,480); splashCtx.stroke(); }
    }
    updateStats();
  }

  function updateStats(){
    const el = document.getElementById('splashStats'); if(el) el.textContent = `${nametable.filter(t=>t!==0).length}/960`;
    const tc = document.getElementById('textCount'); if(tc) tc.textContent = textLayers.length;
  }

  function fillAllEmpty(){
    if(!selectedMetatile){ alert('Selecione um metatile'); return; }
    const mt = selectedMetatile;
    for(let y=0; y<30; y++){
      for(let x=0; x<32; x++){
        if(nametable[y*32+x] === 0) {
          const subIdx = (y % mt.h) * mt.w + (x % mt.w);
          nametable[y*32+x] = mt.tiles[subIdx] % 256;
        }
      }
    }
    render();
  }

  function fillEntireScreen(){
    if(!selectedMetatile) return;
    if(!confirm('Preencher a tela inteira? Isso sobrescreverá tudo.')) return;
    const mt = selectedMetatile;
    for(let y=0; y<30; y++){
      for(let x=0; x<32; x++){
        const subIdx = (y % mt.h) * mt.w + (x % mt.w);
        nametable[y*32+x] = mt.tiles[subIdx] % 256;
      }
    }
    applyAttrToAll();
  }

  function applyAttrToAll(){
    for(let i = 0; i < 64; i++){
      let byte = 0;
      for(let p = 0; p < 4; p++) byte |= (activePalette & 0x03) << (p * 2);
      attributes[i] = byte;
    }
    render();
  }

  function insertCharAtCursor(tileIdx){
    if(textCursor.x >= 32){ textCursor.x = 0; textCursor.y++; }
    if(textCursor.y >= 30) return;
    nametable[textCursor.y*32+textCursor.x] = tileIdx % 256;
    const attrX = Math.floor(textCursor.x/2), attrY = Math.floor(textCursor.y/2);
    const attrIdx = Math.floor(attrY/2)*8 + Math.floor(attrX/2);
    const shift = ((attrY%2)*2 + (attrX%2))*2;
    attributes[attrIdx] = (attributes[attrIdx] & ~(0x03 << shift)) | ((textPalette & 0x03) << shift);
    textCursor.x++; render();
  }

  function insertText(){
    const input = document.getElementById('splashTextInput'); if(!input) return;
    let text = input.value; if(!text) return;
    for(let i=0; i<text.length; i++){
      let ch = text[i]; let code = ch.charCodeAt(0);
      if(code > 127){ const map = {'Á':65,'É':69,'Í':73,'Ó':79,'Ú':85,'Ç':67,'á':97,'é':101,'í':105,'ó':111,'ú':117,'ç':99}; if(map[ch]) code = map[ch].charCodeAt(0); else code = 32; }
      insertCharAtCursor(code % 256);
    }
    textLayers.push({ text, x: textCursor.x - text.length, y: textCursor.y, pal: textPalette, id: Date.now() });
    selectedTextIdx = textLayers.length - 1;
    input.value = ''; updateTextLayersUI(); input.focus();
  }

  function updateTextLayersUI(){
    const container = document.getElementById('splashTextLayers'); if(!container) return;
    if(textLayers.length === 0){ container.innerHTML = '<div style="font-size:11px;color:#666;text-align:center">Nenhum texto</div>'; return; }
    container.innerHTML = '';
    textLayers.forEach((layer, i)=>{
      const div = document.createElement('div');
      const isSelected = i === selectedTextIdx;
      div.style.cssText = `display:flex;align-items:center;gap:4px;background:${isSelected?'#332a00':'#222'};border:1px solid ${isSelected?'#ffcc00':'#444'};border-radius:4px;padding:4px 6px;cursor:pointer`;
      div.onclick = () => { selectedTextIdx = i; textCursor.x = layer.x + layer.text.length; textCursor.y = layer.y; updateTextLayersUI(); render(); };

      const info = document.createElement('div'); info.style.cssText = 'flex:1;min-width:0';
      info.innerHTML = `<div style="color:${isSelected?'#ffcc00':'#fff'};font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">"${layer.text}"</div>`;
      div.appendChild(info); container.appendChild(div);
    });
  }

  function updateSplashSelect(){
    const sel = document.getElementById('splashSelect'); if(!sel) return; sel.innerHTML = '';
    const splashes = Project.data?.splashScreens || [];
    splashes.forEach((s, i) => { const o = document.createElement('option'); o.value = i; o.textContent = s.name || `Splash ${i + 1}`; sel.appendChild(o); });
    const oNew = document.createElement('option'); oNew.value = 'new'; oNew.textContent = '— Nova Splash —'; sel.appendChild(oNew);
    if(splashes.length > 0 && (currentSplashIndex < 0 || currentSplashIndex >= splashes.length)) currentSplashIndex = 0;
    sel.value = splashes.length > 0 ? currentSplashIndex : 'new';
    sel.onchange = e => { if(e.target.value === 'new') newSplash(); else loadSplash(parseInt(e.target.value)); };
  }

  function newSplash(){
    const name = prompt("Nome da Splash Screen:", `splash_${(Project.data?.splashScreens?.length||0)+1}`);
    if(!name) return;
    if(!Project.data.splashScreens) Project.data.splashScreens = [];
    Project.data.splashScreens.push({ 
      id:'splash_'+Date.now(), name, 
      nametable:new Array(960).fill(0), 
      attributes:new Array(64).fill(0), 
      textLayers:[], created:Date.now() 
    });
    currentSplashIndex = Project.data.splashScreens.length - 1; loadSplash(currentSplashIndex);
  }

  function saveAsNew(){
    const name = prompt("Salvar como:", `splash_${(Project.data?.splashScreens?.length||0)+1}_v2`);
    if(!name) return;
    if(!Project.data.splashScreens) Project.data.splashScreens = [];
    Project.data.splashScreens.push({ 
      id:'splash_'+Date.now(), name, 
      nametable:[...nametable], 
      attributes:[...attributes], 
      textLayers:[...textLayers], created:Date.now() 
    });
    currentSplashIndex = Project.data.splashScreens.length - 1; updateSplashSelect(); Project.status(`Salvo como ${name}`);
  }

  function clearSplash(){
    nametable = new Array(960).fill(0); 
    attributes = new Array(64).fill(0); 
    textLayers = []; selectedTextIdx = null; render();
  }

  function loadSplash(idx){
    const b = Project.data?.splashScreens?.[idx]; if(!b) return;
    nametable = b.nametable ? [...b.nametable] : new Array(960).fill(0);
    attributes = b.attributes ? [...b.attributes] : new Array(64).fill(0);
    textLayers = b.textLayers ? [...b.textLayers] : [];
    selectedTextIdx = null; currentSplashIndex = idx; updateSplashSelect(); updateTextLayersUI(); render();
  }

  function saveToProject(){
    if(!Project.data) return;
    if(!Project.data.splashScreens) Project.data.splashScreens = [];
    if(Project.data.splashScreens.length === 0){
      Project.data.splashScreens.push({ id:'splash_'+Date.now(), name:'splash_1', nametable:[...nametable], attributes:[...attributes], textLayers:[...textLayers], created:Date.now() });
      currentSplashIndex = 0;
    } else {
      const b = Project.data.splashScreens[currentSplashIndex];
      if(b){ b.nametable = [...nametable]; b.attributes = [...attributes]; b.textLayers = [...textLayers]; }
    }
    updateSplashSelect(); Project.status(`Splash Screen salva com sucesso.`);
  }

  function exportASM(){
    const splashName = Project.data?.splashScreens?.[currentSplashIndex]?.name || 'splash';
    let out = `; =========================================================\n`;
    out += `; SPLASH SCREEN NAMETABLE - ${splashName}\n`;
    out += `; =========================================================\n`;
    out += `${splashName}_nametable:\n`;
    for(let y=0; y<30; y++) out += `  .byte ` + nametable.slice(y*32, y*32+32).map(t => "$" + (t%256).toString(16).padStart(2,"0")).join(",") + `\n`;
    
    out += `\n; Attribute Table\n${splashName}_attributes:\n  .byte ` + attributes.map(a => "$" + a.toString(16).padStart(2,"0")).join(",") + "\n";

    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], {type:'text/plain'})); a.download = `${splashName}.asm`; a.click();
  }

  return {
    init: buildHTML, setTool, insertText, exportASM, fillAllEmpty, fillEntireScreen, applyAttrToAll,
    newSplash, saveAsNew, clearSplash, saveToProject, loadSplashScreens: (arr)=>{ if(Project.data) Project.data.splashScreens=arr; updateSplashSelect(); },
    getSplashScreens: ()=> Project.data?.splashScreens||[]
  };
})();

document.addEventListener('DOMContentLoaded', ()=>{ if(document.getElementById('mod-splash')?.classList.contains('active')) SPLASH.init(); });
