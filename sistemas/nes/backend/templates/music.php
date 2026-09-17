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
 *  - Cada musica gera sua PROPRIA rotina music_update_<id> com enderecos
 *    absolutos fixos pras suas tabelas (sem indirecao). Trocar de musica e
 *    so trocar o PONTEIRO de despacho (music_dispatch) pra rotina da nova
 *    musica - JMP (ptr) via trampolim, ver music_call_dispatch.
 *  - Cada SFX gera 1 rotina por canal que ele usa (sfx_r_<id>_ch<N>).
 *    Ativar o SFX seta sfx_dispatch_ch<N> pra essa rotina e liga
 *    sfx_active_ch<N> - a partir dai aquele canal FISICO fica sob controle
 *    do SFX pro OUVIDO (registrador de audio), mas o TEMPO da musica nesse
 *    canal NUNCA para: ch<N>_timer/ch<N>_pos continuam avancando nota a
 *    nota, frame a frame, exatamente como se o SFX nao existisse - so a
 *    ESCRITA no registrador fica muda (guarda "sfx_active_ch<N>" bem em
 *    cima de cada STA no hardware, nunca no topo do bloco do canal). Isso
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

        // ---- trampolins de despacho indireto (permitem "chamar" um endereco
        // guardado numa variavel e ainda assim voltar via RTS - JMP nao
        // empilha retorno, entao o RTS da rotina-alvo devolve pra quem deu
        // JSR no trampolim, nao pro JMP em si) ----
        $L[] = 'music_call_dispatch:';
        $L[] = '  JMP (music_dispatch)';
        foreach (range(0, 3) as $i) {
            $L[] = "sfx_call_dispatch_ch{$i}:";
            $L[] = "  JMP (sfx_dispatch_ch{$i})";
        }

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
        $L[] = 'music_update:';
        foreach (range(0, 3) as $i) $L[] = "  JSR sfx_update_ch{$i}";
        $L[] = '  LDA music_on';
        $L[] = '  BEQ mu_end';
        $L[] = '  JSR music_call_dispatch';
        $L[] = 'mu_end:';
        $L[] = '  RTS';

        foreach (range(0, 3) as $i) {
            $L[] = "sfx_update_ch{$i}:";
            $L[] = "  LDA sfx_active_ch{$i}";
            $L[] = "  BEQ sfx{$i}_upd_end";
            $L[] = "  JSR sfx_call_dispatch_ch{$i}";
            $L[] = "sfx{$i}_upd_end:";
            $L[] = '  RTS';
        }

        // ---- 1 rotina por musica (so mexe nos canais que ela usa; um canal
        // "roubado" por SFX no momento e simplesmente pulado, o SFX quem
        // escreve nos registradores dele naquele frame) ----
        foreach ($songs as $song) {
            $sid = (string)$song['id'];
            $used = $resolveUsed($song);
            if (!$used) continue;
            $baseFrames = max(1, min(255, (int)($song['baseFrames'] ?? 30)));
            $loop = ($song['loop'] ?? true) !== false;
            $lbl = $label('ms_', $sid);

            $L[] = "music_update_{$lbl}:";
            foreach ($used as $u) {
                $m = $chMeta[$u['type']]; $i = $m['idx']; $p = "{$lbl}_ch{$i}"; $slot = $i;
                // Fase 9 (sincronismo): o contador de tempo/posicao deste canal
                // NUNCA para, mesmo com o canal "roubado" por um SFX - so a
                // ESCRITA no registrador de audio e' que fica muda enquanto
                // sfx_active_ch{i} estiver ligado (guarda logo antes de cada
                // STA no hardware, nao no topo do bloco). Assim, quando o SFX
                // devolve o canal, a nota que volta a soar e' sempre a que
                // esta programada pro tempo REAL - nunca uma nota atrasada.
                $L[] = "  LDA ch{$i}_timer";
                $L[] = "  BEQ {$p}_next";
                $L[] = "  DEC ch{$i}_timer";
                $L[] = "  JMP {$p}_end";
                $L[] = "{$p}_next:";
                $L[] = "  LDX #{$slot}";
                $L[] = '  JSR rle_decode_scale';
                $L[] = '  CMP #$FF';
                $L[] = "  BNE {$p}_nof";
                // loop: reseta os ponteiros de decodificacao pro inicio desta
                // musica/canal (enderecos fixos, conhecidos em tempo de build).
                $L[] = "  LDA #<Scale_{$lbl}_ch{$i}";
                $L[] = "  STA scale_ptr_lo+{$slot}";
                $L[] = "  LDA #>Scale_{$lbl}_ch{$i}";
                $L[] = "  STA scale_ptr_hi+{$slot}";
                $L[] = '  LDA #0';
                $L[] = "  STA scale_run_left+{$slot}";
                $L[] = "  LDA #<Time_{$lbl}_ch{$i}";
                $L[] = "  STA time_ptr_lo+{$slot}";
                $L[] = "  LDA #>Time_{$lbl}_ch{$i}";
                $L[] = "  STA time_ptr_hi+{$slot}";
                $L[] = "  STA time_run_left+{$slot}";
                $L[] = "  LDX #{$slot}";
                $L[] = '  JSR rle_decode_scale';
                $L[] = "{$p}_nof:";
                $L[] = '  CMP #$FE';
                $L[] = "  BNE {$p}_play";
                $L[] = "  LDA sfx_active_ch{$i}";
                $L[] = "  BNE {$p}_end   ; canal ocupado pelo SFX - so nao escreve, tempo/posicao ja avancaram normal";
                $L[] = "  LDA {$m['sil']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = "  JMP {$p}_end";
                $L[] = "{$p}_play:";
                $L[] = '  STA rle_pitch_scratch  ; guarda indice global de pitch NA MEMORIA - rle_decode_time usa Y internamente (LDY #0), nao da pra confiar em registrador aqui';
                $L[] = "  LDX #{$slot}";
                $L[] = '  JSR rle_decode_time';
                $L[] = "  STA ch{$i}_timer";
                $L[] = '  LDA rle_pitch_scratch';
                $L[] = "  BNE {$p}_tone";
                $L[] = "  LDA sfx_active_ch{$i}";
                $L[] = "  BNE {$p}_end   ; canal ocupado pelo SFX - so nao escreve, tempo/posicao ja avancaram normal";
                $L[] = "  LDA {$m['sil']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = "  JMP {$p}_end";
                $L[] = "{$p}_tone:";
                $L[] = "  LDA sfx_active_ch{$i}";
                $L[] = "  BNE {$p}_end   ; canal ocupado pelo SFX - so nao escreve, tempo/posicao ja avancaram normal";
                $L[] = "  LDA {$m['duty']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = '  LDY rle_pitch_scratch';
                $L[] = '  LDA PitchLoGlobal,Y';
                $L[] = "  STA {$m['lo']}";
                $L[] = '  LDA PitchHiGlobal,Y';
                $L[] = "  STA {$m['hi']}";
                $L[] = "{$p}_end:";
            }
            $L[] = '  RTS';

            foreach ($used as $u) {
                $m = $chMeta[$u['type']]; $i = $m['idx'];
                $enc = $encodeChannel($u['ch'], $baseFrames, $loop);
                $D[] = "Scale_{$lbl}_ch{$i}:"; $D[] = $fmt($enc['scale']);
                $D[] = "Time_{$lbl}_ch{$i}:";  $D[] = $fmt($enc['time']);
                $D[] = '';
            }
        }

        // ---- 1 rotina por (SFX, canal que ele usa) ----
        foreach ($sfxs as $sfx) {
            $sid = (string)$sfx['id'];
            $used = $resolveUsed($sfx);
            if (!$used) continue;
            $baseFrames = max(1, min(255, (int)($sfx['baseFrames'] ?? 20)));
            $loop = ($sfx['loop'] ?? false) !== false;
            $lbl = $label('sx_', $sid);

            foreach ($used as $u) {
                $m = $chMeta[$u['type']]; $i = $m['idx'];
                $r = "sfx_r_{$lbl}_ch{$i}"; $slot = $i + 4; // Camada 10: slots 4-7 = canais tomados por SFX
                $L[] = "{$r}:";
                $L[] = "  LDA sfx_timer_ch{$i}";
                $L[] = "  BEQ {$r}_next";
                $L[] = "  DEC sfx_timer_ch{$i}";
                $L[] = '  RTS';
                $L[] = "{$r}_next:";
                $L[] = "  LDX #{$slot}";
                $L[] = '  JSR rle_decode_scale';
                $L[] = '  CMP #$FF';
                $L[] = "  BNE {$r}_nof";
                $L[] = "  LDA #<Scale_{$r}";
                $L[] = "  STA scale_ptr_lo+{$slot}";
                $L[] = "  LDA #>Scale_{$r}";
                $L[] = "  STA scale_ptr_hi+{$slot}";
                $L[] = '  LDA #0';
                $L[] = "  STA scale_run_left+{$slot}";
                $L[] = "  LDA #<Time_{$r}";
                $L[] = "  STA time_ptr_lo+{$slot}";
                $L[] = "  LDA #>Time_{$r}";
                $L[] = "  STA time_ptr_hi+{$slot}";
                $L[] = "  STA time_run_left+{$slot}";
                $L[] = "  LDX #{$slot}";
                $L[] = '  JSR rle_decode_scale';
                $L[] = "{$r}_nof:";
                $L[] = '  CMP #$FE';
                $L[] = "  BNE {$r}_play";
                $L[] = '  LDA #0';
                $L[] = "  STA sfx_active_ch{$i}   ; SFX terminou - devolve o canal pra musica";
                $L[] = "  LDA {$m['sil']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = '  RTS';
                $L[] = "{$r}_play:";
                $L[] = '  STA rle_pitch_scratch  ; guarda indice global de pitch NA MEMORIA - rle_decode_time usa Y internamente';
                $L[] = "  LDX #{$slot}";
                $L[] = '  JSR rle_decode_time';
                $L[] = "  STA sfx_timer_ch{$i}";
                $L[] = '  LDA rle_pitch_scratch';
                $L[] = "  BNE {$r}_tone";
                $L[] = "  LDA {$m['sil']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = '  RTS';
                $L[] = "{$r}_tone:";
                $L[] = "  LDA {$m['duty']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = '  LDY rle_pitch_scratch';
                $L[] = '  LDA PitchLoGlobal,Y';
                $L[] = "  STA {$m['lo']}";
                $L[] = '  LDA PitchHiGlobal,Y';
                $L[] = "  STA {$m['hi']}";
                $L[] = '  RTS';

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
