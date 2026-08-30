<?php
/**
 * NGC - Templates do sistema NES.
 *
 * Estes blocos são deliberadamente pequenos e independentes.
 * O gerador monta o Assembly final usando apenas os blocos necessários.
 */
return [
    'header' => static function(array $ctx): string {
        // Mantém exatamente o cabeçalho usado pelo gerador atual.
        return <<<'ASM'
.segment "HEADER"
  .byte $4E,$45,$53,$1A,2,1,$01,0,0,0,0,0,0,0,0,0  ; NROM-256 (32KB PRG), vertical mirroring
ASM;
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
        $lines[] = 'scroll_x:   .res 1  ; Camada 5: fine scroll (0-255) dentro do par de telas visivel';
        $lines[] = 'nt_page:    .res 1  ; Camada 5: 0/1 - qual nametable fisica ($2000/$2400) tem a tela esquerda';
        $lines[] = 'gcw_col:    .res 1  ; scratch: coluna de pixel mundial pro check de parede durante scroll';
        $lines[] = 'gcw_sel:    .res 1  ; scratch: 0=tela esquerda(play_idx) 1=tela direita(play_idx+1)';
        $lines[] = 'gcw_screen: .res 1  ; scratch: indice global de tela resolvido p/ get_collision2';
        $lines[] = 'psn_screen:  .res 1  ; scratch: indice global de tela p/ preload_screen_nt';
        $lines[] = 'psn_base_hi:.res 1  ; scratch: $20 ou $24 - pagina fisica alvo do preload_screen_nt';
        $lines[] = 'nmi_flag:   .res 1';
        $lines[] = 'tmp0:       .res 1';
        $lines[] = 'tmp1:       .res 1';
        $lines[] = 'player_x:   .res 1';
        $lines[] = 'player_y:   .res 1';
        $lines[] = 'player_on:  .res 1    ; 0=oculto 1=visivel';
        $lines[] = 'player_flip:.res 1    ; 0=normal !=0 flip H';
        $lines[] = 'player_frame: .res 1  ; frame atual da animacao do heroi (mesmo pool de sprite dos inimigos)';
        $lines[] = 'player_timer: .res 1  ; frames restantes ate proximo frame';
        $lines[] = 'on_ground:  .res 1';
        $lines[] = 'jump_cnt:   .res 1    ; frames restantes de impulso de pulo';
        $lines[] = 'col_x:      .res 1    ; tile X para consulta';
        $lines[] = 'col_y:      .res 1    ; tile Y para consulta';
        $lines[] = 'col_result: .res 1';
        $lines[] = 'ls_count:   .res 1    ; contador load_screen (nao reusa pad)';
        $lines[] = 'play_idx:   .res 1    ; indice 0..playCount-1 na sequencia da fase';
        $lines[] = "; pool de {$numInstances} instancia(s) - SoA pra indexar com LDA tabela,X";
        $lines[] = "inst_x:       .res {$numInstances}";
        $lines[] = "inst_y:       .res {$numInstances}";
        $lines[] = "inst_on:      .res {$numInstances}";
        $lines[] = "inst_dir:     .res {$numInstances}   ; atributo OAM: 0=normal $40=flipH (tb usado p/ patrol)";
        $lines[] = "inst_char:    .res {$numInstances}   ; indice do personagem (CharFrame*,X)";
        $lines[] = "inst_frame:   .res {$numInstances}   ; frame atual da animacao padrao";
        $lines[] = "inst_timer:   .res {$numInstances}   ; frames restantes ate proximo frame";
        $lines[] = 'inst_tmp:     .res 1   ; indice de loop / scratch';
        $lines[] = 'cell_tl:      .res 1   ; scratch: 4 tiles do frame atual sendo desenhado';
        $lines[] = 'cell_tr:      .res 1';
        $lines[] = 'cell_bl:      .res 1';
        $lines[] = 'cell_br:      .res 1';
        $lines[] = 'oam_off:      .res 1   ; scratch: offset ($10 + slot*16) dentro da pagina $02xx';
        $lines[] = 'inst_scr_x:   .res 1   ; Camada 5: posicao X na tela (inst_x - scroll_x) do slot sendo desenhado';
        $lines[] = 'cell_tl_fl:   .res 1   ; flip por celula (bits de atributo OAM ja convertidos) do frame atual';
        $lines[] = 'cell_tr_fl:   .res 1';
        $lines[] = 'cell_bl_fl:   .res 1';
        $lines[] = 'cell_br_fl:   .res 1';
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
        if (($ctx['music'] ?? null) !== null) {
            $lines[] = 'music_on:   .res 1';
            $channelCount = (int)($ctx['musicChannelCount'] ?? 0);
            for ($i = 0; $i < $channelCount; $i++) {
                $lines[] = "ch{$i}_timer: .res 1";
                $lines[] = "ch{$i}_pos:   .res 1";
            }
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
        $lines[] = '  ; Camada 5: scroll continuo - so durante o jogo (fora disso fica fixo em 0,0)';
        $lines[] = '  LDA game_state';
        $lines[] = '  CMP #1';
        $lines[] = '  BNE nmi_scroll_static';
        $lines[] = '  LDA #%10010000';
        $lines[] = '  ORA nt_page          ; bit0 = pagina nametable esquerda atual';
        $lines[] = '  STA $2000';
        $lines[] = '  BIT $2002';
        $lines[] = '  LDA scroll_x';
        $lines[] = '  STA $2005';
        $lines[] = '  LDA #0';
        $lines[] = '  STA $2005';
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
        $music = !empty($ctx['musicEnabled']);

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
        $lines[] = '  JSR program_init_vars   ; Camada 6: valores iniciais != 0 das variaveis do usuario';
        $lines[] = 'vblankwait2:';
        $lines[] = '  BIT $2002';
        $lines[] = '  BPL vblankwait2';
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
        $lines[] = "  LDA #{$splashIdx}";
        $lines[] = '  JSR load_screen';
        if ($music) $lines[] = '  JSR music_init';
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
        return <<<'ASM'
; ---- Collision lookup ----
; col_x (0-31), col_y (0-29) -> col_result (tipo 0-5)
get_collision:
  LDA col_y
  CMP #30
  BCS gc_oob
  LDA col_x
  CMP #32
  BCS gc_oob
  ; offset low = (col_y & 7)*32 + col_x ; page = col_y >> 3
  LDA col_y
  AND #7
  ASL A
  ASL A
  ASL A
  ASL A
  ASL A
  CLC
  ADC col_x
  TAY
  LDX cur_screen
  LDA ScreenColLo,X
  STA tmp0
  LDA ScreenColHi,X
  STA tmp1
  LDA col_y
  LSR A
  LSR A
  LSR A
  CLC
  ADC tmp1
  STA tmp1
  LDA (tmp0),Y
  STA col_result
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
  LDA col_y
  AND #7
  ASL A
  ASL A
  ASL A
  ASL A
  ASL A
  CLC
  ADC col_x
  TAY
  LDX gcw_screen
  LDA ScreenColLo,X
  STA tmp0
  LDA ScreenColHi,X
  STA tmp1
  LDA col_y
  LSR A
  LSR A
  LSR A
  CLC
  ADC tmp1
  STA tmp1
  LDA (tmp0),Y
  STA col_result
  RTS
gc2_oob:
  LDA #0
  STA col_result
  RTS

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
  LDA play_idx
  CLC
  ADC #1
  JMP wcf_have
wcf_use_cur:
  LDA play_idx
wcf_have:
  TAX
  LDA PlayScreenTable,X
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
  ADC #16
  LSR A
  LSR A
  LSR A
  STA col_y
  LDA player_x
  CLC
  ADC #2
  JSR world_col_from
  JSR get_collision2
  LDA col_result
  CMP #1
  BEQ cg_yes
  CMP #2
  BEQ cg_yes
  LDA player_x
  CLC
  ADC #13
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
  LDA col_y
  ASL A
  ASL A
  ASL A
  SEC
  SBC #16
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
  ADC #4
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
  ADC #12
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
ASM;
    },

    'player' => static function(array $ctx): string {
        $lastPlayIdx = (int)($ctx['lastPlayIdx'] ?? 0);
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
  LDA player_x
  CMP #96             ; DEADZONE_LEFT
  BCC uls_deadzone    ; player_x < 96 -> tenta rolar em vez de mover o sprite
  JMP up_left_move    ; dentro/alem da deadzone -> movimento livre normal
uls_deadzone:
  LDA play_idx
  BNE uls_try_scroll
  ; play_idx==0: nao ha tela anterior - clamp antigo em 8, sem scroll
  LDA player_x
  CMP #8
  BCS up_left_move
  JMP up_right
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
  JMP uls_have
uls_use_cur:
  LDA play_idx
uls_have:
  TAX
  LDA PlayScreenTable,X
  STA gcw_screen
  LDA gcw_col
  LSR A
  LSR A
  LSR A
  STA col_x
  LDA player_y
  CLC
  ADC #4
  LSR A
  LSR A
  LSR A
  STA col_y
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BNE up_right         ; bloqueado - segue pro botao direito, igual antes
  LDA player_y
  CLC
  ADC #12
  LSR A
  LSR A
  LSR A
  STA col_y
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BNE up_right
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
  ; tile X na borda esquerda proposta (x-velocidade+2) - movimento livre dentro da deadzone
  LDA player_x
  SEC
  SBC pv_move_speed
  CLC
  ADC #2
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
  LDA player_x
  CMP #152            ; DEADZONE_RIGHT
  BCS urs_deadzone    ; player_x >= 152 -> tenta rolar em vez de mover o sprite
  JMP up_right_move   ; dentro da deadzone -> movimento livre normal
urs_deadzone:
  LDA play_idx
  CMP #{{LAST_PLAY_IDX}}
  BCC urs_try_scroll  ; play_idx < ultima tela -> ha pra onde rolar
  ; play_idx == ultima tela: nao ha mais o que rolar - clamp antigo em 232
  LDA player_x
  CMP #232
  BCC up_right_move
  JMP up_jump
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
  JMP urs_have
urs_use_cur:
  LDA play_idx
urs_have:
  TAX
  LDA PlayScreenTable,X
  STA gcw_screen
  LDA gcw_col
  LSR A
  LSR A
  LSR A
  STA col_x
  LDA player_y
  CLC
  ADC #4
  LSR A
  LSR A
  LSR A
  STA col_y
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BNE up_jump          ; bloqueado
  LDA player_y
  CLC
  ADC #12
  LSR A
  LSR A
  LSR A
  STA col_y
  JSR get_collision2
  LDA col_result
  JSR is_solid
  BNE up_jump
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
  ; tile X na borda direita proposta (x+velocidade+13) - movimento livre dentro da deadzone
  LDA player_x
  CLC
  ADC pv_move_speed
  CLC
  ADC #13
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
  LDA player_y
  SEC
  SBC #4
  BCS up_jok
  LDA #0
up_jok:
  STA player_y
  JMP up_done
up_fall:
  JSR check_ground
  LDA on_ground
  BNE up_done
  LDA player_y
  CLC
  ADC #4
  STA player_y
  CMP #240
  BCC up_done
  ; saiu dos limites - so a flag nativa dispara (Camada 6). Sem regra pra
  ; isso, o heroi so continua caindo (sem reposicionamento automatico).
  LDA #1
  STA pv_ev_oob
up_done:
  JSR animate_player
  JSR update_player_oam
  RTS

ASM;
        return str_replace('{{LAST_PLAY_IDX}}', (string)$lastPlayIdx, $asm);
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

try_screen_right:
  LDA play_idx
  CMP #{{LAST_PLAY_IDX}}
  BCS tsr_done
  INC play_idx
  LDA play_idx
  JSR goto_play_screen
  LDA #12             ; entra pela esquerda
  STA player_x
  JSR spawn_enemies
tsr_done:
  RTS

try_screen_left:
  LDA play_idx
  BEQ tsl_done
  DEC play_idx
  LDA play_idx
  JSR goto_play_screen
  LDA #230            ; entra pela direita
  STA player_x
  JSR spawn_enemies
tsl_done:
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
  JSR spawn_enemies
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
        // Keep the same limits used by the current frontend generator.
        return str_replace(
            ['{{LAST_PLAY_IDX}}', '{{PLAY_COUNT}}'],
            [(string)$lastPlayIdx, (string)$playCount],
            $asm
        );
    },

];
