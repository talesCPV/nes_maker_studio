<?php
/**
 * NGC - dados das telas.
 * Camada 9 (limpeza pré-áudio): NGC só trabalha com tabelas de metatile -
 * toda tela é MetatileIndex_<tela> (240 bytes: 1 índice LOCAL de metatile
 * por célula 2x2), nunca nametable/colisão crus. Não existe mais conceito
 * de "tela suja"/fallback - buildMetatileCompression() já garante isso lá
 * atrás (erro de build se alguma tela não tiver grade válida).
 */
return [
    'background_tables' => static function(array $ctx): string {
        $screens = is_array($ctx['screenData'] ?? null) ? $ctx['screenData'] : [];
        $playIdxs = is_array($ctx['playIdxs'] ?? null) ? $ctx['playIdxs'] : [];
        if (!$playIdxs && $screens) $playIdxs = [0];

        $lines = [];
        $lines[] = 'ScreenNtLo:';
        foreach ($screens as $i => $_) $lines[] = "  .byte <MetatileIndex_{$i}";
        $lines[] = 'ScreenNtHi:';
        foreach ($screens as $i => $_) $lines[] = "  .byte >MetatileIndex_{$i}";
        $lines[] = 'ScreenAtLo:';
        foreach ($screens as $i => $_) $lines[] = "  .byte <Attr_{$i}";
        $lines[] = 'ScreenAtHi:';
        foreach ($screens as $i => $_) $lines[] = "  .byte >Attr_{$i}";
        // Camada 7/9: ScreenBank existe pra get_collision2/mtx_collision_lookup
        // saberem de qual banco ler MetatileCollision_bank<N>, mesmo em NROM
        // (onde é sempre banco 0).
        $sb = is_array($ctx['screenBankIndex'] ?? null) ? $ctx['screenBankIndex'] : [];
        $lines[] = 'ScreenBank:';
        $bkBytes = [];
        foreach ($screens as $i => $_) $bkBytes[] = max(0, min(3, (int)($sb[$i] ?? 0)));
        if (!$bkBytes) $bkBytes = [0];
        $lines[] = '  .byte ' . implode(', ', $bkBytes);
        // UOROM etapa 2: banco de PRG (nao confundir com ScreenBank acima,
        // que e' CHR) - $FF = banco fixo (tela sem fase, ou mapper != 2).
        // load_screen usa essa tabela pra trocar de banco de PRG no corte
        // duro de fase (mesmo ponto onde CNROM ja troca CHR).
        $spb = is_array($ctx['screenPrgBankIndex'] ?? null) ? $ctx['screenPrgBankIndex'] : [];
        $lines[] = 'ScreenPrgBank:';
        $pbBytes = [];
        foreach ($screens as $i => $_) {
            $v = $spb[$i] ?? null;
            $pbBytes[] = ($v === null) ? '$FF' : (string)max(0, min(254, (int)$v));
        }
        if (!$pbBytes) $pbBytes = ['$FF'];
        $lines[] = '  .byte ' . implode(', ', $pbBytes);
        // Texto sobreposto: ponteiro pra TextOverlay_<tela> (fica sempre no
        // banco fixo - só guarda ENDEREÇOS de 16 bits, não os dados em si;
        // o dado de cada tela mora no banco da fase dela, ver
        // 'background_data' abaixo). Tela sem texto ainda ganha uma entrada
        // valida (TextOverlay_<i>: .byte 0), sem sentinela - draw_text_overlays
        // le o contador e simplesmente nao faz nada se for 0.
        $lines[] = 'TextOverlayLo:';
        foreach ($screens as $i => $_) $lines[] = "  .byte <TextOverlay_{$i}";
        $lines[] = 'TextOverlayHi:';
        foreach ($screens as $i => $_) $lines[] = "  .byte >TextOverlay_{$i}";
        // Camada 8/9: ponteiros pra MetatileCollision_bank<N> de cada um dos 4
        // bancos possíveis (CNROM) - em NROM só o banco 0 é usado de verdade,
        // mas a tabela sempre tem 4 entradas (as demais reaproveitam o banco
        // 0) pra get_collision2 não precisar saber se o mapper é CNROM ou não.
        $mtBanks = is_array($ctx['metatileCompressionBanks'] ?? null) ? $ctx['metatileCompressionBanks'] : [];
        $lines[] = 'MetatileCollisionLo:';
        for ($b = 0; $b < 4; $b++) {
            $real = isset($mtBanks[$b]) ? $b : 0;
            $lines[] = "  .byte <MetatileCollision_bank{$real}";
        }
        $lines[] = 'MetatileCollisionHi:';
        for ($b = 0; $b < 4; $b++) {
            $real = isset($mtBanks[$b]) ? $b : 0;
            $lines[] = "  .byte >MetatileCollision_bank{$real}";
        }
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
        // Item auto-scroll: 1 = fase dessa tela e' Scroll Horizontal
        // Automático - motor avanca scroll_x sozinho (auto_scroll_update em
        // system.php) em vez de esperar o D-pad bater na deadzone.
        $ah = is_array($ctx['playScreenAutoH'] ?? null) ? $ctx['playScreenAutoH'] : [0];
        if (!$ah) $ah = [0];
        $lines[] = 'PlayScreenAutoH:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => ((int)$v) ? '1' : '0', $ah));
        // Item auto-scroll VERTICAL: mesma tabela, eixo Y.
        $av = is_array($ctx['playScreenAutoV'] ?? null) ? $ctx['playScreenAutoV'] : [0];
        if (!$av) $av = [0];
        $lines[] = 'PlayScreenAutoV:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => ((int)$v) ? '1' : '0', $av));
        // Item auto-scroll com direção: 0=sentido padrão (direita/baixo),
        // 1=reverso (esquerda/cima) - só importa quando AutoH/AutoV=1.
        $ahd = is_array($ctx['playScreenAutoHDir'] ?? null) ? $ctx['playScreenAutoHDir'] : [0];
        if (!$ahd) $ahd = [0];
        $lines[] = 'PlayScreenAutoHDir:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => ((int)$v) ? '1' : '0', $ahd));
        $avd = is_array($ctx['playScreenAutoVDir'] ?? null) ? $ctx['playScreenAutoVDir'] : [0];
        if (!$avd) $avd = [0];
        $lines[] = 'PlayScreenAutoVDir:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => ((int)$v) ? '1' : '0', $avd));
        // Item auto-scroll: 1 = proxima tela pertence a outra fase (ou nao ha
        // proxima) - auto_scroll_update para de avancar aqui, mesmo que ainda
        // faltem telas no PROJETO (so' nao pode atravessar fronteira de fase).
        $lp = is_array($ctx['playScreenLastInPhase'] ?? null) ? $ctx['playScreenLastInPhase'] : [1];
        if (!$lp) $lp = [1];
        $lines[] = 'PlayScreenLastInPhase:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => ((int)$v) ? '1' : '0', $lp));
        // Item auto-scroll reverso: espelho de PlayScreenLastInPhase, checa
        // a tela ANTERIOR em vez da seguinte.
        $fp = is_array($ctx['playScreenFirstInPhase'] ?? null) ? $ctx['playScreenFirstInPhase'] : [1];
        if (!$fp) $fp = [1];
        $lines[] = 'PlayScreenFirstInPhase:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => ((int)$v) ? '1' : '0', $fp));
        // Fase 9 fix (grade real): vizinho de verdade na grade 2D da fase,
        // indexado por play_idx - 255 = nao ha sala ali (bloqueado).
        foreach (['Right' => 'screenNeighborRight', 'Left' => 'screenNeighborLeft', 'Up' => 'screenNeighborUp', 'Down' => 'screenNeighborDown'] as $label => $key) {
            $vals = is_array($ctx[$key] ?? null) ? $ctx[$key] : [255];
            if (!$vals) $vals = [255];
            $lines[] = "ScreenNeighbor{$label}:";
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => (string)max(0, min(255, (int)$v)), $vals));
        }
        // Item cutscene: mesma ideia, mas indexada por tela GLOBAL (cur_screen)
        // e cobrindo TODA tela do jogo (inclusive cutscene/splash, que nunca
        // entram nas tabelas acima) - usada só pela ação "Avançar Página".
        $cutR = is_array($ctx['screenCutRight'] ?? null) ? array_values($ctx['screenCutRight']) : [255];
        if (!$cutR) $cutR = [255];
        $lines[] = 'ScreenCutRight:';
        $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => (string)max(0, min(255, (int)$v)), $cutR));
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
        $mtIdxByScreen = is_array($ctx['metatileIndexByScreen'] ?? null) ? $ctx['metatileIndexByScreen'] : [];
        $spb = is_array($ctx['screenPrgBankIndex'] ?? null) ? $ctx['screenPrgBankIndex'] : [];
        $lines = [];
        foreach ($screens as $i => $screen) {
            $name = (string)($screen['name'] ?? "Tela {$i}");
            $role = (string)($screen['role'] ?? 'play');
            $at = is_array($screen['attributes'] ?? null) ? $screen['attributes'] : [];
            $at = array_pad(array_slice($at, 0, 64), 64, 0);

            // UOROM etapa 2: nametable+atributo dessa tela vao pro banco de
            // PRG da FASE dela (so' lido 1x, no load_screen, exatamente
            // quando aquele banco ja' foi selecionado) - null = banco fixo
            // (tela sem fase, ou qualquer outro mapper).
            $bank = $spb[$i] ?? null;
            if ($bank !== null) $lines[] = ".segment \"BANK{$bank}\"";

            // 240 bytes (16x15 células de 2x2 tiles) - cada byte é o índice
            // LOCAL (desse banco) do metatile carimbado naquela célula.
            // load_screen/get_collision2 expandem isso em tempo real, sem
            // gastar RAM.
            $ids = is_array($mtIdxByScreen[$i] ?? null) ? $mtIdxByScreen[$i] : array_fill(0, 240, 0);
            $ids = array_pad(array_slice($ids, 0, 240), 240, 0);
            $lines[] = "MetatileIndex_{$i}:  ; {$name} ({$role})";
            for ($j = 0; $j < 240; $j += 16) {
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => (string)max(0, min(63, (int)$b)), array_slice($ids, $j, 16)));
            }

            $lines[] = "Attr_{$i}:";
            for ($j = 0; $j < 64; $j += 16) {
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_slice($at, $j, 16)));
            }

            // Texto sobreposto: 0 ou mais camadas (x, y, len, tiles...) -
            // fica no MESMO banco que MetatileIndex_i/Attr_i (mesma fase),
            // já resolvido pelo NGC (ProjectParser::buildTextOverlays) -
            // tile já vem somado com a base da fonte daquele banco.
            $tov = is_array($ctx['textOverlayByScreen'][$i] ?? null) ? $ctx['textOverlayByScreen'][$i] : [];
            $lines[] = "TextOverlay_{$i}:";
            $lines[] = '  .byte ' . count($tov) . '  ; num de camadas de texto';
            foreach ($tov as $layer) {
                $tiles = $layer['tiles'];
                $lines[] = '  .byte ' . (int)$layer['x'] . ', ' . (int)$layer['y'] . ', ' . count($tiles);
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($t) => (string)max(0, min(255, (int)$t)), $tiles));
            }
            if ($bank !== null) $lines[] = '.segment "CODE"';
            $lines[] = '';
        }

        // 1 tabela MetatileCollision_bank<N> por banco realmente usado
        // (banco sem tela nenhuma não gera tabela - o ponteiro em
        // MetatileCollisionLo/Hi cai no banco 0 nesse caso).
        $mtBanks = is_array($ctx['metatileCompressionBanks'] ?? null) ? $ctx['metatileCompressionBanks'] : [];
        foreach ($mtBanks as $bi => $bank) {
            $bytes = is_array($bank['collisionBytes'] ?? null) ? $bank['collisionBytes'] : [];
            $lines[] = "MetatileCollision_bank{$bi}:  ; {$bank['metatileCount']} metatile(s) - mascara(4bits)+tipo(4bits)";
            if (!$bytes) $bytes = [0];
            for ($j = 0; $j < count($bytes); $j += 16) {
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_slice($bytes, $j, 16)));
            }
            $lines[] = '';
        }
        if (!isset($mtBanks[0])) {
            // Garante que MetatileCollision_bank0 sempre existe - é o
            // fallback padrão do ponteiro MetatileCollisionLo/Hi.
            $lines[] = 'MetatileCollision_bank0:';
            $lines[] = '  .byte $00';
            $lines[] = '';
        }

        return trim(implode("\n", $lines));
    },
];
