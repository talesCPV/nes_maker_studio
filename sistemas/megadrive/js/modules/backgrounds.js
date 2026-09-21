/**
 * sistemas/megadrive/js/modules/backgrounds.js
 * V1 - CLONE DO NES backgrounds.js - ADAPTADO PARA MEGA DRIVE
 * Mesma dinâmica do NES para curva de aprendizado zero
 * - NES: nametable 32x30 com metatiles 2x2
 * - MD: Plane A/B 64x32 com metatiles 2x2 (16x16) ou NxM, 4bpp
 * - UI idêntica: paleta de metatiles à esquerda, canvas do mapa no centro, tools
 */

(function(){
  let containerEl = null;
  let mapWidth = 64; // MD plane padrão 64 tiles (512px)
  let mapHeight = 32; // 32 tiles (256px)
  let mapData = []; // [y][x] = {metatileId, palette, hflip, vflip}
  let selectedMetatileId = null;
  let selectedPalette = 0;
  let selectedColor = 0; // V17 FIX: faltava selectedColor - causava ReferenceError na linha 362
  let tool = 'pen';
  let isDrawing = false;
  let showGrid = true;
  let currentPlane = 'A'; // Plane A ou B
  let metatilesList = []; // vem do graphics.js

  function getMetatiles(){
    // V14: SÓ 2x2 PARA BACKGROUNDS (padrão BES)
    let all = [];
    if(window.AppState && window.AppState.project && window.AppState.project.metatiles){
      all = window.AppState.project.metatiles;
    } else if(window.MDGraphics && window.MDGraphics.metatiles){
      all = window.MDGraphics.metatiles;
    } else {
      all = metatilesList;
    }
    // Filtra só 2x2
    const filtered = all.filter(mt=> mt.cols===2 && mt.rows===2);
    return filtered;
  }

  function getAllMetatiles(){
    // Para debug, pega todos
    if(window.AppState && window.AppState.project && window.AppState.project.metatiles){
      return window.AppState.project.metatiles;
    }
    return metatilesList;
  }

  function getTileData(){
    if(window.AppState && window.AppState.project && window.AppState.project.tiles){
      return window.AppState.project.tiles;
    }
    if(window.MDGraphics && window.MDGraphics.data){
      return window.MDGraphics.data;
    }
    return new Uint8Array(256*32);
  }

  function initMap(){
    if(mapData.length===0){
      // tenta carregar do projeto
      if(window.AppState && window.AppState.project && window.AppState.project.backgrounds){
        const bg = window.AppState.project.backgrounds;
        if(bg.map){ mapData = bg.map; mapWidth = bg.width||64; mapHeight = bg.height||32; return; }
      }
      // cria vazio
      mapData = Array.from({length:mapHeight}, ()=> Array.from({length:mapWidth}, ()=> null));
    }
  }

  function getPaletteCss(idx){
    const DEFAULT = ["#000000","#0000aa","#00aa00","#00aaaa","#aa0000","#aa00aa","#aa5500","#aaaaaa","#555555","#5555ff","#55ff55","#55ffff","#ff5555","#ff55ff","#ffff55","#ffffff"];
    if(window.AppState && window.AppState.palettes && window.AppState.palettes[idx]) return window.AppState.palettes[idx];
    return DEFAULT;
  }

  function render(){
    if(!containerEl) containerEl = document.getElementById('panel-maps') || document.getElementById('editor-content');
    if(!containerEl) return;
    initMap();
    // V18: Garante que metatiles do projeto estão disponíveis
    if(window.AppState && window.AppState.project && window.AppState.project.metatiles){
      metatilesList = window.AppState.project.metatiles;
    }
    const mtiles = getMetatiles();
    const tilesData = getTileData();
    const pal = getPaletteCss(selectedPalette);

    containerEl.innerHTML = `
      <div class="bg-editor-nes-clone">
        <!-- TOPBAR IDÊNTICA NES -->
        <div class="chr-tools-top">
          <div class="chr-tools-left">
            <span class="chr-tools-label">BACKGROUNDS - PLANE ${currentPlane}</span>
            <button class="chr-tbtn" data-action="newMap">📄 Novo</button>
            <button class="chr-tbtn" data-action="importMap">📁 Import</button>
            <button class="chr-tbtn" data-action="exportMap">📤 Export</button>
            <span class="chr-sep"></span>
            <label class="chr-check">Plane: 
              <select id="bg-plane-select" class="chr-select small">
                <option value="A" ${currentPlane==='A'?'selected':''}>Plane A</option>
                <option value="B" ${currentPlane==='B'?'selected':''}>Plane B</option>
              </select>
            </label>
            <label class="chr-check">W: <input id="bg-width" type="number" value="${mapWidth}" min="16" max="128" style="width:50px;background:#111;border:1px solid #444;color:#e8c36a;padding:2px 4px;"></label>
            <label class="chr-check">H: <input id="bg-height" type="number" value="${mapHeight}" min="16" max="64" style="width:50px;background:#111;border:1px solid #444;color:#e8c36a;padding:2px 4px;"></label>
            <button class="chr-btn small blue" id="bg-resize">Redimensionar</button>
          </div>
          <div class="chr-tools-right">
            <label class="chr-check"><input type="checkbox" id="bg-show-grid" ${showGrid?'checked':''}> grid</label>
            <span class="chr-fila">Metatiles 2x2: ${mtiles.length}/${getAllMetatiles().length} | Map: ${mapWidth}x${mapHeight} | PAG 1 BG</span>
          </div>
        </div>

        <div class="bg-main">
          <!-- PALETA DE METATILES À ESQUERDA - IGUAL NES -->
          <div class="bg-metatiles-palette">
            <div class="bg-palette-title">METATILES 2x2 - Só 2x2 (PAG 1 BG) - Clique para selecionar</div>
            <div class="bg-metatiles-grid" id="bg-metatiles-grid"></div>
            <div class="bg-palette-tools">
              <button class="chr-btn small" data-action="clearMap">🗑️ Limpar Mapa</button>
              <button class="chr-btn small" data-action="fillMap">🪣 Preencher com selecionado</button>
            </div>
          </div>

          <!-- CANVAS DO MAPA NO CENTRO - IGUAL NES -->
          <div class="bg-map-wrap">
            <canvas id="bg-map-canvas" class="bg-map-canvas"></canvas>
          </div>

          <!-- TOOLS À DIREITA - IGUAL NES -->
          <div class="bg-tools-panel">
            <div class="chr-preview-title">FERRAMENTAS</div>
            <div class="bg-tools-grid">
              <button class="chr-tool-btn ${tool==='pen'?'active':''}" data-tool="pen" title="Pen">✏️</button>
              <button class="chr-tool-btn ${tool==='eraser'?'active':''}" data-tool="eraser" title="Eraser">🧹</button>
              <button class="chr-tool-btn ${tool==='picker'?'active':''}" data-tool="picker" title="Picker">💉</button>
              <button class="chr-tool-btn ${tool==='fill'?'active':''}" data-tool="fill" title="Fill">🪣</button>
            </div>
            <div class="bg-tools-section">
              <div class="bg-tools-title">PROPRIEDADES DO TILE</div>
              <label class="chr-check"><input type="checkbox" id="bg-hflip"> H-Flip</label>
              <label class="chr-check"><input type="checkbox" id="bg-vflip"> V-Flip</label>
              <label class="chr-check">Paleta: 
                <select id="bg-palette" class="chr-select small">
                  <option value="0" ${selectedPalette===0?'selected':''}>Pal 0</option>
                  <option value="1" ${selectedPalette===1?'selected':''}>Pal 1</option>
                  <option value="2" ${selectedPalette===2?'selected':''}>Pal 2</option>
                  <option value="3" ${selectedPalette===3?'selected':''}>Pal 3</option>
                </select>
              </label>
            </div>
            <div class="bg-tools-section">
              <div class="bg-tools-title">MINIMAPA</div>
              <canvas id="bg-minimap" width="128" height="64" style="background:#000;border:1px solid #444;width:128px;height:64px;image-rendering:pixelated;"></canvas>
            </div>
          </div>
        </div>

        <div class="chr-status-blue">
          <span>Plane ${currentPlane} - ${mapWidth}x${mapHeight} - Metatile: ${selectedMetatileId||'—'} - Tool: ${tool} | MD VDP Plane 64x32</span>
          <span style="margin-left:auto;">${mapWidth*mapHeight} cells | ${mtiles.length} metatiles</span>
        </div>

        <div class="chr-palettes-bar">
          <div class="chr-palettes-title">▼ Paletas (4x16 - CRAM 9-bit) - Usadas no mapa</div>
          <div class="chr-palettes-content" id="bg-palettes"></div>
        </div>
      </div>
    `;

    // RENDER METATILES PALETTE (ESQUERDA)
    const mtGrid = containerEl.querySelector('#bg-metatiles-grid');
    mtGrid.innerHTML='';
    if(mtiles.length===0){
      const allMts = getAllMetatiles();
      if(allMts.length===0){
        mtGrid.innerHTML='<div style="padding:12px;color:#666;font-size:11px;">Nenhum metatile criado.<br>Vá em CHR Editor > PAG 1 Backgrounds > New (2x2)</div>';
      } else if(mtiles.length===0){
        mtGrid.innerHTML='<div style="padding:12px;color:#e8c36a;font-size:11px;">Nenhum metatile 2x2 encontrado.<br>Você tem '+allMts.length+' metatiles, mas só 2x2 aparecem aqui.<br>Vá em CHR Editor > PAG 1 > crie 2x2.<br>Atuais: '+allMts.map(m=>m.name+' '+m.cols+'x'+m.rows).join(', ')+'</div>';
      }
    } else {
      mtiles.forEach(mt=>{
        const cell = document.createElement('div');
        cell.className='bg-metatile-cell'+(mt.id===selectedMetatileId?' selected':'');
        const c = document.createElement('canvas');
        c.width = mt.cols*16;
        c.height = mt.rows*16;
        c.style.width = (mt.cols*24)+'px';
        c.style.height = (mt.rows*24)+'px';
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled=false;
        // desenha metatile
        mt.tiles.forEach((tileIdx, idx)=>{
          const col = idx % mt.cols;
          const row = Math.floor(idx / mt.cols);
          const off = tileIdx*32;
          for(let y=0;y<8;y++) for(let xb=0;xb<4;xb++){
            const b = tilesData[off+y*4+xb];
            const l=(b>>4)&0x0F, r=b&0x0F;
            ctx.fillStyle=pal[l]||'#000'; ctx.fillRect(col*8*2 + xb*2*2, row*8*2 + y*2, 2,2);
            ctx.fillStyle=pal[r]||'#000'; ctx.fillRect(col*8*2 + (xb*2+1)*2, row*8*2 + y*2, 2,2);
          }
        });
        cell.appendChild(c);
        const label = document.createElement('div');
        label.className='bg-metatile-label';
        label.textContent = mt.name;
        cell.appendChild(label);
        cell.onclick=()=>{ selectedMetatileId=mt.id; render(); };
        mtGrid.appendChild(cell);
      });
    }

    // RENDER MAP CANVAS
    const mapCanvas = containerEl.querySelector('#bg-map-canvas');
    if(mapCanvas){
      // Cada metatile tem cols x rows tiles, cada tile 8px
      // Para simplificar, vamos renderizar metatile como 16x16 (2x2) = escala
      const metatilePixelSize = 16; // cada metatile 16px no mapa (2 tiles)
      const scale = 2; // zoom
      mapCanvas.width = mapWidth * metatilePixelSize * scale;
      mapCanvas.height = mapHeight * metatilePixelSize * scale;
      mapCanvas.style.width = mapCanvas.width+'px';
      mapCanvas.style.height = mapCanvas.height+'px';
      const ctx = mapCanvas.getContext('2d');
      ctx.imageSmoothingEnabled=false;
      ctx.fillStyle='#111';
      ctx.fillRect(0,0,mapCanvas.width, mapCanvas.height);

      // desenha grid e metatiles colocados
      for(let y=0;y<mapHeight;y++){
        for(let x=0;x<mapWidth;x++){
          const cell = mapData[y] && mapData[y][x];
          const px = x * metatilePixelSize * scale;
          const py = y * metatilePixelSize * scale;
          if(cell && cell.metatileId){
            const mt = mtiles.find(m=>m.id===cell.metatileId);
            if(mt){
              // desenha metatile no mapa
              mt.tiles.forEach((tileIdx, idx)=>{
                const col = idx % mt.cols;
                const row = Math.floor(idx / mt.cols);
                const off = tileIdx*32;
                for(let ty=0;ty<8;ty++) for(let xb=0;xb<4;xb++){
                  const b = tilesData[off+ty*4+xb];
                  const l=(b>>4)&0x0F, r=b&0x0F;
                  const palIdx = cell.palette!==undefined ? cell.palette : 0;
                  const palCss = getPaletteCss(palIdx);
                  ctx.fillStyle=palCss[l]||'#000';
                  ctx.fillRect(px + (col*8 + xb*2)*scale, py + (row*8 + ty)*scale, scale, scale);
                  ctx.fillStyle=palCss[r]||'#000';
                  ctx.fillRect(px + (col*8 + xb*2+1)*scale, py + (row*8 + ty)*scale, scale, scale);
                }
              });
            }
          }
          if(showGrid){
            ctx.strokeStyle='rgba(255,255,255,0.06)';
            ctx.lineWidth=0.5;
            ctx.strokeRect(px, py, metatilePixelSize*scale, metatilePixelSize*scale);
          }
        }
      }

      // Interação: pintar metatile no mapa
      mapCanvas.onmousedown=(e)=>{
        isDrawing=true;
        const rect = mapCanvas.getBoundingClientRect();
        const scaleX = mapCanvas.width / rect.width;
        const scaleY = mapCanvas.height / rect.height;
        const mx = (e.clientX-rect.left)*scaleX;
        const my = (e.clientY-rect.top)*scaleY;
        const gx = Math.floor(mx / (metatilePixelSize*scale));
        const gy = Math.floor(my / (metatilePixelSize*scale));
        if(gx>=0 && gx<mapWidth && gy>=0 && gy<mapHeight){
          if(tool==='eraser'){
            if(mapData[gy]) mapData[gy][gx]=null;
          } else if(tool==='pen' && selectedMetatileId){
            if(!mapData[gy]) mapData[gy]=[];
            const hflip = containerEl.querySelector('#bg-hflip')?.checked||false;
            const vflip = containerEl.querySelector('#bg-vflip')?.checked||false;
            mapData[gy][gx]={ metatileId:selectedMetatileId, palette:selectedPalette, hflip, vflip };
          }
          if(window.AppState){
            window.AppState.project.backgrounds = { width:mapWidth, height:mapHeight, map:mapData, plane:currentPlane };
            window.AppState.markDirty();
          }
          render();
        }
      };
      mapCanvas.onmousemove=(e)=>{
        if(!isDrawing) return;
        const rect = mapCanvas.getBoundingClientRect();
        const scaleX = mapCanvas.width / rect.width;
        const scaleY = mapCanvas.height / rect.height;
        const mx = (e.clientX-rect.left)*scaleX;
        const my = (e.clientY-rect.top)*scaleY;
        const gx = Math.floor(mx / (metatilePixelSize*scale));
        const gy = Math.floor(my / (metatilePixelSize*scale));
        if(gx>=0 && gx<mapWidth && gy>=0 && gy<mapHeight){
          if(tool==='eraser'){
            if(mapData[gy]) mapData[gy][gx]=null;
          } else if(tool==='pen' && selectedMetatileId){
            if(!mapData[gy]) mapData[gy]=[];
            mapData[gy][gx]={ metatileId:selectedMetatileId, palette:selectedPalette };
          }
          render();
        }
      };
      mapCanvas.onmouseup=()=>{ isDrawing=false; };
      mapCanvas.onmouseleave=()=>{ isDrawing=false; };
    }

    // MINIMAPA
    const mini = containerEl.querySelector('#bg-minimap');
    if(mini){
      const ctx = mini.getContext('2d');
      ctx.fillStyle='#000'; ctx.fillRect(0,0,128,64);
      // desenha simplificado
      for(let y=0;y<Math.min(mapHeight,32);y++){
        for(let x=0;x<Math.min(mapWidth,64);x++){
          const cell = mapData[y] && mapData[y][x];
          if(cell){
            ctx.fillStyle = cell.metatileId ? '#00ff88' : '#333';
            ctx.fillRect(x*2, y*2, 2,2);
          }
        }
      }
    }

    // EVENTS
    const planeSel = containerEl.querySelector('#bg-plane-select');
    if(planeSel) planeSel.onchange=(e)=>{ currentPlane=e.target.value; render(); };
    const wInput = containerEl.querySelector('#bg-width');
    const hInput = containerEl.querySelector('#bg-height');
    const resizeBtn = containerEl.querySelector('#bg-resize');
    if(resizeBtn) resizeBtn.onclick=()=>{
      const nw = parseInt(wInput.value)||64;
      const nh = parseInt(hInput.value)||32;
      // redimensiona preservando dados
      const newMap = Array.from({length:nh}, (_,y)=> Array.from({length:nw}, (_,x)=> (mapData[y] && mapData[y][x])||null));
      mapData=newMap; mapWidth=nw; mapHeight=nh;
      if(window.AppState){ window.AppState.project.backgrounds={width:nw,height:nh,map:mapData,plane:currentPlane}; window.AppState.markDirty(); }
      render();
    };
    const gridChk = containerEl.querySelector('#bg-show-grid');
    if(gridChk) gridChk.onchange=(e)=>{ showGrid=e.target.checked; render(); };
    const palSel = containerEl.querySelector('#bg-palette');
    if(palSel) palSel.onchange=(e)=>{ selectedPalette=parseInt(e.target.value); render(); };

    containerEl.querySelectorAll('[data-tool]').forEach(btn=>{
      btn.onclick=()=>{ tool=btn.dataset.tool; containerEl.querySelectorAll('[data-tool]').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); };
    });
    containerEl.querySelectorAll('[data-action]').forEach(btn=>{
      const act=btn.dataset.action;
      if(act==='clearMap'){ btn.onclick=()=>{ if(confirm('Limpar mapa?')){ mapData=Array.from({length:mapHeight},()=>Array(mapWidth).fill(null)); if(window.AppState){ window.AppState.project.backgrounds={width:mapWidth,height:mapHeight,map:mapData}; window.AppState.markDirty(); } render(); } }; }
      if(act==='fillMap'){ btn.onclick=()=>{ if(!selectedMetatileId){ alert('Selecione um metatile'); return; } for(let y=0;y<mapHeight;y++) for(let x=0;x<mapWidth;x++) mapData[y][x]={metatileId:selectedMetatileId, palette:selectedPalette}; if(window.AppState){ window.AppState.project.backgrounds={width:mapWidth,height:mapHeight,map:mapData}; window.AppState.markDirty(); } render(); }; }
    });

    // Paletas
    const palFull = containerEl.querySelector('#bg-palettes');
    if(palFull){
      palFull.innerHTML='';
      for(let p=0;p<4;p++){
        const row=document.createElement('div'); row.className='chr-palette-full-row';
        const palCss=getPaletteCss(p);
        palCss.forEach((col,idx)=>{
          const sw=document.createElement('div'); sw.className='chr-palette-full-swatch'+(p===selectedPalette && idx===selectedColor?' selected':''); sw.style.background=col; row.appendChild(sw);
        });
        palFull.appendChild(row);
      }
    }
  }

  function init(container, projectData){
    if(container) containerEl=container;
    if(projectData && projectData.backgrounds){
      mapData=projectData.backgrounds.map||[];
      mapWidth=projectData.backgrounds.width||64;
      mapHeight=projectData.backgrounds.height||32;
      currentPlane=projectData.backgrounds.plane||'A';
    } else if(window.AppState && window.AppState.project && window.AppState.project.backgrounds){
      mapData=window.AppState.project.backgrounds.map||[];
      mapWidth=window.AppState.project.backgrounds.width||64;
      mapHeight=window.AppState.project.backgrounds.height||32;
      currentPlane=window.AppState.project.backgrounds.plane||'A';
    } else {
      initMap();
    }
    if(projectData && projectData.metatiles) metatilesList=projectData.metatiles;
    render();
  }

  const mod={ init, render, get data(){ return {width:mapWidth,height:mapHeight,map:mapData,plane:currentPlane}; }, set data(v){ if(v.map){ mapData=v.map; mapWidth=v.width; mapHeight=v.height; currentPlane=v.plane||'A'; render(); } } };
  window.MDBackgrounds=mod;
  window.MDMaps=mod; // alias
  window.MDModules=window.MDModules||{}; window.MDModules.backgrounds=mod; window.MDModules.maps=mod;
  if(window.MDCore && window.MDCore.registerModule){
    window.MDCore.registerModule('backgrounds', mod);
    window.MDCore.registerModule('maps', mod); // FIX V12 - maps alias para abrir
  }
  if(window.AppState){
    window.AppState.registerModule('backgrounds', mod);
    window.AppState.registerModule('maps', mod);
  }
})();
