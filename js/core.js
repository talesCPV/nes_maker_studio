// CORE v0.7.1 - Sound library v3 (songs+SFX) + Mirroring por fase
const NES_PALETTE = ["#666666","#002A88","#1412A7","#3B00A4","#5C007E","#6E0040","#6C0600","#561D00","#333500","#0B4800","#005200","#004F08","#00404D","#000000","#000000","#000000","#ADADAD","#155FD9","#4240FF","#7527FE","#A01ACC","#B71E7B","#B53120","#994E00","#6B6D00","#388700","#0C9300","#008F32","#007C8D","#000000","#000000","#000000","#FFFEFF","#64B0FF","#9290FF","#C676FF","#F36AFF","#FE6ECC","#FE8170","#EA9E22","#BCBE00","#88D800","#5CE430","#45E082","#48CDDE","#4F4F4F","#000000","#000000","#FFFEFF","#C0E0FF","#D3D2FF","#E8C8FF","#FBC2FF","#FEC2EB","#FECCC5","#F7D8A5","#E4E594","#CFEE96","#BDF4AB","#B3F3CC","#B5EBF2","#B8B8B8","#000000","#000000"];
const Project = {
  data: null,
  projectId: null,
  serverSaved: false,
  fileName: "sem-titulo.nms",
  status(msg){
    const el = document.getElementById('projStatus');
    if(el){ el.textContent = "● " + msg; setTimeout(()=>el.textContent = "● pronto", 2000); }
  },
  defaultSounds(){
    return {
      version: 3,
      activeId: 'song_1',
      items: [
        {
          id: 'song_1',
          type: 'song',
          name: 'Musica 1',
          loop: true,
          baseFrames: 30,
          channels: [
            {
              id: 'ch_pulse1',
              type: 'pulse1',
              muted: false,
              notes: [{ note: 'C4', figure: 'quarter' }]
            }
          ]
        }
      ],
      asm: ''
    };
  },
  defaultData(){
    return {
      version: "0.7.1",
      name: "Meu Jogo",
      author: "",
      description: "",
      genre: "platformer",
      mapper: 0,
      // mirroring global legado — nao e mais a fonte da verdade
      // (mirroring agora vive em cada fase, derivado do scroll)
      mirroring: "vertical",
      scrollType: "static",
      created: Date.now(),
      palettes: [[15,0,16,48],[15,6,22,38],[15,10,26,42],[15,2,18,34],[15,22,48,15],[15,25,41,57],[15,3,19,35],[15,9,25,41]],
      paletteBank: [
        { id:'pal_1', name:'BG0', colors:[15,0,16,48] },
        { id:'pal_2', name:'BG1', colors:[15,6,22,38] },
        { id:'pal_3', name:'BG2', colors:[15,10,26,42] },
        { id:'pal_4', name:'BG3', colors:[15,2,18,34] },
        { id:'pal_5', name:'SPR0', colors:[15,22,48,15] },
        { id:'pal_6', name:'SPR1', colors:[15,25,41,57] },
        { id:'pal_7', name:'SPR2', colors:[15,3,19,35] },
        { id:'pal_8', name:'SPR3', colors:[15,9,25,41] }
      ],
      paletteActive: ['pal_1','pal_2','pal_3','pal_4','pal_5','pal_6','pal_7','pal_8'],
      chr: Array.from(new Uint8Array(8192)),
      metatiles: [],
      backgrounds: [],
      splashScreens: [],
      phases: [{
        id: 'phase_1',
        name: 'Fase 1 - Inicio',
        description: 'Primeira fase',
        mapper: 0,
        bank: 0,
        gravity: 'down',
        gravityStrength: 4,
        scroll: 'static',
        mirroring: 'vertical',
        background: '',
        splash: '',
        levelMap: null,
        created: Date.now()
      }],
      characters: [],
      cheats: [],
      variables: [],
      events: [
        { id:'ev_up', name:'Cima', category:'input', builtin:true },
        { id:'ev_down', name:'Baixo', category:'input', builtin:true },
        { id:'ev_left', name:'Esquerda', category:'input', builtin:true },
        { id:'ev_right', name:'Direita', category:'input', builtin:true },
        { id:'ev_a', name:'Botão A', category:'input', builtin:true },
        { id:'ev_b', name:'Botão B', category:'input', builtin:true },
        { id:'ev_start', name:'Start', category:'input', builtin:true },
        { id:'ev_select', name:'Select', category:'input', builtin:true },
        { id:'ev_p1_idle', name:'P1 Idle', category:'input', button:'P1-IDLE', builtin:true },
        { id:'ev_p2_idle', name:'P2 Idle', category:'input', button:'P2-IDLE', builtin:true }
      ],
      // A categoria 'hitbox' em Eventos foi substituída pelo passo dedicado "Se hitbox"
      // em Regras (permite dizer QUAL hitbox toca QUAL, não só "algum hitbox de dano tocou").
      rules: [],
      hitboxObjects: [],
      hitboxInstances: [], // spawns colocados (level-design / backgrounds): {id,screenId,characterId,x,y,hitboxObjectId}
      menus: [],
      // Tabelas de força de pulo/velocidade - o usuário monta níveis nomeados aqui (ex:
      // "Pulo Fraco"=20, "Pulo Forte"=40) e vincula cada personagem a um nível padrão em
      // Personagens; Regras pode trocar o nível em tempo real (power-up), via Ação.
      jumpForces: [],
      speedLevels: [],
      gameConfig: { lives: 3, continues: 3, energy: 16 },
      // Pool de instâncias em memória (player + inimigos + itens + tiros compartilham a
      // mesma estrutura de slot). Reservado no início da zero page - ver Programação > Variáveis.
      maxInstances: 10,
      sounds: this.defaultSounds()
    };
  },
  // Normaliza sounds para o formato v3 (biblioteca de musicas + SFX).
  // v2 (channels no root) vira 1 item. Formato antigo (song[]) e descartado.
  normalizeSounds(raw){
    // v3 completo
    if(raw && raw.version === 3 && Array.isArray(raw.items) && raw.items.length > 0){
      return {
        version: 3,
        activeId: raw.activeId || raw.items[0].id,
        items: raw.items,
        asm: raw.asm || ''
      };
    }
    // v2 single-song → promove para biblioteca com 1 item
    if(raw && raw.version === 2 && Array.isArray(raw.channels) && raw.channels.length > 0){
      const id = 'song_1';
      return {
        version: 3,
        activeId: id,
        items: [{
          id,
          type: 'song',
          name: 'Musica 1',
          loop: raw.loop !== false,
          baseFrames: raw.baseFrames || 30,
          channels: raw.channels
        }],
        asm: raw.asm || ''
      };
    }
    // Qualquer coisa antiga ou invalida → biblioteca limpa
    return this.defaultSounds();
  },
  // Carimba os tiles utilitários padrão nos 4 últimos slots da pg1 (índices 508-511):
  // 508 = cursor (triângulo apontando pra direita, cor índice 3), 509/510/511 = preenchimento
  // sólido cor índice 1/2/3 (útil pra "pintar" céu/grama direto no background sem metatile).
  // Só entra em projeto NOVO - nunca sobrescreve um .nms carregado que já tenha algo ali.
  // O usuário pode editar/trocar isso à vontade no CHR Editor depois, não é travado.
  stampDefaultUtilityTiles(chrArr){
    const rowCounts = [1,2,3,4,4,3,2,1];
    const cursorRow = rowCounts.map(c => c===0 ? 0 : (0xFF << (8-c)) & 0xFF);
    const writeTile = (idx, plane0, plane1) => {
      const off = idx*16;
      if(off+16 > chrArr.length) return;
      for(let i=0;i<8;i++){ chrArr[off+i] = plane0[i]; chrArr[off+8+i] = plane1[i]; }
    };
    const solid = v => new Array(8).fill(v);
    writeTile(508, cursorRow, cursorRow);           // cursor (▶), cor índice 3
    writeTile(509, solid(0xFF), solid(0x00));        // fill cor índice 1
    writeTile(510, solid(0x00), solid(0xFF));        // fill cor índice 2
    writeTile(511, solid(0xFF), solid(0xFF));        // fill cor índice 3
  },
  async newProject(silent=false){
    if(!silent && !confirm("Criar novo projeto? Progresso não salvo será perdido.")) return;
    this.data = this.defaultData();
    this.fileName = "meu-jogo.nms";
    this.projectId = null;
    this.serverSaved = false;

    // Novo projeto: carrega assets/novo.chr de forma explícita (force),
    // depois carimba os tiles utilitários em cima.
    if(typeof CHR !== 'undefined'){
      try {
        if(CHR.setSuppressDefaultChr) CHR.setSuppressDefaultChr(false);
        if(typeof CHR.loadDefaultCHR === 'function'){
          await CHR.loadDefaultCHR(true);
          this.data.chr = Array.from(CHR.getBuffer());
        }
      } catch(e) {
        console.log('Falha ao carregar novo.chr no novo projeto:', e);
      }
    }

    this.stampDefaultUtilityTiles(this.data.chr);
    this.loadIntoEditors();
    this.updateUI();
    this.status("novo projeto v0.7.1");
    if(typeof UI !== 'undefined' && UI.switchModule) UI.switchModule('dashboard');
  },
  loadIntoEditors(){
    const chrU8 = new Uint8Array(this.data.chr);
    if(typeof CHR !== 'undefined'){
      CHR.loadBuffer(chrU8, this.data.palettes, {
        paletteBank: this.data.paletteBank,
        paletteActive: this.data.paletteActive
      });
      if(this.data.metatiles) CHR.loadMetatiles(this.data.metatiles);
    }
    if(this.data.backgrounds && typeof BG !== 'undefined'){
      try{ BG.loadBackgrounds(this.data.backgrounds); }catch(e){}
    }
    if(this.data.splashScreens && typeof BG !== 'undefined'){
      try{ BG.loadSplashScreens(this.data.splashScreens); }catch(e){}
    }
    if(this.data.phases && typeof DASHBOARD !== 'undefined'){
      try{ DASHBOARD.loadPhases(this.data.phases); }catch(e){}
    }
    // Sound v2
    this.data.sounds = this.normalizeSounds(this.data.sounds);
    if(typeof SOUND !== 'undefined'){
      try{ SOUND.loadData(this.data.sounds); }catch(e){}
    }
    if(typeof CHAR !== 'undefined'){
      try{ CHAR.loadData(); }catch(e){}
    }
    document.getElementById('projNameLabel').textContent = this.data.name;
    document.getElementById('projFileLabel').textContent = this.fileName;
    document.getElementById('infoCHR').textContent = (chrU8.length/1024) + "KB";
    document.getElementById('infoBanks').textContent = Math.ceil(chrU8.length/4096);
    const phEl = document.getElementById('infoPhases');
    if(phEl) phEl.textContent = (this.data.phases?.length || 0);
    const spEl = document.getElementById('infoSplash');
    if(spEl) spEl.textContent = (this.data.splashScreens?.length || 0);
  },
  updateUI(){
    const n = document.getElementById('projNameLabel');
    if(n) n.textContent = this.data.name;
    const f = document.getElementById('projFileLabel');
    if(f) f.textContent = this.fileName;
    const phEl = document.getElementById('infoPhases');
    if(phEl) phEl.textContent = (this.data.phases?.length || 0);
    const spEl = document.getElementById('infoSplash');
    if(spEl) spEl.textContent = (this.data.splashScreens?.length || 0);
  },
  /**
   * Sincroniza o estado dos editores em this.data
   * (sem gravar em lugar nenhum).
   */
  collectProjectData(){
    if(!this.data) return null;
    try{
      this.data.name = document.getElementById('dashProjName')?.value || this.data.name || "Meu Jogo";
      this.data.author = document.getElementById('dashAuthor')?.value || this.data.author || "";
      this.data.description = document.getElementById('dashDesc')?.value || this.data.description || "";
      this.data.genre = document.getElementById('dashGenre')?.value || this.data.genre || "platformer";
      this.data.mapper = parseInt(document.getElementById('dashMapper')?.value || 0);
      // mirroring global nao e mais editavel no dashboard — mantemos um valor
      // derivado da primeira fase so para compat de leitura antiga
      if(this.data.phases && this.data.phases[0] && this.data.phases[0].mirroring){
        this.data.mirroring = this.data.phases[0].mirroring;
      }
    }catch(e){}
    if(typeof CHR !== 'undefined'){
      this.data.palettes = CHR.getPalettes();
      this.data.chr = Array.from(CHR.getBuffer());
      this.data.metatiles = CHR.getMetatiles ? CHR.getMetatiles() : (this.data.metatiles || []);
      if(CHR.getPaletteBank) this.data.paletteBank = CHR.getPaletteBank();
      if(CHR.getPaletteActive) this.data.paletteActive = CHR.getPaletteActive();
    }
    this.data.characters = typeof CHAR !== 'undefined' ? (this.data.characters || []) : (this.data.characters || []);
    if(typeof BG !== 'undefined'){
      try{
        if(BG.getBackgrounds){ const bgs = BG.getBackgrounds(); if(bgs) this.data.backgrounds = bgs; }
        if(BG.getSplashScreens){ const spl = BG.getSplashScreens(); if(spl) this.data.splashScreens = spl; }
      }catch(e){}
    }
    if(typeof DASHBOARD !== 'undefined' && DASHBOARD.getPhases){
      try{ this.data.phases = DASHBOARD.getPhases(); }catch(e){}
    }
    // Sound v3 — biblioteca de musicas + SFX
    try{
      if(typeof SOUND !== 'undefined' && SOUND.getData){
        const sData = SOUND.getData();
        if(sData && Array.isArray(sData.items)){
          this.data.sounds = {
            version: 3,
            activeId: sData.activeId,
            items: sData.items,
            asm: document.getElementById('asm-output')?.value || ''
          };
        } else {
          this.data.sounds = this.normalizeSounds(this.data.sounds);
        }
      } else {
        this.data.sounds = this.normalizeSounds(this.data.sounds);
      }
    }catch(e){
      this.data.sounds = this.normalizeSounds(this.data.sounds);
    }
    this.data.savedAt = Date.now();
    this.data.version = "0.7.1";
    return this.data;
  },

  /**
   * Cria um projeto vazio no backend (template) e devolve o id.
   * parentProjectId opcional → grava parent_project_id (fork).
   */
  async createProjectOnBackend(name, description, parentProjectId){
    const body = {
      name: name || 'Meu Jogo',
      description: description || ''
    };
    if(parentProjectId){
      body.parent_project_id = parentProjectId;
    }
    const response = await fetch('backend/projects/create.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data.success){
      const err = new Error(data.message || 'Não foi possível criar o projeto no servidor.');
      err.status = response.status;
      err.payload = data;
      throw err;
    }
    return data.project;
  },

  /**
   * Envia thumbnail PNG (data URL) para o backend.
   * O servidor só grava se ainda não existir arquivo.
   */
  async uploadThumbnailIfMissing(dataUrl){
    if(!this.projectId || !dataUrl) return { skipped: true };
    try {
      const response = await fetch('backend/projects/thumbnail.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          project_id: this.projectId,
          image: dataUrl
        })
      });
      const data = await response.json().catch(() => ({}));
      return data;
    } catch(e) {
      console.warn('Falha ao enviar thumbnail:', e);
      return { success: false, message: String(e) };
    }
  },

  /**
   * Sobrescreve o .nms de um projeto existente no backend.
   */
  async saveProjectToBackend(projectId, nms){
    const response = await fetch('backend/projects/save.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        project_id: projectId,
        nms: nms
      })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok || !data.success){
      const err = new Error(data.message || 'Não foi possível salvar o projeto no servidor.');
      err.status = response.status;
      err.payload = data;
      throw err;
    }
    return data;
  },

  /**
   * Salva no backend.
   * - Com projectId: sobrescreve o arquivo.
   * - Sem projectId: pede nome, cria no backend e grava o NMS atual.
   */
  async save(){
    if(!this.data){ alert("Nenhum projeto"); return false; }

    const nms = this.collectProjectData();
    if(!nms){ alert("Nenhum projeto"); return false; }

    // Sem id: precisa criar o projeto no servidor primeiro
    if(!this.projectId){
      const suggested = (nms.name || 'Meu Jogo').trim() || 'Meu Jogo';
      const name = prompt('Nome do projeto para salvar no servidor:', suggested);
      if(name === null) return false; // cancelou
      const trimmed = name.trim();
      if(!trimmed){
        alert('Informe um nome para o projeto.');
        return false;
      }
      nms.name = trimmed;
      this.data.name = trimmed;
      this.updateUI();

      this.status('criando projeto no servidor...');
      try {
        const project = await this.createProjectOnBackend(
          trimmed,
          nms.description || ''
        );
        this.projectId = parseInt(project.id, 10) || null;
        try {
          if (this.projectId) {
            sessionStorage.setItem('nms_active_project', String(this.projectId));
            const url = new URL(window.location.href);
            url.searchParams.set('project', String(this.projectId));
            window.history.replaceState({}, document.title, url.pathname + url.search);
          }
        } catch(e) {}
        if(project.filename){
          this.fileName = project.filename.endsWith('.nms')
            ? project.filename
            : `${project.filename}.nms`;
        }
      } catch(e) {
        console.error('Erro ao criar projeto:', e);
        if(e.status === 401 || e.status === 403){
          alert('Sessão expirada ou não autenticado. Faça login no dashboard e tente novamente.');
        } else {
          alert(e.message || 'Erro ao criar projeto no servidor.');
        }
        this.status('erro ao criar');
        return false;
      }
    }

    if(!this.projectId){
      alert('ID de projeto inválido após criação.');
      return false;
    }

    this.status('salvando no servidor...');
    try {
      await this.saveProjectToBackend(this.projectId, nms);
      this.serverSaved = true;
      try {
        localStorage.setItem('nms_autosave', JSON.stringify(nms));
        sessionStorage.setItem('nms_active_project', String(this.projectId));
        const url = new URL(window.location.href);
        url.searchParams.set('project', String(this.projectId));
        window.history.replaceState({}, document.title, url.pathname + url.search);
      } catch(e) {}
      const itemCount = nms.sounds?.items?.length || 0;
      this.status(
        `salvo no servidor (#${this.projectId}) - ` +
        `${nms.splashScreens?.length||0} splash • ${itemCount} peça(s) de som`
      );
      this.updateUI();
      return true;
    } catch(e) {
      console.error('Erro ao salvar projeto:', e);
      if(e.status === 401 || e.status === 403){
        alert('Sessão expirada ou não autenticado. Faça login no dashboard e tente novamente.');
      } else {
        alert(e.message || 'Erro ao salvar no servidor.');
      }
      this.status('erro ao salvar');
      return false;
    }
  },

  /**
   * Fork = "Salvar como…": cria um NOVO projeto no backend
   * com o NMS atual e passa o editor a apontar para ele.
   * O projeto original (se houver) permanece intacto.
   */
  async fork(){
    if(!this.data){ alert("Nenhum projeto"); return false; }

    const nms = this.collectProjectData();
    if(!nms){ alert("Nenhum projeto"); return false; }

    const baseName = (nms.name || 'Meu Jogo').trim() || 'Meu Jogo';
    const suggested = baseName.startsWith('Cópia de ')
      ? baseName
      : `Cópia de ${baseName}`;
    const name = prompt('Nome do fork (novo projeto):', suggested);
    if(name === null) return false;
    const trimmed = name.trim();
    if(!trimmed){
      alert('Informe um nome para o fork.');
      return false;
    }

    nms.name = trimmed;

    this.status('criando fork no servidor...');
    try {
      // Origem do fork = projeto atual no servidor (se houver)
      const parentId = this.projectId || null;
      const project = await this.createProjectOnBackend(
        trimmed,
        nms.description || '',
        parentId
      );
      const newId = parseInt(project.id, 10) || null;
      if(!newId){
        alert('Servidor não retornou ID do novo projeto.');
        this.status('erro no fork');
        return false;
      }

      await this.saveProjectToBackend(newId, nms);

      // Passa a editar o fork
      this.projectId = newId;
      this.serverSaved = true;
      this.data.name = trimmed;
      if(project.filename){
        this.fileName = project.filename.endsWith('.nms')
          ? project.filename
          : `${project.filename}.nms`;
      } else {
        this.fileName = `project_${newId}.nms`;
      }

      try {
        localStorage.setItem('nms_autosave', JSON.stringify(nms));
        sessionStorage.setItem('nms_active_project', String(newId));
        const url = new URL(window.location.href);
        url.searchParams.set('project', String(newId));
        window.history.replaceState({}, document.title, url.pathname + url.search);
      } catch(e) {}

      // Atualiza campo do dashboard do editor, se existir
      try {
        const nameEl = document.getElementById('dashProjName');
        if(nameEl) nameEl.value = trimmed;
      } catch(e) {}

      this.updateUI();
      this.status(`fork criado (#${newId}) — editando a cópia`);
      return true;
    } catch(e) {
      console.error('Erro ao fazer fork:', e);
      if(e.status === 401 || e.status === 403){
        alert('Sessão expirada ou não autenticado. Faça login no dashboard e tente novamente.');
      } else {
        alert(e.message || 'Erro ao criar o fork no servidor.');
      }
      this.status('erro no fork');
      return false;
    }
  },

  async loadFromFile(file){
    const text = await file.text();
  
    try{
      const json = JSON.parse(text);
  
      if(!json.chr || !json.palettes)
        throw "Arquivo .nms inválido";
  
      if(!json.metatiles)
        json.metatiles = [];
  
      if(!json.backgrounds)
        json.backgrounds = [];
  
      if(!json.splashScreens)
        json.splashScreens = [];
  
      if(!json.phases){
        json.phases = [{
          id: 'phase_1',
          name: 'Fase 1',
          gravity: 'down',
          mapper: 0,
          bank: 0,
          scroll: 'static',
          mirroring: 'vertical',
          background: '',
          splash: '',
          levelMap: null
        }];
      }
  
      // Migração level-design: levels[] solto → phase.levelMap
      if(json.levels && json.levels.length){
        json.levels.forEach(lvl=>{
          const phase =
            json.phases.find(p => p.name === lvl.name);
  
          if(phase){
            const { name, ...mapData } = lvl;
            phase.levelMap = mapData;
          }
        });
      }
  
      delete json.levels;
  
      json.phases.forEach(p=>{
  
        if(p.levelMap === undefined)
          p.levelMap = null;
  
        if(p.scroll === 'free')
          p.scroll = 'static';
  
        if(!p.scroll)
          p.scroll = 'static';
  
        if(p.bank === undefined || p.bank === null)
          p.bank = 0;
  
        // Mirroring por fase
        if(!p.mirroring){
  
          if(p.scroll === 'scroll_v')
            p.mirroring = 'horizontal';
  
          else if(p.scroll === 'scroll_h')
            p.mirroring = 'vertical';
  
          else
            p.mirroring =
              json.mirroring || 'vertical';
        }
      });
  
      // Sound
      json.sounds =
        this.normalizeSounds(json.sounds);
  
      if(!json.cheats)
        json.cheats = [];
  
      if(!json.characters)
        json.characters = [];
  
      if(!json.gameConfig)
        json.gameConfig = {
          lives: 3,
          continues: 3,
          energy: 16
        };
  
      if(!json.variables)
        json.variables = [];
  
      if(!json.events)
        json.events = this.defaultData().events;
  
      if(!json.rules)
        json.rules = [];
  
      if(!json.hitboxObjects)
        json.hitboxObjects = [];
  
      if(!json.hitboxInstances)
        json.hitboxInstances = [];
  
      if(!json.menus)
        json.menus = [];
  
      if(!json.jumpForces)
        json.jumpForces = [];
  
      if(!json.speedLevels)
        json.speedLevels = [];
  
      // Garante eventos nativos P1-IDLE / P2-IDLE
      const ensureIdle =
        (id, name, button) => {
  
          if(!(json.events || []).some(
            e => e.id === id || e.button === button
          )){
            json.events.push({
              id,
              name,
              category: 'input',
              button,
              builtin: true
            });
          }
        };
  
      ensureIdle(
        'ev_p1_idle',
        'P1 Idle',
        'P1-IDLE'
      );
  
      ensureIdle(
        'ev_p2_idle',
        'P2 Idle',
        'P2-IDLE'
      );
  
      // Migração de hitbox
      const hitboxEventIds =
        new Set(
          (json.events || [])
            .filter(e => e.category === 'hitbox')
            .map(e => e.id)
        );
  
      if(hitboxEventIds.size > 0){
  
        (json.rules || []).forEach(r=>{
  
          (r.steps || []).forEach(s=>{
  
            if(
              s.type === 'if_event' &&
              hitboxEventIds.has(s.eventId)
            ){
              s.type = 'if_hitbox';
              s.hitboxA = '';
              s.hitboxB = '';
              delete s.eventId;
            }
  
          });
  
        });
  
        json.events =
          (json.events || [])
            .filter(e => e.category !== 'hitbox');
      }
  
      if(json.maxInstances == null)
        json.maxInstances = 10;
  
      json.maxInstances =
        Math.max(
          1,
          Math.min(
            20,
            parseInt(json.maxInstances) || 10
          )
        );
  
      /*
       * IMPORTANTE:
       *
       * A partir daqui o projeto já está
       * completamente reconstruído.
       *
       * O CHR vem exclusivamente do JSON.
       *
       * Não existe nenhum carregamento de
       * assets/novo.chr aqui.
       *
       * Import local (.nms do disco) não tem
       * projectId no servidor — quem carrega
       * do backend redefine projectId depois.
       */
  
      this.data = json;
      this.fileName = file.name;
      this.projectId = null;
      this.serverSaved = false;
  
      this.loadIntoEditors();
      this.updateUI();
  
      const itemCount =
        this.data.sounds?.items?.length || 0;
  
      this.status(
        `carregado v${json.version || '0.4'} - ` +
        `${json.splashScreens.length} splash • ` +
        `${itemCount} peca(s) de som`
      );
  
      setTimeout(()=>{
  
        try{
          BG.loadSplashScreens(
            json.splashScreens
          );
        }catch(e){}
  
        if(
          typeof UI !== 'undefined' &&
          UI.switchModule
        ){
          UI.switchModule('dashboard');
        }
        else{
          try{
            DASHBOARD.init();
          }catch(e){}
        }
  
      }, 300);
  
    }catch(e){
  
      alert(
        "Erro ao abrir .nms: " + e
      );
  
    }
  },
  async loadProjectFromBackend(projectId) {

    this.projectId = parseInt(projectId, 10) || null;

    if(!this.projectId){
      alert('ID de projeto inválido.');
      return false;
    }

    // Bloqueia assets/novo.chr o quanto antes (evita corrida com CHR.init).
    try {
      if(typeof CHR !== 'undefined' && CHR.setSuppressDefaultChr)
        CHR.setSuppressDefaultChr(true);
    } catch(e) {}

    try {
  
      const response =
        await fetch(
          `backend/projects/load.php?id=${encodeURIComponent(projectId)}`,
          {
            method: 'GET',
            credentials: 'same-origin'
          }
        );
  
  
      const data =
        await response.json();
  
  
      if (
        !response.ok ||
        !data.success
      ) {
  
        alert(
          data.message ||
          'Não foi possível carregar o projeto.'
        );
  
        return false;
      }
  
  
      const nmsData =
        data.nms;
  
  
      if (!nmsData) {
  
        alert(
          'O servidor não retornou o conteúdo NMS do projeto.'
        );
  
        return false;
      }
  
  
      /*
       * O backend entrega o NMS completo.
       *
       * NÃO usamos:
       *
       *   assets/novo.chr
       *   template
       *   newProject()
       *
       * O CHR vem exclusivamente do projeto.
       */
  
      const nmsText =
        typeof nmsData === 'string'
          ? nmsData
          : JSON.stringify(nmsData);
  
  
      const fileName =
        data.project?.filename ||
        'projeto.nms';
  
  
      const file =
        new File(
          [nmsText],
          fileName.endsWith('.nms')
            ? fileName
            : `${fileName}.nms`,
          {
            type: 'application/json'
          }
        );
  
  
      /*
       * Carrega exatamente pelo mesmo
       * caminho usado para abrir um .nms
       * localmente.
       *
       * loadFromFile zera projectId (import
       * local); restauramos o id do backend
       * em seguida.
       */
  
      const backendProjectId = this.projectId;
  
      await this.loadFromFile(file);
  
      this.projectId = backendProjectId;
      this.serverSaved = true;
  
      if(data.project?.filename){
        this.fileName = data.project.filename.endsWith('.nms')
          ? data.project.filename
          : `${data.project.filename}.nms`;
      }
  
      this.updateUI();

      // Mantém ?project=ID na URL e no sessionStorage
      // para o refresh reabrir o mesmo projeto.
      try {
        if (this.projectId) {
          sessionStorage.setItem('nms_active_project', String(this.projectId));
          const url = new URL(window.location.href);
          url.searchParams.set('project', String(this.projectId));
          window.history.replaceState({}, document.title, url.pathname + url.search);
        }
      } catch(e) {}
  
      return true;
  
  
    } catch(error) {
  
      console.error(
        'Erro ao carregar projeto do backend:',
        error
      );
  
  
      alert(
        'Erro ao carregar o projeto: ' +
        (error.message || error)
      );
  
  
      return false;
    }
  
  }


};
document.getElementById('openNMS')?.addEventListener('change', e=>{
  const f = e.target.files[0];
  if(f) Project.loadFromFile(f);
});

