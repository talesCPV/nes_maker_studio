; NES Maker Studio - BUILD v0.9.16 - Camada 4: instancias com gravidade + colisao solida
; NROM-256 | inimigos caem/andam respeitando o collisionMap (chao+parede), sem beirada
; Telas: 7 · CHR tiles (fundo): 32/256
; CHR tiles (sprites): 7/256
; Instâncias: 5
;   [0] splash · Splash 1
;   [1] play · Tela 1
;   [2] play · Tela 2
;   [3] play · Tela 3
;   [4] play · Tela 4
;   [5] play · tela final fase 1
;   [6] splash · Game Over
; Musica: dr-wily-stage-1 · 3 canal(is)

.segment "HEADER"
  .byte $4E,$45,$53,$1A,2,1,$01,0,0,0,0,0,0,0,0,0  ; NROM-256 (32KB PRG), vertical mirroring

.segment "ZEROPAGE"
pad1:       .res 1
pad1_old:   .res 1
pad1_edge:  .res 1
game_state: .res 1    ; 0=splash 1=play 2=gameover
cur_screen: .res 1
nmi_flag:   .res 1
tmp0:       .res 1
tmp1:       .res 1
player_x:   .res 1
player_y:   .res 1
player_on:  .res 1    ; 0=oculto 1=visivel
player_flip:.res 1    ; 0=normal !=0 flip H
on_ground:  .res 1
jump_cnt:   .res 1    ; frames restantes de impulso de pulo
col_x:      .res 1    ; tile X para consulta
col_y:      .res 1    ; tile Y para consulta
col_result: .res 1
ls_count:   .res 1    ; contador load_screen (nao reusa pad)
play_idx:   .res 1    ; indice 0..playCount-1 na sequencia da fase
; pool de 5 instancia(s) - SoA pra indexar com LDA tabela,X
inst_x:       .res 5
inst_y:       .res 5
inst_on:      .res 5
inst_dir:     .res 5   ; atributo OAM: 0=normal $40=flipH (tb usado p/ patrol)
inst_char:    .res 5   ; indice do personagem (CharFrame*,X)
inst_frame:   .res 5   ; frame atual da animacao padrao
inst_timer:   .res 5   ; frames restantes ate proximo frame
inst_tmp:     .res 1   ; indice de loop / scratch
cell_tl:      .res 1   ; scratch: 4 tiles do frame atual sendo desenhado
cell_tr:      .res 1
cell_bl:      .res 1
cell_br:      .res 1
oam_off:      .res 1   ; scratch: offset ($10 + slot*16) dentro da pagina $02xx
inst_grounded: .res 1  ; scratch: resultado de check_ground_inst (Camada 4)
en_tmp:     .res 1
music_on:   .res 1
ch0_timer: .res 1
ch0_pos:   .res 1
ch1_timer: .res 1
ch1_pos:   .res 1
ch2_timer: .res 1
ch2_pos:   .res 1

.segment "CODE"

NMI:
  PHA
  TXA
  PHA
  TYA
  PHA
  ; OAM DMA
  LDA #0
  STA $2003
  LDA #$02
  STA $4014
  ; garante sprites ligados
  LDA #%00011110
  STA $2001
  JSR music_update
  LDA #1
  STA nmi_flag
  PLA
  TAY
  PLA
  TAX
  PLA
  RTI

IRQ:
  RTI

music_update:
  LDA music_on
  BNE mu_run
  RTS
mu_run:
mu_ch0:
  LDA ch0_timer
  BEQ mu_ch0_next
  DEC ch0_timer
  JMP mu_ch0_end
mu_ch0_next:
  LDY ch0_pos
  LDA Scale_ch0,Y
  CMP #$FF
  BNE mu_ch0_nof
  LDA #0
  STA ch0_pos
  LDY #0
  LDA Scale_ch0,Y
mu_ch0_nof:
  CMP #$FE
  BNE mu_ch0_play
  LDA #%00110000
  STA $4000
  JMP mu_ch0_end
mu_ch0_play:
  TAX
  LDA Time_ch0,Y
  STA ch0_timer
  INY
  STY ch0_pos
  CPX #0
  BNE mu_ch0_tone
  LDA #%00110000
  STA $4000
  JMP mu_ch0_end
mu_ch0_tone:
  LDA #%10111111
  STA $4000
  LDA PitchLo_ch0,X
  STA $4002
  LDA PitchHi_ch0,X
  STA $4003
mu_ch0_end:
mu_ch1:
  LDA ch1_timer
  BEQ mu_ch1_next
  DEC ch1_timer
  JMP mu_ch1_end
mu_ch1_next:
  LDY ch1_pos
  LDA Scale_ch1,Y
  CMP #$FF
  BNE mu_ch1_nof
  LDA #0
  STA ch1_pos
  LDY #0
  LDA Scale_ch1,Y
mu_ch1_nof:
  CMP #$FE
  BNE mu_ch1_play
  LDA #%00110000
  STA $4004
  JMP mu_ch1_end
mu_ch1_play:
  TAX
  LDA Time_ch1,Y
  STA ch1_timer
  INY
  STY ch1_pos
  CPX #0
  BNE mu_ch1_tone
  LDA #%00110000
  STA $4004
  JMP mu_ch1_end
mu_ch1_tone:
  LDA #%01111111
  STA $4004
  LDA PitchLo_ch1,X
  STA $4006
  LDA PitchHi_ch1,X
  STA $4007
mu_ch1_end:
mu_ch2:
  LDA ch2_timer
  BEQ mu_ch2_next
  DEC ch2_timer
  JMP mu_ch2_end
mu_ch2_next:
  LDY ch2_pos
  LDA Scale_ch2,Y
  CMP #$FF
  BNE mu_ch2_nof
  LDA #0
  STA ch2_pos
  LDY #0
  LDA Scale_ch2,Y
mu_ch2_nof:
  CMP #$FE
  BNE mu_ch2_play
  LDA #%00000000
  STA $4008
  JMP mu_ch2_end
mu_ch2_play:
  TAX
  LDA Time_ch2,Y
  STA ch2_timer
  INY
  STY ch2_pos
  CPX #0
  BNE mu_ch2_tone
  LDA #%00000000
  STA $4008
  JMP mu_ch2_end
mu_ch2_tone:
  LDA #%11111111
  STA $4008
  LDA PitchLo_ch2,X
  STA $400A
  LDA PitchHi_ch2,X
  STA $400B
mu_ch2_end:
  RTS

music_init:
  LDA #0
  STA ch0_timer
  STA ch0_pos
  STA ch1_timer
  STA ch1_pos
  STA ch2_timer
  STA ch2_pos
  LDA #$0F
  STA $4015
  LDA #1
  STA music_on
  RTS

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

; Carrega nametable+attrs da tela A (hard cut, rendering off)
load_screen:
  STA cur_screen
  ; desliga rendering
  LDA #0
  STA $2001
  ; ponteiro da nametable (tabela de 1 byte por tela — SEM ASL)
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
  LDX #4          ; 4×240 = 960 tiles
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
  ; religa rendering (bg + sprites)
  LDA #%00011110
  STA $2001
  RTS

update_player_oam:
  LDA player_on
  BNE upo_draw
  ; esconde: Y=$FF nos 4 slots
  LDA #$FF
  STA $0200
  STA $0204
  STA $0208
  STA $020C
  RTS
upo_draw:
  LDA player_flip
  BEQ upo_noflip
  LDA #%01000000     ; flip H
  STA tmp0
  JMP upo_attr
upo_noflip:
  LDA #0
  STA tmp0
upo_attr:
  ; sprite 0: topo-esq
  LDA player_y
  STA $0200
  LDA #0              ; tile 0
  STA $0201
  LDA tmp0
  STA $0202
  LDA player_x
  STA $0203
  ; sprite 1: topo-dir
  LDA player_y
  STA $0204
  LDA #1              ; tile 1
  STA $0205
  LDA tmp0
  STA $0206
  LDA player_x
  CLC
  ADC #8
  STA $0207
  ; sprite 2: baixo-esq
  LDA player_y
  CLC
  ADC #8
  STA $0208
  LDA #16             ; tile 16
  STA $0209
  LDA tmp0
  STA $020A
  LDA player_x
  STA $020B
  ; sprite 3: baixo-dir
  LDA player_y
  CLC
  ADC #8
  STA $020C
  LDA #17             ; tile 17
  STA $020D
  LDA tmp0
  STA $020E
  LDA player_x
  CLC
  ADC #8
  STA $020F
  ; se flip H, troca tiles L/R para o personagem não ficar invertido só no eixo
  LDA player_flip
  BEQ upo_done
  LDA #1
  STA $0201
  LDA #0
  STA $0205
  LDA #17
  STA $0209
  LDA #16
  STA $020D
upo_done:
  RTS

spawn_player:
  LDA #40             ; X inicial
  STA player_x
  LDA #160            ; Y inicial
  STA player_y
  LDA #0
  STA player_flip
  STA jump_cnt
  STA on_ground
  STA play_idx       ; primeira tela da fase
  LDA #1
  STA player_on
  JSR update_player_oam
  RTS

goto_play_screen:
  ; A = play_idx → carrega PlayScreenTable[A]
  TAX
  LDA PlayScreenTable,X
  JSR load_screen
  RTS

try_screen_right:
  LDA play_idx
  CMP #4
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

clear_instances:
  LDX #0
ci_loop:
  LDA #0
  STA inst_on,X
  INX
  CPX #5
  BNE ci_loop
  RTS

spawn_enemies:
  JSR clear_instances
  LDX play_idx
  LDA EnemySpawnLo,X
  STA tmp0
  LDA EnemySpawnHi,X
  STA tmp1
  LDY #0
  LDA (tmp0),Y          ; count desta tela
  STA en_tmp
  INY
  LDX #0                ; X = slot do pool sendo preenchido
se_loop:
  LDA en_tmp
  BEQ se_done
  CPX #5
  BEQ se_done           ; pool cheio, ignora o resto
  LDA (tmp0),Y
  STA inst_x,X
  INY
  LDA (tmp0),Y
  STA inst_y,X
  INY
  LDA (tmp0),Y
  STA inst_char,X
  INY
  LDA #1
  STA inst_on,X
  LDA #0
  STA inst_dir,X
  STA inst_frame,X
  JSR load_frame_duration   ; X=slot -> A = duracao do frame 0 do personagem
  STA inst_timer,X
  INX
  DEC en_tmp
  JMP se_loop
se_done:
  JSR update_instances_oam
  RTS

; X = slot -> le inst_char,X e inst_frame,X, retorna duracao (frames) em A
load_frame_duration:
  LDA inst_char,X
  TAY
  LDA CharFrameDurLo,Y
  STA tmp0
  LDA CharFrameDurHi,Y
  STA tmp1
  LDY inst_frame,X
  LDA (tmp0),Y
  RTS

; X = slot -> aponta tmp0/tmp1 pros 4 bytes de tile do frame atual (TL,TR,BL,BR;
; $FF = celula oculta). Y fica sujo, X preservado.
load_frame_cellptr:
  LDA inst_char,X
  TAY
  LDA CharFrameCellsLo,Y
  STA tmp0
  LDA CharFrameCellsHi,Y
  STA tmp1
  LDA inst_frame,X
  ASL A
  ASL A                 ; frame*4
  CLC
  ADC tmp0
  STA tmp0
  BCC lfc_done
  INC tmp1
lfc_done:
  RTS

; calcula oam_off = $10 + X*16 (X = slot). Preserva X.
uio_calc_off:
  TXA
  ASL A
  ASL A
  ASL A
  ASL A                 ; X*16
  CLC
  ADC #$10               ; pula os 4 sprites do player ($0200-$020F)
  STA oam_off
  RTS

; desenha ate NUM_INSTANCES metasprites 2x2 (16x16) em $0210+, 4 OAM por slot.
update_instances_oam:
  LDX #0
uio_loop:
  LDA inst_on,X
  BNE uio_draw
  JSR uio_calc_off
  LDY oam_off
  LDA #$FF
  STA $0200,Y
  STA $0204,Y
  STA $0208,Y
  STA $020C,Y
  JMP uio_next
uio_draw:
  JSR load_frame_cellptr
  LDY #0
  LDA (tmp0),Y
  STA cell_tl
  INY
  LDA (tmp0),Y
  STA cell_tr
  INY
  LDA (tmp0),Y
  STA cell_bl
  INY
  LDA (tmp0),Y
  STA cell_br
  LDA inst_dir,X
  BEQ uio_noflip
  ; flip H: espelha o metasprite trocando TL<->TR e BL<->BR
  LDA cell_tl
  PHA
  LDA cell_tr
  STA cell_tl
  PLA
  STA cell_tr
  LDA cell_bl
  PHA
  LDA cell_br
  STA cell_bl
  PLA
  STA cell_br
uio_noflip:
  JSR uio_calc_off
  LDY oam_off
  ; --- TL ---
  LDA cell_tl
  CMP #$FF
  BEQ uio_tl_hide
  LDA inst_y,X
  STA $0200,Y
  LDA cell_tl
  STA $0201,Y
  LDA inst_dir,X
  STA $0202,Y
  LDA inst_x,X
  STA $0203,Y
  JMP uio_tr
uio_tl_hide:
  LDA #$FF
  STA $0200,Y
uio_tr:
  ; --- TR ---
  LDA cell_tr
  CMP #$FF
  BEQ uio_tr_hide
  LDA inst_y,X
  STA $0204,Y
  LDA cell_tr
  STA $0205,Y
  LDA inst_dir,X
  STA $0206,Y
  LDA inst_x,X
  CLC
  ADC #8
  STA $0207,Y
  JMP uio_bl
uio_tr_hide:
  LDA #$FF
  STA $0204,Y
uio_bl:
  ; --- BL ---
  LDA cell_bl
  CMP #$FF
  BEQ uio_bl_hide
  LDA inst_y,X
  CLC
  ADC #8
  STA $0208,Y
  LDA cell_bl
  STA $0209,Y
  LDA inst_dir,X
  STA $020A,Y
  LDA inst_x,X
  STA $020B,Y
  JMP uio_br
uio_bl_hide:
  LDA #$FF
  STA $0208,Y
uio_br:
  ; --- BR ---
  LDA cell_br
  CMP #$FF
  BEQ uio_br_hide
  LDA inst_y,X
  CLC
  ADC #8
  STA $020C,Y
  LDA cell_br
  STA $020D,Y
  LDA inst_dir,X
  STA $020E,Y
  LDA inst_x,X
  CLC
  ADC #8
  STA $020F,Y
  JMP uio_next
uio_br_hide:
  LDA #$FF
  STA $020C,Y
uio_next:
  INX
  CPX #5
  BNE uio_loop
  RTS

; avanca o timer/frame de animacao (idle simples) de cada instancia ativa.
animate_instances:
  LDX #0
ai_loop:
  LDA inst_on,X
  BEQ ai_next
  DEC inst_timer,X
  LDA inst_timer,X
  BNE ai_next
  INC inst_frame,X
  LDA inst_char,X
  TAY
  LDA CharFrameCount,Y
  CMP inst_frame,X      ; Z=1 se estourou (frame chegou no total)
  BNE ai_reload
  LDA #0
  STA inst_frame,X
ai_reload:
  JSR load_frame_duration
  STA inst_timer,X
ai_next:
  INX
  CPX #5
  BNE ai_loop
  RTS

; ---- Camada 4: colisao instancia vs solido (chao/parede), parametrizada por X=slot ----
; mesma logica de check_ground/check_wall_at do player, mas lendo inst_x/inst_y,X.
; X e preservado ao redor de get_collision (que usa X internamente pra ScreenColLo/Hi).
check_ground_inst:
  LDA #0
  STA inst_grounded
  LDA inst_y,X
  CLC
  ADC #16
  LSR A
  LSR A
  LSR A
  STA col_y
  LDA inst_x,X
  CLC
  ADC #2
  LSR A
  LSR A
  LSR A
  STA col_x
  STX inst_tmp
  JSR get_collision
  LDX inst_tmp
  LDA col_result
  JSR is_solid
  BNE cgi_yes
  LDA inst_x,X
  CLC
  ADC #13
  LSR A
  LSR A
  LSR A
  STA col_x
  STX inst_tmp
  JSR get_collision
  LDX inst_tmp
  LDA col_result
  JSR is_solid
  BNE cgi_yes
  RTS
cgi_yes:
  LDA #1
  STA inst_grounded
  LDA col_y
  ASL A
  ASL A
  ASL A
  SEC
  SBC #16
  STA inst_y,X
  RTS

; col_x ja setado pelo chamador; testa 2 pontos verticais do corpo (X=slot).
check_wall_at_inst:
  LDA inst_y,X
  CLC
  ADC #4
  LSR A
  LSR A
  LSR A
  STA col_y
  STX inst_tmp
  JSR get_collision
  LDX inst_tmp
  LDA col_result
  JSR is_solid
  BNE cwi_hit
  LDA inst_y,X
  CLC
  ADC #12
  LSR A
  LSR A
  LSR A
  STA col_y
  STX inst_tmp
  JSR get_collision
  LDX inst_tmp
  LDA col_result
  JSR is_solid
  BNE cwi_hit
  LDA #0
  STA col_result
  RTS
cwi_hit:
  LDA #1
  STA col_result
  RTS

; patrulha com gravidade + colisao real: cai (4px/frame) quando nao tem chao sob os pes;
; quando no chao, anda 1px/frame e vira ao bater numa parede (check_wall_at_inst) ou ao
; chegar no limite de seguranca da tela. Sem deteccao de beirada (pode cair de plataforma -
; decisao explicita, fica pra depois). Usa o bit $40 de inst_dir (mesmo bit do flip H de
; OAM) como 'esta virado pra esquerda' - flip e direcao de movimento sempre batem.
update_instances_ai:
  LDX #0
uia_loop:
  LDA inst_on,X
  BEQ uia_next
  JSR check_ground_inst
  LDA inst_grounded
  BNE uia_walk
  ; caindo: aplica gravidade e nao anda nesse frame
  LDA inst_y,X
  CLC
  ADC #4
  STA inst_y,X
  JMP uia_next
uia_walk:
  LDA inst_dir,X
  AND #$40
  BNE uia_left
  ; indo pra direita: testa parede na borda direita proposta (x+1+13)
  LDA inst_x,X
  CLC
  ADC #1
  CLC
  ADC #13
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR check_wall_at_inst
  LDA col_result
  BNE uia_turn_left
  LDA inst_x,X
  CLC
  ADC #1
  STA inst_x,X
  CMP #232          ; limite de seguranca (evita overflow do byte perto da borda)
  BCC uia_next
uia_turn_left:
  LDA inst_dir,X
  ORA #$40
  STA inst_dir,X
  JMP uia_next
uia_left:
  ; indo pra esquerda: testa parede na borda esquerda proposta (x-1+2)
  LDA inst_x,X
  SEC
  SBC #1
  CLC
  ADC #2
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR check_wall_at_inst
  LDA col_result
  BNE uia_turn_right
  LDA inst_x,X
  SEC
  SBC #1
  STA inst_x,X
  CMP #20           ; limite de seguranca
  BCS uia_next
uia_turn_right:
  LDA inst_dir,X
  AND #$BF
  STA inst_dir,X
uia_next:
  INX
  CPX #5
  BNE uia_loop
  RTS

; --- Acoes genericas (Camada 6 vai chamar via regras compiladas) ---
; X = slot. Mata a instancia (esconde e libera o pool imediatamente).
action_kill_instance:
  LDA #0
  STA inst_on,X
  RTS

; X = slot, A = direcao (0=direita 1=esquerda 2=cima 3=baixo), Y = passo em pixels.
; Ajusta x/y e o flip (inst_dir) de acordo com a direcao. Troca de animacao (o animId
; escolhido na Acao Mover) fica pra quando o compilador de regras (Camada 6) existir -
; hoje so a animacao padrao (animations[0]) de cada personagem roda em runtime.
action_move_instance:
  CMP #0
  BNE ami_1
  STY tmp0
  LDA inst_x,X
  CLC
  ADC tmp0
  STA inst_x,X
  LDA inst_dir,X
  AND #$BF
  STA inst_dir,X
  RTS
ami_1:
  CMP #1
  BNE ami_2
  STY tmp0
  LDA inst_x,X
  SEC
  SBC tmp0
  STA inst_x,X
  LDA inst_dir,X
  ORA #$40
  STA inst_dir,X
  RTS
ami_2:
  CMP #2
  BNE ami_3
  STY tmp0
  LDA inst_y,X
  SEC
  SBC tmp0
  STA inst_y,X
  RTS
ami_3:
  STY tmp0
  LDA inst_y,X
  CLC
  ADC tmp0
  STA inst_y,X
  RTS

; substitui o antigo bloco fixo de patrol+colisao+desenho por personagem
update_enemies:
  JSR update_instances_ai
  JSR animate_instances
  JSR check_player_enemy_hit
  JSR update_instances_oam
  RTS

check_player_enemy_hit:
  LDA player_on
  BEQ cpe_done
  LDX #0
cpe_loop:
  LDA inst_on,X
  BEQ cpe_next
  LDA player_x
  CLC
  ADC #12
  CMP inst_x,X
  BCC cpe_next
  LDA inst_x,X
  CLC
  ADC #12
  CMP player_x
  BCC cpe_next
  LDA player_y
  CLC
  ADC #14
  CMP inst_y,X
  BCC cpe_next
  LDA inst_y,X
  CLC
  ADC #14
  CMP player_y
  BCC cpe_next
  JMP player_hurt
cpe_next:
  INX
  CPX #5
  BNE cpe_loop
cpe_done:
  RTS

player_hurt:
  ; respawn simples na tela atual
  LDA #40
  STA player_x
  LDA #160
  STA player_y
  LDA #0
  STA jump_cnt
  RTS

hide_player:
  LDA #0
  STA player_on
  JSR update_player_oam
  RTS

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

check_ground:
  LDA #0
  STA on_ground
  ; tile Y = (player_y + 16) / 8
  LDA player_y
  CLC
  ADC #16
  LSR A
  LSR A
  LSR A
  STA col_y
  ; tile X esquerdo
  LDA player_x
  CLC
  ADC #2
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR get_collision
  LDA col_result
  CMP #1
  BEQ cg_yes
  CMP #2
  BEQ cg_yes
  ; tile X direito
  LDA player_x
  CLC
  ADC #13
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR get_collision
  LDA col_result
  CMP #1
  BEQ cg_yes
  CMP #2
  BEQ cg_yes
  RTS
cg_yes:
  LDA #1
  STA on_ground
  ; snap Y ao topo do tile
  LDA col_y
  ASL A
  ASL A
  ASL A
  SEC
  SBC #16
  STA player_y
  RTS

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

check_wall_at:
  ; ponto superior (player_y + 4)
  LDA player_y
  CLC
  ADC #4
  LSR A
  LSR A
  LSR A
  STA col_y
  JSR get_collision
  LDA col_result
  JSR is_solid
  BNE cw_hit
  ; ponto medio (player_y + 12)
  LDA player_y
  CLC
  ADC #12
  LSR A
  LSR A
  LSR A
  STA col_y
  JSR get_collision
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

update_player:
  LDA player_on
  BNE up_go
  RTS
up_go:
  ; --- horizontal + colisao lateral ---
  LDA pad1
  AND #%01000000      ; Left bit6
  BEQ up_right
  LDA player_x
  CMP #8
  BCS up_left_move
  JSR try_screen_left
  JMP up_jump
up_left_move:
  ; tile X na borda esquerda proposta (x-3+2)
  LDA player_x
  SEC
  SBC #3
  CLC
  ADC #2
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR check_wall_at
  LDA col_result
  BNE up_right           ; bloqueado
  LDA player_x
  SEC
  SBC #3
  STA player_x
  LDA #1
  STA player_flip
up_right:
  LDA pad1
  AND #%10000000      ; Right bit7
  BEQ up_jump
  LDA player_x
  CMP #232
  BCC up_right_move
  JSR try_screen_right
  JMP up_jump
up_right_move:
  ; tile X na borda direita proposta (x+3+13)
  LDA player_x
  CLC
  ADC #3
  CLC
  ADC #13
  LSR A
  LSR A
  LSR A
  STA col_x
  JSR check_wall_at
  LDA col_result
  BNE up_jump            ; bloqueado
  LDA player_x
  CLC
  ADC #3
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
  LDA #14
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
  ; caiu → respawn
  LDA #40
  STA player_x
  LDA #32
  STA player_y
  LDA #0
  STA jump_cnt
up_done:
  JSR update_player_oam
  RTS

Reset:
  SEI
  CLD
  LDX #$40
  STX $4017
  LDX #$FF
  TXS
  INX                ; X=0
  STX $2000
  STX $2001
  STX $4010
vblankwait1:
  BIT $2002
  BPL vblankwait1
  ; clear RAM $0000-$07FF
  LDA #0
  TAX
clrram:
  STA $0000,X
  STA $0100,X
  STA $0200,X
  STA $0300,X
  STA $0400,X
  STA $0500,X
  STA $0600,X
  STA $0700,X
  INX
  BNE clrram
vblankwait2:
  BIT $2002
  BPL vblankwait2
  ; paletas
  BIT $2002
  LDA #$3F
  STA $2006
  LDA #$00
  STA $2006
  LDX #0
loadpal:
  LDA PaletteData,X
  STA $2007
  INX
  CPX #32
  BNE loadpal
  ; OAM off-screen
  LDX #0
  LDA #$FF
clroam:
  STA $0200,X
  INX
  BNE clroam
  ; splash = tela 0
  LDA #0
  STA game_state
  STA player_on
  LDA #0
  JSR load_screen
  JSR music_init
  ; scroll 0,0
  LDA #0
  STA $2005
  STA $2005
  ; NMI on, bg @$1000, sprites @$0000
  LDA #%10010000
  STA $2000
  LDA #%00011110
  STA $2001

; ---- Main loop ----
; Bits do pad (após ROR x8): A=0 B=1 Select=2 Start=3 Up=4 Down=5 Left=6 Right=7
; START no splash → Fase 1 + spawn Hero
; SELECT no play → Game Over (atalho de teste)
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

st_splash:
  ; bit 3 = START
  LDA pad1_edge
  AND #%00001000
  BEQ MainLoop
  LDA #1
  STA game_state
  LDA #1
  JSR load_screen
  JSR spawn_player
  JSR spawn_enemies
  JSR music_init
  JMP MainLoop

st_play:
  ; fisica + input + inimigos
  JSR update_player
  JSR update_enemies
  ; SELECT → Game Over (teste)
  LDA pad1_edge
  AND #%00000100
  BEQ st_play_done
  LDA #2
  STA game_state
  JSR hide_player
  LDA #6
  JSR load_screen
st_play_done:
  JMP MainLoop

st_gameover:
  ; START no game over → volta pro splash
  LDA pad1_edge
  AND #%00001000
  BEQ MainLoop
  LDA #0
  STA game_state
  JSR hide_player
  LDA #0
  JSR load_screen
  JMP MainLoop

PaletteData:
  .byte $0F, $00, $10, $30, $0F, $06, $16, $26, $0F, $0A, $1A, $2A, $0F, $02, $12, $22
  .byte $0F, $16, $30, $0F, $0F, $19, $29, $39, $0F, $03, $13, $23, $0F, $09, $19, $29

ScreenNtLo:
  .byte <Nametable_0
  .byte <Nametable_1
  .byte <Nametable_2
  .byte <Nametable_3
  .byte <Nametable_4
  .byte <Nametable_5
  .byte <Nametable_6
ScreenNtHi:
  .byte >Nametable_0
  .byte >Nametable_1
  .byte >Nametable_2
  .byte >Nametable_3
  .byte >Nametable_4
  .byte >Nametable_5
  .byte >Nametable_6
ScreenAtLo:
  .byte <Attr_0
  .byte <Attr_1
  .byte <Attr_2
  .byte <Attr_3
  .byte <Attr_4
  .byte <Attr_5
  .byte <Attr_6
ScreenAtHi:
  .byte >Attr_0
  .byte >Attr_1
  .byte >Attr_2
  .byte >Attr_3
  .byte >Attr_4
  .byte >Attr_5
  .byte >Attr_6
ScreenColLo:
  .byte <Collision_0
  .byte <Collision_1
  .byte <Collision_2
  .byte <Collision_3
  .byte <Collision_4
  .byte <Collision_5
  .byte <Collision_6
ScreenColHi:
  .byte >Collision_0
  .byte >Collision_1
  .byte >Collision_2
  .byte >Collision_3
  .byte >Collision_4
  .byte >Collision_5
  .byte >Collision_6
PlayScreenTable:  ; indices globais das telas de jogo (em ordem)
  .byte 1, 2, 3, 4, 5

; hitboxInstances total=7
; play[0] screen=Tela 1 id=scr_1787144379503 spawns=1
; play[1] screen=Tela 2 id=scr_1787144402490 spawns=0
; play[2] screen=Tela 3 id=scr_1787144420490 spawns=2
; play[3] screen=Tela 4 id=scr_1787144430768 spawns=2
; play[4] screen=tela final fase 1 id=scr_1787144451744 spawns=2
EnemyData_0:
  .byte $01, $D8, $C6, $00
EnemyData_1:
  .byte $00, $00, $00, $00
EnemyData_2:
  .byte $02, $64, $64, $00, $75, $22, $00
EnemyData_3:
  .byte $02, $93, $43, $00, $CF, $7F, $00
EnemyData_4:
  .byte $02, $D6, $D1, $00, $6A, $CC, $00
EnemySpawnLo:
  .byte <EnemyData_0
  .byte <EnemyData_1
  .byte <EnemyData_2
  .byte <EnemyData_3
  .byte <EnemyData_4
EnemySpawnHi:
  .byte >EnemyData_0
  .byte >EnemyData_1
  .byte >EnemyData_2
  .byte >EnemyData_3
  .byte >EnemyData_4

CharCells_0:  ; enemy
  .byte $01, $02, $03, $04, $01, $02, $05, $04, $01, $02, $03, $04, $01, $02, $06, $04
CharDur_0:
  .byte 8, 8, 8, 8
CharFrameCellsLo:
  .byte <CharCells_0
CharFrameCellsHi:
  .byte >CharCells_0
CharFrameDurLo:
  .byte <CharDur_0
CharFrameDurHi:
  .byte >CharDur_0
CharFrameCount:
  .byte 4

Nametable_0:  ; Splash 1 (splash)
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $02, $03, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $06, $07, $08, $08, $09, $0A, $0B, $07, $0C, $0A, $0D, $0E, $0F, $07, $10, $0A, $11, $12, $13, $14, $15, $09, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $16, $10, $07, $0C, $0C, $0A, $11, $12, $0E, $10, $12, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $17, $01, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $17, $17
Attr_0:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
Collision_0:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00

Nametable_1:  ; Tela 1 (play)
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $04, $04, $04, $04, $01, $01, $04, $04, $04, $04, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
Attr_1:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
Collision_1:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01

Nametable_2:  ; Tela 2 (play)
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $04, $04, $01, $01, $04, $04, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17
Attr_2:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
Collision_2:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $01, $01, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01

Nametable_3:  ; Tela 3 (play)
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $01, $01, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $01, $01, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $01, $01, $04, $04, $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $01, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
Attr_3:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
Collision_3:
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $01, $01, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00

Nametable_4:  ; Tela 4 (play)
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $01, $01, $02, $04, $04, $04, $04, $05, $17, $17, $17, $17, $17, $17, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $17, $17, $17, $17, $17, $17, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $04, $05, $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $04, $04, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
Attr_4:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
Collision_4:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $01, $01, $01, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $00, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $00, $00, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01

Nametable_5:  ; tela final fase 1 (play)
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $18, $15, $19, $0E, $08, $0A, $11, $1A, $10, $07, $07, $19, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
Attr_5:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
Collision_5:
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01

Nametable_6:  ; Game Over (splash)
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $02, $03, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $1B, $0E, $1C, $07, $0A, $1D, $1E, $07, $10, $1F, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $04, $05
  .byte $02, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $05
  .byte $17, $01, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $05, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
  .byte $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17, $17
Attr_6:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
Collision_6:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00

; --- Music data ---
; canal 0: pulse1
PitchLo_ch0:
  .byte $00, $26, $F8, $89, $F9, $56, $4D, $9D, $4C
PitchHi_ch0:
  .byte $00, $03, $03, $03, $02, $03, $06, $05, $05
Scale_ch0:
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $02, $02
  .byte $02, $02, $02, $02, $02, $02, $02, $02, $02, $02, $02, $02, $03, $03, $03, $03
  .byte $03, $03, $03, $03, $03, $03, $03, $03, $03, $03, $03, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $03, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $02, $02, $02, $02, $02, $02, $02, $02
  .byte $02, $02, $02, $02, $02, $02, $03, $03, $03, $03, $03, $03, $03, $03, $03, $03
  .byte $03, $03, $03, $03, $03, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $03, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $03
  .byte $03, $03, $03, $03, $03, $03, $03, $05, $05, $05, $05, $05, $05, $05, $05, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $02, $02
  .byte $02, $02, $02, $02, $02, $02, $02, $02, $02, $02, $02, $02, $02, $03, $03, $03
  .byte $03, $03, $03, $03, $03, $03, $03, $03, $03, $03, $03, $03, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $03, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $02, $02, $02, $02, $02, $02
  .byte $02, $02, $02, $02, $02, $02, $02, $02, $03, $03, $03, $03, $03, $03, $03, $03
  .byte $03, $03, $03, $03, $03, $03, $03, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $03, $01, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04
  .byte $04, $04, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01, $01
  .byte $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $04, $03
  .byte $03, $03, $03, $03, $03, $03, $03, $05, $05, $05, $05, $05, $05, $05, $02, $02
  .byte $02, $02, $02, $02, $02, $03, $03, $03, $03, $03, $03, $03, $06, $06, $06, $07
  .byte $07, $08, $08, $07, $06, $06, $06, $07, $07, $08, $08, $07, $07, $02, $02, $02
  .byte $02, $02, $02, $02, $03, $03, $03, $03, $03, $03, $05, $01, $01, $01, $01, $01
  .byte $01, $01, $01, $01, $01, $01, $01, $FF
Time_ch0:
  .byte $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $15, $0B, $05, $05, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B
  .byte $0B, $0B, $0B, $15, $0B, $0B, $15, $15, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $15, $0B, $05, $05, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $15, $15, $15, $15

; canal 1: pulse2
PitchLo_ch1:
  .byte $00, $52, $93, $0C, $2D, $67, $C9, $86, $70, $77, $64, $54, $7E, $A9, $6A, $59
  .byte $42, $E1, $FD
PitchHi_ch1:
  .byte $00, $01, $01, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00
Scale_ch1:
  .byte $00, $01, $01, $01, $02, $00, $02, $01, $01, $02, $00, $03, $04, $03, $00, $01
  .byte $01, $01, $02, $00, $03, $00, $04, $00, $01, $00, $04, $00, $00, $04, $04, $04
  .byte $05, $00, $03, $00, $04, $00, $01, $00, $05, $00, $02, $00, $06, $07, $08, $09
  .byte $09, $09, $00, $00, $06, $07, $08, $09, $08, $0A, $00, $01, $01, $01, $02, $00
  .byte $02, $01, $01, $02, $00, $03, $04, $03, $00, $01, $01, $01, $02, $00, $03, $00
  .byte $04, $00, $01, $00, $04, $00, $00, $04, $04, $04, $05, $00, $03, $00, $04, $00
  .byte $01, $00, $05, $00, $02, $00, $06, $07, $08, $09, $09, $09, $00, $00, $06, $07
  .byte $08, $09, $08, $0A, $0A, $0A, $0A, $0A, $00, $08, $0B, $0B, $0A, $0A, $08, $08
  .byte $0A, $0A, $08, $08, $08, $00, $08, $0A, $0A, $07, $0C, $07, $0D, $0D, $07, $08
  .byte $0A, $0A, $0A, $0A, $00, $08, $0B, $0B, $0A, $0A, $08, $08, $0A, $0A, $08, $08
  .byte $08, $08, $00, $08, $07, $08, $00, $00, $0E, $0E, $0F, $10, $10, $10, $00, $00
  .byte $01, $01, $01, $02, $00, $02, $01, $01, $01, $02, $00, $03, $04, $03, $00, $01
  .byte $01, $01, $02, $00, $03, $00, $04, $00, $01, $00, $04, $00, $00, $00, $04, $04
  .byte $04, $05, $00, $03, $00, $04, $00, $01, $00, $05, $00, $02, $00, $06, $07, $08
  .byte $09, $09, $09, $00, $00, $06, $07, $08, $09, $08, $0A, $00, $01, $01, $01, $02
  .byte $00, $02, $01, $01, $01, $02, $00, $03, $04, $03, $00, $01, $01, $01, $02, $00
  .byte $03, $00, $04, $00, $01, $00, $04, $00, $00, $04, $04, $04, $05, $00, $03, $00
  .byte $04, $00, $01, $00, $05, $00, $02, $00, $06, $07, $08, $09, $09, $09, $00, $00
  .byte $06, $07, $08, $09, $08, $0A, $0A, $0A, $0A, $08, $0B, $0B, $0A, $0A, $08, $08
  .byte $0A, $0A, $08, $08, $08, $00, $08, $0A, $0A, $07, $0C, $07, $0D, $0D, $07, $08
  .byte $0A, $0A, $0A, $0A, $00, $08, $0B, $0B, $0A, $0A, $08, $08, $0A, $0A, $08, $08
  .byte $08, $08, $00, $08, $07, $08, $00, $00, $0E, $0E, $0F, $10, $10, $01, $00, $05
  .byte $01, $05, $01, $06, $11, $11, $12, $12, $03, $03, $04, $04, $04, $00, $03, $03
  .byte $00, $03, $00, $00, $04, $00, $03, $03, $00, $03, $00, $04, $01, $00, $01, $01
  .byte $05, $01, $06, $11, $11, $12, $12, $03, $03, $04, $04, $05, $01, $05, $02, $02
  .byte $02, $02, $00, $00, $00, $00, $00, $FF
Time_ch1:
  .byte $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $15, $0B, $05, $05, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B
  .byte $0B, $0B, $0B, $15, $0B, $0B, $15, $15, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $15, $0B, $05, $05, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $15, $15, $15, $15

; canal 2: triangle
PitchLo_ch2:
  .byte $00, $1A, $5C, $C4, $FB, $A6, $CE, $93, $52, $0C, $2D, $67
PitchHi_ch2:
  .byte $00, $02, $02, $01, $01, $02, $02, $01, $01, $01, $01, $01
Scale_ch2:
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $01
  .byte $01, $01, $01, $01, $02, $03, $03, $04, $04, $01, $01, $04, $04, $01, $01, $01
  .byte $01, $01, $01, $02, $03, $03, $04, $04, $01, $01, $04, $04, $05, $05, $05, $05
  .byte $05, $02, $01, $06, $06, $06, $06, $06, $06, $06, $06, $06, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $07, $07, $07, $07, $07
  .byte $03, $07, $00, $08, $08, $08, $09, $0A, $08, $0B, $07, $07, $07, $07, $07, $03
  .byte $07, $00, $08, $08, $08, $08, $0A, $08, $0B, $0B, $0B, $0B, $07, $03, $09, $09
  .byte $09, $0A, $0A, $08, $08, $0B, $0B, $0B, $08, $0B, $07, $07, $07, $07, $07, $07
  .byte $07, $07, $07, $07, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $FF
Time_ch2:
  .byte $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $15, $0B, $05, $05, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $05, $05, $0B
  .byte $0B, $0B, $0B, $15, $0B, $0B, $15, $15, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $15, $0B, $05, $05, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15, $0B, $0B
  .byte $15, $15, $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B
  .byte $0B, $15, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $0B, $15, $0B, $0B, $0B, $0B, $15
  .byte $0B, $05, $05, $15, $15, $15, $15

.segment "VECTORS"
  .word NMI
  .word Reset
  .word IRQ

.segment "CHARS"
  ; pg0 sprites (empacotado a partir dos frames dos personagens) / pg1 background empacotado
  .byte $00, $00, $00, $1F, $10, $10, $12, $10, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $80, $C3, $EC, $F0, $F1, $E3, $E0, $C0, $80, $C0, $E3, $EF, $EE, $DC, $DF, $BF
  .byte $80, $60, $18, $04, $84, $82, $02, $41, $00, $80, $E0, $F8, $78, $7C, $FC, $BE
  .byte $A7, $F9, $C2, $E6, $F4, $E3, $C0, $80, $98, $C0, $C1, $E1, $F3, $E0, $C0, $80
  .byte $C2, $02, $04, $04, $18, $60, $C0, $80, $3C, $FC, $F8, $F8, $E0, $80, $40, $80
  .byte $A7, $F8, $C0, $E1, $F1, $E3, $C1, $80, $98, $C0, $C0, $E0, $F0, $E0, $C0, $80
  .byte $A1, $E3, $FC, $F0, $FC, $E3, $C0, $80, $9E, $DC, $E3, $EF, $F3, $E0, $C0, $80
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  ; $1000 background
  .byte $00, $00, $00, $1F, $10, $10, $12, $10, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $FF, $01, $01, $01, $FF, $10, $10, $FF, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $FF, $21, $21, $21, $FF, $01, $01, $01, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $FF, $80, $80, $80, $FF, $88, $88, $88, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $66, $66, $66, $7E, $66, $66, $66, $00, $66, $66, $66, $7E, $66, $66, $66, $00
  .byte $00, $00, $3C, $66, $7E, $60, $3C, $00, $00, $00, $3C, $66, $7E, $60, $3C, $00
  .byte $38, $18, $18, $18, $18, $18, $18, $00, $38, $18, $18, $18, $18, $18, $18, $00
  .byte $00, $00, $3C, $66, $66, $66, $3C, $00, $00, $00, $3C, $66, $66, $66, $3C, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $61, $71, $79, $5D, $4F, $47, $43, $00, $61, $71, $79, $5D, $4F, $47, $43, $00
  .byte $00, $00, $3E, $60, $3C, $06, $7C, $00, $00, $00, $3E, $60, $3C, $06, $7C, $00
  .byte $83, $C7, $EF, $BB, $93, $83, $83, $00, $83, $C7, $EF, $BB, $93, $83, $83, $00
  .byte $00, $00, $3C, $06, $3E, $66, $3E, $00, $00, $00, $3C, $06, $3E, $66, $3E, $00
  .byte $60, $60, $66, $6C, $78, $6C, $66, $00, $60, $60, $66, $6C, $78, $6C, $66, $00
  .byte $00, $00, $36, $3E, $30, $30, $30, $00, $00, $00, $36, $3E, $30, $30, $30, $00
  .byte $1C, $32, $38, $1C, $0E, $26, $1C, $00, $1C, $32, $38, $1C, $0E, $26, $1C, $00
  .byte $18, $18, $3C, $18, $18, $18, $0C, $00, $18, $18, $3C, $18, $18, $18, $0C, $00
  .byte $00, $00, $66, $66, $66, $66, $3E, $00, $00, $00, $66, $66, $66, $66, $3E, $00
  .byte $06, $06, $3E, $66, $66, $66, $3E, $00, $06, $06, $3E, $66, $66, $66, $3E, $00
  .byte $18, $00, $18, $18, $18, $18, $18, $00, $18, $00, $18, $18, $18, $18, $18, $00
  .byte $7C, $66, $66, $7C, $60, $60, $60, $00, $7C, $66, $66, $7C, $60, $60, $60, $00
  .byte $FF, $01, $01, $01, $FF, $10, $10, $10, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $7E, $60, $60, $7C, $60, $60, $60, $00, $7E, $60, $60, $7C, $60, $60, $60, $00
  .byte $00, $00, $7C, $66, $66, $66, $66, $00, $00, $00, $7C, $66, $66, $66, $66, $00
  .byte $00, $00, $3C, $62, $60, $62, $3C, $00, $00, $00, $3C, $62, $60, $62, $3C, $00
  .byte $3C, $62, $60, $6E, $66, $66, $3C, $00, $3C, $62, $60, $6E, $66, $66, $3C, $00
  .byte $00, $00, $FE, $DB, $DB, $DB, $DB, $00, $00, $00, $FE, $DB, $DB, $DB, $DB, $00
  .byte $3C, $66, $66, $66, $66, $66, $3C, $00, $3C, $66, $66, $66, $66, $66, $3C, $00
  .byte $00, $00, $66, $66, $66, $64, $78, $00, $00, $00, $66, $66, $66, $64, $78, $00
  .byte $18, $18, $18, $18, $00, $18, $18, $00, $18, $18, $18, $18, $00, $18, $18, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00
  .byte $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00, $00