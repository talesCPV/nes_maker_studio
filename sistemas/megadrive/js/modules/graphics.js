/**
 * sistemas/megadrive/js/modules/graphics.js
 * V6 - METATILE EDITOR COMPLETO IGUAL NES:
 * - Seletor linhas/colunas, Redimensionar, Slot 1/4 Auto
 * - Seletor metatiles criados, Save/New/Rename/Delete
 * - Editor onde agrupa tiles do metatile para desenhar
 * - Ferramentas do metatile à direita
 * - Miniaturas dos metatiles criados abaixo
 * + FIX menu retrátil
 */
(function(){
  const BYTES_PER_TILE = 32;
  const TILES_COUNT = 512; // V17: 2 páginas completas de 256 tiles cada (total 512) - MD suporta até 1200, normaliza no backend descartando não usados
  const TILES_PER_ROW = 16;
  let chrData = new Uint8Array(TILES_COUNT * BYTES_PER_TILE); // 512*32 = 16384 bytes
  let selectedTile = 0;
  let selectedPalette = 0;
  let selectedColor = 1;
  let tool = 'pen';
  let isDrawing = false;
  let containerEl = null;
  let showGrid = true;
  let importOffset = 0;

  // METATILE SYSTEM IGUAL NES
  let metatileCols = 2;
  let metatileRows = 2;
  let metatileSlots = [0,1,2,3]; // tiles que formam metatile atual
  let selectedMetatileSlot = 0;
  let metatilesList = []; // [{id, name, cols, rows, tiles: []}]
  let selectedMetatileId = null;
  let autoAdvance = true;
  let currentPage = 0; // PAG 0 = Sprites (tiles 0-127), PAG 1 = Backgrounds (128-255) - padrão BES
  const TILES_PER_PAGE = 256; // V17: cada página completa 256 tiles
  let metatileLocked2x2 = false; // quando em PAG 1 (backgrounds), trava 2x2


  const DEFAULT_PAL_CSS = [
    ["#000000","#0000aa","#00aa00","#00aaaa","#aa0000","#aa00aa","#aa5500","#aaaaaa","#555555","#5555ff","#55ff55","#55ffff","#ff5555","#ff55ff","#ffff55","#ffffff"],
    ["#000000","#001a00","#2a5a2a","#5a8a5a","#8aaa8a","#caea8a","#ffffff","#ffaaaa","#aa0000","#ff5555","#ffaa55","#ffff55","#5555ff","#55ffff","#ff55ff","#ffffff"],
    ["#000000","#0000aa","#0000ff","#00aaff","#55aaff","#aaffff","#ffffff","#ffaa00","#ff0000","#ffff00","#00ff00","#00ffff","#ff00ff","#aaaaff","#ffaaaa","#ffffff"],
    ["#000000","#2a0a00","#5a1a00","#8a2a00","#aa4a00","#ea6a00","#fa8a00","#faca00","#ffffaa","#ffffff","#ff0000","#ffaaaa","#00aa00","#aaffaa","#0000ff","#aaaaff"]
  ];

  function getPaletteCss(idx){ if(window.AppState && window.AppState.palettes && window.AppState.palettes[idx]) return window.AppState.palettes[idx]; return DEFAULT_PAL_CSS[idx]||DEFAULT_PAL_CSS[0]; }
  function decodeTilePixels(tileIndex){
    const off=tileIndex*BYTES_PER_TILE; const tile=[];
    for(let y=0;y<8;y++){ const row=[]; for(let b=0;b<4;b++){ const byte=chrData[off+y*4+b]; row.push((byte>>4)&0x0F); row.push(byte&0x0F); } tile.push(row); }
    return tile;
  }
  function encodeTilePixels(tileIndex,pixels){
    const off=tileIndex*BYTES_PER_TILE; let idx=0;
    for(let y=0;y<8;y++) for(let x=0;x<8;x+=2) chrData[off+idx++]=((pixels[y][x]&0x0F)<<4)|(pixels[y][x+1]&0x0F);
  }
  function setPixel(tileIndex,x,y,color){
    const off=tileIndex*BYTES_PER_TILE + y*4 + Math.floor(x/2);
    const b=chrData[off];
    chrData[off]= x%2===0 ? (color<<4)|(b&0x0F) : (b&0xF0)|(color&0x0F);
    if(window.AppState) window.AppState.markDirty();
  }

  // ===== HELPER: METATILE COMO CANVAS ÚNICO cols*8 x rows*8 =====

  function getPageRange(){
    const start = currentPage * TILES_PER_PAGE;
    const end = Math.min(start + TILES_PER_PAGE, TILES_COUNT) - 1;
    return {start, end, count: end-start+1};
  }
  function isBackgroundPage(){ return currentPage===1; }

  function syncMetatilesToProject(){
    if(window.AppState && window.AppState.project){
      window.AppState.project.metatiles = metatilesList;
      if(chrData){
        // Salva como array (mais seguro que b64 com apply)
        window.AppState.project.tiles = Array.from(chrData);
        // Também salva b64 com chunk para compatibilidade
        try{
          let binary = '';
          const chunkSize = 8192;
          for(let i=0;i<chrData.length;i+=chunkSize){
            const chunk = chrData.subarray(i, i+chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
          }
          const b64 = btoa(binary);
          window.AppState.project.tiles_b64 = b64;
        }catch(e){ console.warn('b64 encode fail', e); }
      }
    }
    window.MDGraphics = window.MDGraphics||{};
    window.MDGraphics.metatiles = metatilesList;
    window.MDGraphics.data = chrData;
    window.MDGraphics.chrData = chrData;
  }

  function loadTilesFromBase64(b64){
    try{
      const binary = atob(b64);
      const arr = new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++) arr[i]=binary.charCodeAt(i);
      return arr;
    }catch(e){ console.warn('b64 decode fail', e); return null; }
  }

  function loadTilesFromProject(src){
    if(!src) return false;
    let loaded = false;
    // 1. Tenta tiles como Uint8Array
    if(src instanceof Uint8Array && src.length>0){
      chrData.set(src.slice(0, chrData.length));
      loaded=true;
      console.log('[MD Tiles] carregado de Uint8Array', src.length);
    }
    // 2. Tenta tiles como array de números
    else if(src.tiles && Array.isArray(src.tiles) && src.tiles.length>0){
      try{
        const arr = new Uint8Array(src.tiles);
        chrData.set(arr.slice(0, chrData.length));
        loaded=true;
        console.log('[MD Tiles] carregado de array', src.tiles.length);
      }catch(e){ console.warn('tiles array fail', e); }
    }
    // 3. Tenta tiles_b64
    else if(src.tiles_b64 && typeof src.tiles_b64==='string' && src.tiles_b64.length>0){
      const arr = loadTilesFromBase64(src.tiles_b64);
      if(arr){
        chrData.set(arr.slice(0, chrData.length));
        loaded=true;
        console.log('[MD Tiles] carregado de tiles_b64', arr.length);
      }
    }
    // 4. Tenta src.data (compat)
    else if(src.data && src.data.length>0){
      try{
        const arr = new Uint8Array(src.data);
        chrData.set(arr.slice(0, chrData.length));
        loaded=true;
      }catch{}
    }
    return loaded;
  }



  function getMetatilePixels(){
    const W = metatileCols*8;
    const H = metatileRows*8;
    const pixels = Array.from({length:H}, ()=> Array(W).fill(0));
    metatileSlots.forEach((tileIdx, mtSlot)=>{
      const col = mtSlot % metatileCols;
      const row = Math.floor(mtSlot / metatileCols);
      const tilePixels = decodeTilePixels(tileIdx);
      for(let y=0;y<8;y++){
        for(let x=0;x<8;x++){
          pixels[row*8 + y][col*8 + x] = tilePixels[y][x];
        }
      }
    });
    return pixels;
  }

  function setMetatilePixels(pixels){
    // pixels é [H][W] onde H=rows*8, W=cols*8
    // distribui de volta pros tiles
    metatileSlots.forEach((tileIdx, mtSlot)=>{
      const col = mtSlot % metatileCols;
      const row = Math.floor(mtSlot / metatileCols);
      const tilePixels = Array.from({length:8}, ()=> Array(8).fill(0));
      for(let y=0;y<8;y++){
        for(let x=0;x<8;x++){
          tilePixels[y][x] = pixels[row*8 + y][col*8 + x];
        }
      }
      encodeTilePixels(tileIdx, tilePixels);
    });
    if(window.AppState) window.AppState.markDirty();
  }

  function shiftMetatilePixels(dx, dy){
    // dx,dy podem ser +-1 - move pixel e se sair de um tile entra no tile ao lado, wrap no metatile inteiro
    const pixels = getMetatilePixels();
    const H = pixels.length;
    const W = pixels[0].length;
    const newPixels = Array.from({length:H}, ()=> Array(W).fill(0));
    for(let y=0;y<H;y++){
      for(let x=0;x<W;x++){
        let nx = (x + dx) % W;
        let ny = (y + dy) % H;
        if(nx<0) nx+=W;
        if(ny<0) ny+=H;
        newPixels[ny][nx] = pixels[y][x];
      }
    }
    setMetatilePixels(newPixels);
  }

  function importFromRom(buffer, offset){
    const bytes = new Uint8Array(buffer);
    let start = offset || 0;
    if(bytes.length % 512 === 512) start += 512;
    const slice = bytes.slice(start, start + TILES_COUNT*BYTES_PER_TILE);
    chrData.set(slice);
    if(slice.length < chrData.length) chrData.fill(0, slice.length);
    if(window.AppState) window.AppState.markDirty();
    render();
  }

  function createNewMetatile(){
    const nameInput = prompt('Nome do novo metatile:', `Metatile ${metatilesList.length+1}`);
    if(nameInput===null) return; // cancelou
    const finalName = nameInput.trim() || `Metatile ${metatilesList.length+1}`;
    const id = 'mt_'+Date.now();
    const cols = metatileCols;
    const rows = metatileRows;
    const tiles = Array(cols*rows).fill(0).map((_,i)=> metatileSlots[i]||0);
    const mt = { id, name: finalName, cols, rows, tiles };
    metatilesList.push(mt);
    selectedMetatileId = id;
    metatileSlots = [...tiles];
    metatileCols = cols;
    metatileRows = rows;
    selectedMetatileSlot = 0;
    if(window.AppState){
      window.AppState.project.metatiles = metatilesList;
      window.AppState.markDirty();
    }
    render();
  }

  function saveCurrentMetatile(){
    if(!selectedMetatileId){
      createNewMetatile();
      return;
    }
    const mt = metatilesList.find(m=>m.id===selectedMetatileId);
    if(mt){
      mt.cols = metatileCols;
      mt.rows = metatileRows;
      mt.tiles = [...metatileSlots];
      if(window.AppState){ window.AppState.project.metatiles = metatilesList; window.AppState.markDirty(); }
      render();
    }
  }

  function deleteMetatile(){
    if(!selectedMetatileId) return;
    if(!confirm('Deletar metatile?')) return;
    metatilesList = metatilesList.filter(m=>m.id!==selectedMetatileId);
    selectedMetatileId = metatilesList.length ? metatilesList[0].id : null;
    if(selectedMetatileId){
      const mt = metatilesList.find(m=>m.id===selectedMetatileId);
      metatileCols = mt.cols; metatileRows = mt.rows; metatileSlots = [...mt.tiles];
    } else {
      metatileSlots = [0,1,2,3]; metatileCols=2; metatileRows=2;
    }
    if(window.AppState){ window.AppState.project.metatiles = metatilesList; window.AppState.markDirty(); }
    render();
  }

  function renameMetatile(){
    if(!selectedMetatileId) return;
    const mt = metatilesList.find(m=>m.id===selectedMetatileId);
    if(!mt) return;
    const newName = prompt('Novo nome:', mt.name);
    if(newName){ mt.name = newName; if(window.AppState){ window.AppState.project.metatiles = metatilesList; window.AppState.markDirty(); } render(); }
  }

  function resizeMetatile(){
    // Se estiver em PAG 1 Backgrounds, trava 2x2
    if(isBackgroundPage()){
      metatileCols=2; metatileRows=2;
      if(window.AppState) window.AppState.markDirty();
      render();
      alert('Em PAG 1 Backgrounds, metatile travado em 2x2 (padrão BES) para facilitar montagem e compressão. Mude para PAG 0 Sprites para tamanhos livres.');
      return;
    }
    const newCols = parseInt(document.getElementById('md-mt-cols')?.value||'2');
    const newRows = parseInt(document.getElementById('md-mt-rows')?.value||'2');
    const newSize = newCols*newRows;
    const oldTiles = [...metatileSlots];
    const newTiles = Array(newSize).fill(0);
    for(let i=0;i<Math.min(oldTiles.length, newSize);i++) newTiles[i]=oldTiles[i];
    // se aumentou, preenche novos slots com tile selecionado atual para facilitar
    for(let i=oldTiles.length;i<newSize;i++) newTiles[i]=selectedTile;
    metatileCols = newCols;
    metatileRows = newRows;
    metatileSlots = newTiles;
    selectedMetatileSlot = Math.min(selectedMetatileSlot, newSize-1);
    if(selectedMetatileSlot<0) selectedMetatileSlot=0;
    if(selectedMetatileId){
      const mt = metatilesList.find(m=>m.id===selectedMetatileId);
      if(mt){ mt.cols=newCols; mt.rows=newRows; mt.tiles=[...newTiles]; }
    }
    console.log(`[MT Resize] ${newCols}x${newRows} = ${newSize} slots`, metatileSlots);
    syncMetatilesToProject(); if(window.AppState){ window.AppState.markDirty(); }
    render();
  }

  function render(){
    if(!containerEl) containerEl=document.getElementById('panel-graphics')||document.getElementById('editor-content');
    if(!containerEl) return;
    // V19 FIX: Se metatilesList vazio mas AppState.project.metatiles existe, carrega
    if(metatilesList.length===0){
      let loaded = null;
      if(window.AppState && window.AppState.project && window.AppState.project.metatiles && window.AppState.project.metatiles.length>0){
        loaded = window.AppState.project.metatiles;
        console.log('[MD Graphics] Carregando metatiles do AppState.project', loaded.length);
      } else if(window.MDGraphics && window.MDGraphics.metatiles && window.MDGraphics.metatiles.length>0){
        loaded = window.MDGraphics.metatiles;
      }
      if(loaded && loaded.length>0){
        metatilesList = loaded;
        if(!selectedMetatileId && metatilesList.length>0){
          const mt = metatilesList[0];
          selectedMetatileId = mt.id;
          metatileCols = mt.cols;
          metatileRows = mt.rows;
          metatileSlots = [...mt.tiles];
        }
        window.MDGraphics = window.MDGraphics||{};
        window.MDGraphics.metatiles = metatilesList;
      }
    }
    // V19 FIX: Se chrData está todo zerado mas projeto tem tiles, carrega agora - corrige grid em branco no refresh
    let allZero = true;
    for(let i=0;i<Math.min(chrData.length, 1024); i++){ if(chrData[i]!==0){ allZero=false; break; } }
    if(allZero){
      let src = null;
      if(window.AppState && window.AppState.project) src = window.AppState.project;
      if(src){
        const ok = loadTilesFromProject(src);
        if(ok) console.log('[MD Graphics render] chrData carregado no render (estava zerado)');
      }
    }
    const pageRange = getPageRange();
    const tilesToShow = pageRange.count;
    const isBgPage = isBackgroundPage();
    const pal=getPaletteCss(selectedPalette);

    containerEl.innerHTML = `
      <div class="chr-editor-nes-clone">
        <div class="chr-tools-top">
          <div class="chr-tools-left">
            <button class="chr-tbtn" id="md-import-rom">📁 ROM</button>
            <button class="chr-tbtn" id="md-import-bin">📥 BIN</button>
            <button class="chr-tbtn" id="md-export-bin">📤 Export</button>
            <span class="chr-sep"></span>
            <span class="chr-tools-label">TOOLS</span>
            <button class="chr-tbtn tool ${tool==='pen'?'active':''}" data-tool="pen">✏️</button>
            <button class="chr-tbtn tool" data-tool="picker">💉</button>
            <button class="chr-tbtn tool" data-tool="fill">🪣</button>
            <button class="chr-tbtn" data-action="rect">⬜</button>
            <button class="chr-tbtn" data-action="circle">⭕</button>
            <button class="chr-tbtn" data-action="copy">📋</button>
            <button class="chr-tbtn" data-action="paste">📌</button>
            <span class="chr-fila">Fila: 0</span>
          </div>
          <div class="chr-tools-right">
            <label style="font-size:10px;color:#888;">Offset: <input id="md-offset-input" value="${importOffset.toString(16)}" style="width:60px;background:#111;border:1px solid #444;color:#e8c36a;padding:2px 4px;font-family:monospace;font-size:11px;"></label>
          </div>
        </div>

        <div class="chr-topbar">
          <div class="chr-topbar-left">
            <select id="md-page-select" class="chr-select" style="min-width:180px;">
              <option value="0" ${currentPage===0?'selected':''}>PAG 0: Sprites (tiles $00-$FF = 0-255) - 256 tiles completos</option>
              <option value="1" ${currentPage===1?'selected':''}>PAG 1: Backgrounds (tiles $100-$1FF = 256-511) - 256 tiles completos - Metatile travado 2x2</option>
            </select>
            <button class="chr-btn pag" id="md-pag-prev">◀ PAG</button>
            <button class="chr-btn pag" id="md-pag-next">PAG ▶</button>
            <span class="chr-label">Tiles ${pageRange.start.toString(16).toUpperCase().padStart(2,'0')}-${pageRange.end.toString(16).toUpperCase().padStart(2,'0')} | ${tilesToShow} tiles</span>
            ${isBgPage ? '<span class="chr-label" style="background:#00ff88;color:#000;">🔒 Metatile 2x2 travado (BG)</span>' : ''}
          </div>
          <div class="chr-topbar-right">
            <label class="chr-check"><input type="checkbox" id="md-show-grid" ${showGrid?'checked':''}> grid</label>
          </div>
        </div>

        <div class="chr-main-v5">
          <div class="chr-grid-wrap-v5">
            <div class="chr-grid" id="md-chr-grid"></div>
          </div>

          <div class="chr-preview-panel-v5">
            <!-- EDIÇÃO METATILE - COPIADO EXATO NES -->
            <div class="chr-metatile-edit-header">EDIÇÃO METATILE</div>
            <div class="chr-metatile-controls">
              <div class="chr-metatile-row">
                <label>METATILE ${isBackgroundPage() ? '🔒 2x2 BG' : ''}</label>
                <select id="md-mt-cols" class="chr-select small" ${isBackgroundPage() ? 'disabled' : ''}>
                  ${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===metatileCols?'selected':''}>${n} col${isBackgroundPage() && n!==2 ? ' (bloqueado em BG)' : ''}</option>`).join('')}
                </select>
                <select id="md-mt-rows" class="chr-select small" ${isBackgroundPage() ? 'disabled' : ''}>
                  ${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${n===metatileRows?'selected':''}>${n} lin${isBackgroundPage() && n!==2 ? ' (bloqueado)' : ''}</option>`).join('')}
                </select>
                <button class="chr-btn small blue" id="md-mt-resize" ${isBackgroundPage() ? 'disabled title="Travado 2x2 em PAG 1 Backgrounds"' : ''}>Redimensionar</button>
                <span class="chr-slot-info">Slot ${selectedMetatileSlot+1}/${metatileSlots.length}</span>
                <label class="chr-check"><input type="checkbox" id="md-mt-auto" ${autoAdvance?'checked':''}> Auto</label>
              </div>
              <div class="chr-metatile-row">
                <select id="md-mt-list" class="chr-select" style="max-width:150px" style="flex:1; max-width:150px">
                  <option value="">— Metatiles —</option>
                  ${metatilesList.map(mt=>`<option value="${mt.id}" ${mt.id===selectedMetatileId?'selected':''}>${mt.name} (${mt.cols}x${mt.rows})</option>`).join('')}
                </select>
                <button class="chr-btn small green" id="md-mt-save">💾 Save</button>
                <button class="chr-btn small green" id="md-mt-new">✨ New</button>
                <button class="chr-btn small yellow" id="md-mt-rename">✏️ Rename</button>
                <button class="chr-btn small red" id="md-mt-delete">🗑️</button>
              </div>
            </div>

            <div class="chr-metatile-editor-area">
              <div class="chr-metatile-zoom">
                <div class="chr-metatile-zoom-title">ZOOM / EDIÇÃO - Agrupe tiles do metatile para desenhar</div>
                <canvas id="md-metatile-canvas" class="chr-metatile-canvas"></canvas>
                <div class="chr-metatile-grid-overlay" id="md-mt-grid-overlay"></div>
              </div>

              <div class="chr-metatile-side">
                <div class="chr-preview-title">PREVIEW 1:1 + PALETA RÁPIDA</div>
                <canvas id="md-preview-canvas" width="128" height="128" class="chr-preview-canvas"></canvas>
                <div class="chr-palette-fast">
                  <div class="chr-palette-row">
                    ${[0,1,2,3].map(i=>`<button class="chr-palette-swatch ${selectedColor===i?'active':''}" style="background:${pal[i]}" data-color="${i}">${i}</button>`).join('')}
                  </div>
                  <div class="chr-palette-row">
                    ${[4,5,6,7].map(i=>`<button class="chr-palette-swatch ${selectedColor===i?'active':''}" style="background:${pal[i]}" data-color="${i}">${i}</button>`).join('')}
                  </div>
                  <div class="chr-help">Esq desenha - dir pega cor - 0-7</div>
                                    <div class="chr-tools-grid">
                    <button class="chr-tool-btn" data-action="left" title="Shift esq no metatile inteiro (cross-tile)">←</button>
                    <button class="chr-tool-btn" data-action="up" title="Shift cima no metatile inteiro">↑</button>
                    <button class="chr-tool-btn" data-action="down" title="Shift baixo no metatile inteiro">↓</button>
                    <button class="chr-tool-btn" data-action="right" title="Shift dir no metatile inteiro">→</button>
                    <button class="chr-tool-btn" data-action="flipH" title="Flip H metatile inteiro (espelha posições + tiles)">↔️</button>
                    <button class="chr-tool-btn" data-action="flipV" title="Flip V metatile inteiro">↕️</button>
                    <button class="chr-tool-btn" data-action="rotate" title="Rotate metatile inteiro">🔄</button>
                    <button class="chr-tool-btn" data-action="clearAll" title="Limpar todos os tiles deste metatile">🗑️</button>
                  </div>
                </div>

                <div class="chr-metatile-selector-inside">
                  <div class="chr-metatile-title">SELETOR BASE — tiles do metatile (slot ativo amarelo)</div>
                  <div class="chr-metatile-grid" id="md-metatile-grid"></div>
                </div>
              </div>
            </div>

            <!-- MINIATURAS DOS METATILES CRIADOS - ABAIXO -->
            <div class="chr-metatiles-thumbs">
              <div class="chr-metatiles-thumbs-title">MINIATURAS - Metatiles criados (mesmo do seletor)</div>
              <div class="chr-metatiles-thumbs-grid" id="md-metatiles-thumbs"></div>
            </div>
          </div>
        </div>

        <div class="chr-status-blue">
          <span>PT0 - L0 Slot ${selectedMetatileSlot+1} - Tile $${selectedTile.toString(16).toUpperCase().padStart(2,'0')} - Metatile ${selectedMetatileId||'—'} ${metatileCols}x${metatileRows} - Tool ${tool} | Offset $${importOffset.toString(16).toUpperCase()}</span>
          <span style="margin-left:auto;">${TILES_COUNT} tiles | MD 32b/tile</span>
        </div>

        <div class="chr-palettes-bar">
          <div class="chr-palettes-title">▼ Paletas (4x16 - CRAM 9-bit)</div>
          <div class="chr-palettes-content" id="md-palettes-full"></div>
        </div>
      </div>
      <input type="file" id="md-file-rom" accept=".bin,.md,.gen,.smd,.mdg" style="display:none">
      <input type="file" id="md-file-bin" accept=".bin,.pat,.chr" style="display:none">
    `;

    // GRID TILES - PAGINADO 0=SPRITES / 1=BACKGROUNDS (igual BES)
    const gridEl = containerEl.querySelector('#md-chr-grid');
    gridEl.innerHTML=''; 
    // pageRange já definido no topo do render (V15 fix)
    const colsForPage = 16; // mantém 16 por linha
    gridEl.style.gridTemplateColumns = `repeat(${colsForPage}, 28px)`;
    for(let i=pageRange.start;i<=pageRange.end;i++){
      const cell=document.createElement('div');
      cell.className='chr-tile-cell'+(i===selectedTile?' selected-yellow':'')+(metatileSlots.includes(i)?' in-metatile':'');
      if(showGrid) cell.classList.add('with-grid');
      const c=document.createElement('canvas'); c.width=24; c.height=24; c.className='chr-tile-canvas';
      const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
      const off=i*BYTES_PER_TILE; const scale=3;
      for(let y=0;y<8;y++) for(let xb=0;xb<4;xb++){
        const b=chrData[off+y*4+xb]; const l=(b>>4)&0x0F, r=b&0x0F;
        ctx.fillStyle=pal[l]||'#000'; ctx.fillRect(xb*2*scale,y*scale,scale,scale);
        ctx.fillStyle=pal[r]||'#000'; ctx.fillRect((xb*2+1)*scale,y*scale,scale,scale);
      }
      cell.appendChild(c);
      cell.onclick=()=>{ 
        selectedTile=i; 
        // coloca tile no slot ativo do metatile
        if(metatileSlots.length>0){
          metatileSlots[selectedMetatileSlot]=i; 
          if(autoAdvance){
            selectedMetatileSlot=(selectedMetatileSlot+1)%metatileSlots.length;
          }
          if(window.AppState) window.AppState.markDirty();
        }
        render(); 
      };
      cell.oncontextmenu=(e)=>{ e.preventDefault(); selectedTile=i; render(); return false; };
      gridEl.appendChild(cell);
    }

    // PREVIEW 1:1 - AGORA É PREVIEW DO METATILE COMPLETO (MENOR) - IGUAL NES
    const previewCanvas=containerEl.querySelector('#md-preview-canvas');
    if(previewCanvas){
      const ctx=previewCanvas.getContext('2d'); 
      ctx.imageSmoothingEnabled=false; 
      ctx.clearRect(0,0,previewCanvas.width, previewCanvas.height);
      // Desenha metatile completo como preview pequeno
      const cols = metatileCols;
      const rows = metatileRows;
      const scalePreview = Math.min(128 / (cols*8), 128 / (rows*8)); // escala para caber em 128x128
      const offsetX = (128 - cols*8*scalePreview)/2;
      const offsetY = (128 - rows*8*scalePreview)/2;
      
      metatileSlots.forEach((tileIdx, mtSlot)=>{
        const col = mtSlot % cols;
        const row = Math.floor(mtSlot / cols);
        const px = offsetX + col * 8 * scalePreview;
        const py = offsetY + row * 8 * scalePreview;
        const off = tileIdx*BYTES_PER_TILE;
        for(let y=0;y<8;y++) for(let xb=0;xb<4;xb++){
          const b=chrData[off+y*4+xb]; const l=(b>>4)&0x0F, r=b&0x0F;
          ctx.fillStyle=pal[l]||'#000'; ctx.fillRect(px+xb*2*scalePreview, py+y*scalePreview, scalePreview, scalePreview);
          ctx.fillStyle=pal[r]||'#000'; ctx.fillRect(px+(xb*2+1)*scalePreview, py+y*scalePreview, scalePreview, scalePreview);
        }
      });
      // borda
      ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=1;
      ctx.strokeRect(offsetX, offsetY, cols*8*scalePreview, rows*8*scalePreview);
      
      previewCanvas.title='Preview 1:1 do metatile completo - só preview, edição é no ZOOM/EDIÇÃO';
      previewCanvas.oncontextmenu=(e)=>e.preventDefault();
      // Preview não edita, só mostra
    }

    // METATILE CANVAS - ZOOM / EDIÇÃO - EDITA DESENHO PINTANDO TILES LADO A LADO JÁ MONTADO (IGUAL NES)
    const mtCanvas = containerEl.querySelector('#md-metatile-canvas');
    if(mtCanvas){
      const cols = metatileCols;
      const rows = metatileRows;
      const scale = 16; // cada pixel 16px
      mtCanvas.width = cols * 8 * scale;
      mtCanvas.height = rows * 8 * scale;
      mtCanvas.style.width = mtCanvas.width+'px';
      mtCanvas.style.height = mtCanvas.height+'px';
      const ctx = mtCanvas.getContext('2d');
      ctx.imageSmoothingEnabled=false;
      ctx.clearRect(0,0,mtCanvas.width, mtCanvas.height);
      
      // Desenha metatile montado - cada slot é um tile 8x8
      metatileSlots.forEach((tileIdx, mtSlot)=>{
        const col = mtSlot % cols;
        const row = Math.floor(mtSlot / cols);
        const px = col * 8 * scale;
        const py = row * 8 * scale;
        const off = tileIdx*BYTES_PER_TILE;
        for(let y=0;y<8;y++) for(let xb=0;xb<4;xb++){
          const b=chrData[off+y*4+xb]; const l=(b>>4)&0x0F, r=b&0x0F;
          ctx.fillStyle=pal[l]||'#000'; ctx.fillRect(px+xb*2*scale, py+y*scale, scale, scale);
          ctx.fillStyle=pal[r]||'#000'; ctx.fillRect(px+(xb*2+1)*scale, py+y*scale, scale, scale);
        }
        // borda slot selecionado (para saber qual tile do metatile vai trocar no grid)
        if(mtSlot===selectedMetatileSlot){
          ctx.strokeStyle='#ffff00'; ctx.lineWidth=3; ctx.strokeRect(px, py, 8*scale, 8*scale);
          ctx.fillStyle='rgba(255,255,0,0.12)'; ctx.fillRect(px, py, 8*scale, 8*scale);
        }
        // numero do slot
        ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(px, py, 14, 12);
        ctx.fillStyle='#fff'; ctx.font='bold 10px monospace'; ctx.fillText((mtSlot+1).toString(), px+2, py+10);
      });
      
      // Grid do metatile + grid de pixels
      if(showGrid){
        // linhas grossas do metatile
        ctx.strokeStyle='rgba(0,255,136,0.6)'; ctx.lineWidth=2;
        for(let c=1;c<cols;c++){ ctx.beginPath(); ctx.moveTo(c*8*scale,0); ctx.lineTo(c*8*scale, mtCanvas.height); ctx.stroke(); }
        for(let r=1;r<rows;r++){ ctx.beginPath(); ctx.moveTo(0, r*8*scale); ctx.lineTo(mtCanvas.width, r*8*scale); ctx.stroke(); }
        // linhas finas dos pixels
        ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.lineWidth=0.5;
        for(let x=1;x<cols*8;x++){ ctx.beginPath(); ctx.moveTo(x*scale,0); ctx.lineTo(x*scale, mtCanvas.height); ctx.stroke(); }
        for(let y=1;y<rows*8;y++){ ctx.beginPath(); ctx.moveTo(0, y*scale); ctx.lineTo(mtCanvas.width, y*scale); ctx.stroke(); }
      }

      // ===== EDITOR DE DESENHO - PINTA OS TILES LADO A LADO JÁ MONTADO =====
      // Mesma dinâmica do NES: pinta direto no metatile montado
      function paintOnMetatile(mx, my, color){
        // mx,my em pixels do canvas (0..width), converte para coordenada do metatile
        const x = Math.floor(mx / scale); // 0..cols*8-1
        const y = Math.floor(my / scale); // 0..rows*8-1
        const col = Math.floor(x / 8);
        const row = Math.floor(y / 8);
        const slot = row*cols + col;
        if(slot<0 || slot>=metatileSlots.length) return;
        const tileIdx = metatileSlots[slot];
        const pxInTile = x % 8;
        const pyInTile = y % 8;
        setPixel(tileIdx, pxInTile, pyInTile, color);
        // atualiza AppState
        if(window.AppState) window.AppState.markDirty();
      }

      function getTileSlotAt(mx, my){
        const x = Math.floor(mx / scale);
        const y = Math.floor(my / scale);
        const col = Math.floor(x / 8);
        const row = Math.floor(y / 8);
        return row*cols + col;
      }

      mtCanvas.onmousedown=(e)=>{
        const rect=mtCanvas.getBoundingClientRect();
        const scaleX = mtCanvas.width / rect.width;
        const scaleY = mtCanvas.height / rect.height;
        const mx = (e.clientX-rect.left)*scaleX;
        const my = (e.clientY-rect.top)*scaleY;
        
        if(e.button===2){
          // Direito: eyedropper - pega cor do pixel onde clicou
          const x = Math.floor(mx / scale);
          const y = Math.floor(my / scale);
          const col = Math.floor(x / 8);
          const row = Math.floor(y / 8);
          const slot = row*cols + col;
          if(slot>=0 && slot<metatileSlots.length){
            const tileIdx = metatileSlots[slot];
            const pxInTile = x % 8;
            const pyInTile = y % 8;
            const pixels = decodeTilePixels(tileIdx);
            selectedColor = pixels[pyInTile][pxInTile];
            selectedMetatileSlot = slot;
            selectedTile = tileIdx;
            render();
          }
        } else {
          // Esquerdo: pinta
          if(tool==='picker'){
            const x = Math.floor(mx / scale);
            const y = Math.floor(my / scale);
            const col = Math.floor(x / 8);
            const row = Math.floor(y / 8);
            const slot = row*cols + col;
            if(slot>=0 && slot<metatileSlots.length){
              const tileIdx = metatileSlots[slot];
              const pxInTile = x % 8;
              const pyInTile = y % 8;
              const pixels = decodeTilePixels(tileIdx);
              selectedColor = pixels[pyInTile][pxInTile];
              selectedMetatileSlot = slot;
              selectedTile = tileIdx;
              render();
            }
          } else {
            isDrawing=true;
            paintOnMetatile(mx, my, selectedColor);
            // seleciona slot também
            const slot = getTileSlotAt(mx, my);
            if(slot>=0 && slot<metatileSlots.length){
              selectedMetatileSlot = slot;
              selectedTile = metatileSlots[slot];
            }
            // render rápido sem full rebuild para performance de pintura
            const col = Math.floor((Math.floor(mx/scale))/8);
            const row = Math.floor((Math.floor(my/scale))/8);
            // para feedback imediato, redesenha só pixel
            const x = Math.floor(mx / scale);
            const y = Math.floor(my / scale);
            const px = (col*8 + (x%8))*scale;
            const py = (row*8 + (y%8))*scale;
            ctx.fillStyle=pal[selectedColor]||'#000';
            ctx.fillRect(px, py, scale, scale);
          }
        }
      };

      mtCanvas.onmousemove=(e)=>{
        if(!isDrawing) return;
        const rect=mtCanvas.getBoundingClientRect();
        const scaleX = mtCanvas.width / rect.width;
        const scaleY = mtCanvas.height / rect.height;
        const mx = (e.clientX-rect.left)*scaleX;
        const my = (e.clientY-rect.top)*scaleY;
        paintOnMetatile(mx, my, selectedColor);
        // feedback visual rápido
        const x = Math.floor(mx / scale);
        const y = Math.floor(my / scale);
        const col = Math.floor(x / 8);
        const row = Math.floor(y / 8);
        const px = (col*8 + (x%8))*scale;
        const py = (row*8 + (y%8))*scale;
        ctx.fillStyle=pal[selectedColor]||'#000';
        ctx.fillRect(px, py, scale, scale);
      };

      mtCanvas.onmouseup=(e)=>{
        if(isDrawing){
          isDrawing=false;
          render(); // full render para atualizar preview 1:1 e grid
        }
      };
      mtCanvas.onmouseleave=()=>{ if(isDrawing){ isDrawing=false; render(); } };
      mtCanvas.oncontextmenu=(e)=>{ e.preventDefault(); return false; };
      mtCanvas.title='ZOOM / EDIÇÃO - Pinte os tiles lado a lado já montado. Esq desenha, dir pega cor. Clique no tile para selecionar slot no seletor base.';
    }

    // PALETA RÁPIDA
    containerEl.querySelectorAll('.chr-palette-swatch[data-color]').forEach(btn=>{
      btn.onclick=()=>{ selectedColor=parseInt(btn.dataset.color); render(); };
    });

    // TOOLS - AGORA ATUAM NO METATILE INTEIRO (NÃO SÓ TILE INDIVIDUAL) - FIX #4
    containerEl.querySelectorAll('.chr-tool-btn[data-action], .chr-tbtn[data-action]').forEach(btn=>{
      btn.onclick=()=>{
        const act=btn.dataset.action;
        // Se metatile tem mais de 1 tile, aplica em todos os tiles do metatile
        const targets = metatileSlots.length>1 ? [...metatileSlots] : [selectedTile];
        let anyChanged=false;

        function applyToTile(tileIdx, operation){
          const p=decodeTilePixels(tileIdx); let out=p.map(r=>[...r]);
          let result = operation(p,out);
          if(result){ encodeTilePixels(tileIdx, result); anyChanged=true; }
        }

        if(act==='left'){
          // FIX: move pixel no metatile inteiro, cruzando tiles - pixel sai de um tile entra no ao lado
          if(metatileSlots.length>1){
            shiftMetatilePixels(-1,0);
          } else {
            targets.forEach(t=> applyToTile(t, (p,out)=>{ return out.map(r=>{ const a=[...r]; a.push(a.shift()); return a; }); }));
          }
        } else if(act==='right'){
          if(metatileSlots.length>1){
            shiftMetatilePixels(1,0);
          } else {
            targets.forEach(t=> applyToTile(t, (p,out)=>{ return out.map(r=>{ const a=[...r]; a.unshift(a.pop()); return a; }); }));
          }
        } else if(act==='up'){
          if(metatileSlots.length>1){
            shiftMetatilePixels(0,-1);
          } else {
            targets.forEach(t=> applyToTile(t, (p,out)=>{ out.push(out.shift()); return out; }));
          }
        } else if(act==='down'){
          if(metatileSlots.length>1){
            shiftMetatilePixels(0,1);
          } else {
            targets.forEach(t=> applyToTile(t, (p,out)=>{ out.unshift(out.pop()); return out; }));
          }
        } else if(act==='flipH'){
          // flipH no metatile inteiro: espelha posições + flip em cada tile
          // 1. flip pixels de cada tile
          targets.forEach(t=> applyToTile(t, (p)=> p.map(r=>[...r].reverse())));
          // 2. espelha posições dos tiles no metatile
          const cols=metatileCols;
          const newSlots=[];
          for(let r=0;r<metatileRows;r++){
            for(let c=0;c<cols;c++){
              const srcIdx = r*cols + (cols-1-c);
              newSlots[r*cols+c]=metatileSlots[srcIdx];
            }
          }
          metatileSlots=newSlots;
          anyChanged=true;
        } else if(act==='flipV'){
          targets.forEach(t=> applyToTile(t, (p)=> [...p].reverse()));
          const cols=metatileCols;
          const newSlots=[];
          for(let r=0;r<metatileRows;r++){
            for(let c=0;c<cols;c++){
              const srcIdx = (metatileRows-1-r)*cols + c;
              newSlots[r*cols+c]=metatileSlots[srcIdx];
            }
          }
          metatileSlots=newSlots;
          anyChanged=true;
        } else if(act==='rotate'){
          targets.forEach(t=> applyToTile(t, (p)=>{
            const out=Array.from({length:8},()=>Array(8).fill(0));
            for(let y=0;y<8;y++) for(let x=0;x<8;x++) out[x][7-y]=p[y][x];
            return out;
          }));
          // rotate posições 90deg se for quadrado
          if(metatileCols===metatileRows){
            const cols=metatileCols;
            const newSlots=[];
            for(let r=0;r<metatileRows;r++){
              for(let c=0;c<cols;c++){
                // 90deg clockwise: new[c][cols-1-r] = old[r][c]
                newSlots[c*cols+(cols-1-r)]=metatileSlots[r*cols+c];
              }
            }
            metatileSlots=newSlots;
          }
          anyChanged=true;
        } else if(act==='clear'){
          targets.forEach(t=> applyToTile(t, ()=> Array.from({length:8},()=>Array(8).fill(0))));
        } else if(act==='copy'){
          clipboard=decodeTilePixels(selectedTile).map(r=>[...r]); return;
        } else if(act==='paste'){
          if(!clipboard) return;
          targets.forEach(t=> encodeTilePixels(t, clipboard.map(r=>[...r])));
          anyChanged=true;
        } else if(act==='fillAll'){
          targets.forEach(t=> applyToTile(t, ()=> Array.from({length:8},()=>Array(8).fill(selectedColor))));
        } else if(act==='rect'){
          targets.forEach(t=> applyToTile(t, (p,out)=> out.map((r,y)=> r.map((c,x)=> (x===0||x===7||y===0||y===7)?selectedColor:c))));
        } else if(act==='circle'){
          targets.forEach(t=> applyToTile(t, (p,out)=> out.map((r,y)=> r.map((c,x)=>{ const dx=x-3.5, dy=y-3.5; return Math.sqrt(dx*dx+dy*dy)<3.5?selectedColor:c; }))));
        } else if(act==='clearAll'){
          // V13 FIX: Clear all - limpa todos os tiles do metatile
          if(confirm('Deseja apagar todos os tiles deste metatile?')){
            metatileSlots.forEach(tileIdx=>{
              const empty = Array.from({length:8},()=>Array(8).fill(0));
              encodeTilePixels(tileIdx, empty);
            });
            anyChanged=true;
            if(window.AppState) window.AppState.markDirty();
          }
        }

        if(anyChanged && window.AppState) window.AppState.markDirty();
        render();
      };
    });
    containerEl.querySelectorAll('.chr-tbtn.tool, .chr-tool-btn[data-tool]').forEach(btn=>{
      btn.onclick=()=>{ tool=btn.dataset.tool; containerEl.querySelectorAll('.chr-tbtn.tool, .chr-tool-btn[data-tool]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); };
    });

    // METATILE TOOLS - ATUAM NO METATILE INTEIRO ESPELHANDO POSIÇÕES + TILES - FIX #5
    containerEl.querySelectorAll('.chr-mt-tool[data-mt-action]').forEach(btn=>{
      btn.onclick=()=>{
        const act=btn.dataset.mtAction;
        function flipTileH(tileIdx){
          const p=decodeTilePixels(tileIdx);
          const out=p.map(r=>[...r].reverse());
          encodeTilePixels(tileIdx, out);
        }
        function flipTileV(tileIdx){
          const p=decodeTilePixels(tileIdx);
          const out=[...p].reverse();
          encodeTilePixels(tileIdx, out);
        }
        function rotateTile(tileIdx){
          const p=decodeTilePixels(tileIdx);
          const out=Array.from({length:8},()=>Array(8).fill(0));
          for(let y=0;y<8;y++) for(let x=0;x<8;x++) out[x][7-y]=p[y][x];
          encodeTilePixels(tileIdx, out);
        }

        if(act==='clear'){ 
          metatileSlots=Array(metatileCols*metatileRows).fill(0); 
        } else if(act==='hflip'){ 
          // 1. flip cada tile H
          metatileSlots.forEach(t=> flipTileH(t));
          // 2. espelha posições H
          const cols=metatileCols; const newSlots=[]; 
          for(let r=0;r<metatileRows;r++) for(let c=0;c<cols;c++) newSlots[r*cols+c]=metatileSlots[r*cols+(cols-1-c)]; 
          metatileSlots=newSlots; 
        } else if(act==='vflip'){ 
          metatileSlots.forEach(t=> flipTileV(t));
          const cols=metatileCols; const newSlots=[]; 
          for(let r=0;r<metatileRows;r++) for(let c=0;c<cols;c++) newSlots[r*cols+c]=metatileSlots[(metatileRows-1-r)*cols+c]; 
          metatileSlots=newSlots; 
        } else if(act==='rotate'){ 
          const cols=metatileCols; const rows=metatileRows; 
          metatileSlots.forEach(t=> rotateTile(t));
          if(cols===rows){ 
            const newSlots=[]; 
            for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) newSlots[c*cols+(cols-1-r)]=metatileSlots[r*cols+c]; 
            metatileSlots=newSlots; 
          } 
        } else if(act==='copy'){
          clipboard={ metatile: [...metatileSlots], cols: metatileCols, rows: metatileRows };
          return;
        }
        syncMetatilesToProject(); if(window.AppState){ window.AppState.markDirty(); }
        render();
      };
    });

    // METATILE SELECTOR
    const metaGrid=containerEl.querySelector('#md-metatile-grid');
    metaGrid.innerHTML='';
    for(let i=0;i<metatileSlots.length;i++){
      const slot=document.createElement('div'); slot.className='chr-metatile-slot'+(i===selectedMetatileSlot?' active':'');
      const tileIdx=metatileSlots[i]||0;
      const c=document.createElement('canvas'); c.width=48; c.height=48;
      const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
      const off=tileIdx*BYTES_PER_TILE;
      for(let y=0;y<8;y++) for(let xb=0;xb<4;xb++){ const b=chrData[off+y*4+xb]; const l=(b>>4)&0x0F, r=b&0x0F; ctx.fillStyle=pal[l]||'#000'; ctx.fillRect(xb*2*6,y*6,6,6); ctx.fillStyle=pal[r]||'#000'; ctx.fillRect((xb*2+1)*6,y*6,6,6); }
      slot.appendChild(c);
      const label=document.createElement('div'); label.className='chr-metatile-label'; label.textContent=i+1; slot.appendChild(label);
      const tileLabel=document.createElement('div'); tileLabel.style.cssText='font-size:9px;color:#888;margin-top:2px'; tileLabel.textContent='$'+tileIdx.toString(16).toUpperCase().padStart(2,'0'); slot.appendChild(tileLabel);
      slot.onclick=()=>{ selectedMetatileSlot=i; selectedTile=metatileSlots[i]; render(); };
      metaGrid.appendChild(slot);
    }

    // MINIATURAS METATILES CRIADOS
    const thumbsGrid=containerEl.querySelector('#md-metatiles-thumbs');
    thumbsGrid.innerHTML='';
    metatilesList.forEach(mt=>{
      const thumb=document.createElement('div'); thumb.className='chr-metatile-thumb'+(mt.id===selectedMetatileId?' active':'');
      const c=document.createElement('canvas'); 
      c.width=mt.cols*16; c.height=mt.rows*16;
      c.style.width=(mt.cols*16)+'px'; c.style.height=(mt.rows*16)+'px';
      const ctx=c.getContext('2d'); ctx.imageSmoothingEnabled=false;
      mt.tiles.forEach((tileIdx, idx)=>{
        const col=idx%mt.cols; const row=Math.floor(idx/mt.cols);
        const off=tileIdx*BYTES_PER_TILE;
        for(let y=0;y<8;y++) for(let xb=0;xb<4;xb++){
          const b=chrData[off+y*4+xb]; const l=(b>>4)&0x0F, r=b&0x0F;
          ctx.fillStyle=pal[l]||'#000'; ctx.fillRect(col*8*2+ xb*2*2, row*8*2 + y*2, 2,2);
          ctx.fillStyle=pal[r]||'#000'; ctx.fillRect(col*8*2+ (xb*2+1)*2, row*8*2 + y*2, 2,2);
        }
      });
      thumb.appendChild(c);
      const name=document.createElement('div'); name.className='chr-metatile-thumb-name'; name.textContent=mt.name;
      thumb.appendChild(name);
      thumb.onclick=()=>{
        selectedMetatileId=mt.id;
        metatileCols=mt.cols; metatileRows=mt.rows; metatileSlots=[...mt.tiles];
        selectedMetatileSlot=0;
        render();
      };
      thumbsGrid.appendChild(thumb);
    });
    if(metatilesList.length===0){
      thumbsGrid.innerHTML='<div style="font-size:11px;color:#555;padding:8px;">Nenhum metatile criado. Clique New para criar um com os tiles do seletor base.</div>';
    }

    // PALETAS FULL
    const palFull=containerEl.querySelector('#md-palettes-full');
    if(palFull){
      palFull.innerHTML='';
      for(let p=0;p<4;p++){
        const row=document.createElement('div'); row.className='chr-palette-full-row';
        const palCss=getPaletteCss(p);
        palCss.forEach((col,idx)=>{
          const sw=document.createElement('div'); sw.className='chr-palette-full-swatch'+(p===selectedPalette && idx===selectedColor?' selected':''); sw.style.background=col; sw.title=`PAL ${p} COL ${idx}`; sw.onclick=()=>{ selectedPalette=p; selectedColor=idx; render(); }; row.appendChild(sw);
        });
        palFull.appendChild(row);
      }
    }

    // CONTROLS METATILE
    const mtColsEl=containerEl.querySelector('#md-mt-cols');
    const mtRowsEl=containerEl.querySelector('#md-mt-rows');
    const mtResizeBtn=containerEl.querySelector('#md-mt-resize');
    const pageSelectEl=containerEl.querySelector('#md-page-select');
    const pagPrevBtn=containerEl.querySelector('#md-pag-prev');
    const pagNextBtn=containerEl.querySelector('#md-pag-next');

    // PAGINAÇÃO 0=SPRITES / 1=BACKGROUNDS
    if(pageSelectEl){
      pageSelectEl.onchange=(e)=>{
        currentPage=parseInt(e.target.value);
        metatileLocked2x2 = currentPage===1;
        if(metatileLocked2x2){
          // trava 2x2 quando em BG
          metatileCols=2; metatileRows=2;
          const newSize=4;
          if(metatileSlots.length!==newSize){
            const old=metatileSlots.slice(0,4);
            metatileSlots = old.length===4 ? old : [0,1,2,3].map((_,i)=> metatileSlots[i]||0);
          }
        }
        render();
      };
    }
    if(pagPrevBtn) pagPrevBtn.onclick=()=>{ currentPage=Math.max(0, currentPage-1); if(pageSelectEl) pageSelectEl.value=currentPage; pageSelectEl?.dispatchEvent(new Event('change')); };
    if(pagNextBtn) pagNextBtn.onclick=()=>{ currentPage=Math.min(1, currentPage+1); if(pageSelectEl) pageSelectEl.value=currentPage; pageSelectEl?.dispatchEvent(new Event('change')); };

    const mtListEl=containerEl.querySelector('#md-mt-list');
    const mtSaveBtn=containerEl.querySelector('#md-mt-save');
    const mtNewBtn=containerEl.querySelector('#md-mt-new');
    const mtRenameBtn=containerEl.querySelector('#md-mt-rename');
    const mtDeleteBtn=containerEl.querySelector('#md-mt-delete');
    const mtAutoEl=containerEl.querySelector('#md-mt-auto');

    if(mtColsEl) mtColsEl.onchange=(e)=>{ metatileCols=parseInt(e.target.value); };
    if(mtRowsEl) mtRowsEl.onchange=(e)=>{ metatileRows=parseInt(e.target.value); };
    if(mtResizeBtn) mtResizeBtn.onclick=()=>resizeMetatile();
    if(mtListEl) mtListEl.onchange=(e)=>{
      const id=e.target.value;
      if(!id){ selectedMetatileId=null; return; }
      const mt=metatilesList.find(m=>m.id===id);
      if(mt){ selectedMetatileId=id; metatileCols=mt.cols; metatileRows=mt.rows; metatileSlots=[...mt.tiles]; selectedMetatileSlot=0; render(); }
    };
    if(mtSaveBtn) mtSaveBtn.onclick=()=>saveCurrentMetatile();
    if(mtNewBtn) mtNewBtn.onclick=()=>createNewMetatile();
    if(mtRenameBtn) mtRenameBtn.onclick=()=>renameMetatile();
    if(mtDeleteBtn) mtDeleteBtn.onclick=()=>deleteMetatile();
    if(mtAutoEl) mtAutoEl.onchange=(e)=>{ autoAdvance=e.target.checked; };

    // IMPORT
    const fileRom=containerEl.querySelector('#md-file-rom');
    const fileBin=containerEl.querySelector('#md-file-bin');
    containerEl.querySelector('#md-import-rom').onclick=()=> fileRom.click();
    containerEl.querySelector('#md-import-bin').onclick=()=> fileBin.click();
    containerEl.querySelector('#md-export-bin').onclick=()=>{
      const blob=new Blob([chrData],{type:'application/octet-stream'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=`md_tiles_${Date.now()}.bin`; a.click(); URL.revokeObjectURL(url);
    };
    fileRom.onchange=(e)=>{
      const file=e.target.files[0]; if(!file) return;
      const offsetInput=containerEl.querySelector('#md-offset-input');
      let off=0; try{ off=parseInt(offsetInput.value,16)||0; }catch{}
      importOffset=off;
      const reader=new FileReader();
      reader.onload=()=>{ importFromRom(reader.result, off); };
      reader.readAsArrayBuffer(file);
    };
    fileBin.onchange=(e)=>{
      const file=e.target.files[0]; if(!file) return;
      const reader=new FileReader();
      reader.onload=()=>{ const buf=new Uint8Array(reader.result); chrData.set(buf.slice(0,Math.min(buf.length,chrData.length))); if(window.AppState) window.AppState.markDirty(); render(); };
      reader.readAsArrayBuffer(file);
    };
    const offsetInput=containerEl.querySelector('#md-offset-input');
    if(offsetInput) offsetInput.onchange=(e)=>{ try{ importOffset=parseInt(e.target.value,16)||0; }catch{ importOffset=0; } render(); };

    const chk=containerEl.querySelector('#md-show-grid');
    if(chk) chk.onchange=(e)=>{ showGrid=e.target.checked; render(); };

    document.onkeydown=(e)=>{
      if(e.key>='0' && e.key<='7'){ selectedColor=parseInt(e.key); render(); }
      if(e.key==='g'||e.key==='G'){ showGrid=!showGrid; render(); }
    };
  }

  function init(container,projectData){
    if(container) containerEl=container;
    console.log('[MD Graphics init] projectData', projectData ? Object.keys(projectData) : 'null', 'AppState', window.AppState?.project ? Object.keys(window.AppState.project) : 'null');
    
    // V19 FIX: Carrega tiles com função robusta que suporta array e b64 chunked
    const src = projectData || (window.AppState && window.AppState.project) || null;
    let tilesLoaded = false;
    if(src){
      tilesLoaded = loadTilesFromProject(src);
      if(!tilesLoaded && window.AppState && window.AppState.project && window.AppState.project!==src){
        tilesLoaded = loadTilesFromProject(window.AppState.project);
      }
      
      if(src.metatiles && src.metatiles.length>0){
        metatilesList=src.metatiles;
        console.log('[MD Graphics init] metatiles carregados', metatilesList.length);
        if(metatilesList.length){
          const mt=metatilesList[0];
          if(!selectedMetatileId){ selectedMetatileId=mt.id; metatileCols=mt.cols; metatileRows=mt.rows; metatileSlots=[...mt.tiles]; }
        }
      } else if(window.AppState && window.AppState.project && window.AppState.project.metatiles && window.AppState.project.metatiles.length>0){
        metatilesList=window.AppState.project.metatiles;
        console.log('[MD Graphics init] metatiles carregados de AppState', metatilesList.length);
        if(metatilesList.length && !selectedMetatileId){
          const mt=metatilesList[0];
          selectedMetatileId=mt.id; metatileCols=mt.cols; metatileRows=mt.rows; metatileSlots=[...mt.tiles];
        }
      }
    }
    
    if(!tilesLoaded){
      console.warn('[MD Graphics init] NENHUM tile carregado, chrData permanece vazio, tentando localStorage');
      try{
        const saved = localStorage.getItem('mdg_chrData');
        if(saved){
          const arr = loadTilesFromBase64(saved);
          if(arr){ chrData.set(arr.slice(0, chrData.length)); console.log('[MD Graphics] tiles de localStorage'); }
        }
      }catch{}
    }
    
    // Garante sync global
    window.MDGraphics = window.MDGraphics||{};
    window.MDGraphics.metatiles = metatilesList;
    window.MDGraphics.data = chrData;
    window.MDGraphics.chrData = chrData;
    if(window.AppState && window.AppState.project){
      window.AppState.project.metatiles = metatilesList;
      // Também garante que tiles estão no projeto
      if(!window.AppState.project.tiles || window.AppState.project.tiles.length===0){
        window.AppState.project.tiles = Array.from(chrData);
      }
    }
    render();
  }

  const mod={ init, render, get data(){return chrData;}, set data(v){ chrData.set(v.slice(0,chrData.length)); render(); }, get metatiles(){ return metatilesList; }, importFromRom };
  window.MDTilesEditor=mod; window.GraphicsEditor=mod; window.MDGraphics=mod;
  window.MDModules=window.MDModules||{}; window.MDModules.graphics=mod;
  if(window.MDCore && window.MDCore.registerModule) window.MDCore.registerModule('graphics', mod);
  if(window.AppState) window.AppState.registerModule('graphics', mod);
  document.addEventListener('DOMContentLoaded', ()=>{ if(window.MDCore && window.MDCore.registerModule) window.MDCore.registerModule('graphics', mod); if(window.AppState) window.AppState.registerModule('graphics', mod); });
})();
