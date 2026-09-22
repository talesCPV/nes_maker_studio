/**
 * sistemas/megadrive/js/render-utils.js
 * Equivalente NES render-utils.js mas 4bpp Mega Drive VDP
 */
(function(){
  function cramToRgb888(cram){
    let r = (cram & 0x07);
    let g = (cram>>4) & 0x07;
    let b = (cram>>8) & 0x07;
    r = (r<<5)|(r<<2)|(r>>1);
    g = (g<<5)|(g<<2)|(g>>1);
    b = (b<<5)|(b<<2)|(b>>1);
    return [r,g,b];
  }
  function rgb888ToCram(r,g,b){
    return ((b>>5)<<8)|((g>>5)<<4)|(r>>5);
  }
  function cramToCss(cram){
    const [r,g,b]=cramToRgb888(cram);
    return `rgb(${r},${g},${b})`;
  }
  function decodeMdTile(bytes, offset){
    const px=[];
    for(let y=0;y<8;y++){
      const row=[];
      for(let b=0;b<4;b++){
        const byte=bytes[offset+y*4+b];
        row.push((byte>>4)&0x0F); row.push(byte&0x0F);
      }
      px.push(row);
    }
    return px;
  }
  function encodeMdTile(pixels, bytes, offset){
    let idx=0;
    for(let y=0;y<8;y++) for(let x=0;x<8;x+=2) bytes[offset+idx++]=((pixels[y][x]&0x0F)<<4)|(pixels[y][x+1]&0x0F);
  }
  function drawTile(ctx, bytes, off, dx, dy, scale, paletteCss){
    for(let y=0;y<8;y++) for(let xb=0;xb<4;xb++){
      const b=bytes[off+y*4+xb];
      const l=(b>>4)&0x0F, r=b&0x0F;
      ctx.fillStyle=paletteCss[l]||'#000';
      ctx.fillRect(dx+xb*2*scale, dy+y*scale, scale, scale);
      ctx.fillStyle=paletteCss[r]||'#000';
      ctx.fillRect(dx+(xb*2+1)*scale, dy+y*scale, scale, scale);
    }
  }
  window.MDRenderUtils={cramToRgb888,rgb888ToCram,cramToCss,decodeMdTile,encodeMdTile,drawTile};
  window.RenderUtils=window.MDRenderUtils;
})();
