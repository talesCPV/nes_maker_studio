// ==========================================
// MÓDULO PERSONAGENS / SPRITES • v0.8 — respeita flips/overlay dos metatiles
// Usa os Metatiles do CHR Editor para montar
// personagens, inimigos e itens em animações.
// ==========================================
const CHAR = (() => {
  let selectedId = null, selectedAnim = 0, selectedFrame = 0;
  let playing = false, playTimer = null;

  const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const data = () => (Project.data.characters ||= []);
  const current = () => data().find(c=>c.id===selectedId);
  const anim = () => current()?.animations?.[selectedAnim];
  const frame = () => anim()?.frames?.[selectedFrame];

  // Personagens antigos só tinham UM hitbox (c.hitbox, criado mas nunca editável).
  // Migra pra uma lista (c.hitboxes) sem descartar o campo antigo - permite várias caixas
  // por personagem (corpo, ataque...), cada uma com seu próprio tipo.
  function ensureHitboxes(c){
    if(!c) return [];
    if(!c.hitboxes){
      c.hitboxes = [{ id:'hb_body', name:'Corpo', type:'body',
        x: c.hitbox?.x ?? 0, y: c.hitbox?.y ?? 0, w: c.hitbox?.w ?? 8, h: c.hitbox?.h ?? 16 }];
    }
    return c.hitboxes;
  }
  const HITBOX_TYPE_COLORS = { body:'#00bcd4', attack:'#e74c3c', hurt:'#f39c12' };

  function buildHTML(){
    const root=document.getElementById('mod-char'); if(!root) return;
    root.innerHTML=`
    <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:hidden">
      <div style="padding:12px 16px;background:#252526;border-bottom:1px solid #333;display:flex;align-items:center;gap:10px">
        <h2 style="font-size:14px;color:#4ec9b0;margin:0">🦸 PERSONAGENS • SPRITE ANIMATION</h2>
        <span style="font-size:10px;color:#666">Metatiles → Frames → Animações</span>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="btn-tool" onclick="CHAR.addCharacter()" style="background:#27ae60;color:#fff">＋ Novo</button>
          <button class="btn-tool" onclick="CHAR.duplicate()" >⧉ Duplicar</button>
          <button class="btn-tool" onclick="CHAR.deleteCharacter()" style="background:#7d2525;color:#fff">🗑 Excluir</button>
          <button class="btn-tool" onclick="CHAR.openTileExport()" style="background:#8e44ad;color:#fff" title="Exportar metatiles + CHR + animações (.tile)">📦 Export .tile</button>
          <button class="btn-tool" onclick="Project.save()" style="background:#27ae60;color:#fff">💾 Salvar .NMS</button>
        </div>
      </div>
      <!-- Modal export .tile -->
      <div id="tileExportModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:10000;align-items:center;justify-content:center">
        <div style="background:#1e1e1e;border:1px solid #444;border-radius:10px;width:min(560px,94vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.6)">
          <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid #333">
            <h3 style="margin:0;font-size:14px;color:#c39bd3">📦 Exportar .tile</h3>
            <span style="font-size:11px;color:#888">CHR + metatiles + animações</span>
            <button class="btn-tool" onclick="CHAR.closeTileExport()" style="margin-left:auto;background:#c0392b;color:#fff">✕</button>
          </div>
          <div style="padding:12px 14px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:10px">
            <div style="font-size:11px;color:#aaa;line-height:1.4">Escolha os metatiles a incluir. O arquivo pode ser importado em <b style="color:#4ec9b0">CHR → Import metatiles</b>.</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn-tool" onclick="CHAR.tileExportSelectAll()" style="font-size:10px">Selecionar todos</button>
              <button class="btn-tool" onclick="CHAR.tileExportSelectNone()" style="font-size:10px">Limpar</button>
              <button class="btn-tool" onclick="CHAR.tileExportSelectUsed()" style="font-size:10px;background:#2980b9;color:#fff">Usados no personagem atual</button>
              <button class="btn-tool" onclick="CHAR.tileExportSelectAllChars()" style="font-size:10px;background:#16a085;color:#fff">Usados em todos os chars</button>
            </div>
            <label style="font-size:11px;color:#888;display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="tileExportIncludeChars" checked> Incluir dados de animação (personagens)
            </label>
            <div id="tileExportMtList" style="max-height:320px;overflow:auto;border:1px solid #333;border-radius:6px;background:#0a0a0a;padding:8px;display:flex;flex-direction:column;gap:4px"></div>
            <div id="tileExportSummary" style="font-size:10px;color:#888"></div>
          </div>
          <div style="padding:12px 14px;border-top:1px solid #333;display:flex;gap:8px;justify-content:flex-end">
            <button class="btn-tool" onclick="CHAR.closeTileExport()">Cancelar</button>
            <button class="btn-tool" onclick="CHAR.confirmTileExport()" style="background:#27ae60;color:#fff;font-weight:600">⬇ Exportar .tile</button>
          </div>
        </div>
      </div>
      <div style="display:flex;flex:1;min-height:0">
        <aside style="width:250px;min-width:250px;background:#181818;border-right:1px solid #333;padding:12px;overflow:auto">
          <div style="font-size:10px;color:#888;margin-bottom:7px">BIBLIOTECA</div>
          <div id="charList"></div>
          <div style="margin-top:14px;padding:9px;background:#111;border:1px solid #333;border-radius:6px;font-size:10px;color:#777;line-height:1.5">
            Cada personagem guarda suas animações dentro do projeto .NMS.
          </div>
        </aside>
        <main style="flex:1;display:flex;flex-direction:column;min-width:0">
          <div id="charToolbar" style="padding:10px;border-bottom:1px solid #333;background:#202020"></div>
          <div style="flex:1;display:flex;min-height:0">
            <section style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#101010;min-width:0">
              <canvas id="charCanvas" width="512" height="384" style="image-rendering:pixelated;max-width:90%;max-height:70%;background:repeating-conic-gradient(#222 0 25%,#191919 0 50%) 50%/20px 20px;border:1px solid #444"></canvas>
              <div id="charPreviewInfo" style="font-size:10px;color:#777;margin-top:8px"></div>
              <div style="display:flex;gap:6px;margin-top:8px">
                <button class="btn-tool" onclick="CHAR.togglePlay()">▶/Ⅱ Preview</button>
                <button class="btn-tool" onclick="CHAR.prevFrame()">◀</button>
                <button class="btn-tool" onclick="CHAR.nextFrame()">▶</button>
              </div>
            </section>
            <aside style="width:330px;min-width:330px;background:#181818;border-left:1px solid #333;padding:12px;overflow:auto">
              <div id="charEditor"></div>
            </aside>
          </div>
        </main>
      </div>
    </div>`;
    render();
  }

  function addCharacter(){
    const name=prompt('Nome do personagem:',`Personagem ${data().length+1}`); if(!name)return;
    const c={id:'char_'+Date.now(),name:name.trim(),type:'player',origin:{x:0,y:0},hitbox:{x:0,y:0,w:8,h:16},
      hitboxes:[{id:'hb_body',name:'Corpo',type:'body',x:0,y:0,w:8,h:16}],
      jumpForceId:null, speedId:null,
      animations:[{id:'idle',name:'Idle',fps:8,loop:true,frames:[]}],created:Date.now()};
    data().push(c); selectedId=c.id; selectedAnim=0; selectedFrame=0; render();
  }

  function addHitbox(){
    const c=current(); if(!c)return;
    const boxes=ensureHitboxes(c);
    const name=prompt('Nome da hitbox:', boxes.length===0?'Corpo':`Hitbox ${boxes.length+1}`); if(!name)return;
    boxes.push({ id:'hb_'+Date.now(), name:name.trim(), type:'body', x:0, y:0, w:8, h:16 });
    render();
  }
  function updateHitboxField(id, field, value){
    const c=current(); if(!c)return;
    const box=ensureHitboxes(c).find(h=>h.id===id); if(!box)return;
    if(field==='name') box.name=value;
    else if(field==='type') box.type=value;
    else box[field]=Math.max(0, Math.min(255, parseInt(value)||0));
    draw();
  }
  function deleteHitbox(id){
    const c=current(); if(!c)return;
    if(!confirm('Remover essa hitbox?'))return;
    c.hitboxes=ensureHitboxes(c).filter(h=>h.id!==id);
    render();
  }
  function toggleHitboxAnimExclusive(id, checked){
    const c=current(), a=anim(); if(!c||!a)return;
    const hb=ensureHitboxes(c).find(h=>h.id===id); if(!hb)return;
    hb.animId = checked ? a.id : null;
    render();
  }
  function duplicate(){
    const c=current(); if(!c)return;
    const n=JSON.parse(JSON.stringify(c)); n.id='char_'+Date.now(); n.name=c.name+' Copy'; data().push(n); selectedId=n.id; render();
  }
  function deleteCharacter(){
    if(!current()||!confirm(`Excluir "${current().name}"?`))return;
    const i=data().findIndex(c=>c.id===selectedId); data().splice(i,1); selectedId=data()[0]?.id||null; selectedAnim=selectedFrame=0; stop(); render();
  }
  function setField(path,val){
    const c=current(); if(!c)return;
    if(path==='name')c.name=val;
    if(path==='type')c.type=val;
    if(path==='jumpForceId')c.jumpForceId=val||null;
    if(path==='speedId')c.speedId=val||null;
    if(path==='fps')anim().fps=Math.max(1,Math.min(60,+val||8));
    if(path==='loop')anim().loop=!!val;
    renderList();
  }
  function addAnim(){
    const c=current(); if(!c)return;
    const name=prompt('Nome da animação:',`Animação ${c.animations.length+1}`); if(!name)return;
    c.animations.push({id:'anim_'+Date.now(),name:name.trim(),fps:8,loop:true,frames:[]});
    selectedAnim=c.animations.length-1; selectedFrame=0; render();
  }
  function removeAnim(){
    const c=current(); if(!c||c.animations.length<=1)return;
    c.animations.splice(selectedAnim,1); selectedAnim=Math.max(0,selectedAnim-1); selectedFrame=0; render();
  }
  function addFrame(){
    const a=anim(); if(!a)return;
    const mts=CHR.getMetatiles?.()||[];
    if(!mts.length){alert('Crie primeiro um Metatile no CHR Editor.');return;}
    const id=prompt('ID do Metatile para o frame:',mts[0].id);
    if(!id)return;
    const mt=mts.find(x=>x.id===id); if(!mt){alert('Metatile não encontrado.');return;}
    a.frames.splice(selectedFrame+1,0,{metatileId:mt.id,duration:Math.max(1,Math.round(60/(a.fps||8))),offsetX:0,offsetY:0});
    selectedFrame++; render();
  }
  function removeFrame(){
    const a=anim(); if(!a||!a.frames.length)return;
    a.frames.splice(selectedFrame,1); selectedFrame=Math.max(0,selectedFrame-1); render();
  }
  function moveFrame(dir){
    const a=anim(); if(!a||!a.frames.length)return;
    const j=selectedFrame+dir; if(j<0||j>=a.frames.length)return;
    [a.frames[selectedFrame],a.frames[j]]=[a.frames[j],a.frames[selectedFrame]]; selectedFrame=j; render();
  }
  function selectCharacter(id){selectedId=id;selectedAnim=selectedFrame=0;stop();render();}
  function selectAnim(i){selectedAnim=+i;selectedFrame=0;render();}
  function selectFrame(i){selectedFrame=+i;draw();renderFrameStrip();}

  function getTilePixels(tile){
    const buf=CHR.getBuffer?.(); if(!buf)return new Uint8Array(64);
    const out=new Uint8Array(64), base=(tile&0x1ff)*16;
    for(let y=0;y<8;y++){const p0=buf[base+y]||0,p1=buf[base+y+8]||0;
      for(let x=0;x<8;x++){const bit=7-x;out[y*8+x]=((p0>>bit)&1)|(((p1>>bit)&1)<<1);}}
    return out;
  }
  /** flip: 0=none 1=H 2=V 3=HV — mesmo encoding do CHR editor */
  function drawTileFlipped(ctx, tile, dx, dy, scale, flip, pal){
    if(tile==null || tile<0) return;
    const pix = getTilePixels(tile);
    flip = flip|0;
    const fh = !!(flip & 1), fv = !!(flip & 2);
    for(let y=0;y<8;y++){
      const sy = fv ? (7-y) : y;
      for(let x=0;x<8;x++){
        const sx = fh ? (7-x) : x;
        const c = pix[sy*8+sx];
        if(c===0) continue; // transparente
        ctx.fillStyle = NES_PALETTE[pal[c]??0] || '#000';
        ctx.fillRect(dx + x*scale, dy + y*scale, scale, scale);
      }
    }
    // cor 0 já pulada; se precisar fundo opaco, desenhar 0 antes — metatile base pode querer 0 opaco em alguns casos
  }
  function drawTileFlippedOpaque(ctx, tile, dx, dy, scale, flip, pal){
    if(tile==null || tile<0) return;
    const pix = getTilePixels(tile);
    flip = flip|0;
    const fh = !!(flip & 1), fv = !!(flip & 2);
    for(let y=0;y<8;y++){
      const sy = fv ? (7-y) : y;
      for(let x=0;x<8;x++){
        const sx = fh ? (7-x) : x;
        const c = pix[sy*8+sx];
        ctx.fillStyle = NES_PALETTE[pal[c]??0] || '#000';
        ctx.fillRect(dx + x*scale, dy + y*scale, scale, scale);
      }
    }
  }
  function draw(){
    const cv=document.getElementById('charCanvas'); if(!cv)return;
    const ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.clearRect(0,0,cv.width,cv.height);
    const f=frame(), mts=CHR.getMetatiles?.()||[]; if(!f)return;
    const mt=mts.find(x=>x.id===f.metatileId); if(!mt)return;
    const pals=CHR.getPalettes?.()||[]; const pal=pals[mt.palette||0]||[15,0,16,48];
    const scale=Math.min(12,Math.floor(Math.min(460/(mt.w*8),300/(mt.h*8))))||1;
    const ox=Math.floor((cv.width-mt.w*8*scale)/2)+(f.offsetX||0)*scale;
    const oy=Math.floor((cv.height-mt.h*8*scale)/2)+(f.offsetY||0)*scale;
    const flips = (mt.flips && mt.flips.length === (mt.tiles||[]).length) ? mt.flips : null;
    // base
    for(let ty=0;ty<mt.h;ty++)for(let tx=0;tx<mt.w;tx++){
      const i = ty*mt.w+tx;
      const tile = mt.tiles[i]||0;
      const fl = flips ? (flips[i]|0) : 0;
      drawTileFlippedOpaque(ctx, tile, ox+tx*8*scale, oy+ty*8*scale, scale, fl, pal);
    }
    // overlay (se existir) — cor 0 transparente
    if(mt.overlay && Array.isArray(mt.overlay.tiles)){
      const ov = mt.overlay;
      const opal = pals[ov.palette!=null ? ov.palette : (mt.palette||0)] || pal;
      const odx = (ov.dx|0)*scale, ody = (ov.dy|0)*scale;
      const oflips = (ov.flips && ov.flips.length === ov.tiles.length) ? ov.flips : null;
      for(let ty=0;ty<mt.h;ty++)for(let tx=0;tx<mt.w;tx++){
        const i = ty*mt.w+tx;
        if(i >= ov.tiles.length) continue;
        const tile = ov.tiles[i];
        if(tile==null || tile<0) continue;
        const fl = oflips ? (oflips[i]|0) : 0;
        drawTileFlipped(ctx, tile, ox+tx*8*scale+odx, oy+ty*8*scale+ody, scale, fl, opal);
      }
    }
    ctx.strokeStyle='#4ec9b0';ctx.strokeRect(ox,oy,mt.w*8*scale,mt.h*8*scale);
    const c=current(); const curAnim=anim();
    // Fase 9 (hitbox por animacao): so desenha hitboxes globais (sem animId)
    // + as exclusivas da animacao selecionada agora - feedback visual direto
    // no mesmo preview que ja existia, sem precisar de outro controle.
    (c?ensureHitboxes(c):[]).filter(hb=>!hb.animId || hb.animId===curAnim?.id).forEach(hb=>{
      ctx.strokeStyle=HITBOX_TYPE_COLORS[hb.type]||'#fff';
      ctx.lineWidth=hb.animId?3:2;
      ctx.setLineDash(hb.animId?[4,2]:[]);
      ctx.strokeRect(ox+hb.x*scale, oy+hb.y*scale, hb.w*scale, hb.h*scale);
      ctx.setLineDash([]);
      ctx.lineWidth=1;
    });
    const info=document.getElementById('charPreviewInfo');if(info)info.textContent=`${current()?.name||''} • ${anim()?.name||''} • frame ${selectedFrame+1}/${anim()?.frames.length||0} • ${mt.w}x${mt.h} tiles`;
  }
  function renderList(){
    const el=document.getElementById('charList');if(!el)return;
    el.innerHTML=data().map(c=>`<div onclick="CHAR.selectCharacter('${c.id}')" style="padding:9px;margin-bottom:5px;border:1px solid ${c.id===selectedId?'#4ec9b0':'#333'};background:${c.id===selectedId?'#1e3030':'#111'};border-radius:5px;cursor:pointer">
      <div style="color:#ddd;font-size:12px">${esc(c.name)}</div><div style="font-size:9px;color:#777">${esc(c.type)} • ${c.animations?.length||0} animações</div></div>`).join('')||`<div style="color:#666;font-size:11px;padding:10px">Nenhum personagem.<br>Clique em + Novo.</div>`;
  }
  function renderFrameStrip(){
    const a=anim(),el=document.getElementById('frameStrip');if(!el)return;
    el.innerHTML=(a?.frames||[]).map((f,i)=>{const mt=(CHR.getMetatiles?.()||[]).find(x=>x.id===f.metatileId);return `<button onclick="CHAR.selectFrame(${i})" style="min-width:72px;height:55px;background:${i===selectedFrame?'#294a45':'#111'};border:1px solid ${i===selectedFrame?'#4ec9b0':'#444'};color:#aaa;font-size:9px">F${i+1}<br>${esc(mt?.name||'?')}<br>${f.duration||1}f</button>`}).join('');
  }
  function renderEditor(){
    const el=document.getElementById('charEditor'),c=current(),a=anim();if(!el)return;
    if(!c){el.innerHTML='<div style="color:#666">Selecione ou crie um personagem.</div>';return;}
    const mts=CHR.getMetatiles?.()||[];
    el.innerHTML=`
      <div style="font-size:10px;color:#4ec9b0;margin-bottom:7px">DADOS DO SPRITE</div>
      <label style="font-size:10px;color:#777">Nome</label><input value="${esc(c.name)}" oninput="CHAR.setField('name',this.value)" style="width:100%;box-sizing:border-box;background:#000;color:#fff;border:1px solid #444;padding:6px;margin:3px 0 8px">
      <label style="font-size:10px;color:#777">Tipo</label><select onchange="CHAR.setField('type',this.value)" style="width:100%;background:#000;color:#fff;border:1px solid #444;padding:6px;margin:3px 0 10px">
        ${['player','enemy','item','npc','boss'].map(t=>`<option ${c.type===t?'selected':''} value="${t}">${t}</option>`).join('')}</select>
      <div style="display:flex;gap:7px;margin-bottom:10px">
        <div style="flex:1"><label style="font-size:10px;color:#777">Força de Pulo</label>
          <select onchange="CHAR.setField('jumpForceId',this.value)" style="width:100%;background:#000;color:#fff;border:1px solid #444;padding:6px;box-sizing:border-box">
            <option value="">— nenhuma —</option>
            ${(Project.data.jumpForces||[]).map(f=>`<option value="${f.id}" ${c.jumpForceId===f.id?'selected':''}>${esc(f.name)} (${f.value})</option>`).join('')}
          </select></div>
        <div style="flex:1"><label style="font-size:10px;color:#777">Velocidade</label>
          <select onchange="CHAR.setField('speedId',this.value)" style="width:100%;background:#000;color:#fff;border:1px solid #444;padding:6px;box-sizing:border-box">
            <option value="">— nenhuma —</option>
            ${(Project.data.speedLevels||[]).map(f=>`<option value="${f.id}" ${c.speedId===f.id?'selected':''}>${esc(f.name)} (${f.value})</option>`).join('')}
          </select></div>
      </div>
      ${(!Project.data.jumpForces?.length && !Project.data.speedLevels?.length) ? '<div style="font-size:9px;color:#666;margin:-6px 0 10px">Cadastre níveis em Dashboard pra aparecerem aqui.</div>' : ''}
      <div style="font-size:10px;color:#4ec9b0;margin:10px 0 5px">HITBOXES <span style="color:#666">(desenhadas no preview)</span></div>
      ${ensureHitboxes(c).map(hb=>`
        <div style="background:#111;border:1px solid #333;border-radius:5px;padding:6px;margin-bottom:6px">
          <div style="display:flex;gap:5px;align-items:center;margin-bottom:4px">
            <span style="width:10px;height:10px;border-radius:2px;background:${HITBOX_TYPE_COLORS[hb.type]||'#fff'};flex-shrink:0"></span>
            <input value="${esc(hb.name)}" oninput="CHAR.updateHitboxField('${hb.id}','name',this.value)" style="flex:1;background:#000;color:#fff;border:1px solid #444;padding:4px;font-size:10px">
            <select onchange="CHAR.updateHitboxField('${hb.id}','type',this.value)" style="background:#000;color:#fff;border:1px solid #444;padding:4px;font-size:10px">
              ${['body','attack','hurt'].map(t=>`<option value="${t}" ${hb.type===t?'selected':''}>${t}</option>`).join('')}
            </select>
            <button class="btn-tool" onclick="CHAR.deleteHitbox('${hb.id}')" style="background:#7d2525;color:#fff;font-size:9px;padding:2px 5px">🗑</button>
          </div>
          <div style="display:flex;gap:4px">
            ${['x','y','w','h'].map(f=>`<label style="font-size:9px;color:#777;flex:1">${f.toUpperCase()}<input type="number" min="0" max="255" value="${hb[f]||0}" onchange="CHAR.updateHitboxField('${hb.id}','${f}',this.value)" style="width:100%;background:#000;color:#fff;border:1px solid #444;padding:3px;box-sizing:border-box"></label>`).join('')}
          </div>
          <label style="font-size:9px;color:${hb.animId===a?.id?'#4ec9b0':'#777'};display:block;margin-top:4px"><input type="checkbox" ${hb.animId===a?.id?'checked':''} ${a?'':'disabled'} onchange="CHAR.toggleHitboxAnimExclusive('${hb.id}',this.checked)"> Exclusiva da animação "${esc(a?.name||'')}"${hb.animId && hb.animId!==a?.id ? ` <span style="color:#e67e22">(hoje exclusiva de outra animação)</span>` : ''}</label>
        </div>`).join('')}
      <button class="btn-tool" onclick="CHAR.addHitbox()" style="margin-bottom:10px">＋ Hitbox</button>
      <div style="display:flex;gap:5px;align-items:end"><div style="flex:1"><label style="font-size:10px;color:#777">Animação</label>
        <select onchange="CHAR.selectAnim(this.value)" style="width:100%;background:#000;color:#fff;border:1px solid #444;padding:6px">${c.animations.map((x,i)=>`<option value="${i}" ${i===selectedAnim?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
        <button class="btn-tool" onclick="CHAR.addAnim()">＋</button><button class="btn-tool" onclick="CHAR.removeAnim()">🗑</button></div>
      <div style="display:flex;gap:7px;margin:9px 0">
        <label style="font-size:10px;color:#777;flex:1">FPS<input type="number" min="1" max="60" value="${a?.fps||8}" onchange="CHAR.setField('fps',this.value)" style="width:100%;background:#000;color:#fff;border:1px solid #444;padding:5px;box-sizing:border-box"></label>
        <label style="font-size:10px;color:#777;padding-top:18px"><input type="checkbox" ${a?.loop?'checked':''} onchange="CHAR.setField('loop',this.checked)"> Loop</label>
      </div>
      <div style="font-size:10px;color:#4ec9b0;margin:10px 0 5px">FRAMES</div>
      <div id="frameStrip" style="display:flex;gap:4px;overflow:auto;padding-bottom:7px"></div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">
        <button class="btn-tool" onclick="CHAR.addFrame()">＋ Frame / Metatile</button>
        <button class="btn-tool" onclick="CHAR.removeFrame()">🗑 Frame</button>
        <button class="btn-tool" onclick="CHAR.moveFrame(-1)">←</button><button class="btn-tool" onclick="CHAR.moveFrame(1)">→</button>
      </div>
      <div style="font-size:10px;color:#4ec9b0;margin:8px 0 5px">METATILES DISPONÍVEIS</div>
      <div style="max-height:180px;overflow:auto">${mts.map(m=>`<button onclick="CHAR.useMetatile('${m.id}')" style="display:block;width:100%;text-align:left;background:#111;color:#bbb;border:1px solid #333;padding:6px;margin:3px 0;cursor:pointer">${esc(m.name)} <span style="color:#666">(${m.w}x${m.h}) PT${m.bank||0}</span></button>`).join('')||'<span style="color:#666">Nenhum metatile criado.</span>'}</div>
      ${frame()?`<div style="margin-top:10px;border-top:1px solid #333;padding-top:8px"><div style="font-size:10px;color:#4ec9b0">FRAME SELECIONADO</div>
        <label style="font-size:10px;color:#777">Duração (frames NES)<input type="number" min="1" max="255" value="${frame().duration||1}" onchange="CHAR.setFrameDuration(this.value)" style="width:100%;background:#000;color:#fff;border:1px solid #444;padding:5px;box-sizing:border-box"></label>
      </div>`:''}`;
    renderFrameStrip();
  }
  function useMetatile(id){
    const a=anim();if(!a)return;
    const idx=Math.max(0,selectedFrame);a.frames.splice(idx,0,{metatileId:id,duration:Math.max(1,Math.round(60/(a.fps||8))),offsetX:0,offsetY:0});render();
  }
  function setFrameDuration(v){if(frame())frame().duration=Math.max(1,Math.min(255,+v||1));draw();renderFrameStrip();}
  function render(){
    renderList(); const tb=document.getElementById('charToolbar'),c=current(),a=anim();
    if(tb)tb.innerHTML=c?`<div style="font-size:11px;color:#aaa">${esc(c.name)} / ${esc(a?.name||'')}</div>`:'<div style="color:#666;font-size:11px">Crie um personagem para começar.</div>';
    renderEditor();draw();
  }
  function togglePlay(){if(playing)stop();else{if(!(anim()?.frames?.length))return;playing=true;step();}}
  function stop(){playing=false;if(playTimer)clearTimeout(playTimer);playTimer=null;}
  function step(){if(!playing)return;draw();renderFrameStrip();const a=anim();const ms=1000/(a?.fps||8);playTimer=setTimeout(()=>{selectedFrame=(selectedFrame+1)%a.frames.length;if(!a.loop&&selectedFrame===0){stop();return;}step();},ms);}
  function prevFrame(){stop();const n=anim()?.frames?.length||0;if(n){selectedFrame=(selectedFrame-1+n)%n;render();}}
  function nextFrame(){stop();const n=anim()?.frames?.length||0;if(n){selectedFrame=(selectedFrame+1)%n;render();}}
  function init(){buildHTML();if(!selectedId&&data()[0])selectedId=data()[0].id;render();}
  function loadData(){selectedId=data()[0]?.id||null;selectedAnim=selectedFrame=0;stop();if(document.getElementById('mod-char'))render();}

  // ---------- Export .tile (CHR + metatiles + animações) ----------
  let _tileExportSelected = new Set();

  function getAllMetatiles(){
    if(typeof CHR !== 'undefined' && CHR.getMetatiles) return CHR.getMetatiles() || [];
    return Project.data?.metatiles || [];
  }

  function collectMetatileIdsFromChar(c){
    const ids = new Set();
    (c?.animations || []).forEach(a=>{
      (a.frames || []).forEach(f=>{ if(f.metatileId) ids.add(f.metatileId); });
    });
    return ids;
  }

  function openTileExport(){
    const modal = document.getElementById('tileExportModal');
    if(!modal) return;
    const mts = getAllMetatiles();
    if(!mts.length){
      alert('Nenhum metatile no projeto. Crie metatiles no CHR Editor primeiro.');
      return;
    }
    // Pré-seleciona usados no personagem atual (ou todos se não houver)
    const used = collectMetatileIdsFromChar(current());
    _tileExportSelected = used.size ? used : new Set(mts.map(m=>m.id));
    modal.style.display = 'flex';
    renderTileExportList();
  }

  function closeTileExport(){
    const modal = document.getElementById('tileExportModal');
    if(modal) modal.style.display = 'none';
  }

  function renderTileExportList(){
    const cont = document.getElementById('tileExportMtList');
    const sum = document.getElementById('tileExportSummary');
    if(!cont) return;
    const mts = getAllMetatiles();
    cont.innerHTML = mts.map(m=>{
      const on = _tileExportSelected.has(m.id);
      return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;background:${on?'#1a2a3a':'#111'};border:1px solid ${on?'#007acc':'#333'}">
        <input type="checkbox" ${on?'checked':''} onchange="CHAR.tileExportToggle('${m.id}',this.checked)">
        <span style="flex:1;font-size:11px;color:#ddd">${esc(m.name||m.id)}</span>
        <span style="font-size:9px;color:#666">${m.w||1}×${m.h||1} · PT${m.bank||0}</span>
      </label>`;
    }).join('') || '<div style="color:#666;font-size:11px;padding:8px">Nenhum metatile</div>';
    if(sum) sum.textContent = `${_tileExportSelected.size} de ${mts.length} metatile(s) selecionado(s)`;
  }

  function tileExportToggle(id, on){
    if(on) _tileExportSelected.add(id);
    else _tileExportSelected.delete(id);
    renderTileExportList();
  }
  function tileExportSelectAll(){
    getAllMetatiles().forEach(m=>_tileExportSelected.add(m.id));
    renderTileExportList();
  }
  function tileExportSelectNone(){
    _tileExportSelected.clear();
    renderTileExportList();
  }
  function tileExportSelectUsed(){
    _tileExportSelected = collectMetatileIdsFromChar(current());
    renderTileExportList();
  }
  function tileExportSelectAllChars(){
    const ids = new Set();
    data().forEach(c=> collectMetatileIdsFromChar(c).forEach(id=>ids.add(id)));
    _tileExportSelected = ids;
    renderTileExportList();
  }

  function confirmTileExport(){
    const mts = getAllMetatiles().filter(m=>_tileExportSelected.has(m.id));
    if(!mts.length){ alert('Selecione ao menos um metatile.'); return; }

    // CHR buffer (array de bytes) — mesmo formato que o .nms usa no import
    let chrArr = [];
    if(typeof CHR !== 'undefined' && CHR.getBuffer){
      const buf = CHR.getBuffer();
      chrArr = Array.from(buf);
    } else if(Project.data?.chr){
      chrArr = Array.isArray(Project.data.chr) ? [...Project.data.chr] : Array.from(Project.data.chr);
    }
    if(!chrArr.length){ alert('Buffer CHR vazio — nada para exportar.'); return; }

    // Metatiles serializados (cópia limpa)
    const metatiles = mts.map(m=>({
      id: m.id,
      name: m.name || m.id,
      w: m.w || 1,
      h: m.h || 1,
      bank: m.bank || 0,
      tiles: Array.isArray(m.tiles) ? [...m.tiles] : [],
      flips: Array.isArray(m.flips) ? [...m.flips] : [],
      palette: m.palette != null ? m.palette : 0,
      collisions: Array.isArray(m.collisions) ? [...m.collisions] : undefined,
      overlay: m.overlay ? JSON.parse(JSON.stringify(m.overlay)) : undefined,
      defaultHitboxObjectId: m.defaultHitboxObjectId || null
    }));

    const includeChars = document.getElementById('tileExportIncludeChars')?.checked !== false;
    let characters = [];
    if(includeChars){
      const mtIds = new Set(mts.map(m=>m.id));
      characters = data().map(c=>{
        // filtra frames cujo metatile não está no export
        const anims = (c.animations||[]).map(a=>({
          id: a.id,
          name: a.name,
          fps: a.fps,
          loop: a.loop !== false,
          frames: (a.frames||[])
            .filter(f=>mtIds.has(f.metatileId))
            .map(f=>({
              metatileId: f.metatileId,
              duration: f.duration||1,
              offsetX: f.offsetX||0,
              offsetY: f.offsetY||0
            }))
        })).filter(a=>a.frames.length);
        if(!anims.length) return null;
        return {
          id: c.id,
          name: c.name,
          type: c.type,
          origin: c.origin ? {...c.origin} : {x:0,y:0},
          hitboxes: ensureHitboxes(c).map(h=>({...h})),
          jumpForceId: c.jumpForceId||null,
          speedId: c.speedId||null,
          animations: anims
        };
      }).filter(Boolean);
    }

    const doc = {
      format: 'tile',
      version: 1,
      exportedAt: new Date().toISOString(),
      app: 'NES Maker Studio',
      name: current()?.name || Project.data?.name || 'tiles',
      chr: chrArr,
      metatiles,
      characters
    };

    closeTileExport();

    // Só biblioteca no servidor — download fica no dashboard
    if(typeof AssetLibrary !== 'undefined' && AssetLibrary.save){
      AssetLibrary.save('tile', doc, { name: doc.name }).then(r=>{
        if(typeof Project !== 'undefined' && Project.status){
          Project.status(
            `Biblioteca: "${r.name || doc.name}" · ${metatiles.length} metatile(s)` +
            (characters.length ? ` + ${characters.length} personagem(ns)` : '')
          );
        }
      }).catch(err=>{
        const msg = err && err.message ? err.message : 'erro ao salvar';
        alert('Não foi possível salvar na biblioteca.\n' + msg + '\n(É preciso estar logado.)');
      });
      return;
    }
    alert('Biblioteca indisponível (AssetLibrary).');
  }

  return {
    init, loadData, render, addCharacter, duplicate, deleteCharacter, selectCharacter, selectAnim, selectFrame,
    addAnim, removeAnim, addFrame, removeFrame, moveFrame, useMetatile, setFrameDuration, setField,
    togglePlay, prevFrame, nextFrame, addHitbox, updateHitboxField, deleteHitbox,
    toggleHitboxAnimExclusive,
    openTileExport, closeTileExport, tileExportToggle, tileExportSelectAll, tileExportSelectNone,
    tileExportSelectUsed, tileExportSelectAllChars, confirmTileExport
  };
})();
