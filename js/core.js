// CORE v0.6.5 FINAL FIX TELA PRETA - Dashboard + Splash + Fill + Level Design
const NES_PALETTE = ["#666666","#002A88","#1412A7","#3B00A4","#5C007E","#6E0040","#6C0600","#561D00","#333500","#0B4800","#005200","#004F08","#00404D","#000000","#000000","#000000","#ADADAD","#155FD9","#4240FF","#7527FE","#A01ACC","#B71E7B","#B53120","#994E00","#6B6D00","#388700","#0C9300","#008F32","#007C8D","#000000","#000000","#000000","#FFFEFF","#64B0FF","#9290FF","#C676FF","#F36AFF","#FE6ECC","#FE8170","#EA9E22","#BCBE00","#88D800","#5CE430","#45E082","#48CDDE","#4F4F4F","#000000","#000000","#FFFEFF","#C0E0FF","#D3D2FF","#E8C8FF","#FBC2FF","#FEC2EB","#FECCC5","#F7D8A5","#E4E594","#CFEE96","#BDF4AB","#B3F3CC","#B5EBF2","#B8B8B8","#000000","#000000"];
const Project = {
  data: null,
  fileName: "sem-titulo.nms",
  status(msg){ const el=document.getElementById('projStatus'); if(el){ el.textContent="● "+msg; setTimeout(()=>el.textContent="● pronto",2000) } },
  defaultData(){
    return {
      version: "0.7.0",
      name: "Meu Jogo",
      author: "",
      description: "",
      genre: "platformer",
      mapper: 0,
      mirroring: "horizontal",
      scrollType: "static",
      created: Date.now(),
      palettes: [[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]],
      chr: Array.from(new Uint8Array(8192)),
      metatiles: [],
      backgrounds: [],
      splashScreens: [],
      phases: [{ id:'phase_1', name:'Fase 1 - Inicio', description:'Primeira fase', mapper:0, bank:0, gravity:'down', gravityStrength:4, scroll:'static', background:'', splash:'', created:Date.now() }],
      levels: [],
      characters: [],
      cheats: [],
      gameConfig: { lives: 3, continues: 3, energy: 16 },
      sounds: { song: [], baseFrames: 30, loop: true, asm: '' }
    }
  },
  async newProject(silent=false){
    if(!silent && !confirm("Criar novo projeto? Progresso não salvo será perdido.")) return;
    this.data = this.defaultData();
    this.fileName = "meu-jogo.nms";
    try{
      const resp = await fetch('assets/novo.chr');
      if(resp.ok){
        const buf = new Uint8Array(await resp.arrayBuffer());
        if(buf.length>=4096){
          this.data.chr = Array.from(buf.length>=8192?buf.slice(0,8192):(()=>{let n=new Uint8Array(8192); n.set(buf); return n;})());
        }
      }
    }catch(e){}
    this.loadIntoEditors();
    this.updateUI();
    this.status("novo projeto v0.6.5 FINAL");
  },
  loadIntoEditors(){
    const chrU8 = new Uint8Array(this.data.chr);
    CHR.loadBuffer(chrU8, this.data.palettes);
    if(this.data.metatiles) CHR.loadMetatiles(this.data.metatiles);
    if(this.data.backgrounds && typeof BG!=='undefined'){ try{ BG.loadBackgrounds(this.data.backgrounds); }catch(e){} }
    if(this.data.splashScreens && typeof BG!=='undefined'){ try{ BG.loadSplashScreens(this.data.splashScreens); }catch(e){} }
    if(this.data.phases && typeof DASHBOARD!=='undefined'){ try{ DASHBOARD.loadPhases(this.data.phases); }catch(e){} }
    if(this.data.sounds && typeof SOUND!=='undefined'){ try{ SOUND.loadData(this.data.sounds); }catch(e){} }
    if(typeof CHAR!=='undefined'){ try{ CHAR.loadData(); }catch(e){} }
    document.getElementById('projNameLabel').textContent = this.data.name;
    document.getElementById('projFileLabel').textContent = this.fileName;
    document.getElementById('infoCHR').textContent = (chrU8.length/1024)+"KB";
    document.getElementById('infoBanks').textContent = Math.ceil(chrU8.length/4096);
    const phEl=document.getElementById('infoPhases'); if(phEl) phEl.textContent = (this.data.phases?.length||0);
    const spEl=document.getElementById('infoSplash'); if(spEl) spEl.textContent = (this.data.splashScreens?.length||0);
  },
  updateUI(){
    const n=document.getElementById('projNameLabel'); if(n) n.textContent=this.data.name;
    const f=document.getElementById('projFileLabel'); if(f) f.textContent=this.fileName;
    const phEl=document.getElementById('infoPhases'); if(phEl) phEl.textContent=(this.data.phases?.length||0);
    const spEl=document.getElementById('infoSplash'); if(spEl) spEl.textContent=(this.data.splashScreens?.length||0);
  },
  save(){
    if(!this.data){ alert("Nenhum projeto"); return; }
    try{
      this.data.name = document.getElementById('dashProjName')?.value || this.data.name || "Meu Jogo";
      this.data.author = document.getElementById('dashAuthor')?.value || this.data.author || "";
      this.data.description = document.getElementById('dashDesc')?.value || this.data.description || "";
      this.data.genre = document.getElementById('dashGenre')?.value || this.data.genre || "platformer";
      this.data.mapper = parseInt(document.getElementById('dashMapper')?.value||0);
      this.data.mirroring = document.getElementById('dashMirror')?.value||"horizontal";
    }catch(e){}
    this.data.palettes = CHR.getPalettes();
    this.data.chr = Array.from(CHR.getBuffer());
    this.data.metatiles = CHR.getMetatiles ? CHR.getMetatiles() : (this.data.metatiles||[]);
    this.data.characters = typeof CHAR!=='undefined' ? (this.data.characters||[]) : (this.data.characters||[]);
    if(typeof BG!=='undefined'){
      try{
        if(BG.getBackgrounds){ const bgs = BG.getBackgrounds(); if(bgs) this.data.backgrounds = bgs; }
        if(BG.getSplashScreens){ const spl = BG.getSplashScreens(); if(spl) this.data.splashScreens = spl; }
      }catch(e){}
    }
    if(typeof DASHBOARD!=='undefined' && DASHBOARD.getPhases){ try{ this.data.phases = DASHBOARD.getPhases(); }catch(e){} }
    try{ if(typeof SOUND!=='undefined' && SOUND.getData){ const sData=SOUND.getData(); if(sData && sData.song) this.data.sounds = { ...sData, asm: document.getElementById('asm-output')?.value || '' }; } }catch(e){}
    this.data.savedAt = Date.now();
    this.data.version = "0.7.0";
    const blob = new Blob([JSON.stringify(this.data, null, 2)], {type:"application/json"});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = this.fileName.endsWith('.nms') ? this.fileName : this.fileName.replace('.json','') + ".nms";
    a.click(); localStorage.setItem('nms_autosave', JSON.stringify(this.data)); this.status(`salvo v0.6.5 FINAL - ${this.data.splashScreens?.length||0} splash`);
  },
  async loadFromFile(file){
    const text = await file.text();
    try{
      const json = JSON.parse(text);
      if(!json.chr || !json.palettes) throw "Arquivo .nms inválido";
      if(!json.metatiles) json.metatiles=[]; 
      if(!json.backgrounds) json.backgrounds=[];
      if(!json.splashScreens) json.splashScreens=[];
      if(!json.phases) json.phases=[{ id:'phase_1', name:'Fase 1', gravity:'down', mapper:0, bank:0, scroll:'static', background:'', splash:'' }];
      if(!json.levels) json.levels=[];
      if(!json.sounds) json.sounds={ song: [], baseFrames: 30, loop: true, asm: '' };
      if(!json.cheats) json.cheats=[];
      if(!json.characters) json.characters=[];
      if(!json.gameConfig) json.gameConfig={ lives:3, continues:3, energy:16 };
      this.data = json; this.fileName = file.name; this.loadIntoEditors(); this.updateUI(); this.status(`carregado v${json.version||'0.4'} - ${json.splashScreens.length} splash`);
      setTimeout(()=>{ try{ DASHBOARD.init(); }catch(e){} try{ BG.loadSplashScreens(json.splashScreens); }catch(e){} },300);
    }catch(e){ alert("Erro ao abrir .nms: "+e); }
  }
};
document.getElementById('openNMS')?.addEventListener('change', e=>{ const f=e.target.files[0]; if(f) Project.loadFromFile(f); });