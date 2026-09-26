<?php
/**
 * NGC - Templates do sistema NES.
 *
 * Estes blocos são deliberadamente pequenos e independentes.
 * O gerador monta o Assembly final usando apenas os blocos necessários.
 */
return [
    'header' => static function(array $ctx): string {
        // Camada 7 (mappers plugaveis): o header iNES era 100% fixo (sempre
        // mapper 0/NROM) antes disso - agora reflete o mapper resolvido em
        // ProjectParser::resolveMapperBanks() (ver $ctx['mapperInfo']).
        // CNROM (mapper 3) muda 2 bytes: quantidade de bancos de CHR (4 em
        // vez de 1 - ver CnromCfg::generate(), sempre gera os 4 mesmo que o
        // projeto use menos combinacoes) e o nibble alto do byte 6 (numero
        // do mapper, baixo nibble aqui - mapper 3 cabe inteiro nele, entao o
        // byte 7 nao muda).
        // Item scroll vertical: mirroring deixou de ser fixo em "vertical" -
        // NROM/CNROM/UOROM nao tem registrador de mirroring (isso e' fiacao
        // soldada na placa do cartucho, so mapper mais avancado tipo MMC1
        // consegue trocar em runtime - e' assim que jogos tipo Salamander
        // misturam fase horizontal com vertical, temos que esperar chegar
        // no MMC1 pra isso). Por enquanto e' escolha de ROM INTEIRA
        // (Project.data.scrollOrientation, Config.js) - mirroring VERTICAL
        // da PPU = scroll HORIZONTAL suave (bit0=1, como sempre foi ate
        // aqui); mirroring HORIZONTAL da PPU = scroll VERTICAL suave
        // (bit0=0, novo).
        $mapper = (int)($ctx['mapperInfo']['mapper'] ?? 0);
        // UOROM (mapper 2, etapa 2 - bankswitch de PRG por FASE): chrBanks=0
        // sinaliza CHR-RAM pro header iNES (CHR-RAM nunca banca, fixa desde
        // a etapa 1 - so' os dados de CHR viram tabela dentro do PRG_FIXED e
        // sao copiados pra CHR-RAM em tempo de boot, ver chars_segments.php
        // + 'reset' logo abaixo). PRG agora e' VARIAVEL: 1 banco fixo de
        // 16KB + N bancos comutaveis de 16KB (1 por fase com conteudo
        // proprio - ver ProjectParser::resolveUoromPrgBanks() e
        // UoromCfg.php, que usam a MESMA formula de banco minimo, senao o
        // header declara um tamanho que nao bate com o .cfg de verdade).
        $chrBanks = ($mapper === 3) ? 4 : (($mapper === 2) ? 0 : 1);
        $prgUnits = ($mapper === 2) ? (max(1, (int)($ctx['prgBankCount'] ?? 0)) + 1) : 2;
        $vertical = (($ctx['scrollOrientation'] ?? 'horizontal') !== 'vertical');
        $mirrorBit = $vertical ? 1 : 0;
        $mirrorLabel = $vertical ? 'vertical mirroring (scroll horizontal)' : 'horizontal mirroring (scroll vertical)';
        $flags6 = ((($mapper) & 0x0F) << 4) | $mirrorBit;
        $comment = ($mapper === 3)
            ? "CNROM (32KB PRG fixa + CHR em 4 bancos de 8KB, trocados em runtime), {$mirrorLabel}"
            : (($mapper === 2)
                ? "UOROM etapa 2 ({$prgUnits}x16KB PRG - 1 fixo + " . ($prgUnits - 1) . " por fase + CHR-RAM 8KB carregada no boot), {$mirrorLabel}"
                : "NROM-256 (32KB PRG), {$mirrorLabel}");
        $b6 = sprintf('$%02X', $flags6);
        return ".segment \"HEADER\"\n  .byte \$4E,\$45,\$53,\$1A,{$prgUnits},{$chrBanks},{$b6},0,0,0,0,0,0,0,0,0  ; {$comment}";
    },

    'vectors' => static function(array $ctx): string {
        // Mantém exatamente a ordem dos vetores usada pelo gerador atual.
        return <<<'ASM'
.segment "VECTORS"
  .word NMI
  .word Reset
  .word IRQ
ASM;
    },

    'zeropage' => static function(array $ctx): string {
        $project = $ctx['project'] ?? [];
        $requested = (int)($project['maxInstances'] ?? 10);
        $requested = max(1, min(20, $requested ?: 10));
        $maxOam = 14;
        $numInstances = min($requested, $maxOam);

        $lines = [];
        $lines[] = '.segment "ZEROPAGE"';
        $lines[] = 'pad1:       .res 1';
        $lines[] = 'pad1_old:   .res 1';
        $lines[] = 'pad1_edge:  .res 1';
        $lines[] = 'game_state: .res 1    ; 0=splash 1=play 2=gameover';
        $lines[] = 'cur_screen: .res 1';
        if ((int)($ctx['mapperInfo']['mapper'] ?? 0) === 2) {
            // UOROM etapa 2: banco de PRG comutavel atualmente selecionado -
            // precisa persistir por toda a sessao de jogo (nao so' no boot,
            // ao contrario de mc_ptr_lo/hi que a etapa 1 reaproveita so' pro
            // upload de CHR-RAM). Inicializado com $FF de proposito (ver
            // 'reset' abaixo) pra forcar a troca de banco real no primeiro
            // load_screen, mesmo que a 1a tela caia no banco 0 por coincidencia.
            $lines[] = 'cur_prg_bank: .res 1';
        }
        $lines[] = 'scroll_x:   .res 1  ; Camada 5: fine scroll (0-255) dentro do par de telas visivel';
        $lines[] = 'nt_page:    .res 1  ; Camada 5: 0/1 - qual nametable fisica ($2000/$2400) tem a tela esquerda';
        // Item scroll vertical: mesma ideia de scroll_x/nt_page, so' que pro
        // eixo Y (mirroring horizontal da PPU - nametables empilhadas em
        // vez de lado a lado). So' um dos dois pares e' realmente usado por
        // ROM (Project.data.scrollOrientation, ver header) - ficam os dois
        // sempre declarados por simplicidade (RAM comum sobra), so' o NMI
        // e' que decide qual escrever de verdade.
        $lines[] = 'scroll_y:     .res 1  ; fine scroll vertical (0-255) dentro do par de telas visivel';
        $lines[] = 'nt_row_page:  .res 1  ; 0/1 - qual nametable fisica ($2000/$2800) tem a tela de CIMA';
        $lines[] = 'gcw_col:    .res 1  ; scratch: coluna de pixel mundial pro check de parede durante scroll';
        $lines[] = 'gcw_sel:    .res 1  ; scratch: 0=tela esquerda(play_idx) 1=tela direita(play_idx+1)';
        $lines[] = 'gcw_screen: .res 1  ; scratch: indice global de tela resolvido p/ get_collision2';
        $lines[] = 'psn_screen:  .res 1  ; scratch: indice global de tela p/ preload_screen_nt';
        $lines[] = 'psn_base_hi:.res 1  ; scratch: $20/$24 (scroll horizontal) ou $20/$28 (scroll vertical) - pagina fisica alvo do preload_screen_nt';
        $lines[] = 'nmi_flag:   .res 1';
        $lines[] = 'tmp0:       .res 1';
        $lines[] = 'tmp1:       .res 1';
        $lines[] = 'player_x:   .res 1';
        $lines[] = 'player_y:   .res 1';
        $lines[] = 'player_on:  .res 1    ; 0=oculto 1=visivel';
        $lines[] = 'player_flip:.res 1    ; 0=normal !=0 flip H';
        $lines[] = 'player_frame: .res 1  ; frame atual da animacao do heroi (mesmo pool de sprite dos inimigos)';
        $lines[] = 'player_timer: .res 1  ; frames restantes ate proximo frame';
        $lines[] = 'player_anim_start: .res 1  ; Fase 9 fix (rodada 4): inicio (indice global de frame) da animacao ativa';
        $lines[] = 'player_anim_end:   .res 1  ; fim EXCLUSIVO da animacao ativa - animate_player da a volta aqui, nao em @@HERO_FRAMES@@';
        $lines[] = 'player_hb_bottom:      .res 1  ; Fase 9 (hitbox por animacao): substitui as constantes @@HB_*@@ fixas - troca junto quando a animacao ativa troca (ver move_character)';
        $lines[] = 'player_hb_left:        .res 1';
        $lines[] = 'player_hb_right:       .res 1';
        $lines[] = 'player_hb_top_probe:   .res 1';
        $lines[] = 'player_hb_bottom_probe: .res 1';
        $lines[] = 'on_ground:  .res 1';
        $lines[] = 'jump_cnt:   .res 1    ; frames restantes de impulso de pulo';
        $lines[] = 'col_x:      .res 1    ; tile X para consulta';
        $lines[] = 'col_y:      .res 1    ; tile Y para consulta';
        $lines[] = 'col_result: .res 1';
        // Camada 8 (compressão por metatile): scratch de get_collision/
        // get_collision2/mtx_collision_lookup (colisão sem RAM extra, lida
        // direto da ROM) e de mtx_expand_nt (expansão de nametable em
        // load_screen). Sempre declarados - custo fixo pequeno (7 bytes),
        // não vale a pena condicionar a "algum projeto usa compressão".
        $lines[] = 'gc_screen:   .res 1  ; indice de tela (cur_screen ou gcw_screen) pro mtx_collision_lookup compartilhado';
        $lines[] = 'gc2_scratch: .res 1  ; scratch: id local do metatile, depois byte de colisao (mascara+tipo)';
        $lines[] = 'gc2_scratch2:.res 1  ; scratch: cellY*16 (metade do calculo de cellIdx)';
        $lines[] = 'gc2_subpos:  .res 1  ; scratch: 0-3, qual dos 4 quadrantes do metatile (TL/TR/BL/BR)';
        $lines[] = 'mc_ptr_lo:   .res 1  ; ponteiro (baixo) reaproveitado 2x: 1o MetatileIndex_<tela>, depois MetatileCollision_bank<N>';
        $lines[] = 'mc_ptr_hi:   .res 1  ; ponteiro (alto)';
        $lines[] = 'mtx_scratch: .res 1  ; scratch de mtx_expand_nt (load_screen) - guarda 4*idLocal entre as 2 escritas ($2007) de cada subtile';
        if (!empty($ctx['anyBankNeedsFont'])) {
            // Texto sobreposto: so' declara esses 2 bytes se o projeto usa
            // texto de verdade em alguma tela (ver ProjectParser -
            // bankNeedsFont/anyBankNeedsFont) - dto_lcount (quantas camadas
            // de texto faltam processar) e dto_base_hi (byte alto do
            // nametable fisico alvo, $20 no load_screen normal ou o valor
            // de psn_base_hi no preload de scroll). mc_ptr_lo/hi acima sao
            // reaproveitados de novo aqui como scratch da multiplicacao
            // y*32 - livres nesse ponto, mtx_expand_nt ja terminou.
            $lines[] = 'dto_lcount:  .res 1  ; texto sobreposto: camadas restantes';
            $lines[] = 'dto_base_hi: .res 1  ; texto sobreposto: $20 ou $24 (qual nametable fisico)';
        }
        $lines[] = 'play_idx:   .res 1    ; indice 0..playCount-1 na sequencia da fase';
        $lines[] = "; pool de {$numInstances} instancia(s) - SoA pra indexar com LDA tabela,X";
        $lines[] = "inst_x:       .res {$numInstances}";
        $lines[] = "inst_y:       .res {$numInstances}";
        $lines[] = "inst_on:      .res {$numInstances}";
        $lines[] = "inst_dir:     .res {$numInstances}   ; atributo OAM: 0=normal $40=flipH (tb usado p/ patrol)";
        $lines[] = "inst_char:    .res {$numInstances}   ; indice do personagem (CharFrame*,X)";
        $lines[] = "inst_frame:   .res {$numInstances}   ; frame atual da animacao padrao";
        $lines[] = "inst_timer:   .res {$numInstances}   ; frames restantes ate proximo frame";
        $lines[] = "inst_screen:  .res {$numInstances}   ; Fase 9: indice de tela (play_idx) a que inst_x se refere";
        $lines[] = "inst_anim_start: .res {$numInstances}   ; Fase 9 fix (rodada 4): inicio da animacao ativa desta instancia";
        $lines[] = "inst_anim_end:   .res {$numInstances}   ; fim EXCLUSIVO da animacao ativa - animate_instances da a volta aqui";
        $lines[] = 'spn_target:   .res 1   ; Fase 9: indice de tela alvo do spawn_append_screen em andamento';
        $lines[] = 'inst_tmp:     .res 1   ; indice de loop / scratch';
        $lines[] = 'oam_off:      .res 1   ; scratch: offset (via OamOffTable) dentro da pagina $02xx';
        $lines[] = 'inst_scr_x:   .res 1   ; Camada 5: posicao X na tela (inst_x - scroll_x) do slot sendo desenhado';
        // Fase 9 (graficos): scratch do desenho de sprite de tamanho variavel
        // (compartilhado por update_instances_oam e update_player_oam, cada um
        // usa por sua vez - X preservado do lado de fora). Os 4 ponteiros
        // (uio_ptr_*/upo_ptr_*) SAO indireto-indexado (LDA (ptr),Y), por isso
        // tem que estar na ZEROPAGE mesmo.
        $lines[] = 'uio_ptr_dx:   .res 2';
        $lines[] = 'uio_ptr_dy:   .res 2';
        $lines[] = 'uio_ptr_tile: .res 2';
        $lines[] = 'uio_ptr_flip: .res 2';
        $lines[] = 'uio_n:        .res 1   ; contagem de celulas do frame sendo desenhado';
        $lines[] = 'uio_i:        .res 1   ; indice da celula atual no loop de desenho';
        $lines[] = 'uio_oamy:     .res 1   ; offset OAM corrente (Y) dentro do desenho de 1 instancia';
        $lines[] = 'uio_a:        .res 1   ; scratch: dx da celula atual';
        $lines[] = 'uio_b:        .res 1   ; scratch: dy da celula atual';
        $lines[] = 'uio_c:        .res 1   ; scratch: tile da celula atual';
        $lines[] = 'uio_d:        .res 1   ; scratch: flip da celula atual';
        $lines[] = 'uio_hidecnt:  .res 1   ; contador do loop que esconde sprites sobrando';
        $lines[] = 'upo_ptr_dx:   .res 2   ; mesma ideia, so pro player (update_player_oam)';
        $lines[] = 'upo_ptr_dy:   .res 2';
        $lines[] = 'upo_ptr_tile: .res 2';
        $lines[] = 'upo_ptr_flip: .res 2';
        $lines[] = 'upo_n:        .res 1';
        $lines[] = 'upo_i:        .res 1';
        $lines[] = 'upo_oamy:     .res 1';
        $lines[] = 'upo_a:        .res 1';
        $lines[] = 'upo_b:        .res 1';
        $lines[] = 'upo_c:        .res 1';
        $lines[] = 'upo_d:        .res 1';
        $lines[] = 'upo_hidecnt:  .res 1';
        $lines[] = 'ovl_tl:       .res 1   ; sprites sobrepostos do player (Camada 3 fix): tiles + flip+paleta';
        $lines[] = 'ovl_tr:       .res 1';
        $lines[] = 'ovl_bl:       .res 1';
        $lines[] = 'ovl_br:       .res 1';
        $lines[] = 'ovl_tl_fl:    .res 1';
        $lines[] = 'ovl_tr_fl:    .res 1';
        $lines[] = 'ovl_bl_fl:    .res 1';
        $lines[] = 'ovl_br_fl:    .res 1';
        $lines[] = 'ovl_dx:       .res 1';
        $lines[] = 'ovl_dy:       .res 1';
        $lines[] = 'inst_grounded: .res 1  ; scratch: resultado de check_ground_inst (Camada 4)';
        $lines[] = 'en_tmp:     .res 1';
        if (!empty($ctx['musicEnabled'])) {
            $lines[] = 'music_on:   .res 1';
            $lines[] = 'music_chan_mask: .res 1  ; Camada 11: bit i = musica atual usa o canal fisico i';
            // 4 canais FISICOS fixos (0=Pulse1 1=Pulse2 2=Triangle 3=Noise) -
            // sempre os 4, independente de quantos a musica atual usa, porque
            // qualquer musica ou SFX embedado pode usar qualquer canal.
            for ($i = 0; $i < 4; $i++) {
                $lines[] = "sfx_active_ch{$i}: .res 1  ; !=0 = canal tomado por um SFX (musica pausa nele)";
            }
            // Camada 10 (compressão de áudio): só o ponteiro de trabalho do
            // decodificador RLE precisa ser ZP (endereçamento indireto) - os
            // 8 arrays de estado por slot (scale/time × ponteiro/valor/sobra,
            // ver rle_decode_scale/rle_decode_time em music.php) ficam na RAM
            // comum (program_vars_ram), não aqui - ZP é recurso curto demais
            // pra gastar com o que não precisa ser indireto.
            $lines[] = 'rle_ptr_lo:  .res 1';
            $lines[] = 'rle_ptr_hi:  .res 1';
            $lines[] = 'rle_scratch: .res 1';
        }
        return implode("\n", $lines);
    },

    'nmi' => static function(array $ctx): string {
        $music = !empty($ctx['musicEnabled']);
        $lines = [];
        $lines[] = 'NMI:';
        $lines[] = '  PHA';
        $lines[] = '  TXA';
        $lines[] = '  PHA';
        $lines[] = '  TYA';
        $lines[] = '  PHA';
        $lines[] = '  ; OAM DMA';
        $lines[] = '  LDA #0';
        $lines[] = '  STA $2003';
        $lines[] = '  LDA #$02';
        $lines[] = '  STA $4014';
        $lines[] = '  ; garante sprites ligados';
        $lines[] = '  LDA #%00011110';
        $lines[] = '  STA $2001';
        if (!empty($ctx['paletteSwapEnabled'])) {
            // Camada 6 (acao "Trocar Paleta"): tem que rodar ANTES do bloco
            // de scroll logo abaixo - os dois usam $2006, e cada um reseta o
            // latch de endereco (via BIT $2002) por conta propria antes de
            // escrever, entao a ordem entre eles nao importa pro scroll,
            // mas escrever a paleta cedo evita 1 frame de atraso visual.
            $lines[] = '  ; Camada 6: aplica trocas de paleta pendentes (acao "Trocar Paleta")';
            $lines[] = '  LDA pal_pending_mask';
            $lines[] = '  BEQ pal_swap_done';
            $lines[] = '  LDX #0';
            $lines[] = 'pal_swap_loop:';
            $lines[] = '  LDA pal_pending_mask';
            $lines[] = '  AND pal_bit_table,X';
            $lines[] = '  BEQ pal_swap_next';
            $lines[] = '  TXA';
            $lines[] = '  ASL A';
            $lines[] = '  ASL A            ; offset dentro dos 32 bytes de paleta = slot*4';
            $lines[] = '  STA pal_ptr_lo   ; scratch (reaproveitado antes de virar ponteiro abaixo)';
            $lines[] = '  BIT $2002';
            $lines[] = '  LDA #$3F';
            $lines[] = '  STA $2006';
            $lines[] = '  LDA pal_ptr_lo';
            $lines[] = '  STA $2006';
            $lines[] = '  LDA pal_pending_lo,X';
            $lines[] = '  STA pal_ptr_lo';
            $lines[] = '  LDA pal_pending_hi,X';
            $lines[] = '  STA pal_ptr_hi';
            $lines[] = '  LDY #0';
            $lines[] = 'pal_swap_bytes:';
            $lines[] = '  LDA (pal_ptr_lo),Y';
            $lines[] = '  STA $2007';
            $lines[] = '  INY';
            $lines[] = '  CPY #4';
            $lines[] = '  BNE pal_swap_bytes';
            $lines[] = 'pal_swap_next:';
            $lines[] = '  INX';
            $lines[] = '  CPX #8';
            $lines[] = '  BCC pal_swap_loop';
            $lines[] = '  LDA #0';
            $lines[] = '  STA pal_pending_mask';
            $lines[] = 'pal_swap_done:';
        }
        $lines[] = '  ; Camada 5: scroll continuo - so durante o jogo (fora disso fica fixo em 0,0)';
        $lines[] = '  LDA game_state';
        $lines[] = '  CMP #1';
        $lines[] = '  BNE nmi_scroll_static';
        if (($ctx['scrollOrientation'] ?? 'horizontal') === 'vertical') {
            // Item scroll vertical: mirroring HORIZONTAL da PPU - nametables
            // empilhadas ($2000=topo, $2800=baixo, mirror em $2400/$2C00).
            // Bit1 de $2000 escolhe qual das duas e' a "de cima" (bit0 fica
            // sempre 0 aqui - so' existem 2 paginas fisicas distintas nesse
            // mirroring, nao 4). $2005 escreve Y primeiro? NAO - $2005
            // SEMPRE recebe X primeiro depois Y, essa ordem e' fixa no
            // hardware (nao inverte por orientacao) - so' o VALOR de cada
            // um e' que muda (X fica 0 fixo aqui, sem scroll horizontal).
            $lines[] = '  LDA nt_row_page';
            $lines[] = '  ASL A                 ; bit1 = pagina nametable de cima atual (0 ou 2)';
            $lines[] = '  ORA #%10010000';
            $lines[] = '  STA $2000';
            $lines[] = '  BIT $2002';
            $lines[] = '  LDA #0';
            $lines[] = '  STA $2005';
            $lines[] = '  LDA scroll_y';
            $lines[] = '  STA $2005';
        } else {
            $lines[] = '  LDA #%10010000';
            $lines[] = '  ORA nt_page          ; bit0 = pagina nametable esquerda atual';
            $lines[] = '  STA $2000';
            $lines[] = '  BIT $2002';
            $lines[] = '  LDA scroll_x';
            $lines[] = '  STA $2005';
            $lines[] = '  LDA #0';
            $lines[] = '  STA $2005';
        }
        $lines[] = '  JMP nmi_scroll_done';
        $lines[] = 'nmi_scroll_static:';
        $lines[] = '  LDA #%10010000';
        $lines[] = '  STA $2000';
        $lines[] = '  BIT $2002';
        $lines[] = '  LDA #0';
        $lines[] = '  STA $2005';
        $lines[] = '  STA $2005';
        $lines[] = 'nmi_scroll_done:';
        if ($music) $lines[] = '  JSR music_update';
        $lines[] = '  LDA #1';
        $lines[] = '  STA nmi_flag';
        $lines[] = '  PLA';
        $lines[] = '  TAY';
        $lines[] = '  PLA';
        $lines[] = '  TAX';
        $lines[] = '  PLA';
        $lines[] = '  RTI';
        return implode("\n", $lines);
    },



    'input' => static function(array $ctx): string {
        return <<<'ASM'
; Leitura do controle P1 (strobe padrão NES)
read_pad:
  LDA pad1
  STA pad1_old
  LDA #1
  STA $4016
  LDA #0
  STA $4016
  LDX #8
  LDA #0
  STA pad1
rp_loop:
  LDA $4016
  AND #1
  LSR A
  ROR pad1
  DEX
  BNE rp_loop
  ; edge = pad1 & ~pad1_old
  LDA pad1_old
  EOR #$FF
  AND pad1
  STA pad1_edge
  RTS
ASM;
    },

    'reset' => static function(array $ctx): string {
        $splashIdx = (int)($ctx['splashIdx'] ?? 0);
        $playStart = (int)($ctx['playStartIdx'] ?? 0);
        $gameoverIdx = (int)($ctx['gameoverIdx'] ?? 0);
        $secondPlay = $ctx['secondPlayScreenIdx'] ?? null;

        $lines = [];
        $lines[] = 'Reset:';
        $lines[] = '  SEI';
        $lines[] = '  CLD';
        $lines[] = '  LDX #$40';
        $lines[] = '  STX $4017';
        $lines[] = '  LDX #$FF';
        $lines[] = '  TXS';
        $lines[] = '  INX                ; X=0';
        $lines[] = '  STX $2000';
        $lines[] = '  STX $2001';
        $lines[] = '  STX $4010';
        $lines[] = 'vblankwait1:';
        $lines[] = '  BIT $2002';
        $lines[] = '  BPL vblankwait1';
        $lines[] = '  ; clear RAM $0000-$07FF';
        $lines[] = '  LDA #0';
        $lines[] = '  TAX';
        $lines[] = 'clrram:';
        for ($i = 0; $i <= 7; $i++) {
            $lines[] = sprintf('  STA $%02X00,X', $i);
        }
        $lines[] = '  INX';
        $lines[] = '  BNE clrram';
        if (!empty($ctx['autoScrollHEnabled'])) {
            // Default de seguranca ANTES do program_init_vars, que sobrescreve
            // com o valor de verdade escolhido pelo usuario (se a variavel
            // reservada existir - ver allocateVariables). Sem isso, clrram
            // deixaria os bytes em 0 (speed=quase parado, drift=modo nave)
            // se por algum motivo a variavel nao tiver sido criada.
            $lines[] = '  LDA #128';    // 1px/frame
            $lines[] = '  STA auto_scroll_speed';
            $lines[] = '  LDA #1';      // modo plataforma (arrasta o jogador)
            $lines[] = '  STA auto_scroll_drift';
        }
        $lines[] = '  JSR program_init_vars   ; Camada 6: valores iniciais != 0 das variaveis do usuario';
        $lines[] = 'vblankwait2:';
        $lines[] = '  BIT $2002';
        $lines[] = '  BPL vblankwait2';
        if ((int)($ctx['mapperInfo']['mapper'] ?? 0) === 2) {
            // UOROM etapa 2: nao ha' CHR-ROM fisico, so' os tiles REALMENTE
            // usados (nao os 512 slots possiveis - ver
            // ProjectParser::computeChrUploadTrim(), MESMO numero de bytes
            // que chars_segments.php gravou, senao um upload menos/mais do
            // que existe) moram no PRG_FIXED e sao copiados pra CHR-RAM
            // aqui no boot, antes de ligar o rendering. Sprite ($0000) e
            // background ($1000) sao 2 blocos separados (PPU nao e'
            // contiguo entre eles). Reaproveita mc_ptr_lo/mc_ptr_hi (par ZP
            // da colisao por metatile) - nesse ponto do boot load_screen
            // ainda nao rodou, entao esse par esta livre.
            $trim = is_array($ctx['chrUploadTrim'] ?? null) ? $ctx['chrUploadTrim'] : ['spriteBytes' => 4096, 'bgBytes' => 4096];
            $emitUpload = static function (string $label, int $n, string $ppuHi, string $ppuLo) use (&$lines) {
                $pages = intdiv($n, 256);
                $rem = $n % 256;
                $lines[] = "  ; upload CHR-RAM {$label} ({$n} bytes reais, nao os 4096 possiveis)";
                $lines[] = "  LDA #{$ppuHi}";
                $lines[] = '  STA $2006';
                $lines[] = "  LDA #{$ppuLo}";
                $lines[] = '  STA $2006';
                $lines[] = "  LDA #<{$label}";
                $lines[] = '  STA mc_ptr_lo';
                $lines[] = "  LDA #>{$label}";
                $lines[] = '  STA mc_ptr_hi';
                if ($pages > 0) {
                    $lines[] = "  LDX #{$pages}";
                    $lines[] = '  LDY #0';
                    $lines[] = "cu_{$label}_pg:";
                    $lines[] = '  LDA (mc_ptr_lo),Y';
                    $lines[] = '  STA $2007';
                    $lines[] = '  INY';
                    $lines[] = "  BNE cu_{$label}_pg";
                    $lines[] = '  INC mc_ptr_hi';
                    $lines[] = '  DEX';
                    $lines[] = "  BNE cu_{$label}_pg";
                }
                if ($rem > 0) {
                    $lines[] = '  LDY #0';
                    $lines[] = "cu_{$label}_rem:";
                    $lines[] = '  LDA (mc_ptr_lo),Y';
                    $lines[] = '  STA $2007';
                    $lines[] = '  INY';
                    $lines[] = "  CPY #{$rem}";
                    $lines[] = "  BNE cu_{$label}_rem";
                }
            };
            $lines[] = '  BIT $2002';
            $emitUpload('ChrUploadDataSprite', $trim['spriteBytes'], '$00', '$00');
            $lines[] = '  BIT $2002';
            $emitUpload('ChrUploadDataBg', $trim['bgBytes'], '$10', '$00');
        }
        $lines[] = '  ; paletas';
        $lines[] = '  BIT $2002';
        $lines[] = '  LDA #$3F';
        $lines[] = '  STA $2006';
        $lines[] = '  LDA #$00';
        $lines[] = '  STA $2006';
        $lines[] = '  LDX #0';
        $lines[] = 'loadpal:';
        $lines[] = '  LDA PaletteData,X';
        $lines[] = '  STA $2007';
        $lines[] = '  INX';
        $lines[] = '  CPX #32';
        $lines[] = '  BNE loadpal';
        $lines[] = '  ; OAM off-screen';
        $lines[] = '  LDX #0';
        $lines[] = '  LDA #$FF';
        $lines[] = 'clroam:';
        $lines[] = '  STA $0200,X';
        $lines[] = '  INX';
        $lines[] = '  BNE clroam';
        $lines[] = "  ; splash = tela {$splashIdx}";
        $lines[] = '  LDA #0';
        $lines[] = '  STA game_state';
        $lines[] = '  STA player_on';
        if ((int)($ctx['mapperInfo']['mapper'] ?? 0) === 2) {
            // UOROM etapa 2: $FF garante que o 1o load_screen abaixo sempre
            // faz a troca de banco de verdade (RAM no power-on e' lixo, nao
            // da' pra confiar que "por acaso" ja' esta' no banco certo).
            $lines[] = '  LDA #$FF';
            $lines[] = '  STA cur_prg_bank';
        }
        $lines[] = "  LDA #{$splashIdx}";
        $lines[] = '  JSR load_screen';
        $lines[] = '  LDA #1';
        $lines[] = '  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela" (splash inicial no boot)';
        $lines[] = '  STA pv_ev_enter_splash   ; Camada 6: flag nativa "Entrou na Splash" (boot)';
        $lines[] = '  ; Musica so toca via acao Tocar Som (Camada 6) - sem autoplay no boot';
        $lines[] = '  ; scroll 0,0';
        $lines[] = '  LDA #0';
        $lines[] = '  STA $2005';
        $lines[] = '  STA $2005';
        $lines[] = '  ; NMI on, bg @$1000, sprites @$0000';
        $lines[] = '  LDA #%10010000';
        $lines[] = '  STA $2000';
        $lines[] = '  LDA #%00011110';
        $lines[] = '  STA $2001';
        $lines[] = '';
        return implode("\n", $lines);
    },

    'main_loop' => static function(array $ctx): string {
        return <<<'ASM'
; ---- Main loop ----
; O fluxo de estados (Splash/Play/Game Over) vem do bloco game_flow do NGC.
MainLoop:
  LDA nmi_flag
  BEQ MainLoop
  LDA #0
  STA nmi_flag
  JSR read_pad
  LDA game_state
  CMP #0
  BEQ st_splash
  CMP #1
  BEQ st_play
  JMP st_gameover
ASM;
    },

    'collision' => static function(array $ctx): string {
        $asm = <<<'ASM'
; ---- Collision lookup ----
; col_x (0-31), col_y (0-29) -> col_result (tipo 0-3), derivado do
; metatile comprimido (Camada 9: sem tabela de colisão crua, sem RAM extra).
get_collision:
  LDA col_y
  CMP #30
  BCS gc_oob
  LDA col_x
  CMP #32
  BCS gc_oob
  LDX cur_screen
  STX gc_screen
  JSR mtx_collision_lookup
  RTS
gc_oob:
  LDA #0
  STA col_result
  RTS

; ---- Collision lookup for world/scroll ----
; Igual a get_collision, mas usa gcw_screen em vez de cur_screen.
get_collision2:
  LDA col_y
  CMP #30
  BCS gc2_oob
  LDA col_x
  CMP #32
  BCS gc2_oob
  LDX gcw_screen
  STX gc_screen
  JSR mtx_collision_lookup
  RTS
gc2_oob:
  LDA #0
  STA col_result
  RTS

; ---- Camada 9: resolve colisão de uma tela via metatile comprimido, sem
; gastar RAM - lê direto da ROM em 2 passos (qual metatile está nessa
; célula -> qual colisão esse metatile tem). Compartilhada por
; get_collision/get_collision2 - as duas colocam o índice de tela em
; gc_screen antes de chamar aqui.
mtx_collision_lookup:
  LDA col_y
  LSR A
  ASL A
  ASL A
  ASL A
  ASL A
  STA gc2_scratch2
  LDA col_x
  LSR A
  CLC
  ADC gc2_scratch2
  TAY
  LDX gc_screen
  LDA ScreenNtLo,X
  STA mc_ptr_lo
  LDA ScreenNtHi,X
  STA mc_ptr_hi
  LDA (mc_ptr_lo),Y
  STA gc2_scratch
  LDX gc_screen
  LDA ScreenBank,X
  TAX
  LDA MetatileCollisionLo,X
  STA mc_ptr_lo
  LDA MetatileCollisionHi,X
  STA mc_ptr_hi
  LDY gc2_scratch
  LDA (mc_ptr_lo),Y
  STA gc2_scratch
  LDA col_x
  AND #1
  STA gc2_subpos
  LDA col_y
  AND #1
  BEQ mtx_subpos_done
  LDA gc2_subpos
  ORA #2
  STA gc2_subpos
mtx_subpos_done:
  LDX gc2_subpos
  LDA gc2_scratch
  AND MtQuadBit,X
  BEQ mtx_free
  LDA gc2_scratch
  AND #$0F
  STA col_result
  RTS
mtx_free:
  LDA #0
  STA col_result
  RTS

MtQuadBit:
  .byte $10, $20, $40, $80

; ---- World collision coordinate resolver ----
world_col_from:
  CLC
  ADC scroll_x
  STA gcw_col
  LDA #0
  BCC wcf_sel_ok
  LDA #1
wcf_sel_ok:
  STA gcw_sel
  BEQ wcf_use_cur
  ; cruzou pra tela SEGUINTE do par de scroll - so' faz sentido em termos de
  ; sequencia (play_idx+1), cur_screen ainda nao sabe dela.
  LDA play_idx
  CLC
  ADC #1
  TAX
  LDA PlayScreenTable,X
  JMP wcf_store
wcf_use_cur:
  ; Item warp (fix real - achado testando com o usuario): usa cur_screen
  ; DIRETO em vez de PlayScreenTable[play_idx]. Nos casos normais os dois
  ; sao sempre iguais (cur_screen e' mantido em sincronia com play_idx em
  ; todo load_screen/advance_screen_*), mas "Ir para Warp" so' garante
  ; cur_screen certo (load_screen sempre atualiza) - play_idx so' e'
  ; realinhado quando o destino esta na sequencia principal de telas da
  ; fase (ver ProgramCompiler::compileGotoWarp). Destino fora dessa
  ; sequencia (ex: uma tela marcada como splash no grid, mas usada como
  ; alvo de warp de verdade) deixava play_idx apontando pra tela ANTERIOR,
  ; e a colisao (que so' olhava play_idx) ficava lendo o mapa errado ate a
  ; proxima rolagem de tela recalcular tudo.
  LDA cur_screen
wcf_store:
  STA gcw_screen
  LDA gcw_col
  LSR A
  LSR A
  LSR A
  STA col_x
  RTS

; ---- Ground collision probe ----
check_ground:
  LDA #0
  STA on_ground
  LDA player_y
  CLC
  ADC player_hb_bottom
  LSR A
  LSR A
  LSR A
  STA col_y
  LDA player_x
  CLC
  ADC player_hb_left
  JSR world_col_from
  JSR get_collision2
  LDA col_result
  CMP #1
  BEQ cg_yes
  CMP #2
  BEQ cg_yes
  LDA player_x
  CLC
  ADC player_hb_right
  JSR world_col_from
  JSR get_collision2
  LDA col_result
  CMP #1
  BEQ cg_yes
  CMP #2
  BEQ cg_yes
  RTS
cg_yes:
  LDA #1
  STA on_ground
  ; Fase 9 fix (nao "enterrar" com gravidade alta): o passo de queda pode ser
  ; maior que a distancia real ate o chao, entao o pe pode ja ter penetrado
  ; VARIAS linhas solidas no mesmo frame. Sobe linha por linha enquanto a de
  ; cima tambem for solida, ate achar a superficie real (a mesma logica serve
  ; pro caso de hitbox alto/baixo - o pe usado aqui e sempre o de baixo,
  ; player_hb_bottom, entao so anda ate ONDE ESSE pe realmente encosta).
cg_climb:
  LDA col_y
  BEQ cg_climb_done       ; ja na linha 0 do mapa - nao da pra subir mais
  DEC col_y
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BEQ cg_climb_restore    ; linha de cima NAO e solida - achei a superficie real
  JMP cg_climb            ; ainda solida (afundou varias linhas) - sobe mais 1 e checa de novo
cg_climb_restore:
  INC col_y               ; volta pra ultima linha que ERA solida (a superficie real)
cg_climb_done:
  LDA col_y
  ASL A
  ASL A
  ASL A
  SEC
  SBC player_hb_bottom
  STA player_y
  RTS

; ---- Solid collision helper ----
is_solid:
  CMP #1
  BEQ is_yes
  CMP #2
  BEQ is_yes
  LDA #0
  RTS
is_yes:
  LDA #1
  RTS

; ---- Wall collision probe ----
check_wall_at:
  LDA player_y
  CLC
  ADC player_hb_top_probe
  LSR A
  LSR A
  LSR A
  STA col_y
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BNE cw_hit
  LDA player_y
  CLC
  ADC player_hb_bottom_probe
  LSR A
  LSR A
  LSR A
  STA col_y
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BNE cw_hit
  LDA #0
  STA col_result
  RTS
cw_hit:
  LDA #1
  STA col_result
  RTS

; Fase 9 (gravidade None - movimento vertical livre): mesma ideia de
; check_wall_at, so que girada 90 - col_y ja setado pelo chamador, testa os
; 2 pontos HORIZONTAIS do corpo (esquerda/direita) em vez dos verticais.
check_wall_at_vert:
  LDA player_x
  CLC
  ADC player_hb_left
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BNE cwv_hit
  LDA player_x
  CLC
  ADC player_hb_right
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BNE cwv_hit
  LDA #0
  STA col_result
  RTS
cwv_hit:
  LDA #1
  STA col_result
  RTS
ASM;
        return $asm;
    },

    'player_manual_move' => static function(array $ctx): string {
        // Camada 6 Fase 6: sub-rotinas autocontidas pra ação Mover (chamadas
        // via JSR pelas regras) - espelham a MESMA lógica de colisão/scroll
        // de cima (deadzone 96-152, sonda de parede, cruzamento de tela),
        // só que cada uma termina em RTS em vez de encadear com a próxima
        // direção. Ficam sempre presentes (nao dependem do modo de controle
        // no Dashboard) - em modo Automático servem pra movimento roteirizado
        // extra; em modo Via Programação são o ÚNICO jeito do herói andar/pular.
        $asm = <<<'ASM'
mv_hero_left:
  LDX play_idx
  LDA PlayScreenAutoH,X
  BNE mvhl_move       ; tela em auto-scroll: jogador sempre livre - quem rola o mundo e' auto_scroll_update, nao esta acao
  LDA player_x
  CMP #96
  BCC mvhl_deadzone
  JMP mvhl_move
mvhl_deadzone:
  LDX play_idx
  LDA PlayScreenHardCut,X
  BNE mvhl_hardcut_edge
  LDA play_idx
  BNE mvhl_try_scroll
  LDA player_x
  CMP #8
  BCS mvhl_move
  RTS                  ; bloqueado - borda esquerda absoluta do jogo (tela 0)
mvhl_hardcut_edge:
  ; Fase 9 (transicoes de tela): fase configurada como Hard-Cut no Dashboard -
  ; sem scroll continuo aqui, so' anda normal ate a borda de verdade e troca
  ; de tela na hora (try_screen_left ja reusa o mesmo load_screen+respawn do
  ; boot/warp - so' nunca tinha sido ligado a nada ate agora).
  LDA player_x
  CMP #8
  BCS mvhl_move
  JSR try_screen_left
  RTS
mvhl_try_scroll:
  LDA #98
  SEC
  SBC pv_move_speed
  STA mv_calc
  LDA scroll_x
  CLC
  ADC mv_calc
  STA gcw_col
  LDA #0
  BCC mvhl_sel_ok
  LDA #1
mvhl_sel_ok:
  STA gcw_sel
  BEQ mvhl_use_cur
  LDA play_idx
  CLC
  ADC #1
  TAX
  LDA PlayScreenTable,X
  JMP mvhl_store
mvhl_use_cur:
  ; Item warp (fix real, ver comentário completo em world_col_from) - usa
  ; cur_screen direto em vez de PlayScreenTable[play_idx].
  LDA cur_screen
mvhl_store:
  STA gcw_screen
  LDA gcw_col
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR check_wall_at
  LDA col_result
  BNE mvhl_blocked
  LDA scroll_x
  SEC
  SBC pv_move_speed
  STA scroll_x
  BCS mvhl_no_cross
  JSR advance_screen_left
mvhl_no_cross:
  LDA #1
  STA player_flip
  RTS
mvhl_blocked:
  RTS
mvhl_move:
  ; Item auto-scroll (fix real): mesma borda absoluta de up_left_move.
  LDA player_x
  CMP pv_move_speed
  BCS mvhlm_edge_ok
  JMP mvhl_move_blocked
mvhlm_edge_ok:
  LDA player_x
  SEC
  SBC pv_move_speed
  CLC
  ADC player_hb_left
  JSR world_col_from
  JSR check_wall_at
  LDA col_result
  BNE mvhl_move_blocked
  LDA player_x
  SEC
  SBC pv_move_speed
  STA player_x
  LDA #1
  STA player_flip
mvhl_move_blocked:
  RTS

mv_hero_right:
  LDX play_idx
  LDA PlayScreenAutoH,X
  BNE mvhr_move       ; tela em auto-scroll: jogador sempre livre - quem rola o mundo e' auto_scroll_update, nao esta acao
  LDA player_x
  CMP #152
  BCS mvhr_deadzone
  JMP mvhr_move
mvhr_deadzone:
  LDX play_idx
  LDA PlayScreenHardCut,X
  BNE mvhr_hardcut_edge
  LDA play_idx
  CMP #{{LAST_PLAY_IDX}}
  BCC mvhr_try_scroll
  LDA player_x
  CMP #244
  BCC mvhr_move
  RTS                  ; bloqueado - borda direita absoluta do jogo (ultima tela)
mvhr_hardcut_edge:
  LDA player_x
  CMP #244
  BCC mvhr_move
  JSR try_screen_right
  RTS
mvhr_try_scroll:
  LDA #165
  CLC
  ADC pv_move_speed
  STA mv_calc
  LDA scroll_x
  CLC
  ADC mv_calc
  STA gcw_col
  LDA #0
  BCC mvhr_sel_ok
  LDA #1
mvhr_sel_ok:
  STA gcw_sel
  BEQ mvhr_use_cur
  LDA play_idx
  CLC
  ADC #1
  TAX
  LDA PlayScreenTable,X
  JMP mvhr_store
mvhr_use_cur:
  ; Item warp (fix real, ver comentário completo em world_col_from).
  LDA cur_screen
mvhr_store:
  STA gcw_screen
  LDA gcw_col
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR check_wall_at
  LDA col_result
  BNE mvhr_blocked
  LDA scroll_x
  CLC
  ADC pv_move_speed
  STA scroll_x
  BCC mvhr_no_cross
  JSR advance_screen_right
mvhr_no_cross:
  LDA #0
  STA player_flip
  RTS
mvhr_blocked:
  RTS
mvhr_move:
  ; Item auto-scroll (fix real): mesma borda absoluta de up_right_move,
  ; com a mesma folga de 1 tile (ver comentário lá).
  LDA player_x
  CLC
  ADC pv_move_speed
  BCS mvhr_move_blocked
  CMP #248
  BCS mvhr_move_blocked
  LDA player_x
  CLC
  ADC pv_move_speed
  CLC
  ADC player_hb_right
  JSR world_col_from
  JSR check_wall_at
  LDA col_result
  BNE mvhr_move_blocked
  LDA player_x
  CLC
  ADC pv_move_speed
  STA player_x
  LDA #0
  STA player_flip
mvhr_move_blocked:
  RTS

mv_hero_jump:
  LDA on_ground
  BEQ mvhj_done
  LDA pv_jump_force
  BEQ mvhj_done
  STA jump_cnt
  LDA #0
  STA on_ground
mvhj_done:
  RTS
ASM;
        return str_replace('{{LAST_PLAY_IDX}}', (string)(int)($ctx['lastPlayIdx'] ?? 0), $asm);
    },

    'player' => static function(array $ctx): string {
        $lastPlayIdx = (int)($ctx['lastPlayIdx'] ?? 0);
        // Item scroll vertical: mv_hero_up/mv_hero_down (chamadas tanto pela
        // acao "Mover" quanto pelo D-pad automatico em gravidade "None" -
        // ver up_grav_on mais abaixo, JSR mv_hero_up/down direto) ganham um
        // 3o comportamento na borda quando NAO e hard-cut: rola o mundo
        // (scroll_y) em vez de nao fazer nada ("backlog" antigo). So' existe
        // quando a ROM inteira e' de orientacao vertical (mutuamente
        // exclusivo com scroll horizontal, mesma logica de header/mirroring).
        if (($ctx['scrollOrientation'] ?? 'horizontal') === 'vertical') {
            $mvhuScrollBranch = "  LDA scroll_y\n  SEC\n  SBC pv_move_speed\n  STA scroll_y\n  BCS mvhu_noscroll\n  JSR advance_screen_up\nmvhu_noscroll:\n  RTS\n";
            $mvhdScrollBranch = "  LDA scroll_y\n  CLC\n  ADC pv_move_speed\n  STA scroll_y\n  BCC mvhd_noscroll\n  JSR advance_screen_down\nmvhd_noscroll:\n  RTS\n";
        } else {
            $mvhuScrollBranch = "  RTS\n";
            $mvhdScrollBranch = "  RTS\n";
        }
        $asm = <<<'ASM'
update_player:
  LDA player_on
  BNE up_go
  RTS
up_go:
  ; --- horizontal + colisao lateral (Camada 5: deadzone de camera 96-152) ---
  LDA pad1
  AND #%01000000      ; Left bit6
  BNE up_left_check
  JMP up_right
up_left_check:
  LDX play_idx
  LDA PlayScreenAutoH,X
  BNE up_left_move    ; tela em auto-scroll: jogador sempre livre na tela - quem rola o mundo e' auto_scroll_update, nao o D-pad
  LDA player_x
  CMP #96             ; DEADZONE_LEFT
  BCC uls_deadzone    ; player_x < 96 -> tenta rolar em vez de mover o sprite
  JMP up_left_move    ; dentro/alem da deadzone -> movimento livre normal
uls_deadzone:
  LDX play_idx
  LDA PlayScreenHardCut,X
  BNE uls_hardcut_edge
  LDA play_idx
  BNE uls_try_scroll
  ; play_idx==0: nao ha tela anterior - clamp antigo em 8, sem scroll
  LDA player_x
  CMP #8
  BCS up_left_move
  JMP up_right
uls_hardcut_edge:
  ; Fase 9 fix (bug real, achado com projeto de teste do usuario): este e' o
  ; motor AUTOMATICO (roda sozinho toda vez que o D-pad e' lido, sempre que o
  ; modo nao e "Via Programacao") - e' INDEPENDENTE de mv_hero_left/right (so'
  ; usado pela acao "Mover" das regras). O fix de hard-cut so tinha sido
  ; aplicado em mv_hero_left/right - o motor automatico, que e' quem de fato
  ; move o heroi na maioria dos projetos, nunca tinha ganhado essa checagem e
  ; sempre rolava a tela inteira (advance_screen_*) antes de qualquer corte.
  LDA player_x
  CMP #8
  BCS up_left_move
  JSR try_screen_left
  LDA #1
  STA player_flip
  JMP up_jump          ; mesma disciplina de uls_no_cross - nao reprocessa movimento
                        ; na tela recem-trocada no mesmo frame
uls_try_scroll:
  ; testa parede NO MUNDO na posicao proposta. gcw_col precisa ser a coluna
  ; DENTRO DO PAR de telas visivel (scroll_x + posicao NA TELA do player, nao so
  ; o delta) - por isso soma DEADZONE_LEFT(96), nao so o movimento. Selecao de tela
  ; e' sempre por ADC/carry (>=256 -> play_idx+1), independente da direcao do
  ; movimento - e' sobre POSICAO no mundo, nao sobre pra que lado anda.
  ; Camada 6 Fase 5: DEADZONE_LEFT(96) + 2(sonda) - pv_move_speed, calculado
  ; num scratch primeiro pra preservar a mesma logica de carry/overflow do
  ; calculo original (que usava uma constante fixa).
  LDA #98
  SEC
  SBC pv_move_speed
  STA mv_calc
  LDA scroll_x
  CLC
  ADC mv_calc
  STA gcw_col
  LDA #0
  BCC uls_sel_ok      ; sem overflow -> tela atual (play_idx)
  LDA #1              ; overflow -> proxima tela (play_idx+1)
uls_sel_ok:
  STA gcw_sel
  BEQ uls_use_cur
  LDA play_idx
  CLC
  ADC #1
  TAX
  LDA PlayScreenTable,X
  JMP uls_store
uls_use_cur:
  ; Item warp (fix real, ver comentário completo em world_col_from).
  LDA cur_screen
uls_store:
  STA gcw_screen
  LDA gcw_col
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR check_wall_at
  LDA col_result
  BNE up_right         ; bloqueado - segue pro botao direito, igual antes
  ; livre: rola o mundo pra esquerda
  LDA scroll_x
  SEC
  SBC pv_move_speed
  STA scroll_x
  BCS uls_no_cross     ; sem borrow -> nao cruzou 256
  JSR advance_screen_left
uls_no_cross:
  LDA #1
  STA player_flip
  JMP up_jump          ; NAO cair em up_left_move - senao o player anda De novo por
  ; cima do que o scroll ja moveu (dobra a velocidade percebida - bug reportado)
up_left_move:
  ; Item auto-scroll (fix real): sem a deadzone, nada mais impedia o
  ; jogador de estourar x<0 (virava 255 - "atravessar" pro lado errado da
  ; tela). Trata a borda absoluta como parede, mesmo esquema de bloqueio
  ; que ja existe pra colisao normal.
  LDA player_x
  CMP pv_move_speed
  BCS ulm_edge_ok
  JMP up_right          ; bloqueado - borda esquerda absoluta (x-velocidade < 0)
ulm_edge_ok:
  ; tile X na borda esquerda proposta (x-velocidade+hb_left) - movimento livre dentro da deadzone
  LDA player_x
  SEC
  SBC pv_move_speed
  CLC
  ADC player_hb_left
  JSR world_col_from
  JSR check_wall_at
  LDA col_result
  BNE up_right           ; bloqueado
  LDA player_x
  SEC
  SBC pv_move_speed
  STA player_x
  LDA #1
  STA player_flip
up_right:
  LDA pad1
  AND #%10000000      ; Right bit7
  BNE up_right_check
  JMP up_jump
up_right_check:
  LDX play_idx
  LDA PlayScreenAutoH,X
  BNE up_right_move   ; tela em auto-scroll: jogador sempre livre na tela - quem rola o mundo e' auto_scroll_update, nao o D-pad
  LDA player_x
  CMP #152            ; DEADZONE_RIGHT
  BCS urs_deadzone    ; player_x >= 152 -> tenta rolar em vez de mover o sprite
  JMP up_right_move   ; dentro da deadzone -> movimento livre normal
urs_deadzone:
  LDX play_idx
  LDA PlayScreenHardCut,X
  BNE urs_hardcut_edge
  LDA play_idx
  CMP #{{LAST_PLAY_IDX}}
  BCC urs_try_scroll  ; play_idx < ultima tela -> ha pra onde rolar
  ; play_idx == ultima tela: nao ha mais o que rolar - clamp antigo em 232
  LDA player_x
  CMP #232
  BCC up_right_move
  JMP up_jump
urs_hardcut_edge:
  LDA player_x
  CMP #232
  BCC up_right_move
  JSR try_screen_right
  LDA #0
  STA player_flip
  JMP up_jump          ; mesma disciplina de urs_no_cross
urs_try_scroll:
  ; testa parede NO MUNDO (scroll_x + DEADZONE_RIGHT(152) + sonda direita(+13) + pv_move_speed)
  ; Camada 6 Fase 5: 165+velocidade calculado num scratch primeiro (mesma
  ; razao do lado esquerdo - preserva a logica de carry original).
  LDA #165
  CLC
  ADC pv_move_speed
  STA mv_calc
  LDA scroll_x
  CLC
  ADC mv_calc
  STA gcw_col
  LDA #0
  BCC urs_sel_ok      ; sem overflow -> ainda na tela atual (play_idx)
  LDA #1              ; overflow -> proxima tela (play_idx+1)
urs_sel_ok:
  STA gcw_sel
  BEQ urs_use_cur
  LDA play_idx
  CLC
  ADC #1
  TAX
  LDA PlayScreenTable,X
  JMP urs_store
urs_use_cur:
  ; Item warp (fix real, ver comentário completo em world_col_from).
  LDA cur_screen
urs_store:
  STA gcw_screen
  LDA gcw_col
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR check_wall_at
  LDA col_result
  BNE up_jump          ; bloqueado
  ; livre: rola o mundo pra direita
  LDA scroll_x
  CLC
  ADC pv_move_speed
  STA scroll_x
  BCC urs_no_cross     ; sem overflow -> nao cruzou 256
  JSR advance_screen_right
urs_no_cross:
  LDA #0
  STA player_flip
  JMP up_jump
up_right_move:
  ; Item auto-scroll (fix real): borda direita absoluta, com 1 tile (8px) de
  ; folga de propósito - sem essa folga o sprite (mais largo que 1px) ficava
  ; parcialmente exibido do lado ESQUERDO da tela por wraparound de OAM
  ; quando colado bem em x=255 (achado pelo usuário testando).
  LDA player_x
  CLC
  ADC pv_move_speed
  BCS up_jump            ; overflow de verdade (soma >= 256) - sempre bloqueado
  CMP #248
  BCS up_jump             ; soma >= 248 - bloqueado (guarda 1 tile de folga da borda)
  ; tile X na borda direita proposta (x+velocidade+hb_right) - movimento livre dentro da deadzone
  LDA player_x
  CLC
  ADC pv_move_speed
  CLC
  ADC player_hb_right
  JSR world_col_from
  JSR check_wall_at
  LDA col_result
  BNE up_jump            ; bloqueado
  LDA player_x
  CLC
  ADC pv_move_speed
  STA player_x
  LDA #0
  STA player_flip
up_jump:
  ; Fase 9 (gravidade por fase): "None" (Dashboard) - sem queda nem pulo. O
  ; heroi ganha movimento vertical livre (Cima/Baixo), igual Zelda.
  LDX play_idx
  LDA PlayScreenGravityOff,X
  BEQ up_grav_on
  LDA #1
  STA on_ground
  LDA pad1
  AND #%00010000      ; Up bit4
  BEQ uvm_down_check
  JSR mv_hero_up
uvm_down_check:
  LDA pad1
  AND #%00100000      ; Down bit5
  BEQ up_done
  JSR mv_hero_down
  JMP up_done
up_grav_on:
  ; B ou A (edge) + on_ground → pulo
  LDA pad1_edge
  AND #%00000011      ; A ou B
  BEQ up_vert
  LDA on_ground
  BEQ up_vert
  LDA pv_jump_force   ; Camada 6 Fase 5: 0 = pulo desligado ate uma regra Aplicar Forca de Pulo definir
  BEQ up_vert
  STA jump_cnt
  LDA #0
  STA on_ground
up_vert:
  LDA jump_cnt
  BEQ up_fall
  DEC jump_cnt
  LDX play_idx
  LDA player_y
  SEC
  SBC PlayScreenGravityStrength,X
  BCS up_jok
  LDA #0
up_jok:
  STA player_y
  JMP up_done
up_fall:
  JSR check_ground
  LDA on_ground
  BNE up_done
  LDX play_idx
  LDA player_y
  CLC
  ADC PlayScreenGravityStrength,X
  STA player_y
  CMP #240
  BCC up_done
  ; saiu dos limites por baixo (caiu num buraco). Se a fase for Hard-Cut e
  ; houver uma tela vizinha embaixo na grade, desce pra ela (Fase 9 fix -
  ; antes so ficava a flag nativa ligada e o heroi continuava caindo pra
  ; sempre, sem reposicionamento nenhum). Sem vizinho, comportamento de
  ; sempre: so a flag dispara, quem decide o que fazer e' a regra do usuario.
  LDA #1
  STA pv_ev_oob
  LDX play_idx
  LDA PlayScreenHardCut,X
  BEQ up_done
  LDA ScreenNeighborDown,X
  CMP #255
  BEQ up_done
  JSR try_screen_down
up_done:
  JSR animate_player
  JSR update_player_oam
  RTS

; Fase 9 (gravidade None - movimento vertical livre, tipo Zelda). So' anda
; dentro da tela ou, se a fase for Hard-Cut e houver vizinho na grade, troca
; de tela pela borda de cima/baixo (try_screen_up/down).
mv_hero_up:
  LDX play_idx
  LDA PlayScreenAutoV,X
  BNE mvhu_try         ; tela em auto-scroll vertical: jogador sempre livre - quem rola o mundo e' auto_scroll_update_v, nao esta acao
  LDA player_y
  CMP #8
  BCS mvhu_try
  LDX play_idx
  LDA PlayScreenHardCut,X
  BNE mvhu_hardcut_edge
{{MVHU_SCROLL_BRANCH}}mvhu_hardcut_edge:
  JSR try_screen_up
  RTS
mvhu_try:
  ; Item auto-scroll vertical (fix real, mesmo motivo do horizontal): sem a
  ; checagem de borda acima, nada mais impedia player_y<0 estourar (vira
  ; 255 - "atravessar" pro fundo da tela). Trata a borda absoluta como
  ; parede, mesmo esquema que ja existe pra colisao normal.
  LDA player_y
  CMP pv_move_speed
  BCS mvhu_edge_ok
  JMP mvhu_done          ; bloqueado - borda superior absoluta (y-velocidade < 0)
mvhu_edge_ok:
  LDA player_y
  SEC
  SBC pv_move_speed
  CLC
  ADC player_hb_top_probe
  LSR A
  LSR A
  LSR A
  STA col_y
  ; Item warp (fix real, ver comentário completo em world_col_from) - usa
  ; cur_screen direto (movimento vertical nunca cruza pra outra tela).
  LDA cur_screen
  STA gcw_screen
  JSR check_wall_at_vert
  LDA col_result
  BNE mvhu_done
  LDA player_y
  SEC
  SBC pv_move_speed
  STA player_y
mvhu_done:
  RTS

mv_hero_down:
  LDX play_idx
  LDA PlayScreenAutoV,X
  BNE mvhd_try         ; tela em auto-scroll vertical: jogador sempre livre - quem rola o mundo e' auto_scroll_update_v, nao esta acao
  LDA player_y
  CLC
  ADC player_hb_bottom
  CMP #232
  BCC mvhd_try
  LDX play_idx
  LDA PlayScreenHardCut,X
  BNE mvhd_hardcut_edge
{{MVHD_SCROLL_BRANCH}}mvhd_hardcut_edge:
  JSR try_screen_down
  RTS
mvhd_try:
  ; Item auto-scroll vertical (fix real, mesmo motivo do horizontal): mesma
  ; borda absoluta do lado de baixo - sem isso y>255 estourava (virava 0).
  LDA player_y
  CLC
  ADC pv_move_speed
  BCS mvhd_edge_blocked   ; overflow de verdade (soma >= 256) - sempre bloqueado
  CMP #248
  BCC mvhd_edge_ok         ; soma < 248 - ok
mvhd_edge_blocked:
  JMP mvhd_done
mvhd_edge_ok:
  LDA player_y
  CLC
  ADC pv_move_speed
  CLC
  ADC player_hb_bottom_probe
  LSR A
  LSR A
  LSR A
  STA col_y
  ; Item warp (fix real, ver comentário completo em world_col_from).
  LDA cur_screen
  STA gcw_screen
  JSR check_wall_at_vert
  LDA col_result
  BNE mvhd_done
  LDA player_y
  CLC
  ADC pv_move_speed
  STA player_y
mvhd_done:
  RTS

ASM;
        // Camada 6 Fase 6: se o Dashboard estiver em modo "Via Programação",
        // o movimento automático pelo direcional/pulo fica desligado - as
        // 3 leituras de botão que disparam esse dispatcher viram uma
        // constante zero (nunca aciona), sem tocar em mais nada da lógica
        // já validada. O herói só anda/pula via ação Mover (ver
        // mv_hero_left/mv_hero_right/mv_hero_jump, sempre presentes).
        $auto = ($ctx['controlMode'] ?? 'auto') !== 'programmed';
        if (!$auto) {
            $asm = str_replace(
                "  LDA pad1\n  AND #%01000000      ; Left bit6",
                "  LDA #0                ; Camada 6 Fase 6: modo Via Programacao - direcional automatico desligado\n  AND #%01000000",
                $asm
            );
            $asm = str_replace(
                "  LDA pad1\n  AND #%10000000      ; Right bit7",
                "  LDA #0                ; Camada 6 Fase 6: modo Via Programacao - direcional automatico desligado\n  AND #%10000000",
                $asm
            );
            $asm = str_replace(
                "  LDA pad1_edge\n  AND #%00000011      ; A ou B",
                "  LDA #0                ; Camada 6 Fase 6: modo Via Programacao - pulo automatico desligado\n  AND #%00000011",
                $asm
            );
        }
        return str_replace(
            ['{{LAST_PLAY_IDX}}', '{{MVHU_SCROLL_BRANCH}}', '{{MVHD_SCROLL_BRANCH}}'],
            [(string)$lastPlayIdx, $mvhuScrollBranch, $mvhdScrollBranch],
            $asm
        );
    },

    'scroll' => static function(array $ctx): string {
        $lastPlayIdx = max(0, (int)($ctx['lastPlayIdx'] ?? 0));
        $playCount = max(1, (int)($ctx['playCount'] ?? 1));
        $asm = <<<'ASM'
; ---- NGC: screen transitions / continuous scrolling ----
; Hard-cut helpers at the level edges plus the dual-nametable 256px traversal.

goto_play_screen:
  ; A = play_idx -> carrega PlayScreenTable[A]
  TAX
  LDA PlayScreenTable,X
  JSR load_screen
  RTS

; Item cutscene: "Avançar Página" - igual try_screen_right em espírito, mas
; indexada por cur_screen (tela GLOBAL) via ScreenCutRight em vez de play_idx
; via ScreenNeighborRight, porque telas de cutscene nunca entram em playIdxs
; (achado num teste de build real - reaproveitar try_screen_right direto não
; funcionava). Sem reset de player_x/spawn_enemies (cutscene não tem jogador
; andando por ela) - só troca de tela mesmo, ou não faz nada se não houver
; próxima página (255 = fim da fase/cutscene).
advance_page_screen:
  LDX cur_screen
  LDA ScreenCutRight,X
  CMP #255
  BEQ aps_done
  JSR load_screen
  LDA #1
  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela"
aps_done:
  RTS

; Fase 9 fix (grade real): usa o vizinho de verdade da grade 2D da fase
; (ScreenNeighborRight/Left, ver ProjectParser::collectGameScreens) em vez de
; so' incrementar/decrementar play_idx - senao "direita" podia pular pra uma
; sala sem relacao nenhuma espacial (proxima da lista, nao vizinha de fato)
; em qualquer grade com mais de 1 linha usada.
try_screen_right:
  LDX play_idx
  LDA ScreenNeighborRight,X
  CMP #255
  BEQ tsr_done          ; nao ha sala a direita - bloqueado
  STA play_idx
  JSR goto_play_screen
  LDA #12             ; entra pela esquerda
  STA player_x
  JSR spawn_enemies
  LDA #1
  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela" (tambem no hard-cut)
tsr_done:
  RTS

try_screen_left:
  LDX play_idx
  LDA ScreenNeighborLeft,X
  CMP #255
  BEQ tsl_done          ; nao ha sala a esquerda - bloqueado
  STA play_idx
  JSR goto_play_screen
  LDA #230            ; entra pela direita
  STA player_x
  JSR spawn_enemies
  LDA #1
  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela" (tambem no hard-cut)
tsl_done:
  RTS

; Fase 9 (grade 2D / vertical): mesma ideia de try_screen_right/left, so que
; no eixo Y - usado hoje por gravidade "None" (movimento livre) e por cair
; num buraco (out of bounds por baixo -> tenta ir pra tela de baixo).
try_screen_down:
  LDX play_idx
  LDA ScreenNeighborDown,X
  CMP #255
  BEQ tsd_done          ; nao ha sala embaixo - bloqueado
  STA play_idx
  JSR goto_play_screen
  LDA #16             ; entra por cima
  STA player_y
  JSR spawn_enemies
  LDA #1
  STA pv_ev_enter
tsd_done:
  RTS

try_screen_up:
  LDX play_idx
  LDA ScreenNeighborUp,X
  CMP #255
  BEQ tsu_done          ; nao ha sala em cima - bloqueado
  STA play_idx
  JSR goto_play_screen
  LDA #200            ; entra por baixo
  STA player_y
  JSR spawn_enemies
  LDA #1
  STA pv_ev_enter
tsu_done:
  RTS

; Camada 5: cruzamento de tela durante o scroll continuo. Ao cruzar 256px,
; alterna nt_page, avanca play_idx e pre-carrega a proxima tela na pagina que
; acabou de ficar totalmente fora da tela.
advance_screen_right:
  LDA nt_page
  EOR #1
  STA nt_page
  LDA play_idx
  CLC
  ADC #2
  CMP #{{PLAY_COUNT}}
  BCS asr_noload
  TAX
  LDA PlayScreenTable,X
  PHA
  LDA nt_page
  EOR #1
  BEQ asr_base0
  LDA #$24
  JMP asr_baseok
asr_base0:
  LDA #$20
asr_baseok:
  STA psn_base_hi
  PLA
  JSR preload_screen_nt
asr_noload:
  INC play_idx
  LDA play_idx
  TAX
  LDA PlayScreenTable,X
  STA cur_screen
  ; Fase 9 (graficos): NAO limpa mais o pool aqui - os inimigos desta tela ja
  ; foram adiantados (spawn_append_screen) la' atras, quando esta tela ainda
  ; era "a proxima". So' adianta a tela SEGUINTE agora, pra ela tambem ter
  ; toda a janela do scroll pra ser revelada aos poucos (ver
  ; update_instances_oam: quem ja "passou" da tela atual se auto-desliga).
  LDA play_idx
  CLC
  ADC #1
  CMP #{{PLAY_COUNT}}
  BCS asr_no_append
  JSR spawn_append_screen
asr_no_append:
  LDA #1
  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela" (pulso de 1 frame)
  RTS

advance_screen_left:
  LDA nt_page
  EOR #1
  STA nt_page
  ; play_idx-1 ainda nao esta carregada: reutiliza a pagina que acabou de ficar livre.
  LDA play_idx
  SEC
  SBC #1
  BMI asl_noload
  TAX
  LDA PlayScreenTable,X
  PHA
  LDA nt_page
  BEQ asl_base0
  LDA #$24
  JMP asl_baseok
asl_base0:
  LDA #$20
asl_baseok:
  STA psn_base_hi
  PLA
  JSR preload_screen_nt
asl_noload:
  DEC play_idx
  LDA play_idx
  TAX
  LDA PlayScreenTable,X
  STA cur_screen
  JSR spawn_enemies
  LDA #1
  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela" (pulso de 1 frame)
  RTS
ASM;
        // Item scroll vertical: mesma ideia de advance_screen_right/left,
        // espelhada pro eixo Y - reaproveita preload_screen_nt de verdade
        // (ela só escreve "a tela inteira na página X" a partir de A+
        // psn_base_hi, não sabe nem precisa saber se é a vizinha de cima,
        // baixo, esquerda ou direita). $28 é a página física "de baixo" no
        // mirroring horizontal (mesma lógica de $24 ser "direita" no
        // mirroring vertical) - só existe/faz sentido quando
        // scrollOrientation==='vertical' (mutuamente exclusivo com
        // advance_screen_right/left, nunca as duas famílias coexistem numa
        // ROM de verdade).
        if (($ctx['scrollOrientation'] ?? 'horizontal') === 'vertical') {
            $asm .= <<<'ASM'

advance_screen_down:
  LDA nt_row_page
  EOR #1
  STA nt_row_page
  LDA play_idx
  CLC
  ADC #2
  CMP #{{PLAY_COUNT}}
  BCS asd_noload
  TAX
  LDA PlayScreenTable,X
  PHA
  LDA nt_row_page
  EOR #1
  BEQ asd_base0
  LDA #$28
  JMP asd_baseok
asd_base0:
  LDA #$20
asd_baseok:
  STA psn_base_hi
  PLA
  JSR preload_screen_nt
asd_noload:
  INC play_idx
  LDA play_idx
  TAX
  LDA PlayScreenTable,X
  STA cur_screen
  LDA play_idx
  CLC
  ADC #1
  CMP #{{PLAY_COUNT}}
  BCS asd_no_append
  JSR spawn_append_screen
asd_no_append:
  LDA #1
  STA pv_ev_enter
  RTS

advance_screen_up:
  LDA nt_row_page
  EOR #1
  STA nt_row_page
  LDA play_idx
  SEC
  SBC #1
  BMI asu2_noload
  TAX
  LDA PlayScreenTable,X
  PHA
  LDA nt_row_page
  BEQ asu2_base0
  LDA #$28
  JMP asu2_baseok
asu2_base0:
  LDA #$20
asu2_baseok:
  STA psn_base_hi
  PLA
  JSR preload_screen_nt
asu2_noload:
  DEC play_idx
  LDA play_idx
  TAX
  LDA PlayScreenTable,X
  STA cur_screen
  JSR spawn_enemies
  LDA #1
  STA pv_ev_enter
  RTS
ASM;
        }
        // Item auto-scroll horizontal: motor novo, isolado do resto do
        // arquivo (só existe se algum play_idx tiver PlayScreenAutoH=1).
        // auto_scroll_speed (variável reservada, ver ProgramCompiler::
        // allocateVariables) codifica velocidade num único byte sem
        // sub-pixel: n = valor-128; n>=0 -> (n+1) px/frame; n<0 -> 1px a
        // cada (1-n) frames (contador auto_scroll_acc, puramente interno).
        // NÃO faz checagem de parede (Camada de colisão do level design é
        // responsabilidade do usuário aqui - o scroll nunca para sozinho);
        // o jogador pode ficar preso contra uma hitbox e isso é
        // intencional (evento pra Regras tratarem, decidido com o
        // usuário). Para de avançar na última tela da fase (mesmo clamp
        // que o scroll manual já tem).
        if (!empty($ctx['autoScrollHEnabled'])) {
            $asm .= <<<'ASM'

auto_scroll_update:
  ; Item auto-scroll com direção (fix real - a rotina cresceu demais com a
  ; lógica de direção nova e alguns saltos curtos pra asu_end pararam de
  ; alcançar, "branch too far" no ca65). Convertidos pra salto longo
  ; (condição invertida + JMP) - mesmo problema clássico do 6502 já
  ; resolvido em outro lugar do compilador, aqui é feito na mão porque é
  ; ASM cru, não passa pelo helper de regras.
  LDA player_on
  BNE asu_go
  JMP asu_end
asu_go:
  LDX play_idx
  LDA PlayScreenAutoH,X
  BNE asu_go2
  JMP asu_end
asu_go2:
  LDA auto_scroll_speed
  BNE asu_go3            ; byte=0 -> parado de vez (nao arrasta o jogador tambem)
  JMP asu_end
asu_go3:
  LDA PlayScreenAutoHDir,X
  BNE asu_check_first    ; 1 = sentido reverso (esquerda)
  LDA PlayScreenLastInPhase,X
  BEQ asu_speed           ; ultima tela DESTA FASE - nao ha mais scroll (nao pode atravessar pra fase seguinte)
  JMP asu_end
asu_check_first:
  LDA PlayScreenFirstInPhase,X
  BEQ asu_speed           ; primeira tela DESTA FASE (indo pra esquerda) - nao ha mais scroll
  JMP asu_end
asu_speed:
  LDA auto_scroll_speed
  SEC
  SBC #128
  STA mv_calc            ; n com sinal (-127..127, 0 ja' foi tratado acima)
  BMI asu_slow
  ; modo rapido: anda (n+1) px/frame direto
  LDA mv_calc
  CLC
  ADC #1
  STA auto_scroll_step
  JMP asu_advance
asu_slow:
  ; modo lento: anda 1px so' quando o contador bate o limiar (1-n = 1+|n| frames)
  LDA #1
  SEC
  SBC mv_calc
  STA auto_scroll_step   ; reaproveitado como limiar por enquanto
  INC auto_scroll_acc
  LDA auto_scroll_acc
  CMP auto_scroll_step
  BCC asu_end             ; contador ainda nao chegou no limiar - nao mexe no scroll este frame
  LDA #0
  STA auto_scroll_acc
  LDA #1
  STA auto_scroll_step    ; passo real deste frame = 1px
asu_advance:
  LDX play_idx
  LDA PlayScreenAutoHDir,X
  BNE asu_advance_left
  ; ---- sentido padrao: direita ----
  ; "modo plataforma" (auto_scroll_drift!=0): jogador fica parado no
  ; cenario se nao andar por conta propria - o mundo avanca por baixo dele
  ; (player_x recua o mesmo tanto que o scroll avanca), ate' bater na borda
  ; esquerda (0), onde passa a ser arrastado junto. "modo nave"
  ; (auto_scroll_drift==0): player_x nunca recua sozinho - anda junto com a
  ; tela automaticamente, so' o input do jogador move o sprite.
  LDA auto_scroll_drift
  BEQ asu_noplayer_drift
  LDA player_x
  SEC
  SBC auto_scroll_step
  BCS asu_px_ok
  LDA #0
asu_px_ok:
  STA player_x
asu_noplayer_drift:
  LDA scroll_x
  CLC
  ADC auto_scroll_step
  STA scroll_x
  BCC asu_end
  JSR advance_screen_right
  JMP asu_end
asu_advance_left:
  ; ---- sentido reverso: esquerda - mesma ideia, tudo espelhado ----
  LDA auto_scroll_drift
  BEQ asuL_noplayer_drift
  LDA player_x
  CLC
  ADC auto_scroll_step
  CMP #255
  BCC asuL_px_ok
  LDA #255
asuL_px_ok:
  STA player_x
asuL_noplayer_drift:
  LDA scroll_x
  SEC
  SBC auto_scroll_step
  STA scroll_x
  BCS asu_end
  JSR advance_screen_left
asu_end:
  RTS
ASM;
        }
        // Item auto-scroll VERTICAL: espelha auto_scroll_update linha por
        // linha, eixo Y (player_y/scroll_y/PlayScreenAutoV/advance_screen_
        // down) - reaproveita as MESMAS variáveis reservadas
        // (auto_scroll_speed/drift/acc/step), já que orientação é global
        // por ROM e as duas famílias nunca coexistem de verdade.
        if (!empty($ctx['autoScrollVEnabled'])) {
            $asm .= <<<'ASM'

auto_scroll_update_v:
  LDA player_on
  BNE asuv_go
  JMP asuv_end
asuv_go:
  LDX play_idx
  LDA PlayScreenAutoV,X
  BNE asuv_go2
  JMP asuv_end
asuv_go2:
  LDA auto_scroll_speed
  BNE asuv_go3            ; byte=0 -> parado de vez (nao arrasta o jogador tambem)
  JMP asuv_end
asuv_go3:
  LDA PlayScreenAutoVDir,X
  BNE asuv_check_first    ; 1 = sentido reverso (pra cima)
  LDA PlayScreenLastInPhase,X
  BEQ asuv_speed           ; ultima tela DESTA FASE - nao ha mais scroll
  JMP asuv_end
asuv_check_first:
  LDA PlayScreenFirstInPhase,X
  BEQ asuv_speed           ; primeira tela DESTA FASE (indo pra cima) - nao ha mais scroll
  JMP asuv_end
asuv_speed:
  LDA auto_scroll_speed
  SEC
  SBC #128
  STA mv_calc            ; n com sinal (-127..127, 0 ja' tratado acima)
  BMI asuv_slow
  ; modo rapido: anda (n+1) px/frame direto
  LDA mv_calc
  CLC
  ADC #1
  STA auto_scroll_step
  JMP asuv_advance
asuv_slow:
  ; modo lento: anda 1px so' quando o contador bate o limiar (1-n frames)
  LDA #1
  SEC
  SBC mv_calc
  STA auto_scroll_step
  INC auto_scroll_acc
  LDA auto_scroll_acc
  CMP auto_scroll_step
  BCC asuv_end
  LDA #0
  STA auto_scroll_acc
  LDA #1
  STA auto_scroll_step
asuv_advance:
  LDX play_idx
  LDA PlayScreenAutoVDir,X
  BNE asuv_advance_up
  ; ---- sentido padrao: baixo ----
  ; mesma logica de "modo plataforma/nave" da versao horizontal, so' que em
  ; player_y/scroll_y em vez de player_x/scroll_x.
  LDA auto_scroll_drift
  BEQ asuv_noplayer_drift
  LDA player_y
  SEC
  SBC auto_scroll_step
  BCS asuv_py_ok
  LDA #0
asuv_py_ok:
  STA player_y
asuv_noplayer_drift:
  LDA scroll_y
  CLC
  ADC auto_scroll_step
  STA scroll_y
  BCC asuv_end
  JSR advance_screen_down
  JMP asuv_end
asuv_advance_up:
  ; ---- sentido reverso: pra cima - mesma ideia, tudo espelhado ----
  LDA auto_scroll_drift
  BEQ asuvU_noplayer_drift
  LDA player_y
  CLC
  ADC auto_scroll_step
  CMP #255
  BCC asuvU_py_ok
  LDA #255
asuvU_py_ok:
  STA player_y
asuvU_noplayer_drift:
  LDA scroll_y
  SEC
  SBC auto_scroll_step
  STA scroll_y
  BCS asuv_end
  JSR advance_screen_up
asuv_end:
  RTS
ASM;
        }
        // Keep the same limits used by the current frontend generator.
        return str_replace(
            ['{{LAST_PLAY_IDX}}', '{{PLAY_COUNT}}'],
            [(string)$lastPlayIdx, (string)$playCount],
            $asm
        );
    },

];
