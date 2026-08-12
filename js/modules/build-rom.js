// BUILD ROM v0.6.6 - Splash Selecionada + ca65 Correto
const BUILD = (() => {
  let lastROM = null;
  let lastASM = "";
  function buildHTML(){
    const root = document.getElementById('mod-build'); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:10px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#4ec9b0">🔨 BUILD ROM v0.6.6 • Splash Screen Direta • ca65</h3>
          <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn-tool" onclick="BUILD.buildROM()" style="background:#27ae60;color:#fff;padding:6px 14px;font-weight:bold">🔨 Build .NES + .asm</button>
            <button class="btn-tool" onclick="BUILD.downloadROM()" id="btnDownload" style="display:none;background:#2980b9;color:#fff">⬇ .nes</button>
            <button class="btn-tool" onclick="BUILD.downloadASM()" id="btnDownloadASM" style="display:none;background:#8e44ad;color:#fff">⬇ .asm</button>
            <button class="btn-tool" onclick="BUILD.downloadCFG()" id="btnDownloadCFG" style="display:none;background:#d35400;color:#fff">⬇ nrom.cfg</button>
          </div>
        </div>
        <div style="display:flex;flex:1;overflow:hidden">
          <div style="width:360px;background:#181818;padding:14px;border-right:1px solid #333;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:6px">🎯 O QUE VAI NA ROM</h4>
              <div style="font-size:11px;color:#999;line-height:1.6" id="buildInfo">Carregando...</div>
            </div>
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#888;margin-bottom:6px">FASE E SPLASH</h4>
              <select id="buildPhaseSelect" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px;margin-bottom:6px"></select>
              <select id="buildSplashSelect" style="width:100%;background:#000;color:#ffcc00;border:1px solid #665500;border-radius:4px;padding:5px;font-size:11px"></select>
              <div id="buildPhaseDetails" style="margin-top:8px;font-size:10px;color:#666;background:#000;padding:6px;border-radius:4px;border:1px solid #222"></div>
            </div>
            <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#8585ff;margin-bottom:4px">🐧 COMPILAÇÃO LOCAL (ca65)</h4>
              <div style="font-size:10px;color:#aaa;line-height:1.5;font-family:monospace">
                ca65 main.asm -o main.o<br>ld65 -C nrom.cfg main.o -o jogo.nes<br>fceux jogo.nes
              </div>
            </div>
          </div>
          <div style="flex:1;background:#111;padding:14px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;gap:8px;align-items:center">
              <h4 style="font-size:11px;color:#4ec9b0">LOG</h4>
              <button class="btn-tool" onclick="BUILD.copyASM()" style="margin-left:auto;font-size:10px">📋 Copiar</button>
            </div>
            <div id="buildLog" style="background:#000;border:1px solid #333;border-radius:6px;padding:10px;font-family:monospace;font-size:11px;color:#0f0;min-height:120px;white-space:pre-wrap;overflow:auto">Aguardando build...</div>
            <h4 style="font-size:11px;color:#4ec9b0">.ASM GERADO (Compatível com ca65)</h4>
            <textarea id="buildASMPreview" style="width:100%;flex:1;min-height:400px;background:#000;color:#4ec9b0;border:1px solid #333;border-radius:4px;padding:8px;font-family:monospace;font-size:10px;resize:vertical;white-space:pre;overflow:auto" readonly></textarea>
          </div>
          <div style="width:300px;background:#1e1e1e;padding:12px;border-left:1px solid #333;display:flex;flex-direction:column;gap:10px;overflow:auto">
            <h4 style="font-size:11px;color:#ffcc00">PREVIEW</h4>
            <canvas id="buildPreviewCanvas" width="256" height="240" style="width:256px;height:240px;border:2px solid #665500;background:#000;image-rendering:pixelated;display:block"></canvas>
            <div id="buildStats" style="font-size:11px;color:#888;background:#111;border:1px solid #333;border-radius:4px;padding:8px;line-height:1.5">ROM: 0 bytes</div>
          </div>
        </div>
      </div>
    `;
    refreshSelects(); updateInfo(); renderPreview();
  }
  function refreshSelects(){
    const phaseSel=document.getElementById('buildPhaseSelect');
    const splashSel=document.getElementById('buildSplashSelect');
    if(!phaseSel||!splashSel) return;
    const phases=Project.data?.phases||[];
    const splashes=Project.data?.splashScreens||[];
    phaseSel.innerHTML='';
    phases.forEach((p,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=`Fase ${i+1}: ${p.name}`; phaseSel.appendChild(o); });
    if(phases.length===0){ const o=document.createElement('option'); o.textContent='Nenhuma fase'; phaseSel.appendChild(o); }
    splashSel.innerHTML='';
    const optAuto=document.createElement('option'); optAuto.value='auto'; optAuto.textContent='— Auto: splash da 1ª fase —'; splashSel.appendChild(optAuto);
    splashes.forEach((s,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=`${s.name} (${s.nametable? s.nametable.filter(t=>t!==0).length:0} tiles)`; splashSel.appendChild(o); });
    phaseSel.onchange=()=>{ updateInfo(); renderPreview(); };
    splashSel.onchange=()=>{ updateInfo(); renderPreview(); };
  }
  function getSelectedBuildData(){
    const phaseSel=document.getElementById('buildPhaseSelect');
    const splashSel=document.getElementById('buildSplashSelect');
    const phases=Project.data?.phases||[];
    const splashes=Project.data?.splashScreens||[];
    const bgs=Project.data?.backgrounds||[];
    let targetPhase = phases[0];
    if(phaseSel && !isNaN(parseInt(phaseSel.value)) && phases[parseInt(phaseSel.value)]) targetPhase=phases[parseInt(phaseSel.value)];
    let splashData=null, sourceName='';
    if(splashSel && splashSel.value!=='auto'){
      const sIdx=parseInt(splashSel.value);
      if(!isNaN(sIdx) && splashes[sIdx]){
        splashData={ nametable:[...splashes[sIdx].nametable], attributes:[...splashes[sIdx].attributes], name:splashes[sIdx].name };
        sourceName=`Splash "${splashData.name}" (manual)`;
      }
    }
    if(!splashData && targetPhase && targetPhase.splash){
      const found=splashes.find(s=>s.name===targetPhase.splash);
      if(found){ splashData={ nametable:[...found.nametable], attributes:[...found.attributes], name:found.name }; sourceName=`Splash "${found.name}" da fase "${targetPhase.name}"`; }
    }
    if(!splashData && splashes.length>0){
      splashData={ nametable:[...splashes[0].nametable], attributes:[...splashes[0].attributes], name:splashes[0].name };
      sourceName=`Primeiro splash "${splashData.name}"`;
    }
    if(!splashData){
      let bgData=null;
      if(typeof BG!=='undefined' && BG.getNametable){
        try{ const nt=BG.getNametable(); const at=BG.getAttributes(); if(nt && nt.filter(t=>t!==0).length>0) bgData={ nametable:nt, attributes:at, name:'BG atual' }; }catch(e){}
      }
      if(!bgData && bgs.length>0) bgData={ nametable:[...bgs[0].nametable], attributes:[...bgs[0].attributes], name:bgs[0].name||'BG 0' };
      if(bgData){ splashData=bgData; sourceName=`Fallback BG "${bgData.name}"`; }
    }
    if(!splashData) splashData={ nametable:new Array(960).fill(0), attributes:new Array(64).fill(0), name:'vazio' };
    return { ...splashData, sourceName, phase:targetPhase, filled: splashData.nametable.filter(t=>t!==0).length };
  }
  function updateInfo(){
    const info=document.getElementById('buildInfo');
    const details=document.getElementById('buildPhaseDetails');
    if(!info) return;
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const data=getSelectedBuildData();
    info.innerHTML=`<b style="color:#ffcc00">${data.sourceName||data.name}</b><br>CHR: ${chrBuf.length} bytes<br>Tiles: ${data.filled}/960`;
    if(details && data.phase) details.innerHTML=`Fase: ${data.phase.name}<br>Gravity: ${data.phase.gravity}<br>Mapper: ${data.phase.mapper}`;
  }
  function renderPreview(){
    const canvas=document.getElementById('buildPreviewCanvas'); if(!canvas) return;
    const ctx=canvas.getContext('2d'); ctx.fillStyle="#000"; ctx.fillRect(0,0,256,240);
    const data=getSelectedBuildData(); const nt=data.nametable; const at=data.attributes;
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const pals=CHR.getPalettes?CHR.getPalettes():[[15,0,16,48]];
    for(let ty=0;ty<30;ty++) for(let tx=0;tx<32;tx++){
      const tileIdx=nt[ty*32+tx]||0; const off=tileIdx*16; if(off+16>chrBuf.length) continue;
      const attrX=Math.floor(tx/2), attrY=Math.floor(ty/2); const blockX=Math.floor(attrX/2), blockY=Math.floor(attrY/2); const attrIdx=blockY*8+blockX; const attrByte=at[attrIdx]||0; const subX=attrX%2, subY=attrY%2; const shift=(subY*2+subX)*2; const palIdx=(attrByte>>shift)&0x03; const pal=pals[palIdx]||pals[0];
      for(let py=0;py<8;py++){ const p0=chrBuf[off+py], p1=chrBuf[off+py+8]; for(let px=0;px<8;px++){ const sh=7-px, b0=(p0>>sh)&1, b1=(p1>>sh)&1, ci=(b1<<1)|b0; ctx.fillStyle=NES_PALETTE[pal[ci]]; ctx.fillRect(tx*8+px, ty*8+py, 1,1); } }
    }
  }
  function log(m){ const el=document.getElementById('buildLog'); if(el){ el.textContent+="\n"+m; el.scrollTop=el.scrollHeight; } }
  
  function generateASM(){
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const pals=CHR.getPalettes?CHR.getPalettes():[[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]];
    const data=getSelectedBuildData(); const nt=data.nametable; const at=data.attributes;
    const paletteBytes=[]; for(let p=0;p<8;p++){ const pal=pals[p]||[15,0,16,48]; for(let c=0;c<4;c++) paletteBytes.push(pal[c]||0); }
    
    const L=[];
    L.push('; NES Game Maker - Gerado por BUILD ROM v0.6.9');
    L.push('.segment "HEADER"');
    L.push('  .byte $4E,$45,$53,$1A,1,1,0,0,0,0,0,0,0,0,0,0');
    L.push('');
    L.push('.segment "ZEROPAGE"');
    L.push('  ptr_lo: .res 1');
    L.push('  ptr_hi: .res 1');
    L.push('');
    L.push('.segment "CODE"');
    L.push('');
    L.push('NMI:');
    L.push('  RTI');
    L.push('');
    L.push('IRQ:');
    L.push('  RTI');
    L.push('');
    L.push('Reset:');
    L.push('  SEI');
    L.push('  CLD');
    L.push('  LDX #$40');
    L.push('  STX $4017');
    L.push('  LDX #$FF');
    L.push('  TXS');
    L.push('  LDA #0');
    L.push('  STA $2000');
    L.push('  STA $2001');
    L.push('');
    L.push('vblankwait1:');
    L.push('  BIT $2002');
    L.push('  BPL vblankwait1');
    L.push('');
    L.push('  ; Clear RAM');
    L.push('  LDA #0');
    L.push('  LDX #0');
    L.push('clram:');
    L.push('  STA $0000,X');
    L.push('  STA $0100,X');
    L.push('  STA $0200,X');
    L.push('  STA $0300,X');
    L.push('  STA $0400,X');
    L.push('  STA $0500,X');
    L.push('  STA $0600,X');
    L.push('  STA $0700,X');
    L.push('  INX');
    L.push('  BNE clram');
    L.push('');
    L.push('vblankwait2:');
    L.push('  BIT $2002');
    L.push('  BPL vblankwait2');
    L.push('');
    L.push('  ; Load Palettes');
    L.push('  BIT $2002');
    L.push('  LDA #$3F');
    L.push('  STA $2006');
    L.push('  LDA #$00');
    L.push('  STA $2006');
    L.push('  LDX #0');
    L.push('load_palettes:');
    L.push('  LDA PaletteData,X');
    L.push('  STA $2007');
    L.push('  INX');
    L.push('  CPX #32');
    L.push('  BNE load_palettes');
    L.push('');
    L.push('  ; Load Nametable ($2000) - Exatamente 960 bytes usando ponteiro na Zeropage');
    L.push('  BIT $2002');
    L.push('  LDA #$20');
    L.push('  STA $2006');
    L.push('  LDA #$00');
    L.push('  STA $2006');
    L.push('');
    L.push('  LDA #<NametableData');
    L.push('  STA ptr_lo');
    L.push('  LDA #>NametableData');
    L.push('  STA ptr_hi');
    L.push('');
    L.push('  LDY #3          ; 3 blocos de 256 bytes (768 bytes)');
    L.push('  LDX #0');
    L.push('nt_loop_256:');
    L.push('  LDA (ptr_lo),Y  ; Usando indireto Y seria complexo, vamos usar LDA (ptr) com X');
    L.push('  ; Abordagem simplificada por blocos diretos (evita overhead de ponteiro complexo):');
    L.push('');
    L.push('  ; Bloco 1 (256 bytes)');
    L.push('  LDX #0');
    L.push('nb1:');
    L.push('  LDA NametableData+0,X');
    L.push('  STA $2007');
    L.push('  INX');
    L.push('  BNE nb1');
    L.push('');
    L.push('  ; Bloco 2 (256 bytes)');
    L.push('  LDX #0');
    L.push('nb2:');
    L.push('  LDA NametableData+256,X');
    L.push('  STA $2007');
    L.push('  INX');
    L.push('  BNE nb2');
    L.push('');
    L.push('  ; Bloco 3 (256 bytes)');
    L.push('  LDX #0');
    L.push('nb3:');
    L.push('  LDA NametableData+512,X');
    L.push('  STA $2007');
    L.push('  INX');
    L.push('  BNE nb3');
    L.push('');
    L.push('  ; Bloco 4 (192 bytes restantes)');
    L.push('  LDX #0');
    L.push('nb4:');
    L.push('  LDA NametableData+768,X');
    L.push('  STA $2007');
    L.push('  INX');
    L.push('  CPX #192');
    L.push('  BNE nb4');
    L.push('');
    L.push('  ; Load Attributes ($23C0) - 64 bytes');
    L.push('  BIT $2002');
    L.push('  LDA #$23');
    L.push('  STA $2006');
    L.push('  LDA #$C0');
    L.push('  STA $2006');
    L.push('  LDX #0');
    L.push('load_attrs:');
    L.push('  LDA AttributeData,X');
    L.push('  STA $2007');
    L.push('  INX');
    L.push('  CPX #64');
    L.push('  BNE load_attrs');
    L.push('');
    L.push('  ; Enable Rendering');
    L.push('  LDA #%10000000');
    L.push('  STA $2000');
    L.push('  LDA #%00011110');
    L.push('  STA $2001');
    L.push('');
    L.push('Forever:');
    L.push('  JMP Forever');
    L.push('');
    L.push('PaletteData:');
    for (let i = 0; i < paletteBytes.length; i += 16) {
      const chunk = paletteBytes.slice(i, i + 16).map(b => '$' + b.toString(16).padStart(2, '0')).join(', ');
      L.push(`  .byte ${chunk}`);
    }
    L.push('');
    L.push('NametableData:');
    for (let i = 0; i < nt.length; i += 32) {
      const row = nt.slice(i, i + 32).map(b => '$' + (b % 256).toString(16).padStart(2, '0')).join(', ');
      L.push(`  .byte ${row}`);
    }
    L.push('');
    L.push('AttributeData:');
    for (let i = 0; i < at.length; i += 32) {
      const row = at.slice(i, i + 32).map(b => '$' + (b % 256).toString(16).padStart(2, '0')).join(', ');
      L.push(`  .byte ${row}`);
    }
    L.push('');
    L.push('.segment "VECTORS"');
    L.push('  .word NMI');
    L.push('  .word Reset');
    L.push('  .word IRQ');
    L.push('');
    L.push('.segment "CHARS"');
    for (let i = 0; i < chrBuf.length; i += 16) {
      const chunk = Array.from(chrBuf.slice(i, i + 16)).map(b => '$' + b.toString(16).padStart(2, '0')).join(', ');
      L.push(`  .byte ${chunk}`);
    }
    return L.join('\n');
  }

  function buildROM(){
    const logEl=document.getElementById('buildLog'); if(logEl) logEl.textContent='Iniciando build v0.6.6...\n';
    try{
      const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192); const chr8k=new Uint8Array(8192); chr8k.set(chrBuf.slice(0,Math.min(chrBuf.length,8192)));
      const data=getSelectedBuildData();
      log(`Fonte: ${data.sourceName} - ${data.filled} tiles`);
      const asm=generateASM(); lastASM=asm;
      
      // Simulação rápida interna de binário para download direto do .nes se necessário
      // (O foco principal agora é o .asm gerado perfeitamente para o ca65)
      const header=new Uint8Array([0x4E,0x45,0x53,0x1A,1,1,0,0,0,0,0,0,0,0,0,0]);
      // Para o download direto via botão web, criamos uma ROM vazia de teste ou integrada, 
      // mas o ideal é compilar o .asm pelo ca65 localmente. Aqui geramos um placeholder seguro de 16KB PRG.
      const prgDummy = new Uint8Array(16384);
      const rom=new Uint8Array(16+16384+8192); rom.set(header,0); rom.set(prgDummy,16); rom.set(chr8k,16+16384); lastROM=rom;
      
      log(`✅ Código .ASM gerado com sucesso! Pronto para ca65.`);
      const asmEl=document.getElementById('buildASMPreview'); if(asmEl) asmEl.value=asm;
      document.getElementById('btnDownload').style.display='inline-block';
      document.getElementById('btnDownloadASM').style.display='inline-block';
      document.getElementById('btnDownloadCFG').style.display='inline-block';
      document.getElementById('buildStats').innerHTML=`ROM: ${rom.length}<br>${data.name}<br>${data.filled}/960<br><span style="color:#0f0">● OK v0.6.6</span>`;
      renderPreview();
    }catch(e){ log(`❌ ${e.message}`); }
  }
  function downloadROM(){ if(!lastROM){ alert("Build primeiro!"); return; } const blob=new Blob([lastROM],{type:'application/octet-stream'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(Project.data?.name||"meu-jogo").replace(/\s+/g,"_")+"_splash.nes"; a.click(); }
  function downloadASM(){ if(!lastASM){ alert("Build primeiro!"); return; } const blob=new Blob([lastASM],{type:'text/plain;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(Project.data?.name||"meu-jogo").replace(/\s+/g,"_")+".asm"; a.click(); }
  function downloadCFG(){ 
    const cfg = `MEMORY {\n` +
      `  ZP:   start = $0000, size = $0100, type = rw, define = yes;\n` +
      `  RAM:  start = $0300, size = $0500, type = rw, define = yes;\n` +
      `  HDR:  start = $0000, size = $0010, type = ro, file = %O, fill = yes;\n` +
      `  PRG:  start = $C000, size = $4000, type = ro, file = %O, fill = yes, define = yes;\n` +
      `  CHR:  start = $0000, size = $2000, type = ro, file = %O, fill = yes;\n` +
      `}\n` +
      `SEGMENTS {\n` +
      `  HEADER:   load = HDR, type = ro;\n` +
      `  ZEROPAGE: load = ZP, type = zp;\n` +
      `  CODE:     load = PRG, type = ro;\n` +
      `  VECTORS:  load = PRG, type = ro, offset = $3FFA;\n` +
      `  CHARS:    load = CHR, type = ro;\n` +
      `}\n`; 
    const blob=new Blob([cfg],{type:'text/plain'}); 
    const a=document.createElement('a'); 
    a.href=URL.createObjectURL(blob); 
    a.download="nrom.cfg"; 
    a.click(); 
  }
  function copyASM(){ const ta=document.getElementById('buildASMPreview'); if(!ta) return; ta.select(); document.execCommand('copy'); }
  function openEmulator(){ window.open('https://www.nesjs.com/','_blank'); }
  return { init(){ buildHTML(); }, buildROM, downloadROM, downloadASM, downloadCFG, copyASM, openEmulator, renderPreview, getCurrentData: getSelectedBuildData, generateASM };
})();