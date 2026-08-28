<?php
/**
 * Camada 6 - Fase 1 (ver ProgramCompiler.php pro escopo exato).
 * Quatro blocos que juntos formam o "motor de regras":
 *  - program_vars_zp / program_vars_ram: declaração das variáveis do
 *    usuário + estado interno do motor (idle counter, flag de pausa).
 *    São .segment próprios (ZEROPAGE/RAM) - o ca65 funde com o resto do
 *    mesmo nome em qualquer posição do arquivo, então não precisa tocar
 *    no zeropage.php existente.
 *  - program_init: zera/inicializa as variáveis do usuário. Chamado uma
 *    vez a partir do Reset (depois do clrram, que já zera tudo - isso só
 *    cobre os valores iniciais != 0).
 *  - program_rules: a tabela ScreenPhase + o dispatcher run_rules + o
 *    corpo de cada regra compilada. Chamado uma vez por frame a partir de
 *    st_play (game_flow.php).
 */
return [
    'program_vars_zp' => static function (array $ctx): string {
        $alloc = $ctx['program']['alloc'] ?? ['vars' => [], 'groupInitial' => []];
        $lines = ['.segment "ZEROPAGE"'];
        $lines[] = 'pv_idle:        .res 2  ; Camada 6: frames desde o ultimo input (P1-IDLE)';
        $lines[] = 'pv_game_paused: .res 1  ; Camada 6: acao Pausar o jogo';
        $lines[] = 'pv_ev_oob:      .res 1  ; Camada 6 Fase 2: flag nativa "Fora dos limites" (pulso)';
        $lines[] = 'pv_ev_enter:    .res 1  ; Camada 6 Fase 2: flag nativa "Entrou na tela" (pulso)';
        $lines[] = 'pv_hb_target:   .res 1  ; Camada 6 Fase 2: scratch do check_hbobj_hit';
        $lines[] = 'pv_hb_scr_x:    .res 1  ; Camada 6 Fase 2: scratch do check_hbobj_hit';
        $lines[] = 'pv_terr_target: .res 1  ; Camada 6 Fase 2: scratch do check_terrain_type';
        $seen = [];
        foreach ($alloc['vars'] as $v) {
            if (!($v['zeroPage'] ?? false)) continue;
            if ($v['type'] === 'bool') {
                if (isset($seen[$v['label']])) continue;
                $seen[$v['label']] = true;
                $lines[] = "{$v['label']}: .res 1  ; grupo de ate 8 bool(s)";
            } else {
                $lines[] = "{$v['label']}: .res {$v['sizeBytes']}  ; var \"{$v['name']}\" ({$v['type']})";
            }
        }
        return implode("\n", $lines);
    },

    'program_vars_ram' => static function (array $ctx): string {
        $alloc = $ctx['program']['alloc'] ?? ['vars' => [], 'groupInitial' => []];
        $anyRam = false;
        foreach ($alloc['vars'] as $v) if (!($v['zeroPage'] ?? false)) { $anyRam = true; break; }
        if (!$anyRam) return '';
        $lines = ['.segment "RAM"'];
        $seen = [];
        foreach ($alloc['vars'] as $v) {
            if ($v['zeroPage'] ?? false) continue;
            if ($v['type'] === 'bool') {
                if (isset($seen[$v['label']])) continue;
                $seen[$v['label']] = true;
                $lines[] = "{$v['label']}: .res 1  ; grupo de ate 8 bool(s)";
            } else {
                $lines[] = "{$v['label']}: .res {$v['sizeBytes']}  ; var \"{$v['name']}\" ({$v['type']})";
            }
        }
        return implode("\n", $lines);
    },

    'program_init' => static function (array $ctx): string {
        $alloc = $ctx['program']['alloc'] ?? ['vars' => [], 'groupInitial' => []];
        $lines = ['program_init_vars:'];
        $doneGroups = [];
        foreach ($alloc['vars'] as $v) {
            if ($v['type'] === 'bool') {
                $g = $v['label'];
                if (isset($doneGroups[$g])) continue;
                $doneGroups[$g] = true;
                $val = $alloc['groupInitial'][$g] ?? 0;
                if ($val === 0) continue; // clrram do Reset ja zerou
                $lines[] = sprintf('  LDA #$%02X', $val);
                $lines[] = "  STA {$g}";
            } elseif ($v['initial'] !== 0) {
                if ($v['type'] === 'word') {
                    $lo = $v['initial'] & 0xFF; $hi = ($v['initial'] >> 8) & 0xFF;
                    $lines[] = "  LDA #{$lo}";
                    $lines[] = "  STA {$v['label']}";
                    $lines[] = "  LDA #{$hi}";
                    $lines[] = "  STA {$v['label']}+1";
                } else {
                    $lines[] = "  LDA #{$v['initial']}";
                    $lines[] = "  STA {$v['label']}";
                }
            }
        }
        $lines[] = '  RTS';
        return implode("\n", $lines);
    },

    'program_hitbox_engine' => static function (array $ctx): string {
        $prog = $ctx['program'] ?? ['hbTriggers' => []];
        $triggers = $prog['hbTriggers'] ?? [];
        $lines = [];
        $lines[] = '; ---- NGC Camada 6 Fase 2: motor de hitbox ----';

        $lines[] = 'HbTriggerScr:';
        $lines[] = $triggers ? ('  .byte ' . implode(', ', array_map(static fn($t) => (string)$t['scr'], $triggers))) : '  .byte 0';
        $lines[] = 'HbTriggerX:';
        $lines[] = $triggers ? ('  .byte ' . implode(', ', array_map(static fn($t) => (string)$t['x'], $triggers))) : '  .byte 0';
        $lines[] = 'HbTriggerY:';
        $lines[] = $triggers ? ('  .byte ' . implode(', ', array_map(static fn($t) => (string)$t['y'], $triggers))) : '  .byte 0';
        $lines[] = 'HbTriggerObj:';
        $lines[] = $triggers ? ('  .byte ' . implode(', ', array_map(static fn($t) => (string)$t['obj'], $triggers))) : '  .byte 0';
        $lines[] = '';

        $lines[] = '; A(entrada) = tipo de terreno esperado (1=solido, 2=plataforma).';
        $lines[] = '; Devolve em A: 1 se o tile sob os pes do heroi bate, senao 0.';
        $lines[] = '; Sub-rotina isolada (scratch proprio) - nao mexe no estado que';
        $lines[] = '; check_ground/check_wall_at ja usam pro motor de fisica.';
        $lines[] = 'check_terrain_type:';
        $lines[] = '  STA pv_terr_target';
        $lines[] = '  LDA player_y';
        $lines[] = '  CLC';
        $lines[] = '  ADC #16';
        $lines[] = '  LSR A';
        $lines[] = '  LSR A';
        $lines[] = '  LSR A';
        $lines[] = '  STA col_y';
        $lines[] = '  LDA player_x';
        $lines[] = '  CLC';
        $lines[] = '  ADC #7';
        $lines[] = '  JSR world_col_from';
        $lines[] = '  JSR get_collision2';
        $lines[] = '  LDA col_result';
        $lines[] = '  CMP pv_terr_target';
        $lines[] = '  BEQ ctt_yes';
        $lines[] = '  LDA #0';
        $lines[] = '  RTS';
        $lines[] = 'ctt_yes:';
        $lines[] = '  LDA #1';
        $lines[] = '  RTS';
        $lines[] = '';

        $lines[] = '; A(entrada) = id numerico do objeto de hitbox (dano/warp) procurado.';
        $lines[] = '; Devolve em A: 1 se alguma instancia desse objeto na tela atual';
        $lines[] = '; esta sobrepondo o corpo do heroi, senao 0.';
        $lines[] = 'check_hbobj_hit:';
        $lines[] = '  STA pv_hb_target';
        $lines[] = '  LDX #0';
        $lines[] = 'chh_loop:';
        $lines[] = '  CPX #' . count($triggers) . '  ; sem triggers -> CPX #0, o loop nunca entra';
        $lines[] = '  BEQ chh_no';
        $lines[] = '  LDA HbTriggerObj,X';
        $lines[] = '  CMP pv_hb_target';
        $lines[] = '  BNE chh_next';
        $lines[] = '  LDA HbTriggerScr,X';
        $lines[] = '  CMP cur_screen';
        $lines[] = '  BNE chh_next';
        $lines[] = '  ; posicao na tela do trigger (mesma logica dos inimigos): x - scroll_x';
        $lines[] = '  LDA HbTriggerX,X';
        $lines[] = '  SEC';
        $lines[] = '  SBC scroll_x';
        $lines[] = '  BCC chh_next';
        $lines[] = '  STA pv_hb_scr_x';
        $lines[] = '  ; AABB vs corpo do heroi (mesma convencao de check_player_enemy_hit)';
        $lines[] = '  LDA player_x';
        $lines[] = '  CLC';
        $lines[] = '  ADC #14';
        $lines[] = '  CMP pv_hb_scr_x';
        $lines[] = '  BCC chh_next';
        $lines[] = '  LDA pv_hb_scr_x';
        $lines[] = '  CLC';
        $lines[] = '  ADC #14';
        $lines[] = '  CMP player_x';
        $lines[] = '  BCC chh_next';
        $lines[] = '  LDA player_y';
        $lines[] = '  CLC';
        $lines[] = '  ADC #16';
        $lines[] = '  CMP HbTriggerY,X';
        $lines[] = '  BCC chh_next';
        $lines[] = '  LDA HbTriggerY,X';
        $lines[] = '  CLC';
        $lines[] = '  ADC #16';
        $lines[] = '  CMP player_y';
        $lines[] = '  BCC chh_next';
        $lines[] = '  LDA #1';
        $lines[] = '  RTS';
        $lines[] = 'chh_next:';
        $lines[] = '  INX';
        $lines[] = '  JMP chh_loop';
        $lines[] = 'chh_no:';
        $lines[] = '  LDA #0';
        $lines[] = '  RTS';
        return implode("\n", $lines);
    },

    'program_rules' => static function (array $ctx): string {
        $prog = $ctx['program'] ?? ['dispatch' => [], 'ruleBodies' => [], 'screenPhase' => [255]];
        $lines = [];
        $lines[] = '; ---- NGC Camada 6: motor de regras ----';
        $lines[] = 'ScreenPhase:';
        $phaseBytes = array_map(static fn($p) => (string)$p, $prog['screenPhase'] ?: [255]);
        for ($i = 0; $i < count($phaseBytes); $i += 16) {
            $lines[] = '  .byte ' . implode(', ', array_slice($phaseBytes, $i, 16));
        }
        $lines[] = '';
        $lines[] = 'run_rules:';
        if ($prog['dispatch']) {
            $lines = array_merge($lines, $prog['dispatch']);
        } else {
            $lines[] = '  ; nenhuma regra cadastrada ainda';
        }
        $lines[] = '  RTS';
        $lines[] = '';
        foreach ($prog['ruleBodies'] as $body) {
            $lines[] = $body;
            $lines[] = '';
        }
        return implode("\n", $lines);
    },
];
