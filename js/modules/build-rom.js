// BUILD ROM v0.7.0 - Splash + Background Selecionados + ca65 Correto
const BUILD = (() => {
  let lastROM = null;
  let lastASM = "";
  function buildHTML(){
    const root = document.getElementById('mod-build'); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:10px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#4ec9b0">🔨 BUILD ROM v0.7.0 • Splash/Background • ca65</h3>
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
              <h4 style="font-size:10px;color:#888;margin-bottom:6px">FASE, TIPO DE IMAGEM E ITEM</h4>
              <select id="buildPhaseSelect" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px;margin-bottom:6px"></select>
              <select id="buildImageTypeSelect" style="width:100%;background:#000;color:#ffcc00;border:1px solid #665500;border-radius:4px;padding:5px;font-size:11px;margin-bottom:6px">
                <option value="splash">🖼️ Splash Screen</option>
                <option value="background">🗺️ Background</option>
              </select>
              <select id="buildImageSelect" style="width:100%;background:#000;color:#ffcc00;border:1px solid #665500;border-radius:4px;padding:5px;font-size:11px"></select>
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
    const typeSel=document.getElementById('buildImageTypeSelect');
    const imgSel=document.getElementById('buildImageSelect');
    if(!phaseSel||!typeSel||!imgSel) return;
    const phases=Project.data?.phases||[];
    phaseSel.innerHTML='';
    phases.forEach((p,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=`Fase ${i+1}: ${p.name}`; phaseSel.appendChild(o); });
    if(phases.length===0){ const o=document.createElement('option'); o.textContent='Nenhuma fase'; phaseSel.appendChild(o); }

    refreshImageSelect();

    phaseSel.onchange=()=>{ updateInfo(); renderPreview(); };
    typeSel.onchange=()=>{ refreshImageSelect(); updateInfo(); renderPreview(); };
    imgSel.onchange=()=>{ updateInfo(); renderPreview(); };
  }
  function refreshImageSelect(){
    const typeSel=document.getElementById('buildImageTypeSelect');
    const imgSel=document.getElementById('buildImageSelect');
    if(!typeSel||!imgSel) return;
    const type=typeSel.value;
    const splashes=Project.data?.splashScreens||[];
    const bgs=Project.data?.backgrounds||[];
    imgSel.innerHTML='';
    const optAuto=document.createElement('option'); optAuto.value='auto';
    optAuto.textContent = type==='background' ? '— Auto: background da fase / 1º BG —' : '— Auto: splash da fase / 1ª splash —';
    imgSel.appendChild(optAuto);
    const list = type==='background' ? bgs : splashes;
    list.forEach((item,i)=>{
      const o=document.createElement('option'); o.value=i;
      const filled = item.nametable ? item.nametable.filter(t=>t!==0).length : 0;
      const defaultName = type==='background' ? `BG ${i+1}` : `Splash ${i+1}`;
      o.textContent = `${item.name||defaultName} (${filled} tiles)`;
      imgSel.appendChild(o);
    });
    if(list.length===0){
      const o=document.createElement('option'); o.disabled=true;
      o.textContent = type==='background' ? 'Nenhum background cadastrado' : 'Nenhuma splash cadastrada';
      imgSel.appendChild(o);
    }
  }
  function getSelectedBuildData(){
    const phaseSel=document.getElementById('buildPhaseSelect');
    const typeSel=document.getElementById('buildImageTypeSelect');
    const imgSel=document.getElementById('buildImageSelect');
    const phases=Project.data?.phases||[];
    const splashes=Project.data?.splashScreens||[];
    const bgs=Project.data?.backgrounds||[];
    let targetPhase = phases[0];
    if(phaseSel && !isNaN(parseInt(phaseSel.value)) && phases[parseInt(phaseSel.value)]) targetPhase=phases[parseInt(phaseSel.value)];

    const type = typeSel ? typeSel.value : 'splash';
    let imageData=null, sourceName='';

    // 1) Seleção manual explícita do usuário (Splash OU Background, conforme o tipo escolhido)
    if(imgSel && imgSel.value!=='auto'){
      const idx=parseInt(imgSel.value);
      if(type==='background' && !isNaN(idx) && bgs[idx]){
        imageData={ nametable:[...bgs[idx].nametable], attributes:[...bgs[idx].attributes], name: bgs[idx].name || `BG ${idx+1}` };
        sourceName=`Background "${imageData.name}" (manual)`;
      } else if(type==='splash' && !isNaN(idx) && splashes[idx]){
        imageData={ nametable:[...splashes[idx].nametable], attributes:[...splashes[idx].attributes], name: splashes[idx].name };
        sourceName=`Splash "${imageData.name}" (manual)`;
      }
    }

    // 2) Auto: splash vinculada à fase selecionada
    if(!imageData && type==='splash' && targetPhase && targetPhase.splash){
      const found=splashes.find(s=>s.name===targetPhase.splash);
      if(found){ imageData={ nametable:[...found.nametable], attributes:[...found.attributes], name:found.name }; sourceName=`Splash "${found.name}" da fase "${targetPhase.name}"`; }
    }

    // 2b) Auto: background vinculado à fase selecionada (se o projeto guardar essa referência)
    if(!imageData && type==='background' && targetPhase && targetPhase.background){
      const found=bgs.find(b=>b.name===targetPhase.background);
      if(found){ imageData={ nametable:[...found.nametable], attributes:[...found.attributes], name:found.name }; sourceName=`Background "${found.name}" da fase "${targetPhase.name}"`; }
    }

    // 3) Fallback: primeiro item do tipo escolhido
    if(!imageData && type==='splash' && splashes.length>0){
      imageData={ nametable:[...splashes[0].nametable], attributes:[...splashes[0].attributes], name:splashes[0].name };
      sourceName=`Primeiro splash "${imageData.name}"`;
    }
    if(!imageData && type==='background' && bgs.length>0){
      imageData={ nametable:[...bgs[0].nametable], attributes:[...bgs[0].attributes], name: bgs[0].name || 'BG 1' };
      sourceName=`Primeiro background "${imageData.name}"`;
    }

    // 4) Fallback cruzado: se o tipo escolhido estiver vazio, tenta o outro tipo
    if(!imageData){
      if(splashes.length>0){ imageData={ nametable:[...splashes[0].nametable], attributes:[...splashes[0].attributes], name:splashes[0].name }; sourceName=`Fallback: splash "${imageData.name}"`; }
      else if(bgs.length>0){ imageData={ nametable:[...bgs[0].nametable], attributes:[...bgs[0].attributes], name: bgs[0].name || 'BG 1' }; sourceName=`Fallback: background "${imageData.name}"`; }
    }

    // 5) Fallback final: BG atual do editor em memória
    if(!imageData){
      if(typeof BG!=='undefined' && BG.getNametable){
        try{ const nt=BG.getNametable(); const at=BG.getAttributes(); if(nt && nt.filter(t=>t!==0).length>0) imageData={ nametable:nt, attributes:at, name:'BG atual' }; }catch(e){}
      }
    }
    if(!imageData) imageData={ nametable:new Array(960).fill(0), attributes:new Array(64).fill(0), name:'vazio' };
    if(!sourceName) sourceName=imageData.name;

    return { ...imageData, sourceName, phase:targetPhase, type, filled: imageData.nametable.filter(t=>t!==0).length };
  }
  function updateInfo(){
    const info=document.getElementById('buildInfo');
    const details=document.getElementById('buildPhaseDetails');
    if(!info) return;
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const data=getSelectedBuildData();
    const typeLabel = data.type==='background' ? 'Background' : 'Splash';
    const packed=packBackgroundCHR(chrBuf, data.nametable);
    let overflowWarn = '';
    if(packed.overflowCount>0) overflowWarn = `<br><span style="color:#ff5555">⚠ ${packed.overflowCount} tile(s) a mais não cabem em 256 e virarão vazio</span>`;
    info.innerHTML=`<b style="color:#ffcc00">[${typeLabel}] ${data.sourceName||data.name}</b><br>CHR: ${chrBuf.length} bytes<br>Tiles na tela: ${data.filled}/960<br>Tiles únicos usados: ${packed.usedCount}/256${overflowWarn}`;
    if(details && data.phase) details.innerHTML=`Fase: ${data.phase.name}<br>Gravity: ${data.phase.gravity}<br>Mapper: ${data.phase.mapper}`;
  }
  function renderPreview(){
    const canvas=document.getElementById('buildPreviewCanvas'); if(!canvas) return;
    const ctx=canvas.getContext('2d'); ctx.fillStyle="#000"; ctx.fillRect(0,0,256,240);
    const data=getSelectedBuildData(); const nt=data.nametable; const at=data.attributes;
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const pals=CHR.getPalettes?CHR.getPalettes():[[15,0,16,48]];
    const universalBackdrop = (pals[0]&&pals[0][0]!=null) ? pals[0][0] : 15;
    for(let ty=0;ty<30;ty++) for(let tx=0;tx<32;tx++){
      const tileIdx=nt[ty*32+tx]||0; const off=tileIdx*16; if(off+16>chrBuf.length) continue;
      const attrX=Math.floor(tx/2), attrY=Math.floor(ty/2); const blockX=Math.floor(attrX/2), blockY=Math.floor(attrY/2); const attrIdx=blockY*8+blockX; const attrByte=at[attrIdx]||0; const subX=attrX%2, subY=attrY%2; const shift=(subY*2+subX)*2; const palIdx=(attrByte>>shift)&0x03; const pal=pals[palIdx]||pals[0];
      for(let py=0;py<8;py++){ const p0=chrBuf[off+py], p1=chrBuf[off+py+8]; for(let px=0;px<8;px++){ const sh=7-px, b0=(p0>>sh)&1, b1=(p1>>sh)&1, ci=(b1<<1)|b0;
        // No hardware do NES, o índice de cor 0 de QUALQUER paleta de BG sempre mostra a
        // cor universal de fundo ($3F00 / paleta 0, cor 0) - não a cor 0 da paleta escolhida
        // pelo atributo. Reproduzimos isso aqui pra bater exatamente com a ROM compilada.
        const nesColor = ci===0 ? universalBackdrop : pal[ci];
        ctx.fillStyle=NES_PALETTE[nesColor]; ctx.fillRect(tx*8+px, ty*8+py, 1,1); } }
    }
  }
  function log(m){ const el=document.getElementById('buildLog'); if(el){ el.textContent+="\n"+m; el.scrollTop=el.scrollHeight; } }

  // Reempacota os tiles REALMENTE usados pela imagem (nametable) num banco de padrões
  // dedicado de até 256 tiles, não importa se no editor eles vieram da pg-0 ou da pg-1
  // (índices 0-255 ou 256-511 do CHR original). Isso resolve a limitação de hardware do
  // NES, que só permite UMA página de 256 tiles ativa por vez para o background: em vez
  // de descartar metade do desenho, colocamos só os tiles usados (deduplicados) nessa
  // única página, e remapeamos a nametable para apontar pros novos índices 0-255.
  function packBackgroundCHR(chrBuf, nt){
    const mapping = new Map();
    const usedTiles = [];
    mapping.set(0, 0); usedTiles.push(0); // índice 0 sempre reservado (tile "vazio")
    const overflow = new Set();
    for (const raw of nt) {
      const orig = raw || 0;
      if (mapping.has(orig)) continue;
      if (usedTiles.length >= 256) { overflow.add(orig); continue; }
      mapping.set(orig, usedTiles.length);
      usedTiles.push(orig);
    }
    const bgChr = new Uint8Array(4096);
    usedTiles.forEach((origIdx, newIdx) => {
      const srcOff = origIdx * 16;
      if (srcOff + 16 <= chrBuf.length) bgChr.set(chrBuf.subarray(srcOff, srcOff + 16), newIdx * 16);
    });
    const remappedNt = nt.map(t => mapping.get(t || 0) ?? 0);
    return { bgChr, remappedNt, usedCount: usedTiles.length, overflowCount: overflow.size };
  }

  function generateASM(){
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const pals=CHR.getPalettes?CHR.getPalettes():[[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]];
    const data=getSelectedBuildData(); const nt=data.nametable; const at=data.attributes;
    const paletteBytes=[]; for(let p=0;p<8;p++){ const pal=pals[p]||[15,0,16,48]; for(let c=0;c<4;c++) paletteBytes.push(pal[c]||0); }
    // Espelhamento de hardware do PPU: o índice de cor 0 de TODAS as paletas (BG e sprite)
    // é fisicamente o mesmo endereço $3F00 - não dá pra ter cores 0 diferentes por paleta.
    // Forçamos os bytes aqui pra refletir a realidade da ROM (evita confusão ao inspecionar).
    const universalBackdrop = paletteBytes[0];
    [4,8,12,16,20,24,28].forEach(i => { paletteBytes[i] = universalBackdrop; });

    // Reempacota os tiles usados (de qualquer página original) num único banco de 256 tiles.
    const packed = packBackgroundCHR(chrBuf, nt);
    const packedNt = packed.remappedNt;

    const L=[];
    L.push('; NES Game Maker - Gerado por BUILD ROM v0.7.0');
    L.push(`; Imagem selecionada: [${data.type==='background'?'Background':'Splash'}] ${data.sourceName||data.name}`);
    L.push(`; CHR do background reempacotado: ${packed.usedCount}/256 tiles usados (pg-0 e pg-1 originais combinados em uma unica pagina)`);
    if(packed.overflowCount>0) L.push(`; AVISO: ${packed.overflowCount} tile(s) distinto(s) a mais nao couberam nos 256 slots e foram substituidos por tile vazio (0).`);
    L.push('.segment "HEADER"');
    L.push('  .byte $4E,$45,$53,$1A,1,1,0,0,0,0,0,0,0,0,0,0');
    L.push('');
    L.push('.segment "ZEROPAGE"');
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
    L.push(`  ; Load Nametable ($2000) - Imagem selecionada: ${data.type==='background'?'Background':'Splash'} "${data.name}" - 960 bytes em 4 blocos`);
    L.push('  BIT $2002');
    L.push('  LDA #$20');
    L.push('  STA $2006');
    L.push('  LDA #$00');
    L.push('  STA $2006');
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
    L.push('  ; Reset do scroll ($2005) - OBRIGATORIO apos usar $2006/$2007 pra carregar VRAM,');
    L.push('  ; senao o PPU comeca a renderizar com o endereco/scroll "sujo" da ultima escrita,');
    L.push('  ; causando uma linha/coluna de lixo no topo ou lateral da tela.');
    L.push('  BIT $2002');
    L.push('  LDA #$00');
    L.push('  STA $2005');
    L.push('  STA $2005');
    L.push('');
    L.push(`  ; Enable Rendering (pg0/$0000 = sprites, pg1/$1000 = background reempacotado)`);
    L.push(`  LDA #%10010000`);
    L.push('  STA $2000');
    L.push('  LDA #%00011110');
    L.push('  STA $2001');
    L.push('');
    L.push('Forever:');
    L.push('  JMP Forever');
    L.push('');
    L.push('; OBS: cor 0 de cada paleta = sempre a cor universal de fundo ($3F00), por limitacao do PPU.');
    L.push('PaletteData:');
    for (let i = 0; i < paletteBytes.length; i += 16) {
      const chunk = paletteBytes.slice(i, i + 16).map(b => '$' + b.toString(16).padStart(2, '0')).join(', ');
      L.push(`  .byte ${chunk}`);
    }
    L.push('');
    L.push('NametableData:');
    for (let i = 0; i < packedNt.length; i += 32) {
      const row = packedNt.slice(i, i + 32).map(b => '$' + (b % 256).toString(16).padStart(2, '0')).join(', ');
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
    L.push('  ; Primeiros 4KB ($0000-$0FFF / pg-0): CHR original, sem alterações (sprites)');
    const chrFinal = new Uint8Array(8192);
    chrFinal.set(chrBuf.slice(0, 4096), 0); // mantém pg-0 original (sprites) intacta
    chrFinal.set(packed.bgChr, 4096); // banco reempacotado com os tiles usados por esta imagem
    for (let i = 0; i < chrFinal.length; i += 16) {
      if (i === 4096) L.push('  ; Últimos 4KB ($1000-$1FFF / pg-1): banco reempacotado com os tiles usados por esta imagem (background)');
      const chunk = Array.from(chrFinal.slice(i, i + 16)).map(b => '$' + b.toString(16).padStart(2, '0')).join(', ');
      L.push(`  .byte ${chunk}`);
    }
    return L.join('\n');
  }

  function buildROM(){
    const logEl=document.getElementById('buildLog'); if(logEl) logEl.textContent='Iniciando build v0.7.0...\n';
    try{
      const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
      const data=getSelectedBuildData();
      const packed=packBackgroundCHR(chrBuf, data.nametable);
      const chr8k=new Uint8Array(8192); chr8k.set(chrBuf.slice(0,4096),0); chr8k.set(packed.bgChr,4096);
      log(`Tipo: ${data.type==='background'?'Background':'Splash'} | Fonte: ${data.sourceName} - ${data.filled} tiles na tela`);
      log(`CHR reempacotado: ${packed.usedCount}/256 tiles únicos${packed.overflowCount>0?` (⚠ ${packed.overflowCount} não couberam e viraram vazio)`:''}`);
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
      document.getElementById('buildStats').innerHTML=`ROM: ${rom.length}<br>[${data.type==='background'?'Background':'Splash'}] ${data.name}<br>${data.filled}/960 tiles • ${packed.usedCount}/256 únicos<br><span style="color:#0f0">● OK v0.7.0</span>`;
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
