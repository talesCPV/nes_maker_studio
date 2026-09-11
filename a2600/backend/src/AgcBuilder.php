<?php
declare(strict_types=1);

/**
 * Gera ASM Atari 2600 (DASM) a partir do JSON do projeto AGC.
 * v1: kernel mínimo + barra de placar + glifos 0-9 + variável score em RAM.
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

        // 4K por enquanto (mesmo se o projeto pedir outro tamanho)
        $org = 0xF000;
        if ($romSize === 2048) {
            $org = 0xF800;
        }

        $scoreBar = is_array($project['scoreBar'] ?? null) ? $project['scoreBar'] : [];
        $scoreEnabled = !empty($scoreBar['enabled']);
        $digits = (int)($scoreBar['digits'] ?? 6);
        if ($digits < 1) {
            $digits = 1;
        }
        if ($digits > 6) {
            $digits = 6;
        }
        $showLogo = ($scoreBar['showLogo'] ?? true) !== false;
        $scoreVar = preg_replace('/[^a-zA-Z0-9_]/', '', (string)($scoreBar['variable'] ?? 'score')) ?: 'score';

        $scanlines = $tv === 'PAL' ? 242 : 192; // kernel visível aproximado
        $vblank = $tv === 'PAL' ? 45 : 37;
        $overscan = $tv === 'PAL' ? 36 : 30;

        $scoreLines = $scoreEnabled ? max(12, min(32, (int)($scoreBar['lines'] ?? 20))) : 0;
        $playLines = max(1, $scanlines - $scoreLines);

        $asm = [];
        $asm[] = '; ============================================================';
        $asm[] = '; AGC generated — ' . $name;
        $asm[] = '; TV=' . $tv . '  ROM=' . $romSize . '  scoreBar=' . ($scoreEnabled ? 'on' : 'off');
        $asm[] = '; Assembler: DASM  (-f3 raw binary)';
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
        $asm[] = '    ; score inicial (BCD-ish / decimal packed em 3 bytes max)';
        $asm[] = '    lda #0';
        $asm[] = '    sta Score0';
        $asm[] = '    sta Score1';
        $asm[] = '    sta Score2';
        $asm[] = '';
        $asm[] = 'MainLoop:';
        $asm[] = '    ; --- Vertical Sync ---';
        $asm[] = '    lda #2';
        $asm[] = '    sta VSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    lda #0';
        $asm[] = '    sta VSYNC';
        $asm[] = '';
        $asm[] = '    ; --- VBlank (' . $vblank . ' lines) ---';
        $asm[] = '    lda #' . $vblank;
        $asm[] = '    sta TIM64T';
        $asm[] = '    jsr GameLogic';
        $asm[] = 'WaitVBlank:';
        $asm[] = '    lda INTIM';
        $asm[] = '    bne WaitVBlank';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta VBLANK          ; enable beam (0)';
        $asm[] = '';
        $asm[] = '    ; --- Visible playfield ---';
        $asm[] = '    ldx #' . $playLines;
        $asm[] = 'PlayLoop:';
        $asm[] = '    sta WSYNC';
        $asm[] = '    lda #$00';
        $asm[] = '    sta COLUBK';
        $asm[] = '    lda #$9A            ; azul suave (área de jogo vazia v1)';
        $asm[] = '    sta COLUPF';
        $asm[] = '    lda #0';
        $asm[] = '    sta PF0';
        $asm[] = '    sta PF1';
        $asm[] = '    sta PF2';
        $asm[] = '    dex';
        $asm[] = '    bne PlayLoop';
        $asm[] = '';

        if ($scoreEnabled) {
            $asm[] = '    ; --- Score bar (fundo preto + dígitos) ---';
            $asm[] = '    jsr DrawScoreBar';
        }

        $asm[] = '';
        $asm[] = '    ; --- Overscan ---';
        $asm[] = '    lda #2';
        $asm[] = '    sta VBLANK          ; disable beam';
        $asm[] = '    lda #' . $overscan;
        $asm[] = '    sta TIM64T';
        $asm[] = 'WaitOverscan:';
        $asm[] = '    lda INTIM';
        $asm[] = '    bne WaitOverscan';
        $asm[] = '    sta WSYNC';
        $asm[] = '    jmp MainLoop';
        $asm[] = '';
        $asm[] = '; ------------------------------------------------------------';
        $asm[] = '; Game logic (VBlank) — v1: só placeholder';
        $asm[] = '; ------------------------------------------------------------';
        $asm[] = 'GameLogic:';
        $asm[] = '    rts';
        $asm[] = '';

        if ($scoreEnabled) {
            $asm[] = self::scoreBarRoutine($digits, $showLogo, $scoreLines);
        }

        $asm[] = self::digitGlyphs();
        if ($showLogo && $scoreEnabled) {
            $asm[] = self::logoData();
        }

        $asm[] = '';
        $asm[] = '; --- RAM ($80+) via equ (RIOT) ---';
        $asm[] = 'Score0  equ $80';
        $asm[] = 'Score1  equ $81';
        $asm[] = 'Score2  equ $82';
        $asm[] = 'Temp    equ $83';
        $asm[] = '';
        $asm[] = '; --- Vectors ---';
        $asm[] = '    ORG $FFFA';
        $asm[] = '    .word Start          ; NMI (unused)';
        $asm[] = '    .word Start          ; RESET';
        $asm[] = '    .word Start          ; IRQ';
        $asm[] = '';

        $source = implode("\n", $asm) . "\n";

        return [
            'asm' => $source,
            'romSize' => $romSize,
            'tv' => $tv,
            'scoreEnabled' => $scoreEnabled,
            'digits' => $digits,
            'scoreVar' => $scoreVar,
            'meta' => [
                'generator' => 'AgcBuilder/0.1',
                'org' => sprintf('$%04X', $org),
            ],
        ];
    }

    private static function registerEquates(): string
    {
        return <<<'ASM'
; TIA / RIOT (espelhos usuais)
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
RESMP0  equ $28
RESMP1  equ $29
HMOVE   equ $2A
HMCLR   equ $2B
CXCLR   equ $2C

; RIOT
INTIM   equ $0284
TIM1T   equ $0294
TIM8T   equ $0295
TIM64T  equ $0296
T1024T  equ $0297
SWCHA   equ $0280
SWCHB   equ $0282
INPT4   equ $003C
INPT5   equ $003D
ASM;
    }

    private static function scoreBarRoutine(int $digits, bool $showLogo, int $scoreLines): string
    {
        // v1: faixa preta + filete rainbow + dígitos simples via PF (placeholder visual)
        // Kernel de 6 dígitos completo (GRP0/GRP1) entra na próxima iteração.
        $lines = max(12, $scoreLines);
        $out = [];
        $out[] = '; ------------------------------------------------------------';
        $out[] = '; DrawScoreBar — faixa inferior (v1 simplificado)';
        $out[] = '; ------------------------------------------------------------';
        $out[] = 'DrawScoreBar:';
        $out[] = '    ldx #' . $lines;
        $out[] = 'ScoreBarLoop:';
        $out[] = '    sta WSYNC';
        $out[] = '    lda #0';
        $out[] = '    sta COLUBK';
        $out[] = '    sta PF0';
        $out[] = '    sta PF1';
        $out[] = '    sta PF2';
        $out[] = '    ; filete colorido nas primeiras linhas';
        $out[] = '    cpx #' . ($lines - 1);
        $out[] = '    bne NoRainbow';
        $out[] = '    lda #$44';
        $out[] = '    sta COLUBK';
        $out[] = 'NoRainbow';
        $out[] = '    cpx #' . (int)max(1, $lines - 2);
        $out[] = '    bne NoRainbow2';
        $out[] = '    lda #$28';
        $out[] = '    sta COLUBK';
        $out[] = 'NoRainbow2';
        $out[] = '    lda #$0E            ; branco PF';
        $out[] = '    sta COLUPF';
        if ($showLogo) {
            $out[] = '    ; logo: PF pattern fixo (marca) em algumas linhas centrais';
            $out[] = '    cpx #' . (int)max(2, (int)($lines / 2));
            $out[] = '    bne NoLogo';
            $out[] = '    lda #%11110000';
            $out[] = '    sta PF1';
            $out[] = '    lda #%01101101';
            $out[] = '    sta PF2';
            $out[] = 'NoLogo';
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
        $out[] = '; Digits table is emitted for o próximo kernel de placar (GRP).';
        $out[] = '; digits configurados no editor: ' . $digits;
        $out[] = '';
        return implode("\n", $out);
    }

    private static function digitGlyphs(): string
    {
        // Mesmos glifos 8x8 do editor (SCORE_DIGITS)
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
        $lines[] = '; ------------------------------------------------------------';
        $lines[] = '; Digit glyphs 8x8 (ROM) — compartilhados com o editor';
        $lines[] = '; ------------------------------------------------------------';
        $lines[] = 'DigitGfx:';
        foreach ($digits as $d => $rows) {
            $lines[] = 'Digit' . $d . ':';
            foreach ($rows as $b) {
                $lines[] = '    .byte %' . str_pad(decbin($b), 8, '0', STR_PAD_LEFT);
            }
        }
        $lines[] = 'DigitPtrs:';
        for ($d = 0; $d < 10; $d++) {
            $lines[] = '    .word Digit' . $d;
        }
        $lines[] = '';
        return implode("\n", $lines);
    }

    private static function logoData(): string
    {
        return <<<'ASM'
; Logo bitmap placeholder (PF-friendly strips) — arte final depois
LogoPF:
    .byte %01111110
    .byte %11000011
    .byte %10111101
    .byte %10100101
    .byte %10111101
    .byte %11000011
    .byte %01111110
    .byte %00000000

ASM;
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
