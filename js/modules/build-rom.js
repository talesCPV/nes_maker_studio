// BUILD ROM v0.9.1 - Camada 2: movimento + gravidade + colisão sólida + pulo
const BUILD = (() => {
  let lastASM = "";
  let buildMode = "game"; // "game" | "single"

  // NGC (NES Game Compiler) backend. O ASM só vem daqui - sem gerador local
  // nem preview instantâneo no navegador (Stage 22).
  const NGC_BACKEND_ENABLED = true;
  const NGC_ENDPOINT = "backend/build.php";

  function getMusicItems(){
    const sounds = Project?.data?.sounds;
    if(!sounds) return [];
    if(sounds.version === 3 && Array.isArray(sounds.items)){
      return sounds.items.filter(it => it && Array.isArray(it.channels) && it.channels.length);
    }
    // v2 legado
    if(sounds.version === 2 && Array.isArray(sounds.channels)){
      return [{
        id: "song_legacy",
        type: "song",
        name: "Musica 1",
        loop: sounds.loop !== false,
        baseFrames: sounds.baseFrames || 30,
        channels: sounds.channels
      }];
    }
    return [];
  }

  function getSelectedMusic(){
    const sel = document.getElementById("buildMusicSelect");
    const items = getMusicItems();
    if(!sel || sel.value === "" || sel.value === "none") return null;
    return items.find(it => it.id === sel.value) || null;
  }

  function buildHTML(){
    const root = document.getElementById("mod-build"); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:10px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#4ec9b0">🔨 BUILD ROM v0.9.14 • spawn DEBUG fixo</h3>
          <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <select id="buildModeSelect" onchange="BUILD.setBuildMode(this.value)" style="background:#000;color:#ffcc00;border:1px solid #665500;border-radius:4px;padding:4px;font-size:11px">
              <option value="game" selected>🎮 Jogo completo (Camada 1)</option>
              <option value="single">🖼 Tela única (legado)</option>
            </select>
            <button class="btn-tool" onclick="BUILD.buildROM()" style="background:#27ae60;color:#fff;padding:6px 14px;font-weight:bold">🔨 Build ROM</button>
            <button class="btn-tool" onclick="BUILD.downloadASM()" id="btnDownloadASM" style="display:none;background:#8e44ad;color:#fff">⬇ .asm</button>
            <button class="btn-tool" onclick="BUILD.downloadCFG()" id="btnDownloadCFG" style="background:#d35400;color:#fff">⬇ nrom.cfg</button>
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
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#4ec9b0;margin-bottom:6px">🎵 MÚSICA NA ROM (teste APU)</h4>
              <select id="buildMusicSelect" style="width:100%;background:#000;color:#4ec9b0;border:1px solid #2a5a4a;border-radius:4px;padding:5px;font-size:11px"></select>
              <div id="buildMusicDetails" style="margin-top:8px;font-size:10px;color:#666;background:#000;padding:6px;border-radius:4px;border:1px solid #222">Nenhuma música</div>
            </div>
            <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#8585ff;margin-bottom:4px">🐧 COMPILAÇÃO LOCAL (ca65)</h4>
              <div style="font-size:10px;color:#aaa;line-height:1.5;font-family:monospace">
                ca65 Hello.asm -o Hello.o<br>ld65 -C nrom.cfg Hello.o -o jogo.nes<br>fceux jogo.nes
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

  function refreshMusicSelect(){
    const sel = document.getElementById("buildMusicSelect");
    if(!sel) return;
    const items = getMusicItems();
    const prev = sel.value;
    sel.innerHTML = "";
    const optNone = document.createElement("option");
    optNone.value = "none";
    optNone.textContent = "— Sem música —";
    sel.appendChild(optNone);
    items.forEach(it=>{
      const o = document.createElement("option");
      o.value = it.id;
      const nch = (it.channels || []).length;
      const tag = it.type === "sfx" ? "SFX" : "SONG";
      o.textContent = `[${tag}] ${it.name || it.id} (${nch} ch)`;
      sel.appendChild(o);
    });
    if(prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    else if(items.length) sel.value = items[0].id;
    sel.onchange = ()=> updateInfo();
    updateMusicDetails();
  }

  function updateMusicDetails(){
    const el = document.getElementById("buildMusicDetails");
    if(!el) return;
    const music = getSelectedMusic();
    if(!music){
      el.innerHTML = "Nenhuma música selecionada — ROM silenciosa.";
      return;
    }
    const base = music.baseFrames || 30;
    const chans = (music.channels || []).map(c => c.type).join(", ");
    const cols = Math.max(0, ...(music.channels || []).map(c => (c.notes||[]).length));
    el.innerHTML = `<b style="color:#4ec9b0">${music.name}</b><br>Canais: ${chans || "—"}<br>Colunas: ${cols}<br>Frames/♩: ${base} · Loop: ${music.loop !== false ? "sim" : "não"}`;
  }

  function refreshSelects(){
    const phaseSel=document.getElementById("buildPhaseSelect");
    const typeSel=document.getElementById("buildImageTypeSelect");
    const imgSel=document.getElementById("buildImageSelect");
    if(!phaseSel||!typeSel||!imgSel) return;
    const phases=Project.data?.phases||[];
    phaseSel.innerHTML="";
    phases.forEach((p,i)=>{ const o=document.createElement("option"); o.value=i; o.textContent=`Fase ${i+1}: ${p.name}`; phaseSel.appendChild(o); });
    if(phases.length===0){ const o=document.createElement("option"); o.textContent="Nenhuma fase"; phaseSel.appendChild(o); }
    refreshImageSelect();
    refreshMusicSelect();
    phaseSel.onchange=()=>{ updateInfo(); renderPreview(); };
    typeSel.onchange=()=>{ refreshImageSelect(); updateInfo(); renderPreview(); };
    imgSel.onchange=()=>{ updateInfo(); renderPreview(); };
  }

  function refreshImageSelect(){
    const typeSel=document.getElementById("buildImageTypeSelect");
    const imgSel=document.getElementById("buildImageSelect");
    if(!typeSel||!imgSel) return;
    const type=typeSel.value;
    const splashes=Project.data?.splashScreens||[];
    const bgs=Project.data?.backgrounds||[];
    imgSel.innerHTML="";
    const optAuto=document.createElement("option"); optAuto.value="auto";
    optAuto.textContent = type==="background" ? "— Auto: background da fase / 1º BG —" : "— Auto: splash da fase / 1ª splash —";
    imgSel.appendChild(optAuto);
    const list = type==="background" ? bgs : splashes;
    list.forEach((item,i)=>{
      const o=document.createElement("option"); o.value=i;
      const filled = item.nametable ? item.nametable.filter(t=>t!==0).length : 0;
      const defaultName = type==="background" ? `BG ${i+1}` : `Splash ${i+1}`;
      o.textContent = `${item.name||defaultName} (${filled} tiles)`;
      imgSel.appendChild(o);
    });
    if(list.length===0){
      const o=document.createElement("option"); o.disabled=true;
      o.textContent = type==="background" ? "Nenhum background cadastrado" : "Nenhuma splash cadastrada";
      imgSel.appendChild(o);
    }
  }

  function getSelectedBuildData(){
    const phaseSel=document.getElementById("buildPhaseSelect");
    const typeSel=document.getElementById("buildImageTypeSelect");
    const imgSel=document.getElementById("buildImageSelect");
    const phases=Project.data?.phases||[];
    const splashes=Project.data?.splashScreens||[];
    const bgs=Project.data?.backgrounds||[];
    let targetPhase = phases[0];
    if(phaseSel && !isNaN(parseInt(phaseSel.value)) && phases[parseInt(phaseSel.value)]) targetPhase=phases[parseInt(phaseSel.value)];
    const type = typeSel ? typeSel.value : "splash";
    let imageData=null, sourceName="";

    if(imgSel && imgSel.value!=="auto"){
      const idx=parseInt(imgSel.value);
      if(type==="background" && !isNaN(idx) && bgs[idx]){
        imageData={ nametable:[...bgs[idx].nametable], attributes:[...bgs[idx].attributes], name: bgs[idx].name || `BG ${idx+1}` };
        sourceName=`Background "${imageData.name}" (manual)`;
      } else if(type==="splash" && !isNaN(idx) && splashes[idx]){
        imageData={ nametable:[...splashes[idx].nametable], attributes:[...splashes[idx].attributes], name: splashes[idx].name };
        sourceName=`Splash "${imageData.name}" (manual)`;
      }
    }
    if(!imageData && type==="splash" && targetPhase && targetPhase.splash){
      const found=splashes.find(s=>s.name===targetPhase.splash);
      if(found){ imageData={ nametable:[...found.nametable], attributes:[...found.attributes], name:found.name }; sourceName=`Splash "${found.name}" da fase "${targetPhase.name}"`; }
    }
    if(!imageData && type==="background" && targetPhase && targetPhase.background){
      const found=bgs.find(b=>b.name===targetPhase.background);
      if(found){ imageData={ nametable:[...found.nametable], attributes:[...found.attributes], name:found.name }; sourceName=`Background "${found.name}" da fase "${targetPhase.name}"`; }
    }
    if(!imageData && type==="splash" && splashes.length>0){
      imageData={ nametable:[...splashes[0].nametable], attributes:[...splashes[0].attributes], name:splashes[0].name };
      sourceName=`Primeiro splash "${imageData.name}"`;
    }
    if(!imageData && type==="background" && bgs.length>0){
      imageData={ nametable:[...bgs[0].nametable], attributes:[...bgs[0].attributes], name: bgs[0].name || "BG 1" };
      sourceName=`Primeiro background "${imageData.name}"`;
    }
    if(!imageData){
      if(splashes.length>0){ imageData={ nametable:[...splashes[0].nametable], attributes:[...splashes[0].attributes], name:splashes[0].name }; sourceName=`Fallback: splash "${imageData.name}"`; }
      else if(bgs.length>0){ imageData={ nametable:[...bgs[0].nametable], attributes:[...bgs[0].attributes], name: bgs[0].name || "BG 1" }; sourceName=`Fallback: background "${imageData.name}"`; }
    }
    if(!imageData){
      if(typeof BG!=="undefined" && BG.getNametable){
        try{ const nt=BG.getNametable(); const at=BG.getAttributes(); if(nt && nt.filter(t=>t!==0).length>0) imageData={ nametable:nt, attributes:at, name:"BG atual" }; }catch(e){}
      }
    }
    if(!imageData) imageData={ nametable:new Array(960).fill(0), attributes:new Array(64).fill(0), name:"vazio" };
    if(!sourceName) sourceName=imageData.name;
    return { ...imageData, sourceName, phase:targetPhase, type, filled: imageData.nametable.filter(t=>t!==0).length };
  }

  function updateInfo(){
    const info=document.getElementById("buildInfo");
    const details=document.getElementById("buildPhaseDetails");
    if(!info) return;
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const data=getSelectedBuildData();
    const typeLabel = data.type==="background" ? "Background" : "Splash";
    const packed=packBackgroundCHR(chrBuf, data.nametable);
    let overflowWarn = "";
    if(packed.overflowCount>0) overflowWarn = `<br><span style="color:#ff5555">⚠ ${packed.overflowCount} tile(s) a mais não cabem em 256 e virarão vazio</span>`;
    const music = getSelectedMusic();
    const musicLine = music
      ? `<br><span style="color:#4ec9b0">🎵 Música: ${music.name} (${(music.channels||[]).length} ch)</span>`
      : `<br><span style="color:#666">🎵 Sem música</span>`;
    info.innerHTML=`<b style="color:#ffcc00">[${typeLabel}] ${data.sourceName||data.name}</b><br>CHR: ${chrBuf.length} bytes<br>Tiles na tela: ${data.filled}/960<br>Tiles únicos usados: ${packed.usedCount}/256${overflowWarn}${musicLine}`;
    if(details && data.phase) details.innerHTML=`Fase: ${data.phase.name}<br>Gravity: ${data.phase.gravity}<br>Mapper: ${data.phase.mapper}`;
    updateMusicDetails();
  }

  function computeBackdropColor(nt, at, pals, chrBuf){
    return RENDER_UTILS.computeBackdropColor(nt, at, pals, chrBuf);
  }
  function renderPreview(){
    const canvas=document.getElementById("buildPreviewCanvas"); if(!canvas) return;
    const data=getSelectedBuildData(); const nt=data.nametable; const at=data.attributes;
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const pals=CHR.getPalettes?CHR.getPalettes():[[15,0,16,48]];
    RENDER_UTILS.drawNametableToCanvas(canvas, nt, at, chrBuf, pals);
  }
  function log(m){ const el=document.getElementById("buildLog"); if(el){ el.textContent+="\n"+m; el.scrollTop=el.scrollHeight; } }

  function packBackgroundCHR(chrBuf, nt){
    const mapping = new Map();
    const usedTiles = [];
    mapping.set(0, 0); usedTiles.push(0);
    const overflow = new Set();
    for (const raw of nt) {
      const orig = raw || 0;
      if (mapping.has(orig)) continue;
      if (usedTiles.length >= 256) { overflow.add(orig); continue; }
      mapping.set(orig, usedTiles.length);
      usedTiles.push(orig);
    }
    const bgChr = new Uint8Array(4096);
    for (let i = 0; i < usedTiles.length; i++) {
      const srcIdx = usedTiles[i];
      const srcOff = (srcIdx % 512) * 16;
      if (srcOff + 16 <= chrBuf.length) bgChr.set(chrBuf.slice(srcOff, srcOff + 16), i * 16);
    }
    const remappedNt = nt.map(t => {
      const orig = t || 0;
      if (mapping.has(orig)) return mapping.get(orig);
      return 0;
    });
    return { bgChr, remappedNt, usedCount: usedTiles.length, overflowCount: overflow.size };
  }

  // collectGameScreens/packMultiScreenCHR/packSpriteCHR removidos (Stage 22)
  // - eram só usados pelo gerador local de ASM, que não existe mais.
  function setBuildMode(m){ buildMode = (m === "single") ? "single" : "game"; }

  function buildNGCRequest(){
    const phaseSel = document.getElementById("buildPhaseSelect");
    const typeSel = document.getElementById("buildImageTypeSelect");
    const imgSel = document.getElementById("buildImageSelect");
    const musicSel = document.getElementById("buildMusicSelect");

    // Stage 21: build-rom.js virou uma casca. Project.data já é a
    // representação persistível do .nms - mandamos ele bruto, inteiro, e o
    // NGC resolve telas/CHR/paletas/dados sozinho a partir dele. Nada de
    // pré-processamento local (nem collectGameScreens, nem pack de CHR) -
    // só os seletores da UI que o backend não tem como adivinhar (fase/tipo/
    // índice escolhidos, e a música selecionada).
    const project = JSON.parse(JSON.stringify(Project?.data || {}));

    return {
      version: 1,
      buildMode,
      project,
      selection: {
        phaseIndex: phaseSel ? phaseSel.value : "0",
        imageType: typeSel ? typeSel.value : "splash",
        imageIndex: imgSel ? imgSel.value : "auto",
        musicId: musicSel ? musicSel.value : "none"
      }
    };
  }

  async function generateASMFromNGC(){
    if(!NGC_BACKEND_ENABLED) return null;

    const response = await fetch(NGC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(buildNGCRequest())
    });

    const text = await response.text();
    let result;
    try { result = JSON.parse(text); }
    catch(e) { throw new Error("Resposta inválida do NGC (HTTP " + response.status + ")"); }

    if(!response.ok) throw new Error(result.error || ("NGC HTTP " + response.status));
    if(!result.ready) return null;
    return result;
  }

  // replaceASMBlock/applyNGCBlocks removidos (Stage 22) - não fazem mais
  // sentido sem o esqueleto ASM local pra remendar; o NGC já devolve o
  // .asm pronto.
  async function buildROM(){
    const logEl=document.getElementById("buildLog"); if(logEl) logEl.textContent="Iniciando build v0.21.0 (NGC completo)...\n";
    try{
      const music = getSelectedMusic();
      if(buildMode === "game"){
        log("Modo: JOGO COMPLETO");
        log("Enviando project.data (.nms) bruto pro NGC resolver telas/CHR/paletas...");
        log("Controles: START no splash→fase · SELECT na fase→game over · START no GO→splash");
      } else {
        log("Modo: TELA ÚNICA");
      }
      if(music) log("Música: " + music.name + " · " + (music.channels||[]).length + " canal(is)");
      else log("Música: (nenhuma)");

      let asm = null;
      let ngcError = null;
      try {
        log("Enviando projeto ao NGC...");
        const ngcResult = await generateASMFromNGC();
        if(ngcResult && typeof ngcResult.asm === "string" && ngcResult.asm.trim()) {
          asm = ngcResult.asm;
          log("✅ ASM gerado pelo NGC backend (v" + (ngcResult.version || "?") + ").");
        }
      } catch(e) {
        ngcError = e;
      }

      if(!asm) {
        const msg = ngcError ? ngcError.message : "o NGC não devolveu um ASM utilizável.";
        log("❌ Não foi possível gerar o ASM: " + msg);
        log("A geração de código no navegador foi removida - o ASM só vem do backend (NGC). Verifique se o backend está rodando e tente de novo.");
        const stats=document.getElementById("buildStats");
        if(stats) stats.innerHTML = "❌ Build falhou: " + msg;
        return;
      }
      lastASM=asm;
      log("ASM gerado (" + asm.length + " chars) — ca65 + nrom.cfg");
      const asmEl=document.getElementById("buildASMPreview"); if(asmEl) asmEl.value=asm;
      document.getElementById("btnDownloadASM").style.display="inline-block";
      document.getElementById("btnDownloadCFG").style.display="inline-block";

      const stats=document.getElementById("buildStats");
      if(stats){
        stats.innerHTML = "Modo: " + buildMode + "<br>ASM: " + asm.length + " chars<br>ROM: — (use ca65)" +
          "<br>Música: " + (music?music.name:"—");
      }

      // Thumbnail do dashboard: gera a partir do preview do build
      // só se o projeto já tem id no servidor e ainda não tem thumb.
      try {
        await maybeUploadBuildThumbnail();
      } catch(thumbErr) {
        console.warn("Thumbnail:", thumbErr);
      }
    }catch(e){
      log("❌ Erro: "+e.message);
      console.error(e);
    }
  }

  /**
   * Renderiza o preview, exporta PNG e envia ao backend
   * (servidor ignora se thumbnail.png já existir).
   */
  async function maybeUploadBuildThumbnail(){
    if(typeof Project === "undefined" || !Project.projectId){
      log("Thumbnail: projeto sem id no servidor — ignorado.");
      return;
    }
    try { renderPreview(); } catch(e) {}
    const canvas = document.getElementById("buildPreviewCanvas");
    if(!canvas){
      log("Thumbnail: canvas de preview ausente.");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    if(!dataUrl || dataUrl.length < 100){
      log("Thumbnail: preview vazio.");
      return;
    }
    if(typeof Project.uploadThumbnailIfMissing !== "function") return;
    const result = await Project.uploadThumbnailIfMissing(dataUrl);
    if(result && result.skipped){
      log("Thumbnail: já existia no servidor — mantido.");
    } else if(result && result.success){
      log("Thumbnail: salvo no servidor.");
    } else if(result && result.message){
      log("Thumbnail: " + result.message);
    }
  }

  function downloadASM(){
    if(!lastASM){ alert("Build primeiro!"); return; }
    const blob=new Blob([lastASM],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=(Project.data?.name||"meu-jogo").replace(/\s+/g,"_")+".asm"; a.click();
  }

  // Linker script sempre alinhado ao header gerado (NROM 16KB PRG @ $C000)
  function generateCFG(){
    const name = (Project?.data?.name || "projeto").replace(/\s+/g, "_");
    const mapper = Project?.data?.mapper != null ? Project.data.mapper : 0;
    // Camada 2: NROM-256 (32KB PRG @ $8000) — cabe código + várias telas + collision
    // IMPORTANTE: ld65 so aceita # como comentario no .cfg (nao ;)
    return [
      "# nrom.cfg gerado pelo NES Maker Studio",
      "# Projeto: " + name,
      "# Mapper: " + mapper + " (NROM) | PRG 32KB @ $8000 | CHR 8KB",
      "# Header PRG banks = 2 (NROM-256)",
      "MEMORY {",
      "  ZP:     start = $0000, size = $0100, type = rw, define = yes;",
      "  RAM:    start = $0300, size = $0500, type = rw, define = yes;",
      "  HDR:    start = $0000, size = $0010, type = ro, file = %O, fill = yes;",
      "  PRG:    start = $8000, size = $8000, type = ro, file = %O, fill = yes, define = yes;",
      "  CHR:    start = $0000, size = $2000, type = ro, file = %O, fill = yes;",
      "}",
      "SEGMENTS {",
      "  HEADER:   load = HDR, type = ro;",
      "  ZEROPAGE: load = ZP,  type = zp;",
      "  RAM:      load = RAM, type = bss, optional = yes;",
      "  CODE:     load = PRG, type = ro;",
      "  RODATA:   load = PRG, type = ro, optional = yes;",
      "  VECTORS:  load = PRG, type = ro, offset = $7FFA;",
      "  CHARS:    load = CHR, type = ro;",
      "}",
      ""
    ].join("\n");
  }
  function downloadCFG(){
    const cfg = generateCFG();
    const blob=new Blob([cfg],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download="nrom.cfg"; a.click();
  }
  function copyASM(){ const ta=document.getElementById("buildASMPreview"); if(!ta) return; ta.select(); document.execCommand("copy"); }

  return {
    init(){ buildHTML(); },
    buildROM, setBuildMode, downloadASM, downloadCFG, copyASM,
    renderPreview, getCurrentData: getSelectedBuildData,
    refreshSelects
  };
})();
