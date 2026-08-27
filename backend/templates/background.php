<?php
/**
 * NGC - Background / Screen Loading.
 *
 * Stage 12: migra as rotinas de carregamento de nametable e attributes.
 * Os dados/tabelas das telas ainda são emitidos pelo gerador legado nesta etapa.
 */
return [
    'background' => static function(array $ctx): string {
        return <<<'ASM'
; ---- Background / Screen Loading (NGC) ----
; Carrega nametable+attrs da tela A (hard cut, rendering off)
load_screen:
  STA cur_screen
  ; desliga rendering E a geracao de NMI - a escrita de ~1000 bytes
  ; leva mais de um frame; sem isso, o NMI pode disparar no meio da sequencia $2006/$2007.
  LDA #0
  STA $2001
  STA $2000
  ; ponteiro da nametable (tabela de 1 byte por tela)
  LDX cur_screen
  LDA ScreenNtLo,X
  STA tmp0
  LDA ScreenNtHi,X
  STA tmp1
  BIT $2002
  LDA #$20
  STA $2006
  LDA #$00
  STA $2006
  LDY #0
  LDX #4
ls_nt_outer:
  LDA #240
  STA ls_count
ls_nt_inner:
  LDA (tmp0),Y
  STA $2007
  INY
  BNE ls_nt_noinc
  INC tmp1
ls_nt_noinc:
  DEC ls_count
  BNE ls_nt_inner
  DEX
  BNE ls_nt_outer
  ; attributes
  LDX cur_screen
  LDA ScreenAtLo,X
  STA tmp0
  LDA ScreenAtHi,X
  STA tmp1
  BIT $2002
  LDA #$23
  STA $2006
  LDA #$C0
  STA $2006
  LDY #0
ls_at:
  LDA (tmp0),Y
  STA $2007
  INY
  CPY #64
  BNE ls_at
  ; scroll zerado
  BIT $2002
  LDA #0
  STA $2005
  STA $2005
  ; religa NMI + rendering
  LDA #%10010000
  STA $2000
  LDA #%00011110
  STA $2001
  RTS

; Escreve uma tela numa das duas nametables fisicas ($2000/$2400), sem alterar scroll_x.
; Entrada: A = indice global da tela; psn_base_hi = $20 ou $24.
preload_screen_nt:
  STA psn_screen
  ; desliga rendering E NMI para evitar conflito com $2006/$2007 durante a escrita longa.
  LDA #0
  STA $2001
  STA $2000
  LDX psn_screen
  LDA ScreenNtLo,X
  STA tmp0
  LDA ScreenNtHi,X
  STA tmp1
  BIT $2002
  LDA psn_base_hi
  STA $2006
  LDA #$00
  STA $2006
  LDY #0
  LDX #4
psn_nt_outer:
  LDA #240
  STA ls_count
psn_nt_inner:
  LDA (tmp0),Y
  STA $2007
  INY
  BNE psn_nt_noinc
  INC tmp1
psn_nt_noinc:
  DEC ls_count
  BNE psn_nt_inner
  DEX
  BNE psn_nt_outer
  LDX psn_screen
  LDA ScreenAtLo,X
  STA tmp0
  LDA ScreenAtHi,X
  STA tmp1
  BIT $2002
  LDA psn_base_hi
  ORA #$03
  STA $2006
  LDA #$C0
  STA $2006
  LDY #0
psn_at:
  LDA (tmp0),Y
  STA $2007
  INY
  CPY #64
  BNE psn_at
  ; religa NMI preservando nt_page + rendering
  LDA #%10010000
  ORA nt_page
  STA $2000
  LDA #%00011110
  STA $2001
  RTS
ASM;
    },
];
