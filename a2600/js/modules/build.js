/**
 * BUILD — gera ASM (DASM) e monta ROM .bin/.a26 no backend
 */
const BUILD = (() => {
  let lastAsm = '';
  let lastRomB64 = '';
  let lastName = 'game.bin';

  function apiBase() {
    // editor em /a2600/editor.html → backend em /a2600/backend/
    if (typeof APP !== 'undefined' && APP.A2600_API) return APP.A2600_API.replace(/\/?$/, '/');
    return 'backend/';
  }

  function buildHTML() {
    const root = document.getElementById('mod-build');
    if (!root) return;
    root.innerHTML = `
      <div class="bld-wrap">
        <div class="bld-toolbar">
          <button type="button" class="bld-btn primary" id="bldGenerate">1. Gerar ASM</button>
          <button type="button" class="bld-btn primary" id="bldAssemble">2. Montar ROM (DASM)</button>
          <button type="button" class="bld-btn" id="bldDownloadAsm" disabled>⬇ ASM</button>
          <button type="button" class="bld-btn" id="bldDownloadRom" disabled>⬇ ROM .bin</button>
          <span class="bld-hint">Pipeline Atari 2600 · DASM na VPS</span>
        </div>
        <div class="bld-body">
          <div class="bld-log-box">
            <div class="bld-card-title">Log</div>
            <pre id="bldLog" class="bld-log">Pronto. Gere o ASM a partir do projeto atual.</pre>
          </div>
          <div class="bld-asm-box">
            <div class="bld-card-title">ASM gerado</div>
            <textarea id="bldAsm" class="bld-asm" readonly placeholder="; o ASM aparece aqui"></textarea>
          </div>
        </div>
      </div>
    `;
    injectStyles();
    bind();
  }

  function log(msg, isErr) {
    const el = document.getElementById('bldLog');
    if (!el) return;
    const t = new Date().toLocaleTimeString();
    el.textContent += `\n[${t}] ${msg}`;
    el.scrollTop = el.scrollHeight;
    if (isErr && typeof Project !== 'undefined' && Project.status) {
      Project.status('erro no build');
    }
  }

  function bind() {
    document.getElementById('bldGenerate')?.addEventListener('click', () => generate());
    document.getElementById('bldAssemble')?.addEventListener('click', () => assemble());
    document.getElementById('bldDownloadAsm')?.addEventListener('click', () => {
      if (!lastAsm) return;
      downloadText(lastAsm, (Project?.data?.name || 'game') + '.asm');
    });
    document.getElementById('bldDownloadRom')?.addEventListener('click', () => {
      if (!lastRomB64) return;
      downloadB64(lastRomB64, lastName);
    });
  }

  async function generate() {
    if (typeof Project === 'undefined' || !Project.data) {
      alert('Nenhum projeto carregado.');
      return;
    }
    // flush módulos
    try {
      if (typeof PLAYFIELD !== 'undefined' && PLAYFIELD.flush) PLAYFIELD.flush();
      if (typeof SPRITES !== 'undefined' && SPRITES.flush) SPRITES.flush();
      if (typeof SOUND !== 'undefined' && SOUND.flush) SOUND.flush();
      if (typeof PROGRAM !== 'undefined' && PROGRAM.flush) PROGRAM.flush();
    } catch (e) {}

    log('Gerando ASM...');
    const body = {
      project: Project.data,
      project_id: Project.projectId || 0,
    };
    try {
      const res = await fetch(apiBase() + 'build.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) {
        log('Erro: ' + (j.message || 'falha'), true);
        if (j.debug) log(j.debug, true);
        return;
      }
      lastAsm = j.asm || '';
      const ta = document.getElementById('bldAsm');
      if (ta) ta.value = lastAsm;
      document.getElementById('bldDownloadAsm').disabled = !lastAsm;
      log('ASM ok (' + (j.bytes_asm || lastAsm.length) + ' chars) · TV=' + (j.tv || '?') + ' · scoreBar=' + (j.scoreEnabled ? 'on' : 'off'));
      if (typeof Project.status === 'function') Project.status('ASM gerado');
    } catch (e) {
      log('Falha de rede: ' + e.message, true);
    }
  }

  async function assemble() {
    if (!lastAsm) {
      await generate();
      if (!lastAsm) return;
    }
    log('Montando com DASM...');
    try {
      const res = await fetch(apiBase() + 'assemble.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asm: lastAsm,
          name: (Project?.data?.name || 'game').replace(/\s+/g, '_'),
          project_id: Project?.projectId || 0,
        }),
      });
      const j = await res.json();
      if (!j.success) {
        log('DASM erro: ' + (j.message || ''), true);
        if (j.log) log(j.log, true);
        if (j.hint) log(j.hint);
        return;
      }
      lastRomB64 = j.rom_base64 || '';
      lastName = j.name || 'game.bin';
      document.getElementById('bldDownloadRom').disabled = !lastRomB64;
      log('ROM ok · ' + (j.bytes || 0) + ' bytes · ' + lastName);
      if (j.saved && j.saved.path) log('Salva em ' + j.saved.path);
      if (j.log) log(j.log);
      if (typeof Project.status === 'function') Project.status('ROM montada');
    } catch (e) {
      log('Falha de rede: ' + e.message, true);
    }
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function downloadB64(b64, filename) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function injectStyles() {
    if (document.getElementById('bld-styles')) return;
    const s = document.createElement('style');
    s.id = 'bld-styles';
    s.textContent = `
      .bld-wrap { display:flex; flex-direction:column; height:100%; background:#1e1e1e; }
      .bld-toolbar {
        display:flex; gap:8px; align-items:center; flex-wrap:wrap;
        padding:8px 12px; background:#252526; border-bottom:1px solid #333;
      }
      .bld-btn {
        background:#2a2a2a; border:1px solid #444; color:#ccc; border-radius:6px;
        padding:6px 12px; cursor:pointer; font-size:12px;
      }
      .bld-btn.primary { background:#3d2a14; border-color:#f4a26166; color:#f4a261; }
      .bld-btn:disabled { opacity:0.4; cursor:default; }
      .bld-hint { margin-left:auto; font-size:11px; color:#666; }
      .bld-body { flex:1; display:flex; gap:10px; padding:10px; min-height:0; }
      .bld-log-box, .bld-asm-box {
        flex:1; display:flex; flex-direction:column; min-width:0;
        background:#161920; border:1px solid #333; border-radius:8px; overflow:hidden;
      }
      .bld-card-title {
        padding:8px 10px; font-size:11px; color:#f4a261; border-bottom:1px solid #2a2a2a;
      }
      .bld-log {
        flex:1; margin:0; padding:10px; overflow:auto; font-size:11px;
        font-family:ui-monospace,monospace; color:#8dcea0; white-space:pre-wrap;
      }
      .bld-asm {
        flex:1; width:100%; border:none; resize:none; padding:10px;
        background:#0d0d0d; color:#cde; font-family:ui-monospace,monospace; font-size:11px;
        box-sizing:border-box;
      }
    `;
    document.head.appendChild(s);
  }

  function init() {
    buildHTML();
  }

  return { init };
})();

window.BUILD = BUILD;
