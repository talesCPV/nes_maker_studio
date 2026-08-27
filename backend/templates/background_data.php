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
