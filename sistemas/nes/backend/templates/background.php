<?php
/**
 * NGC - Background / Screen Loading.
 *
 * Stage 12: migra as rotinas de carregamento de nametable e attributes.
 * Os dados/tabelas das telas ainda são emitidos pelo gerador legado nesta etapa.
 */
return [
    'background' => static function(array $ctx): string {
        $mapper = (int)($ctx['mapperInfo']['mapper'] ?? 0);
        $cnrom = $mapper === 3;
        $uorom = $mapper === 2;
        $hasText = !empty($ctx['anyBankNeedsFont']);
        // Texto sobreposto: chamada opcional (so' existe se o projeto usa
        // texto de verdade em alguma tela - ver anyBankNeedsFont) logo
        // depois do upload normal de atributo, ainda com rendering/NMI
        // desligados (mesma janela seguraca que o resto de load_screen ja
        // usa - nao precisa caber no orcamento de vblank da NMI).
        $textOverlayCall = $hasText ? "\n  LDA #\$20\n  STA dto_base_hi\n  LDA cur_screen\n  JSR draw_text_overlays" : '';
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
        } elseif ($uorom) {
            // UOROM etapa 2: troca de banco de PRG no corte duro de fase -
            // MESMO ponto/mesma janela segura que o CNROM usa pra CHR
            // acima, so' que aqui e' o banco inteiro de codigo+dado. $FF =
            // tela sem fase (splash/gameover solto) - nao mexe no banco
            // atual. Se o banco de destino for DIFERENTE do que ja estava
            // selecionado, a musica que estava tocando (se houver) ficou
            // com os dados dela inacessiveis - desliga ela (music_on=0 +
            // silencia os 4 canais) como rede de seguranca, em vez de
            // depender de toda tela de fase nova lembrar de chamar "Tocar
            // Som" antes de qualquer outra coisa.
            $bankSwitch = <<<'ASM'

  ; UOROM etapa 2: troca de banco de PRG pra essa fase (se mudou)
  LDX cur_screen
  LDA ScreenPrgBank,X
  CMP #$FF
  BEQ ls_prgbank_skip
  CMP cur_prg_bank
  BEQ ls_prgbank_skip
  STA cur_prg_bank
  TAX
  LDA UoromBankSelect,X
  STA UoromBankSelect,X
  ; banco mudou de verdade -> silencia musica da fase antiga (dados dela
  ; nao existem mais no banco agora selecionado)
  LDA #0
  STA music_on
  LDA #%00110000
  STA $4000
  STA $4004
  LDA #%10000000
  STA $4008
  LDA #0
  STA $400C
ls_prgbank_skip:
ASM;
        }
        $tail = $cnrom ? "\n\nCnromBankSelect:\n  .byte \$00, \$01, \$02, \$03" : '';
        if ($uorom) {
            $n = max(1, (int)($ctx['prgBankCount'] ?? 0));
            $tail = "\n\nUoromBankSelect:\n  .byte " . implode(', ', range(0, $n - 1));
        }
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
  ; Camada 9 (limpeza pré-áudio): toda tela agora é MetatileIndex_<tela> -
  ; nao existe mais caminho cru/tela suja. tmp0/tmp1 ja apontam pro lugar
  ; certo (ScreenNtLo/Hi resolve sempre pra MetatileIndex_<tela>).
  JSR mtx_expand_nt
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
  BNE ls_at{$textOverlayCall}
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
        $psnTextOverlayCall = $hasText ? "\n  LDA psn_base_hi\n  STA dto_base_hi\n  LDA psn_screen\n  JSR draw_text_overlays" : '';
        $part2 = <<<ASM2
; Escreve uma tela numa das duas nametables fisicas (\$2000/\$2400), sem alterar scroll_x.
; Entrada: A = indice global da tela; psn_base_hi = \$20 ou \$24.
preload_screen_nt:
  STA psn_screen
  ; desliga rendering E NMI para evitar conflito com \$2006/\$2007 durante a escrita longa.
  LDA #0
  STA \$2001
  STA \$2000
  LDX psn_screen
  LDA ScreenNtLo,X
  STA tmp0
  LDA ScreenNtHi,X
  STA tmp1
  BIT \$2002
  LDA psn_base_hi
  STA \$2006
  LDA #\$00
  STA \$2006
  LDY #0
  JSR mtx_expand_nt
  LDX psn_screen
  LDA ScreenAtLo,X
  STA tmp0
  LDA ScreenAtHi,X
  STA tmp1
  BIT \$2002
  LDA psn_base_hi
  ORA #\$03
  STA \$2006
  LDA #\$C0
  STA \$2006
  LDY #0
psn_at:
  LDA (tmp0),Y
  STA \$2007
  INY
  CPY #64
  BNE psn_at{$psnTextOverlayCall}
  ; religa NMI preservando nt_page + rendering
  LDA #%10010000
  ORA nt_page
  STA \$2000
  LDA #%00011110
  STA \$2001
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

        $part4 = '';
        if ($hasText) {
            // Texto sobreposto: le TextOverlay_<tela> e escreve so' os TILES
            // (paleta ja' foi mesclada permanentemente no Attr_<tela> pelo
            // proprio editor, nao precisa mexer em atributo aqui). Formato
            // do bloco: [n_camadas] { [x][y][len][tile0..tileN-1] } x n.
            // Endereco PPU de cada camada = base_hi*256 + y*32 + x (y*32
            // calculado com 5 ASL/ROL no par mc_ptr_lo/hi, reaproveitados
            // como scratch - mtx_expand_nt ja terminou nesse ponto).
            $part4 = <<<'ASM4'
; Entrada: A = indice global da tela; dto_base_hi = $20 ou $24 (nametable fisico alvo)
draw_text_overlays:
  TAX
  LDA TextOverlayLo,X
  STA tmp0
  LDA TextOverlayHi,X
  STA tmp1
  LDY #0
  LDA (tmp0),Y
  STA dto_lcount
  BEQ dto_done
  INY
dto_layer_loop:
  ; Y aponta pro byte "x" desta camada; le x,y,len em sequencia (Y++ a cada 1)
  LDA (tmp0),Y
  PHA               ; x (guarda na pilha, precisa dele so' depois do calculo de y*32)
  INY
  LDA (tmp0),Y
  STA mc_ptr_lo     ; scratch: y (baixo do par que vai virar y*32)
  LDA #0
  STA mc_ptr_hi     ; scratch: alto do par (zero antes de multiplicar)
  LDX #5
dto_mul32:
  ASL mc_ptr_lo
  ROL mc_ptr_hi
  DEX
  BNE dto_mul32
  PLA               ; recupera x
  CLC
  ADC mc_ptr_lo
  STA mc_ptr_lo     ; mc_ptr_lo = y*32 + x (baixo)
  LDA mc_ptr_hi
  ADC #0
  CLC
  ADC dto_base_hi
  STA mc_ptr_hi     ; mc_ptr_hi = base + carry = endereco PPU final (alto)
  BIT $2002
  LDA mc_ptr_hi
  STA $2006
  LDA mc_ptr_lo
  STA $2006
  INY               ; Y agora aponta pro byte "len"
  LDA (tmp0),Y
  STA mtx_scratch   ; scratch: len restante desta camada (reaproveita mtx_scratch, livre aqui)
  INY               ; Y agora aponta pro 1o tile da camada
dto_tile_loop:
  LDA (tmp0),Y
  STA $2007
  INY
  DEC mtx_scratch
  BNE dto_tile_loop
  DEC dto_lcount
  BNE dto_layer_loop
dto_done:
  RTS
ASM4;
        }

        return $part1 . "\n" . $part2 . "\n" . $part3 . ($part4 !== '' ? "\n" . $part4 : '');
    },
];
