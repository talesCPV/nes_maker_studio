// ==========================================
// SOUND EDITOR v3 — Biblioteca de musicas + SFX
// Multi-canal NES (Pulse1/2, Triangle, Noise)
// Timeline compartilhada + seletor de tipo por canal
// Formato antigo (song[] / v2 single) migrado ou limpo
// ==========================================
const SOUND = (() => {

  const RHYTHM_FIGURES = [
    { id: "breve",        symbol: "\u1D100", name: "Breve (4x)",        multiplier: 4.0 },
    { id: "whole",        symbol: "\u1D15D", name: "Semibreve (2x)",    multiplier: 2.0 },
    { id: "quarter",      symbol: "\u2669",  name: "Seminima (1x)",     multiplier: 1.0 },
    { id: "eighth",       symbol: "\u266A",  name: "Colcheia (1/2)",    multiplier: 0.5 },
    { id: "sixteenth",    symbol: "\u1D161", name: "Semicolcheia (1/4)", multiplier: 0.25 },
    { id: "thirtysecond", symbol: "\u1D162", name: "Fusa (1/8)",        multiplier: 0.125 },
    { id: "sixtyfourth",  symbol: "\u1D163", name: "Semifusa (1/16)",   multiplier: 0.0625 }
  ];

  const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const CPU_FREQ_NTSC = 1789773;

  const CHANNEL_TYPES = [
    { id: "pulse1",   label: "Pulse 1",   color: "#00e5ff", wave: "square",   duty: 0.5 },
    { id: "pulse2",   label: "Pulse 2",   color: "#a78bfa", wave: "square",   duty: 0.25 },
    { id: "triangle", label: "Triangle",  color: "#34d399", wave: "triangle", duty: null },
    { id: "noise",    label: "Noise",     color: "#fbbf24", wave: "noise",    duty: null },
    { id: "none",     label: "None",      color: "#64748b", wave: null,       duty: null }
  ];


  // General MIDI program names (para label de faixa no import)
  const GM_PROGRAM_NAMES = [
    "Acoustic Grand Piano","Bright Acoustic Piano","Electric Grand Piano","Honky-tonk Piano",
    "Electric Piano 1","Electric Piano 2","Harpsichord","Clavinet",
    "Celesta","Glockenspiel","Music Box","Vibraphone","Marimba","Xylophone","Tubular Bells","Dulcimer",
    "Drawbar Organ","Percussive Organ","Rock Organ","Church Organ","Reed Organ","Accordion","Harmonica","Tango Accordion",
    "Acoustic Guitar (nylon)","Acoustic Guitar (steel)","Electric Guitar (jazz)","Electric Guitar (clean)",
    "Electric Guitar (muted)","Overdriven Guitar","Distortion Guitar","Guitar harmonics",
    "Acoustic Bass","Electric Bass (finger)","Electric Bass (pick)","Fretless Bass",
    "Slap Bass 1","Slap Bass 2","Synth Bass 1","Synth Bass 2",
    "Violin","Viola","Cello","Contrabass","Tremolo Strings","Pizzicato Strings","Orchestral Harp","Timpani",
    "String Ensemble 1","String Ensemble 2","SynthStrings 1","SynthStrings 2","Choir Aahs","Voice Oohs","Synth Voice","Orchestra Hit",
    "Trumpet","Trombone","Tuba","Muted Trumpet","French Horn","Brass Section","SynthBrass 1","SynthBrass 2",
    "Soprano Sax","Alto Sax","Tenor Sax","Baritone Sax","Oboe","English Horn","Bassoon","Clarinet",
    "Piccolo","Flute","Recorder","Pan Flute","Blown Bottle","Shakuhachi","Whistle","Ocarina",
    "Lead 1 (square)","Lead 2 (sawtooth)","Lead 3 (calliope)","Lead 4 (chiff)",
    "Lead 5 (charang)","Lead 6 (voice)","Lead 7 (fifths)","Lead 8 (bass + lead)",
    "Pad 1 (new age)","Pad 2 (warm)","Pad 3 (polysynth)","Pad 4 (choir)",
    "Pad 5 (bowed)","Pad 6 (metallic)","Pad 7 (halo)","Pad 8 (sweep)",
    "FX 1 (rain)","FX 2 (soundtrack)","FX 3 (crystal)","FX 4 (atmosphere)",
    "FX 5 (brightness)","FX 6 (goblins)","FX 7 (echoes)","FX 8 (sci-fi)",
    "Sitar","Banjo","Shamisen","Koto","Kalimba","Bagpipe","Fiddle","Shanai",
    "Tinkle Bell","Agogo","Steel Drums","Woodblock","Taiko Drum","Melodic Tom","Synth Drum","Reverse Cymbal",
    "Guitar Fret Noise","Breath Noise","Seashore","Bird Tweet","Telephone Ring","Helicopter","Applause","Gunshot"
  ];

  function decodeMidiMetaText(view, offset, len){
    const bytes = [];
    for(let i = 0; i < len; i++) bytes.push(view.getUint8(offset + i));
    try{
      return new TextDecoder("utf-8").decode(Uint8Array.from(bytes)).replace(/[\x00-\x1F]/g, "").trim();
    }catch(e){
      return bytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : "").join("").trim();
    }
  }

  const NOTE_MAP = {};
  const PERIOD_TO_NOTE = {};
  NOTE_MAP["REST"] = { lo: "$00", hi: "$00", freq: 0, isRest: true };
  PERIOD_TO_NOTE["$00-$00"] = "REST";
  (function(){
    for(let octave=1; octave<=7; octave++){
      NOTE_NAMES.forEach((noteName, noteIndex)=>{
        const full = noteName + octave;
        const midi = (octave+1)*12 + noteIndex;
        const freq = 440 * Math.pow(2, (midi-69)/12);
        let period = Math.round((CPU_FREQ_NTSC/(16*freq)) - 1);
        if(period < 0) period = 0;
        if(period > 2047) period = 2047;
        const lo = "$" + (period & 0xFF).toString(16).padStart(2,"0").toUpperCase();
        const hi = "$" + ((period>>8) & 0x07).toString(16).padStart(2,"0").toUpperCase();
        NOTE_MAP[full] = { lo, hi, freq, isRest: false };
        PERIOD_TO_NOTE[lo + "-" + hi] = full;
      });
    }
  })();

  // ===== ESTADO =====
  // Biblioteca de pecas (musicas + sfx)
  let items = [];           // [{ id, type, name, loop, baseFrames, channels }]
  let activeId = null;

  // Estado do item ativo (espelho de items[active].channels etc.)
  let channels = [];
  let activeChannel = 0;
  let selectedIndex = 0;
  let playbackIndex = 0;
  let isPlaying = false;
  let playbackTimeout = null;
  let undoStack = [];
  let globalEventsAttached = false;
  let selectedCells = new Set();
  let selectionStart = null, selectionEnd = null, isSelecting = false;
  let draggedIndex = null;
  let els = {};
  const CELL_W = 34;   // pitch fixo (alinhado regua/notas)
  const HEADER_W = 150;
  // Ativacao no tempo por tipo APU: { pulse1: [{ start:0, chId }, { start:38, chId }, ...] }
  let typeActivation = {};
  const APU_TYPES = ["pulse1", "pulse2", "triangle", "noise"];

  // Audio engine (reutilizado — evita travar criando AudioContext a cada nota)
  let audioCtx = null;
  const pulseWaveCache = new Map(); // key: "duty" -> PeriodicWave
  const noiseBufCache = new Map();  // key: hold -> AudioBuffer
  let activeSources = [];           // nodes para stop() no pause
  let schedStep = 0;
  let schedNextTime = 0;            // audioCtx.currentTime da proxima coluna
  let schedTimer = null;

  function uid(prefix){
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  }

  function emptyNotes(len){
    const n = [];
    for(let i=0;i<len;i++) n.push({ note:"REST", figure:"quarter" });
    return n;
  }

  function defaultChannels(forSfx){
    if(forSfx){
      return [{ id: uid("ch"), type: "noise", muted: false, notes: [{ note:"C4", figure:"sixteenth" }] }];
    }
    return [{ id: uid("ch"), type: "pulse1", muted: false, notes: [{ note:"C4", figure:"quarter" }] }];
  }

  function createItem(type, name){
    const isSfx = type === "sfx";
    return {
      id: uid(isSfx ? "sfx" : "song"),
      type: isSfx ? "sfx" : "song",
      name: name || (isSfx ? "Novo SFX" : "Nova Musica"),
      loop: !isSfx,
      baseFrames: isSfx ? 20 : 30,
      channels: defaultChannels(isSfx)
    };
  }

  function defaultLibrary(){
    const song = createItem("song", "Musica 1");
    return { items: [song], activeId: song.id };
  }

  function getActiveItem(){
    return items.find(it => it.id === activeId) || items[0] || null;
  }

  // Salva o estado de edicao de volta no item ativo
  function flushActiveToItem(){
    const it = getActiveItem();
    if(!it) return;
    it.channels = JSON.parse(JSON.stringify(channels));
    it.typeActivation = JSON.parse(JSON.stringify(typeActivation || {}));
    it.baseFrames = getBaseFrames();
    const loopCb = document.getElementById("loop-checkbox");
    if(loopCb) it.loop = !!loopCb.checked;
  }

  // Carrega um item para edicao
  function loadItemIntoEditor(id){
    if(isPlaying) stopPlayback();
    flushActiveToItem();
    const it = items.find(x => x.id === id);
    if(!it) return;
    activeId = it.id;
    channels = JSON.parse(JSON.stringify(it.channels || defaultChannels(it.type === "sfx")));
    typeActivation = JSON.parse(JSON.stringify(it.typeActivation || {}));
    ensureTypeActivation();
    activeChannel = 0;
    selectedIndex = 0;
    playbackIndex = 0;
    selectedCells.clear();
    selectionStart = null;
    selectionEnd = null;
    undoStack = [];
    if(els.quarterInput) els.quarterInput.value = it.baseFrames || 30;
    const loopCb = document.getElementById("loop-checkbox");
    if(loopCb) loopCb.checked = it.loop !== false;
    renderLibrarySelect();
    renderAll();
  }

  function timelineLength(){
    let max = 1;
    channels.forEach(ch=>{ if(ch.notes.length > max) max = ch.notes.length; });
    return max;
  }

  function columnStartFrames(idx){
    const base = getBaseFrames();
    let frames = 0;
    const lim = Math.max(0, Math.min(idx, timelineLength()));
    for(let i = 0; i < lim; i++){
      let maxF = 1;
      channels.forEach(ch=>{
        const n = ch.notes[i];
        if(n) maxF = Math.max(maxF, calculateFrames(n.figure, base));
      });
      frames += maxF;
    }
    return frames;
  }

  function formatTimelineTime(frames){
    const sec = frames / 60;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    if(m > 0) return m + ":" + String(s).padStart(2, "0");
    return "0:" + String(s).padStart(2, "0");
  }

  function fillSelectedFromRange(){
    selectedCells.clear();
    if(selectionStart === null) return;
    const a = selectionStart;
    const b = selectionEnd === null ? selectionStart : selectionEnd;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for(let i = lo; i <= hi; i++) selectedCells.add(i);
  }

  /** Clique de selecao: 1o = inicio, 2o = fim; Shift sempre estende */
  function applyTimelinePick(index, extend){
    const len = timelineLength();
    if(index < 0 || index >= len) return;
    selectedIndex = index;
    playbackIndex = index;
    if(extend){
      if(selectionStart === null) selectionStart = index;
      selectionEnd = index;
      fillSelectedFromRange();
    } else if(selectionStart !== null && selectionEnd === null){
      selectionEnd = index;
      fillSelectedFromRange();
    } else {
      selectionStart = index;
      selectionEnd = null;
      selectedCells.clear();
      selectedCells.add(index);
    }
  }

  function clearTimelineSelection(){
    selectionStart = null;
    selectionEnd = null;
    selectedCells.clear();
  }


  function normalizeLengths(){
    const len = timelineLength();
    channels.forEach(ch=>{
      while(ch.notes.length < len) ch.notes.push({ note:"REST", figure:"quarter" });
    });
  }

  function usedTypes(){ return new Set(channels.map(ch => ch.type)); }

  function availableTypesFor(channelIndex){
    // Tipos APU podem repetir (varias faixas Pulse1 para merge no tempo)
    return CHANNEL_TYPES.slice();
  }

  function typeInfo(typeId){
    return CHANNEL_TYPES.find(t => t.id === typeId) || CHANNEL_TYPES[0];
  }

  function isApuType(t){ return APU_TYPES.indexOf(t) >= 0; }

  function typeRank(t){
    const r = { pulse1: 0, pulse2: 1, triangle: 2, noise: 3, none: 4 };
    return r.hasOwnProperty(t) ? r[t] : 9;
  }

  /** Reordena canais: mesmo tipo APU fica empilhado (um sob o outro), None no final */
  function reorderChannelsGrouped(){
    const activeId = channels[activeChannel] && channels[activeChannel].id;
    const stamped = channels.map((ch, i) => ({ ch, i }));
    stamped.sort((a, b)=>{
      const ra = typeRank(a.ch.type), rb = typeRank(b.ch.type);
      if(ra !== rb) return ra - rb;
      return a.i - b.i; // estavel dentro do grupo
    });
    channels = stamped.map(x => x.ch);
    if(activeId){
      const ni = channels.findIndex(c => c.id === activeId);
      activeChannel = ni >= 0 ? ni : 0;
    }
    ensureTypeActivation();
  }


  function channelsOfType(type){
    const out = [];
    channels.forEach((ch, i)=>{ if(ch.type === type) out.push({ ch, i }); });
    return out;
  }

  function ensureTypeActivation(){
    APU_TYPES.forEach(type=>{
      const list = channelsOfType(type);
      if(list.length < 2){
        delete typeActivation[type];
        return;
      }
      const ids = new Set(list.map(x => x.ch.id));
      let bp = Array.isArray(typeActivation[type]) ? typeActivation[type].slice() : [];
      bp = bp.filter(b => ids.has(b.chId)).sort((a,b)=> a.start - b.start);
      if(!bp.length || bp[0].start !== 0){
        bp = [{ start: 0, chId: list[0].ch.id }].concat(bp.filter(b => b.start > 0));
      }
      // remove entries with missing chId already filtered
      typeActivation[type] = bp;
    });
  }

  function getActiveChIdAt(type, col){
    const list = channelsOfType(type);
    if(!list.length) return null;
    if(list.length === 1) return list[0].ch.id;
    const bp = typeActivation[type] || [];
    let id = list[0].ch.id;
    for(let k = 0; k < bp.length; k++){
      if(bp[k].start <= col) id = bp[k].chId;
    }
    // se id sumiu, fallback
    if(!list.some(x => x.ch.id === id)) id = list[0].ch.id;
    return id;
  }

  function getActiveChannelIndexAt(type, col){
    const id = getActiveChIdAt(type, col);
    return channels.findIndex(c => c.id === id);
  }

  function setLayerActiveFrom(type, col, chId){
    if(!isApuType(type)) return;
    const list = channelsOfType(type);
    if(list.length < 2) return;
    if(!list.some(x => x.ch.id === chId)) return;
    pushUndo();
    const prev = (typeActivation[type] || []).slice();
    // breakpoints antes de col + novo em col + breakpoints depois de col
    const before = prev.filter(b => b.start < col);
    const after = prev.filter(b => b.start > col);
    let bp = before.concat([{ start: col, chId }]).concat(after);
    bp.sort((a, b) => a.start - b.start);
    // garantir inicio em 0
    if(!bp.length || bp[0].start > 0){
      const fallback = before.length ? before[before.length - 1].chId : list[0].ch.id;
      bp = [{ start: 0, chId: col === 0 ? chId : fallback }].concat(bp.filter(b => b.start > 0));
      if(col === 0) bp = [{ start: 0, chId }].concat(after);
    }
    // coalescer adjacentes iguais
    const clean = [];
    bp.forEach(b=>{
      if(!clean.length || clean[clean.length - 1].chId !== b.chId) clean.push({ start: b.start, chId: b.chId });
    });
    typeActivation[type] = clean;
  }

  /** Mescla todas as faixas com o mesmo tipo APU numa unica faixa (usa voz ativa por coluna) */
  function mergeDuplicateTypes(){
    ensureTypeActivation();
    const dupTypes = APU_TYPES.filter(t => channelsOfType(t).length > 1);
    if(!dupTypes.length){
      alert("Nao ha tipos duplicados para mesclar.\nAtribua o mesmo canal NES a 2+ faixas (ex. 2x Pulse 1) e defina trechos ativos.");
      return;
    }
    if(!confirm("Mesclar faixas duplicadas?\n\nTipos: " + dupTypes.join(", ") + "\nEm cada coluna permanece a voz ativa. As outras faixas do mesmo tipo serao removidas.")){
      return;
    }
    pushUndo();
    const len = timelineLength();
    const used = new Set();
    const next = [];

    channels.forEach((ch, idx)=>{
      if(used.has(idx)) return;
      if(!isApuType(ch.type) || channelsOfType(ch.type).length < 2){
        next.push(JSON.parse(JSON.stringify(ch)));
        used.add(idx);
        return;
      }
      // primeira ocorrencia do tipo duplicado → mescla
      const group = channelsOfType(ch.type);
      group.forEach(g => used.add(g.i));
      const names = group.map(g => g.ch.name || typeInfo(ch.type).label);
      const notes = [];
      for(let col = 0; col < len; col++){
        const activeId = getActiveChIdAt(ch.type, col);
        const srcCh = channels.find(c => c.id === activeId) || group[0].ch;
        const n = srcCh.notes[col] || { note: "REST", figure: "quarter" };
        notes.push({ note: n.note, figure: n.figure });
      }
      next.push({
        id: uid("ch"),
        type: ch.type,
        name: names.filter(Boolean).join(" + "),
        muted: false,
        notes
      });
    });

    channels = next;
    typeActivation = {};
    activeChannel = Math.min(activeChannel, channels.length - 1);
    clearTimelineSelection();
    renderAll();
  }


  function pushUndo(){
    undoStack.push(JSON.parse(JSON.stringify({
      channels, activeChannel, selectedIndex, typeActivation
    })));
    if(undoStack.length > 40) undoStack.shift();
  }

  function calculateFrames(figureId, base){
    const fig = RHYTHM_FIGURES.find(f => f.id === figureId) || RHYTHM_FIGURES[2];
    return Math.max(1, Math.min(255, Math.round(base * fig.multiplier)));
  }

  function getCellPosition(i){ return i * CELL_W; }
  function getIndexFromPosition(x, max){
    const cw=35, off=10+12.5;
    return Math.max(0, Math.min(max, Math.round((x-off)/cw)));
  }

  function formatBytesForASM(arr, per=12){
    let lines = [];
    for(let i=0;i<arr.length;i+=per){
      lines.push("    .byte " + arr.slice(i,i+per).join(", "));
    }
    return lines.join("\n");
  }

  function getBaseFrames(){
    return parseInt(els.quarterInput?.value) || getActiveItem()?.baseFrames || 30;
  }

  // ===== CSS =====
  function injectCSS(){
    if(document.getElementById("sound-module-style")) return;
    const style = document.createElement("style");
    style.id = "sound-module-style";
    style.textContent = `
      #mod-sound { --bg:#121218; --panel:#1e1e2a; --accent:#00e5ff; --accent-hover:#00b8d4; --text:#e2e8f0; --border:#334155; --rest-color:#ffb703; background:var(--bg); color:var(--text); overflow:auto; height:100%; }
      #mod-sound .sound-header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:2px solid var(--border); background:#1a1a2e; flex-wrap:wrap; gap:8px; }
      #mod-sound .sound-header h2 { margin:0; color:var(--accent); font-size:1.15rem; }
      #mod-sound .sound-header .subtitle { color:#94a3b8; font-size:.78rem; }
      #mod-sound .sound-card { background:var(--panel); padding:14px; border-radius:8px; border:1px solid var(--border); margin:10px 12px; }
      #mod-sound .controls { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:10px; }
      #mod-sound .transport-btn { width:34px; height:34px; padding:0; display:flex; align-items:center; justify-content:center; font-size:15px; border-radius:6px; }
      #mod-sound #play-btn.playing { background:#10b981; color:#fff; }
      #mod-sound .tempo-box { display:flex; align-items:center; gap:6px; background:#0f172a; padding:5px 10px; border-radius:6px; border:1px solid var(--border); font-size:12px; }
      #mod-sound .tempo-box input { width:52px; text-align:center; padding:3px; font-weight:bold; color:var(--accent); background:#0f172a; border:1px solid var(--border); border-radius:4px; }
      #mod-sound button { background:var(--accent); color:#0f172a; border:none; padding:6px 11px; border-radius:6px; font-weight:700; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; gap:5px; }
      #mod-sound button:hover { background:var(--accent-hover); }
      #mod-sound button.secondary { background:#334155; color:#fff; }
      #mod-sound button.btn-clone { background:#10b981; color:#0f172a; }
      #mod-sound button.btn-del { background:#ef4444; color:#fff; }
      #mod-sound button.btn-add-ch { background:#8b5cf6; color:#fff; }
      #mod-sound button.btn-song { background:#0ea5e9; color:#fff; }
      #mod-sound button.btn-sfx { background:#f59e0b; color:#0f172a; }
      #mod-sound button#btn-import-midi { background:#6366f1; color:#fff; }
      #mod-sound .midi-modal-overlay {
        position:fixed; inset:0; background:rgba(0,0,0,.75); z-index:10000;
        display:flex; align-items:center; justify-content:center; padding:16px;
      }
      #mod-sound .midi-modal {
        background:#1e1e2e; border:1px solid #444; border-radius:10px; max-width:720px; width:100%;
        max-height:90vh; overflow:auto; box-shadow:0 16px 48px rgba(0,0,0,.5); padding:16px 18px;
      }
      #mod-sound .midi-modal h3 { margin:0 0 6px; color:#a5b4fc; font-size:15px; }
      #mod-sound .midi-modal .midi-meta { font-size:11px; color:#94a3b8; margin-bottom:12px; }
      #mod-sound .midi-map-table { width:100%; border-collapse:collapse; font-size:12px; }
      #mod-sound .midi-map-table th { text-align:left; padding:6px 8px; color:#94a3b8; border-bottom:1px solid #333; font-weight:600; }
      #mod-sound .midi-map-table td { padding:6px 8px; border-bottom:1px solid #2a2a3a; vertical-align:middle; }
      #mod-sound .midi-map-table select { width:100%; background:#0f172a; color:#e2e8f0; border:1px solid #444; border-radius:4px; padding:4px 6px; font-size:12px; }
      #mod-sound .midi-map-table .trk-name { font-weight:600; color:#e2e8f0; }
      #mod-sound .midi-map-table .trk-sub { font-size:10px; color:#64748b; }
      #mod-sound .midi-map-table .badge-mel { color:#7dd3fc; }
      #mod-sound .midi-map-table .badge-perc { color:#fcd34d; }
      #mod-sound .midi-modal-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:14px; flex-wrap:wrap; }
      #mod-sound .midi-modal-actions .btn-ok { background:#6366f1; color:#fff; }
      #mod-sound .midi-hint { font-size:11px; color:#64748b; margin-top:8px; line-height:1.4; }
      #mod-sound button:disabled { opacity:.4; cursor:not-allowed; }

      #mod-sound .library-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px 12px; background:#151525; border-bottom:1px solid var(--border); }
      #mod-sound .library-bar select { min-width:220px; background:#0f172a; color:var(--text); border:1px solid var(--border); padding:6px 8px; border-radius:6px; font-size:12px; font-weight:bold; }
      #mod-sound .lib-badge { font-size:10px; font-weight:bold; padding:2px 7px; border-radius:4px; }
      #mod-sound .lib-badge.song { background:#0c4a6e; color:#7dd3fc; }
      #mod-sound .lib-badge.sfx { background:#78350f; color:#fcd34d; }

      #mod-sound .tracks-layout { display:flex; align-items:stretch; gap:0; margin:0; }
      #mod-sound .tracks-headers {
        width:150px; min-width:150px; flex-shrink:0; display:flex; flex-direction:column;
        gap:6px; padding-top:32px; /* = altura regua 26 + margin 6 */
        z-index:5; background:#151525;
      }
      #mod-sound .tracks-scroll { overflow-x:auto; padding-bottom:8px; flex:1; min-width:0; }
      #mod-sound .track-row { display:flex; align-items:stretch; margin-bottom:6px; min-width:max-content; height:76px; }
      #mod-sound .track-row.stack-continue { margin-bottom:2px; }
      #mod-sound .track-row.stack-continue .track-cells { border-radius:0 0 6px 6px; }
      #mod-sound .track-row.stack-start .track-cells { border-radius:6px 6px 0 0; }
      #mod-sound .track-row.stack-mid .track-cells { border-radius:0; }
      #mod-sound .tracks-headers { gap:6px; }
      #mod-sound .tracks-headers.stacking { gap:2px; }
      #mod-sound .track-header {
        width:150px; min-width:150px; height:76px; min-height:76px; max-height:76px; box-sizing:border-box;
        background:#0f172a; border:1px solid var(--border); border-radius:6px;
        padding:4px 8px; display:flex; flex-direction:column; gap:3px; justify-content:center;
        overflow:hidden;
      }
      #mod-sound .track-header.active-track { border-color:var(--accent); box-shadow: inset 3px 0 0 var(--accent); }
      #mod-sound .track-header select { width:100%; background:#1e1e2a; color:var(--text); border:1px solid var(--border); padding:3px 4px; border-radius:4px; font-size:11px; font-weight:bold; }
      #mod-sound .track-header .trk-inst {
        font-size:10px; font-weight:700; color:#e2e8f0; white-space:nowrap; overflow:hidden;
        text-overflow:ellipsis; max-width:134px; line-height:1.15; flex-shrink:0;
      }
      #mod-sound .track-header select { flex-shrink:0; }
      #mod-sound .track-header .track-actions { flex-shrink:0; }
      #mod-sound .track-header.trk-none { opacity:0.75; border-style:dashed; }
      #mod-sound .track-header.trk-inactive-layer { opacity:0.55; }
      #mod-sound .track-cell.layer-inactive { opacity:0.32; filter:grayscale(0.35); }
      #mod-sound .track-cell.layer-active-here { box-shadow: inset 0 2px 0 #10b981; }
      #mod-sound .track-cell.layer-switch { outline:1px dashed #fbbf24; }
      #mod-sound button.btn-merge { background:#f59e0b; color:#0f172a; }
      #mod-sound .track-header .track-actions { display:flex; gap:4px; }
      #mod-sound .track-header .track-actions button { padding:2px 6px; font-size:11px; min-width:28px; justify-content:center; }
      #mod-sound .timeline-ruler {
        display:flex; align-items:stretch; height:26px; margin-bottom:6px; min-width:max-content;
        border-bottom:1px solid #333; user-select:none; padding:0; gap:0;
      }
      #mod-sound .ruler-cell {
        flex:0 0 34px; width:34px; min-width:34px; margin:0; box-sizing:border-box;
        border:1px solid #333; border-radius:3px; background:#0f172a;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        cursor:pointer; font-size:9px; color:#64748b; line-height:1.1; padding:0;
      }
      #mod-sound .ruler-cell:hover { border-color:#6366f1; color:#a5b4fc; }
      #mod-sound .ruler-cell.sel-range { background:rgba(99,102,241,.2); border-color:#6366f1; color:#c7d2fe; }
      #mod-sound .ruler-cell.sel-anchor { background:rgba(16,185,129,.25); border-color:#10b981; color:#6ee7b7; }
      #mod-sound .ruler-cell.playing { border-color:var(--accent); color:var(--accent); }
      #mod-sound .ruler-cell .r-idx { font-size:8px; opacity:.7; }
      #mod-sound .ruler-cell .r-time { font-size:9px; font-weight:600; }
      #mod-sound .selection-hint { font-size:11px; color:#64748b; margin:4px 0 0 0; }

      #mod-sound .track-cells {
        display:flex; gap:0; align-items:center; padding:0; background:#151520; border:none;
        border-radius:6px; height:76px; min-height:76px; max-height:76px; box-sizing:border-box;
        box-shadow: inset 0 0 0 1px var(--border);
      }
      #mod-sound .track-cell {
        flex:0 0 34px; width:34px; min-width:34px; height:68px; margin:0; box-sizing:border-box;
        border:2px solid var(--border); border-radius:4px; background:#0f172a; cursor:grab;
        position:relative; flex-shrink:0; user-select:none;
      }
      #mod-sound .track-cell:active { cursor:grabbing; }
      #mod-sound .track-cell.active { border-color:#fff; box-shadow:0 0 8px rgba(255,255,255,.3); }
      #mod-sound .track-cell.selected { border-color:#10b981; background:rgba(16,185,129,.15); }
      #mod-sound .track-cell.playing { border-color:#10b981 !important; box-shadow:0 0 12px rgba(16,185,129,.55) !important; }
      #mod-sound .track-cell.dragging { opacity:.35; border-style:dashed; }
      #mod-sound .track-cell.drag-over { border-color:#10b981; background:rgba(16,185,129,.2); box-shadow:0 0 10px rgba(16,185,129,.4); }
      #mod-sound .track-cell .cell-label { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; color:#fff; pointer-events:none; text-align:center; line-height:1.1; padding:2px; word-break:break-all; }
      #mod-sound .track-cell .cell-label.rest { color:var(--rest-color); }
      #mod-sound .track-cell .cell-dur { position:absolute; bottom:2px; left:50%; transform:translateX(-50%); width:16px; height:3px; border-radius:2px; pointer-events:none; }
      #mod-sound .cell-add-btn { flex:0 0 34px; width:34px; height:68px; margin:0; box-sizing:border-box; border:2px dashed #059669; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:1.1rem; color:#fff; cursor:pointer; background:#059669; font-weight:bold; flex-shrink:0; }
      #mod-sound .cell-add-btn:hover { background:#047a56; }

      #mod-sound .timeline-bar-container { display:none; }
      #mod-sound .timeline-bar { display:none; }


      #mod-sound .selection-actions { display:flex; gap:8px; margin-top:6px; padding-left:150px; align-items:center; flex-wrap:wrap; }
      #mod-sound .inspector-panel { background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:14px; margin-top:8px; display:flex; flex-direction:column; gap:10px; }
      #mod-sound .inspector-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
      #mod-sound .inspector-title { font-weight:bold; color:var(--accent); font-size:13px; }
      #mod-sound .piano-container { display:flex; flex-direction:column; gap:8px; background:#181824; padding:10px; border-radius:8px; border:1px solid var(--border); }
      #mod-sound .piano-scroll-wrapper { width:100%; overflow-x:auto; padding-bottom:6px; }
      #mod-sound .piano-keyboard { position:relative; display:inline-flex; height:90px; user-select:none; }
      #mod-sound .piano-key { cursor:pointer; display:flex; align-items:flex-end; justify-content:center; padding-bottom:5px; font-size:.6rem; font-weight:bold; box-sizing:border-box; border-radius:0 0 3px 3px; }
      #mod-sound .piano-key.white { width:26px; height:100%; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; z-index:1; flex-shrink:0; }
      #mod-sound .piano-key.white.active { background:var(--accent)!important; }
      #mod-sound .piano-key.black { width:16px; height:55%; background:#0f172a; color:#fff; position:absolute; top:0; z-index:2; border-radius:0 0 3px 3px; border:1px solid #334155; font-size:.5rem; }
      #mod-sound .piano-key.black.active { background:var(--accent)!important; color:#0f172a; }
      #mod-sound .rest-btn { background:var(--rest-color); color:#0f172a; padding:5px 12px; font-size:.8rem; border-radius:4px; border:none; font-weight:bold; cursor:pointer; align-self:flex-start; }
      #mod-sound .rest-btn.active { outline:2px solid #fff; box-shadow:0 0 8px var(--rest-color); }
      #mod-sound textarea { width:100%; height:200px; background:#090d16; color:#38edf8; font-family:Consolas,monospace; padding:10px; border:1px solid var(--border); border-radius:6px; box-sizing:border-box; font-size:.8rem; }
      #mod-sound select { background:#1e1e2a; color:var(--text); border:1px solid var(--border); padding:5px 8px; border-radius:6px; font-size:.85rem; }
      #mod-sound .figure-range-wrap { display:flex; align-items:center; gap:8px; background:#0f172a; border:1px solid var(--border); border-radius:6px; padding:4px 10px; min-width:200px; }
      #mod-sound .figure-range-wrap label { font-size:11px; color:#94a3b8; white-space:nowrap; }
      #mod-sound .figure-range-wrap input[type=range] { flex:1; accent-color:var(--accent); cursor:pointer; height:6px; }
      #mod-sound .figure-range-wrap #figure-label { font-size:12px; font-weight:bold; color:var(--accent); min-width:110px; text-align:right; }
    `;
    document.head.appendChild(style);
  }

  // ===== HTML =====
  function buildHTML(){
    injectCSS();
    const mod = document.getElementById("mod-sound");
    if(!mod) return;
    const active = getActiveItem();
    mod.innerHTML = `
      <div class="sound-header">
        <div>
          <h2>\u{1F3B5} NES Sound Editor v3</h2>
          <div class="subtitle">Biblioteca de musicas + SFX \u2022 Multi-canal \u2022 Timeline compartilhada</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="secondary" title="Desfazer" onclick="SOUND.undo()" style="width:32px;height:32px;justify-content:center">\u21A9\uFE0F</button>
          <button class="secondary" title="Salvar no .NMS" onclick="SOUND.saveToProject()" style="width:32px;height:32px;justify-content:center">\u{1F4BE}</button>
        </div>
      </div>

      <div class="library-bar">
        <span id="lib-type-badge" class="lib-badge song">SONG</span>
        <select id="library-select" title="Peca ativa"></select>
        <button id="btn-new-song" class="btn-song">+ Musica</button>
        <button id="btn-new-sfx" class="btn-sfx">+ SFX</button>
        <button id="btn-import-midi" class="secondary" title="Importar arquivo MIDI">Import MIDI</button>
        <input type="file" id="midi-file-input" accept=".mid,.midi,audio/midi,audio/x-midi" style="display:none">
        <button id="btn-rename" class="secondary">Renomear</button>
        <button id="btn-delete-item" class="btn-del">Apagar</button>
        <span id="sound-status" style="font-size:11px;color:#888;margin-left:auto"></span>
      </div>

      <div class="sound-card">
        <div class="controls">
          <button id="rewind-btn" class="secondary transport-btn" title="Inicio">\u23EE</button>
          <button id="play-btn" class="secondary transport-btn" title="Play">\u25B6</button>
          <button id="ff-btn" class="secondary transport-btn" title="Fim">\u23ED</button>
          <div class="tempo-box">
            <label>\u2669 Frames:</label>
            <input type="number" id="quarter-frames" value="${active?.baseFrames || 30}" min="4" max="255">
          </div>
          <label style="font-size:12px"><input type="checkbox" id="loop-checkbox" ${active?.loop !== false ? "checked" : ""}> Loop ($FF)</label>
          <button id="add-channel-btn" class="btn-add-ch">+ Canal</button>
          <button id="btn-merge-layers" class="btn-merge" title="Mescla faixas com o mesmo tipo APU usando a voz ativa em cada coluna">Mesclar</button>
        </div>

        <div class="tracks-layout">
          <div class="tracks-headers" id="tracks-headers"></div>
          <div class="tracks-scroll" id="tracks-scroll">
            <div class="timeline-ruler" id="timeline-ruler"></div>
            <div id="tracks-container"></div>
            <div class="timeline-bar-container" id="timeline-bar-container" style="display:none">
              <div class="timeline-bar" id="timeline-bar">
                <div class="timeline-selection-range" id="timeline-selection-range" style="display:none"></div>
                <div class="timeline-cursor" id="timeline-cursor"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="selection-hint" id="selection-hint">Selecao: 1o clique = inicio · 2o = fim · Esc limpa · Com tipos duplicados, clique numa celula inativa para ativar essa voz daqui ate a proxima troca · Mesclar consolida</div>

        <div class="selection-actions" id="selection-actions" style="display:none">
          <button id="clone-selected-btn" class="btn-clone">\u{1F4CB} Clonar</button>
          <button id="delete-selected-btn" class="btn-del">\u2716 Remover</button>
          <button id="clear-selection-btn" class="secondary">Limpar Selecao</button>
          <span id="selection-info" style="font-size:11px;color:#888"></span>
        </div>

        <div class="inspector-panel" id="inspector-panel">
          <div class="inspector-header">
            <div class="inspector-title" id="inspector-title">Celula #0</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <div class="figure-range-wrap">
                <label>Duracao</label>
                <input type="range" id="figure-range" min="0" max="6" step="1" value="2">
                <span id="figure-label">Seminima (1x)</span>
              </div>
              <button id="clone-cell-btn" class="btn-clone">\u{1F4CB} Clonar</button>
              <button id="delete-cell-btn" class="btn-del">\u2716 Remover</button>
            </div>
          </div>
          <div>
            <label style="font-size:.8rem;color:#94a3b8">Nota (piano) \u2014 canal ativo:</label>
            <div class="piano-container">
              <button class="rest-btn" id="rest-btn">\u{1F507} REST</button>
              <div class="piano-scroll-wrapper"><div class="piano-keyboard" id="piano-keyboard"></div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="sound-card">
        <div class="controls">
          <button id="export-asm-btn">\u{1F4BE} Export .asm</button>
          <button onclick="SOUND.saveToProject()" style="background:#007acc;color:#fff">\u{1F4BE} Salvar no .NMS</button>
          <span style="font-size:11px;color:#666;margin-left:auto">ASM de todas as pecas da biblioteca</span>
        </div>
        <textarea id="asm-output" readonly placeholder="Assembly gerado..."></textarea>
      </div>
    `;
    cacheEls();
    initFigureSelect();
    buildFullPiano();
    attachEvents();
    renderLibrarySelect();
    renderAll();
  }

  function cacheEls(){
    els.tracksContainer = document.getElementById("tracks-container");
    els.tracksHeaders = document.getElementById("tracks-headers");
    els.timelineRuler = document.getElementById("timeline-ruler");
    els.figureRange = document.getElementById("figure-range");
    els.figureLabel = document.getElementById("figure-label");
    els.quarterInput = document.getElementById("quarter-frames");
    els.asmOutput = document.getElementById("asm-output");
    els.pianoKeyboard = document.getElementById("piano-keyboard");
    els.timelineBarContainer = document.getElementById("timeline-bar-container");
    els.timelineBar = document.getElementById("timeline-bar");
    els.timelineCursor = document.getElementById("timeline-cursor");
    els.timelineSelectionRange = document.getElementById("timeline-selection-range");
    els.librarySelect = document.getElementById("library-select");
  }

  function renderLibrarySelect(){
    const sel = els.librarySelect || document.getElementById("library-select");
    if(!sel) return;
    const songs = items.filter(i => i.type === "song");
    const sfxs = items.filter(i => i.type === "sfx");
    let html = "";
    if(songs.length){
      html += '<optgroup label="Musicas">';
      songs.forEach(s=>{ html += `<option value="${s.id}" ${s.id===activeId?"selected":""}>${s.name}</option>`; });
      html += "</optgroup>";
    }
    if(sfxs.length){
      html += '<optgroup label="Efeitos (SFX)">';
      sfxs.forEach(s=>{ html += `<option value="${s.id}" ${s.id===activeId?"selected":""}>${s.name}</option>`; });
      html += "</optgroup>";
    }
    if(!html) html = '<option value="">— vazio —</option>';
    sel.innerHTML = html;
    sel.value = activeId;

    const badge = document.getElementById("lib-type-badge");
    const it = getActiveItem();
    if(badge && it){
      badge.textContent = it.type === "sfx" ? "SFX" : "SONG";
      badge.className = "lib-badge " + (it.type === "sfx" ? "sfx" : "song");
    }
  }

  // ===== PIANO / FIGURE =====
  function buildFullPiano(){
    if(!els.pianoKeyboard) return;
    els.pianoKeyboard.innerHTML = "";
    const octavePattern = [
      {note:"C",hasBlack:true},{note:"D",hasBlack:true},{note:"E",hasBlack:false},
      {note:"F",hasBlack:true},{note:"G",hasBlack:true},{note:"A",hasBlack:true},{note:"B",hasBlack:false}
    ];
    const whiteW=26, blackW=16; let whiteCount=0;
    for(let octave=1; octave<=7; octave++){
      octavePattern.forEach(item=>{
        const full = item.note + octave;
        const white = document.createElement("div");
        white.className = "piano-key white";
        white.dataset.note = full;
        white.textContent = full;
        white.onclick = () => selectNoteFromPiano(full);
        els.pianoKeyboard.appendChild(white);
        whiteCount++;
        if(item.hasBlack){
          const blackNote = item.note + "#" + octave;
          const black = document.createElement("div");
          black.className = "piano-key black";
          black.dataset.note = blackNote;
          black.textContent = blackNote;
          black.style.left = ((whiteCount*whiteW)-(blackW/2)) + "px";
          black.onclick = () => selectNoteFromPiano(blackNote);
          els.pianoKeyboard.appendChild(black);
        }
      });
    }
  }

  function selectNoteFromPiano(fullNote){
    const ch = channels[activeChannel];
    if(!ch || !ch.notes[selectedIndex]) return;
    pushUndo();
    ch.notes[selectedIndex].note = fullNote;
    playSingleNote(fullNote, ch.type);
    renderAll();
  }

  function initFigureSelect(){
    if(!els.figureRange) return;
    els.figureRange.min = 0;
    els.figureRange.max = RHYTHM_FIGURES.length - 1;
    els.figureRange.step = 1;
    els.figureRange.value = 2;
    updateFigureLabel(2);
  }

  function updateFigureLabel(idx){
    const fig = RHYTHM_FIGURES[idx] || RHYTHM_FIGURES[2];
    if(els.figureLabel) els.figureLabel.textContent = fig.symbol + " " + fig.name;
  }

  function setFigureRangeFromId(figureId){
    const idx = RHYTHM_FIGURES.findIndex(f => f.id === figureId);
    const i = idx >= 0 ? idx : 2;
    if(els.figureRange) els.figureRange.value = i;
    updateFigureLabel(i);
  }

  function getAudioCtx(){
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!audioCtx || audioCtx.state === "closed"){
      audioCtx = new AC();
      pulseWaveCache.clear();
      noiseBufCache.clear();
    }
    if(audioCtx.state === "suspended"){
      try{ audioCtx.resume(); }catch(e){}
    }
    return audioCtx;
  }

  // Onda pulse com duty cycle (cache por duty)
  function createPulseWave(ctx, duty){
    const d = Math.min(0.9, Math.max(0.05, duty || 0.5));
    const key = d.toFixed(3);
    if(pulseWaveCache.has(key)) return pulseWaveCache.get(key);
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for(let k=1; k<n; k++){
      imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
    }
    const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    pulseWaveCache.set(key, wave);
    return wave;
  }

  // envelope: attack + sustain + release
  // legato=true → mantem volume (liga com a proxima nota)
  function applyNesEnvelope(gainNode, t0, peak, durSec, legato){
    const d = Math.max(0.025, durSec);
    const attack = Math.min(0.006, d * 0.12);
    gainNode.gain.cancelScheduledValues(t0);
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    if(legato){
      // Sustain ate o fim — a proxima nota continua o fraseado
      gainNode.gain.setValueAtTime(peak, t0 + d);
    } else {
      // Sustain ~80%, release curto no final
      const relStart = t0 + Math.max(attack, d * 0.8);
      gainNode.gain.setValueAtTime(peak, relStart);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    }
  }

  // Noise periodizado em buffer curto com loop (barato)
  function getNesNoiseBuffer(ctx, freqHint){
    const hold = Math.max(1, Math.floor(ctx.sampleRate / Math.max(80, Math.min(6000, (freqHint || 400) * 2))));
    if(noiseBufCache.has(hold)) return noiseBufCache.get(hold);
    const len = Math.max(hold * 32, Math.floor(ctx.sampleRate * 0.08));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const out = buffer.getChannelData(0);
    let reg = 1;
    let sample = 0;
    for(let i=0; i<len; i++){
      if(i % hold === 0){
        const bit = (reg ^ (reg >> 1)) & 1;
        reg = (reg >> 1) | (bit << 14);
        sample = (reg & 1) ? 0.7 : -0.7;
      }
      out[i] = sample;
    }
    noiseBufCache.set(hold, buffer);
    return buffer;
  }

  // when = audioCtx.currentTime para agendar no futuro
  // legato = nao corta o volume no fim (proxima nota no mesmo pitch/canal)
  function playTone(ctx, info, freq, durSec, peak, when, legato){
    const t0 = (when != null) ? when : ctx.currentTime;
    const dur = Math.max(0.025, durSec);
    // leve overlap no legato evita "buraco" entre celulas
    const stopAt = t0 + dur + (legato ? 0.012 : 0);
    const gain = ctx.createGain();
    gain.connect(ctx.destination);

    let src;
    if(info.wave === "noise"){
      src = ctx.createBufferSource();
      src.buffer = getNesNoiseBuffer(ctx, freq);
      src.loop = true;
      applyNesEnvelope(gain, t0, peak * 0.7, dur, !!legato);
      src.connect(gain);
      src.start(t0);
      src.stop(stopAt);
    } else {
      src = ctx.createOscillator();
      if(info.wave === "triangle"){
        src.type = "triangle";
      } else {
        const duty = (info.duty != null) ? info.duty : 0.5;
        src.setPeriodicWave(createPulseWave(ctx, duty));
      }
      src.frequency.setValueAtTime(freq, t0);
      applyNesEnvelope(gain, t0, peak, dur, !!legato);
      src.connect(gain);
      src.start(t0);
      src.stop(stopAt);
    }
    activeSources.push(src);
    src.onended = ()=>{
      const i = activeSources.indexOf(src);
      if(i >= 0) activeSources.splice(i, 1);
    };
    return src;
  }

  function stopAllSources(){
    activeSources.forEach(s=>{
      try{ s.stop(0); }catch(e){}
    });
    activeSources = [];
  }

  function playSingleNote(noteKey, channelType){
    const data = NOTE_MAP[noteKey];
    if(!data || data.isRest) return;
    const info = typeInfo(channelType);
    const ctx = getAudioCtx();
    playTone(ctx, info, data.freq || 200, 0.18, 0.14, ctx.currentTime);
  }

  function stepDurationSec(stepIndex){
    let maxFrames = 1;
    const base = getBaseFrames();
    channels.forEach(ch=>{
      const n = ch.notes[stepIndex];
      if(n) maxFrames = Math.max(maxFrames, calculateFrames(n.figure, base));
    });
    return maxFrames / 60.0;
  }

  // Highlight leve — NAO reconstrói o DOM
  function updatePlayingHighlight(stepIndex){
    document.querySelectorAll("#mod-sound .track-cell.playing").forEach(c=>{
      c.classList.remove("playing");
    });
    document.querySelectorAll("#mod-sound .track-cell").forEach(c=>{
      if(parseInt(c.dataset.index, 10) === stepIndex) c.classList.add("playing");
    });
    playbackIndex = stepIndex;
    document.querySelectorAll("#mod-sound .ruler-cell.playing").forEach(c => c.classList.remove("playing"));
    const rc = document.querySelector("#mod-sound .ruler-cell[data-index=\"" + stepIndex + "\"]");
    if(rc) rc.classList.add("playing");
    scrollTimelineToStep(stepIndex);
  }

  // Mantem a celula tocada visivel no scroll horizontal (headers ficam fora do scroll)
  function scrollTimelineToStep(stepIndex){
    const wrap = document.getElementById("tracks-scroll");
    if(!wrap) return;
    const cellLeft = stepIndex * CELL_W;
    const cellRight = cellLeft + CELL_W;
    const viewLeft = wrap.scrollLeft;
    const viewRight = viewLeft + wrap.clientWidth;
    const margin = 48;
    if(cellLeft < viewLeft + margin || cellRight > viewRight - margin){
      const target = Math.max(0, cellLeft - wrap.clientWidth * 0.35);
      wrap.scrollTo({ left: target, behavior: isPlaying ? "auto" : "smooth" });
    }
  }

  // ===== BIBLIOTECA =====
  function addSong(){
    flushActiveToItem();
    const name = prompt("Nome da musica:", "Musica " + (items.filter(i=>i.type==="song").length + 1));
    if(!name) return;
    const it = createItem("song", name.trim());
    items.push(it);
    loadItemIntoEditor(it.id);
  }

  function addSfx(){
    flushActiveToItem();
    const name = prompt("Nome do efeito:", "SFX " + (items.filter(i=>i.type==="sfx").length + 1));
    if(!name) return;
    const it = createItem("sfx", name.trim());
    items.push(it);
    loadItemIntoEditor(it.id);
  }

  function renameItem(){
    const it = getActiveItem();
    if(!it) return;
    const name = prompt("Novo nome:", it.name);
    if(!name || !name.trim()) return;
    it.name = name.trim();
    renderLibrarySelect();
    updateStatus();
  }

  function deleteItem(){
    if(items.length <= 1){
      alert("Precisa existir pelo menos 1 peca na biblioteca.");
      return;
    }
    const it = getActiveItem();
    if(!it) return;
    if(!confirm('Apagar "' + it.name + '"?')) return;
    if(isPlaying) stopPlayback();
    const idx = items.findIndex(x => x.id === it.id);
    items.splice(idx, 1);
    const next = items[Math.max(0, idx - 1)] || items[0];
    activeId = next.id;
    channels = JSON.parse(JSON.stringify(next.channels));
    activeChannel = 0;
    selectedIndex = 0;
    playbackIndex = 0;
    if(els.quarterInput) els.quarterInput.value = next.baseFrames || 30;
    const loopCb = document.getElementById("loop-checkbox");
    if(loopCb) loopCb.checked = next.loop !== false;
    renderLibrarySelect();
    renderAll();
  }

  // ===== CANAIS =====
  function addChannel(){
    pushUndo();
    const len = timelineLength();
    const used = usedTypes();
    const free = ["pulse1","pulse2","triangle","noise"].find(id => !used.has(id)) || "none";
    channels.push({ id: uid("ch"), type: free, name: "", muted: false, notes: emptyNotes(len) });
    activeChannel = channels.length - 1;
    selectedIndex = 0;
    renderAll();
  }

  function removeChannel(idx){
    if(channels.length <= 1){ alert("Precisa existir pelo menos 1 canal."); return; }
    if(!confirm("Remover canal " + typeInfo(channels[idx].type).label + "?")) return;
    pushUndo();
    channels.splice(idx, 1);
    if(activeChannel >= channels.length) activeChannel = channels.length - 1;
    ensureTypeActivation();
    renderAll();
  }

  function changeChannelType(idx, newType){
    if(!channels[idx] || channels[idx].type === newType) return;
    pushUndo();
    channels[idx].type = newType;
    if(newType === "none") channels[idx].muted = true;
    // Empilha faixas do mesmo instrumento uma sob a outra
    activeChannel = idx;
    reorderChannelsGrouped();
    renderAll();
  }

  function toggleMute(idx){
    channels[idx].muted = !channels[idx].muted;
    renderAll();
  }

  // ===== RENDER =====
  function renderAll(){
    normalizeLengths();
    renderTracks();
    updateTimelineBar();
    updateInspector();
    updateStatus();
    generateASM();
  }

  // Move uma coluna (indice) em TODOS os canais — mantem alinhamento da timeline
  function moveColumn(fromIdx, toIdx){
    if(fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    const len = timelineLength();
    if(fromIdx >= len || toIdx >= len) return;
    pushUndo();
    channels.forEach(ch=>{
      if(fromIdx >= ch.notes.length) return;
      const [item] = ch.notes.splice(fromIdx, 1);
      ch.notes.splice(toIdx, 0, item);
    });
    // Ajusta selecao / playback
    const mapIndex = (idx)=>{
      if(idx === fromIdx) return toIdx;
      if(fromIdx < toIdx && idx > fromIdx && idx <= toIdx) return idx - 1;
      if(fromIdx > toIdx && idx >= toIdx && idx < fromIdx) return idx + 1;
      return idx;
    };
    selectedIndex = mapIndex(selectedIndex);
    playbackIndex = mapIndex(playbackIndex);
    if(selectedCells.size){
      const next = new Set();
      selectedCells.forEach(i => next.add(mapIndex(i)));
      selectedCells = next;
      if(selectionStart !== null) selectionStart = mapIndex(selectionStart);
      if(selectionEnd !== null) selectionEnd = mapIndex(selectionEnd);
    }
    renderAll();
  }

  function renderTracks(){
    const cont = els.tracksContainer;
    const headersCol = els.tracksHeaders;
    const ruler = els.timelineRuler;
    if(!cont) return;
    ensureTypeActivation();
    cont.innerHTML = "";
    if(headersCol){
      headersCol.innerHTML = "";
      const hasStack = APU_TYPES.some(t => channelsOfType(t).length > 1);
      headersCol.classList.toggle("stacking", hasStack);
    }
    if(ruler) ruler.innerHTML = "";
    const len = timelineLength();

    // --- Regua de tempo (celulas alinhadas) ---
    if(ruler){
      for(let i = 0; i < len; i++){
        const rc = document.createElement("div");
        rc.className = "ruler-cell";
        rc.dataset.index = String(i);
        const frames = columnStartFrames(i);
        const showTime = (i === 0 || i % 4 === 0 || i === selectionStart || i === selectionEnd);
        rc.innerHTML = '<span class="r-idx">' + i + '</span>' +
          (showTime ? '<span class="r-time">' + formatTimelineTime(frames) + '</span>' : '');
        if(selectionStart !== null && selectionEnd !== null){
          const lo = Math.min(selectionStart, selectionEnd), hi = Math.max(selectionStart, selectionEnd);
          if(i >= lo && i <= hi) rc.classList.add("sel-range");
        } else if(selectionStart === i){
          rc.classList.add("sel-anchor");
        }
        if(isPlaying && i === playbackIndex) rc.classList.add("playing");
        rc.onclick = (e)=>{
          if(isPlaying) return;
          applyTimelinePick(i, e.shiftKey);
          renderAll();
          scrollTimelineToStep(i);
        };
        ruler.appendChild(rc);
      }
    }

    channels.forEach((ch, chIdx)=>{
      const info = typeInfo(ch.type);

      // Header sticky (coluna esquerda)
      if(headersCol){
        const header = document.createElement("div");
        header.className = "track-header" + (chIdx === activeChannel ? " active-track" : "");
        const sel = document.createElement("select");
        availableTypesFor(chIdx).forEach(t=>{
          const o = document.createElement("option");
          o.value = t.id; o.textContent = t.label;
          if(t.id === ch.type) o.selected = true;
          sel.appendChild(o);
        });
        sel.style.color = info.color;
        sel.onchange = (e) => changeChannelType(chIdx, e.target.value);
        sel.onclick = (e) => e.stopPropagation();
        const actions = document.createElement("div");
        actions.className = "track-actions";
        const muteBtn = document.createElement("button");
        muteBtn.className = "secondary";
        muteBtn.textContent = ch.muted ? "\u{1F507}" : "\u{1F50A}";
        muteBtn.onclick = (e) => { e.stopPropagation(); toggleMute(chIdx); };
        const delBtn = document.createElement("button");
        delBtn.className = "btn-del";
        delBtn.textContent = "\u2716";
        delBtn.onclick = (e) => { e.stopPropagation(); removeChannel(chIdx); };
        if(channels.length <= 1) delBtn.disabled = true;
        actions.appendChild(muteBtn);
        actions.appendChild(delBtn);
        // Nome do instrumento (MIDI) em destaque no cabeçalho
        const nm = document.createElement("div");
        nm.className = "trk-inst";
        const instLabel = (ch.name && String(ch.name).trim()) || typeInfo(ch.type).label;
        nm.title = instLabel;
        nm.textContent = instLabel;
        nm.style.color = info.color;
        header.appendChild(nm);
        header.appendChild(sel);
        header.appendChild(actions);
        if(ch.type === "none") header.classList.add("trk-none");
        if(isApuType(ch.type) && channelsOfType(ch.type).length > 1){
          if(getActiveChIdAt(ch.type, selectedIndex) !== ch.id) header.classList.add("trk-inactive-layer");
          const same = channelsOfType(ch.type).map(x => x.i);
          if(same.indexOf(chIdx) > 0) header.classList.add("stack-continue");
        }
        header.onclick = () => { activeChannel = chIdx; renderAll(); };
        headersCol.appendChild(header);
      }

      const row = document.createElement("div");
      row.className = "track-row";
      // Empilhamento visual: faixas do mesmo tipo ficam coladas
      if(isApuType(ch.type) && channelsOfType(ch.type).length > 1){
        const same = channelsOfType(ch.type).map(x => x.i);
        const pos = same.indexOf(chIdx);
        if(pos === 0) row.classList.add("stack-start");
        else if(pos === same.length - 1) row.classList.add("stack-continue");
        else row.classList.add("stack-mid", "stack-continue");
        if(pos > 0) row.classList.add("stack-continue");
      }
      const cells = document.createElement("div");
      cells.className = "track-cells";

      for(let i = 0; i < len; i++){
        const noteObj = ch.notes[i] || { note:"REST", figure:"quarter" };
        const cell = document.createElement("div");
        cell.className = "track-cell";
        if(chIdx === activeChannel && i === selectedIndex) cell.classList.add("active");
        if(selectedCells.has(i)) cell.classList.add("selected");
        if(isPlaying && i === playbackIndex) cell.classList.add("playing");
        cell.style.borderColor = (chIdx === activeChannel && i === selectedIndex) ? "#fff" : info.color + "88";
        const dupGroup = isApuType(ch.type) && channelsOfType(ch.type).length > 1;
        const activeHere = !dupGroup || getActiveChIdAt(ch.type, i) === ch.id;
        if(ch.muted || ch.type === "none") cell.style.opacity = "0.35";
        else if(dupGroup && !activeHere) cell.classList.add("layer-inactive");
        else if(dupGroup && activeHere) cell.classList.add("layer-active-here");
        if(dupGroup){
          const bp = typeActivation[ch.type] || [];
          if(bp.some(b => b.start === i && b.chId === ch.id)) cell.classList.add("layer-switch");
        }

        const label = document.createElement("div");
        label.className = "cell-label" + (noteObj.note === "REST" ? " rest" : "");
        label.textContent = noteObj.note === "REST" ? "R" : noteObj.note;
        label.style.color = noteObj.note === "REST" ? "#ffb703" : info.color;

        const dur = document.createElement("div");
        dur.className = "cell-dur";
        dur.style.background = info.color;
        const fig = RHYTHM_FIGURES.find(f => f.id === noteObj.figure) || RHYTHM_FIGURES[2];
        dur.style.width = Math.max(4, Math.min(22, fig.multiplier * 12)) + "px";

        cell.appendChild(label);
        cell.appendChild(dur);
        cell.dataset.index = String(i);

        cell.draggable = !isPlaying;
        cell.ondragstart = (e)=>{
          if(isPlaying){ e.preventDefault(); return; }
          draggedIndex = i;
          cell.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(i));
          activeChannel = chIdx;
          selectedIndex = i;
        };
        cell.ondragend = ()=>{
          cell.classList.remove("dragging");
          document.querySelectorAll("#mod-sound .track-cell.drag-over").forEach(c => c.classList.remove("drag-over"));
          draggedIndex = null;
        };
        cell.ondragover = (e)=>{
          if(isPlaying || draggedIndex === null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          cell.classList.add("drag-over");
        };
        cell.ondragleave = ()=>{ cell.classList.remove("drag-over"); };
        cell.ondrop = (e)=>{
          e.preventDefault();
          cell.classList.remove("drag-over");
          if(isPlaying || draggedIndex === null) return;
          const from = draggedIndex;
          const to = i;
          draggedIndex = null;
          if(from !== to) moveColumn(from, to);
        };

        cell.onclick = (e) => {
          if(isPlaying) return;
          activeChannel = chIdx;
          const dup = isApuType(ch.type) && channelsOfType(ch.type).length > 1;
          if(dup && getActiveChIdAt(ch.type, i) !== ch.id && !e.shiftKey){
            // Ativa esta voz a partir desta coluna
            setLayerActiveFrom(ch.type, i, ch.id);
            selectedIndex = i;
            playbackIndex = i;
            renderAll();
            scrollTimelineToStep(i);
            return;
          }
          applyTimelinePick(i, e.shiftKey);
          renderAll();
          scrollTimelineToStep(i);
        };
        cells.appendChild(cell);
      }

      if(chIdx === activeChannel && !isPlaying){
        const addBtn = document.createElement("div");
        addBtn.className = "cell-add-btn";
        addBtn.textContent = "+";
        addBtn.title = "Adicionar coluna (clona ultima nota do canal ativo)";
        addBtn.onclick = () => {
          pushUndo();
          const active = channels[activeChannel];
          const lastNote = active.notes.length
            ? active.notes[active.notes.length - 1]
            : { note:"C4", figure:"quarter" };
          const clone = { note: lastNote.note, figure: lastNote.figure };
          channels.forEach((c, ci) => {
            if(ci === activeChannel) c.notes.push({ note: clone.note, figure: clone.figure });
            else c.notes.push({ note:"REST", figure: clone.figure });
          });
          const last = channels[activeChannel].notes.length - 1;
          selectedIndex = last;
          playbackIndex = last;
          clearTimelineSelection();
          renderAll();
          scrollTimelineToStep(last);
        };
        cells.appendChild(addBtn);
      }

      row.appendChild(cells);
      cont.appendChild(row);
    });
  }

  function updateTimelineBar(){
    const actions = document.getElementById("selection-actions");
    const info = document.getElementById("selection-info");
    if(actions){
      if(selectedCells.size > 0){
        actions.style.display = "flex";
        if(info){
          const lo = selectionStart !== null && selectionEnd !== null
            ? Math.min(selectionStart, selectionEnd) + "–" + Math.max(selectionStart, selectionEnd)
            : String(selectedIndex);
          info.textContent = selectedCells.size + " colunas [" + lo + "]";
        }
      } else actions.style.display = "none";
    }
  }

  function updateInspector(){
    const ch = channels[activeChannel];
    const panel = document.getElementById("inspector-panel");
    const title = document.getElementById("inspector-title");
    if(!ch || ch.notes.length === 0){ if(panel) panel.style.display = "none"; return; }
    if(panel) panel.style.display = "flex";
    const cur = ch.notes[selectedIndex];
    if(!cur) return;
    const info = typeInfo(ch.type);
    if(title) title.textContent = info.label + " \u2014 #" + selectedIndex + " \u2014 " + cur.note + " / " + cur.figure;
    setFigureRangeFromId(cur.figure);
    const restBtn = document.getElementById("rest-btn");
    if(restBtn) restBtn.classList.toggle("active", cur.note === "REST");
    document.querySelectorAll("#mod-sound .piano-key").forEach(k=>{
      const n = k.getAttribute("data-note");
      if(cur.note === n) k.classList.add("active"); else k.classList.remove("active");
    });
  }

  function updateStatus(){
    const el = document.getElementById("sound-status");
    if(!el) return;
    const it = getActiveItem();
    const types = channels.map(c => typeInfo(c.type).label).join("+");
    const nSongs = items.filter(i=>i.type==="song").length;
    const nSfx = items.filter(i=>i.type==="sfx").length;
    el.textContent = (it?it.name:"—") + " \u2022 " + channels.length + "ch [" + types + "] \u2022 " + timelineLength() + " col \u2022 lib: " + nSongs + " song / " + nSfx + " sfx";
  }

  // ===== PLAYBACK (look-ahead + AudioContext unico) =====
  function scheduleStepNotes(stepIndex, when, dur){
    const ctx = getAudioCtx();
    const len = timelineLength();
    ensureTypeActivation();
    channels.forEach(ch=>{
      if(ch.muted || ch.type === "none") return;
      if(isApuType(ch.type) && channelsOfType(ch.type).length > 1){
        if(getActiveChIdAt(ch.type, stepIndex) !== ch.id) return;
      }
      const n = ch.notes[stepIndex];
      if(!n || n.note === "REST") return;
      const data = NOTE_MAP[n.note];
      if(!data || data.isRest) return;
      const info = typeInfo(ch.type);
      if(!info.wave) return;
      if(info.wave !== "noise" && (!data.freq || data.freq <= 0)) return;
      const freq = (data.freq > 0) ? data.freq : 400;
      const peak = info.wave === "triangle" ? 0.11 : (info.wave === "noise" ? 0.1 : 0.13);

      // Legato: usa a mesma voz ativa na proxima coluna
      let next = null;
      if(stepIndex + 1 < len){
        if(isApuType(ch.type) && channelsOfType(ch.type).length > 1){
          const nextId = getActiveChIdAt(ch.type, stepIndex + 1);
          const nextCh = channels.find(c => c.id === nextId);
          next = nextCh ? nextCh.notes[stepIndex + 1] : null;
        } else {
          next = ch.notes[stepIndex + 1];
        }
      }
      const nextIsRest = !next || next.note === "REST";
      const samePitch = next && next.note === n.note;
      const legato = !nextIsRest && (samePitch || info.wave !== "noise");

      playTone(ctx, info, freq, dur, peak, when, legato);
    });
  }

  function schedulerTick(){
    if(!isPlaying) return;
    const ctx = getAudioCtx();
    const len = timelineLength();
    if(len <= 0){ stopPlayback(); return; }

    // Agenda ~120ms a frente (look-ahead)
    const horizon = ctx.currentTime + 0.12;
    let guard = 0;
    while(schedNextTime < horizon && guard < 32){
      guard++;
      if(schedStep >= len){
        if(document.getElementById("loop-checkbox")?.checked){
          schedStep = 0;
        } else {
          // agenda stop quando o ultimo som acabar
          const remain = Math.max(0, (schedNextTime - ctx.currentTime) * 1000);
          schedTimer = setTimeout(()=> stopPlayback(), remain + 30);
          return;
        }
      }
      const dur = stepDurationSec(schedStep);
      scheduleStepNotes(schedStep, schedNextTime, dur);
      // UI: mostra o step que esta "agora" (nao o look-ahead)
      const uiStep = schedStep;
      const delayUI = Math.max(0, (schedNextTime - ctx.currentTime) * 1000);
      setTimeout(()=>{ if(isPlaying) updatePlayingHighlight(uiStep); }, delayUI);

      schedNextTime += dur;
      schedStep++;
    }

    schedTimer = setTimeout(schedulerTick, 25);
  }

  function playFromIndex(start){
    const len = timelineLength();
    if(len <= 0) return;
    const ctx = getAudioCtx();
    stopAllSources();
    if(schedTimer){ clearTimeout(schedTimer); schedTimer = null; }
    if(playbackTimeout){ clearTimeout(playbackTimeout); playbackTimeout = null; }

    isPlaying = true;
    schedStep = Math.max(0, Math.min(start, len - 1));
    playbackIndex = schedStep;
    // pequena folga para o audio thread
    schedNextTime = ctx.currentTime + 0.06;
    updatePlayingHighlight(schedStep);
    schedulerTick();
  }

  function stopPlayback(){
    isPlaying = false;
    if(schedTimer){ clearTimeout(schedTimer); schedTimer = null; }
    if(playbackTimeout){ clearTimeout(playbackTimeout); playbackTimeout = null; }
    stopAllSources();
    selectedIndex = playbackIndex;
    const playBtn = document.getElementById("play-btn");
    if(playBtn){ playBtn.textContent = "\u25B6"; playBtn.title = "Play"; playBtn.classList.remove("playing"); }
    if(els.quarterInput) els.quarterInput.disabled = false;
    document.querySelectorAll("#mod-sound .track-cell.playing").forEach(c=> c.classList.remove("playing"));
    renderAll();
  }

  // ===== SELECAO =====
  function applySelection(s, e){
    selectedCells.clear();
    const min = Math.min(s,e), max = Math.max(s,e);
    for(let i=min;i<=max;i++) selectedCells.add(i);
    selectionStart = s; selectionEnd = e;
    updateTimelineBar();
    renderTracks();
  }

  function cloneSelectedCells(){
    const ch = channels[activeChannel];
    if(!ch || selectedCells.size === 0) return;
    pushUndo();
    const sorted = Array.from(selectedCells).sort((a,b)=>a-b);
    const cells = sorted.map(i => JSON.parse(JSON.stringify(ch.notes[i])));
    const maxIdx = Math.max(...sorted);
    channels.forEach((c, ci)=>{
      const insert = (ci === activeChannel)
        ? cells.map(x => JSON.parse(JSON.stringify(x)))
        : cells.map(() => ({ note:"REST", figure:"quarter" }));
      insert.reverse().forEach(n => c.notes.splice(maxIdx+1, 0, n));
    });
    selectedIndex = maxIdx+1;
    renderAll();
  }

  function deleteSelectedCells(){
    if(selectedCells.size === 0) return;
    pushUndo();
    const sorted = Array.from(selectedCells).sort((a,b)=>b-a);
    sorted.forEach(idx=>{
      channels.forEach(c => { if(idx < c.notes.length) c.notes.splice(idx, 1); });
    });
    if(timelineLength() === 0){
      channels.forEach(c => c.notes.push({ note:"REST", figure:"quarter" }));
    }
    selectedCells.clear();
    selectionStart = null; selectionEnd = null;
    selectedIndex = Math.min(selectedIndex, Math.max(0, channels[activeChannel].notes.length - 1));
    playbackIndex = Math.min(playbackIndex, selectedIndex);
    renderAll();
  }

  function clearSelection(){
    selectedCells.clear();
    selectionStart = null; selectionEnd = null;
    updateTimelineBar();
    renderTracks();
  }



  // ===== MIDI IMPORT =====
  // Importa para uma GRADE TEMPORAL COMUM (padrao: semicolcheia).
  // Assim a coluna i = mesmo instante em todos os canais, e o playback
  // nao "segura" no tempo da figura mais longa de um canal desalinhado.

  function midiNoteToName(midi){
    let m = Math.max(24, Math.min(107, midi|0));
    const note = NOTE_NAMES[m % 12];
    let oct = Math.floor(m / 12) - 1;
    if(oct < 1) oct = 1;
    if(oct > 7) oct = 7;
    return note + oct;
  }

  function readVarLen(view, offset){
    let value = 0;
    let b;
    do {
      b = view.getUint8(offset++);
      value = (value << 7) | (b & 0x7F);
    } while(b & 0x80);
    return { value, offset };
  }

  function parseMidiArrayBuffer(buf){
    const view = new DataView(buf);
    if(view.byteLength < 14) throw new Error("Arquivo muito pequeno");
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if(magic !== "MThd") throw new Error("Nao e um arquivo MIDI (MThd ausente)");
    const headerLen = view.getUint32(4);
    const format = view.getUint16(8);
    const ntrks = view.getUint16(10);
    const division = view.getUint16(12);
    if(division & 0x8000) throw new Error("MIDI com SMPTE timing nao suportado");
    const ticksPerQuarter = division;

    let offset = 8 + headerLen;
    const tracks = [];
    let microsecondsPerQuarter = 500000; // 120 BPM default

    for(let t=0; t<ntrks && offset < view.byteLength; t++){
      if(offset + 8 > view.byteLength) break;
      const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset+1), view.getUint8(offset+2), view.getUint8(offset+3));
      const trackLen = view.getUint32(offset+4);
      offset += 8;
      if(id !== "MTrk"){ offset += trackLen; continue; }
      const trackEnd = offset + trackLen;
      let tick = 0;
      let runningStatus = 0;
      const openNotes = new Map();
      const notes = [];
      let isPercussion = false;
      let channelUsed = null;
      let trackName = "";
      let instrumentName = "";
      let program = null;

      while(offset < trackEnd){
        const vl = readVarLen(view, offset);
        tick += vl.value;
        offset = vl.offset;
        if(offset >= trackEnd) break;

        let status = view.getUint8(offset);
        if(status < 0x80){
          status = runningStatus;
        } else {
          offset++;
          runningStatus = status;
        }

        const eventType = status & 0xF0;
        const channel = status & 0x0F;

        if(status === 0xFF){
          const metaType = view.getUint8(offset++);
          const ml = readVarLen(view, offset);
          offset = ml.offset;
          const metaLen = ml.value;
          if(metaType === 0x51 && metaLen === 3){
            microsecondsPerQuarter = (view.getUint8(offset)<<16) | (view.getUint8(offset+1)<<8) | view.getUint8(offset+2);
          } else if((metaType === 0x03 || metaType === 0x04) && metaLen > 0){
            // 0x03 track/sequence name · 0x04 instrument name
            const tn = decodeMidiMetaText(view, offset, metaLen);
            if(tn){
              if(metaType === 0x03) trackName = tn;
              else instrumentName = tn;
            }
          }
          offset += metaLen;
        } else if(status === 0xF0 || status === 0xF7){
          const sl = readVarLen(view, offset);
          offset = sl.offset + sl.value;
        } else if(eventType === 0x90 || eventType === 0x80){
          const note = view.getUint8(offset++);
          const vel = view.getUint8(offset++);
          channelUsed = channel;
          if(channel === 9) isPercussion = true;
          if(eventType === 0x90 && vel > 0){
            openNotes.set(note, tick);
          } else {
            const startTick = openNotes.get(note);
            if(startTick !== undefined){
              notes.push({ midi: note, start: startTick, end: Math.max(startTick+1, tick), channel });
              openNotes.delete(note);
            }
          }
        } else if(eventType === 0xA0 || eventType === 0xB0 || eventType === 0xE0){
          offset += 2;
        } else if(eventType === 0xC0){
          program = view.getUint8(offset++);
          channelUsed = channel;
          if(channel === 9) isPercussion = true;
          if(!instrumentName && program >= 0 && program < GM_PROGRAM_NAMES.length){
            instrumentName = GM_PROGRAM_NAMES[program];
          }
        } else if(eventType === 0xD0){
          offset += 1;
        } else {
          if(status < 0x80) offset++;
        }
      }
      openNotes.forEach((startTick, note)=>{
        notes.push({ midi: note, start: startTick, end: Math.max(startTick+1, tick), channel: channelUsed||0 });
      });

      if(notes.length){
        // Prioridade do label: nome da trilha → instrumento meta → GM program → Track N
        let displayName = trackName || instrumentName || "";
        if(!displayName && program != null && program >= 0 && program < GM_PROGRAM_NAMES.length){
          displayName = GM_PROGRAM_NAMES[program];
        }
        if(!displayName && isPercussion) displayName = "Drums";
        if(!displayName) displayName = "Track " + (tracks.length + 1);
        tracks.push({
          notes, isPercussion, channel: channelUsed, noteCount: notes.length,
          name: displayName,
          instrument: instrumentName || displayName,
          program,
          index: tracks.length
        });
      }
    }

    const bpm = Math.round(60000000 / microsecondsPerQuarter);
    return { format, ticksPerQuarter, bpm, microsecondsPerQuarter, tracks };
  }

  // Rasteriza notas de uma track numa grade de steps (todos os canais compartilham a mesma grade)
  function rasterizeTrackToGrid(notes, stepTicks, numSteps){
    const cells = new Array(numSteps);
    for(let s=0; s<numSteps; s++){
      const t0 = s * stepTicks;
      const t1 = t0 + stepTicks;
      let best = null;
      for(let i=0; i<notes.length; i++){
        const n = notes[i];
        // nota cobre este step se intersecta [t0,t1)
        if(n.start < t1 && n.end > t0){
          if(!best || n.midi > best.midi) best = n;
        }
      }
      if(best){
        cells[s] = { note: midiNoteToName(best.midi), figure: "sixteenth" };
      } else {
        cells[s] = { note: "REST", figure: "sixteenth" };
      }
    }
    return cells;
  }

  // Compacta runs consecutivos da MESMA nota em figuras maiores (em todos os canais,
  // usando fronteiras comuns — so compacta spans onde TODOS os canais sao constantes).
  function compressGridChannels(channelNoteArrays){
    if(!channelNoteArrays.length) return channelNoteArrays;
    const len = channelNoteArrays[0].length;
    const out = channelNoteArrays.map(()=>[]);

    // Figuras disponiveis em steps de semicolcheia (1 step = sixteenth)
    // breve=16, whole=8, quarter=4, eighth=2, sixteenth=1
    const stepFigures = [
      { steps: 16, id: "breve" },
      { steps: 8,  id: "whole" },
      { steps: 4,  id: "quarter" },
      { steps: 2,  id: "eighth" },
      { steps: 1,  id: "sixteenth" }
    ];

    let i = 0;
    while(i < len){
      // Descobre quantos steps a frente todos os canais permanecem iguais a si mesmos
      let run = 1;
      while(i + run < len){
        let same = true;
        for(let c=0; c<channelNoteArrays.length; c++){
          if(channelNoteArrays[c][i+run].note !== channelNoteArrays[c][i].note){
            same = false; break;
          }
        }
        if(!same) break;
        run++;
      }

      // Quebra o run em figuras padrao (maior primeiro)
      let remaining = run;
      while(remaining > 0){
        let placed = null;
        for(const sf of stepFigures){
          if(sf.steps <= remaining){ placed = sf; break; }
        }
        if(!placed) placed = stepFigures[stepFigures.length-1];
        for(let c=0; c<channelNoteArrays.length; c++){
          out[c].push({
            note: channelNoteArrays[c][i].note,
            figure: placed.id
          });
        }
        remaining -= placed.steps;
        i += placed.steps;
      }
    }
    return out;
  }

  function suggestMidiMapping(tracks){
    // Uma sugestao por tipo APU; demais ficam "none" (ainda entram no editor)
    const map = tracks.map(() => "none");
    const melodic = tracks
      .map((t, i) => ({ t, i }))
      .filter(x => !x.t.isPercussion)
      .sort((a, b) => b.t.noteCount - a.t.noteCount);
    const perc = tracks
      .map((t, i) => ({ t, i }))
      .filter(x => x.t.isPercussion)
      .sort((a, b) => b.t.noteCount - a.t.noteCount);
    const melTypes = ["pulse1", "pulse2", "triangle"];
    for(let k = 0; k < melodic.length && k < melTypes.length; k++){
      map[melodic[k].i] = melTypes[k];
    }
    if(perc.length) map[perc[0].i] = "noise";
    return map;
  }

  function midiToLibraryItem(parsed, fileName, mapping){
    // Importa TODAS as trilhas. mapping[i] = pulse1|pulse2|triangle|noise|none
    // Tipos repetidos ficam no editor para merge manual depois.
    const tpq = parsed.ticksPerQuarter || 480;
    const stepTicks = Math.max(1, Math.round(tpq / 4));

    let maxTick = 0;
    parsed.tracks.forEach(t=>{
      t.notes.forEach(n=>{ if(n.end > maxTick) maxTick = n.end; });
    });

    const rawSteps = Math.ceil(maxTick / stepTicks) || 1;
    const numSteps = Math.min(rawSteps, 4096);

    const orderRank = { pulse1: 0, pulse2: 1, triangle: 2, noise: 3, none: 4 };
    const entries = [];
    parsed.tracks.forEach((tr, trackIdx)=>{
      let nesCh = (mapping && mapping[trackIdx]) || "none";
      if(!orderRank.hasOwnProperty(nesCh)) nesCh = "none";
      entries.push({
        trackIdx,
        type: nesCh,
        name: tr.name || ("Track " + (trackIdx + 1)),
        notes: rasterizeTrackToGrid(tr.notes, stepTicks, numSteps)
      });
    });

    if(!entries.length){
      entries.push({
        trackIdx: 0, type: "pulse1", name: "Melody",
        notes: Array.from({ length: 1 }, () => ({ note: "C4", figure: "sixteenth" }))
      });
    }

    // Ordena: tipos APU primeiro (sugeridos), none no final; estavel por trackIdx
    entries.sort((a, b)=>{
      const ra = orderRank[a.type] ?? 9;
      const rb = orderRank[b.type] ?? 9;
      if(ra !== rb) return ra - rb;
      return a.trackIdx - b.trackIdx;
    });

    const grids = entries.map(e => e.notes);
    const compressed = compressGridChannels(grids);
    const channels = compressed.map((notes, idx)=>({
      id: uid("ch"),
      type: entries[idx].type,
      name: entries[idx].name,
      muted: entries[idx].type === "none",
      notes
    }));

    let baseFrames = Math.round(3600 / (parsed.bpm || 120));
    baseFrames = Math.max(8, Math.min(120, baseFrames));
    const baseName = (fileName || "MIDI").replace(/\.(mid|midi)$/i, "");

    const mapped = channels.filter(c => c.type !== "none").map(c => c.type + (c.name ? "(" + c.name + ")" : ""));
    return {
      id: uid("song"),
      type: "song",
      name: baseName,
      loop: true,
      baseFrames,
      channels,
      _importMeta: {
        bpm: parsed.bpm,
        steps: numSteps,
        compressedLen: compressed[0]?.length || 0,
        truncated: rawSteps > numSteps,
        mapped,
        totalTracks: channels.length,
        noneCount: channels.filter(c => c.type === "none").length
      }
    };
  }

  function closeMidiMapDialog(){
    const el = document.getElementById("midi-map-overlay");
    if(el) el.remove();
  }

  function showMidiMapDialog(parsed, fileName){
    closeMidiMapDialog();
    const tracks = parsed.tracks || [];
    const suggested = suggestMidiMapping(tracks);

    const overlay = document.createElement("div");
    overlay.id = "midi-map-overlay";
    overlay.className = "midi-modal-overlay";

    const typeOpts = [
      { id: "pulse1", label: "Pulse 1" },
      { id: "pulse2", label: "Pulse 2" },
      { id: "triangle", label: "Triangle" },
      { id: "noise", label: "Noise" },
      { id: "none", label: "None" }
    ];

    let rows = "";
    tracks.forEach((t, i)=>{
      const kind = t.isPercussion
        ? '<span class="badge-perc">perc</span>'
        : '<span class="badge-mel">melodica</span>';
      const chLabel = t.channel != null ? ("ch " + (t.channel + 1)) : "—";
      const cur = suggested[i] || "none";
      const opts = typeOpts.map(ct =>
        '<option value="' + ct.id + '"' + (cur === ct.id ? " selected" : "") + ">" + ct.label + "</option>"
      ).join("");
      rows += '<tr data-track="' + i + '">' +
        '<td><div class="trk-name">' + (t.name || ("Track " + (i+1))).replace(/</g,"&lt;") + "</div>" +
        '<div class="trk-sub">' + kind + " · " + chLabel + " · " + t.noteCount + " notas</div></td>" +
        '<td><select class="midi-map-sel" data-idx="' + i + '">' + opts + "</select></td>" +
        "</tr>";
    });

    overlay.innerHTML =
      '<div class="midi-modal" role="dialog" aria-label="Mapear trilhas MIDI">' +
      "<h3>Importar MIDI — mapear trilhas</h3>" +
      '<div class="midi-meta">Arquivo: <b style="color:#e2e8f0">' + (fileName || "").replace(/</g,"&lt;") +
      "</b> · BPM ~" + (parsed.bpm || 120) + " · " + tracks.length + " trilha(s) com notas</div>" +
      '<table class="midi-map-table"><thead><tr><th>Instrumento / trilha</th><th>Canal NES</th></tr></thead><tbody>' +
      rows +
      "</tbody></table>" +
      '<div class="midi-hint">Todas as trilhas entram no editor. Use <b>None</b> para manter a trilha ' +
      "sem voz APU (fica no final, muda). Pode atribuir o <b>mesmo</b> canal (ex. 2x Pulse 1) " +
      "para mesclar depois na timeline. Sugestao automatica preenche 1 trilha por tipo.</div>" +
      '<div class="midi-modal-actions">' +
      '<button type="button" class="secondary" id="midi-map-cancel">Cancelar</button>' +
      '<button type="button" class="secondary" id="midi-map-auto">Sugestao automatica</button>' +
      '<button type="button" class="btn-ok" id="midi-map-ok">Importar</button>' +
      "</div></div>";

    const host = document.getElementById("mod-sound") || document.body;
    host.appendChild(overlay);

    function readMapping(){
      const sels = overlay.querySelectorAll(".midi-map-sel");
      const map = [];
      sels.forEach(sel => { map[parseInt(sel.dataset.idx, 10)] = sel.value || "none"; });
      return map;
    }

    function validateMapping(map){
      const assigned = map.filter(v => v && v !== "none");
      if(!assigned.length){
        return "Selecione pelo menos uma trilha com Pulse/Triangle/Noise (nao so None).";
      }
      return null;
    }

    overlay.querySelector("#midi-map-cancel").onclick = () => closeMidiMapDialog();
    overlay.addEventListener("click", (e)=>{ if(e.target === overlay) closeMidiMapDialog(); });

    overlay.querySelector("#midi-map-auto").onclick = ()=>{
      const sug = suggestMidiMapping(tracks);
      overlay.querySelectorAll(".midi-map-sel").forEach(sel=>{
        const i = parseInt(sel.dataset.idx, 10);
        sel.value = sug[i] || "none";
      });
    };

    overlay.querySelector("#midi-map-ok").onclick = ()=>{
      const mapping = readMapping();
      const err = validateMapping(mapping);
      if(err){ alert(err); return; }
      closeMidiMapDialog();
      finalizeMidiImport(parsed, fileName, mapping);
    };
  }

  function finalizeMidiImport(parsed, fileName, mapping){
    flushActiveToItem();
    const item = midiToLibraryItem(parsed, fileName, mapping);
    const meta = item._importMeta || {};
    delete item._importMeta;
    items.push(item);
    activeId = item.id;
    channels = JSON.parse(JSON.stringify(item.channels));
    activeChannel = 0;
    selectedIndex = 0;
    playbackIndex = 0;
    selectedCells.clear();
    undoStack = [];
    if(els.quarterInput) els.quarterInput.value = item.baseFrames;
    const loopCb = document.getElementById("loop-checkbox");
    if(loopCb) loopCb.checked = true;
    renderLibrarySelect();
    renderAll();
    const mappedLabel = (meta.mapped || []).join(", ");
    alert(
      'MIDI importado: "' + item.name + '"\n' +
      "BPM ~" + (meta.bpm || parsed.bpm) + " → " + item.baseFrames + " frames/seminima\n" +
      "Canais: " + mappedLabel + "\n" +
      "Colunas: " + (meta.compressedLen || timelineLength()) +
      (meta.truncated ? " (grade truncada)" : "")
    );
  }

  function importMidiFile(file){
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const parsed = parseMidiArrayBuffer(reader.result);
        if(!parsed.tracks.length){
          alert("MIDI sem notas de Note On/Off.");
          return;
        }
        // Sem popup: sugestao automatica + demais em None
        const mapping = suggestMidiMapping(parsed.tracks);
        finalizeMidiImport(parsed, file.name, mapping);
      }catch(err){
        console.error(err);
        alert("Falha ao importar MIDI: " + (err.message || err));
      }
    };
    reader.onerror = ()=> alert("Nao foi possivel ler o arquivo.");
    reader.readAsArrayBuffer(file);
  }

  // ===== ASM (biblioteca inteira) =====
  function generateASM(){
    flushActiveToItem();
    let out = `; ==========================================
; DATA.ASM - NES Sound Library
; Pecas: ${items.length} (${items.filter(i=>i.type==="song").length} songs, ${items.filter(i=>i.type==="sfx").length} sfx)
; ==========================================

.segment "RODATA"
`;
    items.forEach(it=>{
      const safeName = (it.name || it.id).replace(/[^a-zA-Z0-9_]/g, "_");
      const endFlag = it.loop ? "$FF" : "$FE";
      const base = it.baseFrames || 30;
      out += `\n; ========== ${it.type.toUpperCase()}: ${it.name} (${it.id}) ==========\n`;
      (it.channels || []).forEach(ch=>{
        if(!ch || ch.type === "none") return;
        const label = typeInfo(ch.type).label.replace(/\s+/g, "") + "_" + safeName;
        const used = ["REST"];
        (ch.notes || []).forEach(s=>{ if(!used.includes(s.note)) used.push(s.note); });
        const scale = (ch.notes || []).map(s => used.indexOf(s.note)).join(", ");
        const time = (ch.notes || []).map(s=>{
          const fig = RHYTHM_FIGURES.find(f => f.id === s.figure) || RHYTHM_FIGURES[2];
          return Math.max(1, Math.min(255, Math.round(base * fig.multiplier)));
        }).join(", ");
        const lo = used.map(k => NOTE_MAP[k].lo);
        const hi = used.map(k => NOTE_MAP[k].hi);
        out += `
; --- ${typeInfo(ch.type).label} ---
PitchTableLo_${label}:
${formatBytesForASM(lo)}

PitchTableHi_${label}:
${formatBytesForASM(hi)}

Scale_${label}:
    .byte ${scale}${scale ? ", " : ""}${endFlag}

Time_${label}:
    .byte ${time}
`;
      });
    });
    if(els.asmOutput) els.asmOutput.value = out;
  }

  // ===== EVENTS =====
  function attachEvents(){
    document.addEventListener("keydown", (e)=>{
      if(e.key === "Escape" && document.getElementById("mod-sound")){
        if(selectedCells.size || selectionStart !== null){
          clearTimelineSelection();
          renderAll();
        }
      }
    });

    document.getElementById("play-btn").onclick = ()=>{
      if(isPlaying){ stopPlayback(); return; }
      if(timelineLength() === 0) return;
      isPlaying = true;
      const btn = document.getElementById("play-btn");
      btn.textContent = "\u23F8"; btn.title = "Pause"; btn.classList.add("playing");
      // quarter-frames pode ficar travado; figura continua editavel
      if(els.quarterInput) els.quarterInput.disabled = true;
      playFromIndex(playbackIndex);
    };

    document.getElementById("rewind-btn").onclick = ()=>{
      if(isPlaying) stopPlayback();
      selectedIndex = 0; playbackIndex = 0;
      clearTimelineSelection();
      renderAll();
      scrollTimelineToStep(0);
    };
    document.getElementById("ff-btn").onclick = ()=>{
      if(isPlaying) stopPlayback();
      const last = Math.max(0, timelineLength() - 1);
      selectedIndex = last; playbackIndex = last;
      clearTimelineSelection();
      renderAll();
      scrollTimelineToStep(last);
    };

    document.getElementById("add-channel-btn").onclick = addChannel;
    const mergeBtn = document.getElementById("btn-merge-layers");
    if(mergeBtn) mergeBtn.onclick = mergeDuplicateTypes;
    document.getElementById("btn-new-song").onclick = addSong;
    document.getElementById("btn-new-sfx").onclick = addSfx;
    document.getElementById("btn-rename").onclick = renameItem;
    document.getElementById("btn-delete-item").onclick = deleteItem;
    document.getElementById("btn-import-midi").onclick = ()=> document.getElementById("midi-file-input").click();
    document.getElementById("midi-file-input").onchange = (e)=>{
      const f = e.target.files && e.target.files[0];
      if(f) importMidiFile(f);
      e.target.value = "";
    };

    if(els.librarySelect){
      els.librarySelect.onchange = (e)=>{
        if(e.target.value && e.target.value !== activeId) loadItemIntoEditor(e.target.value);
      };
    }

    document.getElementById("rest-btn").onclick = ()=>{
      const ch = channels[activeChannel];
      if(!ch || !ch.notes[selectedIndex]) return;
      pushUndo();
      ch.notes[selectedIndex].note = "REST";
      renderAll();
    };

    // Figura editavel inclusive durante o play
    if(els.figureRange){
      els.figureRange.oninput = ()=>{
        const idx = parseInt(els.figureRange.value, 10);
        updateFigureLabel(idx);
      };
      els.figureRange.onchange = ()=>{
        const idx = parseInt(els.figureRange?.value ?? 2, 10);
        updateFigureLabel(idx);
        const ch = channels[activeChannel];
        if(!ch || !ch.notes[selectedIndex]) return;
        const fig = RHYTHM_FIGURES[idx] || RHYTHM_FIGURES[2];
        if(ch.notes[selectedIndex].figure !== fig.id){
          pushUndo();
          ch.notes[selectedIndex].figure = fig.id;
          renderTracks();
          updateInspector();
          generateASM();
          updateStatus();
        }
      };
    }

    document.getElementById("clone-cell-btn").onclick = ()=>{
      const ch = channels[activeChannel];
      if(!ch || !ch.notes[selectedIndex]) return;
      pushUndo();
      const cloned = JSON.parse(JSON.stringify(ch.notes[selectedIndex]));
      channels.forEach((c, ci)=>{
        const n = (ci === activeChannel) ? JSON.parse(JSON.stringify(cloned)) : { note:"REST", figure: cloned.figure };
        c.notes.splice(selectedIndex + 1, 0, n);
      });
      selectedIndex++;
      playbackIndex = selectedIndex;
      renderAll();
    };

    document.getElementById("delete-cell-btn").onclick = ()=>{
      if(timelineLength() <= 1) return;
      pushUndo();
      channels.forEach(c => { if(selectedIndex < c.notes.length) c.notes.splice(selectedIndex, 1); });
      if(selectedIndex >= timelineLength()) selectedIndex = Math.max(0, timelineLength() - 1);
      playbackIndex = Math.min(playbackIndex, selectedIndex);
      renderAll();
    };

    document.getElementById("clone-selected-btn").onclick = cloneSelectedCells;
    document.getElementById("delete-selected-btn").onclick = deleteSelectedCells;
    document.getElementById("clear-selection-btn").onclick = clearSelection;

    els.quarterInput.onchange = ()=>{
      let v = parseInt(els.quarterInput.value) || 30;
      v = Math.max(4, Math.min(255, v));
      els.quarterInput.value = v;
      const it = getActiveItem();
      if(it) it.baseFrames = v;
      generateASM();
    };

    document.getElementById("loop-checkbox").onchange = (e)=>{
      const it = getActiveItem();
      if(it) it.loop = !!e.target.checked;
      generateASM();
    };

    document.getElementById("export-asm-btn").onclick = ()=>{
      generateASM();
      const blob = new Blob([els.asmOutput.value], { type:"text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sound_library.asm";
      a.click();
    };

    els.timelineBarContainer.addEventListener("mousedown", (e)=>{
      if(isPlaying) return;
      const cont = document.getElementById("tracks-scroll");
      const rect = els.timelineBarContainer.getBoundingClientRect();
      const x = e.clientX - rect.left + (cont?.scrollLeft || 0);
      const index = getIndexFromPosition(x, timelineLength() - 1);
      if(e.shiftKey && selectionStart !== null){
        applySelection(selectionStart, index);
      } else {
        isSelecting = true;
        selectionStart = index;
        selectionEnd = index;
        selectedCells.clear();
        selectedCells.add(index);
        playbackIndex = index;
        selectedIndex = index;
        updateTimelineBar();
        renderTracks();
        updateInspector();
      }
    });

    if(!globalEventsAttached){
      globalEventsAttached = true;
      document.addEventListener("mousemove", (e)=>{
        if(!isSelecting || isPlaying) return;
        const cont = document.getElementById("tracks-scroll");
        const rect = els.timelineBarContainer.getBoundingClientRect();
        const x = e.clientX - rect.left + (cont?.scrollLeft || 0);
        const index = Math.max(0, Math.min(timelineLength()-1, getIndexFromPosition(x, timelineLength()-1)));
        if(index !== selectionEnd){
          selectionEnd = index;
          applySelection(selectionStart, selectionEnd);
        }
      });
      document.addEventListener("mouseup", ()=>{
        if(isSelecting){
          isSelecting = false;
          if(selectionStart !== null && selectionEnd !== null && selectionStart === selectionEnd){
            clearSelection();
            selectedIndex = selectionStart;
            playbackIndex = selectionStart;
            renderTracks();
            updateInspector();
          }
        }
      });
    }
  }

  // ===== API =====
  return {
    init(){
      if(!items.length){
        const lib = defaultLibrary();
        items = lib.items;
        activeId = lib.activeId;
        channels = JSON.parse(JSON.stringify(items[0].channels));
      }
      buildHTML();
    },

    getData(){
      flushActiveToItem();
      return {
        version: 3,
        activeId,
        items: JSON.parse(JSON.stringify(items))
      };
    },

    loadData(data){
      // v3 biblioteca
      if(data && data.version === 3 && Array.isArray(data.items) && data.items.length){
        items = data.items.map(it => ({
          id: it.id || uid(it.type === "sfx" ? "sfx" : "song"),
          type: it.type === "sfx" ? "sfx" : "song",
          name: it.name || "Sem nome",
          loop: it.loop !== false,
          baseFrames: it.baseFrames || 30,
          channels: Array.isArray(it.channels) && it.channels.length
            ? it.channels.map(ch => ({
                id: ch.id || uid("ch"),
                type: ch.type || "pulse1",
                muted: !!ch.muted,
                notes: Array.isArray(ch.notes) && ch.notes.length
                  ? ch.notes.map(n => ({ note: n.note || "REST", figure: n.figure || "quarter" }))
                  : [{ note:"C4", figure:"quarter" }]
              }))
            : defaultChannels(it.type === "sfx")
        }));
        activeId = data.activeId && items.find(i => i.id === data.activeId)
          ? data.activeId
          : items[0].id;
        const it = getActiveItem();
        channels = JSON.parse(JSON.stringify(it.channels));
        activeChannel = 0;
        selectedIndex = 0;
        playbackIndex = 0;
        undoStack = [];
        return;
      }

      // v2 single-song (channels no root) → vira 1 item
      if(data && data.version === 2 && Array.isArray(data.channels) && data.channels.length){
        const it = {
          id: uid("song"),
          type: "song",
          name: "Musica 1",
          loop: data.loop !== false,
          baseFrames: data.baseFrames || 30,
          channels: data.channels
        };
        items = [it];
        activeId = it.id;
        channels = JSON.parse(JSON.stringify(it.channels));
        activeChannel = 0;
        selectedIndex = 0;
        playbackIndex = 0;
        undoStack = [];
        return;
      }

      // Formato antigo ou invalido → biblioteca limpa
      const lib = defaultLibrary();
      items = lib.items;
      activeId = lib.activeId;
      channels = JSON.parse(JSON.stringify(items[0].channels));
      activeChannel = 0;
      selectedIndex = 0;
      playbackIndex = 0;
      undoStack = [];
    },

    saveToProject(){
      if(!Project?.data) return;
      flushActiveToItem();
      Project.data.sounds = {
        version: 3,
        activeId,
        items: JSON.parse(JSON.stringify(items)),
        asm: els.asmOutput?.value || ""
      };
      if(typeof Project.save === "function") Project.save();
      else if(typeof Project.status === "function") Project.status("Biblioteca de som salva no .NMS");
    },

    undo(){
      if(!undoStack.length) return;
      const snap = undoStack.pop();
      channels = snap.channels;
      activeChannel = snap.activeChannel;
      selectedIndex = snap.selectedIndex;
      typeActivation = snap.typeActivation || {};
      ensureTypeActivation();
      renderAll();
    },

    exportASM(){ generateASM(); }
  };
})();

document.addEventListener("DOMContentLoaded", ()=>{
  if(document.getElementById("mod-sound")?.classList.contains("active")){
    SOUND.init();
  }
});
