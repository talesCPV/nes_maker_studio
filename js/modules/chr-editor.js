// CHR EDITOR v5.7 - import metatiles: .nms ou .chr bruto
const CHR = (() => {
  let chrBuffer = new Uint8Array(8192);
  let palettes = [[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]];
  let activePal = 0, activeSlot = 1;
  let currentBank = 0, gridW=2, gridH=2, selectedTiles=[0,1,16,17], selectedFlips=[0,0,0,0], activeSlotIdx=0, isDrawing=false, undoStack=[];
  // selectedFlips: 0=none 1=H 2=V 3=HV — flip de OAM por célula (não altera pixels do CHR)
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
    img: null,           // HTMLImageElement ou Canvas (após crop)
    // seleção atual em px da imagem (null = nenhuma)
    sel: null,           // {x,y,w,h}
    gridTW: 2, gridTH: 2,
    drag: null,          // {type:'new'|'move'|'resize', handle, x0,y0, orig}
    pendingMeta: null,
    lastOutput: null
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
    pendingMeta: null    // { w,h, name, layout: [absIdx,...] } no arquivo fonte
  };

  function buildHTML(){
    const root = document.getElementById('chrModuleRoot'); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <select id="bankSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px"></select>
          <button class="btn-tool" style="background:#c0392b;color:#fff" onclick="CHR.addBank()">+ BANK</button>
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer"><input type="checkbox" id="chkShowGrid"> grid</label>
          <div style="display:flex;gap:6px;align-items:center;margin-left:8px;border-left:1px solid #333;padding-left:8px;flex-wrap:wrap">
            <button class="btn-tool" onclick="CHR.openImageImport()" title="Importar PNG/JPG e preparar crop/grid em tiles" style="background:#16a085;color:#fff;border-color:#1abc9c;min-width:118px;height:28px;padding:0 10px;font-size:11px;font-weight:600;border-radius:4px;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;box-sizing:border-box">🖼 Import imagem</button>
            <button class="btn-tool" onclick="CHR.openNmsImport()" title="Importar tiles/metatiles de outro .nms ou .chr" style="background:#8e44ad;color:#fff;border-color:#a569bd;min-width:118px;height:28px;padding:0 10px;font-size:11px;font-weight:600;border-radius:4px;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;box-sizing:border-box">📦 Import metatiles</button>
            <button class="btn-tool" onclick="CHR.importCHR()" title="Importar arquivo .chr / .bin / .nes no buffer atual" style="background:#2c3e50;color:#fff;border-color:#5d6d7e;min-width:118px;height:28px;padding:0 10px;font-size:11px;font-weight:600;border-radius:4px;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;box-sizing:border-box">🧱 Import .chr</button>
            <button class="btn-tool" onclick="Project.exportCHR()" title="Exportar buffer CHR atual" style="background:#34495e;color:#fff;border-color:#5d6d7e;min-width:118px;height:28px;padding:0 10px;font-size:11px;font-weight:600;border-radius:4px;border:1px solid transparent;display:inline-flex;align-items:center;justify-content:center;gap:4px;box-sizing:border-box">⬇️ Export .chr</button>
            <input type="file" id="importNms_internal" accept=".nms,.chr,.bin,application/json,application/octet-stream" style="display:none">
            <input type="file" id="importCHR_internal" accept=".chr,.bin,.nes" style="display:none">
            <input type="file" id="importImage_internal" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none">
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center;font-size:12px">
            <b>Tamanho:</b>
            <select id="tileColsSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:3px"></select>
            <span>X</span>
            <select id="tileRowsSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:3px"></select>
            <button class="btn-tool" onclick="CHR.applyGridResize()" title="Aplica o tamanho escolhido nos selects" style="background:#2980b9;color:#fff;font-size:11px;padding:3px 8px">Redimensionar</button>
            <span style="margin-left:8px">Slot: <b id="lblActiveSlot" style="color:#ffcc00">1/4</b></span>
            <button class="btn-tool" onclick="CHR.autoFill()">Auto</button>
          </div>
        </div>

        <div style="display:flex;flex:1;overflow:hidden;min-height:0">
          <div style="width:560px;min-width:560px;background:#181818;padding:12px;display:flex;flex-direction:column;gap:8px;overflow:auto;border-right:1px solid #333">
            <h3 style="font-size:11px;color:#4ec9b0">GRADE - PT0 $0000 (0-255) PT1 $1000 (256-511)</h3>
            <canvas id="sheetCanvas" width="512" height="512" style="border:2px solid #333;background:#000;image-rendering:pixelated;cursor:crosshair;display:block"></canvas>
          </div>

          <div style="flex:1;background:#1e1e1e;padding:12px;display:flex;flex-direction:column;gap:10px;overflow:auto;min-width:460px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <h3 style="font-size:11px;color:#4ec9b0">EDIÇÃO METATILE</h3>
              <span style="font-size:10px;color:#888" id="lblMetatileSize">2x2 PT0</span>
              <span style="font-size:10px;color:#888">Tiles: <b id="lblTileIndices" style="color:#ffcc00">$00,$01</b></span>
            </div>

            <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;background:#252526;padding:6px 8px;border-radius:6px;border:1px solid #333">
              <span style="font-size:10px;color:#888;margin-right:4px">TOOLS:</span>
              <button class="btn-tool tool-btn active" data-tool="pen" onclick="CHR.setTool('pen')">🖊️ Pen</button>
              <button class="btn-tool tool-btn" data-tool="erase" onclick="CHR.setTool('erase')" title="Apaga pixels (cor 0)">🧹 Erase</button>
              <button class="btn-tool tool-btn" data-tool="line" onclick="CHR.setTool('line')">📏 Line</button>
              <button class="btn-tool tool-btn" data-tool="rect" onclick="CHR.setTool('rect')">⬜ Rect</button>
              <button class="btn-tool tool-btn" data-tool="circle" onclick="CHR.setTool('circle')">⭕ Circle</button>
              <button class="btn-tool tool-btn" data-tool="fill" onclick="CHR.setTool('fill')">🪣 Fill</button>
              <button class="btn-tool tool-btn" data-tool="copy" onclick="CHR.setTool('copy')">📋 Copy</button>
              <button class="btn-tool tool-btn" data-tool="paste" onclick="CHR.setTool('paste')">📌 Paste</button>
              <span style="color:#666;margin:0 4px;font-size:14px;user-select:none">|</span>
              <button class="btn-tool tool-btn" data-tool="sheetcopy" onclick="CHR.setTool('sheetcopy')" title="Clique nos tiles da folha para adicioná-los à fila (pode vários)" style="height:26px;padding:0 8px;font-size:11px;line-height:1;box-sizing:border-box;display:inline-flex;align-items:center">🗐 Copiar Tile</button>
              <button class="btn-tool tool-btn" data-tool="sheetpaste" onclick="CHR.setTool('sheetpaste')" title="Clique na folha para colar o tile selecionado na fila" style="height:26px;padding:0 8px;font-size:11px;line-height:1;box-sizing:border-box;display:inline-flex;align-items:center">📥 Colar Tile</button>
              <button class="btn-tool tool-btn" data-tool="sheetclear" onclick="CHR.setTool('sheetclear')" title="Clique no tile da folha para zerar (16 bytes)" style="height:26px;padding:0 8px;font-size:11px;line-height:1;box-sizing:border-box;display:inline-flex;align-items:center">🗑 Clear Tile</button>
              <button class="btn-tool" onclick="CHR.clearTileQueue()" title="Limpa a fila de tiles copiados" style="height:26px;padding:0 8px;font-size:11px;line-height:1;box-sizing:border-box;display:inline-flex;align-items:center">🗑 Fila</button>
              <span style="font-size:10px;color:#888;margin-left:4px" id="lblSheetClipboard">Fila: 0 tiles</span>
              <div style="width:1px;height:18px;background:#444;margin:0 6px"></div>
              <button class="btn-tool" onclick="CHR.undo()" style="background:#555;color:#fff">↩️ Undo</button>
            </div>

            <!-- FILA DE TILES (copiar/colar) - mesma ideia do seletor rápido -->
            <div id="tileQueuePanel" style="background:#111;border:1px solid #3a5a3a;border-radius:6px;padding:8px;display:none">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
                <h4 style="font-size:10px;color:#7dcea0;margin:0">FILA DE TILES COPIADOS</h4>
                <span style="font-size:9px;color:#666">clique no item pra selecionar · × remove · Colar Tile usa o selecionado</span>
              </div>
              <div id="tileQueueSelector" style="display:flex;gap:6px;flex-wrap:wrap;min-height:40px"></div>
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn-tool" onclick="CHR.flipH()" title="Espelha PIXELS do grupo (reescreve CHR)">Flip H px</button>
              <button class="btn-tool" onclick="CHR.flipV()" title="Espelha PIXELS do grupo (reescreve CHR)">Flip V px</button>
              <button class="btn-tool" onclick="CHR.rotate()">Rotate</button>
              <div style="display:flex;align-items:center;gap:4px;margin-left:6px;border-left:1px solid #444;padding-left:8px">
                <span style="font-size:9px;color:#7dcea0">célula:</span>
                <button class="btn-tool" onclick="CHR.toggleSlotFlipH()" title="Flip H nesta célula do metatile (reusa tile no CHR)" style="background:#1a3a1a;color:#7dcea0">↔ H</button>
                <button class="btn-tool" onclick="CHR.toggleSlotFlipV()" title="Flip V nesta célula do metatile" style="background:#1a3a1a;color:#7dcea0">↕ V</button>
                <span id="lblSlotFlip" style="font-size:10px;color:#888">slot: —</span>
              </div>
              <button class="btn-tool" onclick="CHR.shift('left')">←</button>
              <button class="btn-tool" onclick="CHR.shift('up')">↑</button>
              <button class="btn-tool" onclick="CHR.shift('down')">↓</button>
              <button class="btn-tool" onclick="CHR.shift('right')">→</button>
              <button class="btn-tool" style="background:#c0392b;color:#fff" onclick="CHR.clearGroup()">Clear</button>
              <div style="display:flex;align-items:center;gap:4px;margin-left:8px;border-left:1px solid #444;padding-left:8px">
                <select id="metatileSelect" style="min-width:200px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px" onchange="CHR.onMetatileSelectChange()"><option value="">— Metatiles —</option></select>
                <button class="btn-tool" style="background:#27ae60;color:#fff" onclick="CHR.saveMetatile()">💾 Save</button>
                <button class="btn-tool" style="background:#4ec9b0;color:#111" onclick="CHR.newTile()">✨ New</button>
                <button class="btn-tool" style="background:#f39c12;color:#111" onclick="CHR.renameMetatile()" title="Renomeia o metatile selecionado">✏️ Rename</button>
                <button class="btn-tool" onclick="CHR.deleteMetatile()">🗑️</button>
              </div>
            </div>

            <!-- SELETOR RÁPIDO DE TILES - que você pediu pra voltar -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
              <h4 style="font-size:10px;color:#4ec9b0;margin-bottom:6px">SELETOR RÁPIDO - TILES SELECIONADOS (clique pra trocar slot ativo)</h4>
              <div id="quickTileSelector" style="display:flex;gap:6px;flex-wrap:wrap"></div>
            </div>

            <div style="display:flex;gap:12px;align-items:flex-start">
              <div>
                <label style="display:flex;align-items:center;gap:4px;font-size:10px;color:#888;margin-bottom:4px;cursor:pointer"><input type="checkbox" id="chkMetatileGrid" checked onchange="CHR.renderAll()"> grid entre tiles</label>
                <canvas id="zoomCanvas" width="320" height="320" style="border:1px solid #555;background:#000;image-rendering:pixelated;cursor:crosshair;display:block;min-width:320px;min-height:320px"></canvas>
                <div style="font-size:10px;color:#666;margin-top:6px">Botão esquerdo desenha, direito pega cor (teclas 1-4 troca cor)</div>
              </div>
              <div style="flex:1">
                <div style="font-size:10px;color:#888;margin-bottom:6px">PREVIEW 1:1 + PALETA RÁPIDA</div>
                <canvas id="previewCanvas" width="128" height="128" style="border:1px solid #333;background:#000;image-rendering:pixelated;display:block"></canvas>
                <div style="display:flex;gap:6px;margin-top:10px" id="quickColors"></div>
              </div>
            </div>

            <!-- PREVIEW DE METATILES - também voltou -->
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:8px">
              <h4 style="font-size:10px;color:#4ec9b0;margin-bottom:6px">METATILES NO PROJETO - clique pra carregar ( <span id="lblMetatileCount">0</span> )</h4>
              <div id="metatilePreview" style="display:flex;gap:8px;flex-wrap:wrap;max-height:160px;overflow:auto"></div>
            </div>

          </div>
        </div>

        <div style="display:flex;gap:16px;padding:10px 14px;background:#252526;border-top:2px solid #007acc;overflow:auto;max-height:220px">
          <div style="min-width:360px"><h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">PALETAS PPU (BG + SPR)</h4><div id="subpalettesContainer" style="display:flex;flex-direction:column;gap:8px"></div></div>
          <div style="flex:1;min-width:400px"><h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">PALETA MASTER NES (clique pra trocar cor do slot)</h4><div id="masterPaletteGrid" style="display:flex;flex-direction:column;gap:2px;background:#111;padding:8px;border-radius:6px;border:1px solid #333;width:fit-content"></div></div>
          <div style="min-width:200px;background:#1a1a2e;border:1px solid #2a2a4a;border-radius:6px;padding:10px;font-size:10px;color:#888;line-height:1.4">PT0 = $0000 BG padrão<br>PT1 = $1000 segunda página<br>Build detecta automaticamente<br><br>Tools: Pen, Line, Rect, Circle, Fill, Copy, Paste</div>
        </div>
        <div style="height:24px;background:#007acc;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:11px"><span id="statusLeft">Pronto - seletor rápido restaurado</span><span id="statusRight">PT0/PT1 + $102 fix</span></div>

        <!-- MODAL: Import imagem (passo 1) -->
        <div id="imgImportModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10000;align-items:center;justify-content:center">
          <div style="background:#1e1e1e;border:1px solid #444;border-radius:10px;width:min(960px,96vw);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
            <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #333;flex-wrap:wrap">
              <h3 style="margin:0;font-size:14px;color:#4ec9b0">🖼 Import imagem → tiles NES</h3>
              <span style="font-size:11px;color:#888">Passo 1: crop · resize · grade em tiles (8×8 px)</span>
              <button class="btn-tool" onclick="CHR.closeImageImport()" style="margin-left:auto;background:#c0392b;color:#fff">✕ Fechar</button>
            </div>
            <div style="display:flex;flex:1;min-height:0;overflow:hidden">
              <div style="flex:1;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:8px;background:#111">
                <canvas id="imgImportCanvas" width="512" height="384" style="max-width:100%;background:#000;border:1px solid #444;image-rendering:pixelated;cursor:crosshair;display:block;margin:0 auto"></canvas>
                <div style="font-size:10px;color:#666;text-align:center">Arraste para selecionar · alças amarelas redimensionam · Crop descarta o resto · grade na imagem atual</div>
              </div>
              <div style="width:280px;min-width:280px;border-left:1px solid #333;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:12px;background:#181818">
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
                  <h4 style="font-size:11px;color:#ffcc00;margin:0 0 8px">Arquivo</h4>
                  <button class="btn-tool" onclick="document.getElementById('importImage_internal').click()" style="width:100%;background:#2980b9;color:#fff">📂 Escolher imagem</button>
                  <div id="imgImportFileInfo" style="font-size:10px;color:#888;margin-top:8px;line-height:1.4">Nenhuma imagem</div>
                </div>
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
                  <h4 style="font-size:11px;color:#4ec9b0;margin:0 0 8px">Seleção / Crop</h4>
                  <div style="font-size:10px;color:#666;line-height:1.4;margin-bottom:8px">
                    1. Arraste na imagem para selecionar<br>
                    2. Arraste as <b style="color:#ffcc00">alças</b> para redimensionar<br>
                    3. <b>Crop</b> descarta o resto (fica só a seleção)
                  </div>
                  <div style="display:grid;grid-template-columns:40px 1fr 40px 1fr;gap:4px 6px;align-items:center;font-size:10px;color:#888">
                    <span>X</span><input id="imgImportCropX" type="number" min="0" value="0" onchange="CHR.imgImportSetCropFromInputs()" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                    <span>Y</span><input id="imgImportCropY" type="number" min="0" value="0" onchange="CHR.imgImportSetCropFromInputs()" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                    <span>W</span><input id="imgImportCropW" type="number" min="1" value="16" onchange="CHR.imgImportSetCropFromInputs()" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                    <span>H</span><input id="imgImportCropH" type="number" min="1" value="16" onchange="CHR.imgImportSetCropFromInputs()" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:3px">
                  </div>
                  <button class="btn-tool" onclick="CHR.imgImportApplyCrop()" style="width:100%;margin-top:8px;background:#e67e22;color:#fff;font-weight:bold">✂ Crop (descartar resto)</button>
                  <button class="btn-tool" onclick="CHR.imgImportClearSelection()" style="width:100%;margin-top:4px;font-size:10px">Limpar seleção</button>
                  <button class="btn-tool" onclick="CHR.imgImportSelectAll()" style="width:100%;margin-top:4px;font-size:10px">Selecionar tudo</button>
                </div>
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
                  <h4 style="font-size:11px;color:#7dcea0;margin:0 0 8px">Grade em tiles</h4>
                  <div style="font-size:10px;color:#666;margin-bottom:6px">Sobre a <b>imagem atual</b> (após crop). 1 tile = 8×8 px na saída.</div>
                  <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                    <label style="font-size:10px;color:#888;width:40px">Cols</label>
                    <input id="imgImportGridW" type="number" min="1" max="32" value="2" onchange="CHR.imgImportSetGrid()" style="width:60px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:4px;font-size:12px">
                    <label style="font-size:10px;color:#888">×</label>
                    <input id="imgImportGridH" type="number" min="1" max="32" value="2" onchange="CHR.imgImportSetGrid()" style="width:60px;background:#000;color:#fff;border:1px solid #444;border-radius:3px;padding:4px;font-size:12px">
                    <label style="font-size:10px;color:#888">tiles</label>
                  </div>
                  <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;cursor:pointer">
                    <input type="checkbox" id="imgImportShowGrid" checked onchange="CHR.imgImportRedraw()"> Mostrar grade
                  </label>
                </div>
                <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
                  <h4 style="font-size:11px;color:#e67e22;margin:0 0 8px">Saída</h4>
                  <div style="font-size:10px;color:#888;line-height:1.5" id="imgImportOutInfo">—</div>
                  <div style="font-size:10px;color:#666;margin-top:6px">A imagem atual é redimensionada (nearest) para <b style="color:#e67e22" id="imgImportOutPx">16×16</b> px (= grade × 8).</div>
                </div>
                <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px">
                  <button class="btn-tool" onclick="CHR.imgImportPreviewOutput()" style="background:#8e44ad;color:#fff;padding:8px">👁 Preview (quantize NES)</button>
                  <button class="btn-tool" onclick="CHR.imgImportConfirmStep1()" style="background:#27ae60;color:#fff;padding:8px;font-weight:bold">→ Converter e enfileirar tiles</button>
                  <div style="font-size:9px;color:#666;text-align:center;line-height:1.4">Usa a <b style="color:#7dcea0">subpalette ativa</b> (4 cores).<br>Tiles vão para a <b>fila</b> — cole com “Colar Tile”.<br>Ao colar todos, cria o <b>metatile</b> automaticamente.</div>
                </div>
              </div>
            </div>
            <div id="imgImportPreviewBar" style="display:none;padding:10px;border-top:1px solid #333;background:#0a0a0a;align-items:center;gap:12px">
              <span style="font-size:10px;color:#888">Preview saída:</span>
              <canvas id="imgImportOutCanvas" width="16" height="16" style="image-rendering:pixelated;border:1px solid #555;background:#222"></canvas>
            </div>
          </div>
        </div>

        <!-- MODAL: Import metatiles de outro .nms -->
        <div id="nmsImportModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10000;align-items:center;justify-content:center">
          <div style="background:#1e1e1e;border:1px solid #444;border-radius:10px;width:min(980px,96vw);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
            <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #333;flex-wrap:wrap">
              <h3 style="margin:0;font-size:14px;color:#c39bd3">📦 Import metatiles (.nms)</h3>
              <span style="font-size:11px;color:#888">.nms (tiles+metatiles) ou .chr bruto → fila de colar</span>
              <button class="btn-tool" onclick="CHR.closeNmsImport()" style="margin-left:auto;background:#c0392b;color:#fff">✕ Fechar</button>
            </div>
            <div style="display:flex;flex:1;min-height:0;overflow:hidden">
              <div style="flex:1;padding:12px;overflow:auto;display:flex;flex-direction:column;gap:8px;background:#111">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <button class="btn-tool" onclick="document.getElementById('importNms_internal').click()" style="background:#2980b9;color:#fff">📂 Abrir .nms / .chr</button>
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
    attachEvents(); populateSelects(); updateBankSelect(); ensurePaletteMatchesBank(); initPalUI(); setGrid(gridW,gridH); updateMetatileSelect(); tool='pen'; renderAll();
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
  function initPalUI(){
    const cont=document.getElementById('subpalettesContainer'); if(!cont) return; cont.innerHTML="";
    if(isSpriteBank(currentBank)) createRow("SPR",[4,5,6,7]); else createRow("BG",[0,1,2,3]);
    const grid=document.getElementById('masterPaletteGrid'); grid.innerHTML=""; let line=null;
    NES_PALETTE.forEach((col,idx)=>{ if(idx%16===0){ line=document.createElement('div'); line.style.display='flex'; line.style.gap='2px'; grid.appendChild(line); } const b=document.createElement('div'); b.style.cssText=`width:18px;height:18px;background:${col};border:1px solid #333;border-radius:2px;cursor:pointer`; b.title=`NES $${idx.toString(16).padStart(2,'0').toUpperCase()}`; b.onclick=()=>{ palettes[activePal][activeSlot]=idx; initPalUI(); renderAll(); }; line.appendChild(b); });
    const qc=document.getElementById('quickColors'); if(qc){ qc.innerHTML=''; for(let c=0;c<4;c++){ const isActive=c===activeSlot; const btn=document.createElement('div'); btn.style.cssText=`width:32px;height:24px;background:${NES_PALETTE[palettes[activePal][c]]};border:${isActive?'2px solid #ffcc00':'1px solid #555'};border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:#000;font-weight:bold`; btn.textContent=c+1; btn.onclick=()=>{ activeSlot=c; initPalUI(); renderAll(); updateLabels(); }; qc.appendChild(btn); } }
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
  function flipLabel(f){
    f = f|0;
    if(f===3) return 'HV';
    if(f===1) return 'H';
    if(f===2) return 'V';
    return '—';
  }
  function toggleSlotFlipH(){
    ensureFlipsLen();
    if(activeSlotIdx < 0 || activeSlotIdx >= selectedTiles.length) return;
    selectedFlips[activeSlotIdx] = (selectedFlips[activeSlotIdx]|0) ^ 1;
    updateLabels(); renderAll();
  }
  function toggleSlotFlipV(){
    ensureFlipsLen();
    if(activeSlotIdx < 0 || activeSlotIdx >= selectedTiles.length) return;
    selectedFlips[activeSlotIdx] = (selectedFlips[activeSlotIdx]|0) ^ 2;
    updateLabels(); renderAll();
  }
  function renderSheet(){ if(!sheetCtx) return; sheetCtx.fillStyle="#000"; sheetCtx.fillRect(0,0,512,512); const base=currentBank*256; for(let ty=0;ty<16;ty++) for(let tx=0;tx<16;tx++) drawTile(sheetCtx, base+ty*16+tx, tx*32, ty*32, 4); if(document.getElementById('chkShowGrid')?.checked){ sheetCtx.save(); sheetCtx.strokeStyle="#888"; sheetCtx.setLineDash([2,2]); for(let x=32;x<512;x+=32){ sheetCtx.beginPath(); sheetCtx.moveTo(x+.5,0); sheetCtx.lineTo(x+.5,512); sheetCtx.stroke(); } for(let y=32;y<512;y+=32){ sheetCtx.beginPath(); sheetCtx.moveTo(0,y+.5); sheetCtx.lineTo(512,y+.5); sheetCtx.stroke(); } sheetCtx.restore(); } selectedTiles.forEach((ti,slot)=>{ const local=ti%256; if(Math.floor(ti/256)!==currentBank) return; const tx=local%16, ty=Math.floor(local/16), cur=slot===activeSlotIdx; sheetCtx.strokeStyle=cur?'#ffcc00':'#007acc'; sheetCtx.lineWidth=cur?3:2; sheetCtx.strokeRect(tx*32+1,ty*32+1,30,30); }); }
  function bresenham(x0,y0,x1,y1){ const pts=[]; let dx=Math.abs(x1-x0), dy=Math.abs(y1-y0); let sx=x0<x1?1:-1, sy=y0<y1?1:-1, err=dx-dy; while(true){ pts.push({x:x0,y:y0}); if(x0===x1&&y0===y1) break; let e2=2*err; if(e2>-dy){ err-=dy; x0+=sx; } if(e2<dx){ err+=dx; y0+=sy; } } return pts; }
  function getRectPoints(x0,y0,x1,y1){ const pts=[]; const minX=Math.min(x0,x1), maxX=Math.max(x0,x1), minY=Math.min(y0,y1), maxY=Math.max(y0,y1); for(let x=minX;x<=maxX;x++){ pts.push({x,y:minY}); pts.push({x,y:maxY}); } for(let y=minY+1;y<=maxY-1;y++){ pts.push({x:minX,y}); pts.push({x:maxX,y}); } return pts; }
  function getCirclePoints(cx,cy,r){ const pts=[]; let x=r, y=0, err=0; while(x>=y){ pts.push({x:cx+x,y:cy+y},{x:cx+y,y:cy+x},{x:cx-y,y:cy+x},{x:cx-x,y:cy+y},{x:cx-x,y:cy-y},{x:cx-y,y:cy-x},{x:cx+y,y:cy-x},{x:cx+x,y:cy-y}); y++; if(err<=0){ err+=2*y+1; } if(err>0){ x--; err-=2*x+1; } } return pts; }
  function getMatrix(){
    // Matriz de cores 0–3 do grupo atual (pixels, sem aplicar flip de célula do metatile)
    const W = gridW * 8, H = gridH * 8;
    const M = Array.from({ length: H }, () => Array(W).fill(0));
    for(let gy=0; gy<gridH; gy++){
      for(let gx=0; gx<gridW; gx++){
        const ti = selectedTiles[gy * gridW + gx];
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
    // Grava matriz de pixels de volta nos tiles de selectedTiles (usa gridW/gridH atuais)
    if(!M || !M.length || !M[0] || !M[0].length) return;
    for(let gy=0; gy<gridH; gy++){
      for(let gx=0; gx<gridW; gx++){
        const ti = selectedTiles[gy * gridW + gx];
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
    if(b) b.textContent=selectedTiles.map((i,idx)=>"$"+i.toString(16).toUpperCase().padStart(2,"0")+`(${(i%256).toString(16).toUpperCase()})`+(selectedFlips[idx]?`[${flipLabel(selectedFlips[idx])}]`:'')).join(", ");
    if(size) size.textContent=`${gridW}x${gridH} PT${currentBank} (${selectedTiles.length} tiles)`;
    if(status) status.textContent=`PT${currentBank} - Slot ${activeSlotIdx+1} - Tile $${selectedTiles[activeSlotIdx]?.toString(16).toUpperCase()} flip=${flipLabel(selectedFlips[activeSlotIdx])} - Tool ${tool}`;
    const sf=document.getElementById('lblSlotFlip');
    if(sf) sf.textContent = `slot ${activeSlotIdx+1}: ${flipLabel(selectedFlips[activeSlotIdx]|0)}`;
    renderQuickTileSelector();
  }

  function renderQuickTileSelector(){
    const cont=document.getElementById('quickTileSelector'); if(!cont) return; cont.innerHTML='';
    ensureFlipsLen();
    selectedTiles.forEach((ti,idx)=>{
      const isActive=idx===activeSlotIdx;
      const fl=selectedFlips[idx]|0;
      const div=document.createElement('div');
      div.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;border:${isActive?'2px solid #ffcc00':'1px solid #444'};border-radius:4px;background:${isActive?'#332a00':'#111'};cursor:pointer;min-width:56px;position:relative`;
      div.onclick=()=>{ activeSlotIdx=idx; renderAll(); updateLabels(); };
      const canvas=document.createElement('canvas'); canvas.width=16; canvas.height=16; canvas.style.cssText='width:32px;height:32px;image-rendering:pixelated;border:1px solid #222;background:#000';
      drawTile(canvas.getContext('2d'), ti, 0,0,2, fl);
      if(fl){
        const badge=document.createElement('div');
        badge.textContent=flipLabel(fl);
        badge.style.cssText='position:absolute;top:2px;right:2px;font-size:8px;background:#27ae60;color:#fff;padding:0 3px;border-radius:2px;line-height:1.3';
        div.appendChild(badge);
      }
      const label=document.createElement('div'); label.style.cssText='font-size:9px;color:#888;text-align:center;line-height:1.2';
      label.innerHTML=`<b style="color:${isActive?'#ffcc00':'#fff'}">${idx+1}</b><br>$${ti.toString(16).toUpperCase()}<br><span style="color:#666">%${(ti%256).toString(16).toUpperCase()}</span>`;
      div.appendChild(canvas); div.appendChild(label); cont.appendChild(div);
    });
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
    activeSlotIdx=0;
    if(zoomCanvas){ zoomCanvas.width=w*8*16; zoomCanvas.height=h*8*16; }
    const cSel=document.getElementById('tileColsSelect'), rSel=document.getElementById('tileRowsSelect');
    if(cSel) cSel.value=String(w);
    if(rSel) rSel.value=String(h);
    renderAll(); updateLabels();
  }
  function renderZoom(){ if(!zoomCtx) return; const sizeW=gridW*8, sizeH=gridH*8; zoomCanvas.width=sizeW*16; zoomCanvas.height=sizeH*16; zoomCtx.fillStyle="#000"; zoomCtx.fillRect(0,0,zoomCanvas.width,zoomCanvas.height); for(let gy=0;gy<gridH;gy++) for(let gx=0;gx<gridW;gx++){ const ti=selectedTiles[gy*gridW+gx]; if(ti!==undefined) drawTile(zoomCtx, ti, gx*8*16, gy*8*16, 16, selectedFlips[gy*gridW+gx]|0); } if(document.getElementById('chkMetatileGrid')?.checked && (gridW>1 || gridH>1)){ zoomCtx.save(); zoomCtx.strokeStyle="rgba(255,255,0,0.6)"; zoomCtx.lineWidth=1; for(let gx=1; gx<gridW; gx++){ zoomCtx.beginPath(); zoomCtx.moveTo(gx*8*16+0.5, 0); zoomCtx.lineTo(gx*8*16+0.5, zoomCanvas.height); zoomCtx.stroke(); } for(let gy=1; gy<gridH; gy++){ zoomCtx.beginPath(); zoomCtx.moveTo(0, gy*8*16+0.5); zoomCtx.lineTo(zoomCanvas.width, gy*8*16+0.5); zoomCtx.stroke(); } zoomCtx.restore(); } if((tool==='line'||tool==='rect'||tool==='circle')&&toolStart&&toolPreviewEnd){ let pts=[]; if(tool==='line') pts=bresenham(toolStart.x,toolStart.y,toolPreviewEnd.x,toolPreviewEnd.y); else if(tool==='rect') pts=getRectPoints(toolStart.x,toolStart.y,toolPreviewEnd.x,toolPreviewEnd.y); else if(tool==='circle'){ const r=Math.round(Math.hypot(toolPreviewEnd.x-toolStart.x, toolPreviewEnd.y-toolStart.y)); pts=getCirclePoints(toolStart.x,toolStart.y,r); } zoomCtx.fillStyle="rgba(255,255,0,0.9)"; pts.forEach(p=>{ if(p.x>=0&&p.x<sizeW&&p.y>=0&&p.y<sizeH) zoomCtx.fillRect(p.x*16, p.y*16, 16,16); }); } if(copyDrag&&copyDrag.active){ const x0=Math.min(copyDrag.x0, copyDrag.x1), y0=Math.min(copyDrag.y0, copyDrag.y1); const x1=Math.max(copyDrag.x0, copyDrag.x1), y1=Math.max(copyDrag.y0, copyDrag.y1); zoomCtx.fillStyle="rgba(0,150,255,0.25)"; zoomCtx.fillRect(x0*16, y0*16, (x1-x0+1)*16, (y1-y0+1)*16); } if(previewCtx){ previewCanvas.width=sizeW*2; previewCanvas.height=sizeH*2; previewCtx.fillStyle="#000"; previewCtx.fillRect(0,0,previewCanvas.width,previewCanvas.height); for(let gy=0;gy<gridH;gy++) for(let gx=0;gx<gridW;gx++){ const ti=selectedTiles[gy*gridW+gx]; if(ti!==undefined) drawTile(previewCtx, ti, gx*8*2, gy*8*2, 2, selectedFlips[gy*gridW+gx]|0); } } }
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
    const gx=Math.floor(px/8), gy=Math.floor(py/8), slot=gy*gridW+gx, ti=selectedTiles[slot];
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
      selectedTiles[activeSlotIdx]=g; activeSlotIdx=(activeSlotIdx+1)%selectedTiles.length; renderAll(); updateLabels();
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
    if(existingId){
      const mt = metatiles.find(m=>m.id===existingId);
      if(mt){
        ensureFlipsLen(); mt.w=gridW; mt.h=gridH; mt.tiles=[...selectedTiles]; mt.flips=[...selectedFlips]; mt.bank=currentBank; mt.palette=activePal;
        updateMetatileSelect(); renderAll();
        if(typeof Project!=='undefined' && Project.status) Project.status(`Metatile "${mt.name}" atualizado`);
        return;
      }
    }
    // Nenhum metatile selecionado no dropdown - cria um novo como fallback
    const name=prompt(`Nome:`, `metatile_${metatiles.length+1}_${gridW}x${gridH}_PT${currentBank}`); if(!name) return;
    const id='mt_'+Date.now(); const mt={ id, name:name.trim(), w:gridW, h:gridH, tiles:[...selectedTiles], flips:[...selectedFlips], bank:currentBank, palette:activePal, created:Date.now() };
    metatiles.push(mt); updateMetatileSelect(); if(sel) sel.value=id; renderAll();
  }
  // Cria um metatile novo de verdade (pede nome, abre uma seleção 2x2 com os 4 primeiros
  // tiles do banco atual pra o usuário editar/redimensionar). O metatile já fica selecionado
  // no dropdown, então clicar em Save salva as alterações nele (mesmo caminho de saveMetatile
  // acima, não cria um segundo metatile).
  function newTile(){
    const name=prompt("Nome do novo metatile:", `metatile_${metatiles.length+1}`); if(!name) return;
    const base=currentBank*256;
    gridW=2; gridH=2; selectedTiles=[base, base+1, base+16, base+17]; selectedFlips=[0,0,0,0]; activeSlotIdx=0;
    const id='mt_'+Date.now();
    const mt={ id, name:name.trim(), w:gridW, h:gridH, tiles:[...selectedTiles], flips:[...selectedFlips], bank:currentBank, palette:activePal, created:Date.now() };
    metatiles.push(mt);
    updateMetatileSelect();
    const sel=document.getElementById('metatileSelect'); if(sel) sel.value=id;
    renderAll(); updateLabels();
    if(typeof Project!=='undefined' && Project.status) Project.status(`Novo metatile "${mt.name}" - edite e clique em Save`);
  }
  function loadSelectedMetatile(){ const sel=document.getElementById('metatileSelect'); if(!sel||!sel.value) return; const mt=metatiles.find(m=>m.id===sel.value); if(!mt) return; gridW=mt.w; gridH=mt.h; selectedTiles=[...mt.tiles]; selectedFlips=(mt.flips&&mt.flips.length===mt.tiles.length)?[...mt.flips]:mt.tiles.map(()=>0); currentBank=mt.bank||0; activePal=mt.palette||0; activeSlotIdx=0; if(zoomCanvas){ zoomCanvas.width=gridW*8*16; zoomCanvas.height=gridH*8*16; } renderAll(); updateLabels(); }
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
    bankMetatiles.forEach(mt=>{ const o=document.createElement('option'); o.value=mt.id; o.textContent=`${mt.name} (${mt.w}x${mt.h}) PT${mt.bank||0}`; sel.appendChild(o); });
    if(cur && bankMetatiles.some(m=>m.id===cur)) sel.value=cur;
    renderMetatilePreview();
  }

  function setToolImpl(t){
    tool=t; toolStart=null; toolPreviewEnd=null; if(copyDrag) copyDrag.active=false;
    try{
      document.querySelectorAll('.tool-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.tool===t);
        if(b.dataset.tool===t){ b.style.background='#ffcc00'; b.style.color='#000'; }
        else { b.style.background=''; b.style.color=''; }
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
  async function tryLoadDefaultCHR(){
    try{
      // Se buffer já tem conteúdo, não carrega
      const nonZero = chrBuffer.some(b => b !== 0);
      if(nonZero) return;
      const resp = await fetch('assets/novo.chr');
      if(!resp.ok) return;
      const buf = new Uint8Array(await resp.arrayBuffer());
      if(buf.length < 16) return;
      // Verifica se arquivo tem conteúdo
      const hasData = buf.some(b => b !== 0);
      if(!hasData) return;
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
      console.log('Default novo.chr carregado automaticamente');
    }catch(e){
      console.log('Não foi possível carregar assets/novo.chr:', e.message);
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
    imgImportAttachCanvasEvents();
    imgImportRedraw();
    imgImportUpdateOutInfo();
  }
  function closeImageImport(){
    const modal = document.getElementById('imgImportModal');
    if(modal) modal.style.display = 'none';
  }
  function imgImportNaturalSize(){
    if(!imgImport.img) return {w:0,h:0};
    if(imgImport.img.naturalWidth) return {w: imgImport.img.naturalWidth, h: imgImport.img.naturalHeight};
    return {w: imgImport.img.width, h: imgImport.img.height};
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
      imgImport.gridTW = Math.max(1, Math.min(16, Math.round(img.naturalWidth/32) || 2));
      imgImport.gridTH = Math.max(1, Math.min(16, Math.round(img.naturalHeight/32) || 2));
      const gw = document.getElementById('imgImportGridW');
      const gh = document.getElementById('imgImportGridH');
      if(gw) gw.value = imgImport.gridTW;
      if(gh) gh.value = imgImport.gridTH;
      const info = document.getElementById('imgImportFileInfo');
      if(info) info.innerHTML = `<b style="color:#fff">${file.name}</b><br>${img.naturalWidth}×${img.naturalHeight} px`;
      imgImportSyncSelInputs();
      imgImportUpdateOutInfo();
      imgImportRedraw();
    };
    img.onerror = ()=> alert('Não foi possível carregar a imagem');
    img.src = url;
    e.target.value = '';
  }
  function imgImportSetGrid(){
    const gw = parseInt(document.getElementById('imgImportGridW')?.value, 10) || 1;
    const gh = parseInt(document.getElementById('imgImportGridH')?.value, 10) || 1;
    imgImport.gridTW = Math.max(1, Math.min(32, gw));
    imgImport.gridTH = Math.max(1, Math.min(32, gh));
    imgImportUpdateOutInfo();
    imgImportRedraw();
  }
  function imgImportClearSelection(){
    imgImport.sel = null;
    imgImportSyncSelInputs();
    imgImportRedraw();
  }
  function imgImportSelectAll(){
    const sz = imgImportNaturalSize();
    if(!sz.w) return;
    imgImport.sel = { x:0, y:0, w:sz.w, h:sz.h };
    imgImportSyncSelInputs();
    imgImportRedraw();
  }
  /** Descarta tudo fora da seleção: a imagem atual vira só o retângulo. */
  function imgImportApplyCrop(){
    if(!imgImport.img){ alert('Carregue uma imagem primeiro'); return; }
    if(!imgImport.sel || imgImport.sel.w < 1 || imgImport.sel.h < 1){
      alert('Faça uma seleção antes de aplicar o Crop.');
      return;
    }
    const s = imgImport.sel;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(s.w));
    c.height = Math.max(1, Math.round(s.h));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imgImport.img, s.x, s.y, s.w, s.h, 0, 0, c.width, c.height);
    // usa o canvas como nova "imagem"
    imgImport.img = c;
    imgImport.sel = null;
    const info = document.getElementById('imgImportFileInfo');
    if(info){
      const prev = info.innerHTML.split('<br>')[0] || 'Imagem';
      info.innerHTML = prev + `<br>${c.width}×${c.height} px <span style="color:#e67e22">(cropado)</span>`;
    }
    imgImportSyncSelInputs();
    imgImportUpdateOutInfo();
    imgImportRedraw();
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Crop aplicado: ${c.width}×${c.height} px`);
  }
  function imgImportSetCropFromInputs(){
    if(!imgImport.img) return;
    const sz = imgImportNaturalSize();
    let x = Math.max(0, parseInt(document.getElementById('imgImportCropX')?.value,10)||0);
    let y = Math.max(0, parseInt(document.getElementById('imgImportCropY')?.value,10)||0);
    let w = Math.max(1, parseInt(document.getElementById('imgImportCropW')?.value,10)||1);
    let h = Math.max(1, parseInt(document.getElementById('imgImportCropH')?.value,10)||1);
    if(x >= sz.w) x = sz.w - 1;
    if(y >= sz.h) y = sz.h - 1;
    if(x + w > sz.w) w = sz.w - x;
    if(y + h > sz.h) h = sz.h - y;
    imgImport.sel = { x, y, w, h };
    imgImportSyncSelInputs();
    imgImportRedraw();
  }
  function imgImportSyncSelInputs(){
    const s = imgImport.sel || { x:0, y:0, w:0, h:0 };
    const set = (id,v)=>{ const el=document.getElementById(id); if(el) el.value = Math.round(v); };
    set('imgImportCropX', s.x); set('imgImportCropY', s.y);
    set('imgImportCropW', s.w); set('imgImportCropH', s.h);
  }
  function imgImportUpdateOutInfo(){
    const outW = imgImport.gridTW * 8;
    const outH = imgImport.gridTH * 8;
    const sz = imgImportNaturalSize();
    const el = document.getElementById('imgImportOutInfo');
    const px = document.getElementById('imgImportOutPx');
    if(px) px.textContent = `${outW}×${outH}`;
    if(el){
      el.innerHTML = `Imagem atual: <b style="color:#fff">${sz.w}×${sz.h}</b> px<br>`+
        `Grade: <b style="color:#7dcea0">${imgImport.gridTW}×${imgImport.gridTH}</b> tiles<br>`+
        `Saída: <b style="color:#e67e22">${outW}×${outH}</b> px (nearest)<br>`+
        `Tiles: <b>${imgImport.gridTW * imgImport.gridTH}</b>`;
    }
  }
  function imgImportGetViewMetrics(){
    const canvas = document.getElementById('imgImportCanvas');
    if(!canvas || !imgImport.img) return null;
    const sz = imgImportNaturalSize();
    const iw = sz.w, ih = sz.h;
    if(!iw || !ih) return null;
    const pad = 8;
    const maxW = canvas.width - pad*2, maxH = canvas.height - pad*2;
    const scale = Math.min(maxW/iw, maxH/ih, 8);
    const dw = iw * scale, dh = ih * scale;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    return { scale, ox, oy, dw, dh, iw, ih };
  }
  function imgImportHandleSize(m){
    return Math.max(6, Math.min(12, 8));
  }
  function imgImportGetHandles(m){
    if(!imgImport.sel) return [];
    const s = imgImport.sel;
    const x0 = m.ox + s.x * m.scale, y0 = m.oy + s.y * m.scale;
    const x1 = m.ox + (s.x+s.w) * m.scale, y1 = m.oy + (s.y+s.h) * m.scale;
    const xm = (x0+x1)/2, ym = (y0+y1)/2;
    return [
      { id:'nw', x:x0, y:y0 }, { id:'n', x:xm, y:y0 }, { id:'ne', x:x1, y:y0 },
      { id:'e', x:x1, y:ym }, { id:'se', x:x1, y:y1 }, { id:'s', x:xm, y:y1 },
      { id:'sw', x:x0, y:y1 }, { id:'w', x:x0, y:ym }
    ];
  }
  function imgImportHitHandle(mx, my, m){
    const hs = imgImportHandleSize(m);
    for(const h of imgImportGetHandles(m)){
      if(Math.abs(mx - h.x) <= hs && Math.abs(my - h.y) <= hs) return h.id;
    }
    return null;
  }
  function imgImportHitInsideSel(mx, my, m){
    if(!imgImport.sel) return false;
    const s = imgImport.sel;
    const x0 = m.ox + s.x * m.scale, y0 = m.oy + s.y * m.scale;
    const x1 = m.ox + (s.x+s.w) * m.scale, y1 = m.oy + (s.y+s.h) * m.scale;
    return mx >= x0 && mx <= x1 && my >= y0 && my <= y1;
  }
  function imgImportRedraw(){
    const canvas = document.getElementById('imgImportCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0,0,canvas.width, canvas.height);
    if(!imgImport.img){
      ctx.fillStyle = '#555';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Escolha uma imagem…', canvas.width/2, canvas.height/2);
      return;
    }
    const m = imgImportGetViewMetrics();
    if(!m) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(imgImport.img, m.ox, m.oy, m.dw, m.dh);

    // grade sobre a IMAGEM INTEIRA (atual)
    if(document.getElementById('imgImportShowGrid')?.checked !== false){
      const tw = imgImport.gridTW, th = imgImport.gridTH;
      ctx.strokeStyle = 'rgba(125,206,160,0.75)';
      ctx.lineWidth = 1;
      for(let i=0;i<=tw;i++){
        const x = m.ox + (m.dw * i / tw);
        ctx.beginPath(); ctx.moveTo(x+0.5, m.oy); ctx.lineTo(x+0.5, m.oy+m.dh); ctx.stroke();
      }
      for(let j=0;j<=th;j++){
        const y = m.oy + (m.dh * j / th);
        ctx.beginPath(); ctx.moveTo(m.ox, y+0.5); ctx.lineTo(m.ox+m.dw, y+0.5); ctx.stroke();
      }
    }

    // seleção
    if(imgImport.sel){
      const s = imgImport.sel;
      const cx = m.ox + s.x * m.scale;
      const cy = m.oy + s.y * m.scale;
      const cw = s.w * m.scale;
      const ch = s.h * m.scale;
      // escurece fora
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(m.ox, m.oy, m.dw, Math.max(0, cy - m.oy));
      ctx.fillRect(m.ox, cy+ch, m.dw, Math.max(0, m.oy+m.dh - (cy+ch)));
      ctx.fillRect(m.ox, cy, Math.max(0, cx - m.ox), ch);
      ctx.fillRect(cx+cw, cy, Math.max(0, m.ox+m.dw - (cx+cw)), ch);
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx+0.5, cy+0.5, cw, ch);
      // alças
      const hs = imgImportHandleSize(m);
      ctx.fillStyle = '#ffcc00';
      for(const h of imgImportGetHandles(m)){
        ctx.fillRect(h.x - hs/2, h.y - hs/2, hs, hs);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x - hs/2, h.y - hs/2, hs, hs);
        ctx.fillStyle = '#ffcc00';
      }
    }
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
    if(!canvas || canvas._imgImpBound2) return;
    canvas._imgImpBound2 = true;
    const pos = (e)=>{
      const r = canvas.getBoundingClientRect();
      return {
        mx: (e.clientX - r.left) * (canvas.width / r.width),
        my: (e.clientY - r.top) * (canvas.height / r.height)
      };
    };
    canvas.addEventListener('mousedown', e=>{
      if(!imgImport.img) return;
      const { mx, my } = pos(e);
      const m = imgImportGetViewMetrics();
      if(!m) return;
      const handle = imgImportHitHandle(mx, my, m);
      if(handle){
        imgImport.drag = { type:'resize', handle, orig: { ...imgImport.sel } };
        return;
      }
      if(imgImportHitInsideSel(mx, my, m)){
        const p = imgImportCanvasToImage(mx, my);
        imgImport.drag = { type:'move', x0: p.x, y0: p.y, orig: { ...imgImport.sel } };
        return;
      }
      const p = imgImportCanvasToImage(mx, my);
      if(!p) return;
      imgImport.drag = { type:'new', x0: p.x, y0: p.y };
      imgImport.sel = { x: p.x, y: p.y, w: 1, h: 1 };
      imgImportSyncSelInputs();
      imgImportRedraw();
    });
    canvas.addEventListener('mousemove', e=>{
      if(!imgImport.img) return;
      const { mx, my } = pos(e);
      const m = imgImportGetViewMetrics();
      if(!m) return;
      // cursor
      const handle = imgImportHitHandle(mx, my, m);
      if(handle){
        const cursors = { n:'ns-resize', s:'ns-resize', e:'ew-resize', w:'ew-resize', nw:'nwse-resize', se:'nwse-resize', ne:'nesw-resize', sw:'nesw-resize' };
        canvas.style.cursor = cursors[handle] || 'crosshair';
      } else if(imgImportHitInsideSel(mx, my, m)) canvas.style.cursor = 'move';
      else canvas.style.cursor = 'crosshair';

      if(!imgImport.drag) return;
      const p = imgImportCanvasToImage(mx, my);
      if(!p) return;
      const sz = imgImportNaturalSize();

      if(imgImport.drag.type === 'new'){
        const x0 = imgImport.drag.x0, y0 = imgImport.drag.y0;
        imgImport.sel = {
          x: Math.min(x0, p.x), y: Math.min(y0, p.y),
          w: Math.max(1, Math.abs(p.x - x0)), h: Math.max(1, Math.abs(p.y - y0))
        };
      } else if(imgImport.drag.type === 'move'){
        const o = imgImport.drag.orig;
        let nx = o.x + (p.x - imgImport.drag.x0);
        let ny = o.y + (p.y - imgImport.drag.y0);
        nx = Math.max(0, Math.min(sz.w - o.w, nx));
        ny = Math.max(0, Math.min(sz.h - o.h, ny));
        imgImport.sel = { x: nx, y: ny, w: o.w, h: o.h };
      } else if(imgImport.drag.type === 'resize'){
        const o = imgImport.drag.orig;
        let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
        const h = imgImport.drag.handle;
        if(h.includes('n')) y0 = Math.min(p.y, y1 - 1);
        if(h.includes('s')) y1 = Math.max(p.y, y0 + 1);
        if(h.includes('w')) x0 = Math.min(p.x, x1 - 1);
        if(h.includes('e')) x1 = Math.max(p.x, x0 + 1);
        x0 = Math.max(0, x0); y0 = Math.max(0, y0);
        x1 = Math.min(sz.w, x1); y1 = Math.min(sz.h, y1);
        imgImport.sel = { x: x0, y: y0, w: Math.max(1, x1-x0), h: Math.max(1, y1-y0) };
      }
      imgImportSyncSelInputs();
      imgImportRedraw();
    });
    window.addEventListener('mouseup', ()=>{ imgImport.drag = null; });
  }

  /** Saída = imagem ATUAL inteira → gridTW*8 × gridTH*8 nearest. */
  function imgImportBuildOutputCanvas(){
    if(!imgImport.img) return null;
    const outW = imgImport.gridTW * 8;
    const outH = imgImport.gridTH * 8;
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const sz = imgImportNaturalSize();
    ctx.drawImage(imgImport.img, 0, 0, sz.w, sz.h, 0, 0, outW, outH);
    return c;
  }

  function imgImportHexToRgb(hex){
    if(!hex || typeof hex !== 'string') return {r:0,g:0,b:0};
    const h = hex.replace('#','');
    return {
      r: parseInt(h.slice(0,2), 16) || 0,
      g: parseInt(h.slice(2,4), 16) || 0,
      b: parseInt(h.slice(4,6), 16) || 0
    };
  }
  function imgImportActivePaletteRgb(){
    const slots = palettes[activePal] || palettes[0];
    return [0,1,2,3].map(i => {
      const nesIdx = slots[i] & 63;
      const hex = (typeof NES_PALETTE !== 'undefined' && NES_PALETTE[nesIdx]) ? NES_PALETTE[nesIdx] : '#000000';
      return imgImportHexToRgb(hex);
    });
  }
  function imgImportNearestSlot(r, g, b, paletteRgb){
    let best = 0, bestD = Infinity;
    for(let i=0;i<4;i++){
      const p = paletteRgb[i];
      const dr = r - p.r, dg = g - p.g, db = b - p.b;
      const d = dr*dr + dg*dg + db*db;
      if(d < bestD){ bestD = d; best = i; }
    }
    return best;
  }
  function imgImportQuantizeToIndices(imageData){
    const { data, width, height } = imageData;
    const pal = imgImportActivePaletteRgb();
    const indices = new Uint8Array(width * height);
    for(let i=0, p=0; i<data.length; i+=4, p++){
      if(data[i+3] < 128){ indices[p] = 0; continue; }
      indices[p] = imgImportNearestSlot(data[i], data[i+1], data[i+2], pal);
    }
    return { indices, width, height, pal };
  }
  function imgImportEncodeTile(indices, width, ox, oy){
    const bytes = new Array(16).fill(0);
    for(let y=0;y<8;y++){
      let p0 = 0, p1 = 0;
      for(let x=0;x<8;x++){
        const c = indices[(oy+y)*width + (ox+x)] & 3;
        const sh = 7 - x;
        if(c & 1) p0 |= (1 << sh);
        if(c & 2) p1 |= (1 << sh);
      }
      bytes[y] = p0;
      bytes[y+8] = p1;
    }
    return bytes;
  }
  function imgImportQuantizeCanvas(srcCanvas){
    const ctx = srcCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const { indices, width, height, pal } = imgImportQuantizeToIndices(imageData);
    const out = document.createElement('canvas');
    out.width = width; out.height = height;
    const octx = out.getContext('2d');
    const id = octx.createImageData(width, height);
    for(let p=0;p<indices.length;p++){
      const c = pal[indices[p]];
      const i = p*4;
      id.data[i]=c.r; id.data[i+1]=c.g; id.data[i+2]=c.b; id.data[i+3]=255;
    }
    octx.putImageData(id, 0, 0);
    return { canvas: out, indices, width, height };
  }
  function imgImportPreviewOutput(){
    const raw = imgImportBuildOutputCanvas();
    if(!raw){ alert('Carregue uma imagem primeiro'); return; }
    const q = imgImportQuantizeCanvas(raw);
    const bar = document.getElementById('imgImportPreviewBar');
    const oc = document.getElementById('imgImportOutCanvas');
    if(!oc) return;
    oc.width = q.canvas.width; oc.height = q.canvas.height;
    oc.style.width = Math.min(256, q.canvas.width * 4) + 'px';
    oc.style.height = Math.min(256, q.canvas.height * 4) + 'px';
    oc.getContext('2d').drawImage(q.canvas, 0, 0);
    if(bar) bar.style.display = 'flex';
  }
  function imgImportConfirmStep1(){
    const raw = imgImportBuildOutputCanvas();
    if(!raw){ alert('Carregue uma imagem primeiro'); return; }
    const q = imgImportQuantizeCanvas(raw);
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
    updateTileQueueLabel();
    renderTileQueue();
    imgImportPreviewOutput();
    closeImageImport();
    setToolImpl('sheetpaste');
    if(typeof Project !== 'undefined' && Project.status)
      Project.status(`Import: ${n} tiles na fila (${tw}×${th}). Cole na folha CHR.`);
    alert(`✓ ${n} tiles na fila.\nCole com “Colar Tile”. Ao terminar, o metatile é criado.`);
  }

  /** Chamado após cada paste: se o lote de import completou, grava metatile. */
  function imgImportNotePaste(layoutIndex, absIdx){
    const pm = imgImport.pendingMeta;
    if(!pm || layoutIndex == null) return;
    if(pm.slots[layoutIndex] != null) return; // já colado
    pm.slots[layoutIndex] = absIdx;
    pm.remaining--;
    if(pm.remaining > 0){
      if(typeof Project !== 'undefined' && Project.status)
        Project.status(`Import metatile: ${pm.w*pm.h - pm.remaining}/${pm.w*pm.h} colados`);
      return;
    }
    // completo
    const tiles = pm.slots.map(x => x|0);
    const flips = (pm.flips && pm.flips.length === tiles.length) ? [...pm.flips] : tiles.map(() => 0);
    const id = 'mt_' + Date.now();
    const mt = {
      id,
      name: pm.name,
      w: pm.w,
      h: pm.h,
      tiles,
      flips,
      bank: currentBank,
      palette: activePal,
      created: Date.now()
    };
    metatiles.push(mt);
    imgImport.pendingMeta = null;
    updateMetatileSelect();
    // carrega o metatile criado
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
      Project.status(`Metatile "${mt.name}" criado com ${tiles.length} tiles`);
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
          if(!json.chr){ alert('Arquivo .nms inválido (sem CHR)'); return; }
          const arr = Array.isArray(json.chr) ? json.chr : [];
          const u8 = new Uint8Array(Math.max(8192, arr.length));
          u8.set(arr.slice(0, u8.length));
          nmsImport.chr = u8;
          nmsImport.metatiles = Array.isArray(json.metatiles) ? json.metatiles : [];
          nmsImport.name = json.name || file.name;
          nmsImport.bank = 0;
          nmsImport.picked = [];
          nmsImport.pendingMeta = null;
          const info = document.getElementById('nmsImportFileInfo');
          if(info) info.innerHTML = `<b style="color:#fff">${nmsImport.name}</b> · ${nmsImport.metatiles.length} metatile(s)`;
          const bankSel = document.getElementById('nmsImportBank');
          if(bankSel) bankSel.value = '0';
          nmsImportRenderMtList();
          nmsImportRedraw();
          nmsImportRenderPicked();
        }catch(err){
          alert('Erro ao ler .nms: ' + err.message);
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
    init(){ buildHTML(); setTimeout(()=>tryLoadDefaultCHR(), 100); },
    loadBuffer(buf, pals){ let newBuf = buf.length>=8192?buf:(()=>{let n=new Uint8Array(8192); n.set(buf); return n;})(); const hasData = newBuf.some(b=>b!==0); if(!hasData){ console.log('Buffer vazio recebido, mantendo atual e tentando carregar novo.chr'); tryLoadDefaultCHR(); } else { chrBuffer = newBuf; } if(pals) palettes=pals.map(p=>[...p]); if(!document.getElementById('sheetCanvas')) buildHTML(); else { updateBankSelect(); ensurePaletteMatchesBank(); initPalUI(); updateMetatileSelect(); renderAll(); } },
    getBuffer(){ return chrBuffer; }, getPalettes(){ return palettes; }, getMetatiles(){ return [...metatiles]; }, loadMetatiles(arr){ metatiles = Array.isArray(arr)?[...arr]:[]; updateMetatileSelect(); renderAll(); },
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
    clearGroup(){ pushUndo(); selectedTiles.forEach(ti=>chrBuffer.fill(0,ti*16,ti*16+16)); renderAll(); },
    undo(){ if(undoStack.length){ chrBuffer=undoStack.pop(); renderAll(); } },
    importCHR(){ document.getElementById('importCHR_internal')?.click(); },
    saveMetatile, loadSelectedMetatile, deleteMetatile, renameMetatile, updateMetatileSelect, onMetatileSelectChange, newTile,
    setTool(t){ setToolImpl(t); },
    toggleSlotFlipH, toggleSlotFlipV,
    openImageImport, closeImageImport,
    imgImportSetGrid, imgImportRedraw,
    imgImportSetCropFromInputs, imgImportApplyCrop, imgImportClearSelection, imgImportSelectAll,
    imgImportPreviewOutput, imgImportConfirmStep1,
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

