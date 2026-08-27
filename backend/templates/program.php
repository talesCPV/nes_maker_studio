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
