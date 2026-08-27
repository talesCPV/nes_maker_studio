<?php
/**
 * NGC Stage 19 - PaletteData (8 paletas de 4 cores + cor de fundo universal)
 * calculada pelo backend. Espelha o cálculo de paletteBytes/computeBackdropColor
 * de js/modules/build-rom.js e js/render-utils.js.
 */
return [
    'palette_data' => static function(array $ctx): string {
        $bytes = is_array($ctx['palette'] ?? null) ? $ctx['palette'] : [];
        if (count($bytes) < 32) $bytes = array_pad($bytes, 32, 0);
        $lines = ['PaletteData:'];
        for ($i = 0; $i < 32; $i += 16) {
            $slice = array_slice($bytes, $i, 16);
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), $slice));
        }
        $lines[] = '';
        return implode("\n", $lines);
    },
];
