<?php
/** NGC Stage 15 - CHR de sprites empacotado no backend. */
return [
    'sprite_chr' => static function(array $ctx): string {
        $bytes = is_array($ctx['sprite']['spriteChr'] ?? null) ? $ctx['sprite']['spriteChr'] : [];
        if (!$bytes) $bytes = array_fill(0, 4096, 0);
        $lines = ['  ; pg0 sprites empacotado pelo NGC'];
        for ($i=0; $i<4096; $i+=16) {
            $slice = array_slice($bytes, $i, 16);
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b)&0xFF), $slice));
        }
        return implode("\n", $lines);
    },
];
