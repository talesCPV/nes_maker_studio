<?php
/**
 * Camada 6: Variáveis + motor de Regras (SE/ENTÃO).
 *
 * Fase 1 (o que já compilava): variáveis, SE evento (input P1), SE/DEFINIR/
 * SOMAR/SUBTRAIR variável, ações Definir On Ground/Pausar/Matar/Personalizada,
 * escopo de regra Global ou por Fase.
 *
 * Fase 2 (novo): SE hitbox... toca...:
 *  - Flags nativas (on_ground/out_of_bounds/enter_screen): checagem de estado
 *    simples - o lado B da comparação é ignorado (a UI usa o mesmo step pra
 *    tudo, mas uma flag nativa não é geometricamente uma "colisão").
 *  - Terreno (Sólido/Plataforma): reaproveita world_col_from/get_collision2
 *    (mesmo mecanismo do check_ground do player) numa sub-rotina própria e
 *    isolada, pra checar o tile sob os pés do herói sem mexer no estado que
 *    o motor de física já usa.
 *  - Objetos de hitbox (dano/warp): as instâncias viram uma tabela plana
 *    (tela global, x, y, id numérico do objeto) e uma sub-rotina reutilizável
 *    faz AABB contra o corpo do herói, com o mesmo ajuste de scroll_x que os
 *    inimigos já usam (posição na tela = x - scroll_x, esconde se saiu pela
 *    esquerda).
 *  - Ação Ir para Warp: totalmente resolvida em tempo de compilação (destino
 *    já é conhecido) - troca de tela + reposiciona o herói +, se o destino
 *    fizer parte da sequência principal de fases, também realinha play_idx,
 *    pré-carrega a próxima tela do par de scroll e re-spawna os inimigos
 *    (mesma sequência que o st_splash já faz ao entrar na fase 1ª vez).
 *
 * Fase 2.1 (correção de bug real encontrado em teste): toda regra com pelo
 * menos 1 condição de entrada ganha 1 bit de estado próprio (empacotado
 * 8/byte) - os efeitos/ações só executam na TRANSIÇÃO falso->verdadeiro da
 * condição, não em todo frame em que ela continuar batendo. Sem isso, uma
 * regra como "SE toca objeto de warp ENTÃO Ir para Warp" disparava
 * load_screen sem parar enquanto o herói ficasse encostado no objeto,
 * corrompendo a tela. Regras sem nenhuma condição de entrada (só efeitos)
 * mantêm o comportamento antigo (rodam todo frame, não tem "borda").
 *
 * Fase 3 (novo): SE hitbox de personagem... toca... (body/attack/hurt).
 * Cada hitbox de personagem é um retângulo FIXO (x,y,w,h relativo à posição
 * do personagem) - não depende do frame de animação atual, o que simplifica
 * bastante. Cobre herói-vs-outro-personagem (check_char_hero_hit) e, desde a
 * Fase 4, também personagem-vs-personagem sem o herói em nenhum dos lados
 * (check_char_char_hit, loop duplo de instâncias - ex: inimigo vs inimigo,
 * projétil vs inimigo). Quando a ação Matar vem logo depois de um SE hitbox
 * de personagem que bateu, mata só a(s) instância(s) específica(s) que
 * colidiram (via pv_hb_matched_inst/pv_hb_matched_inst_a), não todas as do
 * mesmo tipo.
 *
 * Fase 4 (bugs de comportamento corrigidos junto): removidas duas reações
 * automáticas herdadas de antes da Camada 6 que rodavam por fora das regras
 * - (1) o bump-back fixo jogador-vs-inimigo (check_player_enemy_hit) e (2)
 * o respawn automático ao cair fora dos limites. As duas viravam "regras
 * invisíveis" que disparavam mesmo sem nenhuma regra configurada pelo
 * usuário, e ainda rodavam em paralelo com regras reais pro mesmo evento.
 * Agora só a flag nativa dispara (pv_ev_oob / SE hitbox nativo) - o que
 * acontece de fato é 100% definido pelas regras do usuário.
 *
 * Fase 8 (Som v2): "Tocar Som" agora cobre música E efeitos sonoros de
 * verdade. Todas as músicas/SFX do projeto (não só a 1ª) são embedados na
 * ROM; trocar de música é só trocar o ponteiro de despacho pra rotina da
 * nova (music_dispatch), sem indirect-indexed addressing nem código
 * auto-modificável (CODE roda direto da ROM). Cada SFX toca no(s) canal(is)
 * que ele mesmo usa no editor de som (igual uma música) - ao ativar, ele
 * "rouba" temporariamente só o REGISTRADOR DE ÁUDIO desse(s) canal(is) da
 * música (guarda sfx_active_ch<N> checada bem em cima de cada escrita no
 * hardware, dentro da rotina da música); o tempo/posição da música nesse
 * canal continua avançando normalmente por baixo, então quando o SFX
 * termina a música retoma exatamente na nota programada pro tempo real
 * daquele instante - sem desincronizar dos outros canais. Ver
 * ProgramCompiler::compilePlaySound e backend/templates/music.php.
 *
 * Ainda fora do escopo (sempre-falso/no-op, não quebra a build): Spawnar
 * Personagem, Aplicar Força de Pulo/Nível de Velocidade (valores fixos no
 * jogo hoje - decisão pendente de virar leitura das tabelas do Dashboard),
 * Abrir/Fechar Menu, Ligar/Desligar Hitbox, Mover, Atirar, eventos
 * P2/custom/menu.
 */
final class ProgramCompiler
{
    private const P1_BUTTON_MASK = [
        'P1-A' => 0x01, 'P1-B' => 0x02, 'P1-SELECT' => 0x04, 'P1-START' => 0x08,
        'P1-UP' => 0x10, 'P1-DOWN' => 0x20, 'P1-LEFT' => 0x40, 'P1-RIGHT' => 0x80,
    ];

    /**
     * @param array $project projeto bruto (.nms)
     * @param array $spriteCtx retorno de ProjectParser::buildSpriteContext (numInstances, heroCharIdx etc)
     * @param array $playIdxs índices globais de tela (mesma ordem de PlayScreenTable)
     * @param array $screenData telas resolvidas (mesma ordem/índices de $playIdxs referenciados)
     */
    public function compile(array $project, array $spriteCtx, array $playIdxs, array $screenData, array $screenIndexById = []): array
    {
        $vars = is_array($project['variables'] ?? null) ? $project['variables'] : [];
        $alloc = $this->allocateVariables($vars);

        $events = is_array($project['events'] ?? null) ? $project['events'] : [];
        $eventById = [];
        foreach ($events as $e) {
            if (is_array($e) && isset($e['id'])) $eventById[(string)$e['id']] = $e;
        }

        $chars = is_array($project['characters'] ?? null) ? $project['characters'] : [];
        $charIndexById = [];
        $charHitboxesById = [];
        foreach ($chars as $i => $c) {
            if (!is_array($c) || !isset($c['id'])) continue;
            $id = (string)$c['id'];
            $charIndexById[$id] = (int)$i;
            $hbs = is_array($c['hitboxes'] ?? null) ? $c['hitboxes'] : [];
            $byHbId = [];
            foreach ($hbs as $hb) {
                if (!is_array($hb) || !isset($hb['id'])) continue;
                $byHbId[(string)$hb['id']] = [
                    'x' => max(0, min(255, (int)($hb['x'] ?? 0))),
                    'y' => max(0, min(255, (int)($hb['y'] ?? 0))),
                    'w' => max(0, min(255, (int)($hb['w'] ?? 8))),
                    'h' => max(0, min(255, (int)($hb['h'] ?? 16))),
                ];
            }
            $charHitboxesById[$id] = $byHbId;
        }
        // Fase 9 fix (rodada 3): so' UM personagem e' o heroi (mesma
        // prioridade de ProjectParser::pickHeroIndex - type=player+nome
        // "hero" > type=player > nome "hero" > 1o personagem). Antes disso,
        // marcar TODO character com type=player como heroi era o bug: esse
        // campo nasce "player" por padrao ao criar qualquer personagem, um
        // projeto pode ter varios assim (inimigo nunca corrigido) e todos
        // viravam alvo valido de "Mover heroi"/etc.
        $heroIds = [];
        $heroIdx = self::pickHeroIndex($chars);
        if (isset($chars[$heroIdx]['id'])) $heroIds[(string)$chars[$heroIdx]['id']] = true;
        $phases = is_array($project['phases'] ?? null) ? $project['phases'] : [];
        $phaseIndexById = [];
        foreach ($phases as $i => $p) {
            if (is_array($p) && isset($p['id'])) $phaseIndexById[(string)$p['id']] = (int)$i;
        }

        // ScreenPhase[indice GLOBAL da tela] = indice numerico da fase dona
        // dela (ou 255 = nenhuma). Cobre TODAS as telas (splash/jogo/game
        // over) - antes so cobria telas de jogo via play_idx, o que deixava
        // "escopo por fase" impossivel de bater pra splash/gameover (essas
        // telas nunca aparecem em play_idx).
        $screenPhase = [];
        foreach ($screenData as $sc) {
            $pid = is_array($sc) ? ($sc['phaseId'] ?? null) : null;
            $screenPhase[] = ($pid !== null && isset($phaseIndexById[(string)$pid])) ? $phaseIndexById[(string)$pid] : 255;
        }
        if (!$screenPhase) $screenPhase[] = 255;

        $rules = is_array($project['rules'] ?? null) ? $project['rules'] : [];
        $numInstances = (int)($spriteCtx['numInstances'] ?? 10);

        // Fase 2: tabela plana de triggers de hitbox (objetos dano/warp
        // colocados no mapa). Cada objeto referenciado ganha um id numérico
        // pequeno (0..N-1), usado tanto nos triggers quanto no SE hitbox.
        $objects = is_array($project['hitboxObjects'] ?? null) ? $project['hitboxObjects'] : [];
        $objectById = [];
        foreach ($objects as $o) if (is_array($o) && isset($o['id'])) $objectById[(string)$o['id']] = $o;

        $globalIdxByScreenKey = [];
        foreach ($screenData as $gi => $sc) {
            if (!is_array($sc) || !isset($sc['id'])) continue;
            $globalIdxByScreenKey[(string)$sc['id']] = (int)$gi;
        }

        $hbObjNumericId = [];
        $triggers = [];
        $instances = is_array($project['hitboxInstances'] ?? null) ? $project['hitboxInstances'] : [];
        foreach ($instances as $inst) {
            if (!is_array($inst)) continue;
            $oid = (string)($inst['objectId'] ?? ($inst['hitboxObjectId'] ?? ''));
            $obj = $objectById[$oid] ?? null;
            if (!is_array($obj) || !in_array($obj['kind'] ?? '', ['dano', 'warp'], true)) continue;
            $sid = (string)($inst['screenId'] ?? '');
            if (!isset($globalIdxByScreenKey[$sid])) continue;
            if (!isset($hbObjNumericId[$oid])) $hbObjNumericId[$oid] = count($hbObjNumericId);
            $triggers[] = [
                'scr' => $globalIdxByScreenKey[$sid],
                'x' => (int)($inst['x'] ?? 0) & 0xFF,
                'y' => (int)($inst['y'] ?? 0) & 0xFF,
                'obj' => $hbObjNumericId[$oid],
            ];
        }
        $jumpForceById = [];
        foreach ((is_array($project['jumpForces'] ?? null) ? $project['jumpForces'] : []) as $jf) {
            if (is_array($jf) && isset($jf['id'])) $jumpForceById[(string)$jf['id']] = max(0, min(255, (int)($jf['value'] ?? 0)));
        }
        $speedLevelById = [];
        foreach ((is_array($project['speedLevels'] ?? null) ? $project['speedLevels'] : []) as $sl) {
            if (is_array($sl) && isset($sl['id'])) $speedLevelById[(string)$sl['id']] = max(0, min(255, (int)($sl['value'] ?? 0)));
        }
        // Fase 6.1: pra ação Carregar Fase - acha a tela de entrada de cada
        // fase (a splash dela, senão o primeiro background). Splash sempre
        // tem prioridade sobre background, independente da ordem em que
        // aparecem em screenData.
        $phaseEntryScreen = [];
        foreach ($screenData as $gi => $sc) {
            if (!is_array($sc) || empty($sc['phaseId'])) continue;
            $pid = (string)$sc['phaseId'];
            if (($sc['type'] ?? '') === 'splash') { $phaseEntryScreen[$pid] = (int)$gi; }
            elseif (!isset($phaseEntryScreen[$pid])) { $phaseEntryScreen[$pid] = (int)$gi; }
        }

        $hbCtx = [
            'objNumericId' => $hbObjNumericId,
            'objectById' => $objectById,
            'triggers' => $triggers,
            'globalIdxByScreenKey' => $globalIdxByScreenKey,
            'playIdxs' => $playIdxs,
            'screenData' => $screenData,
            'charHitboxesById' => $charHitboxesById,
            'heroIds' => $heroIds,
            'charIndexById' => $charIndexById,
            'jumpForceById' => $jumpForceById,
            'speedLevelById' => $speedLevelById,
            'phaseEntryScreen' => $phaseEntryScreen,
            'phaseIndexById' => $phaseIndexById,
            'screenIndexById' => $screenIndexById,
            'soundsById' => $this->buildSoundsById($project),
        ];

        $ruleBodies = [];
        $dispatch = [];
        $ri = 0;
        foreach ($rules as $rule) {
            if (!is_array($rule) || empty($rule['steps']) || !is_array($rule['steps'])) continue;
            $label = "prule_{$ri}";
            // Fase 2.1: 1 bit de estado por regra (empacotado 8/byte, mesma
            // convenção das variáveis bool) - a regra só EXECUTA os efeitos/
            // ações na transição falso->verdadeiro das condições, não em todo
            // frame em que elas continuarem batendo. Sem isso, uma regra tipo
            // "SE vida == 0 ENTÃO Matar + Ir para Warp" dispara sem parar
            // enquanto a vida ficar em 0 (ex: Matar/Warp toda vez, muitas
            // vezes por segundo) - causa real de comportamento errático e,
            // se a ação mexe em PPU (ex: goto_warp -> load_screen), pode
            // corromper a tela.
            $bitGroup = 'pv_rs' . intdiv($ri, 8);
            $bitIdx = $ri % 8;
            $ruleBodies[] = $this->compileRule($label, $ri, $rule, $alloc, $eventById, $charIndexById, $heroIds, $numInstances, $hbCtx, $bitGroup, $bitIdx);
            $scope = (string)($rule['scope'] ?? 'global');
            if ($scope === 'global') {
                $dispatch[] = "  JSR {$label}";
            } elseif (isset($phaseIndexById[$scope])) {
                $pidx = $phaseIndexById[$scope];
                $dispatch[] = "  LDX cur_screen";
                $dispatch[] = "  LDA ScreenPhase,X";
                $dispatch[] = "  CMP #{$pidx}";
                $dispatch[] = "  BNE {$label}_scope_skip";
                $dispatch[] = "  JSR {$label}";
                $dispatch[] = "{$label}_scope_skip:";
            }
            // scope aponta pra uma fase que não existe (deletada) -> regra fica órfã, nunca roda.
            $ri++;
        }

        return [
            'alloc' => $alloc,
            'ruleBodies' => $ruleBodies,
            'dispatch' => $dispatch,
            'screenPhase' => $screenPhase,
            'hbTriggers' => $triggers,
            'ruleStateBytes' => intdiv($ri + 7, 8),
            'numInstances' => $numInstances,
        ];
    }

    /**
     * Aloca endereço LÓGICO (não byte real - isso fica a cargo do ca65 via
     * .res sequencial) pra cada variável: bools são agrupados 8 por byte
     * dentro do MESMO grupo zeroPage/RAM, na ordem em que aparecem; byte/word
     * abrem seu próprio .res.
     */
    private function allocateVariables(array $vars): array
    {
        $list = [];
        $zpBoolGroup = null; $zpBoolBit = 0; $zpBoolIdx = 0;
        $ramBoolGroup = null; $ramBoolBit = 0; $ramBoolIdx = 0;
        foreach ($vars as $v) {
            if (!is_array($v) || empty($v['id']) || empty($v['name'])) continue;
            $id = (string)$v['id'];
            $type = in_array($v['type'] ?? '', ['bool', 'byte', 'word'], true) ? $v['type'] : 'byte';
            $zp = !empty($v['zeroPage']);
            $initial = (int)($v['initialValue'] ?? 0);
            $safeName = preg_replace('/[^a-zA-Z0-9_]/', '_', (string)$v['name']);
            if ($type === 'bool') {
                $initial = $initial ? 1 : 0;
                if ($zp) {
                    if ($zpBoolGroup === null || $zpBoolBit >= 8) { $zpBoolGroup = 'pv_zb' . ($zpBoolIdx++); $zpBoolBit = 0; }
                    $list[$id] = ['id' => $id, 'name' => $safeName, 'type' => 'bool', 'zeroPage' => true, 'label' => $zpBoolGroup, 'bit' => $zpBoolBit, 'initial' => $initial];
                    $zpBoolBit++;
                } else {
                    if ($ramBoolGroup === null || $ramBoolBit >= 8) { $ramBoolGroup = 'pv_rb' . ($ramBoolIdx++); $ramBoolBit = 0; }
                    $list[$id] = ['id' => $id, 'name' => $safeName, 'type' => 'bool', 'zeroPage' => false, 'label' => $ramBoolGroup, 'bit' => $ramBoolBit, 'initial' => $initial];
                    $ramBoolBit++;
                }
            } else {
                $size = $type === 'word' ? 2 : 1;
                $max = $type === 'word' ? 65535 : 255;
                $initial = max(0, min($max, $initial));
                $label = ($zp ? 'pv_z_' : 'pv_r_') . $safeName . '_' . substr(md5($id), 0, 4);
                $list[$id] = ['id' => $id, 'name' => $safeName, 'type' => $type, 'zeroPage' => $zp, 'label' => $label, 'sizeBytes' => $size, 'initial' => $initial];
            }
        }
        // Grupos de bool precisam do valor inicial combinado (OR de todos os bits do grupo).
        $groupInitial = [];
        foreach ($list as $v) {
            if ($v['type'] !== 'bool') continue;
            $g = $v['label'];
            $groupInitial[$g] = ($groupInitial[$g] ?? 0) | ($v['initial'] ? (1 << $v['bit']) : 0);
        }
        return ['vars' => $list, 'groupInitial' => $groupInitial];
    }

    private function compileRule(string $label, int $ri, array $rule, array $alloc, array $eventById, array $charIndexById, array $heroIds, int $numInstances, array $hbCtx, string $bitGroup, int $bitIdx): string
    {
        $mask = 1 << $bitIdx;
        $condFail = "{$label}_cond";  // {$condFail}_end = alvo de falha das condicoes (ver compileIf*)
        $condLines = [];
        $restLines = [];
        $si = 0;
        $inLeadingConditions = true;
        $hasLeadingCondition = false;
        $hasHoldEvent = false;
        $lastInstanceTargets = [];
        foreach ($rule['steps'] as $step) {
            if (!is_array($step)) continue;
            $tag = "{$label}_s{$si}";
            $type = (string)($step['type'] ?? '');
            $isCondition = in_array($type, ['if_event', 'if_hitbox', 'if_var', 'if_screen'], true);
            if ($isCondition && $inLeadingConditions) {
                $hasLeadingCondition = true;
                if ($type === 'if_event') { $r = $this->compileIfEvent($tag, $condFail, $step, $eventById); $condLines = array_merge($condLines, $r['lines']); if ($r['isHold']) $hasHoldEvent = true; $lastInstanceTargets = []; }
                elseif ($type === 'if_hitbox') { $r = $this->compileIfHitbox($tag, $condFail, $step, $hbCtx); $condLines = array_merge($condLines, $r['lines']); $lastInstanceTargets = $r['instanceTargets']; }
                elseif ($type === 'if_screen') { $condLines = array_merge($condLines, $this->compileIfScreen($tag, $condFail, $step, $hbCtx)); $lastInstanceTargets = []; }
                else { $condLines = array_merge($condLines, $this->compileIfVar($tag, $condFail, $step, $alloc)); $lastInstanceTargets = []; }
            } else {
                $inLeadingConditions = false;
                if ($type === 'if_event') { $r = $this->compileIfEvent($tag, $condFail, $step, $eventById); $restLines = array_merge($restLines, $r['lines']); $lastInstanceTargets = []; }
                elseif ($type === 'if_hitbox') { $r = $this->compileIfHitbox($tag, $condFail, $step, $hbCtx); $restLines = array_merge($restLines, $r['lines']); $lastInstanceTargets = $r['instanceTargets']; }
                elseif ($type === 'if_screen') { $restLines = array_merge($restLines, $this->compileIfScreen($tag, $condFail, $step, $hbCtx)); $lastInstanceTargets = []; }
                elseif ($type === 'if_var') { $restLines = array_merge($restLines, $this->compileIfVar($tag, $condFail, $step, $alloc)); $lastInstanceTargets = []; }
                elseif (in_array($type, ['set_var', 'add_var', 'sub_var'], true)) { $restLines = array_merge($restLines, $this->compileVarEffect($tag, $type, $step, $alloc)); }
                elseif ($type === 'action') { $restLines = array_merge($restLines, $this->compileAction($tag, $step, $charIndexById, $heroIds, $numInstances, $hbCtx, $lastInstanceTargets)); }
            }
            $si++;
        }

        $lines = [];
        $lines[] = "; regra: " . (string)($rule['name'] ?? $label);
        $lines[] = "{$label}:";
        $lines = array_merge($lines, $condLines);

        if (!$hasLeadingCondition || $hasHoldEvent) {
            // Regra sem nenhuma condicao de entrada (só efeitos), ou que usa
            // um evento "segurado" (Fase 6: precisa repetir todo frame
            // enquanto o botao estiver preso - ex: Mover - entao pula o
            // disparo por borda de proposito, mesmo tendo condicao).
            $lines = array_merge($lines, $restLines);
            $lines[] = "  JMP {$label}_end";
            // {label}_cond_end precisa existir sempre que houver condicao de
            // entrada (o codigo da condicao ja referencia esse rotulo) -
            // aqui so cai direto pro fim, sem bit de estado pra mexer.
            if ($hasLeadingCondition) $lines[] = "{$label}_cond_end:";
            $lines[] = "{$label}_end:";
            $lines[] = "  RTS";
            return implode("\n", $lines);
        }

        // Chegou aqui = as condicoes de entrada bateram este frame.
        $lines[] = "  ; Fase 2.1: so executa os efeitos na transicao falso->verdadeiro";
        $lines[] = "  LDA {$bitGroup}";
        $lines[] = sprintf('  AND #$%02X', $mask);
        $lines[] = "  BNE {$label}_end   ; ja estava ativa - nao repete";
        $lines[] = "  LDA {$bitGroup}";
        $lines[] = sprintf('  ORA #$%02X', $mask);
        $lines[] = "  STA {$bitGroup}";
        $lines = array_merge($lines, $restLines);
        $lines[] = "  JMP {$label}_end";
        $lines[] = "{$label}_cond_end:";
        $lines[] = "  ; alguma condicao falhou - desliga o bit (proxima vez que baterem, dispara de novo)";
        $lines[] = "  LDA {$bitGroup}";
        $lines[] = sprintf('  AND #$%02X', (~$mask) & 0xFF);
        $lines[] = "  STA {$bitGroup}";
        $lines[] = "{$label}_end:";
        $lines[] = "  RTS";
        return implode("\n", $lines);
    }

    /**
     * SE Carregar a Tela: <tela especifica>. Igual a pv_ev_enter (pulso de 1
     * frame, so verdadeiro no frame exato em que a tela entrou), mas em vez
     * de disparar pra QUALQUER tela (ou depender do escopo da regra), o
     * alvo e' uma tela literal escolhida na UI - dispara sempre que aquela
     * tela especifica (e só ela) acabar de ser colocada na PPU, seja
     * splash, uma tela de fase ou a de game over.
     */
    private function compileIfScreen(string $tag, string $ruleEnd, array $step, array $hbCtx): array
    {
        $screenId = (string)($step['screenId'] ?? '');
        $idx = $hbCtx['screenIndexById'][$screenId] ?? null;
        if ($screenId === '' || $idx === null) {
            return ["  ; SE Carregar a Tela - tela '{$screenId}' nao encontrada no jogo compilado, sempre falso", "  JMP {$ruleEnd}_end"];
        }
        return [
            "  ; SE Carregar a Tela (indice {$idx})",
            '  LDA pv_ev_enter',
            "  BEQ {$ruleEnd}_end",
            '  LDA cur_screen',
            "  CMP #{$idx}",
            "  BNE {$ruleEnd}_end",
        ];
    }

    private function compileIfHitbox(string $tag, string $ruleEnd, array $step, array $hbCtx): array
    {
        $a = (string)($step['hitboxA'] ?? '');
        $b = (string)($step['hitboxB'] ?? '');
        // Convenção da UI: um "SE hitbox... toca..." com um lado nativo (flag
        // de estado, não geometria) checa só esse lado - o outro é ignorado.
        $ref = str_starts_with($a, 'native:') ? $a : (str_starts_with($b, 'native:') ? $b : null);
        if ($ref !== null) {
            $flag = substr($ref, 7);
            $var = $flag === 'on_ground' ? 'on_ground' : ($flag === 'out_of_bounds' ? 'pv_ev_oob' : ($flag === 'enter_screen' ? 'pv_ev_enter' : ($flag === 'enter_splash' ? 'pv_ev_enter_splash' : null)));
            if ($var === null) return ['lines' => ["  ; SE hitbox nativo desconhecido '{$flag}' - sempre falso", "  JMP {$ruleEnd}_end"], 'instanceTargets' => []];
            return ['lines' => ["  ; SE hitbox nativo: {$flag}", "  LDA {$var}", "  BEQ {$ruleEnd}_end"], 'instanceTargets' => []];
        }
        $ref = str_starts_with($a, 'terrain:') ? $a : (str_starts_with($b, 'terrain:') ? $b : null);
        if ($ref !== null) {
            $terrType = (int)substr($ref, 8);
            return ['lines' => [
                "  ; SE hitbox terreno tipo {$terrType} (sob os pes do heroi)",
                "  LDA #{$terrType}",
                "  JSR check_terrain_type",
                "  BEQ {$ruleEnd}_end",
            ], 'instanceTargets' => []];
        }
        $ref = str_starts_with($a, 'hbobj:') ? $a : (str_starts_with($b, 'hbobj:') ? $b : null);
        if ($ref !== null) {
            $objId = substr($ref, 6);
            if (!isset($hbCtx['objNumericId'][$objId])) {
                return ['lines' => ["  ; SE hitbox objeto '{$objId}' sem instancia colocada no mapa - sempre falso", "  JMP {$ruleEnd}_end"], 'instanceTargets' => []];
            }
            $numId = $hbCtx['objNumericId'][$objId];
            return ['lines' => [
                "  ; SE hitbox objeto (dano/warp) toca o heroi",
                "  LDA #{$numId}",
                "  JSR check_hbobj_hit",
                "  BEQ {$ruleEnd}_end",
            ], 'instanceTargets' => []];
        }
        if (str_starts_with($a, 'char:') && str_starts_with($b, 'char:')) {
            return $this->compileIfCharHitbox($tag, $ruleEnd, $a, $b, $hbCtx);
        }
        return ['lines' => ["  ; SE hitbox de personagem: referencia incompleta ou desconhecida - sempre falso", "  JMP {$ruleEnd}_end"], 'instanceTargets' => []];
    }

    /**
     * Fase 3: "SE hitbox de personagem... toca..." entre dois personagens.
     * Cada hitbox de personagem é um retângulo FIXO (x,y,w,h relativo à
     * posição do personagem) - não depende do frame de animação atual.
     * Suporta herói-vs-outro-personagem (via check_char_hero_hit) e, desde a
     * Fase 4, também personagem-vs-personagem sem o herói em nenhum dos dois
     * lados (via check_char_char_hit, loop duplo de instâncias).
     */
    private function compileIfCharHitbox(string $tag, string $ruleEnd, string $a, string $b, array $hbCtx): array
    {
        [$charA, $hbA] = array_pad(explode(':', substr($a, 5), 2), 2, '');
        [$charB, $hbB] = array_pad(explode(':', substr($b, 5), 2), 2, '');
        $heroSide = null; $otherSide = null;
        if (isset($hbCtx['heroIds'][$charA]) && !isset($hbCtx['heroIds'][$charB])) { $heroSide = [$charA, $hbA]; $otherSide = [$charB, $hbB]; }
        elseif (isset($hbCtx['heroIds'][$charB]) && !isset($hbCtx['heroIds'][$charA])) { $heroSide = [$charB, $hbB]; $otherSide = [$charA, $hbA]; }

        if ($heroSide === null) {
            return $this->compileIfCharCharHitbox($tag, $ruleEnd, $charA, $hbA, $charB, $hbB, $hbCtx);
        }

        [$heroCharId, $heroHbId] = $heroSide;
        [$otherCharId, $otherHbId] = $otherSide;
        $heroHb = $hbCtx['charHitboxesById'][$heroCharId][$heroHbId] ?? null;
        $otherHb = $hbCtx['charHitboxesById'][$otherCharId][$otherHbId] ?? null;
        $otherIdx = $hbCtx['charIndexById'][$otherCharId] ?? null;
        if (!$heroHb || !$otherHb || $otherIdx === null) {
            return ['lines' => ["  ; SE hitbox de personagem: hitbox ou personagem nao encontrado - sempre falso", "  JMP {$ruleEnd}_end"], 'instanceTargets' => []];
        }
        return ['lines' => [
            "  ; SE hitbox: heroi ({$heroHbId}) toca personagem-alvo ({$otherHbId})",
            "  LDA player_x",
            "  CLC",
            "  ADC #{$heroHb['x']}",
            "  STA pv_hbA_x",
            "  LDA player_y",
            "  CLC",
            "  ADC #{$heroHb['y']}",
            "  STA pv_hbA_y",
            "  LDA #{$heroHb['w']}",
            "  STA pv_hbA_w",
            "  LDA #{$heroHb['h']}",
            "  STA pv_hbA_h",
            "  LDA #{$otherHb['x']}",
            "  STA pv_char_hb_x",
            "  LDA #{$otherHb['y']}",
            "  STA pv_char_hb_y",
            "  LDA #{$otherHb['w']}",
            "  STA pv_hbB_w",
            "  LDA #{$otherHb['h']}",
            "  STA pv_hbB_h",
            "  LDA #{$otherIdx}",
            "  JSR check_char_hero_hit",
            "  BEQ {$ruleEnd}_end",
        ], 'instanceTargets' => [$otherCharId => 'pv_hb_matched_inst']];
    }

    /**
     * Fase 4: "SE hitbox de personagem... toca..." entre dois personagens
     * SEM o herói em nenhum dos lados (ex: inimigo vs inimigo, projétil vs
     * inimigo). Precisa de um loop duplo de instâncias (check_char_char_hit)
     * - mais caro que o caso com herói, então só compila esse loop quando a
     * regra realmente usa esse tipo de comparação.
     */
    private function compileIfCharCharHitbox(string $tag, string $ruleEnd, string $charA, string $hbAId, string $charB, string $hbBId, array $hbCtx): array
    {
        $hbA = $hbCtx['charHitboxesById'][$charA][$hbAId] ?? null;
        $hbB = $hbCtx['charHitboxesById'][$charB][$hbBId] ?? null;
        $idxA = $hbCtx['charIndexById'][$charA] ?? null;
        $idxB = $hbCtx['charIndexById'][$charB] ?? null;
        if (!$hbA || !$hbB || $idxA === null || $idxB === null) {
            return ['lines' => ["  ; SE hitbox personagem-vs-personagem: hitbox ou personagem nao encontrado - sempre falso", "  JMP {$ruleEnd}_end"], 'instanceTargets' => []];
        }
        return ['lines' => [
            "  ; SE hitbox: personagem A ({$hbAId}) toca personagem B ({$hbBId}) - Fase 4",
            "  LDA #{$hbA['x']}",
            "  STA pv_char_hb_x",
            "  LDA #{$hbA['y']}",
            "  STA pv_char_hb_y",
            "  LDA #{$hbA['w']}",
            "  STA pv_hbA_w",
            "  LDA #{$hbA['h']}",
            "  STA pv_hbA_h",
            "  LDA #{$hbB['x']}",
            "  STA pv_char_hb2_x",
            "  LDA #{$hbB['y']}",
            "  STA pv_char_hb2_y",
            "  LDA #{$hbB['w']}",
            "  STA pv_hbB_w",
            "  LDA #{$hbB['h']}",
            "  STA pv_hbB_h",
            "  LDA #{$idxB}",
            "  STA pv_char_target2",
            "  LDA #{$idxA}",
            "  JSR check_char_char_hit",
            "  BEQ {$ruleEnd}_end",
        ], 'instanceTargets' => [$charA => 'pv_hb_matched_inst_a', $charB => 'pv_hb_matched_inst']];
    }

    private function compileIfEvent(string $tag, string $ruleEnd, array $step, array $eventById): array
    {
        $ev = $eventById[(string)($step['eventId'] ?? '')] ?? null;
        if (!is_array($ev) || ($ev['category'] ?? '') !== 'input') {
            return ['lines' => ["  ; SE evento: nao-input (custom/menu) - Fase 2, sempre falso", "  JMP {$ruleEnd}_end"], 'isHold' => false];
        }
        $button = (string)($ev['button'] ?? '');
        $isHold = ($ev['trigger'] ?? 'press') === 'hold';
        if ($button === 'P1-IDLE') {
            $idleTime = max(0, (int)($step['idleTime'] ?? 0));
            $lo = $idleTime & 0xFF;
            $hi = ($idleTime >> 8) & 0xFF;
            return ['lines' => [
                "  ; SE evento: P1-IDLE >= {$idleTime} frame(s)",
                "  LDA pv_idle+1",
                "  CMP #{$hi}",
                "  BCC {$ruleEnd}_end",
                "  BNE {$tag}_idle_ok",
                "  LDA pv_idle",
                "  CMP #{$lo}",
                "  BCC {$ruleEnd}_end",
                "{$tag}_idle_ok:",
            ], 'isHold' => false];
        }
        if (isset(self::P1_BUTTON_MASK[$button])) {
            $mask = self::P1_BUTTON_MASK[$button];
            $reg = $isHold ? 'pad1' : 'pad1_edge';
            return ['lines' => [
                "  ; SE evento: {$button} " . ($isHold ? 'segurado' : 'pressionado'),
                "  LDA {$reg}",
                sprintf('  AND #$%02X', $mask),
                "  BEQ {$ruleEnd}_end",
            ], 'isHold' => $isHold];
        }
        return ['lines' => ["  ; SE evento: {$button} (P2 ainda sem leitura de controle) - sempre falso", "  JMP {$ruleEnd}_end"], 'isHold' => false];
    }

    private function compileIfVar(string $tag, string $ruleEnd, array $step, array $alloc): array
    {
        $v = $alloc['vars'][(string)($step['varId'] ?? '')] ?? null;
        if (!$v) return ["  ; SE variavel: referencia quebrada - sempre falso", "  JMP {$ruleEnd}_end"];
        $op = (string)($step['op'] ?? '==');
        $value = (int)($step['value'] ?? 0);
        if ($v['type'] === 'bool') {
            $target = $value ? 1 : 0;
            $lines = ["  ; SE variavel bool: {$v['name']} {$op} {$target}"];
            $lines[] = "  LDA {$v['label']}";
            $lines[] = sprintf('  AND #$%02X', 1 << $v['bit']);
            if (($op === '==' && $target === 1) || ($op === '!=' && $target === 0) || ($op === '>' && $target === 0)) {
                $lines[] = "  BEQ {$ruleEnd}_end";
            } elseif (($op === '==' && $target === 0) || ($op === '!=' && $target === 1) || ($op === '<' && $target === 1)) {
                $lines[] = "  BNE {$ruleEnd}_end";
            }
            // demais combinacoes (>=,<=, ou comparar contra valor fora de 0/1) sao sempre
            // verdadeiras/falsas de forma trivial - sem branch extra necessario.
            return $lines;
        }
        if ($v['type'] === 'word') {
            $lo = $value & 0xFF; $hi = ($value >> 8) & 0xFF;
            $label = $v['label'];
            $lines = ["  ; SE variavel word: {$v['name']} {$op} {$value}"];
            switch ($op) {
                case '==':
                    $lines[] = "  LDA {$label}+1"; $lines[] = "  CMP #{$hi}"; $lines[] = "  BNE {$ruleEnd}_end";
                    $lines[] = "  LDA {$label}"; $lines[] = "  CMP #{$lo}"; $lines[] = "  BNE {$ruleEnd}_end";
                    break;
                case '!=':
                    $lines[] = "  LDA {$label}+1"; $lines[] = "  CMP #{$hi}"; $lines[] = "  BNE {$tag}_ok";
                    $lines[] = "  LDA {$label}"; $lines[] = "  CMP #{$lo}"; $lines[] = "  BEQ {$ruleEnd}_end";
                    $lines[] = "{$tag}_ok:";
                    break;
                case '>': case '<=':
                    // A > V  <=>  NAO (A <= V). Calcula "A <= V" e inverte conforme o op.
                    $lines[] = "  LDA {$label}+1"; $lines[] = "  CMP #{$hi}";
                    $lines[] = "  BCC {$tag}_lo"; // hi < Vhi -> A<=V verdadeiro (segue pra lo se igual)
                    $lines[] = "  BNE {$tag}_gt"; // hi > Vhi -> A>V
                    $lines[] = "  LDA {$label}"; $lines[] = "  CMP #{$lo}";
                    $lines[] = "  BCC {$tag}_lo"; $lines[] = "  BEQ {$tag}_lo";
                    $lines[] = "{$tag}_gt:";
                    $lines[] = $op === '>' ? "  JMP {$tag}_ok" : "  JMP {$ruleEnd}_end";
                    $lines[] = "{$tag}_lo:";
                    $lines[] = $op === '>' ? "  JMP {$ruleEnd}_end" : "  JMP {$tag}_ok";
                    $lines[] = "{$tag}_ok:";
                    break;
                case '<': case '>=':
                    $lines[] = "  LDA {$label}+1"; $lines[] = "  CMP #{$hi}";
                    $lines[] = "  BCC {$tag}_lt";
                    $lines[] = "  BNE {$tag}_ge";
                    $lines[] = "  LDA {$label}"; $lines[] = "  CMP #{$lo}";
                    $lines[] = "  BCC {$tag}_lt";
                    $lines[] = "{$tag}_ge:";
                    $lines[] = $op === '<' ? "  JMP {$ruleEnd}_end" : "  JMP {$tag}_ok";
                    $lines[] = "{$tag}_lt:";
                    $lines[] = $op === '<' ? "  JMP {$tag}_ok" : "  JMP {$ruleEnd}_end";
                    $lines[] = "{$tag}_ok:";
                    break;
            }
            return $lines;
        }
        // byte
        $label = $v['label']; $value &= 0xFF;
        $lines = ["  ; SE variavel byte: {$v['name']} {$op} {$value}", "  LDA {$label}", "  CMP #{$value}"];
        switch ($op) {
            case '==': $lines[] = "  BNE {$ruleEnd}_end"; break;
            case '!=': $lines[] = "  BEQ {$ruleEnd}_end"; break;
            case '>':  $lines[] = "  BCC {$ruleEnd}_end"; $lines[] = "  BEQ {$ruleEnd}_end"; break;
            case '<':  $lines[] = "  BCS {$ruleEnd}_end"; break;
            case '>=': $lines[] = "  BCC {$ruleEnd}_end"; break;
            case '<=': $lines[] = "  BCC {$tag}_ok"; $lines[] = "  BEQ {$tag}_ok"; $lines[] = "  JMP {$ruleEnd}_end"; $lines[] = "{$tag}_ok:"; break;
        }
        return $lines;
    }

    private function compileVarEffect(string $tag, string $type, array $step, array $alloc): array
    {
        $v = $alloc['vars'][(string)($step['varId'] ?? '')] ?? null;
        if (!$v) return ["  ; efeito de variavel: referencia quebrada - ignorado"];
        $value = (int)($step['value'] ?? 0);
        $opLabel = $type === 'set_var' ? 'DEFINIR' : ($type === 'add_var' ? 'SOMAR' : 'SUBTRAIR');
        if ($v['type'] === 'bool') {
            $mask = 1 << $v['bit'];
            if ($type === 'set_var') {
                return $value
                    ? ["  ; {$opLabel} bool {$v['name']} = 1", "  LDA {$v['label']}", sprintf('  ORA #$%02X', $mask), "  STA {$v['label']}"]
                    : ["  ; {$opLabel} bool {$v['name']} = 0", "  LDA {$v['label']}", sprintf('  AND #$%02X', (~$mask) & 0xFF), "  STA {$v['label']}"];
            }
            // add liga, sub desliga - unica semantica coerente pra aritmetica num bit.
            $mask2 = $type === 'add_var' ? $mask : ((~$mask) & 0xFF);
            $op2 = $type === 'add_var' ? 'ORA' : 'AND';
            return ["  ; {$opLabel} bool {$v['name']} (liga/desliga o bit)", "  LDA {$v['label']}", sprintf('  %s #$%02X', $op2, $mask2), "  STA {$v['label']}"];
        }
        if ($v['type'] === 'word') {
            $lo = $value & 0xFF; $hi = ($value >> 8) & 0xFF; $label = $v['label'];
            if ($type === 'set_var') {
                return ["  ; {$opLabel} word {$v['name']} = {$value}", "  LDA #{$lo}", "  STA {$label}", "  LDA #{$hi}", "  STA {$label}+1"];
            }
            $op1 = $type === 'add_var' ? 'ADC' : 'SBC';
            $carry = $type === 'add_var' ? 'CLC' : 'SEC';
            return [
                "  ; {$opLabel} word {$v['name']} {$value}",
                "  {$carry}", "  LDA {$label}", "  {$op1} #{$lo}", "  STA {$label}",
                "  LDA {$label}+1", "  {$op1} #{$hi}", "  STA {$label}+1",
            ];
        }
        // byte
        $label = $v['label']; $value &= 0xFF;
        if ($type === 'set_var') return ["  ; {$opLabel} byte {$v['name']} = {$value}", "  LDA #{$value}", "  STA {$label}"];
        $op1 = $type === 'add_var' ? 'ADC' : 'SBC';
        $carry = $type === 'add_var' ? 'CLC' : 'SEC';
        return ["  ; {$opLabel} byte {$v['name']} {$value} (sem clamp - estoura como aritmetica 6502 padrao)", "  {$carry}", "  LDA {$label}", "  {$op1} #{$value}", "  STA {$label}"];
    }

    private function compileAction(string $tag, array $step, array $charIndexById, array $heroIds, int $numInstances, array $hbCtx, array $instanceTargets = []): array
    {
        $actionId = (string)($step['actionId'] ?? '');
        $targetId = (string)($step['targetId'] ?? '');
        switch ($actionId) {
            case 'set_on_ground':
                if (isset($heroIds[$targetId])) {
                    $val = ((string)($step['value'] ?? '1')) === '0' ? 0 : 1;
                    return ["  ; Acao: Definir On Ground (heroi) = {$val}", "  LDA #{$val}", "  STA on_ground"];
                }
                return ["  ; Acao: Definir On Ground - so suportado pro heroi por enquanto (alvo nao e o heroi)"];
            case 'pause_game':
                return ["  ; Acao: Pausar/despausar o jogo", "  LDA pv_game_paused", "  EOR #1", "  STA pv_game_paused"];
            case 'kill_character':
                if (isset($heroIds[$targetId])) {
                    return [
                        "  ; Acao: Matar (heroi) - mesma logica de respawn da queda",
                        "  LDA #40", "  STA player_x", "  LDA #32", "  STA player_y",
                        "  LDA #0", "  STA jump_cnt",
                    ];
                }
                if (isset($charIndexById[$targetId]) && isset($instanceTargets[$targetId])) {
                    // A condicao logo antes (SE hitbox de personagem) ja achou
                    // a instancia especifica que bateu - mata só ela, não
                    // todas as do mesmo tipo (mais correto pra "matar inimigo").
                    $scratchVar = $instanceTargets[$targetId];
                    return [
                        "  ; Acao: Matar (so a instancia que bateu na condicao SE hitbox anterior)",
                        "  LDX {$scratchVar}",
                        "  LDA #0",
                        "  STA inst_on,X",
                    ];
                }
                if (isset($charIndexById[$targetId])) {
                    $idx = $charIndexById[$targetId];
                    return [
                        "  ; Acao: Matar (todas as instancias do personagem-alvo)",
                        "  LDX #0",
                        "{$tag}_loop:",
                        "  LDA inst_char,X",
                        "  CMP #{$idx}",
                        "  BNE {$tag}_next",
                        "  LDA #0",
                        "  STA inst_on,X",
                        "{$tag}_next:",
                        "  INX",
                        "  CPX #{$numInstances}",
                        "  BNE {$tag}_loop",
                    ];
                }
                return ["  ; Acao: Matar - alvo nao encontrado, ignorado"];
            case 'goto_warp':
                return $this->compileGotoWarp($tag, $targetId, $hbCtx);
            case 'apply_jump_force':
                $charId = (string)($step['charId'] ?? '');
                if ($charId !== '' && !isset($heroIds[$charId])) {
                    return ["  ; Acao: Aplicar Forca de Pulo - so suportado pro heroi por enquanto (alvo nao e o heroi)"];
                }
                if (!isset($hbCtx['jumpForceById'][$targetId])) {
                    return ["  ; Acao: Aplicar Forca de Pulo - entrada '{$targetId}' nao encontrada na tabela, ignorado"];
                }
                $val = $hbCtx['jumpForceById'][$targetId];
                return ["  ; Acao: Aplicar Forca de Pulo ({$val} frames de impulso)", "  LDA #{$val}", "  STA pv_jump_force"];
            case 'apply_speed_level':
                $charId = (string)($step['charId'] ?? '');
                if ($charId !== '' && !isset($heroIds[$charId])) {
                    return ["  ; Acao: Aplicar Nivel de Velocidade - so suportado pro heroi por enquanto (alvo nao e o heroi)"];
                }
                if (!isset($hbCtx['speedLevelById'][$targetId])) {
                    return ["  ; Acao: Aplicar Nivel de Velocidade - entrada '{$targetId}' nao encontrada na tabela, ignorado"];
                }
                $val = $hbCtx['speedLevelById'][$targetId];
                return ["  ; Acao: Aplicar Nivel de Velocidade ({$val} px/frame)", "  LDA #{$val}", "  STA pv_move_speed"];
            case 'move_character': {
                $charId = (string)($step['charId'] ?? '');
                if (!isset($heroIds[$charId])) {
                    return ["  ; Acao: Mover - so suportado pro heroi por enquanto (alvo nao e o heroi)"];
                }
                $direction = (string)($step['direction'] ?? '');
                $flip = (string)($step['flip'] ?? 'default');
                if ($direction === 'left') {
                    $lines = ["  ; Acao: Mover heroi esquerda", "  JSR mv_hero_left"];
                } elseif ($direction === 'right') {
                    $lines = ["  ; Acao: Mover heroi direita", "  JSR mv_hero_right"];
                } elseif ($direction === 'jump') {
                    $lines = ["  ; Acao: Mover heroi pulo", "  JSR mv_hero_jump"];
                    if ($flip === 'flip_h') { $lines[] = "  LDA #1"; $lines[] = "  STA player_flip"; }
                    elseif ($flip === 'default') { $lines[] = "  LDA #0"; $lines[] = "  STA player_flip"; }
                } else {
                    // up/down/zigzag: motor atual e' plataforma 2D (sem movimento
                    // vertical livre nem patrulha zig-zag pro heroi) - Fase 7.
                    return ["  ; Acao: Mover ({$direction}) - Fase 7 (motor ainda so suporta esquerda/direita/pulo pro heroi) - no-op"];
                }
                if (!empty($step['animId'])) {
                    $lines[] = "  ; animId '{$step['animId']}' - selecao de animacao por regra ainda nao existe (Fase 7)";
                }
                return $lines;
            }
            case 'play_sound':
                return $this->compilePlaySound($targetId, $hbCtx);
            case 'load_phase':
                if (!isset($hbCtx['phaseEntryScreen'][$targetId])) {
                    return ["  ; Acao: Carregar Fase - fase '{$targetId}' sem tela de entrada (sem splash/background), ignorado"];
                }
                $gi = $hbCtx['phaseEntryScreen'][$targetId];
                $screen = $hbCtx['screenData'][$gi] ?? [];
                $isSplashEntry = ($screen['type'] ?? '') === 'splash';
                $lines = [
                    "  ; Acao: Carregar Fase",
                    "  LDA #{$gi}",
                    "  JSR load_screen",
                    "  LDA #1",
                    "  STA pv_ev_enter",
                    "  LDA #0",
                    "  STA scroll_x",
                    "  STA nt_page",
                ];
                if ($isSplashEntry) {
                    // Entrada da fase e' uma splash - volta pro estado de splash
                    // (o jogador aperta START normalmente pra entrar na fase).
                    $lines[] = "  LDA #0";
                    $lines[] = "  STA game_state";
                } else {
                    // Entrada direto num background - pula a splash e ja entra jogando.
                    $lines[] = "  LDA #1";
                    $lines[] = "  STA game_state";
                    $pos = array_search($gi, $hbCtx['playIdxs'], true);
                    if ($pos !== false) {
                        $lines[] = "  LDA #{$pos}";
                        $lines[] = "  STA play_idx";
                        $lines[] = "  JSR spawn_enemies";
                    }
                }
                return $lines;
            case 'custom':
                return ["  ; Acao personalizada: " . (string)($step['params'] ?? '') . " (sem semantica definida - no-op por design)"];
            default:
                return ["  ; Acao '{$actionId}': Fase 7 (subsistema ainda nao existe no jogo) - no-op"];
        }
    }

    /**
     * Ação "Ir para Warp": o destino já é 100% conhecido em tempo de
     * compilação (targetScreenType/targetScreenId/spawnX/spawnY do objeto),
     * então não precisa de tabela em runtime - só emite a mesma sequência
     * que st_splash já usa pra entrar numa tela pela primeira vez.
     */
    /**
     * Camada Som v2: monta project.sounds.items -> [id => item], só os que
     * têm pelo menos 1 canal com notas (mesmo filtro do ProjectParser e do
     * template music.php - um item sem isso nunca ganha rotina/dados na ROM).
     */
    private function buildSoundsById(array $project): array
    {
        $items = is_array($project['sounds']['items'] ?? null) ? $project['sounds']['items'] : [];
        $byId = [];
        foreach ($items as $item) {
            if (!is_array($item) || empty($item['id']) || empty($item['channels'])) continue;
            $hasNotes = false;
            foreach ($item['channels'] as $c) {
                if (is_array($c) && !empty($c['notes'])) { $hasNotes = true; break; }
            }
            if ($hasNotes) $byId[(string)$item['id']] = $item;
        }
        return $byId;
    }

    /** Canais (tipo APU) que um item (música ou SFX) realmente usa, na ordem
     * fixa pulse1/pulse2/triangle/noise - 1 por tipo, igual ao music.php. */
    /**
     * Fase 9 fix (rodada 3): mesma prioridade de ProjectParser::pickHeroIndex
     * (mantida duplicada de proposito - as duas classes nao compartilham uma
     * base comum hoje, e e' um calculo pequeno o bastante pra nao valer criar
     * uma dependencia so' por isso). type=player+nome "hero" > type=player >
     * nome "hero" > indice 0.
     */
    private static function pickHeroIndex(array $chars): int
    {
        $playerHeroIdx = null; $playerIdx = null; $nameHeroIdx = null;
        foreach ($chars as $i => $c) {
            if (!is_array($c)) continue;
            $isPlayerType = ($c['type'] ?? '') === 'player';
            $isHeroName = stripos((string)($c['name'] ?? ''), 'hero') !== false;
            if ($isPlayerType && $isHeroName && $playerHeroIdx === null) $playerHeroIdx = (int)$i;
            if ($isPlayerType && $playerIdx === null) $playerIdx = (int)$i;
            if ($isHeroName && $nameHeroIdx === null) $nameHeroIdx = (int)$i;
        }
        return $playerHeroIdx ?? $playerIdx ?? $nameHeroIdx ?? 0;
    }

    private function resolveUsedChannelTypes(array $item): array
    {
        $order = ['pulse1', 'pulse2', 'triangle', 'noise'];
        $channels = is_array($item['channels'] ?? null) ? $item['channels'] : [];
        $used = [];
        foreach ($order as $type) {
            foreach ($channels as $ch) {
                if (is_array($ch) && ($ch['type'] ?? '') === $type && !empty($ch['notes'])) {
                    $used[] = $type;
                    break;
                }
            }
        }
        return $used;
    }

    /** Tem que gerar EXATAMENTE o mesmo label que backend/templates/music.php. */
    private function soundLabel(string $prefix, string $id): string
    {
        $s = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $id) ?? '');
        if ($s === '') $s = substr(md5($id), 0, 8);
        return $prefix . substr($s, 0, 16);
    }

    /**
     * Ação "Tocar Som": alvo é sempre um literal (id escolhido na UI), nunca
     * resolvido em runtime. Se for música: troca o ponteiro de despacho
     * (music_dispatch) pra rotina dessa música, zera a posição dos canais
     * que ela usa e silencia explicitamente os que ela NÃO usa (senão o som
     * da música anterior ficaria preso nesse canal). Se for SFX: ativa cada
     * canal que ele usa (sfx_active_ch<N>) apontando pra rotina dele - a
     * partir do próximo frame aquele(s) canal(is) ficam sob controle do SFX
     * até ele terminar, e a música volta sozinha (ver music.php).
     */
    private function compilePlaySound(string $targetId, array $hbCtx): array
    {
        $sound = $hbCtx['soundsById'][$targetId] ?? null;
        if (!$sound) {
            return ["  ; Acao: Tocar Som - som '{$targetId}' nao encontrado ou sem nenhum canal com notas, ignorado"];
        }
        $used = $this->resolveUsedChannelTypes($sound);
        if (!$used) {
            return ["  ; Acao: Tocar Som - som '{$targetId}' nao tem nenhum canal com notas, ignorado"];
        }
        $isSfx = (string)($sound['type'] ?? 'song') === 'sfx';
        $name = (string)($sound['name'] ?? $targetId);
        $chIdx = ['pulse1' => 0, 'pulse2' => 1, 'triangle' => 2, 'noise' => 3];
        $chSil = ['pulse1' => '#%00110000', 'pulse2' => '#%00110000', 'triangle' => '#%00000000', 'noise' => '#%00110000'];
        $chVol = ['pulse1' => '$4000', 'pulse2' => '$4004', 'triangle' => '$4008', 'noise' => '$400C'];

        if (!$isSfx) {
            $lbl = $this->soundLabel('ms_', $targetId);
            $lines = ["  ; Acao: Tocar Musica '{$name}'", "  JSR snd_enable_apu"];
            $lines[] = "  LDA #<music_update_{$lbl}";
            $lines[] = '  STA music_dispatch';
            $lines[] = "  LDA #>music_update_{$lbl}";
            $lines[] = '  STA music_dispatch+1';
            foreach ($chIdx as $type => $i) {
                if (in_array($type, $used, true)) {
                    $lines[] = '  LDA #0';
                    $lines[] = "  STA ch{$i}_timer";
                    $lines[] = "  STA ch{$i}_pos";
                } else {
                    $lines[] = "  LDA {$chSil[$type]}";
                    $lines[] = "  STA {$chVol[$type]}";
                }
            }
            $lines[] = '  LDA #1';
            $lines[] = '  STA music_on';
            return $lines;
        }

        $lbl = $this->soundLabel('sx_', $targetId);
        $lines = ["  ; Acao: Tocar SFX '{$name}'", "  JSR snd_enable_apu"];
        foreach ($used as $type) {
            $i = $chIdx[$type];
            $r = "sfx_r_{$lbl}_ch{$i}";
            $lines[] = "  LDA #<{$r}";
            $lines[] = "  STA sfx_dispatch_ch{$i}";
            $lines[] = "  LDA #>{$r}";
            $lines[] = "  STA sfx_dispatch_ch{$i}+1";
            $lines[] = '  LDA #0';
            $lines[] = "  STA sfx_pos_ch{$i}";
            $lines[] = "  STA sfx_timer_ch{$i}";
            $lines[] = '  LDA #1';
            $lines[] = "  STA sfx_active_ch{$i}";
        }
        return $lines;
    }

    private function compileGotoWarp(string $tag, string $targetId, array $hbCtx): array
    {
        $obj = $hbCtx['objectById'][$targetId] ?? null;
        if (!is_array($obj) || ($obj['kind'] ?? '') !== 'warp' || empty($obj['targetScreenId'])) {
            return ["  ; Acao: Ir para Warp - objeto sem destino configurado, ignorado"];
        }
        $key = (string)$obj['targetScreenId'];
        if (!isset($hbCtx['globalIdxByScreenKey'][$key])) {
            return ["  ; Acao: Ir para Warp - tela de destino nao encontrada, ignorado"];
        }
        $gi = $hbCtx['globalIdxByScreenKey'][$key];
        $spawnX = max(0, min(31, (int)($obj['spawnX'] ?? 0))) * 8;
        $spawnY = max(0, min(29, (int)($obj['spawnY'] ?? 0))) * 8;

        $lines = [
            "  ; Acao: Ir para Warp",
            "  LDA #{$gi}",
            "  JSR load_screen",
            "  LDA #0",
            "  STA scroll_x",
            "  STA nt_page",
            "  LDA #{$spawnX}",
            "  STA player_x",
            "  LDA #{$spawnY}",
            "  STA player_y",
        ];

        $pos = array_search($gi, $hbCtx['playIdxs'], true);
        if ($pos !== false) {
            $lines[] = "  LDA #{$pos}";
            $lines[] = "  STA play_idx";
            $nextPos = $pos + 1;
            if (isset($hbCtx['playIdxs'][$nextPos])) {
                $nextGi = $hbCtx['playIdxs'][$nextPos];
                $lines[] = "  ; pre-carrega a proxima tela do par de scroll (mesma logica do st_splash)";
                $lines[] = "  LDA #{$nextGi}";
                $lines[] = "  LDX #\$24";
                $lines[] = "  STX psn_base_hi";
                $lines[] = "  JSR preload_screen_nt";
            }
            $lines[] = "  JSR spawn_enemies";
        } else {
            $lines[] = "  ; destino fora da sequencia principal de fases - play_idx nao realinhado,";
            $lines[] = "  ; inimigos nao re-spawnados nesta tela (evita usar play_idx incoerente)";
        }
        return $lines;
    }
}
