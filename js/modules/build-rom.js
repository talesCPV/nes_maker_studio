// BUILD ROM v0.9.1 - Camada 2: movimento + gravidade + colisão sólida + pulo
const BUILD = (() => {
  let lastROM = null;
  let lastASM = "";
  let emuBrowser = null;
  let emuScriptPromise = null;
  let buildMode = "game"; // "game" | "single"

  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const CPU_FREQ_NTSC = 1789773;
  const RHYTHM = {
    breve: 4, whole: 2, quarter: 1, eighth: 0.5,
    sixteenth: 0.25, thirtysecond: 0.125, sixtyfourth: 0.0625
  };

  // period NES (11-bit) a partir do nome da nota do editor
  function noteToPeriod(noteName){
    if(!noteName || noteName === "REST") return { lo: 0, hi: 0 };
    const m = noteName.match(/^([A-G]#?)(\d+)$/);
    if(!m) return { lo: 0, hi: 0 };
    const noteIndex = NOTE_NAMES.indexOf(m[1]);
    if(noteIndex < 0) return { lo: 0, hi: 0 };
    const octave = parseInt(m[2], 10);
    const midi = (octave + 1) * 12 + noteIndex;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    let period = Math.round((CPU_FREQ_NTSC / (16 * freq)) - 1);
    if(period < 0) period = 0;
    if(period > 2047) period = 2047;
    return { lo: period & 0xFF, hi: (period >> 8) & 0x07 };
  }

  function framesForFigure(figId, baseFrames){
    const mul = RHYTHM[figId] != null ? RHYTHM[figId] : 1;
    return Math.max(1, Math.min(255, Math.round(baseFrames * mul)));
  }

  function hexByte(b){
    return "$" + (b & 0xFF).toString(16).padStart(2, "0").toUpperCase();
  }

  function formatBytes(arr, per){
    per = per || 16;
    const lines = [];
    for(let i=0;i<arr.length;i+=per){
      lines.push("  .byte " + arr.slice(i, i+per).map(hexByte).join(", "));
    }
    return lines;
  }

  // Converte um canal do editor → tabelas Scale/Time/Pitch
  function encodeChannel(notes, baseFrames, loop){
    const pitchList = ["REST"];
    const pitchIndex = { REST: 0 };
    const scale = [];
    const time = [];
    const list = Array.isArray(notes) ? notes : [];
    const maxNotes = 2048;
    const n = Math.min(list.length, maxNotes);
    for(let i=0;i<n;i++){
      const note = list[i]?.note || "REST";
      const fig = list[i]?.figure || "quarter";
      if(pitchIndex[note] === undefined){
        pitchIndex[note] = pitchList.length;
        pitchList.push(note);
      }
      scale.push(pitchIndex[note]);
      time.push(framesForFigure(fig, baseFrames));
    }
    if(!scale.length){
      scale.push(0);
      time.push(30);
    }
    scale.push(loop ? 0xFF : 0xFE);

    const lo = [];
    const hi = [];
    pitchList.forEach(name=>{
      const p = noteToPeriod(name);
      lo.push(p.lo);
      hi.push(p.hi);
    });
    return { scale, time, lo, hi, pitchList, truncated: list.length > maxNotes };
  }

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
            <button class="btn-tool" onclick="BUILD.downloadROM()" id="btnDownload" style="display:none;background:#2980b9;color:#fff">⬇ .nes</button>
            <button class="btn-tool" onclick="BUILD.playEmulator()" id="btnPlayEmu" style="display:none;background:#c0392b;color:#fff;font-weight:bold">▶ Testar</button>
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
        <div id="buildEmuModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:9999;align-items:center;justify-content:center">
          <div style="background:#1a1a1a;border:1px solid #444;border-radius:10px;padding:16px;max-width:96vw;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <h3 style="margin:0;font-size:14px;color:#4ec9b0">▶ Emulador (jsnes)</h3>
              <span id="buildEmuStatus" style="font-size:11px;color:#888">—</span>
              <button class="btn-tool" onclick="BUILD.stopEmulator()" style="margin-left:auto;background:#c0392b;color:#fff">■ Parar</button>
            </div>
            <div id="buildEmuContainer" style="width:512px;height:480px;max-width:90vw;max-height:70vh;background:#000;margin:0 auto;image-rendering:pixelated"></div>
            <div style="margin-top:10px;font-size:10px;color:#666;text-align:center">
              Setas = D-pad · Z = B · X = A · Enter = Start · Right Ctrl = Select
            </div>
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

  // ---- Camada 1: coleta telas na ordem das fases (levelMap) + splashes restantes (ex: Game Over)
  function collectGameScreens(){
    const screens = [];
    const seen = new Set();
    const bgs = Project.data?.backgrounds || [];
    const splashes = Project.data?.splashScreens || [];
    const findAsset = (id, type) => {
      if(type === "splash") return splashes.find(s => s.id === id);
      return bgs.find(b => b.id === id);
    };
    const phases = Project.data?.phases || [];
    phases.forEach(ph => {
      const lm = ph.levelMap;
      if(!lm || !lm.cells) return;
      const cols = lm.cols || 1, rows = lm.rows || 1;
      for(let y=0; y<rows; y++){
        for(let x=0; x<cols; x++){
          const cell = lm.cells[`${x},${y}`];
          if(!cell || !cell.bgId || seen.has(cell.bgId)) continue;
          const asset = findAsset(cell.bgId, cell.type === "splash" ? "splash" : "background");
          if(!asset) continue;
          seen.add(cell.bgId);
          const isSplash = cell.type === "splash";
          screens.push({
            id: asset.id,
            name: asset.name || cell.bgId,
            type: isSplash ? "splash" : "background",
            phaseId: ph.id,
            phaseName: ph.name,
            nametable: asset.nametable || new Array(960).fill(0),
            attributes: asset.attributes || new Array(64).fill(0),
            collisionMap: asset.collisionMap || new Array(960).fill(0),
            role: isSplash ? "splash" : "play"
          });
        }
      }
    });
    // Splashes não referenciadas nas fases (ex: Game Over via warp)
    splashes.forEach(s => {
      if(seen.has(s.id)) return;
      seen.add(s.id);
      screens.push({
        id: s.id,
        name: s.name || s.id,
        type: "splash",
        phaseId: null,
        phaseName: null,
        nametable: s.nametable || new Array(960).fill(0),
        attributes: s.attributes || new Array(64).fill(0),
        collisionMap: s.collisionMap || new Array(960).fill(0),
        role: "gameover"
      });
    });
    if(screens.length === 0){
      // fallback: qualquer BG/splash do projeto
      (splashes.length ? splashes : bgs).forEach((s,i) => {
        screens.push({
          id: s.id, name: s.name, type: splashes.length ? "splash" : "background",
          phaseId: null, phaseName: null,
          nametable: s.nametable || new Array(960).fill(0),
          attributes: s.attributes || new Array(64).fill(0),
          collisionMap: s.collisionMap || new Array(960).fill(0),
          role: i === 0 ? "splash" : "play"
        });
      });
    }
    // índices úteis
    const splashIdx = screens.findIndex(s => s.role === "splash");
    const gameoverIdx = screens.findIndex(s => s.role === "gameover");
    const playIdxs = screens.map((s,i) => (s.role === "play" || s.type === "background") ? i : -1).filter(i => i >= 0);
    return {
      screens,
      splashIdx: splashIdx >= 0 ? splashIdx : 0,
      playStartIdx: playIdxs.length ? playIdxs[0] : 0,
      playCount: playIdxs.length || 1,
      gameoverIdx: gameoverIdx >= 0 ? gameoverIdx : (screens.length - 1)
    };
  }

  // Empacota CHR de várias nametables num único banco de 256 tiles ($1000)
  function packMultiScreenCHR(chrBuf, screens){
    const mapping = new Map();
    const usedTiles = [];
    mapping.set(0, 0); usedTiles.push(0);
    const overflow = new Set();
    screens.forEach(sc => {
      (sc.nametable || []).forEach(raw => {
        const orig = raw || 0;
        if(mapping.has(orig)) return;
        if(usedTiles.length >= 256){ overflow.add(orig); return; }
        mapping.set(orig, usedTiles.length);
        usedTiles.push(orig);
      });
    });
    const bgChr = new Uint8Array(4096);
    for(let i=0; i<usedTiles.length; i++){
      const srcIdx = usedTiles[i];
      const srcOff = (srcIdx % 512) * 16;
      if(srcOff + 16 <= chrBuf.length) bgChr.set(chrBuf.slice(srcOff, srcOff + 16), i * 16);
    }
    const remapped = screens.map(sc => ({
      ...sc,
      remappedNt: (sc.nametable || []).map(t => mapping.has(t||0) ? mapping.get(t||0) : 0)
    }));
    return { bgChr, screens: remapped, usedCount: usedTiles.length, overflowCount: overflow.size };
  }

  // ---- Camada 3: empacota CHR de sprites ($0000) a partir dos FRAMES (metatiles) usados
  // pela animação padrão (animations[0]) de cada personagem não-herói. Cada frame vira até
  // 4 células (2x2 tiles, 16x16px) - metatiles maiores são truncados ao quadrante TL 2x2
  // (aviso no log), metatiles menores geram menos células (o resto do metasprite fica oculto
  // em runtime). O tile 0 é sempre reservado no slot 0 do banco (mesma convenção do BG).
  function packSpriteCHR(chrBuf, chars){
    const mapping = new Map();
    const usedTiles = [];
    mapping.set(0, 0); usedTiles.push(0);
    const overflow = new Set();
    const truncated = [];
    function mapTile(t){
      const orig = t || 0;
      if(mapping.has(orig)) return mapping.get(orig);
      if(usedTiles.length >= 256){ overflow.add(orig); return 0; }
      mapping.set(orig, usedTiles.length);
      usedTiles.push(orig);
      return mapping.get(orig);
    }
    const metatiles = (typeof CHR !== "undefined" && CHR.getMetatiles) ? CHR.getMetatiles() : [];
    const mtById = new Map(metatiles.map(m => [m.id, m]));
    // slots do metasprite 2x2, na mesma ordem usada pelo desenho do player: TL,TR,BL,BR
    const CORNERS = [{dx:0,dy:0},{dx:8,dy:0},{dx:0,dy:8},{dx:8,dy:8}];
    const charData = chars.map((c, ci) => {
      const anim = (c.animations || [])[0] || { name:"Idle", loop:true, frames:[] };
      const frames = (anim.frames || []).map((f, fi) => {
        const mt = mtById.get(f.metatileId);
        const duration = Math.max(1, Math.min(255, f.duration || 8));
        if(!mt || !mt.tiles || !mt.w || !mt.h) return { cells: [], duration };
        if(mt.w > 2 || mt.h > 2) truncated.push(`${c.name} / ${anim.name} / frame ${fi+1} (${mt.w}x${mt.h} → 2x2)`);
        const cells = [];
        for(let ty=0; ty<Math.min(2, mt.h); ty++){
          for(let tx=0; tx<Math.min(2, mt.w); tx++){
            const raw = mt.tiles[ty*mt.w+tx] || 0;
            const corner = ty*2+tx; // 0=TL 1=TR 2=BL 3=BR
            cells.push({ tile: mapTile(raw), dx: CORNERS[corner].dx, dy: CORNERS[corner].dy, corner });
          }
        }
        return { cells, duration };
      });
      return { id: c.id, name: c.name, frames: frames.length ? frames : [{ cells: [], duration: 8 }] };
    });
    const spriteChr = new Uint8Array(4096);
    for(let i=0; i<usedTiles.length; i++){
      const srcIdx = usedTiles[i];
      const srcOff = (srcIdx % 512) * 16;
      if(srcOff + 16 <= chrBuf.length) spriteChr.set(chrBuf.slice(srcOff, srcOff + 16), i * 16);
    }
    return { spriteChr, charData, usedCount: usedTiles.length, overflowCount: overflow.size, truncated };
  }

  // ---- Music engine ASM helpers ----
  const CH_ORDER = ["pulse1", "pulse2", "triangle", "noise"];
  const CH_META = {
    pulse1:   { regVol: "$4000", regLo: "$4002", regHi: "$4003", dutyVol: "%10111111", silence: "%00110000", enableBit: 0, vol: 0x4000, lo: 0x4002, hi: 0x4003, duty: 0xBF, sil: 0x30 },
    pulse2:   { regVol: "$4004", regLo: "$4006", regHi: "$4007", dutyVol: "%01111111", silence: "%00110000", enableBit: 1, vol: 0x4004, lo: 0x4006, hi: 0x4007, duty: 0x7F, sil: 0x30 },
    triangle: { regVol: "$4008", regLo: "$400A", regHi: "$400B", dutyVol: "%11111111", silence: "%00000000", enableBit: 2, vol: 0x4008, lo: 0x400A, hi: 0x400B, duty: 0xFF, sil: 0x00 },
    noise:    { regVol: "$400C", regLo: "$400E", regHi: "$400F", dutyVol: "%00111111", silence: "%00110000", enableBit: 3, vol: 0x400C, lo: 0x400E, hi: 0x400F, duty: 0x3F, sil: 0x30 }
  };

  function emitMusicEngine(L, music){
    if(!music){
      L.push("; (sem musica)");
      return null;
    }
    const baseFrames = music.baseFrames || 30;
    const loop = music.loop !== false;
    const channels = music.channels || [];
    // ordena / mapeia tipos unicos
    const used = [];
    CH_ORDER.forEach(type=>{
      const ch = channels.find(c => c.type === type);
      if(ch) used.push({ type, ch, enc: encodeChannel(ch.notes || [], baseFrames, loop) });
    });
    // canais extras com tipo desconhecido → primeiros slots livres
    channels.forEach(ch=>{
      if(used.some(u => u.ch === ch)) return;
      const free = CH_ORDER.find(t => !used.some(u => u.type === t));
      if(free) used.push({ type: free, ch, enc: encodeChannel(ch.notes || [], baseFrames, loop) });
    });
    if(!used.length) return null;

    L.push(`; === MUSIC ENGINE: ${music.name} (${used.length} canais, baseFrames=${baseFrames}) ===`);
    return used;
  }

  // ===== CAMADA 1: jogo multi-tela (Splash → Play → Game Over) =====
  function generateASMGame(){
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const pals=CHR.getPalettes?CHR.getPalettes():[[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]];
    const music = getSelectedMusic();
    const collected = collectGameScreens();
    const packed = packMultiScreenCHR(chrBuf, collected.screens);
    const screens = packed.screens;
    const splashIdx = collected.splashIdx;
    const playStart = collected.playStartIdx;
    const gameoverIdx = collected.gameoverIdx;

    // ---- Camada 3/4-fix: pool de instâncias (inimigos) + sprites reais - agora inclui o(s)
    // herói(is) no MESMO empacotador, senão a página $0000 fica sem a arte do player quando
    // remontada só com os inimigos (bug encontrado em teste real: hero saía com tile errado).
    // "Herói" = qualquer personagem cujo nome contém "hero" (heurística já usada no spawn table).
    const allChars = Project.data?.characters || [];
    const heroIdSet = new Set(allChars.filter(c => (c.name||"").toLowerCase().includes("hero")).map(c => String(c.id)));
    const enemyChars = allChars.filter(c => !heroIdSet.has(String(c.id)));
    const spritePack = packSpriteCHR(chrBuf, allChars);
    const charIndexById = new Map(allChars.map((c,i) => [String(c.id), i]));
    const heroChar = allChars.find(c => heroIdSet.has(String(c.id)));
    const heroCharIdx = heroChar ? charIndexById.get(String(heroChar.id)) : 0;
    const heroFrameCount = (spritePack.charData[heroCharIdx] && spritePack.charData[heroCharIdx].frames.length) || 1;
    // (sem herói cadastrado -> heroCharIdx cai no índice 0, que sempre existe - se for um
    // inimigo real ele "empresta" a arte por engano; se não houver personagem nenhum, cai no
    // placeholder $FF/oculto emitido por packSpriteCHR. Avisamos no log de qualquer forma.)
    // orçamento de OAM: player fixo usa 4 sprites ($0200-$020F); cada instância usa até 4
    // ($0210 em diante). 64 sprites totais / 4 = 16 metasprites - 1 do player = 15 no máximo.
    const MAX_OAM_INSTANCES = 15;
    const requestedInstances = Math.max(1, Math.min(20, parseInt(Project.data?.maxInstances) || 10));
    const NUM_INSTANCES = Math.min(requestedInstances, MAX_OAM_INSTANCES);
    const instanceOverflow = requestedInstances > MAX_OAM_INSTANCES;
    // Camada 5: indice global da 2ª tela de jogo (play_idx=1), pra pré-carregar na outra
    // nametable física quando o jogo começa. Nome distinto de "playIdxs" (já usado mais
    // abaixo no arquivo, no mesmo escopo, pra tabela de spawn).
    const playIdxList = screens.map((s,i) => (s.role === "play" || s.type === "background") ? i : -1).filter(i => i >= 0);
    const secondPlayScreenIdx = playIdxList.length > 1 ? playIdxList[1] : null;

    // paletas
    const paletteBytes=[]; for(let p=0;p<8;p++){ const pal=pals[p]||[15,0,16,48]; for(let c=0;c<4;c++) paletteBytes.push(pal[c]||0); }
    const firstNt = screens[0]?.remappedNt || new Array(960).fill(0);
    const firstAt = screens[0]?.attributes || new Array(64).fill(0);
    const backdrop = computeBackdropColor(firstNt, firstAt, pals, chrBuf);
    const universalBackdrop = backdrop.color;
    paletteBytes[0] = universalBackdrop;
    [4,8,12,16,20,24,28].forEach(i => { paletteBytes[i] = universalBackdrop; });

    // música
    let musicChans = null;
    if(music){
      const baseFrames = music.baseFrames || 30;
      const loop = music.loop !== false;
      musicChans = [];
      CH_ORDER.forEach(type=>{
        const ch = (music.channels || []).find(c => c.type === type);
        if(ch) musicChans.push({ type, enc: encodeChannel(ch.notes || [], baseFrames, loop) });
      });
      (music.channels || []).forEach(ch=>{
        if(musicChans.some(u => u.type === ch.type)) return;
        const free = CH_ORDER.find(t => !musicChans.some(u => u.type === t));
        if(free) musicChans.push({ type: free, enc: encodeChannel(ch.notes || [], baseFrames, loop) });
      });
      if(!musicChans.length) musicChans = null;
    }

    const L=[];
    L.push("; NES Maker Studio - BUILD v0.9.17 - fix: sprite do herói volta a usar arte real (pool unificado)");
    L.push("; NROM-256 | player e inimigos compartilham o mesmo empacotador de CHR $0000");
    L.push(`; Telas: ${screens.length} · CHR tiles (fundo): ${packed.usedCount}/256` + (packed.overflowCount?` · overflow ${packed.overflowCount}`:""));
    L.push(`; CHR tiles (sprites): ${spritePack.usedCount}/256` + (spritePack.overflowCount?` · overflow ${spritePack.overflowCount}`:""));
    L.push(`; Instâncias: ${NUM_INSTANCES}` + (instanceOverflow ? ` (maxInstances=${requestedInstances} excede o orçamento de OAM, limitado a ${MAX_OAM_INSTANCES})` : ""));
    if(spritePack.truncated.length) spritePack.truncated.forEach(t => L.push(`; AVISO: frame maior que 2x2 truncado - ${t}`));
    if(enemyChars.length === 0) L.push("; AVISO: nenhum personagem não-herói cadastrado - nenhuma instância vai renderizar sprite.");
    if(!heroChar) L.push("; AVISO: nenhum personagem com \"hero\" no nome - o player vai desenhar o placeholder (oculto).");
    else L.push(`; Herói: "${heroChar.name}" (charIdx ${heroCharIdx}, ${heroFrameCount} frame(s))`);
    screens.forEach((s,i) => L.push(`;   [${i}] ${s.role} · ${s.name}`));
    if(music && musicChans) L.push(`; Musica: ${music.name} · ${musicChans.length} canal(is)`);
    else L.push("; Musica: (nenhuma)");
    L.push("");
    L.push('.segment "HEADER"');
    L.push("  .byte $4E,$45,$53,$1A,2,1,$01,0,0,0,0,0,0,0,0,0  ; NROM-256 (32KB PRG), vertical mirroring");
    L.push("");
    L.push('.segment "ZEROPAGE"');
    L.push("pad1:       .res 1");
    L.push("pad1_old:   .res 1");
    L.push("pad1_edge:  .res 1");
    L.push("game_state: .res 1    ; 0=splash 1=play 2=gameover");
    L.push("cur_screen: .res 1");
    L.push("scroll_x:   .res 1  ; Camada 5: fine scroll (0-255) dentro do par de telas visivel");
    L.push("nt_page:    .res 1  ; Camada 5: 0/1 - qual nametable fisica ($2000/$2400) tem a tela esquerda");
    L.push("gcw_col:    .res 1  ; scratch: coluna de pixel mundial pro check de parede durante scroll");
    L.push("gcw_sel:    .res 1  ; scratch: 0=tela esquerda(play_idx) 1=tela direita(play_idx+1)");
    L.push("gcw_screen: .res 1  ; scratch: indice global de tela resolvido p/ get_collision2");
    L.push("psn_screen: .res 1  ; scratch: indice global de tela p/ preload_screen_nt");
    L.push("psn_base_hi:.res 1  ; scratch: $20 ou $24 - pagina fisica alvo do preload_screen_nt");
    L.push("nmi_flag:   .res 1");
    L.push("tmp0:       .res 1");
    L.push("tmp1:       .res 1");
    L.push("player_x:   .res 1");
    L.push("player_y:   .res 1");
    L.push("player_on:  .res 1    ; 0=oculto 1=visivel");
    L.push("player_flip:.res 1    ; 0=normal !=0 flip H");
    L.push("player_frame: .res 1  ; frame atual da animacao do heroi (mesmo pool de sprite dos inimigos)");
    L.push("player_timer: .res 1  ; frames restantes ate proximo frame");
    L.push("on_ground:  .res 1");
    L.push("jump_cnt:   .res 1    ; frames restantes de impulso de pulo");
    L.push("col_x:      .res 1    ; tile X para consulta");
    L.push("col_y:      .res 1    ; tile Y para consulta");
    L.push("col_result: .res 1");
    L.push("ls_count:   .res 1    ; contador load_screen (nao reusa pad)");
    L.push("play_idx:   .res 1    ; indice 0..playCount-1 na sequencia da fase");
    // ---- Camada 3: pool de instâncias (SoA - struct of arrays, indexado por X) ----
    L.push(`; pool de ${NUM_INSTANCES} instancia(s) - SoA pra indexar com LDA tabela,X`);
    L.push(`inst_x:       .res ${NUM_INSTANCES}`);
    L.push(`inst_y:       .res ${NUM_INSTANCES}`);
    L.push(`inst_on:      .res ${NUM_INSTANCES}`);
    L.push(`inst_dir:     .res ${NUM_INSTANCES}   ; atributo OAM: 0=normal $40=flipH (tb usado p/ patrol)`);
    L.push(`inst_char:    .res ${NUM_INSTANCES}   ; indice do personagem (CharFrame*,X)`);
    L.push(`inst_frame:   .res ${NUM_INSTANCES}   ; frame atual da animacao padrao`);
    L.push(`inst_timer:   .res ${NUM_INSTANCES}   ; frames restantes ate proximo frame`);
    L.push("inst_tmp:     .res 1   ; indice de loop / scratch");
    L.push("cell_tl:      .res 1   ; scratch: 4 tiles do frame atual sendo desenhado");
    L.push("cell_tr:      .res 1");
    L.push("cell_bl:      .res 1");
    L.push("cell_br:      .res 1");
    L.push("oam_off:      .res 1   ; scratch: offset ($10 + slot*16) dentro da pagina $02xx");
    L.push("inst_scr_x:   .res 1   ; Camada 5: posicao X na tela (inst_x - scroll_x) do slot sendo desenhado");
    L.push("inst_grounded: .res 1  ; scratch: resultado de check_ground_inst (Camada 4)");
    L.push("en_tmp:     .res 1");
    if(musicChans){
      L.push("music_on:   .res 1");
      musicChans.forEach((_,i)=>{
        L.push(`ch${i}_timer: .res 1`);
        L.push(`ch${i}_pos:   .res 1`);
      });
    }
    L.push("");
    L.push('.segment "CODE"');
    L.push("");

    // ---- NMI ----
    L.push("NMI:");
    L.push("  PHA");
    L.push("  TXA");
    L.push("  PHA");
    L.push("  TYA");
    L.push("  PHA");
    L.push("  ; OAM DMA");
    L.push("  LDA #0");
    L.push("  STA $2003");
    L.push("  LDA #$02");
    L.push("  STA $4014");
    L.push("  ; garante sprites ligados");
    L.push("  LDA #%00011110");
    L.push("  STA $2001");
    L.push("  ; Camada 5: scroll continuo - so durante o jogo (fora disso fica fixo em 0,0)");
    L.push("  LDA game_state");
    L.push("  CMP #1");
    L.push("  BNE nmi_scroll_static");
    L.push("  LDA #%10010000");
    L.push("  ORA nt_page          ; bit0 = pagina nametable esquerda atual");
    L.push("  STA $2000");
    L.push("  BIT $2002");
    L.push("  LDA scroll_x");
    L.push("  STA $2005");
    L.push("  LDA #0");
    L.push("  STA $2005");
    L.push("  JMP nmi_scroll_done");
    L.push("nmi_scroll_static:");
    L.push("  LDA #%10010000");
    L.push("  STA $2000");
    L.push("  BIT $2002");
    L.push("  LDA #0");
    L.push("  STA $2005");
    L.push("  STA $2005");
    L.push("nmi_scroll_done:");
    if(musicChans){
      L.push("  JSR music_update");
    }
    L.push("  LDA #1");
    L.push("  STA nmi_flag");
    L.push("  PLA");
    L.push("  TAY");
    L.push("  PLA");
    L.push("  TAX");
    L.push("  PLA");
    L.push("  RTI");
    L.push("");
    L.push("IRQ:");
    L.push("  RTI");
    L.push("");

    // ---- music (reuse same pattern as single-screen) ----
    if(musicChans){
      L.push("music_update:");
      L.push("  LDA music_on");
      L.push("  BNE mu_run");
      L.push("  RTS");
      L.push("mu_run:");
      musicChans.forEach((mc, i)=>{
        const meta = CH_META[mc.type];
        const lbl = `mu_ch${i}`;
        L.push(`${lbl}:`);
        L.push(`  LDA ch${i}_timer`);
        L.push(`  BEQ ${lbl}_next`);
        L.push(`  DEC ch${i}_timer`);
        L.push(`  JMP ${lbl}_end`);
        L.push(`${lbl}_next:`);
        L.push(`  LDY ch${i}_pos`);
        L.push(`  LDA Scale_ch${i},Y`);
        L.push(`  CMP #$FF`);
        L.push(`  BNE ${lbl}_nof`);
        L.push(`  LDA #0`);
        L.push(`  STA ch${i}_pos`);
        L.push(`  LDY #0`);
        L.push(`  LDA Scale_ch${i},Y`);
        L.push(`${lbl}_nof:`);
        L.push(`  CMP #$FE`);
        L.push(`  BNE ${lbl}_play`);
        L.push(`  LDA #${meta.silence}`);
        L.push(`  STA ${meta.regVol}`);
        L.push(`  JMP ${lbl}_end`);
        L.push(`${lbl}_play:`);
        L.push(`  TAX`);
        L.push(`  LDA Time_ch${i},Y`);
        L.push(`  STA ch${i}_timer`);
        L.push(`  INY`);
        L.push(`  STY ch${i}_pos`);
        L.push(`  CPX #0`);
        L.push(`  BNE ${lbl}_tone`);
        L.push(`  LDA #${meta.silence}`);
        L.push(`  STA ${meta.regVol}`);
        L.push(`  JMP ${lbl}_end`);
        L.push(`${lbl}_tone:`);
        L.push(`  LDA #${meta.dutyVol}`);
        L.push(`  STA ${meta.regVol}`);
        L.push(`  LDA PitchLo_ch${i},X`);
        L.push(`  STA ${meta.regLo}`);
        L.push(`  LDA PitchHi_ch${i},X`);
        L.push(`  STA ${meta.regHi}`);
        L.push(`${lbl}_end:`);
      });
      L.push("  RTS");
      L.push("");
      L.push("music_init:");
      L.push("  LDA #0");
      musicChans.forEach((_,i)=>{
        L.push(`  STA ch${i}_timer`);
        L.push(`  STA ch${i}_pos`);
      });
      L.push("  LDA #$0F");
      L.push("  STA $4015");
      L.push("  LDA #1");
      L.push("  STA music_on");
      L.push("  RTS");
      L.push("");
    }

    // ---- read controller ----
    L.push("; Leitura do controle P1 (strobe padrão NES)");
    L.push("read_pad:");
    L.push("  LDA pad1");
    L.push("  STA pad1_old");
    L.push("  LDA #1");
    L.push("  STA $4016");
    L.push("  LDA #0");
    L.push("  STA $4016");
    L.push("  LDX #8");
    L.push("  LDA #0");
    L.push("  STA pad1");
    L.push("rp_loop:");
    L.push("  LDA $4016");
    L.push("  AND #1");
    L.push("  LSR A");
    L.push("  ROR pad1");
    L.push("  DEX");
    L.push("  BNE rp_loop");
    L.push("  ; edge = pad1 & ~pad1_old");
    L.push("  LDA pad1_old");
    L.push("  EOR #$FF");
    L.push("  AND pad1");
    L.push("  STA pad1_edge");
    L.push("  RTS");
    L.push("");

    // ---- load_screen: A = índice da tela ----
    L.push("; Carrega nametable+attrs da tela A (hard cut, rendering off)");
    L.push("load_screen:");
    L.push("  STA cur_screen");
    L.push("  ; desliga rendering E a geracao de NMI (bit 7 do $2000) - a escrita de ~1000 bytes");
    L.push("  ; leva mais de um frame; sem isso, o NMI (que agora escreve $2005 todo frame por");
    L.push("  ; causa do scroll da Camada 5) pode disparar NO MEIO da sequencia $2006/$2007 e");
    L.push("  ; embaralhar o latch de escrita da PPU, corrompendo a nametable inteira.");
    L.push("  LDA #0");
    L.push("  STA $2001");
    L.push("  STA $2000");
    L.push("  ; ponteiro da nametable (tabela de 1 byte por tela — SEM ASL)");
    L.push("  LDX cur_screen");
    L.push("  LDA ScreenNtLo,X");
    L.push("  STA tmp0");
    L.push("  LDA ScreenNtHi,X");
    L.push("  STA tmp1");
    L.push("  BIT $2002");
    L.push("  LDA #$20");
    L.push("  STA $2006");
    L.push("  LDA #$00");
    L.push("  STA $2006");
    L.push("  LDY #0");
    L.push("  LDX #4          ; 4×240 = 960 tiles");
    L.push("ls_nt_outer:");
    L.push("  LDA #240");
    L.push("  STA ls_count");
    L.push("ls_nt_inner:");
    L.push("  LDA (tmp0),Y");
    L.push("  STA $2007");
    L.push("  INY");
    L.push("  BNE ls_nt_noinc");
    L.push("  INC tmp1");
    L.push("ls_nt_noinc:");
    L.push("  DEC ls_count");
    L.push("  BNE ls_nt_inner");
    L.push("  DEX");
    L.push("  BNE ls_nt_outer");
    L.push("  ; attributes");
    L.push("  LDX cur_screen");
    L.push("  LDA ScreenAtLo,X");
    L.push("  STA tmp0");
    L.push("  LDA ScreenAtHi,X");
    L.push("  STA tmp1");
    L.push("  BIT $2002");
    L.push("  LDA #$23");
    L.push("  STA $2006");
    L.push("  LDA #$C0");
    L.push("  STA $2006");
    L.push("  LDY #0");
    L.push("ls_at:");
    L.push("  LDA (tmp0),Y");
    L.push("  STA $2007");
    L.push("  INY");
    L.push("  CPY #64");
    L.push("  BNE ls_at");
    L.push("  ; scroll zerado");
    L.push("  BIT $2002");
    L.push("  LDA #0");
    L.push("  STA $2005");
    L.push("  STA $2005");
    L.push("  ; religa NMI (o NMI corrige $2000/nt_page sozinho no proximo frame) + rendering");
    L.push("  LDA #%10010000");
    L.push("  STA $2000");
    L.push("  LDA #%00011110");
    L.push("  STA $2001");
    L.push("  RTS");
    L.push("");

    // ---- Camada 5: preload_screen_nt - escreve a nametable+attributes de uma tela numa das
    // duas paginas fisicas ($2000 ou $2400), SEM mexer no scroll (quem cuida disso e' o NMI).
    // Entrada: A = indice global da tela, gcw_sel usado soh como flag de qual pagina (0=$2000
    // 1=$2400) - precisa ficar em X antes de chamar (ver advance_screen_*). Ainda precisa
    // desligar o rendering por um instante (nao cabe ~1000 bytes num unico vblank) - e' um
    // flash breve, uma vez por travessia de tela, nao a cada frame. Limitacao conhecida/aceita.
    L.push("preload_screen_nt:");
    L.push("  STA psn_screen");
    L.push("  ; desliga rendering E geracao de NMI - mesmo motivo do load_screen (evita o NMI");
    L.push("  ; corromper o latch $2006/$2007 no meio da escrita longa)");
    L.push("  LDA #0");
    L.push("  STA $2001");
    L.push("  STA $2000");
    L.push("  LDX psn_screen");
    L.push("  LDA ScreenNtLo,X");
    L.push("  STA tmp0");
    L.push("  LDA ScreenNtHi,X");
    L.push("  STA tmp1");
    L.push("  BIT $2002");
    L.push("  LDA psn_base_hi     ; $20 ou $24, setado pelo chamador");
    L.push("  STA $2006");
    L.push("  LDA #$00");
    L.push("  STA $2006");
    L.push("  LDY #0");
    L.push("  LDX #4");
    L.push("psn_nt_outer:");
    L.push("  LDA #240");
    L.push("  STA ls_count");
    L.push("psn_nt_inner:");
    L.push("  LDA (tmp0),Y");
    L.push("  STA $2007");
    L.push("  INY");
    L.push("  BNE psn_nt_noinc");
    L.push("  INC tmp1");
    L.push("psn_nt_noinc:");
    L.push("  DEC ls_count");
    L.push("  BNE psn_nt_inner");
    L.push("  DEX");
    L.push("  BNE psn_nt_outer");
    L.push("  LDX psn_screen");
    L.push("  LDA ScreenAtLo,X");
    L.push("  STA tmp0");
    L.push("  LDA ScreenAtHi,X");
    L.push("  STA tmp1");
    L.push("  BIT $2002");
    L.push("  LDA psn_base_hi");
    L.push("  ORA #$03            ; mesma pagina, offset $3C0 dentro dela");
    L.push("  STA $2006");
    L.push("  LDA #$C0");
    L.push("  STA $2006");
    L.push("  LDY #0");
    L.push("psn_at:");
    L.push("  LDA (tmp0),Y");
    L.push("  STA $2007");
    L.push("  INY");
    L.push("  CPY #64");
    L.push("  BNE psn_at");
    L.push("  ; religa NMI (com nt_page atual) + rendering");
    L.push("  LDA #%10010000");
    L.push("  ORA nt_page");
    L.push("  STA $2000");
    L.push("  LDA #%00011110");
    L.push("  STA $2001");
    L.push("  RTS");
    L.push("");

    // ---- update_player_oam: le CharCells_${heroCharIdx}/CharDur_${heroCharIdx} (mesmo pool
    // de sprite dos inimigos - fix do bug em que o player ficava com tile errado) ----
    L.push("update_player_oam:");
    L.push("  LDA player_on");
    L.push("  BNE upo_draw");
    L.push("  ; esconde: Y=$FF nos 4 slots");
    L.push("  LDA #$FF");
    L.push("  STA $0200");
    L.push("  STA $0204");
    L.push("  STA $0208");
    L.push("  STA $020C");
    L.push("  RTS");
    L.push("upo_draw:");
    L.push("  ; tmp0/tmp1 -> ponteiro pros 4 bytes do frame atual (TL,TR,BL,BR)");
    L.push("  LDA player_frame");
    L.push("  ASL A");
    L.push("  ASL A                 ; frame*4");
    L.push("  CLC");
    L.push(`  ADC #<CharCells_${heroCharIdx}`);
    L.push("  STA tmp0");
    L.push(`  LDA #>CharCells_${heroCharIdx}`);
    L.push("  ADC #0");
    L.push("  STA tmp1");
    L.push("  LDY #0");
    L.push("  LDA (tmp0),Y");
    L.push("  STA cell_tl");
    L.push("  INY");
    L.push("  LDA (tmp0),Y");
    L.push("  STA cell_tr");
    L.push("  INY");
    L.push("  LDA (tmp0),Y");
    L.push("  STA cell_bl");
    L.push("  INY");
    L.push("  LDA (tmp0),Y");
    L.push("  STA cell_br");
    L.push("  LDA player_flip");
    L.push("  BEQ upo_noflip");
    L.push("  ; flip H: espelha o metasprite trocando TL<->TR e BL<->BR");
    L.push("  LDA cell_tl");
    L.push("  PHA");
    L.push("  LDA cell_tr");
    L.push("  STA cell_tl");
    L.push("  PLA");
    L.push("  STA cell_tr");
    L.push("  LDA cell_bl");
    L.push("  PHA");
    L.push("  LDA cell_br");
    L.push("  STA cell_bl");
    L.push("  PLA");
    L.push("  STA cell_br");
    L.push("upo_noflip:");
    L.push("  LDA player_flip");
    L.push("  BEQ upo_attr0");
    L.push("  LDA #%01000000     ; flip H");
    L.push("  STA tmp0");
    L.push("  JMP upo_write");
    L.push("upo_attr0:");
    L.push("  LDA #0");
    L.push("  STA tmp0");
    L.push("upo_write:");
    L.push("  ; --- TL ---");
    L.push("  LDA cell_tl");
    L.push("  CMP #$FF");
    L.push("  BEQ upo_tl_hide");
    L.push("  LDA player_y");
    L.push("  STA $0200");
    L.push("  LDA cell_tl");
    L.push("  STA $0201");
    L.push("  LDA tmp0");
    L.push("  STA $0202");
    L.push("  LDA player_x");
    L.push("  STA $0203");
    L.push("  JMP upo_tr");
    L.push("upo_tl_hide:");
    L.push("  LDA #$FF");
    L.push("  STA $0200");
    L.push("upo_tr:");
    L.push("  ; --- TR ---");
    L.push("  LDA cell_tr");
    L.push("  CMP #$FF");
    L.push("  BEQ upo_tr_hide");
    L.push("  LDA player_y");
    L.push("  STA $0204");
    L.push("  LDA cell_tr");
    L.push("  STA $0205");
    L.push("  LDA tmp0");
    L.push("  STA $0206");
    L.push("  LDA player_x");
    L.push("  CLC");
    L.push("  ADC #8");
    L.push("  STA $0207");
    L.push("  JMP upo_bl");
    L.push("upo_tr_hide:");
    L.push("  LDA #$FF");
    L.push("  STA $0204");
    L.push("upo_bl:");
    L.push("  ; --- BL ---");
    L.push("  LDA cell_bl");
    L.push("  CMP #$FF");
    L.push("  BEQ upo_bl_hide");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #8");
    L.push("  STA $0208");
    L.push("  LDA cell_bl");
    L.push("  STA $0209");
    L.push("  LDA tmp0");
    L.push("  STA $020A");
    L.push("  LDA player_x");
    L.push("  STA $020B");
    L.push("  JMP upo_br");
    L.push("upo_bl_hide:");
    L.push("  LDA #$FF");
    L.push("  STA $0208");
    L.push("upo_br:");
    L.push("  ; --- BR ---");
    L.push("  LDA cell_br");
    L.push("  CMP #$FF");
    L.push("  BEQ upo_br_hide");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #8");
    L.push("  STA $020C");
    L.push("  LDA cell_br");
    L.push("  STA $020D");
    L.push("  LDA tmp0");
    L.push("  STA $020E");
    L.push("  LDA player_x");
    L.push("  CLC");
    L.push("  ADC #8");
    L.push("  STA $020F");
    L.push("  RTS");
    L.push("upo_br_hide:");
    L.push("  LDA #$FF");
    L.push("  STA $020C");
    L.push("  RTS");
    L.push("");

    L.push("; avanca a animacao do heroi (mesmo esquema idle das instancias, mas so 1 personagem).");
    L.push("animate_player:");
    L.push("  LDA player_on");
    L.push("  BEQ ap_done");
    L.push("  DEC player_timer");
    L.push("  LDA player_timer");
    L.push("  BNE ap_done");
    L.push("  INC player_frame");
    L.push(`  LDA #${heroFrameCount}`);
    L.push("  CMP player_frame");
    L.push("  BNE ap_reload");
    L.push("  LDA #0");
    L.push("  STA player_frame");
    L.push("ap_reload:");
    L.push("  LDY player_frame");
    L.push(`  LDA CharDur_${heroCharIdx},Y`);
    L.push("  STA player_timer");
    L.push("ap_done:");
    L.push("  RTS");
    L.push("");

    L.push("spawn_player:");
    L.push("  LDA #40             ; X inicial");
    L.push("  STA player_x");
    L.push("  LDA #160            ; Y inicial");
    L.push("  STA player_y");
    L.push("  LDA #0");
    L.push("  STA player_flip");
    L.push("  STA jump_cnt");
    L.push("  STA on_ground");
    L.push("  STA play_idx       ; primeira tela da fase");
    L.push("  STA player_frame");
    L.push(`  LDA CharDur_${heroCharIdx}`);
    L.push("  STA player_timer");
    L.push("  LDA #1");
    L.push("  STA player_on");
    L.push("  JSR update_player_oam");
    L.push("  RTS");
    L.push("");

    // ---- troca de tela da fase (hard cut nas bordas) ----
    L.push("goto_play_screen:");
    L.push("  ; A = play_idx → carrega PlayScreenTable[A]");
    L.push("  TAX");
    L.push("  LDA PlayScreenTable,X");
    L.push("  JSR load_screen");
    L.push("  RTS");
    L.push("");

    L.push("try_screen_right:");
    L.push(`  LDA play_idx`);
    L.push(`  CMP #${Math.max(0, (collected.playCount || 1) - 1)}`);
    L.push("  BCS tsr_done");
    L.push("  INC play_idx");
    L.push("  LDA play_idx");
    L.push("  JSR goto_play_screen");
    L.push("  LDA #12             ; entra pela esquerda");
    L.push("  STA player_x");
    L.push("  JSR spawn_enemies");
    L.push("tsr_done:");
    L.push("  RTS");
    L.push("");

    L.push("try_screen_left:");
    L.push("  LDA play_idx");
    L.push("  BEQ tsl_done");
    L.push("  DEC play_idx");
    L.push("  LDA play_idx");
    L.push("  JSR goto_play_screen");
    L.push("  LDA #230            ; entra pela direita");
    L.push("  STA player_x");
    L.push("  JSR spawn_enemies");
    L.push("tsl_done:");
    L.push("  RTS");
    L.push("");

    // ---- Camada 5: cruzamento de tela durante o scroll continuo. Ao cruzar 256px, alterna
    // nt_page, avanca play_idx e pre-carrega a PROXIMA tela (play_idx+2) na pagina que acabou
    // de ficar totalmente fora da tela (flash breve - preload_screen_nt desliga o render por
    // um instante). Se nao houver play_idx+2, so faz a travessia (ultima tela, nada a pre-carregar).
    L.push("advance_screen_right:");
    L.push("  LDA nt_page          ; pagina que estava a esquerda (play_idx) - agora livre");
    L.push("  EOR #1");
    L.push("  STA nt_page          ; nova esquerda = quem era direita");
    L.push("  LDA play_idx");
    L.push("  CLC");
    L.push("  ADC #2");
    L.push(`  CMP #${Math.max(1, collected.playCount || 1)}`);
    L.push("  BCS asr_noload       ; play_idx+2 nao existe - nada a pre-carregar");
    L.push("  TAX");
    L.push("  LDA PlayScreenTable,X");
    L.push("  ; a pagina a reescrever e' a que ERA nt_page antes do EOR (a antiga esquerda)");
    L.push("  PHA");
    L.push("  LDA nt_page");
    L.push("  EOR #1");
    L.push("  BEQ asr_base0");
    L.push("  LDA #$24");
    L.push("  JMP asr_baseok");
    L.push("asr_base0:");
    L.push("  LDA #$20");
    L.push("asr_baseok:");
    L.push("  STA psn_base_hi");
    L.push("  PLA");
    L.push("  JSR preload_screen_nt");
    L.push("asr_noload:");
    L.push("  INC play_idx");
    L.push("  LDA play_idx");
    L.push("  TAX");
    L.push("  LDA PlayScreenTable,X");
    L.push("  STA cur_screen       ; enemies/colisao 'normal' passam a usar a nova tela esquerda");
    L.push("  JSR spawn_enemies");
    L.push("  RTS");
    L.push("");

    L.push("advance_screen_left:");
    L.push("  LDA nt_page");
    L.push("  EOR #1");
    L.push("  STA nt_page");
    L.push("  LDA play_idx        ; play_idx ainda e' o valor ANTIGO (esquerda antes da travessia)");
    L.push("  SEC");
    L.push("  SBC #1              ; nova esquerda = play_idx-1 - precisa ser carregada de novo");
    L.push("  BMI asl_noload      ; play_idx-1 < 0 -> inicio do mundo, nada a pre-carregar");
    L.push("  TAX");
    L.push("  LDA PlayScreenTable,X");
    L.push("  PHA");
    L.push("  LDA nt_page");
    L.push("  EOR #1");
    L.push("  BEQ asl_base0");
    L.push("  LDA #$24");
    L.push("  JMP asl_baseok");
    L.push("asl_base0:");
    L.push("  LDA #$20");
    L.push("asl_baseok:");
    L.push("  STA psn_base_hi");
    L.push("  PLA");
    L.push("  JSR preload_screen_nt");
    L.push("asl_noload:");
    L.push("  DEC play_idx");
    L.push("  LDA play_idx");
    L.push("  TAX");
    L.push("  LDA PlayScreenTable,X");
    L.push("  STA cur_screen");
    L.push("  JSR spawn_enemies");
    L.push("  RTS");
    L.push("");

    // ---- Camada 3: pool de instancias generico (SoA, X = slot 0..NUM_INSTANCES-1) ----
    L.push("clear_instances:");
    L.push("  LDX #0");
    L.push("ci_loop:");
    L.push("  LDA #0");
    L.push("  STA inst_on,X");
    L.push("  INX");
    L.push(`  CPX #${NUM_INSTANCES}`);
    L.push("  BEQ ci_done");
    L.push("  JMP ci_loop");
    L.push("ci_done:");
    L.push("  RTS");
    L.push("");
    // Le a tabela de spawn da tela atual (play_idx), gerada a partir de level-design.js
    // (Project.data.hitboxInstances). Formato por tela em EnemyData_N: count, depois
    // (x,y,charIdx) x count.
    L.push("spawn_enemies:");
    L.push("  JSR clear_instances");
    L.push("  LDX play_idx");
    L.push("  LDA EnemySpawnLo,X");
    L.push("  STA tmp0");
    L.push("  LDA EnemySpawnHi,X");
    L.push("  STA tmp1");
    L.push("  LDY #0");
    L.push("  LDA (tmp0),Y          ; count desta tela");
    L.push("  STA en_tmp");
    L.push("  INY");
    L.push("  LDX #0                ; X = slot do pool sendo preenchido");
    L.push("se_loop:");
    L.push("  LDA en_tmp");
    L.push("  BEQ se_done");
    L.push(`  CPX #${NUM_INSTANCES}`);
    L.push("  BEQ se_done           ; pool cheio, ignora o resto");
    L.push("  LDA (tmp0),Y");
    L.push("  STA inst_x,X");
    L.push("  INY");
    L.push("  LDA (tmp0),Y");
    L.push("  STA inst_y,X");
    L.push("  INY");
    L.push("  LDA (tmp0),Y");
    L.push("  STA inst_char,X");
    L.push("  INY");
    L.push("  LDA #1");
    L.push("  STA inst_on,X");
    L.push("  LDA #0");
    L.push("  STA inst_dir,X");
    L.push("  STA inst_frame,X");
    L.push("  ; load_frame_duration usa Y/tmp0/tmp1 como scratch - e' exatamente o que o loop");
    L.push("  ; acima usa como cursor de leitura em EnemyData_N. Sem salvar/restaurar aqui, a");
    L.push("  ; 2a instancia em diante lia lixo (Y resetava, tmp0/tmp1 apontavam pra outra tabela).");
    L.push("  TYA");
    L.push("  PHA");
    L.push("  LDA tmp0");
    L.push("  PHA");
    L.push("  LDA tmp1");
    L.push("  PHA");
    L.push("  JSR load_frame_duration   ; X=slot -> A = duracao do frame 0 do personagem");
    L.push("  STA inst_timer,X");
    L.push("  PLA");
    L.push("  STA tmp1");
    L.push("  PLA");
    L.push("  STA tmp0");
    L.push("  PLA");
    L.push("  TAY");
    L.push("  INX");
    L.push("  DEC en_tmp");
    L.push("  JMP se_loop");
    L.push("se_done:");
    L.push("  JSR update_instances_oam");
    L.push("  RTS");
    L.push("");
    // ---- tabelas de sprite por personagem (Camada 3) ----
    L.push("; X = slot -> le inst_char,X e inst_frame,X, retorna duracao (frames) em A");
    L.push("load_frame_duration:");
    L.push("  LDA inst_char,X");
    L.push("  TAY");
    L.push("  LDA CharFrameDurLo,Y");
    L.push("  STA tmp0");
    L.push("  LDA CharFrameDurHi,Y");
    L.push("  STA tmp1");
    L.push("  LDY inst_frame,X");
    L.push("  LDA (tmp0),Y");
    L.push("  RTS");
    L.push("");
    L.push("; X = slot -> aponta tmp0/tmp1 pros 4 bytes de tile do frame atual (TL,TR,BL,BR;");
    L.push("; $FF = celula oculta). Y fica sujo, X preservado.");
    L.push("load_frame_cellptr:");
    L.push("  LDA inst_char,X");
    L.push("  TAY");
    L.push("  LDA CharFrameCellsLo,Y");
    L.push("  STA tmp0");
    L.push("  LDA CharFrameCellsHi,Y");
    L.push("  STA tmp1");
    L.push("  LDA inst_frame,X");
    L.push("  ASL A");
    L.push("  ASL A                 ; frame*4");
    L.push("  CLC");
    L.push("  ADC tmp0");
    L.push("  STA tmp0");
    L.push("  BCC lfc_done");
    L.push("  INC tmp1");
    L.push("lfc_done:");
    L.push("  RTS");
    L.push("");
    L.push("; calcula oam_off = $10 + X*16 (X = slot). Preserva X.");
    L.push("uio_calc_off:");
    L.push("  TXA");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A                 ; X*16");
    L.push("  CLC");
    L.push("  ADC #$10               ; pula os 4 sprites do player ($0200-$020F)");
    L.push("  STA oam_off");
    L.push("  RTS");
    L.push("");
    L.push("; desenha ate NUM_INSTANCES metasprites 2x2 (16x16) em $0210+, 4 OAM por slot.");
    L.push("update_instances_oam:");
    L.push("  LDX #0");
    L.push("uio_loop:");
    L.push("  LDA inst_on,X");
    L.push("  BNE uio_draw");
    L.push("  JSR uio_calc_off");
    L.push("  LDY oam_off");
    L.push("  LDA #$FF");
    L.push("  STA $0200,Y");
    L.push("  STA $0204,Y");
    L.push("  STA $0208,Y");
    L.push("  STA $020C,Y");
    L.push("  JMP uio_next");
    L.push("uio_draw:");
    L.push("  ; Camada 5: posicao na tela = inst_x - scroll_x (inimigos sempre pertencem a tela");
    L.push("  ; esquerda atual/cur_screen). Se der borrow, saiu da tela pela esquerda - esconde.");
    L.push("  LDA inst_x,X");
    L.push("  SEC");
    L.push("  SBC scroll_x");
    L.push("  BCS uio_x_ok");
    L.push("  JMP uio_offscreen");
    L.push("uio_x_ok:");
    L.push("  STA inst_scr_x");
    L.push("  JSR load_frame_cellptr");
    L.push("  LDY #0");
    L.push("  LDA (tmp0),Y");
    L.push("  STA cell_tl");
    L.push("  INY");
    L.push("  LDA (tmp0),Y");
    L.push("  STA cell_tr");
    L.push("  INY");
    L.push("  LDA (tmp0),Y");
    L.push("  STA cell_bl");
    L.push("  INY");
    L.push("  LDA (tmp0),Y");
    L.push("  STA cell_br");
    L.push("  LDA inst_dir,X");
    L.push("  BEQ uio_noflip");
    L.push("  ; flip H: espelha o metasprite trocando TL<->TR e BL<->BR");
    L.push("  LDA cell_tl");
    L.push("  PHA");
    L.push("  LDA cell_tr");
    L.push("  STA cell_tl");
    L.push("  PLA");
    L.push("  STA cell_tr");
    L.push("  LDA cell_bl");
    L.push("  PHA");
    L.push("  LDA cell_br");
    L.push("  STA cell_bl");
    L.push("  PLA");
    L.push("  STA cell_br");
    L.push("uio_noflip:");
    L.push("  JSR uio_calc_off");
    L.push("  LDY oam_off");
    L.push("  ; --- TL ---");
    L.push("  LDA cell_tl");
    L.push("  CMP #$FF");
    L.push("  BEQ uio_tl_hide");
    L.push("  LDA inst_y,X");
    L.push("  STA $0200,Y");
    L.push("  LDA cell_tl");
    L.push("  STA $0201,Y");
    L.push("  LDA inst_dir,X");
    L.push("  STA $0202,Y");
    L.push("  LDA inst_scr_x");
    L.push("  STA $0203,Y");
    L.push("  JMP uio_tr");
    L.push("uio_tl_hide:");
    L.push("  LDA #$FF");
    L.push("  STA $0200,Y");
    L.push("uio_tr:");
    L.push("  ; --- TR ---");
    L.push("  LDA cell_tr");
    L.push("  CMP #$FF");
    L.push("  BEQ uio_tr_hide");
    L.push("  LDA inst_y,X");
    L.push("  STA $0204,Y");
    L.push("  LDA cell_tr");
    L.push("  STA $0205,Y");
    L.push("  LDA inst_dir,X");
    L.push("  STA $0206,Y");
    L.push("  LDA inst_scr_x");
    L.push("  CLC");
    L.push("  ADC #8");
    L.push("  STA $0207,Y");
    L.push("  JMP uio_bl");
    L.push("uio_tr_hide:");
    L.push("  LDA #$FF");
    L.push("  STA $0204,Y");
    L.push("uio_bl:");
    L.push("  ; --- BL ---");
    L.push("  LDA cell_bl");
    L.push("  CMP #$FF");
    L.push("  BEQ uio_bl_hide");
    L.push("  LDA inst_y,X");
    L.push("  CLC");
    L.push("  ADC #8");
    L.push("  STA $0208,Y");
    L.push("  LDA cell_bl");
    L.push("  STA $0209,Y");
    L.push("  LDA inst_dir,X");
    L.push("  STA $020A,Y");
    L.push("  LDA inst_scr_x");
    L.push("  STA $020B,Y");
    L.push("  JMP uio_br");
    L.push("uio_bl_hide:");
    L.push("  LDA #$FF");
    L.push("  STA $0208,Y");
    L.push("uio_br:");
    L.push("  ; --- BR ---");
    L.push("  LDA cell_br");
    L.push("  CMP #$FF");
    L.push("  BEQ uio_br_hide");
    L.push("  LDA inst_y,X");
    L.push("  CLC");
    L.push("  ADC #8");
    L.push("  STA $020C,Y");
    L.push("  LDA cell_br");
    L.push("  STA $020D,Y");
    L.push("  LDA inst_dir,X");
    L.push("  STA $020E,Y");
    L.push("  LDA inst_scr_x");
    L.push("  CLC");
    L.push("  ADC #8");
    L.push("  STA $020F,Y");
    L.push("  JMP uio_next");
    L.push("uio_br_hide:");
    L.push("  LDA #$FF");
    L.push("  STA $020C,Y");
    L.push("uio_offscreen:");
    L.push("  JSR uio_calc_off");
    L.push("  LDY oam_off");
    L.push("  LDA #$FF");
    L.push("  STA $0200,Y");
    L.push("  STA $0204,Y");
    L.push("  STA $0208,Y");
    L.push("  STA $020C,Y");
    L.push("  JMP uio_next");
    L.push("uio_next:");
    L.push("  INX");
    L.push(`  CPX #${NUM_INSTANCES}`);
    L.push("  BEQ uio_done");
    L.push("  JMP uio_loop");
    L.push("uio_done:");
    L.push("  RTS");
    L.push("");
    L.push("; avanca o timer/frame de animacao (idle simples) de cada instancia ativa.");
    L.push("animate_instances:");
    L.push("  LDX #0");
    L.push("ai_loop:");
    L.push("  LDA inst_on,X");
    L.push("  BEQ ai_next");
    L.push("  DEC inst_timer,X");
    L.push("  LDA inst_timer,X");
    L.push("  BNE ai_next");
    L.push("  INC inst_frame,X");
    L.push("  LDA inst_char,X");
    L.push("  TAY");
    L.push("  LDA CharFrameCount,Y");
    L.push("  CMP inst_frame,X      ; Z=1 se estourou (frame chegou no total)");
    L.push("  BNE ai_reload");
    L.push("  LDA #0");
    L.push("  STA inst_frame,X");
    L.push("ai_reload:");
    L.push("  JSR load_frame_duration");
    L.push("  STA inst_timer,X");
    L.push("ai_next:");
    L.push("  INX");
    L.push(`  CPX #${NUM_INSTANCES}`);
    L.push("  BEQ ai_done");
    L.push("  JMP ai_loop");
    L.push("ai_done:");
    L.push("  RTS");
    L.push("");
    L.push("; ---- Camada 4: colisao instancia vs solido (chao/parede), parametrizada por X=slot ----");
    L.push("; mesma logica de check_ground/check_wall_at do player, mas lendo inst_x/inst_y,X.");
    L.push("; X e preservado ao redor de get_collision (que usa X internamente pra ScreenColLo/Hi).");
    L.push("check_ground_inst:");
    L.push("  LDA #0");
    L.push("  STA inst_grounded");
    L.push("  LDA inst_y,X");
    L.push("  CLC");
    L.push("  ADC #16");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  LDA inst_x,X");
    L.push("  CLC");
    L.push("  ADC #2");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_x");
    L.push("  STX inst_tmp");
    L.push("  JSR get_collision");
    L.push("  LDX inst_tmp");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE cgi_yes");
    L.push("  LDA inst_x,X");
    L.push("  CLC");
    L.push("  ADC #13");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_x");
    L.push("  STX inst_tmp");
    L.push("  JSR get_collision");
    L.push("  LDX inst_tmp");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE cgi_yes");
    L.push("  RTS");
    L.push("cgi_yes:");
    L.push("  LDA #1");
    L.push("  STA inst_grounded");
    L.push("  LDA col_y");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  SEC");
    L.push("  SBC #16");
    L.push("  STA inst_y,X");
    L.push("  RTS");
    L.push("");
    L.push("; col_x ja setado pelo chamador; testa 2 pontos verticais do corpo (X=slot).");
    L.push("check_wall_at_inst:");
    L.push("  LDA inst_y,X");
    L.push("  CLC");
    L.push("  ADC #4");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  STX inst_tmp");
    L.push("  JSR get_collision");
    L.push("  LDX inst_tmp");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE cwi_hit");
    L.push("  LDA inst_y,X");
    L.push("  CLC");
    L.push("  ADC #12");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  STX inst_tmp");
    L.push("  JSR get_collision");
    L.push("  LDX inst_tmp");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE cwi_hit");
    L.push("  LDA #0");
    L.push("  STA col_result");
    L.push("  RTS");
    L.push("cwi_hit:");
    L.push("  LDA #1");
    L.push("  STA col_result");
    L.push("  RTS");
    L.push("");
    L.push("; patrulha com gravidade + colisao real: cai (4px/frame) quando nao tem chao sob os pes;");
    L.push("; quando no chao, anda 1px/frame e vira ao bater numa parede (check_wall_at_inst) ou ao");
    L.push("; chegar no limite de seguranca da tela. Sem deteccao de beirada (pode cair de plataforma -");
    L.push("; decisao explicita, fica pra depois). Usa o bit $40 de inst_dir (mesmo bit do flip H de");
    L.push("; OAM) como 'esta virado pra esquerda' - flip e direcao de movimento sempre batem.");
    L.push("update_instances_ai:");
    L.push("  LDX #0");
    L.push("uia_loop:");
    L.push("  LDA inst_on,X");
    L.push("  BEQ uia_next");
    L.push("  JSR check_ground_inst");
    L.push("  LDA inst_grounded");
    L.push("  BNE uia_walk");
    L.push("  ; caindo: aplica gravidade e nao anda nesse frame");
    L.push("  LDA inst_y,X");
    L.push("  CLC");
    L.push("  ADC #4");
    L.push("  STA inst_y,X");
    L.push("  JMP uia_next");
    L.push("uia_walk:");
    L.push("  LDA inst_dir,X");
    L.push("  AND #$40");
    L.push("  BNE uia_left");
    L.push("  ; indo pra direita: testa parede na borda direita proposta (x+1+13)");
    L.push("  LDA inst_x,X");
    L.push("  CLC");
    L.push("  ADC #1");
    L.push("  CLC");
    L.push("  ADC #13");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_x");
    L.push("  JSR check_wall_at_inst");
    L.push("  LDA col_result");
    L.push("  BNE uia_turn_left");
    L.push("  LDA inst_x,X");
    L.push("  CLC");
    L.push("  ADC #1");
    L.push("  STA inst_x,X");
    L.push("  CMP #232          ; limite de seguranca (evita overflow do byte perto da borda)");
    L.push("  BCC uia_next");
    L.push("uia_turn_left:");
    L.push("  LDA inst_dir,X");
    L.push("  ORA #$40");
    L.push("  STA inst_dir,X");
    L.push("  JMP uia_next");
    L.push("uia_left:");
    L.push("  ; indo pra esquerda: testa parede na borda esquerda proposta (x-1+2)");
    L.push("  LDA inst_x,X");
    L.push("  SEC");
    L.push("  SBC #1");
    L.push("  CLC");
    L.push("  ADC #2");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_x");
    L.push("  JSR check_wall_at_inst");
    L.push("  LDA col_result");
    L.push("  BNE uia_turn_right");
    L.push("  LDA inst_x,X");
    L.push("  SEC");
    L.push("  SBC #1");
    L.push("  STA inst_x,X");
    L.push("  CMP #20           ; limite de seguranca");
    L.push("  BCS uia_next");
    L.push("uia_turn_right:");
    L.push("  LDA inst_dir,X");
    L.push("  AND #$BF");
    L.push("  STA inst_dir,X");
    L.push("uia_next:");
    L.push("  INX");
    L.push(`  CPX #${NUM_INSTANCES}`);
    L.push("  BEQ uia_done");
    L.push("  JMP uia_loop");
    L.push("uia_done:");
    L.push("  RTS");
    L.push("");
    L.push("; --- Acoes genericas (Camada 6 vai chamar via regras compiladas) ---");
    L.push("; X = slot. Mata a instancia (esconde e libera o pool imediatamente).");
    L.push("action_kill_instance:");
    L.push("  LDA #0");
    L.push("  STA inst_on,X");
    L.push("  RTS");
    L.push("");
    L.push("; X = slot, A = direcao (0=direita 1=esquerda 2=cima 3=baixo), Y = passo em pixels.");
    L.push("; Ajusta x/y e o flip (inst_dir) de acordo com a direcao. Troca de animacao (o animId");
    L.push("; escolhido na Acao Mover) fica pra quando o compilador de regras (Camada 6) existir -");
    L.push("; hoje so a animacao padrao (animations[0]) de cada personagem roda em runtime.");
    L.push("action_move_instance:");
    L.push("  CMP #0");
    L.push("  BNE ami_1");
    L.push("  STY tmp0");
    L.push("  LDA inst_x,X");
    L.push("  CLC");
    L.push("  ADC tmp0");
    L.push("  STA inst_x,X");
    L.push("  LDA inst_dir,X");
    L.push("  AND #$BF");
    L.push("  STA inst_dir,X");
    L.push("  RTS");
    L.push("ami_1:");
    L.push("  CMP #1");
    L.push("  BNE ami_2");
    L.push("  STY tmp0");
    L.push("  LDA inst_x,X");
    L.push("  SEC");
    L.push("  SBC tmp0");
    L.push("  STA inst_x,X");
    L.push("  LDA inst_dir,X");
    L.push("  ORA #$40");
    L.push("  STA inst_dir,X");
    L.push("  RTS");
    L.push("ami_2:");
    L.push("  CMP #2");
    L.push("  BNE ami_3");
    L.push("  STY tmp0");
    L.push("  LDA inst_y,X");
    L.push("  SEC");
    L.push("  SBC tmp0");
    L.push("  STA inst_y,X");
    L.push("  RTS");
    L.push("ami_3:");
    L.push("  STY tmp0");
    L.push("  LDA inst_y,X");
    L.push("  CLC");
    L.push("  ADC tmp0");
    L.push("  STA inst_y,X");
    L.push("  RTS");
    L.push("");
    L.push("; substitui o antigo bloco fixo de patrol+colisao+desenho por personagem");
    L.push("update_enemies:");
    L.push("  JSR update_instances_ai");
    L.push("  JSR animate_instances");
    L.push("  JSR check_player_enemy_hit");
    L.push("  JSR update_instances_oam");
    L.push("  RTS");
    L.push("");
    L.push("check_player_enemy_hit:");
    L.push("  LDA player_on");
    L.push("  BEQ cpe_done");
    L.push("  LDX #0");
    L.push("cpe_loop:");
    L.push("  LDA inst_on,X");
    L.push("  BEQ cpe_next");
    L.push("  LDA player_x");
    L.push("  CLC");
    L.push("  ADC #12");
    L.push("  CMP inst_x,X");
    L.push("  BCC cpe_next");
    L.push("  LDA inst_x,X");
    L.push("  CLC");
    L.push("  ADC #12");
    L.push("  CMP player_x");
    L.push("  BCC cpe_next");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #14");
    L.push("  CMP inst_y,X");
    L.push("  BCC cpe_next");
    L.push("  LDA inst_y,X");
    L.push("  CLC");
    L.push("  ADC #14");
    L.push("  CMP player_y");
    L.push("  BCC cpe_next");
    L.push("  JMP player_hurt");
    L.push("cpe_next:");
    L.push("  INX");
    L.push(`  CPX #${NUM_INSTANCES}`);
    L.push("  BEQ cpe_done");
    L.push("  JMP cpe_loop");
    L.push("cpe_done:");
    L.push("  RTS");
    L.push("");

    L.push("player_hurt:");
    L.push("  ; respawn simples na tela atual");
    L.push("  LDA #40");
    L.push("  STA player_x");
    L.push("  LDA #160");
    L.push("  STA player_y");
    L.push("  LDA #0");
    L.push("  STA jump_cnt");
    L.push("  RTS");
    L.push("");

    L.push("hide_player:");
    L.push("  LDA #0");
    L.push("  STA player_on");
    L.push("  JSR update_player_oam");
    L.push("  RTS");
    L.push("");

    // ---- get_collision: col_x (0-31), col_y (0-29) → col_result (tipo 0-5) ----
    L.push("get_collision:");
    L.push("  LDA col_y");
    L.push("  CMP #30");
    L.push("  BCS gc_oob");
    L.push("  LDA col_x");
    L.push("  CMP #32");
    L.push("  BCS gc_oob");
    L.push("  ; offset low = (col_y & 7)*32 + col_x ; page = col_y >> 3");
    L.push("  LDA col_y");
    L.push("  AND #7");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  CLC");
    L.push("  ADC col_x");
    L.push("  TAY");
    L.push("  LDX cur_screen");
    L.push("  LDA ScreenColLo,X");
    L.push("  STA tmp0");
    L.push("  LDA ScreenColHi,X");
    L.push("  STA tmp1");
    L.push("  LDA col_y");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  CLC");
    L.push("  ADC tmp1");
    L.push("  STA tmp1");
    L.push("  LDA (tmp0),Y");
    L.push("  STA col_result");
    L.push("  RTS");
    L.push("gc_oob:");
    L.push("  LDA #0");
    L.push("  STA col_result");
    L.push("  RTS");
    L.push("");

    // ---- Camada 5: como get_collision, mas le a tela de gcw_screen (indice global) em vez de
    // cur_screen - usada só durante o teste de parede no cruzamento de tela (scroll).
    L.push("get_collision2:");
    L.push("  LDA col_y");
    L.push("  CMP #30");
    L.push("  BCS gc2_oob");
    L.push("  LDA col_x");
    L.push("  CMP #32");
    L.push("  BCS gc2_oob");
    L.push("  LDA col_y");
    L.push("  AND #7");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  CLC");
    L.push("  ADC col_x");
    L.push("  TAY");
    L.push("  LDX gcw_screen");
    L.push("  LDA ScreenColLo,X");
    L.push("  STA tmp0");
    L.push("  LDA ScreenColHi,X");
    L.push("  STA tmp1");
    L.push("  LDA col_y");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  CLC");
    L.push("  ADC tmp1");
    L.push("  STA tmp1");
    L.push("  LDA (tmp0),Y");
    L.push("  STA col_result");
    L.push("  RTS");
    L.push("gc2_oob:");
    L.push("  LDA #0");
    L.push("  STA col_result");
    L.push("  RTS");
    L.push("");

    // ---- Camada 5 fix: world_col_from - resolve col_x + gcw_screen a partir de um offset
    // LOCAL (relativo a player_x, sem scroll) somando scroll_x. Usado por check_ground e
    // check_wall_at pra ficarem "conscientes do par de telas", igual as sondas de cruzamento
    // já eram - sem isso, colisão dessincroniza do cenário assim que scroll_x != 0 (o player_x
    // é posição NA TELA, não posição no mapa - o tile debaixo dos pés é (scroll_x+player_x)/8,
    // não player_x/8 sozinho). Entrada: A = player_x +/- delta (offset local, 0-255, sem
    // scroll). Saida: col_x setado, gcw_screen resolvido (pronto pra get_collision2).
    L.push("world_col_from:");
    L.push("  CLC");
    L.push("  ADC scroll_x");
    L.push("  STA gcw_col");
    L.push("  LDA #0");
    L.push("  BCC wcf_sel_ok");
    L.push("  LDA #1");
    L.push("wcf_sel_ok:");
    L.push("  STA gcw_sel");
    L.push("  BEQ wcf_use_cur");
    L.push("  LDA play_idx");
    L.push("  CLC");
    L.push("  ADC #1");
    L.push("  JMP wcf_have");
    L.push("wcf_use_cur:");
    L.push("  LDA play_idx");
    L.push("wcf_have:");
    L.push("  TAX");
    L.push("  LDA PlayScreenTable,X");
    L.push("  STA gcw_screen");
    L.push("  LDA gcw_col");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_x");
    L.push("  RTS");
    L.push("");

    // ---- solid_at_feet: verifica 2 tiles sob os pés (player 16x16) ----
    L.push("check_ground:");
    L.push("  LDA #0");
    L.push("  STA on_ground");
    L.push("  ; tile Y = (player_y + 16) / 8");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #16");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  ; tile X esquerdo (mundo: scroll_x + player_x + 2)");
    L.push("  LDA player_x");
    L.push("  CLC");
    L.push("  ADC #2");
    L.push("  JSR world_col_from");
    L.push("  JSR get_collision2");
    L.push("  LDA col_result");
    L.push("  CMP #1");
    L.push("  BEQ cg_yes");
    L.push("  CMP #2");
    L.push("  BEQ cg_yes");
    L.push("  ; tile X direito (mundo: scroll_x + player_x + 13)");
    L.push("  LDA player_x");
    L.push("  CLC");
    L.push("  ADC #13");
    L.push("  JSR world_col_from");
    L.push("  JSR get_collision2");
    L.push("  LDA col_result");
    L.push("  CMP #1");
    L.push("  BEQ cg_yes");
    L.push("  CMP #2");
    L.push("  BEQ cg_yes");
    L.push("  RTS");
    L.push("cg_yes:");
    L.push("  LDA #1");
    L.push("  STA on_ground");
    L.push("  ; snap Y ao topo do tile");
    L.push("  LDA col_y");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  ASL A");
    L.push("  SEC");
    L.push("  SBC #16");
    L.push("  STA player_y");
    L.push("  RTS");
    L.push("");

    // ---- is_solid: col_result em A → Z=1 se solido (tipo 1 ou 2) ----
    L.push("is_solid:");
    L.push("  CMP #1");
    L.push("  BEQ is_yes");
    L.push("  CMP #2");
    L.push("  BEQ is_yes");
    L.push("  LDA #0");
    L.push("  RTS");
    L.push("is_yes:");
    L.push("  LDA #1");
    L.push("  RTS");
    L.push("");

    // ---- check_wall_at: col_x/gcw_screen ja setados (via world_col_from); testa 2 pontos
    // verticais no corpo. Retorna col_result=1 se QUALQUER ponto for solido.
    L.push("check_wall_at:");
    L.push("  ; ponto superior (player_y + 4)");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #4");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  JSR get_collision2");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE cw_hit");
    L.push("  ; ponto medio (player_y + 12)");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #12");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  JSR get_collision2");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE cw_hit");
    L.push("  LDA #0");
    L.push("  STA col_result");
    L.push("  RTS");
    L.push("cw_hit:");
    L.push("  LDA #1");
    L.push("  STA col_result");
    L.push("  RTS");
    L.push("");

    // ---- update_player: input + gravidade + pulo + paredes ----
    L.push("update_player:");
    L.push("  LDA player_on");
    L.push("  BNE up_go");
    L.push("  RTS");
    L.push("up_go:");
    L.push("  ; --- horizontal + colisao lateral (Camada 5: deadzone de camera 96-152) ---");
    L.push("  LDA pad1");
    L.push("  AND #%01000000      ; Left bit6");
    L.push("  BNE up_left_check");
    L.push("  JMP up_right");
    L.push("up_left_check:");
    L.push("  LDA player_x");
    L.push("  CMP #96             ; DEADZONE_LEFT");
    L.push("  BCC uls_deadzone    ; player_x < 96 -> tenta rolar em vez de mover o sprite");
    L.push("  JMP up_left_move    ; dentro/alem da deadzone -> movimento livre normal");
    L.push("uls_deadzone:");
    L.push("  LDA play_idx");
    L.push("  BNE uls_try_scroll");
    L.push("  ; play_idx==0: nao ha tela anterior - clamp antigo em 8, sem scroll");
    L.push("  LDA player_x");
    L.push("  CMP #8");
    L.push("  BCS up_left_move");
    L.push("  JMP up_right");
    L.push("uls_try_scroll:");
    L.push("  ; testa parede NO MUNDO na posicao proposta. gcw_col precisa ser a coluna");
    L.push("  ; DENTRO DO PAR de telas visivel (scroll_x + posicao NA TELA do player, nao so");
    L.push("  ; o delta) - por isso soma DEADZONE_LEFT(96), nao so o movimento. Selecao de tela");
    L.push("  ; e' sempre por ADC/carry (>=256 -> play_idx+1), independente da direcao do");
    L.push("  ; movimento - e' sobre POSICAO no mundo, nao sobre pra que lado anda.");
    L.push("  LDA scroll_x");
    L.push("  CLC");
    L.push("  ADC #95             ; DEADZONE_LEFT(96) - 3(mov) + 2(sonda) = 95");
    L.push("  STA gcw_col");
    L.push("  LDA #0");
    L.push("  BCC uls_sel_ok      ; sem overflow -> tela atual (play_idx)");
    L.push("  LDA #1              ; overflow -> proxima tela (play_idx+1)");
    L.push("uls_sel_ok:");
    L.push("  STA gcw_sel");
    L.push("  BEQ uls_use_cur");
    L.push("  LDA play_idx");
    L.push("  CLC");
    L.push("  ADC #1");
    L.push("  JMP uls_have");
    L.push("uls_use_cur:");
    L.push("  LDA play_idx");
    L.push("uls_have:");
    L.push("  TAX");
    L.push("  LDA PlayScreenTable,X");
    L.push("  STA gcw_screen");
    L.push("  LDA gcw_col");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_x");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #4");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  JSR get_collision2");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE up_right         ; bloqueado - segue pro botao direito, igual antes");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #12");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  JSR get_collision2");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE up_right");
    L.push("  ; livre: rola o mundo pra esquerda");
    L.push("  LDA scroll_x");
    L.push("  SEC");
    L.push("  SBC #3");
    L.push("  STA scroll_x");
    L.push("  BCS uls_no_cross     ; sem borrow -> nao cruzou 256");
    L.push("  JSR advance_screen_left");
    L.push("uls_no_cross:");
    L.push("  LDA #1");
    L.push("  STA player_flip");
    L.push("up_left_move:");
    L.push("  ; tile X na borda esquerda proposta (x-3+2) - movimento livre dentro da deadzone");
    L.push("  LDA player_x");
    L.push("  SEC");
    L.push("  SBC #3");
    L.push("  CLC");
    L.push("  ADC #2");
    L.push("  JSR world_col_from");
    L.push("  JSR check_wall_at");
    L.push("  LDA col_result");
    L.push("  BNE up_right           ; bloqueado");
    L.push("  LDA player_x");
    L.push("  SEC");
    L.push("  SBC #3");
    L.push("  STA player_x");
    L.push("  LDA #1");
    L.push("  STA player_flip");
    L.push("up_right:");
    L.push("  LDA pad1");
    L.push("  AND #%10000000      ; Right bit7");
    L.push("  BNE up_right_check");
    L.push("  JMP up_jump");
    L.push("up_right_check:");
    L.push("  LDA player_x");
    L.push("  CMP #152            ; DEADZONE_RIGHT");
    L.push("  BCS urs_deadzone    ; player_x >= 152 -> tenta rolar em vez de mover o sprite");
    L.push("  JMP up_right_move   ; dentro da deadzone -> movimento livre normal");
    L.push("urs_deadzone:");
    L.push("  LDA play_idx");
    L.push(`  CMP #${Math.max(0, (collected.playCount || 1) - 1)}`);
    L.push("  BCC urs_try_scroll  ; play_idx < ultima tela -> ha pra onde rolar");
    L.push("  ; play_idx == ultima tela: nao ha mais o que rolar - clamp antigo em 232");
    L.push("  LDA player_x");
    L.push("  CMP #232");
    L.push("  BCC up_right_move");
    L.push("  JMP up_jump");
    L.push("urs_try_scroll:");
    L.push("  ; testa parede NO MUNDO (scroll_x + DEADZONE_RIGHT(152) + sonda direita(+13) + mov(+3))");
    L.push("  LDA scroll_x");
    L.push("  CLC");
    L.push("  ADC #168");
    L.push("  STA gcw_col");
    L.push("  LDA #0");
    L.push("  BCC urs_sel_ok      ; sem overflow -> ainda na tela atual (play_idx)");
    L.push("  LDA #1              ; overflow -> proxima tela (play_idx+1)");
    L.push("urs_sel_ok:");
    L.push("  STA gcw_sel");
    L.push("  BEQ urs_use_cur");
    L.push("  LDA play_idx");
    L.push("  CLC");
    L.push("  ADC #1");
    L.push("  JMP urs_have");
    L.push("urs_use_cur:");
    L.push("  LDA play_idx");
    L.push("urs_have:");
    L.push("  TAX");
    L.push("  LDA PlayScreenTable,X");
    L.push("  STA gcw_screen");
    L.push("  LDA gcw_col");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_x");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #4");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  JSR get_collision2");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE up_jump          ; bloqueado");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #12");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  LSR A");
    L.push("  STA col_y");
    L.push("  JSR get_collision2");
    L.push("  LDA col_result");
    L.push("  JSR is_solid");
    L.push("  BNE up_jump");
    L.push("  ; livre: rola o mundo pra direita");
    L.push("  LDA scroll_x");
    L.push("  CLC");
    L.push("  ADC #3");
    L.push("  STA scroll_x");
    L.push("  BCC urs_no_cross     ; sem overflow -> nao cruzou 256");
    L.push("  JSR advance_screen_right");
    L.push("urs_no_cross:");
    L.push("  LDA #0");
    L.push("  STA player_flip");
    L.push("  JMP up_jump");
    L.push("up_right_move:");
    L.push("  ; tile X na borda direita proposta (x+3+13) - movimento livre dentro da deadzone");
    L.push("  LDA player_x");
    L.push("  CLC");
    L.push("  ADC #3");
    L.push("  CLC");
    L.push("  ADC #13");
    L.push("  JSR world_col_from");
    L.push("  JSR check_wall_at");
    L.push("  LDA col_result");
    L.push("  BNE up_jump            ; bloqueado");
    L.push("  LDA player_x");
    L.push("  CLC");
    L.push("  ADC #3");
    L.push("  STA player_x");
    L.push("  LDA #0");
    L.push("  STA player_flip");
    L.push("up_jump:");
    L.push("  ; B ou A (edge) + on_ground → pulo");
    L.push("  LDA pad1_edge");
    L.push("  AND #%00000011      ; A ou B");
    L.push("  BEQ up_vert");
    L.push("  LDA on_ground");
    L.push("  BEQ up_vert");
    L.push("  LDA #14");
    L.push("  STA jump_cnt");
    L.push("  LDA #0");
    L.push("  STA on_ground");
    L.push("up_vert:");
    L.push("  LDA jump_cnt");
    L.push("  BEQ up_fall");
    L.push("  DEC jump_cnt");
    L.push("  LDA player_y");
    L.push("  SEC");
    L.push("  SBC #4");
    L.push("  BCS up_jok");
    L.push("  LDA #0");
    L.push("up_jok:");
    L.push("  STA player_y");
    L.push("  JMP up_done");
    L.push("up_fall:");
    L.push("  JSR check_ground");
    L.push("  LDA on_ground");
    L.push("  BNE up_done");
    L.push("  LDA player_y");
    L.push("  CLC");
    L.push("  ADC #4");
    L.push("  STA player_y");
    L.push("  CMP #240");
    L.push("  BCC up_done");
    L.push("  ; caiu → respawn");
    L.push("  LDA #40");
    L.push("  STA player_x");
    L.push("  LDA #32");
    L.push("  STA player_y");
    L.push("  LDA #0");
    L.push("  STA jump_cnt");
    L.push("up_done:");
    L.push("  JSR animate_player");
    L.push("  JSR update_player_oam");
    L.push("  RTS");
    L.push("");

    // ---- Reset ----
    L.push("Reset:");
    L.push("  SEI");
    L.push("  CLD");
    L.push("  LDX #$40");
    L.push("  STX $4017");
    L.push("  LDX #$FF");
    L.push("  TXS");
    L.push("  INX                ; X=0");
    L.push("  STX $2000");
    L.push("  STX $2001");
    L.push("  STX $4010");
    L.push("vblankwait1:");
    L.push("  BIT $2002");
    L.push("  BPL vblankwait1");
    L.push("  ; clear RAM $0000-$07FF");
    L.push("  LDA #0");
    L.push("  TAX");
    L.push("clrram:");
    L.push("  STA $0000,X");
    L.push("  STA $0100,X");
    L.push("  STA $0200,X");
    L.push("  STA $0300,X");
    L.push("  STA $0400,X");
    L.push("  STA $0500,X");
    L.push("  STA $0600,X");
    L.push("  STA $0700,X");
    L.push("  INX");
    L.push("  BNE clrram");
    L.push("vblankwait2:");
    L.push("  BIT $2002");
    L.push("  BPL vblankwait2");
    L.push("  ; paletas");
    L.push("  BIT $2002");
    L.push("  LDA #$3F");
    L.push("  STA $2006");
    L.push("  LDA #$00");
    L.push("  STA $2006");
    L.push("  LDX #0");
    L.push("loadpal:");
    L.push("  LDA PaletteData,X");
    L.push("  STA $2007");
    L.push("  INX");
    L.push("  CPX #32");
    L.push("  BNE loadpal");
    L.push("  ; OAM off-screen");
    L.push("  LDX #0");
    L.push("  LDA #$FF");
    L.push("clroam:");
    L.push("  STA $0200,X");
    L.push("  INX");
    L.push("  BNE clroam");
    L.push(`  ; splash = tela ${splashIdx}`);
    L.push("  LDA #0");
    L.push("  STA game_state");
    L.push("  STA player_on");
    L.push(`  LDA #${splashIdx}`);
    L.push("  JSR load_screen");
    if(musicChans){
      L.push("  JSR music_init");
    }
    L.push("  ; scroll 0,0");
    L.push("  LDA #0");
    L.push("  STA $2005");
    L.push("  STA $2005");
    L.push("  ; NMI on, bg @$1000, sprites @$0000");
    L.push("  LDA #%10010000");
    L.push("  STA $2000");
    L.push("  LDA #%00011110");
    L.push("  STA $2001");
    L.push("");
    L.push("; ---- Main loop ----");
    L.push("; Bits do pad (após ROR x8): A=0 B=1 Select=2 Start=3 Up=4 Down=5 Left=6 Right=7");
    L.push("; START no splash → Fase 1 + spawn Hero");
    L.push("; SELECT no play → Game Over (atalho de teste)");
    L.push("MainLoop:");
    L.push("  LDA nmi_flag");
    L.push("  BEQ MainLoop");
    L.push("  LDA #0");
    L.push("  STA nmi_flag");
    L.push("  JSR read_pad");
    L.push("  LDA game_state");
    L.push("  CMP #0");
    L.push("  BEQ st_splash");
    L.push("  CMP #1");
    L.push("  BEQ st_play");
    L.push("  JMP st_gameover");
    L.push("");
    L.push("st_splash:");
    L.push("  ; bit 3 = START");
    L.push("  LDA pad1_edge");
    L.push("  AND #%00001000");
    L.push("  BEQ MainLoop");
    L.push("  LDA #1");
    L.push("  STA game_state");
    L.push(`  LDA #${playStart}`);
    L.push("  JSR load_screen        ; tela 0 vai pra $2000 (hard cut, igual antes)");
    L.push("  LDA #0");
    L.push("  STA scroll_x");
    L.push("  STA nt_page            ; tela esquerda (play_idx=0) fica na pagina $2000");
    if(secondPlayScreenIdx != null){
      L.push(`  LDA #${secondPlayScreenIdx}`);
      L.push("  LDX #$24");
      L.push("  STX psn_base_hi");
      L.push("  JSR preload_screen_nt  ; tela 1 pré-carregada em $2400 (pra scroll já funcionar)");
    }
    L.push("  JSR spawn_player");
    L.push("  JSR spawn_enemies");
    if(musicChans){
      L.push("  JSR music_init");
    }
    L.push("  JMP MainLoop");
    L.push("");
    L.push("st_play:");
    L.push("  ; fisica + input + inimigos");
    L.push("  JSR update_player");
    L.push("  JSR update_enemies");
    L.push("  ; SELECT → Game Over (teste)");
    L.push("  LDA pad1_edge");
    L.push("  AND #%00000100");
    L.push("  BEQ st_play_done");
    L.push("  LDA #2");
    L.push("  STA game_state");
    L.push("  JSR hide_player");
    L.push(`  LDA #${gameoverIdx}`);
    L.push("  JSR load_screen");
    L.push("st_play_done:");
    L.push("  JMP MainLoop");
    L.push("");
    L.push("st_gameover:");
    L.push("  ; START no game over → volta pro splash");
    L.push("  LDA pad1_edge");
    L.push("  AND #%00001000");
    L.push("  BEQ MainLoop");
    L.push("  LDA #0");
    L.push("  STA game_state");
    L.push("  JSR hide_player");
    L.push(`  LDA #${splashIdx}`);
    L.push("  JSR load_screen");
    L.push("  JMP MainLoop");
    L.push("");

    // ---- Data ----
    L.push("PaletteData:");
    for (let i = 0; i < paletteBytes.length; i += 16) {
      L.push("  .byte " + paletteBytes.slice(i, i + 16).map(b => hexByte(b)).join(", "));
    }
    L.push("");

    // pointer tables
    L.push("ScreenNtLo:");
    screens.forEach((_,i) => L.push(`  .byte <Nametable_${i}`));
    L.push("ScreenNtHi:");
    screens.forEach((_,i) => L.push(`  .byte >Nametable_${i}`));
    L.push("ScreenAtLo:");
    screens.forEach((_,i) => L.push(`  .byte <Attr_${i}`));
    L.push("ScreenAtHi:");
    screens.forEach((_,i) => L.push(`  .byte >Attr_${i}`));
    L.push("ScreenColLo:");
    screens.forEach((_,i) => L.push(`  .byte <Collision_${i}`));
    L.push("ScreenColHi:");
    screens.forEach((_,i) => L.push(`  .byte >Collision_${i}`));
    L.push("PlayScreenTable:  ; indices globais das telas de jogo (em ordem)");
    const playIdxs = screens.map((s,i) => (s.role === "play" || s.type === "background") ? i : -1).filter(i => i >= 0);
    if(!playIdxs.length) playIdxs.push(playStart);
    L.push("  .byte " + playIdxs.map(i => i & 0xFF).join(", "));
    L.push("");

    // Camada 3: tabelas de spawn a partir de Project.data.hitboxInstances (level-design.js -
    // única fonte de spawn usada na ROM, por decisão explícita). Formato por tela:
    // count, depois (x,y,charIdx) x count - charIdx indexa CharFrameCells*/CharFrameDur*/
    // CharFrameCount, na mesma ordem de enemyChars (personagens não-herói do projeto).
    const instances = (Project?.data?.hitboxInstances || []).slice();
    const objs = Project?.data?.hitboxObjects || [];
    const idOf = (s) => s && s.id != null ? String(s.id) : "";
    let skippedNoChar = 0;
    const enemySpawns = playIdxs.map((gi) => {
      const scr = screens[gi];
      const sid = idOf(scr);
      const pts = [];
      instances.forEach(inst => {
        if (!scr) return;
        const iscreen = inst.screenId != null ? String(inst.screenId) : "";
        if (iscreen !== sid) return;
        let cid = inst.characterId != null ? String(inst.characterId) : "";
        if (!cid) {
          const oid = inst.objectId || inst.hitboxObjectId;
          const o = objs.find(x => String(x.id) === String(oid));
          if (o && o.kind === "spawn" && o.characterId != null) cid = String(o.characterId);
        }
        if (heroIdSet.has(cid)) return; // herói não entra no pool de instâncias
        if (!charIndexById.has(cid)) { skippedNoChar++; return; } // sem personagem resolvido, não dá pra desenhar
        pts.push([inst.x|0, inst.y|0, charIndexById.get(cid)]);
      });
      return { count: Math.min(NUM_INSTANCES, pts.length), points: pts.slice(0, NUM_INSTANCES) };
    });
    // diagnostico no ASM
    L.push("; hitboxInstances total=" + instances.length + (skippedNoChar ? ` (${skippedNoChar} ignorada(s) sem personagem resolvido)` : ""));
    enemySpawns.forEach((es, pi) => {
      const scr = screens[playIdxs[pi]];
      L.push("; play[" + pi + "] screen=" + (scr && scr.name) + " id=" + idOf(scr) + " spawns=" + es.count);
    });

    enemySpawns.forEach((es, pi) => {
      L.push(`EnemyData_${pi}:`);
      const bytes = [es.count & 0xFF];
      es.points.forEach(([x,y,ci]) => { bytes.push(x & 0xFF, y & 0xFF, ci & 0xFF); });
      if (bytes.length === 1) bytes.push(0, 0, 0); // garante pelo menos 1 trinca dummy se count=0
      L.push("  .byte " + bytes.map(b => "$" + (b&0xFF).toString(16).padStart(2,"0").toUpperCase()).join(", "));
    });
    L.push("EnemySpawnLo:");
    enemySpawns.forEach((_, pi) => L.push(`  .byte <EnemyData_${pi}`));
    L.push("EnemySpawnHi:");
    enemySpawns.forEach((_, pi) => L.push(`  .byte >EnemyData_${pi}`));
    L.push("");

    // ---- Camada 3: tabelas de sprite por personagem (CharFrameCells/Dur/Count) ----
    if(spritePack.charData.length){
      spritePack.charData.forEach((cd, ci) => {
        L.push(`CharCells_${ci}:  ; ${cd.name}`);
        const bytes = [];
        cd.frames.forEach(fr => {
          const byCorner = [null,null,null,null];
          fr.cells.forEach(c => { byCorner[c.corner] = c.tile; });
          for(let k=0;k<4;k++) bytes.push(byCorner[k] == null ? 0xFF : (byCorner[k] & 0xFF));
        });
        L.push("  .byte " + bytes.map(b => "$" + b.toString(16).padStart(2,"0").toUpperCase()).join(", "));
        L.push(`CharDur_${ci}:`);
        L.push("  .byte " + cd.frames.map(fr => fr.duration & 0xFF).join(", "));
      });
      L.push("CharFrameCellsLo:");
      spritePack.charData.forEach((_,ci) => L.push(`  .byte <CharCells_${ci}`));
      L.push("CharFrameCellsHi:");
      spritePack.charData.forEach((_,ci) => L.push(`  .byte >CharCells_${ci}`));
      L.push("CharFrameDurLo:");
      spritePack.charData.forEach((_,ci) => L.push(`  .byte <CharDur_${ci}`));
      L.push("CharFrameDurHi:");
      spritePack.charData.forEach((_,ci) => L.push(`  .byte >CharDur_${ci}`));
      L.push("CharFrameCount:");
      L.push("  .byte " + spritePack.charData.map(cd => cd.frames.length & 0xFF).join(", "));
    } else {
      // nenhum personagem não-herói - mantém as tabelas com 1 entrada dummy pra não quebrar
      // o linker (spawn_enemies nunca vai preencher charIdx>0 nesse caso).
      L.push("CharCells_0: .byte $FF,$FF,$FF,$FF");
      L.push("CharDur_0:   .byte 8");
      L.push("CharFrameCellsLo: .byte <CharCells_0");
      L.push("CharFrameCellsHi: .byte >CharCells_0");
      L.push("CharFrameDurLo:   .byte <CharDur_0");
      L.push("CharFrameDurHi:   .byte >CharDur_0");
      L.push("CharFrameCount:   .byte 1");
    }
    L.push("");

    screens.forEach((sc, i) => {
      L.push(`Nametable_${i}:  ; ${sc.name} (${sc.role})`);
      const nt = sc.remappedNt;
      for (let j = 0; j < 960; j += 32) {
        L.push("  .byte " + nt.slice(j, j + 32).map(b => hexByte(b % 256)).join(", "));
      }
      L.push(`Attr_${i}:`);
      const at = sc.attributes || new Array(64).fill(0);
      for (let j = 0; j < 64; j += 16) {
        L.push("  .byte " + at.slice(j, j + 16).map(b => hexByte(b % 256)).join(", "));
      }
      L.push(`Collision_${i}:`);
      const col = sc.collisionMap || new Array(960).fill(0);
      for (let j = 0; j < 960; j += 32) {
        L.push("  .byte " + col.slice(j, j + 32).map(b => hexByte((b || 0) % 256)).join(", "));
      }
      L.push("");
    });

    if(musicChans){
      L.push("; --- Music data ---");
      musicChans.forEach((mc, i)=>{
        L.push(`; canal ${i}: ${mc.type}`);
        L.push(`PitchLo_ch${i}:`);
        formatBytes(mc.enc.lo).forEach(line => L.push(line));
        L.push(`PitchHi_ch${i}:`);
        formatBytes(mc.enc.hi).forEach(line => L.push(line));
        L.push(`Scale_ch${i}:`);
        formatBytes(mc.enc.scale).forEach(line => L.push(line));
        L.push(`Time_ch${i}:`);
        formatBytes(mc.enc.time).forEach(line => L.push(line));
        L.push("");
      });
    }

    L.push('.segment "VECTORS"');
    L.push("  .word NMI");
    L.push("  .word Reset");
    L.push("  .word IRQ");
    L.push("");
    L.push('.segment "CHARS"');
    L.push("  ; pg0 sprites (empacotado a partir dos frames dos personagens) / pg1 background empacotado");
    const chrFinal = new Uint8Array(8192);
    chrFinal.set(spritePack.spriteChr, 0);
    chrFinal.set(packed.bgChr, 4096);
    for (let i = 0; i < chrFinal.length; i += 16) {
      if (i === 4096) L.push("  ; $1000 background");
      L.push("  .byte " + Array.from(chrFinal.slice(i, i + 16)).map(b => hexByte(b)).join(", "));
    }
    return L.join("\n");
  }

  function generateASM(){
    if(buildMode === "game") return generateASMGame();
    const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
    const pals=CHR.getPalettes?CHR.getPalettes():[[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]];
    const data=getSelectedBuildData(); const nt=data.nametable; const at=data.attributes;
    const music = getSelectedMusic();
    const paletteBytes=[]; for(let p=0;p<8;p++){ const pal=pals[p]||[15,0,16,48]; for(let c=0;c<4;c++) paletteBytes.push(pal[c]||0); }
    const backdrop = computeBackdropColor(nt, at, pals, chrBuf);
    const universalBackdrop = backdrop.color;
    paletteBytes[0] = universalBackdrop;
    [4,8,12,16,20,24,28].forEach(i => { paletteBytes[i] = universalBackdrop; });
    const packed = packBackgroundCHR(chrBuf, nt);
    const packedNt = packed.remappedNt;

    // Encode music channels first
    let musicChans = null;
    if(music){
      const baseFrames = music.baseFrames || 30;
      const loop = music.loop !== false;
      musicChans = [];
      CH_ORDER.forEach(type=>{
        const ch = (music.channels || []).find(c => c.type === type);
        if(ch) musicChans.push({ type, enc: encodeChannel(ch.notes || [], baseFrames, loop) });
      });
      (music.channels || []).forEach(ch=>{
        if(musicChans.some(u => u.type === ch.type)) return;
        const free = CH_ORDER.find(t => !musicChans.some(u => u.type === t));
        if(free) musicChans.push({ type: free, enc: encodeChannel(ch.notes || [], baseFrames, loop) });
      });
      if(!musicChans.length) musicChans = null;
    }

    const L=[];
    L.push("; NES Game Maker - Gerado por BUILD ROM v0.8.2");
    L.push(`; Imagem: [${data.type==="background"?"Background":"Splash"}] ${data.sourceName||data.name}`);
    L.push(`; CHR reempacotado: ${packed.usedCount}/256 tiles`);
    if(music && musicChans) L.push(`; Musica: ${music.name} · ${musicChans.length} canal(is) · baseFrames=${music.baseFrames||30}`);
    else L.push("; Musica: (nenhuma)");
    L.push('.segment "HEADER"');
    L.push("  .byte $4E,$45,$53,$1A,1,1,0,0,0,0,0,0,0,0,0,0");
    L.push("");
    L.push('.segment "ZEROPAGE"');
    if(musicChans){
      L.push("music_on:    .res 1");
      musicChans.forEach((_,i)=>{
        L.push(`ch${i}_timer:  .res 1`);
        L.push(`ch${i}_pos:    .res 1`);
      });
    }
    L.push("");
    L.push('.segment "CODE"');
    L.push("");

    // ---- NMI ----
    L.push("NMI:");
    if(musicChans){
      L.push("  PHA");
      L.push("  TXA");
      L.push("  PHA");
      L.push("  TYA");
      L.push("  PHA");
      L.push("  JSR music_update");
      L.push("  PLA");
      L.push("  TAY");
      L.push("  PLA");
      L.push("  TAX");
      L.push("  PLA");
    }
    L.push("  RTI");
    L.push("");
    L.push("IRQ:");
    L.push("  RTI");
    L.push("");

    // ---- music_update ----
    if(musicChans){
      L.push("; --- music_update: chamado a cada NMI (60Hz) ---");
      L.push("music_update:");
      L.push("  LDA music_on");
      // JMP absoluto: corpo com 3-4 canais passa de 127 bytes (BEQ relativo quebra)
      L.push("  BNE mu_run");
      L.push("  RTS");
      L.push("mu_run:");
      musicChans.forEach((mc, i)=>{
        const meta = CH_META[mc.type];
        const lbl = `mu_ch${i}`;
        L.push(`${lbl}:`);
        L.push(`  LDA ch${i}_timer`);
        L.push(`  BEQ ${lbl}_next`);
        L.push(`  DEC ch${i}_timer`);
        L.push(`  JMP ${lbl}_end`);
        L.push(`${lbl}_next:`);
        L.push(`  LDY ch${i}_pos`);
        L.push(`  LDA Scale_ch${i},Y`);
        L.push(`  CMP #$FF`);
        L.push(`  BNE ${lbl}_nof`);
        L.push(`  LDA #0`);
        L.push(`  STA ch${i}_pos`);
        L.push(`  LDY #0`);
        L.push(`  LDA Scale_ch${i},Y`);
        L.push(`${lbl}_nof:`);
        L.push(`  CMP #$FE`);
        L.push(`  BNE ${lbl}_play`);
        // silence + stop advancing
        L.push(`  LDA #${meta.silence}`);
        L.push(`  STA ${meta.regVol}`);
        L.push(`  JMP ${lbl}_end`);
        L.push(`${lbl}_play:`);
        // A = pitch index
        L.push(`  TAX`);
        L.push(`  LDA Time_ch${i},Y`);
        L.push(`  STA ch${i}_timer`);
        L.push(`  INY`);
        L.push(`  STY ch${i}_pos`);
        L.push(`  CPX #0`);
        L.push(`  BNE ${lbl}_tone`);
        // REST
        L.push(`  LDA #${meta.silence}`);
        L.push(`  STA ${meta.regVol}`);
        L.push(`  JMP ${lbl}_end`);
        L.push(`${lbl}_tone:`);
        if(mc.type === "noise"){
          // Noise: usa lo byte como periodo (4 bits) + volume
          L.push(`  LDA #${meta.dutyVol}`);
          L.push(`  STA ${meta.regVol}`);
          L.push(`  LDA PitchLo_ch${i},X`);
          L.push(`  AND #$0F`);
          L.push(`  STA ${meta.regLo}`);
          L.push(`  LDA #$08`);
          L.push(`  STA ${meta.regHi}`);
        } else if(mc.type === "triangle"){
          L.push(`  LDA #${meta.dutyVol}`);
          L.push(`  STA ${meta.regVol}`);
          L.push(`  LDA PitchLo_ch${i},X`);
          L.push(`  STA ${meta.regLo}`);
          L.push(`  LDA PitchHi_ch${i},X`);
          L.push(`  STA ${meta.regHi}`);
        } else {
          // pulse
          L.push(`  LDA #${meta.dutyVol}`);
          L.push(`  STA ${meta.regVol}`);
          L.push(`  LDA PitchLo_ch${i},X`);
          L.push(`  STA ${meta.regLo}`);
          L.push(`  LDA PitchHi_ch${i},X`);
          L.push(`  ORA #$08`);  // length counter load
          L.push(`  STA ${meta.regHi}`);
        }
        L.push(`${lbl}_end:`);
      });
      L.push("  RTS");
      L.push("");

      L.push("music_init:");
      L.push("  LDA #$0F");
      L.push("  STA $4015");
      L.push("  LDA #$00");
      L.push("  STA $4001");
      L.push("  STA $4005");
      musicChans.forEach((_,i)=>{
        L.push(`  LDA #0`);
        L.push(`  STA ch${i}_pos`);
        L.push(`  LDA #1`);
        L.push(`  STA ch${i}_timer`); // força load na 1a nota
      });
      L.push("  LDA #1");
      L.push("  STA music_on");
      L.push("  RTS");
      L.push("");
    }

    // ---- Reset ----
    L.push("Reset:");
    L.push("  SEI");
    L.push("  CLD");
    L.push("  LDX #$40");
    L.push("  STX $4017");
    L.push("  LDX #$FF");
    L.push("  TXS");
    L.push("  LDA #0");
    L.push("  STA $2000");
    L.push("  STA $2001");
    L.push("");
    L.push("vblankwait1:");
    L.push("  BIT $2002");
    L.push("  BPL vblankwait1");
    L.push("");
    L.push("  LDA #0");
    L.push("  LDX #0");
    L.push("clram:");
    L.push("  STA $0000,X");
    L.push("  STA $0100,X");
    L.push("  STA $0200,X");
    L.push("  STA $0300,X");
    L.push("  STA $0400,X");
    L.push("  STA $0500,X");
    L.push("  STA $0600,X");
    L.push("  STA $0700,X");
    L.push("  INX");
    L.push("  BNE clram");
    L.push("");
    L.push("vblankwait2:");
    L.push("  BIT $2002");
    L.push("  BPL vblankwait2");
    L.push("");
    L.push("  BIT $2002");
    L.push("  LDA #$3F");
    L.push("  STA $2006");
    L.push("  LDA #$00");
    L.push("  STA $2006");
    L.push("  LDX #0");
    L.push("load_palettes:");
    L.push("  LDA PaletteData,X");
    L.push("  STA $2007");
    L.push("  INX");
    L.push("  CPX #32");
    L.push("  BNE load_palettes");
    L.push("");
    L.push(`  ; Nametable — ${data.type==="background"?"Background":"Splash"} "${data.name}"`);
    L.push("  BIT $2002");
    L.push("  LDA #$20");
    L.push("  STA $2006");
    L.push("  LDA #$00");
    L.push("  STA $2006");
    L.push("  LDX #0");
    L.push("nb1:");
    L.push("  LDA NametableData+0,X");
    L.push("  STA $2007");
    L.push("  INX");
    L.push("  BNE nb1");
    L.push("  LDX #0");
    L.push("nb2:");
    L.push("  LDA NametableData+256,X");
    L.push("  STA $2007");
    L.push("  INX");
    L.push("  BNE nb2");
    L.push("  LDX #0");
    L.push("nb3:");
    L.push("  LDA NametableData+512,X");
    L.push("  STA $2007");
    L.push("  INX");
    L.push("  BNE nb3");
    L.push("  LDX #0");
    L.push("nb4:");
    L.push("  LDA NametableData+768,X");
    L.push("  STA $2007");
    L.push("  INX");
    L.push("  CPX #192");
    L.push("  BNE nb4");
    L.push("");
    L.push("  BIT $2002");
    L.push("  LDA #$23");
    L.push("  STA $2006");
    L.push("  LDA #$C0");
    L.push("  STA $2006");
    L.push("  LDX #0");
    L.push("load_attrs:");
    L.push("  LDA AttributeData,X");
    L.push("  STA $2007");
    L.push("  INX");
    L.push("  CPX #64");
    L.push("  BNE load_attrs");
    L.push("");
    L.push("  BIT $2002");
    L.push("  LDA #$00");
    L.push("  STA $2005");
    L.push("  STA $2005");
    L.push("");
    if(musicChans){
      L.push("  JSR music_init");
      L.push("");
    }
    L.push("  ; NMI on + bg pattern $1000");
    L.push("  LDA #%10010000");
    L.push("  STA $2000");
    L.push("  LDA #%00011110");
    L.push("  STA $2001");
    L.push("");
    L.push("Forever:");
    L.push("  JMP Forever");
    L.push("");

    // ---- Data ----
    L.push("PaletteData:");
    for (let i = 0; i < paletteBytes.length; i += 16) {
      L.push("  .byte " + paletteBytes.slice(i, i + 16).map(b => hexByte(b)).join(", "));
    }
    L.push("");
    L.push("NametableData:");
    for (let i = 0; i < packedNt.length; i += 32) {
      L.push("  .byte " + packedNt.slice(i, i + 32).map(b => hexByte(b % 256)).join(", "));
    }
    L.push("");
    L.push("AttributeData:");
    for (let i = 0; i < at.length; i += 32) {
      L.push("  .byte " + at.slice(i, i + 32).map(b => hexByte(b % 256)).join(", "));
    }
    L.push("");

    if(musicChans){
      L.push("; --- Music data ---");
      musicChans.forEach((mc, i)=>{
        L.push(`; canal ${i}: ${mc.type}`);
        L.push(`PitchLo_ch${i}:`);
        formatBytes(mc.enc.lo).forEach(line => L.push(line));
        L.push(`PitchHi_ch${i}:`);
        formatBytes(mc.enc.hi).forEach(line => L.push(line));
        L.push(`Scale_ch${i}:`);
        formatBytes(mc.enc.scale).forEach(line => L.push(line));
        L.push(`Time_ch${i}:`);
        formatBytes(mc.enc.time).forEach(line => L.push(line));
        L.push("");
      });
    }

    L.push('.segment "VECTORS"');
    L.push("  .word NMI");
    L.push("  .word Reset");
    L.push("  .word IRQ");
    L.push("");
    L.push('.segment "CHARS"');
    L.push("  ; pg-0 sprites / pg-1 background empacotado");
    const chrFinal = new Uint8Array(8192);
    chrFinal.set(chrBuf.slice(0, 4096), 0);
    chrFinal.set(packed.bgChr, 4096);
    for (let i = 0; i < chrFinal.length; i += 16) {
      if (i === 4096) L.push("  ; $1000 background");
      L.push("  .byte " + Array.from(chrFinal.slice(i, i + 16)).map(b => hexByte(b)).join(", "));
    }
    return L.join("\n");
  }

  // ===== Geração binária .nes (NROM-128 @ $C000) — equivalente ao ASM =====
  function createPrg(base){
    base = base || 0xC000;
    const bytes = [];
    const labels = Object.create(null);
    const fixups = [];
    function pc(){ return base + bytes.length; }
    function emit(){ for(let i=0;i<arguments.length;i++) bytes.push(arguments[i] & 0xFF); }
    function absFix(name){ fixups.push({ at: bytes.length, name, kind: "abs" }); emit(0, 0); }
    function relFix(name){ fixups.push({ at: bytes.length, name, kind: "rel" }); emit(0); }
    return {
      base, bytes, labels, pc,
      label(name){ labels[name] = pc(); },
      emit,
      pha(){ emit(0x48); }, pla(){ emit(0x68); },
      txa(){ emit(0x8A); }, tax(){ emit(0xAA); },
      tya(){ emit(0x98); }, tay(){ emit(0xA8); },
      inx(){ emit(0xE8); }, iny(){ emit(0xC8); },
      rts(){ emit(0x60); }, rti(){ emit(0x40); },
      sei(){ emit(0x78); }, cld(){ emit(0xD8); }, txs(){ emit(0x9A); },
      lda_imm(v){ emit(0xA9, v); },
      ldx_imm(v){ emit(0xA2, v); },
      ldy_imm(v){ emit(0xA0, v); },
      lda_zp(z){ emit(0xA5, z); },
      sta_zp(z){ emit(0x85, z); },
      ldy_zp(z){ emit(0xA4, z); },
      sty_zp(z){ emit(0x84, z); },
      dec_zp(z){ emit(0xC6, z); },
      cmp_imm(v){ emit(0xC9, v); },
      cpx_imm(v){ emit(0xE0, v); },
      ora_imm(v){ emit(0x09, v); },
      and_imm(v){ emit(0x29, v); },
      lda_abs(name){ emit(0xAD); absFix(name); },
      sta_abs(name){ emit(0x8D); absFix(name); },
      lda_absx(name){ emit(0xBD); absFix(name); },
      lda_absy(name){ emit(0xB9); absFix(name); },
      sta_absx_addr(addr){ emit(0x9D, addr & 0xFF, (addr >> 8) & 0xFF); },
      sta_addr(addr){ emit(0x8D, addr & 0xFF, (addr >> 8) & 0xFF); },
      lda_addr(addr){ emit(0xAD, addr & 0xFF, (addr >> 8) & 0xFF); },
      stx_addr(addr){ emit(0x8E, addr & 0xFF, (addr >> 8) & 0xFF); },
      bit_addr(addr){ emit(0x2C, addr & 0xFF, (addr >> 8) & 0xFF); },
      jsr(name){ emit(0x20); absFix(name); },
      jmp(name){ emit(0x4C); absFix(name); },
      beq(name){ emit(0xF0); relFix(name); },
      bne(name){ emit(0xD0); relFix(name); },
      bpl(name){ emit(0x10); relFix(name); },
      raw(arr){ for(let i=0;i<arr.length;i++) emit(arr[i]); },
      resolve(){
        for(const f of fixups){
          const addr = labels[f.name];
          if(addr == null) throw new Error("Label ausente: " + f.name);
          if(f.kind === "abs"){
            bytes[f.at] = addr & 0xFF;
            bytes[f.at+1] = (addr >> 8) & 0xFF;
          } else {
            const next = base + f.at + 1;
            const rel = addr - next;
            if(rel < -128 || rel > 127) throw new Error("Branch longe: " + f.name + " (" + rel + ")");
            bytes[f.at] = rel & 0xFF;
          }
        }
      },
      padTo(absAddr, fill){
        const need = absAddr - base;
        if(need < bytes.length) throw new Error("PRG overflow antes de $" + absAddr.toString(16) + " (len=" + bytes.length + ")");
        while(bytes.length < need) bytes.push(fill == null ? 0xFF : fill);
      }
    };
  }

  function collectMusicChannels(music){
    if(!music) return null;
    const baseFrames = music.baseFrames || 30;
    const loop = music.loop !== false;
    const out = [];
    CH_ORDER.forEach(type=>{
      const ch = (music.channels || []).find(c => c.type === type);
      if(ch) out.push({ type, enc: encodeChannel(ch.notes || [], baseFrames, loop) });
    });
    (music.channels || []).forEach(ch=>{
      if(out.some(u => u.type === ch.type)) return;
      const free = CH_ORDER.find(t => !out.some(u => u.type === t));
      if(free) out.push({ type: free, enc: encodeChannel(ch.notes || [], baseFrames, loop) });
    });
    return out.length ? out : null;
  }

  function generateNES(){
    const chrBuf = CHR.getBuffer ? CHR.getBuffer() : new Uint8Array(8192);
    const pals = CHR.getPalettes ? CHR.getPalettes() : [[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]];
    const data = getSelectedBuildData();
    const nt = data.nametable, at = data.attributes;
    const music = getSelectedMusic();
    const musicChans = collectMusicChannels(music);

    const paletteBytes = [];
    for(let p=0;p<8;p++){
      const pal = pals[p] || [15,0,16,48];
      for(let c=0;c<4;c++) paletteBytes.push(pal[c] || 0);
    }
    const backdrop = computeBackdropColor(nt, at, pals, chrBuf);
    paletteBytes[0] = backdrop.color;
    [4,8,12,16,20,24,28].forEach(i => { paletteBytes[i] = backdrop.color; });

    const packed = packBackgroundCHR(chrBuf, nt);
    const packedNt = packed.remappedNt;

    const ZP_ON = 0x00;
    const zpT = i => 1 + i * 2;
    const zpP = i => 2 + i * 2;

    const P = createPrg(0xC000);

    // ---- NMI ----
    P.label("NMI");
    if(musicChans){
      P.pha(); P.txa(); P.pha(); P.tya(); P.pha();
      P.jsr("music_update");
      P.pla(); P.tay(); P.pla(); P.tax(); P.pla();
    }
    P.rti();

    P.label("IRQ");
    P.rti();

    // ---- music_update / music_init ----
    if(musicChans){
      P.label("music_update");
      P.lda_zp(ZP_ON);
      P.bne("mu_run");
      P.rts();
      P.label("mu_run");
      musicChans.forEach((mc, i)=>{
        const meta = CH_META[mc.type];
        const t = zpT(i), p = zpP(i);
        const L = "c" + i;
        P.label(L);
        P.lda_zp(t);
        P.beq(L + "_n");
        P.dec_zp(t);
        P.jmp(L + "_e");
        P.label(L + "_n");
        P.ldy_zp(p);
        P.lda_absy("Scale" + i);
        P.cmp_imm(0xFF);
        P.bne(L + "_nf");
        P.lda_imm(0); P.sta_zp(p); P.ldy_imm(0);
        P.lda_absy("Scale" + i);
        P.label(L + "_nf");
        P.cmp_imm(0xFE);
        P.bne(L + "_pl");
        P.lda_imm(meta.sil); P.sta_addr(meta.vol);
        P.jmp(L + "_e");
        P.label(L + "_pl");
        P.tax();
        P.lda_absy("Time" + i);
        P.sta_zp(t);
        P.iny(); P.sty_zp(p);
        P.cpx_imm(0);
        P.bne(L + "_tn");
        P.lda_imm(meta.sil); P.sta_addr(meta.vol);
        P.jmp(L + "_e");
        P.label(L + "_tn");
        P.lda_imm(meta.duty); P.sta_addr(meta.vol);
        if(mc.type === "noise"){
          P.lda_absx("PLo" + i);
          P.and_imm(0x0F);
          P.sta_addr(meta.lo);
          P.lda_imm(0x08);
          P.sta_addr(meta.hi);
        } else if(mc.type === "triangle"){
          P.lda_absx("PLo" + i); P.sta_addr(meta.lo);
          P.lda_absx("PHi" + i); P.sta_addr(meta.hi);
        } else {
          P.lda_absx("PLo" + i); P.sta_addr(meta.lo);
          P.lda_absx("PHi" + i); P.ora_imm(0x08); P.sta_addr(meta.hi);
        }
        P.label(L + "_e");
      });
      P.rts();

      P.label("music_init");
      P.lda_imm(0x0F); P.sta_addr(0x4015);
      P.lda_imm(0); P.sta_addr(0x4001); P.sta_addr(0x4005);
      musicChans.forEach((_, i)=>{
        P.lda_imm(0); P.sta_zp(zpP(i));
        P.lda_imm(1); P.sta_zp(zpT(i));
      });
      P.lda_imm(1); P.sta_zp(ZP_ON);
      P.rts();
    }

    // ---- Reset ----
    P.label("Reset");
    P.sei(); P.cld();
    P.ldx_imm(0x40); P.stx_addr(0x4017);
    P.ldx_imm(0xFF); P.txs();
    P.lda_imm(0); P.sta_addr(0x2000); P.sta_addr(0x2001);

    P.label("vb1");
    P.bit_addr(0x2002); P.bpl("vb1");

    // Clear RAM $0000-$07FF
    P.lda_imm(0); P.ldx_imm(0);
    P.label("clram");
    P.sta_absx_addr(0x0000);
    P.sta_absx_addr(0x0100);
    P.sta_absx_addr(0x0200);
    P.sta_absx_addr(0x0300);
    P.sta_absx_addr(0x0400);
    P.sta_absx_addr(0x0500);
    P.sta_absx_addr(0x0600);
    P.sta_absx_addr(0x0700);
    P.inx();
    P.bne("clram");

    P.label("vb2");
    P.bit_addr(0x2002); P.bpl("vb2");

    // Palettes
    P.bit_addr(0x2002);
    P.lda_imm(0x3F); P.sta_addr(0x2006);
    P.lda_imm(0x00); P.sta_addr(0x2006);
    P.ldx_imm(0);
    P.label("ldpal");
    P.lda_absx("PaletteData");
    P.sta_addr(0x2007);
    P.inx();
    P.cpx_imm(32);
    P.bne("ldpal");

    // Nametable 960 bytes in 4 blocks
    P.bit_addr(0x2002);
    P.lda_imm(0x20); P.sta_addr(0x2006);
    P.lda_imm(0x00); P.sta_addr(0x2006);
    P.ldx_imm(0);
    P.label("nb1");
    P.lda_absx("Nametable0");
    P.sta_addr(0x2007);
    P.inx(); P.bne("nb1");
    P.ldx_imm(0);
    P.label("nb2");
    P.lda_absx("Nametable1");
    P.sta_addr(0x2007);
    P.inx(); P.bne("nb2");
    P.ldx_imm(0);
    P.label("nb3");
    P.lda_absx("Nametable2");
    P.sta_addr(0x2007);
    P.inx(); P.bne("nb3");
    P.ldx_imm(0);
    P.label("nb4");
    P.lda_absx("Nametable3");
    P.sta_addr(0x2007);
    P.inx();
    P.cpx_imm(192);
    P.bne("nb4");

    // Attributes
    P.bit_addr(0x2002);
    P.lda_imm(0x23); P.sta_addr(0x2006);
    P.lda_imm(0xC0); P.sta_addr(0x2006);
    P.ldx_imm(0);
    P.label("ldattr");
    P.lda_absx("AttributeData");
    P.sta_addr(0x2007);
    P.inx();
    P.cpx_imm(64);
    P.bne("ldattr");

    // Scroll
    P.bit_addr(0x2002);
    P.lda_imm(0); P.sta_addr(0x2005); P.sta_addr(0x2005);

    if(musicChans) P.jsr("music_init");

    // Enable NMI + rendering (bg pattern $1000)
    P.lda_imm(0x90); P.sta_addr(0x2000);
    P.lda_imm(0x1E); P.sta_addr(0x2001);

    P.label("Forever");
    P.jmp("Forever");

    // ---- DATA ----
    P.label("PaletteData");
    P.raw(paletteBytes);

    // Nametable split into 256/256/256/192 for abs,X without page cross issues beyond 256
    P.label("Nametable0"); P.raw(packedNt.slice(0, 256));
    P.label("Nametable1"); P.raw(packedNt.slice(256, 512));
    P.label("Nametable2"); P.raw(packedNt.slice(512, 768));
    P.label("Nametable3"); P.raw(packedNt.slice(768, 960));

    P.label("AttributeData");
    P.raw(at.map(b => b & 0xFF));

    if(musicChans){
      musicChans.forEach((mc, i)=>{
        P.label("PLo" + i); P.raw(mc.enc.lo);
        P.label("PHi" + i); P.raw(mc.enc.hi);
        P.label("Scale" + i); P.raw(mc.enc.scale);
        P.label("Time" + i); P.raw(mc.enc.time);
      });
    }

    // Vectors at $FFFA
    P.padTo(0xFFFA, 0xFF);
    P.label("VEC_NMI");
    // emit vector words by fixup
    P.emit(0, 0); // NMI - patch after resolve via labels
    P.emit(0, 0); // RESET
    P.emit(0, 0); // IRQ
    // Manual vector placement
    const nmiA = P.labels["NMI"], resA = P.labels["Reset"], irqA = P.labels["IRQ"];
    // overwrite last 6 bytes
    const blen = P.bytes.length;
    P.bytes[blen - 6] = nmiA & 0xFF;
    P.bytes[blen - 5] = (nmiA >> 8) & 0xFF;
    P.bytes[blen - 4] = resA & 0xFF;
    P.bytes[blen - 3] = (resA >> 8) & 0xFF;
    P.bytes[blen - 2] = irqA & 0xFF;
    P.bytes[blen - 1] = (irqA >> 8) & 0xFF;

    P.resolve();

    if(P.bytes.length !== 0x4000){
      // padTo FFFA + 6 should be 0x4000
      if(P.bytes.length > 0x4000) throw new Error("PRG > 16KB: " + P.bytes.length);
      while(P.bytes.length < 0x4000) P.bytes.push(0xFF);
    }

    // CHR: pg0 original + pg1 packed
    const chrFinal = new Uint8Array(8192);
    chrFinal.set(chrBuf.slice(0, 4096), 0);
    chrFinal.set(packed.bgChr, 4096);

    // iNES header: 16KB PRG, 8KB CHR, mapper 0, horizontal mirroring default
    const header = new Uint8Array(16);
    header[0] = 0x4E; header[1] = 0x45; header[2] = 0x53; header[3] = 0x1A;
    header[4] = 1; // PRG banks
    header[5] = 1; // CHR banks
    header[6] = 0; // mapper 0, horiz mirror

    const rom = new Uint8Array(16 + 0x4000 + 0x2000);
    rom.set(header, 0);
    rom.set(P.bytes, 16);
    rom.set(chrFinal, 16 + 0x4000);
    return rom;
  }


  function setBuildMode(m){ buildMode = (m === "single") ? "single" : "game"; }

  function buildROM(){
    const logEl=document.getElementById("buildLog"); if(logEl) logEl.textContent="Iniciando build v0.9.0...\n";
    try{
      const chrBuf=CHR.getBuffer?CHR.getBuffer():new Uint8Array(8192);
      const music = getSelectedMusic();
      if(buildMode === "game"){
        const collected = collectGameScreens();
        const packed = packMultiScreenCHR(chrBuf, collected.screens);
        log("Modo: JOGO COMPLETO (Camada 1)");
        log("Telas: " + collected.screens.length + " · splash=" + collected.splashIdx + " play=" + collected.playStartIdx + "… gameover=" + collected.gameoverIdx);
        collected.screens.forEach((s,i) => log("  [" + i + "] " + s.role + " · " + s.name));
        log("CHR empacotado: " + packed.usedCount + "/256" + (packed.overflowCount ? " (overflow " + packed.overflowCount + ")" : ""));
        log("Controles: START no splash→fase · SELECT na fase→game over · START no GO→splash");
        const instAll = Project?.data?.hitboxInstances || [];
        log("Spawns (hitboxInstances): " + instAll.length);
        instAll.forEach(inst => log("  · screen=" + inst.screenId + " char=" + (inst.characterId||"?") + " @(" + inst.x + "," + inst.y + ")"));
        // re-simula contagem por tela de play (mesma lógica do ASM: exclui herói, exige
        // personagem resolvido - direto ou via hitboxObject kind=spawn - e limita ao pool)
        try {
          const col = collectGameScreens();
          const allChars = Project.data?.characters || [];
          const heroIdSet = new Set(allChars.filter(c => (c.name||"").toLowerCase().includes("hero")).map(c => String(c.id)));
          const objs = Project?.data?.hitboxObjects || [];
          const maxInst = Math.min(15, Math.max(1, Math.min(20, parseInt(Project.data?.maxInstances) || 10)));
          const playI = col.screens.map((s,i) => (s.role==="play"||s.type==="background")?i:-1).filter(i=>i>=0);
          playI.forEach((gi, pi) => {
            const scr = col.screens[gi];
            const resolved = instAll.filter(inst => {
              if (String(inst.screenId) !== String(scr.id)) return false;
              let cid = inst.characterId != null ? String(inst.characterId) : "";
              if (!cid) {
                const oid = inst.objectId || inst.hitboxObjectId;
                const o = objs.find(x => String(x.id) === String(oid));
                if (o && o.kind === "spawn" && o.characterId != null) cid = String(o.characterId);
              }
              if (!cid || heroIdSet.has(cid)) return false;
              return allChars.some(c => String(c.id) === cid);
            });
            const n = Math.min(maxInst, resolved.length);
            const skipped = resolved.length - n;
            log("  → EnemyData_" + pi + " (" + scr.name + "): " + n + " inimigo(s)" + (skipped ? ` (+${skipped} ignorado(s) por limite de pool)` : ""));
          });
        } catch(e) { log("  (diag spawns: " + e.message + ")"); }
      } else {
        const data=getSelectedBuildData();
        const packed=packBackgroundCHR(chrBuf, data.nametable);
        log("Modo: TELA ÚNICA (legado)");
        log("Imagem: " + (data.sourceName||data.name) + " (" + data.filled + " tiles)");
        log("CHR empacotado: " + packed.usedCount + "/256");
      }
      if(music) log("Música: " + music.name + " · " + (music.channels||[]).length + " canal(is)");
      else log("Música: (nenhuma)");

      const asm=generateASM(); lastASM=asm;
      log("ASM gerado (" + asm.length + " chars) — ca65 + nrom.cfg");
      const asmEl=document.getElementById("buildASMPreview"); if(asmEl) asmEl.value=asm;
      document.getElementById("btnDownloadASM").style.display="inline-block";
      document.getElementById("btnDownloadCFG").style.display="inline-block";

      try{
        if(buildMode === "game"){
          // Camada 1: .nes no browser ainda usa gerador legado parcial —
          // o fluxo principal de teste é ca65. Tentamos mesmo assim se single path.
          lastROM = null;
          log("ℹ Camada 1: baixe o .asm e compile com ca65 (binário .nes no browser na próxima sub-camada).");
          document.getElementById("btnDownload").style.display="none";
          const bp = document.getElementById("btnPlayEmu");
          if(bp) bp.style.display="none";
        } else {
          lastROM = generateNES();
          log("✅ ROM .nes gerada no browser: " + lastROM.length + " bytes");
          document.getElementById("btnDownload").style.display="inline-block";
          const bp = document.getElementById("btnPlayEmu");
          if(bp) bp.style.display="inline-block";
        }
      }catch(ne){
        lastROM = null;
        document.getElementById("btnDownload").style.display="none";
        const bp = document.getElementById("btnPlayEmu");
        if(bp) bp.style.display="none";
        log("⚠ Binário .nes: " + ne.message);
        console.error(ne);
      }

      const stats=document.getElementById("buildStats");
      if(stats){
        stats.innerHTML = "Modo: " + buildMode + "<br>ASM: " + asm.length + " chars<br>ROM: " + (lastROM? lastROM.length+" bytes" : "— (use ca65)") +
          "<br>Música: " + (music?music.name:"—");
      }
    }catch(e){
      log("❌ Erro: "+e.message);
      console.error(e);
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
  function downloadROM(){
    if(!lastROM){ alert("Gere o build primeiro (ou o binário falhou — veja o log)."); return; }
    const blob = new Blob([lastROM], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (Project.data?.name || "meu-jogo").replace(/\s+/g, "_") + ".nes";
    a.click();
  }
  function copyASM(){ const ta=document.getElementById("buildASMPreview"); if(!ta) return; ta.select(); document.execCommand("copy"); }
  function loadJSNES(){
    if(window.jsnes) return Promise.resolve(window.jsnes);
    if(emuScriptPromise) return emuScriptPromise;
    emuScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/jsnes@2/dist/jsnes.min.js";
      s.async = true;
      s.onload = () => {
        if(window.jsnes) resolve(window.jsnes);
        else reject(new Error("jsnes nao carregou"));
      };
      s.onerror = () => reject(new Error("Falha ao carregar jsnes (CDN)"));
      document.head.appendChild(s);
    });
    return emuScriptPromise;
  }

  function stopEmulator(){
    const modal = document.getElementById("buildEmuModal");
    const box = document.getElementById("buildEmuContainer");
    const st = document.getElementById("buildEmuStatus");
    try{
      if(emuBrowser){
        if(typeof emuBrowser.destroy === "function") emuBrowser.destroy();
        else if(emuBrowser.nes && typeof emuBrowser.nes.stop === "function") emuBrowser.nes.stop();
      }
    }catch(e){ console.warn(e); }
    emuBrowser = null;
    if(box) box.innerHTML = "";
    if(modal) modal.style.display = "none";
    if(st) st.textContent = "parado";
  }

  async function playEmulator(){
    if(!lastROM){
      alert("Gere a ROM primeiro (Build ROM).");
      return;
    }
    const modal = document.getElementById("buildEmuModal");
    const box = document.getElementById("buildEmuContainer");
    const st = document.getElementById("buildEmuStatus");
    if(!modal || !box) return;

    stopEmulator();
    modal.style.display = "flex";
    box.innerHTML = "";
    if(st) st.textContent = "carregando jsnes...";

    try{
      const jsnes = await loadJSNES();
      if(st) st.textContent = "iniciando...";

      // API moderna (jsnes.Browser) se existir
      if(typeof jsnes.Browser === "function"){
        emuBrowser = new jsnes.Browser({
          container: box,
          onError: function(e){ console.error(e); if(st) st.textContent = "erro: " + (e && e.message ? e.message : e); }
        });
        if(typeof emuBrowser.loadROM === "function"){
          emuBrowser.loadROM(lastROM);
        } else {
          // algumas builds expõem nes.loadROM
          emuBrowser.nes.loadROM(lastROM);
        }
        if(st) st.textContent = "rodando (" + lastROM.length + " bytes)";
        return;
      }

      // Fallback clássico: NES + canvas manual
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 240;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.imageRendering = "pixelated";
      box.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(256, 240);

      let audioCtx = null;
      try{
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }catch(e){}

      const nes = new jsnes.NES({
        onFrame(frameBuffer){
          for(let i=0;i<frameBuffer.length;i++){
            const c = frameBuffer[i];
            const j = i * 4;
            img.data[j] = c & 0xFF;
            img.data[j+1] = (c >> 8) & 0xFF;
            img.data[j+2] = (c >> 16) & 0xFF;
            img.data[j+3] = 0xFF;
          }
          ctx.putImageData(img, 0, 0);
        },
        onAudioSample(left, right){
          // silencioso no fallback se não houver buffer stream — evita clicks complexos
        }
      });

      // loadROM: Uint8Array ou binary string
      try{
        nes.loadROM(lastROM);
      }catch(e1){
        let bin = "";
        for(let i=0;i<lastROM.length;i++) bin += String.fromCharCode(lastROM[i]);
        nes.loadROM(bin);
      }

      let running = true;
      function frame(){
        if(!running) return;
        nes.frame();
        requestAnimationFrame(frame);
      }
      // input básico
      const keyMap = {
        ArrowUp: jsnes.Controller.BUTTON_UP,
        ArrowDown: jsnes.Controller.BUTTON_DOWN,
        ArrowLeft: jsnes.Controller.BUTTON_LEFT,
        ArrowRight: jsnes.Controller.BUTTON_RIGHT,
        KeyZ: jsnes.Controller.BUTTON_B,
        KeyX: jsnes.Controller.BUTTON_A,
        Enter: jsnes.Controller.BUTTON_START,
        ControlRight: jsnes.Controller.BUTTON_SELECT
      };
      function kd(e){
        const b = keyMap[e.code];
        if(b != null){ nes.buttonDown(1, b); e.preventDefault(); }
      }
      function ku(e){
        const b = keyMap[e.code];
        if(b != null){ nes.buttonUp(1, b); e.preventDefault(); }
      }
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);

      emuBrowser = {
        nes,
        destroy(){
          running = false;
          window.removeEventListener("keydown", kd);
          window.removeEventListener("keyup", ku);
          try{ if(audioCtx) audioCtx.close(); }catch(e){}
        }
      };
      requestAnimationFrame(frame);
      if(st) st.textContent = "rodando (" + lastROM.length + " bytes)";
    }catch(e){
      console.error(e);
      if(st) st.textContent = "erro";
      alert("Não foi possível iniciar o emulador: " + e.message);
    }
  }

  function openEmulator(){ playEmulator(); }

  return {
    init(){ buildHTML(); },
    buildROM, setBuildMode, downloadROM, downloadASM, downloadCFG, copyASM, openEmulator,
    playEmulator, stopEmulator,
    renderPreview, getCurrentData: getSelectedBuildData, generateASM,
    refreshSelects
  };
})();
