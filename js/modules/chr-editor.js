// CHR EDITOR v5.8 - metatile com 1 camada overlay (mais cores via empilhamento)
const CHR = (() => {
  let chrBuffer = new Uint8Array(8192);
  let palettes = [[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]];
  // Banco de paletas (biblioteca) — só 8 slots PPU ativos (palettes[0..7])
  let paletteBank = [];
  // paletteActive[i] = id da entrada do banco ligada ao slot PPU i (0-3 BG, 4-7 SPR)
  let paletteActive = [null,null,null,null,null,null,null,null];
  let activePal = 0, activeSlot = 1;
  let _palBankSel = 0; // índice selecionado na lista do banco
  let currentBank = 0, gridW=2, gridH=2, selectedTiles=[0,1,16,17], selectedFlips=[0,0,0,0], activeSlotIdx=0, isDrawing=false, undoStack=[];
  // selectedFlips: 0=none 1=H 2=V 3=HV — flip de OAM por célula (não altera pixels do CHR)
  // Camada overlay (máx. 1): segunda pilha de tiles/paleta para mais cores em runtime
  let editLayer = 0;           // 0 = base, 1 = overlay
  let overlayEnabled = false;
  let overlayTiles = [];       // mesmos slots que selectedTiles quando ativo
  let overlayFlips = [];
  let overlayPal = 5;          // subpalette sprite default (SPR1)
  let overlayDx = 0, overlayDy = 0;
  let metatiles = [];
  let sheetCanvas, sheetCtx, zoomCanvas, zoomCtx, previewCanvas, previewCtx;
  let tool='pen', toolStart=null, toolPreviewEnd=null, copyDrag=null, clipboard=null, sheetClipboardTile=null;
  // Fila de tiles copiados (snapshots 16 bytes). Clique na folha em modo Copiar Tile adiciona;
  // em modo Colar Tile cola o item selecionado (tileQueueActive).
  let tileQueue = [];
  let tileQueueActive = 0;
  const TILE_QUEUE_MAX = 64;

  // ---- Import imagem → pixel art (passo 1: crop / resize / grid em tiles) ----
  let imgImport = {
    img: null,
    sel: null,           // {x,y,w,h}
    gridTW: 2, gridTH: 2,
    drag: null,
    pendingMeta: null,
    lastOutput: null,
    viewZoom: 1,
    bw: false,
    contrast: 1,         // 0.2–3 · só no caminho PB / cinza
    sampleN: 1,
    previewPal: 0,       // legado (não usado na quantize)
    importPal: [15, 0, 16, 48], // 4 índices NES livres p/ quantize/preview
    importPalSlot: 0,    // slot ativo no modal editar paleta
    eyedrop: false,      // conta-gotas na imagem fonte
    autoPal: false,      // auto-preenche importPal a partir das cores do grid
    colorMap: [0,1,2,3],
    // buffer editável na resolução de saída (após nearest); flood fill aqui
    editCanvas: null,    // canvas outW×outH com índices já em cores da paleta (RGB)
    editIndices: null,   // Uint8Array slot 0–3 por pixel
    paintSlot: 1,        // cor ativa para flood/pen (0–3)
    editMode: false,     // edição no preview ativa
    editTool: 'flood',   // 'flood' | 'pen'
    penSize: 1,          // tamanho em células do grid de saída (1 célula = 1 px da saída)
    editUndo: [],        // snapshots de Uint8Array indices
    previewZoom: 4,      // escala de exibição do preview (CSS)
    cellSrcW: 8,         // px por célula na fonte (sel.w = gridTW * cellSrcW)
    cellSrcH: 8,
    showPrevGrid: true
  };

  // Import de outro .nms (tiles + metatiles → fila)
  let nmsImport = {
    name: '',
    chr: null,           // Uint8Array
    metatiles: [],
    bank: 0,             // página 0/1 visualizada
    // seleção atual: lista de { absIdx, data[16] }
    picked: [],
    // se veio de um metatile escolhido no menu
    pendingMeta: null,   // { w,h, name, layout: [absIdx,...] } no arquivo fonte
    characters: null     // do .tile (animações) — reservado para merge futuro no CHAR
  };

  function buildHTML(){
    const root = document.getElementById('chrModuleRoot'); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div id="chrMetatileToolbar" style="display:flex;gap:6px;align-items:center;padding:6px 10px;background:#252526;border-bottom:1px solid #333;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;white-space:nowrap">
          <button type="button" class="icon-btn" onclick="CHR.openImageImport()" title="Importar PNG/JPG e preparar crop/grid em tiles">🖼</button>
          <button type="button" class="icon-btn" onclick="CHR.openNmsImport()" title="Importar tiles/metatiles de .nms, .tile ou .chr">📦</button>
          <button type="button" class="icon-btn" onclick="CHR.importCHR()" title="Importar arquivo .chr / .bin / .nes no buffer atual">🧱</button>
          <button type="button" class="icon-btn" onclick="Project.exportCHR()" title="Exportar buffer CHR atual">⬇️</button>
          <input type="file" id="importNms_internal" accept=".nms,.tile,.chr,.bin,application/json,application/octet-stream" style="display:none">
          <input type="file" id="importCHR_internal" accept=".chr,.bin,.nes" style="display:none">
          <input type="file" id="importImage_internal" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none">
          <span style="width:1px;height:24px;background:#444;margin:0 2px"></span>
          <span style="font-size:10px;color:#888;margin-right:2px">TOOLS</span>
          <button type="button" class="icon-btn tool-btn active" data-tool="pen" onclick="CHR.setTool('pen')" title="Pen">🖊️</button>
          <button type="button" class="icon-btn tool-btn" data-tool="erase" onclick="CHR.setTool('erase')" title="Erase">🧹</button>
          <button type="button" class="icon-btn tool-btn" data-tool="line" onclick="CHR.setTool('line')" title="Line">📏</button>
          <button type="button" class="icon-btn tool-btn" data-tool="rect" onclick="CHR.setTool('rect')" title="Rect">⬜</button>
          <button type="button" class="icon-btn tool-btn" data-tool="circle" onclick="CHR.setTool('circle')" title="Circle">⭕</button>
          <button type="button" class="icon-btn tool-btn" data-tool="fill" onclick="CHR.setTool('fill')" title="Fill">🪣</button>
          <button type="button" class="icon-btn tool-btn" data-tool="copy" onclick="CHR.setTool('copy')" title="Copy pixels">📋</button>
          <button type="button" class="icon-btn tool-btn" data-tool="paste" onclick="CHR.setTool('paste')" title="Paste pixels">📌</button>
          <span style="width:1px;height:24px;background:#444;margin:0 2px"></span>
          <button type="button" class="icon-btn tool-btn" data-tool="sheetcopy" onclick="CHR.setTool('sheetcopy')" title="Copiar Tile (fila)">🗐</button>
          <button type="button" class="icon-btn tool-btn" data-tool="sheetpaste" onclick="CHR.setTool('sheetpaste')" title="Colar Tile">📥</button>
          <button type="button" class="icon-btn tool-btn" data-tool="sheetclear" onclick="CHR.setTool('sheetclear')" title="Clear Tile">🗑</button>
          <span style="font-size:10px;color:#888" id="lblSheetClipboard">Fila: 0</span>
          <span style="width:1px;height:24px;background:#444;margin:0 2px"></span>
          <button type="button" class="icon-btn" onclick="CHR.undo()" title="Undo">↩️</button>
          <span style="margin-left:auto;font-size:10px;color:#888" id="lblMetatileSize">2x2 PT0</span>
          <span style="font-size:10px;color:#888">Tiles: <b id="lblTileIndices" style="color:#ffcc00">$00</b></span>
        </div>

        <div style="display:flex;flex:1;overflow:hidden;min-height:0">
          <div style="width:560px;min-width:560px;background:#181818;padding:12px;display:flex;flex-direction:column;gap:8px;overflow:auto;border-right:1px solid #333">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <select id="bankSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px"></select>
              <button class="btn-tool" style="background:#c0392b;color:#fff" onclick="CHR.addBank()">+ BANK</button>
              <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#ccc;cursor:pointer"><input type="checkbox" id="chkShowGrid"> grid</label>
            </div>
            <canvas id="sheetCanvas" width="512" height="512" style="border:2px solid #333;background:#000;image-rendering:pixelated;cursor:crosshair;display:block"></canvas>
          </div>

          <div style="flex:1;background:#1e1e1e;padding:12px;display:flex;flex-direction:column;gap:10px;overflow:auto;min-width:460px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <h3 style="font-size:11px;color:#4ec9b0;margin:0">EDIÇÃO METATILE</h3>
            </div>
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:#111;border:1px solid #333;border-radius:6px;padding:8px">
              <span style="font-size:10px;color:#4ec9b0;font-weight:700">METATILE</span>
              <select id="tileColsSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:3px"></select>
              <span style="color:#666">×</span>
              <select id="tileRowsSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:3px"></select>
              <button class="btn-tool" onclick="CHR.applyGridResize()" style="background:#2980b9;color:#fff;font-size:11px;padding:3px 8px">Redimensionar</button>
              <span style="font-size:11px;color:#888">Slot <b id="lblActiveSlot" style="color:#ffcc00">1/4</b></span>
              <button class="btn-tool" onclick="CHR.autoFill()">Auto</button>
              <span style="color:#444;margin:0 4px">|</span>
              <select id="metatileSelect" style="min-width:160px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px" onchange="CHR.onMetatileSelectChange()"><option value="">— Metatiles —</option></select>
              <button class="btn-tool" style="background:#27ae60;color:#fff" onclick="CHR.saveMetatile()">💾 Save</button>
              <button class="btn-tool" style="background:#4ec9b0;color:#111" onclick="CHR.newTile()">✨ New</button>
              <button class="btn-tool" style="background:#f39c12;color:#111" onclick="CHR.renameMetatile()">✏️ Rename</button>
              <button class="btn-tool" onclick="CHR.deleteMetatile()">🗑️</button>
            </div>

            <!-- FILA DE TILES (copiar/colar) - mesma ideia do seletor rápido -->
            <div id="tileQueuePanel" style="background:#111;border:1px solid #3a5a3a;border-radius:6px;padding:8px;display:none">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
                <h4 style="font-size:10px;color:#7dcea0;margin:0">FILA DE TILES COPIADOS</h4>
                <span style="font-size:9px;color:#666">clique no item pra selecionar · × remove · Colar Tile usa o selecionado</span>
              </div>
              <div id="tileQueueSelector" style="display:flex;gap:6px;flex-wrap:wrap;min-height:40px"></div>
            </div>

            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
              <h4 style="font-size:10px;color:#4ec9b0;margin:0 0 6px">ZOOM / EDIÇÃO</h4>
              <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
                <div>
                  <canvas id="zoomCanvas" width="320" height="320" style="border:1px solid #555;background:#000;image-rendering:pixelated;cursor:crosshair;display:block;min-width:320px;min-height:320px"></canvas>
                  <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#888;cursor:pointer;margin-top:6px"><input type="checkbox" id="chkMetatileGrid" checked onchange="CHR.renderAll()"> grid (tiles + pixels)</label>
                </div>
                <div style="flex:1;min-width:120px">
                  <div style="font-size:10px;color:#888;margin-bottom:6px">PREVIEW 1:1 + PALETA RÁPIDA</div>
                  <canvas id="previewCanvas" width="128" height="128" style="border:1px solid #333;background:#000;image-rendering:pixelated;display:block"></canvas>
                  <div style="display:flex;gap:6px;margin-top:10px" id="quickColors"></div>
                  <div style="font-size:10px;color:#666;margin-top:8px;line-height:1.4">Esquerdo desenha · direito pega cor · teclas 1–4</div>
                  <div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap">
                    <button type="button" class="icon-btn" onclick="CHR.shift('left')" title="Shift left">←</button>
                    <button type="button" class="icon-btn" onclick="CHR.shift('up')" title="Shift up">↑</button>
                    <button type="button" class="icon-btn" onclick="CHR.shift('down')" title="Shift down">↓</button>
                    <button type="button" class="icon-btn" onclick="CHR.shift('right')" title="Shift right">→</button>
                    <button type="button" class="icon-btn" onclick="CHR.clearGroup()" title="Clear group" style="background:#5a1a1a;border-color:#7d2525">🧹</button>
                  </div>
                  <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
                    <button type="button" class="icon-btn" onclick="CHR.flipH()" title="Flip H (pixels do grupo)">↔️</button>
                    <button type="button" class="icon-btn" onclick="CHR.flipV()" title="Flip V (pixels do grupo)">↕️</button>
                    <button type="button" class="icon-btn" onclick="CHR.rotate()" title="Rotate 90°">🔄</button>
                    <button type="button" class="icon-btn" onclick="CHR.toggleSlotFlipH()" title="Flip H da célula (OAM)" style="background:#1a3a1a;border-color:#2a5a2a">↔</button>
                    <button type="button" class="icon-btn" onclick="CHR.toggleSlotFlipV()" title="Flip V da célula (OAM)" style="background:#1a3a1a;border-color:#2a5a2a">↕</button>
                    <span id="lblSlotFlip" style="font-size:10px;color:#888;min-width:28px">—</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- SELETOR RÁPIDO DE TILES -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
              <h4 style="font-size:10px;color:#4ec9b0;margin-bottom:6px">SELETOR BASE — tiles do metatile (clique = slot ativo)</h4>
              <div id="quickTileSelector" style="display:flex;gap:6px;flex-wrap:wrap"></div>
            </div>

            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
              <h4 style="font-size:10px;color:#4ec9b0;margin-bottom:6px">CAMADAS DO METATILE</h4>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <button type="button" id="btnLayer0" class="btn-tool" onclick="CHR.setEditLayer(0)" style="font-size:11px;padding:3px 10px">Base</button>
                <button type="button" id="btnLayer1" class="btn-tool" onclick="CHR.setEditLayer(1)" style="font-size:11px;padding:3px 10px">Overlay</button>
                <button type="button" class="btn-tool" onclick="CHR.removeOverlay()" title="Remove a camada overlay deste metatile" style="font-size:11px;padding:3px 10px;background:#7d2525;color:#fff;margin-left:6px">🗑 Remover overlay</button>
                <span style="font-size:10px;color:#666;margin-left:4px">pal</span>
                <select id="overlayPalSelect" onchange="CHR.setOverlayPal(this.value)" style="background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:2px 4px;font-size:11px">
                  <option value="4">SPR0</option>
                  <option value="5">SPR1</option>
                  <option value="6">SPR2</option>
                  <option value="7">SPR3</option>
                  <option value="0">BG0</option>
                  <option value="1">BG1</option>
                  <option value="2">BG2</option>
                  <option value="3">BG3</option>
                </select>
                <span style="font-size:10px;color:#666">dx</span>
                <input id="overlayDx" type="number" min="-8" max="8" value="0" onchange="CHR.setOverlayOffset()" style="width:44px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:2px;font-size:11px">
                <span style="font-size:10px;color:#666">dy</span>
                <input id="overlayDy" type="number" min="-8" max="8" value="0" onchange="CHR.setOverlayOffset()" style="width:44px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:2px;font-size:11px">
                <span id="lblEditLayer" style="font-size:10px;color:#ffcc00;margin-left:auto">editando: Base</span>
              </div>
            </div>

            <!-- PREVIEW DE METATILES - também voltou -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
              <h4 style="font-size:10px;color:#4ec9b0;margin-bottom:6px">METATILES NO PROJETO - clique pra carregar ( <span id="lblMetatileCount">0</span> )</h4>
              <div id="metatilePreview" style="display:flex;gap:8px;flex-wrap:wrap;max-height:160px;overflow:auto"></div>
            </div>

          </div>
        </div>

        <div id="chrPalettePanel" class="chr-palette-panel collapsed">
          <div class="chr-palette-bar">
            <button type="button" id="chrPaletteToggle" class="icon-btn" title="Expandir / recolher paletas" onclick="CHR.togglePalettePanel()">▸</button>
            <span class="chr-palette-bar-title">Paletas</span>
            <div id="chrPaletteCompact" class="chr-palette-compact" title="Slots PPU ativos"></div>
            <span id="chrPaletteBarHint" class="chr-palette-bar-hint">clique ▸ para expandir banco e master</span>
          </div>
          <div class="chr-palette-body">
            <!-- 1) Paletas PPU -->
            <div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">
              <div style="min-width:280px">
                <h4 style="font-size:11px;color:#4ec9b0;margin:0 0 8px">PALETAS PPU (BG + SPR)</h4>
                <div id="subpalettesContainer" style="display:flex;flex-direction:column;gap:8px"></div>
              </div>
              <div style="min-width:160px;background:#1a1a2e;border:1px solid #2a2a4a;border-radius:6px;padding:10px;font-size:10px;color:#888;line-height:1.4">PT0 = $0000 BG padrão<br>PT1 = $1000 segunda página<br>Build detecta automaticamente<br><br>Tools: Pen, Line, Rect, Circle, Fill, Copy, Paste</div>
            </div>
            <!-- 2) Master NES -->
            <div>
              <h4 style="font-size:11px;color:#4ec9b0;margin:0 0 8px">PALETA MASTER NES (clique pra trocar cor do slot)</h4>
              <div id="masterPaletteGrid" style="display:flex;flex-direction:column;gap:2px;background:#111;padding:8px;border-radius:6px;border:1px solid #333;width:fit-content"></div>
            </div>
            <!-- 3) Banco -->
            <div style="border:1px solid #333;border-radius:6px;background:#1a1a1a;padding:10px">
              <h4 style="font-size:11px;color:#c39bd3;margin:0 0 8px">BANCO DE PALETAS</h4>
              <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
                <div style="flex:1;min-width:220px">
                  <div id="paletteBankList" data-palette-bank-list style="max-height:140px;overflow:auto;border:1px solid #333;border-radius:4px;background:#0a0a0a;margin-bottom:6px"></div>
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button type="button" class="btn-tool" onclick="CHR.paletteBankAdd()" style="font-size:9px;flex:1" title="Nova entrada no banco">+ Nova</button>
                    <button type="button" class="btn-tool" onclick="CHR.paletteBankApply()" style="font-size:9px;flex:1;background:#007acc;color:#fff" title="Aplicar no slot PPU ativo">→ Ativo</button>
                    <button type="button" class="btn-tool" onclick="CHR.paletteBankRename()" style="font-size:9px">✎</button>
                    <button type="button" class="btn-tool" onclick="CHR.paletteBankDelete()" style="font-size:9px;background:#c0392b;color:#fff">✕</button>
                  </div>
                </div>
                <div style="min-width:200px;flex:0 0 220px">
                  <div style="font-size:9px;color:#666;margin-bottom:2px">Ativas BG</div>
                  <div id="paletteActiveBG" style="margin-bottom:8px"></div>
                  <div style="font-size:9px;color:#666;margin-bottom:2px">Ativas SPR</div>
                  <div id="paletteActiveSPR"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style="height:24px;background:#007acc;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:11px"><span id="statusLeft">Pronto - seletor rápido restaurado</span><span id="statusRight">PT0/PT1 + $102 fix</span></div>

        <!-- MODAL: Import imagem -->
        <div id="imgImportModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10000;align-items:center;justify-content:center">
          <div style="background:#1e1e1e;border:1px solid #444;border-radius:10px;width:min(1100px,98vw);max-height:94vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
            <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #333;flex-wrap:wrap">
              <h3 style="margin:0;font-size:14px;color:#4ec9b0">🖼 Import imagem → tiles NES</h3>
              <span style="font-size:11px;color:#888">seleção · grid em pixels · preview live</span>
              <button class="btn-tool" onclick="CHR.closeImageImport()" style="margin-left:auto;background:#c0392b;color:#fff">✕ Fechar</button>
            </div>
            <div style="display:flex;flex:1;min-height:0;overflow:hidden">
              <div style="flex:1;padding:10px;overflow:auto;display:flex;flex-direction:column;gap:6px;background:#111;min-width:0">
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                  <button class="btn-tool" onclick="CHR.imgImportZoom(1)" style="font-size:11px">🔍+ Zoom</button>
                  <button class="btn-tool" onclick="CHR.imgImportZoom(-1)" style="font-size:11px">🔍− Zoom</button>
                  <button class="btn-tool" onclick="CHR.imgImportZoom(0)" style="font-size:11px">100%</button>
                  <span id="imgImportZoomLbl" style="font-size:10px;color:#888">zoom 1×</span>
                  <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#ccc;margin-left:8px;cursor:pointer">
                    <input type="checkbox" id="imgImportBW" onchange="CHR.imgImportSetBW(this.checked)"> PB
                  </label>
                  <span style="font-size:10px;color:#888;margin-left:6px">Contraste</span>
                  <input id="imgImportContrast" type="range" min="20" max="300" value="100" title="Contraste PB" oninput="CHR.imgImportSetContrast(this.value)" style="width:100px;vertical-align:middle">
                  <span id="imgImportContrastLbl" style="font-size:9px;color:#666">1.00</span>
                  <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#ccc;cursor:pointer">
                    <input type="checkbox" id="imgImportShowGrid" checked onchange="CHR.imgImportRedraw()"> Grid px
                  </label>

                </div>
                <div style="overflow:auto;flex:1;border:1px solid #333;background:#0a0a0a">
                  <canvas id="imgImportCanvas" width="640" height="480" style="background:#000;image-rendering:pixelated;cursor:crosshair;display:block"></canvas>
                </div>
                <div style="font-size:10px;color:#666">Arraste = seleção · alças = redimensionar · grid de <b style="color:#7dcea0">pixels</b> dentro da seleção (tiles×8)</div>
              </div>
              <div style="width:320px;min-width:300px;border-left:1px solid #333;padding:10px;overflow:auto;display:flex;flex-direction:column;gap:10px;background:#181818">
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
                  <h4 style="font-size:11px;color:#ffcc00;margin:0 0 6px">Arquivo</h4>
                  <button class="btn-tool" onclick="document.getElementById('importImage_internal').click()" style="width:100%;background:#2980b9;color:#fff">📂 Escolher imagem</button>
                  <div id="imgImportFileInfo" style="font-size:10px;color:#888;margin-top:6px;line-height:1.4">Nenhuma imagem</div>
                </div>
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
                  <h4 style="font-size:11px;color:#4ec9b0;margin:0 0 6px">Seleção (px)</h4>
                  <div style="display:grid;grid-template-columns:28px 1fr 28px 1fr;gap:4px;align-items:center;font-size:10px;color:#888">
                    <span>X</span><input id="imgImportCropX" type="number" min="0" value="0" onchange="CHR.imgImportSetCropFromInputs()" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                    <span>Y</span><input id="imgImportCropY" type="number" min="0" value="0" onchange="CHR.imgImportSetCropFromInputs()" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                    <span>W</span><input id="imgImportCropW" type="number" min="1" value="16" onchange="CHR.imgImportSetCropFromInputs()" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                    <span>H</span><input id="imgImportCropH" type="number" min="1" value="16" onchange="CHR.imgImportSetCropFromInputs()" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                  </div>
                  <div style="font-size:10px;color:#888;margin:8px 0 4px">Tamanho da célula (px) — redimensiona a seleção</div>
                  <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
                    <span style="font-size:10px;color:#888">W</span>
                    <input id="imgImportCellW" type="number" min="1" max="256" value="8" step="1" onchange="CHR.imgImportSetCellSize()" oninput="CHR.imgImportSetCellSize()" style="width:56px;background:#000;color:#ffcc00;border:1px solid #444;border-radius:3px;padding:3px">
                    <span style="font-size:10px;color:#888">H</span>
                    <input id="imgImportCellH" type="number" min="1" max="256" value="8" step="1" onchange="CHR.imgImportSetCellSize()" oninput="CHR.imgImportSetCellSize()" style="width:56px;background:#000;color:#ffcc00;border:1px solid #444;border-radius:3px;padding:3px">
                    <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#ccc;cursor:pointer;margin-left:4px" title="Varre as células do grid e preenche até 4 cores NES na ordem em que aparecem">
                      <input type="checkbox" id="imgImportAutoPal" onchange="CHR.imgImportSetAutoPal(this.checked)"> Auto paleta
                    </label>
                  </div>
                  <button class="btn-tool" onclick="CHR.imgImportApplyCrop()" style="width:100%;margin-top:2px;background:#e67e22;color:#fff;font-weight:bold;font-size:11px">✂ Crop (descartar resto)</button>
                  <div style="display:flex;gap:4px;margin-top:4px">
                    <button class="btn-tool" onclick="CHR.imgImportClearSelection()" style="flex:1;font-size:10px">Limpar sel.</button>
                    <button class="btn-tool" onclick="CHR.imgImportSelectAll()" style="flex:1;font-size:10px">Tudo</button>
                  </div>
                </div>
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
                  <h4 style="font-size:11px;color:#7dcea0;margin:0 0 6px">Grade (tiles → grid px)</h4>
                  <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
                    <input id="imgImportGridW" type="number" min="1" max="32" value="2" onchange="CHR.imgImportSetGrid()" style="width:52px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                    <span style="color:#888">×</span>
                    <input id="imgImportGridH" type="number" min="1" max="32" value="2" onchange="CHR.imgImportSetGrid()" style="width:52px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                    <span style="font-size:10px;color:#888">tiles</span>
                  </div>
                  <div style="font-size:10px;color:#666" id="imgImportGridPxInfo">Célula 8×8 · seleção 16×16 · saída 16×16</div>
                </div>
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
                  <h4 style="font-size:11px;color:#e67e22;margin:0 0 6px">Conversão</h4>
                  <div style="font-size:10px;color:#888;line-height:1.4" id="imgImportOutInfo">—</div>
                </div>
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
                  <h4 style="font-size:11px;color:#c39bd3;margin:0 0 6px">Remap de slots (0–3)</h4>
                  <div style="font-size:9px;color:#666;margin-bottom:6px">Após quantizar, redireciona cada índice. Não altera a paleta do projeto.</div>
                  <div id="imgImportColorMap" style="display:flex;gap:4px;flex-wrap:wrap;align-items:flex-end"></div>
                </div>
                <div style="background:#0a0a0a;border:1px solid #333;border-radius:6px;padding:8px">
                  <h4 style="font-size:11px;color:#4ec9b0;margin:0 0 6px">Preview live (só seleção → saída)</h4>
                  <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
                    <button type="button" class="btn-tool" onclick="CHR.imgImportPreviewZoom(1)" style="font-size:10px">🔍+</button>
                    <button type="button" class="btn-tool" onclick="CHR.imgImportPreviewZoom(-1)" style="font-size:10px">🔍−</button>
                    <button type="button" class="btn-tool" onclick="CHR.imgImportPreviewZoom(0)" style="font-size:10px">fit</button>
                    <span id="imgImportPrevZoomLbl" style="font-size:9px;color:#888">zoom 4×</span>
                    <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#888;cursor:pointer;margin-left:6px">
                      <input type="checkbox" id="imgImportPrevGrid" checked onchange="CHR.imgImportSetPrevGrid(this.checked)"> Grid px
                    </label>
                    <span style="font-size:9px;color:#555">scroll = zoom</span>
                  </div>
                  <div id="imgImportPrevScroll" style="max-height:220px;overflow:auto;border:1px solid #333;background:#0a0a0a;border-radius:4px;text-align:center">
                    <canvas id="imgImportOutCanvas" width="64" height="64" style="image-rendering:pixelated;border:1px solid #555;background:#222;display:inline-block;vertical-align:middle;margin:8px"></canvas>
                  </div>
                  <div style="font-size:9px;color:#666;text-align:center;margin-top:4px" id="imgImportPrevLbl">—</div>
                  <label style="font-size:10px;color:#888;display:block;margin-top:10px">Amostragem nearest (1–4)</label>
                  <input id="imgImportSampleN" type="range" min="1" max="4" value="1" oninput="CHR.imgImportSetSample(this.value)" style="width:100%">
                  <div style="font-size:10px;color:#666;margin-bottom:8px">N=<span id="imgImportSampleLbl">1</span> · supersample antes do shrink final</div>
                  <div style="border-top:1px solid #333;padding-top:8px;margin-top:4px">
                    <div style="font-size:10px;color:#4ec9b0;margin-bottom:4px">Editar cores (pré-import)</div>
                    <button class="btn-tool" onclick="CHR.imgImportPosterize()" style="width:100%;font-size:10px;margin-bottom:4px;background:#8e44ad;color:#fff">PB / quantize → 4 cores no preview</button>
                    <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#ccc;cursor:pointer;margin:4px 0">
                      <input type="checkbox" id="imgImportEditMode" onchange="CHR.imgImportSetEditMode(this.checked)"> Editar no preview
                    </label>
                    <div style="display:flex;gap:6px;margin:6px 0;flex-wrap:wrap;align-items:center">
                      <button type="button" id="imgImportToolFlood" class="icon-btn tool-btn" onclick="CHR.imgImportSetEditTool('flood')" title="Flood fill">🪣</button>
                      <button type="button" id="imgImportToolPen" class="icon-btn tool-btn" onclick="CHR.imgImportSetEditTool('pen')" title="Pen">⬜</button>
                      <button type="button" id="imgImportToolEyedrop" class="icon-btn tool-btn" onclick="CHR.imgImportSetEditTool('eyedrop')" title="Conta-gotas — cor da imagem → slot ativo">💧</button>
                      <button type="button" id="imgImportToolUndo" class="icon-btn tool-btn" onclick="CHR.imgImportEditUndo()" title="Undo">↩️</button>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;margin:4px 0;font-size:10px;color:#888">
                      <span>Pen size (células)</span>
                      <input id="imgImportPenSize" type="number" min="1" max="8" value="1" onchange="CHR.imgImportSetPenSize(this.value)" style="width:44px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:2px">
                    </div>
                    <div style="font-size:9px;color:#666;margin-bottom:4px">Cor ativa (slots 0–3):</div>
                    <div id="imgImportPaintSlots" style="display:flex;gap:4px"></div>
                    <button type="button" class="btn-tool" onclick="CHR.imgImportOpenPalModal()" style="width:100%;font-size:10px;margin-top:6px;background:#8e44ad;color:#fff">🎨 Editar paleta</button>
                    <button class="btn-tool" onclick="CHR.imgImportClearEdit()" style="width:100%;font-size:10px;margin-top:4px">Descartar edições</button>
                  </div>
                </div>
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;cursor:pointer;margin:4px 0">
                  <input type="checkbox" id="imgImportAddToBank" checked> Adicionar paleta ao banco no converter
                </label>
                <button class="btn-tool" onclick="CHR.imgImportConfirmStep1()" style="background:#27ae60;color:#fff;padding:10px;font-weight:bold">→ Converter e enfileirar tiles</button>
              </div>
            </div>
          </div>
        </div>


        <!-- MODAL: editar 4 cores do import (paleta NES livre) -->
        <div id="imgImportPalModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:10050;align-items:center;justify-content:center">
          <div style="background:#1e1e1e;border:1px solid #555;border-radius:10px;width:min(520px,96vw);max-height:90vh;overflow:auto;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,0.65)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <h3 style="margin:0;font-size:14px;color:#c39bd3">Paleta de importação (4 cores)</h3>
              <button type="button" class="btn-tool" onclick="CHR.imgImportClosePalModal()" style="font-size:12px">✕</button>
            </div>
            <div style="font-size:10px;color:#888;margin-bottom:8px">Selecione um slot (0–3), depois clique numa cor da tabela NES — ou use <b>💧 Conta-gotas</b> na imagem original (cor NES mais próxima). Ordem 0,1,2,3 na quantização.</div>
            <div style="display:flex;gap:8px;margin-bottom:12px" id="imgImportPalModalSlots"></div>
            <div style="font-size:10px;color:#666;margin-bottom:4px">Paleta NES ($00–$3F)</div>
            <div id="imgImportPalModalGrid" style="display:grid;grid-template-columns:repeat(16,1fr);gap:2px"></div>
            <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
              <button type="button" class="btn-tool" onclick="CHR.imgImportResetImportPal()" style="font-size:11px">Reset padrão</button>
              <button type="button" class="btn-tool" onclick="CHR.imgImportClosePalModal()" style="font-size:11px;background:#27ae60;color:#fff">OK</button>
            </div>
          </div>
        </div>

        <!-- MODAL: Import metatiles de outro .nms -->
        <div id="nmsImportModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10000;align-items:center;justify-content:center">
          <div style="background:#1e1e1e;border:1px solid #444;border-radius:10px;width:min(980px,96vw);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
            <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #333;flex-wrap:wrap">
              <h3 style="margin:0;font-size:14px;color:#c39bd3">📦 Import metatiles</h3>
              <span style="font-size:11px;color:#888">.nms / .tile (tiles+metatiles) ou .chr bruto → fila de colar</span>
              <button class="btn-tool" onclick="CHR.closeNmsImport()" style="margin-left:auto;background:#c0392b;color:#fff">✕ Fechar</button>
            </div>
            <div style="display:flex;flex:1;min-height:0;overflow:hidden">
              <div style="flex:1;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:8px;background:#111">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <button class="btn-tool" onclick="document.getElementById('importNms_internal').click()" style="background:#2980b9;color:#fff">📂 Abrir .nms / .tile / .chr</button>
                  <span id="nmsImportFileInfo" style="font-size:11px;color:#888">Nenhum arquivo</span>
                  <select id="nmsImportBank" onchange="CHR.nmsImportSetBank()" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px;margin-left:auto">
                    <option value="0">PT0 $0000</option>
                    <option value="1">PT1 $1000</option>
                  </select>
                </div>
                <canvas id="nmsImportSheet" width="512" height="512" style="border:2px solid #444;background:#000;image-rendering:pixelated;cursor:crosshair;display:block;max-width:100%"></canvas>
                <div style="font-size:10px;color:#666">Clique nos tiles para adicionar/remover da seleção (borda amarela = selecionado)</div>
              </div>
              <div style="width:300px;min-width:300px;border-left:1px solid #333;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;background:#181818">
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;flex:1;display:flex;flex-direction:column;min-height:0">
                  <h4 style="font-size:11px;color:#7dcea0;margin:0 0 8px">Metatiles do arquivo</h4>
                  <div id="nmsImportMtList" style="flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px;min-height:120px">
                    <div style="font-size:10px;color:#555">Abra um .nms para listar</div>
                  </div>
                </div>
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
                  <h4 style="font-size:11px;color:#ffcc00;margin:0 0 6px">Seleção <span id="nmsImportPickCount" style="color:#888">(0)</span></h4>
                  <div id="nmsImportPickPreview" style="display:flex;flex-wrap:wrap;gap:4px;max-height:100px;overflow:auto;min-height:36px"></div>
                  <button class="btn-tool" onclick="CHR.nmsImportClearPicked()" style="width:100%;margin-top:8px;font-size:10px">Limpar seleção</button>
                </div>
                <div style="font-size:9px;color:#666;line-height:1.4">
                  Clique num metatile da lista para selecionar todos os tiles dele (e marcar layout para remontar).<br>
                  Ou escolha tiles soltos no grid.
                </div>
                <button class="btn-tool" onclick="CHR.nmsImportConfirm()" style="background:#27ae60;color:#fff;padding:10px;font-weight:bold">→ Enfileirar e colar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    sheetCanvas=document.getElementById('sheetCanvas'); sheetCtx=sheetCanvas.getContext('2d');
    zoomCanvas=document.getElementById('zoomCanvas'); zoomCtx=zoomCanvas.getContext('2d');
    previewCanvas=document.getElementById('previewCanvas'); previewCtx=previewCanvas.getContext('2d');
    attachEvents(); populateSelects(); updateBankSelect(); ensurePaletteMatchesBank(); initPalUI(); setGrid(gridW,gridH); updateMetatileSelect(); tool='pen'; updateLayerUI(); renderAll();
  }

  function parseNES(buffer) {
      // Valida assinatura 'NES' + 0x1A
      if (buffer[0] !== 0x4E || buffer[1] !== 0x45 || buffer[2] !== 0x53 || buffer[3] !== 0x1A) {
          return null; // Não é um arquivo NES válido
      }
      
      const prgBlocks = buffer[4]; // 16KB cada
      const chrBlocks = buffer[5]; // 8KB cada
      
      if (chrBlocks === 0) {
          alert("Esta ROM usa CHR-RAM, não possui dados CHR estáticos.");
          return null;
      }
      
      const headerSize = 16;
      const trainerSize = (buffer[6] & 0x04) ? 512 : 0; // Check se existe trainer
      const prgSize = prgBlocks * 16384;
      const chrStart = headerSize + trainerSize + prgSize;
      
      return buffer.slice(chrStart, chrStart + (chrBlocks * 8192));
  }

  function populateSelects(){
    const cSel=document.getElementById('tileColsSelect'), rSel=document.getElementById('tileRowsSelect');
    if(!cSel||!rSel) return;
    cSel.innerHTML=""; rSel.innerHTML="";
    for(let i=1;i<=8;i++){
      let o=document.createElement('option'); o.value=i; o.textContent=i+` col`; cSel.appendChild(o);
      let o2=document.createElement('option'); o2.value=i; o2.textContent=i+` lin`; rSel.appendChild(o2);
    }
    cSel.value=gridW; rSel.value=gridH;
    // redimensionamento só via botão applyGridResize — selects não aplicam sozinhos
  }
  function applyGridResize(){
    const cSel=document.getElementById('tileColsSelect'), rSel=document.getElementById('tileRowsSelect');
    const w = Math.max(1, Math.min(8, parseInt(cSel?.value, 10) || gridW));
    const h = Math.max(1, Math.min(8, parseInt(rSel?.value, 10) || gridH));
    setGrid(w, h);
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Metatile redimensionado para ${w}×${h}`);
  }
  function isSpriteBank(bankIdx){ return bankIdx%2===0; } // pg0 (par) = sprites, pg1 (ímpar) = backgrounds/splash
  function updateBankSelect(){ const sel=document.getElementById('bankSelect'); if(!sel) return; sel.innerHTML=""; const total=Math.max(2,Math.ceil(chrBuffer.length/4096)); for(let i=0;i<total;i++){ let o=document.createElement('option'); o.value=i; o.textContent=`${i%2===0?'PT0 $0000':'PT1 $1000'} (${isSpriteBank(i)?'sprites':'backgrounds'})`; sel.appendChild(o); } sel.value=currentBank; sel.onchange=e=>{ currentBank=parseInt(e.target.value); ensurePaletteMatchesBank(); renderAll(); updateLabels(); initPalUI(); updateMetatileSelect(); }; }
  function ensurePaletteMatchesBank(){
    const wantsSprite=isSpriteBank(currentBank);
    const activeIsSprite=activePal>=4;
    if(wantsSprite && !activeIsSprite) activePal=4;
    else if(!wantsSprite && activeIsSprite) activePal=0;
  }

  function defaultPaletteBankFromPalettes(){
    const names = ['BG0','BG1','BG2','BG3','SPR0','SPR1','SPR2','SPR3'];
    paletteBank = (palettes || []).slice(0,8).map((p,i)=>({
      id: 'pal_' + (i+1),
      name: names[i] || ('Pal ' + (i+1)),
      colors: [p[0]&63, p[1]&63, p[2]&63, p[3]&63]
    }));
    while(paletteBank.length < 8){
      const i = paletteBank.length;
      paletteBank.push({ id:'pal_'+(i+1), name: names[i]||('Pal '+(i+1)), colors:[15,0,16,48] });
    }
    paletteActive = paletteBank.slice(0,8).map(e => e.id);
  }
  function ensurePaletteBank(){
    if(!Array.isArray(paletteBank) || paletteBank.length === 0){
      defaultPaletteBankFromPalettes();
    }
    if(!Array.isArray(paletteActive) || paletteActive.length < 8){
      paletteActive = (paletteBank.slice(0,8).map(e=>e.id));
      while(paletteActive.length < 8) paletteActive.push(paletteBank[0]?.id || null);
    }
  }
  function bankEntryById(id){
    return paletteBank.find(e => e.id === id) || null;
  }
  function syncPpuFromActive(){
    ensurePaletteBank();
    for(let i=0;i<8;i++){
      const e = bankEntryById(paletteActive[i]);
      if(e && e.colors){
        palettes[i] = [e.colors[0]&63, e.colors[1]&63, e.colors[2]&63, e.colors[3]&63];
      }
    }
  }
  function syncActiveBankEntryFromPpu(){
    // ao editar a paleta PPU, grava de volta na entrada do banco ligada
    ensurePaletteBank();
    const id = paletteActive[activePal];
    const e = bankEntryById(id);
    if(e){
      const p = palettes[activePal] || [15,0,16,48];
      e.colors = [p[0]&63, p[1]&63, p[2]&63, p[3]&63];
    }
  }
  function genPalBankId(){
    return 'pal_' + Date.now().toString(36) + '_' + Math.floor(Math.random()*1000);
  }
  function addPaletteToBank(colors, name){
    ensurePaletteBank();
    const cols = (colors || [15,0,16,48]).map(c => c&63);
    while(cols.length < 4) cols.push(0);
    const entry = {
      id: genPalBankId(),
      name: name || ('Pal ' + (paletteBank.length+1)),
      colors: cols.slice(0,4)
    };
    paletteBank.push(entry);
    _palBankSel = paletteBank.length - 1;
    renderPaletteBankUI();
    if(typeof Project!=='undefined' && Project.status)
      Project.status('Paleta "' + entry.name + '" adicionada ao banco');
    return entry;
  }
  function applyBankEntryToActiveSlot(bankIdx){
    ensurePaletteBank();
    const e = paletteBank[bankIdx];
    if(!e) return;
    paletteActive[activePal] = e.id;
    palettes[activePal] = [e.colors[0]&63, e.colors[1]&63, e.colors[2]&63, e.colors[3]&63];
    initPalUI();
    renderAll();
    renderPaletteBankUI();
  }
  function deleteBankEntry(idx){
    ensurePaletteBank();
    if(paletteBank.length <= 1){ alert('Mantenha ao menos 1 paleta no banco'); return; }
    const e = paletteBank[idx];
    if(!e) return;
    if(!confirm('Remover "' + e.name + '" do banco?')) return;
    const id = e.id;
    paletteBank.splice(idx, 1);
    // slots que usavam esta entrada apontam para a primeira
    const fallback = paletteBank[0].id;
    for(let i=0;i<8;i++){
      if(paletteActive[i] === id) paletteActive[i] = fallback;
    }
    syncPpuFromActive();
    _palBankSel = Math.min(_palBankSel, paletteBank.length-1);
    initPalUI();
    renderAll();
    renderPaletteBankUI();
  }
  function renameBankEntry(idx){
    const e = paletteBank[idx];
    if(!e) return;
    const n = prompt('Nome da paleta:', e.name);
    if(n === null) return;
    e.name = n.trim() || e.name;
    renderPaletteBankUI();
  }
  function renderPaletteCompact(){
    const cont = document.getElementById('chrPaletteCompact');
    if(!cont) return;
    cont.innerHTML = '';
    const makeGroup = (label, start)=>{
      const g = document.createElement('div');
      g.className = 'chr-pal-compact-group';
      const lab = document.createElement('span');
      lab.className = 'chr-pal-compact-lab';
      lab.textContent = label;
      g.appendChild(lab);
      for(let i=0;i<4;i++){
        const slot = start + i;
        const box = document.createElement('div');
        box.className = 'chr-pal-compact-slot' + (slot === activePal ? ' active' : '');
        box.title = (start===0?'BG':'SPR') + i;
        box.onclick = (e)=>{
          e.stopPropagation();
          activePal = slot;
          initPalUI();
          renderAll();
          renderPaletteCompact();
        };
        for(let c=0;c<4;c++){
          const sw = document.createElement('div');
          const idx = (palettes[slot]||[15,0,16,48])[c]&63;
          sw.style.background = (typeof NES_PALETTE!=='undefined' && NES_PALETTE[idx]) ? NES_PALETTE[idx] : '#000';
          box.appendChild(sw);
        }
        g.appendChild(box);
      }
      cont.appendChild(g);
    };
    makeGroup('BG', 0);
    makeGroup('SPR', 4);
  }
  function renderPaletteBankUI(){
    ensurePaletteBank();
    // Suporta múltiplas listas (CHR + Backgrounds) via id clássico ou data-attr
    const lists = [];
    const primary = document.getElementById('paletteBankList');
    if(primary) lists.push(primary);
    document.querySelectorAll('[data-palette-bank-list]').forEach(el=>{
      if(!lists.includes(el)) lists.push(el);
    });
    lists.forEach(list=>{
      list.innerHTML = '';
      paletteBank.forEach((e, idx)=>{
        const row = document.createElement('div');
        const on = idx === _palBankSel;
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;cursor:pointer;border:1px solid '+(on?'#007acc':'#333')+';background:'+(on?'#1a2a3a':'#111');
        row.onclick = ()=>{ _palBankSel = idx; renderPaletteBankUI(); };
        const lab = document.createElement('span');
        lab.style.cssText = 'font-size:10px;color:#ccc;min-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        lab.textContent = e.name;
        lab.title = e.name + ' (' + e.id + ')';
        row.appendChild(lab);
        for(let c=0;c<4;c++){
          const sw = document.createElement('div');
          const hex = (typeof NES_PALETTE!=='undefined' && NES_PALETTE[e.colors[c]&63]) ? NES_PALETTE[e.colors[c]&63] : '#000';
          sw.style.cssText = 'width:14px;height:14px;border-radius:2px;border:1px solid #444;background:'+hex;
          row.appendChild(sw);
        }
        const used = [];
        for(let i=0;i<8;i++){ if(paletteActive[i]===e.id) used.push(i<4?('BG'+i):('SPR'+(i-4))); }
        if(used.length){
          const u = document.createElement('span');
          u.style.cssText = 'font-size:8px;color:#4ec9b0;margin-left:4px';
          u.textContent = used.join(',');
          row.appendChild(u);
        }
        list.appendChild(row);
      });
    });
    // selects for active slots
    const renderSlotSelects = (containerId, start, count, prefix)=>{
      const cont = document.getElementById(containerId);
      if(!cont) return;
      cont.innerHTML = '';
      for(let i=0;i<count;i++){
        const slot = start + i;
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:3px';
        const lab = document.createElement('span');
        lab.style.cssText = 'font-size:9px;color:#888;width:36px';
        lab.textContent = prefix + i;
        const sel = document.createElement('select');
        sel.style.cssText = 'flex:1;background:#000;color:#fff;border:1px solid #444;font-size:10px;border-radius:3px;padding:2px';
        paletteBank.forEach((e)=>{
          const o = document.createElement('option');
          o.value = e.id; o.textContent = e.name;
          if(paletteActive[slot] === e.id) o.selected = true;
          sel.appendChild(o);
        });
        sel.onchange = ()=>{
          paletteActive[slot] = sel.value;
          const e = bankEntryById(sel.value);
          if(e) palettes[slot] = [e.colors[0]&63,e.colors[1]&63,e.colors[2]&63,e.colors[3]&63];
          initPalUI(); renderAll(); renderPaletteBankUI();
          // Notifica outros módulos (ex.: Backgrounds) que as paletas mudaram
          try {
            if(typeof BG !== 'undefined' && BG.onPalettesChanged) BG.onPalettesChanged();
          } catch(err){}
        };
        wrap.appendChild(lab);
        wrap.appendChild(sel);
        cont.appendChild(wrap);
      }
    };
    renderSlotSelects('paletteActiveBG', 0, 4, 'BG');
    renderSlotSelects('paletteActiveSPR', 4, 4, 'SPR');
    renderSlotSelects('bgPaletteActiveBG', 0, 4, 'BG');
  }

  function initPalUI(){
    const cont=document.getElementById('subpalettesContainer'); if(!cont) return; cont.innerHTML="";
    if(isSpriteBank(currentBank)) createRow("SPR",[4,5,6,7]); else createRow("BG",[0,1,2,3]);
    const grid=document.getElementById('masterPaletteGrid'); grid.innerHTML=""; let line=null;
    NES_PALETTE.forEach((col,idx)=>{ if(idx%16===0){ line=document.createElement('div'); line.style.display='flex'; line.style.gap='2px'; grid.appendChild(line); } const b=document.createElement('div'); b.style.cssText=`width:18px;height:18px;background:${col};border:1px solid #333;border-radius:2px;cursor:pointer`; b.title=`NES $${idx.toString(16).padStart(2,'0').toUpperCase()}`; b.onclick=()=>{ palettes[activePal][activeSlot]=idx; syncActiveBankEntryFromPpu(); initPalUI(); renderAll(); renderPaletteBankUI(); }; line.appendChild(b); });
    const qc=document.getElementById('quickColors'); if(qc){ qc.innerHTML=''; for(let c=0;c<4;c++){ const isActive=c===activeSlot; const btn=document.createElement('div'); btn.style.cssText=`width:32px;height:24px;background:${NES_PALETTE[palettes[activePal][c]]};border:${isActive?'2px solid #ffcc00':'1px solid #555'};border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:#000;font-weight:bold`; btn.textContent=c+1; btn.onclick=()=>{ activeSlot=c; initPalUI(); renderAll(); updateLabels(); }; qc.appendChild(btn); } }
    ensurePaletteBank();
    renderPaletteBankUI();
  }
  function createRow(label, idxs){ const cont=document.getElementById('subpalettesContainer'); const row=document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; const lab=document.createElement('div'); lab.textContent=label; lab.style.width='28px'; lab.style.fontSize='10px'; lab.style.fontWeight='700'; lab.style.color='#4ec9b0'; row.appendChild(lab); const group=document.createElement('div'); group.style.display='flex'; group.style.gap='6px'; idxs.forEach(g=>{ const box=document.createElement('div'); box.style.cssText=`display:flex;gap:2px;padding:3px;border:2px solid ${g===activePal?'#007acc':'transparent'};border-radius:4px;background:#111;cursor:pointer`; box.onclick=()=>{ activePal=g; initPalUI(); renderAll(); }; for(let c=0;c<4;c++){ const slot=document.createElement('div'); const isActive=g===activePal&&c===activeSlot; slot.style.cssText=`width:20px;height:20px;background:${NES_PALETTE[palettes[g][c]]};border:${isActive?'2px solid #ffcc00':'1px solid #444'};border-radius:2px;cursor:pointer`; slot.onclick=e=>{ e.stopPropagation(); activePal=g; activeSlot=c; initPalUI(); renderAll(); updateLabels(); }; box.appendChild(slot); } group.appendChild(box); }); row.appendChild(group); cont.appendChild(row); }

  function drawTile(ctx, tileIdx, dx, dy, scale, flip){
    const off=tileIdx*16; if(off+16>chrBuffer.length) return;
    const pal=palettes[activePal];
    flip = flip|0;
    const fh = !!(flip & 1), fv = !!(flip & 2);
    for(let y=0;y<8;y++){
      const sy = fv ? (7-y) : y;
      const p0=chrBuffer[off+sy], p1=chrBuffer[off+sy+8];
      for(let x=0;x<8;x++){
        const sx = fh ? (7-x) : x;
        const sh=7-sx, b0=(p0>>sh)&1, b1=(p1>>sh)&1, ci=(b1<<1)|b0;
        ctx.fillStyle=NES_PALETTE[pal[ci]];
        ctx.fillRect(dx+x*scale, dy+y*scale, scale, scale);
      }
    }
  }
  function ensureFlipsLen(){
    while(selectedFlips.length < selectedTiles.length) selectedFlips.push(0);
    if(selectedFlips.length > selectedTiles.length) selectedFlips.length = selectedTiles.length;
  }
  function ensureOverlayLen(){
    const n = selectedTiles.length;
    while(overlayTiles.length < n) overlayTiles.push(-1); // vazio
    while(overlayFlips.length < n) overlayFlips.push(0);
    if(overlayTiles.length > n) overlayTiles.length = n;
    if(overlayFlips.length > n) overlayFlips.length = n;
  }
  function currentTiles(){ return editLayer === 1 && overlayEnabled ? overlayTiles : selectedTiles; }
  function currentFlips(){ return editLayer === 1 && overlayEnabled ? overlayFlips : selectedFlips; }
  function setCurrentTileAt(slot, absIdx){
    if(editLayer === 1 && overlayEnabled){
      ensureOverlayLen();
      overlayTiles[slot] = absIdx;
    } else {
      selectedTiles[slot] = absIdx;
    }
  }
  function setEditLayer(layer){
    editLayer = layer === 1 ? 1 : 0;
    if(editLayer === 1){
      if(!overlayEnabled){
        overlayEnabled = true;
        const chk = document.getElementById('chkOverlayEnabled');
        if(chk) chk.checked = true;
      }
      // garante N slots vazios (-1), NUNCA copia a base
      if(!overlayTiles.length){
        overlayTiles = Array(selectedTiles.length).fill(-1);
        overlayFlips = Array(selectedTiles.length).fill(0);
      } else {
        ensureOverlayLen();
      }
    }
    updateLayerUI();
    renderAll();
    updateLabels();
  }
  function removeOverlay(){
    if(!overlayEnabled && !overlayTiles.some(t => t != null && t >= 0)){
      if(typeof Project!=='undefined' && Project.status) Project.status('Este metatile não tem overlay');
      return;
    }
    if(!confirm('Remover a camada overlay deste metatile?')) return;
    overlayEnabled = false;
    overlayTiles = [];
    overlayFlips = [];
    overlayDx = 0;
    overlayDy = 0;
    editLayer = 0;
    // se há metatile selecionado, já grava a remoção no objeto
    const sel = document.getElementById('metatileSelect');
    if(sel && sel.value){
      const mt = metatiles.find(m => m.id === sel.value);
      if(mt) delete mt.overlay;
    }
    updateLayerUI();
    renderAll();
    updateLabels();
    if(typeof Project!=='undefined' && Project.status)
      Project.status('Overlay removido — Salve o metatile / projeto para persistir no .nms');
  }
  function setOverlayEnabled(on){
    overlayEnabled = !!on;
    if(overlayEnabled){
      const n = selectedTiles.length;
      const hasContent = overlayTiles.length === n && overlayTiles.some(t => t != null && t >= 0);
      // sem conteúdo próprio → todos os slots vazios (nunca herda a base)
      if(!hasContent){
        overlayTiles = Array(n).fill(-1);
        overlayFlips = Array(n).fill(0);
      } else {
        ensureOverlayLen();
      }
      editLayer = 1;
    } else {
      editLayer = 0;
    }
    updateLayerUI();
    renderAll();
    updateLabels();
  }
  function setOverlayPal(v){
    overlayPal = parseInt(v, 10);
    if(isNaN(overlayPal)) overlayPal = 5;
    renderAll();
  }
  function setOverlayOffset(){
    overlayDx = parseInt(document.getElementById('overlayDx')?.value, 10) || 0;
    overlayDy = parseInt(document.getElementById('overlayDy')?.value, 10) || 0;
    renderAll();
  }
  function updateLayerUI(){
    const b0 = document.getElementById('btnLayer0');
    const b1 = document.getElementById('btnLayer1');
    const lbl = document.getElementById('lblEditLayer');
    // checkbox removido — Base/Overlay controlam a edição
    const op = document.getElementById('overlayPalSelect');
    if(op) op.value = String(overlayPal);
    const dx = document.getElementById('overlayDx');
    const dy = document.getElementById('overlayDy');
    if(dx) dx.value = overlayDx;
    if(dy) dy.value = overlayDy;
    if(b0){ b0.style.background = editLayer===0 ? '#ffcc00' : ''; b0.style.color = editLayer===0 ? '#000' : ''; }
    if(b1){ b1.style.background = editLayer===1 ? '#ffcc00' : ''; b1.style.color = editLayer===1 ? '#000' : ''; b1.disabled = false; }
    if(lbl) lbl.textContent = editLayer===1 ? 'editando: Overlay' : 'editando: Base';
  }
  function flipLabel(f){
    f = f|0;
    if(f===3) return 'HV';
    if(f===1) return 'H';
    if(f===2) return 'V';
    return '—';
  }
  function toggleSlotFlipH(){
    ensureFlipsLen();
    if(overlayEnabled) ensureOverlayLen();
    if(activeSlotIdx < 0 || activeSlotIdx >= selectedTiles.length) return;
    const flips = currentFlips();
    flips[activeSlotIdx] = (flips[activeSlotIdx]|0) ^ 1;
    updateLabels(); renderAll();
  }
  function toggleSlotFlipV(){
    ensureFlipsLen();
    if(overlayEnabled) ensureOverlayLen();
    if(activeSlotIdx < 0 || activeSlotIdx >= selectedTiles.length) return;
    const flips = currentFlips();
    flips[activeSlotIdx] = (flips[activeSlotIdx]|0) ^ 2;
    updateLabels(); renderAll();
  }
  function renderSheet(){ if(!sheetCtx) return; sheetCtx.fillStyle="#000"; sheetCtx.fillRect(0,0,512,512); const base=currentBank*256; for(let ty=0;ty<16;ty++) for(let tx=0;tx<16;tx++) drawTile(sheetCtx, base+ty*16+tx, tx*32, ty*32, 4); if(document.getElementById('chkShowGrid')?.checked){ sheetCtx.save(); sheetCtx.strokeStyle="#888"; sheetCtx.setLineDash([2,2]); for(let x=32;x<512;x+=32){ sheetCtx.beginPath(); sheetCtx.moveTo(x+.5,0); sheetCtx.lineTo(x+.5,512); sheetCtx.stroke(); } for(let y=32;y<512;y+=32){ sheetCtx.beginPath(); sheetCtx.moveTo(0,y+.5); sheetCtx.lineTo(512,y+.5); sheetCtx.stroke(); } sheetCtx.restore(); } selectedTiles.forEach((ti,slot)=>{ const local=ti%256; if(Math.floor(ti/256)!==currentBank) return; const tx=local%16, ty=Math.floor(local/16), cur=slot===activeSlotIdx; sheetCtx.strokeStyle=cur?'#ffcc00':'#007acc'; sheetCtx.lineWidth=cur?3:2; sheetCtx.strokeRect(tx*32+1,ty*32+1,30,30); }); }
  function bresenham(x0,y0,x1,y1){ const pts=[]; let dx=Math.abs(x1-x0), dy=Math.abs(y1-y0); let sx=x0<x1?1:-1, sy=y0<y1?1:-1, err=dx-dy; while(true){ pts.push({x:x0,y:y0}); if(x0===x1&&y0===y1) break; let e2=2*err; if(e2>-dy){ err-=dy; x0+=sx; } if(e2<dx){ err+=dx; y0+=sy; } } return pts; }
  function getRectPoints(x0,y0,x1,y1){ const pts=[]; const minX=Math.min(x0,x1), maxX=Math.max(x0,x1), minY=Math.min(y0,y1), maxY=Math.max(y0,y1); for(let x=minX;x<=maxX;x++){ pts.push({x,y:minY}); pts.push({x,y:maxY}); } for(let y=minY+1;y<=maxY-1;y++){ pts.push({x:minX,y}); pts.push({x:maxX,y}); } return pts; }
  function getCirclePoints(cx,cy,r){ const pts=[]; let x=r, y=0, err=0; while(x>=y){ pts.push({x:cx+x,y:cy+y},{x:cx+y,y:cy+x},{x:cx-y,y:cy+x},{x:cx-x,y:cy+y},{x:cx-x,y:cy-y},{x:cx-y,y:cy-x},{x:cx+y,y:cy-x},{x:cx+x,y:cy-y}); y++; if(err<=0){ err+=2*y+1; } if(err>0){ x--; err-=2*x+1; } } return pts; }
  function getMatrix(){
    // Matriz de cores 0–3 da camada em edição
    const tiles = currentTiles();
    const W = gridW * 8, H = gridH * 8;
    const M = Array.from({ length: H }, () => Array(W).fill(0));
    for(let gy=0; gy<gridH; gy++){
      for(let gx=0; gx<gridW; gx++){
        const ti = tiles[gy * gridW + gx];
        if(ti == null) continue;
        const off = ti * 16;
        if(off + 16 > chrBuffer.length) continue;
        for(let py=0; py<8; py++){
          const p0 = chrBuffer[off + py], p1 = chrBuffer[off + py + 8];
          for(let px=0; px<8; px++){
            const sh = 7 - px;
            M[gy * 8 + py][gx * 8 + px] = ((p1 >> sh) & 1) << 1 | ((p0 >> sh) & 1);
          }
        }
      }
    }
    return M;
  }
  function setMatrix(M){
    // Grava matriz de pixels de volta nos tiles da camada em edição
    if(!M || !M.length || !M[0] || !M[0].length) return;
    const tiles = currentTiles();
    for(let gy=0; gy<gridH; gy++){
      for(let gx=0; gx<gridW; gx++){
        const ti = tiles[gy * gridW + gx];
        if(ti == null) continue;
        const off = ti * 16;
        if(off + 16 > chrBuffer.length) continue;
        for(let py=0; py<8; py++){
          let a = 0, b = 0;
          const row = M[gy * 8 + py];
          if(!row) continue;
          for(let px=0; px<8; px++){
            const c = (row[gx * 8 + px] || 0) & 3;
            const sh = 7 - px;
            if(c & 1) a |= (1 << sh);
            if(c & 2) b |= (1 << sh);
          }
          chrBuffer[off + py] = a;
          chrBuffer[off + py + 8] = b;
        }
      }
    }
    renderAll();
  }
  /** Espelha o grupo na horizontal — só pixels no CHR (não reordena selectedTiles). */
  function flipGroupH(){
    if(!selectedTiles.length) return;
    pushUndo();
    const M = getMatrix();
    for(let y=0; y<M.length; y++) M[y].reverse();
    setMatrix(M);
    updateLabels();
  }
  /** Espelha o grupo na vertical — só pixels no CHR. */
  function flipGroupV(){
    if(!selectedTiles.length) return;
    pushUndo();
    const M = getMatrix();
    M.reverse();
    setMatrix(M);
    updateLabels();
  }
  /**
   * Rotação 90° horária do grupo de pixels.
   * Corrige bug: gridW/gridH devem ser em TILES (não em pixels).
   * Só reescreve o CHR; a lista selectedTiles mantém os mesmos índices em ordem.
   */
  function rotateGroupCW(){
    if(!selectedTiles.length) return;
    pushUndo();
    const M = getMatrix();
    if(!M.length || !M[0] || !M[0].length) return;
    const ph = M.length, pw = M[0].length;
    const N = Array.from({ length: pw }, () => Array(ph).fill(0));
    for(let y=0; y<ph; y++)
      for(let x=0; x<pw; x++)
        N[x][ph - 1 - y] = M[y][x];

    const oldW = gridW, oldH = gridH;
    gridW = oldH;
    gridH = oldW;
    // selectedTiles / flips: mesma quantidade, ordem de slots inalterada
    ensureFlipsLen();
    activeSlotIdx = Math.min(Math.max(0, activeSlotIdx), selectedTiles.length - 1);
    if(zoomCanvas){
      zoomCanvas.width = gridW * 8 * 16;
      zoomCanvas.height = gridH * 8 * 16;
    }
    const cSel = document.getElementById('tileColsSelect');
    const rSel = document.getElementById('tileRowsSelect');
    if(cSel) cSel.value = String(gridW);
    if(rSel) rSel.value = String(gridH);
    setMatrix(N);
    updateLabels();
  }

  function pushUndo(){ undoStack.push(chrBuffer.slice()); if(undoStack.length>60) undoStack.shift(); }
  function updateLabels(){
    ensureFlipsLen();
    const a=document.getElementById('lblActiveSlot'), b=document.getElementById('lblTileIndices'), size=document.getElementById('lblMetatileSize'), status=document.getElementById('statusLeft');
    if(a) a.textContent=`${activeSlotIdx+1}/${selectedTiles.length}`;
    const tiles = currentTiles(), flips = currentFlips();
    if(b) b.textContent=tiles.map((i,idx)=>"$"+i.toString(16).toUpperCase().padStart(2,"0")+`(${(i%256).toString(16).toUpperCase()})`+(flips[idx]?`[${flipLabel(flips[idx])}]`:'')).join(", ");
    if(size) size.textContent=`${gridW}x${gridH} PT${currentBank} (${selectedTiles.length} tiles)`+(overlayEnabled?' +overlay':'');
    if(status) status.textContent=`PT${currentBank} - L${editLayer} Slot ${activeSlotIdx+1} - Tile $${tiles[activeSlotIdx]?.toString(16).toUpperCase()} flip=${flipLabel(flips[activeSlotIdx])} - Tool ${tool}`;
    const sf=document.getElementById('lblSlotFlip');
    if(sf) sf.textContent = `slot ${activeSlotIdx+1}: ${flipLabel(flips[activeSlotIdx]|0)}`;
    renderQuickTileSelector();
  }

  function renderQuickTileSelector(){
    const cont=document.getElementById('quickTileSelector'); if(!cont) return; cont.innerHTML='';
    ensureFlipsLen();
    const isOv = (editLayer === 1 && overlayEnabled);
    if(isOv) ensureOverlayLen();
    const tiles = isOv ? overlayTiles : selectedTiles;
    const flips = isOv ? overlayFlips : selectedFlips;
    const title = document.querySelector('#quickTileSelector')?.previousElementSibling;
    // atualiza título do painel se existir h4
    const panelH4 = cont.parentElement && cont.parentElement.querySelector('h4');
    if(panelH4){
      panelH4.textContent = isOv
        ? 'SELETOR OVERLAY — slots vazios; clique no slot e depois no grid CHR'
        : 'SELETOR BASE — tiles do metatile (clique = slot ativo)';
      panelH4.style.color = isOv ? '#8585ff' : '#4ec9b0';
    }
    tiles.forEach((ti,idx)=>{
      const isActive = idx === activeSlotIdx;
      const fl = flips[idx]|0;
      const empty = isOv && (ti==null || ti<0);
      const border = isActive ? (isOv ? '2px solid #8585ff' : '2px solid #ffcc00') : '1px solid #444';
      const bg = isActive ? (isOv ? '#1a1a3a' : '#332a00') : '#111';
      const div=document.createElement('div');
      div.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;border:${border};border-radius:4px;background:${bg};cursor:pointer;min-width:56px;position:relative`;
      div.onclick=()=>{ activeSlotIdx=idx; if(isOv) editLayer=1; else editLayer=0; updateLayerUI(); renderAll(); updateLabels(); };
      if(isOv){
        div.oncontextmenu=(e)=>{
          e.preventDefault();
          overlayTiles[idx]=-1; overlayFlips[idx]=0;
          renderAll(); updateLabels();
        };
        div.title = 'Direito = limpar slot';
      }
      const canvas=document.createElement('canvas'); canvas.width=16; canvas.height=16;
      canvas.style.cssText='width:32px;height:32px;image-rendering:pixelated;border:1px solid #222;background:#000';
      const ctx=canvas.getContext('2d');
      if(empty){
        ctx.fillStyle='#222'; ctx.fillRect(0,0,16,16);
        ctx.strokeStyle='#555'; ctx.strokeRect(0.5,0.5,15,15);
        ctx.fillStyle='#888'; ctx.font='9px sans-serif'; ctx.fillText('∅',5,11);
      } else {
        drawTile(ctx, ti, 0, 0, 2, fl);
      }
      if(fl && !empty){
        const badge=document.createElement('div');
        badge.textContent=flipLabel(fl);
        badge.style.cssText='position:absolute;top:2px;right:2px;font-size:8px;background:#27ae60;color:#fff;padding:0 3px;border-radius:2px;line-height:1.3';
        div.appendChild(badge);
      }
      const label=document.createElement('div'); label.style.cssText='font-size:9px;color:#888;text-align:center;line-height:1.2';
      const accent = isActive ? (isOv?'#8585ff':'#ffcc00') : '#fff';
      label.innerHTML = empty
        ? `<b style="color:${accent}">${idx+1}</b><br><span style="color:#666">vazio</span>`
        : `<b style="color:${accent}">${idx+1}</b><br>$${Number(ti).toString(16).toUpperCase()}<br><span style="color:#666">${isOv?'ov':'base'}</span>`;
      div.appendChild(canvas); div.appendChild(label); cont.appendChild(div);
    });
    // esconde painel overlay duplicado se existir
    const ovPanel = document.getElementById('overlaySelectorPanel');
    if(ovPanel) ovPanel.style.display = 'none';
  }
  function renderMetatilePreview(){
    const cont=document.getElementById('metatilePreview'); if(!cont) return; cont.innerHTML='';
    metatiles.filter(mt => (mt.bank||0) === currentBank).forEach(mt=>{
      const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;background:#222;border:1px solid #444;border-radius:4px;cursor:pointer;min-width:60px';
      wrap.onclick=()=>{ const sel=document.getElementById('metatileSelect'); if(sel){ sel.value=mt.id; loadSelectedMetatile(); } };
      const canvas=document.createElement('canvas'); canvas.width=mt.w*8; canvas.height=mt.h*8; canvas.style.cssText=`width:${mt.w*12}px;height:${mt.h*12}px;image-rendering:pixelated;background:#000;border:1px solid #333`;
      const ctx=canvas.getContext('2d'); const flips=mt.flips||[]; for(let gy=0;gy<mt.h;gy++) for(let gx=0;gx<mt.w;gx++){ const ti=mt.tiles[gy*mt.w+gx]; if(ti===undefined) continue; const fl=flips[gy*mt.w+gx]|0; const tmp=document.createElement('canvas'); tmp.width=8; tmp.height=8; const tctx=tmp.getContext('2d'); const savePal=activePal; activePal=mt.palette||0; drawTile(tctx, ti, 0, 0, 1, fl); activePal=savePal; ctx.drawImage(tmp, gx*8, gy*8); }
      const label=document.createElement('div'); label.style.cssText='font-size:8px;color:#aaa;text-align:center;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; label.textContent=mt.name;
      wrap.appendChild(canvas); wrap.appendChild(label); cont.appendChild(wrap);
    });
  }

  function setGrid(w,h){
    gridW=w; gridH=h;
    const first=selectedTiles[0]||currentBank*256;
    selectedTiles=[]; selectedFlips=[];
    for(let i=0;i<w*h;i++){ selectedTiles.push(first+i); selectedFlips.push(0); }
    if(overlayEnabled){
      const oldOv = [...overlayTiles];
      const oldOf = [...overlayFlips];
      overlayTiles=[]; overlayFlips=[];
      for(let i=0;i<w*h;i++){
        overlayTiles.push(i < oldOv.length ? oldOv[i] : -1);
        overlayFlips.push(i < oldOf.length ? (oldOf[i]|0) : 0);
      }
    } else {
      overlayTiles=[]; overlayFlips=[];
    }
    activeSlotIdx=0;
    if(zoomCanvas){ zoomCanvas.width=w*8*16; zoomCanvas.height=h*8*16; }
    const cSel=document.getElementById('tileColsSelect'), rSel=document.getElementById('tileRowsSelect');
    if(cSel) cSel.value=String(w);
    if(rSel) rSel.value=String(h);
    renderAll(); updateLabels();
  }
  function drawTileTransparent(ctx, tileIdx, dx, dy, scale, flip, palIdx){
    // desenha só pixels com cor != 0 (transparência NES)
    const off = tileIdx * 16;
    if(off + 16 > chrBuffer.length) return;
    const pal = palettes[palIdx != null ? palIdx : activePal] || palettes[0];
    flip = flip | 0;
    const fh = !!(flip & 1), fv = !!(flip & 2);
    for(let y=0; y<8; y++){
      const sy = fv ? (7-y) : y;
      const p0 = chrBuffer[off+sy], p1 = chrBuffer[off+sy+8];
      for(let x=0; x<8; x++){
        const sx = fh ? (7-x) : x;
        const sh = 7-sx, ci = (((p1>>sh)&1)<<1) | ((p0>>sh)&1);
        if(ci === 0) continue;
        ctx.fillStyle = NES_PALETTE[pal[ci]&63];
        ctx.fillRect(dx + x*scale, dy + y*scale, scale, scale);
      }
    }
  }
  function renderZoom(){
    if(!zoomCtx) return;
    const sizeW = gridW * 8, sizeH = gridH * 8;
    zoomCanvas.width = sizeW * 16;
    zoomCanvas.height = sizeH * 16;
    zoomCtx.fillStyle = "#000";
    zoomCtx.fillRect(0, 0, zoomCanvas.width, zoomCanvas.height);
    // base
    for(let gy=0; gy<gridH; gy++) for(let gx=0; gx<gridW; gx++){
      const ti = selectedTiles[gy*gridW+gx];
      if(ti !== undefined) drawTile(zoomCtx, ti, gx*8*16, gy*8*16, 16, selectedFlips[gy*gridW+gx]|0);
    }
    // overlay composto
    if(overlayEnabled){
      ensureOverlayLen();
      const odx = (overlayDx|0) * 16, ody = (overlayDy|0) * 16;
      for(let gy=0; gy<gridH; gy++) for(let gx=0; gx<gridW; gx++){
        const ti = overlayTiles[gy*gridW+gx];
        if(ti === undefined) continue;
        drawTileTransparent(zoomCtx, ti, gx*8*16 + odx, gy*8*16 + ody, 16, overlayFlips[gy*gridW+gx]|0, overlayPal);
      }
    }
    // highlight da camada em edição (borda suave)
    if(editLayer === 1 && overlayEnabled){
      zoomCtx.save();
      zoomCtx.strokeStyle = "rgba(133,133,255,0.5)";
      zoomCtx.lineWidth = 2;
      zoomCtx.strokeRect(1, 1, zoomCanvas.width-2, zoomCanvas.height-2);
      zoomCtx.restore();
    }
    if(document.getElementById('chkMetatileGrid')?.checked){
      zoomCtx.save();
      const scale = 16; // 1 pixel NES = 16 CSS px no zoom
      const totalPxW = gridW * 8;
      const totalPxH = gridH * 8;
      // grid pontilhado por pixel
      zoomCtx.strokeStyle = "rgba(255,255,255,0.18)";
      zoomCtx.lineWidth = 1;
      zoomCtx.setLineDash([1, 2]);
      for(let px=1; px<totalPxW; px++){
        if(px % 8 === 0) continue; // divisa de tile fica sólida
        const x = px * scale + 0.5;
        zoomCtx.beginPath(); zoomCtx.moveTo(x, 0); zoomCtx.lineTo(x, zoomCanvas.height); zoomCtx.stroke();
      }
      for(let py=1; py<totalPxH; py++){
        if(py % 8 === 0) continue;
        const y = py * scale + 0.5;
        zoomCtx.beginPath(); zoomCtx.moveTo(0, y); zoomCtx.lineTo(zoomCanvas.width, y); zoomCtx.stroke();
      }
      // linhas cheias na divisa dos tiles
      zoomCtx.setLineDash([]);
      zoomCtx.strokeStyle = "rgba(255,255,0,0.7)";
      zoomCtx.lineWidth = 1;
      for(let gx=1; gx<gridW; gx++){
        const x = gx * 8 * scale + 0.5;
        zoomCtx.beginPath(); zoomCtx.moveTo(x, 0); zoomCtx.lineTo(x, zoomCanvas.height); zoomCtx.stroke();
      }
      for(let gy=1; gy<gridH; gy++){
        const y = gy * 8 * scale + 0.5;
        zoomCtx.beginPath(); zoomCtx.moveTo(0, y); zoomCtx.lineTo(zoomCanvas.width, y); zoomCtx.stroke();
      }
      // borda externa do metatile
      zoomCtx.strokeStyle = "rgba(255,255,0,0.45)";
      zoomCtx.strokeRect(0.5, 0.5, zoomCanvas.width-1, zoomCanvas.height-1);
      zoomCtx.restore();
    }
    if((tool==='line'||tool==='rect'||tool==='circle')&&toolStart&&toolPreviewEnd){
      let pts=[];
      if(tool==='line') pts=bresenham(toolStart.x,toolStart.y,toolPreviewEnd.x,toolPreviewEnd.y);
      else if(tool==='rect') pts=getRectPoints(toolStart.x,toolStart.y,toolPreviewEnd.x,toolPreviewEnd.y);
      else if(tool==='circle'){ const r=Math.round(Math.hypot(toolPreviewEnd.x-toolStart.x, toolPreviewEnd.y-toolStart.y)); pts=getCirclePoints(toolStart.x,toolStart.y,r); }
      zoomCtx.fillStyle="rgba(255,255,0,0.9)";
      pts.forEach(p=>{ if(p.x>=0&&p.x<sizeW&&p.y>=0&&p.y<sizeH) zoomCtx.fillRect(p.x*16, p.y*16, 16,16); });
    }
    if(copyDrag&&copyDrag.active){
      const x0=Math.min(copyDrag.x0, copyDrag.x1), y0=Math.min(copyDrag.y0, copyDrag.y1);
      const x1=Math.max(copyDrag.x0, copyDrag.x1), y1=Math.max(copyDrag.y0, copyDrag.y1);
      zoomCtx.fillStyle="rgba(0,150,255,0.25)";
      zoomCtx.fillRect(x0*16, y0*16, (x1-x0+1)*16, (y1-y0+1)*16);
    }
    if(previewCtx){
      previewCanvas.width = sizeW * 2;
      previewCanvas.height = sizeH * 2;
      previewCtx.fillStyle = "#000";
      previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      for(let gy=0; gy<gridH; gy++) for(let gx=0; gx<gridW; gx++){
        const ti = selectedTiles[gy*gridW+gx];
        if(ti !== undefined) drawTile(previewCtx, ti, gx*8*2, gy*8*2, 2, selectedFlips[gy*gridW+gx]|0);
      }
      if(overlayEnabled){
        ensureOverlayLen();
        for(let gy=0; gy<gridH; gy++) for(let gx=0; gx<gridW; gx++){
          const ti2 = overlayTiles[gy*gridW+gx];
          if(ti2 === undefined) continue;
          drawTileTransparent(previewCtx, ti2, gx*8*2+(overlayDx|0)*2, gy*8*2+(overlayDy|0)*2, 2, overlayFlips[gy*gridW+gx]|0, overlayPal);
        }
      }
    }
  }
  function renderAll(){ renderSheet(); renderZoom(); renderQuickTileSelector(); renderMetatilePreview(); renderTileQueue(); }

  function doLine(x0,y0,x1,y1){ const M=getMatrix(); bresenham(x0,y0,x1,y1).forEach(p=>{ if(p.y>=0&&p.y<M.length&&p.x>=0&&p.x<M[0].length) M[p.y][p.x]=activeSlot; }); pushUndo(); setMatrix(M); }
  function doRect(x0,y0,x1,y1){ const M=getMatrix(); getRectPoints(x0,y0,x1,y1).forEach(p=>{ if(p.y>=0&&p.y<M.length&&p.x>=0&&p.x<M[0].length) M[p.y][p.x]=activeSlot; }); pushUndo(); setMatrix(M); }
  function doCircle(cx,cy,px,py){ const M=getMatrix(); const r=Math.round(Math.hypot(px-cx, py-cy)); getCirclePoints(cx,cy,r).forEach(p=>{ if(p.y>=0&&p.y<M.length&&p.x>=0&&p.x<M[0].length) M[p.y][p.x]=activeSlot; }); pushUndo(); setMatrix(M); }
  function doFill(sx,sy){ const M=getMatrix(); const H=M.length, W=M[0].length; if(sx<0||sx>=W||sy<0||sy>=H) return; const target=M[sy][sx]; if(target===activeSlot) return; const stack=[[sx,sy]]; const visited=new Set(); while(stack.length){ const [x,y]=stack.pop(); const key=y*W+x; if(visited.has(key)) continue; visited.add(key); if(x<0||x>=W||y<0||y>=H) continue; if(M[y][x]!==target) continue; M[y][x]=activeSlot; stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]); } pushUndo(); setMatrix(M); }
  function doCopy(x0,y0,x1,y1){ const M=getMatrix(); const minX=Math.max(0,Math.min(x0,x1)), maxX=Math.min(M[0].length-1, Math.max(x0,x1)); const minY=Math.max(0,Math.min(y0,y1)), maxY=Math.min(M.length-1, Math.max(y0,y1)); const w=maxX-minX+1, h=maxY-minY+1; if(w<=0||h<=0) return; const data=Array.from({length:h},(_,dy)=> Array.from({length:w},(_,dx)=> M[minY+dy][minX+dx])); clipboard={w,h,data}; const lbl=document.getElementById('lblClipboard'); if(lbl) lbl.textContent=`Clipboard: ${w}x${h}`; }
  function doPaste(px,py){ if(!clipboard) return; const M=getMatrix(); for(let dy=0;dy<clipboard.h;dy++) for(let dx=0;dx<clipboard.w;dx++){ const x=px+dx, y=py+dy; if(x<0||x>=M[0].length||y<0||y>=M.length) continue; M[y][x]=clipboard.data[dy][dx]; } pushUndo(); setMatrix(M); }
  // Copia/cola tile INTEIRO (16 bytes) via FILA — clique na folha adiciona (copy) ou cola o selecionado (paste).
  // Funciona entre páginas/bancos (snapshot dos bytes, não referência ao índice).
  function copySheetTile(absIdx){
    const off = absIdx*16; if(off+16 > chrBuffer.length) return;
    const data = Array.from(chrBuffer.slice(off, off+16));
    sheetClipboardTile = data; // compat legado (último copiado)
    tileQueue.push({
      data,
      sourceIdx: absIdx,
      bank: Math.floor(absIdx/256),
      local: absIdx % 256
    });
    if(tileQueue.length > TILE_QUEUE_MAX) tileQueue.shift();
    tileQueueActive = tileQueue.length - 1;
    updateTileQueueLabel();
    renderTileQueue();
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Tile PT${Math.floor(absIdx/256)}:$${(absIdx%256).toString(16).padStart(2,'0').toUpperCase()} adicionado à fila (${tileQueue.length})`);
  }
  function pasteSheetTile(absIdx){
    if(!tileQueue.length){
      if(typeof Project !== 'undefined' && Project.status) Project.status('Fila vazia — use Copiar Tile primeiro');
      return;
    }
    if(tileQueueActive < 0 || tileQueueActive >= tileQueue.length) tileQueueActive = tileQueue.length - 1;
    const usedIdx = tileQueueActive;
    const item = tileQueue[usedIdx];
    if(!item || !item.data) return;
    const off = absIdx*16; if(off+16 > chrBuffer.length) return;
    pushUndo();
    for(let i=0;i<16;i++) chrBuffer[off+i] = item.data[i];
    // se veio do import de imagem, registra posição pro metatile
    if(item.importBatch && item.layoutIndex != null){
      imgImportNotePaste(item.layoutIndex, absIdx);
    }
    // avança para o próximo da fila (ciclo), igual ao seletor rápido de slots
    tileQueueActive = (tileQueueActive + 1) % tileQueue.length;
    sheetClipboardTile = tileQueue[tileQueueActive]?.data || item.data;
    updateTileQueueLabel();
    renderAll();
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Colado #${usedIdx+1} → PT${Math.floor(absIdx/256)}:$${(absIdx%256).toString(16).padStart(2,'0').toUpperCase()} · próximo: #${tileQueueActive+1}`);
  }
  function clearSheetTile(absIdx){
    const off = absIdx*16;
    if(off+16 > chrBuffer.length) return;
    pushUndo();
    for(let i=0;i<16;i++) chrBuffer[off+i] = 0;
    renderAll();
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Tile PT${Math.floor(absIdx/256)}:$${(absIdx%256).toString(16).padStart(2,'0').toUpperCase()} limpo`);
  }
  function clearTileQueue(){
    if(!tileQueue.length) return;
    if(!confirm('Limpar toda a fila de tiles?\nInclui tiles copiados e importados. Esta ação não pode ser desfeita.')) return;
    tileQueue = [];
    tileQueueActive = 0;
    sheetClipboardTile = null;
    updateTileQueueLabel();
    renderTileQueue();
  }
  function removeTileQueueItem(idx){
    if(idx < 0 || idx >= tileQueue.length) return;
    tileQueue.splice(idx, 1);
    if(tileQueueActive >= tileQueue.length) tileQueueActive = Math.max(0, tileQueue.length - 1);
    updateTileQueueLabel();
    renderTileQueue();
  }
  function selectTileQueueItem(idx){
    if(idx < 0 || idx >= tileQueue.length) return;
    tileQueueActive = idx;
    sheetClipboardTile = tileQueue[idx].data;
    updateTileQueueLabel();
    renderTileQueue();
  }
  function updateTileQueueLabel(){
    const lbl = document.getElementById('lblSheetClipboard');
    if(!lbl) return;
    if(!tileQueue.length){ lbl.textContent = 'Fila: 0 tiles'; return; }
    const it = tileQueue[tileQueueActive];
    const src = it ? `PT${it.bank}:$${it.local.toString(16).padStart(2,'0').toUpperCase()}` : '?';
    lbl.textContent = `Fila: ${tileQueue.length} · ativo #${tileQueueActive+1} (${src})`;
  }
  function drawTileFromData(ctx, data, dx, dy, scale){
    // desenha 8x8 a partir de snapshot 16 bytes (sem depender do índice atual no buffer)
    const pal = palettes[activePal] || palettes[0];
    for(let y=0;y<8;y++){
      const p0 = data[y]||0, p1 = data[y+8]||0;
      for(let x=0;x<8;x++){
        const sh=7-x, ci=((p1>>sh)&1)<<1 | ((p0>>sh)&1);
        ctx.fillStyle = (typeof NES_PALETTE !== 'undefined' ? NES_PALETTE[pal[ci]] : '#000');
        ctx.fillRect(dx+x*scale, dy+y*scale, scale, scale);
      }
    }
  }
  function renderTileQueue(){
    const panel = document.getElementById('tileQueuePanel');
    const cont = document.getElementById('tileQueueSelector');
    if(!cont) return;
    if(panel) panel.style.display = tileQueue.length ? 'block' : 'none';
    cont.innerHTML = '';
    if(!tileQueue.length){
      cont.innerHTML = '<div style="font-size:10px;color:#555">Vazia — ative “Copiar Tile” e clique na folha</div>';
      return;
    }
    tileQueue.forEach((item, idx)=>{
      const isActive = idx === tileQueueActive;
      const div = document.createElement('div');
      div.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;border:${isActive?'2px solid #7dcea0':'1px solid #444'};border-radius:4px;background:${isActive?'#1a2e1a':'#111'};cursor:pointer;min-width:56px;position:relative`;
      div.onclick = ()=> selectTileQueueItem(idx);
      const canvas = document.createElement('canvas');
      canvas.width = 16; canvas.height = 16;
      canvas.style.cssText = 'width:32px;height:32px;image-rendering:pixelated;border:1px solid #222;background:#000';
      drawTileFromData(canvas.getContext('2d'), item.data, 0, 0, 2);
      const label = document.createElement('div');
      label.style.cssText = 'font-size:9px;color:#888;text-align:center;line-height:1.2';
      label.innerHTML = item.importBatch
        ? `<b style="color:${isActive?'#7dcea0':'#fff'}">#${idx+1}</b><br>img ${item.label||item.layoutIndex}<br><span style="color:#666">import</span>`
        : `<b style="color:${isActive?'#7dcea0':'#fff'}">#${idx+1}</b><br>$${item.local.toString(16).padStart(2,'0').toUpperCase()}<br><span style="color:#666">PT${item.bank}</span>`;
      const rm = document.createElement('button');
      rm.textContent = '×';
      rm.title = 'Remover da fila';
      rm.style.cssText = 'position:absolute;top:0;right:0;background:#c0392b;color:#fff;border:none;border-radius:0 3px 0 3px;width:16px;height:16px;font-size:10px;line-height:1;cursor:pointer;padding:0';
      rm.onclick = (ev)=>{ ev.stopPropagation(); removeTileQueueItem(idx); };
      div.appendChild(rm); div.appendChild(canvas); div.appendChild(label);
      cont.appendChild(div);
    });
    // Célula final: limpar fila (copiados + importados)
    const clearCell = document.createElement('div');
    clearCell.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px;border:1px dashed #884444;border-radius:4px;background:#1a0a0a;cursor:pointer;min-width:56px;min-height:56px';
    clearCell.title = 'Limpar toda a fila de tiles';
    clearCell.onclick = () => clearTileQueue();
    const clearIcon = document.createElement('div');
    clearIcon.style.cssText = 'font-size:18px;line-height:1';
    clearIcon.textContent = '✖️';
    const clearLab = document.createElement('div');
    clearLab.style.cssText = 'font-size:9px;color:#e74c3c;text-align:center;line-height:1.2';
    clearLab.innerHTML = 'Limpar<br>fila';
    clearCell.appendChild(clearIcon);
    clearCell.appendChild(clearLab);
    cont.appendChild(clearCell);
  }

  function handleCHRImport(e){
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev)=>{
        try{
            const buf = new Uint8Array(ev.target.result);
            let finalData;

            // Detecta se é .nes pela extensão ou pela assinatura
            if (file.name.toLowerCase().endsWith('.nes') || (buf[0] === 0x4E && buf[1] === 0x45)) {
                finalData = parseNES(buf);
                if (!finalData) return; // Erro já tratado no parseNES
            } else {
                finalData = buf;
            }

            // ... (Continue com o código existente de verificação de tamanho/set no buffer)
            if(finalData.length < 16){ alert('Dados muito pequenos'); return; }
            
            // Lógica de expansão/cópia que você já tinha:
            let newBuf;
            if(finalData.length >= 8192) newBuf = finalData.slice(0, 8192);
            else {
                newBuf = new Uint8Array(8192);
                newBuf.set(finalData);
            }
            
            chrBuffer = newBuf;
            // ... (restante do seu código original de reset de estados e render)
            currentBank = 0;
            gridW = 2; gridH = 2;
            selectedTiles = [0,1,16,17];
            activeSlotIdx = 0;
            pushUndo();
            updateBankSelect();
            ensurePaletteMatchesBank();
            initPalUI();
            renderAll();
            updateLabels();
            
            if(typeof Project !== 'undefined' && Project.status) Project.status(`Arquivo carregado: ${file.name}`);
        } catch(err){
            alert('Erro ao processar arquivo: ' + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function paintZoomPixel(px, py, colorSlot){
    const tiles=currentTiles();
    const gx=Math.floor(px/8), gy=Math.floor(py/8), slot=gy*gridW+gx, ti=tiles[slot];
    if(ti===undefined) return;
    const lx=px%8, ly=py%8, off=ti*16, sh=7-lx;
    const c = colorSlot & 3;
    if(c & 1) chrBuffer[off+ly] |= (1<<sh); else chrBuffer[off+ly] &= ~(1<<sh);
    if(c & 2) chrBuffer[off+ly+8] |= (1<<sh); else chrBuffer[off+ly+8] &= ~(1<<sh);
    renderAll();
  }
  function attachEvents(){
    // Handler de import .CHR
    const importInput = document.getElementById('importCHR_internal');
    if(importInput){
      importInput.onchange = handleCHRImport;
    }
    document.getElementById('chkShowGrid')?.addEventListener('change', ()=> renderSheet());
    sheetCanvas?.addEventListener('click', e=>{
      const r=sheetCanvas.getBoundingClientRect();
      const x=Math.floor((e.clientX-r.left)/32), y=Math.floor((e.clientY-r.top)/32);
      const g=currentBank*256+y*16+x;
      if(tool==='sheetcopy'){ copySheetTile(g); return; }
      if(tool==='sheetpaste'){ pasteSheetTile(g); return; }
      if(tool==='sheetclear'){ clearSheetTile(g); return; }
      setCurrentTileAt(activeSlotIdx, g); activeSlotIdx=(activeSlotIdx+1)%selectedTiles.length; renderAll(); updateLabels();
    });
    zoomCanvas?.addEventListener('mousedown', e=>{
      const rect=zoomCanvas.getBoundingClientRect(); const px=Math.floor(((e.clientX-rect.left)/rect.width)*zoomCanvas.width/16), py=Math.floor(((e.clientY-rect.top)/rect.height)*zoomCanvas.height/16);
      if(e.button===2){ const gx=Math.floor(px/8), gy=Math.floor(py/8), slot=gy*gridW+gx, ti=selectedTiles[slot]; if(ti!==undefined){ const lx=px%8, ly=py%8, off=ti*16; const p0=chrBuffer[off+ly], p1=chrBuffer[off+ly+8], sh=7-lx; activeSlot=((p1>>sh&1)<<1)|(p0>>sh&1); initPalUI(); } return; }
      if(tool==='pen' || tool==='erase'){
        isDrawing=true;
        paintZoomPixel(px, py, tool==='erase' ? 0 : activeSlot);
      }
      else if(['line','rect','circle'].includes(tool)){ if(!toolStart){ toolStart={x:px,y:py}; } else { if(tool==='line') doLine(toolStart.x,toolStart.y,px,py); else if(tool==='rect') doRect(toolStart.x,toolStart.y,px,py); else if(tool==='circle') doCircle(toolStart.x,toolStart.y,px,py); toolStart=null; toolPreviewEnd=null; } }
      else if(tool==='fill') doFill(px,py);
      else if(tool==='copy') copyDrag={x0:px,y0:py,x1:px,y1:py,active:true};
      else if(tool==='paste') doPaste(px,py);
    });
    zoomCanvas?.addEventListener('contextmenu', e=>e.preventDefault());
    zoomCanvas?.addEventListener('mousemove', e=>{ const rect=zoomCanvas.getBoundingClientRect(); const px=Math.floor(((e.clientX-rect.left)/rect.width)*zoomCanvas.width/16), py=Math.floor(((e.clientY-rect.top)/rect.height)*zoomCanvas.height/16); if((tool==='pen'||tool==='erase')&&isDrawing&&e.buttons===1){ paintZoomPixel(px, py, tool==='erase' ? 0 : activeSlot); } else if(['line','rect','circle'].includes(tool)&&toolStart){ toolPreviewEnd={x:px,y:py}; renderZoom(); } else if(tool==='copy'&&copyDrag&&copyDrag.active){ copyDrag.x1=px; copyDrag.y1=py; renderZoom(); } });
    window.addEventListener('mouseup', ()=>{ isDrawing=false; if(copyDrag&&copyDrag.active){ copyDrag.active=false; doCopy(copyDrag.x0, copyDrag.y0, copyDrag.x1, copyDrag.y1); renderZoom(); copyDrag=null; } });
  }

  function saveMetatile(){
    const sel=document.getElementById('metatileSelect');
    const existingId = sel && sel.value;
    const packOverlay = ()=>{
      if(!overlayEnabled) return null;
      ensureOverlayLen();
      return { tiles:[...overlayTiles], flips:[...overlayFlips], palette:overlayPal, dx:overlayDx|0, dy:overlayDy|0 };
    };
    if(existingId){
      const mt = metatiles.find(m=>m.id===existingId);
      if(mt){
        ensureFlipsLen();
        mt.w=gridW; mt.h=gridH; mt.tiles=[...selectedTiles]; mt.flips=[...selectedFlips];
        mt.bank=currentBank; mt.palette=activePal;
        const ov = packOverlay();
        if(ov) mt.overlay = ov; else delete mt.overlay;
        updateMetatileSelect(); renderAll();
        if(typeof Project!=='undefined' && Project.status) Project.status(`Metatile "${mt.name}" atualizado`+(ov?' (+overlay)':''));
        return;
      }
    }
    const name=prompt(`Nome:`, `metatile_${metatiles.length+1}_${gridW}x${gridH}_PT${currentBank}`); if(!name) return;
    ensureFlipsLen();
    const id='mt_'+Date.now();
    const mt={ id, name:name.trim(), w:gridW, h:gridH, tiles:[...selectedTiles], flips:[...selectedFlips], bank:currentBank, palette:activePal, created:Date.now() };
    const ov = packOverlay();
    if(ov) mt.overlay = ov;
    metatiles.push(mt);
    updateMetatileSelect();
    if(sel) sel.value = id;
    renderAll();
    if(typeof Project!=='undefined' && Project.status) Project.status(`Metatile "${mt.name}" criado`);
  }


  function newTile(){
    const name=prompt("Nome do novo metatile:", `metatile_${metatiles.length+1}`); if(!name) return;
    const base=currentBank*256;
    gridW=2; gridH=2; selectedTiles=[base, base+1, base+16, base+17]; selectedFlips=[0,0,0,0]; activeSlotIdx=0;
    overlayEnabled=false; overlayTiles=[]; overlayFlips=[]; overlayDx=0; overlayDy=0; editLayer=0;
    const id='mt_'+Date.now();
    const mt={ id, name:name.trim(), w:gridW, h:gridH, tiles:[...selectedTiles], flips:[...selectedFlips], bank:currentBank, palette:activePal, created:Date.now() };
    metatiles.push(mt);
    updateMetatileSelect();
    const sel=document.getElementById('metatileSelect'); if(sel) sel.value=id;
    updateLayerUI();
    renderAll(); updateLabels();
    if(typeof Project!=='undefined' && Project.status) Project.status(`Novo metatile "${mt.name}" - edite e clique em Save`);
  }
  function loadSelectedMetatile(){
    const sel=document.getElementById('metatileSelect');
    if(!sel||!sel.value) return;
    const mt=metatiles.find(m=>m.id===sel.value);
    if(!mt) return;
    gridW=mt.w; gridH=mt.h;
    selectedTiles=[...mt.tiles];
    selectedFlips=(mt.flips&&mt.flips.length===mt.tiles.length)?[...mt.flips]:mt.tiles.map(()=>0);
    currentBank=mt.bank||0;
    activePal=mt.palette||0;
    activeSlotIdx=0;
    if(mt.overlay && Array.isArray(mt.overlay.tiles) && mt.overlay.tiles.length){
      overlayEnabled = true;
      overlayTiles = mt.overlay.tiles.map(t => (t==null || t < 0) ? -1 : t|0);
      overlayFlips = (mt.overlay.flips && mt.overlay.flips.length===overlayTiles.length) ? [...mt.overlay.flips] : overlayTiles.map(()=>0);
      overlayPal = mt.overlay.palette != null ? mt.overlay.palette : 5;
      overlayDx = mt.overlay.dx|0;
      overlayDy = mt.overlay.dy|0;
    } else {
      overlayEnabled = false;
      overlayTiles = [];
      overlayFlips = [];
      overlayDx = 0; overlayDy = 0;
    }
    editLayer = 0;
    if(zoomCanvas){ zoomCanvas.width=gridW*8*16; zoomCanvas.height=gridH*8*16; }
    updateLayerUI();
    renderAll(); updateLabels();
  }

  function onMetatileSelectChange(){ loadSelectedMetatile(); }
  function deleteMetatile(){ const sel=document.getElementById('metatileSelect'); if(!sel||!sel.value) return; metatiles=metatiles.filter(m=>m.id!==sel.value); updateMetatileSelect(); renderAll(); }
  function renameMetatile(){
    const sel=document.getElementById('metatileSelect');
    if(!sel||!sel.value){ alert('Selecione um metatile na lista primeiro.'); return; }
    const mt=metatiles.find(m=>m.id===sel.value);
    if(!mt) return;
    const name=prompt('Novo nome do metatile:', mt.name||'');
    if(name===null) return;
    const trimmed=name.trim();
    if(!trimmed){ alert('Nome inválido.'); return; }
    mt.name=trimmed;
    updateMetatileSelect();
    if(sel) sel.value=mt.id;
    renderMetatilePreview();
    if(typeof Project!=='undefined' && Project.status) Project.status(`Metatile renomeado para "${mt.name}"`);
  }
  function updateMetatileSelect(){
    const sel=document.getElementById('metatileSelect');
    const countEl=document.getElementById('lblMetatileCount');
    const bankMetatiles = metatiles.filter(mt => (mt.bank||0) === currentBank);
    if(countEl) countEl.textContent=bankMetatiles.length;
    if(!sel) return;
    const cur=sel.value;
    sel.innerHTML='<option value="">— Metatiles —</option>';
    bankMetatiles.forEach(mt=>{ const o=document.createElement('option'); o.value=mt.id; o.textContent=`${mt.name} (${mt.w}x${mt.h}) PT${mt.bank||0}`+(mt.overlay?' +ov':''); sel.appendChild(o); });
    if(cur && bankMetatiles.some(m=>m.id===cur)) sel.value=cur;
    renderMetatilePreview();
  }

  function setToolImpl(t){
    tool=t; toolStart=null; toolPreviewEnd=null; if(copyDrag) copyDrag.active=false;
    try{
      document.querySelectorAll('.tool-btn').forEach(b=>{
        const on = b.dataset.tool===t;
        b.classList.toggle('active', on);
        if(on){ b.style.background='#007acc'; b.style.borderColor='#007acc'; }
        else { b.style.background=''; b.style.borderColor=''; }
      });
    }catch(e){}
    // dica de status
    const status = document.getElementById('statusLeft');
    if(status){
      if(t==='sheetcopy') status.textContent = 'Copiar Tile: clique na folha para ADICIONAR à fila';
      else if(t==='sheetpaste') status.textContent = 'Colar Tile: clique na folha para colar o item selecionado da fila';
      else if(t==='sheetclear') status.textContent = 'Clear Tile: clique na folha para ZERAR o tile';
      else status.textContent = `Tool: ${t}`;
    }
    renderAll();
  }
  // Quando true, nunca injeta assets/novo.chr (projeto .nms já carregado ou em carga).
  let suppressDefaultChr = false;

  async function tryLoadDefaultCHR(force){
    try{
      // Projeto carregado / em carga: não sobrescreve o CHR do .nms
      if(!force && suppressDefaultChr) return false;
      // Se buffer já tem conteúdo, não carrega (exceto força explícita)
      if(!force && chrBuffer.some(b => b !== 0)) return false;
      const resp = await fetch('assets/novo.chr');
      if(!resp.ok) return false;
      // Revalida após o await: o projeto pode ter sido carregado no meio tempo
      if(!force && suppressDefaultChr) return false;
      if(!force && chrBuffer.some(b => b !== 0)) return false;
      const buf = new Uint8Array(await resp.arrayBuffer());
      if(buf.length < 16) return false;
      if(!force && suppressDefaultChr) return false;
      if(!force && chrBuffer.some(b => b !== 0)) return false;
      // Verifica se arquivo tem conteúdo
      const hasData = buf.some(b => b !== 0);
      if(!hasData) return false;
      let newBuf;
      if(buf.length >= 8192) newBuf = buf.slice(0, 8192);
      else if(buf.length >= 4096){ newBuf = new Uint8Array(8192); newBuf.set(buf); if(buf.length === 4096) newBuf.set(buf, 4096); }
      else { newBuf = new Uint8Array(8192); newBuf.set(buf); }
      chrBuffer = newBuf;
      currentBank = 0;
      gridW = 2; gridH = 2;
      selectedTiles = [0,1,16,17];
      activeSlotIdx = 0;
      updateBankSelect();
      ensurePaletteMatchesBank();
      initPalUI();
      renderAll();
      updateLabels();
      console.log(force ? 'novo.chr carregado (novo projeto)' : 'Default novo.chr carregado automaticamente');
      return true;
    }catch(e){
      console.log('Não foi possível carregar assets/novo.chr:', e.message);
      return false;
    }
  }


  // ========== IMPORT IMAGEM (passo 1) ==========
  function openImageImport(){
    const modal = document.getElementById('imgImportModal');
    if(!modal) return;
    modal.style.display = 'flex';
    const input = document.getElementById('importImage_internal');
    if(input && !input._bound){
      input._bound = true;
      input.onchange = handleImageImportFile;
    }
    imgImport.colorMap = [0,1,2,3];
    imgImport.previewPal = activePal;
    // seeds 4 cores a partir da subpaleta ativa do editor (usuário pode mudar livremente)
    try {
      const src = palettes[activePal] || palettes[0] || [15,0,16,48];
      imgImport.importPal = [src[0]&63, src[1]&63, src[2]&63, src[3]&63];
    } catch(e){ imgImport.importPal = [15,0,16,48]; }
    imgImportAttachCanvasEvents();
    imgImportRenderPalettesUI();
    imgImportRenderColorMapUI();
    imgImportRedraw();
    imgImportLivePreview();
  }
  function closeImageImport(){
    const modal = document.getElementById('imgImportModal');
    if(modal) modal.style.display = 'none';
  }
  function imgImportNaturalSize(){
    if(!imgImport.img) return {w:0,h:0};
    if(imgImport.img.naturalWidth) return {w: imgImport.img.naturalWidth, h: imgImport.img.naturalHeight};
    return {w: imgImport.img.width|0, h: imgImport.img.height|0};
  }
  function handleImageImportFile(e){
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      imgImport.img = img;
      imgImport.sel = null;
      imgImport.viewZoom = 1;
      imgImport.gridTW = Math.max(1, Math.min(16, Math.round(img.naturalWidth/32) || 2));
      imgImport.gridTH = Math.max(1, Math.min(16, Math.round(img.naturalHeight/32) || 2));
      const gw = document.getElementById('imgImportGridW');
      const gh = document.getElementById('imgImportGridH');
      if(gw) gw.value = imgImport.gridTW;
      if(gh) gh.value = imgImport.gridTH;
      // célula inicial: encaixa a imagem nos tiles
      imgImport.cellSrcW = Math.max(1, Math.round((img.naturalWidth||img.width) / imgImport.gridTW));
      imgImport.cellSrcH = Math.max(1, Math.round((img.naturalHeight||img.height) / imgImport.gridTH));
      const cw = document.getElementById('imgImportCellW');
      const ch = document.getElementById('imgImportCellH');
      if(cw) cw.value = imgImport.cellSrcW;
      if(ch) ch.value = imgImport.cellSrcH;
      imgImportApplySelFromCells();
      const info = document.getElementById('imgImportFileInfo');
      if(info) info.innerHTML = `<b style="color:#fff">${file.name}</b><br>${img.naturalWidth}×${img.naturalHeight} px`;
      imgImportSyncSelInputs();
      imgImportUpdateOutInfo();
      imgImportRedraw();
      imgImportLivePreview();
    };
    img.onerror = ()=> alert('Não foi possível carregar a imagem');
    img.src = url;
    e.target.value = '';
  }
  function imgImportZoom(dir){
    if(dir === 0) imgImport.viewZoom = 1;
    else if(dir > 0) imgImport.viewZoom = Math.min(8, +(imgImport.viewZoom * 1.25).toFixed(3));
    else imgImport.viewZoom = Math.max(0.25, +(imgImport.viewZoom / 1.25).toFixed(3));
    const lbl = document.getElementById('imgImportZoomLbl');
    if(lbl) lbl.textContent = `zoom ${imgImport.viewZoom}×`;
    imgImportRedraw();
  }
  function imgImportSetBW(on){
    imgImport.bw = !!on;
    imgImport.editCanvas = null; imgImport.editIndices = null;
    imgImportRedraw();
    imgImportLivePreview();
  }
  function imgImportSetContrast(v){
    // input 20–300 → 0.2–3.0
    const n = Math.max(20, Math.min(300, parseInt(v,10)||100));
    imgImport.contrast = n / 100;
    const lbl = document.getElementById('imgImportContrastLbl');
    if(lbl) lbl.textContent = imgImport.contrast.toFixed(2);
    imgImport.editCanvas = null; imgImport.editIndices = null;
    imgImportRedraw();
    imgImportLivePreview();
  }
  /** Aplica contraste em torno do cinza médio 128. */
  function imgImportApplyContrastGray(g){
    const c = imgImport.contrast || 1;
    let v = (g - 128) * c + 128;
    if(v < 0) v = 0;
    if(v > 255) v = 255;
    return v|0;
  }
  function imgImportSetSample(v){
    imgImport.sampleN = Math.max(1, Math.min(4, parseInt(v,10)||1));
    const lbl = document.getElementById('imgImportSampleLbl');
    if(lbl) lbl.textContent = String(imgImport.sampleN);
    imgImport.editCanvas = null; imgImport.editIndices = null;
    imgImportLivePreview();
  }
  function imgImportSetGrid(){
    imgImport.gridTW = Math.max(1, Math.min(32, parseInt(document.getElementById('imgImportGridW')?.value,10)||1));
    imgImport.gridTH = Math.max(1, Math.min(32, parseInt(document.getElementById('imgImportGridH')?.value,10)||1));
    imgImportApplySelFromCells();
    imgImport.editCanvas = null; imgImport.editIndices = null;
    imgImportMaybeAutoPal();
    imgImportUpdateOutInfo();
    imgImportRedraw();
    imgImportLivePreview();
  }
  /** Célula W/H → seleção = tiles × célula (origem fixa; pode sair da imagem). */
  function imgImportSetCellSize(){
    imgImport.cellSrcW = Math.max(1, Math.min(256, parseInt(document.getElementById('imgImportCellW')?.value,10)||8));
    imgImport.cellSrcH = Math.max(1, Math.min(256, parseInt(document.getElementById('imgImportCellH')?.value,10)||8));
    const elW = document.getElementById('imgImportCellW');
    const elH = document.getElementById('imgImportCellH');
    if(elW) elW.value = imgImport.cellSrcW;
    if(elH) elH.value = imgImport.cellSrcH;
    imgImportApplySelFromCells();
    imgImport.editCanvas = null; imgImport.editIndices = null;
    imgImportMaybeAutoPal();
    imgImportUpdateOutInfo();
    imgImportRedraw();
    imgImportLivePreview();
  }
  function imgImportApplySelFromCells(){
    const cw = Math.max(1, imgImport.cellSrcW || 8);
    const ch = Math.max(1, imgImport.cellSrcH || 8);
    const tw = Math.max(1, imgImport.gridTW || 1);
    const th = Math.max(1, imgImport.gridTH || 1);
    if(!imgImport.sel){
      imgImport.sel = { x: 0, y: 0, w: tw * cw, h: th * ch };
    } else {
      imgImport.sel = {
        x: imgImport.sel.x,
        y: imgImport.sel.y,
        w: tw * cw,
        h: th * ch
      };
    }
    imgImportSyncSelInputs();
  }
  /** Após desenhar/redimensionar a seleção: deriva célula e encaixa seleção em múltiplo exato. */
  function imgImportSyncCellsFromSel(){
    if(!imgImport.sel || imgImport.sel.w < 1 || imgImport.sel.h < 1) return;
    const tw = Math.max(1, imgImport.gridTW || 1);
    const th = Math.max(1, imgImport.gridTH || 1);
    imgImport.cellSrcW = Math.max(1, Math.round(imgImport.sel.w / tw));
    imgImport.cellSrcH = Math.max(1, Math.round(imgImport.sel.h / th));
    imgImport.sel.w = imgImport.cellSrcW * tw;
    imgImport.sel.h = imgImport.cellSrcH * th;
    const elW = document.getElementById('imgImportCellW');
    const elH = document.getElementById('imgImportCellH');
    if(elW) elW.value = imgImport.cellSrcW;
    if(elH) elH.value = imgImport.cellSrcH;
    imgImportSyncSelInputs();
    imgImportMaybeAutoPal();
  }
  function imgImportSetPrevGrid(on){
    imgImport.showPrevGrid = !!on;
    const chk = document.getElementById('imgImportPrevGrid');
    if(chk) chk.checked = imgImport.showPrevGrid;
    imgImportLivePreview();
  }
  function imgImportClearSelection(){

    imgImport.sel = null;
    imgImportSyncSelInputs();
    imgImportRedraw();
    imgImportLivePreview();
  }
  function imgImportSelectAll(){
    const sz = imgImportNaturalSize();
    if(!sz.w) return;
    imgImport.sel = { x:0, y:0, w:sz.w, h:sz.h };
    imgImportSyncCellsFromSel();
    imgImportUpdateOutInfo();
    imgImportRedraw();
    imgImportLivePreview();
  }
  function imgImportApplyCrop(){
    if(!imgImport.img){ alert('Carregue uma imagem primeiro'); return; }
    if(!imgImport.sel || imgImport.sel.w < 1 || imgImport.sel.h < 1){
      alert('Faça uma seleção antes do Crop.');
      return;
    }
    const s = imgImport.sel;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(s.w));
    c.height = Math.max(1, Math.round(s.h));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imgImport.img, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height);
    imgImport.img = c;
    imgImport.sel = null;
    const info = document.getElementById('imgImportFileInfo');
    if(info){
      const prev = (info.innerHTML.split('<br>')[0]) || 'Imagem';
      info.innerHTML = prev + `<br>${c.width}×${c.height} px <span style="color:#e67e22">(cropado)</span>`;
    }
    imgImportSyncSelInputs();
    imgImportUpdateOutInfo();
    imgImportRedraw();
    imgImportLivePreview();
  }
  function imgImportSetCropFromInputs(){
    if(!imgImport.img) return;
    const sz = imgImportNaturalSize();
    let x = Math.max(0, parseInt(document.getElementById('imgImportCropX')?.value,10)||0);
    let y = Math.max(0, parseInt(document.getElementById('imgImportCropY')?.value,10)||0);
    let w = Math.max(1, parseInt(document.getElementById('imgImportCropW')?.value,10)||1);
    let h = Math.max(1, parseInt(document.getElementById('imgImportCropH')?.value,10)||1);
    if(x >= sz.w) x = Math.max(0, sz.w-1);
    if(y >= sz.h) y = Math.max(0, sz.h-1);
    if(x+w > sz.w) w = sz.w - x;
    if(y+h > sz.h) h = sz.h - y;
    imgImport.sel = { x, y, w, h };
    imgImportSyncCellsFromSel();
    imgImportSyncSelInputs();
    imgImportUpdateOutInfo();
    imgImportRedraw();
    imgImportLivePreview();
  }
  function imgImportSyncSelInputs(){
    const s = imgImport.sel || { x:0, y:0, w:0, h:0 };
    const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value = Math.round(v); };
    set('imgImportCropX', s.x); set('imgImportCropY', s.y);
    set('imgImportCropW', s.w); set('imgImportCropH', s.h);
  }
  function imgImportUpdateOutInfo(){
    const outW = imgImport.gridTW * 8, outH = imgImport.gridTH * 8;
    const cw = imgImport.cellSrcW || 8, ch = imgImport.cellSrcH || 8;
    const selW = imgImport.gridTW * cw, selH = imgImport.gridTH * ch;
    const el = document.getElementById('imgImportOutInfo');
    const gpx = document.getElementById('imgImportGridPxInfo');
    if(gpx) gpx.textContent = `Célula ${cw}×${ch} · seleção ${selW}×${selH} · saída NES ${outW}×${outH}`;
    if(el){
      el.innerHTML = `Célula: <b style="color:#ffcc00">${cw}×${ch}</b> px<br>`
        + `Seleção: <b style="color:#fff">${selW}×${selH}</b> px (${imgImport.gridTW}×${imgImport.gridTH} tiles)<br>`
        + `Saída: <b style="color:#e67e22">${outW}×${outH}</b> px`;
    }
  }
  function imgImportComputeMetrics(canvasW, canvasH){
    // só calcula escala/offset — NÃO altera o canvas (setar width limpa o buffer)
    if(!imgImport.img) return null;
    const sz = imgImportNaturalSize();
    const iw = sz.w, ih = sz.h;
    if(!iw || !ih) return null;
    const pad = 8;
    const maxW = Math.max(64, (canvasW||640) - pad*2);
    const maxH = Math.max(64, (canvasH||480) - pad*2);
    // fit base em 640×480, depois aplica viewZoom
    const baseScale = Math.min((640-pad*2)/iw, (480-pad*2)/ih, 8);
    const scale = baseScale * (imgImport.viewZoom || 1);
    const dw = iw * scale, dh = ih * scale;
    const needW = Math.max(640, Math.ceil(dw + pad*2));
    const needH = Math.max(480, Math.ceil(dh + pad*2));
    const cw = canvasW || needW, ch = canvasH || needH;
    const ox = (cw - dw) / 2, oy = (ch - dh) / 2;
    return { scale, ox, oy, dw, dh, iw, ih, needW, needH };
  }
  function imgImportGetViewMetrics(){
    const canvas = document.getElementById('imgImportCanvas');
    if(!canvas || !imgImport.img) return null;
    // usa tamanho atual do canvas — não redimensiona aqui
    return imgImportComputeMetrics(canvas.width, canvas.height);
  }
  function imgImportDrawSource(ctx, m){
    // desenha imagem (opcional PB) no view
    if(imgImport.bw){
      const tmp = document.createElement('canvas');
      tmp.width = m.iw; tmp.height = m.ih;
      const tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(imgImport.img, 0, 0);
      const id = tctx.getImageData(0,0,m.iw,m.ih);
      for(let i=0;i<id.data.length;i+=4){
        let g = (id.data[i]*0.299 + id.data[i+1]*0.587 + id.data[i+2]*0.114)|0;
        g = imgImportApplyContrastGray(g);
        id.data[i]=id.data[i+1]=id.data[i+2]=g;
      }
      tctx.putImageData(id,0,0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, m.ox, m.oy, m.dw, m.dh);
    } else {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(imgImport.img, m.ox, m.oy, m.dw, m.dh);
    }
  }
  function imgImportHandleSize(){ return 8; }
  function imgImportGetHandles(m){
    if(!imgImport.sel) return [];
    const s = imgImport.sel;
    const x0 = m.ox + s.x * m.scale, y0 = m.oy + s.y * m.scale;
    const x1 = m.ox + (s.x+s.w) * m.scale, y1 = m.oy + (s.y+s.h) * m.scale;
    const xm = (x0+x1)/2, ym = (y0+y1)/2;
    return [
      {id:'nw',x:x0,y:y0},{id:'n',x:xm,y:y0},{id:'ne',x:x1,y:y0},
      {id:'e',x:x1,y:ym},{id:'se',x:x1,y:y1},{id:'s',x:xm,y:y1},
      {id:'sw',x:x0,y:y1},{id:'w',x:x0,y:ym}
    ];
  }
  function imgImportHitHandle(mx,my,m){
    const hs = imgImportHandleSize()/2 + 2;
    for(const h of imgImportGetHandles(m)){
      if(Math.abs(mx-h.x)<=hs && Math.abs(my-h.y)<=hs) return h.id;
    }
    return null;
  }
  function imgImportHitInsideSel(mx,my,m){
    if(!imgImport.sel) return false;
    const s = imgImport.sel;
    const x0 = m.ox + s.x * m.scale, y0 = m.oy + s.y * m.scale;
    const x1 = m.ox + (s.x+s.w) * m.scale, y1 = m.oy + (s.y+s.h) * m.scale;
    return mx>=x0 && mx<=x1 && my>=y0 && my<=y1;
  }
  function imgImportRedraw(){
    const canvas = document.getElementById('imgImportCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    if(!imgImport.img){
      canvas.width = 640; canvas.height = 480;
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0,0,640,480);
      ctx.fillStyle = '#555';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Escolha uma imagem…', 320, 240);
      return;
    }
    // dimensiona só no redraw (única vez que pode limpar o buffer)
    let m = imgImportComputeMetrics();
    if(!m) return;
    if(canvas.width !== m.needW || canvas.height !== m.needH){
      canvas.width = m.needW;
      canvas.height = m.needH;
      m = imgImportComputeMetrics(canvas.width, canvas.height);
    }
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0,0,canvas.width, canvas.height);
    imgImportDrawSource(ctx, m);

    // seleção
    if(imgImport.sel){
      const s = imgImport.sel;
      const cx = m.ox + s.x * m.scale;
      const cy = m.oy + s.y * m.scale;
      const cw = s.w * m.scale;
      const ch = s.h * m.scale;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(m.ox, m.oy, m.dw, Math.max(0, cy - m.oy));
      ctx.fillRect(m.ox, cy+ch, m.dw, Math.max(0, m.oy+m.dh - (cy+ch)));
      ctx.fillRect(m.ox, cy, Math.max(0, cx - m.ox), ch);
      ctx.fillRect(cx+cw, cy, Math.max(0, m.ox+m.dw - (cx+cw)), ch);
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx+0.5, cy+0.5, cw, ch);

      // GRID: divide a seleção em gridTW × gridTH células iguais
      if(document.getElementById('imgImportShowGrid')?.checked !== false){
        const tw = Math.max(1, imgImport.gridTW || 1);
        const th = Math.max(1, imgImport.gridTH || 1);
        ctx.strokeStyle = 'rgba(125,206,160,0.45)';
        ctx.lineWidth = 1;
        // sub-pixel guide: 1 linha por "px de saída" (tw*8)
        const pxW = tw * 8, pxH = th * 8;
        for(let i=1; i<pxW; i++){
          if(i % 8 === 0) continue;
          const x = cx + (cw * i / pxW);
          ctx.beginPath(); ctx.moveTo(x+0.5, cy); ctx.lineTo(x+0.5, cy+ch); ctx.stroke();
        }
        for(let j=1; j<pxH; j++){
          if(j % 8 === 0) continue;
          const y = cy + (ch * j / pxH);
          ctx.beginPath(); ctx.moveTo(cx, y+0.5); ctx.lineTo(cx+cw, y+0.5); ctx.stroke();
        }
        // linhas de tile (fortes)
        ctx.strokeStyle = 'rgba(125,206,160,0.95)';
        for(let i=0; i<=tw; i++){
          const x = cx + (cw * i / tw);
          ctx.beginPath(); ctx.moveTo(x+0.5, cy); ctx.lineTo(x+0.5, cy+ch); ctx.stroke();
        }
        for(let j=0; j<=th; j++){
          const y = cy + (ch * j / th);
          ctx.beginPath(); ctx.moveTo(cx, y+0.5); ctx.lineTo(cx+cw, y+0.5); ctx.stroke();
        }
      }
      const hs = imgImportHandleSize();
      ctx.fillStyle = '#ffcc00';
      for(const h of imgImportGetHandles(m)){
        ctx.fillRect(h.x - hs/2, h.y - hs/2, hs, hs);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x - hs/2, h.y - hs/2, hs, hs);
        ctx.fillStyle = '#ffcc00';
      }
    }
    const zl = document.getElementById('imgImportZoomLbl');
    if(zl) zl.textContent = `zoom ${imgImport.viewZoom}×`;
  }
  function imgImportCanvasToImage(mx, my){
    const m = imgImportGetViewMetrics();
    if(!m) return null;
    return {
      x: Math.max(0, Math.min(m.iw, (mx - m.ox) / m.scale)),
      y: Math.max(0, Math.min(m.ih, (my - m.oy) / m.scale))
    };
  }
  function imgImportAttachCanvasEvents(){
    const canvas = document.getElementById('imgImportCanvas');
    if(!canvas || canvas._imgImpBound3) return;
    canvas._imgImpBound3 = true;
    const pos = (e)=>{
      const r = canvas.getBoundingClientRect();
      return {
        mx: (e.clientX - r.left) * (canvas.width / r.width),
        my: (e.clientY - r.top) * (canvas.height / r.height)
      };
    };
    canvas.addEventListener('mousedown', e=>{
      if(!imgImport.img) return;
      const {mx,my} = pos(e);
      const m = imgImportGetViewMetrics();
      if(!m) return;
      if(imgImport.eyedrop){
        e.preventDefault();
        e.stopPropagation();
        imgImportEyedropAt(mx, my);
        return;
      }
      const handle = imgImportHitHandle(mx,my,m);
      if(handle){
        imgImport.drag = { type:'resize', handle, orig:{...imgImport.sel} };
        return;
      }
      if(imgImportHitInsideSel(mx,my,m)){
        const p = imgImportCanvasToImage(mx,my);
        imgImport.drag = { type:'move', x0:p.x, y0:p.y, orig:{...imgImport.sel} };
        return;
      }
      const p = imgImportCanvasToImage(mx,my);
      if(!p) return;
      imgImport.drag = { type:'new', x0:p.x, y0:p.y };
      imgImport.sel = { x:p.x, y:p.y, w:1, h:1 };
      imgImportSyncSelInputs();
      imgImportRedraw();
    });
    canvas.addEventListener('mousemove', e=>{
      if(!imgImport.img) return;
      const {mx,my} = pos(e);
      const m = imgImportGetViewMetrics();
      if(!m) return;
      const handle = imgImportHitHandle(mx,my,m);
      if(imgImport.eyedrop){ canvas.style.cursor = 'copy'; }
      else if(handle){
        const cursors = {n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize'};
        canvas.style.cursor = cursors[handle] || 'crosshair';
      } else if(imgImportHitInsideSel(mx,my,m)) canvas.style.cursor = 'move';
      else canvas.style.cursor = 'crosshair';
      if(!imgImport.drag) return;
      const p = imgImportCanvasToImage(mx,my);
      if(!p) return;
      const sz = imgImportNaturalSize();
      if(imgImport.drag.type === 'new'){
        const x0=imgImport.drag.x0, y0=imgImport.drag.y0;
        imgImport.sel = {
          x: Math.min(x0,p.x), y: Math.min(y0,p.y),
          w: Math.max(1, Math.abs(p.x-x0)), h: Math.max(1, Math.abs(p.y-y0))
        };
      } else if(imgImport.drag.type === 'move'){
        const o = imgImport.drag.orig;
        let nx = o.x + (p.x - imgImport.drag.x0);
        let ny = o.y + (p.y - imgImport.drag.y0);
        nx = Math.max(0, Math.min(sz.w - o.w, nx));
        ny = Math.max(0, Math.min(sz.h - o.h, ny));
        imgImport.sel = { x:nx, y:ny, w:o.w, h:o.h };
      } else if(imgImport.drag.type === 'resize'){
        const o = imgImport.drag.orig;
        let x0=o.x, y0=o.y, x1=o.x+o.w, y1=o.y+o.h;
        const h = imgImport.drag.handle;
        if(h.includes('n')) y0 = Math.min(p.y, y1-1);
        if(h.includes('s')) y1 = Math.max(p.y, y0+1);
        if(h.includes('w')) x0 = Math.min(p.x, x1-1);
        if(h.includes('e')) x1 = Math.max(p.x, x0+1);
        // pode ultrapassar a imagem (só evita origem negativa extrema)
        x0 = Math.min(x0, x1-1);
        y0 = Math.min(y0, y1-1);
        imgImport.sel = { x:x0, y:y0, w:Math.max(1,x1-x0), h:Math.max(1,y1-y0) };
      }
      imgImportSyncSelInputs();
      imgImportRedraw();
    });
    window.addEventListener('mouseup', ()=>{
      if(imgImport.drag){
        imgImport.drag = null;
        // deriva célula a partir da seleção desenhada e encaixa no múltiplo de tiles
        imgImportSyncCellsFromSel();
        imgImportUpdateOutInfo();
        imgImportRedraw();
        imgImportLivePreview();
      }
    });
  }

  /** Região fonte: seleção ou imagem inteira */
  function imgImportSourceRect(){
    const sz = imgImportNaturalSize();
    if(imgImport.sel && imgImport.sel.w>=1 && imgImport.sel.h>=1) return {...imgImport.sel};
    return { x:0, y:0, w:sz.w, h:sz.h };
  }

  /**
   * Canvas da saída: seleção → (opcional supersample) → gridTW*8 × gridTH*8 nearest.
   * PB aplicado se ativo. Não usa colorMap aqui (só RGB).
   */
  function imgImportBuildOutputCanvas(){
    if(!imgImport.img) return null;
    const rect = imgImportSourceRect();
    if(!rect || rect.w < 1 || rect.h < 1) return null;
    const outW = imgImport.gridTW * 8;
    const outH = imgImport.gridTH * 8;
    const N = Math.max(1, Math.min(4, imgImport.sampleN|0 || 1));
    // 1) área da seleção (pode ultrapassar a imagem — o drawImage clipa a fonte)
    const src = document.createElement('canvas');
    src.width = Math.max(1, Math.round(rect.w));
    src.height = Math.max(1, Math.round(rect.h));
    const sctx = src.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = '#000';
    sctx.fillRect(0,0,src.width,src.height);
    sctx.drawImage(imgImport.img, rect.x, rect.y, rect.w, rect.h, 0, 0, src.width, src.height);
    if(imgImport.bw){
      const id = sctx.getImageData(0,0,src.width,src.height);
      for(let i=0;i<id.data.length;i+=4){
        let g = (id.data[i]*0.299 + id.data[i+1]*0.587 + id.data[i+2]*0.114)|0;
        g = imgImportApplyContrastGray(g);
        id.data[i]=id.data[i+1]=id.data[i+2]=g;
      }
      sctx.putImageData(id,0,0);
    }
    // 2) supersample nearest
    const mid = document.createElement('canvas');
    mid.width = outW * N;
    mid.height = outH * N;
    const mctx = mid.getContext('2d');
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, mid.width, mid.height);
    // 3) final
    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(mid, 0, 0, mid.width, mid.height, 0, 0, outW, outH);
    return out;
  }

  function imgImportHexToRgb(hex){
    if(!hex || typeof hex !== 'string') return {r:0,g:0,b:0};
    const h = hex.replace('#','');
    return { r:parseInt(h.slice(0,2),16)||0, g:parseInt(h.slice(2,4),16)||0, b:parseInt(h.slice(4,6),16)||0 };
  }
  function imgImportPreviewPaletteRgb(){
    const slots = imgImport.importPal || [15, 0, 16, 48];
    return [0,1,2,3].map(i=>{
      const nesIdx = (slots[i]&63);
      const hex = (typeof NES_PALETTE!=='undefined' && NES_PALETTE[nesIdx]) ? NES_PALETTE[nesIdx] : '#000000';
      return imgImportHexToRgb(hex);
    });
  }
  function imgImportNearestSlot(r,g,b, paletteRgb){
    let best=0, bestD=Infinity;
    for(let i=0;i<4;i++){
      const p=paletteRgb[i];
      const dr=r-p.r, dg=g-p.g, db=b-p.b;
      const d=dr*dr+dg*dg+db*db;
      if(d<bestD){ bestD=d; best=i; }
    }
    return best;
  }
  function imgImportQuantizeToIndices(imageData){
    const { data, width, height } = imageData;
    const pal = imgImportPreviewPaletteRgb();
    const map = imgImport.colorMap || [0,1,2,3];
    const indices = new Uint8Array(width * height);
    for(let i=0,p=0; i<data.length; i+=4, p++){
      if(data[i+3] < 128){ indices[p]=0; continue; }
      const slot = imgImportNearestSlot(data[i], data[i+1], data[i+2], pal);
      indices[p] = map[slot] & 3; // remap só no resultado
    }
    return { indices, width, height, pal };
  }
  function imgImportEncodeTile(indices, width, ox, oy){
    const bytes = new Array(16).fill(0);
    for(let y=0;y<8;y++){
      let p0=0,p1=0;
      for(let x=0;x<8;x++){
        const c = indices[(oy+y)*width+(ox+x)] & 3;
        const sh = 7-x;
        if(c&1) p0 |= (1<<sh);
        if(c&2) p1 |= (1<<sh);
      }
      bytes[y]=p0; bytes[y+8]=p1;
    }
    return bytes;
  }
  function imgImportQuantizeCanvas(srcCanvas){
    const ctx = srcCanvas.getContext('2d');
    const imageData = ctx.getImageData(0,0,srcCanvas.width, srcCanvas.height);
    const { indices, width, height, pal } = imgImportQuantizeToIndices(imageData);
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const octx = out.getContext('2d');
    const id = octx.createImageData(width, height);
    // pal[i] is the RGB of slot i in the chosen subpalette; indices already remapped
    for(let p=0;p<indices.length;p++){
      const c = pal[indices[p]];
      const i=p*4;
      id.data[i]=c.r; id.data[i+1]=c.g; id.data[i+2]=c.b; id.data[i+3]=255;
    }
    octx.putImageData(id,0,0);
    return { canvas: out, indices, width, height };
  }

  function imgImportClearEdit(){
    imgImport.editCanvas = null;
    imgImport.editIndices = null;
    imgImport.editUndo = [];
    imgImportLivePreview();
  }
  function imgImportSetEditMode(on){
    imgImport.editMode = !!on;
    imgImportUpdateEditToolUI();
  }
  function imgImportSetEditTool(t){
    if(t === 'eyedrop'){
      imgImport.editTool = 'eyedrop';
      imgImport.eyedrop = true;
    } else if(t === 'pen'){
      imgImport.editTool = 'pen';
      imgImport.eyedrop = false;
    } else {
      imgImport.editTool = 'flood';
      imgImport.eyedrop = false;
    }
    imgImport.editMode = true;
    const chk = document.getElementById('imgImportEditMode');
    if(chk) chk.checked = true;
    imgImportUpdateEditToolUI();
    if(typeof Project!=='undefined' && Project.status){
      if(imgImport.editTool === 'eyedrop')
        Project.status('Conta-gotas — clique na imagem original (slot ' + (imgImport.paintSlot&3) + ')');
    }
  }
  function imgImportSetPenSize(v){
    imgImport.penSize = Math.max(1, Math.min(8, parseInt(v,10)||1));
    const el = document.getElementById('imgImportPenSize');
    if(el) el.value = imgImport.penSize;
  }
  function imgImportUpdateEditToolUI(){
    const oc = document.getElementById('imgImportOutCanvas');
    if(oc){
      if(!imgImport.editMode) oc.style.cursor = 'default';
      else if(imgImport.editTool === 'pen') oc.style.cursor = 'crosshair';
      else if(imgImport.editTool === 'eyedrop') oc.style.cursor = 'copy';
      else oc.style.cursor = 'cell';
    }
    const mark = (id, on)=>{
      const el = document.getElementById(id);
      if(!el) return;
      if(on){ el.classList.add('active'); el.style.background = '#ffcc00'; el.style.borderColor = '#ffcc00'; el.style.color = '#000'; }
      else { el.classList.remove('active'); el.style.background = ''; el.style.borderColor = ''; el.style.color = ''; }
    };
    const on = !!imgImport.editMode;
    mark('imgImportToolFlood', on && imgImport.editTool === 'flood');
    mark('imgImportToolPen', on && imgImport.editTool === 'pen');
    mark('imgImportToolEyedrop', on && imgImport.editTool === 'eyedrop');
  }
  function imgImportPushEditUndo(){
    if(!imgImport.editIndices) return;
    imgImport.editUndo.push(new Uint8Array(imgImport.editIndices));
    if(imgImport.editUndo.length > 30) imgImport.editUndo.shift();
  }
  function imgImportEditUndo(){
    if(!imgImport.editUndo.length){
      if(typeof Project!=='undefined' && Project.status) Project.status('Nada para desfazer no preview');
      return;
    }
    imgImport.editIndices = imgImport.editUndo.pop();
    // reconstrói canvas RGB
    if(imgImport.editCanvas && imgImport.editIndices){
      const w = imgImport.editCanvas.width, h = imgImport.editCanvas.height;
      const pal = imgImportPreviewPaletteRgb();
      const ctx = imgImport.editCanvas.getContext('2d');
      const id = ctx.createImageData(w,h);
      for(let p=0;p<imgImport.editIndices.length;p++){
        const c = pal[imgImport.editIndices[p]&3];
        const o=p*4;
        id.data[o]=c.r; id.data[o+1]=c.g; id.data[o+2]=c.b; id.data[o+3]=255;
      }
      ctx.putImageData(id,0,0);
    }
    imgImportLivePreview();
  }
  function imgImportSetPaintSlot(s){
    imgImport.paintSlot = s & 3;
    imgImportRenderPaintSlots();
  }
  function imgImportRenderPaintSlots(){
    const cont = document.getElementById('imgImportPaintSlots');
    if(!cont) return;
    cont.innerHTML = '';
    const pal = imgImportPreviewPaletteRgb();
    for(let i=0;i<4;i++){
      const rgb = pal[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = `flex:1;height:28px;border:${imgImport.paintSlot===i?'2px solid #ffcc00':'1px solid #555'};border-radius:3px;background:rgb(${rgb.r},${rgb.g},${rgb.b});cursor:pointer;font-size:10px;font-weight:bold;color:${(rgb.r+rgb.g+rgb.b)>400?'#000':'#fff'}`;
      b.textContent = String(i);
      b.title = `Pintar / flood com slot ${i}`;
      b.onclick = ()=> imgImportSetPaintSlot(i);
      cont.appendChild(b);
    }
  }
  /** Gera buffer editável: nearest → quantize 4 cores (slots). */
  function imgImportPosterize(){
    const raw = imgImportBuildOutputCanvas();
    if(!raw){ alert('Carregue uma imagem e selecione a área'); return; }
    // força caminho de quantize
    const q = imgImportQuantizeCanvas(raw);
    imgImport.editCanvas = q.canvas;
    imgImport.editIndices = q.indices;
    imgImport.editUndo = [];
    imgImport.editMode = true;
    const chk = document.getElementById('imgImportEditMode');
    if(chk) chk.checked = true;
    imgImportRenderPaintSlots();
    imgImportLivePreview();
    if(typeof Project!=='undefined' && Project.status)
      Project.status('Preview em 4 cores — ative flood e clique numa região');
  }
  function imgImportRebuildEditRGB(){
    if(!imgImport.editCanvas || !imgImport.editIndices) return;
    const w = imgImport.editCanvas.width, h = imgImport.editCanvas.height;
    const pal = imgImportPreviewPaletteRgb();
    const ctx = imgImport.editCanvas.getContext('2d');
    const id = ctx.createImageData(w,h);
    for(let p=0;p<imgImport.editIndices.length;p++){
      const c = pal[imgImport.editIndices[p]&3];
      const o=p*4;
      id.data[o]=c.r; id.data[o+1]=c.g; id.data[o+2]=c.b; id.data[o+3]=255;
    }
    ctx.putImageData(id,0,0);
  }
  function imgImportFloodAt(px, py){
    if(!imgImport.editIndices || !imgImport.editCanvas){
      imgImportPosterize();
      if(!imgImport.editIndices) return;
    }
    const w = imgImport.editCanvas.width, h = imgImport.editCanvas.height;
    px = px|0; py = py|0;
    if(px<0||py<0||px>=w||py>=h) return;
    const idx = imgImport.editIndices;
    const target = idx[py*w+px];
    const fill = imgImport.paintSlot & 3;
    if(target === fill) return;
    imgImportPushEditUndo();
    const stack = [[px,py]];
    const seen = new Uint8Array(w*h);
    while(stack.length){
      const [x,y] = stack.pop();
      const i = y*w+x;
      if(x<0||y<0||x>=w||y>=h||seen[i]) continue;
      if(idx[i] !== target) continue;
      seen[i]=1;
      idx[i]=fill;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
    imgImportRebuildEditRGB();
    imgImportLivePreview();
  }
  /** Pen quadrada: size em células do grid de saída (1 célula = 1 px do preview). */
  function imgImportPenAt(px, py){
    if(!imgImport.editIndices || !imgImport.editCanvas){
      imgImportPosterize();
      if(!imgImport.editIndices) return;
    }
    const w = imgImport.editCanvas.width, h = imgImport.editCanvas.height;
    px = px|0; py = py|0;
    if(px<0||py<0||px>=w||py>=h) return;
    const sz = Math.max(1, imgImport.penSize|0);
    // centra o quadrado no clique o máximo possível
    let x0 = px - Math.floor((sz-1)/2);
    let y0 = py - Math.floor((sz-1)/2);
    x0 = Math.max(0, Math.min(w-sz, x0));
    y0 = Math.max(0, Math.min(h-sz, y0));
    const fill = imgImport.paintSlot & 3;
    imgImportPushEditUndo();
    const idx = imgImport.editIndices;
    for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
      const xx=x0+x, yy=y0+y;
      if(xx>=0&&yy>=0&&xx<w&&yy<h) idx[yy*w+xx]=fill;
    }
    imgImportRebuildEditRGB();
    imgImportLivePreview();
  }
  function imgImportAttachPreviewPaint(){
    const oc = document.getElementById('imgImportOutCanvas');
    if(!oc || oc._paintBound2) return;
    oc._paintBound2 = true;
    const pos = (e)=>{
      const r = oc.getBoundingClientRect();
      const z = Math.max(1, imgImport.previewZoom || 4);
      // oc está em resolução de tela (w*z); edições usam pixels lógicos
      const lx = Math.floor((e.clientX - r.left) / r.width * (oc.width / z));
      const ly = Math.floor((e.clientY - r.top) / r.height * (oc.height / z));
      return { x: lx, y: ly };
    };
    oc.addEventListener('mousedown', e=>{
      if(!imgImport.editMode) return;
      e.preventDefault();
      const p = pos(e);
      if(imgImport.editTool === 'pen'){
        imgImport._penDrag = true;
        imgImportPenAt(p.x, p.y);
      } else {
        imgImportFloodAt(p.x, p.y);
      }
    });
    oc.addEventListener('mousemove', e=>{
      if(!imgImport.editMode || !imgImport._penDrag || imgImport.editTool !== 'pen') return;
      if(!(e.buttons & 1)){ imgImport._penDrag = false; return; }
      const p = pos(e);
      // pen drag: um undo por stroke — só push no mousedown
      // paint without extra undo: temporary
      const w = imgImport.editCanvas?.width||0, h = imgImport.editCanvas?.height||0;
      const sz = Math.max(1, imgImport.penSize|0);
      let x0 = p.x - Math.floor((sz-1)/2);
      let y0 = p.y - Math.floor((sz-1)/2);
      x0 = Math.max(0, Math.min(w-sz, x0));
      y0 = Math.max(0, Math.min(h-sz, y0));
      const fill = imgImport.paintSlot & 3;
      const idx = imgImport.editIndices;
      if(!idx) return;
      for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
        const xx=x0+x, yy=y0+y;
        if(xx>=0&&yy>=0&&xx<w&&yy<h) idx[yy*w+xx]=fill;
      }
      imgImportRebuildEditRGB();
      imgImportLivePreview();
    });
    window.addEventListener('mouseup', ()=>{ imgImport._penDrag = false; });
  }
  /** Preview live: usa editCanvas se existir, senão quantiza a seleção. */
  function imgImportLivePreview(){
    const oc = document.getElementById('imgImportOutCanvas');
    const lbl = document.getElementById('imgImportPrevLbl');
    if(!oc) return;
    imgImportAttachPreviewPaint();
    imgImportRenderPaintSlots();
    let canvas = null;
    let w=0,h=0;
    if(imgImport.editCanvas){
      canvas = imgImport.editCanvas;
      w = canvas.width; h = canvas.height;
      // se colorMap ou pal mudou, recolorir a partir de indices
      if(imgImport.editIndices){
        const pal = imgImportPreviewPaletteRgb();
        const ctx = canvas.getContext('2d');
        const id = ctx.createImageData(w,h);
        for(let p=0;p<imgImport.editIndices.length;p++){
          const c = pal[imgImport.editIndices[p]&3];
          const o=p*4;
          id.data[o]=c.r; id.data[o+1]=c.g; id.data[o+2]=c.b; id.data[o+3]=255;
        }
        ctx.putImageData(id,0,0);
      }
    } else {
      const raw = imgImportBuildOutputCanvas();
      if(!raw){
        oc.width=64; oc.height=64;
        const ctx=oc.getContext('2d');
        ctx.fillStyle='#222'; ctx.fillRect(0,0,64,64);
        if(lbl) lbl.textContent = 'sem imagem';
        return;
      }
      const q = imgImportQuantizeCanvas(raw);
      canvas = q.canvas; w=q.width; h=q.height;
    }
    const z = Math.max(1, imgImport.previewZoom || 4);
    // canvas na resolução de tela para grid pontilhado fino entre pixels
    oc.width = w * z;
    oc.height = h * z;
    oc.style.width = (w * z) + 'px';
    oc.style.height = (h * z) + 'px';
    const pctx = oc.getContext('2d');
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(canvas, 0, 0, w, h, 0, 0, w * z, h * z);
    const showPg = imgImport.showPrevGrid !== false
      && (document.getElementById('imgImportPrevGrid')?.checked !== false);
    if(showPg && w > 0 && h > 0 && z >= 2){
      pctx.save();
      // pontilhado bem leve entre cada pixel do desenho
      pctx.strokeStyle = 'rgba(255,255,255,0.14)';
      pctx.lineWidth = 1;
      pctx.setLineDash([1, 2]);
      for(let x = 1; x < w; x++){
        const px = x * z + 0.5;
        pctx.beginPath(); pctx.moveTo(px, 0); pctx.lineTo(px, h * z); pctx.stroke();
      }
      for(let y = 1; y < h; y++){
        const py = y * z + 0.5;
        pctx.beginPath(); pctx.moveTo(0, py); pctx.lineTo(w * z, py); pctx.stroke();
      }
      // tile 8×8 um pouco mais visível (ainda pontilhado)
      pctx.strokeStyle = 'rgba(255,204,0,0.28)';
      pctx.setLineDash([2, 3]);
      for(let x = 8; x < w; x += 8){
        const px = x * z + 0.5;
        pctx.beginPath(); pctx.moveTo(px, 0); pctx.lineTo(px, h * z); pctx.stroke();
      }
      for(let y = 8; y < h; y += 8){
        const py = y * z + 0.5;
        pctx.beginPath(); pctx.moveTo(0, py); pctx.lineTo(w * z, py); pctx.stroke();
      }
      pctx.setLineDash([]);
      pctx.restore();
    }
    const zl = document.getElementById('imgImportPrevZoomLbl');
    if(zl) zl.textContent = `zoom ${z}×`;
    if(lbl) lbl.textContent = `${w}×${h}` + (imgImport.editIndices?' · editável':'');
    imgImportAttachPreviewZoomWheel();
  }
  function imgImportPreviewZoom(dir){
    if(dir === 0){
      // fit: cabe em ~200px (usa resolução lógica se conhecida)
      const logicalW = (imgImport.editCanvas && imgImport.editCanvas.width)
        || (imgImport.gridTW * 8) || 16;
      const logicalH = (imgImport.editCanvas && imgImport.editCanvas.height)
        || (imgImport.gridTH * 8) || 16;
      const fit = Math.max(1, Math.floor(180 / Math.max(logicalW, logicalH)));
      imgImport.previewZoom = Math.min(32, Math.max(1, fit));
    } else if(dir > 0){
      imgImport.previewZoom = Math.min(32, (imgImport.previewZoom||4) + 1);
    } else {
      imgImport.previewZoom = Math.max(1, (imgImport.previewZoom||4) - 1);
    }
    imgImportLivePreview();
  }
  function imgImportAttachPreviewZoomWheel(){
    const box = document.getElementById('imgImportPrevScroll');
    if(!box || box._zoomWheel) return;
    box._zoomWheel = true;
    box.addEventListener('wheel', e=>{
      // zoom com ctrl/meta ou sempre no preview
      e.preventDefault();
      if(e.deltaY < 0) imgImportPreviewZoom(1);
      else imgImportPreviewZoom(-1);
    }, { passive: false });
  }
  function imgImportPreviewOutput(){ imgImportLivePreview(); }

  function imgImportRenderPalettesUI(){
    // legado: lista BG/SPR removida — só atualiza remap / paint
    imgImportRenderColorMapUI();
    imgImportRenderPaintSlots();
  }
  function imgImportToggleEyedrop(){
    if(imgImport.editTool === 'eyedrop') imgImportSetEditTool('pen');
    else imgImportSetEditTool('eyedrop');
  }
  /** Amostra pixel da imagem fonte e grava no slot o índice NES mais próximo. */
  function imgImportEyedropAt(mx, my){
    if(!imgImport.img) return;
    const p = imgImportCanvasToImage(mx, my);
    if(!p) return;
    const sz = imgImportNaturalSize();
    const ix = Math.max(0, Math.min(sz.w - 1, Math.floor(p.x)));
    const iy = Math.max(0, Math.min(sz.h - 1, Math.floor(p.y)));
    // lê 1 px da imagem original
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imgImport.img, ix, iy, 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0,0,1,1).data;
    if(d[3] < 16){
      if(typeof Project!=='undefined' && Project.status) Project.status('Pixel transparente — ignorado');
      return;
    }
    const nes = imgImportNearestNesColor(d[0], d[1], d[2]);
    // paleta ativa do editor de import = paintSlot (0–3)
    const slot = imgImport.paintSlot & 3;
    if(!imgImport.importPal) imgImport.importPal = [15,0,16,48];
    imgImport.importPal[slot] = nes & 63;
    imgImport.importPalSlot = slot;
    // desliga conta-gotas e volta para pen
    imgImport.eyedrop = false;
    imgImport.editTool = 'pen';
    imgImportUpdateEditToolUI();
    if(imgImport.editIndices) imgImportRebuildEditRGB();
    imgImportRenderPaintSlots();
    imgImportRenderColorMapUI();
    const modal = document.getElementById('imgImportPalModal');
    if(modal && modal.style.display === 'flex') imgImportRenderPalModal();
    imgImportLivePreview();
    if(typeof Project!=='undefined' && Project.status){
      Project.status('Slot ativo ' + slot + ' ← $' + nes.toString(16).padStart(2,'0').toUpperCase()
        + ' (RGB ' + d[0] + ',' + d[1] + ',' + d[2] + ')');
    }
  }
  function imgImportNearestNesColor(r, g, b){
    let best = 0, bestD = Infinity;
    const n = (typeof NES_PALETTE !== 'undefined') ? Math.min(64, NES_PALETTE.length) : 0;
    for(let i=0; i<n; i++){
      const hex = NES_PALETTE[i];
      if(!hex) continue;
      const p = imgImportHexToRgb(hex);
      const dr = r - p.r, dg = g - p.g, db = b - p.b;
      const dist = dr*dr + dg*dg + db*db;
      if(dist < bestD){ bestD = dist; best = i; }
    }
    return best;
  }
  function imgImportSetAutoPal(on){
    imgImport.autoPal = !!on;
    const chk = document.getElementById('imgImportAutoPal');
    if(chk) chk.checked = imgImport.autoPal;
    if(imgImport.autoPal) imgImportAutoFillPalette();
  }
  function imgImportMaybeAutoPal(){
    if(!imgImport.autoPal) return;
    imgImportAutoFillPalette();
  }
  /**
   * Varre células do grid (esq→dir, cima→baixo), pega cores na ordem de aparição
   * e preenche até 4 slots com o índice NES mais próximo de cada cor única.
   */
  function imgImportAutoFillPalette(){
    if(!imgImport.img) return;
    const rect = imgImportSourceRect();
    if(!rect || rect.w < 1 || rect.h < 1) return;
    const tw = Math.max(1, imgImport.gridTW || 1);
    const th = Math.max(1, imgImport.gridTH || 1);
    const cellW = Math.max(1, Math.round(rect.w / tw));
    const cellH = Math.max(1, Math.round(rect.h / th));
    // buffer da área (pode extrapolar a imagem — clip implícito)
    const sw = Math.max(1, Math.round(rect.w));
    const sh = Math.max(1, Math.round(rect.h));
    const src = document.createElement('canvas');
    src.width = sw; src.height = sh;
    const sctx = src.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = '#000';
    sctx.fillRect(0,0,sw,sh);
    sctx.drawImage(imgImport.img, rect.x, rect.y, rect.w, rect.h, 0, 0, sw, sh);
    const id = sctx.getImageData(0,0,sw,sh);
    const data = id.data;
    const unique = []; // {r,g,b}
    const thresh = 28; // tolerância RGB para "mesma cor"
    const isNear = (a,b)=>{
      const dr=a.r-b.r, dg=a.g-b.g, db=a.b-b.b;
      return (dr*dr+dg*dg+db*db) <= thresh*thresh;
    };
    const consider = (r,g,b,a)=>{
      if(a < 128) return;
      const c = {r,g,b};
      for(let i=0;i<unique.length;i++){
        if(isNear(unique[i], c)) return;
      }
      unique.push(c);
    };
    // 1º passo: só o pixel do CENTRO de cada célula (evita borda mal alinhada)
    // ordem das células: esq→dir, cima→baixo
    for(let ty=0; ty<th && unique.length<4; ty++){
      for(let tx=0; tx<tw && unique.length<4; tx++){
        const x0 = tx * cellW, y0 = ty * cellH;
        const x1 = Math.min(sw, x0 + cellW);
        const y1 = Math.min(sh, y0 + cellH);
        if(x1 <= x0 || y1 <= y0) continue;
        // centro = origem + metade da célula (floor)
        const cx = Math.min(x1 - 1, x0 + Math.floor((x1 - x0) / 2));
        const cy = Math.min(y1 - 1, y0 + Math.floor((y1 - y0) / 2));
        const i = (cy * sw + cx) * 4;
        consider(data[i], data[i+1], data[i+2], data[i+3]);
      }
    }
    // 2º passo (se < 4): pequena cruz em torno do centro (±1 px), ainda longe da borda
    if(unique.length < 4){
      for(let ty=0; ty<th && unique.length<4; ty++){
        for(let tx=0; tx<tw && unique.length<4; tx++){
          const x0 = tx * cellW, y0 = ty * cellH;
          const x1 = Math.min(sw, x0 + cellW);
          const y1 = Math.min(sh, y0 + cellH);
          if(x1 <= x0 || y1 <= y0) continue;
          const cx = Math.min(x1 - 1, x0 + Math.floor((x1 - x0) / 2));
          const cy = Math.min(y1 - 1, y0 + Math.floor((y1 - y0) / 2));
          const pts = [
            [cx, cy],
            [cx-1, cy], [cx+1, cy], [cx, cy-1], [cx, cy+1]
          ];
          for(const [x,y] of pts){
            if(x < x0 || y < y0 || x >= x1 || y >= y1) continue;
            const i = (y * sw + x) * 4;
            consider(data[i], data[i+1], data[i+2], data[i+3]);
            if(unique.length >= 4) break;
          }
        }
      }
    }
    // 3º passo (último recurso): varre o miolo da célula (ignora 1px de borda se célula >= 3)
    if(unique.length < 4){
      for(let ty=0; ty<th && unique.length<4; ty++){
        for(let tx=0; tx<tw && unique.length<4; tx++){
          const x0 = tx * cellW, y0 = ty * cellH;
          const x1 = Math.min(sw, x0 + cellW);
          const y1 = Math.min(sh, y0 + cellH);
          const pad = (x1-x0 >= 3 && y1-y0 >= 3) ? 1 : 0;
          for(let y=y0+pad; y<y1-pad && unique.length<4; y++){
            for(let x=x0+pad; x<x1-pad && unique.length<4; x++){
              const i = (y*sw + x) * 4;
              consider(data[i], data[i+1], data[i+2], data[i+3]);
            }
          }
        }
      }
    }
    if(!unique.length) return;
    const defaults = [15, 0, 16, 48];
    const next = [defaults[0], defaults[1], defaults[2], defaults[3]];
    for(let i=0; i<4; i++){
      if(i < unique.length){
        next[i] = imgImportNearestNesColor(unique[i].r, unique[i].g, unique[i].b) & 63;
      } else {
        next[i] = next[Math.max(0, unique.length-1)];
      }
    }
    imgImport.importPal = next;
    imgImport.colorMap = [0,1,2,3];
    imgImport.editCanvas = null;
    imgImport.editIndices = null;
    imgImportRenderPaintSlots();
    imgImportRenderColorMapUI();
    const modal = document.getElementById('imgImportPalModal');
    if(modal && modal.style.display === 'flex') imgImportRenderPalModal();
    if(typeof Project!=='undefined' && Project.status){
      Project.status('Auto paleta: ' + unique.length + ' cor(es) → slots NES '
        + next.map(n=>'$'+n.toString(16).padStart(2,'0').toUpperCase()).join(', '));
    }
  }

  function imgImportOpenPalModal(){
    const m = document.getElementById('imgImportPalModal');
    if(!m) return;
    m.style.display = 'flex';
    // não força slot 0 se já veio do conta-gotas
    if(imgImport.importPalSlot == null) imgImport.importPalSlot = 0;
    imgImportRenderPalModal();
  }
  function imgImportClosePalModal(){
    const m = document.getElementById('imgImportPalModal');
    if(m) m.style.display = 'none';
    // reaplica cores no preview / quantize visual
    if(imgImport.editIndices) imgImportRebuildEditRGB();
    imgImportRenderPaintSlots();
    imgImportRenderColorMapUI();
    imgImportLivePreview();
  }
  function imgImportResetImportPal(){
    imgImport.importPal = [15, 0, 16, 48];
    imgImportRenderPalModal();
  }
  function imgImportRenderPalModal(){
    const slotsEl = document.getElementById('imgImportPalModalSlots');
    const gridEl = document.getElementById('imgImportPalModalGrid');
    if(!slotsEl || !gridEl) return;
    if(!imgImport.importPal || imgImport.importPal.length < 4){
      imgImport.importPal = [15, 0, 16, 48];
    }
    slotsEl.innerHTML = '';
    for(let i=0;i<4;i++){
      const nes = imgImport.importPal[i]&63;
      const hex = (typeof NES_PALETTE!=='undefined' && NES_PALETTE[nes]) ? NES_PALETTE[nes] : '#000';
      const b = document.createElement('button');
      b.type = 'button';
      const on = (imgImport.importPalSlot === i);
      b.style.cssText = `flex:1;height:40px;border:${on?'3px solid #ffcc00':'1px solid #555'};border-radius:4px;background:${hex};cursor:pointer;font-weight:bold;font-size:12px;color:${_imgImportContrastText(hex)}`;
      b.textContent = String(i);
      b.title = `Slot ${i} · $${nes.toString(16).padStart(2,'0').toUpperCase()}`;
      b.onclick = ()=>{
        imgImport.importPalSlot = i;
        const slotEl = document.getElementById('imgImportEyedropSlot');
        if(slotEl) slotEl.textContent = String(i);
        imgImportRenderPalModal();
      };
      slotsEl.appendChild(b);
    }
    gridEl.innerHTML = '';
    for(let n=0; n<64; n++){
      const hex = (typeof NES_PALETTE!=='undefined' && NES_PALETTE[n]) ? NES_PALETTE[n] : '#000';
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.title = '$' + n.toString(16).padStart(2,'0').toUpperCase();
      const used = imgImport.importPal.indexOf(n);
      cell.style.cssText = `aspect-ratio:1;border:${used>=0?'2px solid #ffcc00':'1px solid #333'};border-radius:2px;background:${hex};cursor:pointer;padding:0;min-height:18px`;
      cell.onclick = ()=>{
        const s = imgImport.importPalSlot & 3;
        imgImport.importPal[s] = n & 63;
        imgImportRenderPalModal();
      };
      gridEl.appendChild(cell);
    }
  }
  function _imgImportContrastText(hex){
    const rgb = imgImportHexToRgb(hex);
    return (rgb.r+rgb.g+rgb.b) > 400 ? '#000' : '#fff';
  }
  function imgImportRenderColorMapUI(){
    const cont = document.getElementById('imgImportColorMap');
    if(!cont) return;
    cont.innerHTML = '';
    const map = imgImport.colorMap || [0,1,2,3];
    const pal = imgImportPreviewPaletteRgb();
    // 4 slots: cada um é um select 0–3 (para onde o índice quantizado vai)
    for(let src=0; src<4; src++){
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px';
      const sw = document.createElement('div');
      const dest = map[src]&3;
      const rgb = pal[dest];
      sw.style.cssText = `width:28px;height:20px;background:rgb(${rgb.r},${rgb.g},${rgb.b});border:1px solid #666;border-radius:2px`;
      const sel = document.createElement('select');
      sel.style.cssText = 'background:#000;color:#fff;border:1px solid #444;font-size:10px;width:40px';
      for(let d=0;d<4;d++){
        const o=document.createElement('option');
        o.value=d; o.textContent=`${src}→${d}`;
        if(d===dest) o.selected = true;
        sel.appendChild(o);
      }
      const srcCap = src;
      sel.onchange = ()=>{
        imgImport.colorMap[srcCap] = parseInt(sel.value,10)&3;
        imgImportRenderColorMapUI();
        imgImportLivePreview();
      };
      // clique no sw troca com o próximo (atalho)
      sw.onclick = ()=>{
        const a = imgImport.colorMap[srcCap]&3;
        const b = imgImport.colorMap[(srcCap+1)%4]&3;
        imgImport.colorMap[srcCap] = b;
        imgImport.colorMap[(srcCap+1)%4] = a;
        imgImportRenderColorMapUI();
        imgImportLivePreview();
      };
      wrap.appendChild(sw);
      wrap.appendChild(sel);
      cont.appendChild(wrap);
    }
    const reset = document.createElement('button');
    reset.className = 'btn-tool';
    reset.textContent = 'Reset map';
    reset.style.cssText = 'font-size:9px;margin-left:4px';
    reset.onclick = ()=>{ imgImport.colorMap=[0,1,2,3]; imgImportRenderColorMapUI(); imgImportLivePreview(); };
    cont.appendChild(reset);
  }

  function imgImportConfirmStep1(){
    // opcional: manda importPal ao banco antes de enfileirar
    try{
      const addBank = document.getElementById('imgImportAddToBank')?.checked !== false;
      if(addBank && imgImport.importPal){
        const nm = prompt('Nome da paleta no banco:', 'Import ' + (paletteBank.length+1));
        if(nm !== null){
          addPaletteToBank(imgImport.importPal, nm.trim() || ('Import ' + (paletteBank.length+1)));
        }
      }
    }catch(e){}
    let q;
    if(imgImport.editIndices && imgImport.editCanvas){
      q = {
        indices: imgImport.editIndices,
        width: imgImport.editCanvas.width,
        height: imgImport.editCanvas.height,
        canvas: imgImport.editCanvas
      };
    } else {
      const raw = imgImportBuildOutputCanvas();
      if(!raw){ alert('Carregue uma imagem e defina a seleção'); return; }
      q = imgImportQuantizeCanvas(raw);
    }
    const tw = imgImport.gridTW, th = imgImport.gridTH;
    const n = tw * th;
    if(n > TILE_QUEUE_MAX){
      alert(`A grade ${tw}×${th} gera ${n} tiles (máx. ${TILE_QUEUE_MAX}).`);
      return;
    }
    const batchId = 'imp_' + Date.now();
    const startLen = tileQueue.length;
    if(startLen + n > TILE_QUEUE_MAX){
      tileQueue.splice(0, startLen + n - TILE_QUEUE_MAX);
    }
    for(let ty=0; ty<th; ty++){
      for(let tx=0; tx<tw; tx++){
        const layoutIndex = ty * tw + tx;
        const data = imgImportEncodeTile(q.indices, q.width, tx*8, ty*8);
        tileQueue.push({
          data, sourceIdx: -1, bank: currentBank, local: layoutIndex,
          layoutIndex, importBatch: batchId, label: `${tx},${ty}`
        });
      }
    }
    tileQueueActive = Math.max(0, tileQueue.length - n);
    sheetClipboardTile = tileQueue[tileQueueActive]?.data || null;
    imgImport.pendingMeta = {
      batchId, w: tw, h: th,
      slots: new Array(n).fill(null), remaining: n,
      name: `Import ${tw}x${th}`
    };
    // opcional: aplicar previewPal como activePal? NÃO — user pediu não mexer na paleta do projeto
    updateTileQueueLabel();
    renderTileQueue();
    closeImageImport();
    setToolImpl('sheetpaste');
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Import: ${n} tiles na fila (${tw}×${th}).`);
    alert(`✓ ${n} tiles na fila.\nCole com “Colar Tile”.`);
  }

  function imgImportNotePaste(layoutIndex, absIdx){
    const pm = imgImport.pendingMeta;
    if(!pm || layoutIndex == null) return;
    if(pm.slots[layoutIndex] != null) return;
    pm.slots[layoutIndex] = absIdx;
    pm.remaining--;
    if(pm.remaining > 0){
      if(typeof Project !== 'undefined' && Project.status)
        Project.status(`Import metatile: ${pm.w*pm.h - pm.remaining}/${pm.w*pm.h} colados`);
      return;
    }
    const tiles = pm.slots.map(x => x|0);
    const flips = (pm.flips && pm.flips.length === tiles.length) ? [...pm.flips] : tiles.map(() => 0);
    const id = 'mt_' + Date.now();
    const mt = {
      id, name: pm.name, w: pm.w, h: pm.h, tiles, flips,
      bank: currentBank, palette: activePal, created: Date.now()
    };
    metatiles.push(mt);
    imgImport.pendingMeta = null;
    updateMetatileSelect();
    gridW = mt.w; gridH = mt.h;
    selectedTiles = [...mt.tiles];
    selectedFlips = [...mt.flips];
    activeSlotIdx = 0;
    if(zoomCanvas){ zoomCanvas.width = gridW*8*16; zoomCanvas.height = gridH*8*16; }
    const sel = document.getElementById('metatileSelect');
    if(sel) sel.value = id;
    renderAll();
    updateLabels();
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Metatile "${mt.name}" criado`);
    alert(`Metatile "${mt.name}" criado (${mt.w}×${mt.h}).`);
  }

  // ========== IMPORT .NMS (tiles + metatiles → fila) ==========
  function openNmsImport(){
    const modal = document.getElementById('nmsImportModal');
    if(!modal) return;
    modal.style.display = 'flex';
    const input = document.getElementById('importNms_internal');
    if(input && !input._bound){
      input._bound = true;
      input.onchange = handleNmsImportFile;
    }
    nmsImportAttachSheet();
    nmsImportRedraw();
  }
  function closeNmsImport(){
    const modal = document.getElementById('nmsImportModal');
    if(modal) modal.style.display = 'none';
  }
  function handleNmsImportFile(e){
    const file = e.target.files && e.target.files[0];
    if(!file) return;
    const nameLower = (file.name || '').toLowerCase();
    const isChr = nameLower.endsWith('.chr') || nameLower.endsWith('.bin');
    const reader = new FileReader();
    if(isChr){
      reader.onload = (ev)=>{
        try{
          const buf = new Uint8Array(ev.target.result);
          if(buf.length < 16){ alert('Arquivo .chr muito pequeno'); return; }
          const u8 = new Uint8Array(Math.max(8192, buf.length));
          u8.set(buf.slice(0, Math.min(buf.length, u8.length)));
          // se veio só 4KB, espelha em PT1 para ter 2 páginas
          if(buf.length >= 4096 && buf.length < 8192){
            u8.set(buf.slice(0, 4096), 4096);
          }
          nmsImport.chr = u8;
          nmsImport.metatiles = [];
          nmsImport.name = file.name;
          nmsImport.bank = 0;
          nmsImport.picked = [];
          nmsImport.pendingMeta = null;
          const info = document.getElementById('nmsImportFileInfo');
          if(info) info.innerHTML = `<b style="color:#fff">${file.name}</b> · ${(buf.length/1024).toFixed(1)} KB CHR · sem metatiles`;
          const bankSel = document.getElementById('nmsImportBank');
          if(bankSel) bankSel.value = '0';
          nmsImportRenderMtList();
          nmsImportRedraw();
          nmsImportRenderPicked();
        }catch(err){
          alert('Erro ao ler .chr: ' + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev)=>{
        try{
          const json = JSON.parse(ev.target.result);
          // Aceita .nms e .tile (format:"tile") — ambos trazem chr + metatiles
          const isTile = json && (json.format === 'tile' || nameLower.endsWith('.tile'));
          if(!json.chr){ alert('Arquivo inválido (sem CHR). Use .nms ou .tile.'); return; }
          const arr = Array.isArray(json.chr) ? json.chr : [];
          const u8 = new Uint8Array(Math.max(8192, arr.length));
          u8.set(arr.slice(0, u8.length));
          nmsImport.chr = u8;
          nmsImport.metatiles = Array.isArray(json.metatiles) ? json.metatiles : [];
          nmsImport.name = json.name || file.name;
          nmsImport.bank = 0;
          nmsImport.picked = [];
          nmsImport.pendingMeta = null;
          // Personagens/animações do .tile ficam disponíveis para merge opcional
          nmsImport.characters = (isTile && Array.isArray(json.characters)) ? json.characters : null;
          const info = document.getElementById('nmsImportFileInfo');
          if(info){
            const charInfo = nmsImport.characters ? ` · ${nmsImport.characters.length} personagem(ns)` : '';
            info.innerHTML = `<b style="color:#fff">${nmsImport.name}</b> · ${nmsImport.metatiles.length} metatile(s)${charInfo}${isTile?' · .tile':''}`;
          }
          const bankSel = document.getElementById('nmsImportBank');
          if(bankSel) bankSel.value = '0';
          nmsImportRenderMtList();
          nmsImportRedraw();
          nmsImportRenderPicked();
        }catch(err){
          alert('Erro ao ler arquivo: ' + err.message);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }
  function nmsImportSetBank(){
    const v = parseInt(document.getElementById('nmsImportBank')?.value, 10) || 0;
    nmsImport.bank = v;
    nmsImportRedraw();
  }
  function nmsImportDrawTile(ctx, chr, absIdx, dx, dy, scale){
    const off = absIdx * 16;
    if(!chr || off + 16 > chr.length) return;
    const pal = palettes[activePal] || palettes[0];
    for(let y=0;y<8;y++){
      const p0 = chr[off+y], p1 = chr[off+y+8];
      for(let x=0;x<8;x++){
        const sh = 7-x, ci = (((p1>>sh)&1)<<1) | ((p0>>sh)&1);
        ctx.fillStyle = (typeof NES_PALETTE !== 'undefined' ? NES_PALETTE[pal[ci]&63] : '#000');
        ctx.fillRect(dx + x*scale, dy + y*scale, scale, scale);
      }
    }
  }
  function nmsImportRedraw(){
    const canvas = document.getElementById('nmsImportSheet');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,512,512);
    if(!nmsImport.chr){
      ctx.fillStyle = '#555';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Abra um arquivo .nms…', 256, 256);
      return;
    }
    const base = nmsImport.bank * 256;
    for(let ty=0;ty<16;ty++){
      for(let tx=0;tx<16;tx++){
        const abs = base + ty*16 + tx;
        nmsImportDrawTile(ctx, nmsImport.chr, abs, tx*32, ty*32, 4);
      }
    }
    // highlight picked
    const pickedSet = new Set(nmsImport.picked.map(p => p.absIdx));
    ctx.lineWidth = 2;
    for(let ty=0;ty<16;ty++){
      for(let tx=0;tx<16;tx++){
        const abs = base + ty*16 + tx;
        if(!pickedSet.has(abs)) continue;
        ctx.strokeStyle = '#ffcc00';
        ctx.strokeRect(tx*32+1, ty*32+1, 30, 30);
      }
    }
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for(let i=0;i<=16;i++){
      ctx.beginPath(); ctx.moveTo(i*32+0.5,0); ctx.lineTo(i*32+0.5,512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,i*32+0.5); ctx.lineTo(512,i*32+0.5); ctx.stroke();
    }
  }
  function nmsImportAttachSheet(){
    const canvas = document.getElementById('nmsImportSheet');
    if(!canvas || canvas._nmsBound) return;
    canvas._nmsBound = true;
    canvas.addEventListener('click', e=>{
      if(!nmsImport.chr) return;
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * 16);
      const y = Math.floor((e.clientY - r.top) / r.height * 16);
      if(x<0||x>15||y<0||y>15) return;
      const absIdx = nmsImport.bank * 256 + y*16 + x;
      nmsImportToggleTile(absIdx);
    });
  }
  function nmsImportReadTileData(absIdx){
    const off = absIdx * 16;
    if(!nmsImport.chr || off+16 > nmsImport.chr.length) return null;
    return Array.from(nmsImport.chr.slice(off, off+16));
  }
  function nmsImportToggleTile(absIdx){
    // seleção manual de tile solto invalida pendingMeta de metatile
    nmsImport.pendingMeta = null;
    const i = nmsImport.picked.findIndex(p => p.absIdx === absIdx);
    if(i >= 0) nmsImport.picked.splice(i, 1);
    else {
      const data = nmsImportReadTileData(absIdx);
      if(!data) return;
      nmsImport.picked.push({ absIdx, data });
    }
    nmsImportRedraw();
    nmsImportRenderPicked();
  }
  function nmsImportClearPicked(){
    nmsImport.picked = [];
    nmsImport.pendingMeta = null;
    nmsImportRedraw();
    nmsImportRenderPicked();
  }
  function nmsImportRenderPicked(){
    const cont = document.getElementById('nmsImportPickPreview');
    const cnt = document.getElementById('nmsImportPickCount');
    if(cnt) cnt.textContent = `(${nmsImport.picked.length})`;
    if(!cont) return;
    cont.innerHTML = '';
    nmsImport.picked.forEach((p, idx)=>{
      const c = document.createElement('canvas');
      c.width = 16; c.height = 16;
      c.style.cssText = 'width:24px;height:24px;image-rendering:pixelated;border:1px solid #555;background:#000';
      // draw from data
      const ctx = c.getContext('2d');
      const pal = palettes[activePal] || palettes[0];
      for(let y=0;y<8;y++){
        const p0 = p.data[y]||0, p1 = p.data[y+8]||0;
        for(let x=0;x<8;x++){
          const sh=7-x, ci=(((p1>>sh)&1)<<1)|((p0>>sh)&1);
          ctx.fillStyle = NES_PALETTE[pal[ci]&63] || '#000';
          ctx.fillRect(x*2,y*2,2,2);
        }
      }
      c.title = `#${idx+1} $${(p.absIdx%256).toString(16)}`;
      cont.appendChild(c);
    });
  }
  function nmsImportRenderMtList(){
    const cont = document.getElementById('nmsImportMtList');
    if(!cont) return;
    cont.innerHTML = '';
    if(!nmsImport.metatiles.length){
      cont.innerHTML = '<div style="font-size:10px;color:#555">Nenhum metatile neste arquivo</div>';
      return;
    }
    nmsImport.metatiles.forEach(mt=>{
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:6px;background:#1a1a1a;border:1px solid #333;border-radius:4px;cursor:pointer';
      row.onclick = ()=> nmsImportSelectMetatile(mt);
      const cv = document.createElement('canvas');
      const tw = Math.min(4, mt.w||1), th = Math.min(4, mt.h||1);
      cv.width = tw*8; cv.height = th*8;
      cv.style.cssText = `width:${tw*16}px;height:${th*16}px;image-rendering:pixelated;border:1px solid #333;background:#000;flex-shrink:0`;
      const ctx = cv.getContext('2d');
      const tiles = mt.tiles || [];
      const flips = mt.flips || [];
      for(let gy=0;gy<th;gy++) for(let gx=0;gx<tw;gx++){
        const ti = tiles[gy*(mt.w||1)+gx];
        if(ti == null) continue;
        nmsImportDrawTile(ctx, nmsImport.chr, ti, gx*8, gy*8, 1);
      }
      const lab = document.createElement('div');
      lab.style.cssText = 'font-size:11px;color:#ddd;overflow:hidden';
      lab.innerHTML = `<b style="color:#c39bd3">${mt.name||'?'}</b><br><span style="color:#666;font-size:10px">${mt.w}×${mt.h} · ${(mt.tiles||[]).length} tiles</span>`;
      row.appendChild(cv); row.appendChild(lab);
      cont.appendChild(row);
    });
  }
  function nmsImportSelectMetatile(mt){
    if(!mt || !nmsImport.chr) return;
    const tiles = mt.tiles || [];
    nmsImport.picked = [];
    tiles.forEach((absIdx, layoutIndex)=>{
      const data = nmsImportReadTileData(absIdx);
      if(!data) return;
      nmsImport.picked.push({ absIdx, data, layoutIndex });
    });
    nmsImport.pendingMeta = {
      w: mt.w || 1,
      h: mt.h || 1,
      name: mt.name || 'Import MT',
      flips: (mt.flips && mt.flips.length === tiles.length) ? [...mt.flips] : tiles.map(()=>0)
    };
    // troca banco se tiles estão em outra página
    if(tiles.length){
      const b = Math.floor((tiles[0]|0) / 256);
      nmsImport.bank = b;
      const bankSel = document.getElementById('nmsImportBank');
      if(bankSel) bankSel.value = String(b);
    }
    nmsImportRedraw();
    nmsImportRenderPicked();
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Metatile "${mt.name}" selecionado (${tiles.length} tiles)`);
  }
  function nmsImportConfirm(){
    if(!nmsImport.picked.length){
      alert('Selecione tiles no grid ou um metatile na lista.');
      return;
    }
    const n = nmsImport.picked.length;
    if(n > TILE_QUEUE_MAX){
      alert(`Seleção tem ${n} tiles (máx. ${TILE_QUEUE_MAX}).`);
      return;
    }
    const batchId = 'nms_' + Date.now();
    const startLen = tileQueue.length;
    if(startLen + n > TILE_QUEUE_MAX){
      tileQueue.splice(0, startLen + n - TILE_QUEUE_MAX);
    }
    const fromMeta = !!nmsImport.pendingMeta;
    nmsImport.picked.forEach((p, i)=>{
      const layoutIndex = (p.layoutIndex != null) ? p.layoutIndex : i;
      tileQueue.push({
        data: p.data,
        sourceIdx: p.absIdx,
        bank: Math.floor(p.absIdx/256),
        local: p.absIdx % 256,
        layoutIndex: fromMeta ? layoutIndex : null,
        importBatch: fromMeta ? batchId : null,
        label: fromMeta ? `${layoutIndex}` : `$${ (p.absIdx%256).toString(16) }`
      });
    });
    if(fromMeta && nmsImport.pendingMeta){
      const pm = nmsImport.pendingMeta;
      imgImport.pendingMeta = {
        batchId,
        w: pm.w,
        h: pm.h,
        slots: new Array(pm.w * pm.h).fill(null),
        remaining: Math.min(n, pm.w * pm.h),
        name: pm.name,
        flips: pm.flips || null
      };
    }
    tileQueueActive = Math.max(0, tileQueue.length - n);
    sheetClipboardTile = tileQueue[tileQueueActive]?.data || null;
    updateTileQueueLabel();
    renderTileQueue();
    closeNmsImport();
    setToolImpl('sheetpaste');
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`${n} tiles do .nms na fila` + (fromMeta ? ' (metatile será remontado ao colar todos)' : ''));
    alert(`✓ ${n} tiles na fila.\nUse “Colar Tile” na folha CHR.` + (fromMeta ? '\nAo colar todos, o metatile será recriado neste projeto.' : ''));
  }


  return {
    init(){
      buildHTML();
      // Se a URL já pede um projeto do dashboard, não agenda o default CHR —
      // o .nms trará o buffer correto. Evita corrida com assets/novo.chr.
      try {
        const pid = new URLSearchParams(window.location.search).get('project');
        if(pid) suppressDefaultChr = true;
      } catch(e) {}
      setTimeout(()=>tryLoadDefaultCHR(), 100);
    },
    /** Impede (ou reativa) a injeção automática de assets/novo.chr. */
    setSuppressDefaultChr(v){ suppressDefaultChr = !!v; },
    /** Carrega assets/novo.chr. force=true ignora suppress (usado em Novo projeto). */
    async loadDefaultCHR(force){ return tryLoadDefaultCHR(!!force); },
    loadBuffer(buf, pals, bankData){
      // Qualquer carga via Project (.nms) passa por aqui — não sobrescrever depois.
      suppressDefaultChr = true;
      let newBuf = buf.length>=8192?buf:(()=>{let n=new Uint8Array(8192); n.set(buf); return n;})();
      const hasData = newBuf.some(b=>b!==0);
      if(!hasData){
        console.log('Buffer vazio recebido do projeto; mantendo buffer atual (sem injetar novo.chr)');
        // Não chama tryLoadDefaultCHR — o CHR vazio do .nms é intencional ou
        // ainda será preenchido; injetar assets/novo.chr apagaria o resto do projeto.
      } else {
        chrBuffer = newBuf;
      }
      if(pals) palettes=pals.map(p=>[...p]);
      if(bankData && Array.isArray(bankData.paletteBank) && bankData.paletteBank.length){
        paletteBank = bankData.paletteBank.map(e=>({
          id: e.id || genPalBankId(),
          name: e.name || 'Pal',
          colors: (e.colors||[15,0,16,48]).map(c=>c&63).slice(0,4)
        }));
        paletteActive = Array.isArray(bankData.paletteActive) && bankData.paletteActive.length>=8
          ? bankData.paletteActive.slice(0,8)
          : paletteBank.slice(0,8).map(e=>e.id);
        while(paletteActive.length<8) paletteActive.push(paletteBank[0].id);
        syncPpuFromActive();
      } else {
        defaultPaletteBankFromPalettes();
      }
      if(!document.getElementById('sheetCanvas')) buildHTML();
      else { updateBankSelect(); ensurePaletteMatchesBank(); initPalUI(); updateMetatileSelect(); renderPaletteBankUI(); renderAll(); }
    },
    getBuffer(){ return chrBuffer; },
    getPalettes(){ return palettes; },
    getPaletteBank(){ ensurePaletteBank(); return paletteBank.map(e=>({id:e.id,name:e.name,colors:[...e.colors]})); },
    getPaletteActive(){ ensurePaletteBank(); return [...paletteActive]; },
    getMetatiles(){ return [...metatiles]; }, loadMetatiles(arr){ metatiles = Array.isArray(arr)?[...arr]:[]; updateMetatileSelect(); renderAll(); },
    renderAll(){ renderSheet(); renderZoom(); renderQuickTileSelector(); renderMetatilePreview(); renderTileQueue(); }, setGrid(w,h){ gridW=w; gridH=h; const first=selectedTiles[0]||currentBank*256; selectedTiles=[]; selectedFlips=[]; for(let i=0;i<w*h;i++){ selectedTiles.push(first+i); selectedFlips.push(0); } activeSlotIdx=0; if(zoomCanvas){ zoomCanvas.width=w*8*16; zoomCanvas.height=h*8*16; } renderAll(); updateLabels(); },
    clearTileQueue, selectTileQueueItem, removeTileQueueItem,
    addBank(){ const nb=new Uint8Array(chrBuffer.length+8192); nb.set(chrBuffer); chrBuffer=nb; updateBankSelect(); renderAll(); },
    applyGridResize,
    autoFill(){ const s=selectedTiles[0]||currentBank*256; for(let i=0;i<selectedTiles.length;i++) selectedTiles[i]=s+i; ensureFlipsLen(); activeSlotIdx=0; renderAll(); updateLabels(); },
    clearSelection(){ gridW=1; gridH=1; selectedTiles=[selectedTiles[0]||currentBank*256]; selectedFlips=[selectedFlips[0]|0]; activeSlotIdx=0; renderAll(); updateLabels(); },
    flipH(){ flipGroupH(); },
    flipV(){ flipGroupV(); },
    rotate(){ rotateGroupCW(); },
    shift(dir){ const M=getMatrix(), h=M.length, w=M[0].length, n=Array.from({length:h},()=>Array(w).fill(0)); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ let ny=y,nx=x; if(dir==='left') nx=(x+1)%w; if(dir==='right') nx=(x+w-1)%w; if(dir==='up') ny=(y+1)%h; if(dir==='down') ny=(y+h-1)%h; n[y][x]=M[ny][nx]; } pushUndo(); setMatrix(n); },
    clearGroup(){
      if(!confirm('Limpar o grupo de tiles selecionado?\nEsta ação pode ser desfeita com Undo.')) return;
      pushUndo();
      selectedTiles.forEach(ti=>chrBuffer.fill(0,ti*16,ti*16+16));
      renderAll();
    },
    undo(){ if(undoStack.length){ chrBuffer=undoStack.pop(); renderAll(); } },
    importCHR(){ document.getElementById('importCHR_internal')?.click(); },
    setActivePal(i){
      activePal = Math.max(0, Math.min(7, parseInt(i,10)||0));
      try{ initPalUI(); renderAll(); }catch(e){}
    },
    getActivePal(){ return activePal; },
    setActiveSlot(s){
      activeSlot = Math.max(0, Math.min(3, parseInt(s,10)||0));
      try{ initPalUI(); }catch(e){}
    },
    getActiveSlot(){ return activeSlot; },
    setPaletteColor(palIdx, slotIdx, colorIdx){
      const p = Math.max(0, Math.min(7, parseInt(palIdx,10)||0));
      const s = Math.max(0, Math.min(3, parseInt(slotIdx,10)||0));
      const c = Math.max(0, Math.min(63, parseInt(colorIdx,10)||0));
      if(!Array.isArray(palettes[p])) palettes[p] = [15,0,16,48];
      palettes[p][s] = c;
      activePal = p;
      activeSlot = s;
      try{ syncActiveBankEntryFromPpu(); }catch(e){}
      try{ initPalUI(); renderAll(); renderPaletteBankUI(); }catch(e){}
      try{
        if(typeof Project !== 'undefined' && Project.data){
          Project.data.palettes = palettes.map(x=>[...x]);
        }
      }catch(e){}
    },
    refreshPaletteUI(){
      try{ ensurePaletteBank(); }catch(e){}
      try{ initPalUI(); }catch(e){}
      try{ renderPaletteBankUI(); }catch(e){}
      try{ if(typeof renderPaletteCompact==='function') renderPaletteCompact(); }catch(e){}
    },
    paletteBankAdd(){
      const n = prompt('Nome da nova paleta:', 'Pal ' + (paletteBank.length+1));
      if(n===null) return;
      const src = palettes[activePal] || [15,0,16,48];
      addPaletteToBank(src, n.trim()||'Pal');
      try{ if(typeof BG !== 'undefined' && BG.onPalettesChanged) BG.onPalettesChanged(); }catch(e){}
    },
    paletteBankApply(){
      applyBankEntryToActiveSlot(_palBankSel);
      try{ if(typeof BG !== 'undefined' && BG.onPalettesChanged) BG.onPalettesChanged(); }catch(e){}
    },
    paletteBankRename(){ renameBankEntry(_palBankSel); },
    paletteBankDelete(){
      deleteBankEntry(_palBankSel);
      try{ if(typeof BG !== 'undefined' && BG.onPalettesChanged) BG.onPalettesChanged(); }catch(e){}
    },
    togglePalettePanel(){
      const panel = document.getElementById('chrPalettePanel');
      const btn = document.getElementById('chrPaletteToggle');
      if(!panel) return;
      panel.classList.toggle('collapsed');
      const open = !panel.classList.contains('collapsed');
      if(btn){
        btn.textContent = open ? '▾' : '▸';
        btn.title = open ? 'Recolher paletas' : 'Expandir paletas';
      }
      if(open){
        if(typeof initPalUI === 'function') initPalUI();
        if(typeof renderPaletteBankUI === 'function') renderPaletteBankUI();
      } else if(typeof renderPaletteCompact === 'function'){
        renderPaletteCompact();
      }
    },
    saveMetatile, loadSelectedMetatile, deleteMetatile, renameMetatile, updateMetatileSelect, onMetatileSelectChange, newTile,
    setTool(t){ setToolImpl(t); },
    toggleSlotFlipH, toggleSlotFlipV,
    setEditLayer, setOverlayEnabled, setOverlayPal, setOverlayOffset, removeOverlay,

    openImageImport, closeImageImport,
    imgImportSetGrid, imgImportSetCellSize, imgImportSetPrevGrid, imgImportSetAutoPal, imgImportOpenPalModal, imgImportClosePalModal, imgImportResetImportPal, imgImportToggleEyedrop, imgImportRedraw, imgImportZoom, imgImportSetBW, imgImportSetContrast, imgImportSetSample,
    imgImportSetCropFromInputs, imgImportApplyCrop, imgImportClearSelection, imgImportSelectAll,
    imgImportPreviewOutput, imgImportLivePreview, imgImportConfirmStep1,
    imgImportPosterize, imgImportSetEditMode, imgImportClearEdit, imgImportSetPaintSlot,
    imgImportSetEditTool, imgImportEditUndo, imgImportSetPenSize, imgImportPreviewZoom,
    openNmsImport, closeNmsImport, nmsImportSetBank, nmsImportClearPicked, nmsImportConfirm
  };
})();
document.addEventListener('DOMContentLoaded', ()=>{ CHR.init(); });
// Alias para compatibilidade com botão que chama Project.exportCHR
if(typeof Project !== 'undefined'){
  Project.exportCHR = ()=>{ 
    if(typeof CHR !== 'undefined' && CHR.exportCHR) CHR.exportCHR();
    else if(typeof CHR !== 'undefined' && CHR.getBuffer){
      const buf = CHR.getBuffer();
      const blob = new Blob([buf], {type: 'application/octet-stream'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (Project.data?.name || 'tiles') + '.chr';
      a.click();
    }
  };
}

