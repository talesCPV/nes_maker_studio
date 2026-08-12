// ==========================================
// MÓDULO DASHBOARD E GERENCIAMENTO DE TRUQUES
// ==========================================

const DASHBOARD = (() => {
  let selectedPhase = null;

  function buildHTML(){
    const root = document.getElementById('mod-dashboard');
    if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:auto">
        <div style="padding:16px 20px;background:#252526;border-bottom:1px solid #333;display:flex;align-items:center;gap:12px">
          <h2 style="font-size:14px;color:#4ec9b0;margin:0">📊 DASHBOARD • Dados do Projeto & Gameplay</h2>
          <div style="margin-left:auto;display:flex;gap:8px">
            <button class="btn-tool" onclick="Project.save()" style="background:#27ae60;color:#fff">💾 Salvar .NMS</button>
            <button class="btn-tool" onclick="DASHBOARD.exportSummary()">📄 Resumo</button>
          </div>
        </div>

        <div style="display:flex;flex:1;gap:0;overflow:hidden;min-height:0">
          <!-- ESQUERDA: Info do projeto e Game Config / Cheats -->
          <div style="width:380px;min-width:380px;background:#181818;border-right:1px solid #333;padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto">
            <div style="background:#111;border:1px solid #333;border-radius:8px;padding:12px">
              <h3 style="font-size:11px;color:#4ec9b0;margin-bottom:10px">📝 INFORMAÇÕES DO JOGO</h3>
              <label style="font-size:11px;color:#888">Nome do Projeto</label>
              <input id="dashProjName" type="text" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:8px;margin:4px 0 10px;font-size:13px" placeholder="Meu Jogo">
              
              <label style="font-size:11px;color:#888">Autor / Estúdio</label>
              <input id="dashAuthor" type="text" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;margin:4px 0 10px;font-size:12px" placeholder="Seu nome">

              <label style="font-size:11px;color:#888">Gênero</label>
              <select id="dashGenre" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;margin:4px 0 10px;font-size:12px">
                <option value="platformer">Platformer (Super Mario)</option>
                <option value="shmup">Shmup (1942, Gradius)</option>
                <option value="beatemup">Beat 'em Up (Double Dragon)</option>
                <option value="fighting">Luta (Street Fighter)</option>
                <option value="topdown">Top-Down (Zelda)</option>
                <option value="puzzle">Puzzle (Tetris-like)</option>
                <option value="rpg">RPG</option>
                <option value="other">Outro</option>
              </select>

              <!-- NOVOS CAMPOS DE GAMEPLAY -->
              <div style="display:flex;gap:8px;margin:4px 0 10px">
                <div style="flex:1">
                  <label style="font-size:10px;color:#888">Vidas Iniciais</label>
                  <input id="dashLives" type="number" min="1" max="99" value="3" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                </div>
                <div style="flex:1">
                  <label style="font-size:10px;color:#888">Continues</label>
                  <input id="dashContinues" type="number" min="0" max="9" value="3" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                </div>
                <div style="flex:1">
                  <label style="font-size:10px;color:#888">Energia (HP)</label>
                  <input id="dashEnergy" type="number" min="1" max="255" value="16" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                </div>
              </div>

              <label style="font-size:11px;color:#888">Descrição</label>
              <textarea id="dashDesc" style="width:100%;height:60px;background:#000;color:#ccc;border:1px solid #444;border-radius:4px;padding:6px;margin:4px 0;font-size:11px;resize:vertical" placeholder="Sobre o jogo..."></textarea>

              <div style="display:flex;gap:8px;margin-top:8px">
                <div style="flex:1">
                  <label style="font-size:10px;color:#666">Mapper Padrão</label>
                  <select id="dashMapper" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                    <option value="0">NROM (0) - 32KB</option>
                    <option value="1">MMC1 (1) - 256KB</option>
                    <option value="2">UNROM (2) - Bankswitch</option>
                    <option value="3">CNROM (3)</option>
                    <option value="4">MMC3 (4) - Avançado</option>
                    <option value="7">AxROM (7)</option>
                  </select>
                </div>
                <div style="flex:1">
                  <label style="font-size:10px;color:#666">Mirroring</label>
                  <select id="dashMirror" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical</option>
                    <option value="four">4-Screen</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- SEÇÃO DE TRUQUES / CHEATS -->
            <div style="background:#1a1111;border:1px solid #4a2a2a;border-radius:8px;padding:12px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <h3 style="font-size:11px;color:#ff6666;margin:0">🕹 TRUQUES (Splash Screen)</h3>
                <button type="button" class="btn-tool" onclick="DASHBOARD.addCheat()" style="background:#c0392b;color:#fff;font-size:10px;padding:2px 6px">+ Novo Truque</button>
              </div>
              <div id="cheatsList" style="display:flex;flex-direction:column;gap:6px;max-height:140px;overflow:auto">
                <!-- Preenchido via JS -->
              </div>
            </div>

            <div style="background:#1a1a2e;border:1px solid #2a2a4a;border-radius:8px;padding:12px">
              <h3 style="font-size:11px;color:#8585ff;margin-bottom:8px">📦 ESTATÍSTICAS</h3>
              <div id="dashStats" style="font-size:11px;color:#999;line-height:1.6">
                CHR: 8KB<br>Metatiles: 0<br>Backgrounds: 0<br>Fases: 0
              </div>
            </div>
          </div>

          <!-- CENTRO: Fases -->
          <div style="flex:1;background:#1e1e1e;padding:16px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;gap:12px">
              <h3 style="font-size:12px;color:#4ec9b0;margin:0">🎮 FASES DO JOGO</h3>
              <span style="font-size:11px;color:#666" id="dashPhaseCount">0 fases</span>
              <button class="btn-tool" onclick="DASHBOARD.addPhase()" style="margin-left:auto;background:#27ae60;color:#fff;padding:6px 14px">+ Nova Fase</button>
            </div>

            <div style="background:#252526;border:1px solid #333;border-radius:6px;padding:8px;display:flex;gap:8px;flex-wrap:wrap">
              <div style="font-size:10px;color:#888;display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:#4ec9b0;display:inline-block;border-radius:2px"></span> Gravidade</div>
              <div style="font-size:10px;color:#888;display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:#ffcc00;display:inline-block;border-radius:2px"></span> Bankswitch</div>
              <div style="font-size:10px;color:#888;display:flex;align-items:center;gap:6px"><span style="width:10px;height:10px;background:#8585ff;display:inline-block;border-radius:2px"></span> Scroll</div>
            </div>

            <div id="phasesList" style="display:flex;flex-direction:column;gap:10px"></div>

            <div id="noPhases" style="display:none;padding:40px;text-align:center;background:#111;border:1px dashed #444;border-radius:8px">
              <div style="font-size:32px;margin-bottom:12px">🗺</div>
              <div style="font-size:13px;color:#888;margin-bottom:8px">Nenhuma fase criada</div>
              <div style="font-size:11px;color:#666">Clique em "+ Nova Fase" para começar</div>
            </div>
          </div>

          <!-- DIREITA: Preview / Detalhe da fase selecionada -->
          <div style="width:320px;min-width:320px;background:#181818;border-left:1px solid #333;padding:16px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <h3 style="font-size:11px;color:#4ec9b0">⚙ DETALHES DA FASE</h3>
            <div id="phaseDetail" style="font-size:11px;color:#666">
              Selecione uma fase para editar
            </div>

            <div style="margin-top:12px;background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#888;margin-bottom:6px">GLOSSÁRIO GRAVITY</h4>
              <div style="font-size:10px;color:#666;line-height:1.5">
                <b style="color:#ffcc00">None:</b> shmup, top-down, puzzle.<br>
                <b style="color:#4ec9b0">Down ↓:</b> platformer clássico.<br>
                <b style="color:#8585ff">Up ↑:</b> gravidade invertida.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    attachEvents();
    loadData();
    renderPhases();
    renderCheats();
  }

  function attachEvents(){
    const nameEl = document.getElementById('dashProjName');
    const authorEl = document.getElementById('dashAuthor');
    const genreEl = document.getElementById('dashGenre');
    const descEl = document.getElementById('dashDesc');
    const mapperEl = document.getElementById('dashMapper');
    const mirrorEl = document.getElementById('dashMirror');
    const livesEl = document.getElementById('dashLives');
    const continuesEl = document.getElementById('dashContinues');
    const energyEl = document.getElementById('dashEnergy');

    if(nameEl) nameEl.addEventListener('input', e=>{ if(Project.data){ Project.data.name=e.target.value; Project.updateUI(); } });
    if(authorEl) authorEl.addEventListener('input', e=>{ if(Project.data) Project.data.author=e.target.value; });
    if(genreEl) genreEl.addEventListener('change', e=>{ if(Project.data) Project.data.genre=e.target.value; });
    if(descEl) descEl.addEventListener('input', e=>{ if(Project.data) Project.data.description=e.target.value; });
    if(mapperEl) mapperEl.addEventListener('change', e=>{ if(Project.data) Project.data.mapper=parseInt(e.target.value); });
    if(mirrorEl) mirrorEl.addEventListener('change', e=>{ if(Project.data) Project.data.mirroring=e.target.value; });

    const updateConfig = () => {
      if(!Project.data) return;
      if(!Project.data.gameConfig) Project.data.gameConfig = {};
      Project.data.gameConfig.lives = parseInt(livesEl?.value) || 3;
      Project.data.gameConfig.continues = parseInt(continuesEl?.value) || 3;
      Project.data.gameConfig.energy = parseInt(energyEl?.value) || 16;
    };

    if(livesEl) livesEl.addEventListener('input', updateConfig);
    if(continuesEl) continuesEl.addEventListener('input', updateConfig);
    if(energyEl) energyEl.addEventListener('input', updateConfig);
  }

  function loadData(){
    if(!Project.data) return;
    const nameEl=document.getElementById('dashProjName');
    const authorEl=document.getElementById('dashAuthor');
    const genreEl=document.getElementById('dashGenre');
    const descEl=document.getElementById('dashDesc');
    const mapperEl=document.getElementById('dashMapper');
    const mirrorEl=document.getElementById('dashMirror');
    const livesEl=document.getElementById('dashLives');
    const continuesEl=document.getElementById('dashContinues');
    const energyEl=document.getElementById('dashEnergy');

    if(nameEl) nameEl.value=Project.data.name||'Meu Jogo';
    if(authorEl) authorEl.value=Project.data.author||'';
    if(genreEl) genreEl.value=Project.data.genre||'platformer';
    if(descEl) descEl.value=Project.data.description||'';
    if(mapperEl) mapperEl.value=Project.data.mapper||0;
    if(mirrorEl) mirrorEl.value=Project.data.mirroring||'horizontal';

    if(Project.data.gameConfig){
      if(livesEl) livesEl.value = Project.data.gameConfig.lives || 3;
      if(continuesEl) continuesEl.value = Project.data.gameConfig.continues || 3;
      if(energyEl) energyEl.value = Project.data.gameConfig.energy || 16;
    }
    updateStats();
  }

  function updateStats(){
    const el=document.getElementById('dashStats');
    if(!el) return;
    const chrLen = Project.data?.chr?.length||8192;
    const mtCount = Project.data?.metatiles?.length||0;
    const bgCount = Project.data?.backgrounds?.length||0;
    const phaseCount = Project.data?.phases?.length||0;
    const splashCount = Project.data?.splashScreens?.length||0;
    el.innerHTML = `CHR: ${(chrLen/1024)}KB<br>Metatiles: ${mtCount}<br>Backgrounds: ${bgCount}<br>Splash: ${splashCount}<br>Fases: ${phaseCount}`;
  }

  function renderCheats(){
    const list = document.getElementById('cheatsList');
    if(!list) return;
    const cheats = Project.data?.cheats || [];
    if(cheats.length === 0){
      list.innerHTML = `<div style="font-size:10px;color:#666;text-align:center;padding:6px">Nenhum truque cadastrado</div>`;
      return;
    }
    list.innerHTML = '';
    
    const nesButtons = [
      "P1-UP", "P1-DOWN", "P1-LEFT", "P1-RIGHT", "P1-A", "P1-B", "P1-START", "P1-SELECT",
      "P2-UP", "P2-DOWN", "P2-LEFT", "P2-RIGHT", "P2-A", "P2-B", "P2-START", "P2-SELECT"
    ];

    cheats.forEach((cheat, idx) => {
      if(!cheat.effect) cheat.effect = 'lives';
      if(cheat.value === undefined) cheat.value = 99;
      if(!cheat.sequence) cheat.sequence = [];

      const div = document.createElement('div');
      div.style.cssText = 'background:#111;border:1px solid #333;border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px;font-size:10px;color:#ccc;margin-bottom:6px';
      
      div.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
          <b style="color:#ffcc00;font-size:11px">${cheat.name}</b>
          <button type="button" class="btn-tool" onclick="DASHBOARD.deleteCheat(${idx})" style="background:#c0392b;color:#fff;padding:2px 6px;font-size:9px;border:none;border-radius:4px;cursor:pointer">🗑 Excluir</button>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <select onchange="DASHBOARD.updateCheatProp(${idx}, 'effect', this.value)" style="flex:2;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">
            <option value="lives" ${cheat.effect==='lives'?'selected':''}>Vidas</option>
            <option value="continues" ${cheat.effect==='continues'?'selected':''}>Continues</option>
            <option value="energy" ${cheat.effect==='energy'?'selected':''}>Barra de Energia (HP)</option>
            <option value="weapons" ${cheat.effect==='weapons'?'selected':''}>Armas Especiais</option>
            <option value="level" ${cheat.effect==='level'?'selected':''}>Seleção de Fase</option>
          </select>
          <input type="text" value="${cheat.value}" oninput="DASHBOARD.updateCheatProp(${idx}, 'value', this.value)" title="0 ou * para infinito" style="flex:1;background:#000;color:#4ec9b0;border:1px solid #444;border-radius:4px;padding:4px;text-align:center;font-size:10px" placeholder="Qtd (* = inf)">
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="text" readonly value="${cheat.sequence.join(' ')}" style="flex:2;background:#050505;color:#888;border:1px solid #333;border-radius:4px;padding:4px;font-size:9px" placeholder="Sequência gravada">
          <select id="btnSelect_${idx}" style="flex:2;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:4px;font-size:10px">
            ${nesButtons.map(b => `<option value="${b}">${b}</option>`).join('')}
          </select>
          <button type="button" class="btn-tool" onclick="DASHBOARD.appendCheatBtn(${idx})" style="background:#27ae60;color:#fff;padding:4px 8px;font-size:10px;border:none;border-radius:4px;cursor:pointer">+ Botão</button>
          <button type="button" class="btn-tool" onclick="DASHBOARD.clearCheatBtns(${idx})" style="background:#444;color:#fff;padding:4px 6px;font-size:9px;border:none;border-radius:4px;cursor:pointer" title="Limpar Sequência">Limpar</button>
        </div>
      `;
      list.appendChild(div);
    });
  }

  function addCheat(){
    const name = prompt("Digite o nome do truque (ex: Super Pulo, Vidas Infinitas):", "Truque Secreto");
    if(!name) return;
    if(!Project.data.cheats) Project.data.cheats = [];
    Project.data.cheats.push({
      name: name.trim(),
      effect: 'lives',
      value: '*',
      sequence: []
    });
    renderCheats();
    Project.status("Novo truque criado");
  }

  function updateCheatProp(idx, prop, val){
    if(!Project.data.cheats[idx]) return;
    Project.data.cheats[idx][prop] = val;
    Project.status("Truque atualizado");
  }

  function appendCheatBtn(idx){
    const selectEl = document.getElementById(`btnSelect_${idx}`);
    if(!selectEl || !Project.data.cheats[idx]) return;
    const btn = selectEl.value;
    if(!Project.data.cheats[idx].sequence) Project.data.cheats[idx].sequence = [];
    Project.data.cheats[idx].sequence.push(btn);
    renderCheats();
    Project.status("Botão adicionado à sequência");
  }

  function clearCheatBtns(idx){
    if(!Project.data.cheats[idx]) return;
    Project.data.cheats[idx].sequence = [];
    renderCheats();
    Project.status("Sequência limpa");
  }

  function deleteCheat(idx){
    if(!Project.data.cheats) return;
    Project.data.cheats.splice(idx, 1);
    renderCheats();
    Project.status("Truque removido");
  }
  
  function renderPhases(){
    const list=document.getElementById('phasesList');
    const noPhases=document.getElementById('noPhases');
    const countEl=document.getElementById('dashPhaseCount');
    if(!list) return;
    const phases = Project.data?.phases||[];
    if(countEl) countEl.textContent=`${phases.length} fase${phases.length!==1?'s':''}`;
    if(phases.length===0){
      list.innerHTML=''; if(noPhases) noPhases.style.display='block'; updateStats(); return;
    }
    if(noPhases) noPhases.style.display='none';
    list.innerHTML='';
    phases.forEach((phase, idx)=>{
      const div=document.createElement('div');
      div.style.cssText='background:#252526;border:1px solid #444;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;cursor:pointer';
      if(selectedPhase===idx) div.style.borderColor='#ffcc00';
      div.onclick=()=>selectPhase(idx);
      const gravityIcon = { none:'🚀', down:'⬇', up:'⬆', left:'⬅', right:'➡', custom:'⚙' }[phase.gravity]||'⬇';
      const mapperLabel = {0:'NROM',1:'MMC1',2:'UNROM',3:'CNROM',4:'MMC3',7:'AxROM'}[phase.mapper]||'NROM';
      div.innerHTML=`
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;background:#111;border:1px solid #333;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px">${gravityIcon}</div>
          <div style="flex:1">
            <div style="font-size:12px;color:#fff;font-weight:bold">${phase.name||'Fase '+(idx+1)} <span style="font-size:10px;color:#888">#${idx+1}</span></div>
            <div style="font-size:10px;color:#999">${phase.description||'Sem descrição'}</div>
          </div>
          <div style="display:flex;gap:4px">
            <span style="font-size:9px;background:#332a00;color:#ffcc00;padding:2px 6px;border-radius:3px;border:1px solid #665500">${mapperLabel}</span>
            <span style="font-size:9px;background:#002a1a;color:#4ec9b0;padding:2px 6px;border-radius:3px;border:1px solid #004422">${phase.gravity} ${gravityIcon}</span>
          </div>
        </div>
      `;
      list.appendChild(div);
    });
    updateStats();
  }

  function addPhase(){
    const name = prompt("Nome da fase:", `Fase ${(Project.data?.phases?.length||0)+1}`);
    if(!name) return;
    if(!Project.data.phases) Project.data.phases=[];
    const phase = {
      id: 'phase_'+Date.now(),
      name: name.trim(),
      description: '',
      mapper: Project.data.mapper||0,
      bank: 0,
      gravity: 'down',
      gravityStrength: 4,
      scroll: 'static',
      background: '',
      splash: '',
      created: Date.now()
    };
    Project.data.phases.push(phase);
    renderPhases();
    selectPhase(Project.data.phases.length-1);
    Project.status(`Fase "${name}" criada`);
  }

  function selectPhase(idx){
    selectedPhase = idx;
    const phase = Project.data.phases[idx];
    if(!phase) return;
    renderPhases();
    const detail=document.getElementById('phaseDetail');
    if(!detail) return;
    detail.innerHTML=`
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <label style="font-size:10px;color:#888">Nome</label>
          <input id="editPhaseName" type="text" value="${phase.name}" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px">
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn-tool" onclick="DASHBOARD.savePhaseDetail()" style="flex:1;background:#27ae60;color:#fff">💾 Salvar Fase</button>
          <button class="btn-tool" onclick="DASHBOARD.deletePhase(${idx})" style="background:#c0392b;color:#fff">🗑 Deletar</button>
        </div>
      </div>
    `;
  }

  function savePhaseDetail(){
    if(selectedPhase===null) return;
    const phase = Project.data.phases[selectedPhase];
    if(!phase) return;
    phase.name = document.getElementById('editPhaseName')?.value||phase.name;
    renderPhases();
    Project.status(`Fase ${phase.name} salva`);
  }

  function editPhase(idx){ selectPhase(idx); }
  function deletePhase(idx){
    if(!confirm(`Deletar fase "${Project.data.phases[idx]?.name}"?`)) return;
    Project.data.phases.splice(idx,1);
    if(selectedPhase===idx) selectedPhase=null;
    renderPhases();
    document.getElementById('phaseDetail').innerHTML='Selecione uma fase';
  }

  function exportSummary(){
    const data = Project.data;
    let txt = `Projeto: ${data.name}\nAutor: ${data.author}\nGênero: ${data.genre}\nMapper: ${data.mapper}\nFases: ${data.phases?.length||0}\n\n`;
    (data.phases||[]).forEach((p,i)=>{
      txt += `Fase ${i+1}: ${p.name}\n`;
    });
    const blob=new Blob([txt],{type:'text/plain'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=(data.name||'projeto')+'_resumo.txt'; a.click();
  }

  return { 
    init(){ buildHTML(); }, 
    renderPhases, 
    addPhase, 
    editPhase, 
    deletePhase, 
    selectPhase, 
    savePhaseDetail, 
    exportSummary, 
    addCheat, 
    deleteCheat,
    updateCheatProp,
    appendCheatBtn,
    clearCheatBtns,
    getPhases(){ return Project.data?.phases||[]; }, 
    loadPhases(arr){ if(Project.data) Project.data.phases=arr||[]; renderPhases(); }, 
    get selectedPhase(){ return selectedPhase; } 
  };
})();
