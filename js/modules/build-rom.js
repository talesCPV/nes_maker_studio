// BUILD ROM MODULE - Gera ROM .nes NROM testável com seu BG
const BUILD = (() => {
  let lastROM = null;

  function buildHTML(){
    const root = document.getElementById('mod-build');
    if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:10px 12px;background:#252526;border-bottom:1px solid #333">
          <h3 style="font-size:12px;color:#4ec9b0">🔨 BUILD ROM • NROM 32KB PRG + 8KB CHR • Teste seu background</h3>
          <div style="margin-left:auto;display:flex;gap:6px">
            <button class="btn-tool" onclick="BUILD.buildROM()" style="background:#27ae60;color:#fff;padding:6px 14px;font-weight:bold">🔨 Build .NES</button>
            <button class="btn-tool" onclick="BUILD.downloadROM()" id="btnDownload" style="display:none;background:#2980b9;color:#fff">⬇️ Baixar .nes</button>
          </div>
        </div>

        <div style="display:flex;flex:1;overflow:hidden">
          <!-- Left: Info -->
          <div style="width:340px;background:#181818;padding:14px;border-right:1px solid #333;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:6px">O QUE VAI NA ROM</h4>
              <div style="font-size:11px;color:#999;line-height:1.6" id="buildInfo">
                CHR: 8KB<br>
                BG: nenhum<br>
                Paletas: 32 bytes
              </div>
            </div>

            <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#8585ff;margin-bottom:4px">📋 COMO FUNCIONA</h4>
              <div style="font-size:10px;color:#aaa;line-height:1.5">
                1. Pega seu CHR do editor (8192 bytes)<br>
                2. Pega o background atual (nametable 960 + attribute 64)<br>
                3. Pega as 8 paletas (4 BG + 4 SPR)<br>
                4. Monta um PRG NROM mínimo que:<br>
                &nbsp;&nbsp;• Espera VBlank<br>
                &nbsp;&nbsp;• Carrega paletas em $3F00<br>
                &nbsp;&nbsp;• Carrega nametable em $2000<br>
                &nbsp;&nbsp;• Carrega attribute em $23C0<br>
                &nbsp;&nbsp;• Liga PPU ($2001=$1E)<br>
                &nbsp;&nbsp;• Loop infinito<br>
                5. Gera header iNES + PRG 16KB + CHR 8KB = 24KB ROM
              </div>
            </div>

            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#888;margin-bottom:4px">BG PARA BUILD</h4>
              <select id="buildBGSelect" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px"></select>
              <div style="font-size:10px;color:#666;margin-top:6px">Selecione qual BG vai pra ROM. Se nenhum, usa o que está sendo editado agora.</div>
            </div>

            <div style="background:#1a2a1a;border:1px solid #27ae60;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#27ae60;margin-bottom:4px">✅ COMPATIBILIDADE</h4>
              <div style="font-size:10px;color:#999">NROM-128 (mapper 0)<br>Funciona em: Mesen, FCEUX, Nestopia, Emuladores Web (JSNES)</div>
            </div>

            <button class="btn-tool" onclick="Project.exportCHR()" style="width:100%">Exportar só .CHR</button>
            <button class="btn-tool" onclick="Project.exportASM()" style="width:100%">Exportar .ASM completo</button>
          </div>

          <!-- Center: Log e Preview -->
          <div style="flex:1;background:#111;padding:14px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <h4 style="font-size:11px;color:#4ec9b0">LOG DE BUILD</h4>
            <div id="buildLog" style="background:#000;border:1px solid #333;border-radius:6px;padding:10px;font-family:monospace;font-size:11px;color:#0f0;min-height:200px;white-space:pre-wrap;overflow:auto">Aguardando build... Clique em "Build .NES"</div>
            
            <h4 style="font-size:11px;color:#4ec9b0;margin-top:8px">PREVIEW ASM GERADO (PRG)</h4>
            <textarea id="buildASMPreview" style="width:100%;height:260px;background:#000;color:#4ec9b0;border:1px solid #333;border-radius:4px;padding:8px;font-family:monospace;font-size:10px;resize:vertical" readonly>; PRG será gerado aqui</textarea>

            <div style="display:flex;gap:8px">
              <button class="btn-tool" onclick="BUILD.openEmulator()" style="background:#ffcc00;color:#000">🌐 Testar em emulador web</button>
              <span style="font-size:11px;color:#666;align-self:center">Baixe o .nes e arraste em https://www.nesjs.com ou Mesen</span>
            </div>
          </div>

          <!-- Right: Visual Preview -->
          <div style="width:300px;background:#1e1e1e;padding:12px;border-left:1px solid #333;display:flex;flex-direction:column;gap:10px">
            <h4 style="font-size:11px;color:#4ec9b0">PREVIEW VISUAL (como ficará no NES)</h4>
            <canvas id="buildPreviewCanvas" width="256" height="240" style="width:256px;height:240px;border:2px solid #333;background:#000;image-rendering:pixelated;display:block"></canvas>
            <div style="font-size:10px;color:#666">Renderiza usando mesmo CHR + paletas + nametable do build</div>
            <div id="buildStats" style="font-size:11px;color:#888;background:#111;border:1px solid #333;border-radius:4px;padding:8px;line-height:1.5">
              ROM: 0 bytes<br>
              PRG: 16384<br>
              CHR: 8192<br>
              Header: 16
            </div>
          </div>
        </div>
      </div>
    `;
    refreshBuildBGSelect();
    updateInfo();
    renderBuildPreview();
  }

  function refreshBuildBGSelect(){
    const sel = document.getElementById('buildBGSelect'); if(!sel) return;
    sel.innerHTML='';
    const optCurrent = document.createElement('option'); optCurrent.value='current'; optCurrent.textContent='— BG atual sendo editado —'; sel.appendChild(optCurrent);
    const bgs = Project.data?.backgrounds || [];
    bgs.forEach((bg,i)=>{
      const o=document.createElement('option'); o.value=i; o.textContent=bg.name||`BG ${i} (${bg.nametable?bg.nametable.filter(t=>t!==0).length:0} tiles)`;
      sel.appendChild(o);
    });
    sel.onchange=()=>{ updateInfo(); renderBuildPreview(); };
  }

  function getSelectedBGData(){
    const sel = document.getElementById('buildBGSelect');
    const val = sel ? sel.value : 'current';
    if(val==='current'){
      // Pega do BG module (tela atual)
      if(typeof BG!=='undefined' && BG.getCurrentData){
        return BG.getCurrentData();
      }
      // Fallback: tenta pegar nametable global
      return {
        nametable: (typeof BG!=='undefined' && BG.getNametable) ? BG.getNametable() : new Array(960).fill(0),
        attributes: (typeof BG!=='undefined' && BG.getAttributes) ? BG.getAttributes() : new Array(64).fill(0),
        name: 'current'
      };
    } else {
      const idx = parseInt(val);
      const bg = Project.data?.backgrounds?.[idx];
      if(bg) return { nametable: bg.nametable||new Array(960).fill(0), attributes: bg.attributes||new Array(64).fill(0), name: bg.name };
    }
    return { nametable: new Array(960).fill(0), attributes: new Array(64).fill(0), name: 'empty' };
  }

  function updateInfo(){
    const el = document.getElementById('buildInfo'); if(!el) return;
    const chr = CHR.getBuffer(); const pals = CHR.getPalettes();
    const bgData = getSelectedBGData();
    const filled = bgData.nametable.filter(t=>t!==0).length;
    el.innerHTML = `CHR: ${chr.length} bytes (${chr.length/1024}KB)<br>BG: ${bgData.name} • ${filled}/960 tiles (${Math.round(filled/960*100)}%)<br>Paletas: ${pals.length} x 4 cores = 32 bytes<br>Mapper: 0 (NROM)<br>PRG: 16KB + CHR: 8KB`;
  }

  function renderBuildPreview(){
    const canvas = document.getElementById('buildPreviewCanvas'); if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const chrBuf = CHR.getBuffer(); const pals = CHR.getPalettes();
    const bgData = getSelectedBGData();
    ctx.fillStyle="#000"; ctx.fillRect(0,0,256,240);
    for(let ty=0; ty<30; ty++) for(let tx=0; tx<32; tx++){
      const tileIdx = bgData.nametable[ty*32+tx]||0;
      const off = tileIdx*16; if(off+16>chrBuf.length) continue;
      const attrX = Math.floor(tx/2), attrY = Math.floor(ty/2);
      const blockX = Math.floor(attrX/2), blockY = Math.floor(attrY/2);
      const attrIdx = blockY*8+blockX;
      const attrByte = bgData.attributes[attrIdx]||0;
      const subX = attrX%2, subY = attrY%2;
      const shift = (subY*2+subX)*2;
      const palIdx = (attrByte>>shift)&0x03;
      const pal = pals[palIdx]||pals[0];
      for(let py=0; py<8; py++){
        const p0=chrBuf[off+py], p1=chrBuf[off+py+8];
        for(let px=0; px<8; px++){
          const sh=7-px, b0=(p0>>sh)&1, b1=(p1>>sh)&1, ci=(b1<<1)|b0;
          ctx.fillStyle = NES_PALETTE[pal[ci]];
          ctx.fillRect(tx*8+px, ty*8+py, 1,1);
        }
      }
    }
  }

  function buildROM(){
    const logEl = document.getElementById('buildLog');
    const asmEl = document.getElementById('buildASMPreview');
    const btnDl = document.getElementById('btnDownload');
    function log(msg){ if(logEl){ logEl.textContent += "\\n" + msg; logEl.scrollTop = logEl.scrollHeight; } console.log(msg); }

    if(logEl) logEl.textContent = "🔨 Iniciando build NROM...";
    
    try{
      const chrBuf = CHR.getBuffer(); // 8192
      const pals = CHR.getPalettes(); // 8 x 4
      const bgData = getSelectedBGData();
      const nt = bgData.nametable;
      const at = bgData.attributes;

      log(`CHR: ${chrBuf.length} bytes`);
      log(`BG: ${bgData.name} - NT ${nt.length} + AT ${at.length}`);
      log(`Paletas: ${JSON.stringify(pals)}`);

      // Flatten palettes to 32 bytes for PPU $3F00
      // BG palettes: pals[0..3] each 4 colors, SPR palettes: pals[4..7]
      // PPU expects 32 bytes, first byte of each 4 is universal BG color (we use pals[0][0] for all BG)
      const paletteBytes = [];
      for(let i=0;i<4;i++){ for(let c=0;c<4;c++) paletteBytes.push(pals[i][c]); } // BG 16
      for(let i=4;i<8;i++){ for(let c=0;c<4;c++) paletteBytes.push(pals[i][c]); } // SPR 16
      log(`Paletas flat: ${paletteBytes.length} bytes`);

      // Build PRG 16KB = 16384
      const PRG_SIZE = 16384;
      const prg = new Uint8Array(PRG_SIZE);
      // Fill with 0

      // Adiciona código 6502 minimalista
      // Vamos montar manualmente em $C000
      // Offsets no PRG: 0 = $C000
      let pos = 0;

      function emit(...bytes){ for(let b of bytes){ prg[pos++] = b & 0xFF; } }

      // --- RESET CODE em $C000 ---
      // SEI, CLD, etc
      emit(0x78); // SEI
      emit(0xD8); // CLD
      emit(0xA2, 0x40); // LDX #$40
      emit(0x8E, 0x17, 0x40); // STX $4017
      emit(0xA2, 0xFF); // LDX #$FF
      emit(0x9A); // TXS
      emit(0xE8); // INX
      emit(0x8E, 0x00, 0x20); // STX $2000
      emit(0x8E, 0x01, 0x20); // STX $2001
      emit(0x8E, 0x10, 0x40); // STX $4010

      // vblankwait1
      let vwait1 = pos;
      emit(0x2C, 0x02, 0x20); // BIT $2002
      emit(0x10, 0xFB); // BPL vwait1 (-5)

      // Clear RAM $0000-$07FF
      emit(0xA2, 0x00); // LDX #0
      emit(0xA9, 0x00); // LDA #0
      // clear loop: STA $0000,X etc
      let clearLoop = pos;
      emit(0x9D, 0x00, 0x00); // STA $0000,X
      emit(0x9D, 0x00, 0x01); // STA $0100,X
      emit(0x9D, 0x00, 0x02); // STA $0200,X
      emit(0x9D, 0x00, 0x03); // STA $0300,X
      emit(0x9D, 0x00, 0x04); // STA $0400,X
      emit(0x9D, 0x00, 0x05); // STA $0500,X
      emit(0x9D, 0x00, 0x06); // STA $0600,X
      emit(0x9D, 0x00, 0x07); // STA $0700,X
      emit(0xE8); // INX
      emit(0xD0, 0xE8); // BNE clearLoop (-24)

      // vblankwait2
      let vwait2 = pos;
      emit(0x2C, 0x02, 0x20); // BIT $2002
      emit(0x10, 0xFB); // BPL

      // Set PPU addr $3F00 for palettes
      emit(0xAD, 0x02, 0x20); // LDA $2002
      emit(0xA9, 0x3F); // LDA #$3F
      emit(0x8D, 0x06, 0x20); // STA $2006
      emit(0xA9, 0x00); // LDA #0
      emit(0x8D, 0x06, 0x20); // STA $2006
      emit(0xA2, 0x00); // LDX #0
      // pal loop: LDA paletteData,X STA $2007
      // paletteData will be at $C300 (offset 0x300)
      let palLoop = pos;
      emit(0xBD, 0x00, 0xC3); // LDA $C300,X
      emit(0x8D, 0x07, 0x20); // STA $2007
      emit(0xE8); // INX
      emit(0xE0, 0x20); // CPX #32
      emit(0xD0, 0xF6); // BNE palLoop

      // Nametable $2000
      emit(0xAD, 0x02, 0x20); // LDA $2002
      emit(0xA9, 0x20); // LDA #$20
      emit(0x8D, 0x06, 0x20); // STA $2006
      emit(0xA9, 0x00); // LDA #0
      emit(0x8D, 0x06, 0x20); // STA $2006

      // Copy 960 bytes from $C400 (nametable)
      // Use pointer $00,$01
      emit(0xA9, 0x00); // LDA #<NT
      emit(0x85, 0x00); // STA $00
      emit(0xA9, 0xC4); // LDA #>NT ($C4)
      emit(0x85, 0x01); // STA $01
      emit(0xA2, 0x03); // LDX #3 pages
      emit(0xA0, 0x00); // LDY #0
      let ntPageLoop = pos;
      emit(0xB1, 0x00); // LDA ($00),Y
      emit(0x8D, 0x07, 0x20); // STA $2007
      emit(0xC8); // INY
      emit(0xD0, 0xF8); // BNE ntPageLoop (if Y!=0)
      emit(0xE6, 0x01); // INC $01
      emit(0xCA); // DEX
      emit(0xD0, 0xF4); // BNE ntPageLoop

      // Remaining 192 bytes (960-768=192)
      emit(0xA2, 0xC0); // LDX #192
      let ntRemain = pos;
      emit(0xB1, 0x00); // LDA ($00),Y
      emit(0x8D, 0x07, 0x20); // STA $2007
      emit(0xC8); // INY
      emit(0xCA); // DEX
      emit(0xD0, 0xF8); // BNE

      // Attribute $23C0
      emit(0xAD, 0x02, 0x20); // LDA $2002
      emit(0xA9, 0x23); // LDA #$23
      emit(0x8D, 0x06, 0x20); // STA $2006
      emit(0xA9, 0xC0); // LDA #$C0
      emit(0x8D, 0x06, 0x20); // STA $2006

      // Attribute data at $C800 (64 bytes)
      emit(0xA2, 0x00); // LDX #0
      let atLoop = pos;
      emit(0xBD, 0x00, 0xC8); // LDA $C800,X
      emit(0x8D, 0x07, 0x20); // STA $2007
      emit(0xE8); // INX
      emit(0xE0, 0x40); // CPX #64
      emit(0xD0, 0xF6); // BNE

      // Set scroll 0,0
      emit(0xAD, 0x02, 0x20); // LDA $2002
      emit(0xA9, 0x00); // LDA #0
      emit(0x8D, 0x05, 0x20); // STA $2005
      emit(0x8D, 0x05, 0x20); // STA $2005

      // Enable PPU: $2000 = %10000000 (NMI on), $2001 = %00011110 (show BG+SPR)
      emit(0xA9, 0x80); // LDA #$80
      emit(0x8D, 0x00, 0x20); // STA $2000
      emit(0xA9, 0x1E); // LDA #$1E
      emit(0x8D, 0x01, 0x20); // STA $2001

      // Infinite loop
      let forever = pos;
      emit(0x4C, forever & 0xFF, 0xC0 | (forever>>8 & 0x3F)); // JMP forever (actually $C000+offset)
      // Correct JMP to itself
      // We'll patch: JMP to current pos after emit, so JMP to forever
      // forever is start of JMP itself, so infinite

      // --- NMI handler at $C100 (we jump) ---
      // Place NMI at fixed offset 0x100 = $C100
      while(pos < 0x100) emit(0xEA); // NOP fill
      // NMI:
      emit(0x48); // PHA
      emit(0x8A); // TXA PHA
      emit(0x48);
      emit(0x98); // TYA PHA
      emit(0x48);
      emit(0x68); // PLA TAY
      emit(0x68); // PLA TAX
      emit(0x68); // PLA
      emit(0x40); // RTI

      // --- IRQ same as RTI
      while(pos < 0x180) emit(0xEA);
      emit(0x40); // RTI for IRQ

      // --- Data section ---
      // Palette at $C300 (0x300)
      while(pos < 0x300) emit(0x00);
      for(let i=0;i<32;i++) emit(paletteBytes[i]||0);

      // Nametable at $C400 (0x400) - 960 bytes
      while(pos < 0x400) emit(0x00);
      for(let i=0;i<960;i++) emit(nt[i]||0);

      // Attribute at $C800 (0x800) - 64 bytes
      while(pos < 0x800) emit(0x00);
      for(let i=0;i<64;i++) emit(at[i]||0);

      // Fill rest up to $3FFA (vectors) with 0
      while(pos < 0x3FFA) emit(0x00);

      // Vectors at $FFFA (offset 0x3FFA in PRG)
      // NMI = $C100, Reset = $C000, IRQ = $C180
      emit(0x00, 0xC1); // NMI $C100
      emit(0x00, 0xC0); // Reset $C000
      emit(0x80, 0xC1); // IRQ $C180

      log(`PRG montado: ${pos} bytes (esperado 16384, resto zerado)`);
      // Ensure PRG is exactly 16384
      if(pos !== 16384){
        // pos should be 16384, if not, pad
        if(pos < 16384){
          // already filled, but vectors at end need to be at 0x3FFA
          // Our pos is at 0x4000 now (16384)
        }
      }

      // Build iNES header
      const header = new Uint8Array(16);
      header[0]=0x4E; header[1]=0x45; header[2]=0x53; header[3]=0x1A; // NES\x1A
      header[4]=1; // 1x16KB PRG
      header[5]=1; // 1x8KB CHR
      header[6]=0x00; // Mapper 0, horizontal mirroring
      header[7]=0x00;
      // rest 0

      const rom = new Uint8Array(16 + PRG_SIZE + chrBuf.length);
      rom.set(header, 0);
      rom.set(prg, 16);
      rom.set(chrBuf, 16+PRG_SIZE);

      lastROM = rom;
      log(`ROM final: ${rom.length} bytes (16 + ${PRG_SIZE} + ${chrBuf.length})`);
      log(`Header: PRG=${header[4]}x16KB, CHR=${header[5]}x8KB, Mapper 0`);
      log(`✅ Build OK! BG "${bgData.name}" + ${chrBuf.length} bytes CHR`);
      log(`Pronto pra baixar e testar no Mesen/FCEUX/JSNES`);

      if(asmEl){
        asmEl.value = `; NROM Build - ${bgData.name}\n; PRG 16KB - Reset em $C000\n; Palette ${paletteBytes.length} bytes em $C300\n; Nametable 960 bytes em $C400\n; Attribute 64 bytes em $C800\n; Vectors em $FFFA\n; CHR 8KB\n\n` +
          `BG_Nametable: ; 32x30\n` +
          Array.from({length:30}, (_,y)=>`  .db ` + nt.slice(y*32,y*32+32).map(b=>"$"+b.toString(16).padStart(2,"0")).join(",")).join("\\n") +
          `\\n\\nBG_Attribute: ; 64 bytes\\n  .db ` + at.map(b=>"$"+b.toString(16).padStart(2,"0")).join(",") + "\\n";
      }

      if(btnDl) btnDl.style.display='inline-block';

      const stats = document.getElementById('buildStats');
      if(stats) stats.innerHTML = `ROM: ${rom.length} bytes<br>PRG: ${PRG_SIZE}<br>CHR: ${chrBuf.length}<br>BG: ${bgData.name}<br><span style="color:#0f0">● Build OK</span>`;

      renderBuildPreview();

    }catch(e){
      log(`❌ Erro no build: ${e.message}\\n${e.stack}`);
      console.error(e);
    }
  }

  function downloadROM(){
    if(!lastROM){ alert("Faça o build primeiro!"); return; }
    const blob = new Blob([lastROM], {type:'application/octet-stream'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (Project.data?.name||"meu-jogo").replace(/\\s+/g,"_") + ".nes";
    a.click();
    Project.status("ROM .nes baixada");
  }

  function openEmulator(){
    // Abre emulador web e instrui arrastar
    window.open('https://www.nesjs.com/', '_blank');
    alert("Emulador aberto! Baixe o .nes com o botão azul e arraste o arquivo pra dentro do emulador web.");
  }

  // Expor dados pro build
  function getNametable(){ return typeof BG!=='undefined' && BG.getNametable ? BG.getNametable() : new Array(960).fill(0); }
  function getAttributes(){ return typeof BG!=='undefined' && BG.getAttributes ? BG.getAttributes() : new Array(64).fill(0); }
  function getCurrentData(){
    if(typeof BG!=='undefined' && BG.getCurrentData) return BG.getCurrentData();
    // Fallback tenta pegar do BG module interno
    try{
      return {
        nametable: BG.getNametable ? BG.getNametable() : new Array(960).fill(0),
        attributes: BG.getAttributes ? BG.getAttributes() : new Array(64).fill(0),
        name: 'current'
      };
    }catch(e){ return { nametable: new Array(960).fill(0), attributes: new Array(64).fill(0), name: 'empty' }; }
  }

  return {
    init(){ buildHTML(); },
    buildROM,
    downloadROM,
    openEmulator,
    getCurrentData,
    renderPreview: renderBuildPreview
  };
})();

document.addEventListener('DOMContentLoaded', ()=>{
  if(document.getElementById('mod-build')?.classList.contains('active')) BUILD.init();
});
