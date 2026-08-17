// PROGRAM MODULE v0.1.0 - Esboço inicial: Variáveis, Eventos e Regras (a "linguagem" do jogo)
// Ainda não gera .asm - por enquanto só estrutura o dado que o build-rom vai consumir depois,
// quando a fundação de loop principal + leitura de input existir.
const PROGRAM = (() => {
  let activeTab = 'vars'; // 'vars' | 'objects' | 'events' | 'menus' | 'rules'
  let selectedMenuId = null;
  let selectedRuleId = null;

  // Tipos de passo disponíveis dentro de uma Regra. Lista pequena e curada de primitivas -
  // não é um parser de linguagem livre, é um pequeno conjunto de instruções que mapeiam
  // quase 1:1 pro 6502 (ver conversa de planejamento).
  const STEP_TYPES = {
    if_event:  { label: 'SE evento...' },
    if_var:    { label: 'SE variável...' },
    set_var:   { label: 'DEFINIR variável' },
    add_var:   { label: 'SOMAR variável' },
    sub_var:   { label: 'SUBTRAIR variável' },
    action:    { label: 'AÇÃO...' }
  };
  // Catálogo pequeno de ações primitivas (cresce com o tempo, não é por gênero de jogo).
  const ACTION_CATALOG = {
    goto_warp:   { label: 'Ir para Warp' },
    play_sound:  { label: 'Tocar Som' },
    open_menu:   { label: 'Abrir Menu' },
    close_menu:  { label: 'Fechar Menu' },
    toggle_hitbox: { label: 'Ligar/Desligar Hitbox' },
    custom:      { label: 'Personalizada (nome livre)' }
  };
  const OPS = ['==','!=','>','<','>=','<='];

  // Calcula o endereço/bit de cada variável a partir da ORDEM do array - nunca fica
  // guardado, é sempre recalculado, então não tem como desalinhar com deleções/reordenações.
  // Bools são empacotados 8 por byte; byte/word abrem endereço próprio (word usa 2 bytes).
  function computeAllocation(vars){
    let byteIndex = 0, bitCursor = 0, boolByteOpen = false;
    const list = [];
    for(const v of vars){
      if(v.type === 'bool'){
        if(!boolByteOpen){ boolByteOpen = true; bitCursor = 0; }
        list.push({ ...v, byteIndex, bitIndex: bitCursor, sizeBytes: 0 });
        bitCursor++;
        if(bitCursor >= 8){ boolByteOpen = false; byteIndex++; }
      } else {
        if(boolByteOpen){ boolByteOpen = false; byteIndex++; }
        const size = v.type === 'word' ? 2 : 1;
        list.push({ ...v, byteIndex, bitIndex: null, sizeBytes: size });
        byteIndex += size;
      }
    }
    const totalBytes = byteIndex + (boolByteOpen ? 1 : 0);
    return { list, totalBytes };
  }

  function buildHTML(){
    const root = document.getElementById('mod-program'); if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
        <div style="display:flex;gap:6px;align-items:center;padding:8px 12px;background:#252526;border-bottom:1px solid #333">
          <h3 style="font-size:12px;color:#ffcc00;margin:0">🧠 PROGRAMAÇÃO (esboço)</h3>
          <div style="display:flex;gap:4px;margin-left:20px">
            <button class="btn-tool prog-tab-btn" data-tab="vars" onclick="PROGRAM.setTab('vars')" style="${activeTab==='vars'?'background:#ffcc00;color:#000':''}">🔢 Variáveis</button>
            <button class="btn-tool prog-tab-btn" data-tab="objects" onclick="PROGRAM.setTab('objects')" style="${activeTab==='objects'?'background:#ffcc00;color:#000':''}">🎯 Objetos</button>
            <button class="btn-tool prog-tab-btn" data-tab="events" onclick="PROGRAM.setTab('events')" style="${activeTab==='events'?'background:#ffcc00;color:#000':''}">⚡ Eventos</button>
            <button class="btn-tool prog-tab-btn" data-tab="rules" onclick="PROGRAM.setTab('rules')" style="${activeTab==='rules'?'background:#ffcc00;color:#000':''}">📜 Regras</button>
            <button class="btn-tool prog-tab-btn" data-tab="menus" onclick="PROGRAM.setTab('menus')" style="${activeTab==='menus'?'background:#ffcc00;color:#000':''}">📋 Menus</button>
          </div>
        </div>
        <div id="progTabContent" style="flex:1;overflow:auto;padding:14px"></div>
      </div>
    `;
    renderTab();
  }

  function setTab(t){ activeTab = t; buildHTML(); }

  function renderTab(){
    const cont = document.getElementById('progTabContent'); if(!cont) return;
    if(activeTab === 'vars') cont.innerHTML = renderVarsTab();
    else if(activeTab === 'objects') cont.innerHTML = renderObjectsTab();
    else if(activeTab === 'events') cont.innerHTML = renderEventsTab();
    else if(activeTab === 'menus'){
      cont.innerHTML = renderMenusTab();
      const menu = (Project.data?.menus || []).find(m => m.id === selectedMenuId);
      if(menu){ const canvas = document.getElementById('menuCursorPreview_'+menu.id); renderSingleTilePreview(canvas, menu.cursorTile || 0, 0); }
    }
    else cont.innerHTML = renderRulesTab();
  }

  // Preview simples de um único tile do CHR (usado pra mostrar o glifo escolhido como
  // cursor do menu, sem precisar de um seletor visual completo por enquanto).
  function renderSingleTilePreview(canvas, tileIdx, palIdx){
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const chrBuf = (typeof CHR !== 'undefined' && CHR.getBuffer) ? CHR.getBuffer() : new Uint8Array(8192);
    const pals = (typeof CHR !== 'undefined' && CHR.getPalettes) ? CHR.getPalettes() : [[15,0,16,48]];
    const pal = pals[palIdx] || pals[0];
    const off = (tileIdx || 0) * 16;
    if(off + 16 > chrBuf.length) return;
    const scale = canvas.width / 8;
    for(let py=0; py<8; py++){
      const p0 = chrBuf[off+py], p1 = chrBuf[off+py+8];
      for(let px=0; px<8; px++){
        const sh = 7-px, b0 = (p0>>sh)&1, b1 = (p1>>sh)&1, ci = (b1<<1)|b0;
        if(ci === 0) continue;
        ctx.fillStyle = (typeof NES_PALETTE !== 'undefined' && NES_PALETTE[pal[ci]]) ? NES_PALETTE[pal[ci]] : '#fff';
        ctx.fillRect(px*scale, py*scale, scale, scale);
      }
    }
  }

  // ---------------- VARIÁVEIS ----------------
  function maxForType(type){ return type==='bool' ? 1 : type==='word' ? 65535 : 255; }

  function renderVarsTab(){
    const vars = Project.data?.variables || [];
    const { list, totalBytes } = computeAllocation(vars);
    const rows = list.map(v => `
      <tr style="border-bottom:1px solid #222">
        <td style="padding:6px;color:#fff">${v.name}</td>
        <td style="padding:6px;color:#888">${v.type}${v.zeroPage?' <span style="color:#4ec9b0">(zero page)</span>':''}</td>
        <td style="padding:6px;color:#ffcc00;font-family:monospace">
          ${v.type==='bool' ? `$${(v.zeroPage?0:0x0300+v.byteIndex).toString(16).padStart(v.zeroPage?2:4,'0')} bit ${v.bitIndex}` : `$${(v.zeroPage?0:0x0300)+v.byteIndex} (${v.sizeBytes} byte${v.sizeBytes>1?'s':''})`}
        </td>
        <td style="padding:6px">
          <input type="number" id="varVal_${v.id}" value="${v.initialValue ?? 0}" min="0" max="${maxForType(v.type)}" style="width:65px;background:#000;color:#4ec9b0;border:1px solid #444;border-radius:3px;padding:3px;font-family:monospace">
          <button class="btn-tool" onclick="PROGRAM.saveVariableValue('${v.id}')" style="font-size:9px;padding:2px 5px;background:#27ae60;color:#fff">💾</button>
        </td>
        <td style="padding:6px;text-align:right"><button class="btn-tool" onclick="PROGRAM.deleteVariable('${v.id}')" style="background:#c0392b;color:#fff;font-size:10px">🗑</button></td>
      </tr>`).join('');
    return `
      <div style="max-width:760px">
        <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;margin-bottom:12px">
          <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">NOVA VARIÁVEL</h4>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="varName" type="text" placeholder="nome_da_variavel" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
            <select id="varType" onchange="PROGRAM.onVarTypeChange()" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
              <option value="bool">bool (1 bit)</option>
              <option value="byte">byte (0-255)</option>
              <option value="word">word (0-65535)</option>
            </select>
            <label style="font-size:10px;color:#888;display:flex;align-items:center;gap:4px">valor inicial
              <input id="varInitial" type="number" value="0" min="0" max="255" style="width:70px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
            </label>
            <label style="font-size:10px;color:#888;display:flex;align-items:center;gap:4px"><input id="varZP" type="checkbox"> zero page</label>
            <button class="btn-tool" onclick="PROGRAM.addVariable()" style="background:#27ae60;color:#fff">+ Adicionar</button>
          </div>
        </div>
        <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
          <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">VARIÁVEIS DO PROJETO (${list.length}) - ${totalBytes} byte(s) usados</h4>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="border-bottom:1px solid #444;color:#888;text-align:left"><th style="padding:6px">Nome</th><th style="padding:6px">Tipo</th><th style="padding:6px">Endereço</th><th style="padding:6px">Valor inicial</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" style="padding:10px;color:#666">Nenhuma variável ainda.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function onVarTypeChange(){
    const typeEl = document.getElementById('varType'); const initEl = document.getElementById('varInitial');
    if(!typeEl || !initEl) return;
    const max = maxForType(typeEl.value);
    initEl.max = max;
    if(parseInt(initEl.value) > max) initEl.value = max;
  }

  function addVariable(){
    const nameEl = document.getElementById('varName'); const typeEl = document.getElementById('varType'); const zpEl = document.getElementById('varZP'); const initEl = document.getElementById('varInitial');
    const name = nameEl.value.trim(); if(!name) return;
    const type = typeEl.value;
    const max = maxForType(type);
    let initialValue = parseInt(initEl.value); if(isNaN(initialValue)) initialValue = 0;
    initialValue = Math.max(0, Math.min(max, initialValue));
    if(!Project.data.variables) Project.data.variables = [];
    Project.data.variables.push({ id: 'var_'+Date.now(), name, type, zeroPage: zpEl.checked, initialValue });
    renderTab();
  }
  function deleteVariable(id){
    if(!Project.data?.variables) return;
    if(!confirm('Remover essa variável? Qualquer Regra que a use vai ficar com referência quebrada.')) return;
    Project.data.variables = Project.data.variables.filter(v => v.id !== id);
    renderTab();
  }
  // Edita o valor inicial de uma variável já criada, sem precisar recriá-la.
  // Não re-renderiza a aba inteira (só corrige o próprio input) pra não perder foco/scroll.
  function saveVariableValue(id){
    const v = Project.data?.variables?.find(v => v.id === id); if(!v) return;
    const input = document.getElementById('varVal_'+id); if(!input) return;
    const max = maxForType(v.type);
    let val = parseInt(input.value); if(isNaN(val)) val = 0;
    val = Math.max(0, Math.min(max, val));
    v.initialValue = val;
    input.value = val;
    Project.status(`Variável "${v.name}" agora inicia em ${val}`);
  }

  // ---------------- OBJETOS (hitbox) ----------------
  function renderObjectsTab(){
    const objs = Project.data?.hitboxObjects || [];
    const rows = objs.map(o => `
      <tr style="border-bottom:1px solid #222">
        <td style="padding:6px;color:#fff">${o.name}</td>
        <td style="padding:6px;color:#888">${o.kind === 'dano' ? '🔻 Dano' : '🚪 Warp'}</td>
        <td style="padding:6px">${o.kind === 'dano'
          ? `<input type="number" id="objDmg_${o.id}" value="${o.damage ?? 0}" min="0" max="255" style="width:60px;background:#000;color:#4ec9b0;border:1px solid #444;border-radius:3px;padding:3px;font-family:monospace">
             <button class="btn-tool" onclick="PROGRAM.saveObjectDamage('${o.id}')" style="font-size:9px;padding:2px 5px;background:#27ae60;color:#fff">💾</button>`
          : '—'}</td>
        <td style="padding:6px;text-align:right"><button class="btn-tool" onclick="PROGRAM.deleteHitboxObject('${o.id}')" style="background:#c0392b;color:#fff;font-size:10px">🗑</button></td>
      </tr>`).join('');
    return `
      <div style="max-width:700px">
        <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;margin-bottom:12px">
          <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">NOVO OBJETO DE HITBOX</h4>
          <div style="font-size:9px;color:#666;margin-bottom:8px;line-height:1.4">
            Um objeto é a "identidade" de um gatilho (dano ou warp). O mesmo metatile pode ter várias
            instâncias na tela, cada uma apontando pra um objeto diferente - ex: dois espinhos iguais
            visualmente, um tira 10 e o outro 20; ou duas portas iguais que levam pra lugares diferentes.
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="objName" type="text" placeholder="nome_do_objeto" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
            <select id="objKind" onchange="PROGRAM.onObjKindChange()" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
              <option value="dano">Dano</option>
              <option value="warp">Warp</option>
            </select>
            <input id="objDamage" type="number" min="0" max="255" value="10" placeholder="dano" style="width:70px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
            <button class="btn-tool" onclick="PROGRAM.addHitboxObject()" style="background:#27ae60;color:#fff">+ Adicionar</button>
          </div>
        </div>
        <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
          <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">OBJETOS DO PROJETO (${objs.length})</h4>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="border-bottom:1px solid #444;color:#888;text-align:left"><th style="padding:6px">Nome</th><th style="padding:6px">Tipo</th><th style="padding:6px">Dano</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" style="padding:10px;color:#666">Nenhum objeto ainda.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function onObjKindChange(){
    const kindEl = document.getElementById('objKind'); const dmgEl = document.getElementById('objDamage');
    if(!kindEl || !dmgEl) return;
    dmgEl.style.display = kindEl.value === 'dano' ? 'inline-block' : 'none';
  }

  function addHitboxObject(){
    const nameEl = document.getElementById('objName'); const kindEl = document.getElementById('objKind'); const dmgEl = document.getElementById('objDamage');
    const name = nameEl.value.trim(); if(!name) return;
    const kind = kindEl.value;
    if(!Project.data.hitboxObjects) Project.data.hitboxObjects = [];
    const obj = { id: 'hb_'+Date.now(), name, kind };
    if(kind === 'dano'){ let d = parseInt(dmgEl.value); if(isNaN(d)) d = 0; obj.damage = Math.max(0, Math.min(255, d)); }
    Project.data.hitboxObjects.push(obj);
    renderTab();
  }
  function deleteHitboxObject(id){
    if(!Project.data?.hitboxObjects) return;
    if(!confirm('Remover esse objeto? Instâncias que o usam nas telas ficarão com referência quebrada.')) return;
    Project.data.hitboxObjects = Project.data.hitboxObjects.filter(o => o.id !== id);
    renderTab();
  }
  function saveObjectDamage(id){
    const o = Project.data?.hitboxObjects?.find(o => o.id === id); if(!o || o.kind !== 'dano') return;
    const input = document.getElementById('objDmg_'+id); if(!input) return;
    let val = parseInt(input.value); if(isNaN(val)) val = 0;
    val = Math.max(0, Math.min(255, val));
    o.damage = val;
    input.value = val;
    Project.status(`"${o.name}" agora causa ${val} de dano`);
  }

  // ---------------- EVENTOS ----------------
  const INPUT_BUTTONS = ["P1-UP","P1-DOWN","P1-LEFT","P1-RIGHT","P1-A","P1-B","P1-START","P1-SELECT","P2-UP","P2-DOWN","P2-LEFT","P2-RIGHT","P2-A","P2-B","P2-START","P2-SELECT"];

  function renderEventsTab(){
    const events = Project.data?.events || [];
    const hitboxObjs = Project.data?.hitboxObjects || [];
    const rows = events.map(e => `
      <tr style="border-bottom:1px solid #222">
        <td style="padding:6px;color:#fff">${e.name}</td>
        <td style="padding:6px;color:#888">${e.category}${e.button ? ' ('+e.button+')' : ''}${e.hitboxObjectId ? ' ('+(hitboxObjs.find(o=>o.id===e.hitboxObjectId)?.name || '?')+')' : ''}</td>
        <td style="padding:6px">${e.builtin ? '<span style="color:#4ec9b0;font-size:10px">nativo</span>' : '<span style="color:#ffcc00;font-size:10px">customizado</span>'}</td>
        <td style="padding:6px;text-align:right"><button class="btn-tool" onclick="PROGRAM.deleteEvent('${e.id}')" style="background:#c0392b;color:#fff;font-size:10px">🗑</button></td>
      </tr>`).join('');
    return `
      <div style="max-width:760px">
        <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;margin-bottom:12px">
          <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">NOVO EVENTO CUSTOMIZADO</h4>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input id="evName" type="text" placeholder="nome_do_evento" style="flex:1;min-width:140px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
            <select id="evCategory" onchange="PROGRAM.onEvCategoryChange()" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
              <option value="input">input</option>
              <option value="hitbox">hitbox</option>
              <option value="custom">custom</option>
            </select>
            <select id="evButton" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
              ${INPUT_BUTTONS.map(b=>`<option value="${b}">${b}</option>`).join('')}
            </select>
            <select id="evHitboxObj" style="display:none;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
              <option value="">— objeto —</option>
              ${hitboxObjs.map(o=>`<option value="${o.id}">${o.name}</option>`).join('')}
            </select>
            <button class="btn-tool" onclick="PROGRAM.addEvent()" style="background:#27ae60;color:#fff">+ Adicionar</button>
          </div>
        </div>
        <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
          <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">EVENTOS DO PROJETO (${events.length})</h4>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="border-bottom:1px solid #444;color:#888;text-align:left"><th style="padding:6px">Nome</th><th style="padding:6px">Categoria</th><th style="padding:6px">Origem</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" style="padding:10px;color:#666">Nenhum evento.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function onEvCategoryChange(){
    const catEl = document.getElementById('evCategory'); const btnEl = document.getElementById('evButton'); const objEl = document.getElementById('evHitboxObj');
    if(!catEl) return;
    btnEl.style.display = catEl.value === 'input' ? 'inline-block' : 'none';
    objEl.style.display = catEl.value === 'hitbox' ? 'inline-block' : 'none';
  }

  function addEvent(){
    const nameEl = document.getElementById('evName'); const catEl = document.getElementById('evCategory');
    const btnEl = document.getElementById('evButton'); const objEl = document.getElementById('evHitboxObj');
    const name = nameEl.value.trim(); if(!name) return;
    if(!Project.data.events) Project.data.events = [];
    const ev = { id: 'ev_'+Date.now(), name, category: catEl.value, builtin: false };
    if(catEl.value === 'input') ev.button = btnEl.value;
    if(catEl.value === 'hitbox') ev.hitboxObjectId = objEl.value || null;
    Project.data.events.push(ev);
    renderTab();
  }
  function deleteEvent(id){
    if(!Project.data?.events) return;
    const ev = Project.data.events.find(e => e.id === id);
    const msg = ev?.builtin
      ? `"${ev.name}" é um evento nativo do sistema. Remover mesmo assim? Qualquer Regra que o use vai ficar com referência quebrada.`
      : 'Remover esse evento? Qualquer Regra que o use vai ficar com referência quebrada.';
    if(!confirm(msg)) return;
    Project.data.events = Project.data.events.filter(e => e.id !== id);
    renderTab();
  }

  // ---------------- MENUS ----------------
  // Cada menu define nome, tile do cursor e uma lista ordenada de itens. Cada item, ao ser
  // criado, já ganha um evento próprio (categoria 'menu') automaticamente - o que acontece
  // quando o item é selecionado se define em Regras, não aqui. A posição do menu na tela
  // fica pro Backgrounds decidir depois (o mesmo menu pode ser usado em telas diferentes).
  function renderMenusTab(){
    const menus = Project.data?.menus || [];
    const listHtml = menus.map(m => `
      <div onclick="PROGRAM.selectMenu('${m.id}')" style="padding:8px;border-radius:4px;cursor:pointer;background:${m.id===selectedMenuId?'#3a3a10':'#181818'};border:1px solid ${m.id===selectedMenuId?'#ffcc00':'#333'};margin-bottom:4px">
        <div style="color:#fff;font-size:11px">${m.name}</div>
        <div style="color:#888;font-size:9px">${m.items.length} item(ns)</div>
      </div>`).join('');
    const selectedMenu = menus.find(m => m.id === selectedMenuId);
    return `
      <div style="display:flex;gap:14px;height:100%">
        <div style="width:260px;display:flex;flex-direction:column;gap:8px">
          <button class="btn-tool" onclick="PROGRAM.addMenu()" style="background:#27ae60;color:#fff">+ Novo Menu</button>
          <div style="overflow:auto">${listHtml || '<div style="color:#666;font-size:11px">Nenhum menu ainda.</div>'}</div>
        </div>
        <div style="flex:1;background:#111;border:1px solid #333;border-radius:6px;padding:12px;overflow:auto">
          ${selectedMenu ? renderMenuEditor(selectedMenu) : '<div style="color:#666;font-size:11px">Selecione ou crie um menu.</div>'}
        </div>
      </div>`;
  }

  function renderMenuEditor(menu){
    const itemsHtml = menu.items.map((it, i) => `
      <div style="display:flex;gap:6px;align-items:center;background:#181818;border:1px solid #2a2a2a;border-radius:4px;padding:6px">
        <span style="color:#666;font-size:9px;width:16px">${i+1}</span>
        <input value="${it.label}" onchange="PROGRAM.updateMenuItem('${menu.id}',${i},'label',this.value)" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px">
        <span style="font-size:9px;color:#4ec9b0;font-family:monospace">${it.eventId ? '⚡ evento vinculado' : '—'}</span>
        <button class="btn-tool" onclick="PROGRAM.moveMenuItem('${menu.id}',${i},-1)" style="font-size:9px;padding:2px 5px">↑</button>
        <button class="btn-tool" onclick="PROGRAM.moveMenuItem('${menu.id}',${i},1)" style="font-size:9px;padding:2px 5px">↓</button>
        <button class="btn-tool" onclick="PROGRAM.deleteMenuItem('${menu.id}',${i})" style="font-size:9px;padding:2px 5px;background:#c0392b;color:#fff">🗑</button>
      </div>`).join('');
    return `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <input value="${menu.name}" onchange="PROGRAM.renameMenu('${menu.id}', this.value)" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px">
        <button class="btn-tool" onclick="PROGRAM.deleteMenu('${menu.id}')" style="background:#c0392b;color:#fff;font-size:10px">🗑 Deletar Menu</button>
      </div>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;background:#181818;border:1px solid #2a2a2a;border-radius:4px;padding:8px">
        <div>
          <label style="font-size:10px;color:#888;display:block;margin-bottom:2px">Tile do cursor (índice CHR)</label>
          <input type="number" min="0" value="${menu.cursorTile ?? 0}" onchange="PROGRAM.updateMenuCursor('${menu.id}', parseInt(this.value)||0)" style="width:70px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:11px">
        </div>
        <canvas id="menuCursorPreview_${menu.id}" width="32" height="32" style="background:#000;border:1px solid #444;image-rendering:pixelated"></canvas>
        <div style="font-size:9px;color:#666;line-height:1.3;max-width:260px">
          Escolha o tile da fonte que serve de cursor (ex: um ">" ou uma mãozinha). No build, esse
          desenho é copiado pra página de sprites - o cursor sempre vira um sprite de verdade,
          nunca redesenha o fundo.
        </div>
      </div>
      <h4 style="font-size:11px;color:#4ec9b0;margin-bottom:8px">ITENS DO MENU</h4>
      <div style="display:flex;flex-direction:column;gap:6px">${itemsHtml || '<div style="color:#666;font-size:11px">Nenhum item ainda.</div>'}</div>
      <button class="btn-tool" onclick="PROGRAM.addMenuItem('${menu.id}')" style="margin-top:10px;background:#2980b9;color:#fff">+ Item</button>
    `;
  }

  function addMenu(){
    const name = prompt('Nome do menu:', `menu_${(Project.data?.menus?.length||0)+1}`); if(!name) return;
    if(!Project.data.menus) Project.data.menus = [];
    const m = { id:'menu_'+Date.now(), name: name.trim(), cursorTile: 0, items: [] };
    Project.data.menus.push(m); selectedMenuId = m.id; renderTab();
  }
  function selectMenu(id){ selectedMenuId = id; renderTab(); }
  function renameMenu(id, name){
    const m = Project.data?.menus?.find(m => m.id === id);
    if(m && name.trim()) m.name = name.trim();
    renderTab();
  }
  function deleteMenu(id){
    const m = Project.data?.menus?.find(m => m.id === id); if(!m) return;
    if(!confirm(`Deletar o menu "${m.name}"? Os eventos dos itens dele também serão removidos.`)) return;
    const eventIds = m.items.map(it => it.eventId).filter(Boolean);
    Project.data.events = (Project.data.events || []).filter(e => !eventIds.includes(e.id));
    Project.data.menus = Project.data.menus.filter(m => m.id !== id);
    if(selectedMenuId === id) selectedMenuId = null;
    renderTab();
  }
  function updateMenuCursor(id, tileIdx){
    const m = Project.data?.menus?.find(m => m.id === id); if(!m) return;
    m.cursorTile = tileIdx;
    renderSingleTilePreview(document.getElementById('menuCursorPreview_'+id), tileIdx, 0);
  }
  function addMenuItem(menuId){
    const m = Project.data?.menus?.find(m => m.id === menuId); if(!m) return;
    const label = prompt('Texto do item:', `item_${m.items.length+1}`); if(!label) return;
    if(!Project.data.events) Project.data.events = [];
    const ev = { id:'ev_'+Date.now(), name:`${m.name}: ${label.trim()}`, category:'menu', builtin:false };
    Project.data.events.push(ev);
    m.items.push({ id:'mi_'+Date.now(), label: label.trim(), eventId: ev.id });
    renderTab();
  }
  function updateMenuItem(menuId, idx, field, value){
    const m = Project.data?.menus?.find(m => m.id === menuId); if(!m || !m.items[idx]) return;
    m.items[idx][field] = value;
    if(field === 'label'){
      const ev = Project.data.events?.find(e => e.id === m.items[idx].eventId);
      if(ev) ev.name = `${m.name}: ${value}`;
    }
  }
  function moveMenuItem(menuId, idx, dir){
    const m = Project.data?.menus?.find(m => m.id === menuId); if(!m) return;
    const newIdx = idx + dir; if(newIdx < 0 || newIdx >= m.items.length) return;
    [m.items[idx], m.items[newIdx]] = [m.items[newIdx], m.items[idx]];
    renderTab();
  }
  function deleteMenuItem(menuId, idx){
    const m = Project.data?.menus?.find(m => m.id === menuId); if(!m || !m.items[idx]) return;
    const it = m.items[idx];
    if(it.eventId) Project.data.events = (Project.data.events || []).filter(e => e.id !== it.eventId);
    m.items.splice(idx, 1);
    renderTab();
  }

  // ---------------- REGRAS ----------------
  function renderRulesTab(){
    const rules = Project.data?.rules || [];
    const phases = Project.data?.phases || [];
    const listHtml = rules.map(r => `
      <div onclick="PROGRAM.selectRule('${r.id}')" style="padding:8px;border-radius:4px;cursor:pointer;background:${r.id===selectedRuleId?'#3a3a10':'#181818'};border:1px solid ${r.id===selectedRuleId?'#ffcc00':'#333'};margin-bottom:4px">
        <div style="color:#fff;font-size:11px">${r.name}</div>
        <div style="color:#888;font-size:9px">${r.scope==='global'?'Global':'Fase: '+(phases.find(p=>p.id===r.scope)?.name||'?')} • ${r.steps.length} passo(s)</div>
      </div>`).join('');
    const selectedRule = rules.find(r => r.id === selectedRuleId);
    return `
      <div style="display:flex;gap:14px;height:100%">
        <div style="width:260px;display:flex;flex-direction:column;gap:8px">
          <button class="btn-tool" onclick="PROGRAM.addRule()" style="background:#27ae60;color:#fff">+ Nova Regra</button>
          <div style="overflow:auto">${listHtml || '<div style="color:#666;font-size:11px">Nenhuma regra ainda.</div>'}</div>
        </div>
        <div style="flex:1;background:#111;border:1px solid #333;border-radius:6px;padding:12px;overflow:auto">
          ${selectedRule ? renderRuleEditor(selectedRule, phases) : '<div style="color:#666;font-size:11px">Selecione ou crie uma regra.</div>'}
        </div>
      </div>`;
  }

  function renderRuleEditor(rule, phases){
    const vars = Project.data?.variables || [];
    const events = Project.data?.events || [];
    const stepsHtml = rule.steps.map((s, i) => renderStepRow(rule, s, i, vars, events)).join('');
    return `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <input value="${rule.name}" onchange="PROGRAM.renameRule('${rule.id}', this.value)" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px">
        <select onchange="PROGRAM.setRuleScope('${rule.id}', this.value)" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px">
          <option value="global" ${rule.scope==='global'?'selected':''}>Global (toda a ROM)</option>
          ${phases.map(p => `<option value="${p.id}" ${rule.scope===p.id?'selected':''}>Só na fase: ${p.name}</option>`).join('')}
        </select>
        <button class="btn-tool" onclick="PROGRAM.deleteRule('${rule.id}')" style="background:#c0392b;color:#fff;font-size:10px">🗑 Deletar Regra</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">${stepsHtml || '<div style="color:#666;font-size:11px">Nenhum passo ainda.</div>'}</div>
      <button class="btn-tool" onclick="PROGRAM.addStep('${rule.id}')" style="margin-top:10px;background:#2980b9;color:#fff">+ Passo</button>
    `;
  }

  function renderStepRow(rule, step, idx, vars, events){
    const typeOptions = Object.entries(STEP_TYPES).map(([k,v]) => `<option value="${k}" ${step.type===k?'selected':''}>${v.label}</option>`).join('');
    let fields = '';
    if(step.type === 'if_event'){
      fields = `<select onchange="PROGRAM.updateStep('${rule.id}',${idx},'eventId',this.value)" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">
        <option value="">— evento —</option>${events.map(e=>`<option value="${e.id}" ${step.eventId===e.id?'selected':''}>${e.name}</option>`).join('')}</select>`;
    } else if(step.type === 'if_var'){
      fields = `<select onchange="PROGRAM.updateStep('${rule.id}',${idx},'varId',this.value)" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">
        <option value="">— variável —</option>${vars.map(v=>`<option value="${v.id}" ${step.varId===v.id?'selected':''}>${v.name}</option>`).join('')}</select>
        <select onchange="PROGRAM.updateStep('${rule.id}',${idx},'op',this.value)" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">
        ${OPS.map(o=>`<option value="${o}" ${step.op===o?'selected':''}>${o}</option>`).join('')}</select>
        <input type="number" value="${step.value ?? 0}" onchange="PROGRAM.updateStep('${rule.id}',${idx},'value',parseInt(this.value)||0)" style="width:60px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">`;
    } else if(step.type === 'set_var' || step.type === 'add_var' || step.type === 'sub_var'){
      fields = `<select onchange="PROGRAM.updateStep('${rule.id}',${idx},'varId',this.value)" style="background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">
        <option value="">— variável —</option>${vars.map(v=>`<option value="${v.id}" ${step.varId===v.id?'selected':''}>${v.name}</option>`).join('')}</select>
        <input type="number" value="${step.value ?? 0}" onchange="PROGRAM.updateStep('${rule.id}',${idx},'value',parseInt(this.value)||0)" style="width:60px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">`;
    } else if(step.type === 'action'){
      const selStyle = "background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px";
      fields = `<select onchange="PROGRAM.updateStep('${rule.id}',${idx},'actionId',this.value)" style="${selStyle}">
        <option value="">— ação —</option>${Object.entries(ACTION_CATALOG).map(([k,v])=>`<option value="${k}" ${step.actionId===k?'selected':''}>${v.label}</option>`).join('')}</select>`;
      // Segundo select, populado de acordo com a ação escolhida - cada ação referencia um
      // catálogo diferente já existente no projeto (warps, sons, objetos de hitbox...).
      if(step.actionId === 'goto_warp'){
        const warpObjs = (Project.data?.hitboxObjects || []).filter(o => o.kind === 'warp');
        fields += `<select onchange="PROGRAM.updateStep('${rule.id}',${idx},'targetId',this.value)" style="${selStyle}">
          <option value="">— warp —</option>${warpObjs.map(o=>`<option value="${o.id}" ${step.targetId===o.id?'selected':''}>🚪 ${o.name}</option>`).join('')}</select>`;
      } else if(step.actionId === 'play_sound'){
        const soundItems = Project.data?.sounds?.items || [];
        fields += `<select onchange="PROGRAM.updateStep('${rule.id}',${idx},'targetId',this.value)" style="${selStyle}">
          <option value="">— som —</option>${soundItems.map(s=>`<option value="${s.id}" ${step.targetId===s.id?'selected':''}>${s.type==='sfx'?'🔊':'🎵'} ${s.name}</option>`).join('')}</select>`;
      } else if(step.actionId === 'toggle_hitbox'){
        const hbObjs = Project.data?.hitboxObjects || [];
        fields += `<select onchange="PROGRAM.updateStep('${rule.id}',${idx},'targetId',this.value)" style="${selStyle}">
          <option value="">— objeto —</option>${hbObjs.map(o=>`<option value="${o.id}" ${step.targetId===o.id?'selected':''}>${o.kind==='dano'?'🔻':'🚪'} ${o.name}</option>`).join('')}</select>`;
      } else if(step.actionId === 'open_menu' || step.actionId === 'close_menu'){
        fields += `<input type="text" placeholder="nome do menu (livre por enquanto)" value="${step.targetId||''}" onchange="PROGRAM.updateStep('${rule.id}',${idx},'targetId',this.value)" style="flex:1;${selStyle}">`;
      } else if(step.actionId === 'custom'){
        fields += `<input type="text" placeholder="descrição livre" value="${step.params||''}" onchange="PROGRAM.updateStep('${rule.id}',${idx},'params',this.value)" style="flex:1;${selStyle}">`;
      }
    }
    return `
      <div style="display:flex;gap:6px;align-items:center;background:#181818;border:1px solid #2a2a2a;border-radius:4px;padding:6px">
        <span style="color:#666;font-size:9px;width:16px">${idx+1}</span>
        <select onchange="PROGRAM.updateStep('${rule.id}',${idx},'type',this.value)" style="background:#000;color:#ffcc00;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">${typeOptions}</select>
        ${fields}
        <div style="margin-left:auto;display:flex;gap:2px">
          <button class="btn-tool" onclick="PROGRAM.moveStep('${rule.id}',${idx},-1)" style="font-size:9px;padding:2px 5px">↑</button>
          <button class="btn-tool" onclick="PROGRAM.moveStep('${rule.id}',${idx},1)" style="font-size:9px;padding:2px 5px">↓</button>
          <button class="btn-tool" onclick="PROGRAM.deleteStep('${rule.id}',${idx})" style="font-size:9px;padding:2px 5px;background:#c0392b;color:#fff">🗑</button>
        </div>
      </div>`;
  }

  function addRule(){
    const name = prompt('Nome da regra:', `regra_${(Project.data?.rules?.length||0)+1}`); if(!name) return;
    if(!Project.data.rules) Project.data.rules = [];
    const r = { id:'rule_'+Date.now(), name: name.trim(), scope:'global', steps:[] };
    Project.data.rules.push(r); selectedRuleId = r.id; renderTab();
  }
  function selectRule(id){ selectedRuleId = id; renderTab(); }
  function renameRule(id, name){ const r=Project.data?.rules?.find(r=>r.id===id); if(r && name.trim()){ r.name=name.trim(); } renderTab(); }
  function setRuleScope(id, scope){ const r=Project.data?.rules?.find(r=>r.id===id); if(r) r.scope=scope; renderTab(); }
  function deleteRule(id){
    if(!confirm('Deletar essa regra?')) return;
    Project.data.rules = (Project.data.rules||[]).filter(r=>r.id!==id);
    if(selectedRuleId===id) selectedRuleId=null;
    renderTab();
  }
  function addStep(ruleId){
    const r = Project.data?.rules?.find(r=>r.id===ruleId); if(!r) return;
    r.steps.push({ type:'if_event', eventId:'' });
    renderTab();
  }
  function updateStep(ruleId, idx, field, value){
    const r = Project.data?.rules?.find(r=>r.id===ruleId); if(!r || !r.steps[idx]) return;
    r.steps[idx][field] = value;
    // tipo ou ação mudou -> o conjunto de campos da linha muda, precisa redesenhar a linha toda
    if(field === 'type' || field === 'actionId') renderTab();
  }
  function moveStep(ruleId, idx, dir){
    const r = Project.data?.rules?.find(r=>r.id===ruleId); if(!r) return;
    const newIdx = idx+dir; if(newIdx<0 || newIdx>=r.steps.length) return;
    [r.steps[idx], r.steps[newIdx]] = [r.steps[newIdx], r.steps[idx]];
    renderTab();
  }
  function deleteStep(ruleId, idx){
    const r = Project.data?.rules?.find(r=>r.id===ruleId); if(!r) return;
    r.steps.splice(idx,1); renderTab();
  }

  return {
    init: buildHTML, setTab,
    addVariable, deleteVariable, onVarTypeChange, saveVariableValue,
    addHitboxObject, deleteHitboxObject, onObjKindChange, saveObjectDamage,
    addEvent, deleteEvent, onEvCategoryChange,
    addMenu, selectMenu, renameMenu, deleteMenu, updateMenuCursor, addMenuItem, updateMenuItem, moveMenuItem, deleteMenuItem,
    addRule, selectRule, renameRule, setRuleScope, deleteRule, addStep, updateStep, moveStep, deleteStep
  };
})();
