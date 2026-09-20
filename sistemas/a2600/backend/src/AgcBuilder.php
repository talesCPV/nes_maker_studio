<?php
declare(strict_types=1);

/**
 * Gera ASM Atari 2600 (DASM) a partir do JSON do projeto AGC.
 *
 * v0.3: kernel + score bar + glifos + spawn P0/P1 (boot) + gráfico do sprite
 *       + faixas inimigos (bands) estilo Megamania: GRP1 por fileira + NUSIZ1.
 */
final class AgcBuilder
{
    /** @param array<string,mixed> $project */
    public static function build(array $project): array
    {
        $name = self::safeLabel((string)($project['name'] ?? 'AGC_Game'));
        $tv = strtoupper((string)($project['tv'] ?? 'NTSC'));
        if ($tv !== 'PAL') {
            $tv = 'NTSC';
        }

        $romSize = (int)($project['romSize'] ?? 4096);
        if (!in_array($romSize, [2048, 4096, 8192, 16384, 32768], true)) {
            $romSize = 4096;
        }

        $org = $romSize === 2048 ? 0xF800 : 0xF000;

        $scoreBar = is_array($project['scoreBar'] ?? null) ? $project['scoreBar'] : [];
        // schema novo: position none|top|bottom; logoAlways inegociável
        $scorePos = (string)($scoreBar['position'] ?? '');
        if ($scorePos === '' || $scorePos === '0') {
            $scorePos = !empty($scoreBar['enabled']) ? 'bottom' : 'none';
        }
        if (!in_array($scorePos, ['none', 'top', 'bottom'], true)) {
            $scorePos = 'none';
        }
        $scoreEnabled = $scorePos !== 'none';
        $scoreAlign = 'left';
        $scorePlayers = max(1, min(2, (int)($scoreBar['players'] ?? 1)));
        $digits = max(2, min(3, (int)($scoreBar['digits'] ?? 2)));
        $labelPlayers = !empty($scoreBar['labelPlayers']) && $digits === 3;
        // 2 dig: 4=esq, 8=centro, 12=dir | 3 dig: só centro (#7)
        if ($digits >= 3) {
            $scoreDelay = 7;
        } else {
            $scoreDelay = (int)($scoreBar['delay'] ?? 12);
            if (!in_array($scoreDelay, [4, 8, 12], true)) {
                $scoreDelay = 12;
            }
        }
        $scoreBg = true; // fundo preto do placar sempre
        $showLogo = true;
        $logoLines = max(6, min(16, (int)($scoreBar['logoLines'] ?? 10)));
        $scoreVar = 'scoreP0';
        $scoreVar2 = 'scoreP1';

        $scanlines = $tv === 'PAL' ? 242 : 192;
        $vblank = $tv === 'PAL' ? 52 : 45;
        $overscan = $tv === 'PAL' ? 36 : 30;
        $glyphH = self::digitGlyphHeight();
        // bandH = altura de UMA faixa de placar (só dígitos + mínimo).
        $bandH = (int)($scoreBar['lines'] ?? ($glyphH + 2));
        $bandH = max($glyphH + 1, min(12, $bandH));
        if ($scorePlayers >= 2) {
            // 2 players: cada faixa ≈ altura do glifo. Gap entre faixas = 1–2 scanlines.
            $bandH = max($glyphH, min($glyphH + 1, $bandH));
        }
        $scoreLines = $scoreEnabled ? ($bandH * $scorePlayers) : 0;
        if ($scorePlayers >= 2) {
            $scoreLines += 2; // reserva para o gap apertado entre as duas faixas
        }
        $scoreLines = min(24, $scoreLines);
        // playfield útil = total − placar − logo (logo sempre)
        // 4 scanlines para PositionPlayers após o placar (obrigatório: score move P0/P1)
        $posAfterScore = $scoreEnabled ? 4 : 0;
        $playLines = max(1, $scanlines - $scoreLines - $logoLines - $posAfterScore);

        $pfTables = self::extractPlayfield($project, $playLines);
        $ctrlpf = ($pfTables['mode'] === 'reflect') ? 1 : 0; // bit0 reflect; asymmetric → left half only

        // Resolve boot spawns
        $spawns = self::resolveBootSpawns($project);
        $ruleCompiled = self::compileRules($project);
        $sprites = is_array($project['sprites'] ?? null) ? $project['sprites'] : [];

        $p0 = $spawns[0] ?? null;
        $p1 = $spawns[1] ?? null;

        $spr0 = $p0 ? self::findSprite($sprites, (string)($p0['spriteId'] ?? '')) : null;
        $spr1 = $p1 ? self::findSprite($sprites, (string)($p1['spriteId'] ?? '')) : null;

        // defaults if no spawn but has sprite for player
        if (!$spr0) {
            $spr0 = self::findSpriteByPlayer($sprites, 0);
        }
        if (!$spr1) {
            $spr1 = self::findSpriteByPlayer($sprites, 1);
        }

        $p0x = $p0 ? max(0, min(160, (int)$p0['x'])) : 60;
        $p0y = $p0 ? max(0, min($playLines - 1, (int)$p0['y'])) : 40;
        $p1x = $p1 ? max(0, min(160, (int)$p1['x'])) : 100;
        $p1y = $p1 ? max(0, min($playLines - 1, (int)$p1['y'])) : 40;

        $h0 = $spr0 ? max(1, min(32, (int)($spr0['height'] ?? 8))) : 8;
        $h1 = $spr1 ? max(1, min(32, (int)($spr1['height'] ?? 8))) : 8;
        $col0 = $spr0 ? ((int)($spr0['color'] ?? 0x2a) & 0xfe) : 0x2a;
        $col1 = $spr1 ? ((int)($spr1['color'] ?? 0x6a) & 0xfe) : 0x6a;

        $gfx0 = self::spriteRows($spr0, $h0);
        $gfx1 = self::spriteRows($spr1, $h1);

        // GRP por scanline (kernel linear, <76 ciclos → sem flicker)
        $grp0Line = array_fill(0, $playLines, 0);
        $grp1Line = array_fill(0, $playLines, 0);
        for ($i = 0; $i < $h0; $i++) {
            $y = $p0y + $i;
            if ($y >= 0 && $y < $playLines) {
                $grp0Line[$y] = $gfx0[$i] & 0xff;
            }
        }
        for ($i = 0; $i < $h1; $i++) {
            $y = $p1y + $i;
            if ($y >= 0 && $y < $playLines) {
                $grp1Line[$y] = $gfx1[$i] & 0xff;
            }
        }

        // --- Faixas (bands) do estilo vertical_shooter / Megamania ---
        // Cada enemy_row pinta seu próprio sprite em GRP1 na faixa Y.
        // Herói (role=hero) sobrescreve P0. NUSIZ1 vem da 1ª fileira (MVP: mesmo NUSIZ em todas).
        $nusiz0 = 0;
        $nusiz1 = 0;
        $nusizCopies = 0;
        $nusizSpacing = '-';
        $bandMeta = self::resolveBands($project, $sprites, $playLines);
        if ($bandMeta['hero'] !== null) {
            $hb = $bandMeta['hero'];
            $p0x = $hb['baseX'];
            $p0y = $hb['y'];
            $h0 = $hb['drawH'];
            $col0 = $hb['color'];
            $gfx0 = $hb['gfx'];
            // limpa e repinta P0 só na faixa do herói
            $grp0Line = array_fill(0, $playLines, 0);
            for ($i = 0; $i < $h0; $i++) {
                $y = $p0y + $i;
                if ($y >= 0 && $y < $playLines) {
                    $grp0Line[$y] = $gfx0[$i] & 0xff;
                }
            }
        } elseif (count($bandMeta['enemies']) > 0) {
            // Sem faixa herói: limpa P0 (pode ser reusado pelos inimigos 4–6)
            $grp0Line = array_fill(0, $playLines, 0);
        }

        // --- Fileiras de inimigos (estilo Megamania / Space Invaders) ---
        // 1–3 cópias: só P1 + NUSIZ
        // 4–6 cópias: P0×3 + P1×3 intercalados (mesmo frame, sem flicker)
        // Por enquanto: 1ª fileira apenas (multi-banda depois)
        $grp1Bands = [];
        $bandParams = [];
        $flickerMode = false; // abandonado — caminho Megamania
        $dualPlayerRow = false;
        $independentSlots = false;
        $slotGap = 16;
        $rowAliveMask = 0x3f;
        $rowXInit = 24;
        $rowX2Init = 24;
        $splitLine = 0;
        $halfGap = 8;
        $rowMoveDelay = 0; // 0=parado; N=1px a cada N frames
        $rowWrap = true;
        $rowZigzag = false;
        $rowSpan = 40;
        $varEnemyAlive = null;
        $varRowX = null;
        foreach ((is_array($project['variables'] ?? null) ? $project['variables'] : []) as $vv) {
            if (!is_array($vv)) {
                continue;
            }
            $vn = (string)($vv['name'] ?? '');
            $val = max(0, min(255, (int)($vv['value'] ?? 0)));
            if ($vn === 'enemyAlive') {
                $varEnemyAlive = $val & 0x3f;
            }
            if ($vn === 'rowX') {
                $varRowX = max(1, min(160, $val));
            }
        }

        if (count($bandMeta['enemies']) > 0) {
            // Só a 1ª fileira (topo) neste passo
            $first = $bandMeta['enemies'][0];
            $nusizCopies = max(1, min(6, (int)($first['copies'] ?? 3)));
            $nusizSpacing = (string)($first['spacing'] ?? 'close');
            $gap = ($nusizSpacing === 'wide') ? 40 : (($nusizSpacing === 'medium') ? 24 : 16);
            $halfGap = (int)($gap / 2);
            // Caminho C: slots independentes (sem NUSIZ multi-copy). P0+P1, multiplex 3 pares @ 20Hz.
            $independentSlots = ($nusizCopies >= 2);
            $dualPlayerRow = $independentSlots; // usa P0+P1
            $slotGap = $gap;
            $rowMoveDelay = max(0, min(255, (int)($first['moveDelay'] ?? 0)));
            $mm = strtolower((string)($first['moveMode'] ?? ''));
            if ($mm !== 'wrap' && $mm !== 'zigzag') {
                $mm = !empty($first['wrap']) || !array_key_exists('wrap', $first) ? 'wrap' : 'zigzag';
            }
            $rowWrap = ($mm === 'wrap');
            $rowZigzag = ($mm === 'zigzag');

            // NUSIZ = 0 (cópia única). 6 slots lógicos; 2 visíveis por frame (par do FrameCnt%3).
            $nusiz0 = 0;
            $nusiz1 = 0;
            $perPlayerCopies = 1;

            $p1y = $first['y'];
            $h1 = $first['drawH'];
            $col1 = $first['color'];
            $col0 = $independentSlots ? $col1 : $col0;
            $gfx1 = $first['gfx'];
            $rowXInit = max(1, min(160, (int)$first['baseX']));
            $rowAliveMask = $varEnemyAlive !== null
                ? $varEnemyAlive
                : max(0, min(0x3f, (int)($first['aliveMask'] ?? ((1 << $nusizCopies) - 1))));

            $span = 8 + max(0, $nusizCopies - 1) * $slotGap;
            $rowSpan = $span;
            if ($rowXInit + $span > 152) {
                $rowXInit = max(1, 152 - $span);
            }
            $p1x = $independentSlots ? ($rowXInit + $slotGap) : $rowXInit;
            $p0x = $independentSlots ? $rowXInit : $p0x;

            // Pinta TODAS as fileiras enemy_row nas tabelas GRP (mesmo RowX / NUSIZ).
            // X independente por faixa = próximo passo (RESP no gap entre linhas).
            $grp1Line = array_fill(0, $playLines, 0);
            if ($dualPlayerRow) {
                $grp0Line = array_fill(0, $playLines, 0);
            }
            $bandColors = [];
            $bandMasks = [];
            foreach ($bandMeta['enemies'] as $bi => $eb) {
                $eh = (int)$eb['drawH'];
                $egfx = $eb['gfx'];
                $ey = (int)$eb['y'];
                // máscara por faixa (aliveMask do editor; runtime = EnemyAlive / EnemyAlive2)
                $mask = max(0, min(0x3f, (int)($eb['aliveMask'] ?? ((1 << $nusizCopies) - 1))));
                $bandMasks[] = $mask;
                $bandColors[] = (int)$eb['color'] & 0xfe;
                for ($i = 0; $i < $eh; $i++) {
                    $y = $ey + $i;
                    if ($y >= 0 && $y < $playLines) {
                        // sprite próprio de cada faixa
                        $grp1Line[$y] = $egfx[$i] & 0xff;
                        if ($dualPlayerRow) {
                            $grp0Line[$y] = $egfx[$i] & 0xff;
                        }
                    }
                }
                $bandParams[] = [
                    'x' => max(1, min(160, (int)$eb['baseX'])),
                    'y' => $ey,
                    'h' => $eh,
                    'nusiz' => $nusiz1,
                    'color' => (int)$eb['color'] & 0xfe,
                    'copies' => $nusizCopies,
                    'spacing' => $nusizSpacing,
                    'aliveMask' => $mask,
                    'id' => (string)($eb['id'] ?? ''),
                ];
            }
            $colBand0 = $bandColors[0] ?? $col1;
            $colBand1 = $bandColors[1] ?? $colBand0;
            $maskInit0 = $bandMasks[0] ?? $rowAliveMask;
            $maskInit1 = $bandMasks[1] ?? $maskInit0;
            // cores da 1ª fileira no topo do kernel
            $col0 = $dualPlayerRow ? $colBand0 : $col0;
            $col1 = $colBand0;
            // X independente: 2+ faixas com gap >= 4 scanlines para RESP mid-screen
            $rowX2Init = $rowXInit;
            $splitLine = 0; // 0 = desligado
            if (count($bandMeta['enemies']) >= 2) {
                $b0 = $bandMeta['enemies'][0];
                $b1 = $bandMeta['enemies'][1];
                $rowX2Init = max(1, min(160, (int)$b1['baseX']));
                $gapStart = (int)$b0['y'] + (int)$b0['drawH'];
                $gapEnd = (int)$b1['y'];
                // TESTE ESTABILIDADE: mid RESP desligado (split=0 → um PlayLoop só)
                if (false && ($gapEnd - $gapStart >= 6)) {
                    $splitLine = max($gapStart, $gapEnd - 5);
                    $splitLine = min($splitLine, $playLines - 6);
                }
                if ($rowX2Init + $rowSpan > 152) {
                    $rowX2Init = max(1, 152 - (int)$rowSpan);
                }
            }
        }

        $minX = ($nusiz1 === 3 || $nusiz1 === 6) ? 8 : 1;
        $d0 = max($minX, min(160, (int)$p0x));
        $d1 = max($minX, min(160, (int)$p1x));
        $enemyBandCount = count($bandMeta['enemies']);

        $asm = [];
        $asm[] = '; ============================================================';
        $asm[] = '; AGC generated — ' . $name;
        $asm[] = '; TV=' . $tv . ' ROM=' . $romSize . ' scoreBar=' . ($scoreEnabled ? 'on' : 'off');
        $asm[] = '; P0 spawn=' . ($p0 ? 'yes' : 'default') . ' P1 spawn=' . ($p1 ? 'yes' : 'default');
        $asm[] = '; Enemy bands=' . $enemyBandCount
            . ' copies=' . (isset($nusizCopies) ? $nusizCopies : 0)
            . ' spacing=' . (isset($nusizSpacing) ? $nusizSpacing : '-')
            . ' NUSIZ0=$' . sprintf('%02X', $nusiz0)
            . ' NUSIZ1=$' . sprintf('%02X', $nusiz1)
            . ($independentSlots ? ' SLOTS=indep/flicker3' : ($dualPlayerRow ? ' DUAL=P0+P1' : ''))
            . ' RowX=' . $rowXInit . ' RowX2=' . $rowX2Init . ' split=' . $splitLine
            . ' Alive=$' . sprintf('%02X', $rowAliveMask);
        $asm[] = '; Assembler: DASM (-f3 raw binary)';
        $asm[] = '; ============================================================';
        $asm[] = '    processor 6502';
        $asm[] = '';
        $asm[] = self::registerEquates();
        $asm[] = '';
        $asm[] = '    ORG $' . strtoupper(dechex($org));
        $asm[] = '';
        $asm[] = 'Start:';
        $asm[] = '    sei';
        $asm[] = '    cld';
        $asm[] = '    ldx #$FF';
        $asm[] = '    txs';
        $asm[] = '    lda #0';
        $asm[] = '    tax';
        $asm[] = 'ClearMem:';
        $asm[] = '    sta $00,x';
        $asm[] = '    inx';
        $asm[] = '    bne ClearMem';
        $asm[] = '';
        $asm[] = '    lda #0';
        $asm[] = '    sta Score0';
        $asm[] = '    sta Score1';
        $asm[] = '    sta Score2';
        $initP0 = 0;
        $initP1 = 0;
        foreach ((is_array($project['variables'] ?? null) ? $project['variables'] : []) as $vv) {
            if (!is_array($vv)) continue;
            $vn = (string)($vv['name'] ?? '');
            $val = max(0, min(255, (int)($vv['value'] ?? 0)));
            if ($vn === 'scoreP0' || $vn === 'score') $initP0 = $val;
            if ($vn === 'scoreP1') $initP1 = $val;
        }
        $asm[] = '    lda #' . $initP0 . '              ; scoreP0 init (Program → valor)';
        $asm[] = '    sta ScoreP0';
        $asm[] = '    lda #' . $initP1 . '              ; scoreP1 init';
        $asm[] = '    sta ScoreP1';
        $asm[] = '    sta PrevSWCHA';
        $asm[] = '    sta PrevINPT4';
        $asm[] = '    sta WalkTick';
        $asm[] = '    sta FrameCnt';
        $asm[] = '    sta BandSel';
        $asm[] = '    sta BandNusiz';
        $asm[] = '    sta BandCol';
        $asm[] = '    lda #' . ($rowXInit & 0xff);
        $asm[] = '    sta RowX                  ; X fileira 1';
        if ($splitLine > 0) {
            $asm[] = '    lda #' . ($rowX2Init & 0xff);
            $asm[] = '    sta RowX2                 ; X fileira 2';
        }
        $mask0 = isset($maskInit0) ? $maskInit0 : $rowAliveMask;
        $mask1 = isset($maskInit1) ? $maskInit1 : $mask0;
        $asm[] = '    lda #$' . sprintf('%02X', $mask0 & 0x3f);
        $asm[] = '    sta EnemyAlive            ; máscara fileira 1 (bits 0–5)';
        $asm[] = '    lda #$' . sprintf('%02X', $mask1 & 0x3f);
        $asm[] = '    sta EnemyAlive2           ; máscara fileira 2';
        $asm[] = '    lda #0';
        $asm[] = '    sta P0Alive';
        $asm[] = '    sta P1Alive';
        $asm[] = '    sta P0Alive2';
        $asm[] = '    sta P1Alive2';
        $asm[] = '    lda #' . ($rowMoveDelay & 0xff);
        $asm[] = '    sta MoveDelay             ; quadros entre cada passo X';
        $asm[] = '    sta MoveCtr';
        $asm[] = '    lda #0';
        $asm[] = '    sta RowDir                ; 0=direita (+), 1=esquerda (-)';
        $asm[] = '';
        foreach ($ruleCompiled['inits'] as $line) {
            $asm[] = $line;
        }
        $asm[] = '    ; --- regras Boot ---';
        foreach ($ruleCompiled['boot'] as $line) {
            $asm[] = $line;
        }
        $asm[] = '';
        $asm[] = '    ; Boot spawn positions / heights';
        $asm[] = '    lda #' . $p0y;
        $asm[] = '    sta P0Y';
        $asm[] = '    lda #' . $h0;
        $asm[] = '    sta P0H';
        $asm[] = '    lda #' . $p1y;
        $asm[] = '    sta P1Y';
        $asm[] = '    lda #' . $h1;
        $asm[] = '    sta P1H';
        if ($dualPlayerRow || $enemyBandCount > 0) {
            // P0/P1 a partir de RowX (VBLANK atualiza a cada frame)
            $asm[] = '    lda RowX';
            $asm[] = '    sta P0X';
            if ($dualPlayerRow) {
                $asm[] = '    clc';
                $asm[] = '    adc #' . ($halfGap & 0xff) . '              ; P1 intercalado';
            } else {
                $asm[] = '    lda RowX';
            }
            $asm[] = '    sta P1X';
        } else {
            $asm[] = '    lda #' . $d0;
            $asm[] = '    sta P0X                 ; color clocks 0-160';
            $asm[] = '    lda #' . $d1;
            $asm[] = '    sta P1X';
        }
        $asm[] = '    lda #1';
        $asm[] = '    sta P0En';
        $asm[] = '    sta P1En';
        $asm[] = '';
        $asm[] = 'MainLoop:';
        $asm[] = '    lda #2';
        $asm[] = '    sta VSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta WSYNC';
        $asm[] = '    lda #0';
        $asm[] = '    sta VSYNC';
        $asm[] = '';
        $asm[] = '    lda #' . $vblank;
        $asm[] = '    sta TIM64T';
        $asm[] = '    jsr GameLogic              ; VBLANK: movimento / regras';
        if ($dualPlayerRow || $enemyBandCount > 0) {
            $minX = 8;
            $maxX = max($minX, 160 - (int)$rowSpan);
            // Clamp RowX — evita underflow (255) e cópias NUSIZ fora da tela
            $asm[] = '    lda RowX';
            $asm[] = '    cmp #' . ($minX & 0xff);
            $asm[] = '    bcs RowXMinOk';
            $asm[] = '    lda #' . ($minX & 0xff);
            $asm[] = '    sta RowX';
            $asm[] = 'RowXMinOk:';
            $asm[] = '    cmp #' . ($maxX & 0xff);
            $asm[] = '    bcc RowXMaxOk';
            $asm[] = '    beq RowXMaxOk';
            $asm[] = '    lda #' . ($maxX & 0xff);
            $asm[] = '    sta RowX';
            $asm[] = 'RowXMaxOk:';
            if ($splitLine > 0) {
                $asm[] = '    lda RowX2';
                $asm[] = '    cmp #' . ($minX & 0xff);
                $asm[] = '    bcs RowX2MinOk';
                $asm[] = '    lda #' . ($minX & 0xff);
                $asm[] = '    sta RowX2';
                $asm[] = 'RowX2MinOk:';
                $asm[] = '    cmp #' . ($maxX & 0xff);
                $asm[] = '    bcc RowX2MaxOk';
                $asm[] = '    beq RowX2MaxOk';
                $asm[] = '    lda #' . ($maxX & 0xff);
                $asm[] = '    sta RowX2';
                $asm[] = 'RowX2MaxOk:';
            }
            $asm[] = '    lda RowX';
            $asm[] = '    sta P0X';
            if ($dualPlayerRow) {
                $asm[] = '    clc';
                $asm[] = '    adc #' . ($halfGap & 0xff);
                $asm[] = '    sta P1X';
            } else {
                $asm[] = '    sta P1X';
            }
        }
        // Máscara fileira 1 → P0Alive/P1Alive (bits pares=P0, ímpares=P1 no dual)
        if (!empty($independentSlots)) {
            // TESTE: par fixo slots 0 e 1 (sem multiplex) — máscara bits 0 e 1
            $sg = (int)$slotGap;
            $asm[] = '    ; --- slots FIXOS 0/1 (teste máscara) ---';
            $asm[] = '    lda RowX';
            $asm[] = '    sta P0X';
            $asm[] = '    clc';
            $asm[] = '    adc #' . ($sg & 0xff);
            $asm[] = '    sta P1X';
            $asm[] = '    lda EnemyAlive';
            $asm[] = '    and #1';
            $asm[] = '    beq TMz0';
            $asm[] = '    lda #$FF';
            $asm[] = '    bne TMs0';
            $asm[] = 'TMz0:';
            $asm[] = '    lda #0';
            $asm[] = 'TMs0:';
            $asm[] = '    sta P0Alive';
            $asm[] = '    lda EnemyAlive';
            $asm[] = '    and #2';
            $asm[] = '    beq TMz1';
            $asm[] = '    lda #$FF';
            $asm[] = '    bne TMs1';
            $asm[] = 'TMz1:';
            $asm[] = '    lda #0';
            $asm[] = 'TMs1:';
            $asm[] = '    sta P1Alive';
            if ($splitLine > 0) {
                $asm[] = '    lda RowX2';
                $asm[] = '    sta P0X2';
                $asm[] = '    clc';
                $asm[] = '    adc #' . ($sg & 0xff);
                $asm[] = '    sta P1X2';
                $asm[] = '    lda EnemyAlive2';
                $asm[] = '    and #1';
                $asm[] = '    beq TM2z0';
                $asm[] = '    lda #$FF';
                $asm[] = '    bne TM2s0';
                $asm[] = 'TM2z0:';
                $asm[] = '    lda #0';
                $asm[] = 'TM2s0:';
                $asm[] = '    sta P0Alive2';
                $asm[] = '    lda EnemyAlive2';
                $asm[] = '    and #2';
                $asm[] = '    beq TM2z1';
                $asm[] = '    lda #$FF';
                $asm[] = '    bne TM2s1';
                $asm[] = 'TM2z1:';
                $asm[] = '    lda #0';
                $asm[] = 'TM2s1:';
                $asm[] = '    sta P1Alive2';
            }
        }

        // DEBUG: placar = EnemyAlive para ver máscara real na RAM
        $asm[] = '    lda EnemyAlive';
        $asm[] = '    sta ScoreP0';
        $asm[] = '    jsr PositionPlayers';
        if ($scoreEnabled) {
            $asm[] = '    jsr ScorePrep';
        }
        $asm[] = 'WaitVBlank:';
        $asm[] = '    lda INTIM';
        $asm[] = '    bne WaitVBlank';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta VBLANK              ; A=0 → fim do VBLANK, começa imagem';
        $asm[] = '';
        $asm[] = '    lda #$' . sprintf('%02X', $col0 & 0xfe);
        $asm[] = '    sta COLUP0';
        if ($flickerMode) {
            $asm[] = '    lda BandCol';
            $asm[] = '    sta COLUP1';
        } else {
            $asm[] = '    lda #$' . sprintf('%02X', $col1 & 0xfe);
            $asm[] = '    sta COLUP1';
        }
        $asm[] = '    lda #0';
        $asm[] = '    sta GRP0';
        $asm[] = '    sta GRP1';
        $asm[] = '    sta PF0';
        $asm[] = '    sta PF1';
        $asm[] = '    sta PF2';
        $asm[] = '    lda #' . ($nusiz0 & 7);
        $asm[] = '    sta NUSIZ0';
        if ($flickerMode) {
            $asm[] = '    lda BandNusiz';
            $asm[] = '    sta NUSIZ1';
        } else {
            $asm[] = '    lda #' . ($nusiz1 & 7);
            $asm[] = '    sta NUSIZ1              ; fileiras inimigos';
        }
        $asm[] = '';
        $asm[] = '    ; ===== HUD: placar + playfield útil + logo =====';
        $asm[] = '    ; playLines=' . $playLines . ' scoreLines=' . $scoreLines . ' logoLines=' . $logoLines
            . ' pfMode=' . ($pfTables['mode'] ?? 'reflect')
            . ' PlayLoop=PF+GRP only';
        $asm[] = '';
        if ($scorePos === 'top') {
            $asm[] = '    jsr DrawScoreBand';
            // Score moveu P0/P1 — reposiciona inimigos (4 scanlines já reservadas em playLines)
            $asm[] = '    jsr PositionPlayers';
            $asm[] = '    lda #' . ($nusiz0 & 7);
            $asm[] = '    sta NUSIZ0';
            if ($flickerMode) {
                $asm[] = '    lda BandNusiz';
                $asm[] = '    sta NUSIZ1';
                $asm[] = '    lda #$' . sprintf('%02X', $col0 & 0xfe);
                $asm[] = '    sta COLUP0';
                $asm[] = '    lda BandCol';
                $asm[] = '    sta COLUP1';
            } else {
                $asm[] = '    lda #' . ($nusiz1 & 7);
                $asm[] = '    sta NUSIZ1';
                $asm[] = '    lda #$' . sprintf('%02X', $col0 & 0xfe);
                $asm[] = '    sta COLUP0';
                $asm[] = '    lda #$' . sprintf('%02X', $col1 & 0xfe);
                $asm[] = '    sta COLUP1';
            }
        }
        $asm[] = '    lda #' . $ctrlpf;
        $asm[] = '    sta CTRLPF';
        // PlayLoop: PF+GRP. Com 2 fileiras: parte A → RESP mid (3 linhas) → parte B.
        $asm[] = '    ldx #0';
        if ($splitLine > 0) {
            $asm[] = '    lda #0';
            $asm[] = '    sta NUSIZ0';
            $asm[] = '    sta NUSIZ1';
            $asm[] = 'PlayLoopA:';
            $asm[] = '    sta WSYNC';
            // GRP + máscara (P0Alive/P1Alive definidos no VBLANK a partir de EnemyAlive)
            $asm[] = '    lda P0Alive';
            $asm[] = '    beq PL0z';
            $asm[] = '    lda GRP0Data,x';
            $asm[] = '    jmp PL0s';
            $asm[] = 'PL0z:';
            $asm[] = '    lda #0';
            $asm[] = 'PL0s:';
            $asm[] = '    sta GRP0';
            $asm[] = '    lda P1Alive';
            $asm[] = '    beq PL1z';
            $asm[] = '    lda GRP1Data,x';
            $asm[] = '    jmp PL1s';
            $asm[] = 'PL1z:';
            $asm[] = '    lda #0';
            $asm[] = 'PL1s:';
            $asm[] = '    sta GRP1';
            $asm[] = '    inx';
            $asm[] = '    cpx #' . ($splitLine & 0xff);
            $asm[] = '    bne PlayLoopA';
            // Sync antes do mid — evita estouro de linha e flicker de tela inteira
            $c2 = isset($colBand1) ? ($colBand1 & 0xfe) : ($col1 & 0xfe);
            $asm[] = '    ; --- RESP fileira 2 — sync + 4 scanlines ---';
            $asm[] = '    sta WSYNC';
            $asm[] = '    lda #0';
            $asm[] = '    sta GRP0';
            $asm[] = '    sta GRP1';
            $asm[] = '    sta NUSIZ0               ; garante single-copy';
            $asm[] = '    sta NUSIZ1';
            $asm[] = '    lda P0Alive2';
            $asm[] = '    sta P0Alive';
            $asm[] = '    lda P1Alive2';
            $asm[] = '    sta P1Alive';
            $asm[] = '    stx TmpLine               ; salva índice de scanline';
            $asm[] = '    lda P0X2';
            $asm[] = '    ldx #0';
            $asm[] = '    jsr SetHX                 ; scanline 1: RESP P0 slot';
            $asm[] = '    lda P1X2';
            $asm[] = '    ldx #1';
            $asm[] = '    jsr SetHX                 ; scanline 2: RESP P1 slot';
            $asm[] = '    sta WSYNC';
            $asm[] = '    sta HMOVE                 ; scanline 3: aplica fine pos';
            $asm[] = '    sta WSYNC';
            $asm[] = '    sta HMCLR                 ; scanline 4: limpa (depois do HMOVE!)';
            $asm[] = '    ldx TmpLine';
            $asm[] = '    inx';
            $asm[] = '    inx';
            $asm[] = '    inx';
            $asm[] = '    inx';
            $asm[] = '    inx                       ; +5 (sync+RESP)';
            $asm[] = 'PlayLoopB:';
            $asm[] = '    sta WSYNC';
            // GRP + máscara (P0Alive/P1Alive definidos no VBLANK a partir de EnemyAlive)
            $asm[] = '    lda P0Alive';
            $asm[] = '    beq PL0z';
            $asm[] = '    lda GRP0Data,x';
            $asm[] = '    jmp PL0s';
            $asm[] = 'PL0z:';
            $asm[] = '    lda #0';
            $asm[] = 'PL0s:';
            $asm[] = '    sta GRP0';
            $asm[] = '    lda P1Alive';
            $asm[] = '    beq PL1z';
            $asm[] = '    lda GRP1Data,x';
            $asm[] = '    jmp PL1s';
            $asm[] = 'PL1z:';
            $asm[] = '    lda #0';
            $asm[] = 'PL1s:';
            $asm[] = '    sta GRP1';
            $asm[] = '    inx';
            $asm[] = '    cpx #' . $playLines;
            $asm[] = '    bne PlayLoopB';
        } else {
            $asm[] = 'PlayLoop:';
            $asm[] = '    sta WSYNC';
            // GRP + máscara (P0Alive/P1Alive definidos no VBLANK a partir de EnemyAlive)
            $asm[] = '    lda P0Alive';
            $asm[] = '    beq PL0z';
            $asm[] = '    lda GRP0Data,x';
            $asm[] = '    jmp PL0s';
            $asm[] = 'PL0z:';
            $asm[] = '    lda #0';
            $asm[] = 'PL0s:';
            $asm[] = '    sta GRP0';
            $asm[] = '    lda P1Alive';
            $asm[] = '    beq PL1z';
            $asm[] = '    lda GRP1Data,x';
            $asm[] = '    jmp PL1s';
            $asm[] = 'PL1z:';
            $asm[] = '    lda #0';
            $asm[] = 'PL1s:';
            $asm[] = '    sta GRP1';
            $asm[] = '    inx';
            $asm[] = '    cpx #' . $playLines;
            $asm[] = '    bne PlayLoop';
        }
        $asm[] = '    lda #0';
        $asm[] = '    sta PF0';
        $asm[] = '    sta PF1';
        $asm[] = '    sta PF2';
        $asm[] = '    sta GRP0';
        $asm[] = '    sta GRP1';
        $asm[] = '';
        if ($scorePos === 'bottom') {
            $asm[] = '    jsr DrawScoreBand';
        }
        $asm[] = '    ; jsr DrawLogo              ; TESTE: logo off';
        $asm[] = '';
        $asm[] = '    lda #2';
        $asm[] = '    sta VBLANK';
        $asm[] = '    lda #' . $overscan;
        $asm[] = '    sta TIM64T';
        $asm[] = 'WaitOverscan:';
        $asm[] = '    lda INTIM';
        $asm[] = '    bne WaitOverscan';
        $asm[] = '    sta WSYNC';
        $asm[] = '    jmp MainLoop';
        $asm[] = '';
        $asm[] = 'GameLogic:';
        // VBLANK only — sem auto-scroll.
        // Movimento da fileira: altere a variável nativa rowX em Programação (timer/regra).
        // RowX é aplicado em P0X/P1X + PositionPlayers logo após este jsr.
        foreach ($ruleCompiled['frame'] as $line) {
            $asm[] = $line;
        }
        $asm[] = '    rts';
        $asm[] = '';

        $asm[] = '; Posiciona P0/P1 — 3 scanlines fixas';
        $asm[] = 'PositionPlayers:';
        $asm[] = '    lda P0X';
        $asm[] = '    ldx #0';
        $asm[] = '    jsr SetHX';
        $asm[] = '    lda P1X';
        $asm[] = '    ldx #1';
        $asm[] = '    jsr SetHX';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta HMOVE';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sta HMCLR';
        $asm[] = '    rts';
        $asm[] = '';
        $asm[] = '; A = X (1–160), X reg = objeto (0=P0,1=P1)';
        $asm[] = 'SetHX:';
        $asm[] = '    sta WSYNC';
        $asm[] = '    sec';
        $asm[] = 'SetHXDiv:';
        $asm[] = '    sbc #15';
        $asm[] = '    bcs SetHXDiv';
        $asm[] = '    tay';
        $asm[] = '    lda FineAdj-$F1,y';
        $asm[] = '    sta HMP0,x';
        $asm[] = '    nop';
        $asm[] = '    nop';
        $asm[] = '    sta RESP0,x';
        $asm[] = '    rts';
        $asm[] = '';
        $asm[] = '    ALIGN 256';
        $asm[] = 'FineAdj:';
        $asm[] = '    .byte $70,$60,$50,$40,$30,$20,$10,$00';
        $asm[] = '    .byte $F0,$E0,$D0,$C0,$B0,$A0,$90';
        $asm[] = '';
        if (!empty($independentSlots)) {
            $sg = (int)$slotGap;
            $asm[] = '; X offset do P0/P1 de cada par (0,1,2)';
            $asm[] = 'SlotOff0:';
            $asm[] = '    .byte ' . (0) . ',' . (2 * $sg) . ',' . (4 * $sg);
            $asm[] = 'SlotOff1:';
            $asm[] = '    .byte ' . ($sg) . ',' . (3 * $sg) . ',' . (5 * $sg);
            $asm[] = 'SlotBit0:';
            $asm[] = '    .byte 1,4,16';
            $asm[] = 'SlotBit1:';
            $asm[] = '    .byte 2,8,32';
            $asm[] = '';
        }

        if ($flickerMode) {
            // ---- Flicker: 1 faixa inimigo por frame ----
            $nFlick = min(2, count($bandParams)); // MVP: 2 faixas
            $asm[] = '; SelectBand — intercalation flicker (teste Megamania)';
            $asm[] = '; Frame par → faixa 0; frame ímpar → faixa 1';
            $asm[] = 'SelectBand:';
            $asm[] = '    inc FrameCnt';
            $asm[] = '    lda FrameCnt';
            $asm[] = '    and #1';
            $asm[] = '    sta BandSel';
            $asm[] = '    tax';
            $asm[] = '    lda BandXTbl,x';
            $asm[] = '    sta P1X';
            $asm[] = '    lda BandNusizTbl,x';
            $asm[] = '    sta BandNusiz';
            $asm[] = '    lda BandColTbl,x';
            $asm[] = '    sta BandCol';
            $asm[] = '    rts';
            $asm[] = '';
            $asm[] = 'BandXTbl:';
            for ($i = 0; $i < $nFlick; $i++) {
                $asm[] = '    .byte ' . (int)$bandParams[$i]['x'];
            }
            $asm[] = 'BandNusizTbl:';
            for ($i = 0; $i < $nFlick; $i++) {
                $asm[] = '    .byte ' . (int)$bandParams[$i]['nusiz'];
            }
            $asm[] = 'BandColTbl:';
            for ($i = 0; $i < $nFlick; $i++) {
                $asm[] = '    .byte $' . sprintf('%02X', $bandParams[$i]['color'] & 0xfe);
            }
            $asm[] = '';
        }

        if ($scoreEnabled) {
            $asm[] = self::scoreBandRoutine($digits, $scoreBg, $scoreLines, $scoreDelay, $scorePlayers, $labelPlayers);
        }
        $asm[] = self::logoRoutine($logoLines);
        $asm[] = self::digitGlyphs();
        $asm[] = self::logoData();

        $asm[] = '; Playfield tables (por scanline)';
        $asm[] = 'PF0Data:';
        foreach ($pfTables['pf0'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF1Data:';
        foreach ($pfTables['pf1'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF2Data:';
        foreach ($pfTables['pf2'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF0RData:';
        foreach ($pfTables['pf0r'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF1RData:';
        foreach ($pfTables['pf1r'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'PF2RData:';
        foreach ($pfTables['pf2r'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'COLUPFData:';
        foreach ($pfTables['colupf'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xfe);
        }
        $asm[] = 'COLUBKData:';
        foreach ($pfTables['colubk'] as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xfe);
        }
        $asm[] = '';
        $asm[] = 'GRP0Data:';
        foreach ($grp0Line as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        $asm[] = 'GRP1Data:';
        foreach ($grp1Line as $b) {
            $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
        }
        if ($flickerMode) {
            $nFlick = min(2, count($grp1Bands));
            for ($bi = 0; $bi < $nFlick; $bi++) {
                $asm[] = 'GRP1Band' . $bi . ':';
                foreach ($grp1Bands[$bi] as $b) {
                    $asm[] = '    .byte $' . sprintf('%02X', $b & 0xff);
                }
            }
        }
        $asm[] = '';
        $asm[] = '; Sprite graphics (linhas top→bottom, ref)';
        $asm[] = '; Sprite graphics (linhas top→bottom)';
        $asm[] = '    align 256';
        $asm[] = 'Sprite0Data:';
        foreach ($gfx0 as $b) {
            $asm[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
        }
        $asm[] = '    align 256';
        $asm[] = 'Sprite1Data:';
        foreach ($gfx1 as $b) {
            $asm[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
        }
        $asm[] = '';

        $asm[] = '; --- RAM ---';
        $asm[] = 'Score0    equ $80';
        $asm[] = 'Score1    equ $81';
        $asm[] = 'Score2    equ $82';
        $asm[] = 'ScoreP0   equ $80            ; nativa placar P1 / single';
        $asm[] = 'ScoreP1   equ $81            ; nativa placar P2 (both)';
        $asm[] = 'Dig0      equ $A0            ; buffer dígitos BCD (até 6+6)';
        $asm[] = 'Dig1      equ $A1';
        $asm[] = 'Dig2      equ $A2';
        $asm[] = 'Dig3      equ $A3';
        $asm[] = 'Dig4      equ $A4';
        $asm[] = 'Dig5      equ $A5';
        $asm[] = 'Dig6      equ $A6            ; P2';
        $asm[] = 'Dig7      equ $A7';
        $asm[] = 'Dig8      equ $A8';
        $asm[] = 'Dig9      equ $A9';
        $asm[] = 'Dig10     equ $AA';
        $asm[] = 'Dig11     equ $AB';
        $asm[] = 'ScRow     equ $AC';
        $asm[] = 'ScIdx     equ $AD';
        $asm[] = 'ScStrip   equ $B2            ; H*3 bytes (faixa P0)';
        $asm[] = 'ScStrip2  equ $C4            ; H*3 bytes (faixa P1)';
        $asm[] = 'Temp      equ $83';

        $asm[] = 'P0Y       equ $84';
        $asm[] = 'P0H       equ $85';
        $asm[] = 'P1Y       equ $86';
        $asm[] = 'P1H       equ $87';
        $asm[] = 'P0X       equ $88';
        $asm[] = 'P1X       equ $89';
        $asm[] = 'P0En      equ $8A';
        $asm[] = 'P1En      equ $8B';
        $asm[] = 'ZPF0L     equ $8C';
        $asm[] = 'ZPF1L     equ $8D';
        $asm[] = 'ZPF2L     equ $8E';
        $asm[] = 'ZPF0R     equ $8F';
        $asm[] = 'ZPF1R     equ $90';
        $asm[] = 'ZPF2R     equ $91';
        $asm[] = 'ZCOLUBK   equ $92';
        $asm[] = 'ZCOLUPF   equ $93';
        $asm[] = 'ZGRP0     equ $94';
        $asm[] = 'ZGRP1     equ $95';
        $asm[] = 'FrameCnt  equ $96            ; contador de frames';
        $asm[] = 'BandSel   equ $97            ; (legado flicker)';
        $asm[] = 'BandNusiz equ $98';
        $asm[] = 'BandCol   equ $99';
        $asm[] = 'RowX     equ $9A            ; X da 1ª fileira';
        $asm[] = 'RowX2    equ $9B            ; X da 2ª fileira';
        $asm[] = 'TmpLine  equ $9C            ; índice scanline durante RESP mid';
        $asm[] = 'WalkTick  equ $9D';
        $asm[] = 'PrevSWCHA equ $9E';
        $asm[] = 'PrevINPT4 equ $9F';
        $asm[] = 'TmpA      equ $AE            ; livre entre score aux e ScStrip';
        $asm[] = 'TmpB      equ $AF';
        $asm[] = 'EnemyAlive equ $E0          ; máscara fileira 1 (bits 0–5)';
        $asm[] = 'EnemyAlive2 equ $E1         ; máscara fileira 2';
        $asm[] = 'P0Alive   equ $E2            ; enable GRP0 fileira atual';
        $asm[] = 'P1Alive   equ $E3';
        $asm[] = 'P0Alive2  equ $E4            ; enable pré-calc fileira 2';
        $asm[] = 'P1Alive2  equ $E5';
        $asm[] = 'P0X2      equ $E6            ; X do P0 na fileira 2 (slot)';
        $asm[] = 'P1X2      equ $E7';
        $asm[] = 'MoveDelay equ $E8';
        $asm[] = 'MoveCtr   equ $E9';
        $asm[] = 'RowDir   equ $EA';
        foreach ($ruleCompiled['equates'] as $line) {
            $asm[] = $line;
        }
        $asm[] = '';
        $asm[] = '    ORG $FFFA';
        $asm[] = '    .word Start';
        $asm[] = '    .word Start';
        $asm[] = '    .word Start';
        $asm[] = '';

        $source = implode("\n", $asm) . "\n";

        return [
            'asm' => $source,
            'romSize' => $romSize,
            'tv' => $tv,
            'scoreEnabled' => $scoreEnabled,
            'scorePos' => $scorePos,
            'scoreAlign' => $scoreAlign,
            'scoreDelay' => $scoreDelay,
            'digits' => $digits,
            'scoreVar' => $scoreVar,
            'logoLines' => $logoLines,
            'playLines' => $playLines,
            'spawns' => ['p0' => $p0, 'p1' => $p1],
            'meta' => [
                'generator' => 'AgcBuilder/0.11.0-bands',
                'org' => sprintf('$%04X', $org),
            ],
        ];
    }

    /** @param array<string,mixed> $project @return array<int,array<string,mixed>|null> */
    private static function resolveBootSpawns(array $project): array
    {
        $out = [0 => null, 1 => null];
        $objects = is_array($project['gameObjects'] ?? null) ? $project['gameObjects'] : [];
        $byId = [];
        foreach ($objects as $o) {
            if (!is_array($o) || empty($o['id'])) {
                continue;
            }
            $byId[(string)$o['id']] = $o;
            if (($o['kind'] ?? 'spawn') !== 'spawn') {
                continue;
            }
            $pl = (int)($o['player'] ?? 0);
            if ($pl !== 0 && $pl !== 1) {
                $pl = 0;
            }
            // first spawn per player as fallback
            if ($out[$pl] === null) {
                $out[$pl] = $o;
            }
        }

        // rules: Boot + spawn_player (formato antigo actions OU steps)
        $rules = is_array($project['rules'] ?? null) ? $project['rules'] : [];
        foreach ($rules as $r) {
            if (!is_array($r)) {
                continue;
            }
            $isBoot = false;
            if (($r['event'] ?? '') === 'boot' || ($r['event'] ?? '') === 'ev_boot') {
                $isBoot = true;
            }
            $actions = [];
            if (!empty($r['steps']) && is_array($r['steps'])) {
                foreach ($r['steps'] as $st) {
                    if (!is_array($st)) continue;
                    if (($st['type'] ?? '') === 'if_event') {
                        $eid = (string)($st['eventId'] ?? '');
                        if ($eid === 'ev_boot' || $eid === 'boot') $isBoot = true;
                    }
                    if (($st['type'] ?? '') === 'action' && ($st['actionId'] ?? '') === 'spawn_player') {
                        $actions[] = ['type' => 'spawn_player', 'arg' => $st['arg'] ?? '', 'arg2' => $st['arg2'] ?? ''];
                    }
                    if (($st['type'] ?? '') === 'spawn_player') {
                        $actions[] = ['type' => 'spawn_player', 'arg' => $st['arg'] ?? '', 'arg2' => $st['arg2'] ?? ''];
                    }
                }
            }
            foreach (($r['actions'] ?? []) as $a) {
                if (is_array($a)) $actions[] = $a;
            }
            if (!$isBoot) continue;
            foreach ($actions as $a) {
                if (($a['type'] ?? '') !== 'spawn_player') continue;
                $spawnId = (string)($a['arg2'] ?? '');
                $spriteId = (string)($a['arg'] ?? '');
                if ($spawnId === '' || !isset($byId[$spawnId])) continue;
                $o = $byId[$spawnId];
                if ($spriteId !== '') $o['spriteId'] = $spriteId;
                $pl = (int)($o['player'] ?? 0);
                if ($pl !== 0 && $pl !== 1) $pl = 0;
                $out[$pl] = $o;
            }
        }
        return $out;
    }

    /** @param array<int,mixed> $sprites */
    private static function findSprite(array $sprites, string $id): ?array
    {
        if ($id === '') {
            return null;
        }
        foreach ($sprites as $s) {
            if (is_array($s) && (string)($s['id'] ?? '') === $id) {
                return $s;
            }
        }
        return null;
    }

    /** @param array<int,mixed> $sprites */
    private static function findSpriteByPlayer(array $sprites, int $player): ?array
    {
        foreach ($sprites as $s) {
            if (is_array($s) && ((int)($s['player'] ?? 0) === $player)) {
                return $s;
            }
        }
        return null;
    }

    /**
     * Converte sprite.data (base64 de bytes 0/1, 8 por linha) em bytes de GRP.
     * @return list<int>
     */
    private static function spriteRows(?array $spr, int $height): array
    {
        $rows = array_fill(0, $height, 0);
        if (!$spr || empty($spr['data']) || !is_string($spr['data'])) {
            // fallback: simples quadradinho
            for ($i = 0; $i < $height; $i++) {
                $rows[$i] = ($i === 0 || $i === $height - 1) ? 0xFF : 0x81;
            }
            return $rows;
        }
        $bin = base64_decode($spr['data'], true);
        if ($bin === false) {
            return $rows;
        }
        $len = strlen($bin);
        for ($y = 0; $y < $height; $y++) {
            $byte = 0;
            for ($x = 0; $x < 8; $x++) {
                $idx = $y * 8 + $x;
                $on = $idx < $len ? (ord($bin[$idx]) & 1) : 0;
                if ($on) {
                    $byte |= (0x80 >> $x);
                }
            }
            $rows[$y] = $byte;
        }
        return $rows;
    }

    /**
     * Mapeia copies (1–3) + spacing → valor NUSIZ do TIA (bits 0–2).
     * Tabela oficial TIA:
     *   0 = 1 cópia
     *   1 = 2 cópias close
     *   2 = 2 cópias medium
     *   3 = 3 cópias close
     *   4 = 2 cópias wide
     *   5 = double size
     *   6 = 3 cópias medium
     *   7 = quad size
     */
    private static function nusizValue(int $copies, string $spacing): int
    {
        $n = max(1, min(3, $copies));
        $sp = strtolower($spacing);
        if ($n === 1) {
            return 0;
        }
        if ($sp === 'medium') {
            return $n === 2 ? 2 : 6; // 2 med | 3 med
        }
        if ($sp === 'wide') {
            return $n === 2 ? 4 : 6; // wide só tem 2; 3 → medium
        }
        // close (padrão)
        return $n === 2 ? 1 : 3; // 2 close | 3 close
    }

    /**
     * Largura aproximada da formação NUSIZ em color clocks (para clamp de X).
     * close ≈ 16 px entre cópias; medium ≈ 32; wide ≈ 64.
     */
    private static function nusizSpanPixels(int $copies, string $spacing): int
    {
        $n = max(1, min(3, $copies));
        if ($n <= 1) {
            return 8;
        }
        $sp = strtolower($spacing);
        $gap = ($sp === 'wide') ? 64 : (($sp === 'medium') ? 32 : 16);
        return 8 + ($n - 1) * $gap;
    }

    /**
     * Lê Project.data.bands e monta faixas prontas para pintar no GRP.
     * @param array<string,mixed> $project
     * @param array<int,mixed> $sprites
     * @return array{hero: ?array, enemies: list<array>}
     */
    private static function resolveBands(array $project, array $sprites, int $playLines): array
    {
        $out = ['hero' => null, 'enemies' => []];
        $bands = is_array($project['bands'] ?? null) ? $project['bands'] : [];
        // Se não há bands, tenta profileOptions.enemyRows só como metadado (sem posições)
        if (count($bands) === 0) {
            return $out;
        }

        foreach ($bands as $b) {
            if (!is_array($b)) {
                continue;
            }
            $role = (string)($b['role'] ?? 'enemy_row');
            $y = max(0, min($playLines - 1, (int)($b['y'] ?? 0)));
            $bandH = max(1, min(48, (int)($b['height'] ?? 16)));
            // baseX do editor manda; xs[] é só preview (pode estar defasado)
            $baseX = max(0, min(152, (int)($b['baseX'] ?? 40)));
            $copies = max(1, min(6, (int)($b['copies'] ?? 1)));
            $spacing = (string)($b['spacing'] ?? 'close');
            $spriteId = (string)($b['spriteId'] ?? '');
            $spr = self::findSprite($sprites, $spriteId);
            if (!$spr) {
                // fallback: primeiro sprite do projeto ou quadrado
                $spr = is_array($sprites[0] ?? null) ? $sprites[0] : null;
            }
            $sprH = $spr ? max(1, min(32, (int)($spr['height'] ?? 8))) : 8;
            $drawH = min($bandH, $sprH);
            $color = $spr ? ((int)($spr['color'] ?? 0x6a) & 0xfe) : 0x6a;
            $gfx = self::spriteRows($spr, $drawH);
            // NUSIZ hardware max 3 por player; 4–6 = dual player
            $nusiz = self::nusizValue(min(3, $copies), $spacing);
            $aliveMask = (int)($b['aliveMask'] ?? ((1 << $copies) - 1));
            $aliveMask &= ((1 << $copies) - 1);
            $moveDelay = max(0, min(255, (int)($b['moveDelay'] ?? 0)));
            $wrap = array_key_exists('wrap', $b) ? !empty($b['wrap']) : true;

            $entry = [
                'id' => (string)($b['id'] ?? ''),
                'role' => $role,
                'y' => $y,
                'bandH' => $bandH,
                'drawH' => $drawH,
                'baseX' => $baseX,
                'copies' => $copies,
                'spacing' => $spacing,
                'nusiz' => $nusiz,
                'color' => $color,
                'gfx' => $gfx,
                'spriteId' => $spriteId,
                'aliveMask' => $aliveMask,
                'moveDelay' => $moveDelay,
                'wrap' => $wrap,
                'moveMode' => (string)($b['moveMode'] ?? ($wrap ? 'wrap' : 'zigzag')),
            ];

            if ($role === 'hero') {
                // só uma faixa herói; a última ganha
                $out['hero'] = $entry;
            } else {
                $out['enemies'][] = $entry;
            }
        }

        usort($out['enemies'], static function ($a, $b) {
            return ($a['y'] ?? 0) <=> ($b['y'] ?? 0);
        });

        return $out;
    }

    private static function registerEquates(): string
    {
        return <<<'ASM'
; --- TIA (write) ---
VSYNC   equ $00
VBLANK  equ $01
WSYNC   equ $02
RSYNC   equ $03
NUSIZ0  equ $04
NUSIZ1  equ $05
COLUP0  equ $06
COLUP1  equ $07
COLUPF  equ $08
COLUBK  equ $09
CTRLPF  equ $0A
REFP0   equ $0B
REFP1   equ $0C
PF0     equ $0D
PF1     equ $0E
PF2     equ $0F
RESP0   equ $10
RESP1   equ $11
RESM0   equ $12
RESM1   equ $13
RESBL   equ $14
AUDC0   equ $15
AUDC1   equ $16
AUDF0   equ $17
AUDF1   equ $18
AUDV0   equ $19
AUDV1   equ $1A
GRP0    equ $1B
GRP1    equ $1C
ENAM0   equ $1D
ENAM1   equ $1E
ENABL   equ $1F
HMP0    equ $20
HMP1    equ $21
HMM0    equ $22
HMM1    equ $23
HMBL    equ $24
VDELP0  equ $25
VDELP1  equ $26
VDELBL  equ $27
HMOVE   equ $2A
HMCLR   equ $2B
CXCLR   equ $2C
; --- TIA (read) ---
CXM0P   equ $00
CXM1P   equ $01
CXP0FB  equ $02
CXP1FB  equ $03
CXM0FB  equ $04
CXM1FB  equ $05
CXBLPF  equ $06
CXPPMM  equ $07
INPT0   equ $08
INPT1   equ $09
INPT2   equ $0A
INPT3   equ $0B
INPT4   equ $0C
INPT5   equ $0D
; --- RIOT ---
SWCHA   equ $0280
SWACNT  equ $0281
SWCHB   equ $0282
SWBCNT  equ $0283
INTIM   equ $0284
TIMINT  equ $0285
TIM1T   equ $0294
TIM8T   equ $0295
TIM64T  equ $0296
T1024T  equ $0297
ASM;
    }

    /**
     * Faixa de placar: fundo opcional preto + dígitos via P0 (ScoreP0 / ScoreP1).
     * v1: 2 dígitos visíveis do ScoreP0 (e ScoreP1 se both) — suficiente para validar timing.
     */
    /**
     * Placar multi-dígito com zeros à esquerda.
     * - Converte ScoreP0/ScoreP1 → Dig0.. em BCD decimal.
     * - NUSIZ triple: atualiza GRP entre cópias (técnica clássica 2600).
     * - align left/center/right: posição X do bloco; both = P0 esq + P1 dir.
     */
    /**
     * Placar compacto (glifos 5 linhas).
     * Pré-calcula GRP por linha e grava em sequência justa (NUSIZ 3 cópias)
     * para não vazar o 3º dígito da direita no lado esquerdo.
     */

    /** @return array{glyphs:list<array<string,mixed>>,byId:array<string,array>,byChar:array<string,array>} */
    private static function loadGlyphBank(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }
        $path = dirname(__DIR__) . '/glifos.json';
        $byId = [];
        $byChar = [];
        $glyphs = [];
        if (is_readable($path)) {
            $raw = json_decode((string)file_get_contents($path), true);
            if (is_array($raw) && isset($raw['glyphs']) && is_array($raw['glyphs'])) {
                $glyphs = $raw['glyphs'];
            }
        }
        foreach ($glyphs as $g) {
            if (!is_array($g)) {
                continue;
            }
            $id = (string)($g['id'] ?? '');
            if ($id !== '') {
                $byId[$id] = $g;
            }
            $ch = strtoupper((string)($g['char'] ?? ''));
            if (strlen($ch) === 1) {
                $byChar[$ch] = $g;
            } elseif ($id === 'logo_mark') {
                $byChar['R'] = $g;
            }
            $nm = strtoupper(trim((string)($g['name'] ?? '')));
            if ($nm === '1P' || $nm === '2P') {
                $byId['label_' . strtolower($nm)] = $g;
                $byChar[$nm] = $g;
            }
        }
        $cache = ['glyphs' => $glyphs, 'byId' => $byId, 'byChar' => $byChar];
        return $cache;
    }

    /**
     * pixels[][] → bytes (MSB = pixel esquerdo), largura efetiva min(8,w).
     * @param array<string,mixed> $g
     * @return list<int>
     */
    private static function glyphToBytes(array $g): array
    {
        $w = max(1, min(8, (int)($g['width'] ?? 8)));
        $h = max(1, min(16, (int)($g['height'] ?? 1)));
        $pixels = is_array($g['pixels'] ?? null) ? $g['pixels'] : [];
        $bytes = [];
        for ($y = 0; $y < $h; $y++) {
            $row = is_array($pixels[$y] ?? null) ? $pixels[$y] : [];
            $b = 0;
            for ($x = 0; $x < $w; $x++) {
                if (!empty($row[$x])) {
                    $b |= (0x80 >> $x);
                }
            }
            $bytes[] = $b & 0xff;
        }
        return $bytes;
    }

    /** Altura dos dígitos no JSON (ou 5). */
    private static function digitGlyphHeight(): int
    {
        $bank = self::loadGlyphBank();
        $g = $bank['byId']['digit_0'] ?? $bank['byChar']['0'] ?? null;
        if ($g) {
            return max(1, min(16, (int)($g['height'] ?? 5)));
        }
        return 5;
    }


    private static function scoreBandRoutine(
        int $digits,
        bool $background,
        int $scoreLines,
        int $delay,
        int $players = 1,
        bool $labelPlayers = false
    ): string {
        // Arquitetura:
        // 1) Pré-cálculo (ScoreToDigits + build dos strips) no início da banda
        //    (idealmente migrar para VBLANK depois).
        // 2) Posicionamento horizontal UMA vez (RESP/HMOVE).
        // 3) Display puro das faixas com gap de 1 scanline entre elas.
        //    Mesma ideia de "várias instâncias" de P0/P1 em bandas diferentes.
        $digitRows = self::digitGlyphHeight();
        $h = $digitRows;
        $players = max(1, min(2, $players));
        $digits = max(2, min(3, $digits));
        $three = ($digits >= 3);
        $labelPlayers = $labelPlayers && $three;
        // delay já vem resolvido do build(): 2dig 4/8/12, 3dig = 7 (centro)
        if ($three) {
            $delay = 7;
        } elseif (!in_array($delay, [4, 8, 12], true)) {
            $delay = 12;
        }
        $pad = 0;
        $bot = 0;
        $out = [];
        $out[] = '; --- Score players=' . $players . ' digits=' . $digits
            . ' delay=' . $delay . ' label=' . ($labelPlayers ? '1' : '0')
            . ' h=' . $h . ' (prep no VBLANK + display puro) ---';
        // ===== ScorePrep: roda no VBLANK =====
        $out[] = 'ScorePrep:';
        if ($labelPlayers) {
            $out[] = '    lda #10                 ; glifo 1P';
            $out[] = '    sta Dig3';
            $out[] = '    jsr ScoreToDigits0Val';
        } else {
            $out[] = '    jsr ScoreToDigits0';
        }
        $out[] = '    ldy #0';
        $out[] = 'ScBuild0:';
        $out[] = '    sty ScRow';
        if ($three) {
            $out[] = '    tya';
            $out[] = '    sta TmpA';
            $out[] = '    asl';
            $out[] = '    clc';
            $out[] = '    adc TmpA';
            $out[] = '    sta ScIdx';
            $out[] = '    lda Dig3';
            $out[] = '    jsr GlyphRow';
            $out[] = '    ldx ScIdx';
            $out[] = '    sta ScStrip,x';
            $out[] = '    inx';
            $out[] = '    stx ScIdx';
            $out[] = '    lda Dig4';
            $out[] = '    jsr GlyphRow';
            $out[] = '    ldx ScIdx';
            $out[] = '    sta ScStrip,x';
            $out[] = '    inx';
            $out[] = '    stx ScIdx';
            $out[] = '    lda Dig5';
            $out[] = '    jsr GlyphRow';
            $out[] = '    ldx ScIdx';
            $out[] = '    sta ScStrip,x';
        } else {
            $out[] = '    tya';
            $out[] = '    asl';
            $out[] = '    sta ScIdx';
            $out[] = '    lda Dig4';
            $out[] = '    jsr GlyphRow';
            $out[] = '    ldx ScIdx';
            $out[] = '    sta ScStrip,x';
            $out[] = '    inx';
            $out[] = '    stx ScIdx';
            $out[] = '    lda Dig5';
            $out[] = '    jsr GlyphRow';
            $out[] = '    ldx ScIdx';
            $out[] = '    sta ScStrip,x';
        }
        $out[] = '    iny';
        $out[] = '    cpy #' . $h;
        $out[] = '    bcc ScBuild0';
        if ($players >= 2) {
            if ($labelPlayers) {
                $out[] = '    lda #11                 ; glifo 2P';
                $out[] = '    sta Dig3';
                $out[] = '    jsr ScoreToDigits1Val';
            } else {
                $out[] = '    jsr ScoreToDigits1';
            }
            $out[] = '    ldy #0';
            $out[] = 'ScBuild1:';
            $out[] = '    sty ScRow';
            if ($three) {
                $out[] = '    tya';
                $out[] = '    sta TmpA';
                $out[] = '    asl';
                $out[] = '    clc';
                $out[] = '    adc TmpA';
                $out[] = '    sta ScIdx';
                $out[] = '    lda Dig3';
                $out[] = '    jsr GlyphRow';
                $out[] = '    ldx ScIdx';
                $out[] = '    sta ScStrip2,x';
                $out[] = '    inx';
                $out[] = '    stx ScIdx';
                $out[] = '    lda Dig4';
                $out[] = '    jsr GlyphRow';
                $out[] = '    ldx ScIdx';
                $out[] = '    sta ScStrip2,x';
                $out[] = '    inx';
                $out[] = '    stx ScIdx';
                $out[] = '    lda Dig5';
                $out[] = '    jsr GlyphRow';
                $out[] = '    ldx ScIdx';
                $out[] = '    sta ScStrip2,x';
            } else {
                $out[] = '    tya';
                $out[] = '    asl';
                $out[] = '    sta ScIdx';
                $out[] = '    lda Dig4';
                $out[] = '    jsr GlyphRow';
                $out[] = '    ldx ScIdx';
                $out[] = '    sta ScStrip2,x';
                $out[] = '    inx';
                $out[] = '    stx ScIdx';
                $out[] = '    lda Dig5';
                $out[] = '    jsr GlyphRow';
                $out[] = '    ldx ScIdx';
                $out[] = '    sta ScStrip2,x';
            }
            $out[] = '    iny';
            $out[] = '    cpy #' . $h;
            $out[] = '    bcc ScBuild1';
        }
        $out[] = '    rts';
        $out[] = '';
        // ===== DrawScoreBand: só display (WSYNC) =====
        $out[] = 'DrawScoreBand:';
        $out[] = '    lda #0';
        $out[] = '    sta PF0';
        $out[] = '    sta PF1';
        $out[] = '    sta PF2';
        $out[] = '    sta CTRLPF';
        $out[] = '    sta GRP0';
        $out[] = '    sta GRP1';
        $out[] = '    sta ENAM0';
        $out[] = '    sta ENAM1';
        $out[] = '    sta ENABL';
        $out[] = '    sta VDELP0';
        $out[] = '    sta VDELP1';
        if ($three) {
            $out[] = '    lda #1                  ; P0: 2 copias close';
            $out[] = '    sta NUSIZ0';
            $out[] = '    lda #0';
            $out[] = '    sta NUSIZ1';
        } else {
            $out[] = '    sta NUSIZ0';
            $out[] = '    sta NUSIZ1';
        }
        $out[] = '    lda #$0E';
        $out[] = '    sta COLUP0';
        $out[] = '    sta COLUP1';
        $out[] = '    ; === POSITION ===';
        $out[] = '    sta WSYNC';
        $out[] = '    ldx #' . $delay;
        $out[] = 'ScPos0:';
        $out[] = '    dex';
        $out[] = '    bne ScPos0';
        if ($three) {
            $out[] = '    nop';
        }
        $out[] = '    sta RESP0';
        $out[] = '    sta RESP1';
        $out[] = '    lda #0';
        $out[] = '    sta HMP0';
        $out[] = '    sta HMP1';
        $out[] = '    sta WSYNC';
        $out[] = '    sta HMOVE';
        $out[] = '    sta WSYNC';
        $out[] = '    sta HMCLR';

        // ---------- DISPLAY P0 ----------
        $out[] = '    ; === DISPLAY faixa P0 ===';
        $out[] = '    ldy #0';
        $out[] = 'ScDigRows0:';
        $out[] = '    sta WSYNC';
        if ($background) {
            $out[] = '    lda #0';
            $out[] = '    sta COLUBK';
        }
        if ($three) {
            $out[] = '    tya';
            $out[] = '    sta TmpA';
            $out[] = '    asl';
            $out[] = '    clc';
            $out[] = '    adc TmpA';
            $out[] = '    tax';
            $out[] = '    lda ScStrip,x';
            $out[] = '    sta GRP0';
            $out[] = '    inx';
            $out[] = '    lda ScStrip,x';
            $out[] = '    sta GRP1';
            $out[] = '    inx';
            $out[] = '    lda ScStrip,x';
            $out[] = '    sta GRP0';
        } else {
            $out[] = '    tya';
            $out[] = '    asl';
            $out[] = '    tax';
            $out[] = '    lda ScStrip,x';
            $out[] = '    sta GRP0';
            $out[] = '    inx';
            $out[] = '    lda ScStrip,x';
            $out[] = '    sta GRP1';
        }
        $out[] = '    iny';
        $out[] = '    cpy #' . $h;
        $out[] = '    bcc ScDigRows0';
        $out[] = '    lda #0';
        $out[] = '    sta GRP0';
        $out[] = '    sta GRP1';

        if ($players >= 2) {
            // gap de 1 scanline (o "atraso" controlado)
            $out[] = '    ; === GAP 1 scanline entre faixas ===';
            $out[] = '    sta WSYNC';
            if ($background) {
                $out[] = '    lda #0';
                $out[] = '    sta COLUBK';
            }
            $out[] = '    lda #0';
            $out[] = '    sta GRP0';
            $out[] = '    sta GRP1';

            // ---------- DISPLAY P1 ----------
            $out[] = '    ; === DISPLAY faixa P1 ===';
            $out[] = '    ldy #0';
            $out[] = 'ScDigRows1:';
            $out[] = '    sta WSYNC';
            if ($background) {
                $out[] = '    lda #0';
                $out[] = '    sta COLUBK';
            }
            if ($three) {
                $out[] = '    tya';
                $out[] = '    sta TmpA';
                $out[] = '    asl';
                $out[] = '    clc';
                $out[] = '    adc TmpA';
                $out[] = '    tax';
                $out[] = '    lda ScStrip2,x';
                $out[] = '    sta GRP0';
                $out[] = '    inx';
                $out[] = '    lda ScStrip2,x';
                $out[] = '    sta GRP1';
                $out[] = '    inx';
                $out[] = '    lda ScStrip2,x';
                $out[] = '    sta GRP0';
            } else {
                $out[] = '    tya';
                $out[] = '    asl';
                $out[] = '    tax';
                $out[] = '    lda ScStrip2,x';
                $out[] = '    sta GRP0';
                $out[] = '    inx';
                $out[] = '    lda ScStrip2,x';
                $out[] = '    sta GRP1';
            }
            $out[] = '    iny';
            $out[] = '    cpy #' . $h;
            $out[] = '    bcc ScDigRows1';
            $out[] = '    lda #0';
            $out[] = '    sta GRP0';
            $out[] = '    sta GRP1';
        }

        $out[] = '    rts';
        $out[] = '';

        // GlyphRow + ScoreToDigits (mantidos)
        $out[] = 'GlyphRow:';
        $out[] = '    sta Temp';
        $out[] = '    lda #0';
        $out[] = '    sta TmpB';
        $out[] = '    ldx Temp';
        $out[] = '    beq GR_Done';
        $out[] = 'GR_Mul:';
        $out[] = '    lda TmpB';
        $out[] = '    clc';
        $out[] = '    adc #' . $h;
        $out[] = '    sta TmpB';
        $out[] = '    dex';
        $out[] = '    bne GR_Mul';
        $out[] = 'GR_Done:';
        $out[] = '    lda TmpB';
        $out[] = '    clc';
        $out[] = '    adc ScRow';
        $out[] = '    tax';
        $out[] = '    lda DigitGfx,x';
        $out[] = '    rts';
        $out[] = '';
        $out[] = 'ScoreToDigits0:';
        $out[] = '    lda #0';
        $out[] = '    sta Dig3';
        $out[] = '    sta Dig4';
        $out[] = '    sta Dig5';
        $out[] = '    lda ScoreP0';
        $out[] = '    sta Temp';
        $out[] = 'S0H:';
        $out[] = '    lda Temp';
        $out[] = '    cmp #100';
        $out[] = '    bcc S0T';
        $out[] = '    sec';
        $out[] = '    sbc #100';
        $out[] = '    sta Temp';
        $out[] = '    inc Dig3';
        $out[] = '    jmp S0H';
        $out[] = 'S0T:';
        $out[] = '    lda Temp';
        $out[] = '    cmp #10';
        $out[] = '    bcc S0U';
        $out[] = '    sec';
        $out[] = '    sbc #10';
        $out[] = '    sta Temp';
        $out[] = '    inc Dig4';
        $out[] = '    jmp S0T';
        $out[] = 'S0U:';
        $out[] = '    lda Temp';
        $out[] = '    sta Dig5';
        $out[] = '    rts';
        $out[] = '';
        $out[] = 'ScoreToDigits0Val:';
        $out[] = '    lda #0';
        $out[] = '    sta Dig4';
        $out[] = '    sta Dig5';
        $out[] = '    lda ScoreP0';
        $out[] = '    sta Temp';
        $out[] = 'S0V_T:';
        $out[] = '    lda Temp';
        $out[] = '    cmp #10';
        $out[] = '    bcc S0V_U';
        $out[] = '    sec';
        $out[] = '    sbc #10';
        $out[] = '    sta Temp';
        $out[] = '    inc Dig4';
        $out[] = '    lda Dig4';
        $out[] = '    cmp #10';
        $out[] = '    bcc S0V_T';
        $out[] = '    lda #0';
        $out[] = '    sta Dig4';
        $out[] = '    jmp S0V_T';
        $out[] = 'S0V_U:';
        $out[] = '    lda Temp';
        $out[] = '    sta Dig5';
        $out[] = '    rts';
        $out[] = '';
        $out[] = 'ScoreToDigits1:';
        $out[] = '    lda #0';
        $out[] = '    sta Dig3';
        $out[] = '    sta Dig4';
        $out[] = '    sta Dig5';
        $out[] = '    lda ScoreP1';
        $out[] = '    sta Temp';
        $out[] = 'S1H:';
        $out[] = '    lda Temp';
        $out[] = '    cmp #100';
        $out[] = '    bcc S1T';
        $out[] = '    sec';
        $out[] = '    sbc #100';
        $out[] = '    sta Temp';
        $out[] = '    inc Dig3';
        $out[] = '    jmp S1H';
        $out[] = 'S1T:';
        $out[] = '    lda Temp';
        $out[] = '    cmp #10';
        $out[] = '    bcc S1U';
        $out[] = '    sec';
        $out[] = '    sbc #10';
        $out[] = '    sta Temp';
        $out[] = '    inc Dig4';
        $out[] = '    jmp S1T';
        $out[] = 'S1U:';
        $out[] = '    lda Temp';
        $out[] = '    sta Dig5';
        $out[] = '    rts';
        $out[] = '';
        $out[] = 'ScoreToDigits1Val:';
        $out[] = '    lda #0';
        $out[] = '    sta Dig4';
        $out[] = '    sta Dig5';
        $out[] = '    lda ScoreP1';
        $out[] = '    sta Temp';
        $out[] = 'S1V_T:';
        $out[] = '    lda Temp';
        $out[] = '    cmp #10';
        $out[] = '    bcc S1V_U';
        $out[] = '    sec';
        $out[] = '    sbc #10';
        $out[] = '    sta Temp';
        $out[] = '    inc Dig4';
        $out[] = '    lda Dig4';
        $out[] = '    cmp #10';
        $out[] = '    bcc S1V_T';
        $out[] = '    lda #0';
        $out[] = '    sta Dig4';
        $out[] = '    jmp S1V_T';
        $out[] = 'S1V_U:';
        $out[] = '    lda Temp';
        $out[] = '    sta Dig5';
        $out[] = '    rts';
        $out[] = '';
        return implode("\n", $out);
    }


    private static function logoRoutine(int $logoLines): string
    {
        // P0+P1: 1 instância cada (NUSIZ=0), colados, à esquerda (delay 5).
        // Rainbow: COLUP0/COLUP1 por scanline (players usam COLUPx, não COLUPF).
        $budget = max(6, min(16, $logoLines));
        $drawH = self::logoGlyphHeight();
        $pad = max(0, $budget - $drawH - 3);
        $out = [];
        $out[] = '; --- Logo (P0+P1 únicos, esq, rainbow) h=' . $drawH . ' budget=' . $budget . ' ---';
        $out[] = 'DrawLogo:';
        $out[] = '    lda #0';
        $out[] = '    sta PF0';
        $out[] = '    sta PF1';
        $out[] = '    sta PF2';
        $out[] = '    sta CTRLPF';
        $out[] = '    sta ENAM0';
        $out[] = '    sta ENAM1';
        $out[] = '    sta ENABL';
        $out[] = '    sta NUSIZ0              ; 1 instância P0';
        $out[] = '    sta NUSIZ1              ; 1 instância P1';
        $out[] = '    sta WSYNC';
        $out[] = '    ldx #5                  ; esquerda (~placar delay 4–6)';
        $out[] = 'LogoPos:';
        $out[] = '    dex';
        $out[] = '    bne LogoPos';
        $out[] = '    sta RESP0';
        $out[] = '    sta RESP1              ; o mais colados possível';
        $out[] = '    lda #0';
        $out[] = '    sta HMP0';
        $out[] = '    lda #$10                ; P1 logo à direita do P0';
        $out[] = '    sta HMP1';
        $out[] = '    sta WSYNC';
        $out[] = '    sta HMOVE';
        $out[] = '    sta WSYNC';
        $out[] = '    sta HMCLR';
        $out[] = '    ldy #0';
        $out[] = 'LogoRows:';
        $out[] = '    sta WSYNC';
        $out[] = '    lda #0';
        $out[] = '    sta COLUBK              ; fundo preto';
        $out[] = '    lda LogoRain,y          ; rainbow por scanline';
        $out[] = '    sta COLUP0';
        $out[] = '    sta COLUP1';
        $out[] = '    lda LogoG0,y            ; LP1';
        $out[] = '    sta GRP0';
        $out[] = '    lda LogoG1,y            ; LP2';
        $out[] = '    sta GRP1';
        $out[] = '    iny';
        $out[] = '    cpy #' . $drawH;
        $out[] = '    bcc LogoRows';
        $out[] = '    lda #0';
        $out[] = '    sta GRP0';
        $out[] = '    sta GRP1';
        if ($pad > 0) {
            $out[] = '    ldx #' . $pad;
            $out[] = 'LogoPad:';
            $out[] = '    sta WSYNC';
            $out[] = '    lda #0';
            $out[] = '    sta COLUBK';
            $out[] = '    dex';
            $out[] = '    bne LogoPad';
        }
        $out[] = '    rts';
        $out[] = '';
        return implode("\n", $out);
    }

    /** Altura dos glifos do logo (LP1/LP2 ou fallback). */
    private static function logoGlyphHeight(): int
    {
        $bank = self::loadGlyphBank();
        foreach (['lp1', 'LP1', 'logo_lp1', 'lp2', 'LP2', 'logo_lp2', 'logo_mark'] as $id) {
            if (isset($bank['byId'][$id])) {
                return max(1, min(16, (int)($bank['byId'][$id]['height'] ?? 6)));
            }
        }
        // por name
        foreach ($bank['glyphs'] ?? [] as $g) {
            if (!is_array($g)) {
                continue;
            }
            $nm = strtoupper(trim((string)($g['name'] ?? '')));
            if ($nm === 'LP1' || $nm === 'LP2') {
                return max(1, min(16, (int)($g['height'] ?? 6)));
            }
        }
        return 6;
    }

    private static function digitGlyphs(): string
    {
        $bank = self::loadGlyphBank();
        $h = self::digitGlyphHeight();
        $lines = [];
        $lines[] = 'DigitGfx:';
        for ($d = 0; $d <= 9; $d++) {
            $g = $bank['byId']['digit_' . $d] ?? $bank['byChar'][(string)$d] ?? null;
            $bytes = $g ? self::glyphToBytes($g) : array_fill(0, $h, 0);
            while (count($bytes) < $h) {
                $bytes[] = 0;
            }
            $bytes = array_slice($bytes, 0, $h);
            $lines[] = 'Digit' . $d . ':';
            foreach ($bytes as $b) {
                $lines[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
            }
        }
        foreach ([['label_1p', '1P', 'Label1P'], ['label_2p', '2P', 'Label2P']] as $lab) {
            $g = $bank['byId'][$lab[0]] ?? $bank['byChar'][$lab[1]] ?? null;
            $bytes = $g ? self::glyphToBytes($g) : array_fill(0, $h, 0);
            while (count($bytes) < $h) {
                $bytes[] = 0;
            }
            $bytes = array_slice($bytes, 0, $h);
            $lines[] = $lab[2] . ':';
            foreach ($bytes as $b) {
                $lines[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
            }
        }
        $lines[] = '';
        return implode("\n", $lines);
    }

    /**
     * Tabelas GRP do logo (P0=LP1, P1=LP2) + rainbow COLUP0/1.
     * Procura glifos id/name LP1/LP2; senão quadradinho 8xH.
     */
    private static function logoData(): string
    {
        $bank = self::loadGlyphBank();
        $h = self::logoGlyphHeight();
        $g0 = self::findLogoGlyph($bank, ['lp1', 'LP1', 'logo_lp1'], 'LP1');
        $g1 = self::findLogoGlyph($bank, ['lp2', 'LP2', 'logo_lp2'], 'LP2');
        // fallback: quadradinho sólido (bits altos = esquerda do sprite)
        $square = array_fill(0, $h, 0xf0);
        $b0 = $g0 ? self::glyphToBytes($g0) : $square;
        $b1 = $g1 ? self::glyphToBytes($g1) : $square;
        while (count($b0) < $h) {
            $b0[] = 0;
        }
        while (count($b1) < $h) {
            $b1[] = 0;
        }
        $b0 = array_slice($b0, 0, $h);
        $b1 = array_slice($b1, 0, $h);

        // Rainbow estilo Activision (hues NTSC, luminância média)
        $rain = [];
        $palette = [0x42, 0x52, 0x62, 0x72, 0x82, 0x92, 0xa2, 0xb2, 0xc2, 0xd2, 0xe2, 0x32];
        for ($i = 0; $i < $h; $i++) {
            $rain[] = $palette[$i % count($palette)];
        }

        $out = [];
        $out[] = 'LogoG0:';
        foreach ($b0 as $b) {
            $out[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
        }
        $out[] = 'LogoG1:';
        foreach ($b1 as $b) {
            $out[] = '    .byte %' . str_pad(decbin($b & 0xff), 8, '0', STR_PAD_LEFT);
        }
        $out[] = 'LogoRain:';
        foreach ($rain as $b) {
            $out[] = '    .byte $' . sprintf('%02X', $b & 0xfe);
        }
        $out[] = '';
        return implode("\n", $out);
    }

    /**
     * @param array{byId:array,glyphs?:list} $bank
     * @param list<string> $ids
     */
    private static function findLogoGlyph(array $bank, array $ids, string $name): ?array
    {
        foreach ($ids as $id) {
            if (isset($bank['byId'][$id]) && is_array($bank['byId'][$id])) {
                return $bank['byId'][$id];
            }
        }
        $want = strtoupper($name);
        foreach ($bank['glyphs'] ?? [] as $g) {
            if (!is_array($g)) {
                continue;
            }
            $nm = strtoupper(trim((string)($g['name'] ?? '')));
            if ($nm === $want) {
                return $g;
            }
        }
        return null;
    }

    /**
     * @param array{byChar:array<string,array>} $bank
     * @return array{pf0:list<int>,pf1:list<int>,pf2:list<int>}
     */
    private static function buildLogoPfRows(array $bank, int $maxLines): array
    {
        $line1 = self::blitTextToPfBits('RETRO', $bank['byChar'] ?? [], 1);
        $line2 = self::blitTextToPfBits('COMPILER', $bank['byChar'] ?? [], 0);
        $h1 = count($line1) > 0 ? count($line1) : 5;
        $h2 = count($line2) > 0 ? count($line2) : 5;
        $bitsRows = [];
        // linha 1
        foreach ($line1 as $row) {
            $bitsRows[] = $row;
        }
        // sem gap extra — mais “fechado” estilo faixa Activision
        foreach ($line2 as $row) {
            if (count($bitsRows) >= $maxLines) {
                break;
            }
            $bitsRows[] = $row;
        }
        while (count($bitsRows) < $maxLines) {
            $bitsRows[] = array_fill(0, 40, 0);
        }
        $pf0 = [];
        $pf1 = [];
        $pf2 = [];
        foreach ($bitsRows as $bits) {
            $enc = self::encodePlayfieldLine($bits);
            $pf0[] = $enc[0];
            $pf1[] = $enc[1];
            $pf2[] = $enc[2];
        }
        return ['pf0' => $pf0, 'pf1' => $pf1, 'pf2' => $pf2];
    }

    /**
     * Texto → lista de rows com 40 bits (PF full width via reflect usa 20; geramos 20 úteis centrados).
     * @param array<string,array<string,mixed>> $byChar
     * @return list<list<int>>
     */
    private static function blitTextToPfBits(string $text, array $byChar, int $gap): array
    {
        $text = strtoupper($text);
        $glyphs = [];
        $maxH = 1;
        for ($i = 0, $n = strlen($text); $i < $n; $i++) {
            $ch = $text[$i];
            $g = $byChar[$ch] ?? null;
            if (!$g) {
                continue;
            }
            $glyphs[] = $g;
            $maxH = max($maxH, (int)($g['height'] ?? 1));
        }
        if ($glyphs === []) {
            return array_fill(0, 5, array_fill(0, 40, 0));
        }
        $rows = [];
        for ($y = 0; $y < $maxH; $y++) {
            $bits = array_fill(0, 40, 0);
            $x = 1; // margem esquerda
            foreach ($glyphs as $g) {
                $w = max(1, (int)($g['width'] ?? 8));
                $pixels = is_array($g['pixels'] ?? null) ? $g['pixels'] : [];
                $row = is_array($pixels[$y] ?? null) ? $pixels[$y] : [];
                for ($i = 0; $i < $w; $i++) {
                    if ($x + $i >= 40) {
                        break;
                    }
                    if (!empty($row[$i])) {
                        $bits[$x + $i] = 1;
                    }
                }
                $x += $w + $gap;
                if ($x >= 40) {
                    break;
                }
            }
            $rows[] = $bits;
        }
        return $rows;
    }

    private static function encodePlayfieldLine(array $pix): array
    {
        $pf0 = 0;
        if (!empty($pix[0])) $pf0 |= 0x10;
        if (!empty($pix[1])) $pf0 |= 0x20;
        if (!empty($pix[2])) $pf0 |= 0x40;
        if (!empty($pix[3])) $pf0 |= 0x80;
        $pf1 = 0;
        for ($i = 0; $i < 8; $i++) {
            if (!empty($pix[4 + $i])) {
                $pf1 |= (0x80 >> $i);
            }
        }
        $pf2 = 0;
        for ($i = 0; $i < 8; $i++) {
            if (!empty($pix[12 + $i])) {
                $pf2 |= (0x01 << $i);
            }
        }
        return [$pf0 & 0xff, $pf1 & 0xff, $pf2 & 0xff];
    }

    /**
     * Extrai tabelas PF + cores da primeira playfield do projeto.
     * @param array<string,mixed> $project
     * @return array{pf0:list<int>,pf1:list<int>,pf2:list<int>,colupf:list<int>,colubk:list<int>,mode:string,height:int}
     */
    private static function extractPlayfield(array $project, int $playLines): array
    {
        $empty = [
            'pf0' => array_fill(0, $playLines, 0),
            'pf1' => array_fill(0, $playLines, 0),
            'pf2' => array_fill(0, $playLines, 0),
            'pf0r' => array_fill(0, $playLines, 0),
            'pf1r' => array_fill(0, $playLines, 0),
            'pf2r' => array_fill(0, $playLines, 0),
            'colupf' => array_fill(0, $playLines, 0x0a),
            'colubk' => array_fill(0, $playLines, 0x00),
            'mode' => 'reflect',
            'height' => $playLines,
        ];
        $pfs = is_array($project['playfields'] ?? null) ? $project['playfields'] : [];
        if ($pfs === []) {
            return $empty;
        }
        // Prefer screen of first spawn, else first playfield
        $wantScreen = null;
        foreach (is_array($project['gameObjects'] ?? null) ? $project['gameObjects'] : [] as $o) {
            if (is_array($o) && ($o['kind'] ?? 'spawn') === 'spawn' && !empty($o['screenId'])) {
                $wantScreen = (string)$o['screenId'];
                break;
            }
        }
        $pf = null;
        if ($wantScreen !== null) {
            foreach ($pfs as $row) {
                if (is_array($row) && (string)($row['screenId'] ?? '') === $wantScreen) {
                    $pf = $row;
                    break;
                }
            }
        }
        if ($pf === null) {
            $pf = is_array($pfs[0]) ? $pfs[0] : null;
        }
        if ($pf === null) {
            return $empty;
        }

        $mode = (string)($pf['mode'] ?? 'reflect');
        if (!in_array($mode, ['reflect', 'repeat', 'asymmetric'], true)) {
            $mode = !empty($pf['reflect']) ? 'reflect' : 'repeat';
        }
        $h = max(1, (int)($pf['height'] ?? $playLines));
        $w = 40;
        $pixels = array_fill(0, $w * $h, 0);
        if (!empty($pf['data']) && is_string($pf['data'])) {
            $bin = base64_decode($pf['data'], true);
            if ($bin !== false) {
                $n = min(strlen($bin), $w * $h);
                for ($i = 0; $i < $n; $i++) {
                    $pixels[$i] = ord($bin[$i]) & 1;
                }
            }
        }
        $colupf = array_fill(0, $h, ((int)($pf['colupf'] ?? 0x0a)) & 0xfe);
        $colubk = array_fill(0, $h, ((int)($pf['colubk'] ?? 0x00)) & 0xfe);
        if (!empty($pf['lineColupf']) && is_string($pf['lineColupf'])) {
            $bin = base64_decode($pf['lineColupf'], true);
            if ($bin !== false) {
                for ($i = 0; $i < min(strlen($bin), $h); $i++) {
                    $colupf[$i] = ord($bin[$i]) & 0xfe;
                }
            }
        }
        if (!empty($pf['lineColubk']) && is_string($pf['lineColubk'])) {
            $bin = base64_decode($pf['lineColubk'], true);
            if ($bin !== false) {
                for ($i = 0; $i < min(strlen($bin), $h); $i++) {
                    $colubk[$i] = ord($bin[$i]) & 0xfe;
                }
            }
        }

        $outPf0 = [];
        $outPf1 = [];
        $outPf2 = [];
        $outPf0r = [];
        $outPf1r = [];
        $outPf2r = [];
        $outCup = [];
        $outCub = [];
        for ($y = 0; $y < $playLines; $y++) {
            $srcY = $y < $h ? $y : ($h - 1);
            $lineL = [];
            $lineR = [];
            for ($x = 0; $x < 20; $x++) {
                $lineL[$x] = $pixels[$srcY * $w + $x] & 1;
                $lineR[$x] = $pixels[$srcY * $w + 20 + $x] & 1;
            }
            [$a, $b, $c] = self::encodePlayfieldLine($lineL);
            $outPf0[] = $a;
            $outPf1[] = $b;
            $outPf2[] = $c;
            [$ar, $br, $cr] = self::encodePlayfieldLine($lineR);
            $outPf0r[] = $ar;
            $outPf1r[] = $br;
            $outPf2r[] = $cr;
            $outCup[] = $colupf[$srcY] ?? 0x0a;
            $outCub[] = $colubk[$srcY] ?? 0x00;
        }
        return [
            'pf0' => $outPf0,
            'pf1' => $outPf1,
            'pf2' => $outPf2,
            'pf0r' => $outPf0r,
            'pf1r' => $outPf1r,
            'pf2r' => $outPf2r,
            'colupf' => $outCup,
            'colubk' => $outCub,
            'mode' => $mode,
            'height' => $h,
        ];
    }


    /**
     * Compila regras do projeto em ASM (Boot + entre kernels / GameLogic).
     * @param array<string,mixed> $project
     * @return array{boot:list<string>,frame:list<string>,equates:list<string>,inits:list<string>}
     */
    private static function compileRules(array $project): array
    {
        $boot = [];
        $frame = [];
        $equates = [];
        $inits = [];

        $vars = is_array($project['variables'] ?? null) ? $project['variables'] : [];
        $events = is_array($project['events'] ?? null) ? $project['events'] : [];
        $eventsById = [];
        foreach ($events as $ev) {
            if (is_array($ev) && !empty($ev['id'])) {
                $eventsById[(string)$ev['id']] = $ev;
            }
        }

        // Aloca variáveis do usuário a partir de $A0
        // rowX / enemyAlive → RAM fixo do kernel (mesmo endereço do VBLANK)
        $fixedMega = [
            'rowX' => ['addr' => 0x9A, 'label' => 'RowX'],
            'rowX2' => ['addr' => 0x9B, 'label' => 'RowX2'],
            'enemyAlive' => ['addr' => 0xE0, 'label' => 'EnemyAlive'],
            'enemyAlive1' => ['addr' => 0xE0, 'label' => 'EnemyAlive'],
            'enemyAlive2' => ['addr' => 0xE1, 'label' => 'EnemyAlive2'],
            'scoreP0' => ['addr' => 0x80, 'label' => 'ScoreP0'],
            'scoreP1' => ['addr' => 0x81, 'label' => 'ScoreP1'],
            'score' => ['addr' => 0x80, 'label' => 'ScoreP0'],
        ];
        // $A0-$AB Digs, $AC-$AD ScRow/Idx, $AE-$AF TmpA/B, $B2+ ScStrip — user vars em $D0+
        $addr = 0xD0;
        $varMap = []; // id|name -> ['addr'=>, 'type'=>, 'label'=>]
        foreach ($vars as $v) {
            if (!is_array($v)) continue;
            $id = (string)($v['id'] ?? '');
            $name = (string)($v['name'] ?? 'var');
            $type = (string)($v['type'] ?? 'byte');
            $initVal = (int)($v['value'] ?? $v['init'] ?? 0) & 0xff;
            if (isset($fixedMega[$name])) {
                $fm = $fixedMega[$name];
                $label = $fm['label'];
                $varMap[$id] = ['addr' => $fm['addr'], 'type' => $type, 'label' => $label, 'name' => $name];
                if ($name !== '') {
                    $varMap['name:' . $name] = $varMap[$id];
                }
                // NÃO reinicia RowX aqui: boot já carregou baseX do editor.
                // enemyAlive: reforça valor da Programação se definido.
                if ($name === 'enemyAlive' || $name === 'enemyAlive1') {
                    $inits[] = '    lda #' . ($initVal & 0x3f);
                    $inits[] = '    sta EnemyAlive';
                }
                if ($name === 'enemyAlive2') {
                    $inits[] = '    lda #' . ($initVal & 0x3f);
                    $inits[] = '    sta EnemyAlive2';
                }
                continue;
            }
            $label = self::varLabel($name, $id);
            $size = $type === 'word' ? 2 : 1;
            if ($type === 'bool') {
                $size = 1;
            }
            if ($addr + $size > 0xFF) break;
            // evita regiões reservadas do kernel
            if ($addr >= 0x9A && $addr <= 0x9F) {
                $addr = 0xD0;
            }
            if ($addr >= 0xA0 && $addr <= 0xAF) {
                $addr = 0xD0; // Digs / Tmp
            }
            if ($addr >= 0xB0 && $addr <= 0xCF) {
                $addr = 0xD0; // ScStrip / score aux
            }
            if ($addr >= 0xE0 && $addr <= 0xE8) {
                $addr = 0xE9;
            }
            $varMap[$id] = ['addr' => $addr, 'type' => $type, 'label' => $label, 'name' => $name];
            if ($name !== '') $varMap['name:' . $name] = $varMap[$id];
            $equates[] = sprintf('%-10s equ $%02X', $label, $addr);
            $inits[] = '    lda #' . ($initVal & 0xff);
            $inits[] = '    sta ' . $label;
            if ($size === 2) {
                $inits[] = '    lda #0';
                $inits[] = '    sta ' . $label . '+1';
            }
            $addr += $size;
        }


        // Timers de jogo em FRAMES (1 frame = mínimo; 60 ≈ 1s NTSC)
        $timers = [];
        foreach ($events as $ev) {
            if (!is_array($ev) || ($ev['category'] ?? '') !== 'timer') {
                continue;
            }
            $tid = (string)($ev['id'] ?? '');
            if ($tid === '') {
                continue;
            }
            // Novo: frames. Legado: seconds → ×60
            if (isset($ev['frames'])) {
                $period = max(1, min(255, (int)$ev['frames']));
            } else {
                $period = max(1, min(255, ((int)($ev['seconds'] ?? 1)) * 60));
            }
            $lab = 'Tmr_' . substr(preg_replace('/[^A-Za-z0-9]/', '', $tid) ?: 'x', 0, 10);
            $fire = 'TFire_' . substr(preg_replace('/[^A-Za-z0-9]/', '', $tid) ?: 'x', 0, 8);
            $timers[] = ['id' => $tid, 'frames' => $period, 'remLabel' => $lab, 'fireLabel' => $fire];
            $equates[] = sprintf('%-10s equ $%02X', $lab, $addr);
            $addr++;
            if ($addr > 0xFE) {
                break;
            }
            $equates[] = sprintf('%-10s equ $%02X', $fire, $addr);
            $addr++;
            $inits[] = '    lda #' . $period;
            $inits[] = '    sta ' . $lab;
            $inits[] = '    lda #0';
            $inits[] = '    sta ' . $fire;
        }
        $timerById = [];
        foreach ($timers as $tm) {
            $timerById[$tm['id']] = $tm;
        }

        $rules = is_array($project['rules'] ?? null) ? $project['rules'] : [];
        $ri = 0;
        foreach ($rules as $rule) {
            if (!is_array($rule)) continue;
            $ri++;
            $steps = [];
            if (!empty($rule['steps']) && is_array($rule['steps'])) {
                $steps = $rule['steps'];
            } else {
                // legado → steps
                if (!empty($rule['event'])) {
                    $eid = (string)$rule['event'];
                    if ($eid === 'boot') $eid = 'ev_boot';
                    if ($eid === 'vblank') $eid = 'ev_vblank';
                    $steps[] = ['type' => 'if_event', 'eventId' => $eid];
                }
                foreach ($rule['conditions'] ?? [] as $c) {
                    if (!is_array($c)) continue;
                    $steps[] = [
                        'type' => 'if_var',
                        'varName' => $c['left'] ?? '',
                        'op' => $c['op'] ?? '==',
                        'value' => (int)($c['right'] ?? 0),
                    ];
                }
                foreach ($rule['actions'] ?? [] as $a) {
                    if (!is_array($a)) continue;
                    $t = (string)($a['type'] ?? '');
                    if (in_array($t, ['set_var', 'add_var', 'sub_var'], true)) {
                        $steps[] = ['type' => $t, 'varName' => $a['arg'] ?? '', 'value' => (int)($a['arg2'] ?? 0)];
                    } else {
                        $steps[] = ['type' => 'action', 'actionId' => $t, 'arg' => $a['arg'] ?? '', 'arg2' => $a['arg2'] ?? ''];
                    }
                }
            }
            if (!$steps) continue;

            $isBoot = false;
            foreach ($steps as $st) {
                if (($st['type'] ?? '') !== 'if_event') continue;
                $eid = (string)($st['eventId'] ?? '');
                $ev = $eventsById[$eid] ?? null;
                if ($eid === 'ev_boot' || $eid === 'boot' || ($ev && ($ev['category'] ?? '') === 'system' && strtolower((string)($ev['name'] ?? '')) === 'boot')) {
                    $isBoot = true;
                }
            }

            $tag = 'R' . $ri;
            $body = self::compileRuleBody($steps, $varMap, $eventsById, $timerById, $tag, $isBoot);
            if ($isBoot) {
                $boot[] = '    ; rule ' . self::safeLabel((string)($rule['name'] ?? $tag));
                foreach ($body as $ln) $boot[] = $ln;
            } else {
                $frame[] = '    ; rule ' . self::safeLabel((string)($rule['name'] ?? $tag));
                foreach ($body as $ln) $frame[] = $ln;
            }
        }

        // Prefixo frame: input + timers em frames (1 tick = 1 frame)
        $framePrefix = [
            '    ; --- sample input ---',
            '    inc FrameCnt',
            '    inc WalkTick',
            '    lda SWCHA',
            '    sta TmpA',
            '    lda INPT4',
            '    sta TmpB',
            '    ; --- timers (período em frames) ---',
        ];
        foreach ($timers as $i => $tm) {
            $fr = (int)$tm['frames'];
            $framePrefix[] = '    ; timer ' . $tm['id'] . ' a cada ' . $fr . ' frame(s)';
            $framePrefix[] = '    lda #0';
            $framePrefix[] = '    sta ' . $tm['fireLabel'];
            $framePrefix[] = '    dec ' . $tm['remLabel'];
            $framePrefix[] = '    bne TmrOk' . $i;
            $framePrefix[] = '    lda #' . $fr;
            $framePrefix[] = '    sta ' . $tm['remLabel'];
            $framePrefix[] = '    lda #1';
            $framePrefix[] = '    sta ' . $tm['fireLabel'];
            $framePrefix[] = 'TmrOk' . $i . ':';
        }

        $frame = array_merge($framePrefix, $frame, [
            '    lda TmpA',
            '    sta PrevSWCHA',
            '    lda INPT4',
            '    sta PrevINPT4',
            '    sta CXCLR              ; limpa latches de colisão',
        ]);

        return [
            'boot' => $boot,
            'frame' => $frame,
            'equates' => $equates,
            'inits' => $inits,
        ];
    }

    /** @param list<array<string,mixed>> $steps @param array<string,array<string,mixed>> $varMap @param array<string,array<string,mixed>> $eventsById @return list<string> */

    /** @param list<array<string,mixed>> $steps @param array<string,array<string,mixed>> $varMap @param array<string,array<string,mixed>> $eventsById @return list<string> */
    private static function compileRuleBody(array $steps, array $varMap, array $eventsById, array $timerById, string $tag, bool $isBoot): array
    {
        $end = $tag . '_end';
        $go = $tag . '_go'; // ações do SE (then)
        $elseL = $tag . '_else';

        // --- particiona: condições | then-ações | else-ações ---
        $conds = []; // [ ['join'=>'and'|'or'|null, 'step'=>...] ]
        $actions = [];
        $elseActions = [];
        $pendingJoin = null;
        $inActions = false;
        $inElse = false;
        foreach ($steps as $st) {
            if (!is_array($st)) {
                continue;
            }
            $type = (string)($st['type'] ?? '');
            if ($type === 'else' || $type === 'senao' || $type === 'senão') {
                $inActions = true;
                $inElse = true;
                continue;
            }
            if ($type === 'join' || $type === 'complemento') {
                $op = strtolower((string)($st['op'] ?? 'and'));
                if ($op === 'then' || $op === 'então' || $op === 'entao') {
                    $inActions = true;
                    continue;
                }
                if ($op === 'or' || $op === 'ou') {
                    $pendingJoin = 'or';
                } else {
                    $pendingJoin = 'and';
                }
                continue;
            }
            $isCond = in_array($type, ['if_event', 'if_var', 'if_hitbox', 'if_screen'], true);
            if ($inElse) {
                if (!$isCond) {
                    $elseActions[] = $st;
                }
                continue;
            }
            if ($inActions || !$isCond) {
                if (!$isCond) {
                    $inActions = true;
                    $actions[] = $st;
                }
                continue;
            }
            $conds[] = ['join' => $pendingJoin, 'step' => $st];
            $pendingJoin = null; // sem E explícito = próximo SE é nível novo (guarda)
        }
        $hasElse = count($elseActions) > 0;

        // Agrupa condições: join "and" explícito une na mesma unidade;
        // sem join = unidade nova (SENÃO só na última unidade / último SE da unidade).
        $units = [];
        if ($conds) {
            $cur = [$conds[0]];
            for ($i = 1; $i < count($conds); $i++) {
                $j = $conds[$i]['join'] ?? null;
                if ($j === 'and') {
                    $cur[] = $conds[$i];
                } elseif ($j === 'or') {
                    $cur[] = $conds[$i]; // OU dentro da unidade
                } else {
                    $units[] = $cur;
                    $cur = [$conds[$i]];
                }
            }
            $units[] = $cur;
        }

        $asm = [];
        $nu = count($units);
        $ci = 0; // índice global de condição (labels únicos)
        for ($u = 0; $u < $nu; $u++) {
            $unit = $units[$u];
            $isLastUnit = ($u === $nu - 1);
            // Unidade guarda (não última): qualquer falha → end
            // Última unidade: qualquer falha → else (se houver) ou end
            $unitFail = ($isLastUnit && $hasElse) ? $elseL : $end;
            $nIn = count($unit);
            for ($k = 0; $k < $nIn; $k++) {
                $st = $unit[$k]['step'];
                $join = $unit[$k]['join'] ?? null;
                $fail = $tag . '_f' . $ci;
                $ok = $tag . '_c' . $ci;
                $nextJoin = ($k + 1 < $nIn) ? ($unit[$k + 1]['join'] ?? null) : null;

                if ($nextJoin === 'or') {
                    $failTarget = $tag . '_t' . ($ci + 1);
                } else {
                    $failTarget = $unitFail;
                }

                if ($k > 0 && $join === 'or') {
                    $asm[] = $tag . '_t' . $ci . ':';
                }

                $chunk = self::emitCondition($st, $varMap, $eventsById, $timerById, $fail, $ok, $isBoot);
                $asm = array_merge($asm, $chunk);
                $asm[] = '    jmp ' . $ok;
                $asm[] = $fail . ':';
                $asm[] = '    jmp ' . $failTarget;
                $asm[] = $ok . ':';
                if ($nextJoin === 'or') {
                    // sucesso num OU → sai da unidade (passa adiante / go)
                    $j = $k + 1;
                    while ($j + 1 < $nIn && ($unit[$j + 1]['join'] ?? null) === 'or') {
                        $j++;
                    }
                    // após grupo OU: se ainda há AND na unidade, continua; senão fim da unidade
                    if ($j + 1 < $nIn) {
                        $asm[] = '    jmp ' . $tag . '_c' . ($ci + ($j - $k) + 1);
                    } else {
                        // última da unidade → próxima unidade ou go
                        if ($isLastUnit) {
                            $asm[] = '    jmp ' . $go;
                        }
                        // senão fall-through para próxima unidade
                    }
                }
                $ci++;
            }
        }

        $asm[] = $go . ':';
        foreach ($actions as $st) {
            $asm = array_merge($asm, self::emitAction($st, $varMap));
        }
        if ($hasElse) {
            $asm[] = '    jmp ' . $end;
            $asm[] = $elseL . ':';
            foreach ($elseActions as $st) {
                $asm = array_merge($asm, self::emitAction($st, $varMap));
            }
        }
        $asm[] = $end . ':';
        return $asm;
    }

    /**
     * Emite teste de uma condição. Falha → jmp $fail. Sucesso → rótulo $ok.
     * @return list<string>
     */
    private static function emitCondition(array $st, array $varMap, array $eventsById, array $timerById, string $fail, string $ok, bool $isBoot): array
    {
        $asm = [];
        $type = (string)($st['type'] ?? '');

        if ($type === 'if_event') {
            $eid = (string)($st['eventId'] ?? '');
            $ev = $eventsById[$eid] ?? null;
            $cat = is_array($ev) ? (string)($ev['category'] ?? '') : '';
            if ($eid === 'ev_boot' || $eid === 'boot' || $eid === 'ev_vblank' || $eid === 'vblank'
                || $eid === 'ev_overscan' || $eid === 'overscan' || $cat === 'system' || $cat === 'screen') {
                return []; // sempre ok no slot
            }
            if ($cat === 'timer' || isset($timerById[$eid])) {
                $tm = $timerById[$eid] ?? null;
                if (!$tm) {
                    $asm[] = '    jmp ' . $fail; // timer desconhecido: falha fechada
                    return $asm;
                }
                $asm[] = '    lda ' . $tm['fireLabel'];
                $asm[] = '    beq ' . $fail;
                return $asm;
            }
            if ($cat === 'input' || (is_array($ev) && isset($ev['button']))) {
                $btn = (string)($ev['button'] ?? 'P1-FIRE');
                $trig = (string)($ev['trigger'] ?? 'press');
                return self::emitInputCheck($btn, $trig, $fail);
            }
            if ($cat === 'collision' || str_starts_with($eid, 'ev_col_')) {
                $col = is_array($ev) ? (string)($ev['collision'] ?? '') : '';
                if ($col === '' && str_starts_with($eid, 'ev_col_')) {
                    $col = substr($eid, 7);
                }
                return self::emitCollisionCheck($col, $fail);
            }
            $asm[] = '    jmp ' . $fail;
            return $asm;
        }

        if ($type === 'if_var') {
            $ref = self::resolveVar($varMap, $st);
            if (!$ref) {
                $asm[] = '    jmp ' . $fail;
                return $asm;
            }
            $op = (string)($st['op'] ?? '==');
            $val = (int)($st['value'] ?? 0) & 0xff;
            $asm[] = '    lda ' . $ref['label'];
            $asm[] = '    cmp #' . $val;
            $asm = array_merge($asm, self::emitCmpBranch($op, $fail));
            return $asm;
        }

        if ($type === 'if_hitbox') {
            $a = (string)($st['hitboxA'] ?? '');
            $b = (string)($st['hitboxB'] ?? '');
            $col = self::hitboxPairToCollision($a, $b);
            if ($col !== '') {
                return self::emitCollisionCheck($col, $fail);
            }
            $asm[] = '    jmp ' . $fail;
            return $asm;
        }

        if ($type === 'if_screen') {
            return [];
        }

        return [];
    }

    /** @return list<string> */
    private static function emitAction(array $st, array $varMap): array
    {
        $asm = [];
        $type = (string)($st['type'] ?? '');

        if ($type === 'set_var' || $type === 'add_var' || $type === 'sub_var') {
            $ref = self::resolveVar($varMap, $st);
            if (!$ref) {
                return [];
            }
            $val = (int)($st['value'] ?? 0) & 0xff;
            if ($type === 'set_var') {
                $asm[] = '    lda #' . $val;
                $asm[] = '    sta ' . $ref['label'];
            } elseif ($type === 'add_var') {
                $asm[] = '    lda ' . $ref['label'];
                $asm[] = '    clc';
                $asm[] = '    adc #' . $val;
                $asm[] = '    sta ' . $ref['label'];
            } else {
                $asm[] = '    lda ' . $ref['label'];
                $asm[] = '    sec';
                $asm[] = '    sbc #' . $val;
                $asm[] = '    sta ' . $ref['label'];
            }
            return $asm;
        }

        if ($type === 'copy_var') {
            $src = self::resolveVar($varMap, [
                'varId' => (string)($st['varIdFrom'] ?? ''),
                'varName' => (string)($st['varNameFrom'] ?? ''),
            ]);
            $dst = self::resolveVar($varMap, [
                'varId' => (string)($st['varIdTo'] ?? ''),
                'varName' => (string)($st['varNameTo'] ?? ''),
            ]);
            if ($src && $dst) {
                $asm[] = '    lda ' . $src['label'] . '            ; copy_var de';
                $asm[] = '    sta ' . $dst['label'] . '            ; para';
            }
            return $asm;
        }

        if ($type === 'action') {
            $aid = (string)($st['actionId'] ?? '');
            $arg = (string)($st['arg'] ?? '');
            $arg2 = (string)($st['arg2'] ?? '');
            $arg3 = $st['arg3'] ?? 1;
            if ($aid === 'set_var' || $aid === 'add_var' || $aid === 'sub_var') {
                $st2 = ['varName' => $arg, 'value' => (int)$arg2];
                $ref = self::resolveVar($varMap, $st2);
                if ($ref) {
                    $val = (int)$arg2 & 0xff;
                    if ($aid === 'set_var') {
                        $asm[] = '    lda #' . $val;
                        $asm[] = '    sta ' . $ref['label'];
                    } elseif ($aid === 'add_var') {
                        $asm[] = '    lda ' . $ref['label'];
                        $asm[] = '    clc';
                        $asm[] = '    adc #' . $val;
                        $asm[] = '    sta ' . $ref['label'];
                    } else {
                        $asm[] = '    lda ' . $ref['label'];
                        $asm[] = '    sec';
                        $asm[] = '    sbc #' . $val;
                        $asm[] = '    sta ' . $ref['label'];
                    }
                }
            } elseif ($aid === 'play_sound') {
                $ch = (int)$arg;
                if ($ch === 1) {
                    $asm[] = '    lda #8';
                    $asm[] = '    sta AUDV1';
                    $asm[] = '    lda #4';
                    $asm[] = '    sta AUDC1';
                    $asm[] = '    lda #8';
                    $asm[] = '    sta AUDF1';
                } else {
                    $asm[] = '    lda #8';
                    $asm[] = '    sta AUDV0';
                    $asm[] = '    lda #4';
                    $asm[] = '    sta AUDC0';
                    $asm[] = '    lda #8';
                    $asm[] = '    sta AUDF0';
                }
            } elseif ($aid === 'stop_sound') {
                $ch = (int)$arg;
                $asm[] = '    lda #0';
                $asm[] = $ch === 1 ? '    sta AUDV1' : '    sta AUDV0';
            } elseif ($aid === 'set_tia') {
                $reg = preg_replace('/[^A-Za-z0-9_]/', '', $arg) ?: 'COLUP0';
                $val = (int)$arg2 & 0xff;
                $asm[] = '    lda #' . $val;
                $asm[] = '    sta ' . $reg;
            } elseif ($aid === 'toggle_bool') {
                $ref = self::resolveVar($varMap, ['varName' => $arg, 'varId' => $arg]);
                if ($ref) {
                    $asm[] = '    lda ' . $ref['label'];
                    $asm[] = '    eor #1';
                    $asm[] = '    sta ' . $ref['label'];
                }
            } elseif ($aid === 'move_player') {
                $pl = ((string)$arg === '1') ? 1 : 0;
                $dir = strtolower(trim((string)$arg2));
                $dist = max(1, min(8, (int)$arg3));
                $xLab = $pl === 1 ? 'P1X' : 'P0X';
                $yLab = $pl === 1 ? 'P1Y' : 'P0Y';
                if (in_array($dir, ['left', 'right', 'up', 'down'], true)) {
                    for ($n = 0; $n < $dist; $n++) {
                        if ($dir === 'left') {
                            $asm[] = '    dec ' . $xLab;
                        } elseif ($dir === 'right') {
                            $asm[] = '    inc ' . $xLab;
                        } elseif ($dir === 'up') {
                            $asm[] = '    dec ' . $yLab;
                        } else {
                            $asm[] = '    inc ' . $yLab;
                        }
                    }
                }
            } elseif ($aid === 'asm' || $aid === 'custom') {
                foreach (preg_split("/\r\n|\n|\r/", $arg) as $line) {
                    $line = trim($line);
                    if ($line !== '') {
                        $asm[] = '    ' . $line;
                    }
                }
            }
        }
        return $asm;
    }


    private static function resolveVar(array $varMap, array $st): ?array
    {
        $id = (string)($st['varId'] ?? '');
        $name = (string)($st['varName'] ?? '');
        if ($id !== '' && isset($varMap[$id])) return $varMap[$id];
        if ($name !== '' && isset($varMap['name:' . $name])) return $varMap['name:' . $name];
        if ($id !== '' && isset($varMap['name:' . $id])) return $varMap['name:' . $id];
        return null;
    }

    private static function varLabel(string $name, string $id): string
    {
        $s = preg_replace('/[^A-Za-z0-9_]/', '', $name) ?: '';
        if ($s === '' || preg_match('/^[0-9]/', $s)) {
            $s = 'V' . substr(preg_replace('/[^A-Za-z0-9]/', '', $id) ?: 'x', 0, 8);
        }
        return 'U_' . $s;
    }

    /** @return list<string> */
    private static function emitCmpBranch(string $op, string $failLabel): array
    {
        // Após CMP: N e Z setados. Branch para fail se condição NÃO satisfeita.
        return match ($op) {
            '==' => ['    bne ' . $failLabel],
            '!=' => ['    beq ' . $failLabel],
            '>'  => ['    bcc ' . $failLabel, '    beq ' . $failLabel], // A>M unsigned: C=1 e Z=0
            '>=' => ['    bcc ' . $failLabel],
            '<'  => ['    bcs ' . $failLabel],
            '<=' => ['    beq ' . $failLabel . '_ok', '    bcs ' . $failLabel, $failLabel . '_ok:'],
            default => ['    bne ' . $failLabel],
        };
    }

    /** @return list<string> */
    private static function emitInputCheck(string $button, string $trigger, string $fail): array
    {
        // SWCHA: 0 = pressed. INPT4/5 bit7: 0 = pressed.
        // P1-* no editor = joystick do Player 1 = hardware P0 (bits altos).
        // P2-* = hardware P1 (bits baixos).
        $asm = [];
        $btn = strtoupper(str_replace([' ', '_'], ['-', '-'], $button));
        $trigger = strtolower($trigger);
        $p2 = str_starts_with($btn, 'P2');

        if (str_contains($btn, 'FIRE') || str_contains($btn, 'BUTTON')) {
            $reg = $p2 ? 'INPT5' : 'INPT4';
            $asm[] = '    lda ' . $reg;
            $asm[] = '    and #$80';
            if ($trigger === 'hold') {
                $asm[] = '    bne ' . $fail;
                $asm[] = '    lda WalkTick';
                $asm[] = '    and #7';
                $asm[] = '    bne ' . $fail;
            } else {
                $asm[] = '    bne ' . $fail;
                $asm[] = '    lda PrevINPT4';
                $asm[] = '    and #$80';
                $asm[] = '    beq ' . $fail;
            }
            return $asm;
        }

        // Match direção (sufixo). P1-* = stick P0 do console (bits 4-7).
        $bit = null;
        $bitBoth = null;
        if (preg_match('/RIGHT$/', $btn)) {
            $bit = $p2 ? 0x08 : 0x80;
            $bitBoth = 0x88;
        } elseif (preg_match('/LEFT$/', $btn)) {
            $bit = $p2 ? 0x04 : 0x40;
            $bitBoth = 0x44;
        } elseif (preg_match('/DOWN$/', $btn)) {
            $bit = $p2 ? 0x02 : 0x20;
            $bitBoth = 0x22;
        } elseif (preg_match('/(^|-)UP$/', $btn)) {
            $bit = $p2 ? 0x01 : 0x10;
            $bitBoth = 0x11;
        } elseif (str_contains($btn, 'IDLE')) {
            $mask = $p2 ? 0x0F : 0xF0;
            $asm[] = '    lda SWCHA';
            $asm[] = '    and #' . sprintf('$%02X', $mask);
            $asm[] = '    cmp #' . sprintf('$%02X', $mask);
            $asm[] = '    bne ' . $fail;
            return $asm;
        }

        if ($bit === null) {
            $asm[] = '    ; input desconhecido: ' . $btn;
            $asm[] = '    jmp ' . $fail;
            return $asm;
        }

        // Ativo-baixo: se TODOS os bits da mascara estao 1, direcao nao pressionada.
        // bitBoth testa os dois sticks (P0+P1) na mesma direcao — mais robusto no Stella.
        $mask = $bitBoth ?? $bit;
        $asm[] = '    lda SWCHA';
        $asm[] = '    and #' . sprintf('$%02X', $mask);
        if ($trigger === 'hold') {
            $asm[] = '    cmp #' . sprintf('$%02X', $mask);
            $asm[] = '    beq ' . $fail . '              ; nenhum stick nessa direcao';
        } else {
            $asm[] = '    cmp #' . sprintf('$%02X', $mask);
            $asm[] = '    beq ' . $fail . '              ; nao pressionado agora';
            $asm[] = '    lda PrevSWCHA';
            $asm[] = '    and #' . sprintf('$%02X', $mask);
            $asm[] = '    cmp #' . sprintf('$%02X', $mask);
            $asm[] = '    bne ' . $fail . '              ; ja estava pressionado';
        }
        return $asm;
    }

    /** @return list<string> */
    private static function emitCollisionCheck(string $col, string $fail): array
    {
        $col = strtolower(str_replace(['–', '—', ' '], ['', '', ''], $col));
        $col = str_replace('-', '', $col);
        // Map to TIA registers (bit7 typically indicates collision)
        $map = [
            'm0p1' => ['CXM0P', 0x80], // M0-P1 is bit7 of CXM0P; M0-P0 is bit6
            'm1p0' => ['CXM1P', 0x40],
            'p0pf' => ['CXP0FB', 0x80],
            'p1pf' => ['CXP1FB', 0x80],
            'p0p1' => ['CXPPMM', 0x80],
            'blpf' => ['CXBLPF', 0x80],
            'blp0' => ['CXP0FB', 0x40],
            'blp1' => ['CXP1FB', 0x40],
            'm0p0' => ['CXM0P', 0x40],
            'm1p1' => ['CXM1P', 0x80],
        ];
        if (!isset($map[$col])) {
            // try hitbox style tia:P0 vs tia:PF
            return ['    ; collision desconhecida: ' . $col, '    jmp ' . $fail];
        }
        [$reg, $mask] = $map[$col];
        return [
            '    lda ' . $reg,
            '    and #' . sprintf('$%02X', $mask),
            '    beq ' . $fail,
        ];
    }

    private static function hitboxPairToCollision(string $a, string $b): string
    {
        $norm = function (string $x): string {
            $x = strtoupper($x);
            if (str_contains($x, 'P0')) return 'P0';
            if (str_contains($x, 'P1')) return 'P1';
            if (str_contains($x, 'M0')) return 'M0';
            if (str_contains($x, 'M1')) return 'M1';
            if (str_contains($x, 'BL') || str_contains($x, 'BALL')) return 'BL';
            if (str_contains($x, 'PF') || str_contains($x, 'PLAYFIELD')) return 'PF';
            return '';
        };
        $A = $norm($a);
        $B = $norm($b);
        $pair = [$A, $B];
        sort($pair);
        $key = implode('', $pair);
        $map = [
            'M0P1' => 'm0p1',
            'M1P0' => 'm1p0',
            'P0PF' => 'p0pf',
            'P1PF' => 'p1pf',
            'P0P1' => 'p0p1',
            'BLPF' => 'blpf',
            'BLP0' => 'blp0',
            'BLP1' => 'blp1',
            'M0P0' => 'm0p0',
            'M1P1' => 'm1p1',
        ];
        // try both orders
        foreach ([$A . $B, $B . $A, $key] as $k) {
            if (isset($map[$k])) return $map[$k];
        }
        // manual
        if (($A === 'M0' && $B === 'P1') || ($A === 'P1' && $B === 'M0')) return 'm0p1';
        if (($A === 'P0' && $B === 'PF') || ($A === 'PF' && $B === 'P0')) return 'p0pf';
        if (($A === 'P1' && $B === 'PF') || ($A === 'PF' && $B === 'P1')) return 'p1pf';
        if ($A === 'P0' && $B === 'P1') return 'p0p1';
        if (($A === 'BL' && $B === 'PF') || ($A === 'PF' && $B === 'BL')) return 'blpf';
        return '';
    }

    private static function safeLabel(string $s): string
    {
        $s = preg_replace('/[^a-zA-Z0-9_]+/', '_', $s) ?? 'Game';
        $s = trim($s, '_');
        if ($s === '') {
            $s = 'Game';
        }
        return substr($s, 0, 32);
    }
}
