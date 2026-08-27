<?php
/**
 * Camada 6 - Fase 1: Variáveis + motor de Regras (SE/ENTÃO).
 *
 * Escopo desta fase (o que JÁ compila pra 6502 de verdade):
 *  - Variáveis: bool (empacotado 8/byte), byte, word - em zero page ou RAM,
 *    com valor inicial. Endereços são atribuídos pelo PRÓPRIO ca65 (.res
 *    sequencial dentro de um segmento novo) - nada de aritmética manual de
 *    endereço, então nunca colide com os outros bytes já reservados.
 *  - SE evento: só categoria "input" (botão pressionado nesse frame, ou
 *    P1-IDLE com contador de frames parado). P2 e eventos custom/menu ainda
 *    não têm origem no runtime - compilam como sempre-falso.
 *  - SE variável / DEFINIR / SOMAR / SUBTRAIR variável: completo.
 *  - Ações com suporte real no jogo hoje: Definir On Ground (só no herói),
 *    Pausar o jogo (novo flag - pausa player+inimigos, mantém regras e
 *    input rodando), Matar (herói -> mesma lógica de respawn da queda;
 *    outro personagem -> desliga todas as instâncias desse tipo), e
 *    Personalizada (é um no-op por definição, o catálogo já descreve assim).
 *  - Escopo de regra: Global (roda todo frame em st_play) ou por Fase
 *    (consulta ScreenPhase[play_idx] em runtime, sem precisar guardar
 *    estado extra em lugar nenhum).
 *
 * Fora do escopo desta fase (compila como sempre-falso/no-op com comentário
 * - nunca quebra a build, só não faz nada ainda): SE hitbox... toca... (é
 * seu próprio motor de colisão genérico - native flags/terreno/objetos/
 * hitboxes de personagem, Fase 2), Ir para Warp, Spawnar Personagem,
 * Aplicar Força de Pulo/Nível de Velocidade (o jogo ainda usa valores fixos
 * pro pulo/velocidade, não lê de variável), Tocar Som (não existe motor de
 * SFX ainda, só música), Abrir/Fechar Menu, Ligar/Desligar Hitbox, Mover,
 * Atirar.
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
    public function compile(array $project, array $spriteCtx, array $playIdxs, array $screenData): array
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
        $heroIds = [];
        foreach ($chars as $i => $c) {
            if (!is_array($c) || !isset($c['id'])) continue;
            $id = (string)$c['id'];
            $charIndexById[$id] = (int)$i;
            if (stripos((string)($c['name'] ?? ''), 'hero') !== false) $heroIds[$id] = true;
        }

        $phases = is_array($project['phases'] ?? null) ? $project['phases'] : [];
        $phaseIndexById = [];
        foreach ($phases as $i => $p) {
            if (is_array($p) && isset($p['id'])) $phaseIndexById[(string)$p['id']] = (int)$i;
        }

        // ScreenPhase[play_idx] = índice numérico da fase dona da tela (ou 255 = nenhuma).
        $screenPhase = [];
        foreach ($playIdxs as $gi) {
            $screen = $screenData[$gi] ?? null;
            $pid = is_array($screen) ? ($screen['phaseId'] ?? null) : null;
            $screenPhase[] = ($pid !== null && isset($phaseIndexById[(string)$pid])) ? $phaseIndexById[(string)$pid] : 255;
        }
        if (!$screenPhase) $screenPhase[] = 255;

        $rules = is_array($project['rules'] ?? null) ? $project['rules'] : [];
        $numInstances = (int)($spriteCtx['numInstances'] ?? 10);

        $ruleBodies = [];
        $dispatch = [];
        $ri = 0;
        foreach ($rules as $rule) {
            if (!is_array($rule) || empty($rule['steps']) || !is_array($rule['steps'])) continue;
            $label = "prule_{$ri}";
            $ruleBodies[] = $this->compileRule($label, $ri, $rule, $alloc, $eventById, $charIndexById, $heroIds, $numInstances);
            $scope = (string)($rule['scope'] ?? 'global');
            if ($scope === 'global') {
                $dispatch[] = "  JSR {$label}";
            } elseif (isset($phaseIndexById[$scope])) {
                $pidx = $phaseIndexById[$scope];
                $dispatch[] = "  LDX play_idx";
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

    private function compileRule(string $label, int $ri, array $rule, array $alloc, array $eventById, array $charIndexById, array $heroIds, int $numInstances): string
    {
        $lines = [];
        $lines[] = "; regra: " . (string)($rule['name'] ?? $label);
        $lines[] = "{$label}:";
        $si = 0;
        foreach ($rule['steps'] as $step) {
            if (!is_array($step)) continue;
            $tag = "{$label}_s{$si}";
            $type = (string)($step['type'] ?? '');
            if ($type === 'if_event') {
                $lines = array_merge($lines, $this->compileIfEvent($tag, $label, $step, $eventById));
            } elseif ($type === 'if_hitbox') {
                $lines[] = "  ; SE hitbox: Fase 2 (motor de colisao generico ainda nao existe) - sempre falso";
                $lines[] = "  JMP {$label}_end";
            } elseif ($type === 'if_var') {
                $lines = array_merge($lines, $this->compileIfVar($tag, $label, $step, $alloc));
            } elseif (in_array($type, ['set_var', 'add_var', 'sub_var'], true)) {
                $lines = array_merge($lines, $this->compileVarEffect($tag, $type, $step, $alloc));
            } elseif ($type === 'action') {
                $lines = array_merge($lines, $this->compileAction($tag, $step, $charIndexById, $heroIds, $numInstances));
            }
            $si++;
        }
        $lines[] = "{$label}_end:";
        $lines[] = "  RTS";
        return implode("\n", $lines);
    }

    private function compileIfEvent(string $tag, string $ruleEnd, array $step, array $eventById): array
    {
        $ev = $eventById[(string)($step['eventId'] ?? '')] ?? null;
        if (!is_array($ev) || ($ev['category'] ?? '') !== 'input') {
            return ["  ; SE evento: nao-input (custom/menu) - Fase 2, sempre falso", "  JMP {$ruleEnd}_end"];
        }
        $button = (string)($ev['button'] ?? '');
        if ($button === 'P1-IDLE') {
            $idleTime = max(0, (int)($step['idleTime'] ?? 0));
            $lo = $idleTime & 0xFF;
            $hi = ($idleTime >> 8) & 0xFF;
            return [
                "  ; SE evento: P1-IDLE >= {$idleTime} frame(s)",
                "  LDA pv_idle+1",
                "  CMP #{$hi}",
                "  BCC {$ruleEnd}_end",
                "  BNE {$tag}_idle_ok",
                "  LDA pv_idle",
                "  CMP #{$lo}",
                "  BCC {$ruleEnd}_end",
                "{$tag}_idle_ok:",
            ];
        }
        if (isset(self::P1_BUTTON_MASK[$button])) {
            $mask = self::P1_BUTTON_MASK[$button];
            return [
                "  ; SE evento: {$button} pressionado",
                "  LDA pad1_edge",
                sprintf('  AND #$%02X', $mask),
                "  BEQ {$ruleEnd}_end",
            ];
        }
        return ["  ; SE evento: {$button} (P2 ainda sem leitura de controle) - sempre falso", "  JMP {$ruleEnd}_end"];
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

    private function compileAction(string $tag, array $step, array $charIndexById, array $heroIds, int $numInstances): array
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
            case 'custom':
                return ["  ; Acao personalizada: " . (string)($step['params'] ?? '') . " (sem semantica definida - no-op por design)"];
            default:
                return ["  ; Acao '{$actionId}': Fase 2 (subsistema ainda nao existe no jogo) - no-op"];
        }
    }
}
