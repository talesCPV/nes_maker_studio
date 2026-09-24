<?php
/**
 * NGC Stage 23 - Som (motor final): multi-musica + SFX.
 *
 * Substitui o Stage 16 (1 musica so, sem SFX). Agora TODAS as musicas e
 * TODOS os SFX com pelo menos 1 canal com notas viram dados+rotinas na ROM.
 * A acao "Tocar Som" (ProgramCompiler::compilePlaySound) e quem decide, em
 * tempo de compilacao, qual musica tocar ou qual SFX disparar - o alvo e
 * sempre um literal escolhido na UI, nunca resolvido em runtime.
 *
 * Arquitetura (evita indirect-indexed addressing e self-modifying code -
 * o CODE roda direto da ROM, nao pode se auto-modificar):
 *  - Fase 11 (player generico): existem so' 4 rotinas FIXAS (chan_update_0..3,
 *    uma por canal FISICO 0-3), COMPARTILHADAS por toda musica e todo SFX -
 *    nao existe mais 1 rotina por musica nem 1 rotina por (SFX,canal).
 *    "Tocar Som" so' escreve, por slot (0-3=musica 4-7=SFX), o endereco de
 *    inicio/reinicio de loop (loop_scale/time_lo/hi) e, pra musica, um
 *    bitmask (music_chan_mask) dizendo quais canais fisicos ela usa - nao
 *    ha mais ponteiro de despacho nem JMP indireto de nenhum tipo, so'
 *    JSR/RTS direto pra chan_update_i (X = slot escolhe o estado, o
 *    ENDERECO da rotina e' sempre o mesmo pro mesmo canal fisico).
 *  - Ativar um SFX liga sfx_active_ch<N> - a partir dai aquele canal FISICO
 *    fica sob controle do SFX pro OUVIDO (registrador de audio), mas o
 *    TEMPO da musica nesse canal NUNCA para: chan_timer do slot de musica
 *    (0-3) continua avancando nota a nota, frame a frame, exatamente como
 *    se o SFX nao existisse - so a ESCRITA no registrador fica muda (checada
 *    dentro de chan_update_i, bem em cima de cada STA no hardware). Isso
 *    garante sincronismo: quando o SFX termina (scale hit $FE) e desliga
 *    sfx_active_ch<N>, a musica retoma exatamente na nota que esta
 *    programada pro tempo REAL daquele instante - nunca uma nota atrasada
 *    pelo tempo que o canal ficou "mudo".
 *  - 4 canais fisicos fixos: 0=Pulse1 1=Pulse2 2=Triangle 3=Noise. Cada SFX
 *    escolhe no editor em qual(is) canal(is) ele toca (igual uma musica) -
 *    por convencao o editor sugere Pulse2 como canal padrao pra SFX novos.
 */
return [
    'music' => static function (array $ctx): string {
        $soundItems = is_array($ctx['soundItems'] ?? null) ? $ctx['soundItems'] : [];
        $songs = [];
        $sfxs = [];
        foreach ($soundItems as $item) {
            if (!is_array($item) || empty($item['id']) || empty($item['channels'])) continue;
            if ((string)($item['type'] ?? 'song') === 'sfx') $sfxs[] = $item; else $songs[] = $item;
        }
        if (!$songs && !$sfxs) return '';

        $chMeta = [
            'pulse1'   => ['idx' => 0, 'vol' => '$4000', 'lo' => '$4002', 'hi' => '$4003', 'duty' => '#%10111111', 'sil' => '#%00110000'],
            'pulse2'   => ['idx' => 1, 'vol' => '$4004', 'lo' => '$4006', 'hi' => '$4007', 'duty' => '#%01111111', 'sil' => '#%00110000'],
            'triangle' => ['idx' => 2, 'vol' => '$4008', 'lo' => '$400A', 'hi' => '$400B', 'duty' => '#%11111111', 'sil' => '#%00000000'],
            'noise'    => ['idx' => 3, 'vol' => '$400C', 'lo' => '$400E', 'hi' => '$400F', 'duty' => '#%00111111', 'sil' => '#%00110000'],
        ];
        $order = ['pulse1', 'pulse2', 'triangle', 'noise'];
        $rhythm = ['breve' => 4, 'whole' => 2, 'quarter' => 1, 'eighth' => 0.5, 'sixteenth' => 0.25, 'thirtysecond' => 0.125, 'sixtyfourth' => 0.0625];
        $noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        $freq = 1789773;
        // Camada 10 (compressão de áudio): 1 unica marcador de RLE por
        // stream - $FD pro Scale (índices de pitch 0-128 nunca chegam
        // perto), $FF pro Time (só sobra 1-254 de duração literal - baixo
        // custo, praticamente nenhuma música usa nota de 255 frames sem ser
        // ponto de exceção). Ver rleEncode()/packMetatileCollisionByte-style
        // formato: [$escape, valor, contagem] sempre que a repetição vale a
        // pena (run>=4) ou o próprio valor bate com o escape (senão o
        // decodificador confundiria um literal com um comando).
        $SCALE_ESCAPE = 0xFD;
        $TIME_ESCAPE = 0xFF;
        $rleEncode = static function (array $vals, int $escape): array {
            $out = [];
            $i = 0; $n = count($vals);
            while ($i < $n) {
                $j = $i;
                while ($j + 1 < $n && $vals[$j + 1] === $vals[$i] && ($j - $i + 1) < 255) $j++;
                $run = $j - $i + 1;
                $v = $vals[$i];
                if ($run >= 4 || $v === $escape) {
                    $out[] = $escape; $out[] = $v; $out[] = $run;
                } else {
                    for ($k = 0; $k < $run; $k++) $out[] = $v;
                }
                $i = $j + 1;
            }
            return $out;
        };
        // Camada 10: tabela de período GLOBAL (1 vez pro ROM inteiro, não 1
        // por música/canal como antes) - período de uma nota é função pura
        // do nome dela (mesma conta de sempre: MIDI -> frequência -> período
        // NES), nunca depende de qual música/SFX a usa. Índice = MIDI+1
        // (0-127 vira 1-128), índice 0 reservado pra REST (silêncio).
        $globalPitchLo = [0]; $globalPitchHi = [0];
        for ($midi = 0; $midi <= 127; $midi++) {
            $f = 440 * pow(2, ($midi - 69) / 12);
            $period = (int)round(($freq / (16 * $f)) - 1);
            $period = max(0, min(2047, $period));
            $globalPitchLo[] = $period & 255;
            $globalPitchHi[] = ($period >> 8) & 7;
        }

        $fmt = static function (array $a): string {
            $lines = [];
            for ($i = 0; $i < count($a); $i += 16) {
                $part = array_slice($a, $i, 16);
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($v) => sprintf('$%02X', $v & 255), $part));
            }
            return implode("\n", $lines);
        };

        // Mesma sanitizacao usada em ProgramCompiler::soundLabel() - tem que
        // bater exatamente, e' assim que a acao "Tocar Som" acha o label certo.
        $label = static function (string $prefix, string $id): string {
            $s = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $id) ?? '');
            if ($s === '') $s = substr(md5($id), 0, 8);
            return $prefix . substr($s, 0, 16);
        };

        $resolveUsed = static function (array $item) use ($order): array {
            $channels = is_array($item['channels'] ?? null) ? $item['channels'] : [];
            $used = [];
            foreach ($order as $type) {
                foreach ($channels as $ch) {
                    if (is_array($ch) && ($ch['type'] ?? '') === $type && !empty($ch['notes'])) {
                        $used[] = ['type' => $type, 'ch' => $ch];
                        break;
                    }
                }
            }
            return $used;
        };

        $encodeChannel = static function (array $ch, int $baseFrames, bool $loop) use ($rhythm, $noteNames, $freq, $rleEncode, $SCALE_ESCAPE, $TIME_ESCAPE): array {
            $notes = is_array($ch['notes'] ?? null) ? $ch['notes'] : [];
            $scale = []; $time = [];
            $n = min(count($notes), 2048);
            for ($j = 0; $j < $n; $j++) {
                $note = (string)($notes[$j]['note'] ?? 'REST');
                $fig = (string)($notes[$j]['figure'] ?? 'quarter');
                $gi = 0; // Camada 10: 0 = REST (silêncio), igual sempre foi
                if (preg_match('/^([A-G]#?)(\d+)$/', $note, $m)) {
                    $ni = array_search($m[1], $noteNames, true);
                    if ($ni !== false) {
                        $oct = (int)$m[2]; $midi = ($oct + 1) * 12 + $ni;
                        if ($midi >= 0 && $midi <= 127) $gi = $midi + 1; // índice global (ver tabela no topo do arquivo)
                    }
                }
                $scale[] = $gi;
                $mul = $rhythm[$fig] ?? 1;
                $time[] = max(1, min(254, (int)round($baseFrames * $mul))); // 254, não 255: reservado pro escape do RLE
            }
            if (!$scale) { $scale = [0]; $time = [30]; }
            $scale[] = $loop ? 0xFF : 0xFE;
            return [
                'scale' => $rleEncode($scale, $SCALE_ESCAPE),
                'time' => $rleEncode($time, $TIME_ESCAPE),
            ];
        };

        $L = []; // engine (CODE)
        $D = []; // data (vem numa posicao distante do arquivo)
        $L[] = '; ---- NGC SOM (musica + SFX) ----';

        // ---- liga o APU (idempotente) - chamada pela propria acao "Tocar
        // Som" na 1a vez que uma regra dispara som; sem isso nada soa mesmo
        // com os dados certos, e sem nenhum callsite isso nunca roda sozinho ----
        $L[] = 'snd_enable_apu:';
        $L[] = '  LDA #$0F';
        $L[] = '  STA $4015';
        $L[] = '  RTS';

        // ---- Camada 10 (compressão de áudio): decodificador RLE compartilhado
        // por TODOS os canais de TODAS as músicas/SFX (8 "slots" de estado: 0-3
        // = os 4 canais físicos tocando música, 4-7 = os mesmos 4 canais quando
        // um SFX os toma emprestado - precisam de estado independente porque o
        // tempo da música nesse canal continua andando por baixo do SFX). O par
        // rle_ptr_lo/hi é o único que precisa estar na zeropage (sofre
        // endereçamento indireto); os arrays de ponteiro/estado por slot ficam
        // na RAM comum, acessados por índice (,X).
        $L[] = 'rle_decode_scale:';
        $L[] = '  LDA scale_run_left,X';
        $L[] = '  BEQ rds_fresh';
        $L[] = '  DEC scale_run_left,X';
        $L[] = '  LDA scale_run_val,X';
        $L[] = '  RTS';
        $L[] = 'rds_fresh:';
        $L[] = '  LDA scale_ptr_lo,X';
        $L[] = '  STA rle_ptr_lo';
        $L[] = '  LDA scale_ptr_hi,X';
        $L[] = '  STA rle_ptr_hi';
        $L[] = '  LDY #0';
        $L[] = '  LDA (rle_ptr_lo),Y';
        $L[] = '  CMP #$FD';
        $L[] = '  BNE rds_literal';
        $L[] = '  INY';
        $L[] = '  LDA (rle_ptr_lo),Y';
        $L[] = '  STA scale_run_val,X';
        $L[] = '  INY';
        $L[] = '  LDA (rle_ptr_lo),Y';
        $L[] = '  SEC';
        $L[] = '  SBC #1';
        $L[] = '  STA scale_run_left,X';
        $L[] = '  LDA scale_ptr_lo,X';
        $L[] = '  CLC';
        $L[] = '  ADC #3';
        $L[] = '  STA scale_ptr_lo,X';
        $L[] = '  BCC rds_noc1';
        $L[] = '  INC scale_ptr_hi,X';
        $L[] = 'rds_noc1:';
        $L[] = '  LDA scale_run_val,X';
        $L[] = '  RTS';
        $L[] = 'rds_literal:';
        $L[] = '  STA rle_scratch';
        $L[] = '  LDA scale_ptr_lo,X';
        $L[] = '  CLC';
        $L[] = '  ADC #1';
        $L[] = '  STA scale_ptr_lo,X';
        $L[] = '  BCC rds_noc2';
        $L[] = '  INC scale_ptr_hi,X';
        $L[] = 'rds_noc2:';
        $L[] = '  LDA rle_scratch';
        $L[] = '  RTS';

        $L[] = 'rle_decode_time:';
        $L[] = '  LDA time_run_left,X';
        $L[] = '  BEQ rdt_fresh';
        $L[] = '  DEC time_run_left,X';
        $L[] = '  LDA time_run_val,X';
        $L[] = '  RTS';
        $L[] = 'rdt_fresh:';
        $L[] = '  LDA time_ptr_lo,X';
        $L[] = '  STA rle_ptr_lo';
        $L[] = '  LDA time_ptr_hi,X';
        $L[] = '  STA rle_ptr_hi';
        $L[] = '  LDY #0';
        $L[] = '  LDA (rle_ptr_lo),Y';
        $L[] = '  CMP #$FF';
        $L[] = '  BNE rdt_literal';
        $L[] = '  INY';
        $L[] = '  LDA (rle_ptr_lo),Y';
        $L[] = '  STA time_run_val,X';
        $L[] = '  INY';
        $L[] = '  LDA (rle_ptr_lo),Y';
        $L[] = '  SEC';
        $L[] = '  SBC #1';
        $L[] = '  STA time_run_left,X';
        $L[] = '  LDA time_ptr_lo,X';
        $L[] = '  CLC';
        $L[] = '  ADC #3';
        $L[] = '  STA time_ptr_lo,X';
        $L[] = '  BCC rdt_noc1';
        $L[] = '  INC time_ptr_hi,X';
        $L[] = 'rdt_noc1:';
        $L[] = '  LDA time_run_val,X';
        $L[] = '  RTS';
        $L[] = 'rdt_literal:';
        $L[] = '  STA rle_scratch';
        $L[] = '  LDA time_ptr_lo,X';
        $L[] = '  CLC';
        $L[] = '  ADC #1';
        $L[] = '  STA time_ptr_lo,X';
        $L[] = '  BCC rdt_noc2';
        $L[] = '  INC time_ptr_hi,X';
        $L[] = 'rdt_noc2:';
        $L[] = '  LDA rle_scratch';
        $L[] = '  RTS';

        // ---- chamada 1x por frame a partir da NMI ----
        // Camada 11 (player genérico): antes existia 1 rotina music_update_<musica>
        // por MÚSICA (todos os canais dela desenrolados juntos) + 1 rotina
        // sfx_r_<sfx>_ch<N> por (SFX, canal) - cada uma com os enderecos de
        // Scale_/Time_ cravados como imediato (~117 bytes de codigo por canal
        // usado, duplicado por musica/SFX). Isso agora e' 4 rotinas FIXAS
        // (chan_update_0..3, uma por canal FISICO, ~200 bytes ao todo) que leem
        // o endereco de reinicio de loop de uma tabela (loop_scale_lo/hi,
        // loop_time_lo/hi - 8 slots, escrita 1x quando a musica/SFX comeca a
        // tocar, ver ProgramCompiler::compilePlaySound) em vez de ter o
        // endereco cravado no codigo. music_chan_mask (1 bit por canal fisico)
        // diz quais canais a musica ATUAL usa - sfx_active_ch<N> (ja existia)
        // continua dizendo se o canal esta emprestado a um SFX. O tempo da
        // musica num canal roubado por SFX continua andando (slot 0-3 sempre
        // chamado se a musica usa aquele canal, independente de sfx_active) -
        // so' a ESCRITA no registrador fica muda (checada DENTRO de
        // chan_update_i, mesma logica de antes).
        $L[] = 'music_update:';
        foreach (range(0, 3) as $i) {
            $L[] = "  LDA sfx_active_ch{$i}";
            $L[] = "  BEQ mu_nosfx{$i}";
            $L[] = "  LDX #" . ($i + 4);
            $L[] = "  JSR chan_update_{$i}";
            $L[] = "mu_nosfx{$i}:";
        }
        $L[] = '  LDA music_on';
        $L[] = '  BEQ mu_end';
        foreach (range(0, 3) as $i) {
            $L[] = '  LDA music_chan_mask';
            $L[] = "  AND #" . (1 << $i);
            $L[] = "  BEQ mu_nomus{$i}";
            $L[] = "  LDX #{$i}";
            $L[] = "  JSR chan_update_{$i}";
            $L[] = "mu_nomus{$i}:";
        }
        $L[] = 'mu_end:';
        $L[] = '  RTS';

        // ---- 1 rotina por canal FISICO (0-3), compartilhada por TODA musica
        // e TODO SFX que passa por aquele canal - X = slot (0-3 tocando
        // musica, 4-7 tomado por SFX). $FF no stream = reinicia do inicio
        // (loop_scale/time_lo/hi); $FE = fim de verdade (SFX devolve o canal
        // pra musica via sfx_active_ch<N>=0; musica so' fica muda, sem efeito
        // colateral - ela e' a "atual" ate outra "Tocar Musica" trocar). ----
        foreach (range(0, 3) as $i) {
            $m = $chMeta[$order[$i]];
            $L[] = "chan_update_{$i}:";
            $L[] = '  LDA chan_timer,X';
            $L[] = "  BEQ cu{$i}_next";
            $L[] = '  DEC chan_timer,X';
            $L[] = '  RTS';
            $L[] = "cu{$i}_next:";
            $L[] = '  JSR rle_decode_scale';
            $L[] = '  CMP #$FF';
            $L[] = "  BNE cu{$i}_nof";
            $L[] = '  LDA loop_scale_lo,X';
            $L[] = '  STA scale_ptr_lo,X';
            $L[] = '  LDA loop_scale_hi,X';
            $L[] = '  STA scale_ptr_hi,X';
            $L[] = '  LDA #0';
            $L[] = '  STA scale_run_left,X';
            $L[] = '  LDA loop_time_lo,X';
            $L[] = '  STA time_ptr_lo,X';
            $L[] = '  LDA loop_time_hi,X';
            $L[] = '  STA time_ptr_hi,X';
            $L[] = '  LDA #0';
            $L[] = '  STA time_run_left,X';
            $L[] = '  JSR rle_decode_scale';
            $L[] = "cu{$i}_nof:";
            $L[] = '  CMP #$FE';
            $L[] = "  BNE cu{$i}_play";
            $L[] = "  CPX #{$i}";
            $L[] = "  BEQ cu{$i}_endmus   ; X=slot musica deste canal - SFX nao esta terminando aqui";
            $L[] = "  LDA #0";
            $L[] = "  STA sfx_active_ch{$i}   ; SFX terminou - devolve o canal pra musica";
            $L[] = "  LDA {$m['sil']}";
            $L[] = "  STA {$m['vol']}";
            $L[] = '  RTS';
            $L[] = "cu{$i}_endmus:";
            $L[] = "  LDA sfx_active_ch{$i}";
            $L[] = "  BNE cu{$i}_rts1   ; canal ocupado pelo SFX - so nao escreve, tempo ja avancou normal";
            $L[] = "  LDA {$m['sil']}";
            $L[] = "  STA {$m['vol']}";
            $L[] = "cu{$i}_rts1:";
            $L[] = '  RTS';
            $L[] = "cu{$i}_play:";
            $L[] = '  STA rle_pitch_scratch  ; guarda indice global de pitch NA MEMORIA - rle_decode_time usa Y internamente, nao da pra confiar em registrador aqui';
            $L[] = '  JSR rle_decode_time';
            $L[] = '  STA chan_timer,X';
            $L[] = '  LDA rle_pitch_scratch';
            $L[] = "  BNE cu{$i}_tone";
            $L[] = "  CPX #{$i}";
            $L[] = "  BNE cu{$i}_silrest   ; slot SFX - sempre escreve, e' dono do canal";
            $L[] = "  LDA sfx_active_ch{$i}";
            $L[] = "  BNE cu{$i}_rts2";
            $L[] = "cu{$i}_silrest:";
            $L[] = "  LDA {$m['sil']}";
            $L[] = "  STA {$m['vol']}";
            $L[] = "cu{$i}_rts2:";
            $L[] = '  RTS';
            $L[] = "cu{$i}_tone:";
            $L[] = "  CPX #{$i}";
            $L[] = "  BNE cu{$i}_dotone   ; slot SFX - sempre escreve, e' dono do canal";
            $L[] = "  LDA sfx_active_ch{$i}";
            $L[] = "  BNE cu{$i}_rts3";
            $L[] = "cu{$i}_dotone:";
            $L[] = "  LDA {$m['duty']}";
            $L[] = "  STA {$m['vol']}";
            $L[] = '  LDY rle_pitch_scratch';
            $L[] = '  LDA PitchLoGlobal,Y';
            $L[] = "  STA {$m['lo']}";
            $L[] = '  LDA PitchHiGlobal,Y';
            $L[] = "  STA {$m['hi']}";
            $L[] = "cu{$i}_rts3:";
            $L[] = '  RTS';
        }

        // ---- dados de cada musica (so a tabela Scale_/Time_ - a rotina que
        // as consome agora e' a generica chan_update_i acima) ----
        foreach ($songs as $song) {
            $sid = (string)$song['id'];
            $used = $resolveUsed($song);
            if (!$used) continue;
            $baseFrames = max(1, min(255, (int)($song['baseFrames'] ?? 30)));
            $loop = ($song['loop'] ?? true) !== false;
            $lbl = $label('ms_', $sid);

            foreach ($used as $u) {
                $m = $chMeta[$u['type']]; $i = $m['idx'];
                $enc = $encodeChannel($u['ch'], $baseFrames, $loop);
                // UOROM etapa 2: dados de musica de uma fase vao pro banco
                // de PRG daquela fase (so' sao lidos quando aquele banco ja'
                // esta' selecionado - ver ProgramCompiler::compilePlaySound).
                // Musica sem phaseId ("Todas as Fases" no editor de som)
                // fica no banco fixo, igual SFX.
                $bank = null;
                if ((int)($ctx['mapperInfo']['mapper'] ?? 0) === 2) {
                    $pid = $song['phaseId'] ?? null;
                    $ppb = is_array($ctx['phasePrgBankIndex'] ?? null) ? $ctx['phasePrgBankIndex'] : [];
                    if ($pid !== null && $pid !== '' && isset($ppb[(string)$pid])) $bank = $ppb[(string)$pid];
                }
                if ($bank !== null) $D[] = ".segment \"BANK{$bank}\"";
                $D[] = "Scale_{$lbl}_ch{$i}:"; $D[] = $fmt($enc['scale']);
                $D[] = "Time_{$lbl}_ch{$i}:";  $D[] = $fmt($enc['time']);
                if ($bank !== null) $D[] = '.segment "CODE"';
                $D[] = '';
            }
        }

        // ---- dados de cada SFX (so a tabela Scale_/Time_ - a rotina que as
        // consome agora e' a generica chan_update_i acima, slot = canal+4) ----
        foreach ($sfxs as $sfx) {
            $sid = (string)$sfx['id'];
            $used = $resolveUsed($sfx);
            if (!$used) continue;
            $baseFrames = max(1, min(255, (int)($sfx['baseFrames'] ?? 20)));
            $loop = ($sfx['loop'] ?? false) !== false;
            $lbl = $label('sx_', $sid);

            foreach ($used as $u) {
                $m = $chMeta[$u['type']]; $i = $m['idx'];
                $r = "sfx_r_{$lbl}_ch{$i}";
                $enc = $encodeChannel($u['ch'], $baseFrames, $loop);
                $D[] = "Scale_{$r}:"; $D[] = $fmt($enc['scale']);
                $D[] = "Time_{$r}:";  $D[] = $fmt($enc['time']);
                $D[] = '';
            }
        }

        // Camada 10: tabela de período global - 1 vez pro ROM inteiro (ver
        // topo do arquivo), substitui as tabelas PitchLo/PitchHi que antes
        // eram por-música-por-canal (e por-SFX-por-canal).
        $D[] = 'PitchLoGlobal:'; $D[] = $fmt($globalPitchLo);
        $D[] = 'PitchHiGlobal:'; $D[] = $fmt($globalPitchHi);
        $D[] = '';

        $out = implode("\n", $L);
        $out .= "\n; ---- NGC MUSIC DATA ----\n" . implode("\n", $D);
        return $out;
    },
];
