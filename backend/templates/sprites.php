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

        // Fase 9 fix: check_ground_inst/check_wall_at_inst usavam offsets de
        // corpo hardcoded (16/2/13/4/12, o corpo antigo fixo de 2x2) pra
        // TODOS os personagens - cada um pode ter seu proprio hb_body agora,
        // entao viram tabelas indexadas por personagem (CharBody*,Y com
        // Y=inst_char) em vez de constantes fixas.
        $bb = is_array($ctx['sprite']['bodyBottom'] ?? null) ? $ctx['sprite']['bodyBottom'] : [16];
        $bl = is_array($ctx['sprite']['bodyLeft'] ?? null) ? $ctx['sprite']['bodyLeft'] : [2];
        $br = is_array($ctx['sprite']['bodyRight'] ?? null) ? $ctx['sprite']['bodyRight'] : [13];
        $btp = is_array($ctx['sprite']['bodyTopProbe'] ?? null) ? $ctx['sprite']['bodyTopProbe'] : [4];
        $bbp = is_array($ctx['sprite']['bodyBottomProbe'] ?? null) ? $ctx['sprite']['bodyBottomProbe'] : [12];
        $bytesOf = static fn(array $a) => '.byte ' . implode(', ', array_map(static fn($v) => (string)(max(0, min(255, (int)$v))), $a ?: [0]));
        $bodyTables = "CharBodyBottom:\n  {$bytesOf($bb)}\nCharBodyLeft:\n  {$bytesOf($bl)}\nCharBodyRight:\n  {$bytesOf($br)}\nCharBodyTopProbe:\n  {$bytesOf($btp)}\nCharBodyBottomProbe:\n  {$bytesOf($bbp)}";

        return str_replace(
            ['@@NUM_INSTANCES@@', '@@MAX_CELLS@@', '@@OAM_OFF_TABLE@@', '@@BODY_TABLES@@'],
            [(string)$n, (string)$maxCells, $oamOffTableAsm, $bodyTables],
            trim($tpl)
        );
    },
];
