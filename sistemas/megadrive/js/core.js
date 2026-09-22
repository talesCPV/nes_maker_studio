/**
 * sistemas/megadrive/js/core.js
 * Core MD - mesmo padrão do NES (sistemas/nes/js/core.js)
 * - AppState global, EventBus, TabManager, ModuleRegistry
 * - Compatível com backend/projects/* e app-config.js
 */
(function(){
  const EventBus = {
    _events: {},
    on(evt, fn){ (this._events[evt] = this._events[evt] || []).push(fn); },
    off(evt, fn){ if(!this._events[evt]) return; this._events[evt] = this._events[evt].filter(f=>f!==fn); },
    emit(evt, data){ (this._events[evt]||[]).forEach(fn=>{ try{ fn(data); }catch(e){ console.error('[MD EventBus]', evt, e); } }); window.dispatchEvent(new CustomEvent(evt, {detail: data})); }
  };

  const AppState = {
    project: null,
    projectId: null,
    currentModule: 'config',
    isDirty: false,
    modules: {},
    palettes: [], // CRAM decoded to CSS
    init(projectData, projectId){
      this.project = projectData || this.createDefaultProject();
      this.projectId = projectId;
      this.palettes = this.decodePalettes(this.project.palettes);
      EventBus.emit('project:loaded', this.project);
    },
    createDefaultProject(){
      return {
        meta: { name: 'Novo Jogo MD', author: '', version: '0.1.0', region: 'U', sram: false },
        tiles: new Uint8Array(256*32), // 8192 bytes 4bpp
        palettes: [
          [0x000,0x00E,0x0E0,0xE00,0xEEE,0x222,0x444,0x888,0xAAA,0xFFF,0x0EE,0xEE0,0xE0E,0xA0A,0x0A0,0xA00],
          [0x000,0x00E,0x0E0,0xE00,0xEEE,0x222,0x444,0x888,0xAAA,0xFFF,0x0EE,0xEE0,0xE0E,0xA0A,0x0A0,0xA00],
          [0x000,0x00E,0x0E0,0xE00,0xEEE,0x222,0x444,0x888,0xAAA,0xFFF,0x0EE,0xEE0,0xE0E,0xA0A,0x0A0,0xA00],
          [0x000,0x00E,0x0E0,0xE00,0xEEE,0x222,0x444,0x888,0xAAA,0xFFF,0x0EE,0xEE0,0xE0E,0xA0A,0x0A0,0xA00]
        ],
        maps: [],
        sprites: [],
        audio: { tracks: [] },
        program: { main: '; 68k main\nmove.w #$2700,sr\nloop: bra loop' }
      };
    },
    decodePalettes(cramPalettes){
      // CRAM 0BBB0GGG0RRR -> CSS hex
      return (cramPalettes||[]).map(pal=> pal.map(cram=>{
        let r = (cram & 0x07);
        let g = (cram>>4) & 0x07;
        let b = (cram>>8) & 0x07;
        r = (r<<5)|(r<<2)|(r>>1);
        g = (g<<5)|(g<<2)|(g>>1);
        b = (b<<5)|(b<<2)|(b>>1);
        return `rgb(${r},${g},${b})`;
      }));
    },
    markDirty(){ this.isDirty=true; EventBus.emit('project:dirty', true); const el=document.querySelector('#save-status'); if(el) el.textContent='● não salvo'; },
    markClean(){ this.isDirty=false; EventBus.emit('project:clean', false); const el=document.querySelector('#save-status'); if(el) el.textContent='✔ salvo'; },
    registerModule(id, mod){ this.modules[id]=mod; EventBus.emit('module:registered', {id}); },
    switchModule(id){
      // V13 FIX - permite abrir mesmo se modulo ainda não registrado, para debug
      const actualId = id==='maps' && !this.modules[id] && this.modules['backgrounds'] ? 'backgrounds' : id;
      const moduleId = this.modules[id] ? id : actualId;
      if(!this.modules[moduleId]){ console.warn('[MDCore] modulo nao encontrado', id, 'tentando', moduleId, 'disponiveis:', Object.keys(this.modules)); }
      this.currentModule=moduleId;
      document.querySelectorAll('.module-btn').forEach(b=> b.classList.toggle('active', b.dataset.module===id || b.dataset.module===moduleId));
      document.querySelectorAll('.module-panel').forEach(p=> {
        const shouldShow = p.id===`panel-${id}` || p.id===`panel-${moduleId}`;
        p.style.display = shouldShow ? 'flex' : 'none';
        if(shouldShow) p.classList.add('active'); else p.classList.remove('active');
      });
      const mod = this.modules[moduleId];
      if(mod && mod.render) {
        try{ mod.render(); }catch(e){ console.error('[MDCore] render erro', moduleId, e); }
      }
      EventBus.emit('module:switch', {id:moduleId});
      try{ history.replaceState(null,'', `?project=${this.projectId}&module=${id}`); }catch{}
    },
    getProjectForSave(){
      const p = this.project ? JSON.parse(JSON.stringify(this.project)) : {};
      
      // V19 FIX: Salva tiles como array (seguro) + b64 chunked
      try{
        let chrData = null;
        if(this.modules.graphics && this.modules.graphics.data) chrData = this.modules.graphics.data;
        else if(window.MDGraphics && window.MDGraphics.data) chrData = window.MDGraphics.data;
        else if(window.MDGraphics && window.MDGraphics.chrData) chrData = window.MDGraphics.chrData;
        
        if(chrData){
          p.tiles = Array.from(chrData);
          // b64 chunked para evitar stack overflow do apply
          try{
            let binary = '';
            const chunkSize = 8192;
            for(let i=0;i<chrData.length;i+=chunkSize){
              const chunk = chrData.subarray ? chrData.subarray(i, i+chunkSize) : chrData.slice(i, i+chunkSize);
              binary += String.fromCharCode.apply(null, chunk);
            }
            p.tiles_b64 = btoa(binary);
            // Salva também no localStorage para fallback
            try{ localStorage.setItem('mdg_chrData', p.tiles_b64); }catch{}
          }catch(e){ console.warn('tiles_b64 encode fail', e); }
        }
      }catch(e){ console.error('tiles save', e); }
      
      // Metatiles
      try{
        if(this.project && this.project.metatiles && this.project.metatiles.length>0){
          p.metatiles = this.project.metatiles;
        }
        if(window.MDGraphics && window.MDGraphics.metatiles && window.MDGraphics.metatiles.length>0){
          p.metatiles = window.MDGraphics.metatiles;
        } else if(window.AppState && window.AppState.project && window.AppState.project.metatiles){
          p.metatiles = window.AppState.project.metatiles;
        }
        console.log('[MD Save] metatiles', p.metatiles ? p.metatiles.length : 0, 'tiles', p.tiles ? p.tiles.length : 0);
      }catch(e){ console.error('metatiles save', e); }
      
      if(this.modules.backgrounds && this.modules.backgrounds.data){
        p.backgrounds = this.modules.backgrounds.data;
      }
      if(this.modules.maps && this.modules.maps.data){
        p.backgrounds = this.modules.maps.data;
      }
      if(this.project && this.project.backgrounds && !p.backgrounds){
        p.backgrounds = this.project.backgrounds;
      }
      
      return p;
    }
  };

  // Tab manager compativel NES
  const TabManager = {
    open(id){ AppState.switchModule(id); }
  };

  window.MDCore = { EventBus, AppState, TabManager, on: EventBus.on.bind(EventBus), emit: EventBus.emit.bind(EventBus), registerModule: AppState.registerModule.bind(AppState) };
  window.AppState = AppState; // alias compat NES
  window.core = window.MDCore; // alias loader antigo
  window.MDProject = AppState; // alias antigo MD
  window.MDModules = {};

  // Auto-init quando editor.html carrega
  document.addEventListener('DOMContentLoaded', ()=>{
    const params = new URLSearchParams(location.search);
    const mod = params.get('module') || 'config';
    // delay para modulos se registrarem
    setTimeout(()=> AppState.switchModule(mod), 200);
  });

  console.log('[MDCore] core carregado - padrao NES');
})();

// V23 UNDO GLOBAL SHORTCUTS - volátil
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
    e.preventDefault();
    if(window.AppState){
      if(e.shiftKey) window.AppState.doRedo();
      else window.AppState.doUndo();
    }
  }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){
    e.preventDefault();
    if(window.AppState) window.AppState.doRedo();
  }
});

    this.updateUndoButtons = function(){
      try{
        document.querySelectorAll('#md-undo-btn, #bg-undo-btn').forEach(btn=>{
          btn.disabled = this.undoPointer <= 0;
          btn.style.opacity = this.undoPointer <= 0 ? '0.4' : '1';
          btn.title = `Desfazer (${this.undoPointer}/${this.undoStack.length-1}) - Ctrl+Z`;
        });
        document.querySelectorAll('#md-redo-btn, #bg-redo-btn').forEach(btn=>{
          btn.disabled = this.undoPointer >= this.undoStack.length - 1;
          btn.style.opacity = this.undoPointer >= this.undoStack.length - 1 ? '0.4' : '1';
          btn.title = `Refazer (${this.undoPointer+1}/${this.undoStack.length}) - Ctrl+Y`;
        });
      }catch(e){ console.warn('updateUndoButtons', e); }
    };

    // FIX: expõe métodos no window.AppState para botões chamarem - evita TypeError is not a function
    try{
      window.AppState = window.AppState || this;
      window.AppState.undoStack = this.undoStack;
      window.AppState.undoPointer = this.undoPointer;
      window.AppState.doUndo = this.doUndo.bind(this);
      window.AppState.doRedo = this.doRedo.bind(this);
      window.AppState.saveUndoState = this.saveUndoState.bind(this);
      window.AppState.updateUndoButtons = this.updateUndoButtons.bind(this);
      window.AppState.clearUndo = this.clearUndo.bind(this);
      window.AppState.applyUndoState = this.applyUndoState.bind(this);
      window.AppState.cloneModuleState = this.cloneModuleState.bind(this);
    }catch(e){ console.warn('bind AppState', e); }
