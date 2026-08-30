clear_instances:
  LDX #0
ci_loop:
  LDA #0
  STA inst_on,X
  INX
  CPX #@@NUM_INSTANCES@@
  BEQ ci_done
  JMP ci_loop
ci_done:
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
  CPX #@@NUM_INSTANCES@@
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
  ; load_frame_duration usa Y/tmp0/tmp1 como scratch - e' exatamente o que o loop
  ; acima usa como cursor de leitura em EnemyData_N. Sem salvar/restaurar aqui, a
  ; 2a instancia em diante lia lixo (Y resetava, tmp0/tmp1 apontavam pra outra tabela).
  TYA
  PHA
  LDA tmp0
  PHA
  LDA tmp1
  PHA
  JSR load_frame_duration   ; X=slot -> A = duracao do frame 0 do personagem
  STA inst_timer,X
  PLA
  STA tmp1
  PLA
  STA tmp0
  PLA
  TAY
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

; igual load_frame_cellptr, mas aponta pros 4 bytes de FLIP (ja em bits de atributo
; OAM: bit6=H bit7=V) do mesmo frame. Usa tmp0/tmp1 tambem - so' chamar depois de ja
; ter lido os 4 bytes de tile pro scratch (cell_tl..br), senao um sobrescreve o outro.
load_frame_flipptr:
  LDA inst_char,X
  TAY
  LDA CharFrameFlipsLo,Y
  STA tmp0
  LDA CharFrameFlipsHi,Y
  STA tmp1
  LDA inst_frame,X
  ASL A
  ASL A                 ; frame*4
  CLC
  ADC tmp0
  STA tmp0
  BCC lff_done
  INC tmp1
lff_done:
  RTS

; calcula oam_off = $10 + X*16 (X = slot). Preserva X.
uio_calc_off:
  TXA
  ASL A
  ASL A
  ASL A
  ASL A                 ; X*16
  CLC
  ADC #$20               ; pula os 8 sprites do player ($0200-$021F: base+overlay)
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
  ; Camada 5: posicao na tela = inst_x - scroll_x (inimigos sempre pertencem a tela
  ; esquerda atual/cur_screen). Se der borrow, saiu da tela pela esquerda - esconde.
  LDA inst_x,X
  SEC
  SBC scroll_x
  BCS uio_x_ok
  JMP uio_offscreen
uio_x_ok:
  STA inst_scr_x
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
  ; flip autoral por celula (editor: mirror dentro do metatile) - independente do flip
  ; de direcao (inst_dir) que vem a seguir. Os dois se combinam por XOR na escrita.
  JSR load_frame_flipptr
  LDY #0
  LDA (tmp0),Y
  STA cell_tl_fl
  INY
  LDA (tmp0),Y
  STA cell_tr_fl
  INY
  LDA (tmp0),Y
  STA cell_bl_fl
  INY
  LDA (tmp0),Y
  STA cell_br_fl
  LDA inst_dir,X
  BEQ uio_noflip
  ; flip H de direcao: espelha o metasprite trocando TL<->TR e BL<->BR (tile E flip
  ; autoral viajam juntos - cada celula continua com seu proprio flip depois da troca)
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
  LDA cell_tl_fl
  PHA
  LDA cell_tr_fl
  STA cell_tl_fl
  PLA
  STA cell_tr_fl
  LDA cell_bl_fl
  PHA
  LDA cell_br_fl
  STA cell_bl_fl
  PLA
  STA cell_br_fl
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
  LDA cell_tl_fl
  EOR inst_dir,X
  STA $0202,Y
  LDA inst_scr_x
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
  LDA cell_tr_fl
  EOR inst_dir,X
  STA $0206,Y
  LDA inst_scr_x
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
  LDA cell_bl_fl
  EOR inst_dir,X
  STA $020A,Y
  LDA inst_scr_x
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
  LDA cell_br_fl
  EOR inst_dir,X
  STA $020E,Y
  LDA inst_scr_x
  CLC
  ADC #8
  STA $020F,Y
  JMP uio_next
uio_br_hide:
  LDA #$FF
  STA $020C,Y
uio_offscreen:
  JSR uio_calc_off
  LDY oam_off
  LDA #$FF
  STA $0200,Y
  STA $0204,Y
  STA $0208,Y
  STA $020C,Y
  JMP uio_next
uio_next:
  INX
  CPX #@@NUM_INSTANCES@@
  BEQ uio_done
  JMP uio_loop
uio_done:
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
  CPX #@@NUM_INSTANCES@@
  BEQ ai_done
  JMP ai_loop
ai_done:
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
  CPX #@@NUM_INSTANCES@@
  BEQ uia_done
  JMP uia_loop
uia_done:
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
  JSR update_instances_oam
  RTS

; check_player_enemy_hit/player_hurt removidos (Camada 6 Fase 3) - a colisão
; herói-inimigo agora é 100% controlada pelas regras (SE hitbox de
; personagem... toca...), não tem mais bump-back automático embutido.

hide_player:
  LDA #0
  STA player_on
  JSR update_player_oam
  RTS
