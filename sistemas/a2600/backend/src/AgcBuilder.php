<?php
declare(strict_types=1);

/**
 * Gera ASM Atari 2600 (DASM) a partir do JSON do projeto AGC.
 *
 * v0.2: kernel + score bar + glifos + spawn P0/P1 (boot) + gráfico do sprite.
 */
final class AgcBuilder
{
    /** @param array<string,mixed> $project */
    public static function build(array $project): array
    {
        $name = self::safeLabel((string)($project['name'] ?? 'AGC_Game'));
        $tv = strtoupper((string)($project['tv'] ?? 'NTSC'));
        if ($tv !== 'PAL') {
            $tv = 'NTSC';
        }

        $romSize = (int)($project['romSize'] ?? 4096);
        if (!in_array($romSize, [2048, 4096, 8192, 16384, 32768], true)) {
            $romSize = 4096;
        }

        $org = $romSize === 2048 ? 0xF800 : 0xF000;

        $scoreBar = is_array($project['scoreBar'] ?? null) ? $project['scoreBar'] : [];
        $scoreEnabled = !empty($scoreBar['enabled']);
        $digits = max(1, min(6, (int)($scoreBar['digits'] ?? 6)));
        $showLogo = ($scoreBar['showLogo'] ?? true) !== false;
        $scoreVar = preg_replace('/[^a-zA-Z0-9_]/', '', (string)($scoreBar['variable'] ?? 'score')) ?: 'score';

        $scanlines = $tv === 'PAL' ? 242 : 192;
        $vblank = $tv === 'PAL' ? 48 : 40;
        $overscan = $tv === 'PAL' ? 36 : 30;
        $scoreLines = $scoreEnabled ? max(12, min(32, (int)($scoreBar['lines'] ?? 20))) : 0;
        $playLines = max(1, $scanlines - $scoreLines);

        $pfTables = self::extractPlayfield($project, $playLines);
        $ctrlpf = ($pfTables['mode'] === 'reflect') ? 1 : 0; // bit0 reflect; asymmetric → left half only

        // Resolve boot spawns
        $spawns = self::resolveBootSpawns($project);
        $ruleCompiled = self::compileRules($project);
        $sprites = is_array($project['sprites'] ?? null) ? $project['sprites'] : [];

        $p0 = $spawns[0] ?? null;
        $p1 = $spawns[1] ?? null;

        $spr0 = $p0 ? self::findSprite($sprites, (string)($p0['spriteId'] ?? '')) : null;
        $spr1 = $p1 ? self::findSprite($sprites, (string)($p1['spriteId'] ?? '')) : null;

        // defaults if no spawn but has sprite for player
        if (!$spr0) {
            $spr0 = self::findSpriteByPlayer($sprites, 0);
        }
        if (!$spr1) {
            $spr1 = self::findSpriteByPlayer($sprites, 1);
        }

        $p0x = $p0 ? max(0, min(160, (int)$p0['x'])) : 60;
        $p0y = $p0 ? max(0, min($playLines - 1, (int)$p0['y'])) : 40;
        $p1x = $p1 ? max(0, min(160, (int)$p1['x'])) : 100;
        $p1y = $p1 ? max(0, min($playLines - 1, (int)$p1['y'])) : 40;

        $h0 = $spr0 ? max(1, min(32, (int)($spr0['height'] ?? 8))) : 8;
        $h1 = $spr1 ? max(1, min(32, (int)($spr1['height'] ?? 8))) : 8;
        $col0 = $spr0 ? ((int)($spr0['color'] ?? 0x2a) & 0xfe) : 0x2a;
        $col1 = $spr1 ? ((int)($spr1['color'] ?? 0x6a) & 0xfe) : 0x6a;

        $gfx0 = self::spriteRows($spr0, $h0);
        $gfx1 = self::spriteRows($spr1, $h1);

        // GRP por scanline (kernel linear, <76 ciclos → sem flicker)
        $grp0Line = array_fill(0, $playLines, 0);
        $grp1Line = array_fill(0, $playLines, 0);
        for ($i = 0; $i < $h0; $i++) {
            $y = $p0y + $i;
            if ($y >= 0 && $y < $playLines) {
                $grp0Line[$y] = $gfx0[$i] & 0xff;
            }
        }
        for ($i = 0; $i < $h1; $i++) {
            $y = $p1y + $i;
            if ($y >= 0 && $y < $playLines) {
                $grp1Line[$y] = $gfx1[$i] & 0xff;
            }
        }

        // X em color clocks (0–159). PositionPlayers: RESP0 + HMP0 + HMOVE (1 clock de precisão).
        $d0 = max(0, min(160, (int)$p0x));
        $d1 = max(0, min(160, (int)$p1x));

        $asm = [];
        $asm[] = '; ============================================================';
        $asm[] = '; AGC generated — ' . $name;
        $asm[] = '; TV=' . $tv . ' ROM=' . $romSize . ' scoreBar=' . ($scoreEnabled ? 'on' : 'off');
        $asm[] = '; P0 spawn=' . ($p0 ? 'yes' : 'default') . ' P1 spawn=' . ($p1 ? 'yes' : 'default');
        $asm[] = '; Assembler: DASM (-f3 raw binary)';
        $asm[] = '; ============================================================';
        $asm[] = '    processor 6502';
        $asm[] = '';
        $asm[] = self::registerEquates();
        $asm[] = '';
        $asm[] = '    ORG $' . strtoupper(dechex($org));
        $asm[] = '';
        $asm[] = 'Start:';
        $asm[] = '    sei';
        $asm[] = '    cld';
        $asm[] = '    ldx #$FF';
        $asm[] = '    txs';
        $asm[] = '    lda #0';
        $asm[] = '    tax';
        $asm[] = 'ClearMem:';
        $asm[] = '    sta $00,x';
        $asm[] = '    inx';
        $asm[] = '    bne ClearMem';
        $asm[] = '';
        $asm[] = '    lda #0';
        $asm[] = '    sta Score0';
        $asm[] = '    sta Score1';
        $asm[] = '    sta Score2';
        $asm[] = '    sta PrevSWCHA';
        $asm[] = '    sta PrevINPT4';
        $asm[] = '    sta WalkTick';
        $asm[] = '';
        foreach ($ruleCompiled['inits'] as $line) {
            $asm[] = $line;
        }
        $asm[] = '    ; --- regras Boot ---';
        foreach ($ruleCompiled['boot'] as $line) {
            $asm[] = $line;
        }
        $asm[] = '';
        $asm[] = '    ; Boot spawn positions / heights';
        $asm[] = '    lda #' . $p0y;
        $asm[] = '    sta P0Y';
        $asm[] = '    lda #' . $h0;
        $asm[] = '    sta P0H';
        $asm[] = '    lda #' . $p1y;
        $asm[] = '    sta P1Y';
        $asm[] = '    lda #' . $h1;
        $asm[] = '    sta P1H';
        $asm[] = '    lda #' . $d0;
        $asm[] = '    sta P0X                 ; color clocks 0-160';
        $asm[] = '    lda #' . $d1;
        $asm[] = '    sta P1X';
        $asm[] = '    lda #1';
        $asm[] = '    sta P0En';
        $asm[] = '    sta P1En';
        $asm[] = '';
        $asm[] = 'MainLoop:';
        $asm[] = '    lda #2';
        $asm[] = '    sta VSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    lda #0';
        $asm[] = '    sta VSYNC';
        $asm[] = '';
        $asm[] = '    lda #' . $vblank;
        $asm[] = '    sta TIM64T';
        $asm[] = '    jsr GameLogic';
        $asm[] = '    jsr PositionPlayers';
        $asm[] = 'WaitVBlank:';
        $asm[] = '    lda INTIM';
        $asm[] = '    bne WaitVBlank';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta VBLANK';
        $asm[] = '';
        $asm[] = '    lda #$' . sprintf('%02X', $col0);
        $asm[] = '    sta COLUP0';
        $asm[] = '    lda #$' . sprintf('%02X', $col1);
        $asm[] = '    sta COLUP1';
        $asm[] = '    lda #0';
        $asm[] = '    sta GRP0';
        $asm[] = '    sta GRP1';
        $asm[] = '';
        $isAsym = ($pfTables['mode'] === 'asymmetric');
        // 0.7.0 — assimétrico com fila de trocas (segmentos no build):
        // linha heavy (2 cores mudam): cores + PF + GRP0
        // linha serviço (heavy+1): PF + GRP0 (anda "fila" no PHP = próximo segmento)
        // demais: PF + GRP0 + GRP1
        $asm[] = '    lda #' . ($isAsym ? 0 : $ctrlpf) . '            ; CTRLPF';
        $asm[] = '    sta CTRLPF';
        if ($isAsym) {
            $bk = $pfTables['colubk'];
            $pf = $pfTables['colupf'];
            $types = [];
            for ($y = 0; $y < $playLines; $y++) {
                if ($y === 0) {
                    $types[$y] = 'L'; // cores iniciais antes do loop
                    continue;
                }
                $bkCh = (($bk[$y] ?? 0) & 0xfe) !== (($bk[$y - 1] ?? 0) & 0xfe);
                $pfCh = (($pf[$y] ?? 0) & 0xfe) !== (($pf[$y - 1] ?? 0) & 0xfe);
                if ($bkCh && $pfCh) {
                    $types[$y] = 'H';
                } elseif ($types[$y - 1] === 'H') {
                    $types[$y] = 'S';
                } else {
                    $types[$y] = 'L';
                }
            }
            // cores iniciais (linha 0)
            $asm[] = '    lda #$' . sprintf('%02X', ($bk[0] ?? 0) & 0xfe);
            $asm[] = '    sta COLUBK';
            $asm[] = '    lda #$' . sprintf('%02X', ($pf[0] ?? 0) & 0xfe);
            $asm[] = '    sta COLUPF';
            $asm[] = '    ldy #0';
            $seg = 0;
            $i = 0;
            while ($i < $playLines) {
                $kind = $types[$i];
                $j = $i + 1;
                while ($j < $playLines && $types[$j] === $kind) {
                    $j++;
                }
                $label = 'ASeg' . $seg;
                $asm[] = $label . ':';
                $asm[] = '    sta WSYNC';
                if ($kind === 'H') {
                    $asm[] = '    lda COLUBKData,y';
                    $asm[] = '    sta COLUBK';
                    $asm[] = '    lda COLUPFData,y';
                    $asm[] = '    sta COLUPF';
                }
                $asm[] = '    lda PF0Data,y';
                $asm[] = '    sta PF0';
                $asm[] = '    lda PF1Data,y';
                $asm[] = '    sta PF1';
                $asm[] = '    lda PF2Data,y';
                $asm[] = '    sta PF2';
                $asm[] = '    lda PF0RData,y';
                $asm[] = '    sta PF0';
                $asm[] = '    lda PF1RData,y';
                $asm[] = '    sta PF1';
                $asm[] = '    lda PF2RData,y';
                $asm[] = '    sta PF2';
                // P0 dinâmico (P0Y) — movimento vertical no assimétrico
                $asm[] = '    lda #0';
                $asm[] = '    sta GRP0';
                $asm[] = '    tya';
                $asm[] = '    sec';
                $asm[] = '    sbc P0Y';
                $asm[] = '    bcc ASkipP0' . $seg;
                $asm[] = '    cmp P0H';
                $asm[] = '    bcs ASkipP0' . $seg;
                $asm[] = '    tax';
                $asm[] = '    lda Sprite0Data,x';
                $asm[] = '    sta GRP0';
                $asm[] = 'ASkipP0' . $seg . ':';
                if ($kind === 'L') {
                    // P1 só em linhas leves (orçamento de ciclos)
                    $asm[] = '    lda GRP1Data,y';
                    $asm[] = '    sta GRP1';
                } else {
                    $asm[] = '    lda #0';
                    $asm[] = '    sta GRP1';
                }
                $asm[] = '    iny';
                $asm[] = '    cpy #' . $j;
                $asm[] = '    bne ' . $label;
                $i = $j;
                $seg++;
            }
        } else {
            // reflect/repeat — 2 linhas + VDEL (Boxing-style, 2 players)
            // Par:  cores + PF + GRP0 (P0Y)
            // Impar: cores + PF + GRP1 (P1Y)
            // VDEL mantem cada sprite visivel na linha seguinte (~2 scanlines de res. Y)
            $asm[] = '    lda #1';
            $asm[] = '    sta VDELP0';
            $asm[] = '    sta VDELP1';
            $asm[] = '    ldy #0';
            $asm[] = 'PlayLoop:';
            // ----- linha PAR: P0 -----
            $asm[] = '    sta WSYNC';
            $asm[] = '    lda COLUBKData,y';
            $asm[] = '    sta COLUBK';
            $asm[] = '    lda COLUPFData,y';
            $asm[] = '    sta COLUPF';
            $asm[] = '    lda PF0Data,y';
            $asm[] = '    sta PF0';
            $asm[] = '    lda PF1Data,y';
            $asm[] = '    sta PF1';
            $asm[] = '    lda PF2Data,y';
            $asm[] = '    sta PF2';
            $asm[] = '    tya';
            $asm[] = '    sec';
            $asm[] = '    sbc P0Y';
            $asm[] = '    bcc P0c';
            $asm[] = '    cmp P0H';
            $asm[] = '    bcs P0c';
            $asm[] = '    tax';
            $asm[] = '    lda Sprite0Data,x';
            $asm[] = '    .byte $2C';
            $asm[] = 'P0c:';
            $asm[] = '    lda #0';
            $asm[] = '    sta GRP0';
            $asm[] = '    iny';
            $asm[] = '    cpy #' . $playLines;
            $asm[] = '    bcs PlayDone';
            // ----- linha IMPAR: P1 -----
            $asm[] = '    sta WSYNC';
            $asm[] = '    lda COLUBKData,y';
            $asm[] = '    sta COLUBK';
            $asm[] = '    lda COLUPFData,y';
            $asm[] = '    sta COLUPF';
            $asm[] = '    lda PF0Data,y';
            $asm[] = '    sta PF0';
            $asm[] = '    lda PF1Data,y';
            $asm[] = '    sta PF1';
            $asm[] = '    lda PF2Data,y';
            $asm[] = '    sta PF2';
            $asm[] = '    tya';
            $asm[] = '    sec';
            $asm[] = '    sbc P1Y';
            $asm[] = '    bcc P1c';
            $asm[] = '    cmp P1H';
            $asm[] = '    bcs P1c';
            $asm[] = '    tax';
            $asm[] = '    lda Sprite1Data,x';
            $asm[] = '    .byte $2C';
            $asm[] = 'P1c:';
            $asm[] = '    lda #0';
            $asm[] = '    sta GRP1';
            $asm[] = '    iny';
            $asm[] = '    cpy #' . $playLines;
            $asm[] = '    bcc PlayLoop';
            $asm[] = 'PlayDone:';
            $asm[] = '    lda #0';
            $asm[] = '    sta VDELP0';
            $asm[] = '    sta VDELP1';
            $asm[] = '    sta GRP0';
            $asm[] = '    sta GRP1';
        }
        $asm[] = '';
        $asm[] = '    lda #0';
        $asm[] = '    sta GRP0';
        $asm[] = '    sta GRP1';
        $asm[] = '';

        if ($scoreEnabled) {
            $asm[] = '    jsr DrawScoreBar';
        }

        $asm[] = '    lda #2';
        $asm[] = '    sta VBLANK';
        $asm[] = '    lda #' . $overscan;
        $asm[] = '    sta TIM64T';
        $asm[] = 'WaitOverscan:';
        $asm[] = '    lda INTIM';
        $asm[] = '    bne WaitOverscan';
        $asm[] = '    sta WSYNC';
        $asm[] = '    jmp MainLoop';
        $asm[] = '';
        $asm[] = 'GameLogic:';
        foreach ($ruleCompiled['frame'] as $line) {
            $asm[] = $line;
        }
        $asm[] = '    rts';
        $asm[] = '';

        $asm[] = '; Posiciona P0/P1 com precisão de 1 color clock (RESP + HMxx + HMOVE)';
        $asm[] = '; Rotina clássica: divide X por 15, resto vira HMP fine offset.';
        $asm[] = 'PositionPlayers:';
        $asm[] = '    lda P0X';
        $asm[] = '    ldx #0                  ; objeto 0 = P0';
        $asm[] = '    jsr SetHX';
        $asm[] = '    lda P1X';
        $asm[] = '    ldx #1                  ; objeto 1 = P1';
        $asm[] = '    jsr SetHX';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta HMOVE               ; aplica HMP0/HMP1';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta HMCLR               ; evita comb no playfield';
        $asm[] = '    rts';
        $asm[] = '';
        $asm[] = '; A = X (0-159), X = índice do objeto (0=P0,1=P1)';
        $asm[] = 'SetHX:';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sec';
        $asm[] = 'SetHXDiv:';
        $asm[] = '    sbc #15';
        $asm[] = '    bcs SetHXDiv';
        $asm[] = '    eor #7';
        $asm[] = '    asl';
        $asm[] = '    asl';
        $asm[] = '    asl';
        $asm[] = '    asl';
        $asm[] = '    sta HMP0,x              ; HMP0 ou HMP1';
        $asm[] = '    sta RESP0,x             ; RESP0 ou RESP1';
        $asm[] = '    rts';
        $asm[] = '';
        if ($scoreEnabled) {
            $asm[] = self::scoreBarRoutine($digits, $showLogo, $scoreLines);
        }

        $asm[] = self::digitGlyphs();
        if ($showLogo && $scoreEnabled) {
            $asm[] = self::logoData();
        }

        $asm[] = '; Playfield tables (por scanline)';
        $asm[] = 'PF0Data:';
        foreach ($pfTables['pf0'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF1Data:';
        foreach ($pfTables['pf1'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF2Data:';
        foreach ($pfTables['pf2'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF0RData:';
        foreach ($pfTables['pf0r'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF1RData:';
        foreach ($pfTables['pf1r'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF2RData:';
        foreach ($pfTables['pf2r'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'COLUPFData:';
        foreach ($pfTables['colupf'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xfe);
        }
        $asm[] = 'COLUBKData:';
        foreach ($pfTables['colubk'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xfe);
        }
        $asm[] = '';
        $asm[] = 'GRP0Data:';
        foreach ($grp0Line as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'GRP1Data:';
        foreach ($grp1Line as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = '';
        $asm[] = '; Sprite graphics (linhas top→bottom, ref)';
        $asm[] = '; Sprite graphics (linhas top→bottom)';
        $asm[] = '    align 256';
        $asm[] = 'Sprite0Data:';
        foreach ($gfx0 as $b) {
            $asm[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
        }
        $asm[] = '    align 256';
        $asm[] = 'Sprite1Data:';
        foreach ($gfx1 as $b) {
            $asm[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
        }
        $asm[] = '';

        $asm[] = '; --- RAM ---';
        $asm[] = 'Score0    equ $80';
        $asm[] = 'Score1    equ $81';
        $asm[] = 'Score2    equ $82';
        $asm[] = 'Temp      equ $83';
        $asm[] = 'P0Y       equ $84';
        $asm[] = 'P0H       equ $85';
        $asm[] = 'P1Y       equ $86';
        $asm[] = 'P1H       equ $87';
        $asm[] = 'P0X       equ $88';
        $asm[] = 'P1X       equ $89';
        $asm[] = 'P0En      equ $8A';
        $asm[] = 'P1En      equ $8B';
        $asm[] = 'ZPF0L     equ $8C';
        $asm[] = 'ZPF1L     equ $8D';
        $asm[] = 'ZPF2L     equ $8E';
        $asm[] = 'ZPF0R     equ $8F';
        $asm[] = 'ZPF1R     equ $90';
        $asm[] = 'ZPF2R     equ $91';
        $asm[] = 'ZCOLUBK   equ $92';
        $asm[] = 'ZCOLUPF   equ $93';
        $asm[] = 'ZGRP0     equ $94';
        $asm[] = 'ZGRP1     equ $95';
        $asm[] = 'PrevSWCHA equ $9C';
        $asm[] = 'PrevINPT4 equ $9D';
        $asm[] = 'TmpA      equ $9E';
        $asm[] = 'TmpB      equ $9F';
        $asm[] = 'WalkTick  equ $9B';
        foreach ($ruleCompiled['equates'] as $line) {
            $asm[] = $line;
        }
        $asm[] = '';
        $asm[] = '    ORG $FFFA';
        $asm[] = '    .word Start';
        $asm[] = '    .word Start';
        $asm[] = '    .word Start';
        $asm[] = '';

        $source = implode("\n", $asm) . "\n";

        return [
            'asm' => $source,
            'romSize' => $romSize,
            'tv' => $tv,
            'scoreEnabled' => $scoreEnabled,
            'digits' => $digits,
            'scoreVar' => $scoreVar,
            'spawns' => ['p0' => $p0, 'p1' => $p1],
            'meta' => [
                'generator' => 'AgcBuilder/0.9.6',
                'org' => sprintf('$%04X', $org),
            ],
        ];
    }

    /** @param array<string,mixed> $project @return array<int,array<string,mixed>|null> */
    private static function resolveBootSpawns(array $project): array
    {
        $out = [0 => null, 1 => null];
        $objects = is_array($project['gameObjects'] ?? null) ? $project['gameObjects'] : [];
        $byId = [];
        foreach ($objects as $o) {
            if (!is_array($o) || empty($o['id'])) {
                continue;
            }
            $byId[(string)$o['id']] = $o;
            if (($o['kind'] ?? 'spawn') !== 'spawn') {
                continue;
            }
            $pl = (int)($o['player'] ?? 0);
            if ($pl !== 0 && $pl !== 1) {
                $pl = 0;
            }
            // first spawn per player as fallback
            if ($out[$pl] === null) {
                $out[$pl] = $o;
            }
        }

        // rules: Boot + spawn_player (formato antigo actions OU steps)
        $rules = is_array($project['rules'] ?? null) ? $project['rules'] : [];
        foreach ($rules as $r) {
            if (!is_array($r)) {
                continue;
            }
            $isBoot = false;
            if (($r['event'] ?? '') === 'boot' || ($r['event'] ?? '') === 'ev_boot') {
                $isBoot = true;
            }
            $actions = [];
            if (!empty($r['steps']) && is_array($r['steps'])) {
                foreach ($r['steps'] as $st) {
                    if (!is_array($st)) continue;
                    if (($st['type'] ?? '') === 'if_event') {
                        $eid = (string)($st['eventId'] ?? '');
                        if ($eid === 'ev_boot' || $eid === 'boot') $isBoot = true;
                    }
                    if (($st['type'] ?? '') === 'action' && ($st['actionId'] ?? '') === 'spawn_player') {
                        $actions[] = ['type' => 'spawn_player', 'arg' => $st['arg'] ?? '', 'arg2' => $st['arg2'] ?? ''];
                    }
                    if (($st['type'] ?? '') === 'spawn_player') {
                        $actions[] = ['type' => 'spawn_player', 'arg' => $st['arg'] ?? '', 'arg2' => $st['arg2'] ?? ''];
                    }
                }
            }
            foreach (($r['actions'] ?? []) as $a) {
                if (is_array($a)) $actions[] = $a;
            }
            if (!$isBoot) continue;
            foreach ($actions as $a) {
                if (($a['type'] ?? '') !== 'spawn_player') continue;
                $spawnId = (string)($a['arg2'] ?? '');
                $spriteId = (string)($a['arg'] ?? '');
                if ($spawnId === '' || !isset($byId[$spawnId])) continue;
                $o = $byId[$spawnId];
                if ($spriteId !== '') $o['spriteId'] = $spriteId;
                $pl = (int)($o['player'] ?? 0);
                if ($pl !== 0 && $pl !== 1) $pl = 0;
                $out[$pl] = $o;
            }
        }
        return $out;
    }

    /** @param array<int,mixed> $sprites */
    private static function findSprite(array $sprites, string $id): ?array
    {
        if ($id === '') {
            return null;
        }
        foreach ($sprites as $s) {
            if (is_array($s) && (string)($s['id'] ?? '') === $id) {
                return $s;
            }
        }
        return null;
    }

    /** @param array<int,mixed> $sprites */
    private static function findSpriteByPlayer(array $sprites, int $player): ?array
    {
        foreach ($sprites as $s) {
            if (is_array($s) && ((int)($s['player'] ?? 0) === $player)) {
                return $s;
            }
        }
        return null;
    }

    /**
     * Converte sprite.data (base64 de bytes 0/1, 8 por linha) em bytes de GRP.
     * @return list<int>
     */
    private static function spriteRows(?array $spr, int $height): array
    {
        $rows = array_fill(0, $height, 0);
        if (!$spr || empty($spr['data']) || !is_string($spr['data'])) {
            // fallback: simples quadradinho
            for ($i = 0; $i < $height; $i++) {
                $rows[$i] = ($i === 0 || $i === $height - 1) ? 0xFF : 0x81;
            }
            return $rows;
        }
        $bin = base64_decode($spr['data'], true);
        if ($bin === false) {
            return $rows;
        }
        $len = strlen($bin);
        for ($y = 0; $y < $height; $y++) {
            $byte = 0;
            for ($x = 0; $x < 8; $x++) {
                $idx = $y * 8 + $x;
                $on = $idx < $len ? (ord($bin[$idx]) & 1) : 0;
                if ($on) {
                    $byte |= (0x80 >> $x);
                }
            }
            $rows[$y] = $byte;
        }
        return $rows;
    }

    private static function registerEquates(): string
    {
        return <<<'ASM'
; --- TIA (write) ---
VSYNC   equ $00
VBLANK  equ $01
WSYNC   equ $02
RSYNC   equ $03
NUSIZ0  equ $04
NUSIZ1  equ $05
COLUP0  equ $06
COLUP1  equ $07
COLUPF  equ $08
COLUBK  equ $09
CTRLPF  equ $0A
REFP0   equ $0B
REFP1   equ $0C
PF0     equ $0D
PF1     equ $0E
PF2     equ $0F
RESP0   equ $10
RESP1   equ $11
RESM0   equ $12
RESM1   equ $13
RESBL   equ $14
AUDC0   equ $15
AUDC1   equ $16
AUDF0   equ $17
AUDF1   equ $18
AUDV0   equ $19
AUDV1   equ $1A
GRP0    equ $1B
GRP1    equ $1C
ENAM0   equ $1D
ENAM1   equ $1E
ENABL   equ $1F
HMP0    equ $20
HMP1    equ $21
HMM0    equ $22
HMM1    equ $23
HMBL    equ $24
VDELP0  equ $25
VDELP1  equ $26
VDELBL  equ $27
HMOVE   equ $2A
HMCLR   equ $2B
CXCLR   equ $2C
; --- TIA (read) ---
CXM0P   equ $00
CXM1P   equ $01
CXP0FB  equ $02
CXP1FB  equ $03
CXM0FB  equ $04
CXM1FB  equ $05
CXBLPF  equ $06
CXPPMM  equ $07
INPT0   equ $08
INPT1   equ $09
INPT2   equ $0A
INPT3   equ $0B
INPT4   equ $0C
INPT5   equ $0D
; --- RIOT ---
SWCHA   equ $0280
SWACNT  equ $0281
SWCHB   equ $0282
SWBCNT  equ $0283
INTIM   equ $0284
TIMINT  equ $0285
TIM1T   equ $0294
TIM8T   equ $0295
TIM64T  equ $0296
T1024T  equ $0297
ASM;
    }

    private static function scoreBarRoutine(int $digits, bool $showLogo, int $scoreLines): string
    {
        $lines = max(12, $scoreLines);
        $out = [];
        $out[] = 'DrawScoreBar:';
        $out[] = '    ldx #' . $lines;
        $out[] = 'ScoreBarLoop:';
        $out[] = '    sta WSYNC';
        $out[] = '    lda #0';
        $out[] = '    sta COLUBK';
        $out[] = '    sta PF0';
        $out[] = '    sta PF1';
        $out[] = '    sta PF2';
        $out[] = '    cpx #' . ($lines - 1);
        $out[] = '    bne NoRainbow';
        $out[] = '    lda #$44';
        $out[] = '    sta COLUBK';
        $out[] = 'NoRainbow:';
        $out[] = '    cpx #' . (int)max(1, $lines - 2);
        $out[] = '    bne NoRainbow2';
        $out[] = '    lda #$28';
        $out[] = '    sta COLUBK';
        $out[] = 'NoRainbow2:';
        $out[] = '    lda #$0E';
        $out[] = '    sta COLUPF';
        if ($showLogo) {
            $out[] = '    cpx #' . (int)max(2, (int)($lines / 2));
            $out[] = '    bne NoLogo';
            $out[] = '    lda #%11110000';
            $out[] = '    sta PF1';
            $out[] = '    lda #%01101101';
            $out[] = '    sta PF2';
            $out[] = 'NoLogo:';
        }
        $out[] = '    dex';
        $out[] = '    bne ScoreBarLoop';
        $out[] = '    lda #0';
        $out[] = '    sta PF0';
        $out[] = '    sta PF1';
        $out[] = '    sta PF2';
        $out[] = '    sta COLUBK';
        $out[] = '    rts';
        $out[] = '';
        $out[] = '; digits cfg: ' . $digits;
        $out[] = '';
        return implode("\n", $out);
    }

    private static function digitGlyphs(): string
    {
        $digits = [
            [0x3c, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x3c],
            [0x18, 0x38, 0x18, 0x18, 0x18, 0x18, 0x18, 0x7e],
            [0x3c, 0x66, 0x06, 0x0c, 0x18, 0x30, 0x60, 0x7e],
            [0x3c, 0x66, 0x06, 0x1c, 0x06, 0x06, 0x66, 0x3c],
            [0x0c, 0x1c, 0x3c, 0x6c, 0x7e, 0x0c, 0x0c, 0x0c],
            [0x7e, 0x60, 0x60, 0x7c, 0x06, 0x06, 0x66, 0x3c],
            [0x3c, 0x66, 0x60, 0x7c, 0x66, 0x66, 0x66, 0x3c],
            [0x7e, 0x06, 0x0c, 0x18, 0x18, 0x30, 0x30, 0x30],
            [0x3c, 0x66, 0x66, 0x3c, 0x66, 0x66, 0x66, 0x3c],
            [0x3c, 0x66, 0x66, 0x66, 0x3e, 0x06, 0x66, 0x3c],
        ];
        $lines = [];
        $lines[] = 'DigitGfx:';
        foreach ($digits as $d => $rows) {
            $lines[] = 'Digit' . $d . ':';
            foreach ($rows as $b) {
                $lines[] = '    .byte %' . str_pad(decbin($b), 8, '0', STR_PAD_LEFT);
            }
        }
        $lines[] = '';
        return implode("\n", $lines);
    }

    private static function logoData(): string
    {
        return "LogoPF:\n    .byte %01111110\n    .byte %11000011\n    .byte %10111101\n    .byte %00000000\n\n";
    }


    /**
     * 20 pixels (0/1) → PF0, PF1, PF2 (layout TIA).
     * @param list<int> $pix length >= 20
     * @return array{0:int,1:int,2:int}
     */
    private static function encodePlayfieldLine(array $pix): array
    {
        $pf0 = 0;
        if (!empty($pix[0])) $pf0 |= 0x10;
        if (!empty($pix[1])) $pf0 |= 0x20;
        if (!empty($pix[2])) $pf0 |= 0x40;
        if (!empty($pix[3])) $pf0 |= 0x80;
        $pf1 = 0;
        for ($i = 0; $i < 8; $i++) {
            if (!empty($pix[4 + $i])) {
                $pf1 |= (0x80 >> $i);
            }
        }
        $pf2 = 0;
        for ($i = 0; $i < 8; $i++) {
            if (!empty($pix[12 + $i])) {
                $pf2 |= (0x01 << $i);
            }
        }
        return [$pf0 & 0xff, $pf1 & 0xff, $pf2 & 0xff];
    }

    /**
     * Extrai tabelas PF + cores da primeira playfield do projeto.
     * @param array<string,mixed> $project
     * @return array{pf0:list<int>,pf1:list<int>,pf2:list<int>,colupf:list<int>,colubk:list<int>,mode:string,height:int}
     */
    private static function extractPlayfield(array $project, int $playLines): array
    {
        $empty = [
            'pf0' => array_fill(0, $playLines, 0),
            'pf1' => array_fill(0, $playLines, 0),
            'pf2' => array_fill(0, $playLines, 0),
            'pf0r' => array_fill(0, $playLines, 0),
            'pf1r' => array_fill(0, $playLines, 0),
            'pf2r' => array_fill(0, $playLines, 0),
            'colupf' => array_fill(0, $playLines, 0x0a),
            'colubk' => array_fill(0, $playLines, 0x00),
            'mode' => 'reflect',
            'height' => $playLines,
        ];
        $pfs = is_array($project['playfields'] ?? null) ? $project['playfields'] : [];
        if ($pfs === []) {
            return $empty;
        }
        // Prefer screen of first spawn, else first playfield
        $wantScreen = null;
        foreach (is_array($project['gameObjects'] ?? null) ? $project['gameObjects'] : [] as $o) {
            if (is_array($o) && ($o['kind'] ?? 'spawn') === 'spawn' && !empty($o['screenId'])) {
                $wantScreen = (string)$o['screenId'];
                break;
            }
        }
        $pf = null;
        if ($wantScreen !== null) {
            foreach ($pfs as $row) {
                if (is_array($row) && (string)($row['screenId'] ?? '') === $wantScreen) {
                    $pf = $row;
                    break;
                }
            }
        }
        if ($pf === null) {
            $pf = is_array($pfs[0]) ? $pfs[0] : null;
        }
        if ($pf === null) {
            return $empty;
        }

        $mode = (string)($pf['mode'] ?? 'reflect');
        if (!in_array($mode, ['reflect', 'repeat', 'asymmetric'], true)) {
            $mode = !empty($pf['reflect']) ? 'reflect' : 'repeat';
        }
        $h = max(1, (int)($pf['height'] ?? $playLines));
        $w = 40;
        $pixels = array_fill(0, $w * $h, 0);
        if (!empty($pf['data']) && is_string($pf['data'])) {
            $bin = base64_decode($pf['data'], true);
            if ($bin !== false) {
                $n = min(strlen($bin), $w * $h);
                for ($i = 0; $i < $n; $i++) {
                    $pixels[$i] = ord($bin[$i]) & 1;
                }
            }
        }
        $colupf = array_fill(0, $h, ((int)($pf['colupf'] ?? 0x0a)) & 0xfe);
        $colubk = array_fill(0, $h, ((int)($pf['colubk'] ?? 0x00)) & 0xfe);
        if (!empty($pf['lineColupf']) && is_string($pf['lineColupf'])) {
            $bin = base64_decode($pf['lineColupf'], true);
            if ($bin !== false) {
                for ($i = 0; $i < min(strlen($bin), $h); $i++) {
                    $colupf[$i] = ord($bin[$i]) & 0xfe;
                }
            }
        }
        if (!empty($pf['lineColubk']) && is_string($pf['lineColubk'])) {
            $bin = base64_decode($pf['lineColubk'], true);
            if ($bin !== false) {
                for ($i = 0; $i < min(strlen($bin), $h); $i++) {
                    $colubk[$i] = ord($bin[$i]) & 0xfe;
                }
            }
        }

        $outPf0 = [];
        $outPf1 = [];
        $outPf2 = [];
        $outPf0r = [];
        $outPf1r = [];
        $outPf2r = [];
        $outCup = [];
        $outCub = [];
        for ($y = 0; $y < $playLines; $y++) {
            $srcY = $y < $h ? $y : ($h - 1);
            $lineL = [];
            $lineR = [];
            for ($x = 0; $x < 20; $x++) {
                $lineL[$x] = $pixels[$srcY * $w + $x] & 1;
                $lineR[$x] = $pixels[$srcY * $w + 20 + $x] & 1;
            }
            [$a, $b, $c] = self::encodePlayfieldLine($lineL);
            $outPf0[] = $a;
            $outPf1[] = $b;
            $outPf2[] = $c;
            [$ar, $br, $cr] = self::encodePlayfieldLine($lineR);
            $outPf0r[] = $ar;
            $outPf1r[] = $br;
            $outPf2r[] = $cr;
            $outCup[] = $colupf[$srcY] ?? 0x0a;
            $outCub[] = $colubk[$srcY] ?? 0x00;
        }
        return [
            'pf0' => $outPf0,
            'pf1' => $outPf1,
            'pf2' => $outPf2,
            'pf0r' => $outPf0r,
            'pf1r' => $outPf1r,
            'pf2r' => $outPf2r,
            'colupf' => $outCup,
            'colubk' => $outCub,
            'mode' => $mode,
            'height' => $h,
        ];
    }


    /**
     * Compila regras do projeto em ASM (Boot + entre kernels / GameLogic).
     * @param array<string,mixed> $project
     * @return array{boot:list<string>,frame:list<string>,equates:list<string>,inits:list<string>}
     */
    private static function compileRules(array $project): array
    {
        $boot = [];
        $frame = [];
        $equates = [];
        $inits = [];

        $vars = is_array($project['variables'] ?? null) ? $project['variables'] : [];
        $events = is_array($project['events'] ?? null) ? $project['events'] : [];
        $eventsById = [];
        foreach ($events as $ev) {
            if (is_array($ev) && !empty($ev['id'])) {
                $eventsById[(string)$ev['id']] = $ev;
            }
        }

        // Aloca variáveis do usuário a partir de $A0
        $addr = 0xA0;
        $varMap = []; // id|name -> ['addr'=>, 'type'=>, 'label'=>]
        foreach ($vars as $v) {
            if (!is_array($v)) continue;
            $id = (string)($v['id'] ?? '');
            $name = (string)($v['name'] ?? 'var');
            $type = (string)($v['type'] ?? 'byte');
            $label = self::varLabel($name, $id);
            $size = $type === 'word' ? 2 : 1;
            if ($type === 'bool') {
                // 1 byte por bool na v1 (simples)
                $size = 1;
            }
            if ($addr + $size > 0xFF) break;
            $varMap[$id] = ['addr' => $addr, 'type' => $type, 'label' => $label, 'name' => $name];
            if ($name !== '') $varMap['name:' . $name] = $varMap[$id];
            $equates[] = sprintf('%-10s equ $%02X', $label, $addr);
            $initVal = (int)($v['value'] ?? $v['init'] ?? 0) & 0xff;
            $inits[] = '    lda #' . ($initVal & 0xff);
            $inits[] = '    sta ' . $label;
            if ($size === 2) {
                $inits[] = '    lda #0';
                $inits[] = '    sta ' . $label . '+1';
            }
            $addr += $size;
        }


        // Timers de jogo (segundos): 60 frames = 1s NTSC
        $timers = [];
        foreach ($events as $ev) {
            if (!is_array($ev) || ($ev['category'] ?? '') !== 'timer') continue;
            $tid = (string)($ev['id'] ?? '');
            if ($tid === '') continue;
            $sec = max(1, min(255, (int)($ev['seconds'] ?? 1)));
            $lab = 'Tmr_' . substr(preg_replace('/[^A-Za-z0-9]/', '', $tid) ?: 'x', 0, 10);
            $fire = 'TFire_' . substr(preg_replace('/[^A-Za-z0-9]/', '', $tid) ?: 'x', 0, 8);
            $timers[] = ['id' => $tid, 'seconds' => $sec, 'remLabel' => $lab, 'fireLabel' => $fire];
            $equates[] = sprintf('%-10s equ $%02X', $lab, $addr);
            $addr++;
            if ($addr > 0xFE) break;
            $equates[] = sprintf('%-10s equ $%02X', $fire, $addr);
            $addr++;
            $inits[] = '    lda #' . $sec;
            $inits[] = '    sta ' . $lab;
            $inits[] = '    lda #0';
            $inits[] = '    sta ' . $fire;
        }
        // divisores de frame (1 segundo)
        $equates[] = sprintf('%-10s equ $%02X', 'FrameDiv', $addr);
        $addr++;
        $inits[] = '    lda #0';
        $inits[] = '    sta FrameDiv';
        $timerById = [];
        foreach ($timers as $tm) {
            $timerById[$tm['id']] = $tm;
        }

        $rules = is_array($project['rules'] ?? null) ? $project['rules'] : [];
        $ri = 0;
        foreach ($rules as $rule) {
            if (!is_array($rule)) continue;
            $ri++;
            $steps = [];
            if (!empty($rule['steps']) && is_array($rule['steps'])) {
                $steps = $rule['steps'];
            } else {
                // legado → steps
                if (!empty($rule['event'])) {
                    $eid = (string)$rule['event'];
                    if ($eid === 'boot') $eid = 'ev_boot';
                    if ($eid === 'vblank') $eid = 'ev_vblank';
                    $steps[] = ['type' => 'if_event', 'eventId' => $eid];
                }
                foreach ($rule['conditions'] ?? [] as $c) {
                    if (!is_array($c)) continue;
                    $steps[] = [
                        'type' => 'if_var',
                        'varName' => $c['left'] ?? '',
                        'op' => $c['op'] ?? '==',
                        'value' => (int)($c['right'] ?? 0),
                    ];
                }
                foreach ($rule['actions'] ?? [] as $a) {
                    if (!is_array($a)) continue;
                    $t = (string)($a['type'] ?? '');
                    if (in_array($t, ['set_var', 'add_var', 'sub_var'], true)) {
                        $steps[] = ['type' => $t, 'varName' => $a['arg'] ?? '', 'value' => (int)($a['arg2'] ?? 0)];
                    } else {
                        $steps[] = ['type' => 'action', 'actionId' => $t, 'arg' => $a['arg'] ?? '', 'arg2' => $a['arg2'] ?? ''];
                    }
                }
            }
            if (!$steps) continue;

            $isBoot = false;
            foreach ($steps as $st) {
                if (($st['type'] ?? '') !== 'if_event') continue;
                $eid = (string)($st['eventId'] ?? '');
                $ev = $eventsById[$eid] ?? null;
                if ($eid === 'ev_boot' || $eid === 'boot' || ($ev && ($ev['category'] ?? '') === 'system' && strtolower((string)($ev['name'] ?? '')) === 'boot')) {
                    $isBoot = true;
                }
            }

            $tag = 'R' . $ri;
            $body = self::compileRuleBody($steps, $varMap, $eventsById, $timerById, $tag, $isBoot);
            if ($isBoot) {
                $boot[] = '    ; rule ' . self::safeLabel((string)($rule['name'] ?? $tag));
                foreach ($body as $ln) $boot[] = $ln;
            } else {
                $frame[] = '    ; rule ' . self::safeLabel((string)($rule['name'] ?? $tag));
                foreach ($body as $ln) $frame[] = $ln;
            }
        }

        // Prefixo frame: input + relógio de segundos (60 frames)
        $framePrefix = [
            '    ; --- sample input ---',
            '    inc WalkTick',
            '    lda SWCHA',
            '    sta TmpA',
            '    lda INPT4',
            '    sta TmpB',
            '    ; --- timers (60 frames = 1s) ---',
            '    ldx #0',
            '    stx TmpB              ; reusa: flag “houve segundo” no carry path',
            '    inc FrameDiv',
            '    lda FrameDiv',
            '    cmp #60',
            '    bne NoSecTick',
            '    lda #0',
            '    sta FrameDiv',
        ];
        foreach ($timers as $i => $tm) {
            $framePrefix[] = '    ; timer ' . $tm['id'] . ' (' . $tm['seconds'] . 's)';
            $framePrefix[] = '    lda #0';
            $framePrefix[] = '    sta ' . $tm['fireLabel'];
            $framePrefix[] = '    dec ' . $tm['remLabel'];
            $framePrefix[] = '    bne TmrOk' . $i;
            $framePrefix[] = '    lda #' . $tm['seconds'];
            $framePrefix[] = '    sta ' . $tm['remLabel'];
            $framePrefix[] = '    lda #1';
            $framePrefix[] = '    sta ' . $tm['fireLabel'];
            $framePrefix[] = 'TmrOk' . $i . ':';
        }
        $framePrefix[] = 'NoSecTick:';
        // se não houve tick de segundo, zera flags de fogo (senão re-dispara todo frame)
        if ($timers) {
            $framePrefix[] = '    lda FrameDiv';
            $framePrefix[] = '    beq SecTickDone      ; FrameDiv==0 significa que acabamos de tickar';
            foreach ($timers as $i => $tm) {
                $framePrefix[] = '    lda #0';
                $framePrefix[] = '    sta ' . $tm['fireLabel'];
            }
            $framePrefix[] = 'SecTickDone:';
        }

        $frame = array_merge($framePrefix, $frame, [
            '    lda TmpA',
            '    sta PrevSWCHA',
            '    lda INPT4',
            '    sta PrevINPT4',
            '    sta CXCLR              ; limpa latches de colisão',
        ]);

        return [
            'boot' => $boot,
            'frame' => $frame,
            'equates' => $equates,
            'inits' => $inits,
        ];
    }

    /** @param list<array<string,mixed>> $steps @param array<string,array<string,mixed>> $varMap @param array<string,array<string,mixed>> $eventsById @return list<string> */
    private static function compileRuleBody(array $steps, array $varMap, array $eventsById, array $timerById, string $tag, bool $isBoot): array
    {
        $asm = [];
        $end = $tag . '_end';
        $condI = 0;
        foreach ($steps as $st) {
            if (!is_array($st)) continue;
            $type = (string)($st['type'] ?? '');
            $condI++;
            $fail = $tag . '_f' . $condI;

            if ($type === 'if_event') {
                $eid = (string)($st['eventId'] ?? '');
                $ev = $eventsById[$eid] ?? null;
                $cat = $ev['category'] ?? '';
                // Boot / vblank / overscan / system tick → sempre verdadeiro no slot certo
                if ($eid === 'ev_boot' || $eid === 'boot' || $eid === 'ev_vblank' || $eid === 'vblank'
                    || $eid === 'ev_overscan' || $eid === 'overscan' || $cat === 'system' || $cat === 'screen') {
                    // no-op condition (slot já separa boot vs frame)
                    continue;
                }
                if ($cat === 'timer' || isset($timerById[$eid])) {
                    $tm = $timerById[$eid] ?? null;
                    if ($tm) {
                        $asm[] = '    lda ' . $tm['fireLabel'];
                        $asm[] = '    beq ' . $fail; // só no frame em que o relógio zerou
                        $asm[] = '    jmp ' . $tag . '_c' . $condI;
                        $asm[] = $fail . ':';
                        $asm[] = '    jmp ' . $end;
                        $asm[] = $tag . '_c' . $condI . ':';
                    }
                    continue;
                }
                if ($cat === 'input' || isset($ev['button'])) {
                    $btn = (string)($ev['button'] ?? 'P1-FIRE');
                    $trig = (string)($ev['trigger'] ?? 'press');
                    $asm = array_merge($asm, self::emitInputCheck($btn, $trig, $fail));
                    $asm[] = '    jmp ' . $tag . '_c' . $condI;
                    $asm[] = $fail . ':';
                    $asm[] = '    jmp ' . $end;
                    $asm[] = $tag . '_c' . $condI . ':';
                    continue;
                }
                if ($cat === 'collision' || str_starts_with($eid, 'ev_col_')) {
                    $col = (string)($ev['collision'] ?? '');
                    if ($col === '' && str_starts_with($eid, 'ev_col_')) {
                        $col = substr($eid, 7); // m0p1, p0pf...
                    }
                    $asm = array_merge($asm, self::emitCollisionCheck($col, $fail));
                    $asm[] = '    jmp ' . $tag . '_c' . $condI;
                    $asm[] = $fail . ':';
                    $asm[] = '    jmp ' . $end;
                    $asm[] = $tag . '_c' . $condI . ':';
                    continue;
                }
                // timer/custom desconhecido: passa (não bloqueia)
                continue;
            }

            if ($type === 'if_var') {
                $ref = self::resolveVar($varMap, $st);
                if (!$ref) continue;
                $op = (string)($st['op'] ?? '==');
                $val = (int)($st['value'] ?? 0) & 0xff;
                $asm[] = '    lda ' . $ref['label'];
                $asm[] = '    cmp #' . $val;
                $asm = array_merge($asm, self::emitCmpBranch($op, $fail));
                $asm[] = '    jmp ' . $tag . '_c' . $condI;
                $asm[] = $fail . ':';
                $asm[] = '    jmp ' . $end;
                $asm[] = $tag . '_c' . $condI . ':';
                continue;
            }

            if ($type === 'if_hitbox') {
                $a = (string)($st['hitboxA'] ?? '');
                $b = (string)($st['hitboxB'] ?? '');
                $col = self::hitboxPairToCollision($a, $b);
                if ($col !== '') {
                    $asm = array_merge($asm, self::emitCollisionCheck($col, $fail));
                    $asm[] = '    jmp ' . $tag . '_c' . $condI;
                    $asm[] = $fail . ':';
                    $asm[] = '    jmp ' . $end;
                    $asm[] = $tag . '_c' . $condI . ':';
                }
                continue;
            }

            if ($type === 'if_screen') {
                // single-screen v1: sempre ok
                continue;
            }

            if ($type === 'set_var' || $type === 'add_var' || $type === 'sub_var') {
                $ref = self::resolveVar($varMap, $st);
                if (!$ref) continue;
                $val = (int)($st['value'] ?? 0) & 0xff;
                if ($type === 'set_var') {
                    $asm[] = '    lda #' . $val;
                    $asm[] = '    sta ' . $ref['label'];
                } elseif ($type === 'add_var') {
                    $asm[] = '    lda ' . $ref['label'];
                    $asm[] = '    clc';
                    $asm[] = '    adc #' . $val;
                    $asm[] = '    sta ' . $ref['label'];
                } else {
                    $asm[] = '    lda ' . $ref['label'];
                    $asm[] = '    sec';
                    $asm[] = '    sbc #' . $val;
                    $asm[] = '    sta ' . $ref['label'];
                }
                continue;
            }

            if ($type === 'action') {
                $aid = (string)($st['actionId'] ?? '');
                $arg = (string)($st['arg'] ?? '');
                $arg2 = (string)($st['arg2'] ?? '');
                $arg3 = $st['arg3'] ?? 1;
                if ($aid === 'set_var' || $aid === 'add_var' || $aid === 'sub_var') {
                    // treat arg as var name
                    $st2 = ['varName' => $arg, 'value' => (int)$arg2];
                    $ref = self::resolveVar($varMap, $st2);
                    if ($ref) {
                        $val = (int)$arg2 & 0xff;
                        if ($aid === 'set_var') {
                            $asm[] = '    lda #' . $val;
                            $asm[] = '    sta ' . $ref['label'];
                        } elseif ($aid === 'add_var') {
                            $asm[] = '    lda ' . $ref['label'];
                            $asm[] = '    clc';
                            $asm[] = '    adc #' . $val;
                            $asm[] = '    sta ' . $ref['label'];
                        } else {
                            $asm[] = '    lda ' . $ref['label'];
                            $asm[] = '    sec';
                            $asm[] = '    sbc #' . $val;
                            $asm[] = '    sta ' . $ref['label'];
                        }
                    }
                } elseif ($aid === 'play_sound') {
                    $ch = (int)$arg;
                    if ($ch === 1) {
                        $asm[] = '    lda #8';
                        $asm[] = '    sta AUDV1';
                        $asm[] = '    lda #4';
                        $asm[] = '    sta AUDC1';
                        $asm[] = '    lda #8';
                        $asm[] = '    sta AUDF1';
                    } else {
                        $asm[] = '    lda #8';
                        $asm[] = '    sta AUDV0';
                        $asm[] = '    lda #4';
                        $asm[] = '    sta AUDC0';
                        $asm[] = '    lda #8';
                        $asm[] = '    sta AUDF0';
                    }
                } elseif ($aid === 'stop_sound') {
                    $ch = (int)$arg;
                    $asm[] = '    lda #0';
                    $asm[] = $ch === 1 ? '    sta AUDV1' : '    sta AUDV0';
                } elseif ($aid === 'set_tia') {
                    $reg = preg_replace('/[^A-Za-z0-9_]/', '', $arg) ?: 'COLUP0';
                    $val = (int)$arg2 & 0xff;
                    $asm[] = '    lda #' . $val;
                    $asm[] = '    sta ' . $reg;
                } elseif ($aid === 'toggle_bool') {
                    $ref = self::resolveVar($varMap, ['varName' => $arg, 'varId' => $arg]);
                    if ($ref) {
                        $asm[] = '    lda ' . $ref['label'];
                        $asm[] = '    eor #1';
                        $asm[] = '    sta ' . $ref['label'];
                    }
                } elseif ($aid === 'move_player') {
                    // Movimento suave (estilo comercial): 1 color clock / 1 scanline por disparo
                    // Hold deve disparar todo frame (sem throttle no input de direção)
                    $pl = ((string)$arg === '1') ? 1 : 0;
                    $dir = strtolower(trim((string)$arg2));
                    $dist = max(1, min(8, (int)$arg3)); // dist extra só multiplica passos unitários
                    $xLab = $pl === 1 ? 'P1X' : 'P0X';
                    $yLab = $pl === 1 ? 'P1Y' : 'P0Y';
                    if (!in_array($dir, ['left', 'right', 'up', 'down'], true)) {
                        $asm[] = '    ; move_player: direção inválida — no-op';
                    } elseif ($dir === 'left') {
                        for ($n = 0; $n < $dist; $n++) {
                            $asm[] = '    lda ' . $xLab;
                            $asm[] = '    beq Mv' . $tag . 'L' . $n; // já no 0
                            $asm[] = '    sec';
                            $asm[] = '    sbc #1';
                            $asm[] = '    sta ' . $xLab;
                            $asm[] = 'Mv' . $tag . 'L' . $n . ':';
                        }
                    } elseif ($dir === 'right') {
                        for ($n = 0; $n < $dist; $n++) {
                            $asm[] = '    lda ' . $xLab;
                            $asm[] = '    cmp #159';
                            $asm[] = '    bcs Mv' . $tag . 'R' . $n;
                            $asm[] = '    clc';
                            $asm[] = '    adc #1';
                            $asm[] = '    sta ' . $xLab;
                            $asm[] = 'Mv' . $tag . 'R' . $n . ':';
                        }
                    } elseif ($dir === 'up') {
                        for ($n = 0; $n < $dist; $n++) {
                            $asm[] = '    lda ' . $yLab;
                            $asm[] = '    beq Mv' . $tag . 'U' . $n;
                            $asm[] = '    sec';
                            $asm[] = '    sbc #1';
                            $asm[] = '    sta ' . $yLab;
                            $asm[] = 'Mv' . $tag . 'U' . $n . ':';
                        }
                    } elseif ($dir === 'down') {
                        for ($n = 0; $n < $dist; $n++) {
                            $asm[] = '    lda ' . $yLab;
                            $asm[] = '    clc';
                            $asm[] = '    adc #1';
                            $asm[] = '    sta ' . $yLab;
                            $asm[] = 'Mv' . $tag . 'D' . $n . ':';
                        }
                    }
                } elseif ($aid === 'asm' || $aid === 'custom') {
                    if ($arg !== '') {
                        $asm[] = '    ; custom: ' . str_replace(["\n", "\r"], ' ', $arg);
                    }
                }
                // goto_screen: stub v1
                continue;
            }
        }
        $asm[] = $end . ':';
        return $asm;
    }

    /** @param array<string,array<string,mixed>> $varMap @param array<string,mixed> $st */
    private static function resolveVar(array $varMap, array $st): ?array
    {
        $id = (string)($st['varId'] ?? '');
        $name = (string)($st['varName'] ?? '');
        if ($id !== '' && isset($varMap[$id])) return $varMap[$id];
        if ($name !== '' && isset($varMap['name:' . $name])) return $varMap['name:' . $name];
        if ($id !== '' && isset($varMap['name:' . $id])) return $varMap['name:' . $id];
        return null;
    }

    private static function varLabel(string $name, string $id): string
    {
        $s = preg_replace('/[^A-Za-z0-9_]/', '', $name) ?: '';
        if ($s === '' || preg_match('/^[0-9]/', $s)) {
            $s = 'V' . substr(preg_replace('/[^A-Za-z0-9]/', '', $id) ?: 'x', 0, 8);
        }
        return 'U_' . $s;
    }

    /** @return list<string> */
    private static function emitCmpBranch(string $op, string $failLabel): array
    {
        // Após CMP: N e Z setados. Branch para fail se condição NÃO satisfeita.
        return match ($op) {
            '==' => ['    bne ' . $failLabel],
            '!=' => ['    beq ' . $failLabel],
            '>'  => ['    bcc ' . $failLabel, '    beq ' . $failLabel], // A>M unsigned: C=1 e Z=0
            '>=' => ['    bcc ' . $failLabel],
            '<'  => ['    bcs ' . $failLabel],
            '<=' => ['    beq ' . $failLabel . '_ok', '    bcs ' . $failLabel, $failLabel . '_ok:'],
            default => ['    bne ' . $failLabel],
        };
    }

    /** @return list<string> */
    private static function emitInputCheck(string $button, string $trigger, string $fail): array
    {
        // SWCHA: 0 = pressed. INPT4/5 bit7: 0 = pressed.
        // P1-* no editor = joystick do Player 1 = hardware P0 (bits altos).
        // P2-* = hardware P1 (bits baixos).
        $asm = [];
        $btn = strtoupper(str_replace([' ', '_'], ['-', '-'], $button));
        $trigger = strtolower($trigger);
        $p2 = str_starts_with($btn, 'P2');

        if (str_contains($btn, 'FIRE') || str_contains($btn, 'BUTTON')) {
            $reg = $p2 ? 'INPT5' : 'INPT4';
            $asm[] = '    lda ' . $reg;
            $asm[] = '    and #$80';
            if ($trigger === 'hold') {
                $asm[] = '    bne ' . $fail;
                $asm[] = '    lda WalkTick';
                $asm[] = '    and #7';
                $asm[] = '    bne ' . $fail;
            } else {
                $asm[] = '    bne ' . $fail;
                $asm[] = '    lda PrevINPT4';
                $asm[] = '    and #$80';
                $asm[] = '    beq ' . $fail;
            }
            return $asm;
        }

        // Match direção (sufixo). P1-* = stick P0 do console (bits 4-7).
        $bit = null;
        $bitBoth = null;
        if (preg_match('/RIGHT$/', $btn)) {
            $bit = $p2 ? 0x08 : 0x80;
            $bitBoth = 0x88;
        } elseif (preg_match('/LEFT$/', $btn)) {
            $bit = $p2 ? 0x04 : 0x40;
            $bitBoth = 0x44;
        } elseif (preg_match('/DOWN$/', $btn)) {
            $bit = $p2 ? 0x02 : 0x20;
            $bitBoth = 0x22;
        } elseif (preg_match('/(^|-)UP$/', $btn)) {
            $bit = $p2 ? 0x01 : 0x10;
            $bitBoth = 0x11;
        } elseif (str_contains($btn, 'IDLE')) {
            $mask = $p2 ? 0x0F : 0xF0;
            $asm[] = '    lda SWCHA';
            $asm[] = '    and #' . sprintf('$%02X', $mask);
            $asm[] = '    cmp #' . sprintf('$%02X', $mask);
            $asm[] = '    bne ' . $fail;
            return $asm;
        }

        if ($bit === null) {
            $asm[] = '    ; input desconhecido: ' . $btn;
            $asm[] = '    jmp ' . $fail;
            return $asm;
        }

        // Ativo-baixo: se TODOS os bits da mascara estao 1, direcao nao pressionada.
        // bitBoth testa os dois sticks (P0+P1) na mesma direcao — mais robusto no Stella.
        $mask = $bitBoth ?? $bit;
        $asm[] = '    lda SWCHA';
        $asm[] = '    and #' . sprintf('$%02X', $mask);
        if ($trigger === 'hold') {
            $asm[] = '    cmp #' . sprintf('$%02X', $mask);
            $asm[] = '    beq ' . $fail . '              ; nenhum stick nessa direcao';
        } else {
            $asm[] = '    cmp #' . sprintf('$%02X', $mask);
            $asm[] = '    beq ' . $fail . '              ; nao pressionado agora';
            $asm[] = '    lda PrevSWCHA';
            $asm[] = '    and #' . sprintf('$%02X', $mask);
            $asm[] = '    cmp #' . sprintf('$%02X', $mask);
            $asm[] = '    bne ' . $fail . '              ; ja estava pressionado';
        }
        return $asm;
    }

    /** @return list<string> */
    private static function emitCollisionCheck(string $col, string $fail): array
    {
        $col = strtolower(str_replace(['–', '—', ' '], ['', '', ''], $col));
        $col = str_replace('-', '', $col);
        // Map to TIA registers (bit7 typically indicates collision)
        $map = [
            'm0p1' => ['CXM0P', 0x80], // M0-P1 is bit7 of CXM0P; M0-P0 is bit6
            'm1p0' => ['CXM1P', 0x40],
            'p0pf' => ['CXP0FB', 0x80],
            'p1pf' => ['CXP1FB', 0x80],
            'p0p1' => ['CXPPMM', 0x80],
            'blpf' => ['CXBLPF', 0x80],
            'blp0' => ['CXP0FB', 0x40],
            'blp1' => ['CXP1FB', 0x40],
            'm0p0' => ['CXM0P', 0x40],
            'm1p1' => ['CXM1P', 0x80],
        ];
        if (!isset($map[$col])) {
            // try hitbox style tia:P0 vs tia:PF
            return ['    ; collision desconhecida: ' . $col, '    jmp ' . $fail];
        }
        [$reg, $mask] = $map[$col];
        return [
            '    lda ' . $reg,
            '    and #' . sprintf('$%02X', $mask),
            '    beq ' . $fail,
        ];
    }

    private static function hitboxPairToCollision(string $a, string $b): string
    {
        $norm = function (string $x): string {
            $x = strtoupper($x);
            if (str_contains($x, 'P0')) return 'P0';
            if (str_contains($x, 'P1')) return 'P1';
            if (str_contains($x, 'M0')) return 'M0';
            if (str_contains($x, 'M1')) return 'M1';
            if (str_contains($x, 'BL') || str_contains($x, 'BALL')) return 'BL';
            if (str_contains($x, 'PF') || str_contains($x, 'PLAYFIELD')) return 'PF';
            return '';
        };
        $A = $norm($a);
        $B = $norm($b);
        $pair = [$A, $B];
        sort($pair);
        $key = implode('', $pair);
        $map = [
            'M0P1' => 'm0p1',
            'M1P0' => 'm1p0',
            'P0PF' => 'p0pf',
            'P1PF' => 'p1pf',
            'P0P1' => 'p0p1',
            'BLPF' => 'blpf',
            'BLP0' => 'blp0',
            'BLP1' => 'blp1',
            'M0P0' => 'm0p0',
            'M1P1' => 'm1p1',
        ];
        // try both orders
        foreach ([$A . $B, $B . $A, $key] as $k) {
            if (isset($map[$k])) return $map[$k];
        }
        // manual
        if (($A === 'M0' && $B === 'P1') || ($A === 'P1' && $B === 'M0')) return 'm0p1';
        if (($A === 'P0' && $B === 'PF') || ($A === 'PF' && $B === 'P0')) return 'p0pf';
        if (($A === 'P1' && $B === 'PF') || ($A === 'PF' && $B === 'P1')) return 'p1pf';
        if ($A === 'P0' && $B === 'P1') return 'p0p1';
        if (($A === 'BL' && $B === 'PF') || ($A === 'PF' && $B === 'BL')) return 'blpf';
        return '';
    }

    private static function safeLabel(string $s): string
    {
        $s = preg_replace('/[^a-zA-Z0-9_]+/', '_', $s) ?? 'Game';
        $s = trim($s, '_');
        if ($s === '') {
            $s = 'Game';
        }
        return substr($s, 0, 32);
    }
}
