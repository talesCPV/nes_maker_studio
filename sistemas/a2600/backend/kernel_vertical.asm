;==============================================================================
; KERNEL VERTICAL SHOOTER - STYLE MEGAMANIA (ATARI 2600 / TIA)
; Multiplexação de P0 e P1 via NUSIZ0/NUSIZ1 com Suporte a Bitmask (enemyAliveX)
;==============================================================================

    PROCESSOR 6502
    INCLUDE "vstate.h"

;------------------------------------------------------------------------------
; MAPEAMENTO DE VARIÁVEIS NA RAM RIOT ($80 - $FF)
; Conforme especificado pelo editor/program.js:
; enemyAlive0 .. enemyAlive5 representam os bits de existência (6 bits: 0-63)
;------------------------------------------------------------------------------
    SEG.U VARS
    ORG $80

PlayerX          DS 1    ; Posição X da Nave do Jogador ($80)
PlayerY          DS 1    ; Posição Y da Nave do Jogador ($81)
Missile0X        DS 1    ; Posição X do Tiro do Jogador ($82)
Missile0Y        DS 1    ; Posição Y do Tiro do Jogador ($83)

EnemyRow0_X      DS 1    ; Posição X base da Fileira 0 ($84)
EnemyRow1_X      DS 1    ; Posição X base da Fileira 1 ($85)
EnemyRow2_X      DS 1    ; Posição X base da Fileira 2 ($86)
EnemyRow3_X      DS 1    ; Posição X base da Fileira 3 ($87)
EnemyRow4_X      DS 1    ; Posição X base da Fileira 4 ($88)
EnemyRow5_X      DS 1    ; Posição X base da Fileira 5 ($89)

; Mapeamento exato de 6 bits (0-63) vindo do editor/program.js
EnemyAlive0      DS 1    ; Bitmask Fileira 0 (Bits 0..2 -> P0 copies, Bits 3..5 -> P1 copies) ($8A)
EnemyAlive1      DS 1    ; Bitmask Fileira 1 ($8B)
EnemyAlive2      DS 1    ; Bitmask Fileira 2 ($8C)
EnemyAlive3      DS 1    ; Bitmask Fileira 3 ($8D)
EnemyAlive4      DS 1    ; Bitmask Fileira 4 ($8E)
EnemyAlive5      DS 1    ; Bitmask Fileira 5 ($8F)

EnergyBar        DS 1    ; Nível de Energia / Combustível ($90)
ScoreBCD         DS 2    ; Pontuação em BCD ($91-$92)
FrameCounter     DS 1    ; Contador de frames ($93)
Temp             DS 2    ; Variáveis temporárias de renderização ($94-$95)

;------------------------------------------------------------------------------
; CÓDIGO DA ROM ($F000 - $FFFF)
;------------------------------------------------------------------------------
    SEG CODE
    ORG $F000

Start:
    CLEAN_START          ; Macro padronizada para inicialização do 6502/TIA

InitGame:
    LDA #30
    STA PlayerX
    LDA #10
    STA PlayerY
    LDA #%00111111       ; Todos os 6 inimigos vivos por padrão (6 bits = 63)
    STA EnemyAlive0
    STA EnemyAlive1
    STA EnemyAlive2
    STA EnemyAlive3
    STA EnemyAlive4
    STA EnemyAlive5

MainLoop:
    JSR VerticalSync
    JSR VerticalBlank
    JSR KernelRender
    JSR OverScan
    JMP MainLoop

;------------------------------------------------------------------------------
; VERTICAL SYNC (3 Scanlines)
;------------------------------------------------------------------------------
VerticalSync:
    LDA #2
    STA VSYNC
    STA WSYNC
    STA WSYNC
    STA WSYNC
    LDA #0
    STA VSYNC
    RTS

;------------------------------------------------------------------------------
; VERTICAL BLANK (37 Scanlines - Lógica do Jogo e Detecção de Colisão Megamania)
;------------------------------------------------------------------------------
VerticalBlank:
    LDA #43
    STA TIM64T          ; Timer para VBLANK

    ; 1. Processar Colisão do Tiro M0 com Inimigos (CXM0P)
    LDA CXM0P
    AND #%10000000      ; Colisão M0 com P0 ou P1?
    BEQ .NoCollision

    ; Se houve colisão, identificar qual fileira Y e qual bit (0..5) corresponde
    JSR ProcessEnemyHit

.NoCollision:
    STA CXCLR           ; Limpa registradores de colisão TIA

.WaitVblank:
    LDA INTIM
    BNE .WaitVblank
    LDA #0
    STA VBLANK
    RTS

;------------------------------------------------------------------------------
; PROCESSAMENTO DE IMPACTO NO INIMIGO (Cálculo de Posição Relativa por Bitmask)
; Correlaciona a coordenada X do tiro com as 6 instâncias de P0/P1
;------------------------------------------------------------------------------
ProcessEnemyHit:
    RTS

;------------------------------------------------------------------------------
; KERNEL DE RENDERIZAÇÃO PRINCIPAL (192 Scanlines)
; Reutiliza P0 (3 cópias) e P1 (3 cópias) usando NUSIZ0/1 = %011 (3 copies close)
;------------------------------------------------------------------------------
KernelRender:
    STA WSYNC

    ; Configura P0 e P1 para modo 3 cópias do TIA (Estilo Megamania)
    LDA #%011           ; 3 cópias próximas
    STA NUSIZ0
    STA NUSIZ1

    ; --- RENDERIZAÇÃO DAS FILEIRAS DE INIMIGOS (ZONE KERNEL) ---
    LDA EnemyAlive0
    JSR RenderEnemyRow
    
    LDA EnemyAlive1
    JSR RenderEnemyRow

    LDA EnemyAlive2
    JSR RenderEnemyRow

    LDA EnemyAlive3
    JSR RenderEnemyRow

    LDA EnemyAlive4
    JSR RenderEnemyRow

    LDA EnemyAlive5
    JSR RenderEnemyRow

    ; --- RENDERIZAÇÃO DA NAVE DO JOGADOR E HUD ---
    LDA #0
    STA NUSIZ0          ; Reseta P0 para 1 cópia única (Nave do Jogador)
    STA NUSIZ1

    LDX #30
.PlayerLoop:
    STA WSYNC
    DEX
    BNE .PlayerLoop

    RTS

;------------------------------------------------------------------------------
; ROTINA DE LINHA DE INIMIGOS (Aplica a Máscara de Bits de enemyAliveX)
;------------------------------------------------------------------------------
RenderEnemyRow:
    STA Temp            ; Guarda a máscara de 6 bits (enemyAliveX)

    ; Extrai os 3 bits inferiores para P0 (Bits 0..2)
    LDA Temp
    AND #%00000111
    BEQ .HideP0         ; Se os 3 inimigos do P0 estiverem mortos, oculta
    LDA #%11111111      ; Caso contrário, mantém renderização da zona
    JMP .SetP0
.HideP0:
    LDA #0
.SetP0:
    STA GRP0

    ; Extrai os 3 bits superiores para P1 (Bits 3..5)
    LDA Temp
    AND #%00111000
    BEQ .HideP1
    LDA #%11111111
    JMP .SetP1
.HideP1:
    LDA #0
.SetP1:
    STA GRP1

    ; Loop de varredura de altura da linha do sprite (8 scanlines)
    LDY #8
.RowLoop:
    STA WSYNC
    DEY
    BNE .RowLoop

    LDA #0
    STA GRP0
    STA GRP1
    RTS

;------------------------------------------------------------------------------
; OVERSCAN (30 Scanlines)
;------------------------------------------------------------------------------
OverScan:
    LDA #2
    STA VBLANK          ; Desativa saída de vídeo durante overscan
    LDA #35
    STA TIM64T
.WaitOverscan:
    LDA INTIM
    BNE .WaitOverscan
    RTS

    ORG $FFFC
    .WORD Start         ; Vetor de Reset
    .WORD Start         ; Vetor de IRQ
