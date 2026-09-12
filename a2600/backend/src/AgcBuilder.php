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

        // coarse HPOS delay (~ cycles); empirical for kernel simplicity
        $d0 = max(1, min(48, (int)round($p0x / 5)));
        $d1 = max(1, min(48, (int)round($p1x / 5)));

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
        $asm[] = '    sta P0XDelay';
        $asm[] = '    lda #' . $d1;
        $asm[] = '    sta P1XDelay';
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
        // 0.6.6 — kernel A2 calibrado no Stella (estável, sem flicker):
        // COLUBK+COLUPF por linha + PF L→R + só GRP0 (GRP1 estoura ciclo)
        // sem HMOVE
        $asm[] = '    lda #' . ($isAsym ? 0 : $ctrlpf) . '            ; CTRLPF';
        $asm[] = '    sta CTRLPF';
        $asm[] = '    ldy #0';
        $asm[] = 'PlayLoop:';
        $asm[] = '    sta WSYNC';
        if ($isAsym) {
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
            $asm[] = '    lda PF0RData,y';
            $asm[] = '    sta PF0';
            $asm[] = '    lda PF1RData,y';
            $asm[] = '    sta PF1';
            $asm[] = '    lda PF2RData,y';
            $asm[] = '    sta PF2';
            $asm[] = '    lda GRP0Data,y';
            $asm[] = '    sta GRP0';
        } else {
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
            $asm[] = '    lda GRP0Data,y';
            $asm[] = '    sta GRP0';
            $asm[] = '    lda GRP1Data,y';
            $asm[] = '    sta GRP1';
        }
        $asm[] = '    iny';
        $asm[] = '    cpy #' . $playLines;
        $asm[] = '    bne PlayLoop';
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
        $asm[] = '    rts';
        $asm[] = '';

        $asm[] = '; Posiciona P0/P1 no início da scanline (método grosso por delay)';
        $asm[] = 'PositionPlayers:';
        $asm[] = '    sta WSYNC';
        $asm[] = '    ldx P0XDelay';
        $asm[] = 'P0Pos: dex';
        $asm[] = '    bne P0Pos';
        $asm[] = '    sta RESP0';
        $asm[] = '    sta WSYNC';
        $asm[] = '    ldx P1XDelay';
        $asm[] = 'P1Pos: dex';
        $asm[] = '    bne P1Pos';
        $asm[] = '    sta RESP1';
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
        $asm[] = 'Sprite0Data:';
        foreach ($gfx0 as $b) {
            $asm[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
        }
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
        $asm[] = 'P0XDelay  equ $88';
        $asm[] = 'P1XDelay  equ $89';
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
                'generator' => 'AgcBuilder/0.6.6',
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

        // rules: event boot + spawn_player overrides
        $rules = is_array($project['rules'] ?? null) ? $project['rules'] : [];
        foreach ($rules as $r) {
            if (!is_array($r)) {
                continue;
            }
            if (($r['event'] ?? '') !== 'boot') {
                continue;
            }
            foreach (($r['actions'] ?? []) as $a) {
                if (!is_array($a) || ($a['type'] ?? '') !== 'spawn_player') {
                    continue;
                }
                $spawnId = (string)($a['arg2'] ?? '');
                $spriteId = (string)($a['arg'] ?? '');
                if ($spawnId === '' || !isset($byId[$spawnId])) {
                    continue;
                }
                $o = $byId[$spawnId];
                if ($spriteId !== '') {
                    $o['spriteId'] = $spriteId;
                }
                $pl = (int)($o['player'] ?? 0);
                if ($pl !== 0 && $pl !== 1) {
                    $pl = 0;
                }
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
VSYNC   equ $00
VBLANK  equ $01
WSYNC   equ $02
NUSIZ0  equ $04
NUSIZ1  equ $05
COLUP0  equ $06
COLUP1  equ $07
COLUPF  equ $08
COLUBK  equ $09
CTRLPF  equ $0A
CTRLPF  equ $0A
PF0     equ $0D
PF1     equ $0E
PF2     equ $0F
RESP0   equ $10
RESP1   equ $11
GRP0    equ $1B
GRP1    equ $1C
HMOVE   equ $2A
HMCLR   equ $2B
CXCLR   equ $2C
INTIM   equ $0284
TIM64T  equ $0296
SWCHA   equ $0280
SWCHB   equ $0282
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
