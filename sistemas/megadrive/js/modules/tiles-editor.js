/**
 * sistemas/megadrive/js/modules/tiles-editor.js
 * Mega Drive Tiles / Pattern Editor - 4bpp (32 bytes/tile)
 * Compatible UI with NES chr-editor.js
 * Depends: window.MDProject | window.AppState event bus
 * Author: RetroCompiler - NES Maker Studio
 * 
 * FORMATO MEGA DRIVE:
 * - 8x8 pixels, 4bpp, 16 cores por tile
 * - 32 bytes por tile (4 bytes por linha)
 * - Packing: cada byte = 2 pixels, high nibble = pixel esquerdo
 * - Exemplo linha: [P0 P1][P2 P3][P4 P5][P6 P7]
 * - CRAM: 9-bit BGR (0BBB0GGG0RRR) -> 512 cores, 4 paletas x 16
 */
(function(){
  const BYTES_PER_TILE = 32;
  const TILE_W = 8, TILE_H = 8;
  const TILES_COUNT = 256; // 1 bank = 8192 bytes

  // Uint8Array(8192) - 256 tiles * 32 bytes
  let chrData = new Uint8Array(TILES_COUNT * BYTES_PER_TILE);
  let selectedTile = 0;
  let selectedPalette = 0;
  let selectedColor = 1;
  let tool = 'brush';
  let clipboard = null;
  let isDrawing = false;

  const MD = window.MDProject || window.AppState || window.core;
  let palettes = [];

  function mdTileToCanvas(bytes, offset, ctx, scale, palette) {
    // 4bpp packed: cada linha 4 bytes, cada byte = 2 pixels
    for(let y=0;y<8;y++){
      for(let xb=0; xb<4; xb++){
        const b = bytes[offset + y*4 + xb];
        const left = (b >> 4) & 0x0F;
        const right = b & 0x0F;
        ctx.fillStyle = palette[left] || '#000';
        ctx.fillRect((xb*2)*scale, y*scale, scale, scale);
        ctx.fillStyle = palette[right] || '#000';
        ctx.fillRect((xb*2+1)*scale, y*scale, scale, scale);
      }
    }
  }

  function canvasToMdTile(pixels, outBytes, offset) {
    let idx = 0;
    for(let y=0;y<8;y++){
      for(let x=0;x<8;x+=2){
        const l = pixels[y][x] & 0x0F;
        const r = pixels[y][x+1] & 0x0F;
        outBytes[offset + idx++] = (l<<4)|r;
      }
    }
  }

  function cramToRgb(cram) {
    // 0BBB0GGG0RRR - 9 bits
    const r = (cram & 0x07) * 36; // 0-7 -> 0-252 approx, scale to 0-255
    const g = ((cram >> 4) & 0x07) * 36;
    const b = ((cram >> 8) & 0x07) * 36;
    return `rgb(${r},${g},${b})`;
  }

  function rgbToCram(r,g,b) {
    const rr = Math.round(r/36) & 0x07;
    const gg = Math.round(g/36) & 0x07;
    const bb = Math.round(b/36) & 0x07;
    return (bb<<8) | (gg<<4) | rr;
  }

  function getTilePixels(tileIndex) {
    const off = tileIndex*BYTES_PER_TILE;
    const tile = [];
    for(let y=0;y<8;y++){
      const row=[];
      for(let b=0;b<4;b++){
        const byte = chrData[off+y*4+b];
        row.push((byte>>4)&0x0F);
        row.push(byte&0x0F);
      }
      tile.push(row);
    }
    return tile;
  }

  function setPixel(tileIndex, x, y, color) {
    const off = tileIndex*BYTES_PER_TILE + y*4 + Math.floor(x/2);
    const b = chrData[off];
    if(x%2===0) chrData[off] = (color<<4) | (b & 0x0F);
    else chrData[off] = (b & 0xF0) | (color & 0x0F);
    MD?.emit && MD.emit('tile:update', { tileIndex, x, y, color });
    if(window.AppState?.markDirty) window.AppState.markDirty();
  }

  function flipH(tileIndex){
    const p = getTilePixels(tileIndex);
    const flipped = p.map(r=>[...r].reverse());
    canvasToMdTile(flipped, chrData, tileIndex*32);
    render();
  }
  function flipV(tileIndex){
    const p = getTilePixels(tileIndex);
    canvasToMdTile([...p].reverse(), chrData, tileIndex*32);
    render();
  }
  function rotate90(tileIndex){
    const p = getTilePixels(tileIndex);
    const out = Array.from({length:8},()=>Array(8).fill(0));
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) out[x][7-y]=p[y][x];
    canvasToMdTile(out, chrData, tileIndex*32);
    render();
  }
  function shift(tileIndex, dx, dy){
    const p = getTilePixels(tileIndex);
    const out = Array.from({length:8},()=>Array(8).fill(0));
    for(let y=0;y<8;y++) for(let x=0;x<8;x++) out[(y+dy+8)%8][(x+dx+8)%8]=p[y][x];
    canvasToMdTile(out, chrData, tileIndex*32);
    render();
  }

  function importBinary(buffer){
    const bytes = new Uint8Array(buffer);
    chrData.set(bytes.slice(0, Math.min(bytes.length, chrData.length)));
    MD?.emit && MD.emit('tiles:import', { size: bytes.length });
    render();
  }

  function exportBinary(){
    return chrData.slice().buffer;
  }

  function render(){
    const grid = document.querySelector('.tiles-grid');
    const canvas = document.querySelector('.pixel-canvas');
    const status = document.querySelector('.status-tile-idx');
    if(status) status.textContent = '$'+selectedTile.toString(16).toUpperCase().padStart(2,'0')+' / '+selectedTile;
    if(!grid||!canvas) return;

    // thumbs
    grid.innerHTML = '';
    const palette = (MD?.palettes?.[selectedPalette]) || palettes[selectedPalette] || [];
    for(let i=0;i<TILES_COUNT;i++){
      const btn = document.createElement('button');
      btn.className = 'tiles-thumb'+(i===selectedTile?' selected':'');
      const c = document.createElement('canvas');
      c.width=32; c.height=32;
      const ctx=c.getContext('2d');
      mdTileToCanvas(chrData, i*32, ctx, 4, palette.length?palette:["#000","#222","#444","#666","#888","#aaa","#ccc","#fff","#f00","#0f0","#00f","#ff0","#0ff","#f0f","#fa0","#a0f"]);
      btn.appendChild(c);
      btn.onclick=()=>{ selectedTile=i; window.dispatchEvent(new CustomEvent('md:tileSelect',{detail:{index:i}})); render(); };
      grid.appendChild(btn);
    }

    // main canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const pal = (MD?.palettes?.[selectedPalette]) || palettes[selectedPalette] || ["#000","#111","#333","#555","#f00","#f55","#faa","#fdd","#fff","#ccf","#88f","#44f","#0ff","#0f8","#fe0","#f80"];
    mdTileToCanvas(chrData, selectedTile*32, ctx, canvas.width/8, pal);
  }

  function bindEvents(){
    document.querySelectorAll('.tool-btn').forEach(btn=>{
      btn.addEventListener('click', e=>{
        document.querySelector('.tool-btn.active')?.classList.remove('active');
        e.currentTarget.classList.add('active');
        tool = e.currentTarget.dataset.tool;
      });
    });

    const mainCanvas = document.querySelector('.pixel-canvas');
    if(mainCanvas){
      mainCanvas.addEventListener('mousedown', e=>{ isDrawing=true; handlePaint(e); });
      mainCanvas.addEventListener('mousemove', e=>{ if(isDrawing) handlePaint(e); });
      window.addEventListener('mouseup', ()=>{ isDrawing=false; });
    }

    function handlePaint(e){
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.floor((e.clientX-rect.left)/(rect.width/8));
      const y = Math.floor((e.clientY-rect.top)/(rect.height/8));
      if(x<0||x>=8||y<0||y>=8) return;
      if(tool==='eyedropper'){
        const p = getTilePixels(selectedTile);
        selectedColor = p[y][x];
        document.querySelectorAll('.palette-swatch').forEach((s,i)=>{ s.classList.toggle('selected', i===selectedColor); });
      } else if(tool==='eraser'){
        setPixel(selectedTile, x, y, 0);
      } else if(tool==='fill'){
        const target = getTilePixels(selectedTile)[y][x];
        if(target===selectedColor) { render(); return; }
        const stack=[[x,y]]; const seen=new Set();
        while(stack.length){
          const [cx,cy]=stack.pop();
          const key=cx+','+cy;
          if(seen.has(key)) continue;
          seen.add(key);
          if(cx<0||cx>=8||cy<0||cy>=8) continue;
          const pix = getTilePixels(selectedTile)[cy][cx];
          if(pix!==target) continue;
          setPixel(selectedTile,cx,cy,selectedColor);
          stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
        }
      } else {
        setPixel(selectedTile, x, y, selectedColor);
      }
      render();
    }

    window.addEventListener('md:paletteChange', e=>{ selectedPalette=e.detail.index; render(); });
    window.addEventListener('md:tileSelect', e=>{ selectedTile=e.detail.index; render(); });
    window.addEventListener('md:colorSelect', e=>{ selectedColor=e.detail.index; });
  }

  function init(data, projectPalettes){
    if(projectPalettes) palettes = projectPalettes;
    if(data instanceof Uint8Array) chrData.set(data.slice(0, chrData.length));
    else if(data && data.buffer) chrData.set(new Uint8Array(data).slice(0, chrData.length));
    else if(MD?.project?.chr) chrData.set(MD.project.chr.slice(0, chrData.length));
    render();
    bindEvents();
    console.log('[MD Tiles] init 4bpp', chrData.length, 'bytes, tile', selectedTile);
  }

  window.MDTilesEditor = { init, render, bindEvents, importBinary, exportBinary, flipH, flipV, rotate90, shift, mdTileToCanvas, canvasToMdTile, cramToRgb, rgbToCram, get data(){return chrData;}, set data(v){chrData.set(v);} };
})();
