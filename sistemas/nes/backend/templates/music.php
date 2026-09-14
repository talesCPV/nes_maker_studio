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

        $encodeChannel = static function (array $ch, int $baseFrames, bool $loop) use ($rhythm, $noteNames, $freq): array {
            $notes = is_array($ch['notes'] ?? null) ? $ch['notes'] : [];
            $pitchList = ['REST']; $pitchIndex = ['REST' => 0]; $scale = []; $time = [];
            $n = min(count($notes), 2048);
            for ($j = 0; $j < $n; $j++) {
                $note = (string)($notes[$j]['note'] ?? 'REST');
                $fig = (string)($notes[$j]['figure'] ?? 'quarter');
                if (!array_key_exists($note, $pitchIndex)) { $pitchIndex[$note] = count($pitchList); $pitchList[] = $note; }
                $scale[] = $pitchIndex[$note];
                $mul = $rhythm[$fig] ?? 1;
                $time[] = max(1, min(255, (int)round($baseFrames * $mul)));
            }
            if (!$scale) { $scale = [0]; $time = [30]; }
            $scale[] = $loop ? 0xFF : 0xFE;
            $lo = []; $hi = [];
            foreach ($pitchList as $name) {
                $l = 0; $h = 0;
                if (preg_match('/^([A-G]#?)(\d+)$/', $name, $m)) {
                    $ni = array_search($m[1], $noteNames, true);
                    if ($ni !== false) {
                        $oct = (int)$m[2]; $midi = ($oct + 1) * 12 + $ni;
                        $f = 440 * pow(2, ($midi - 69) / 12);
                        $period = (int)round(($freq / (16 * $f)) - 1);
                        $period = max(0, min(2047, $period));
                        $l = $period & 255; $h = ($period >> 8) & 7;
                    }
                }
                $lo[] = $l; $hi[] = $h;
            }
            return ['lo' => $lo, 'hi' => $hi, 'scale' => $scale, 'time' => $time];
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
                $m = $chMeta[$u['type']]; $i = $m['idx']; $p = "{$lbl}_ch{$i}";
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
                $L[] = "  LDY ch{$i}_pos";
                $L[] = "  LDA Scale_{$lbl}_ch{$i},Y";
                $L[] = '  CMP #$FF';
                $L[] = "  BNE {$p}_nof";
                $L[] = '  LDA #0';
                $L[] = "  STA ch{$i}_pos";
                $L[] = '  LDY #0';
                $L[] = "  LDA Scale_{$lbl}_ch{$i},Y";
                $L[] = "{$p}_nof:";
                $L[] = '  CMP #$FE';
                $L[] = "  BNE {$p}_play";
                $L[] = "  LDA sfx_active_ch{$i}";
                $L[] = "  BNE {$p}_end   ; canal ocupado pelo SFX - so nao escreve, tempo/posicao ja avancaram normal";
                $L[] = "  LDA {$m['sil']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = "  JMP {$p}_end";
                $L[] = "{$p}_play:";
                $L[] = '  TAX';
                $L[] = "  LDA Time_{$lbl}_ch{$i},Y";
                $L[] = "  STA ch{$i}_timer";
                $L[] = '  INY';
                $L[] = "  STY ch{$i}_pos";
                $L[] = '  CPX #0';
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
                $L[] = "  LDA PitchLo_{$lbl}_ch{$i},X";
                $L[] = "  STA {$m['lo']}";
                $L[] = "  LDA PitchHi_{$lbl}_ch{$i},X";
                $L[] = "  STA {$m['hi']}";
                $L[] = "{$p}_end:";
            }
            $L[] = '  RTS';

            foreach ($used as $u) {
                $m = $chMeta[$u['type']]; $i = $m['idx'];
                $enc = $encodeChannel($u['ch'], $baseFrames, $loop);
                $D[] = "PitchLo_{$lbl}_ch{$i}:"; $D[] = $fmt($enc['lo']);
                $D[] = "PitchHi_{$lbl}_ch{$i}:"; $D[] = $fmt($enc['hi']);
                $D[] = "Scale_{$lbl}_ch{$i}:";    $D[] = $fmt($enc['scale']);
                $D[] = "Time_{$lbl}_ch{$i}:";     $D[] = $fmt($enc['time']);
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
                $r = "sfx_r_{$lbl}_ch{$i}";
                $L[] = "{$r}:";
                $L[] = "  LDA sfx_timer_ch{$i}";
                $L[] = "  BEQ {$r}_next";
                $L[] = "  DEC sfx_timer_ch{$i}";
                $L[] = '  RTS';
                $L[] = "{$r}_next:";
                $L[] = "  LDY sfx_pos_ch{$i}";
                $L[] = "  LDA Scale_{$r},Y";
                $L[] = '  CMP #$FF';
                $L[] = "  BNE {$r}_nof";
                $L[] = '  LDA #0';
                $L[] = "  STA sfx_pos_ch{$i}";
                $L[] = '  LDY #0';
                $L[] = "  LDA Scale_{$r},Y";
                $L[] = "{$r}_nof:";
                $L[] = '  CMP #$FE';
                $L[] = "  BNE {$r}_play";
                $L[] = '  LDA #0';
                $L[] = "  STA sfx_active_ch{$i}   ; SFX terminou - devolve o canal pra musica";
                $L[] = "  LDA {$m['sil']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = '  RTS';
                $L[] = "{$r}_play:";
                $L[] = '  TAX';
                $L[] = "  LDA Time_{$r},Y";
                $L[] = "  STA sfx_timer_ch{$i}";
                $L[] = '  INY';
                $L[] = "  STY sfx_pos_ch{$i}";
                $L[] = '  CPX #0';
                $L[] = "  BNE {$r}_tone";
                $L[] = "  LDA {$m['sil']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = '  RTS';
                $L[] = "{$r}_tone:";
                $L[] = "  LDA {$m['duty']}";
                $L[] = "  STA {$m['vol']}";
                $L[] = "  LDA PitchLo_{$r},X";
                $L[] = "  STA {$m['lo']}";
                $L[] = "  LDA PitchHi_{$r},X";
                $L[] = "  STA {$m['hi']}";
                $L[] = '  RTS';

                $enc = $encodeChannel($u['ch'], $baseFrames, $loop);
                $D[] = "PitchLo_{$r}:"; $D[] = $fmt($enc['lo']);
                $D[] = "PitchHi_{$r}:"; $D[] = $fmt($enc['hi']);
                $D[] = "Scale_{$r}:";    $D[] = $fmt($enc['scale']);
                $D[] = "Time_{$r}:";     $D[] = $fmt($enc['time']);
                $D[] = '';
            }
        }

        $out = implode("\n", $L);
        $out .= "\n; ---- NGC MUSIC DATA ----\n" . implode("\n", $D);
        return $out;
    },
];
