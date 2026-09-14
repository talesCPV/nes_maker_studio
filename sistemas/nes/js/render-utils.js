// RENDER UTILS v1.0 - Funções compartilhadas de desenho de nametable/thumbnail
// Usado por build-rom.js, level-design.js e qualquer outro módulo que precise desenhar uma
// prévia fiel de uma tela (background/splash) num canvas. Carregar logo após core.js.
const RENDER_UTILS = (() => {

  // Detecta qual paleta é realmente usada pelos pixels "transparentes" (índice de cor 0
  // dentro do próprio desenho do CHR, não o índice do tile) na nametable. É essa paleta -
  // não necessariamente a paleta 0 do array - que define a cor universal de fundo ($3F00)
  // no hardware real do PPU: todo pixel de índice 0, não importa a paleta selecionada pelo
  // atributo, sempre mostra a cor gravada em $3F00. Por isso olhamos o PIXEL (dado real do
  // CHR), não o índice do tile - o céu pode ser um tile "de verdade" (índice != 0) cujo
  // desenho é todo em branco (cor 0 em todo pixel).
  function computeBackdropColor(nt, at, pals, chrBuf){
    const counts = {};
    for(let ty=0; ty<30; ty++) for(let tx=0; tx<32; tx++){
      const tileIdx = nt[ty*32+tx]||0;
      const off = tileIdx*16; if(off+16>chrBuf.length) continue;
      const attrX=Math.floor(tx/2), attrY=Math.floor(ty/2), blockX=Math.floor(attrX/2), blockY=Math.floor(attrY/2);
      const attrIdx=blockY*8+blockX; const attrByte=at[attrIdx]||0;
      const subX=attrX%2, subY=attrY%2; const shift=(subY*2+subX)*2; const palIdx=(attrByte>>shift)&0x03;
      for(let py=0; py<8; py++){
        const p0=chrBuf[off+py], p1=chrBuf[off+py+8];
        for(let px=0; px<8; px++){
          const sh=7-px, b0=(p0>>sh)&1, b1=(p1>>sh)&1, ci=(b1<<1)|b0;
          if(ci===0) counts[palIdx]=(counts[palIdx]||0)+1;
        }
      }
    }
    let bestPal=0, bestCount=-1;
    for(const k in counts){ if(counts[k]>bestCount){ bestCount=counts[k]; bestPal=parseInt(k); } }
    const pal = pals[bestPal]||pals[0]||[15,0,16,48];
    return { color: (pal[0]!=null?pal[0]:15), palIdx: bestPal, count: Math.max(bestCount,0) };
  }

  // Desenha uma nametable completa (32x30 tiles) num canvas de qualquer tamanho, escalando
  // automaticamente e respeitando a cor universal de fundo do PPU (ver computeBackdropColor
  // acima). Essa é a função central: qualquer módulo que precise mostrar uma tela (preview
  // grande do Build ROM, miniatura no Level Design, etc.) deve chamar essa mesma função, pra
  // nunca mais divergir do que a ROM compilada realmente mostra.
  function drawNametableToCanvas(canvas, nt, at, chrBuf, pals){
    if(!canvas || !nt) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    at = at || new Array(64).fill(0);
    chrBuf = chrBuf || new Uint8Array(8192);
    pals = pals || [[15,0,16,48]];

    const backdrop = computeBackdropColor(nt, at, pals, chrBuf);
    const backdropHex = (typeof NES_PALETTE !== 'undefined' && NES_PALETTE[backdrop.color]) ? NES_PALETTE[backdrop.color] : '#000000';
    ctx.fillStyle = backdropHex;
    ctx.fillRect(0, 0, w, h);

    const scaleX = w / 256, scaleY = h / 240;
    for (let ty = 0; ty < 30; ty++) {
      for (let tx = 0; tx < 32; tx++) {
        const tileIdx = nt[ty * 32 + tx] || 0;
        const off = tileIdx * 16;
        if (off + 16 > chrBuf.length) continue;
        const attrX = Math.floor(tx / 2), attrY = Math.floor(ty / 2);
        const blockX = Math.floor(attrX / 2), blockY = Math.floor(attrY / 2);
        const attrIdx = blockY * 8 + blockX;
        const attrByte = at[attrIdx] || 0;
        const subX = attrX % 2, subY = attrY % 2;
        const shift = (subY * 2 + subX) * 2;
        const palIdx = (attrByte >> shift) & 0x03;
        const pal = pals[palIdx] || pals[0];
        for (let py = 0; py < 8; py++) {
          const p0 = chrBuf[off + py], p1 = chrBuf[off + py + 8];
          for (let px = 0; px < 8; px++) {
            const sh = 7 - px, b0 = (p0 >> sh) & 1, b1 = (p1 >> sh) & 1, ci = (b1 << 1) | b0;
            if (ci === 0) continue; // já coberto pela cor de fundo universal pintada acima
            const nesColor = pal[ci];
            const colorHex = (typeof NES_PALETTE !== 'undefined' && NES_PALETTE[nesColor]) ? NES_PALETTE[nesColor] : '#FFFFFF';
            ctx.fillStyle = colorHex;
            ctx.fillRect(Math.floor((tx * 8 + px) * scaleX), Math.floor((ty * 8 + py) * scaleY), Math.ceil(scaleX), Math.ceil(scaleY));
          }
        }
      }
    }
  }

  // Atalho: desenha a miniatura de um objeto salvo (background ou splash), buscando o CHR e
  // as paletas atuais do projeto automaticamente. É isso que a maioria dos módulos vai chamar.
  function drawAssetThumbnail(canvas, assetObj){
    if(!canvas || !assetObj || !assetObj.nametable) return;
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : new Uint8Array(8192);
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : [[15,0,16,48]];
    drawNametableToCanvas(canvas, assetObj.nametable, assetObj.attributes || new Array(64).fill(0), chrBuf, pals);
  }

  return { computeBackdropColor, drawNametableToCanvas, drawAssetThumbnail };
})();
