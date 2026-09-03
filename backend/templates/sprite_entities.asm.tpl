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
  STA inst_anim_start,X
  LDA inst_char,X
  TAY
  LDA CharFirstAnimCount,Y
  STA inst_anim_end,X
  LDA play_idx
  STA inst_screen,X   ; Fase 9: esta instancia pertence a tela play_idx
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

; Fase 9 (graficos): A = indice de tela alvo -> AGREGA os spawns dessa tela
; nas primeiras vagas LIVRES do pool (NAO limpa - quem ja estava ativo
; continua). Cada instancia criada aqui carrega inst_screen,X = A, usado por
; update_instances_oam pra saber se ela ja deveria estar visivel ou nao (ver
; comentario la'). E' assim que os inimigos da PROXIMA tela ficam prontos
; antes dela virar a tela atual - nascem fora da area visivel e vao aparecer
; suavemente conforme o scroll continuo revela a tela, igual o cenario.
spawn_append_screen:
  STA spn_target
  TAX
  LDA EnemySpawnLo,X
  STA tmp0
  LDA EnemySpawnHi,X
  STA tmp1
  LDY #0
  LDA (tmp0),Y
  STA en_tmp
  INY
  LDX #0                 ; X = cursor de vaga livre no pool
sae_findslot:
  LDA en_tmp
  BEQ sae_done
  CPX #@@NUM_INSTANCES@@
  BEQ sae_done            ; pool cheio, ignora o resto (mesma degradacao graciosa de sempre)
  LDA inst_on,X
  BEQ sae_use_slot
  INX
  JMP sae_findslot
sae_use_slot:
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
  STA inst_anim_start,X
  LDA inst_char,X
  TAY
  LDA CharFirstAnimCount,Y
  STA inst_anim_end,X
  LDA spn_target
  STA inst_screen,X
  TYA
  PHA
  LDA tmp0
  PHA
  LDA tmp1
  PHA
  JSR load_frame_duration
  STA inst_timer,X
  PLA
  STA tmp1
  PLA
  STA tmp0
  PLA
  TAY
  INX
  DEC en_tmp
  JMP sae_findslot
sae_done:
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

; ---- Fase 9 (graficos): tamanho variavel de sprite, sem mais o limite 2x2 ----
; X = slot -> tmp0/tmp1 = ponteiro pra tabela (Dx/Dy/TileN/FlipN/TileF/FlipF) do
; frame atual. Y fica sujo, X preservado.
load_dx_ptr:
  LDA inst_char,X
  TAY
  LDA CharDxPtrLoTbl,Y
  STA tmp0
  LDA CharDxPtrHiTbl,Y
  STA tmp1
  LDA inst_frame,X
  ASL A
  TAY
  LDA (tmp0),Y
  PHA
  INY
  LDA (tmp0),Y
  STA tmp1
  PLA
  STA tmp0
  RTS

load_dy_ptr:
  LDA inst_char,X
  TAY
  LDA CharDyPtrLoTbl,Y
  STA tmp0
  LDA CharDyPtrHiTbl,Y
  STA tmp1
  LDA inst_frame,X
  ASL A
  TAY
  LDA (tmp0),Y
  PHA
  INY
  LDA (tmp0),Y
  STA tmp1
  PLA
  STA tmp0
  RTS

load_tilen_ptr:
  LDA inst_char,X
  TAY
  LDA CharTileNPtrLoTbl,Y
  STA tmp0
  LDA CharTileNPtrHiTbl,Y
  STA tmp1
  LDA inst_frame,X
  ASL A
  TAY
  LDA (tmp0),Y
  PHA
  INY
  LDA (tmp0),Y
  STA tmp1
  PLA
  STA tmp0
  RTS

load_flipn_ptr:
  LDA inst_char,X
  TAY
  LDA CharFlipNPtrLoTbl,Y
  STA tmp0
  LDA CharFlipNPtrHiTbl,Y
  STA tmp1
  LDA inst_frame,X
  ASL A
  TAY
  LDA (tmp0),Y
  PHA
  INY
  LDA (tmp0),Y
  STA tmp1
  PLA
  STA tmp0
  RTS

load_tilef_ptr:
  LDA inst_char,X
  TAY
  LDA CharTileFPtrLoTbl,Y
  STA tmp0
  LDA CharTileFPtrHiTbl,Y
  STA tmp1
  LDA inst_frame,X
  ASL A
  TAY
  LDA (tmp0),Y
  PHA
  INY
  LDA (tmp0),Y
  STA tmp1
  PLA
  STA tmp0
  RTS

load_flipf_ptr:
  LDA inst_char,X
  TAY
  LDA CharFlipFPtrLoTbl,Y
  STA tmp0
  LDA CharFlipFPtrHiTbl,Y
  STA tmp1
  LDA inst_frame,X
  ASL A
  TAY
  LDA (tmp0),Y
  PHA
  INY
  LDA (tmp0),Y
  STA tmp1
  PLA
  STA tmp0
  RTS

; X = slot -> A = n (contagem de celulas) do frame atual.
load_frame_n:
  LDA inst_char,X
  TAY
  LDA CharFrameNLo,Y
  STA tmp0
  LDA CharFrameNHi,Y
  STA tmp1
  LDY inst_frame,X
  LDA (tmp0),Y
  RTS

; oam_off por instancia via tabela pronta (evita multiplicar por maxCells em
; runtime - maxCells nao e' necessariamente potencia de 2). Preserva X.
uio_calc_off:
  LDA OamOffTable,X
  STA oam_off
  RTS

; desenha ate NUM_INSTANCES personagens de tamanho variavel (ate @@MAX_CELLS@@
; sprites cada). Le Dx/Dy (mesmos pras 2 orientacoes) + Tile/Flip da
; orientacao normal ou espelhada (inst_dir escolhe qual - ja pre-calculada em
; tempo de build, sem swap em runtime).
update_instances_oam:
  LDX #0
uio_loop:
  LDA inst_on,X
  BNE uio_draw
  JSR uio_calc_off
  LDY oam_off
  LDA #@@MAX_CELLS@@
  STA uio_hidecnt
uio_hide_off:
  LDA #$FF
  STA $0200,Y
  INY
  INY
  INY
  INY
  DEC uio_hidecnt
  BNE uio_hide_off
  JMP uio_next
uio_draw:
  ; Fase 9 (graficos): visibilidade agora e' calculada contra a "posicao
  ; continua" (tela*256+x) em vez de assumir que a instancia sempre pertence
  ; a cur_screen. Isso e' o que permite os inimigos da PROXIMA tela ja
  ; existirem no pool (via spawn_append_screen) sem aparecer/desaparecer do
  ; nada: eles ficam escondidos ate a diferenca de tela bater exatamente com
  ; play_idx, exatamente quando o scroll contInuO ja teria revelado aquele
  ; pedaco da tela (mesmo calculo que o cenario usa por baixo, so' que pra
  ; sprites em vez de nametable).
  SEC
  LDA inst_x,X
  SBC scroll_x
  STA inst_scr_x            ; valido SE a tela bater (ver abaixo)
  LDA inst_screen,X
  SBC play_idx
  BEQ uio_x_ok              ; mesma tela do scroll atual - inst_scr_x ja' esta certo
  BMI uio_far_free
  JMP uio_offscreen         ; tela ainda esta a frente (proxima) - ainda nao chegou a vez dela
uio_far_free:
  JMP uio_offscreen_free    ; tela ja ficou pra tras (passou de vez) - desliga a instancia
uio_x_ok:
  JSR load_dx_ptr
  LDA tmp0
  STA uio_ptr_dx
  LDA tmp1
  STA uio_ptr_dx+1
  JSR load_dy_ptr
  LDA tmp0
  STA uio_ptr_dy
  LDA tmp1
  STA uio_ptr_dy+1
  LDA inst_dir,X
  BEQ uio_pick_normal
  JSR load_tilef_ptr
  LDA tmp0
  STA uio_ptr_tile
  LDA tmp1
  STA uio_ptr_tile+1
  JSR load_flipf_ptr
  LDA tmp0
  STA uio_ptr_flip
  LDA tmp1
  STA uio_ptr_flip+1
  JMP uio_have_ptrs
uio_pick_normal:
  JSR load_tilen_ptr
  LDA tmp0
  STA uio_ptr_tile
  LDA tmp1
  STA uio_ptr_tile+1
  JSR load_flipn_ptr
  LDA tmp0
  STA uio_ptr_flip
  LDA tmp1
  STA uio_ptr_flip+1
uio_have_ptrs:
  JSR load_frame_n
  STA uio_n
  JSR uio_calc_off
  LDA #0
  STA uio_i
  LDA oam_off
  STA uio_oamy
uio_cellloop:
  LDA uio_i
  CMP uio_n
  BCS uio_cellloop_done
  TAY
  LDA (uio_ptr_dx),Y
  STA uio_a
  LDA (uio_ptr_dy),Y
  STA uio_b
  LDA (uio_ptr_tile),Y
  STA uio_c
  LDA (uio_ptr_flip),Y
  STA uio_d
  LDY uio_oamy
  LDA inst_y,X
  CLC
  ADC uio_b
  STA $0200,Y
  LDA uio_c
  STA $0201,Y
  LDA uio_d
  STA $0202,Y
  LDA inst_scr_x
  CLC
  ADC uio_a
  STA $0203,Y
  LDA uio_oamy
  CLC
  ADC #4
  STA uio_oamy
  INC uio_i
  JMP uio_cellloop
uio_cellloop_done:
  ; esconde os slots sobrando ate completar @@MAX_CELLS@@ (frame menor que o
  ; maior do projeto)
  LDA #@@MAX_CELLS@@
  SEC
  SBC uio_n
  BEQ uio_next
  STA uio_hidecnt
  LDY uio_oamy
uio_hide_rest:
  LDA #$FF
  STA $0200,Y
  INY
  INY
  INY
  INY
  DEC uio_hidecnt
  BNE uio_hide_rest
  JMP uio_next
uio_offscreen_free:
  LDA #0
  STA inst_on,X   ; a tela dessa instancia ja ficou pra tras de vez - libera a vaga
uio_offscreen:
  JSR uio_calc_off
  LDY oam_off
  LDA #@@MAX_CELLS@@
  STA uio_hidecnt
uio_offscreen_hide:
  LDA #$FF
  STA $0200,Y
  INY
  INY
  INY
  INY
  DEC uio_hidecnt
  BNE uio_offscreen_hide
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
  LDA inst_anim_end,X
  CMP inst_frame,X      ; Z=1 se estourou (frame chegou no fim da animacao ativa)
  BNE ai_reload
  LDA inst_anim_start,X
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
  LDA inst_char,X
  TAY
  LDA inst_y,X
  CLC
  ADC CharBodyBottom,Y
  LSR A
  LSR A
  LSR A
  STA col_y
  LDA inst_x,X
  CLC
  ADC CharBodyLeft,Y
  LSR A
  LSR A
  LSR A
  STA col_x
  LDA inst_screen,X
  TAY
  LDA PlayScreenTable,Y
  STA gcw_screen
  STX inst_tmp
  JSR get_collision2
  LDX inst_tmp
  LDA col_result
  JSR is_solid
  BNE cgi_yes
  LDA inst_char,X
  TAY
  LDA inst_x,X
  CLC
  ADC CharBodyRight,Y
  LSR A
  LSR A
  LSR A
  STA col_x
  LDA inst_screen,X
  TAY
  LDA PlayScreenTable,Y
  STA gcw_screen
  STX inst_tmp
  JSR get_collision2
  LDX inst_tmp
  LDA col_result
  JSR is_solid
  BNE cgi_yes
  RTS
cgi_yes:
  LDA #1
  STA inst_grounded
  LDA inst_char,X
  TAY
  LDA col_y
  ASL A
  ASL A
  ASL A
  SEC
  SBC CharBodyBottom,Y
  STA inst_y,X
  RTS

; col_x ja setado pelo chamador; testa 2 pontos verticais do corpo (X=slot).
check_wall_at_inst:
  LDA inst_char,X
  TAY
  LDA inst_y,X
  CLC
  ADC CharBodyTopProbe,Y
  LSR A
  LSR A
  LSR A
  STA col_y
  LDA inst_screen,X
  TAY
  LDA PlayScreenTable,Y
  STA gcw_screen
  STX inst_tmp
  JSR get_collision2
  LDX inst_tmp
  LDA col_result
  JSR is_solid
  BNE cwi_hit
  LDA inst_char,X
  TAY
  LDA inst_y,X
  CLC
  ADC CharBodyBottomProbe,Y
  LSR A
  LSR A
  LSR A
  STA col_y
  LDA inst_screen,X
  TAY
  LDA PlayScreenTable,Y
  STA gcw_screen
  STX inst_tmp
  JSR get_collision2
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
  ; indo pra direita: testa parede na borda direita proposta (x+1+CharBodyRight)
  LDA inst_char,X
  TAY
  LDA inst_x,X
  CLC
  ADC #1
  CLC
  ADC CharBodyRight,Y
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
  ; indo pra esquerda: testa parede na borda esquerda proposta (x-1+CharBodyLeft)
  LDA inst_char,X
  TAY
  LDA inst_x,X
  SEC
  SBC #1
  CLC
  ADC CharBodyLeft,Y
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


@@OAM_OFF_TABLE@@

@@BODY_TABLES@@
