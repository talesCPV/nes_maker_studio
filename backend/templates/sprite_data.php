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
                    'cells' => [], 'duration' => 8, 'overlay' => null
                ]]
            ]];
        }

        foreach ($charData as $ci => $cd) {
            $name = (string)($cd['name'] ?? "Character {$ci}");
            $frames = is_array($cd['frames'] ?? null) ? $cd['frames'] : [];
            if (!$frames) $frames = [['cells'=>[], 'duration'=>8, 'overlay'=>null]];
            $bytes = $flips = $ovCells = $ovFlips = $ovDx = $ovDy = $ovCellsFlip = $ovFlipsFlip = $ovDxFlip = [];

            foreach ($frames as $fr) {
                $byCorner = array_fill(0, 4, null);
                $flipCorner = array_fill(0, 4, 0);
                foreach (($fr['cells'] ?? []) as $c) {
                    $corner = (int)($c['corner'] ?? 0);
                    if ($corner < 0 || $corner > 3) continue;
                    $byCorner[$corner] = ((int)($c['tile'] ?? 0)) & 0xFF;
                    $flipCorner[$corner] = ((int)($c['flip'] ?? 0)) & 3;
                }
                for ($k=0;$k<4;$k++) {
                    $bytes[] = $byCorner[$k] === null ? 0xFF : $byCorner[$k];
                    $f = $flipCorner[$k];
                    $flips[] = (($f & 1) ? 0x40 : 0) | (($f & 2) ? 0x80 : 0);
                }

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

            $lines[] = "CharCells_{$ci}:  ; " . str_replace(["\n","\r"], '', $name);
            $lines[] = $fmt($bytes);
            $lines[] = "CharFlips_{$ci}:"; $lines[] = $fmt($flips);
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
            'CharFrameCellsLo' => 'CharCells', 'CharFrameCellsHi' => 'CharCells',
            'CharFrameFlipsLo' => 'CharFlips', 'CharFrameFlipsHi' => 'CharFlips',
            'CharFrameDurLo' => 'CharDur', 'CharFrameDurHi' => 'CharDur'
        ];
        foreach ($ptrs as $label => $prefix) {
            $lines[] = "{$label}:";
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($i) => ($label === 'CharFrameCellsLo' || $label === 'CharFrameFlipsLo' || $label === 'CharFrameDurLo') ? "<{$prefix}_{$i}" : ">{$prefix}_{$i}", array_keys($charData)));
        }
        $lines[] = 'CharFrameCount:';
        $lines[] = '  .byte ' . implode(', ', array_map(static function($cd) {
            $frames = is_array($cd['frames'] ?? null) ? $cd['frames'] : [];
            return max(1, count($frames)) & 0xFF;
        }, $charData));
        return trim(implode("\n", $lines));
    },
];
