; ---- Fase 9 (graficos): corpo do heroi com tamanho variavel (sem mais o
; limite 2x2) - mesmas tabelas Dx/Dy/TileN/FlipN/TileF/FlipF dos inimigos,
; so' que indexadas direto pelo indice fixo do heroi (@@HERO@@) em vez de
; inst_char,X. O overlay (recolor, mt.overlay) continua fixo em 2x2, logo
; abaixo, agora comecando em @@PLAYER_OV_BASE@@ (deslocado pra depois dos
; ate @@MAX_CELLS@@ sprites do corpo).
load_player_dx_ptr:
  LDA CharDxPtrLoTbl+@@HERO@@
  STA tmp0
  LDA CharDxPtrHiTbl+@@HERO@@
  STA tmp1
  LDA player_frame
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

load_player_dy_ptr:
  LDA CharDyPtrLoTbl+@@HERO@@
  STA tmp0
  LDA CharDyPtrHiTbl+@@HERO@@
  STA tmp1
  LDA player_frame
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

load_player_tilen_ptr:
  LDA CharTileNPtrLoTbl+@@HERO@@
  STA tmp0
  LDA CharTileNPtrHiTbl+@@HERO@@
  STA tmp1
  LDA player_frame
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

load_player_flipn_ptr:
  LDA CharFlipNPtrLoTbl+@@HERO@@
  STA tmp0
  LDA CharFlipNPtrHiTbl+@@HERO@@
  STA tmp1
  LDA player_frame
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

load_player_tilef_ptr:
  LDA CharTileFPtrLoTbl+@@HERO@@
  STA tmp0
  LDA CharTileFPtrHiTbl+@@HERO@@
  STA tmp1
  LDA player_frame
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

load_player_flipf_ptr:
  LDA CharFlipFPtrLoTbl+@@HERO@@
  STA tmp0
  LDA CharFlipFPtrHiTbl+@@HERO@@
  STA tmp1
  LDA player_frame
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

load_player_n:
  LDA CharFrameNLo+@@HERO@@
  STA tmp0
  LDA CharFrameNHi+@@HERO@@
  STA tmp1
  LDY player_frame
  LDA (tmp0),Y
  RTS

update_player_oam:
  LDA player_on
  BNE upo_draw
  ; esconde corpo (ate @@MAX_CELLS@@) + overlay (4) - @@PLAYER_TOTAL_SLOTS@@ sprites
  LDY #0
  LDA #@@PLAYER_TOTAL_SLOTS@@
  STA upo_hidecnt
upo_hide_boot:
  LDA #$FF
  STA $0200,Y
  INY
  INY
  INY
  INY
  DEC upo_hidecnt
  BNE upo_hide_boot
  RTS
upo_draw:
  LDA player_flip
  BEQ upo_pick_normal
  JSR load_player_tilef_ptr
  LDA tmp0
  STA upo_ptr_tile
  LDA tmp1
  STA upo_ptr_tile+1
  JSR load_player_flipf_ptr
  LDA tmp0
  STA upo_ptr_flip
  LDA tmp1
  STA upo_ptr_flip+1
  JMP upo_have_ptrs
upo_pick_normal:
  JSR load_player_tilen_ptr
  LDA tmp0
  STA upo_ptr_tile
  LDA tmp1
  STA upo_ptr_tile+1
  JSR load_player_flipn_ptr
  LDA tmp0
  STA upo_ptr_flip
  LDA tmp1
  STA upo_ptr_flip+1
upo_have_ptrs:
  JSR load_player_dx_ptr
  LDA tmp0
  STA upo_ptr_dx
  LDA tmp1
  STA upo_ptr_dx+1
  JSR load_player_dy_ptr
  LDA tmp0
  STA upo_ptr_dy
  LDA tmp1
  STA upo_ptr_dy+1
  JSR load_player_n
  STA upo_n
  LDA #0
  STA upo_i
  STA upo_oamy
upo_cellloop:
  LDA upo_i
  CMP upo_n
  BCS upo_cellloop_done
  TAY
  LDA (upo_ptr_dx),Y
  STA upo_a
  LDA (upo_ptr_dy),Y
  STA upo_b
  LDA (upo_ptr_tile),Y
  STA upo_c
  LDA (upo_ptr_flip),Y
  STA upo_d
  LDY upo_oamy
  LDA player_y
  CLC
  ADC upo_b
  STA $0200,Y
  LDA upo_c
  STA $0201,Y
  LDA upo_d
  STA $0202,Y
  LDA player_x
  CLC
  ADC upo_a
  STA $0203,Y
  LDA upo_oamy
  CLC
  ADC #4
  STA upo_oamy
  INC upo_i
  JMP upo_cellloop
upo_cellloop_done:
  LDA #@@MAX_CELLS@@
  SEC
  SBC upo_n
  BEQ upo_overlay
  STA upo_hidecnt
  LDY upo_oamy
upo_hide_rest:
  LDA #$FF
  STA $0200,Y
  INY
  INY
  INY
  INY
  DEC upo_hidecnt
  BNE upo_hide_rest

; --- sprites sobrepostos do player (mt.overlay) - continua fixo 2x2, agora
; comecando em @@PLAYER_OV_BASE@@ (logo apos os ate @@MAX_CELLS@@ sprites do
; corpo). Le do MESMO indice de frame que a camada base (CharOv*_@@HERO@@),
; independente do flip de direcao (v1: overlay nao espelha automaticamente
; com a direcao - desenha sempre como autorado).
upo_overlay:
  ; Camada 3 fix: escolhe a tabela normal ou espelhada (*Flip) dependendo da direcao -
  ; o espelhamento (posicao+conteudo+dx) ja foi calculado em JS na geracao do build,
  ; aqui so' escolhemos qual conjunto de tabelas ler.
  LDA player_flip
  BEQ upo_ov_normal
  LDA player_frame
  ASL A
  ASL A
  CLC
  ADC #<CharOvCellsFlip_@@HERO@@
  STA tmp0
  LDA #>CharOvCellsFlip_@@HERO@@
  ADC #0
  STA tmp1
  JMP upo_ov_read_cells
upo_ov_normal:
  LDA player_frame
  ASL A
  ASL A
  CLC
  ADC #<CharOvCells_@@HERO@@
  STA tmp0
  LDA #>CharOvCells_@@HERO@@
  ADC #0
  STA tmp1
upo_ov_read_cells:
  LDY #0
  LDA (tmp0),Y
  STA ovl_tl
  INY
  LDA (tmp0),Y
  STA ovl_tr
  INY
  LDA (tmp0),Y
  STA ovl_bl
  INY
  LDA (tmp0),Y
  STA ovl_br
  LDA player_flip
  BEQ upo_ov_flips_normal
  LDA player_frame
  ASL A
  ASL A
  CLC
  ADC #<CharOvFlipsFlip_@@HERO@@
  STA tmp0
  LDA #>CharOvFlipsFlip_@@HERO@@
  ADC #0
  STA tmp1
  JMP upo_ov_read_flips
upo_ov_flips_normal:
  LDA player_frame
  ASL A
  ASL A
  CLC
  ADC #<CharOvFlips_@@HERO@@
  STA tmp0
  LDA #>CharOvFlips_@@HERO@@
  ADC #0
  STA tmp1
upo_ov_read_flips:
  LDY #0
  LDA (tmp0),Y
  STA ovl_tl_fl
  INY
  LDA (tmp0),Y
  STA ovl_tr_fl
  INY
  LDA (tmp0),Y
  STA ovl_bl_fl
  INY
  LDA (tmp0),Y
  STA ovl_br_fl
  LDA player_flip
  BEQ upo_ov_dx_normal
  LDY player_frame
  LDA CharOvDxFlip_@@HERO@@,Y
  STA ovl_dx
  JMP upo_ov_dy
upo_ov_dx_normal:
  LDY player_frame
  LDA CharOvDx_@@HERO@@,Y
  STA ovl_dx
upo_ov_dy:
  LDY player_frame
  LDA CharOvDy_@@HERO@@,Y
  STA ovl_dy
  ; --- overlay TL ---
  LDA ovl_tl
  CMP #$FF
  BEQ upo_ov_tl_hide
  LDA player_y
  CLC
  ADC ovl_dy
  STA @@PLAYER_OV_BASE@@
  LDA ovl_tl
  STA @@PLAYER_OV_BASE@@+1
  LDA ovl_tl_fl
  STA @@PLAYER_OV_BASE@@+2
  LDA player_x
  CLC
  ADC ovl_dx
  STA @@PLAYER_OV_BASE@@+3
  JMP upo_ov_tr
upo_ov_tl_hide:
  LDA #$FF
  STA @@PLAYER_OV_BASE@@
upo_ov_tr:
  ; --- overlay TR ---
  LDA ovl_tr
  CMP #$FF
  BEQ upo_ov_tr_hide
  LDA player_y
  CLC
  ADC ovl_dy
  STA @@PLAYER_OV_BASE@@+4
  LDA ovl_tr
  STA @@PLAYER_OV_BASE@@+5
  LDA ovl_tr_fl
  STA @@PLAYER_OV_BASE@@+6
  LDA player_x
  CLC
  ADC ovl_dx
  CLC
  ADC #8
  STA @@PLAYER_OV_BASE@@+7
  JMP upo_ov_bl
upo_ov_tr_hide:
  LDA #$FF
  STA @@PLAYER_OV_BASE@@+4
upo_ov_bl:
  ; --- overlay BL ---
  LDA ovl_bl
  CMP #$FF
  BEQ upo_ov_bl_hide
  LDA player_y
  CLC
  ADC ovl_dy
  CLC
  ADC #8
  STA @@PLAYER_OV_BASE@@+8
  LDA ovl_bl
  STA @@PLAYER_OV_BASE@@+9
  LDA ovl_bl_fl
  STA @@PLAYER_OV_BASE@@+10
  LDA player_x
  CLC
  ADC ovl_dx
  STA @@PLAYER_OV_BASE@@+11
  JMP upo_ov_br
upo_ov_bl_hide:
  LDA #$FF
  STA @@PLAYER_OV_BASE@@+8
upo_ov_br:
  ; --- overlay BR ---
  LDA ovl_br
  CMP #$FF
  BEQ upo_ov_br_hide
  LDA player_y
  CLC
  ADC ovl_dy
  CLC
  ADC #8
  STA @@PLAYER_OV_BASE@@+12
  LDA ovl_br
  STA @@PLAYER_OV_BASE@@+13
  LDA ovl_br_fl
  STA @@PLAYER_OV_BASE@@+14
  LDA player_x
  CLC
  ADC ovl_dx
  CLC
  ADC #8
  STA @@PLAYER_OV_BASE@@+15
  RTS
upo_ov_br_hide:
  LDA #$FF
  STA @@PLAYER_OV_BASE@@+12
  RTS

; avanca a animacao do heroi (mesmo esquema idle das instancias, mas so 1 personagem).
animate_player:
  LDA player_on
  BEQ ap_done
  DEC player_timer
  LDA player_timer
  BNE ap_done
  INC player_frame
  LDA #@@HERO_FRAMES@@
  CMP player_frame
  BNE ap_reload
  LDA #0
  STA player_frame
ap_reload:
  LDY player_frame
  LDA CharDur_@@HERO@@,Y
  STA player_timer
ap_done:
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
  STA player_frame
  LDA CharDur_@@HERO@@
  STA player_timer
  LDA #1
  STA player_on
  JSR update_player_oam
  RTS
