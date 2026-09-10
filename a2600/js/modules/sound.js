/**
 * SOUND — editor de áudio TIA (Atari 2600)
 *
 * Hardware: 2 canais independentes
 *   AUDCx (0–15) — tipo de distorção / forma
 *   AUDFx (0–31) — divisor de frequência
 *   AUDVx (0–15) — volume
 *
 * No .agc: Project.data.sounds[]
 */
const SOUND = (() => {
  const STEPS_DEFAULT = 32;
  const MAX_STEPS = 128;

  // Rótulos clássicos dos modos AUDC (aprox. Stella/docs)
  const AUDC_LABELS = [
    '0 Off/set',
    '1 Saw/pitch',
    '2 —',
    '3 —',
    '4 Pure tone',
    '5 —',
    '6 Rumble',
    '7 Low rumble',
    '8 White noise',
    '9 —',
    '10 —',
    '11 —',
    '12 Pure tone',
    '13 —',
    '14 —',
    '15 —',
  ];

  let items = []; // { id, type: 'song'|'sfx', name, tempo, loop, steps, ch0[], ch1[] }
  let activeId = null;
  let selectedCh = 0;
  let selectedStep = 0;
  let playing = false;
  let playTimer = null;
  let playStep = 0;
  let audioCtx = null;

  // Estado espelho do item ativo
  let name = 'Som 1';
  let type = 'sfx';
  let tempo = 120;
  let loop = true;
  let steps = STEPS_DEFAULT;
  let ch0 = [];
  let ch1 = [];

  function uid() {
    return 'snd_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36);
  }

  function emptyStep() {
    return { c: 4, f: 16, v: 0 }; // pure tone, mid freq, silêncio
  }

  function emptyChannel(n) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(emptyStep());
    return a;
  }

  function ensureData() {
    if (!Project.data) Project.data = Project.defaultData();
    if (!Array.isArray(Project.data.sounds)) Project.data.sounds = [];
    return Project.data;
  }

  function defaultItem(kind, label) {
    const n = STEPS_DEFAULT;
    return {
      id: uid(),
      type: kind || 'sfx',
      name: label || (kind === 'song' ? 'Música 1' : 'SFX 1'),
      tempo: 120,
      loop: kind === 'song',
      steps: n,
      ch0: emptyChannel(n),
      ch1: emptyChannel(n),
    };
  }

  function loadLibrary() {
    const d = ensureData();
    if (!d.sounds.length) {
      d.sounds.push(defaultItem('sfx', 'SFX 1'));
      d.sounds.push(defaultItem('song', 'Música 1'));
    }
    items = d.sounds;
    if (!activeId || !items.find((x) => x.id === activeId)) activeId = items[0].id;
    loadActive();
  }

  function flushActive() {
    const it = items.find((x) => x.id === activeId);
    if (!it) return;
    it.name = name;
    it.type = type;
    it.tempo = tempo;
    it.loop = loop;
    it.steps = steps;
    it.ch0 = JSON.parse(JSON.stringify(ch0));
    it.ch1 = JSON.parse(JSON.stringify(ch1));
    ensureData().sounds = items;
    if (typeof Project.status === 'function') Project.status('som alterado — salve o projeto');
  }

  function loadActive() {
    const it = items.find((x) => x.id === activeId);
    if (!it) return;
    name = it.name || 'Som';
    type = it.type === 'song' ? 'song' : 'sfx';
    tempo = it.tempo || 120;
    loop = !!it.loop;
    steps = Math.max(1, Math.min(MAX_STEPS, it.steps || STEPS_DEFAULT));
    ch0 = JSON.parse(JSON.stringify(it.ch0 || emptyChannel(steps)));
    ch1 = JSON.parse(JSON.stringify(it.ch1 || emptyChannel(steps)));
    while (ch0.length < steps) ch0.push(emptyStep());
    while (ch1.length < steps) ch1.push(emptyStep());
    ch0 = ch0.slice(0, steps);
    ch1 = ch1.slice(0, steps);
    selectedStep = Math.min(selectedStep, steps - 1);
  }

  function getCh(i) {
    return i === 1 ? ch1 : ch0;
  }

  function setCh(i, arr) {
    if (i === 1) ch1 = arr;
    else ch0 = arr;
  }

  // --- Web Audio approx TIA ---
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  /** Frequência aproximada a partir de AUDF + tipo (NTSC ~ 30kHz/2 base simplificada) */
  function tiaFreq(audf, audc) {
    const f = Math.max(0, Math.min(31, audf | 0));
    // Base clássica aproximada: 31400 / (AUDF+1) com divisores por modo
    let base = 31400 / (f + 1);
    const c = audc & 0x0f;
    if (c === 8) base = base / 2; // noise-ish lower
    if (c === 6 || c === 7) base = base / 6;
    if (c === 1) base = base / 2;
    return Math.max(30, Math.min(8000, base));
  }

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  /** Range visual: B5 (≈AUDF 31) → B9 (última oitava útil; B10 inaudível) */
  const KB_MIDI_LO = 83;  // B5
  const KB_MIDI_HI = 131; // B9 (B10 inaudível na prática)

  function isPureTone(audc) {
    const c = audc & 0x0f;
    return c === 4 || c === 12;
  }

  /** Freq. de tom puro NTSC (AUDC 4/12): 31400 / (AUDF+1) */
  function pureToneHz(audf) {
    return 31400 / ((audf & 0x1f) + 1);
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function midiLabel(midi) {
    const n = ((midi % 12) + 12) % 12;
    const oct = Math.floor(midi / 12) - 1;
    return NOTE_NAMES[n] + oct;
  }

  function freqToMidiFloat(freq) {
    if (!freq || freq <= 0) return null;
    return 69 + 12 * Math.log2(freq / 440);
  }

  function midiLabelFromFreq(freq) {
    const mf = freqToMidiFloat(freq);
    if (mf == null) return '?';
    return midiLabel(Math.round(mf));
  }

  /** AUDF 0–31 mais próximo de uma freq alvo */
  function freqToAudf(targetHz) {
    let best = 16;
    let bestErr = Infinity;
    for (let f = 0; f <= 31; f++) {
      const hz = pureToneHz(f);
      const err = Math.abs(Math.log(hz / targetHz));
      if (err < bestErr) {
        bestErr = err;
        best = f;
      }
    }
    return best;
  }

  function audfToNearestMidi(audf) {
    const mf = freqToMidiFloat(pureToneHz(audf));
    if (mf == null) return null;
    return Math.max(KB_MIDI_LO, Math.min(KB_MIDI_HI, Math.round(mf)));
  }

  function playStepSound(stepData, chIndex, when, dur) {
    if (!stepData || !(stepData.v > 0)) return;
    const ctx = getCtx();
    const t0 = when || ctx.currentTime;
    const len = dur || 0.12;
    const c = stepData.c & 0x0f;
    const freq = (c === 4 || c === 12)
      ? pureToneHz(stepData.f)
      : tiaFreq(stepData.f, stepData.c);
    const vol = (stepData.v & 0x0f) / 15;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (c === 8 || c === 6 || c === 7) {
      // ruído aproximado
      const bufSize = Math.floor(ctx.sampleRate * len);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let seed = (chIndex + 1) * 17 + (stepData.f | 0);
      for (let i = 0; i < bufSize; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        data[i] = ((seed >> 16) / 0x7fff) * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      gain.gain.setValueAtTime(vol * 0.35, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + len);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + len);
      return;
    }

    osc.type = c === 1 ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol * 0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + len);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + len);
  }

  function stopPlay() {
    playing = false;
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
    const btn = document.getElementById('sndPlay');
    if (btn) btn.textContent = '▶';
    document.querySelectorAll('.snd-step.playing').forEach((el) => el.classList.remove('playing'));
  }

  function startPlay() {
    stopPlay();
    try {
      getCtx().resume();
    } catch (e) {}
    playing = true;
    playStep = 0;
    const btn = document.getElementById('sndPlay');
    if (btn) btn.textContent = '■';
    const ms = Math.max(40, Math.round(60000 / (tempo || 120) / 2)); // colchete = colcheia aprox

    const tick = () => {
      if (!playing) return;
      highlightStep(playStep);
      const s0 = ch0[playStep];
      const s1 = ch1[playStep];
      const dur = ms / 1000 * 0.9;
      playStepSound(s0, 0, 0, dur);
      playStepSound(s1, 1, 0, dur);
      playStep++;
      if (playStep >= steps) {
        if (loop) playStep = 0;
        else stopPlay();
      }
    };
    tick();
    playTimer = setInterval(tick, ms);
  }

  function highlightStep(idx) {
    document.querySelectorAll('.snd-step').forEach((el) => {
      el.classList.toggle('playing', parseInt(el.getAttribute('data-step'), 10) === idx);
    });
  }

  function buildHTML() {
    const root = document.getElementById('mod-sound');
    if (!root) return;
    loadLibrary();

    const listHtml = items
      .map(
        (it) => `
      <div class="snd-item ${it.id === activeId ? 'active' : ''}" data-id="${it.id}">
        <span class="snd-item-type">${it.type === 'song' ? '🎵' : '💥'}</span>
        <span class="snd-item-name">${escapeHtml(it.name || 'Som')}</span>
      </div>`
      )
      .join('');

    root.innerHTML = `
      <div class="snd-wrap">
        <div class="snd-left">
          <div class="snd-left-head">
            <span>Sons TIA</span>
            <div>
              <button type="button" class="snd-btn" id="sndAddSfx" title="Novo SFX">+SFX</button>
              <button type="button" class="snd-btn" id="sndAddSong" title="Nova música">+Música</button>
            </div>
          </div>
          <div class="snd-list">${listHtml}</div>
        </div>
        <div class="snd-main">
          <div class="snd-toolbar">
            <label>Nome <input id="sndName" type="text" value="${escapeAttr(name)}" /></label>
            <label>Tipo
              <select id="sndType">
                <option value="sfx" ${type === 'sfx' ? 'selected' : ''}>SFX</option>
                <option value="song" ${type === 'song' ? 'selected' : ''}>Música</option>
              </select>
            </label>
            <label>Tempo <input id="sndTempo" type="number" min="40" max="300" value="${tempo}" style="width:56px" /></label>
            <label class="snd-check"><input type="checkbox" id="sndLoop" ${loop ? 'checked' : ''}/> Loop</label>
            <label>Steps <input id="sndSteps" type="number" min="1" max="${MAX_STEPS}" value="${steps}" style="width:52px" /></label>
            <button type="button" class="snd-btn accent" id="sndPlay" title="Play/Stop">▶</button>
            <button type="button" class="snd-btn danger" id="sndDelete">🗑</button>
            <span class="snd-hint">2 canais · AUDC / AUDF / AUDV · clique no step</span>
          </div>
          <div class="snd-body">
            <div class="snd-center">
              <div class="snd-seq" id="sndSeq"></div>
              <div class="snd-kb-wrap">
                <div class="snd-kb-head">
                  <span class="snd-card-title" style="margin:0">Teclado</span>
                  <span id="sndNoteLabel" style="color:#8dcea0;font-weight:600;font-size:12px"></span>
                  <span id="sndKbHint" class="snd-hint" style="margin-left:auto"></span>
                </div>
                <div class="snd-kb" id="sndKeyboard" title="Piano B5–B9 · AUDF 31 → agudos úteis"></div>
              </div>
            </div>
            <div class="snd-side">
              <div class="snd-card">
                <div class="snd-card-title">Step <span id="sndStepLabel">0</span> · Canal <span id="sndChLabel">0</span></div>
                <label>AUDC (controle)
                  <select id="sndAudc"></select>
                </label>
                <label>AUDF (freq 0–31)
                  <input type="range" id="sndAudf" min="0" max="31" value="16" />
                  <code id="sndAudfVal">16</code>
                </label>
                <label>AUDV (vol 0–15)
                  <input type="range" id="sndAudv" min="0" max="15" value="0" />
                  <code id="sndAudvVal">0</code>
                </label>
                <button type="button" class="snd-btn" id="sndPreview">▶ Ouvir step</button>
                <button type="button" class="snd-btn" id="sndClearStep">Silenciar step</button>
              </div>
              <div class="snd-card">
                <div class="snd-card-title">TIA</div>
                <p class="snd-note">
                  Só <b>2 canais</b>. Cada step grava AUDC/AUDF/AUDV.
                  AUDC 4 e 12 ≈ tom puro; 8 ≈ ruído; 6–7 ≈ rumble.
                  Frequência real depende do divisor (AUDF) e do modo.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    injectStyles();
    fillAudcSelect();
    buildKeyboard();
    renderSeq();
    bind();
    loadStepEditor();
  }

  function fillAudcSelect() {
    const sel = document.getElementById('sndAudc');
    if (!sel) return;
    sel.innerHTML = AUDC_LABELS.map((lab, i) => `<option value="${i}">${lab}</option>`).join('');
  }

  function buildKeyboard() {
    const root = document.getElementById('sndKeyboard');
    if (!root) return;
    root.innerHTML = '';

    const whites = [];
    for (let m = KB_MIDI_LO; m <= KB_MIDI_HI; m++) {
      const n = m % 12;
      if ([1, 3, 6, 8, 10].includes(n)) continue;
      whites.push(m);
    }
    const wCount = whites.length;

    whites.forEach((midi, i) => {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'snd-kb-white';
      key.setAttribute('data-midi', String(midi));
      key.title = midiLabel(midi) + ' → AUDF ' + freqToAudf(midiToFreq(midi));
      key.style.left = (i / wCount) * 100 + '%';
      key.style.width = 100 / wCount + '%';
      key.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onKeyboardNote(midi);
      });
      root.appendChild(key);
    });

    for (let m = KB_MIDI_LO; m <= KB_MIDI_HI; m++) {
      const n = m % 12;
      if (![1, 3, 6, 8, 10].includes(n)) continue;
      const idx = whites.findIndex((w) => w === m - 1);
      if (idx < 0) continue;
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'snd-kb-black';
      key.setAttribute('data-midi', String(m));
      key.title = midiLabel(m) + ' → AUDF ' + freqToAudf(midiToFreq(m));
      key.style.left = ((idx + 0.65) / wCount) * 100 + '%';
      key.style.width = (100 / wCount) * 0.65 + '%';
      key.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onKeyboardNote(m);
      });
      root.appendChild(key);
    }
  }

  function onKeyboardNote(midi) {
    const audf = freqToAudf(midiToFreq(midi));
    const audcEl = document.getElementById('sndAudc');
    if (audcEl) audcEl.value = '4';
    const fEl = document.getElementById('sndAudf');
    const vEl = document.getElementById('sndAudv');
    if (fEl) fEl.value = String(audf);
    if (vEl && (parseInt(vEl.value, 10) || 0) === 0) vEl.value = '10';
    const fv = document.getElementById('sndAudfVal');
    const vv = document.getElementById('sndAudvVal');
    if (fv) fv.textContent = String(audf);
    if (vv) vv.textContent = vEl ? vEl.value : '10';

    const arr = getCh(selectedCh);
    const s = arr[selectedStep] || emptyStep();
    s.c = 4;
    s.f = audf;
    s.v = Math.max(s.v | 0, 10) & 0x0f;
    arr[selectedStep] = s;
    setCh(selectedCh, arr);
    flushActive();
    renderSeq();
    loadStepEditor();

    try { getCtx().resume(); } catch (e) {}
    playStepSound({ c: 4, f: audf, v: s.v }, selectedCh, 0, 0.22);
  }

  function updateKeyboard() {
    const root = document.getElementById('sndKeyboard');
    const hint = document.getElementById('sndKbHint');
    const noteLab = document.getElementById('sndNoteLabel');
    if (!root) return;
    const arr = getCh(selectedCh);
    const s = arr[selectedStep] || emptyStep();
    const audf = s.f & 0x1f;
    const hz = pureToneHz(audf);
    const activeMidi = audfToNearestMidi(audf);
    root.querySelectorAll('[data-midi]').forEach((el) => {
      const m = parseInt(el.getAttribute('data-midi'), 10);
      el.classList.toggle('active', activeMidi != null && m === activeMidi);
    });
    if (noteLab) {
      noteLab.textContent =
        midiLabelFromFreq(hz) + ' · AUDF ' + audf + ' · ~' + Math.round(hz) + ' Hz';
    }
    if (hint) {
      hint.textContent =
        'Piano B5–B9. Cada tecla grava AUDF no step e toca.';
    }
  }

  function renderSeq() {
    const root = document.getElementById('sndSeq');
    if (!root) return;
    let html = '<div class="snd-seq-row head"><div class="snd-ch-lab"></div>';
    for (let i = 0; i < steps; i++) {
      html += `<div class="snd-step-num">${i}</div>`;
    }
    html += '</div>';
    for (let ch = 0; ch < 2; ch++) {
      const arr = getCh(ch);
      html += `<div class="snd-seq-row"><div class="snd-ch-lab">AUD${ch}</div>`;
      for (let i = 0; i < steps; i++) {
        const s = arr[i] || emptyStep();
        const on = s.v > 0;
        const active = selectedCh === ch && selectedStep === i;
        html += `<button type="button" class="snd-step ${on ? 'on' : ''} ${
          active ? 'sel' : ''
        }" data-ch="${ch}" data-step="${i}" title="C${s.c} F${s.f} V${s.v}"
          style="${on ? 'background:' + volColor(s) : ''}"></button>`;
      }
      html += '</div>';
    }
    root.innerHTML = html;
    root.querySelectorAll('.snd-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCh = parseInt(btn.getAttribute('data-ch'), 10) || 0;
        selectedStep = parseInt(btn.getAttribute('data-step'), 10) || 0;
        renderSeq();
        loadStepEditor();
      });
      btn.addEventListener('dblclick', () => {
        selectedCh = parseInt(btn.getAttribute('data-ch'), 10) || 0;
        selectedStep = parseInt(btn.getAttribute('data-step'), 10) || 0;
        const arr = getCh(selectedCh);
        const s = arr[selectedStep] || emptyStep();
        if (s.v > 0) s.v = 0;
        else {
          s.v = 8;
          if (!s.c) s.c = 4;
        }
        arr[selectedStep] = s;
        setCh(selectedCh, arr);
        flushActive();
        renderSeq();
        loadStepEditor();
      });
    });
  }

  function volColor(s) {
    const v = (s.v || 0) / 15;
    const hue = ((s.c || 0) / 15) * 280;
    return `hsla(${hue},70%,${30 + v * 40}%,0.95)`;
  }

  function loadStepEditor() {
    const arr = getCh(selectedCh);
    const s = arr[selectedStep] || emptyStep();
    const labS = document.getElementById('sndStepLabel');
    const labC = document.getElementById('sndChLabel');
    if (labS) labS.textContent = String(selectedStep);
    if (labC) labC.textContent = String(selectedCh);
    const c = document.getElementById('sndAudc');
    const f = document.getElementById('sndAudf');
    const v = document.getElementById('sndAudv');
    if (c) c.value = String(s.c & 0x0f);
    if (f) f.value = String(s.f & 0x1f);
    if (v) v.value = String(s.v & 0x0f);
    const fv = document.getElementById('sndAudfVal');
    const vv = document.getElementById('sndAudvVal');
    if (fv) fv.textContent = String(s.f & 0x1f);
    if (vv) vv.textContent = String(s.v & 0x0f);
    updateKeyboard();
  }

  function applyStepEditor() {
    const arr = getCh(selectedCh);
    const s = arr[selectedStep] || emptyStep();
    s.c = parseInt(document.getElementById('sndAudc')?.value || '4', 10) & 0x0f;
    s.f = parseInt(document.getElementById('sndAudf')?.value || '16', 10) & 0x1f;
    s.v = parseInt(document.getElementById('sndAudv')?.value || '0', 10) & 0x0f;
    arr[selectedStep] = s;
    setCh(selectedCh, arr);
    flushActive();
    renderSeq();
    updateKeyboard();
  }

  function injectStyles() {
    if (document.getElementById('snd-styles')) return;
    const s = document.createElement('style');
    s.id = 'snd-styles';
    s.textContent = `
      .snd-wrap { display:flex; height:100%; background:#1e1e1e; min-height:0; }
      .snd-left { width:200px; border-right:1px solid #333; display:flex; flex-direction:column; background:#181818; flex-shrink:0; }
      .snd-left-head { display:flex; align-items:center; justify-content:space-between; padding:10px; font-size:12px; color:#f4a261; font-weight:700; border-bottom:1px solid #2a2a2a; gap:6px; }
      .snd-list { flex:1; overflow:auto; padding:8px; display:flex; flex-direction:column; gap:4px; }
      .snd-item { display:flex; gap:8px; align-items:center; padding:8px; border-radius:8px; border:1px solid #2a2e38; background:#14171e; cursor:pointer; font-size:12px; }
      .snd-item:hover { border-color:#444; }
      .snd-item.active { border-color:#f4a26166; background:#1c1812; }
      .snd-item-name { color:#eee; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .snd-main { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; }
      .snd-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; padding:8px 12px; background:#252526; border-bottom:1px solid #333; }
      .snd-toolbar label { font-size:11px; color:#888; display:flex; align-items:center; gap:6px; }
      .snd-toolbar input, .snd-toolbar select { background:#111; color:#eee; border:1px solid #444; border-radius:5px; padding:4px 6px; font-size:12px; }
      .snd-check { font-size:11px; color:#aaa; }
      .snd-btn { background:#2a2a2a; border:1px solid #444; color:#ccc; border-radius:6px; padding:5px 10px; cursor:pointer; font-size:12px; }
      .snd-btn:hover { border-color:#f4a261; }
      .snd-btn.accent { background:#2a3a2a; border-color:#3a5a3a; color:#8dcea0; }
      .snd-btn.danger { background:#3a1a1a; border-color:#5a2a2a; color:#e88; }
      .snd-hint { font-size:11px; color:#666; margin-left:auto; }
      .snd-body { flex:1; display:flex; gap:12px; padding:12px; overflow:auto; min-height:0; }
      .snd-center { flex:1; display:flex; flex-direction:column; gap:10px; min-width:0; min-height:0; }
      .snd-seq { flex:1; overflow:auto; background:#14161c; border:1px solid #333; border-radius:8px; padding:8px; min-height:120px; }
      .snd-kb-wrap {
        flex-shrink:0; background:#14161c; border:1px solid #333; border-radius:8px;
        padding:10px 12px 12px;
      }
      .snd-kb-head {
        display:flex; align-items:center; gap:12px; margin-bottom:8px; flex-wrap:wrap;
      }
      .snd-kb-head .snd-card-title { font-size:12px; color:#f4a261; font-weight:700; }

      .snd-seq-row { display:flex; align-items:center; gap:2px; margin-bottom:4px; }
      .snd-seq-row.head .snd-step-num { font-size:9px; color:#555; width:22px; text-align:center; }
      .snd-ch-lab { width:42px; font-size:11px; color:#f4a261; flex-shrink:0; }
      .snd-step { width:22px; height:28px; border:1px solid #333; border-radius:3px; background:#1a1a1a; cursor:pointer; padding:0; flex-shrink:0; }
      .snd-step.on { border-color:#555; }
      .snd-step.sel { outline:2px solid #f4a261; outline-offset:1px; }
      .snd-step.playing { box-shadow: inset 0 0 0 2px #fff; }
      .snd-side { width:240px; flex-shrink:0; display:flex; flex-direction:column; gap:10px; }
      .snd-card { background:linear-gradient(180deg,#1e222c,#161920); border:1px solid #333; border-radius:10px; padding:12px; }
      .snd-card-title { font-size:12px; color:#f4a261; font-weight:700; margin-bottom:10px; }
      .snd-card label { display:flex; flex-direction:column; gap:4px; font-size:11px; color:#888; margin-bottom:10px; }
      .snd-card select, .snd-card input[type=range] { width:100%; }
      .snd-card code { color:#8dcea0; font-size:12px; }
      .snd-note { font-size:11px; color:#777; line-height:1.45; margin:0; }
      .snd-note b { color:#aaa; }

      .snd-kb {
        position: relative; height: 110px; width: 100%; user-select: none;
        background: #111; border-radius: 6px; border: 1px solid #333;
        overflow: hidden;
      }
      .snd-kb-white {
        position: absolute; bottom: 0; top: 0;
        background: linear-gradient(180deg, #f5f5f5, #ddd);
        border: 1px solid #333; border-radius: 0 0 4px 4px;
        cursor: pointer; box-sizing: border-box;
      }
      .snd-kb-white:hover { background: #fff; }
      .snd-kb-white.active {
        background: linear-gradient(180deg, #f4a261, #e08a3c);
        border-color: #c06a20;
      }
      .snd-kb-black {
        position: absolute; top: 0; height: 62%;
        background: linear-gradient(180deg, #333, #111);
        border: 1px solid #000; border-radius: 0 0 4px 4px;
        cursor: pointer; z-index: 2; box-sizing: border-box;
      }
      .snd-kb-black:hover { background: #444; }
      .snd-kb-black.active {
        background: linear-gradient(180deg, #f4a261, #8a4a10);
        border-color: #f4a261;
      }

    `;
    document.head.appendChild(s);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  function bind() {
    document.getElementById('sndAddSfx')?.addEventListener('click', () => {
      flushActive();
      const it = defaultItem('sfx', 'SFX ' + (items.filter((x) => x.type === 'sfx').length + 1));
      items.push(it);
      activeId = it.id;
      loadActive();
      ensureData().sounds = items;
      buildHTML();
    });
    document.getElementById('sndAddSong')?.addEventListener('click', () => {
      flushActive();
      const it = defaultItem('song', 'Música ' + (items.filter((x) => x.type === 'song').length + 1));
      items.push(it);
      activeId = it.id;
      loadActive();
      ensureData().sounds = items;
      buildHTML();
    });
    document.getElementById('sndDelete')?.addEventListener('click', () => {
      if (items.length <= 1) {
        alert('Precisa de pelo menos um som.');
        return;
      }
      if (!confirm('Remover este som?')) return;
      stopPlay();
      items = items.filter((x) => x.id !== activeId);
      activeId = items[0].id;
      ensureData().sounds = items;
      loadActive();
      buildHTML();
      flushActive();
    });

    document.querySelectorAll('.snd-item').forEach((el) => {
      el.addEventListener('click', () => {
        flushActive();
        stopPlay();
        activeId = el.getAttribute('data-id');
        loadActive();
        buildHTML();
      });
    });

    document.getElementById('sndName')?.addEventListener('input', (e) => {
      name = e.target.value;
      flushActive();
      const lab = document.querySelector('.snd-item.active .snd-item-name');
      if (lab) lab.textContent = name || 'Som';
    });
    document.getElementById('sndType')?.addEventListener('change', (e) => {
      type = e.target.value === 'song' ? 'song' : 'sfx';
      flushActive();
    });
    document.getElementById('sndTempo')?.addEventListener('change', (e) => {
      tempo = Math.max(40, Math.min(300, parseInt(e.target.value, 10) || 120));
      e.target.value = tempo;
      flushActive();
      if (playing) {
        stopPlay();
        startPlay();
      }
    });
    document.getElementById('sndLoop')?.addEventListener('change', (e) => {
      loop = !!e.target.checked;
      flushActive();
    });
    document.getElementById('sndSteps')?.addEventListener('change', (e) => {
      let n = parseInt(e.target.value, 10) || STEPS_DEFAULT;
      n = Math.max(1, Math.min(MAX_STEPS, n));
      e.target.value = n;
      while (ch0.length < n) ch0.push(emptyStep());
      while (ch1.length < n) ch1.push(emptyStep());
      ch0 = ch0.slice(0, n);
      ch1 = ch1.slice(0, n);
      steps = n;
      if (selectedStep >= steps) selectedStep = steps - 1;
      flushActive();
      renderSeq();
      loadStepEditor();
    });

    document.getElementById('sndPlay')?.addEventListener('click', () => {
      if (playing) stopPlay();
      else startPlay();
    });

    ['sndAudc', 'sndAudf', 'sndAudv'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => {
        if (id === 'sndAudf') {
          const el = document.getElementById('sndAudfVal');
          if (el) el.textContent = document.getElementById('sndAudf').value;
        }
        if (id === 'sndAudv') {
          const el = document.getElementById('sndAudvVal');
          if (el) el.textContent = document.getElementById('sndAudv').value;
        }
        applyStepEditor();
      });
      document.getElementById(id)?.addEventListener('change', applyStepEditor);
    });

    document.getElementById('sndPreview')?.addEventListener('click', () => {
      try {
        getCtx().resume();
      } catch (e) {}
      applyStepEditor();
      const s = getCh(selectedCh)[selectedStep];
      playStepSound(s, selectedCh, 0, 0.2);
    });
    document.getElementById('sndClearStep')?.addEventListener('click', () => {
      const arr = getCh(selectedCh);
      arr[selectedStep] = emptyStep();
      setCh(selectedCh, arr);
      flushActive();
      renderSeq();
      loadStepEditor();
    });
  }

  function flush() {
    flushActive();
  }

  function init() {
    stopPlay();
    buildHTML();
  }

  return { init, flush };
})();

window.SOUND = SOUND;
