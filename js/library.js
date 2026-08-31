// Biblioteca pessoal do usuário (.nsound / .tile) — backend/library/*
const AssetLibrary = (() => {
  const BASE = 'backend/library';

  async function list(type) {
    const res = await fetch(`${BASE}/list.php?type=${encodeURIComponent(type)}`, {
      credentials: 'same-origin',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Falha ao listar biblioteca');
    }
    return json.items || [];
  }

  async function save(type, data, opts = {}) {
    const body = {
      type,
      data,
      id: opts.id || undefined,
      name: opts.name || undefined,
    };
    const res = await fetch(`${BASE}/save.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Falha ao salvar na biblioteca');
    }
    return json;
  }

  async function load(type, id) {
    const res = await fetch(
      `${BASE}/load.php?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`,
      { credentials: 'same-origin' }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Falha ao carregar asset');
    }
    return json;
  }

  async function remove(type, id) {
    const res = await fetch(`${BASE}/delete.php`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      throw new Error(json.message || 'Falha ao remover asset');
    }
    return json;
  }

  /** Download local + opcionalmente grava na biblioteca. */
  async function exportAndMaybeLibrary(type, doc, downloadName, opts = {}) {
    const saveLib = opts.saveToLibrary !== false;
    // download local
    if (opts.download !== false) {
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 500);
    }
    if (!saveLib) return { downloaded: true, library: null };
    try {
      const saved = await save(type, doc, { name: opts.name || doc.name });
      if (typeof Project !== 'undefined' && Project.status) {
        Project.status(`Biblioteca: salvo "${saved.name}" (${type})`);
      }
      return { downloaded: opts.download !== false, library: saved };
    } catch (err) {
      console.warn('Library save failed', err);
      if (typeof Project !== 'undefined' && Project.status) {
        Project.status('Download ok; biblioteca: ' + (err.message || 'erro'));
      }
      return { downloaded: opts.download !== false, library: null, error: err };
    }
  }

  return { list, save, load, remove, exportAndMaybeLibrary };
})();
