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
      sounds: [],
      variables: [],
      rules: [],
    };
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
    const r = await fetch(APP('/a2600/backend/projects/load.php?id=' + encodeURIComponent(id)), {
      credentials: 'same-origin',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.message || 'Falha ao carregar projeto');

    const data = j.nms || j.agc || j.data || j.project;
    if (!data || typeof data !== 'object') throw new Error('Conteúdo inválido');

    this.projectId = id;
    this.data = Object.assign(this.defaultData(), data);
    this.data.system = 'A2600';
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
      const r = await fetch(APP('/a2600/backend/projects/save.php'), {
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
