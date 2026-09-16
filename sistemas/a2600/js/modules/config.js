/**
 * CONFIG — configurações do jogo Atari 2600
 * Inclui gameStyle + kernelProfile (contrato de hardware/editor vivo).
 */
const CONFIG = (() => {
  let selectedScreen = 0;

  /**
   * Profiles técnicos — o build/kernel lê isto.
   * Estilos de jogo são atalhos amigáveis que aplicam um profile + defaults.
   */
  const KERNEL_PROFILES = {
    free: {
      id: 'free',
      label: 'Avançado (livre)',
      blurb: 'P0 e P1 livres, playfield completo, regras soltas. Útil para testar o motor.',
      channels: { p0: 'free', p1: 'free', m0: 'free', m1: 'free', ball: 'free' },
      heroMove: ['left', 'right', 'up', 'down'],
      playfield: 'full',
      enemies: { mode: 'free', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: false },
      objects: { allowFreeSpawn: true, allowMissile: true, allowBall: true },
      options: [],
    },
    two_fighter: {
      id: 'two_fighter',
      label: 'Dois lutadores (Boxing / Kung-Fu)',
      blurb: 'P0 + P1 sempre na tela, kernel 2 linhas + VDEL. Arena PF reflect. Sem fileiras NUSIZ.',
      channels: { p0: 'fighter1', p1: 'fighter2', m0: 'off', m1: 'off', ball: 'off' },
      heroMove: ['left', 'right', 'up', 'down'],
      playfield: 'static',
      enemies: { mode: 'none', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: true },
      objects: { allowFreeSpawn: true, allowMissile: false, allowBall: false },
      options: [
        { key: 'camera', label: 'Câmera', type: 'select',
          choices: [
            { v: 'top', t: 'Visão superior (Boxing)' },
            { v: 'side', t: 'Lateral (Kung-Fu)' },
          ], default: 'top' },
        { key: 'players', label: 'Jogadores humanos', type: 'number', min: 1, max: 2, default: 2 },
        { key: 'mirrorArena', label: 'Arena espelhada (reflect)', type: 'bool', default: true },
        { key: 'allowJump', label: 'Pulo (só lateral)', type: 'bool', default: false },
        { key: 'allowCrouch', label: 'Agaixar (só lateral)', type: 'bool', default: false },
        { key: 'rounds', label: 'Rounds por partida', type: 'number', min: 1, max: 5, default: 3 },
        { key: 'energyStyle', label: 'Energia (HUD)', type: 'select',
          choices: [
            { v: 'street_fighter', t: 'Street Fighter (barras L/R + timer centro)' },
            { v: 'final_fight', t: 'Final Fight (barras empilhadas à esquerda)' },
          ], default: 'final_fight' },
        { key: 'energyMax', label: 'Energia máxima', type: 'number', min: 8, max: 99, default: 32 },
        { key: 'hudLines', label: 'Linhas do HUD (topo)', type: 'number', min: 4, max: 12, default: 6 },
        { key: 'timerDigits', label: 'Timer 2 dígitos no HUD', type: 'bool', default: true },
        { key: 'timerStart', label: 'Timer inicial', type: 'number', min: 10, max: 99, default: 99 },
      ],
    },
    hero_p0_nusiz_rows: {
      id: 'hero_p0_nusiz_rows',
      label: 'Herói + fileiras NUSIZ (Megamania)',
      blurb: 'P0 = herói. P1 = fileiras de inimigos iguais (1–3 cópias via NUSIZ).',
      channels: { p0: 'hero', p1: 'enemy_row', m0: 'hero_shot', m1: 'enemy_shot', ball: 'off' },
      heroMove: ['left', 'right'],
      playfield: 'none',
      enemies: { mode: 'rows', maxRows: 6, maxCopiesPerRow: 3, sameGraphicPerRow: true },
      objects: { allowFreeSpawn: false, allowMissile: true, allowBall: false },
      options: [
        { key: 'enemyRows', label: 'Fileiras de inimigos', type: 'number', min: 1, max: 6, default: 3 },
        { key: 'enemyCopies', label: 'Cópias por fileira (NUSIZ)', type: 'select',
          choices: [
            { v: 1, t: '1 (simples)' },
            { v: 2, t: '2 cópias' },
            { v: 3, t: '3 cópias' },
          ], default: 3 },
        { key: 'heroVertical', label: 'Permitir movimento vertical do herói', type: 'bool', default: false },
        { key: 'twoPlayerAlternating', label: '2 jogadores alternados (sempre P0)', type: 'bool', default: false },
        { key: 'playfield', label: 'Playfield', type: 'select',
          choices: [
            { v: 'none', t: 'Nenhum (tela preta)' },
            { v: 'minimal', t: 'Minimal (reflect/repeat)' },
          ], default: 'none' },
        { key: 'enemyShots', label: 'Tiros inimigos (M1)', type: 'bool', default: false },
      ],
    },
    hero_p0_mux_y: {
      id: 'hero_p0_mux_y',
      label: 'Herói + multiplex vertical (River Raid-like)',
      blurb: 'P0 = herói. P1 reutilizado em faixas de Y (inimigos sem sobrepor a mesma linha).',
      channels: { p0: 'hero', p1: 'mux_enemy', m0: 'hero_shot', m1: 'enemy_shot', ball: 'optional' },
      heroMove: ['left', 'right', 'up', 'down'],
      playfield: 'scroll_v',
      enemies: { mode: 'mux_y', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: false },
      objects: { allowFreeSpawn: true, allowMissile: true, allowBall: true },
      options: [
        { key: 'players', label: 'Jogadores (alternados)', type: 'number', min: 1, max: 2, default: 1 },
        { key: 'seedMode', label: 'Seed do mapa', type: 'select',
          choices: [
            { v: 'title_entropy', t: 'Aleatória (título)' },
            { v: 'fixed', t: 'Fixa' },
          ], default: 'title_entropy' },
        { key: 'seedFixed', label: 'Seed fixa (0–255)', type: 'number', min: 0, max: 255, default: 42 },
        { key: 'riverEdges', label: 'Bordas X do rio', type: 'select',
          choices: [
            { v: 2, t: '2 — um canal' },
            { v: 4, t: '4 — canal + ilha' },
          ], default: 2 },
        { key: 'minRiverWidth', label: 'Largura mín. rio (PF)', type: 'number', min: 4, max: 16, default: 6 },
        { key: 'minEdgeGapY', label: 'Distância mín. entre mudanças Y', type: 'number', min: 4, max: 48, default: 12 },
        { key: 'checkpointEvery', label: 'Checkpoint a cada N blocos (0=off)', type: 'number', min: 0, max: 32, default: 8 },
        { key: 'checkpointKind', label: 'Tipo de checkpoint', type: 'select',
          choices: [
            { v: 'bridge', t: 'Ponte (PF)' },
            { v: 'sprite', t: 'Sprite / objeto' },
          ], default: 'bridge' },
        { key: 'scrollSpeed', label: 'Velocidade do scroll', type: 'select',
          choices: [
            { v: 'slow', t: 'Lento' },
            { v: 'normal', t: 'Normal' },
            { v: 'fast', t: 'Rápido' },
          ], default: 'normal' },
        { key: 'fuelEnabled', label: 'Sistema de combustível', type: 'bool', default: true },
        { key: 'fuelMax', label: 'Combustível máximo', type: 'number', min: 16, max: 255, default: 128 },
        { key: 'fuelDrain', label: 'Drain por frame (unidade)', type: 'number', min: 1, max: 8, default: 1 },
        { key: 'fuelDrainFrames', label: 'Frames entre cada drain', type: 'number', min: 1, max: 60, default: 8 },
        { key: 'maxMuxSlots', label: 'Máx. inimigos na tela', type: 'number', min: 2, max: 12, default: 6 },
      ],
    },
    single_screen_adventure: {
      id: 'single_screen_adventure',
      label: 'Adventure / salas',
      blurb: 'Telas fixas (hard cut). P0=herói, P1=item/inimigo (1 por vez). PF por sala.',
      channels: { p0: 'hero', p1: 'npc_or_item', m0: 'optional', m1: 'optional', ball: 'item' },
      heroMove: ['left', 'right', 'up', 'down'],
      playfield: 'per_screen',
      enemies: { mode: 'free', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: false },
      objects: { allowFreeSpawn: true, allowMissile: true, allowBall: true },
      options: [
        { key: 'players', label: 'Jogadores (alternados no P0)', type: 'number', min: 1, max: 2, default: 1 },
        { key: 'rooms', label: 'Várias salas (telas)', type: 'bool', default: true },
        { key: 'useBall', label: 'Ball como 2º item', type: 'bool', default: true },
        { key: 'p1Role', label: 'Papel padrão do P1', type: 'select',
          choices: [
            { v: 'auto', t: 'Auto (inimigo ou item)' },
            { v: 'enemy', t: 'Inimigo / NPC' },
            { v: 'item', t: 'Item carregável' },
          ], default: 'auto' },
        { key: 'allowAsymmetricRooms', label: 'Permitir salas assimétricas (labirinto)', type: 'bool', default: true },
        { key: 'scoreModePf', label: 'Score mode PF (cores L/R baratas)', type: 'bool', default: false },
      ],
    },
    racing_rail: {
      id: 'racing_rail',
      label: 'Corrida / trilha / Enduro',
      blurb: 'P0=veículo. P1=oponente mux. Curvas Enduro via M0/M1/Ball+HMOVE (não PF assimétrico).',
      channels: { p0: 'vehicle', p1: 'opponent', m0: 'road_edge', m1: 'road_edge', ball: 'road_edge_or_center' },
      heroMove: ['left', 'right'],
      playfield: 'scroll_v',
      enemies: { mode: 'mux_y', maxRows: 0, maxCopiesPerRow: 1, sameGraphicPerRow: false },
      objects: { allowFreeSpawn: true, allowMissile: true, allowBall: true },
      options: [
        { key: 'camera', label: 'Câmera / motor de pista', type: 'select',
          choices: [
            { v: 'top', t: 'Vista superior (faixas / PF reflect)' },
            { v: 'enduro', t: 'Enduro (margens M/Ball + HMOVE, curvas)' },
          ], default: 'enduro' },
        { key: 'players', label: 'Jogadores (alternados)', type: 'number', min: 1, max: 2, default: 1 },
        { key: 'lanes', label: 'Faixas (modo top)', type: 'number', min: 2, max: 4, default: 3 },
        { key: 'minRoadWidth', label: 'Largura mín. pista (células)', type: 'number', min: 4, max: 20, default: 8 },
        { key: 'scrollSpeed', label: 'Velocidade base do scroll', type: 'select',
          choices: [
            { v: 'slow', t: 'Lento' },
            { v: 'normal', t: 'Normal' },
            { v: 'fast', t: 'Rápido' },
          ], default: 'normal' },
        { key: 'maxOpponents', label: 'Máx. oponentes na tela (mux)', type: 'number', min: 1, max: 6, default: 3 },
        { key: 'seedMode', label: 'Seed das curvas (Enduro)', type: 'select',
          choices: [
            { v: 'title_entropy', t: 'Aleatória (título)' },
            { v: 'fixed', t: 'Fixa' },
          ], default: 'title_entropy' },
        { key: 'seedFixed', label: 'Seed fixa 0–255', type: 'number', min: 0, max: 255, default: 42 },
        { key: 'hmoveStepLines', label: 'HMOVE a cada N linhas (Enduro)', type: 'number', min: 2, max: 8, default: 4 },
      ],
    },
  };


  /**
   * Contrato por estilo — editor e build consultam isto.
   * vertical_shooter: P0 herói, P1 fileiras NUSIZ, 2P alternado, PF none/minimal.
   */
  const STYLE_CONTRACTS = {
    vertical_shooter: {
      id: 'vertical_shooter',
      kernelProfile: 'hero_p0_nusiz_rows',
      players: {
        mode: 'alternating',
        maxPlayers: 2,
        activeChannel: 'p0',
        move: ['left', 'right'],
        moveOptional: ['up', 'down'],
      },
      channels: {
        p0: 'hero',
        p1: 'enemy_row',
        m0: 'hero_shot',
        m1: 'enemy_shot',
        ball: 'off',
      },
      enemies: {
        mode: 'rows',
        maxRows: 6,
        maxCopiesPerRow: 3,
        sameGraphicPerRow: true,
        movement: 'horizontal_in_band',
      },
      playfield: {
        allowedModes: ['none', 'reflect', 'repeat'],
        defaultMode: 'none',
        allowAsymmetric: false,
        showBandEditor: true,
      },
      editor: {
        showPlayfieldPaint: true, // false se mode none
        showBands: true,
        spriteRoles: ['hero', 'enemy_row', 'hero_shot'],
        hide: ['asymmetric_pf', 'free_mux_y', 'ball'],
      },
    },
    river_scroll: {
      id: 'river_scroll',
      kernelProfile: 'hero_p0_mux_y',
      players: {
        mode: 'single',
        maxPlayers: 1,
        activeChannel: 'p0',
        move: ['left', 'right'],
        moveOptional: ['speed'],
      },
      channels: {
        p0: 'hero',
        p1: 'mux_enemy',
        m0: 'hero_shot',
        m1: 'enemy_shot',
        ball: 'off',
      },
      enemies: {
        mode: 'mux_y',
        maxRows: 0,
        maxCopiesPerRow: 1,
        sameGraphicPerRow: false,
        movement: 'world_y',
      },
      playfield: {
        // reflect = metade + espelho (rio); none = céu / 1942-like
        allowedModes: ['none', 'reflect'],
        defaultMode: 'reflect',
        allowAsymmetric: false,
        showBandEditor: false,
        showRiverMapEditor: true,
      },
      mapgen: {
        drift: [-1, 0, 1], // fixo no engine
        stepFrames: 12,    // fixo no engine
        seedMode: 'title_entropy',
      },
      editor: {
        showBands: false,
        showRiverMap: true,
        hide: ['asymmetric_pf', 'repeat_pf', 'nusiz_rows', 'spawn_waves'],
      },
    },
    boxing: {
      id: 'boxing',
      kernelProfile: 'two_fighter',
      players: {
        mode: 'simultaneous',
        maxPlayers: 2,
        activeChannel: 'both',
        move: ['left', 'right', 'up', 'down'],
      },
      channels: {
        p0: 'fighter1',
        p1: 'fighter2',
        m0: 'off',
        m1: 'off',
        ball: 'off',
      },
      enemies: {
        mode: 'none',
        maxRows: 0,
        maxCopiesPerRow: 1,
        sameGraphicPerRow: true,
      },
      playfield: {
        allowedModes: ['none', 'reflect'],
        defaultMode: 'reflect',
        allowAsymmetric: false,
        showBandEditor: false,
        showRiverMapEditor: false,
        showFightEditor: true,
      },
      editor: {
        showBands: false,
        showRiverMap: false,
        showFight: true,
        showPlayfieldPaint: true, // ring / cordas
        spriteRoles: ['fighter1', 'fighter2'],
        hide: ['asymmetric_pf', 'nusiz_rows', 'river_map', 'enemy_rows'],
      },
      // HUD (build futuro):
      // street_fighter → topo PF assimétrico: barra P0 esq | timer sprite centro | barra P1 dir
      // final_fight    → topo PF reflect/half: duas barras empilhadas só à esquerda (mais leve no TIA)
      // ring abaixo continua reflect + P0/P1 VDEL
      hud: {
        modes: ['street_fighter', 'final_fight'],
        defaultMode: 'final_fight',
        timerViaSprite: true,
      },
    },
    adventure: {
      id: 'adventure',
      kernelProfile: 'single_screen_adventure',
      players: {
        mode: 'alternating',
        maxPlayers: 2,
        activeChannel: 'p0',
        move: ['left', 'right', 'up', 'down'],
      },
      channels: {
        p0: 'hero',
        p1: 'npc_or_item',
        m0: 'optional',
        m1: 'optional',
        ball: 'item',
      },
      enemies: {
        mode: 'free',
        maxRows: 0,
        maxCopiesPerRow: 1,
        note: 'P1 = um objeto por vez (mux por proximidade no build)',
      },
      playfield: {
        // por tela: reflect/repeat (barato), none (boss), asymmetric (labirinto, P1 limitado)
        // score mode = cores L/R baratas, geometria ainda reflect/repeat
        allowedModes: ['none', 'reflect', 'repeat', 'asymmetric'],
        defaultMode: 'reflect',
        allowAsymmetric: true,
        perScreenMode: true,
        showBandEditor: false,
        showRiverMapEditor: false,
        showFightEditor: false,
        showAdventureEditor: true,
      },
      editor: {
        showBands: false,
        showRiverMap: false,
        showFight: false,
        showAdventure: true,
        showPlayfieldPaint: true,
        spriteRoles: ['hero', 'npc_or_item', 'item'],
        hide: ['nusiz_rows', 'river_map', 'fight_hud'],
      },
      rooms: {
        transition: 'hard_cut',
        pfModePerScreen: true,
      },
    },
    racing: {
      id: 'racing',
      kernelProfile: 'racing_rail',
      players: {
        mode: 'alternating',
        maxPlayers: 2,
        activeChannel: 'p0',
        move: ['left', 'right'],
        moveOptional: ['accelerate'],
      },
      channels: {
        p0: 'vehicle',
        p1: 'opponent',
        m0: 'road_edge_left',
        m1: 'road_edge_right',
        ball: 'road_center_or_edge',
      },
      enemies: {
        mode: 'mux_y',
        maxCopiesPerRow: 1,
        movement: 'world_y_scroll',
      },
      playfield: {
        // top: reflect desenha pista; enduro: PF decorativo, margens = missile/ball + HMOVE
        allowedModes: ['none', 'reflect'],
        defaultMode: 'reflect',
        allowAsymmetric: false,
        showBandEditor: false,
        showRiverMapEditor: false,
        showFightEditor: false,
        showAdventureEditor: false,
        showRacingEditor: true,
      },
      // Build futuro (guardar):
      // camera=top    → PF reflect + lanes no editor; P1 oponentes mux
      // camera=enduro → tabelas HMOVE L/R a cada hmoveStepLines; M0/M1/Ball = bordas;
      //                 curva = offsets independentes; sem PF asymmetric
      // scrollSpeed → variável de programa (1/2/3)
      road: {
        curveMethod: 'hmove_edges', // não asymmetric PF
        edgeChannels: ['m0', 'm1', 'ball'],
        hmoveTableEveryNLines: 4,
        perspective: true,
      },
      editor: {
        showRacing: true,
        showPlayfieldPaint: true, // top: pista; enduro: opcional decor
        spriteRoles: ['vehicle', 'opponent'],
        hide: ['asymmetric_pf', 'nusiz_rows', 'fight_hud', 'adventure_asym'],
      },
    },
    // demais estilos: fallback livre até detalharmos
    advanced: {
      id: 'advanced',
      kernelProfile: 'free',
      playfield: {
        allowedModes: ['none', 'reflect', 'repeat', 'asymmetric'],
        defaultMode: 'reflect',
        allowAsymmetric: true,
        showBandEditor: false,
      },
      editor: { showBands: false },
    },
  };


  /** Estilos amigáveis → profile + overrides de opções */
  const GAME_STYLES = [
    {
      id: 'vertical_shooter',
      label: 'Shooter vertical (Megamania)',
      profile: 'hero_p0_nusiz_rows',
      options: {
        enemyRows: 3,
        enemyCopies: 3,
        heroVertical: false,
        twoPlayerAlternating: false,
        playfield: 'none',
        enemyShots: false,
      },
    },
    {
      id: 'river_scroll',
      label: 'Scroll vertical com inimigos (River Raid)',
      profile: 'hero_p0_mux_y',
      options: {
        players: 1,
        seedMode: 'title_entropy',
        seedFixed: 42,
        riverEdges: 2,
        minRiverWidth: 6,
        minEdgeGapY: 12,
        checkpointEvery: 8,
        checkpointKind: 'bridge',
        scrollSpeed: 'normal',
        fuelEnabled: true,
        fuelMax: 128,
        fuelDrain: 1,
        fuelDrainFrames: 8,
        maxMuxSlots: 6,
      },
    },
    {
      id: 'boxing',
      label: 'Luta 1×1 (Boxing / Kung-Fu)',
      profile: 'two_fighter',
      options: {
        camera: 'top',
        players: 2,
        mirrorArena: true,
        allowJump: false,
        allowCrouch: false,
        rounds: 3,
        energyStyle: 'final_fight',
        energyMax: 32,
        hudLines: 6,
        timerDigits: true,
        timerStart: 99,
      },
    },
    {
      id: 'adventure',
      label: 'Adventure / exploração',
      profile: 'single_screen_adventure',
      options: {
        players: 1,
        rooms: true,
        useBall: true,
        p1Role: 'auto',
        allowAsymmetricRooms: true,
        scoreModePf: false,
      },
    },
    {
      id: 'racing',
      label: 'Corrida (top / Enduro)',
      profile: 'racing_rail',
      options: {
        camera: 'enduro',
        players: 1,
        lanes: 3,
        minRoadWidth: 8,
        scrollSpeed: 'normal',
        maxOpponents: 3,
        seedMode: 'title_entropy',
        seedFixed: 42,
        hmoveStepLines: 4,
      },
    },
    {
      id: 'advanced',
      label: 'Avançado (livre)',
      profile: 'free',
      options: {},
    },
  ];

  function escapeAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }


  function normalizeScoreBar(d) {
    if (!d.scoreBar || typeof d.scoreBar !== 'object') d.scoreBar = {};
    const sb = d.scoreBar;
    // migração checkbox antigo
    if (sb.position == null) {
      if (sb.enabled) sb.position = 'bottom';
      else sb.position = 'none';
    }
    if (!['none', 'top', 'bottom'].includes(sb.position)) sb.position = 'none';
    sb.align = 'left';
    sb.players = Math.max(1, Math.min(2, sb.players | 0) || 1);
    sb.digits = Math.max(2, Math.min(3, sb.digits | 0) || 2);
    sb.labelPlayers = !!sb.labelPlayers && sb.digits === 3;
    let del = sb.delay | 0;
    if (sb.digits >= 3) del = 7;
    else if (![4, 8, 12].includes(del)) del = 4;
    sb.delay = del;
    if (sb.background == null) sb.background = true;
    sb.background = !!sb.background;
    sb.lines = Math.max(8, Math.min(20, sb.lines | 0) || 12);
    if (typeof sb.variable !== 'string' || !sb.variable) sb.variable = 'score';
    if (typeof sb.variable2 !== 'string' || !sb.variable2) sb.variable2 = 'scoreP1';
    // logo inegociável na plataforma
    sb.logoAlways = true;
    sb.showLogo = true;
    sb.lines = Math.max(5, Math.min(16, sb.lines | 0) || 5); // mínimo ≈ altura glifo
    sb.logoLines = Math.max(6, Math.min(16, sb.logoLines | 0) || 10);
    sb.enabled = sb.position !== 'none';
    // nomes canônicos reservados
    if (sb.align === 'both') {
      sb.variable = 'scoreP0';
      sb.variable2 = 'scoreP1';
    } else {
      sb.variable = 'scoreP0';
      sb.variable2 = 'scoreP1';
    }
    return sb;
  }

  function ensureData() {
    if (!Project.data) Project.data = Project.defaultData();
    if (!Array.isArray(Project.data.screens)) Project.data.screens = [];
    if (!Project.data.screens.length) {
      Project.data.screens.push({
        id: 'screen_' + Date.now(),
        name: 'Tela 1',
        description: '',
      });
    }
    if (!Project.data.gameStyle || Project.data.gameStyle === 'experimental') {
      Project.data.gameStyle = 'advanced';
    }
    if (!Project.data.kernelProfile) Project.data.kernelProfile = 'free';
    if (!Project.data.profileOptions || typeof Project.data.profileOptions !== 'object') {
      Project.data.profileOptions = {};
    }
    // migração: kernel antigo → style aproximado
    if (Project.data.kernel && !Project.data._profileMigrated) {
      if (Project.data.kernel === 'vertical_scroll' && Project.data.kernelProfile === 'free') {
        Project.data.gameStyle = 'river_scroll';
        Project.data.kernelProfile = 'hero_p0_mux_y';
      } else if (Project.data.kernel === 'adventure_rooms') {
        Project.data.gameStyle = 'adventure';
        Project.data.kernelProfile = 'single_screen_adventure';
      }
      Project.data._profileMigrated = true;
    }
        normalizeScoreBar(Project.data);
    if (typeof Project !== 'undefined' && Project.syncNativeVariables) {
      Project.syncNativeVariables();
    }
    return Project.data;
  }

  function getProfile(id) {
    return KERNEL_PROFILES[id] || KERNEL_PROFILES.free;
  }

  function getStyle(id) {
    return GAME_STYLES.find((s) => s.id === id) || GAME_STYLES[0];
  }

  /** Aplica estilo: troca profile e mescla options default */
  function applyStyle(styleId) {
    const d = ensureData();
    const style = getStyle(styleId);
    d.gameStyle = style.id;
    d.kernelProfile = style.profile;
    const prof = getProfile(style.profile);
    const opts = {};
    (prof.options || []).forEach((o) => {
      opts[o.key] = o.default;
    });
    Object.assign(opts, style.options || {});
    d.profileOptions = opts;
    // espelha kernel legado para builds antigos
    d.kernel =
      style.profile === 'single_screen_adventure'
        ? 'adventure_rooms'
        : style.profile === 'hero_p0_mux_y' || style.profile === 'racing_rail'
          ? 'vertical_scroll'
          : 'single_screen';
  }

  function channelLabel(role) {
    const map = {
      free: 'livre',
      hero: 'herói',
      hero2: 'herói 2',
      enemy_row: 'fileira inimigos',
      mux_enemy: 'inimigo multiplex',
      hero_shot: 'tiro herói',
      enemy_shot: 'tiro inimigo',
      vehicle: 'veículo',
      obstacle: 'obstáculo',
      npc_or_enemy: 'NPC/inimigo',
      item: 'item',
      optional: 'opcional',
      off: 'desligado',
    };
    return map[role] || role;
  }

  function renderBudget(prof, opts) {
    const ch = prof.channels || {};
    const rows = [
      ['P0', channelLabel(ch.p0)],
      ['P1', channelLabel(ch.p1)],
      ['M0', channelLabel(ch.m0)],
      ['M1', channelLabel(ch.m1)],
      ['Ball', channelLabel(ch.ball)],
    ];
    const move = (prof.heroMove || []).join(', ') || '—';
    const pf = prof.playfield || '—';
    let extra = '';
    if (prof.enemies?.mode === 'rows') {
      extra = `Fileiras: ${opts.enemyRows ?? prof.enemies.maxRows} × ${opts.enemyCopies ?? 1} cópias (NUSIZ)`;
    } else if (prof.enemies?.mode === 'mux_y') {
      extra = `Multiplex Y: até ${opts.maxMuxSlots ?? 6} faixas`;
    }
    return `
      <div class="cfg-budget">
        <div class="cfg-budget-title">Orçamento de hardware (este profile)</div>
        <div class="cfg-budget-grid">
          ${rows
            .map(
              ([k, v]) =>
                `<div><span class="k">${k}</span> <span class="v">${escapeHtml(v)}</span></div>`
            )
            .join('')}
        </div>
        <div class="cfg-budget-meta">
          <div>Movimento herói: <b>${escapeHtml(move)}</b></div>
          <div>Playfield: <b>${escapeHtml(pf)}</b></div>
          ${extra ? `<div>${escapeHtml(extra)}</div>` : ''}
        </div>
        <p class="cfg-budget-blurb">${escapeHtml(prof.blurb || '')}</p>
      </div>`;
  }

  function renderProfileOptions(prof, opts) {
    const list = prof.options || [];
    if (!list.length) {
      return `<p style="margin:0;font-size:12px;color:#666">Este profile não tem opções extras.</p>`;
    }
    return list
      .map((o) => {
        const val = opts[o.key] !== undefined ? opts[o.key] : o.default;
        if (o.type === 'bool') {
          return `<label class="cfg-opt"><input type="checkbox" data-opt="${escapeAttr(o.key)}" ${
            val ? 'checked' : ''
          }/> ${escapeHtml(o.label)}</label>`;
        }
        if (o.type === 'number') {
          return `<label class="cfg-opt">${escapeHtml(o.label)}
            <input type="number" data-opt="${escapeAttr(o.key)}" min="${o.min ?? 0}" max="${
            o.max ?? 99
          }" value="${escapeAttr(val)}" style="width:72px"/></label>`;
        }
        if (o.type === 'select') {
          const choices = o.choices || [];
          return `<label class="cfg-opt">${escapeHtml(o.label)}
            <select data-opt="${escapeAttr(o.key)}">
              ${choices
                .map(
                  (c) =>
                    `<option value="${escapeAttr(c.v)}" ${
                      String(val) === String(c.v) ? 'selected' : ''
                    }>${escapeHtml(c.t)}</option>`
                )
                .join('')}
            </select></label>`;
        }
        return '';
      })
      .join('');
  }

  function buildHTML() {
    const root = document.getElementById('mod-config');
    if (!root) return;
    const d = ensureData();
    const sb = normalizeScoreBar(d);
    const style = getStyle(d.gameStyle);
    const prof = getProfile(d.kernelProfile || style.profile);
    const opts = d.profileOptions || {};

    root.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;overflow:auto;padding:16px;gap:16px;background:#1e1e1e">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <h3 style="margin:0;font-size:14px;color:#f4a261">⚙ CONFIGURAÇÕES DO JOGO</h3>
          <span style="font-size:11px;color:#666">Metadados, estilo, kernel profile e telas</span>
        </div>

        <div class="cfg-card">
          <div class="cfg-card-title">Identidade</div>
          <div class="cfg-grid">
            <label>Nome
              <input id="cfgName" type="text" value="${escapeAttr(d.name || '')}" />
            </label>
            <label>Autor
              <input id="cfgAuthor" type="text" value="${escapeAttr(d.author || '')}" />
            </label>
            <label class="full">Descrição
              <textarea id="cfgDesc" rows="2">${escapeHtml(d.description || '')}</textarea>
            </label>
          </div>
        </div>

        <div class="cfg-card">
          <div class="cfg-card-title">Placar e logo (global)</div>
          <p style="margin:0 0 10px;font-size:11px;color:#888;line-height:1.45">
            Independente do estilo de jogo. O <b style="color:#aaa">build</b> começa reservando
            faixas de scanline para placar (topo ou base) e, no rodapé,
            sempre o logo <b style="color:#f4a261">RETROCOMPILER</b> estilo Activision.
          </p>
          <div class="cfg-grid">
            <label>Posição do placar
              <select id="cfgScorePos">
                <option value="none" ${sb.position === 'none' ? 'selected' : ''}>None (sem placar)</option>
                <option value="top" ${sb.position === 'top' ? 'selected' : ''}>Topo da tela</option>
                <option value="bottom" ${sb.position === 'bottom' ? 'selected' : ''}>Base (acima do logo)</option>
              </select>
            </label>
                        <label>Jogadores
              <select id="cfgScorePlayers" ${sb.position === 'none' ? 'disabled' : ''}>
                <option value="1" ${(sb.players|0) !== 2 ? 'selected' : ''}>1</option>
                <option value="2" ${(sb.players|0) === 2 ? 'selected' : ''}>2 (faixas empilhadas)</option>
              </select>
            </label>
            <label>Dígitos
              <select id="cfgScoreDigits" ${sb.position === 'none' ? 'disabled' : ''}>
                <option value="2" ${sb.digits === 2 ? 'selected' : ''}>2 (valor 0–99)</option>
                <option value="3" ${sb.digits === 3 ? 'selected' : ''}>3</option>
              </select>
            </label>
            <label>Posição X ${sb.digits === 3 ? '(fixo #7)' : ''}
              <select id="cfgScoreDelay" ${sb.position === 'none' || sb.digits === 3 ? 'disabled' : ''}>
                <option value="4" ${(sb.delay|0) === 4 ? 'selected' : ''}>4 — esquerda</option>
                <option value="8" ${(sb.delay|0) === 8 ? 'selected' : ''}>8 — centro</option>
                <option value="12" ${(sb.delay|0) === 12 ? 'selected' : ''}>12 — direita</option>
                <option value="7" ${(sb.delay|0) === 7 ? 'selected' : ''}>7 — 3 dígitos</option>
              </select>
            </label>
            <label class="cfg-opt" style="flex-direction:row;align-items:center;gap:8px;${sb.digits === 3 ? '' : 'opacity:.45'}">
              <input type="checkbox" id="cfgScoreLabel" ${sb.labelPlayers ? 'checked' : ''} ${sb.position === 'none' || sb.digits !== 3 ? 'disabled' : ''}/>
              Nomear player (1P/2P na centena, valor 0–99)
            </label>
            <label>Altura por faixa (scanlines)
              <input id="cfgScoreLines" type="number" min="8" max="20" value="${sb.lines | 0}" ${sb.position === 'none' ? 'disabled' : ''} />
            </label>
            <label>Variáveis
              <input type="text" value="${(sb.players|0) === 2 ? 'scoreP0 + scoreP1' : 'scoreP0'}" readonly disabled />
            </label>
            <label class="cfg-opt" style="flex-direction:row;align-items:center;gap:8px;margin-top:8px">
              <input type="checkbox" id="cfgScoreBg" ${sb.background ? 'checked' : ''} ${sb.position === 'none' ? 'disabled' : ''}/>
              Fundo preto na faixa do placar
            </label>
          </div>
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid #333">
            <div style="font-size:11px;color:#f4a261;font-weight:700;margin-bottom:8px">LOGO (obrigatório)</div>
            <p style="margin:0 0 8px;font-size:12px;color:#8dcea0">
              RETROCOMPILER nas últimas scanlines — presente em <b>todos</b> os jogos gerados pela plataforma.
            </p>
            <label style="max-width:160px">Linhas do logo
              <input id="cfgLogoLines" type="number" min="6" max="16" value="${sb.logoLines | 0}" />
            </label>
            <p style="margin:8px 0 0;font-size:11px;color:#666;line-height:1.4">
              Ordem no frame: [placar top?] → jogo → [placar bottom?] → logo → overscan.
              Variáveis nativas (<code>scoreP0</code>/<code>scoreP1</code>, etc.) são criadas conforme o setup.
            </p>
          </div>
        </div>

        <div class="cfg-card">
          <div class="cfg-card-title">Estilo de jogo</div>
          <div class="cfg-grid">
            <label class="full">Estilo
              <select id="cfgGameStyle">
                ${GAME_STYLES.map(
                  (s) =>
                    `<option value="${escapeAttr(s.id)}" ${
                      d.gameStyle === s.id ? 'selected' : ''
                    }>${escapeHtml(s.label)}</option>`
                ).join('')}
              </select>
            </label>
          </div>
          <div id="cfgBudgetWrap" style="margin-top:12px">
            ${renderBudget(prof, opts)}
          </div>
          <div id="cfgProfileOpts" class="cfg-opts" style="margin-top:12px">
            ${renderProfileOptions(prof, opts)}
          </div>
          <p style="margin:10px 0 0;font-size:11px;color:#666;line-height:1.45">
            O <b style="color:#aaa">estilo</b> define o kernel por baixo dos panos
            (canais P0/P1, fileiras NUSIZ, multiplex, etc.).
            Outros módulos consultam
            <code style="color:#f4a261">CONFIG.getKernelProfile()</code>
            para mostrar ou esconder ferramentas.
          </p>
        </div>

        <div class="cfg-card">
          <div class="cfg-card-title">Cartucho / TV</div>
          <div class="cfg-grid">
            <label>Tamanho da ROM / mapper
              <select id="cfgRomSize">
                <option value="2048" ${d.romSize == 2048 ? 'selected' : ''}>2 KB — fixed</option>
                <option value="4096" ${d.romSize == 4096 || !d.romSize ? 'selected' : ''}>4 KB — fixed</option>
                <option value="8192" ${d.romSize == 8192 ? 'selected' : ''}>8 KB — F8</option>
                <option value="16384" ${d.romSize == 16384 ? 'selected' : ''}>16 KB — F6</option>
                <option value="32768" ${d.romSize == 32768 ? 'selected' : ''}>32 KB — F4</option>
              </select>
            </label>
            <label>Padrão de TV
              <select id="cfgTv">
                <option value="NTSC" ${(d.tv || 'NTSC') === 'NTSC' ? 'selected' : ''}>NTSC (60 Hz)</option>
                <option value="PAL" ${d.tv === 'PAL' ? 'selected' : ''}>PAL (50 Hz)</option>
              </select>
            </label>
          </div>
        </div>

        <div class="cfg-card">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div class="cfg-card-title" style="margin:0">Telas / salas</div>
            <button type="button" class="cfg-btn" id="cfgAddScreen">+ Nova tela</button>
          </div>
          <div id="cfgScreenList" style="display:flex;flex-direction:column;gap:6px"></div>
          <div id="cfgScreenDetail" style="margin-top:12px;display:none" class="cfg-grid">
            <label>Nome da tela
              <input id="cfgScreenName" type="text" />
            </label>
            <label class="full">Descrição
              <input id="cfgScreenDesc" type="text" />
            </label>
          </div>
        </div>
      </div>
    `;

    injectStyles();
    bind();
    renderScreens();
  }

  function refreshProfileUI() {
    const d = ensureData();
    const prof = getProfile(d.kernelProfile);
    const opts = d.profileOptions || {};
    const bw = document.getElementById('cfgBudgetWrap');
    const ow = document.getElementById('cfgProfileOpts');
    if (bw) bw.innerHTML = renderBudget(prof, opts);
    if (ow) {
      ow.innerHTML = renderProfileOptions(prof, opts);
      bindOptHandlers();
    }
    const gs = document.getElementById('cfgGameStyle');
    if (gs) gs.value = d.gameStyle;
  }

  function bindOptHandlers() {
    document.querySelectorAll('#cfgProfileOpts [data-opt]').forEach((el) => {
      const key = el.getAttribute('data-opt');
      const handler = () => {
        const d = ensureData();
        if (!d.profileOptions) d.profileOptions = {};
        if (el.type === 'checkbox') d.profileOptions[key] = !!el.checked;
        else if (el.type === 'number') d.profileOptions[key] = parseInt(el.value, 10) || 0;
        else d.profileOptions[key] = el.value;
        dirty();
        const prof = getProfile(d.kernelProfile);
        const bw = document.getElementById('cfgBudgetWrap');
        if (bw) bw.innerHTML = renderBudget(prof, d.profileOptions);
      };
      el.addEventListener('change', handler);
      el.addEventListener('input', handler);
    });
  }

  function bind() {
    const d = ensureData();

    document.getElementById('cfgName')?.addEventListener('input', (e) => {
      d.name = e.target.value;
      dirty();
      if (typeof Project.updateHeader === 'function') Project.updateHeader();
    });
    document.getElementById('cfgAuthor')?.addEventListener('input', (e) => {
      d.author = e.target.value;
      dirty();
    });
    document.getElementById('cfgDesc')?.addEventListener('input', (e) => {
      d.description = e.target.value;
      dirty();
    });
    document.getElementById('cfgRomSize')?.addEventListener('change', (e) => {
      d.romSize = parseInt(e.target.value, 10) || 4096;
      dirty();
    });
    document.getElementById('cfgTv')?.addEventListener('change', (e) => {
      d.tv = e.target.value;
      dirty();
    });

    
    document.getElementById('cfgScorePos')?.addEventListener('change', (e) => {
      const d2 = ensureData();
      d2.scoreBar.position = e.target.value;
      normalizeScoreBar(d2);
      dirty();
      buildHTML();
    });
    document.getElementById('cfgScoreDelay')?.addEventListener('change', (e) => {
      const d2 = ensureData();
      d2.scoreBar.delay = parseInt(e.target.value, 10) || 4;
      normalizeScoreBar(d2);
      dirty();
    });

    document.getElementById('cfgScorePlayers')?.addEventListener('change', (e) => {
      const d2 = ensureData();
      d2.scoreBar.players = parseInt(e.target.value, 10) || 1;
      normalizeScoreBar(d2);
      dirty();
      buildHTML();
    });
    document.getElementById('cfgScoreLabel')?.addEventListener('change', (e) => {
      const d2 = ensureData();
      d2.scoreBar.labelPlayers = !!e.target.checked;
      normalizeScoreBar(d2);
      dirty();
    });
    document.getElementById('cfgScoreDigits')?.addEventListener('change', (e) => {
      const d2 = ensureData();
      d2.scoreBar.digits = parseInt(e.target.value, 10) || 2;
      if (d2.scoreBar.digits !== 3) d2.scoreBar.labelPlayers = false;
      if (d2.scoreBar.digits === 3) d2.scoreBar.delay = 7;
      normalizeScoreBar(d2);
      dirty();
      buildHTML();
    });
    document.getElementById('cfgScoreLines')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 16;
      v = Math.max(8, Math.min(32, v));
      ensureData().scoreBar.lines = v;
      normalizeScoreBar(ensureData());
      dirty();
    });
    document.getElementById('cfgScoreBg')?.addEventListener('change', (e) => {
      ensureData().scoreBar.background = !!e.target.checked;
      dirty();
    });
    document.getElementById('cfgLogoLines')?.addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10) || 10;
      v = Math.max(6, Math.min(16, v));
      ensureData().scoreBar.logoLines = v;
      normalizeScoreBar(ensureData());
      dirty();
    });


    document.getElementById('cfgGameStyle')?.addEventListener('change', (e) => {
      applyStyle(e.target.value);
      dirty();
      refreshProfileUI();
      try {
        if (typeof PLAYFIELD !== 'undefined' && PLAYFIELD.applyStyleFromConfig) {
          PLAYFIELD.applyStyleFromConfig();
        } else if (typeof PLAYFIELD !== 'undefined' && PLAYFIELD.init) {
          // reconstrói o módulo se estiver montado
          const root = document.getElementById('mod-playfield');
          if (root && root.innerHTML.trim()) PLAYFIELD.init();
        }
      } catch (err) { console.warn(err); }
    });

    bindOptHandlers();

    document.getElementById('cfgAddScreen')?.addEventListener('click', () => {
      const d2 = ensureData();
      d2.screens.push({
        id: 'screen_' + Date.now(),
        name: 'Tela ' + (d2.screens.length + 1),
        description: '',
      });
      selectedScreen = d2.screens.length - 1;
      dirty();
      renderScreens();
    });
  }

  function renderScreens() {
    const d = ensureData();
    const list = document.getElementById('cfgScreenList');
    const detail = document.getElementById('cfgScreenDetail');
    if (!list) return;
    list.innerHTML = d.screens
      .map(
        (s, i) => `
      <div class="cfg-screen-row ${i === selectedScreen ? 'active' : ''}" data-i="${i}">
        <span class="cfg-screen-name">${escapeHtml(s.name || 'Tela')}</span>
        <button type="button" class="cfg-btn cfg-screen-del" data-i="${i}" title="Excluir">✕</button>
      </div>`
      )
      .join('');

    list.querySelectorAll('.cfg-screen-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.cfg-screen-del')) return;
        selectedScreen = parseInt(row.getAttribute('data-i'), 10);
        renderScreens();
      });
    });
    list.querySelectorAll('.cfg-screen-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-i'), 10);
        if (d.screens.length <= 1) {
          alert('Precisa haver pelo menos uma tela.');
          return;
        }
        if (!confirm('Excluir esta tela?')) return;
        d.screens.splice(i, 1);
        if (selectedScreen >= d.screens.length) selectedScreen = d.screens.length - 1;
        dirty();
        renderScreens();
      });
    });

    if (detail) {
      const s = d.screens[selectedScreen];
      if (!s) {
        detail.style.display = 'none';
        return;
      }
      detail.style.display = 'grid';
      const name = document.getElementById('cfgScreenName');
      const desc = document.getElementById('cfgScreenDesc');
      if (name) {
        name.value = s.name || '';
        name.oninput = () => {
          s.name = name.value;
          dirty();
          const label = list.querySelector(`.cfg-screen-row[data-i="${selectedScreen}"] .cfg-screen-name`);
          if (label) label.textContent = s.name || 'Tela';
        };
      }
      if (desc) {
        desc.value = s.description || '';
        desc.oninput = () => {
          s.description = desc.value;
          dirty();
        };
      }
    }
  }

  function dirty() {
    if (typeof Project !== 'undefined' && Project.syncNativeVariables) {
      try { Project.syncNativeVariables(); } catch (e) {}
    }

    if (typeof Project.status === 'function') {
      Project.status('config alterada — salve o projeto');
    }
  }

  function flush() {
    const d = ensureData();
    const name = document.getElementById('cfgName');
    const author = document.getElementById('cfgAuthor');
    const desc = document.getElementById('cfgDesc');
    const rom = document.getElementById('cfgRomSize');
    const tv = document.getElementById('cfgTv');
    const style = document.getElementById('cfgGameStyle');
    if (name) d.name = name.value;
    if (author) d.author = author.value;
    if (desc) d.description = desc.value;
    if (rom) d.romSize = parseInt(rom.value, 10) || 4096;
    if (tv) d.tv = tv.value;
    if (style) {
      // estilo manda: recalcula profile + defaults se mudou
      if (style.value !== d.gameStyle) applyStyle(style.value);
      else d.gameStyle = style.value;
    }
    // options
    document.querySelectorAll('#cfgProfileOpts [data-opt]').forEach((el) => {
      const key = el.getAttribute('data-opt');
      if (!d.profileOptions) d.profileOptions = {};
      if (el.type === 'checkbox') d.profileOptions[key] = !!el.checked;
      else if (el.type === 'number') d.profileOptions[key] = parseInt(el.value, 10) || 0;
      else d.profileOptions[key] = el.value;
    });
    return d;
  }

  function injectStyles() {
    if (document.getElementById('cfg-styles')) return;
    const s = document.createElement('style');
    s.id = 'cfg-styles';
    s.textContent = `
      .cfg-card {
        background: linear-gradient(180deg, #1e222c, #161920);
        border: 1px solid #333; border-radius: 10px; padding: 14px;
      }
      .cfg-card-title {
        font-size: 12px; font-weight: 700; color: #f4a261; margin-bottom: 10px;
        text-transform: uppercase; letter-spacing: 0.04em;
      }
      .cfg-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px;
      }
      .cfg-grid label, .cfg-opt {
        display: flex; flex-direction: column; gap: 4px;
        font-size: 11px; color: #aaa;
      }
      .cfg-grid label.full { grid-column: 1 / -1; }
      .cfg-grid input, .cfg-grid select, .cfg-grid textarea,
      .cfg-opt input, .cfg-opt select {
        background: #12151c; border: 1px solid #333; color: #ddd;
        border-radius: 6px; padding: 6px 8px; font-size: 13px;
      }
      .cfg-btn {
        background: #2a2a2a; border: 1px solid #444; color: #ccc;
        border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px;
      }
      .cfg-btn:hover { border-color: #f4a261; }
      .cfg-screen-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 10px; background: #12151c; border: 1px solid #333;
        border-radius: 6px; cursor: pointer;
      }
      .cfg-screen-row.active { border-color: #f4a261; background: #1a1e28; }
      .cfg-screen-name { font-size: 13px; color: #ddd; }
      .cfg-opts {
        display: flex; flex-wrap: wrap; gap: 12px 18px; align-items: flex-end;
      }
      .cfg-opt { flex-direction: row; align-items: center; gap: 8px; }
      .cfg-opt input[type=checkbox] { width: auto; }
      .cfg-budget {
        background: #12151c; border: 1px solid #2a2f3a; border-radius: 8px; padding: 10px 12px;
      }
      .cfg-budget-title { font-size: 11px; color: #f4a261; font-weight: 700; margin-bottom: 8px; }
      .cfg-budget-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 4px 12px;
        font-size: 12px;
      }
      .cfg-budget-grid .k { color: #888; font-family: monospace; margin-right: 6px; }
      .cfg-budget-grid .v { color: #ccc; }
      .cfg-budget-meta { margin-top: 8px; font-size: 12px; color: #aaa; display: flex; flex-direction: column; gap: 2px; }
      .cfg-budget-meta b { color: #ddd; }
      .cfg-budget-blurb { margin: 8px 0 0; font-size: 11px; color: #777; line-height: 1.4; }
    `;
    document.head.appendChild(s);
  }

  function init() {
    buildHTML();
  }

  /** API para outros módulos (editor vivo) */
  function getKernelProfile() {
    const d = ensureData();
    return getProfile(d.kernelProfile);
  }

  function getProfileOptions() {
    return ensureData().profileOptions || {};
  }

  function getGameStyle() {
    return ensureData().gameStyle || 'advanced';
  }

  function allowsHeroMove(dir) {
    const p = getKernelProfile();
    return (p.heroMove || []).includes(dir);
  }

  function playfieldMode() {
    return getKernelProfile().playfield || 'full';
  }


  function getStyleContract(styleId) {
    const id = styleId || getGameStyle();
    return (
      STYLE_CONTRACTS[id] ||
      STYLE_CONTRACTS.advanced || {
        id: id,
        playfield: {
          allowedModes: ['none', 'reflect', 'repeat', 'asymmetric'],
          defaultMode: 'reflect',
          showBandEditor: false,
        },
        editor: { showBands: false },
      }
    );
  }

  function allowedPfModes() {
    const c = getStyleContract();
    if (c.playfield && Array.isArray(c.playfield.allowedModes)) {
      return c.playfield.allowedModes.slice();
    }
    const st = getGameStyle();
    if (st === 'vertical_shooter') return ['none', 'reflect', 'repeat'];
    if (st === 'river_scroll') return ['none', 'reflect'];
    if (st === 'boxing') return ['none', 'reflect'];
    return ['none', 'reflect', 'repeat', 'asymmetric'];
  }

  function showBandEditor() {
    const c = getStyleContract();
    if (c.editor && c.editor.showBands) return true;
    if (c.playfield && c.playfield.showBandEditor) return true;
    return getGameStyle() === 'vertical_shooter';
  }

  function showRiverMapEditor() {
    const c = getStyleContract();
    if (c.playfield && c.playfield.showRiverMapEditor) return true;
    if (c.editor && c.editor.showRiverMap) return true;
    return getGameStyle() === 'river_scroll';
  }

  function showFightEditor() {
    const c = getStyleContract();
    if (c.playfield && c.playfield.showFightEditor) return true;
    if (c.editor && c.editor.showFight) return true;
    return getGameStyle() === 'boxing';
  }

  function showAdventureEditor() {
    const c = getStyleContract();
    if (c.playfield && c.playfield.showAdventureEditor) return true;
    if (c.editor && c.editor.showAdventure) return true;
    return getGameStyle() === 'adventure';
  }

  function showRacingEditor() {
    const c = getStyleContract();
    if (c.playfield && c.playfield.showRacingEditor) return true;
    if (c.editor && c.editor.showRacing) return true;
    return getGameStyle() === 'racing';
  }

  return {
    init,
    flush,
    buildHTML,
    renderScreens,
    getKernelProfile,
    getProfileOptions,
    getGameStyle,
    getStyleContract,
    allowsHeroMove,
    playfieldMode,
    allowedPfModes,
    showBandEditor,
    showRiverMapEditor,
    showFightEditor,
    showAdventureEditor,
    showRacingEditor,
    KERNEL_PROFILES,
    GAME_STYLES,
    STYLE_CONTRACTS,
  };
})();

window.CONFIG = CONFIG;
