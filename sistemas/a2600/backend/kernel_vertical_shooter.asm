; ==============================================================================
; KERNEL ATARI 2600 - VERTICAL SHOOTER (MEGAMANIA STYLE)
; Integracao com program.js (enemyAlive0..enemyAlive5 / 6 bits binario)
; ==============================================================================

    Processor 6502
    Include "vstate.h"
    Include "macro.h"

; ------------------------------------------------------------------------------
; MAPEAR VARIAVEIS DA RAM (128 BYTES RIOT)
; ------------------------------------------------------------------------------
    SEG.U VARS
    ORC $80

; Variaveis de Estado dos Inimigos (6-bit mask por linha)
; Cada bit (0 a 5) indica a existencia/visibilidade de 1 dos 6 inimigos da linha.
; Mapeado diretamente do valor decimal de enemyAlive0 .. enemyAlive5 do program.js
EnemyAliveMask0   .byte   ; Row 0: Bitmask (0..63 -> %00xxxxxx)
EnemyAliveMask1   .byte   ; Row 1: Bitmask
EnemyAliveMask2   .byte   ; Row 2: Bitmask
EnemyAliveMask3   .byte   ; Row 3: Bitmask
EnemyAliveMask4   .byte   ; Row 4: Bitmask
EnemyAliveMask5   .byte   ; Row 5: Bitmask

; Posicoes e Animações
EnemyXPos          .byte   ; Posicao X base do grupo da fileira ativa
PlayerXPos         .byte   ; Posicao X do Jogador (P0)
MissileXPos        .byte   ; Posicao X do Tiro do Jogador (M0)
MissileYPos        .byte   ; Posicao Y do Tiro do Jogador

; Buffer Temporario por Linha de Varredura
CurrGRP0           .byte   ; Buffer filtrado para P0 (Inimigos 0,1,2 - BITS 0,1,2)
CurrGRP1           .byte   ; Buffer filtrado para P1 (Inimigos 3,4,5 - BITS 3,4,5)

; ------------------------------------------------------------------------------
; CÓDIGO DO KERNEL (DISPLAY ROUTINE)
; ------------------------------------------------------------------------------
    SEG CODE
    ORG $F000

StartKernel:
    ; Configurar TIA para 3 Copias Próximas em P0 e P1 (Efeito Megamania)
    LDA #$03                ; %00000011 -> 3 copias proximas
    STA NUSIZ0              ; P0 desdobrado em 3 instancias via Hardware
    STA NUSIZ1              ; P1 desdobrado em 3 instancias via Hardware

RenderEnemyRow0:
    ; ==========================================================================
    ; FILEIRA 0 DE INIMIGOS (Utiliza EnemyAliveMask0 de program.js)
    ; ==========================================================================
    ; Testar os bits 0, 1 e 2 para P0 (Instancias 1, 2 e 3 do P0)
    LDA EnemyAliveMask0
    AND #%00000111          ; Isola os 3 primeiros bits (Inimigos P0)
    BEQ .HideP0             ; Se nenhum estiver vivo, mascara = 0
    LDA #$FF                ; Sprite base visivel (ou ponteiro de grafico)
    JMP .SetP0
.HideP0:
    LDA #$00
.SetP0:
    STA CurrGRP0

    ; Testar os bits 3, 4 e 5 para P1 (Instancias 1, 2 e 3 do P1)
    LDA EnemyAliveMask0
    AND #%000011100         ; Isola os bits 3, 4 e 5 (Inimigos P1)
    BEQ .HideP1
    LDA #$FF                ; Sprite base visivel
    JMP .SetP1
.HideP1:
    LDA #$00
.SetP1:
    STA CurrGRP1

    ; Aplica no TIA na scanline exata sem flicker!
    STA WSYNC
    LDA CurrGRP0
    STA GRP0
    LDA CurrGRP1
    STA GRP1

    ; --------------------------------------------------------------------------
    ; CHECAGEM DE COLISÃO E ATUALIZAÇÃO INDIVIDUAL DE MORTE (PROGRAM.JS COMPAT)
    ; --------------------------------------------------------------------------
CheckCollisionRow0:
    LDA CXM0P               ; Testa colisao do Míssil 0 com Players
    AND #$C0                ; Bit 7 (P1) ou Bit 6 (P0)
    BEQ .EndCollision

    ; Identifica qual das 6 posicoes X especificas foi atingida
    ; Atualiza a mascara removendo apenas o bit correspondente (0-5)
    ; Exemplo para matar o inimigo 2 (bit 2):
    ; EnemyAliveMask0 = EnemyAliveMask0 AND %11111011 (Decimal atualizado no JS)

.EndCollision:
    STA CXCLR               ; Limpa registradores de colisao TIA
    RTS
