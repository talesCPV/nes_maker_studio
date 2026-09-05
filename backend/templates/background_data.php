<?php
/**
 * NGC - dados das telas.
 * Stage 13: ponte para os dados de telas já preparados pelo frontend.
 * A próxima etapa poderá mover também o empacotamento/remapeamento CHR para o NGC.
 */
return [
    'background_tables' => static function(array $ctx): string {
        $screens = is_array($ctx['screenData'] ?? null) ? $ctx['screenData'] : [];
        $playIdxs = is_array($ctx['playIdxs'] ?? null) ? $ctx['playIdxs'] : [];
        if (!$playIdxs && $screens) $playIdxs = [0];

        $lines = [];
        $lines[] = 'ScreenNtLo:';
        foreach ($screens as $i => $_) $lines[] = "  .byte <Nametable_{$i}";
        $lines[] = 'ScreenNtHi:';
        foreach ($screens as $i => $_) $lines[] = "  .byte >Nametable_{$i}";
        $lines[] = 'ScreenAtLo:';
        foreach ($screens as $i => $_) $lines[] = "  .byte <Attr_{$i}";
        $lines[] = 'ScreenAtHi:';
        foreach ($screens as $i => $_) $lines[] = "  .byte >Attr_{$i}";
        $lines[] = 'ScreenColLo:';
        foreach ($screens as $i => $_) $lines[] = "  .byte <Collision_{$i}";
        $lines[] = 'ScreenColHi:';
        foreach ($screens as $i => $_) $lines[] = "  .byte >Collision_{$i}";
        $lines[] = 'PlayScreenTable:  ; indices globais das telas de jogo (em ordem)';
        $bytes = array_map(static fn($i) => ((int)$i) & 0xFF, $playIdxs);
        if (!$bytes) $bytes = [0];
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', $b), $bytes));
        // Fase 9 (transicoes de tela): 1 = fase dessa tela e' Hard-Cut
        // (Dashboard), 0 = scroll continuo (default, comportamento de sempre).
        // Indexado por play_idx, igual PlayScreenTable.
        $hc = is_array($ctx['playScreenHardCut'] ?? null) ? $ctx['playScreenHardCut'] : [0];
        if (!$hc) $hc = [0];
        $lines[] = 'PlayScreenHardCut:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => ((int)$v) ? '1' : '0', $hc));
        // Fase 9 fix (grade real): vizinho de verdade na grade 2D da fase,
        // indexado por play_idx - 255 = nao ha sala ali (bloqueado).
        foreach (['Right' => 'screenNeighborRight', 'Left' => 'screenNeighborLeft', 'Up' => 'screenNeighborUp', 'Down' => 'screenNeighborDown'] as $label => $key) {
            $vals = is_array($ctx[$key] ?? null) ? $ctx[$key] : [255];
            if (!$vals) $vals = [255];
            $lines[] = "ScreenNeighbor{$label}:";
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => (string)max(0, min(255, (int)$v)), $vals));
        }
        // Fase 9 (gravidade por fase): 1 = "None" (Dashboard, sem queda/pulo).
        $go = is_array($ctx['playScreenGravityOff'] ?? null) ? $ctx['playScreenGravityOff'] : [0];
        if (!$go) $go = [0];
        $lines[] = 'PlayScreenGravityOff:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => ((int)$v) ? '1' : '0', $go));
        $gs = is_array($ctx['playScreenGravityStrength'] ?? null) ? $ctx['playScreenGravityStrength'] : [4];
        if (!$gs) $gs = [4];
        $lines[] = 'PlayScreenGravityStrength:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => (string)max(1, min(16, (int)$v)), $gs));
        return implode("\n", $lines);
    },

    'background_data' => static function(array $ctx): string {
        $screens = is_array($ctx['screenData'] ?? null) ? $ctx['screenData'] : [];
        $lines = [];
        foreach ($screens as $i => $screen) {
            $name = (string)($screen['name'] ?? "Tela {$i}");
            $role = (string)($screen['role'] ?? 'play');
            $nt = is_array($screen['remappedNt'] ?? null) ? $screen['remappedNt'] : [];
            $at = is_array($screen['attributes'] ?? null) ? $screen['attributes'] : [];
            $col = is_array($screen['collisionMap'] ?? null) ? $screen['collisionMap'] : [];
            $nt = array_pad(array_slice($nt, 0, 960), 960, 0);
            $at = array_pad(array_slice($at, 0, 64), 64, 0);
            $col = array_pad(array_slice($col, 0, 960), 960, 0);

            $lines[] = "Nametable_{$i}:  ; {$name} ({$role})";
            for ($j = 0; $j < 960; $j += 32) {
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_slice($nt, $j, 32)));
            }
            $lines[] = "Attr_{$i}:";
            for ($j = 0; $j < 64; $j += 16) {
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_slice($at, $j, 16)));
            }
            $lines[] = "Collision_{$i}:";
            for ($j = 0; $j < 960; $j += 32) {
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_slice($col, $j, 32)));
            }
            $lines[] = '';
        }
        return trim(implode("\n", $lines));
    },
];
