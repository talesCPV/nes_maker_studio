<?php
/**
 * NGC - Sprites / Entities runtime.
 * Stage 14: rotinas de OAM, animacao, spawn e IA das instancias.
 * Os dados Char* continuam sendo preparados pelo frontend nesta etapa;
 * o proximo passo pode mover o empacotamento CHR/metatiles para o NGC.
 */
return [
    'sprite_player' => static function(array $ctx): string {
        $hero = (int)($ctx['sprite']['heroCharIdx'] ?? 0);
        $frames = max(1, (int)($ctx['sprite']['heroFrameCount'] ?? 1));
        $maxCells = max(1, (int)($ctx['sprite']['maxCells'] ?? 4));
        $ovBase = 0x0200 + $maxCells * 4;
        $tpl = file_get_contents(__DIR__ . '/sprite_player.asm.tpl');
        if ($tpl === false) throw new RuntimeException('Template sprite_player ausente.');
        return str_replace(
            ['@@HERO@@', '@@HERO_FRAMES@@', '@@MAX_CELLS@@', '@@PLAYER_TOTAL_SLOTS@@', '@@PLAYER_OV_BASE@@'],
            [$hero, $frames, $maxCells, $maxCells + 4, sprintf('$%04X', $ovBase)],
            trim($tpl)
        );
    },

    'sprite_entities' => static function(array $ctx): string {
        $n = max(1, min(14, (int)($ctx['sprite']['numInstances'] ?? 10)));
        $maxCells = max(1, (int)($ctx['sprite']['maxCells'] ?? 4));
        $stride = $maxCells * 4;
        $base = 0x0200 + $stride + 16; // depois do corpo do heroi + 4 sprites de overlay (16 bytes)
        $tpl = file_get_contents(__DIR__ . '/sprite_entities.asm.tpl');
        if ($tpl === false) throw new RuntimeException('Template sprite_entities ausente.');
        $offTable = [];
        for ($i = 0; $i < $n; $i++) $offTable[] = ($base + $i * $stride) - 0x0200; // oam_off e' relativo a $0200 (usado como Y em STA $0200,Y)
        $oamOffTableAsm = "OamOffTable:\n  .byte " . implode(', ', array_map(static fn($v) => sprintf('$%02X', $v & 0xFF), $offTable));
        return str_replace(
            ['@@NUM_INSTANCES@@', '@@MAX_CELLS@@', '@@OAM_OFF_TABLE@@'],
            [(string)$n, (string)$maxCells, $oamOffTableAsm],
            trim($tpl)
        );
    },
];
