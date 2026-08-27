update_player_oam:
  LDA player_on
  BNE upo_draw
  ; esconde: Y=$FF nos 8 slots (4 base + 4 overlay)
  LDA #$FF
  STA $0200
  STA $0204
  STA $0208
  STA $020C
  STA $0210
  STA $0214
  STA $0218
  STA $021C
  RTS
upo_draw:
  ; tmp0/tmp1 -> ponteiro pros 4 bytes do frame atual (TL,TR,BL,BR)
  LDA player_frame
  ASL A
  ASL A                 ; frame*4
  CLC
  ADC #<CharCells_@@HERO@@
  STA tmp0
  LDA #>CharCells_@@HERO@@
  ADC #0
  STA tmp1
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
  ; mesmo offset (frame*4), agora na tabela de flip por celula (ja em bits de atributo
  ; OAM: bit6=H bit7=V) - se combina por XOR com o flip de direcao (player_flip) abaixo.
  LDA player_frame
  ASL A
  ASL A
  CLC
  ADC #<CharFlips_@@HERO@@
  STA tmp0
  LDA #>CharFlips_@@HERO@@
  ADC #0
  STA tmp1
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
  LDA player_flip
  BEQ upo_noflip
  ; flip H de direcao: espelha o metasprite trocando TL<->TR e BL<->BR (tile e flip
  ; autoral viajam juntos)
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
upo_noflip:
  LDA player_flip
  BEQ upo_attr0
  LDA #%01000000     ; flip H de direcao
  STA tmp0
  JMP upo_write
upo_attr0:
  LDA #0
  STA tmp0
upo_write:
  ; --- TL ---
  LDA cell_tl
  CMP #$FF
  BEQ upo_tl_hide
  LDA player_y
  STA $0200
  LDA cell_tl
  STA $0201
  LDA cell_tl_fl
  EOR tmp0
  STA $0202
  LDA player_x
  STA $0203
  JMP upo_tr
upo_tl_hide:
  LDA #$FF
  STA $0200
upo_tr:
  ; --- TR ---
  LDA cell_tr
  CMP #$FF
  BEQ upo_tr_hide
  LDA player_y
  STA $0204
  LDA cell_tr
  STA $0205
  LDA cell_tr_fl
  EOR tmp0
  STA $0206
  LDA player_x
  CLC
  ADC #8
  STA $0207
  JMP upo_bl
upo_tr_hide:
  LDA #$FF
  STA $0204
upo_bl:
  ; --- BL ---
  LDA cell_bl
  CMP #$FF
  BEQ upo_bl_hide
  LDA player_y
  CLC
  ADC #8
  STA $0208
  LDA cell_bl
  STA $0209
  LDA cell_bl_fl
  EOR tmp0
  STA $020A
  LDA player_x
  STA $020B
  JMP upo_br
upo_bl_hide:
  LDA #$FF
  STA $0208
upo_br:
  ; --- BR ---
  LDA cell_br
  CMP #$FF
  BEQ upo_br_hide
  LDA player_y
  CLC
  ADC #8
  STA $020C
  LDA cell_br
  STA $020D
  LDA cell_br_fl
  EOR tmp0
  STA $020E
  LDA player_x
  CLC
  ADC #8
  STA $020F
  JMP upo_overlay
upo_br_hide:
  LDA #$FF
  STA $020C

; --- sprites sobrepostos do player (mt.overlay) - $0210-$021F. Le do MESMO indice de
; frame que a camada base (CharOv*_@@HERO@@), independente do flip de direcao (v1:
; overlay nao espelha automaticamente com a direcao - desenha sempre como autorado).
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
  STA $0210
  LDA ovl_tl
  STA $0211
  LDA ovl_tl_fl
  STA $0212
  LDA player_x
  CLC
  ADC ovl_dx
  STA $0213
  JMP upo_ov_tr
upo_ov_tl_hide:
  LDA #$FF
  STA $0210
upo_ov_tr:
  ; --- overlay TR ---
  LDA ovl_tr
  CMP #$FF
  BEQ upo_ov_tr_hide
  LDA player_y
  CLC
  ADC ovl_dy
  STA $0214
  LDA ovl_tr
  STA $0215
  LDA ovl_tr_fl
  STA $0216
  LDA player_x
  CLC
  ADC ovl_dx
  CLC
  ADC #8
  STA $0217
  JMP upo_ov_bl
upo_ov_tr_hide:
  LDA #$FF
  STA $0214
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
  STA $0218
  LDA ovl_bl
  STA $0219
  LDA ovl_bl_fl
  STA $021A
  LDA player_x
  CLC
  ADC ovl_dx
  STA $021B
  JMP upo_ov_br
upo_ov_bl_hide:
  LDA #$FF
  STA $0218
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
  STA $021C
  LDA ovl_br
  STA $021D
  LDA ovl_br_fl
  STA $021E
  LDA player_x
  CLC
  ADC ovl_dx
  CLC
  ADC #8
  STA $021F
  RTS
upo_ov_br_hide:
  LDA #$FF
  STA $021C
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
