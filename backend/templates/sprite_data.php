<?php
/**
 * NGC - tabelas de sprites/metasprites e spawn.
 * Stage 14: usa o spritePack preparado pelo frontend para manter equivalencia
 * exata durante a migracao. A montagem do CHR dos sprites ainda fica no front.
 */
return [
    'sprite_data' => static function(array $ctx): string {
        $sprite = is_array($ctx['sprite'] ?? null) ? $ctx['sprite'] : [];
        $charData = is_array($sprite['charData'] ?? null) ? $sprite['charData'] : [];
        $spawns = is_array($sprite['enemySpawns'] ?? null) ? $sprite['enemySpawns'] : [];
        $num = max(1, min(14, (int)($sprite['numInstances'] ?? 10)));
        $lines = [];

        $fmt = static function(array $bytes): string {
            if (!$bytes) $bytes = [0];
            return '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), $bytes));
        };

        $lines[] = '; --- NGC Sprite / Entity Data ---';
        foreach ($spawns as $pi => $es) {
            $count = min($num, max(0, (int)($es['count'] ?? 0)));
            $points = is_array($es['points'] ?? null) ? array_slice($es['points'], 0, $count) : [];
            $bytes = [$count & 0xFF];
            foreach ($points as $p) {
                $bytes[] = ((int)($p[0] ?? 0)) & 0xFF;
                $bytes[] = ((int)($p[1] ?? 0)) & 0xFF;
                $bytes[] = ((int)($p[2] ?? 0)) & 0xFF;
            }
            if (count($bytes) === 1) $bytes[] = 0;
            $lines[] = "EnemyData_{$pi}:";
            $lines[] = $fmt($bytes);
        }
        if (!$spawns) {
            $lines[] = 'EnemyData_0:';
            $lines[] = '  .byte $00';
        }
        $lines[] = 'EnemySpawnLo:';
        if ($spawns) foreach ($spawns as $pi => $_) $lines[] = "  .byte <EnemyData_{$pi}";
        else $lines[] = '  .byte <EnemyData_0';
        $lines[] = 'EnemySpawnHi:';
        if ($spawns) foreach ($spawns as $pi => $_) $lines[] = "  .byte >EnemyData_{$pi}";
        else $lines[] = '  .byte >EnemyData_0';
        $lines[] = '';

        if (!$charData) {
            $charData = [[
                'name' => 'Dummy',
                'frames' => [[
                    'w'=>0, 'h'=>0, 'cellsN'=>[], 'flipsN'=>[], 'cellsF'=>[], 'flipsF'=>[], 'duration' => 8, 'overlay' => null
                ]]
            ]];
        }

        // Fase 9 (graficos): corpo do personagem agora e' tamanho variavel (sem
        // mais o limite 2x2/4-corners). Cada frame vira sua PROPRIA rotina de
        // tabelas (Dx/Dy/TileN/FlipN/TileF/FlipF, todas com N=w*h bytes), e cada
        // personagem ganha um array de PONTEIROS pra essas tabelas, indexado
        // pelo frame (2 niveis de indirecao: char->ponteiro-por-frame->tabela).
        // Dx/Dy sao os MESMOS pras 2 orientacoes (a grade de posicoes nao muda,
        // so' QUAL tile ocupa cada posicao) - so' TileN/FlipN (normal) e
        // TileF/FlipF (espelhado H, pre-calculado aqui - ver ProjectParser)
        // diferem. N (contagem de celulas) fica num array simples, 1 byte por
        // frame, igual o CharDur ja fazia com a duracao.
        $ptrGroups = ['Dx', 'Dy', 'TileN', 'FlipN', 'TileF', 'FlipF'];
        $ptrTblLines = array_fill_keys($ptrGroups, ['Lo'=>[], 'Hi'=>[]]);

        foreach ($charData as $ci => $cd) {
            $name = (string)($cd['name'] ?? "Character {$ci}");
            $frames = is_array($cd['frames'] ?? null) ? $cd['frames'] : [];
            if (!$frames) $frames = [['w'=>0,'h'=>0,'cellsN'=>[],'flipsN'=>[],'cellsF'=>[],'flipsF'=>[],'duration'=>8,'overlay'=>null]];

            $nBytes = [];
            $ptrArr = array_fill_keys($ptrGroups, []); // por frame: [loLabel, hiLabel] nao, guardamos os proprios arrays de dados aqui e o interleave depois
            foreach ($frames as $fi => $fr) {
                $w = max(0, (int)($fr['w'] ?? 0));
                $h = max(0, (int)($fr['h'] ?? 0));
                $n = $w * $h;
                $nBytes[] = $n & 0xFF;
                $dx = []; $dy = [];
                for ($ty=0; $ty<$h; $ty++) for ($tx=0; $tx<$w; $tx++) { $dx[] = ($tx*8) & 0xFF; $dy[] = ($ty*8) & 0xFF; }
                $lbl = "Char{$ci}F{$fi}";
                $lines[] = "{$lbl}Dx:"; $lines[] = $n ? $fmt($dx) : '  .byte 0';
                $lines[] = "{$lbl}Dy:"; $lines[] = $n ? $fmt($dy) : '  .byte 0';
                $lines[] = "{$lbl}TileN:"; $lines[] = $n ? $fmt($fr['cellsN'] ?? []) : '  .byte 0';
                $lines[] = "{$lbl}FlipN:"; $lines[] = $n ? $fmt($fr['flipsN'] ?? []) : '  .byte 0';
                $lines[] = "{$lbl}TileF:"; $lines[] = $n ? $fmt($fr['cellsF'] ?? []) : '  .byte 0';
                $lines[] = "{$lbl}FlipF:"; $lines[] = $n ? $fmt($fr['flipsF'] ?? []) : '  .byte 0';
                foreach ($ptrGroups as $g) { $ptrArr[$g][] = "{$lbl}{$g}"; }
            }
            $lines[] = "CharN_{$ci}:  ; " . str_replace(["\n","\r"], '', $name);
            $lines[] = $fmt($nBytes);
            foreach ($ptrGroups as $g) {
                // Fase 9 fix: array INTERCALADO (lo,hi por frame) - o loader em
                // sprite_entities.asm.tpl/sprite_player.asm.tpl faz frame*2 e le
                // (ptr),Y / (ptr),Y+1 de UM SO ponteiro; com 2 arrays separados
                // (lo-only e hi-only) isso lia o byte errado (a "sujeira" nos
                // tiles dos inimigos) a partir do 2o frame em diante.
                $lines[] = "Char{$ci}{$g}Ptr:";
                $bytes = [];
                foreach ($ptrArr[$g] as $l) { $bytes[] = "<{$l}"; $bytes[] = ">{$l}"; }
                $lines[] = '  .byte ' . implode(', ', $bytes);
                $ptrTblLines[$g]['Lo'][] = "Char{$ci}{$g}Ptr";
                $ptrTblLines[$g]['Hi'][] = "Char{$ci}{$g}Ptr";
            }

            $ovCells = $ovFlips = $ovDx = $ovDy = $ovCellsFlip = $ovFlipsFlip = $ovDxFlip = [];

            foreach ($frames as $fr) {
                $ov = is_array($fr['overlay'] ?? null) ? $fr['overlay'] : null;
                $ovByCorner = array_fill(0, 4, null);
                $ovFlipCorner = array_fill(0, 4, 0);
                $pal = $ov ? max(0, min(3, (int)($ov['palAttr'] ?? 0))) : 0;
                if ($ov) foreach (($ov['cells'] ?? []) as $c) {
                    $corner = (int)($c['corner'] ?? 0);
                    if ($corner < 0 || $corner > 3) continue;
                    $ovByCorner[$corner] = ((int)($c['tile'] ?? 0)) & 0xFF;
                    $ovFlipCorner[$corner] = ((int)($c['flip'] ?? 0)) & 3;
                }
                for ($k=0;$k<4;$k++) {
                    $ovCells[] = $ovByCorner[$k] === null ? 0xFF : $ovByCorner[$k];
                    $f = $ovFlipCorner[$k];
                    $ovFlips[] = $pal | (($f & 1) ? 0x40 : 0) | (($f & 2) ? 0x80 : 0);
                }
                $dx = $ov ? (int)($ov['dx'] ?? 0) : 0;
                $dy = $ov ? (int)($ov['dy'] ?? 0) : 0;
                $ovDx[] = $dx & 0xFF;
                $ovDy[] = $dy & 0xFF;

                $usesLeft = $ovByCorner[0] !== null || $ovByCorner[2] !== null;
                $usesRight = $ovByCorner[1] !== null || $ovByCorner[3] !== null;
                $width = ($usesLeft && $usesRight) ? 16 : 8;
                $ovDxFlip[] = $ov ? ((16 - $dx - $width) & 0xFF) : 0;
                foreach ([1,0,3,2] as $src) {
                    $tile = $ovByCorner[$src];
                    $ovCellsFlip[] = $tile === null ? 0xFF : $tile;
                    $f = $ovFlipCorner[$src];
                    $ovFlipsFlip[] = $pal | (($f & 1) ? 0 : 0x40) | (($f & 2) ? 0x80 : 0);
                }
            }

            $lines[] = "CharOvCells_{$ci}:"; $lines[] = $fmt($ovCells);
            $lines[] = "CharOvFlips_{$ci}:"; $lines[] = $fmt($ovFlips);
            $lines[] = "CharOvDx_{$ci}:"; $lines[] = $fmt($ovDx);
            $lines[] = "CharOvDy_{$ci}:"; $lines[] = $fmt($ovDy);
            $lines[] = "CharOvCellsFlip_{$ci}:"; $lines[] = $fmt($ovCellsFlip);
            $lines[] = "CharOvFlipsFlip_{$ci}:"; $lines[] = $fmt($ovFlipsFlip);
            $lines[] = "CharOvDxFlip_{$ci}:"; $lines[] = $fmt($ovDxFlip);
            $dur = [];
            foreach ($frames as $fr) $dur[] = max(1, min(255, (int)($fr['duration'] ?? 8)));
            $lines[] = "CharDur_{$ci}:"; $lines[] = $fmt($dur);
        }

        $ptrs = [
            'CharFrameNLo' => 'CharN', 'CharFrameNHi' => 'CharN',
            'CharFrameDurLo' => 'CharDur', 'CharFrameDurHi' => 'CharDur'
        ];
        foreach ($ptrs as $label => $prefix) {
            $lines[] = "{$label}:";
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($i) => (substr($label, -2) === 'Lo') ? "<{$prefix}_{$i}" : ">{$prefix}_{$i}", array_keys($charData)));
        }
        // Tabelas de topo (indexadas por personagem) apontando pro proprio array
        // de ponteiros-por-frame de cada personagem - 2o nivel de indirecao,
        // uma para cada um dos 6 grupos (Dx/Dy/TileN/FlipN/TileF/FlipF).
        foreach ($ptrGroups as $g) {
            $lines[] = "Char{$g}PtrLoTbl:";
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($l) => "<{$l}", $ptrTblLines[$g]['Lo']));
            $lines[] = "Char{$g}PtrHiTbl:";
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($l) => ">{$l}", $ptrTblLines[$g]['Hi']));
        }
        $lines[] = 'CharFrameCount:';
        $lines[] = '  .byte ' . implode(', ', array_map(static function($cd) {
            $frames = is_array($cd['frames'] ?? null) ? $cd['frames'] : [];
            return max(1, count($frames)) & 0xFF;
        }, $charData));
        return trim(implode("\n", $lines));
    },
];
