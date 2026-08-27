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
        $tpl = file_get_contents(__DIR__ . '/sprite_player.asm.tpl');
        if ($tpl === false) throw new RuntimeException('Template sprite_player ausente.');
        return str_replace(['@@HERO@@', '@@HERO_FRAMES@@'], [$hero, $frames], trim($tpl));
    },

    'sprite_entities' => static function(array $ctx): string {
        $n = max(1, min(14, (int)($ctx['sprite']['numInstances'] ?? 10)));
        $tpl = file_get_contents(__DIR__ . '/sprite_entities.asm.tpl');
        if ($tpl === false) throw new RuntimeException('Template sprite_entities ausente.');
        return str_replace('@@NUM_INSTANCES@@', (string)$n, trim($tpl));
    },
];
