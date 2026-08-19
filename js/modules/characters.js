// ==========================================
// MÓDULO PERSONAGENS / SPRITES • v0.7
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
          <button class="btn-tool" onclick="Project.save()" style="background:#27ae60;color:#fff">💾 Salvar .NMS</button>
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
  function draw(){
    const cv=document.getElementById('charCanvas'); if(!cv)return;
    const ctx=cv.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.clearRect(0,0,cv.width,cv.height);
    const f=frame(), mts=CHR.getMetatiles?.()||[]; if(!f)return;
    const mt=mts.find(x=>x.id===f.metatileId); if(!mt)return;
    const pals=CHR.getPalettes?.()||[]; const pal=pals[mt.palette||0]||[15,0,16,48];
    const scale=Math.min(12,Math.floor(Math.min(460/(mt.w*8),300/(mt.h*8))))||1;
    const ox=Math.floor((cv.width-mt.w*8*scale)/2)+(f.offsetX||0)*scale;
    const oy=Math.floor((cv.height-mt.h*8*scale)/2)+(f.offsetY||0)*scale;
    for(let ty=0;ty<mt.h;ty++)for(let tx=0;tx<mt.w;tx++){
      const tile=mt.tiles[ty*mt.w+tx]||0,pix=getTilePixels(tile);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){const c=pix[y*8+x];ctx.fillStyle=NES_PALETTE[pal[c]??0];ctx.fillRect(ox+(tx*8+x)*scale,oy+(ty*8+y)*scale,scale,scale);}
    }
    ctx.strokeStyle='#4ec9b0';ctx.strokeRect(ox,oy,mt.w*8*scale,mt.h*8*scale);
    const c=current();
    (c?ensureHitboxes(c):[]).forEach(hb=>{
      ctx.strokeStyle=HITBOX_TYPE_COLORS[hb.type]||'#fff';
      ctx.lineWidth=2;
      ctx.strokeRect(ox+hb.x*scale, oy+hb.y*scale, hb.w*scale, hb.h*scale);
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
  return {init,loadData,render,addCharacter,duplicate,deleteCharacter,selectCharacter,selectAnim,selectFrame,addAnim,removeAnim,addFrame,removeFrame,moveFrame,useMetatile,setFrameDuration,setField,togglePlay,prevFrame,nextFrame,addHitbox,updateHitboxField,deleteHitbox};
})();
