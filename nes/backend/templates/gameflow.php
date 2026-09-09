<?php
/**
 * NGC Stage 17 - Game Flow / Warp.
 *
 * Mantém o comportamento do gerador da Stage 16, mas separa o fluxo de
 * estados do MainLoop para que Splash, Play, Game Over e transições de tela
 * sejam responsabilidade exclusiva do backend.
 */
return [
    'game_flow' => static function(array $ctx): string {
        $playStart = (int)($ctx['playStartIdx'] ?? 0);
        $gameoverIdx = (int)($ctx['gameoverIdx'] ?? 0);
        $splashIdx = (int)($ctx['splashIdx'] ?? 0);
        $secondPlay = $ctx['secondPlayScreenIdx'] ?? null;
        $music = !empty($ctx['musicEnabled']);

        $lines = [];
        $lines[] = '; ---- NGC GAME FLOW ----';
        $lines[] = '; 0=splash 1=play 2=gameover';
        $lines[] = 'st_splash:';
        $lines[] = '  JSR run_rules';
        $lines[] = '  LDA #0';
        $lines[] = '  STA pv_ev_oob';
        $lines[] = '  STA pv_ev_enter';
        $lines[] = '  STA pv_ev_enter_splash';
        $lines[] = '  ; START no splash -> Fase 1 + spawn Hero';
        $lines[] = '  LDA pad1_edge';
        $lines[] = '  AND #%00001000';
        $lines[] = '  BNE st_splash_start';
        $lines[] = '  JMP MainLoop';
        $lines[] = 'st_splash_start:';
        $lines[] = '  LDA #1';
        $lines[] = '  STA game_state';
        $lines[] = "  LDA #{$playStart}";
        $lines[] = '  JSR load_screen';
        $lines[] = '  LDA #1';
        $lines[] = '  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela"';
        $lines[] = '  LDA #0';
        $lines[] = '  STA scroll_x';
        $lines[] = '  STA nt_page';
        if ($secondPlay !== null) {
            $lines[] = "  LDA #{$secondPlay}";
            $lines[] = '  LDX #$24';
            $lines[] = '  STX psn_base_hi';
            $lines[] = '  JSR preload_screen_nt';
        }
        $lines[] = '  JSR spawn_player';
        $lines[] = '  JSR spawn_enemies';
        if ($secondPlay !== null) {
            $lines[] = '  LDA #1';
            $lines[] = '  JSR spawn_append_screen   ; Fase 9: adianta os inimigos da proxima tela pra nao surgirem no meio do scroll';
        }
        $lines[] = '  ; Musica so toca via acao Tocar Som (Camada 6) - sem autoplay';
        $lines[] = '  JMP MainLoop';
        $lines[] = '';

        $lines[] = 'st_play:';
        $lines[] = '  ; Camada 6: contador de idle (frames seguidos sem nenhum botao segurado)';
        $lines[] = '  LDA pad1';
        $lines[] = '  BNE prog_idle_reset';
        $lines[] = '  LDA pv_idle';
        $lines[] = '  CLC';
        $lines[] = '  ADC #1';
        $lines[] = '  STA pv_idle';
        $lines[] = '  BCC prog_idle_done';
        $lines[] = '  INC pv_idle+1';
        $lines[] = '  JMP prog_idle_done';
        $lines[] = 'prog_idle_reset:';
        $lines[] = '  LDA #0';
        $lines[] = '  STA pv_idle';
        $lines[] = '  STA pv_idle+1';
        $lines[] = 'prog_idle_done:';
        $lines[] = '  ; Camada 6: Acao "Pausar o jogo" congela player+inimigos, mas regras e';
        $lines[] = '  ; leitura de input continuam - senao nao teria como despausar.';
        $lines[] = '  LDA pv_game_paused';
        $lines[] = '  BNE st_play_paused';
        $lines[] = '  JSR update_player';
        $lines[] = '  JSR update_enemies';
        $lines[] = 'st_play_paused:';
        $lines[] = '  JSR run_rules';
        $lines[] = '  ; Camada 6: flags nativas sao pulso de 1 frame - zera depois das regras rodarem';
        $lines[] = '  LDA #0';
        $lines[] = '  STA pv_ev_oob';
        $lines[] = '  STA pv_ev_enter';
        $lines[] = '  ; SELECT -> Game Over';
        $lines[] = '  LDA pad1_edge';
        $lines[] = '  AND #%00000100';
        $lines[] = '  BEQ st_play_done';
        $lines[] = '  LDA #2';
        $lines[] = '  STA game_state';
        $lines[] = '  JSR hide_player';
        $lines[] = "  LDA #{$gameoverIdx}";
        $lines[] = '  JSR load_screen';
        $lines[] = '  LDA #1';
        $lines[] = '  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela"';
        $lines[] = 'st_play_done:';
        $lines[] = '  JMP MainLoop';
        $lines[] = '';

        $lines[] = 'st_gameover:';
        $lines[] = '  JSR run_rules';
        $lines[] = '  LDA #0';
        $lines[] = '  STA pv_ev_oob';
        $lines[] = '  STA pv_ev_enter';
        $lines[] = '  ; START no Game Over -> Splash';
        $lines[] = '  LDA pad1_edge';
        $lines[] = '  AND #%00001000';
        $lines[] = '  BNE st_gameover_restart';
        $lines[] = '  JMP MainLoop';
        $lines[] = 'st_gameover_restart:';
        $lines[] = '  LDA #0';
        $lines[] = '  STA game_state';
        $lines[] = '  JSR hide_player';
        $lines[] = "  LDA #{$splashIdx}";
        $lines[] = '  JSR load_screen';
        $lines[] = '  LDA #1';
        $lines[] = '  STA pv_ev_enter   ; Camada 6: flag nativa "Entrou na tela"';
        $lines[] = '  STA pv_ev_enter_splash   ; Camada 6: flag nativa "Entrou na Splash" (voltou do Game Over)';
        $lines[] = '  JMP MainLoop';
        $lines[] = '';

        return implode("\n", $lines);
    },
];
