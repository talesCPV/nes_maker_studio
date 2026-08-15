// BACKGROUND MODULE v0.9.7 - Ferramenta Warp Separada no Menu
const BG = (() => {
  let nametable = new Array(32 * 30).fill(0);
  let attributes = new Array(64).fill(0);
  let collisionMap = new Array(32 * 30).fill(0);
  let currentEntryId = null;
  let currentEntryName = '';
  let currentEntryType = null; // 'bg' | 'splash' | null (tela nova, ainda não classificada)
  let selectedMetatile = null;
  let activePalette = 0;
  let selectedCollisionType = 1;
  let isDrawing = false;
  let textMode = false;
  let textCursor = { x: 0, y: 0 };
  let textPalette = 0;
  let textOffsetMode = 'smb'; // 'smb' (0-9,A-Z sequencial) ou 'ascii' (código ASCII direto)
  let bgCanvas, bgCtx;
  let currentTool = 'paint';
  let selectedTextIdx = null;
  let movingTextMode = false;
  let duplicatingTextMode = false;
  // Cache do que existia no nametable/atributos ANTES de cada camada de texto ser escrita,
  // guardado por layer.id. Só em memória durante a edição - nunca vai pro .nms porque fica
  // fora do objeto da camada (que é o que de fato é serializado ao salvar).
  let textUnderCache = {};
  let textLayers = [];
  let currentChrPage = 1; // pg ímpar: pg0 de cada banco é reservada para sprites, background só usa pg1, pg3...
  // Rascunho em memória por página do CHR: evita misturar metatiles de páginas diferentes na
  // mesma tela quando o usuário troca de página no meio do desenho. Cada página guarda seu
  // próprio nametable/atributos/colisão/textos em progresso; trocar de página salva o estado
  // atual na página de origem e restaura (ou cria em branco) o estado da página de destino.
  let pageDrafts = {};
  let globalEventsAttached = false;

  function isValidForBG(mt) {
    return mt && mt.w >= 2 && mt.h >= 2 && mt.w % 2 === 0 && mt.h % 2 === 0;
  }

  function formatTileAddr(tileIdx) {
    const t = tileIdx || 0;
    const page = t >= 256 ? 1 : 0;
    const rel = t % 256;
    return `PT${page}:$${rel.toString(16).padStart(2, "0").toUpperCase()}`;
  }

  function ensureMetatileCollisions(mt) {
    if (!mt) return;
    const size = (mt.w || 2) * (mt.h || 2);
    if (!mt.collisions || !Array.isArray(mt.collisions) || mt.collisions.length !== size) {
      const defaultCol = mt.collisionType !== undefined ? mt.collisionType : 1;
      mt.collisions = new Array(size).fill(defaultCol);
    }
  }

  function buildHTML(){
    const root = document.getElementById('mod-bg');
    if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#ffcc00;margin:0">🗺 BACKGROUNDS v0.9.7 • Ferramenta Warp Dedicada</h3>
          <div style="display:flex;gap:6px;align-items:center;margin-left:12px">
            <span style="font-size:11px;color:#888">BG:</span>
            <select id="bgSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 6px;font-size:11px;min-width:140px"></select>
            <button class="btn-tool" onclick="BG.newCanvas()" style="padding:4px 8px">✨ Novo</button>
            <button class="btn-tool" onclick="BG.saveEntryAs('bg')" style="background:#ffcc00;color:#000">🗺 Salvar como Background</button>
            <button class="btn-tool" onclick="BG.saveEntryAs('splash')" style="background:#8e44ad;color:#fff">🎬 Salvar como Splash</button>
            <button class="btn-tool" onclick="BG.deleteCurrentEntry()" style="background:#c0392b;color:#fff">🗑 Deletar</button>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
            <span id="bgModeLabel" style="font-size:10px;color:#4ec9b0;background:#111;border:1px solid #333;border-radius:3px;padding:2px 6px">Modo: Pintura</span>
            <button class="btn-tool" onclick="BG.exportASM()">📄 Exportar .asm</button>
          </div>
        </div>

        <div style="display:flex;flex:1;overflow:hidden;min-height:0">
          <div style="width:340px;min-width:340px;background:#181818;border-right:1px solid #333;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">FERRAMENTAS</h4>
              <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">
                <button class="btn-tool tool-btn active" data-bg-tool="paint" onclick="BG.setTool('paint')">🎨 Pintar</button>
                <button class="btn-tool tool-btn" data-bg-tool="flood" onclick="BG.setTool('flood')" style="background:#8e44ad;color:#fff;border:1px solid #9b59b6">🌊 Flood</button>
                <button class="btn-tool tool-btn" data-bg-tool="attr" onclick="BG.setTool('attr')" style="background:#2980b9;color:#fff;border:1px solid #3498db">🖌 Paleta</button>
                <button class="btn-tool tool-btn" data-bg-tool="hitbox" onclick="BG.setTool('hitbox')" style="background:#c0392b;color:#fff;border:1px solid #e74c3c">🛡 Hitbox</button>
                <button class="btn-tool tool-btn" data-bg-tool="erase" onclick="BG.setTool('erase')" style="background:#555;color:#fff;border:1px solid #777">🧽 Borracha</button>
                <button class="btn-tool tool-btn" data-bg-tool="text" onclick="BG.setTool('text')" style="background:#ffcc00;color:#000">🔤 Texto</button>
                <button class="btn-tool tool-btn" data-bg-tool="fill" onclick="BG.setTool('fill')">🪣 Auto-Fill</button>
              </div>
              <div id="bgHelpText" style="font-size:10px;color:#888;background:#000;border:1px solid #222;border-radius:3px;padding:4px 6px">Pintura livre. Alt+clique clona. Shift+clique apaga. No modo Texto, clique no canvas para posicionar o cursor.</div>
              
              <div id="bgHitboxPanel" style="display:none;background:#2a0808;border:1px solid #881111;border-radius:6px;padding:8px;margin-top:8px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                  <h4 style="font-size:10px;color:#ff6666;margin:0">HITBOX MANUAL</h4>
                  <label style="font-size:10px;color:#ffcc00;display:flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" id="chkHitboxFlood"> 🪣 Flood</label>
                </div>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn-tool collision-btn" data-col-type="0" onclick="BG.setCollisionType(0)" style="font-size:10px">⬜ 0: Livre</button>
                  <button class="btn-tool collision-btn active" data-col-type="1" onclick="BG.setCollisionType(1)" style="font-size:10px;background:#c0392b;color:#fff">🟥 1: Sólido</button>
                  <button class="btn-tool collision-btn" data-col-type="2" onclick="BG.setCollisionType(2)" style="font-size:10px;background:#27ae60;color:#fff">🟩 2: Plataforma</button>
                  <button class="btn-tool collision-btn" data-col-type="3" onclick="BG.setCollisionType(3)" style="font-size:10px;background:#8e44ad;color:#fff">🟪 3: Dano</button>
                  <button class="btn-tool collision-btn" data-col-type="4" onclick="BG.setCollisionType(4)" style="font-size:10px;background:#d35400;color:#fff">🚪 4: Warp</button>
                </div>
              </div>

              <div id="bgFillPanel" style="display:none;background:#1a1a00;border:1px solid #665500;border-radius:6px;padding:8px;margin-top:8px">
                <h4 style="font-size:10px;color:#ffcc00;margin-bottom:6px">AÇÕES DE PREENCHIMENTO</h4>
                <div style="display:flex;gap:4px;flex-wrap:wrap">
                  <button class="btn-tool" onclick="BG.fillAllEmpty()" style="font-size:10px">⬜ Só Vazios</button>
                  <button class="btn-tool" onclick="BG.fillEntireScreen()" style="font-size:10px;background:#ffcc00;color:#000">🌟 Tela toda</button>
                  <button class="btn-tool" onclick="BG.applyAttrToAll()" style="font-size:10px;background:#2980b9;color:#fff">🎨 Paleta Global</button>
                  <button class="btn-tool" onclick="BG.clearBackground()" style="font-size:10px;background:#c0392b;color:#fff">🧹 Limpar</button>
                </div>
              </div>

              <div id="bgTextPanel" style="display:none;background:#1a1a00;border:1px solid #665500;border-radius:6px;padding:8px;margin-top:8px">
                <h4 style="font-size:10px;color:#ffcc00;margin-bottom:6px">🔤 TEXTO - CLIQUE NO CANVAS PARA POSICIONAR</h4>
                <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
                  <label style="font-size:10px;color:#888">Offset:</label>
                  <select id="bgTextOffsetSelect" style="background:#000;color:#ffcc00;border:1px solid #665500;border-radius:4px;padding:3px;font-size:10px" onchange="BG.setTextOffsetMode(this.value)">
                    <option value="smb">SMB (0-9, A-Z sequencial)</option>
                    <option value="ascii">ASCII (código direto)</option>
                  </select>
                </div>
                <div style="display:flex;gap:4px;margin:4px 0">
                  <input id="bgTextInput" type="text" placeholder="Digite texto + Enter" style="flex:1;background:#000;color:#ffcc00;border:1px solid #665500;border-radius:4px;padding:6px;font-size:12px;font-family:monospace">
                  <button class="btn-tool" onclick="BG.insertText()" style="background:#ffcc00;color:#000">Inserir</button>
                </div>
                <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
                  <label style="font-size:10px;color:#888">Paleta:</label>
                  <div id="bgTextPalettes" style="display:flex;gap:4px"></div>
                  <span style="font-size:10px;color:#666">Cursor: <b id="bgCursorPos" style="color:#ffcc00">0,0</b></span>
                  <button class="btn-tool" onclick="BG.clearTextSelection()" style="font-size:9px;margin-left:auto">✖ Deselecionar</button>
                </div>
              </div>
            </div>

            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <h4 style="font-size:11px;color:#4ec9b0;margin:0">METATILES (2x2+)</h4>
                <div style="display:flex;align-items:center;gap:4px"><span style="font-size:10px;color:#888">Pág CHR:</span><select id="bgChrPageSelect" style="background:#000;color:#ffcc00;border:1px solid #444;border-radius:3px;font-size:10px;padding:2px"></select></div>
              </div>
              <div id="metatilePalette" style="display:flex;flex-wrap:wrap;gap:6px;max-height:180px;overflow:auto;padding-right:4px"></div>
            </div>

            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;gap:12px;align-items:center"><div><h4 style="font-size:10px;color:#888;margin-bottom:6px">PALETA (0-3)</h4><div id="attrPaletteSelect" style="display:flex;gap:6px;flex-direction:column"></div></div><div style="flex:1;display:flex;flex-direction:column;align-items:center"><div id="selectedInfo" style="font-size:10px;color:#aaa;text-align:center;margin-bottom:4px">Nenhum</div><div style="position:relative"><canvas id="selectedPreview" width="80" height="80" style="border:1px solid #ffcc00;background:#000;image-rendering:pixelated;display:block;cursor:pointer" title="Clique no sub-tile para alternar colisão!"></canvas></div></div></div>
              <div style="border-top:1px solid #222;padding-top:6px;display:flex;flex-direction:column;gap:4px"><div style="display:flex;justify-content:space-between;align-items:center"><label style="font-size:10px;color:#ffcc00">🛡 Hitbox por Tile:</label><button class="btn-tool" onclick="BG.setAllSubTilesCollision()" style="font-size:9px;padding:1px 4px">Setar Todos</button></div><div style="display:flex;gap:4px"><select id="mtSubTileColSelect" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px;font-size:10px"><option value="0">⬜ 0: Ar/Livre</option><option value="1">🟥 1: Sólido</option><option value="2">🟩 2: Plataforma</option><option value="3">🟪 3: Dano/Espinho</option></select><button class="btn-tool" onclick="BG.applyMetatileHitboxToCanvas()" style="font-size:10px;background:#27ae60;color:#fff">⚡ Recalcular</button></div></div>
            </div>
          </div>

          <div style="flex:1;background:#111;padding:12px;overflow:auto;display:flex;flex-direction:column;align-items:center;gap:8px">
            <div style="display:flex;gap:12px;align-items:center;font-size:11px;color:#888;flex-wrap:wrap">
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" id="chkShowHitbox" checked> Hitbox</label>
              <label style="display:flex;align-items:center;gap:4px">Grid:
                <select id="bgGridSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:2px 4px;font-size:11px">
                  <option value="none">Sem grid</option>
                  <option value="1x1">1x1</option>
                  <option value="2x2" selected>2x2</option>
                  <option value="4x4">4x4</option>
                </select>
              </label>
              <span id="hoverPos" style="color:#4ec9b0;background:#000;padding:2px 6px;border-radius:3px;border:1px solid #333">x:0 y:0</span>
            </div>
            <canvas id="bgCanvas" width="512" height="480" style="border:2px solid #665500;background:#000;image-rendering:pixelated;cursor:crosshair;display:block"></canvas>
          </div>

          <div style="width:300px;min-width:300px;background:#1e1e1e;padding:12px;border-left:1px solid #333;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #665500;border-radius:6px;padding:10px;flex:1;display:flex;flex-direction:column">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:8px">📝 CAMADAS DE TEXTO - EDITAR/MOVER/DELETAR</h4>
              <div id="bgTextLayers" style="display:flex;flex-direction:column;gap:6px;flex:1;overflow:auto"></div>
            </div>
            <div>
              <div style="font-size:11px;color:#888;background:#111;border:1px solid #333;padding:8px;border-radius:4px">
                Tiles: <b id="bgStats" style="color:#fff">0/960</b><br>
                Hitbox: <b id="solidStats" style="color:#ff6666">0</b><br>
                Textos: <b id="textCount" style="color:#fff">0</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    bgCanvas = document.getElementById('bgCanvas');
    bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
    attachEvents();
    initChrPageSelect();
    updateBGSelect();
    refreshMetatileList();
    updateAttrPaletteUI();
    updateTextPaletteUI();
    render();
  }

  function setTool(t) {
    currentTool = t;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-bg-tool="${t}"]`)?.classList.add('active');
    document.getElementById('bgFillPanel').style.display = (t === 'fill') ? 'block' : 'none';
    document.getElementById('bgTextPanel').style.display = (t === 'text') ? 'block' : 'none';
    document.getElementById('bgHitboxPanel').style.display = (t === 'hitbox') ? 'block' : 'none';
    const label = document.getElementById('bgModeLabel');
    const help = document.getElementById('bgHelpText');
    textMode = (t === 'text');
    if(t === 'flood') { label.textContent = 'Modo: Flood Fill'; help.textContent = 'Preenche área contígua com o metatile selecionado.'; }
    else if(t === 'attr') { label.textContent = 'Modo: Pincel de Atributo'; help.textContent = 'Pinta a paleta mantendo as estampas.'; }
    else if(t === 'hitbox') { label.textContent = 'Modo: Hitbox Manual'; help.textContent = 'Pinta colisão individualmente (inclui Warp). Shift+clique apaga.'; }
    else if(t === 'fill') { label.textContent = 'Modo: Auto-Fill'; help.textContent = 'Preenchimento em massa.'; }
    else if(t === 'erase') { label.textContent = 'Modo: Borracha'; help.textContent = 'Clique (ou arraste) num tile para apagá-lo, tile por tile.'; }
    else if(t === 'text') { 
      label.textContent = 'Modo: Texto ASCII - CLIQUE NO CANVAS'; 
      help.textContent = 'CLIQUE no canvas para posicionar o cursor amarelo. Depois digite no campo e clique Inserir. Use as camadas à direita para editar/mover/deletar.';
      updateCursorPos();
    }
    else { label.textContent = 'Modo: Pintura Metatile'; help.textContent = 'Pinta Metatile + Atributo + Hitbox sub-tile. Alt+clique clona. Shift+clique apaga.'; }
    render();
  }

  function setCollisionType(type) {
    selectedCollisionType = parseInt(type);
    document.querySelectorAll('.collision-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-col-type="${type}"]`)?.classList.add('active');
  }

  function updateCursorPos(){
    const el = document.getElementById('bgCursorPos');
    if(el) el.textContent = `${textCursor.x},${textCursor.y}`;
  }

  function clearTextSelection(){
    selectedTextIdx = null;
    movingTextMode = false;
    updateTextLayersUI();
    render();
  }

  function handlePreviewClick(e) {
    if(!selectedMetatile) return;
    ensureMetatileCollisions(selectedMetatile);
    const canv = document.getElementById('selectedPreview');
    const rect = canv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const w = selectedMetatile.w || 2, h = selectedMetatile.h || 2;
    const tileW = 80 / w, tileH = 80 / h;
    const subX = Math.floor(mx / tileW), subY = Math.floor(my / tileH);
    if(subX < 0 || subX >= w || subY < 0 || subY >= h) return;
    const subIdx = subY * w + subX;
    const curr = selectedMetatile.collisions[subIdx] || 0;
    // Alterna entre 0, 1, 2 e 3 (o valor 4 é reservado à ferramenta dedicada de Warp de tela)
    let nextCol = (curr + 1) % 4;
    selectedMetatile.collisions[subIdx] = nextCol;
    updateSelectedInfo();
  }

  function setAllSubTilesCollision() {
    if(!selectedMetatile) return;
    ensureMetatileCollisions(selectedMetatile);
    const typeVal = parseInt(document.getElementById('mtSubTileColSelect')?.value || 0);
    selectedMetatile.collisions.fill(typeVal);
    updateSelectedInfo();
  }

  function applyMetatileHitboxToCanvas() {
    if(!selectedMetatile) return;
    ensureMetatileCollisions(selectedMetatile);
    const mt = selectedMetatile;
    let count = 0;
    for(let y=0; y<30; y++) {
      for(let x=0; x<32; x++) {
        const snapX = Math.floor(x / mt.w) * mt.w;
        const snapY = Math.floor(y / mt.h) * mt.h;
        let match = true;
        for(let dy=0; dy<mt.h; dy++){
          for(let dx=0; dx<mt.w; dx++){
            const nx = snapX + dx, ny = snapY + dy;
            if(nx < 32 && ny < 30) {
              if(nametable[ny * 32 + nx] !== mt.tiles[dy * mt.w + dx]) {
                match = false; break;
              }
            }
          }
          if(!match) break;
        }
        if(match) {
          const subX = x - snapX, subY = y - snapY;
          // Aplica a colisão configurada no metatile (0=Livre, 1=Sólido, 2=Plataforma, 3=Dano).
          // Preserva warps (4) já marcados manualmente - não fazem parte da definição do metatile.
          if(collisionMap[y * 32 + x] !== 4) collisionMap[y * 32 + x] = mt.collisions[subY * mt.w + subX] || 0;
          count++;
        }
      }
    }
    render();
    Project.status(`Recalculadas ${count} colisões`);
  }

  function selectMetatileObj(mt) {
    selectedMetatile = mt;
    ensureMetatileCollisions(selectedMetatile);
    document.querySelectorAll('#metatilePalette div').forEach(d => {
      d.style.borderColor = (mt && d.dataset.mtId === mt.id) ? '#ffcc00' : '#333';
    });
    updateSelectedInfo();
  }

  function updateSelectedInfo(){
    const info = document.getElementById('selectedInfo');
    const canv = document.getElementById('selectedPreview');
    if(!info || !canv) return;
    if(!selectedMetatile){ info.textContent = 'Nenhum'; const ctx = canv.getContext('2d'); ctx.fillStyle='#000'; ctx.fillRect(0,0,80,80); return; }
    ensureMetatileCollisions(selectedMetatile);
    info.innerHTML = `<b style="color:#fff">${selectedMetatile.name}</b> (${selectedMetatile.w}x${selectedMetatile.h})`;
    const cctx = canv.getContext('2d');
    cctx.fillStyle = '#000'; cctx.fillRect(0,0,80,80);
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : (Project.data?.chr || new Uint8Array(8192));
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : (Project.data?.palettes || [[15,0,16,48]]);
    const pal = pals[activePalette] || pals[0];
    const w = selectedMetatile.w, h = selectedMetatile.h;
    const tilePxW = 80 / w, tilePxH = 80 / h;
    selectedMetatile.tiles.forEach((t, tIdx)=>{
      const off = t * 16; if(off + 16 > chrBuf.length) return;
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
        const subIdx = gy * w + gx;
        const colType = selectedMetatile.collisions[subIdx] || 0;
        if(colType > 0) {
          if(colType === 1) { cctx.fillStyle = 'rgba(255, 0, 0, 0.45)'; cctx.strokeStyle = '#ff3333'; }
          else if(colType === 3) { cctx.fillStyle = 'rgba(142, 68, 173, 0.55)'; cctx.strokeStyle = '#9b59b6'; }
          cctx.fillRect(gx*tilePxW, gy*tilePxH, tilePxW, tilePxH);
          cctx.strokeRect(gx*tilePxW + 0.5, gy*tilePxH + 0.5, tilePxW - 1, tilePxH - 1);
        }
        cctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        cctx.strokeRect(gx*tilePxW, gy*tilePxH, tilePxW, tilePxH);
      }
    }
  }

  function floodFillAt(tx, ty) {
    if(!selectedMetatile) return;
    ensureMetatileCollisions(selectedMetatile);
    const mt = selectedMetatile;
    const snapX = Math.floor(tx / mt.w) * mt.w;
    const snapY = Math.floor(ty / mt.h) * mt.h;
    const targetTile = nametable[snapY * 32 + snapX];
    const replacementTile = mt.tiles[0];
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
            nametable[ny * 32 + nx] = mt.tiles[subIdx];
            const attrX = Math.floor(nx/2), attrY = Math.floor(ny/2);
            const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
            const attrIdx = blockY*8 + blockX;
            const shift = ((attrY%2)*2 + (attrX%2))*2;
            attributes[attrIdx] = (attributes[attrIdx] & ~(0x03 << shift)) | ((activePalette & 0x03) << shift);
            collisionMap[ny * 32 + nx] = mt.collisions[subIdx] || 0;
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
    if(!bgCanvas) return;
    const rect = bgCanvas.getBoundingClientRect();
    const scaleX = 512 / rect.width, scaleY = 480 / rect.height;
    const tx = Math.floor((mx * scaleX) / 16), ty = Math.floor((my * scaleY) / 16);
    if(tx < 0 || tx >= 32 || ty < 0 || ty >= 30) return;

    if(currentTool === 'text' || textMode){
      if(isInitialClick){
        let clickedOnText = false;
        for(let i = textLayers.length-1; i >=0; i--){
          const layer = textLayers[i];
          if(ty === layer.y && tx >= layer.x && tx < layer.x + layer.text.length){
            selectedTextIdx = i;
            movingTextMode = false;
            updateTextLayersUI();
            render();
            clickedOnText = true;
            break;
          }
        }
        if(!clickedOnText){
          textCursor.x = tx;
          textCursor.y = ty;
          selectedTextIdx = null;
          movingTextMode = false;
          updateCursorPos();
          updateTextLayersUI();
          render();
        }
      }
      return;
    }

    if(isAlt) { if(isInitialClick) pickMetatileAt(tx, ty); return; }

    if(currentTool === 'hitbox') {
      const isHitboxFlood = document.getElementById('chkHitboxFlood')?.checked;
      if(isHitboxFlood) { if(isInitialClick) floodFillHitbox(tx, ty, erasing ? 0 : selectedCollisionType); }
      else { collisionMap[ty * 32 + tx] = erasing ? 0 : selectedCollisionType; render(); }
      return;
    }
    if(currentTool === 'flood') { if(isInitialClick) floodFillAt(tx, ty); return; }
    if(currentTool === 'erase') { nametable[ty*32+tx] = 0; collisionMap[ty*32+tx] = 0; render(); return; }
    if(currentTool === 'attr') {
      const attrX = Math.floor(tx/2), attrY = Math.floor(ty/2);
      const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
      const attrIdx = blockY*8 + blockX;
      const shift = ((attrY%2)*2 + (attrX%2))*2;
      attributes[attrIdx] = (attributes[attrIdx] & ~(0x03 << shift)) | ((activePalette & 0x03) << shift);
      render(); return;
    }
    if(!selectedMetatile && !erasing) return;
    if(erasing){ nametable[ty*32+tx] = 0; collisionMap[ty*32+tx] = 0; render(); return; }
    ensureMetatileCollisions(selectedMetatile);
    const mt = selectedMetatile;
    const snapX = Math.floor(tx / mt.w) * mt.w;
    const snapY = Math.floor(ty / mt.h) * mt.h;
    for(let dy=0; dy<mt.h; dy++){
      for(let dx=0; dx<mt.w; dx++){
        const nx = snapX + dx, ny = snapY + dy;
        if(nx < 0 || nx >= 32 || ny < 0 || ny >= 30) continue;
        const subIdx = dy * mt.w + dx;
        nametable[ny*32+nx] = (mt.tiles[subIdx] || 0);
        const attrX = Math.floor(nx/2), attrY = Math.floor(ny/2);
        const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
        const attrIdx = blockY*8 + blockX;
        const shift = ((attrY%2)*2 + (attrX%2))*2;
        attributes[attrIdx] = (attributes[attrIdx] & ~(0x03 << shift)) | ((activePalette & 0x03) << shift);
        collisionMap[ny * 32 + nx] = mt.collisions[subIdx] || 0;
      }
    }
    render();
  }

  function attachEvents(){
    if(!bgCanvas) return;
    bgCanvas.addEventListener('mousedown', e => {
      isDrawing = true;
      const r = bgCanvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      if(currentTool === 'text'){
        const scaleX = 512 / r.width, scaleY = 480 / r.height;
        const tx = Math.floor((mx * scaleX) / 16), ty = Math.floor((my * scaleY) / 16);
        if(movingTextMode && selectedTextIdx !== null){
          moveTextLayerTo(selectedTextIdx, tx, ty, true);
          movingTextMode = false;
          Project.status("Texto movido");
          updateTextLayersUI();
        } else if(duplicatingTextMode && selectedTextIdx !== null){
          duplicateTextLayerAt(selectedTextIdx, tx, ty);
          duplicatingTextMode = false;
          Project.status("Texto duplicado");
        } else {
          paintAt(mx, my, e.shiftKey, e.altKey, true);
        }
      } else {
        paintAt(mx, my, e.shiftKey, e.altKey, true);
      }
    });
    bgCanvas.addEventListener('mousemove', e => {
      const r = bgCanvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const tx = Math.floor((mx / r.width) * 32), ty = Math.floor((my / r.height) * 30);
      const hover = document.getElementById('hoverPos');
      if(hover) hover.textContent = `x:${tx} y:${ty} • Tile: ${formatTileAddr(nametable[ty*32+tx])} • Col: ${collisionMap[ty*32+tx]||0}`;
      if(isDrawing && currentTool !== 'text'){
        paintAt(mx, my, e.shiftKey, e.altKey, false);
      }
    });
    document.getElementById('selectedPreview')?.addEventListener('click', handlePreviewClick);
    document.getElementById('chkShowHitbox')?.addEventListener('change', render);
    document.getElementById('bgGridSelect')?.addEventListener('change', render);

    if(!globalEventsAttached){
      globalEventsAttached = true;
      window.addEventListener('mouseup', () => {
        isDrawing = false;
      });
      document.addEventListener('keydown', (e)=>{
        if(document.activeElement && document.activeElement.id === 'bgTextInput' && e.key === 'Enter'){
          e.preventDefault();
          insertText();
        }
      });
    }
  }

  function floodFillHitbox(tx, ty, newColType) {
    const targetType = collisionMap[ty * 32 + tx];
    if (targetType === newColType) return;
    const queue = [{x: tx, y: ty}];
    const visited = new Set();
    while(queue.length > 0) {
      const {x, y} = queue.shift();
      const key = `${x},${y}`;
      if(visited.has(key)) continue;
      if(x < 0 || x >= 32 || y < 0 || y >= 30) continue;
      if(collisionMap[y * 32 + x] !== targetType) continue;
      visited.add(key);
      collisionMap[y * 32 + x] = newColType;
      queue.push({x: x + 1, y: y});
      queue.push({x: x - 1, y: y});
      queue.push({x: x, y: y + 1});
      queue.push({x: x, y: y - 1});
    }
    render();
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
    mets = mets.filter(isValidForBG);
    let foundMt = null;
    for (let mt of mets) {
      const snapX = Math.floor(tx / mt.w) * mt.w;
      const snapY = Math.floor(ty / mt.h) * mt.h;
      let match = true;
      for(let dy=0; dy<mt.h; dy++){
        for(let dx=0; dx<mt.w; dx++){
          const nx = snapX + dx, ny = snapY + dy;
          if(nx < 32 && ny < 30) {
            if(nametable[ny * 32 + nx] !== mt.tiles[dy * mt.w + dx]) { match = false; break; }
          }
        }
        if(!match) break;
      }
      if(match) { foundMt = mt; break; }
    }
    if (foundMt) selectMetatileObj(foundMt);
  }

  function initChrPageSelect(){
    const sel = document.getElementById('bgChrPageSelect'); if(!sel) return;
    sel.innerHTML = '';
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : (Project.data?.chr || new Uint8Array(8192));
    const totalPages = Math.max(1, Math.ceil(chrBuf.length / 4096));
    const oddPages = [];
    for(let i = 1; i < totalPages; i += 2) oddPages.push(i);
    if(oddPages.length === 0) oddPages.push(0);
    oddPages.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = `Pág ${i} (backgrounds)`;
      sel.appendChild(opt);
    });
    if(!oddPages.includes(currentChrPage)) currentChrPage = oddPages[0];
    sel.value = currentChrPage;
    sel.onchange = (e) => { switchToChrPage(parseInt(e.target.value) || oddPages[0]); };
  }

  // Troca a página de trabalho do CHR, preservando o desenho em progresso de cada página
  // separadamente (evita misturar metatiles de páginas diferentes numa mesma tela).
  // Troca a página de trabalho do CHR. Ponto 1: procura uma tela SALVA que já use essa
  // página e carrega ela automaticamente (pra nunca desenhar com metatiles de outra
  // página); se nenhuma tela salva usa essa página ainda, pergunta se quer criar uma.
  function switchToChrPage(newPage){
    if(newPage === currentChrPage) return;
    pageDrafts[currentChrPage] = {
      nametable: [...nametable], attributes: [...attributes], collisionMap: [...collisionMap],
      textLayers: JSON.parse(JSON.stringify(textLayers))
    };
    currentChrPage = newPage;

    const bgs = Project.data?.backgrounds || [];
    const splashes = Project.data?.splashScreens || [];
    const foundBg = bgs.find(b => b.chrPage === newPage);
    const foundSplash = !foundBg ? splashes.find(s => s.chrPage === newPage) : null;

    if(foundBg){ loadEntry('bg', foundBg.id); Project.status(`Página ${newPage}: background "${foundBg.name}" carregado`); return; }
    if(foundSplash){ loadEntry('splash', foundSplash.id); Project.status(`Página ${newPage}: splash "${foundSplash.name}" carregada`); return; }

    const draft = pageDrafts[newPage];
    if(draft){
      nametable = [...draft.nametable]; attributes = [...draft.attributes]; collisionMap = [...draft.collisionMap];
      textLayers = JSON.parse(JSON.stringify(draft.textLayers));
      currentEntryId = null; currentEntryName = ''; currentEntryType = null;
      Project.status(`Página ${newPage}: rascunho anterior restaurado (ainda não salvo)`);
    } else if(confirm(`Nenhuma tela salva usa a página ${newPage} ainda. Quer criar uma tela nova nessa página?`)){
      const name = prompt("Nome da nova tela:", `tela_pg${newPage}`);
      nametable = new Array(960).fill(0); attributes = new Array(64).fill(0); collisionMap = new Array(960).fill(0);
      textLayers = [];
      if(name){ currentEntryId = 'scr_'+Date.now(); currentEntryName = name.trim(); currentEntryType = null; }
      else { currentEntryId = null; currentEntryName = ''; currentEntryType = null; }
      Project.status(`Página ${newPage}: tela em branco`);
    } else {
      nametable = new Array(960).fill(0); attributes = new Array(64).fill(0); collisionMap = new Array(960).fill(0);
      textLayers = []; currentEntryId = null; currentEntryName = ''; currentEntryType = null;
      Project.status(`Página ${newPage}: tela em branco`);
    }
    selectedTextIdx = null; movingTextMode = false; duplicatingTextMode = false; textUnderCache = {};
    refreshMetatileList(); updateTextLayersUI(); updateBGSelect(); render();
  }

  function refreshMetatileList(){
    const container = document.getElementById('metatilePalette'); if(!container) return;
    let mets = (typeof CHR !== 'undefined' && CHR.getMetatiles) ? CHR.getMetatiles() : (Project.data?.metatiles || []);
    mets = mets.filter(isValidForBG);
    container.innerHTML = '';
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : (Project.data?.chr || new Uint8Array(8192));
    const startTile = currentChrPage * 256;
    const endTile = startTile + 256;
    const pageMetatiles = mets.filter(mt => { if(!mt.tiles || mt.tiles.length === 0) return true; return mt.tiles.some(t => t >= startTile && t < endTile); });
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
        const off = t * 16; if(off + 16 > chrBuf.length) return;
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
      for(let c=0; c<4; c++){ const d = document.createElement('div'); d.style.flex = '1'; d.style.background = NES_PALETTE[pals[i] ? pals[i][c] : 0]; btn.appendChild(d); }
      container.appendChild(btn);
    }
  }

  function updateTextPaletteUI(){
    const container = document.getElementById('bgTextPalettes'); if(!container) return;
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
    if(!bgCtx || !bgCanvas) return;
    bgCtx.fillStyle = '#000'; bgCtx.fillRect(0,0,512,480);
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : (Project.data?.chr || new Uint8Array(8192));
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : (Project.data?.palettes || [[15,0,16,48]]);
    for(let ty=0; ty<30; ty++){
      for(let tx=0; tx<32; tx++){
        const tileIdx = nametable[ty*32+tx] || 0;
        if(tileIdx === 0) continue;
        const off = tileIdx * 16; if(off + 16 > chrBuf.length) continue;
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
            bgCtx.fillStyle = NES_PALETTE[pal[ci]];
            bgCtx.fillRect(tx*16 + px*2, ty*16 + py*2, 2, 2);
          }
        }
      }
    }
    if(document.getElementById('chkShowHitbox')?.checked) {
      for(let ty=0; ty<30; ty++){
        for(let tx=0; tx<32; tx++){
          const type = collisionMap[ty*32+tx] || 0;
          if(type > 0) {
            if(type === 1) { bgCtx.fillStyle = 'rgba(255, 0, 0, 0.35)'; bgCtx.strokeStyle = '#ff3333'; }
            else if(type === 2) { bgCtx.fillStyle = 'rgba(39, 174, 96, 0.4)'; bgCtx.strokeStyle = '#27ae60'; } // Cor da Plataforma no canvas
            else if(type === 3) { bgCtx.fillStyle = 'rgba(142, 68, 173, 0.45)'; bgCtx.strokeStyle = '#9b59b6'; }
            else if(type === 4) { bgCtx.fillStyle = 'rgba(211, 84, 0, 0.45)'; bgCtx.strokeStyle = '#e67e22'; } // Cor da Warp no canvas
            bgCtx.fillRect(tx*16, ty*16, 16, 16);
            bgCtx.strokeRect(tx*16+0.5, ty*16+0.5, 15, 15);
          }
        }
      }
    }
    if(selectedTextIdx !== null && textLayers[selectedTextIdx]){
      const layer = textLayers[selectedTextIdx];
      bgCtx.strokeStyle = movingTextMode ? '#ffcc00' : '#00ff00';
      bgCtx.lineWidth = 2;
      bgCtx.setLineDash(movingTextMode ? [6,3] : []);
      bgCtx.strokeRect(layer.x*16, layer.y*16, layer.text.length*16, 16);
      bgCtx.setLineDash([]);
      bgCtx.fillStyle = '#ffcc00';
      bgCtx.fillRect(layer.x*16 - 4, layer.y*16 - 4, 8, 8);
    }
    if(textMode){
      bgCtx.strokeStyle = '#ffcc00'; bgCtx.lineWidth = 2;
      bgCtx.strokeRect(textCursor.x*16, textCursor.y*16, 16, 16);
      bgCtx.fillStyle = 'rgba(255,204,0,0.3)';
      bgCtx.fillRect(textCursor.x*16, textCursor.y*16, 16, 16);
    }
    const gridMode = document.getElementById('bgGridSelect')?.value || '2x2';
    if(gridMode !== 'none'){
      const step = gridMode === '1x1' ? 1 : gridMode === '4x4' ? 4 : 2;
      bgCtx.strokeStyle = step===1 ? 'rgba(255,255,255,0.08)' : 'rgba(255,204,0,0.2)';
      for(let y=0; y<=30; y+=step){ bgCtx.beginPath(); bgCtx.moveTo(0,y*16); bgCtx.lineTo(512,y*16); bgCtx.stroke(); }
      for(let x=0; x<=32; x+=step){ bgCtx.beginPath(); bgCtx.moveTo(x*16,0); bgCtx.lineTo(x*16,480); bgCtx.stroke(); }
    }
    updateStats();
  }

  function updateStats(){
    const el = document.getElementById('bgStats'); if(el) el.textContent = `${nametable.filter(t=>t!==0).length}/960`;
    const sol = document.getElementById('solidStats'); if(sol) sol.textContent = `${collisionMap.filter(c=>c!==0).length}`;
    const tc = document.getElementById('textCount'); if(tc) tc.textContent = textLayers.length;
  }

  function fillAllEmpty(){
    if(!selectedMetatile){ alert('Selecione um metatile'); return; }
    ensureMetatileCollisions(selectedMetatile);
    const mt = selectedMetatile;
    for(let y=0; y<30; y++){
      for(let x=0; x<32; x++){
        if(nametable[y*32+x] === 0) {
          const subIdx = (y % mt.h) * mt.w + (x % mt.w);
          nametable[y*32+x] = mt.tiles[subIdx];
          collisionMap[y*32+x] = mt.collisions[subIdx] || 0;
        }
      }
    }
    render();
  }

  function fillEntireScreen(){
    if(!selectedMetatile) return;
    if(!confirm('Preencher a tela inteira? Isso sobrescreverá tudo.')) return;
    ensureMetatileCollisions(selectedMetatile);
    const mt = selectedMetatile;
    for(let y=0; y<30; y++){
      for(let x=0; x<32; x++){
        const subIdx = (y % mt.h) * mt.w + (x % mt.w);
        nametable[y*32+x] = mt.tiles[subIdx];
        collisionMap[y*32+x] = mt.collisions[subIdx] || 0;
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

  const TEXT_ACCENT_MAP = {'Á':65,'É':69,'Í':73,'Ó':79,'Ú':85,'Ç':67,'á':97,'é':101,'í':105,'ó':111,'ú':117,'ç':99};
  function charToTileIndex(ch, mode){
    if(mode === 'smb'){
      const upper = ch.toUpperCase();
      if(upper >= '0' && upper <= '9') return upper.charCodeAt(0) - 48;
      if(upper >= 'A' && upper <= 'Z') return 10 + (upper.charCodeAt(0) - 65);
      return 36;
    }
    let code = ch.charCodeAt(0);
    if(code > 127) code = TEXT_ACCENT_MAP[ch] || 32;
    return code % 256;
  }
  function charToNametableTile(ch, mode, page){
    const rel = charToTileIndex(ch, mode) % 256;
    const pg = (typeof page === 'number') ? page : currentChrPage;
    return pg * 256 + rel;
  }
  function setTextOffsetMode(mode){ textOffsetMode = (mode === 'smb') ? 'smb' : 'ascii'; }

  function positionsForRow(x, y, len){ const arr=[]; for(let i=0;i<len;i++) arr.push({x:x+i, y}); return arr; }

  // Devolve o nametable/atributos ao estado de antes da camada de texto ter sido escrita ali.
  function restoreUnderText(layer){
    const snap = textUnderCache[layer.id]; if(!snap) return;
    snap.nt.forEach(({idx, tile}) => { nametable[idx] = tile; });
    snap.attr.forEach(({idx, byte}) => { attributes[idx] = byte; });
    delete textUnderCache[layer.id];
  }
  // Guarda o que está no nametable/atributos ANTES de escrever o texto nessas posições,
  // pra dar pra restaurar depois (mover/editar/apagar).
  function captureUnderText(layer, positions){
    const nt = []; const attrBlocks = new Map();
    positions.forEach(({x,y}) => {
      if(x<0||x>=32||y<0||y>=30) return;
      const idx = y*32+x;
      nt.push({ idx, tile: nametable[idx] });
      const attrX=Math.floor(x/2), attrY=Math.floor(y/2);
      const attrIdx = Math.floor(attrY/2)*8+Math.floor(attrX/2);
      if(!attrBlocks.has(attrIdx)) attrBlocks.set(attrIdx, attributes[attrIdx]);
    });
    textUnderCache[layer.id] = { nt, attr: Array.from(attrBlocks, ([idx,byte]) => ({idx, byte})) };
  }
  function writeTextAt(layer, x, y){
    for(let i=0; i<layer.text.length; i++){
      const tx = x+i, ty = y;
      if(tx<0||tx>=32||ty<0||ty>=30) continue;
      nametable[ty*32+tx] = charToNametableTile(layer.text[i], layer.offset || 'ascii', layer.chrPage != null ? layer.chrPage : currentChrPage);
      const attrX=Math.floor(tx/2), attrY=Math.floor(ty/2);
      const attrIdx=Math.floor(attrY/2)*8+Math.floor(attrX/2);
      const shift=((attrY%2)*2+(attrX%2))*2;
      attributes[attrIdx] = (attributes[attrIdx] & ~(0x03<<shift)) | ((layer.pal & 0x03)<<shift);
    }
    layer.x = x; layer.y = y;
  }

  function insertText(){
    const input = document.getElementById('bgTextInput'); if(!input) return;
    let text = input.value; if(!text) return;
    const selectEl = document.getElementById('bgTextOffsetSelect');
    const mode = selectEl ? selectEl.value : textOffsetMode;
    textOffsetMode = mode;
    const page = currentChrPage;
    const startX = Math.max(0, Math.min(32 - text.length, textCursor.x)), startY = textCursor.y;
    const layer = { text, x: startX, y: startY, pal: textPalette, offset: mode, chrPage: page, id: Date.now() };
    captureUnderText(layer, positionsForRow(startX, startY, text.length));
    writeTextAt(layer, startX, startY);
    textLayers.push(layer);
    selectedTextIdx = textLayers.length - 1;
    textCursor.x = Math.min(32, startX + text.length);
    updateCursorPos();
    input.value = ''; updateTextLayersUI(); input.focus(); render();
  }

  function moveTextLayerTo(idx, newX, newY, shouldRender = true){
    if(idx < 0 || idx >= textLayers.length) return;
    const layer = textLayers[idx];
    restoreUnderText(layer);
    newX = Math.max(0, Math.min(32 - layer.text.length, newX));
    newY = Math.max(0, Math.min(29, newY));
    captureUnderText(layer, positionsForRow(newX, newY, layer.text.length));
    writeTextAt(layer, newX, newY);
    if(shouldRender){ render(); updateTextLayersUI(); }
  }

  function editTextLayer(idx){
    if(idx <0 || idx >= textLayers.length) return;
    const layer = textLayers[idx];
    const newText = prompt("Editar texto:", layer.text);
    if(newText === null || newText === '') return;
    restoreUnderText(layer);
    layer.text = newText;
    const clampedX = Math.max(0, Math.min(32 - newText.length, layer.x));
    captureUnderText(layer, positionsForRow(clampedX, layer.y, newText.length));
    writeTextAt(layer, clampedX, layer.y);
    render(); updateTextLayersUI();
    Project.status(`Texto editado: "${newText}"`);
  }

  function deleteTextLayer(idx){
    if(idx <0 || idx >= textLayers.length) return;
    if(!confirm(`Deletar texto "${textLayers[idx].text}"?`)) return;
    const layer = textLayers[idx];
    restoreUnderText(layer);
    textLayers.splice(idx,1);
    if(selectedTextIdx === idx){ selectedTextIdx = null; movingTextMode = false; duplicatingTextMode = false; }
    else if(selectedTextIdx !== null && selectedTextIdx > idx) selectedTextIdx--;
    render(); updateTextLayersUI();
    Project.status("Texto deletado");
  }

  // Ativa o modo mover: o próximo clique no canvas manda o texto pra lá (não é mais drag).
  function toggleMoveMode(idx){
    if(selectedTextIdx !== idx){
      selectedTextIdx = idx;
      movingTextMode = true;
    } else {
      movingTextMode = !movingTextMode;
    }
    duplicatingTextMode = false;
    updateTextLayersUI();
    render();
    Project.status(movingTextMode ? "Modo mover ativo: clique no canvas no destino" : "Modo mover desativado");
  }

  function nudgeTextLayer(idx, dx, dy){
    if(idx <0 || idx >= textLayers.length) return;
    const layer = textLayers[idx];
    let newX = layer.x + dx, newY = layer.y + dy;
    newX = Math.max(0, Math.min(32 - layer.text.length, newX));
    newY = Math.max(0, Math.min(29, newY));
    moveTextLayerTo(idx, newX, newY, true);
  }

  // Ativa o modo duplicar: o próximo clique no canvas cria uma cópia do texto lá (o
  // original permanece intacto, ao contrário do mover).
  function startDuplicateTextMode(idx){
    if(idx <0 || idx >= textLayers.length) return;
    selectedTextIdx = idx;
    duplicatingTextMode = true;
    movingTextMode = false;
    updateTextLayersUI();
    Project.status("Duplicar: clique no canvas onde o novo texto deve começar");
  }

  function duplicateTextLayerAt(idx, x, y){
    if(idx <0 || idx >= textLayers.length) return;
    const src = textLayers[idx];
    const newLayer = { text: src.text, pal: src.pal, offset: src.offset, chrPage: src.chrPage, x: 0, y: 0, id: Date.now() };
    const clampedX = Math.max(0, Math.min(32 - newLayer.text.length, x));
    const clampedY = Math.max(0, Math.min(29, y));
    captureUnderText(newLayer, positionsForRow(clampedX, clampedY, newLayer.text.length));
    writeTextAt(newLayer, clampedX, clampedY);
    textLayers.push(newLayer);
    selectedTextIdx = textLayers.length - 1;
    render(); updateTextLayersUI();
  }

  function updateTextLayersUI(){
    const container = document.getElementById('bgTextLayers'); if(!container) return;
    if(textLayers.length === 0){ container.innerHTML = '<div style="font-size:11px;color:#666;text-align:center;padding:8px">Nenhum texto<br><span style="font-size:9px">Clique no canvas no modo Texto para posicionar o cursor</span></div>'; return; }
    container.innerHTML = '';
    textLayers.forEach((layer, i)=>{
      const isSelected = i === selectedTextIdx;
      const isMoving = isSelected && movingTextMode;
      const div = document.createElement('div');
      div.style.cssText = `display:flex;flex-direction:column;gap:4px;background:${isSelected? (isMoving ? '#332a00' : '#222') :'#111'};border:1px solid ${isSelected? (isMoving ? '#ffcc00' : '#00ff00') :'#333'};border-radius:4px;padding:6px;cursor:pointer`;
      
      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
      topRow.innerHTML = `<div style="flex:1;min-width:0"><div style="color:${isSelected?'#ffcc00':'#fff'};font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${layer.text}">"${layer.text}"</div><div style="font-size:9px;color:#888">x:${layer.x} y:${layer.y} • pal:${layer.pal} • ${(layer.offset||'ascii').toUpperCase()} • ${layer.text.length} chars</div></div>`;
      topRow.onclick = () => { selectedTextIdx = i; textCursor.x = layer.x + layer.text.length; textCursor.y = layer.y; movingTextMode = false; textOffsetMode = layer.offset || 'ascii'; const offSel=document.getElementById('bgTextOffsetSelect'); if(offSel) offSel.value = textOffsetMode; updateCursorPos(); updateTextLayersUI(); render(); };
      
      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap';
      btnRow.innerHTML = `
        <button class="btn-tool" onclick="event.stopPropagation(); BG.editTextLayer(${i})" style="font-size:9px;padding:2px 5px;background:#2980b9;color:#fff">✏ Editar</button>
        <button class="btn-tool" onclick="event.stopPropagation(); BG.toggleMoveMode(${i})" style="font-size:9px;padding:2px 5px;background:${isMoving?'#ffcc00;color:#000':'#444;color:#fff'}">${isMoving?'🟡 Clique no destino':'📦 Mover'}</button>
        <button class="btn-tool" onclick="event.stopPropagation(); BG.startDuplicateTextMode(${i})" style="font-size:9px;padding:2px 5px;background:${(isSelected&&duplicatingTextMode)?'#ffcc00;color:#000':'#27ae60;color:#fff'}">${(isSelected&&duplicatingTextMode)?'🟡 Clique no destino':'⎘ Duplicar'}</button>
        <button class="btn-tool" onclick="event.stopPropagation(); BG.deleteTextLayer(${i})" style="font-size:9px;padding:2px 5px;background:#c0392b;color:#fff">🗑</button>
        <div style="display:flex;gap:1px;margin-left:auto">
          <button class="btn-tool" onclick="event.stopPropagation(); BG.nudgeTextLayer(${i},0,-1)" style="font-size:8px;padding:1px 3px">↑</button>
          <button class="btn-tool" onclick="event.stopPropagation(); BG.nudgeTextLayer(${i},-1,0)" style="font-size:8px;padding:1px 3px">←</button>
          <button class="btn-tool" onclick="event.stopPropagation(); BG.nudgeTextLayer(${i},1,0)" style="font-size:8px;padding:1px 3px">→</button>
          <button class="btn-tool" onclick="event.stopPropagation(); BG.nudgeTextLayer(${i},0,1)" style="font-size:8px;padding:1px 3px">↓</button>
        </div>
      `;
      
      div.appendChild(topRow);
      div.appendChild(btnRow);
      container.appendChild(div);
    });
  }

  function updateBGSelect(){
    const sel = document.getElementById('bgSelect'); if(!sel) return; sel.innerHTML = '';
    const optNew = document.createElement('option'); optNew.value = ''; optNew.textContent = currentEntryType ? '— tela sem nome —' : `✨ ${currentEntryName || 'nova tela (não salva)'}`;
    sel.appendChild(optNew);
    const bgs = Project.data?.backgrounds || [];
    const splashes = Project.data?.splashScreens || [];
    bgs.forEach(b => { const o = document.createElement('option'); o.value = `bg:${b.id}`; o.textContent = `🗺 ${b.name}`; sel.appendChild(o); });
    splashes.forEach(s => { const o = document.createElement('option'); o.value = `sp:${s.id}`; o.textContent = `🎬 ${s.name}`; sel.appendChild(o); });
    sel.value = currentEntryType ? `${currentEntryType === 'bg' ? 'bg' : 'sp'}:${currentEntryId}` : '';
    sel.onchange = e => {
      const v = e.target.value; if(!v) return;
      const [type, id] = v.split(':');
      loadEntry(type === 'bg' ? 'bg' : 'splash', id);
    };
  }

  function isEntryEmpty(e){
    const nt = e?.nametable || [];
    const hasTiles = nt.some(t => t !== 0);
    const hasText = e?.textLayers && e.textLayers.length > 0;
    return !hasTiles && !hasText;
  }

  function pruneEmptyEntries(){
    if(!Project.data) return;
    if(Array.isArray(Project.data.backgrounds)){
      Project.data.backgrounds = Project.data.backgrounds.filter(b => b.id === currentEntryId || !isEntryEmpty(b));
    }
    if(Array.isArray(Project.data.splashScreens)){
      Project.data.splashScreens = Project.data.splashScreens.filter(s => s.id === currentEntryId || !isEntryEmpty(s));
    }
  }

  // Cria uma tela nova em branco, já pedindo o nome. Ela só é gravada em
  // Project.data.backgrounds/splashScreens quando "Salvar como..." for clicado - até lá
  // fica só em memória, sem tipo definido.
  function newCanvas(){
    const name = prompt("Nome da nova tela:", `tela_${(Project.data?.backgrounds?.length||0)+(Project.data?.splashScreens?.length||0)+1}`);
    if(!name) return;
    nametable = new Array(960).fill(0); attributes = new Array(64).fill(0); collisionMap = new Array(960).fill(0);
    textLayers = []; selectedTextIdx = null; textUnderCache = {}; movingTextMode = false; duplicatingTextMode = false;
    currentEntryId = 'scr_'+Date.now(); currentEntryName = name.trim(); currentEntryType = null;
    updateTextLayersUI(); updateBGSelect(); render();
    Project.status(`Nova tela "${currentEntryName}" - use "Salvar como..." pra definir o tipo`);
  }

  function clearBackground(){
    nametable = new Array(960).fill(0); attributes = new Array(64).fill(0); collisionMap = new Array(960).fill(0); textLayers = []; selectedTextIdx = null; render();
  }

  // Carrega uma tela salva (background ou splash) e sincroniza a página do CHR trabalhada
  // com a página que essa tela realmente usa, pra nunca desenhar com metatiles de outra página.
  function loadEntry(type, id){
    const arr = type === 'splash' ? (Project.data?.splashScreens||[]) : (Project.data?.backgrounds||[]);
    const b = arr.find(e => e.id === id); if(!b) return;
    nametable = b.nametable ? [...b.nametable] : new Array(960).fill(0);
    attributes = b.attributes ? [...b.attributes] : new Array(64).fill(0);
    collisionMap = b.collisionMap ? [...b.collisionMap] : new Array(960).fill(0);
    textLayers = b.textLayers ? [...b.textLayers] : [];
    selectedTextIdx = null; textUnderCache = {}; movingTextMode = false; duplicatingTextMode = false;
    currentEntryId = b.id; currentEntryName = b.name; currentEntryType = type;
    if(b.chrPage != null && b.chrPage !== currentChrPage){
      currentChrPage = b.chrPage;
      const pageSel = document.getElementById('bgChrPageSelect'); if(pageSel) pageSel.value = currentChrPage;
      refreshMetatileList();
    }
    updateBGSelect(); updateTextLayersUI(); render();
  }

  // Salva a tela atual como Background ou Splash. Se ela já existia com o OUTRO tipo (ex:
  // era splash e agora clicou "Salvar como Background"), remove do array antigo e adiciona
  // no novo - a tela muda de status em vez de duplicar.
  function saveEntryAs(type){
    if(!Project.data) return;
    if(!Project.data.backgrounds) Project.data.backgrounds = [];
    if(!Project.data.splashScreens) Project.data.splashScreens = [];
    if(!currentEntryId){ currentEntryId = 'scr_'+Date.now(); if(!currentEntryName) currentEntryName = `tela_${Date.now()}`; }

    const targetArr = type === 'splash' ? Project.data.splashScreens : Project.data.backgrounds;
    const otherArr = type === 'splash' ? Project.data.backgrounds : Project.data.splashScreens;
    if(currentEntryType && currentEntryType !== type){
      const oi = otherArr.findIndex(e => e.id === currentEntryId);
      if(oi >= 0) otherArr.splice(oi, 1);
    }
    const payload = { id: currentEntryId, name: currentEntryName, nametable:[...nametable], attributes:[...attributes], textLayers:[...textLayers], chrPage: currentChrPage, created: Date.now() };
    if(type === 'bg') payload.collisionMap = [...collisionMap];
    const idx = targetArr.findIndex(e => e.id === currentEntryId);
    if(idx >= 0) targetArr[idx] = { ...targetArr[idx], ...payload };
    else targetArr.push(payload);

    const wasConverted = currentEntryType && currentEntryType !== type;
    currentEntryType = type;
    pruneEmptyEntries(); updateBGSelect();
    Project.status(wasConverted
      ? `"${currentEntryName}" convertido pra ${type === 'splash' ? 'Splash' : 'Background'}`
      : `${type === 'splash' ? 'Splash' : 'Background'} "${currentEntryName}" salvo`);
  }

  function loadAdjacentAfterDelete(type, removedId){
    const bgs = Project.data?.backgrounds || [];
    const splashes = Project.data?.splashScreens || [];
    if(type === 'bg'){
      if(bgs.length > 0){ loadEntry('bg', bgs[0].id); return; }
      if(splashes.length > 0){ loadEntry('splash', splashes[0].id); return; }
    } else {
      if(splashes.length > 0){ loadEntry('splash', splashes[0].id); return; }
      if(bgs.length > 0){ loadEntry('bg', bgs[0].id); return; }
    }
    currentEntryId = null; currentEntryName = ''; currentEntryType = null;
    nametable = new Array(960).fill(0); attributes = new Array(64).fill(0); collisionMap = new Array(960).fill(0);
    textLayers = []; updateTextLayersUI(); updateBGSelect(); render();
  }

  function deleteCurrentEntry(){
    if(!Project.data || !currentEntryId || !currentEntryType){ alert("Nenhuma tela salva selecionada para deletar."); return; }
    const arr = currentEntryType === 'bg' ? Project.data.backgrounds : Project.data.splashScreens;
    const idx = arr?.findIndex(e => e.id === currentEntryId);
    if(idx == null || idx < 0){ alert("Nenhuma tela salva selecionada para deletar."); return; }
    const nome = arr[idx].name || currentEntryId;
    if(!confirm(`Remover "${nome}"? Esta ação não pode ser desfeita.`)) return;
    arr.splice(idx, 1);
    loadAdjacentAfterDelete(currentEntryType, currentEntryId);
    Project.status(`Removido com sucesso`);
  }

  function exportASM(){
    const bgName = currentEntryName || 'bg';
    let out = `; BACKGROUND ${bgName}\n${bgName}_nametable:\n`;
    for(let y=0; y<30; y++) out += `  .byte ` + nametable.slice(y*32, y*32+32).map(t => "$" + (t%256).toString(16).padStart(2,"0")).join(",") + "\n";
    out += `${bgName}_attributes:\n  .byte ` + attributes.map(a => "$" + a.toString(16).padStart(2,"0")).join(",") + "\n";
    out += `${bgName}_hitbox:\n`; for(let y=0; y<30; y++) out += `  .byte ` + collisionMap.slice(y*32, y*32+32).map(c => "$" + (c||0).toString(16).padStart(2,"0")).join(",") + "\n";
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([out], {type:'text/plain'})); a.download = `${bgName}.asm`; a.click();
  }

  return {
    init: buildHTML, setTool, setCollisionType, setAllSubTilesCollision, applyMetatileHitboxToCanvas, 
    insertText, exportASM, fillAllEmpty, fillEntireScreen, applyAttrToAll, setTextOffsetMode,
    newCanvas, clearBackground, saveEntryAs, deleteCurrentEntry, loadEntry,
    editTextLayer, deleteTextLayer, toggleMoveMode, nudgeTextLayer, startDuplicateTextMode, duplicateTextLayerAt, clearTextSelection,
    loadBackgrounds: (arr)=>{ if(Project.data) Project.data.backgrounds=arr; updateBGSelect(); },
    loadSplashScreens: (arr)=>{ if(Project.data) Project.data.splashScreens=arr; updateBGSelect(); },
    getBackgrounds: ()=> Project.data?.backgrounds||[],
    getSplashScreens: ()=> Project.data?.splashScreens||[],
    getNametable: ()=> [...nametable], getAttributes: ()=> [...attributes], getCollisionMap: ()=> [...collisionMap]
  };
})();
document.addEventListener('DOMContentLoaded', ()=>{ if(document.getElementById('mod-bg')?.classList.contains('active')) BG.init(); });