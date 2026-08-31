// BUILD ROM v1.0.0 - Camada 6: só existe o build completo. Sem seletores
// manuais de tela ou música - o jogo é compilado só com o que foi
// programado (regras + definições de fase).
const BUILD = (() => {
  let lastASM = "";

  // NGC (NES Game Compiler) backend. O ASM só vem daqui - sem gerador local
  // nem preview instantâneo no navegador (Stage 22).
  const NGC_BACKEND_ENABLED = true;
  const NGC_ENDPOINT = "backend/build.php";

  function buildHTML(){
    const root = document.getElementById("mod-build"); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:8px;align-items:center;padding:10px 12px;background:#252526;border-bottom:1px solid #333;flex-wrap:wrap">
          <h3 style="font-size:12px;color:#4ec9b0">🔨 BUILD ROM</h3>
          <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <button class="btn-tool" onclick="BUILD.buildROM()" style="background:#27ae60;color:#fff;padding:6px 14px;font-weight:bold">🔨 Build ROM</button>
            <button class="btn-tool" onclick="BUILD.downloadASM()" id="btnDownloadASM" style="display:none;background:#8e44ad;color:#fff">⬇ .asm</button>
            <button class="btn-tool" onclick="BUILD.downloadCFG()" id="btnDownloadCFG" style="background:#d35400;color:#fff">⬇ nrom.cfg</button>
          </div>
        </div>
        <div style="display:flex;flex:1;overflow:hidden">
          <div style="width:300px;background:#181818;padding:14px;border-right:1px solid #333;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:11px;color:#ffcc00;margin-bottom:6px">🎯 SOBRE O BUILD</h4>
              <div style="font-size:11px;color:#999;line-height:1.6">
                O jogo é compilado inteiramente a partir do que foi programado:
                fases, variáveis, eventos e regras. Não existe mais seleção
                manual de tela ou música pra teste - se o comportamento não
                está numa regra, ele não acontece na ROM.
              </div>
            </div>
            <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#8585ff;margin-bottom:4px">🐧 COMPILAÇÃO LOCAL (ca65)</h4>
              <div style="font-size:10px;color:#aaa;line-height:1.5;font-family:monospace">
                ca65 jogo.asm -o jogo.o<br>ld65 -C nrom.cfg jogo.o -o jogo.nes<br>fceux jogo.nes
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
          <div style="width:260px;background:#1e1e1e;padding:12px;border-left:1px solid #333;display:flex;flex-direction:column;gap:10px;overflow:auto">
            <h4 style="font-size:11px;color:#ffcc00">RESULTADO</h4>
            <canvas id="buildPreviewCanvas" width="256" height="240" style="width:100%;border:2px solid #665500;background:#000;image-rendering:pixelated;display:block"></canvas>
            <div id="buildStats" style="font-size:11px;color:#888;background:#111;border:1px solid #333;border-radius:4px;padding:8px;line-height:1.5">Aguardando build...</div>
          </div>
        </div>
      </div>
    `;
  }

  function log(m){ const el=document.getElementById("buildLog"); if(el){ el.textContent+="\n"+m; el.scrollTop=el.scrollHeight; } }

  // Resolve a 1ª tela do jogo (splash da 1ª fase, senão a 1ª splash, senão o
  // 1º background) só pra gerar a thumbnail do dashboard - sem seletor
  // manual, já que não existe mais modo Tela Única.
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

  function buildNGCRequest(){
    // build-rom.js é uma casca: manda o project.data (.nms) bruto inteiro,
    // sem nenhum seletor manual - o NGC resolve tudo (telas, CHR, paletas,
    // dados, regras) a partir só do que está programado no projeto.
    const project = JSON.parse(JSON.stringify(Project?.data || {}));
    return { version: 1, project };
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

  async function buildROM(){
    const logEl=document.getElementById("buildLog"); if(logEl) logEl.textContent="Iniciando build (NGC completo)...\n";
    try{
      log("Enviando project.data (.nms) bruto pro NGC...");

      let asm = null;
      let ngcError = null;
      try {
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
      if(stats) stats.innerHTML = "ASM: " + asm.length + " chars<br>ROM: — (use ca65)";

      // Thumbnail do dashboard: gera a partir da 1ª tela do jogo, só se o
      // projeto já tem id no servidor e ainda não tem thumb.
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
    buildROM, downloadASM, downloadCFG, copyASM
  };
})();
