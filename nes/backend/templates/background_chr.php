<?php
/**
 * NGC Stage 18 - CHR de background empacotado no backend.
 * Espelha o sprite_chr.php (Stage 15): o NGC agora recebe as nametables
 * brutas de cada tela (project + screenData[].nametable) e faz o próprio
 * empacotamento/remapeamento de tiles em vez de depender do que o frontend
 * já tinha remapeado localmente.
 */
return [
    'background_chr' => static function(array $ctx): string {
        $bytes = is_array($ctx['bg']['chr'] ?? null) ? $ctx['bg']['chr'] : [];
        if (!$bytes) $bytes = array_fill(0, 4096, 0);
        $lines = ['  ; $1000 background'];
        for ($i = 0; $i < 4096; $i += 16) {
            $slice = array_slice($bytes, $i, 16);
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), $slice));
        }
        return implode("\n", $lines);
    },
];
