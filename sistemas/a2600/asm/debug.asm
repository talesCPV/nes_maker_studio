; ============================================================
; AGC generated — teste_1
; TV=NTSC ROM=4096 scoreBar=on
; P0 spawn=default P1 spawn=default
; Assembler: DASM (-f3 raw binary)
; ============================================================
    processor 6502

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

    ORG $F000

Start:
    sei
    cld
    ldx #$FF
    txs
    lda #0
    tax
ClearMem:
    sta $00,x
    inx
    bne ClearMem

    lda #0
    sta Score0
    sta Score1
    sta Score2
    lda #12              ; scoreP0 init (Program → valor)
    sta ScoreP0
    lda #34              ; scoreP1 init
    sta ScoreP1
    sta PrevSWCHA
    sta PrevINPT4
    sta WalkTick

    lda #34
    sta U_scoreP1
    lda #12
    sta U_scoreP0
    lda #0
    sta FrameDiv
    ; --- regras Boot ---
    ; rule Regra_1
    lda #7
    sta U_scoreP0
R1_end:

    ; Boot spawn positions / heights
    lda #40
    sta P0Y
    lda #8
    sta P0H
    lda #40
    sta P1Y
    lda #8
    sta P1H
    lda #60
    sta P0X                 ; color clocks 0-160
    lda #100
    sta P1X
    lda #1
    sta P0En
    sta P1En

MainLoop:
    lda #2
    sta VSYNC
    sta WSYNC
    sta WSYNC
    sta WSYNC
    lda #0
    sta VSYNC

    lda #40
    sta TIM64T
    jsr GameLogic
    jsr PositionPlayers
WaitVBlank:
    lda INTIM
    bne WaitVBlank
    sta WSYNC
    sta VBLANK

    lda #$0E
    sta COLUP0
    sta COLUP1
    lda #0
    sta GRP0
    sta GRP1
    sta PF0
    sta PF1
    sta PF2
    sta NUSIZ0
    sta NUSIZ1

    ; ===== HUD v1: placar (opcional) + play vazio + logo (sempre) =====
    ; playLines=166 scoreLines=16 logoLines=10

    jsr DrawScoreBand
    ; --- área útil (sem PF por enquanto) ---
    ldx #166
BlankPlay:
    sta WSYNC
    lda #0
    sta COLUBK
    sta COLUPF
    sta PF0
    sta PF1
    sta PF2
    sta GRP0
    sta GRP1
    dex
    bne BlankPlay

    jsr DrawLogo              ; sempre (plataforma)

    lda #2
    sta VBLANK
    lda #30
    sta TIM64T
WaitOverscan:
    lda INTIM
    bne WaitOverscan
    sta WSYNC
    jmp MainLoop

GameLogic:
    ; --- sample input ---
    inc WalkTick
    lda SWCHA
    sta TmpA
    lda INPT4
    sta TmpB
    ; --- timers (60 frames = 1s) ---
    ldx #0
    stx TmpB              ; reusa: flag “houve segundo” no carry path
    inc FrameDiv
    lda FrameDiv
    cmp #60
    bne NoSecTick
    lda #0
    sta FrameDiv
NoSecTick:
    lda TmpA
    sta PrevSWCHA
    lda INPT4
    sta PrevINPT4
    sta CXCLR              ; limpa latches de colisão
    rts

; Posiciona P0/P1 com precisão de 1 color clock (RESP + HMxx + HMOVE)
; Rotina clássica: divide X por 15, resto vira HMP fine offset.
PositionPlayers:
    lda P0X
    ldx #0                  ; objeto 0 = P0
    jsr SetHX
    lda P1X
    ldx #1                  ; objeto 1 = P1
    jsr SetHX
    sta WSYNC
    sta HMOVE               ; aplica HMP0/HMP1
    sta WSYNC
    sta HMCLR               ; evita comb no playfield
    rts

; A = X (0-159), X = índice do objeto (0=P0,1=P1)
SetHX:
    sta WSYNC
    sec
SetHXDiv:
    sbc #15
    bcs SetHXDiv
    eor #7
    asl
    asl
    asl
    asl
    sta HMP0,x              ; HMP0 ou HMP1
    sta RESP0,x             ; RESP0 ou RESP1
    rts

; --- Score players=2 digits=3 delay=8 label=0 h=6 (pre-build + tight bands) ---
DrawScoreBand:
    lda #0
    sta PF0
    sta PF1
    sta PF2
    sta CTRLPF
    sta GRP0
    sta GRP1
    sta ENAM0
    sta ENAM1
    sta ENABL
    sta VDELP0
    sta VDELP1
    lda #1                  ; P0: 2 copias close
    sta NUSIZ0
    lda #0
    sta NUSIZ1
    lda #$0E
    sta COLUP0
    sta COLUP1
    ; === PRE-CALC scoreP0 (build ScStrip) ===
    jsr ScoreToDigits0
    ldy #0
ScBuild0:
    sty ScRow
    tya
    sta TmpA
    asl
    clc
    adc TmpA
    sta ScIdx
    lda Dig3
    jsr GlyphRow
    ldx ScIdx
    sta ScStrip,x
    inx
    stx ScIdx
    lda Dig4
    jsr GlyphRow
    ldx ScIdx
    sta ScStrip,x
    inx
    stx ScIdx
    lda Dig5
    jsr GlyphRow
    ldx ScIdx
    sta ScStrip,x
    iny
    cpy #6
    bcc ScBuild0
    ; === PRE-CALC scoreP1 (build ScStrip2) ===
    jsr ScoreToDigits1
    ldy #0
ScBuild1:
    sty ScRow
    tya
    sta TmpA
    asl
    clc
    adc TmpA
    sta ScIdx
    lda Dig3
    jsr GlyphRow
    ldx ScIdx
    sta ScStrip2,x
    inx
    stx ScIdx
    lda Dig4
    jsr GlyphRow
    ldx ScIdx
    sta ScStrip2,x
    inx
    stx ScIdx
    lda Dig5
    jsr GlyphRow
    ldx ScIdx
    sta ScStrip2,x
    iny
    cpy #6
    bcc ScBuild1
    ; === POSITION (uma vez só) ===
    sta WSYNC
    ldx #8
ScPos0:
    dex
    bne ScPos0
    nop
    sta RESP0
    sta RESP1
    lda #0
    sta HMP0
    sta HMP1
    sta WSYNC
    sta HMOVE
    sta WSYNC
    sta HMCLR
    ; === DISPLAY faixa P0 ===
    ldy #0
ScDigRows0:
    sta WSYNC
    lda #0
    sta COLUBK
    tya
    sta TmpA
    asl
    clc
    adc TmpA
    tax
    lda ScStrip,x
    sta GRP0
    inx
    lda ScStrip,x
    sta GRP1
    inx
    lda ScStrip,x
    sta GRP0
    iny
    cpy #6
    bcc ScDigRows0
    lda #0
    sta GRP0
    sta GRP1
    ; === GAP 1 scanline entre faixas ===
    sta WSYNC
    lda #0
    sta COLUBK
    lda #0
    sta GRP0
    sta GRP1
    ; === DISPLAY faixa P1 ===
    ldy #0
ScDigRows1:
    sta WSYNC
    lda #0
    sta COLUBK
    tya
    sta TmpA
    asl
    clc
    adc TmpA
    tax
    lda ScStrip2,x
    sta GRP0
    inx
    lda ScStrip2,x
    sta GRP1
    inx
    lda ScStrip2,x
    sta GRP0
    iny
    cpy #6
    bcc ScDigRows1
    lda #0
    sta GRP0
    sta GRP1
    rts

GlyphRow:
    sta Temp
    lda #0
    sta TmpB
    ldx Temp
    beq GR_Done
GR_Mul:
    lda TmpB
    clc
    adc #6
    sta TmpB
    dex
    bne GR_Mul
GR_Done:
    lda TmpB
    clc
    adc ScRow
    tax
    lda DigitGfx,x
    rts

ScoreToDigits0:
    lda #0
    sta Dig3
    sta Dig4
    sta Dig5
    lda ScoreP0
    sta Temp
S0H:
    lda Temp
    cmp #100
    bcc S0T
    sec
    sbc #100
    sta Temp
    inc Dig3
    jmp S0H
S0T:
    lda Temp
    cmp #10
    bcc S0U
    sec
    sbc #10
    sta Temp
    inc Dig4
    jmp S0T
S0U:
    lda Temp
    sta Dig5
    rts

ScoreToDigits0Val:
    lda #0
    sta Dig4
    sta Dig5
    lda ScoreP0
    sta Temp
S0V_T:
    lda Temp
    cmp #10
    bcc S0V_U
    sec
    sbc #10
    sta Temp
    inc Dig4
    lda Dig4
    cmp #10
    bcc S0V_T
    lda #0
    sta Dig4
    jmp S0V_T
S0V_U:
    lda Temp
    sta Dig5
    rts

ScoreToDigits1:
    lda #0
    sta Dig3
    sta Dig4
    sta Dig5
    lda ScoreP1
    sta Temp
S1H:
    lda Temp
    cmp #100
    bcc S1T
    sec
    sbc #100
    sta Temp
    inc Dig3
    jmp S1H
S1T:
    lda Temp
    cmp #10
    bcc S1U
    sec
    sbc #10
    sta Temp
    inc Dig4
    jmp S1T
S1U:
    lda Temp
    sta Dig5
    rts

ScoreToDigits1Val:
    lda #0
    sta Dig4
    sta Dig5
    lda ScoreP1
    sta Temp
S1V_T:
    lda Temp
    cmp #10
    bcc S1V_U
    sec
    sbc #10
    sta Temp
    inc Dig4
    lda Dig4
    cmp #10
    bcc S1V_T
    lda #0
    sta Dig4
    jmp S1V_T
S1V_U:
    lda Temp
    sta Dig5
    rts

; --- Logo RETROCOMPILER (glifos.json → PF) ---
DrawLogo:
    lda #0
    sta GRP0
    sta GRP1
    lda #1
    sta CTRLPF              ; reflect
    lda #$0E
    sta COLUPF
    ldx #0
LogoLoop:
    sta WSYNC
    lda #0
    sta COLUBK
    cpx #10
    bcs LogoDone
    lda LogoPF0,x
    sta PF0
    lda LogoPF1,x
    sta PF1
    lda LogoPF2,x
    sta PF2
    inx
    jmp LogoLoop
LogoDone:
    lda #0
    sta PF0
    sta PF1
    sta PF2
    sta CTRLPF
    rts

DigitGfx:
Digit0:
    .byte %01100000
    .byte %11010000
    .byte %10010000
    .byte %10110000
    .byte %01100000
    .byte %00000000
Digit1:
    .byte %01000000
    .byte %11000000
    .byte %01000000
    .byte %01000000
    .byte %11100000
    .byte %00000000
Digit2:
    .byte %01100000
    .byte %10010000
    .byte %00100000
    .byte %01000000
    .byte %11110000
    .byte %00000000
Digit3:
    .byte %11100000
    .byte %00010000
    .byte %01100000
    .byte %00010000
    .byte %11100000
    .byte %00000000
Digit4:
    .byte %00010000
    .byte %00110000
    .byte %01010000
    .byte %11110000
    .byte %00010000
    .byte %00000000
Digit5:
    .byte %11110000
    .byte %10000000
    .byte %11100000
    .byte %00010000
    .byte %11100000
    .byte %00000000
Digit6:
    .byte %01100000
    .byte %10000000
    .byte %11100000
    .byte %10010000
    .byte %01100000
    .byte %00000000
Digit7:
    .byte %11110000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01000000
    .byte %00000000
Digit8:
    .byte %01100000
    .byte %10010000
    .byte %01100000
    .byte %10010000
    .byte %01100000
    .byte %00000000
Digit9:
    .byte %01100000
    .byte %10010000
    .byte %01110000
    .byte %00010000
    .byte %01100000
    .byte %00000000
Label1P:
    .byte %01001100
    .byte %11001010
    .byte %01001100
    .byte %01001000
    .byte %11101000
    .byte %00000000
Label2P:
    .byte %01100110
    .byte %10010101
    .byte %00100110
    .byte %01000100
    .byte %11110100
    .byte %00000000

LogoPF0:
    .byte %11100000
    .byte %00100000
    .byte %11100000
    .byte %10100000
    .byte %00100000
    .byte %00000000
    .byte %11100000
    .byte %00100000
    .byte %11100000
    .byte %10100000
LogoPF1:
    .byte %00111000
    .byte %10100100
    .byte %00111000
    .byte %00101000
    .byte %10100100
    .byte %00000000
    .byte %00000000
    .byte %10000000
    .byte %00000000
    .byte %00000000
LogoPF2:
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000

; Playfield tables (por scanline)
PF0Data:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
PF1Data:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
PF2Data:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
PF0RData:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
PF1RData:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
PF2RData:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
COLUPFData:
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
    .byte $0A
COLUBKData:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00

GRP0Data:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $FF
    .byte $81
    .byte $81
    .byte $81
    .byte $81
    .byte $81
    .byte $81
    .byte $FF
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
GRP1Data:
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $FF
    .byte $81
    .byte $81
    .byte $81
    .byte $81
    .byte $81
    .byte $81
    .byte $FF
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00
    .byte $00

; Sprite graphics (linhas top→bottom, ref)
; Sprite graphics (linhas top→bottom)
    align 256
Sprite0Data:
    .byte %11111111
    .byte %10000001
    .byte %10000001
    .byte %10000001
    .byte %10000001
    .byte %10000001
    .byte %10000001
    .byte %11111111
    align 256
Sprite1Data:
    .byte %11111111
    .byte %10000001
    .byte %10000001
    .byte %10000001
    .byte %10000001
    .byte %10000001
    .byte %10000001
    .byte %11111111

; --- RAM ---
Score0    equ $80
Score1    equ $81
Score2    equ $82
ScoreP0   equ $80            ; nativa placar P1 / single
ScoreP1   equ $81            ; nativa placar P2 (both)
Dig0      equ $A0            ; buffer dígitos BCD (até 6+6)
Dig1      equ $A1
Dig2      equ $A2
Dig3      equ $A3
Dig4      equ $A4
Dig5      equ $A5
Dig6      equ $A6            ; P2
Dig7      equ $A7
Dig8      equ $A8
Dig9      equ $A9
Dig10     equ $AA
Dig11     equ $AB
ScRow     equ $AC
ScIdx     equ $AD
ScStrip   equ $B2            ; H*3 bytes (faixa P0)
ScStrip2  equ $C4            ; H*3 bytes (faixa P1)
Temp      equ $83
P0Y       equ $84
P0H       equ $85
P1Y       equ $86
P1H       equ $87
P0X       equ $88
P1X       equ $89
P0En      equ $8A
P1En      equ $8B
ZPF0L     equ $8C
ZPF1L     equ $8D
ZPF2L     equ $8E
ZPF0R     equ $8F
ZPF1R     equ $90
ZPF2R     equ $91
ZCOLUBK   equ $92
ZCOLUPF   equ $93
ZGRP0     equ $94
ZGRP1     equ $95
PrevSWCHA equ $9C
PrevINPT4 equ $9D
TmpA      equ $9E
TmpB      equ $9F
WalkTick  equ $9B
U_scoreP1  equ $A0
U_scoreP0  equ $A1
FrameDiv   equ $A2

    ORG $FFFA
    .word Start
    .word Start
    .word Start

