/**
 * BUILD — gera ASM (DASM), monta ROM .bin/.a26 e joga no EmulatorJS (modal)
 */
const BUILD = (() => {
  let lastAsm = '';
  let lastRomB64 = '';
  let lastRomBytes = null; // Uint8Array
  let lastName = 'game.bin';
  let emuBlobUrl = null;
  let emuLoaderInjected = false;

  const EJS_DATA = 'https://cdn.emulatorjs.org/stable/data/';
  const EJS_LOADER = EJS_DATA + 'loader.js';

  function apiBase() {
    if (typeof APP !== 'undefined' && APP.A2600_API) return APP.A2600_API.replace(/\/?$/, '/');
    return 'backend/';
  }

  function buildHTML() {
    const root = document.getElementById('mod-build');
    if (!root) return;
    root.innerHTML = `
      <div class="bld-wrap">
        <div class="bld-toolbar">
          <h3 class="bld-heading">🔨 BUILD ROM</h3>
          <span class="bld-hint">Atari 2600 · DASM · EmulatorJS (Stella)</span>
          <div class="bld-actions">
            <button type="button" class="bld-btn btn-build" id="bldBuild">🔨 Build</button>
            <button type="button" class="bld-btn btn-play" id="bldPlay" disabled title="Abrir emulador">▶ Jogar</button>
            <button type="button" class="bld-btn btn-stop" id="bldStopEmu" style="display:none">⏹ Parar</button>
            <button type="button" class="bld-btn btn-rom" id="bldDownloadRom" disabled>⬇ ROM</button>
            <button type="button" class="bld-btn btn-asm" id="bldDownloadAsm" disabled>⬇ .asm</button>
          </div>
        </div>
        <div class="bld-body">
          <div class="bld-log-box">
            <div class="bld-card-title">Log</div>
            <pre id="bldLog" class="bld-log">Pronto. Clique em Build para gerar ASM e montar a ROM.</pre>
          </div>
          <div class="bld-asm-box">
            <div class="bld-card-title">ASM gerado</div>
            <textarea id="bldAsm" class="bld-asm" readonly placeholder="; o ASM aparece aqui"></textarea>
          </div>
        </div>
      </div>

      <div id="buildEmuModal" class="bld-emu-modal" style="display:none">
        <div class="bld-emu-panel">
          <div class="bld-emu-head">
            <span class="bld-emu-title">▶ Emulador Atari 2600</span>
            <span id="buildEmuModalTitle" class="bld-emu-name"></span>
            <button type="button" id="buildEmuModalClose" class="bld-emu-close" title="Fechar e parar">&times;</button>
          </div>
          <div class="bld-emu-stage">
            <div id="buildEmuPlayer" class="bld-emu-player"></div>
          </div>
          <div class="bld-emu-foot">
            Setas · Z / Space = botão · Enter = Reset · F = Select · clique no jogo para focar · ✕ para parar
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

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function bind() {
    document.getElementById('bldBuild')?.addEventListener('click', () => buildAll());
    document.getElementById('bldDownloadAsm')?.addEventListener('click', () => {
      if (!lastAsm) return;
      downloadText(lastAsm, (Project?.data?.name || 'game') + '.asm');
    });
    document.getElementById('bldDownloadRom')?.addEventListener('click', () => {
      if (!lastRomB64) return;
      downloadB64(lastRomB64, lastName);
    });
    document.getElementById('bldPlay')?.addEventListener('click', () => playROM());
    document.getElementById('bldStopEmu')?.addEventListener('click', () => stopEmu());
    document.getElementById('buildEmuModalClose')?.addEventListener('click', () => stopEmu());
    const modal = document.getElementById('buildEmuModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) stopEmu();
      });
    }
  }

  async function buildAll() {
    const btn = document.getElementById('bldBuild');
    if (btn) btn.disabled = true;
    try {
      stopEmu();
      document.getElementById('bldPlay').disabled = true;
      document.getElementById('bldDownloadRom').disabled = true;
      document.getElementById('bldDownloadAsm').disabled = true;
      lastRomB64 = '';
      lastRomBytes = null;
      const ok = await generate();
      if (!ok) return;
      await assemble();
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /** @returns {Promise<boolean>} */
  async function generate() {
    if (typeof Project === 'undefined' || !Project.data) {
      alert('Nenhum projeto carregado.');
      return false;
    }
    try {
      if (typeof PLAYFIELD !== 'undefined' && PLAYFIELD.flush) PLAYFIELD.flush();
      if (typeof SPRITES !== 'undefined' && SPRITES.flush) SPRITES.flush();
      if (typeof SOUND !== 'undefined' && SOUND.flush) SOUND.flush();
      if (typeof PROGRAM !== 'undefined' && PROGRAM.flush) PROGRAM.flush();
    } catch (e) {}

    log('① Gerando ASM...');
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
        log('Erro ASM: ' + (j.message || 'falha'), true);
        if (j.debug) log(j.debug, true);
        return false;
      }
      lastAsm = j.asm || '';
      const ta = document.getElementById('bldAsm');
      if (ta) ta.value = lastAsm;
      document.getElementById('bldDownloadAsm').disabled = !lastAsm;
      log(
        'ASM ok (' +
          (j.bytes_asm || lastAsm.length) +
          ' chars) · TV=' +
          (j.tv || '?') +
          ' · scoreBar=' +
          (j.scoreEnabled ? 'on' : 'off')
      );
      if (typeof Project.status === 'function') Project.status('ASM gerado');
      return !!lastAsm;
    } catch (e) {
      log('Falha de rede (ASM): ' + e.message, true);
      return false;
    }
  }

  async function assemble() {
    if (!lastAsm) {
      log('Sem ASM para montar.', true);
      return;
    }
    log('② Montando com DASM...');
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
        document.getElementById('bldPlay').disabled = true;
        return;
      }
      lastRomB64 = j.rom_base64 || '';
      lastRomBytes = lastRomB64 ? b64ToBytes(lastRomB64) : null;
      lastName = j.name || 'game.bin';
      document.getElementById('bldDownloadRom').disabled = !lastRomB64;
      document.getElementById('bldPlay').disabled = !lastRomBytes || !lastRomBytes.length;
      log('ROM ok · ' + (j.bytes || 0) + ' bytes · ' + lastName);
      if (j.saved && j.saved.path) log('Salva em ' + j.saved.path);
      if (j.log) log(j.log);
      if (typeof Project.status === 'function') Project.status('ROM montada');
    } catch (e) {
      log('Falha de rede (DASM): ' + e.message, true);
    }
  }

  function loadEmulatorLoader() {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ejs-loader]');
      if (existing) {
        if (existing.dataset.loaded === '1') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Falha ao carregar EmulatorJS')));
        return;
      }
      const s = document.createElement('script');
      s.src = EJS_LOADER;
      s.async = true;
      s.dataset.ejsLoader = '1';
      s.onload = () => {
        s.dataset.loaded = '1';
        emuLoaderInjected = true;
        resolve();
      };
      s.onerror = () =>
        reject(new Error('Não foi possível carregar o EmulatorJS (CDN). Verifique a rede / HTTPS.'));
      document.body.appendChild(s);
    });
  }

  function stopEmu() {
    const player = document.getElementById('buildEmuPlayer');
    if (player) player.innerHTML = '';
    if (emuBlobUrl) {
      try {
        URL.revokeObjectURL(emuBlobUrl);
      } catch (e) {}
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
    } catch (e) {}
    const modal = document.getElementById('buildEmuModal');
    if (modal) modal.style.display = 'none';
    const btnStop = document.getElementById('bldStopEmu');
    if (btnStop) btnStop.style.display = 'none';
    log('⏹ Emulador fechado.');
  }

  async function playROM() {
    if (!lastRomBytes || !lastRomBytes.length) {
      alert('Nenhuma ROM pronta. Monte a ROM com sucesso primeiro.');
      return;
    }

    const player0 = document.getElementById('buildEmuPlayer');
    if (player0) player0.innerHTML = '';
    if (emuBlobUrl) {
      try {
        URL.revokeObjectURL(emuBlobUrl);
      } catch (e) {}
      emuBlobUrl = null;
    }

    const modal = document.getElementById('buildEmuModal');
    const title = document.getElementById('buildEmuModalTitle');
    const gameName = (lastName || 'game.bin').replace(/\.bin$/i, '.a26');
    if (title) title.textContent = gameName;
    if (modal) modal.style.display = 'flex';

    const blob = new Blob([lastRomBytes], { type: 'application/octet-stream' });
    emuBlobUrl = URL.createObjectURL(blob);

    window.EJS_player = '#buildEmuPlayer';
    window.EJS_gameName = gameName;
    window.EJS_gameUrl = emuBlobUrl;
    window.EJS_core = 'atari2600';
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
      cacheManager: false,
    };

    log('▶ Abrindo emulador Atari 2600 (Stella via EmulatorJS)...');
    try {
      document.querySelectorAll('script[data-ejs-loader]').forEach((n) => n.remove());
      emuLoaderInjected = false;

      const player = document.getElementById('buildEmuPlayer');
      if (player) player.innerHTML = '';

      await loadEmulatorLoader();
      const btnStop = document.getElementById('bldStopEmu');
      if (btnStop) btnStop.style.display = 'inline-block';
      log('✅ Emulador iniciado — use o ✕ para fechar e parar.');
    } catch (e) {
      log('❌ Emulador: ' + e.message, true);
      alert('Não foi possível iniciar o emulador:\n' + e.message);
      stopEmu();
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
    const u8 = b64ToBytes(b64);
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
        padding:10px 12px; background:#252526; border-bottom:1px solid #333;
      }
      .bld-heading { margin:0; font-size:12px; color:#4ec9b0; font-weight:600; }
      .bld-hint { font-size:11px; color:#666; }
      .bld-actions { margin-left:auto; display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      .bld-btn {
        border:none; border-radius:4px; padding:6px 14px; cursor:pointer;
        font-size:12px; font-weight:bold; color:#fff;
      }
      .bld-btn.btn-build { background:#27ae60; }
      .bld-btn.btn-play { background:#3498db; }
      .bld-btn.btn-stop { background:#7f8c8d; }
      .bld-btn.btn-rom { background:#e67e22; }
      .bld-btn.btn-asm { background:#8e44ad; }
      .bld-btn:disabled { opacity:0.4; cursor:default; }
      .bld-btn:hover:not(:disabled) { filter:brightness(1.08); }
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
      .bld-emu-modal {
        position:fixed; inset:0; z-index:10050; background:rgba(0,0,0,.88);
        align-items:center; justify-content:center; padding:16px; box-sizing:border-box;
      }
      .bld-emu-panel {
        position:relative; width:min(960px,96vw); max-height:96vh; background:#121212;
        border:1px solid #444; border-radius:12px; box-shadow:0 16px 48px rgba(0,0,0,.7);
        display:flex; flex-direction:column; overflow:hidden;
      }
      .bld-emu-head {
        display:flex; align-items:center; gap:10px; padding:10px 14px;
        background:#1e1e1e; border-bottom:1px solid #333; flex-shrink:0;
      }
      .bld-emu-title { font-size:13px; color:#f4a261; font-weight:600; }
      .bld-emu-name { font-size:12px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .bld-emu-close {
        margin-left:auto; width:36px; height:36px; border:none; border-radius:8px;
        background:#333; color:#fff; font-size:22px; line-height:1; cursor:pointer;
      }
      .bld-emu-close:hover { background:#555; }
      .bld-emu-stage {
        flex:1; min-height:0; display:flex; align-items:center; justify-content:center;
        padding:12px; background:#000;
      }
      .bld-emu-player {
        width:min(640px,92vw); aspect-ratio:4/3; max-height:calc(96vh - 90px); background:#000;
      }
      .bld-emu-foot {
        padding:8px 14px; font-size:11px; color:#666; border-top:1px solid #222; flex-shrink:0;
      }
    `;
    document.head.appendChild(s);
  }

  function init() {
    buildHTML();
  }

  return { init, playROM, stopEmu };
})();

window.BUILD = BUILD;
