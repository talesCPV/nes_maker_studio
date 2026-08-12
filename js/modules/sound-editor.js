// SOUND EDITOR MODULE - Vanilla single file, converted from som.html + style.css + init.js + later.js
// UI.switchModule('sound') -> SOUND.init() renders everything inside #mod-sound
const SOUND = (() => {
  // ===== CONSTANTES (init.js) =====
  const RHYTHM_FIGURES = [
    { id: "breve", symbol: "𝄀𝄀", name: "Breve (4x)", multiplier: 4.0 },
    { id: "whole", symbol: "𝄁", name: "Semibreve (2x)", multiplier: 2.0 },
    { id: "quarter", symbol: "♩", name: "Semínima (1x)", multiplier: 1.0 },
    { id: "eighth", symbol: "♪", name: "Colcheia (1/2)", multiplier: 0.5 },
    { id: "sixteenth", symbol: "𝅘𝅥𝅯", name: "Semicolcheia (1/4)", multiplier: 0.25 },
    { id: "thirtysecond", symbol: "𝅘𝅥𝅰", name: "Fusa (1/8)", multiplier: 0.125 },
    { id: "sixtyfourth", symbol: "𝅘𝅥𝅱", name: "Semifusa (1/16)", multiplier: 0.0625 }
  ];
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const CPU_FREQ_NTSC = 1789773;
  const NOTE_MAP = {};
  const PERIOD_TO_NOTE = {};
  NOTE_MAP["REST"] = { lo: "$00", hi: "$00", freq: 0, isRest: true };
  PERIOD_TO_NOTE["$00-$00"] = "REST";
  (function(){
    for(let octave=1;octave<=7;octave++){
      NOTE_NAMES.forEach((noteName, noteIndex)=>{
        const full=`${noteName}${octave}`;
        const midi=(octave+1)*12+noteIndex;
        const freq=440*Math.pow(2,(midi-69)/12);
        let period=Math.round((CPU_FREQ_NTSC/(16*freq))-1);
        if(period<0) period=0; if(period>2047) period=2047;
        const lo="$"+(period & 0xFF).toString(16).padStart(2,'0').toUpperCase();
        const hi="$"+((period>>8)&0x07).toString(16).padStart(2,'0').toUpperCase();
        NOTE_MAP[full]={lo,hi,freq,isRest:false};
        PERIOD_TO_NOTE[`${lo}-${hi}`]=full;
      });
    }
  })();

  const INITIAL_ASM = `; ==========================================
; DATA.ASM - Dados de Áudio para NES Sound Engine
; Tempo Base: 1 Semínima = 40 Frames
; NOTAS ÚNICAS: 12
; ==========================================

.segment "RODATA"

PitchTableLo:
    .byte $00, $A9, $D5, $8E, $1C, $52, $FD, $E1, $EF, $7E, $9F, $BD

PitchTableHi:
    .byte $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00

ScaleMelody:
    .byte 1, 0, 1, 0, 1, 0, 2, 1, 0, 3, 0, 4, 0, 2, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 6, 0, 2, 0, 1, 0, 3, 0, 9, 0, 10, 0, 3, 0, 1, 0, 2, 0, 11, 0, 7, 0, 2, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 6, 0, 2, 0, 1, 0, 3, 0, 9, 0, 10, 0, 3, 0, 1, 0, 2, 0, 11, 0, 7, 0, $FE

TimeMelody:
    .byte 10, 3, 10, 10, 10, 10, 10, 10, 10, 10, 40, 10, 40, 10, 20, 10, 20, 10, 20, 10, 5, 10, 10, 10, 3, 10, 20, 10, 3, 10, 10, 10, 3, 10, 10, 10, 3, 10, 10, 10, 10, 10, 3, 10, 3, 10, 20, 10, 20, 10, 20, 10, 20, 10, 5, 10, 10, 10, 3, 10, 20, 10, 3, 10, 10, 10, 3, 10, 10, 10, 3, 10, 10, 10, 10, 10, 3, 10, 3, 10, 3`;

  function parseInitialASM(asmText){
    const extractBytes = (blockText)=>{
      const bytes=[]; const lines=blockText.split('\n');
      lines.forEach(line=>{
        const clean=line.split(';')[0];
        if(clean.includes('.byte')){
          const parts=clean.replace('.byte','').split(',');
          parts.forEach(p=>{ const t=p.trim(); if(t) bytes.push(t); });
        }
      }); return bytes;
    };
    const getSection = (name)=>{
      const reg=new RegExp(`${name}:([\\s\\S]*?)(?=\\n\\w+:|$)`, 'i');
      const m=asmText.match(reg); return m?m[1]:'';
    };
    const loBytes=extractBytes(getSection('PitchTableLo'));
    const hiBytes=extractBytes(getSection('PitchTableHi'));
    const scaleBytes=extractBytes(getSection('ScaleMelody'));
    const timeBytes=extractBytes(getSection('TimeMelody'));
    const paletteNotes=[];
    for(let i=0;i<loBytes.length;i++){
      const key=`${loBytes[i].toUpperCase()}-${hiBytes[i].toUpperCase()}`;
      paletteNotes.push(PERIOD_TO_NOTE[key]||"REST");
    }
    const newSong=[]; const baseFrames=40;
    for(let i=0;i<scaleBytes.length;i++){
      const raw=scaleBytes[i].toUpperCase();
      if(raw==='$FF'||raw==='$FE') break;
      const noteIdx=parseInt(scaleBytes[i],10);
      const noteName=paletteNotes[noteIdx]||"REST";
      const frames=parseInt(timeBytes[i],10)||baseFrames;
      const figId=figureFromFrames(frames, baseFrames);
      newSong.push({note:noteName, figure:figId});
    }
    return newSong;
  }

  function figureFromFrames(frames, baseFrames=40){
    let closest=RHYTHM_FIGURES[2].id; let minDiff=Infinity;
    RHYTHM_FIGURES.forEach(fig=>{
      const expected=Math.max(1,Math.min(255,Math.round(baseFrames*fig.multiplier)));
      const diff=Math.abs(frames-expected);
      if(diff<minDiff){ minDiff=diff; closest=fig.id; }
    }); return closest;
  }
  function calculateFrames(figureId, baseFrames){
    const fig=RHYTHM_FIGURES.find(f=>f.id===figureId)||RHYTHM_FIGURES[2];
    return Math.max(1,Math.min(255,Math.round(baseFrames*fig.multiplier)));
  }
  function getNotePosition(note){
    if(note==="REST") return 50;
    const m=note.match(/(\d+)$/); const oct=m?parseInt(m[1],10):4;
    return 8 + ((oct-1)/6)*84;
  }
  function getDurationPosition(figId){
    const idx=RHYTHM_FIGURES.findIndex(f=>f.id===figId);
    const norm=idx<0?0.5:idx/(RHYTHM_FIGURES.length-1);
    return 88 - norm*70;
  }
  function getCellPosition(i){ return 10 + i*35 + 12.5; }
  function getIndexFromPosition(x,max){ const cw=35, off=10+12.5; return Math.max(0,Math.min(max, Math.round((x-off)/cw))); }
  function scrollTimelineToIndex(index){ try{ const wrapper=document.querySelector('#mod-sound .timeline-wrapper'); if(!wrapper) return; const cellPos=getCellPosition(index); const w=wrapper.clientWidth; wrapper.scrollTo({left:Math.max(0, cellPos-w/2+17), behavior:'smooth'}); }catch(e){} }
  function formatBytesForASM(arr, per=12){ let lines=[]; for(let i=0;i<arr.length;i+=per){ lines.push("    .byte "+arr.slice(i,i+per).join(', ')); } return lines.join('\n'); }

  // Estado
  let song = parseInitialASM(INITIAL_ASM);
  let globalEventsAttached = false;
  let selectedIndex=0, playbackIndex=0, draggedIndex=null, isPlaying=false, playbackTimeout=null;
  let selectedCells=new Set(), selectionStart=null, selectionEnd=null, isSelecting=false;
  let undoStack=[];

  function pushUndo(){ undoStack.push(JSON.parse(JSON.stringify(song))); if(undoStack.length>50) undoStack.shift(); }

  function injectCSS(){
    if(document.getElementById('sound-module-style')) return;
    const style=document.createElement('style');
    style.id='sound-module-style';
    style.textContent=`
      #mod-sound { --bg:#121218; --panel:#1e1e2a; --accent:#00e5ff; --accent-hover:#00b8d4; --text:#e2e8f0; --border:#334155; --rest-color:#ffb703; --timeline-bg:#1a1a2e; --timeline-progress:#10b981; --timeline-selection:rgba(16,185,129,0.3); --timeline-cursor:#00e5ff; background:var(--bg); color:var(--text); overflow:auto; }
      #mod-sound .sound-header { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:2px solid var(--border); background:#1a1a2e; }
      #mod-sound .sound-header h2 { margin:0; color:var(--accent); font-size:1.2rem; }
      #mod-sound .sound-header .subtitle { color:#94a3b8; font-size:.8rem; }
      #mod-sound .sound-card { background:var(--panel); padding:16px; border-radius:8px; border:1px solid var(--border); margin:12px; }
      #mod-sound .controls { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
      #mod-sound .transport-btn { width:36px; height:36px; padding:0; display:flex; align-items:center; justify-content:center; font-size:16px; border-radius:6px; }
      #mod-sound #play-btn.playing { background:#10b981; color:#fff; }
      #mod-sound .tempo-box { display:flex; align-items:center; gap:8px; background:#0f172a; padding:6px 12px; border-radius:6px; border:1px solid var(--border); }
      #mod-sound .tempo-box input { width:60px; text-align:center; padding:4px; font-weight:bold; color:var(--accent); background:#0f172a; border:1px solid var(--border); border-radius:4px; }
      #mod-sound button { background:var(--accent); color:#0f172a; border:none; padding:6px 12px; border-radius:6px; font-weight:700; cursor:pointer; font-size:12px; display:flex; align-items:center; gap:6px; }
      #mod-sound button:hover { background:var(--accent-hover); }
      #mod-sound button.secondary { background:#334155; color:#fff; }
      #mod-sound button.btn-clone { background:#10b981; color:#0f172a; }
      #mod-sound button.btn-del { background:#ef4444; color:#fff; }
      #mod-sound button.btn-load { background:#2d7927; color:#fff; }
      #mod-sound .timeline-wrapper { width:100%; overflow-x:auto; padding-bottom:12px; }
      #mod-sound .timeline-content { display:flex; flex-direction:column; gap:4px; min-width:max-content; }
      #mod-sound .timeline-grid { display:flex; gap:10px; align-items:flex-end; min-width:max-content; min-height:270px; padding:20px 10px 6px; }
      #mod-sound .cell-container { display:flex; flex-direction:column; align-items:center; position:relative; }
      #mod-sound .grid-cell { position:relative; background:linear-gradient(to bottom, transparent 0%, transparent 49.5%, rgba(255,255,255,0.12) 50%, transparent 50.5%, transparent 100%), #0f172a; border:2px solid var(--border); border-radius:6px; width:25px; height:240px; cursor:grab; user-select:none; box-sizing:border-box; overflow:hidden; }
      #mod-sound .grid-cell::before { content:""; position:absolute; top:12px; bottom:12px; left:50%; width:5px; transform:translateX(-50%); background:#fff; border-radius:4px; opacity:.95; pointer-events:none; }
      #mod-sound .grid-cell.active { border-color:var(--accent); background:#1e293b; box-shadow:0 0 10px rgba(0,229,255,.45); }
      #mod-sound .grid-cell.playing { border-color:#10b981!important; background:#1a2e1a!important; box-shadow:0 0 15px rgba(16,185,129,.6)!important; }
      #mod-sound .grid-cell.selected { border-color:#10b981!important; background:rgba(16,185,129,.15)!important; }
      #mod-sound .grid-cell.dragging { opacity:.4; border:2px dashed var(--accent); }
      #mod-sound .grid-cell.drag-over { border-color:#10b981; background:rgba(16,185,129,.15); }
      #mod-sound .cell-note { position:absolute; left:50%; z-index:5; top:50%; width:20px; height:20px; display:flex; justify-content:center; align-items:center; transform:translate(-50%,-50%); font-size:.6rem; font-weight:bold; color:#07111f; background:#fff; border:2px solid #fff; border-radius:50%; padding:0; text-align:center; pointer-events:none; }
      #mod-sound .cell-note.is-rest { background:var(--rest-color); border-color:var(--rest-color); }
      #mod-sound .cell-duration-mark { position:absolute; left:50%; z-index:4; transform:translateX(-50%); width:24px; height:4px; background:var(--accent); border-radius:3px; pointer-events:none; }
      #mod-sound .cell-add-btn { min-width:44px; width:44px; height:240px; border:2px dashed #059669; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:#fff; cursor:pointer; background:#059669; font-weight:bold; transition: all 0.2s; }
      #mod-sound .cell-add-btn:hover { background:#047a56; border-color:#047a56; color:#fff; }
      #mod-sound .cell-add-btn:hover { border-color:var(--accent); color:var(--accent); }
      #mod-sound .timeline-bar-container { position:relative; height:32px; margin:0 10px; cursor:pointer; min-width:max-content; }
      #mod-sound .timeline-bar { position:absolute; top:50%; left:0; right:0; height:8px; transform:translateY(-50%); background:#10b981; border-radius:4px; }
      #mod-sound .timeline-bar-fill { display:none; }
      #mod-sound .timeline-selection-range { position:absolute; top:-4px; height:calc(100% + 8px); background:var(--timeline-selection); border:2px solid rgba(16,185,129,.6); border-radius:4px; pointer-events:none; z-index:2; }
      #mod-sound .timeline-cursor { position:absolute; top:-6px; width:4px; height:calc(100% + 12px); background:var(--timeline-cursor); border-radius:2px; pointer-events:none; z-index:3; }
      #mod-sound .selection-actions { display:flex; gap:8px; margin-top:4px; padding:0 10px; min-width:max-content; align-items:center; }
      #mod-sound .inspector-panel { background:#0f172a; border:1px solid var(--border); border-radius:8px; padding:16px; margin-top:10px; display:flex; flex-direction:column; gap:12px; }
      #mod-sound .inspector-header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; }
      #mod-sound .inspector-title { font-weight:bold; color:var(--accent); }
      #mod-sound .piano-container { display:flex; flex-direction:column; gap:10px; background:#181824; padding:12px; border-radius:8px; border:1px solid var(--border); }
      #mod-sound .piano-scroll-wrapper { width:100%; overflow-x:auto; padding-bottom:8px; }
      #mod-sound .piano-keyboard { position:relative; display:inline-flex; height:100px; user-select:none; }
      #mod-sound .piano-key { cursor:pointer; display:flex; align-items:flex-end; justify-content:center; padding-bottom:6px; font-size:.65rem; font-weight:bold; box-sizing:border-box; border-radius:0 0 4px 4px; }
      #mod-sound .piano-key.white { width:28px; height:100%; background:#f8fafc; color:#0f172a; border:1px solid #cbd5e1; z-index:1; flex-shrink:0; }
      #mod-sound .piano-key.white.active { background:var(--accent)!important; }
      #mod-sound .piano-key.black { width:18px; height:58%; background:#0f172a; color:#fff; position:absolute; top:0; z-index:2; border-radius:0 0 3px 3px; border:1px solid #334155; font-size:.55rem; }
      #mod-sound .piano-key.black.active { background:var(--accent)!important; color:#0f172a; }
      #mod-sound .rest-btn { background:var(--rest-color); color:#0f172a; padding:6px 14px; font-size:.85rem; border-radius:4px; border:none; font-weight:bold; cursor:pointer; align-self:flex-start; }
      #mod-sound .rest-btn.active { outline:2px solid #fff; box-shadow:0 0 8px var(--rest-color); }
      #mod-sound textarea { width:100%; height:220px; background:#090d16; color:#38edf8; font-family:Consolas,monospace; padding:12px; border:1px solid var(--border); border-radius:6px; box-sizing:border-box; font-size:.85rem; }
      #mod-sound select { background:#1e1e2a; color:var(--text); border:1px solid var(--border); padding:6px 10px; border-radius:6px; font-size:.85rem; }
      @keyframes pulse { 0%{transform:scale(1)} 50%{transform:scale(1.05)} 100%{transform:scale(1)} }
    `;
    document.head.appendChild(style);
  }

  function buildHTML(){
    injectCSS();
    const mod = document.getElementById('mod-sound');
    if(!mod) return;
    mod.innerHTML = `
      <div class="sound-header">
        <div><h2>🎵 NES Sound Data Exporter</h2><div class="subtitle">Grid Compacto + Piano 7 Oitavas + Clonagem & Importação .ASM — Módulo Vanilla</div></div>
        <div style="display:flex;gap:6px">
          <button class="secondary" title="Desfazer" onclick="SOUND.undo()" style="width:32px;height:32px;justify-content:center">↩️</button>
          <button class="secondary" title="Salvar no .NMS" onclick="SOUND.saveToProject()" style="width:32px;height:32px;justify-content:center">💾</button>
        </div>
      </div>
      <div class="sound-card">
        <div class="controls">
          <button id="rewind-btn" class="secondary transport-btn" title="Rew">⏮</button>
          <button id="play-btn" class="secondary transport-btn" title="Play">▶</button>
          <button id="ff-btn" class="secondary transport-btn" title="FF - Ir para última nota">⏭</button>
          <div class="tempo-box"><label for="quarter-frames">♩ Semínima (Frames):</label><input type="number" id="quarter-frames" value="30" min="4" max="255"></div>
          <label><input type="checkbox" id="loop-checkbox" checked> Loop Infinito ($FF)</label>
        </div>
        <div class="timeline-wrapper">
          <div class="timeline-content">
            <div class="timeline-grid" id="timeline-grid"></div>
            <div class="timeline-bar-container" id="timeline-bar-container">
              <div class="timeline-bar" id="timeline-bar">
                <div class="timeline-bar-fill" id="timeline-bar-fill"></div>
                <div class="timeline-selection-range" id="timeline-selection-range" style="display:none"></div>
                <div class="timeline-cursor" id="timeline-cursor"></div>
              </div>
            </div>
            <div class="selection-actions" id="selection-actions" style="display:none">
              <button id="clone-selected-btn" class="btn-clone">📋 Clonar Selecionados</button>
              <button id="delete-selected-btn" class="btn-del">✖ Remover Selecionados</button>
              <button id="clear-selection-btn" class="secondary">Limpar Seleção</button>
              <span class="selection-info" id="selection-info"></span>
            </div>
          </div>
        </div>
        <div class="inspector-panel" id="inspector-panel">
          <div class="inspector-header">
            <div class="inspector-title" id="inspector-title">Editar Célula #00</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <select id="select-figure"></select>
              <button id="clone-cell-btn" class="btn-clone">📋 Clonar Célula</button>
              <button id="delete-cell-btn" class="btn-del">✖ Remov. Célula</button>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <label style="font-size:.8rem;color:#94a3b8">Selecione a Nota pelo Piano (Oitavas 1 a 7):</label>
            <div class="piano-container">
              <button class="rest-btn" id="rest-btn">🔇 REST</button>
              <div class="piano-scroll-wrapper"><div class="piano-keyboard" id="piano-keyboard"></div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="sound-card">
        <div class="controls">
          <button id="load-asm-btn" class="btn-load">📂 Load .asm</button>
          <button id="export-asm-btn">💾 Save .asm</button>
          <button onclick="SOUND.saveToProject()" style="background:#007acc;color:#fff">💾 Salvar no .NMS</button>
          <input type="file" id="asm-file-input" accept=".asm,.txt" style="display:none">
          <span id="sound-status" style="font-size:11px;color:#888;margin-left:auto">Pronto — ${()=>song.length} notas • Undo ${()=>undoStack.length}</span>
        </div>
        <textarea id="asm-output" readonly placeholder="O código Assembly gerado aparecerá aqui..."></textarea>
      </div>
    `;
    cacheEls();
    initFigureSelect();
    buildFullPiano();
    attachEvents();
    renderTimeline();
  }

  let els={};
  function cacheEls(){
    els.timelineGrid=document.getElementById('timeline-grid');
    els.selectFigure=document.getElementById('select-figure');
    els.quarterInput=document.getElementById('quarter-frames');
    els.asmOutput=document.getElementById('asm-output');
    els.pianoKeyboard=document.getElementById('piano-keyboard');
    els.timelineBarContainer=document.getElementById('timeline-bar-container');
    els.timelineBar=document.getElementById('timeline-bar');
    els.timelineCursor=document.getElementById('timeline-cursor');
    els.timelineBarFill=document.getElementById('timeline-bar-fill');
    els.timelineSelectionRange=document.getElementById('timeline-selection-range');
  }

  function getBaseFrames(){ return parseInt(els.quarterInput?.value)||30; }

  function buildFullPiano(){
    if(!els.pianoKeyboard) return;
    els.pianoKeyboard.innerHTML='';
    const octavePattern=[{note:'C',hasBlack:true},{note:'D',hasBlack:true},{note:'E',hasBlack:false},{note:'F',hasBlack:true},{note:'G',hasBlack:true},{note:'A',hasBlack:true},{note:'B',hasBlack:false}];
    const whiteW=28, blackW=18; let whiteCount=0;
    for(let octave=1;octave<=7;octave++){
      octavePattern.forEach(item=>{
        const full=`${item.note}${octave}`;
        const white=document.createElement('div'); white.className='piano-key white'; white.dataset.note=full; white.textContent=full; white.onclick=()=>selectNoteFromPiano(full); els.pianoKeyboard.appendChild(white); whiteCount++;
        if(item.hasBlack){
          const blackNote=`${item.note}#${octave}`;
          const black=document.createElement('div'); black.className='piano-key black'; black.dataset.note=blackNote; black.textContent=blackNote;
          black.style.left=`${(whiteCount*whiteW)-(blackW/2)}px`;
          black.onclick=()=>selectNoteFromPiano(blackNote); els.pianoKeyboard.appendChild(black);
        }
      });
    }
  }
  function selectNoteFromPiano(fullNote){ if(!song[selectedIndex]) return; pushUndo(); song[selectedIndex].note=fullNote; playSingleNote(fullNote); renderTimeline(); }
  function initFigureSelect(){ if(!els.selectFigure) return; els.selectFigure.innerHTML=''; RHYTHM_FIGURES.forEach(fig=>{ const opt=document.createElement('option'); opt.value=fig.id; opt.textContent=`${fig.symbol} ${fig.name}`; els.selectFigure.appendChild(opt); }); }
  function playSingleNote(noteKey){
    const data=NOTE_MAP[noteKey]; if(!data||data.isRest) return;
    const ctx=new (window.AudioContext||window.webkitAudioContext)(); const osc=ctx.createOscillator(); const gain=ctx.createGain();
    osc.type='square'; osc.frequency.setValueAtTime(data.freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.setValueAtTime(0.01, ctx.currentTime+0.2);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+0.2); osc.onended=()=>ctx.close();
  }
  function updateTimelineBar(){
    if(song.length===0||!els.timelineBar) return;
    const cw=els.timelineBarContainer.clientWidth; const total=Math.max(cw,10+song.length*35);
    els.timelineBar.style.width=(total-20)+'px'; els.timelineBarContainer.style.minWidth=total+'px';
    els.timelineCursor.style.left=getCellPosition(playbackIndex)+'px';
    els.timelineBarFill.style.width=(playbackIndex/Math.max(1,song.length-1))*100+'%';
    if(selectionStart!==null&&selectionEnd!==null){ const s=getCellPosition(Math.min(selectionStart,selectionEnd)); const e=getCellPosition(Math.max(selectionStart,selectionEnd)); els.timelineSelectionRange.style.display='block'; els.timelineSelectionRange.style.left=s+'px'; els.timelineSelectionRange.style.width=(e-s)+'px'; } else if(els.timelineSelectionRange){ els.timelineSelectionRange.style.display='none'; }
    const status=document.getElementById('sound-status'); if(status) status.textContent=`Pronto — ${song.length} notas • Undo ${undoStack.length}`;
  }
  function updateSelectionActions(){
    const actions=document.getElementById('selection-actions'); const info=document.getElementById('selection-info');
    if(!actions) return;
    if(selectedCells.size>0){ actions.style.display='flex'; if(info) info.textContent=`${selectedCells.size} célula(s) selecionada(s)`; } else { actions.style.display='none'; }
  }
  function applySelection(s,e){
    selectedCells.clear(); const min=Math.min(s,e), max=Math.max(s,e);
    for(let i=min;i<=max;i++) selectedCells.add(i);
    selectionStart=s; selectionEnd=e; updateTimelineBar(); updateSelectionActions(); renderTimeline();
  }
  function cloneSelectedCells(){
    if(selectedCells.size===0) return; pushUndo();
    const sorted=Array.from(selectedCells).sort((a,b)=>a-b);
    const cells=sorted.map(i=>JSON.parse(JSON.stringify(song[i])));
    const maxIdx=Math.max(...sorted);
    cells.reverse().forEach(c=>song.splice(maxIdx+1,0,c));
    const newSel=new Set(); for(let i=0;i<cells.length;i++) newSel.add(maxIdx+1+i);
    selectedCells=newSel; selectedIndex=maxIdx+1; selectionStart=Math.min(...newSel); selectionEnd=Math.max(...newSel);
    updateTimelineBar(); renderTimeline();
  }
  function deleteSelectedCells(){
    if(selectedCells.size===0) return; pushUndo();
    const sorted=Array.from(selectedCells).sort((a,b)=>b-a);
    sorted.forEach(idx=>song.splice(idx,1));
    selectedCells.clear(); selectionStart=null; selectionEnd=null;
    if(selectedIndex>=song.length) selectedIndex=Math.max(0,song.length-1);
    playbackIndex=Math.min(playbackIndex,Math.max(0,song.length-1));
    updateTimelineBar(); renderTimeline();
  }
  function clearSelection(){ selectedCells.clear(); selectionStart=null; selectionEnd=null; updateTimelineBar(); updateSelectionActions(); renderTimeline(); }

  function playFromIndex(start){
    if(!isPlaying||start>=song.length){ stopPlayback(); return; }
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const item=song[start]; const frames=calculateFrames(item.figure, getBaseFrames()); const dur=frames/60.0; const noteData=NOTE_MAP[item.note];
    playbackIndex=start; updateTimelineBar(); renderTimeline();
    const cells=document.querySelectorAll('#mod-sound .grid-cell'); if(cells[start]) cells[start].classList.add('playing');
    if(noteData&&!noteData.isRest&&noteData.freq>0){
      const osc=ctx.createOscillator(); const gain=ctx.createGain();
      osc.type='square'; osc.frequency.setValueAtTime(noteData.freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.setValueAtTime(0.01, ctx.currentTime+dur-0.005);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+dur); osc.onended=()=>ctx.close();
    } else { ctx.close(); }
    playbackTimeout=setTimeout(()=>{ if(cells[start]) cells[start].classList.remove('playing'); const next=start+1; if(next>=song.length){ if(document.getElementById('loop-checkbox')?.checked) playFromIndex(0); else stopPlayback(); } else playFromIndex(next); }, dur*1000);
  }
  function stopPlayback(){
    isPlaying=false; if(playbackTimeout){ clearTimeout(playbackTimeout); playbackTimeout=null; }
    selectedIndex=playbackIndex;
    const playBtn=document.getElementById('play-btn'); if(playBtn){ playBtn.textContent='▶'; playBtn.title='Play'; playBtn.classList.remove('playing'); }
    const grid=document.getElementById('timeline-grid'); if(grid) grid.classList.remove('playing');
    document.querySelectorAll('#mod-sound .grid-cell.playing').forEach(c=>c.classList.remove('playing'));
    if(els.selectFigure) els.selectFigure.disabled=false; if(els.quarterInput) els.quarterInput.disabled=false;
    updateTimelineBar(); renderTimeline(); scrollTimelineToIndex(playbackIndex);
  }

  function renderTimeline(){
    if(!els.timelineGrid) return; els.timelineGrid.innerHTML='';
    if(selectedIndex>=song.length) selectedIndex=Math.max(0,song.length-1);
    if(playbackIndex>=song.length) playbackIndex=Math.max(0,song.length-1);
    song.forEach((item,index)=>{
      const container=document.createElement('div'); container.className='cell-container';
      const cell=document.createElement('div'); cell.className=`grid-cell ${index===selectedIndex?'active':''} ${selectedCells.has(index)?'selected':''}`; cell.draggable=!isPlaying; cell.dataset.index=index;
      const figObj=RHYTHM_FIGURES.find(f=>f.id===item.figure)||RHYTHM_FIGURES[2];
      const notePos=getNotePosition(item.note); const durPos=getDurationPosition(item.figure);
      const display=item.note==='REST'?'R':item.note;
      cell.innerHTML=`<div class="cell-note ${item.note==='REST'?'is-rest':''}" style="top:${100-notePos}%" title="${item.note}">${display}</div><div class="cell-duration-mark" style="top:${100-durPos}%" title="${figObj.name}"></div>`;
      if(!isPlaying){
        cell.onclick=()=>{ if(!isSelecting){ selectedIndex=index; playbackIndex=index; updateTimelineBar(); renderTimeline(); } };
        cell.ondragstart=(e)=>{ draggedIndex=index; cell.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; };
        cell.ondragend=()=>{ cell.classList.remove('dragging'); draggedIndex=null; document.querySelectorAll('#mod-sound .grid-cell').forEach(c=>c.classList.remove('drag-over')); };
        cell.ondragover=(e)=>{ e.preventDefault(); if(draggedIndex!==null&&draggedIndex!==index) cell.classList.add('drag-over'); };
        cell.ondragleave=()=>cell.classList.remove('drag-over');
        cell.ondrop=(e)=>{ e.preventDefault(); cell.classList.remove('drag-over'); if(draggedIndex!==null&&draggedIndex!==index){ const moved=song.splice(draggedIndex,1)[0]; song.splice(index,0,moved); const newSel=new Set(); selectedCells.forEach(sel=>{ if(sel===draggedIndex) newSel.add(index); else if(draggedIndex<sel&&index>=sel) newSel.add(sel-1); else if(draggedIndex>sel&&index<=sel) newSel.add(sel+1); else newSel.add(sel); }); selectedCells=newSel; if(selectedIndex===draggedIndex) selectedIndex=index; else if(draggedIndex<selectedIndex&&index>=selectedIndex) selectedIndex--; else if(draggedIndex>selectedIndex&&index<=selectedIndex) selectedIndex++; updateTimelineBar(); renderTimeline(); } };
      }
      container.appendChild(cell); els.timelineGrid.appendChild(container);
    });
    const addContainer=document.createElement('div'); addContainer.className='cell-container';
    const addBtn=document.createElement('div'); addBtn.className='cell-add-btn'; addBtn.textContent='+'; addBtn.title='Adicionar célula';
    if(!isPlaying){ addBtn.onclick=()=>{ pushUndo(); song.push({note:"C4", figure:"quarter"}); selectedIndex=song.length-1; playbackIndex=song.length-1; updateTimelineBar(); renderTimeline(); }; }
    addContainer.appendChild(addBtn); els.timelineGrid.appendChild(addContainer);
    updateInspector(); generateASM(); updateTimelineBar(); updateSelectionActions();
  }

  function updateInspector(){
    const panel=document.getElementById('inspector-panel'); if(!panel) return;
    if(song.length===0){ panel.style.display='none'; return; } panel.style.display='flex';
    const cur=song[selectedIndex]; if(!cur) return;
    document.getElementById('inspector-title').textContent=`Editar Célula #${selectedIndex.toString().padStart(2,'0')}`;
    if(els.selectFigure) els.selectFigure.value=cur.figure;
    updatePianoSelection();
  }
  function updatePianoSelection(){
    const curNote=song[selectedIndex]?.note; const restBtn=document.getElementById('rest-btn'); if(restBtn) restBtn.classList.toggle('active', curNote==="REST");
    document.querySelectorAll('#mod-sound .piano-key').forEach(k=>{ const n=k.getAttribute('data-note'); if(curNote===n) k.classList.add('active'); else k.classList.remove('active'); });
  }
  function generateASM(){
    const isLoop=document.getElementById('loop-checkbox')?.checked; const endFlag=isLoop?"$FF":"$FE";
    const used=["REST"]; song.forEach(s=>{ if(!used.includes(s.note)) used.push(s.note); });
    const scale=song.map(s=>used.indexOf(s.note)).join(', ');
    const base=getBaseFrames(); const time=song.map(s=>{ const fig=RHYTHM_FIGURES.find(f=>f.id===s.figure)||RHYTHM_FIGURES[2]; return Math.max(1,Math.min(255,Math.round(base*fig.multiplier))); }).join(', ');
    const lo=used.map(k=>NOTE_MAP[k].lo); const hi=used.map(k=>NOTE_MAP[k].hi);
    if(els.asmOutput) els.asmOutput.value=`; ==========================================
; DATA.ASM - NES Sound Engine
; Tempo Base: 1 Semínima = ${base} Frames
; NOTAS ÚNICAS: ${used.length}
; ==========================================

.segment "RODATA"

PitchTableLo:
${formatBytesForASM(lo)}

PitchTableHi:
${formatBytesForASM(hi)}

ScaleMelody:
    .byte ${scale}, ${endFlag}

TimeMelody:
    .byte ${time}
`;
  }
  function parseASM(text){
    try{
      const tempoMatch=text.match(/Tempo Base:\s*1\s*Semínima\s*=\s*(\d+)\s*Frames/i);
      if(tempoMatch&&els.quarterInput) els.quarterInput.value=parseInt(tempoMatch[1]);
      const extractBytes=(block)=>{ const bytes=[]; const lines=block.split('\n'); lines.forEach(line=>{ const clean=line.split(';')[0]; if(clean.includes('.byte')){ const parts=clean.replace('.byte','').split(','); parts.forEach(p=>{ const t=p.trim(); if(t) bytes.push(t); }); } }); return bytes; };
      const getSection=(name)=>{ const reg=new RegExp(`${name}:([\\s\\S]*?)(?=\\n\\w+:|$)`, 'i'); const m=text.match(reg); return m?m[1]:''; };
      const loBytes=extractBytes(getSection('PitchTableLo')); const hiBytes=extractBytes(getSection('PitchTableHi')); const scaleBytes=extractBytes(getSection('ScaleMelody')); const timeBytes=extractBytes(getSection('TimeMelody'));
      if(!loBytes.length||!hiBytes.length||!scaleBytes.length||!timeBytes.length){ alert('Erro: .asm inválido'); return; }
      const palette=[]; for(let i=0;i<loBytes.length;i++){ const key=`${loBytes[i].toUpperCase()}-${hiBytes[i].toUpperCase()}`; palette.push(PERIOD_TO_NOTE[key]||"REST"); }
      const newSong=[]; const base=parseInt(els.quarterInput.value)||30;
      for(let i=0;i<scaleBytes.length;i++){
        const raw=scaleBytes[i].toUpperCase(); if(raw==='$FF'){ document.getElementById('loop-checkbox').checked=true; break; } else if(raw==='$FE'){ document.getElementById('loop-checkbox').checked=false; break; }
        const noteIdx=parseInt(scaleBytes[i],10); const noteName=palette[noteIdx]||"REST"; const frames=parseInt(timeBytes[i],10)||base; const figId=figureFromFrames(frames, base); newSong.push({note:noteName, figure:figId});
      }
      if(newSong.length>0){ pushUndo(); song=newSong; selectedIndex=0; playbackIndex=0; selectedCells.clear(); selectionStart=null; selectionEnd=null; updateTimelineBar(); renderTimeline(); alert('Música .asm importada!'); }
    }catch(err){ alert('Falha ao processar .asm'); console.error(err); }
  }

  function attachEvents(){
    document.getElementById('play-btn').onclick=()=>{
      if(isPlaying){ stopPlayback(); return; }
      if(song.length===0||playbackIndex>=song.length) return;
      isPlaying=true; 
      const btn=document.getElementById('play-btn'); btn.textContent='⏸'; btn.title='Pause'; btn.classList.add('playing'); 
      if(els.timelineGrid) els.timelineGrid.classList.add('playing');
      if(els.selectFigure) els.selectFigure.disabled=true; if(els.quarterInput) els.quarterInput.disabled=true; 
      playFromIndex(playbackIndex);
    };
    document.getElementById('rewind-btn').onclick=()=>{
      if(song.length>0){ if(isPlaying) stopPlayback(); selectedIndex=0; playbackIndex=0; updateTimelineBar(); renderTimeline(); scrollTimelineToIndex(0); }
    };
    document.getElementById('ff-btn').onclick=()=>{
      if(song.length>0){ if(isPlaying) stopPlayback(); selectedIndex=song.length-1; playbackIndex=song.length-1; updateTimelineBar(); renderTimeline(); scrollTimelineToIndex(song.length-1); }
    };
    document.getElementById('rest-btn').onclick=()=>{ if(!song[selectedIndex]) return; pushUndo(); song[selectedIndex].note="REST"; renderTimeline(); };
    els.selectFigure.onchange=(e)=>{ if(song[selectedIndex]){ pushUndo(); song[selectedIndex].figure=e.target.value; renderTimeline(); } };
    document.getElementById('clone-cell-btn').onclick=()=>{ if(song.length>0&&song[selectedIndex]){ pushUndo(); const cloned=JSON.parse(JSON.stringify(song[selectedIndex])); song.splice(selectedIndex+1,0,cloned); selectedIndex++; playbackIndex=Math.min(playbackIndex+1,song.length-1); updateTimelineBar(); renderTimeline(); } };
    document.getElementById('delete-cell-btn').onclick=()=>{
      if(song.length>0){ pushUndo(); song.splice(selectedIndex,1); selectedCells.delete(selectedIndex); const newSet=new Set(); selectedCells.forEach(idx=>{ if(idx>selectedIndex) newSet.add(idx-1); else newSet.add(idx); }); selectedCells=newSet; if(selectedIndex>=song.length) selectedIndex=Math.max(0,song.length-1); playbackIndex=Math.min(playbackIndex,Math.max(0,song.length-1)); updateTimelineBar(); renderTimeline(); }
    };
    document.getElementById('clone-selected-btn').onclick=cloneSelectedCells;
    document.getElementById('delete-selected-btn').onclick=deleteSelectedCells;
    document.getElementById('clear-selection-btn').onclick=clearSelection;
    els.quarterInput.onchange=()=>{ let v=parseInt(els.quarterInput.value)||30; els.quarterInput.value=Math.max(4,Math.min(255,v)); renderTimeline(); };
    document.getElementById('loop-checkbox').onchange=generateASM;
    document.getElementById('export-asm-btn').onclick=()=>{ const blob=new Blob([els.asmOutput.value],{type:'text/plain;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='data.asm'; a.click(); };
    const loadBtn=document.getElementById('load-asm-btn'); const fileInput=document.getElementById('asm-file-input');
    loadBtn.onclick=()=>fileInput.click();
    fileInput.onchange=(e)=>{ const file=e.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=(ev)=>{ parseASM(ev.target.result); fileInput.value=''; }; reader.readAsText(file); };
    // Timeline bar seleção
    els.timelineBarContainer.addEventListener('mousedown', (e)=>{
      if(isPlaying) return; const rect=els.timelineBarContainer.getBoundingClientRect(); const x=e.clientX-rect.left+els.timelineBarContainer.scrollLeft; const index=getIndexFromPosition(x, song.length-1);
      if(e.shiftKey&&selectionStart!==null){ applySelection(selectionStart,index); } else { isSelecting=true; selectionStart=index; selectionEnd=index; selectedCells.clear(); selectedCells.add(index); playbackIndex=index; selectedIndex=index; updateTimelineBar(); updateSelectionActions(); renderTimeline(); }
    });
    // BUG FIX: mousemove/mouseup/resize são globais (document/window). Como
    // attachEvents() roda de novo a cada vez que o usuário abre a aba Sons,
    // registrar sem guarda soma um handler por visita e passa a duplicar
    // seleções/renderizações. Registra só uma vez.
    if(!globalEventsAttached){
      globalEventsAttached = true;
      document.addEventListener('mousemove', (e)=>{
        if(!isSelecting||isPlaying) return; const rect=els.timelineBarContainer.getBoundingClientRect(); const x=e.clientX-rect.left+els.timelineBarContainer.scrollLeft; const index=Math.max(0,Math.min(song.length-1,getIndexFromPosition(x,song.length-1))); if(index!==selectionEnd){ selectionEnd=index; applySelection(selectionStart,selectionEnd); }
      });
      document.addEventListener('mouseup', ()=>{ if(isSelecting){ isSelecting=false; if(selectionStart!==null&&selectionEnd!==null&&selectionStart===selectionEnd){ clearSelection(); selectedIndex=selectionStart; playbackIndex=selectionStart; renderTimeline(); } } });
      window.addEventListener('resize', updateTimelineBar);
    }
  }

  return {
    init(){ buildHTML(); },
    getData(){ return { song: [...song], baseFrames: getBaseFrames(), loop: document.getElementById('loop-checkbox')?.checked }; },
    loadData(data){ if(data && data.song){ song=data.song; } },
    saveToProject(){
      if(!Project?.data) return;
      Project.data.sounds = { song: [...song], baseFrames: getBaseFrames(), loop: document.getElementById('loop-checkbox')?.checked, asm: els.asmOutput?.value };
      if(typeof Project.save==='function') Project.save();
      else if(typeof Project.status==='function') Project.status("Som salvo no .NMS");
    },
    undo(){ if(undoStack.length){ song=undoStack.pop(); renderTimeline(); } },
    exportASM(){ generateASM(); }
  };
})();

// Inicializa quando o DOM estiver pronto, mas também expõe SOUND global para UI.switchModule
document.addEventListener('DOMContentLoaded', ()=>{
  // Não auto-inicializa se o módulo de som não está ativo - deixa UI.switchModule chamar
  if(document.getElementById('mod-sound')?.classList.contains('active')){
    SOUND.init();
  }
});
