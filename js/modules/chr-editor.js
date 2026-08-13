// CHR EDITOR v5 - com seletor rápido de tiles + preview de metatiles + tools - PT0/PT1
const CHR = (() => {
  let chrBuffer = new Uint8Array(8192);
  let palettes = [[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]];
  let activePal = 0, activeSlot = 1;
  let currentBank = 0, gridW=2, gridH=2, selectedTiles=[0,1,16,17], activeSlotIdx=0, isDrawing=false, undoStack=[];
  let metatiles = [];
  let sheetCanvas, sheetCtx, zoomCanvas, zoomCtx, previewCanvas, previewCtx;
  let tool='pen', toolStart=null, toolPreviewEnd=null, copyDrag=null, clipboard=null;

  function buildHTML(){
    const root = document.getElementById('chrModuleRoot'); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:8px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <select id="bankSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:4px 8px;font-size:12px"></select>
          <button class="btn-tool" style="background:#c0392b;color:#fff" onclick="CHR.addBank()">+ BANK</button>
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer"><input type="checkbox" id="chkShowGrid"> grid</label>
          <div style="display:flex;gap:6px;align-items:center;margin-left:8px;border-left:1px solid #333;padding-left:8px">
            <button class="btn-tool" onclick="CHR.importCHR()">🧱 Import .CHR</button>
            <button class="btn-tool" onclick="Project.exportCHR()">⬇️ Export .CHR</button>
            <input type="file" id="importCHR_internal" accept=".chr,.bin,.nes" style="display:none">
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center;font-size:12px">
            <b>Tamanho:</b>
            <select id="tileColsSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:3px"></select>
            <span>X</span>
            <select id="tileRowsSelect" style="background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:3px"></select>
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
              <button class="btn-tool tool-btn" data-tool="line" onclick="CHR.setTool('line')">📏 Line</button>
              <button class="btn-tool tool-btn" data-tool="rect" onclick="CHR.setTool('rect')">⬜ Rect</button>
              <button class="btn-tool tool-btn" data-tool="circle" onclick="CHR.setTool('circle')">⭕ Circle</button>
              <button class="btn-tool tool-btn" data-tool="fill" onclick="CHR.setTool('fill')">🪣 Fill</button>
              <button class="btn-tool tool-btn" data-tool="copy" onclick="CHR.setTool('copy')">📋 Copy</button>
              <button class="btn-tool tool-btn" data-tool="paste" onclick="CHR.setTool('paste')">📌 Paste</button>
              <div style="width:1px;height:18px;background:#444;margin:0 6px"></div>
              <button class="btn-tool" onclick="CHR.undo()" style="background:#555;color:#fff">↩️ Undo</button>
              <span style="font-size:10px;color:#888;margin-left:6px" id="lblClipboard">Clipboard: vazio</span>
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn-tool" onclick="CHR.flipH()">Flip H</button>
              <button class="btn-tool" onclick="CHR.flipV()">Flip V</button>
              <button class="btn-tool" onclick="CHR.rotate()">Rotate</button>
              <button class="btn-tool" onclick="CHR.shift('left')">←</button>
              <button class="btn-tool" onclick="CHR.shift('up')">↑</button>
              <button class="btn-tool" onclick="CHR.shift('down')">↓</button>
              <button class="btn-tool" onclick="CHR.shift('right')">→</button>
              <button class="btn-tool" style="background:#c0392b;color:#fff" onclick="CHR.clearGroup()">Clear</button>
              <div style="display:flex;align-items:center;gap:4px;margin-left:8px;border-left:1px solid #444;padding-left:8px">
                <select id="metatileSelect" style="min-width:200px;background:#111;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px" onchange="CHR.onMetatileSelectChange()"><option value="">— Metatiles —</option></select>
                <button class="btn-tool" style="background:#27ae60;color:#fff" onclick="CHR.saveMetatile()">💾 Save</button>
                <button class="btn-tool" style="background:#4ec9b0;color:#111" onclick="CHR.newTile()">✨ New</button>
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
      </div>
    `;
    sheetCanvas=document.getElementById('sheetCanvas'); sheetCtx=sheetCanvas.getContext('2d');
    zoomCanvas=document.getElementById('zoomCanvas'); zoomCtx=zoomCanvas.getContext('2d');
    previewCanvas=document.getElementById('previewCanvas'); previewCtx=previewCanvas.getContext('2d');
    attachEvents(); populateSelects(); updateBankSelect(); initPalUI(); setGrid(gridW,gridH); updateMetatileSelect(); tool='pen'; renderAll();
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

  function populateSelects(){ const cSel=document.getElementById('tileColsSelect'), rSel=document.getElementById('tileRowsSelect'); if(!cSel||!rSel) return; cSel.innerHTML=""; rSel.innerHTML=""; for(let i=1;i<=8;i++){ let o=document.createElement('option'); o.value=i; o.textContent=i+` col`; cSel.appendChild(o); let o2=document.createElement('option'); o2.value=i; o2.textContent=i+` lin`; rSel.appendChild(o2); } cSel.value=gridW; rSel.value=gridH; cSel.onchange=()=>setGrid(parseInt(cSel.value),gridH); rSel.onchange=()=>setGrid(gridW,parseInt(rSel.value)); }
  function updateBankSelect(){ const sel=document.getElementById('bankSelect'); if(!sel) return; sel.innerHTML=""; const total=Math.max(2,Math.ceil(chrBuffer.length/4096)); for(let i=0;i<total;i++){ let o=document.createElement('option'); o.value=i; o.textContent=`${i===0?'PT0 $0000':'PT1 $1000'} (${i*256}-${i*256+255})`; sel.appendChild(o); } sel.value=currentBank; sel.onchange=e=>{ currentBank=parseInt(e.target.value); renderAll(); updateLabels(); }; }
  function initPalUI(){
    const cont=document.getElementById('subpalettesContainer'); if(!cont) return; cont.innerHTML=""; createRow("BG",[0,1,2,3]); createRow("SPR",[4,5,6,7]);
    const grid=document.getElementById('masterPaletteGrid'); grid.innerHTML=""; let line=null;
    NES_PALETTE.forEach((col,idx)=>{ if(idx%16===0){ line=document.createElement('div'); line.style.display='flex'; line.style.gap='2px'; grid.appendChild(line); } const b=document.createElement('div'); b.style.cssText=`width:18px;height:18px;background:${col};border:1px solid #333;border-radius:2px;cursor:pointer`; b.title=`NES $${idx.toString(16).padStart(2,'0').toUpperCase()}`; b.onclick=()=>{ palettes[activePal][activeSlot]=idx; initPalUI(); renderAll(); }; line.appendChild(b); });
    const qc=document.getElementById('quickColors'); if(qc){ qc.innerHTML=''; for(let c=0;c<4;c++){ const isActive=c===activeSlot; const btn=document.createElement('div'); btn.style.cssText=`width:32px;height:24px;background:${NES_PALETTE[palettes[activePal][c]]};border:${isActive?'2px solid #ffcc00':'1px solid #555'};border-radius:3px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:#000;font-weight:bold`; btn.textContent=c+1; btn.onclick=()=>{ activeSlot=c; initPalUI(); renderAll(); updateLabels(); }; qc.appendChild(btn); } }
  }
  function createRow(label, idxs){ const cont=document.getElementById('subpalettesContainer'); const row=document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; const lab=document.createElement('div'); lab.textContent=label; lab.style.width='28px'; lab.style.fontSize='10px'; lab.style.fontWeight='700'; lab.style.color='#4ec9b0'; row.appendChild(lab); const group=document.createElement('div'); group.style.display='flex'; group.style.gap='6px'; idxs.forEach(g=>{ const box=document.createElement('div'); box.style.cssText=`display:flex;gap:2px;padding:3px;border:2px solid ${g===activePal?'#007acc':'transparent'};border-radius:4px;background:#111;cursor:pointer`; box.onclick=()=>{ activePal=g; initPalUI(); renderAll(); }; for(let c=0;c<4;c++){ const slot=document.createElement('div'); const isActive=g===activePal&&c===activeSlot; slot.style.cssText=`width:20px;height:20px;background:${NES_PALETTE[palettes[g][c]]};border:${isActive?'2px solid #ffcc00':'1px solid #444'};border-radius:2px;cursor:pointer`; slot.onclick=e=>{ e.stopPropagation(); activePal=g; activeSlot=c; initPalUI(); renderAll(); updateLabels(); }; box.appendChild(slot); } group.appendChild(box); }); row.appendChild(group); cont.appendChild(row); }

  function drawTile(ctx, tileIdx, dx, dy, scale){ const off=tileIdx*16; if(off+16>chrBuffer.length) return; const pal=palettes[activePal]; for(let y=0;y<8;y++){ const p0=chrBuffer[off+y], p1=chrBuffer[off+y+8]; for(let x=0;x<8;x++){ const sh=7-x, b0=(p0>>sh)&1, b1=(p1>>sh)&1, ci=(b1<<1)|b0; ctx.fillStyle=NES_PALETTE[pal[ci]]; ctx.fillRect(dx+x*scale, dy+y*scale, scale, scale); } } }
  function renderSheet(){ if(!sheetCtx) return; sheetCtx.fillStyle="#000"; sheetCtx.fillRect(0,0,512,512); const base=currentBank*256; for(let ty=0;ty<16;ty++) for(let tx=0;tx<16;tx++) drawTile(sheetCtx, base+ty*16+tx, tx*32, ty*32, 4); if(document.getElementById('chkShowGrid')?.checked){ sheetCtx.save(); sheetCtx.strokeStyle="#888"; sheetCtx.setLineDash([2,2]); for(let x=32;x<512;x+=32){ sheetCtx.beginPath(); sheetCtx.moveTo(x+.5,0); sheetCtx.lineTo(x+.5,512); sheetCtx.stroke(); } for(let y=32;y<512;y+=32){ sheetCtx.beginPath(); sheetCtx.moveTo(0,y+.5); sheetCtx.lineTo(512,y+.5); sheetCtx.stroke(); } sheetCtx.restore(); } selectedTiles.forEach((ti,slot)=>{ const local=ti%256; if(Math.floor(ti/256)!==currentBank) return; const tx=local%16, ty=Math.floor(local/16), cur=slot===activeSlotIdx; sheetCtx.strokeStyle=cur?'#ffcc00':'#007acc'; sheetCtx.lineWidth=cur?3:2; sheetCtx.strokeRect(tx*32+1,ty*32+1,30,30); }); }
  function bresenham(x0,y0,x1,y1){ const pts=[]; let dx=Math.abs(x1-x0), dy=Math.abs(y1-y0); let sx=x0<x1?1:-1, sy=y0<y1?1:-1, err=dx-dy; while(true){ pts.push({x:x0,y:y0}); if(x0===x1&&y0===y1) break; let e2=2*err; if(e2>-dy){ err-=dy; x0+=sx; } if(e2<dx){ err+=dx; y0+=sy; } } return pts; }
  function getRectPoints(x0,y0,x1,y1){ const pts=[]; const minX=Math.min(x0,x1), maxX=Math.max(x0,x1), minY=Math.min(y0,y1), maxY=Math.max(y0,y1); for(let x=minX;x<=maxX;x++){ pts.push({x,y:minY}); pts.push({x,y:maxY}); } for(let y=minY+1;y<=maxY-1;y++){ pts.push({x:minX,y}); pts.push({x:maxX,y}); } return pts; }
  function getCirclePoints(cx,cy,r){ const pts=[]; let x=r, y=0, err=0; while(x>=y){ pts.push({x:cx+x,y:cy+y},{x:cx+y,y:cy+x},{x:cx-y,y:cy+x},{x:cx-x,y:cy+y},{x:cx-x,y:cy-y},{x:cx-y,y:cy-x},{x:cx+y,y:cy-x},{x:cx+x,y:cy-y}); y++; if(err<=0){ err+=2*y+1; } if(err>0){ x--; err-=2*x+1; } } return pts; }
  function getMatrix(){ const W=gridW*8,H=gridH*8,M=Array.from({length:H},()=>Array(W).fill(0)); for(let gy=0;gy<gridH;gy++) for(let gx=0;gx<gridW;gx++){ const ti=selectedTiles[gy*gridW+gx], off=ti*16; if(off>=chrBuffer.length) continue; for(let py=0;py<8;py++){ const p0=chrBuffer[off+py], p1=chrBuffer[off+py+8]; for(let px=0;px<8;px++){ const sh=7-px; M[gy*8+py][gx*8+px]=((p1>>sh&1)<<1)|(p0>>sh&1); } } } return M; }
  function setMatrix(M){ for(let gy=0;gy<gridH;gy++) for(let gx=0;gx<gridW;gx++){ const ti=selectedTiles[gy*gridW+gx], off=ti*16; if(off>=chrBuffer.length) continue; for(let py=0;py<8;py++){ let a=0,b=0; for(let px=0;px<8;px++){ const c=M[gy*8+py][gx*8+px], sh=7-px; if(c&1) a|=1<<sh; if(c>>1&1) b|=1<<sh; } chrBuffer[off+py]=a; chrBuffer[off+py+8]=b; } } renderAll(); }

  function pushUndo(){ undoStack.push(chrBuffer.slice()); if(undoStack.length>60) undoStack.shift(); }
  function updateLabels(){
    const a=document.getElementById('lblActiveSlot'), b=document.getElementById('lblTileIndices'), size=document.getElementById('lblMetatileSize'), status=document.getElementById('statusLeft');
    if(a) a.textContent=`${activeSlotIdx+1}/${selectedTiles.length}`; if(b) b.textContent=selectedTiles.map(i=>"$"+i.toString(16).toUpperCase().padStart(2,"0")+`(${(i%256).toString(16).toUpperCase()})`).join(", ");
    if(size) size.textContent=`${gridW}x${gridH} PT${currentBank} (${selectedTiles.length} tiles)`; if(status) status.textContent=`PT${currentBank} - Slot ${activeSlotIdx+1} - Tile $${selectedTiles[activeSlotIdx]?.toString(16).toUpperCase()} - Tool ${tool}`;
    renderQuickTileSelector();
  }

  function renderQuickTileSelector(){
    const cont=document.getElementById('quickTileSelector'); if(!cont) return; cont.innerHTML='';
    selectedTiles.forEach((ti,idx)=>{
      const isActive=idx===activeSlotIdx;
      const div=document.createElement('div');
      div.style.cssText=`display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;border:${isActive?'2px solid #ffcc00':'1px solid #444'};border-radius:4px;background:${isActive?'#332a00':'#111'};cursor:pointer;min-width:56px`;
      div.onclick=()=>{ activeSlotIdx=idx; renderAll(); updateLabels(); };
      const canvas=document.createElement('canvas'); canvas.width=16; canvas.height=16; canvas.style.cssText='width:32px;height:32px;image-rendering:pixelated;border:1px solid #222;background:#000';
      const ctx=canvas.getContext('2d'); drawTile(ctx, ti, 0,0,2);
      const label=document.createElement('div'); label.style.cssText='font-size:9px;color:#888;text-align:center;line-height:1.2';
      label.innerHTML=`<b style="color:${isActive?'#ffcc00':'#fff'}">${idx+1}</b><br>$${ti.toString(16).toUpperCase()}<br><span style="color:#666">%${(ti%256).toString(16).toUpperCase()}</span>`;
      div.appendChild(canvas); div.appendChild(label); cont.appendChild(div);
    });
  }

  function renderMetatilePreview(){
    const cont=document.getElementById('metatilePreview'); if(!cont) return; cont.innerHTML='';
    metatiles.forEach(mt=>{
      const wrap=document.createElement('div'); wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;background:#222;border:1px solid #444;border-radius:4px;cursor:pointer;min-width:60px';
      wrap.onclick=()=>{ const sel=document.getElementById('metatileSelect'); if(sel){ sel.value=mt.id; loadSelectedMetatile(); } };
      const canvas=document.createElement('canvas'); canvas.width=mt.w*8; canvas.height=mt.h*8; canvas.style.cssText=`width:${mt.w*12}px;height:${mt.h*12}px;image-rendering:pixelated;background:#000;border:1px solid #333`;
      const ctx=canvas.getContext('2d'); const pal=palettes[mt.palette||0]; for(let gy=0;gy<mt.h;gy++) for(let gx=0;gx<mt.w;gx++){ const ti=mt.tiles[gy*mt.w+gx]; if(ti===undefined) continue; const off=ti*16; if(off+16>chrBuffer.length) continue; for(let y=0;y<8;y++){ const p0=chrBuffer[off+y], p1=chrBuffer[off+y+8]; for(let x=0;x<8;x++){ const sh=7-x, b0=(p0>>sh)&1, b1=(p1>>sh)&1, ci=(b1<<1)|b0; ctx.fillStyle=NES_PALETTE[pal[ci]]; ctx.fillRect(gx*8+x, gy*8+y,1,1); } } }
      const label=document.createElement('div'); label.style.cssText='font-size:8px;color:#aaa;text-align:center;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; label.textContent=mt.name;
      wrap.appendChild(canvas); wrap.appendChild(label); cont.appendChild(wrap);
    });
  }

  function setGrid(w,h){ gridW=w; gridH=h; const first=selectedTiles[0]||currentBank*256; selectedTiles=[]; for(let i=0;i<w*h;i++) selectedTiles.push(first+i); activeSlotIdx=0; if(zoomCanvas){ zoomCanvas.width=w*8*16; zoomCanvas.height=h*8*16; } renderAll(); updateLabels(); }
  function renderZoom(){ if(!zoomCtx) return; const sizeW=gridW*8, sizeH=gridH*8; zoomCanvas.width=sizeW*16; zoomCanvas.height=sizeH*16; zoomCtx.fillStyle="#000"; zoomCtx.fillRect(0,0,zoomCanvas.width,zoomCanvas.height); for(let gy=0;gy<gridH;gy++) for(let gx=0;gx<gridW;gx++){ const ti=selectedTiles[gy*gridW+gx]; if(ti!==undefined) drawTile(zoomCtx, ti, gx*8*16, gy*8*16, 16); } if((tool==='line'||tool==='rect'||tool==='circle')&&toolStart&&toolPreviewEnd){ let pts=[]; if(tool==='line') pts=bresenham(toolStart.x,toolStart.y,toolPreviewEnd.x,toolPreviewEnd.y); else if(tool==='rect') pts=getRectPoints(toolStart.x,toolStart.y,toolPreviewEnd.x,toolPreviewEnd.y); else if(tool==='circle'){ const r=Math.round(Math.hypot(toolPreviewEnd.x-toolStart.x, toolPreviewEnd.y-toolStart.y)); pts=getCirclePoints(toolStart.x,toolStart.y,r); } zoomCtx.fillStyle="rgba(255,255,0,0.9)"; pts.forEach(p=>{ if(p.x>=0&&p.x<sizeW&&p.y>=0&&p.y<sizeH) zoomCtx.fillRect(p.x*16, p.y*16, 16,16); }); } if(copyDrag&&copyDrag.active){ const x0=Math.min(copyDrag.x0, copyDrag.x1), y0=Math.min(copyDrag.y0, copyDrag.y1); const x1=Math.max(copyDrag.x0, copyDrag.x1), y1=Math.max(copyDrag.y0, copyDrag.y1); zoomCtx.fillStyle="rgba(0,150,255,0.25)"; zoomCtx.fillRect(x0*16, y0*16, (x1-x0+1)*16, (y1-y0+1)*16); } if(previewCtx){ previewCanvas.width=sizeW*2; previewCanvas.height=sizeH*2; previewCtx.fillStyle="#000"; previewCtx.fillRect(0,0,previewCanvas.width,previewCanvas.height); for(let gy=0;gy<gridH;gy++) for(let gx=0;gx<gridW;gx++){ const ti=selectedTiles[gy*gridW+gx]; if(ti!==undefined) drawTile(previewCtx, ti, gx*8*2, gy*8*2, 2); } } }
  function renderAll(){ renderSheet(); renderZoom(); renderQuickTileSelector(); renderMetatilePreview(); }

  function doLine(x0,y0,x1,y1){ const M=getMatrix(); bresenham(x0,y0,x1,y1).forEach(p=>{ if(p.y>=0&&p.y<M.length&&p.x>=0&&p.x<M[0].length) M[p.y][p.x]=activeSlot; }); pushUndo(); setMatrix(M); }
  function doRect(x0,y0,x1,y1){ const M=getMatrix(); getRectPoints(x0,y0,x1,y1).forEach(p=>{ if(p.y>=0&&p.y<M.length&&p.x>=0&&p.x<M[0].length) M[p.y][p.x]=activeSlot; }); pushUndo(); setMatrix(M); }
  function doCircle(cx,cy,px,py){ const M=getMatrix(); const r=Math.round(Math.hypot(px-cx, py-cy)); getCirclePoints(cx,cy,r).forEach(p=>{ if(p.y>=0&&p.y<M.length&&p.x>=0&&p.x<M[0].length) M[p.y][p.x]=activeSlot; }); pushUndo(); setMatrix(M); }
  function doFill(sx,sy){ const M=getMatrix(); const H=M.length, W=M[0].length; if(sx<0||sx>=W||sy<0||sy>=H) return; const target=M[sy][sx]; if(target===activeSlot) return; const stack=[[sx,sy]]; const visited=new Set(); while(stack.length){ const [x,y]=stack.pop(); const key=y*W+x; if(visited.has(key)) continue; visited.add(key); if(x<0||x>=W||y<0||y>=H) continue; if(M[y][x]!==target) continue; M[y][x]=activeSlot; stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]); } pushUndo(); setMatrix(M); }
  function doCopy(x0,y0,x1,y1){ const M=getMatrix(); const minX=Math.max(0,Math.min(x0,x1)), maxX=Math.min(M[0].length-1, Math.max(x0,x1)); const minY=Math.max(0,Math.min(y0,y1)), maxY=Math.min(M.length-1, Math.max(y0,y1)); const w=maxX-minX+1, h=maxY-minY+1; if(w<=0||h<=0) return; const data=Array.from({length:h},(_,dy)=> Array.from({length:w},(_,dx)=> M[minY+dy][minX+dx])); clipboard={w,h,data}; const lbl=document.getElementById('lblClipboard'); if(lbl) lbl.textContent=`Clipboard: ${w}x${h}`; }
  function doPaste(px,py){ if(!clipboard) return; const M=getMatrix(); for(let dy=0;dy<clipboard.h;dy++) for(let dx=0;dx<clipboard.w;dx++){ const x=px+dx, y=py+dy; if(x<0||x>=M[0].length||y<0||y>=M.length) continue; M[y][x]=clipboard.data[dy][dx]; } pushUndo(); setMatrix(M); }

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

  function attachEvents(){
    // Handler de import .CHR
    const importInput = document.getElementById('importCHR_internal');
    if(importInput){
      importInput.onchange = handleCHRImport;
    }
    sheetCanvas?.addEventListener('click', e=>{ const r=sheetCanvas.getBoundingClientRect(); const x=Math.floor((e.clientX-r.left)/32), y=Math.floor((e.clientY-r.top)/32); const g=currentBank*256+y*16+x; selectedTiles[activeSlotIdx]=g; activeSlotIdx=(activeSlotIdx+1)%selectedTiles.length; renderAll(); updateLabels(); });
    zoomCanvas?.addEventListener('mousedown', e=>{
      const rect=zoomCanvas.getBoundingClientRect(); const px=Math.floor(((e.clientX-rect.left)/rect.width)*zoomCanvas.width/16), py=Math.floor(((e.clientY-rect.top)/rect.height)*zoomCanvas.height/16);
      if(e.button===2){ const gx=Math.floor(px/8), gy=Math.floor(py/8), slot=gy*gridW+gx, ti=selectedTiles[slot]; if(ti!==undefined){ const lx=px%8, ly=py%8, off=ti*16; const p0=chrBuffer[off+ly], p1=chrBuffer[off+ly+8], sh=7-lx; activeSlot=((p1>>sh&1)<<1)|(p0>>sh&1); initPalUI(); } return; }
      if(tool==='pen'){ isDrawing=true; const gx=Math.floor(px/8), gy=Math.floor(py/8), slot=gy*gridW+gx, ti=selectedTiles[slot]; if(ti===undefined) return; const lx=px%8, ly=py%8, off=ti*16; const sh=7-lx; if(activeSlot&1) chrBuffer[off+ly]|=1<<sh; else chrBuffer[off+ly]&=~(1<<sh); if(activeSlot>>1&1) chrBuffer[off+ly+8]|=1<<sh; else chrBuffer[off+ly+8]&=~(1<<sh); renderAll(); }
      else if(['line','rect','circle'].includes(tool)){ if(!toolStart){ toolStart={x:px,y:py}; } else { if(tool==='line') doLine(toolStart.x,toolStart.y,px,py); else if(tool==='rect') doRect(toolStart.x,toolStart.y,px,py); else if(tool==='circle') doCircle(toolStart.x,toolStart.y,px,py); toolStart=null; toolPreviewEnd=null; } }
      else if(tool==='fill') doFill(px,py);
      else if(tool==='copy') copyDrag={x0:px,y0:py,x1:px,y1:py,active:true};
      else if(tool==='paste') doPaste(px,py);
    });
    zoomCanvas?.addEventListener('contextmenu', e=>e.preventDefault());
    zoomCanvas?.addEventListener('mousemove', e=>{ const rect=zoomCanvas.getBoundingClientRect(); const px=Math.floor(((e.clientX-rect.left)/rect.width)*zoomCanvas.width/16), py=Math.floor(((e.clientY-rect.top)/rect.height)*zoomCanvas.height/16); if(tool==='pen'&&isDrawing&&e.buttons===1){ const gx=Math.floor(px/8), gy=Math.floor(py/8), slot=gy*gridW+gx, ti=selectedTiles[slot]; if(ti===undefined) return; const lx=px%8, ly=py%8, off=ti*16; const sh=7-lx; if(activeSlot&1) chrBuffer[off+ly]|=1<<sh; else chrBuffer[off+ly]&=~(1<<sh); if(activeSlot>>1&1) chrBuffer[off+ly+8]|=1<<sh; else chrBuffer[off+ly+8]&=~(1<<sh); renderAll(); } else if(['line','rect','circle'].includes(tool)&&toolStart){ toolPreviewEnd={x:px,y:py}; renderZoom(); } else if(tool==='copy'&&copyDrag&&copyDrag.active){ copyDrag.x1=px; copyDrag.y1=py; renderZoom(); } });
    window.addEventListener('mouseup', ()=>{ isDrawing=false; if(copyDrag&&copyDrag.active){ copyDrag.active=false; doCopy(copyDrag.x0, copyDrag.y0, copyDrag.x1, copyDrag.y1); renderZoom(); copyDrag=null; } });
  }

  function findEmptyTile(){ const base=currentBank*256; for(let i=0;i<256;i++){ const ti=base+i; const off=ti*16; if(off+16>chrBuffer.length) break; let empty=true; for(let b=0;b<16;b++){ if(chrBuffer[off+b]!==0){ empty=false; break; } } if(empty) return ti; } return null; }
  function newTile(){ const empty=findEmptyTile(); let target=empty!==null?empty:currentBank*256; chrBuffer.fill(0, target*16, target*16+16); gridW=1; gridH=1; selectedTiles=[target]; activeSlotIdx=0; currentBank=Math.floor(target/256); renderAll(); updateLabels(); }
  function saveMetatile(){ const name=prompt(`Nome:`, `metatile_${metatiles.length+1}_${gridW}x${gridH}_PT${currentBank}`); if(!name) return; const id='mt_'+Date.now(); const mt={ id, name:name.trim(), w:gridW, h:gridH, tiles:[...selectedTiles], bank:currentBank, palette:activePal, created:Date.now() }; metatiles.push(mt); updateMetatileSelect(); renderAll(); }
  function loadSelectedMetatile(){ const sel=document.getElementById('metatileSelect'); if(!sel||!sel.value) return; const mt=metatiles.find(m=>m.id===sel.value); if(!mt) return; gridW=mt.w; gridH=mt.h; selectedTiles=[...mt.tiles]; currentBank=mt.bank||0; activePal=mt.palette||0; activeSlotIdx=0; renderAll(); updateLabels(); }
  function onMetatileSelectChange(){ loadSelectedMetatile(); }
  function deleteMetatile(){ const sel=document.getElementById('metatileSelect'); if(!sel||!sel.value) return; metatiles=metatiles.filter(m=>m.id!==sel.value); updateMetatileSelect(); renderAll(); }
  function updateMetatileSelect(){ const sel=document.getElementById('metatileSelect'); const countEl=document.getElementById('lblMetatileCount'); if(countEl) countEl.textContent=metatiles.length; if(!sel) return; const cur=sel.value; sel.innerHTML='<option value="">— Metatiles —</option>'; metatiles.forEach(mt=>{ const o=document.createElement('option'); o.value=mt.id; o.textContent=`${mt.name} (${mt.w}x${mt.h}) PT${mt.bank||0}`; sel.appendChild(o); }); if(cur) sel.value=cur; renderMetatilePreview(); }

  function setToolImpl(t){ tool=t; toolStart=null; toolPreviewEnd=null; if(copyDrag) copyDrag.active=false; try{ document.querySelectorAll('.tool-btn').forEach(b=>{ b.classList.toggle('active', b.dataset.tool===t); if(b.dataset.tool===t){ b.style.background='#ffcc00'; b.style.color='#000'; } else { b.style.background=''; b.style.color=''; } }); }catch(e){} renderAll(); }
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
      initPalUI();
      renderAll();
      updateLabels();
      console.log('Default novo.chr carregado automaticamente');
    }catch(e){
      console.log('Não foi possível carregar assets/novo.chr:', e.message);
    }
  }

  return {
    init(){ buildHTML(); setTimeout(()=>tryLoadDefaultCHR(), 100); },
    loadBuffer(buf, pals){ let newBuf = buf.length>=8192?buf:(()=>{let n=new Uint8Array(8192); n.set(buf); return n;})(); const hasData = newBuf.some(b=>b!==0); if(!hasData){ console.log('Buffer vazio recebido, mantendo atual e tentando carregar novo.chr'); tryLoadDefaultCHR(); } else { chrBuffer = newBuf; } if(pals) palettes=pals.map(p=>[...p]); if(!document.getElementById('sheetCanvas')) buildHTML(); else { updateBankSelect(); initPalUI(); updateMetatileSelect(); renderAll(); } },
    getBuffer(){ return chrBuffer; }, getPalettes(){ return palettes; }, getMetatiles(){ return [...metatiles]; }, loadMetatiles(arr){ metatiles = Array.isArray(arr)?[...arr]:[]; updateMetatileSelect(); renderAll(); },
    renderAll(){ renderSheet(); renderZoom(); renderQuickTileSelector(); renderMetatilePreview(); }, setGrid(w,h){ gridW=w; gridH=h; const first=selectedTiles[0]||currentBank*256; selectedTiles=[]; for(let i=0;i<w*h;i++) selectedTiles.push(first+i); activeSlotIdx=0; if(zoomCanvas){ zoomCanvas.width=w*8*16; zoomCanvas.height=h*8*16; } renderAll(); updateLabels(); },
    addBank(){ const nb=new Uint8Array(chrBuffer.length+8192); nb.set(chrBuffer); chrBuffer=nb; updateBankSelect(); renderAll(); },
    autoFill(){ const s=selectedTiles[0]||currentBank*256; for(let i=0;i<selectedTiles.length;i++) selectedTiles[i]=s+i; activeSlotIdx=0; renderAll(); updateLabels(); },
    clearSelection(){ gridW=1; gridH=1; selectedTiles=[selectedTiles[0]||currentBank*256]; activeSlotIdx=0; renderAll(); updateLabels(); },
    flipH(){ const M=getMatrix(); for(let y=0;y<M.length;y++) M[y].reverse(); pushUndo(); setMatrix(M); },
    flipV(){ const M=getMatrix(); M.reverse(); pushUndo(); setMatrix(M); },
    rotate(){ const M=getMatrix(), h=M.length, w=M[0].length, n=Array.from({length:w},()=>Array(h).fill(0)); for(let y=0;y<h;y++) for(let x=0;x<w;x++) n[x][h-1-y]=M[y][x]; gridW=h; gridH=w; pushUndo(); setMatrix(n); },
    shift(dir){ const M=getMatrix(), h=M.length, w=M[0].length, n=Array.from({length:h},()=>Array(w).fill(0)); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ let ny=y,nx=x; if(dir==='left') nx=(x+1)%w; if(dir==='right') nx=(x+w-1)%w; if(dir==='up') ny=(y+1)%h; if(dir==='down') ny=(y+h-1)%h; n[y][x]=M[ny][nx]; } pushUndo(); setMatrix(n); },
    clearGroup(){ pushUndo(); selectedTiles.forEach(ti=>chrBuffer.fill(0,ti*16,ti*16+16)); renderAll(); },
    undo(){ if(undoStack.length){ chrBuffer=undoStack.pop(); renderAll(); } },
    importCHR(){ document.getElementById('importCHR_internal')?.click(); },
    saveMetatile, loadSelectedMetatile, deleteMetatile, updateMetatileSelect, onMetatileSelectChange, newTile, findEmptyTile,
    setTool(t){ setToolImpl(t); }
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

