(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const projectId = params.get('id') || params.get('project');

  const modules = [
    ['config', 'Configurações'],
    ['graphics', 'Gráficos / Tiles'],
    ['maps', 'Mapas'],
    ['sprites', 'Sprites'],
    ['audio', 'Áudio'],
    ['code', 'Programação'],
    ['build', 'Build ROM']
  ];

  const menu = document.querySelectorAll('.side-item[data-mod]');
  let project = null;
  let currentModule = 'config';

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[m]));
  }

  function status(text, ok) {
    const el = document.getElementById('projStatus');
    if (!el) return;
    el.textContent = '● ' + text;
    el.style.color = ok === false ? '#d85b6a' : '#27ae60';
  }

  function updateHeader() {
    const name = document.getElementById('projNameLabel');
    const file = document.getElementById('projFileLabel');
    if (name) name.textContent = project?.name || 'Sem projeto';
    if (file) file.textContent = project ? (project.file_name || project.fileName || ((project.name || 'projeto') + '.mdg')) : '—';
  }

  function refreshFooter() {
    const d = project || {};
    const cpu = document.getElementById('infoCpu');
    const video = document.getElementById('infoVideo');
    const rom = document.getElementById('infoRom');
    if (cpu) cpu.textContent = d.cpu || '68000';
    if (video) video.textContent = d.video || 'VDP';
    if (rom) {
      const n = Number(d.romSize || d.rom_size || 0);
      rom.textContent = n > 0 ? ((n / 1024) | 0) + ' KB' : '—';
    }
  }

  function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const btn = document.getElementById('btnSideToggle');
    const collapsed = sb.classList.toggle('collapsed');
    try { localStorage.setItem('mdg_sidebar_collapsed', collapsed ? '1' : '0'); } catch (e) {}
    if (btn) {
      btn.textContent = collapsed ? '»' : '«';
      btn.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    }
  }

  function restoreSidebar() {
    try {
      if (localStorage.getItem('mdg_sidebar_collapsed') === '1') {
        const sb = document.getElementById('sidebar');
        const btn = document.getElementById('btnSideToggle');
        if (sb) sb.classList.add('collapsed');
        if (btn) { btn.textContent = '»'; btn.title = 'Expandir menu'; }
      }
    } catch (e) {}
  }

  async function openModule(name) {
    const item = document.querySelector('.side-item[data-mod="' + name + '"]');
    if (!item || item.classList.contains('disabled')) return;

    document.querySelectorAll('.side-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.module').forEach(el => el.classList.remove('active'));
    item.classList.add('active');

    const panel = document.getElementById('mod-' + name);
    if (!panel) return;
    panel.classList.add('active');
    currentModule = name;

    try {
      const mod = await import('./modules/' + name + '.js');
      panel.innerHTML = typeof mod.render === 'function'
        ? mod.render(project)
        : '<div class="panel"><h2>' + esc(modules.find(m => m[0] === name)?.[1] || name) + '</h2><p class="muted">Módulo carregado.</p></div>';
      if (typeof mod.mount === 'function') mod.mount(panel, project, API);
      status('módulo: ' + (modules.find(m => m[0] === name)?.[1] || name));
    } catch (e) {
      panel.innerHTML = '<div class="panel"><h2>Erro no módulo</h2><p class="muted">' + esc(e.message || e) + '</p></div>';
      status('erro no módulo', false);
    }
  }

  async function loadProject() {
    if (!projectId) {
      project = {
        version: '0.1.0', system: 'MEGADRIVE', name: 'Novo Jogo Mega Drive',
        cpu: '68000', video: 'VDP', romSize: 0
      };
      updateHeader(); refreshFooter();
      await openModule('config');
      status('sem projeto carregado');
      return;
    }

    status('carregando...');
    const r = await fetch('backend/projects/load.php?id=' + encodeURIComponent(projectId), {
      credentials: 'same-origin', cache: 'no-store'
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.message || 'Não foi possível carregar o projeto.');
    project = d.project;
    updateHeader(); refreshFooter();
    await openModule('config');
    status('pronto');
  }

  async function saveProject() {
    if (!projectId || !project) {
      status('nenhum projeto para salvar', false);
      return;
    }
    status('salvando...');
    const r = await fetch('backend/projects/save.php', {
      method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id: projectId, project: project })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.success) throw new Error(d.message || 'Falha ao salvar o projeto.');
    if (d.project) project = d.project;
    updateHeader(); refreshFooter();
    status('salvo');
  }

  async function ensureSession() {
    const r = await fetch(APP('/backend/auth/session.php'), { credentials: 'same-origin', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!j.authenticated) {
      location.replace(APP('/login.html') + '?next=' + encodeURIComponent(location.pathname + location.search));
      return false;
    }
    return true;
  }

  const API = {
    getProject: () => project,
    setProject: (p) => { project = p; updateHeader(); refreshFooter(); },
    save: saveProject,
    refresh: () => openModule(currentModule),
    openModule
  };

  document.getElementById('btnSideToggle')?.addEventListener('click', toggleSidebar);
  menu.forEach(el => el.addEventListener('click', () => openModule(el.getAttribute('data-mod'))));

  document.getElementById('btnDash')?.addEventListener('click', () => {
    location.href = APP('/sistemas/megadrive/dashboard.html');
  });

  document.getElementById('btnSave')?.addEventListener('click', () => {
    saveProject().catch(e => { status('erro ao salvar', false); alert(e.message || e); });
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveProject().catch(err => { status('erro ao salvar', false); alert(err.message || err); });
    }
  });

  (async function init() {
    restoreSidebar();
    if (!(await ensureSession())) return;
    try {
      await loadProject();
    } catch (e) {
      status('erro ao carregar', false);
      const panel = document.getElementById('mod-config');
      if (panel) panel.innerHTML = '<div class="panel"><h2>Erro</h2><p class="muted">' + esc(e.message || e) + '</p></div>';
    }
  })();
})();
