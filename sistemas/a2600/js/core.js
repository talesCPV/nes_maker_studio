/**
 * AGC — core do projeto Atari 2600
 */
const Project = {
  projectId: null,
  fileName: null,
  data: null,

  defaultData() {
    return {
      version: '0.1.0',
      system: 'A2600',
      name: 'Novo Jogo Atari',
      author: '',
      description: '',
      romSize: 4096,
      tv: 'NTSC',
      kernel: 'single_screen',
      gameStyle: 'advanced',
      kernelProfile: 'free',
      profileOptions: {},
      created: Date.now(),
      screens: [
        {
          id: 'screen_' + Date.now(),
          name: 'Tela 1',
          description: '',
        },
      ],
      playfields: [],
      sprites: [],
      projectiles: {
        m0: { name: 'Missile 0', width: 1, height: 4 },
        m1: { name: 'Missile 1', width: 1, height: 4 },
        ball: { name: 'Ball', width: 1, height: 4 },
      },
      sounds: [],
      variables: [],
      rules: [],
      gameObjects: [],
      bands: [],
      scoreBar: {
        position: 'none', // none | top | bottom
        align: 'center', // left | center | right | both
        background: true, // faixa preta sob os dígitos
        lines: 16, // scanlines da faixa de placar
        digits: 6,
        variable: 'scoreP0',
        variable2: 'scoreP1', // se align=both
        logoAlways: true, // SEMPRE — inegociável na plataforma
        logoLines: 10,
        previewValue: 0,
        // legado
        enabled: false,
        showLogo: true,
      },
    };
  },


  /**
   * Variáveis nativas (reservadas) conforme setup global + estilo.
   * Chamado no load, no Config e no Program.
   * native: true → não apagar / não renomear no editor de programação.
   */
  syncNativeVariables() {
    if (!this.data) this.data = this.defaultData();
    if (!Array.isArray(this.data.variables)) this.data.variables = [];
    const d = this.data;
    const sb = d.scoreBar || {};
    const opts = d.profileOptions || {};
    const style = d.gameStyle || 'advanced';

    // logo sempre
    if (!d.scoreBar) d.scoreBar = {};
    d.scoreBar.logoAlways = true;
    d.scoreBar.showLogo = true;

    const want = []; // { name, type, note, value }

    // --- placar ---
    if (sb.position && sb.position !== 'none') {
      const align = sb.align || 'center';
      const twoPlayers = (sb.players | 0) === 2 || align === 'both';
      want.push({ name: 'scoreP0', type: 'byte', note: twoPlayers ? 'Placar jogador 1 (nativa)' : 'Placar (nativa)', value: 0 });
      if (twoPlayers) {
        want.push({ name: 'scoreP1', type: 'byte', note: 'Placar jogador 2 (nativa)', value: 0 });
      }
      d.scoreBar.variable = 'scoreP0';
      d.scoreBar.variable2 = 'scoreP1';
    }

    // --- river / racing scroll ---
    if (style === 'river_scroll' || style === 'racing') {
      const sp = opts.scrollSpeed || 'normal';
      const map = { slow: 1, normal: 2, fast: 3 };
      want.push({
        name: 'scrollSpeed',
        type: 'byte',
        note: 'Velocidade do scroll (1 lento · 2 normal · 3 rápido) — nativa',
        value: map[sp] != null ? map[sp] : 2,
      });
      if (opts.seedMode === 'fixed' || opts.seedMode === 'title_entropy' || style === 'river_scroll' || (style === 'racing' && opts.camera !== 'top')) {
        want.push({
          name: 'mapSeed',
          type: 'byte',
          note: 'Seed do mapa procedural (nativa)',
          value: opts.seedFixed != null ? opts.seedFixed | 0 : 42,
        });
      }
    }
    if (style === 'river_scroll' && opts.fuelEnabled !== false && opts.fuelEnabled !== 0 && opts.fuelEnabled !== '0') {
      want.push({
        name: 'fuel',
        type: 'byte',
        note: 'Combustível atual (nativa)',
        value: opts.fuelMax != null ? opts.fuelMax | 0 : 128,
      });
      want.push({
        name: 'fuelMax',
        type: 'byte',
        note: 'Combustível máximo (nativa)',
        value: opts.fuelMax != null ? opts.fuelMax | 0 : 128,
      });
    }

    // --- boxing ---
    if (style === 'boxing') {
      const em = opts.energyMax != null ? opts.energyMax | 0 : 32;
      want.push({ name: 'energyP0', type: 'byte', note: 'Energia lutador 1 (nativa)', value: em });
      want.push({ name: 'energyP1', type: 'byte', note: 'Energia lutador 2 (nativa)', value: em });
      want.push({ name: 'energyMax', type: 'byte', note: 'Energia máxima (nativa)', value: em });
      want.push({
        name: 'rounds',
        type: 'byte',
        note: 'Rounds da partida (nativa)',
        value: opts.rounds != null ? opts.rounds | 0 : 3,
      });
      if (opts.timerDigits !== false && opts.timerDigits !== 0 && opts.timerDigits !== '0') {
        want.push({
          name: 'timer',
          type: 'byte',
          note: 'Timer do round (nativa)',
          value: opts.timerStart != null ? opts.timerStart | 0 : 99,
        });
      }
    }

    const nativeNames = new Set(want.map((w) => w.name));
    // remove natives no longer needed
    d.variables = d.variables.filter((v) => {
      if (!v.native && !v.builtin) return true;
      // keep if still wanted
      return nativeNames.has(v.name);
    });
    // also remove non-native duplicates of reserved names (user-created with same name)
    const reserved = new Set([
      'scoreP0',
      'scoreP1',
      'score',
      'scrollSpeed',
      'mapSeed',
      'fuel',
      'fuelMax',
      'energyP0',
      'energyP1',
      'energyMax',
      'rounds',
      'timer',
    ]);
    // ensure each wanted native exists
    for (const w of want) {
      let v = d.variables.find((x) => x.name === w.name);
      if (!v) {
        d.variables.unshift({
          id: 'native_' + w.name,
          name: w.name,
          type: w.type || 'byte',
          note: w.note || '',
          value: w.value != null ? w.value : 0,
          native: true,
        });
      } else {
        v.native = true;
        v.note = w.note || v.note;
        if (v.type == null) v.type = w.type || 'byte';
        // update value from config defaults only if never touched? keep existing value
        if (v.value == null) v.value = w.value != null ? w.value : 0;
      }
    }
    // mark any leftover reserved-name user vars as native if in want
    d.variables.forEach((v) => {
      if (nativeNames.has(v.name)) v.native = true;
    });
    return d.variables;
  },

  status(msg) {
    const el = document.getElementById('projStatus');
    if (el) {
      el.textContent = msg ? '● ' + msg : '● pronto';
      el.style.color = msg && /erro|falha/i.test(msg) ? '#e74c3c' : '#27ae60';
    }
    const top = document.getElementById('topStatus');
    if (top) top.textContent = msg || '';
  },

  updateHeader() {
    const n = document.getElementById('projNameLabel');
    const f = document.getElementById('projFileLabel');
    if (n) n.textContent = (this.data && this.data.name) ? this.data.name : 'Sem projeto';
    if (f) {
      if (this.fileName) f.textContent = this.fileName;
      else if (this.projectId) f.textContent = 'projeto #' + this.projectId;
      else f.textContent = '—';
    }
    if (this.data && this.data.name) {
      document.title = this.data.name + ' — AGC';
    }
  },

  collect() {
    if (!this.data) this.data = this.defaultData();
    if (typeof CONFIG !== 'undefined' && CONFIG.flush) {
      try { CONFIG.flush(); } catch (e) { console.warn(e); }
    }
    if (typeof PLAYFIELD !== 'undefined' && PLAYFIELD.flush) {
      try { PLAYFIELD.flush(); } catch (e) { console.warn(e); }
    }
    if (typeof SPRITES !== 'undefined' && SPRITES.flush) {
      try { SPRITES.flush(); } catch (e) { console.warn(e); }
    }
    if (typeof SOUND !== 'undefined' && SOUND.flush) {
      try { SOUND.flush(); } catch (e) { console.warn(e); }
    }
    if (typeof PROGRAM !== 'undefined' && PROGRAM.flush) {
      try { PROGRAM.flush(); } catch (e) { console.warn(e); }
    }
    this.data.system = 'A2600';
    this.data.updated = Date.now();
    return this.data;
  },

  async loadFromServer(id) {
    const r = await fetch(APP('/sistemas/a2600/backend/projects/load.php?id=' + encodeURIComponent(id)), {
      credentials: 'same-origin',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.message || 'Falha ao carregar projeto');

    const data = j.nms || j.agc || j.data || j.project;
    if (!data || typeof data !== 'object') throw new Error('Conteúdo inválido');

    this.projectId = id;
    this.data = Object.assign(this.defaultData(), data);
    this.data.system = 'A2600';
    if (!this.data.gameStyle) this.data.gameStyle = 'advanced';
    if (!this.data.kernelProfile) this.data.kernelProfile = 'free';
    if (!this.data.profileOptions) this.data.profileOptions = {};
    if (!Array.isArray(this.data.screens) || !this.data.screens.length) {
      this.data.screens = this.defaultData().screens;
    }

    // nome do arquivo no backend (.agc)
    const fn =
      j.filename ||
      j.project?.filename ||
      (typeof data.filename === 'string' ? data.filename : null);
    if (fn) {
      this.fileName = fn.endsWith('.agc') ? fn : fn + '.agc';
    } else {
      this.fileName = 'project_' + id + '.agc';
    }

    this.updateHeader();
    this.status('pronto');
    return this.data;
  },

  async save() {
    if (!this.projectId) {
      alert('Nenhum projeto carregado. Abra pelo dashboard Atari.');
      return false;
    }
    const nms = this.collect();
    this.status('salvando...');
    try {
      const r = await fetch(APP('/sistemas/a2600/backend/projects/save.php'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ project_id: this.projectId, nms }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) {
        const msg = j.message || j.detail || 'Erro ao salvar';
        this.status('erro ao salvar');
        alert(msg);
        return false;
      }
      if (j.filename) {
        this.fileName = j.filename.endsWith('.agc') ? j.filename : j.filename + '.agc';
      }
      this.updateHeader();
      this.status('salvo');
      return true;
    } catch (e) {
      this.status('erro ao salvar');
      alert(String(e.message || e));
      return false;
    }
  },
};

window.Project = Project;
