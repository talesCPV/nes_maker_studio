// BUILD ROM v1.2.0 - NGC + ca65/ld65 + EmulatorJS (play in-page)
const BUILD = (() => {
  let lastASM = "";
  let lastCFG = "";
  let lastNES = null; // { filename, bytes: Uint8Array }
  let emuBlobUrl = null;
  let emuLoaderInjected = false;

  const NGC_BACKEND_ENABLED = true;
  const NGC_ENDPOINT = "backend/build.php";
  const CFG_ENDPOINT = "backend/cfg.php";
  const ASSEMBLE_ENDPOINT = "backend/assemble.php";

  // EmulatorJS (CDN oficial)
  const EJS_DATA = "https://cdn.emulatorjs.org/stable/data/";
  const EJS_LOADER = EJS_DATA + "loader.js";

  function buildHTML(){
    const root = document.getElementById("mod-build"); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:10px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#4ec9b0">🔨 BUILD ROM</h3>
          <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <button class="btn-tool" onclick="BUILD.buildROM()" style="background:#27ae60;color:#fff;padding:6px 14px;font-weight:bold">🔨 Build ROM</button>
            <button class="btn-tool" onclick="BUILD.playROM()" id="btnPlayNES" style="display:none;background:#3498db;color:#fff;font-weight:bold">▶ Jogar</button>
            <button class="btn-tool" onclick="BUILD.stopEmu()" id="btnStopEmu" style="display:none;background:#7f8c8d;color:#fff">⏹ Parar</button>
            <button class="btn-tool" onclick="BUILD.downloadNES()" id="btnDownloadNES" style="display:none;background:#e67e22;color:#fff;font-weight:bold">⬇ Baixar ROM</button>
            <button class="btn-tool" onclick="BUILD.downloadASM()" id="btnDownloadASM" style="display:none;background:#8e44ad;color:#fff">⬇ .asm</button>
            <button class="btn-tool" onclick="BUILD.downloadCFG()" id="btnDownloadCFG" style="display:none;background:#d35400;color:#fff">⬇ nrom.cfg</button>
          </div>
        </div>
        <div style="display:flex;flex:1;overflow:hidden">
          <div style="width:300px;background:#181818;padding:14px;border-right:1px solid #333;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:6px">🎯 SOBRE O BUILD</h4>
              <div style="font-size:11px;color:#999;line-height:1.6">
                1) NGC gera o .asm<br>
                2) Backend gera o nrom.cfg<br>
                3) assemble.php → ca65/ld65 → .nes<br>
                4) ▶ Jogar abre o emulador nesta tela
              </div>
            </div>
            <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#8585ff;margin-bottom:4px">🎮 CONTROLES (teclado)</h4>
              <div style="font-size:10px;color:#aaa;line-height:1.55;font-family:monospace">
                Setas — direção<br>
                Z / A — A<br>
                X / S — B<br>
                Enter — Start<br>
                Shift — Select
              </div>
            </div>
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:6px">EMULADOR</h4>
              <div style="font-size:11px;color:#888;line-height:1.5">
                Após o build, use <b style="color:#3498db">▶ Jogar</b> para abrir o emulador em tela grande (modal).
              </div>
            </div>
          </div>
          <div style="flex:1;background:#111;padding:14px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;gap:8px;align-items:center">
              <h4 style="font-size:11px;color:#4ec9b0">LOG</h4>
              <button class="btn-tool" onclick="BUILD.copyASM()" style="margin-left:auto;font-size:10px">📋 Copiar ASM</button>
            </div>
            <div id="buildLog" style="background:#000;border:1px solid #333;border-radius:6px;padding:10px;font-family:monospace;font-size:11px;color:#0f0;min-height:120px;white-space:pre-wrap;overflow:auto">Aguardando build...</div>
            <h4 style="font-size:11px;color:#4ec9b0">.ASM GERADO (Compatível com ca65)</h4>
            <textarea id="buildASMPreview" style="width:100%;flex:1;min-height:400px;background:#000;color:#4ec9b0;border:1px solid #333;border-radius:4px;padding:8px;font-family:monospace;font-size:10px;resize:vertical;white-space:pre;overflow:auto" readonly></textarea>
          </div>
          <div style="width:260px;background:#1e1e1e;padding:12px;border-left:1px solid #333;display:flex;flex-direction:column;gap:10px;overflow:auto">
            <h4 style="font-size:11px;color:#ffcc00">RESULTADO</h4>
            <canvas id="buildPreviewCanvas" width="256" height="240" style="width:100%;border:2px solid #665500;background:#000;image-rendering:pixelated;display:block"></canvas>
            <div id="buildStats" style="font-size:11px;color:#888;background:#111;border:1px solid #333;border-radius:4px;padding:8px;line-height:1.5">Aguardando build...</div>
          </div>
        </div>
      </div>

      <!-- Modal do emulador (tela grande) -->
      <div id="buildEmuModal" style="display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.88);align-items:center;justify-content:center;padding:16px;box-sizing:border-box">
        <div style="position:relative;width:min(960px,96vw);max-height:96vh;background:#121212;border:1px solid #444;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.7);display:flex;flex-direction:column;overflow:hidden">
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#1e1e1e;border-bottom:1px solid #333;flex-shrink:0">
            <span style="font-size:13px;color:#4ec9b0;font-weight:600">▶ Emulador NES</span>
            <span id="buildEmuModalTitle" style="font-size:12px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
            <button type="button" id="buildEmuModalClose" onclick="BUILD.stopEmu()" title="Fechar e parar"
              style="margin-left:auto;width:36px;height:36px;border:none;border-radius:8px;background:#333;color:#fff;font-size:22px;line-height:1;cursor:pointer">&times;</button>
          </div>
          <div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px;background:#000">
            <div id="buildEmuPlayer" style="width:min(896px,92vw);aspect-ratio:256/240;max-height:calc(96vh - 80px);background:#000"></div>
          </div>
          <div style="padding:8px 14px;font-size:11px;color:#666;border-top:1px solid #222;flex-shrink:0">
            Setas · Z/A = A · X/S = B · Enter = Start · Shift = Select · clique no jogo para focar
          </div>
        </div>
      </div>
    `;
  }

  function log(m){
    const el = document.getElementById("buildLog");
    if(el){ el.textContent += "\n" + m; el.scrollTop = el.scrollHeight; }
  }

  function hideDownloadButtons(){
    ["btnDownloadNES","btnDownloadASM","btnDownloadCFG","btnPlayNES","btnStopEmu"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.style.display = "none";
    });
  }

  function getFirstScreenForThumbnail(){
    const phases = Project.data?.phases || [];
    const splashes = Project.data?.splashScreens || [];
    const bgs = Project.data?.backgrounds || [];
    const p0 = phases[0];
    if (p0 && p0.splash) {
      const found = splashes.find(s => s && s.name === p0.splash);
      if (found) return found;
    }
    if (splashes.length) return splashes[0];
    if (bgs.length) return bgs[0];
    return null;
  }

  function renderPreview(){
    const canvas = document.getElementById("buildPreviewCanvas");
    if(!canvas || typeof RENDER_UTILS === "undefined") return;
    const screen = getFirstScreenForThumbnail();
    const nt = screen?.nametable || new Array(960).fill(0);
    const at = screen?.attributes || new Array(64).fill(0);
    const chrBuf = typeof CHR !== "undefined" && CHR.getBuffer ? CHR.getBuffer() : new Uint8Array(8192);
    const pals = typeof CHR !== "undefined" && CHR.getPalettes ? CHR.getPalettes() : [[15,0,16,48]];
    RENDER_UTILS.drawNametableToCanvas(canvas, nt, at, chrBuf, pals);
  }

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

  function buildNGCRequest(){
    const project = JSON.parse(JSON.stringify(Project?.data || {}));
    return { version: 1, project };
  }

  async function generateASMFromNGC(){
    if(!NGC_BACKEND_ENABLED) return null;
    const response = await fetch(NGC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "same-origin",
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

  async function fetchCFGFromBackend(){
    const project = {
      name: Project?.data?.name || "projeto",
      mapper: Project?.data?.mapper != null ? Project.data.mapper : 0
    };
    const response = await fetch(CFG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ project })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data.ok || typeof data.cfg !== "string"){
      throw new Error(data.error || "Falha ao gerar nrom.cfg no backend.");
    }
    return data.cfg;
  }

  async function assembleOnBackend(asm, cfg){
    const name = (Project?.data?.name || "jogo").replace(/\s+/g, "_");
    const project_id = (typeof Project !== "undefined" && Project.projectId)
      ? Project.projectId
      : null;
    const response = await fetch(ASSEMBLE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ asm, cfg, name, project_id })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data.ok){
      const err = new Error(data.error || ("Assemble HTTP " + response.status));
      err.log = data.log || "";
      err.stage = data.stage || "";
      throw err;
    }
    return data;
  }

  function b64ToUint8Array(b64){
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function loadEmulatorLoader(){
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ejs-loader]');
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Falha ao carregar EmulatorJS")));
        if (existing.dataset.loaded === "1") resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = EJS_LOADER;
      s.async = true;
      s.dataset.ejsLoader = "1";
      s.onload = () => { s.dataset.loaded = "1"; emuLoaderInjected = true; resolve(); };
      s.onerror = () => reject(new Error("Não foi possível carregar o EmulatorJS (CDN). Verifique a rede / HTTPS."));
      document.body.appendChild(s);
    });
  }

  function stopEmu(){
    const player = document.getElementById("buildEmuPlayer");
    if (player) player.innerHTML = "";
    if (emuBlobUrl) {
      try { URL.revokeObjectURL(emuBlobUrl); } catch(e) {}
      emuBlobUrl = null;
    }
    try {
      delete window.EJS_player;
      delete window.EJS_gameUrl;
      delete window.EJS_core;
      delete window.EJS_gameName;
      delete window.EJS_pathtodata;
      delete window.EJS_startOnLoaded;
      delete window.EJS_Buttons;
    } catch(e) {}
    const modal = document.getElementById("buildEmuModal");
    if (modal) modal.style.display = "none";
    const btnStop = document.getElementById("btnStopEmu");
    if (btnStop) btnStop.style.display = "none";
    log("⏹ Emulador fechado.");
  }

  async function playROM(){
    if (!lastNES || !lastNES.bytes || !lastNES.bytes.length) {
      alert("Nenhuma ROM pronta. Rode o Build com sucesso primeiro.");
      return;
    }

    // Limpa sessão anterior sem esconder o fluxo
    const player0 = document.getElementById("buildEmuPlayer");
    if (player0) player0.innerHTML = "";
    if (emuBlobUrl) {
      try { URL.revokeObjectURL(emuBlobUrl); } catch(e) {}
      emuBlobUrl = null;
    }

    const modal = document.getElementById("buildEmuModal");
    const title = document.getElementById("buildEmuModalTitle");
    if (title) title.textContent = lastNES.filename || "game.nes";
    if (modal) modal.style.display = "flex";

    const blob = new Blob([lastNES.bytes], { type: "application/octet-stream" });
    emuBlobUrl = URL.createObjectURL(blob);

    window.EJS_player = "#buildEmuPlayer";
    window.EJS_gameName = lastNES.filename || "game.nes";
    window.EJS_gameUrl = emuBlobUrl;
    window.EJS_core = "nes";
    window.EJS_pathtodata = EJS_DATA;
    window.EJS_startOnLoaded = true;
    window.EJS_Buttons = {
      playPause: true,
      restart: true,
      mute: true,
      settings: false,
      fullscreen: true,
      saveState: false,
      loadState: false,
      screenRecord: false,
      gamepad: true,
      cheat: false,
      volume: true,
      saveSavFiles: false,
      loadSavFiles: false,
      quickSave: false,
      quickLoad: false,
      screenshot: false,
      cacheManager: false
    };

    log("▶ Abrindo emulador em modal...");
    try {
      document.querySelectorAll('script[data-ejs-loader]').forEach(n => n.remove());
      emuLoaderInjected = false;

      const player = document.getElementById("buildEmuPlayer");
      if (player) player.innerHTML = "";

      await loadEmulatorLoader();
      const btnStop = document.getElementById("btnStopEmu");
      if (btnStop) btnStop.style.display = "inline-block";
      log("✅ Emulador iniciado — use o ✕ para fechar e parar.");
    } catch (e) {
      log("❌ Emulador: " + e.message);
      alert("Não foi possível iniciar o emulador:\n" + e.message);
      stopEmu();
    }
  }

  async function buildROM(){
    const logEl = document.getElementById("buildLog");
    if(logEl) logEl.textContent = "Iniciando build (NGC + ca65)...\n";
    stopEmu();
    lastNES = null;
    lastASM = "";
    lastCFG = "";
    hideDownloadButtons();

    const stats = document.getElementById("buildStats");
    try{
      log("① Enviando project.data pro NGC (build.php)...");
      let asm = null;
      try {
        const ngcResult = await generateASMFromNGC();
        if(ngcResult && typeof ngcResult.asm === "string" && ngcResult.asm.trim()){
          asm = ngcResult.asm;
          log("✅ ASM gerado pelo NGC (v" + (ngcResult.version || "?") + ") — " + asm.length + " chars.");
        }
      } catch(e) {
        log("❌ NGC: " + e.message);
        if(stats) stats.innerHTML = "❌ NGC falhou";
        alert("Falha ao gerar ASM:\n" + e.message);
        return;
      }
      if(!asm){
        log("❌ NGC não devolveu ASM utilizável.");
        if(stats) stats.innerHTML = "❌ Sem ASM";
        alert("O NGC não devolveu um ASM utilizável.");
        return;
      }
      lastASM = asm;
      const asmEl = document.getElementById("buildASMPreview");
      if(asmEl) asmEl.value = asm;
      const btnAsm = document.getElementById("btnDownloadASM");
      if(btnAsm) btnAsm.style.display = "inline-block";

      log("② Gerando nrom.cfg (cfg.php)...");
      let cfg;
      try {
        cfg = await fetchCFGFromBackend();
        lastCFG = cfg;
        log("✅ nrom.cfg recebido (" + cfg.length + " chars).");
        const btnCfg = document.getElementById("btnDownloadCFG");
        if(btnCfg) btnCfg.style.display = "inline-block";
      } catch(e) {
        log("❌ CFG: " + e.message);
        if(stats) stats.innerHTML = "❌ CFG falhou";
        alert("Falha ao gerar nrom.cfg:\n" + e.message);
        return;
      }

      log("③ Montando ROM (assemble.php → ca65 + ld65)...");
      try {
        const assembled = await assembleOnBackend(asm, cfg);
        if(assembled.log) log(assembled.log);
        const bytes = b64ToUint8Array(assembled.nes);
        lastNES = {
          filename: assembled.filename || ((Project?.data?.name || "jogo").replace(/\s+/g, "_") + ".nes"),
          bytes
        };
        log("✅ ROM pronta: " + lastNES.filename + " (" + bytes.length + " bytes).");
        if(assembled.saved && assembled.saved_path){
          log("💾 Salva no servidor: " + assembled.saved_path);
        } else {
          log("ℹ ROM não gravada na pasta do projeto (sem project_id ou sessão).");
        }
        const btnNes = document.getElementById("btnDownloadNES");
        if(btnNes) btnNes.style.display = "inline-block";
        const btnPlay = document.getElementById("btnPlayNES");
        if(btnPlay) btnPlay.style.display = "inline-block";
        if(stats){
          stats.innerHTML =
            "ASM: " + asm.length + " chars<br>" +
            "ROM: " + bytes.length + " bytes<br>" +
            "Arquivo: " + lastNES.filename +
            (assembled.saved ? "<br>Servidor: ✓ game.nes" : "<br>Servidor: —");
        }
      } catch(e) {
        if(e.log) log(e.log);
        log("❌ Assemble: " + e.message + (e.stage ? " [" + e.stage + "]" : ""));
        if(stats) stats.innerHTML = "❌ Assemble falhou";
        alert("Falha na montagem (ca65/ld65):\n" + e.message + (e.log ? "\n\nVeja o LOG do build para detalhes." : ""));
        return;
      }

      try {
        await maybeUploadBuildThumbnail();
      } catch(thumbErr) {
        console.warn("Thumbnail:", thumbErr);
      }
    }catch(e){
      log("❌ Erro: " + e.message);
      console.error(e);
      alert("Erro no build:\n" + e.message);
    }
  }

  function downloadASM(){
    if(!lastASM){ alert("Build primeiro!"); return; }
    const blob = new Blob([lastASM], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (Project.data?.name || "meu-jogo").replace(/\s+/g, "_") + ".asm";
    a.click();
  }

  function downloadCFG(){
    if(!lastCFG){ alert("Build primeiro!"); return; }
    const blob = new Blob([lastCFG], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nrom.cfg";
    a.click();
  }

  function downloadNES(){
    if(!lastNES || !lastNES.bytes){ alert("ROM ainda não disponível. Rode o Build com sucesso."); return; }
    const blob = new Blob([lastNES.bytes], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = lastNES.filename || "jogo.nes";
    a.click();
  }

  function copyASM(){
    const ta = document.getElementById("buildASMPreview");
    if(!ta) return;
    ta.select();
    document.execCommand("copy");
  }

  return {
    init(){
      buildHTML();
      // Clique no backdrop fecha e para
      const modal = document.getElementById("buildEmuModal");
      if (modal) {
        modal.addEventListener("click", (e) => {
          if (e.target === modal) stopEmu();
        });
      }
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          const m = document.getElementById("buildEmuModal");
          if (m && m.style.display === "flex") stopEmu();
        }
      });
    },
    buildROM, downloadASM, downloadCFG, downloadNES, copyASM, playROM, stopEmu
  };
})();
