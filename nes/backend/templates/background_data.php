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
        foreach ($screens as $i => $_) {
            $label = !empty($ctx['screenCompressed'][$i]) ? "MetatileIndex_{$i}" : "Nametable_{$i}";
            $lines[] = "  .byte <{$label}";
        }
        $lines[] = 'ScreenNtHi:';
        foreach ($screens as $i => $_) {
            $label = !empty($ctx['screenCompressed'][$i]) ? "MetatileIndex_{$i}" : "Nametable_{$i}";
            $lines[] = "  .byte >{$label}";
        }
        $lines[] = 'ScreenAtLo:';
        foreach ($screens as $i => $_) $lines[] = "  .byte <Attr_{$i}";
        $lines[] = 'ScreenAtHi:';
        foreach ($screens as $i => $_) $lines[] = "  .byte >Attr_{$i}";
        $lines[] = 'ScreenColLo:';
        // Camada 8: telas comprimidas não têm Collision_<i> próprio (a colisão
        // sai de MetatileIndex+MetatileCollision_bank, não de tabela crua) -
        // apontam pra EmptyCollision só pra manter a tabela bem-formada; nunca
        // são de fato lidas (get_collision2 desvia antes, pelo ScreenCompressed).
        foreach ($screens as $i => $_) {
            $label = !empty($ctx['screenCompressed'][$i]) ? 'EmptyCollision' : "Collision_{$i}";
            $lines[] = "  .byte <{$label}";
        }
        $lines[] = 'ScreenColHi:';
        foreach ($screens as $i => $_) {
            $label = !empty($ctx['screenCompressed'][$i]) ? 'EmptyCollision' : "Collision_{$i}";
            $lines[] = "  .byte >{$label}";
        }
        // Camada 8 (compressão por metatile): 1 bit por tela dizendo se ela é
        // MetatileIndex (240 bytes, comprimida) ou Nametable/Collision crus
        // (960+960, telas antigas ou com edição manual que invalidou alguma
        // célula da grade). load_screen e get_collision2 leem isso pra saber
        // qual caminho seguir.
        $sco = is_array($ctx['screenCompressed'] ?? null) ? $ctx['screenCompressed'] : [];
        $lines[] = 'ScreenCompressed:';
        $bytes = [];
        foreach ($screens as $i => $_) $bytes[] = !empty($sco[$i]) ? 1 : 0;
        if (!$bytes) $bytes = [0];
        $lines[] = '  .byte ' . implode(', ', $bytes);
        // Camada 7/8: ScreenBank agora sempre existe (não só CNROM) - a
        // compressão por metatile precisa saber de qual banco ler
        // MetatileCollision_bank<N>, mesmo em NROM (onde é sempre banco 0).
        $sb = is_array($ctx['screenBankIndex'] ?? null) ? $ctx['screenBankIndex'] : [];
        $lines[] = 'ScreenBank:';
        $bkBytes = [];
        foreach ($screens as $i => $_) $bkBytes[] = max(0, min(3, (int)($sb[$i] ?? 0)));
        if (!$bkBytes) $bkBytes = [0];
        $lines[] = '  .byte ' . implode(', ', $bkBytes);
        // Camada 8: ponteiros pra MetatileCollision_bank<N> de cada um dos 4
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
        $sco = is_array($ctx['screenCompressed'] ?? null) ? $ctx['screenCompressed'] : [];
        $mtIdxByScreen = is_array($ctx['metatileIndexByScreen'] ?? null) ? $ctx['metatileIndexByScreen'] : [];
        $lines = [];
        // Camada 8: label única reaproveitada por ScreenColLo/Hi de todas as
        // telas comprimidas (nunca é de fato lida - get_collision2 desvia
        // antes -, só existe pra tabela ficar bem-formada).
        $lines[] = 'EmptyCollision:';
        $lines[] = '  .byte $00';
        $lines[] = '';
        foreach ($screens as $i => $screen) {
            $name = (string)($screen['name'] ?? "Tela {$i}");
            $role = (string)($screen['role'] ?? 'play');
            $at = is_array($screen['attributes'] ?? null) ? $screen['attributes'] : [];
            $at = array_pad(array_slice($at, 0, 64), 64, 0);

            if (!empty($sco[$i])) {
                // Camada 8 (compressão por metatile): 240 bytes (16x15 células
                // de 2x2 tiles) em vez de Nametable_<i>/Collision_<i> crus -
                // cada byte é o índice LOCAL (desse banco) do metatile
                // carimbado naquela célula. load_screen/get_collision2
                // expandem isso em tempo real, sem gastar RAM.
                $ids = is_array($mtIdxByScreen[$i] ?? null) ? $mtIdxByScreen[$i] : array_fill(0, 240, 0);
                $ids = array_pad(array_slice($ids, 0, 240), 240, 0);
                $lines[] = "MetatileIndex_{$i}:  ; {$name} ({$role}) - comprimida";
                for ($j = 0; $j < 240; $j += 16) {
                    $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => (string)max(0, min(63, (int)$b)), array_slice($ids, $j, 16)));
                }
            } else {
                $nt = is_array($screen['remappedNt'] ?? null) ? $screen['remappedNt'] : [];
                $col = is_array($screen['collisionMap'] ?? null) ? $screen['collisionMap'] : [];
                $nt = array_pad(array_slice($nt, 0, 960), 960, 0);
                $col = array_pad(array_slice($col, 0, 960), 960, 0);

                $lines[] = "Nametable_{$i}:  ; {$name} ({$role})";
                for ($j = 0; $j < 960; $j += 32) {
                    $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_slice($nt, $j, 32)));
                }
            }

            $lines[] = "Attr_{$i}:";
            for ($j = 0; $j < 64; $j += 16) {
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_slice($at, $j, 16)));
            }

            if (empty($sco[$i])) {
                $lines[] = "Collision_{$i}:";
                for ($j = 0; $j < 960; $j += 32) {
                    $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_slice($col, $j, 32)));
                }
            }
            $lines[] = '';
        }

        // Camada 8: 1 tabela MetatileCollision_bank<N> por banco realmente
        // usado (banco sem nenhuma tela comprimida não gera tabela - o
        // ponteiro em MetatileCollisionLo/Hi cai no banco 0 nesse caso).
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
            // Camada 8: garante que MetatileCollision_bank0 sempre existe -
            // e' o fallback padrao do ponteiro MetatileCollisionLo/Hi mesmo
            // quando nenhuma tela usa compressao.
            $lines[] = 'MetatileCollision_bank0:';
            $lines[] = '  .byte $00';
            $lines[] = '';
        }

        return trim(implode("\n", $lines));
    },
];
