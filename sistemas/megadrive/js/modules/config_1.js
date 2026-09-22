/**
 * sistemas/megadrive/js/modules/config.js
 * Config - mesmo padrão NES config.js mas adaptado MD
 * Corrige quebra com novo core.js (usa AppState)
 */
(function(){
  const DEFAULT = {
    meta: { name: 'Hello Mega', author: 'Tales', version: '0.1.0', region: 'U', sram: false, mapper: 'SEGA' }
  };

  let containerEl = null;

  function render(){
    if(!containerEl) containerEl = document.getElementById('panel-config') || document.querySelector('[data-module="config"]') || document.getElementById('editor-content');
    if(!containerEl) return;
    const p = window.AppState?.project || DEFAULT;
    const meta = p.meta || DEFAULT.meta;

    containerEl.innerHTML = `
      <div class="config-editor-container">
        <div class="config-header">
          <h2>⚙️ Configuração do Projeto - Mega Drive</h2>
          <span id="save-status" class="save-status">✔ salvo</span>
        </div>
        <div class="config-grid">
          <label>Nome do Projeto<input id="cfg-name" value="${meta.name||''}" /></label>
          <label>Autor<input id="cfg-author" value="${meta.author||''}" /></label>
          <label>Versão<input id="cfg-version" value="${meta.version||''}" /></label>
          <label>Região
            <select id="cfg-region">
              <option value="J" ${meta.region==='J'?'selected':''}>J - Japão (NTSC)</option>
              <option value="U" ${meta.region==='U'?'selected':''}>U - USA (NTSC)</option>
              <option value="E" ${meta.region==='E'?'selected':''}>E - Europa (PAL)</option>
              <option value="JE" ${meta.region==='JE'?'selected':''}>J+E - Livre</option>
            </select>
          </label>
          <label class="check"><input type="checkbox" id="cfg-sram" ${meta.sram?'checked':''}/> SRAM / Save (cartucho com bateria)</label>
          <label>Formato
            <select id="cfg-format" disabled><option>.mdg - Mega Drive / Genesis</option></select>
          </label>
        </div>
        <div class="config-info">
          <div><strong>CPU:</strong> 68000 @ 7.67 MHz</div>
          <div><strong>Vídeo:</strong> VDP - 64 cores, 4 planos</div>
          <div><strong>Áudio:</strong> FM 2612 + PSG SN76489</div>
          <div><strong>ROM:</strong> ${p.tiles ? (p.tiles.length||8192)+' bytes tiles' : '—'}</div>
        </div>
        <div class="config-actions">
          <button id="cfg-save" class="btn primary">💾 Salvar no AppState</button>
          <button id="cfg-export" class="btn">📦 Exportar .mdg JSON</button>
        </div>
      </div>
    `;

    containerEl.querySelector('#cfg-name').addEventListener('input', e=>{ window.AppState.project.meta.name=e.target.value; window.AppState.markDirty(); });
    containerEl.querySelector('#cfg-author').addEventListener('input', e=>{ window.AppState.project.meta.author=e.target.value; window.AppState.markDirty(); });
    containerEl.querySelector('#cfg-version').addEventListener('input', e=>{ window.AppState.project.meta.version=e.target.value; window.AppState.markDirty(); });
    containerEl.querySelector('#cfg-region').addEventListener('change', e=>{ window.AppState.project.meta.region=e.target.value; window.AppState.markDirty(); });
    containerEl.querySelector('#cfg-sram').addEventListener('change', e=>{ window.AppState.project.meta.sram=e.target.checked; window.AppState.markDirty(); });
    containerEl.querySelector('#cfg-save').addEventListener('click', ()=>{
      window.AppState.markClean();
      window.MDCore.emit('config:saved', window.AppState.project.meta);
      alert('Config salva no AppState. Use Salvar no topo para persistir no backend.');
    });
  }

  function init(container, project){
    if(container) containerEl = container;
    if(project && window.AppState) window.AppState.project = project;
    render();
  }

  const mod = { init, render, getData: ()=> window.AppState?.project?.meta };
  window.MDModules = window.MDModules||{};
  window.MDModules.config = mod;
  window.ConfigEditor = mod;
  window.MDCore = window.MDCore||{};
  if(window.MDCore.registerModule) window.MDCore.registerModule('config', mod);
  else {
    // registra quando core carregar
    document.addEventListener('DOMContentLoaded', ()=>{ if(window.MDCore.registerModule) window.MDCore.registerModule('config', mod); if(window.AppState) window.AppState.registerModule('config', mod); });
    // fallback imediato
    if(window.AppState) window.AppState.registerModule('config', mod);
  }
})();
