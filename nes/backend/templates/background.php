<?php
/**
 * NGC - Background / Screen Loading.
 *
 * Stage 12: migra as rotinas de carregamento de nametable e attributes.
 * Os dados/tabelas das telas ainda são emitidos pelo gerador legado nesta etapa.
 */
return [
    'background' => static function(array $ctx): string {
        $cnrom = (int)($ctx['mapperInfo']['mapper'] ?? 0) === 3;
        $bankSwitch = '';
        if ($cnrom) {
            // Camada 7 (mappers plugaveis): troca o banco de CHR ANTES de
            // desenhar a tela (aqui, com rendering/NMI ja desligados por
            // load_screen alguns bytes abaixo - a janela mais segura que
            // existe, nem precisa caber no orcamento de vblank da NMI).
            // CnromBankSelect,X vale X - a escrita e' o PROPRIO valor que ja
            // esta gravado naquele endereco da ROM, o que evita bus conflict
            // no board CNROM classico (a CPU e a ROM concordam no mesmo bit
            // no barramento, entao nao ha disputa eletrica).
            $bankSwitch = <<<'ASM'

  ; Camada 7 (CNROM): troca de banco de CHR pra essa tela
  LDX cur_screen
  LDA ScreenBank,X
  TAX
  LDA CnromBankSelect,X
  STA CnromBankSelect,X
ASM;
        }
        $tail = $cnrom ? "\n\nCnromBankSelect:\n  .byte \$00, \$01, \$02, \$03" : '';
        $part1 = <<<ASM
; ---- Background / Screen Loading (NGC) ----
; Carrega nametable+attrs da tela A (hard cut, rendering off)
load_screen:
  STA cur_screen
  ; desliga rendering E a geracao de NMI - a escrita de ~1000 bytes
  ; leva mais de um frame; sem isso, o NMI pode disparar no meio da sequencia \$2006/\$2007.
  LDA #0
  STA \$2001
  STA \$2000{$bankSwitch}
  ; ponteiro da nametable (tabela de 1 byte por tela)
  LDX cur_screen
  LDA ScreenNtLo,X
  STA tmp0
  LDA ScreenNtHi,X
  STA tmp1
  BIT \$2002
  LDA #\$20
  STA \$2006
  LDA #\$00
  STA \$2006
  LDY #0
  ; Camada 8 (compressão por metatile): se essa tela for comprimida,
  ; expande MetatileIndex_<tela> (240 bytes) em vez de copiar
  ; Nametable_<tela> (960 bytes) cru - tmp0/tmp1 já apontam pro que for
  ; certo (ScreenNtLo/Hi resolve pro label certo em tempo de build).
  ; IMPORTANTE: usa X aqui só pra esse teste, ANTES do LDX #4 do loop cru -
  ; um bug anterior fazia LDA cur_screen/TAX pisar no X#4 do contador do
  ; loop de cópia, criando um loop bem mais longo que o esperado.
  LDX cur_screen
  LDA ScreenCompressed,X
  BEQ ls_nt_raw
  JSR mtx_expand_nt
  JMP ls_nt_after
ls_nt_raw:
  LDX #4
ls_nt_outer:
  LDA #240
  STA ls_count
ls_nt_inner:
  LDA (tmp0),Y
  STA \$2007
  INY
  BNE ls_nt_noinc
  INC tmp1
ls_nt_noinc:
  DEC ls_count
  BNE ls_nt_inner
  DEX
  BNE ls_nt_outer
ls_nt_after:
  ; attributes
  LDX cur_screen
  LDA ScreenAtLo,X
  STA tmp0
  LDA ScreenAtHi,X
  STA tmp1
  BIT \$2002
  LDA #\$23
  STA \$2006
  LDA #\$C0
  STA \$2006
  LDY #0
ls_at:
  LDA (tmp0),Y
  STA \$2007
  INY
  CPY #64
  BNE ls_at
  ; scroll zerado
  LDA #0
  STA nt_page          ; Fase 9 fix: sem isso, a NMI (que sempre le nt_page/
  STA scroll_x          ; scroll_x pra desenhar) reescrevia por cima com o
                         ; valor antigo (de antes do corte) logo no proximo frame
  BIT \$2002
  LDA #0
  STA \$2005
  STA \$2005
  ; religa NMI + rendering
  LDA #%10010000
  STA \$2000
  LDA #%00011110
  STA \$2001
  RTS{$tail}
ASM;
        // Camada 7: o resto (preload_screen_nt em diante) nao muda com o
        // mapper - fica num nowdoc separado (sem interpolacao) igual sempre
        // foi, so' precisou virar 2 pedacos porque o load_screen acima ganhou
        // {$bankSwitch}/{$tail} (interpolados).
        $part2 = <<<'ASM2'
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
ASM2;
        // Camada 8 (compressão por metatile): expande MetatileIndex_<tela>
        // (240 bytes) em bytes de nametable de verdade, direto na PPU - 15
        // linhas de metatile, cada uma em 2 passadas (tiles de cima TL/TR,
        // depois de baixo BL/BR) porque uma linha de nametable de verdade
        // (32 bytes) só cobre a METADE de cima de uma linha de metatiles.
        // Não precisa de tabela de índice de tile nenhuma: cada metatile
        // local ocupa SEMPRE os slots 4*id..4*id+3 no banco de CHR
        // compactado (ver ProjectParser::buildMetatileCompression) - é
        // aritmética pura (id*4 + 0/1/2/3), não indireção.
        $part3 = <<<'ASM3'
mtx_expand_nt:
  LDX #0
mtx_row_loop:
  LDY #0
mtx_top_loop:
  LDA (tmp0),Y
  ASL A
  ASL A
  STA mtx_scratch
  STA $2007
  LDA mtx_scratch
  ORA #1
  STA $2007
  INY
  CPY #16
  BNE mtx_top_loop
  LDY #0
mtx_bot_loop:
  LDA (tmp0),Y
  ASL A
  ASL A
  STA mtx_scratch
  ORA #2
  STA $2007
  LDA mtx_scratch
  ORA #3
  STA $2007
  INY
  CPY #16
  BNE mtx_bot_loop
  LDA tmp0
  CLC
  ADC #16
  STA tmp0
  BCC mtx_row_nc
  INC tmp1
mtx_row_nc:
  INX
  CPX #15
  BNE mtx_row_loop
  RTS
ASM3;

        return $part1 . "\n" . $part2 . "\n" . $part3;
    },
];
