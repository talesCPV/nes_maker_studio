// ==========================================
// MÓDULO DASHBOARD E GERENCIAMENTO DE TRUQUES
// v0.7.1 - Bank Switch selector por fase
// ==========================================

const DASHBOARD = (() => {
  let selectedPhase = null;

  function buildHTML(){
    const root = document.getElementById('mod-dashboard');
    if(!root) return;
    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#1e1e1e;overflow:auto">
        <div style="padding:16px 20px;background:#252526;border-bottom:1px solid #333;display:flex;align-items:center;gap:12px">
          <h2 style="font-size:14px;color:#4ec9b0;margin:0">📊 CONFIGURAÇÕES • Dados do Projeto & Gameplay</h2>
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

              <div style="margin:4px 0 10px">
                <label style="font-size:10px;color:#888">Pool de Instâncias (player + inimigos + itens + tiros)</label>
                <input id="dashMaxInstances" type="number" min="1" max="20" value="10" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                <div style="font-size:9px;color:#666;margin-top:4px;line-height:1.4">
                  Reserva <b style="color:#ffcc00" id="dashMaxInstancesBytes">20</b> bytes no início da zero page (2 por slot: X e Y).
                  Mais slots = mais objetos simultâneos na tela, mas menos memória sobra pra variáveis.
                </div>
              </div>

              <div style="margin:10px 0;padding:10px;background:#111;border:1px solid #333;border-radius:6px">
                <label style="font-size:10px;color:#888;display:block;margin-bottom:6px">Tabela de Força de Pulo</label>
                <div style="font-size:9px;color:#666;margin-bottom:6px;line-height:1.4">
                  Níveis nomeados de força de pulo (0-255). Vincule um nível padrão a cada personagem em
                  Personagens; Programação pode trocar o nível em tempo real via Ação (ex: power-up).
                </div>
                <div id="dashJumpForcesList" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px"></div>
                <div style="display:flex;gap:5px">
                  <input id="dashJumpForceName" type="text" placeholder="nome (ex: Pulo Fraco)" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                  <input id="dashJumpForceValue" type="number" min="0" max="255" value="20" placeholder="valor" style="width:70px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                  <button class="btn-tool" onclick="DASHBOARD.addJumpForce()" style="background:#27ae60;color:#fff">+ Adicionar</button>
                </div>
              </div>

              <div style="margin:10px 0;padding:10px;background:#111;border:1px solid #333;border-radius:6px">
                <label style="font-size:10px;color:#888;display:block;margin-bottom:6px">Tabela de Velocidade</label>
                <div style="font-size:9px;color:#666;margin-bottom:6px;line-height:1.4">
                  Mesma ideia da força de pulo, mas pra velocidade de movimento (0-255).
                </div>
                <div id="dashSpeedLevelsList" style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px"></div>
                <div style="display:flex;gap:5px">
                  <input id="dashSpeedLevelName" type="text" placeholder="nome (ex: Andando)" style="flex:1;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                  <input id="dashSpeedLevelValue" type="number" min="0" max="255" value="10" placeholder="valor" style="width:70px;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                  <button class="btn-tool" onclick="DASHBOARD.addSpeedLevel()" style="background:#27ae60;color:#fff">+ Adicionar</button>
                </div>
              </div>

              <label style="font-size:11px;color:#888">Descrição</label>
              <textarea id="dashDesc" style="width:100%;height:60px;background:#000;color:#ccc;border:1px solid #444;border-radius:4px;padding:6px;margin:4px 0;font-size:11px;resize:vertical" placeholder="Sobre o jogo..."></textarea>

              <div style="margin-top:8px">
                <label style="font-size:10px;color:#666">Mapper Padrão</label>
                <select id="dashMapper" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
                  <option value="0">NROM (0) - 32KB</option>
                  <option value="1">MMC1 (1) - 256KB</option>
                  <option value="2">UNROM (2) - Bankswitch</option>
                  <option value="3">CNROM (3) - CHR Bankswitch</option>
                  <option value="4">MMC3 (4) - Avançado</option>
                  <option value="7">AxROM (7)</option>
                </select>
                <div style="font-size:9px;color:#666;margin-top:4px;line-height:1.4">
                  Mirroring agora é definido <b style="color:#aaa">por fase</b>, conforme o tipo de scroll.
                </div>
              </div>

              <div style="margin-top:12px;background:#111;border:1px solid #333;border-radius:6px;padding:10px">
                <label style="font-size:10px;color:#666">Controle do Herói</label>
                <select id="dashControlMode" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px;margin-top:4px">
                  <option value="auto">Automático (joystick move direto, como antes)</option>
                  <option value="programmed">Via Programação (só obedece regras com ação Mover)</option>
                </select>
                <div style="font-size:9px;color:#666;margin-top:4px;line-height:1.4">
                  "Via Programação" desliga o movimento automático pelo direcional/pulo -
                  o herói só anda/pula se uma Regra com a ação <b style="color:#aaa">Mover</b>
                  mandar (use um evento "Segurado" pra movimento contínuo).
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
          <div style="width:340px;min-width:340px;background:#181818;border-left:1px solid #333;padding:16px;overflow:auto;display:flex;flex-direction:column;gap:12px">
            <h3 style="font-size:11px;color:#4ec9b0">⚙ DETALHES DA FASE</h3>
            <div id="phaseDetail" style="font-size:11px;color:#666">
              Selecione uma fase para editar
            </div>

            <div style="margin-top:8px;background:#111;border:1px solid #333;border-radius:6px;padding:10px">
              <h4 style="font-size:10px;color:#888;margin-bottom:6px">ℹ SOBRE BANK SWITCH</h4>
              <div style="font-size:10px;color:#666;line-height:1.5">
                A fase escolhe um <b style="color:#ffcc00">banco de CHR</b> e passa a ter acesso a <b>todas as telas</b> desenhadas nesse banco.<br><br>
                • <b>Bank 1</b> = páginas 0+1 (8KB / 512 tiles)<br>
                • <b>Bank 2</b> = páginas 2+3 (próximos 8KB)<br>
                • etc.<br><br>
                Não se vincula mais uma tela isolada à fase — o banco inteiro fica disponível no Level Design e no editor de Backgrounds.<br><br>
                <b style="color:#ff6666">Atenção:</b> para o bank switch funcionar no console, o Mapper precisa ser <b>CNROM (3)</b> ou superior.
              </div>
            </div>

            <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px">
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
    const livesEl = document.getElementById('dashLives');
    const continuesEl = document.getElementById('dashContinues');
    const energyEl = document.getElementById('dashEnergy');
    const maxInstEl = document.getElementById('dashMaxInstances');
    const controlModeEl = document.getElementById('dashControlMode');

    if(nameEl) nameEl.addEventListener('input', e=>{ if(Project.data){ Project.data.name=e.target.value; Project.updateUI(); } });
    if(authorEl) authorEl.addEventListener('input', e=>{ if(Project.data) Project.data.author=e.target.value; });
    if(genreEl) genreEl.addEventListener('change', e=>{ if(Project.data) Project.data.genre=e.target.value; });
    if(descEl) descEl.addEventListener('input', e=>{ if(Project.data) Project.data.description=e.target.value; });
    if(mapperEl) mapperEl.addEventListener('change', e=>{ if(Project.data) Project.data.mapper=parseInt(e.target.value); });
    if(controlModeEl) controlModeEl.addEventListener('change', e=>{ if(Project.data) Project.data.controlMode=e.target.value; });

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

    if(maxInstEl) maxInstEl.addEventListener('input', () => {
      if(!Project.data) return;
      let n = parseInt(maxInstEl.value); if(isNaN(n)) n = 10;
      n = Math.max(1, Math.min(20, n));
      Project.data.maxInstances = n;
      const bytesEl = document.getElementById('dashMaxInstancesBytes');
      if(bytesEl) bytesEl.textContent = n*2;
    });
  }

  // Tabelas de força de pulo/velocidade - mesmo padrão simples de lista+add usado em outros
  // lugares do projeto (Programação: Variáveis, Objetos...).
  function renderJumpForces(){
    const el = document.getElementById('dashJumpForcesList'); if(!el || !Project.data) return;
    const list = Project.data.jumpForces || [];
    el.innerHTML = list.map(f => `
      <div style="display:flex;gap:6px;align-items:center;background:#000;border:1px solid #333;border-radius:4px;padding:4px 6px">
        <span style="flex:1;color:#fff;font-size:11px">${f.name}</span>
        <span style="color:#4ec9b0;font-size:10px;font-family:monospace">${f.value}</span>
        <button class="btn-tool" onclick="DASHBOARD.deleteJumpForce('${f.id}')" style="background:#7d2525;color:#fff;font-size:9px;padding:2px 5px">🗑</button>
      </div>`).join('') || '<div style="color:#666;font-size:10px">Nenhum nível ainda.</div>';
  }
  function addJumpForce(){
    const nameEl = document.getElementById('dashJumpForceName'); const valEl = document.getElementById('dashJumpForceValue');
    const name = nameEl.value.trim(); if(!name || !Project.data) return;
    if(!Project.data.jumpForces) Project.data.jumpForces = [];
    let v = parseInt(valEl.value); if(isNaN(v)) v = 0; v = Math.max(0, Math.min(255, v));
    Project.data.jumpForces.push({ id:'jf_'+Date.now(), name, value: v });
    nameEl.value = ''; renderJumpForces();
  }
  function deleteJumpForce(id){
    if(!Project.data?.jumpForces) return;
    if(!confirm('Remover esse nível de pulo? Personagens/Regras que o usam ficam com referência quebrada.')) return;
    Project.data.jumpForces = Project.data.jumpForces.filter(f=>f.id!==id);
    renderJumpForces();
  }

  function renderSpeedLevels(){
    const el = document.getElementById('dashSpeedLevelsList'); if(!el || !Project.data) return;
    const list = Project.data.speedLevels || [];
    el.innerHTML = list.map(f => `
      <div style="display:flex;gap:6px;align-items:center;background:#000;border:1px solid #333;border-radius:4px;padding:4px 6px">
        <span style="flex:1;color:#fff;font-size:11px">${f.name}</span>
        <span style="color:#4ec9b0;font-size:10px;font-family:monospace">${f.value}</span>
        <button class="btn-tool" onclick="DASHBOARD.deleteSpeedLevel('${f.id}')" style="background:#7d2525;color:#fff;font-size:9px;padding:2px 5px">🗑</button>
      </div>`).join('') || '<div style="color:#666;font-size:10px">Nenhum nível ainda.</div>';
  }
  function addSpeedLevel(){
    const nameEl = document.getElementById('dashSpeedLevelName'); const valEl = document.getElementById('dashSpeedLevelValue');
    const name = nameEl.value.trim(); if(!name || !Project.data) return;
    if(!Project.data.speedLevels) Project.data.speedLevels = [];
    let v = parseInt(valEl.value); if(isNaN(v)) v = 0; v = Math.max(0, Math.min(255, v));
    Project.data.speedLevels.push({ id:'sp_'+Date.now(), name, value: v });
    nameEl.value = ''; renderSpeedLevels();
  }
  function deleteSpeedLevel(id){
    if(!Project.data?.speedLevels) return;
    if(!confirm('Remover esse nível de velocidade? Personagens/Regras que o usam ficam com referência quebrada.')) return;
    Project.data.speedLevels = Project.data.speedLevels.filter(f=>f.id!==id);
    renderSpeedLevels();
  }

  function loadData(){
    if(!Project.data) return;
    const nameEl=document.getElementById('dashProjName');
    const authorEl=document.getElementById('dashAuthor');
    const genreEl=document.getElementById('dashGenre');
    const descEl=document.getElementById('dashDesc');
    const mapperEl=document.getElementById('dashMapper');
    const livesEl=document.getElementById('dashLives');
    const continuesEl=document.getElementById('dashContinues');
    const energyEl=document.getElementById('dashEnergy');
    const maxInstEl=document.getElementById('dashMaxInstances');

    if(nameEl) nameEl.value=Project.data.name||'Meu Jogo';
    if(authorEl) authorEl.value=Project.data.author||'';
    if(genreEl) genreEl.value=Project.data.genre||'platformer';
    if(descEl) descEl.value=Project.data.description||'';
    if(mapperEl) mapperEl.value=Project.data.mapper||0;
    const controlModeEl=document.getElementById('dashControlMode');
    if(controlModeEl) controlModeEl.value = Project.data.controlMode || 'auto';

    if(Project.data.gameConfig){
      if(livesEl) livesEl.value = Project.data.gameConfig.lives || 3;
      if(continuesEl) continuesEl.value = Project.data.gameConfig.continues || 3;
      if(energyEl) energyEl.value = Project.data.gameConfig.energy || 16;
    }

    const maxInst = Project.data.maxInstances || 10;
    if(maxInstEl) maxInstEl.value = maxInst;
    const bytesEl = document.getElementById('dashMaxInstancesBytes');
    if(bytesEl) bytesEl.textContent = maxInst*2;

    renderJumpForces();
    renderSpeedLevels();

    // Migração: .nms antigos tinham mirroring no nível do projeto.
    // Agora o mirroring vive em cada fase e é derivado do tipo de scroll.
    migratePhasesMirroring();
    updateStats();
  }

  // Derive mirroring a partir do scroll da fase (regra de hardware NES)
  function mirroringFromScroll(scroll){
    if(scroll === 'scroll_v') return 'horizontal'; // scroll vertical → mirroring horizontal
    if(scroll === 'scroll_h') return 'vertical';   // scroll horizontal → mirroring vertical
    return 'vertical'; // static (e qualquer outro) → vertical como padrão
  }

  function migratePhasesMirroring(){
    if(!Project.data?.phases) return;
    const oldGlobal = Project.data.mirroring || 'horizontal';
    Project.data.phases.forEach(p=>{
      // Remove "free" antigo
      if(p.scroll === 'free') p.scroll = 'static';
      if(!p.scroll) p.scroll = 'static';
      // Se a fase ainda não tem mirroring, deriva do scroll (ou usa o global antigo como fallback em static)
      if(!p.mirroring){
        if(p.scroll === 'static' && oldGlobal) p.mirroring = oldGlobal;
        else p.mirroring = mirroringFromScroll(p.scroll);
      }
    });
    // Campo global deixa de ser a fonte da verdade (mantemos por compat, mas não usamos mais)
  }

  function updateStats(){
    const el=document.getElementById('dashStats');
    if(!el) return;
    const chrLen = Project.data?.chr?.length||8192;
    const mtCount = Project.data?.metatiles?.length||0;
    const bgCount = Project.data?.backgrounds?.length||0;
    const phaseCount = Project.data?.phases?.length||0;
    const splashCount = Project.data?.splashScreens?.length||0;
    const banks = Math.max(1, Math.ceil(chrLen / 8192));
    el.innerHTML = `CHR: ${(chrLen/1024)}KB (${banks} banco${banks>1?'s':''})<br>Metatiles: ${mtCount}<br>Backgrounds: ${bgCount}<br>Splash: ${splashCount}<br>Fases: ${phaseCount}`;
  }

  // Quantos bancos de 8KB existem no CHR atual
  function getAvailableBanks(){
    const chrLen = Project.data?.chr?.length || 8192;
    // Cada banco CHR no CNROM é de 8KB (2 páginas de 4KB)
    return Math.max(1, Math.ceil(chrLen / 8192));
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
      // Garante defaults
      if(phase.bank === undefined || phase.bank === null) phase.bank = 0;
      if(phase.mapper === undefined) phase.mapper = Project.data.mapper || 0;
      if(!phase.scroll || phase.scroll === 'free') phase.scroll = 'static';
      if(!phase.gravity) phase.gravity = 'down';
      if(!phase.mirroring) phase.mirroring = mirroringFromScroll(phase.scroll);

      const div=document.createElement('div');
      div.style.cssText='background:#252526;border:1px solid #444;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;cursor:pointer';
      if(selectedPhase===idx) div.style.borderColor='#ffcc00';
      div.onclick=()=>selectPhase(idx);
      const gravityIcon = { none:'🚀', down:'⬇', up:'⬆', left:'⬅', right:'➡', custom:'⚙' }[phase.gravity]||'⬇';
      const scrollLabel = { static:'Static', scroll_h:'Scroll H', scroll_v:'Scroll V' }[phase.scroll] || phase.scroll;
      const mirrorShort = { horizontal:'H-Mirror', vertical:'V-Mirror', four:'4-Screen' }[phase.mirroring] || phase.mirroring;
      const bankNum = (phase.bank ?? 0) + 1; // UI 1-based

      div.innerHTML=`
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;background:#111;border:1px solid #333;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px">${gravityIcon}</div>
          <div style="flex:1">
            <div style="font-size:12px;color:#fff;font-weight:bold">${phase.name||'Fase '+(idx+1)} <span style="font-size:10px;color:#888">#${idx+1}</span></div>
            <div style="font-size:10px;color:#999">${phase.description||'Sem descrição'}</div>
          </div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">
            <span style="font-size:9px;background:#332a00;color:#ffcc00;padding:2px 6px;border-radius:3px;border:1px solid #665500" title="CHR Bank desta fase">Bank ${bankNum}</span>
            <span style="font-size:9px;background:#1a1a2e;color:#8585ff;padding:2px 6px;border-radius:3px;border:1px solid #2a2a4a" title="Scroll → Mirroring">${scrollLabel} · ${mirrorShort}</span>
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
      mirroring: 'vertical', // static → vertical (padrão)
      background: '',
      splash: '',
      levelMap: null,
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

    // Defaults seguros
    if(phase.bank === undefined || phase.bank === null) phase.bank = 0;
    if(phase.mapper === undefined) phase.mapper = Project.data.mapper || 0;
    if(!phase.scroll || phase.scroll === 'free') phase.scroll = 'static';
    if(!phase.gravity) phase.gravity = 'down';
    if(phase.gravityStrength === undefined) phase.gravityStrength = 4;
    if(!phase.mirroring) phase.mirroring = mirroringFromScroll(phase.scroll);

    // Garante que o bank escolhido ainda existe (CHR pode ter encolhido)
    const totalBanks = getAvailableBanks();
    if(phase.bank >= totalBanks) phase.bank = 0;

    const projectMapper = Project.data.mapper || 0;
    const needsBankswitch = totalBanks > 1;
    const mapperOk = projectMapper >= 3; // CNROM ou superior

    // Opções de bank — só mostra os bancos que realmente existem no CHR
    // 1 banco = 2 páginas (8KB / 512 tiles)
    // Numeração na UI começa em 1 (Bank 1, Bank 2...)
    let bankOptions = '';
    for(let b = 0; b < totalBanks; b++){
      const pageA = b * 2;
      const pageB = b * 2 + 1;
      const tiles = 512; // 2 páginas × 256 tiles
      const selected = (phase.bank === b) ? 'selected' : '';
      bankOptions += `<option value="${b}" ${selected}>Bank ${b+1}  —  páginas ${pageA}+${pageB}  (${tiles} tiles / 8KB)</option>`;
    }

    // Aviso de mapper
    let mapperWarning = '';
    if(needsBankswitch && !mapperOk){
      mapperWarning = `
        <div style="background:#3a1a1a;border:1px solid #aa3333;border-radius:4px;padding:8px;font-size:10px;color:#ff8888;line-height:1.4">
          ⚠ Seu CHR tem <b>${totalBanks} banco${totalBanks>1?'s':''}</b>, mas o Mapper atual é <b>${{0:'NROM',1:'MMC1',2:'UNROM'}[projectMapper]||projectMapper}</b>.<br>
          Para o bank switch funcionar no console, mude o <b>Mapper Padrão</b> para <b>CNROM (3)</b> ou superior.
        </div>`;
    } else if(needsBankswitch && mapperOk){
      mapperWarning = `
        <div style="background:#1a2a1a;border:1px solid #2a6a2a;border-radius:4px;padding:8px;font-size:10px;color:#88ff88;line-height:1.4">
          ✓ Mapper compatível — ${totalBanks} banco${totalBanks>1?'s':''} disponível${totalBanks>1?'is':''}.
        </div>`;
    } else {
      mapperWarning = `
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:4px;padding:8px;font-size:10px;color:#888;line-height:1.4">
          Apenas 1 banco (8KB). Use <b>+ BANK</b> no CHR Editor para adicionar mais páginas.
        </div>`;
    }

    const detail=document.getElementById('phaseDetail');
    if(!detail) return;
    detail.innerHTML=`
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <label style="font-size:10px;color:#888">Nome da Fase</label>
          <input id="editPhaseName" type="text" value="${phase.name||''}" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:6px;font-size:12px">
        </div>

        <div>
          <label style="font-size:10px;color:#888">Descrição</label>
          <textarea id="editPhaseDesc" style="width:100%;height:48px;background:#000;color:#ccc;border:1px solid #444;border-radius:4px;padding:6px;font-size:11px;resize:vertical">${phase.description||''}</textarea>
        </div>

        <!-- BANK SWITCH SELECTOR (única escolha de conteúdo gráfico da fase) -->
        <div style="background:#1a1a00;border:1px solid #665500;border-radius:6px;padding:10px">
          <label style="font-size:11px;color:#ffcc00;font-weight:bold;display:block;margin-bottom:6px">🏦 BANCO DE CHR DESTA FASE</label>
          <select id="editPhaseBank" style="width:100%;background:#000;color:#ffcc00;border:1px solid #665500;border-radius:4px;padding:7px;font-size:12px;font-weight:bold">
            ${bankOptions}
          </select>
          <div style="font-size:9px;color:#888;margin-top:6px;line-height:1.45">
            A fase usará <b style="color:#ffcc00">todas as telas</b> (backgrounds + splashes) que forem desenhadas neste banco.<br>
            No Level Design e no módulo de Backgrounds você verá apenas as telas deste banco.
          </div>
        </div>

        ${mapperWarning}

        <div style="display:flex;gap:8px">
          <div style="flex:1">
            <label style="font-size:10px;color:#888">Gravidade</label>
            <select id="editPhaseGravity" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
              <option value="none" ${phase.gravity==='none'?'selected':''}>None (sem gravidade)</option>
              <option value="down" ${phase.gravity==='down'?'selected':''}>Down ↓ (platformer)</option>
              <option value="up" ${phase.gravity==='up'?'selected':''}>Up ↑ (invertida)</option>
              <option value="left" ${phase.gravity==='left'?'selected':''}>Left ←</option>
              <option value="right" ${phase.gravity==='right'?'selected':''}>Right →</option>
            </select>
          </div>
          <div style="width:70px">
            <label style="font-size:10px;color:#888">Força</label>
            <input id="editPhaseGravStr" type="number" min="0" max="16" value="${phase.gravityStrength??4}" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px">
          </div>
        </div>

        <div>
          <label style="font-size:10px;color:#888">Tipo de Scroll / Transição</label>
          <select id="editPhaseScroll" style="width:100%;background:#000;color:#fff;border:1px solid #444;border-radius:4px;padding:5px;font-size:11px" onchange="DASHBOARD.onScrollChange()">
            <option value="static" ${phase.scroll==='static'?'selected':''}>Static (hard-cut entre telas)</option>
            <option value="scroll_h" ${phase.scroll==='scroll_h'?'selected':''}>Scroll Horizontal → Mirroring Vertical</option>
            <option value="scroll_v" ${phase.scroll==='scroll_v'?'selected':''}>Scroll Vertical → Mirroring Horizontal</option>
          </select>
          <div id="editPhaseMirrorInfo" style="font-size:9px;color:#888;margin-top:4px;line-height:1.4">
            Mirroring desta fase: <b style="color:#ffcc00">${phase.mirroring}</b>
            ${phase.scroll==='scroll_h' ? '(necessário para scroll horizontal)' :
              phase.scroll==='scroll_v' ? '(necessário para scroll vertical)' :
              '(padrão para hard-cut)'}
          </div>
        </div>

        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="btn-tool" onclick="DASHBOARD.savePhaseDetail()" style="flex:1;background:#27ae60;color:#fff">💾 Salvar Fase</button>
          <button class="btn-tool" onclick="DASHBOARD.deletePhase(${idx})" style="background:#c0392b;color:#fff">🗑 Deletar</button>
        </div>
      </div>
    `;
  }

  function onScrollChange(){
    const scroll = document.getElementById('editPhaseScroll')?.value || 'static';
    const mirror = mirroringFromScroll(scroll);
    const info = document.getElementById('editPhaseMirrorInfo');
    if(info){
      const tip = scroll==='scroll_h' ? '(necessário para scroll horizontal)' :
                  scroll==='scroll_v' ? '(necessário para scroll vertical)' :
                  '(padrão para hard-cut)';
      info.innerHTML = `Mirroring desta fase: <b style="color:#ffcc00">${mirror}</b> ${tip}`;
    }
  }

  function savePhaseDetail(){
    if(selectedPhase===null) return;
    const phase = Project.data.phases[selectedPhase];
    if(!phase) return;

    phase.name = document.getElementById('editPhaseName')?.value || phase.name;
    phase.description = document.getElementById('editPhaseDesc')?.value || '';
    phase.bank = parseInt(document.getElementById('editPhaseBank')?.value ?? 0);
    phase.gravity = document.getElementById('editPhaseGravity')?.value || 'down';
    phase.gravityStrength = parseInt(document.getElementById('editPhaseGravStr')?.value ?? 4);
    phase.scroll = document.getElementById('editPhaseScroll')?.value || 'static';
    if(phase.scroll === 'free') phase.scroll = 'static';

    // Mirroring derivado automaticamente do scroll (regra de hardware)
    phase.mirroring = mirroringFromScroll(phase.scroll);

    // Remove vínculos antigos de tela única (a fase agora é dona do banco inteiro)
    phase.splash = '';
    phase.background = '';

    // Mantém mapper da fase alinhado com o projeto por enquanto
    phase.mapper = Project.data.mapper || 0;

    renderPhases();
    selectPhase(selectedPhase); // re-renderiza o painel com os valores salvos
    Project.status(`Fase "${phase.name}" salva • Bank ${phase.bank + 1} • ${phase.mirroring}`);
  }

  function editPhase(idx){ selectPhase(idx); }

  function deletePhase(idx){
    if(!confirm(`Deletar fase "${Project.data.phases[idx]?.name}"?`)) return;
    Project.data.phases.splice(idx,1);
    if(selectedPhase===idx) selectedPhase=null;
    renderPhases();
    document.getElementById('phaseDetail').innerHTML='Selecione uma fase para editar';
  }

  function exportSummary(){
    const data = Project.data;
    let txt = `Projeto: ${data.name}\nAutor: ${data.author}\nGênero: ${data.genre}\nMapper: ${data.mapper}\nFases: ${data.phases?.length||0}\n\n`;
    (data.phases||[]).forEach((p,i)=>{
      const bankUI = (p.bank ?? 0) + 1;
      txt += `Fase ${i+1}: ${p.name}\n`;
      txt += `  Bank: ${bankUI} | Gravity: ${p.gravity} | Scroll: ${p.scroll} | Mirroring: ${p.mirroring||mirroringFromScroll(p.scroll)}\n\n`;
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
    onScrollChange,
    exportSummary, 
    addCheat, 
    deleteCheat,
    updateCheatProp,
    appendCheatBtn,
    clearCheatBtns,
    getPhases(){ return Project.data?.phases||[]; }, 
    loadPhases(arr){ if(Project.data){ Project.data.phases=arr||[]; migratePhasesMirroring(); } renderPhases(); }, 
    get selectedPhase(){ return selectedPhase; },
    getAvailableBanks,
    mirroringFromScroll,
    addJumpForce, deleteJumpForce, addSpeedLevel, deleteSpeedLevel
  };
})();
