<?php

final class ProjectParser
{
    public function parse(array $request): array
    {
        if (!isset($request['project']) || !is_array($request['project'])) {
            throw new InvalidArgumentException('Projeto NMS ausente ou inválido.');
        }

        $project = $request['project'];

        // Stage 23: som final - TODAS as musicas e SFX do projeto (com pelo
        // menos 1 canal com notas) sao embedados na ROM, nao so a primeira.
        // Nada toca sozinho: a ROM so fica silenciosa ate a acao "Tocar Som"
        // de alguma regra escolher uma musica ou disparar um SFX (ver
        // ProgramCompiler::compilePlaySound e backend/templates/music.php).
        $soundItems = is_array($project['sounds']['items'] ?? null) ? $project['sounds']['items'] : [];
        $hasSound = false;
        foreach ($soundItems as $s) {
            if (!is_array($s) || empty($s['channels'])) continue;
            foreach ($s['channels'] as $c) {
                if (is_array($c) && !empty($c['notes'])) { $hasSound = true; break 2; }
            }
        }

        // Camada 6 (acao "Trocar Paleta"): só paga o custo (ZP + rotina na NMI
        // + tabela de dados) se alguma regra do projeto realmente usar a
        // acao - mesmo padrao do musicEnabled acima pra som.
        $paletteSwapEnabled = false;
        foreach ((is_array($project['rules'] ?? null) ? $project['rules'] : []) as $r) {
            if (!is_array($r) || !is_array($r['steps'] ?? null)) continue;
            foreach ($r['steps'] as $st) {
                if (is_array($st) && ($st['actionId'] ?? '') === 'apply_palette') { $paletteSwapEnabled = true; break 2; }
            }
        }

        // Stage 21: a resolução de telas (quais backgrounds/splashes entram no
        // jogo, em que ordem, com que papel) acontece inteiramente aqui a
        // partir do project.data (.nms) bruto - sem nenhum seletor da UI.
        $screens = $this->collectGameScreens($project);
        $usedMetatiles = $this->computeUsedMetatiles($project);

        // Camada 6 Fase 8: id da tela (background/splash, o mesmo id que a
        // UI já usa pra "Ir para Warp") -> indice fisico usado em tempo de
        // execucao (cur_screen). E o mesmo espaco de indices do ScreenPhase
        // e das tabelas de tela - a ordem/posicao de $screens NUNCA muda
        // depois daqui, entao o indice e estavel pro resto do build.
        $screenIndexById = [];
        foreach ($screens as $i => $sc) {
            if (is_array($sc) && isset($sc['id'])) $screenIndexById[(string)$sc['id']] = (int)$i;
        }

        $screenData = $screens;
        $playIdxs = [];
        foreach ($screenData as $i => $screen) {
            if (is_array($screen) && (($screen['role'] ?? '') === 'play' || ($screen['type'] ?? '') === 'background')) {
                $playIdxs[] = (int)$i;
            }
        }
        if (!$playIdxs) $playIdxs = array_keys($screenData);

        // Fase 9 (transicoes de tela): cada FASE escolhe no Dashboard como
        // suas telas se conectam (transitionType em phase.levelMap - "hard_cut"
        // Zelda-like, ou "scroll_h"/"scroll_v" continuo). Ate agora o
        // compilador ignorava esse campo por completo e sempre gerava scroll
        // horizontal continuo, faca o Dashboard mostrar o que mostrasse.
        // scroll_v ainda nao tem motor proprio (fica pra depois) - por
        // enquanto cai no mesmo scroll horizontal de sempre, so' "hard_cut" e'
        // tratado de verdade. Tabela por play_idx (nao por fase) porque
        // mv_hero_left/right (system.php) decidem por tela, nao por fase.
        $phaseTransitionById = [];
        foreach ((is_array($project['phases'] ?? null) ? $project['phases'] : []) as $ph) {
            if (is_array($ph) && isset($ph['id'])) {
                $phaseTransitionById[(string)$ph['id']] = (string)($ph['levelMap']['transitionType'] ?? 'scroll_h');
            }
        }
        $playScreenHardCut = [];
        foreach ($playIdxs as $gi) {
            $sc = $screenData[$gi] ?? null;
            $pid = is_array($sc) ? ($sc['phaseId'] ?? null) : null;
            $tt = ($pid !== null && isset($phaseTransitionById[(string)$pid])) ? $phaseTransitionById[(string)$pid] : 'scroll_h';
            $playScreenHardCut[] = ($tt === 'hard_cut') ? 1 : 0;
        }
        if (!$playScreenHardCut) $playScreenHardCut[] = 0;

        // Fase 9 (gravidade por fase): phase.gravity ('none'/'down'/'up'/
        // 'left'/'right') e phase.gravityStrength eram 100% ignorados - a
        // queda sempre acontecia (pra baixo, 4px/frame fixo) nao importa o
        // que o Dashboard mostrasse. Por enquanto so' "none" (desliga queda
        // e pulo de vez) e "down" (com a forca configuravel) sao tratados de
        // verdade - "up"/"left"/"right" (gravidade virada) precisam de uma
        // reformulacao maior de check_ground/check_wall_at (o que "chao" e
        // "parede" significam muda com a direcao) e ficam pra depois, caindo
        // no mesmo "down" de sempre por enquanto.
        $playScreenGravityOff = []; $playScreenGravityStrength = [];
        foreach ($playIdxs as $gi) {
            $sc = $screenData[$gi] ?? null;
            $pid = is_array($sc) ? ($sc['phaseId'] ?? null) : null;
            $ph = null;
            if ($pid !== null) {
                foreach ((is_array($project['phases'] ?? null) ? $project['phases'] : []) as $p) {
                    if (is_array($p) && (string)($p['id'] ?? '') === (string)$pid) { $ph = $p; break; }
                }
            }
            $grav = (string)($ph['gravity'] ?? 'down');
            $strength = max(1, min(16, (int)($ph['gravityStrength'] ?? 4)));
            $playScreenGravityOff[] = ($grav === 'none') ? 1 : 0;
            $playScreenGravityStrength[] = $strength;
        }
        if (!$playScreenGravityOff) { $playScreenGravityOff[] = 0; $playScreenGravityStrength[] = 4; }

        // Fase 9 fix (grade real): o levelMap eh uma grade 2D (cols x rows),
        // mas ate agora o compilador so guardava a ORDEM linear em que as
        // celulas preenchidas apareciam no scan (linha a linha) - "direita"
        // e' so' "proximo indice da lista", nao o vizinho espacial de
        // verdade. Isso faz hard-cut (e no futuro scroll vertical) se
        // comportarem errado em qualquer grade que nao seja uma unica linha
        // preenchida (ex: mapa estilo Zelda com varias linhas). Agora
        // calcula os vizinhos reais (direita/esquerda/cima/baixo) pela
        // posicao (gridX,gridY) de cada tela dentro da MESMA fase, e traduz
        // pra play_idx (255 = nao ha vizinho ali). Cima/baixo ficam prontos
        // pro scroll vertical futuro; hard-cut hoje so usa direita/esquerda.
        $bgIdToPlayIdx = [];
        foreach ($playIdxs as $pi => $gi) {
            $sc = $screenData[$gi] ?? null;
            if (is_array($sc) && isset($sc['id'])) $bgIdToPlayIdx[(string)$sc['id']] = $pi;
        }
        $cellByPhaseXY = [];
        foreach ((is_array($project['phases'] ?? null) ? $project['phases'] : []) as $ph) {
            if (!is_array($ph) || !isset($ph['id'])) continue;
            $lm = $ph['levelMap'] ?? null;
            if (!is_array($lm) || !is_array($lm['cells'] ?? null)) continue;
            $cellByPhaseXY[(string)$ph['id']] = $lm['cells'];
        }
        $neighborRight = []; $neighborLeft = []; $neighborUp = []; $neighborDown = [];
        foreach ($playIdxs as $pi => $gi) {
            $sc = $screenData[$gi] ?? null;
            $nR = 255; $nL = 255; $nU = 255; $nD = 255;
            if (is_array($sc) && isset($sc['gridX'], $sc['gridY'], $sc['phaseId'])) {
                $cells = $cellByPhaseXY[(string)$sc['phaseId']] ?? null;
                $gx = (int)$sc['gridX']; $gy = (int)$sc['gridY'];
                if (is_array($cells)) {
                    $lookup = static function (int $x, int $y) use ($cells, $bgIdToPlayIdx): int {
                        $cell = $cells[$x . ',' . $y] ?? null;
                        $bgId = is_array($cell) ? (string)($cell['bgId'] ?? '') : '';
                        return $bgId !== '' && isset($bgIdToPlayIdx[$bgId]) ? $bgIdToPlayIdx[$bgId] : 255;
                    };
                    $nR = $lookup($gx + 1, $gy);
                    $nL = $lookup($gx - 1, $gy);
                    $nU = $lookup($gx, $gy - 1);
                    $nD = $lookup($gx, $gy + 1);
                }
            }
            $neighborRight[] = $nR; $neighborLeft[] = $nL; $neighborUp[] = $nU; $neighborDown[] = $nD;
        }

        // Camada 7 (mappers plugaveis): decide de uma vez, pra ROM inteira,
        // quantos bancos de CHR existem e qual fase usa qual - ver
        // resolveMapperBanks(). NROM cai sempre em 1 banco so' (paginas 0+1,
        // igual sempre foi) - so' CNROM (mapper 3) de fato usa mais de 1.
        $mapperInfo = $this->resolveMapperBanks($project);
        $cnrom = $mapperInfo['mapper'] === 3;
        $defaultBank = $mapperInfo['banks'][$mapperInfo['defaultBankIndex']];

        // Camada 7: telas -> banco (mesma tabela usada pelo CNROM pra saber
        // qual fase usa qual banco - NROM cai sempre em 1 banco só/todas as
        // telas, mas passa pelo MESMO caminho, sem se especializar).
        $screensByBank = [];
        $screenBankIndex = array_fill(0, count($screenData), 0);
        foreach ($screenData as $i => $sc) {
            $pid = is_array($sc) ? ($sc['phaseId'] ?? null) : null;
            $bi = ($cnrom && $pid !== null && isset($mapperInfo['phaseBankIndex'][(string)$pid]))
                ? $mapperInfo['phaseBankIndex'][(string)$pid]
                : $mapperInfo['defaultBankIndex'];
            $screensByBank[$bi][] = $i;
            $screenBankIndex[$i] = $bi;
        }

        // Camada 8 (compressão por metatile): telas "limpas" (metatileGrid
        // completo, sem nenhuma célula null, todo id existente em
        // project.metatiles) viram MetatileIndex_<tela> (240 bytes) em vez
        // de Nametable_<tela>/Collision_<tela> (960+960 bytes cada) - o
        // resto (telas antigas, ou com alguma edição manual que invalidou
        // uma célula) continua exatamente como sempre foi. Precisa rodar
        // ANTES do empacotamento de CHR de baixo porque os tiles dos
        // metatiles comprimidos reservam um PREFIXO do espaço compacto de
        // 256 tiles do banco (posição fixa 4*idLocal+subpos, sem tabela de
        // índice) - as telas sujas usam o que sobra, escaneadas por cima.
        $metatileCompression = $this->buildMetatileCompression($project, $screenData, $screensByBank);

        // Stage 15: o empacotamento CHR dos sprites passa a ser responsabilidade do NGC.
        // O backend usa diretamente project.chr + project.metatiles + project.characters.
        // Camada 7: a ATRIBUICAO de indice (qual tile usado vira qual slot 0-255) continua
        // uma unica passada global (senao o mesmo personagem podia acabar com indices
        // diferentes em bancos diferentes, e a ASM que desenha sprite usa indice fixo por
        // quadro de animacao) - so' os BYTES de origem mudam de banco pra banco (mesmo
        // indice de saida, pagina de origem diferente). Ver spriteChrBanks abaixo.
        $sprite = $this->buildSpriteContext($project, $screenData, $playIdxs, $defaultBank['spritePage'], $cnrom ? 256 : 512);

        // Stage 18: o empacotamento CHR do background também é feito aqui,
        // remapeando contra project.chr e injetando remappedNt de volta em
        // screenData, mantendo background_data.php/background_tables.php inalterados.
        // Camada 7: pro CNROM, cada banco tem seu PROPRIO remapeamento (so' as telas das
        // fases daquele banco entram na conta) - diferente do sprite, isso nao tem problema
        // de indice cruzado entre bancos porque cada tela le seu remappedNt fresco quando
        // carrega (nao existe ASM com indice de tile de fundo fixo/compartilhado).
        // Camada 8: só as telas SUJAS desse banco entram na varredura de nametable cru -
        // as limpas já reservaram seu prefixo via $seedMapping/$seedUsedTiles.
        $chrRaw = is_array($project['chr'] ?? null) ? $project['chr'] : [];
        $bgChrBanks = [];
        $spriteChrBanks = [];
        $bgUsedCount = 0;
        $bgOverflowCount = 0;
        $mergedScreens = $screenData;
        foreach ($mapperInfo['banks'] as $bi => $bank) {
            $idxList = $screensByBank[$bi] ?? [];
            $mtBank = $metatileCompression['banks'][$bi] ?? ['seedMapping' => [0 => 0], 'seedUsedTiles' => [0], 'dirtyScreenIdx' => $idxList];
            $dirtyIdx = $mtBank['dirtyScreenIdx'];
            $screensForBank = [];
            foreach ($dirtyIdx as $idx) $screensForBank[] = $screenData[$idx];
            $chrPageBase = $cnrom ? $bank['bgPage'] : 0; // Camada 7: NROM sempre leu da pág 0 (comportamento legado preservado)
            $chrPageMod = $cnrom ? 256 : 512;
            $pack = $this->packBackgroundChr($chrRaw, $screensForBank, $chrPageBase, $chrPageMod, $mtBank['seedMapping'], $mtBank['seedUsedTiles']);
            $bgChrBanks[$bi] = $pack['bgChr'];
            $bgUsedCount += $pack['usedCount'];
            $bgOverflowCount += $pack['overflowCount'];
            foreach ($dirtyIdx as $k => $idx) $mergedScreens[$idx] = $pack['screens'][$k];

            $spriteChrBanks[$bi] = ($bi === $mapperInfo['defaultBankIndex'])
                ? $sprite['spriteChr']
                : $this->packChrBytesForTiles($sprite['usedTiles'] ?? [], $chrRaw, $bank['spritePage'], 256);
        }
        $screenData = $mergedScreens;
        $bgPack = [
            'bgChr' => $bgChrBanks[$mapperInfo['defaultBankIndex']],
            'usedCount' => $bgUsedCount,
            'overflowCount' => $bgOverflowCount,
        ];

        // Stage 19: PaletteData (as 8 paletas de 4 cores + a cor de fundo universal,
        // detectada olhando o PIXEL real do tile 0 da 1ª tela) passa a ser calculada
        // pelo NGC. Replica fielmente computeBackdropColor() de js/render-utils.js,
        // incluindo o mesmo comportamento do legado de ler o índice de tile já
        // REMAPEADO contra o banco de CHR BRUTO (não o banco empacotado) - mantido
        // assim de propósito pra não mudar o resultado visual do jogo já aprovado.
        $paletteBytes = $this->buildPaletteData($project, $chrRaw, $screenData);

        // Camada 6 (acao "Trocar Paleta"): exporta o BANCO INTEIRO pra ROM
        // (nao so' as 8 paletas ativas nos slots da PPU que buildPaletteData
        // acima devolve) - cada entrada vira 4 bytes enderecaveis, na MESMA
        // ordem em que aparece em project.paletteBank. ProgramCompiler usa
        // essa mesma ordem (index = posicao no array) pra resolver o
        // targetId de uma acao "Trocar Paleta" pro label certo - ver
        // ProgramCompiler::compile() / paletteBankById.
        $paletteBankBytes = [];
        foreach ((is_array($project['paletteBank'] ?? null) ? $project['paletteBank'] : []) as $pb) {
            $colors = is_array($pb['colors'] ?? null) ? $pb['colors'] : [15, 0, 16, 48];
            for ($c = 0; $c < 4; $c++) $paletteBankBytes[] = (int)($colors[$c] ?? 0) & 0x3F;
        }

        // Camada 6 - Fase 1: variáveis + motor de regras (ver ProgramCompiler.php).
        $program = (new ProgramCompiler())->compile($project, $sprite, $playIdxs, $screenData, $screenIndexById);

        return [
            'project' => $project,
            'buildMode' => 'game',
            'controlMode' => ($project['controlMode'] ?? 'auto') === 'programmed' ? 'programmed' : 'auto',
            'soundItems' => $soundItems,
            'musicEnabled' => $hasSound,
            'paletteSwapEnabled' => $paletteSwapEnabled,
            'screens' => $screens,
            'screenData' => $screenData,
            'palette' => $paletteBytes,
            'paletteBankBytes' => $paletteBankBytes,
            'bg' => [
                'chr' => $bgPack['bgChr'],
                'usedCount' => $bgPack['usedCount'],
                'overflowCount' => $bgPack['overflowCount'],
            ],
            'mapperInfo' => $mapperInfo,
            'bgChrBanks' => $bgChrBanks,
            'spriteChrBanks' => $spriteChrBanks,
            'screenBankIndex' => $screenBankIndex,
            'usedMetatiles' => $usedMetatiles,
            'screenCompressed' => $metatileCompression['screenCompressed'],
            'metatileIndexByScreen' => $metatileCompression['metatileIndexByScreen'],
            'metatileCompressionBanks' => $metatileCompression['banks'],
            'program' => $program,
            'playIdxs' => $playIdxs,
            'splashIdx' => $this->findRoleIndex($screens, 'splash', 0),
            'gameoverIdx' => $this->findRoleIndex($screens, 'gameover', max(0, count($screens) - 1)),
            'playStartIdx' => count($playIdxs) ? $playIdxs[0] : 0,
            'secondPlayScreenIdx' => count($playIdxs) > 1 ? $playIdxs[1] : null,
            'playCount' => count($playIdxs),
            'lastPlayIdx' => count($playIdxs) ? count($playIdxs) - 1 : 0,
            'playScreenHardCut' => $playScreenHardCut,
            'playScreenGravityOff' => $playScreenGravityOff,
            'playScreenGravityStrength' => $playScreenGravityStrength,
            'screenNeighborRight' => $neighborRight,
            'screenNeighborLeft' => $neighborLeft,
            'screenNeighborUp' => $neighborUp,
            'screenNeighborDown' => $neighborDown,
            'sprite' => $sprite,
        ];
    }


    private function buildSpriteContext(array $project, array $screenData, array $playIdxs, int $chrPageBase = 0, int $chrPageMod = 512): array
    {
        $chars = is_array($project['characters'] ?? null) ? $project['characters'] : [];
        $packed = $this->packSpriteCHR($project, $chars, $chrPageBase, $chrPageMod);
        $charData = $packed['charData'];
        $maxCells = max(1, (int)$packed['maxCells']);
        // Fase 9 fix (rodada 3): personagem tem um campo explicito no editor
        // (type: player/enemy/item/npc/boss) - e' isso que deveria decidir
        // quem e' o heroi, nao um "hero" no nome. Esse campo nasce com
        // "player" por padrao ao criar qualquer personagem (projeto antigo
        // pode ter varios assim, nunca corrigidos pra enemy/npc/etc), entao
        // usa "hero" no nome como desempate entre os candidatos type=player
        // antes de so' pegar o 1o - ver pickHeroIndex().
        $heroIdx = self::pickHeroIndex($chars);
        $heroFound = isset($chars[$heroIdx]) && is_array($chars[$heroIdx])
            && (($chars[$heroIdx]['type'] ?? '') === 'player' || stripos((string)($chars[$heroIdx]['name'] ?? ''), 'hero') !== false);
        $heroFrames = 1;
        if (isset($charData[$heroIdx]) && is_array($charData[$heroIdx])) {
            $heroFrames = max(1, count(is_array($charData[$heroIdx]['frames'] ?? null) ? $charData[$heroIdx]['frames'] : []));
        }

        // Fase 9 fix (rodada 2): o fallback de hitbox continuava fixo em 16px
        // mesmo pra personagem sem hb_body configurado - com o limite 2x2
        // removido, um personagem desenhado maior mas sem hitbox customizada
        // ficava com colisao presa no tamanho antigo (heroi "andando pela
        // cintura", inimigo grande atravessando o chao pelas pernas). Sem
        // hb_body, o fallback agora e' o tamanho REAL do frame 0 desse
        // personagem (w*8 x h*8, cobrindo o sprite inteiro) em vez de um
        // 16x16 fixo - so continua fixo em 16 se nem isso existir. Quem
        // configurar hb_body manualmente continua tendo prioridade total.
        $resolveBody = static function (?array $c, array $cd, ?array $override = null) : array {
            if (is_array($override)) {
                $frame0 = is_array($cd['frames'][0] ?? null) ? $cd['frames'][0] : [];
                $fw = max(1, (int)($frame0['w'] ?? 2));
                $fh = max(1, (int)($frame0['h'] ?? 2));
                return [
                    'x' => max(0, min(63, (int)($override['x'] ?? 0))),
                    'y' => max(0, min(63, (int)($override['y'] ?? 0))),
                    'w' => max(1, min(64, (int)($override['w'] ?? ($fw * 8)))),
                    'h' => max(1, min(64, (int)($override['h'] ?? ($fh * 8)))),
                ];
            }
            $frame0 = is_array($cd['frames'][0] ?? null) ? $cd['frames'][0] : [];
            $fw = max(1, (int)($frame0['w'] ?? 2));
            $fh = max(1, (int)($frame0['h'] ?? 2));
            $body = ['x' => 0, 'y' => 0, 'w' => $fw * 8, 'h' => $fh * 8];
            if (is_array($c) && is_array($c['hitboxes'] ?? null)) {
                foreach ($c['hitboxes'] as $hb) {
                    // Fase 9 (hitbox por animacao): hitbox marcada como exclusiva
                    // de uma animacao (hb.animId setado) NAO conta como a hitbox
                    // "padrao" do personagem - so' as sem animId (globais).
                    if (is_array($hb) && empty($hb['animId']) && (($hb['type'] ?? '') === 'body' || ($hb['id'] ?? '') === 'hb_body')) {
                        $body = [
                            'x' => max(0, min(63, (int)($hb['x'] ?? 0))),
                            'y' => max(0, min(63, (int)($hb['y'] ?? 0))),
                            'w' => max(1, min(64, (int)($hb['w'] ?? ($fw * 8)))),
                            'h' => max(1, min(64, (int)($hb['h'] ?? ($fh * 8)))),
                        ];
                        break;
                    }
                }
            }
            return $body;
        };
        $heroBody = $resolveBody($chars[$heroIdx] ?? null, $charData[$heroIdx] ?? []);

        // Fase 9 (hitbox por animacao): usuario decidiu integrar no controle
        // de hitbox normal - qualquer hitbox do personagem pode ser marcada
        // como exclusiva de uma animacao (hb.animId setado em
        // characters.js), em vez de um campo separado por animacao. So' pro
        // heroi por enquanto (pedido especifico foi sobre o player agachar) -
        // ProgramCompiler::compileAction troca player_hb_* junto quando troca
        // de animacao (ver move_character). Animacao sem hitbox "body"
        // exclusiva sua usa a hitbox "Corpo" normal do personagem (heroBody).
        $heroAnimBody = [];
        $heroHitboxes = is_array($chars[$heroIdx]['hitboxes'] ?? null) ? $chars[$heroIdx]['hitboxes'] : [];
        $heroAnims = is_array($chars[$heroIdx]['animations'] ?? null) ? $chars[$heroIdx]['animations'] : [];
        foreach ($heroAnims as $anim) {
            if (!is_array($anim) || empty($anim['id'])) continue;
            $animId = (string)$anim['id'];
            foreach ($heroHitboxes as $hb) {
                if (!is_array($hb) || ($hb['type'] ?? '') !== 'body') continue;
                if ((string)($hb['animId'] ?? '') !== $animId) continue;
                $b = $resolveBody(null, $charData[$heroIdx] ?? [], $hb);
                $heroAnimBody[$animId] = [
                    'bottom' => $b['y'] + $b['h'],
                    'left' => $b['x'],
                    'right' => $b['x'] + $b['w'] - 1,
                    'topProbe' => $b['y'] + 4,
                    'bottomProbe' => max($b['y'] + 4, $b['y'] + $b['h'] - 4),
                ];
                break;
            }
        }

        $bodyBottom = []; $bodyLeft = []; $bodyRight = []; $bodyTopProbe = []; $bodyBottomProbe = [];
        foreach ($chars as $ci => $c) {
            $b = $resolveBody(is_array($c) ? $c : null, $charData[$ci] ?? []);
            $bodyBottom[] = $b['y'] + $b['h'];
            $bodyLeft[] = $b['x'];
            $bodyRight[] = $b['x'] + $b['w'] - 1;
            $bodyTopProbe[] = $b['y'] + 4;
            $bodyBottomProbe[] = max($b['y'] + 4, $b['y'] + $b['h'] - 4);
        }
        if (!$bodyBottom) { $bodyBottom = [16]; $bodyLeft = [2]; $bodyRight = [13]; $bodyTopProbe = [4]; $bodyBottomProbe = [12]; }

        // Fase 9 (graficos): sem mais o limite fixo de 4 sprites OAM (2x2) por
        // instancia - agora cada personagem pode usar ate maxCells sprites (o
        // maior frame do projeto, incluindo o heroi). O orcamento real do NES
        // (64 sprites na OAM) e' quem manda: o heroi reserva maxCells (corpo)
        // + 4 (overlay, ainda fixo 2x2) sprites fixos no inicio da OAM, e o
        // resto e' dividido entre as instancias - sempre <= 14 (mesmo teto de
        // antes) e nunca ultrapassando os 64 sprites de verdade.
        $requested = (int)($project['maxInstances'] ?? 10);
        if ($requested < 1) $requested = 1;
        if ($requested > 20) $requested = 20;
        $oamBudgetInstances = max(1, (int)floor((64 - ($maxCells + 4)) / max(1, $maxCells)));
        $numInstances = min($requested, 14, $oamBudgetInstances);

        $charIndexById = [];
        $heroIds = [];
        foreach ($chars as $i => $c) {
            if (!is_array($c) || !isset($c['id'])) continue;
            $charIndexById[(string)$c['id']] = (int)$i;
        }
        // Mesmo heroi ja identificado la em cima (type=player -> nome "hero" ->
        // 1o personagem) - usado aqui so' pra excluir o heroi da lista de
        // spawn de inimigos.
        if (isset($chars[$heroIdx]['id'])) $heroIds[(string)$chars[$heroIdx]['id']] = true;

        $instances = is_array($project['hitboxInstances'] ?? null) ? $project['hitboxInstances'] : [];
        $objects = is_array($project['hitboxObjects'] ?? null) ? $project['hitboxObjects'] : [];
        $objectById = [];
        foreach ($objects as $o) {
            if (is_array($o) && isset($o['id'])) $objectById[(string)$o['id']] = $o;
        }

        $enemySpawns = [];
        foreach ($playIdxs as $gi) {
            $screen = $screenData[$gi] ?? ($this->screenByIndex($project, $gi));
            $sid = is_array($screen) && isset($screen['id']) ? (string)$screen['id'] : '';
            $points = [];
            foreach ($instances as $inst) {
                if (!is_array($inst)) continue;
                if ((string)($inst['screenId'] ?? '') !== $sid) continue;
                $cid = isset($inst['characterId']) ? (string)$inst['characterId'] : '';
                if ($cid === '') {
                    $oid = $inst['objectId'] ?? ($inst['hitboxObjectId'] ?? '');
                    $o = $objectById[(string)$oid] ?? null;
                    if (is_array($o) && ($o['kind'] ?? '') === 'spawn' && isset($o['characterId'])) $cid = (string)$o['characterId'];
                }
                if ($cid === '' || isset($heroIds[$cid]) || !isset($charIndexById[$cid])) continue;
                $points[] = [(int)($inst['x'] ?? 0), (int)($inst['y'] ?? 0), $charIndexById[$cid]];
                if (count($points) >= $numInstances) break;
            }
            $enemySpawns[] = ['count' => count($points), 'points' => $points];
        }
        if (!$enemySpawns) $enemySpawns[] = ['count' => 0, 'points' => []];

        return [
            'charData' => $charData,
            'spriteChr' => $packed['spriteChr'],
            'usedCount' => $packed['usedCount'],
            'overflowCount' => $packed['overflowCount'],
            'truncated' => $packed['truncated'],
            'heroCharIdx' => $heroIdx,
            'heroFrameCount' => $heroFrames,
            'heroFound' => $heroFound,
            'numInstances' => $numInstances,
            'requestedInstances' => $requested,
            'maxCells' => $maxCells,
            'heroBodyX' => $heroBody['x'],
            'heroBodyY' => $heroBody['y'],
            'heroBodyW' => $heroBody['w'],
            'heroBodyH' => $heroBody['h'],
            'heroAnimBody' => $heroAnimBody,
            'bodyBottom' => $bodyBottom,
            'bodyLeft' => $bodyLeft,
            'bodyRight' => $bodyRight,
            'bodyTopProbe' => $bodyTopProbe,
            'bodyBottomProbe' => $bodyBottomProbe,
            'enemySpawns' => $enemySpawns,
            'usedTiles' => $packed['usedTiles'] ?? [],
        ];
    }

    /**
     * Replica do packSpriteCHR() do build-rom.js.
     *
     * Regras mantidas para compatibilidade:
     * - tile 0 reservado no slot 0;
     * - cada frame usa no máximo um metatile 2x2;
     * - ordem TL/TR/BL/BR;
     * - overlay opcional com a mesma grade;
     * - limite de 256 tiles;
     * - CHR de sprites ocupa exatamente 4096 bytes.
     * - Fase 9: cada frame pode ter QUALQUER w/h (ate 8x8, teto do editor de
     *   CHR) - sem mais o limite de 2x2. O overlay (mt.overlay, recolor
     *   opcional) continua limitado a 2x2 por enquanto (fora do escopo desta
     *   fase, que foi especificamente sobre o corpo do personagem).
     */
    /**
     * Fase 9 fix (rodada 3): decide qual personagem e' o heroi. Prioridade:
     * (1) type=player E "hero" no nome - sinal duplo, mais confiavel;
     * (2) type=player (1o encontrado) - o campo explicito do editor;
     * (3) "hero" no nome (1o encontrado) - rede de seguranca pra projeto
     *     salvo antes do campo "type" existir;
     * (4) indice 0 - ultimo recurso, nunca deixa a build sem heroi.
     * O motivo de checar (1)/(2) separado: "type" nasce como "player" por
     * padrao ao criar qualquer personagem no editor, entao um projeto pode
     * ter varios personagens com type=player (inimigos que nunca foram
     * trocados) - o nome desempata entre eles antes de so' pegar o 1o.
     */
    private static function pickHeroIndex(array $chars): int
    {
        $playerHeroIdx = null; $playerIdx = null; $nameHeroIdx = null;
        foreach ($chars as $i => $c) {
            if (!is_array($c)) continue;
            $isPlayerType = ($c['type'] ?? '') === 'player';
            $isHeroName = stripos((string)($c['name'] ?? ''), 'hero') !== false;
            if ($isPlayerType && $isHeroName && $playerHeroIdx === null) $playerHeroIdx = (int)$i;
            if ($isPlayerType && $playerIdx === null) $playerIdx = (int)$i;
            if ($isHeroName && $nameHeroIdx === null) $nameHeroIdx = (int)$i;
        }
        return $playerHeroIdx ?? $playerIdx ?? $nameHeroIdx ?? 0;
    }

    private function packSpriteCHR(array $project, array $chars, int $chrPageBase = 0, int $chrPageMod = 512): array
    {
        $chr = is_array($project['chr'] ?? null) ? $project['chr'] : [];
        $metatiles = is_array($project['metatiles'] ?? null) ? $project['metatiles'] : [];
        $mapping = [0 => 0];
        $usedTiles = [0];
        $overflow = [];
        $truncated = [];
        $mtById = [];
        foreach ($metatiles as $mt) {
            if (is_array($mt) && isset($mt['id'])) $mtById[(string)$mt['id']] = $mt;
        }
        $corners = [
            ['dx'=>0,'dy'=>0], ['dx'=>8,'dy'=>0],
            ['dx'=>0,'dy'=>8], ['dx'=>8,'dy'=>8]
        ];

        $mapTile = function($tile) use (&$mapping, &$usedTiles, &$overflow): int {
            $orig = (int)($tile ?? 0);
            if ($orig < 0) $orig = 0;
            if (isset($mapping[$orig])) return $mapping[$orig];
            if (count($usedTiles) >= 256) {
                $overflow[$orig] = true;
                return 0;
            }
            $mapping[$orig] = count($usedTiles);
            $usedTiles[] = $orig;
            return $mapping[$orig];
        };

        $charData = [];
        $maxCells = 1;
        foreach ($chars as $ci => $c) {
            if (!is_array($c)) $c = [];
            // Fase 9 fix (rodada 4): antes so' a 1a animacao (animations[0])
            // virava dado na ROM - "walk"/"jump"/etc que o usuario criava
            // depois nunca eram embedadas, entao a acao "Mover" (que ja deixa
            // escolher qual animacao usar) nunca tinha o que mostrar. Agora
            // percorre TODAS as animacoes do personagem, concatenando os
            // frames num unico array plano (mesma tabela CharN/CharXxxPtr de
            // sempre, sem precisar de outro nivel de indirecao) e guardando
            // o intervalo [inicio,contagem] de cada uma por id - e' isso que
            // ProgramCompiler::compileAction (move_character) usa pra
            // resolver o animId escolhido na regra em tempo de build.
            $anims = is_array($c['animations'] ?? null) ? $c['animations'] : [];
            if (!$anims) $anims = [['id' => 'idle', 'name' => 'Idle', 'loop' => true, 'frames' => []]];
            $frames = [];
            $animRanges = [];
            $firstAnimCount = 0;
            foreach ($anims as $ai => $anim) {
                if (!is_array($anim)) continue;
                $animId = (string)($anim['id'] ?? '');
                $framesIn = is_array($anim['frames'] ?? null) ? $anim['frames'] : [];
                $startIdx = count($frames);
                foreach ($framesIn as $fi => $f) {
                if (!is_array($f)) $f = [];
                $mtId = (string)($f['metatileId'] ?? '');
                $mt = $mtById[$mtId] ?? null;
                $duration = max(1, min(255, (int)($f['duration'] ?? 8)));
                if (!is_array($mt) || !is_array($mt['tiles'] ?? null) || !isset($mt['w'], $mt['h'])) {
                    $frames[] = ['w'=>0, 'h'=>0, 'cellsN'=>[], 'flipsN'=>[], 'cellsF'=>[], 'flipsF'=>[], 'duration'=>$duration, 'overlay'=>null];
                    continue;
                }
                // Fase 9 (graficos): sem mais limite 2x2 - qualquer tamanho que o
                // editor de CHR permitir (ate 8x8, ver chr-editor.js). $w/$h ficam
                // gravados no proprio frame; runtime le eles pra saber quantas
                // celulas percorrer (nao ha mais um "corner" fixo de 4 posicoes).
                $w = max(1, min(8, (int)$mt['w']));
                $h = max(1, min(8, (int)$mt['h']));
                $tiles = $mt['tiles'];
                $flips = is_array($mt['flips'] ?? null) ? $mt['flips'] : [];

                // Orientacao normal (tx crescente = esquerda->direita), row-major.
                $cellsN = []; $flipsN = [];
                for ($ty=0; $ty<$h; $ty++) {
                    for ($tx=0; $tx<$w; $tx++) {
                        $idx = $ty*$w+$tx;
                        $cellsN[] = $mapTile((int)($tiles[$idx] ?? 0));
                        $fl = (int)($flips[$idx] ?? 0);
                        $flipsN[] = (($fl & 1) ? 0x40 : 0) | (($fl & 2) ? 0x80 : 0);
                    }
                }
                // Orientacao espelhada (flip H de direcao) pre-calculada em tempo de
                // build - mesma ideia que o overlay ja fazia, generalizada pra
                // qualquer w/h: coluna tx vira (w-1-tx) na MESMA linha, e o bit de
                // flip horizontal de cada celula e' invertido.
                $cellsF = []; $flipsF = [];
                for ($ty=0; $ty<$h; $ty++) {
                    for ($tx=0; $tx<$w; $tx++) {
                        $srcIdx = $ty*$w + ($w-1-$tx);
                        $cellsF[] = $cellsN[$srcIdx];
                        $flipsF[] = $flipsN[$srcIdx] ^ 0x40;
                    }
                }
                $maxCells = max($maxCells, $w*$h);

                $overlay = null;
                if (is_array($mt['overlay'] ?? null) && is_array($mt['overlay']['tiles'] ?? null) && count($mt['overlay']['tiles'])) {
                    $ov = $mt['overlay'];
                    $ovCells = [];
                    $ovFlips = is_array($ov['flips'] ?? null) ? $ov['flips'] : [];
                    for ($ty=0; $ty<min(2,$h); $ty++) {
                        for ($tx=0; $tx<min(2,$w); $tx++) {
                            $idx = $ty*$w + $tx;
                            $raw = $ov['tiles'][$idx] ?? null;
                            $corner = $ty*2+$tx;
                            if ($raw === null || (int)$raw < 0) continue;
                            $ovCells[] = [
                                'tile' => $mapTile((int)$raw),
                                'flip' => (int)($ovFlips[$idx] ?? 0),
                                'corner' => $corner
                            ];
                        }
                    }
                    $palIdx = isset($ov['palette']) ? (int)$ov['palette'] : 5;
                    $overlay = [
                        'cells' => $ovCells,
                        'dx' => (int)($ov['dx'] ?? 0),
                        'dy' => (int)($ov['dy'] ?? 0),
                        'palAttr' => max(0, min(3, $palIdx - 4))
                    ];
                }
                $frames[] = ['w'=>$w, 'h'=>$h, 'cellsN'=>$cellsN, 'flipsN'=>$flipsN, 'cellsF'=>$cellsF, 'flipsF'=>$flipsF, 'duration'=>$duration, 'overlay'=>$overlay];
                }
                $countAdded = count($frames) - $startIdx;
                if ($countAdded > 0 && $animId !== '') $animRanges[$animId] = ['start' => $startIdx, 'count' => $countAdded];
                if ($ai === 0) $firstAnimCount = $countAdded;
            }
            if (!$frames) $frames[] = ['w'=>0, 'h'=>0, 'cellsN'=>[], 'flipsN'=>[], 'cellsF'=>[], 'flipsF'=>[], 'duration'=>8, 'overlay'=>null];
            if ($firstAnimCount <= 0) $firstAnimCount = count($frames);
            $charData[] = [
                'id' => $c['id'] ?? null,
                'name' => $c['name'] ?? "Character {$ci}",
                'frames' => $frames,
                'animRanges' => $animRanges,
                'firstAnimCount' => min($firstAnimCount, count($frames)),
            ];
        }

        $spriteChr = $this->packChrBytesForTiles($usedTiles, $chr, $chrPageBase, $chrPageMod);

        return [
            'spriteChr' => $spriteChr,
            'charData' => $charData,
            'usedCount' => count($usedTiles),
            'overflowCount' => count($overflow),
            'truncated' => $truncated,
            'maxCells' => $maxCells,
            'usedTiles' => $usedTiles,
        ];
    }

    /**
     * Replica paletteBytes[] + computeBackdropColor() do build-rom.js/render-utils.js.
     * 8 paletas x 4 cores = 32 bytes; o byte 0 (universal backdrop, $3F00) é
     * sobrescrito pela cor do PIXEL de índice 0 mais comum na 1ª tela, não pela
     * cor 0 da paleta 0 "escolhida a dedo".
     */
    private function buildPaletteData(array $project, array $chr, array $screenData): array
    {
        $pals = is_array($project['palettes'] ?? null) ? $project['palettes'] : [];
        $default = [15, 0, 16, 48];
        $bytes = [];
        for ($p = 0; $p < 8; $p++) {
            $pal = is_array($pals[$p] ?? null) ? $pals[$p] : $default;
            for ($c = 0; $c < 4; $c++) {
                $bytes[] = (int)($pal[$c] ?? 0);
            }
        }

        $firstNt = is_array($screenData[0]['remappedNt'] ?? null) ? $screenData[0]['remappedNt'] : array_fill(0, 960, 0);
        $firstAt = is_array($screenData[0]['attributes'] ?? null) ? $screenData[0]['attributes'] : array_fill(0, 64, 0);

        $counts = [];
        for ($ty = 0; $ty < 30; $ty++) {
            for ($tx = 0; $tx < 32; $tx++) {
                $tileIdx = (int)($firstNt[$ty * 32 + $tx] ?? 0);
                $off = $tileIdx * 16;
                if ($off + 16 > count($chr)) continue;
                $attrX = intdiv($tx, 2); $attrY = intdiv($ty, 2);
                $blockX = intdiv($attrX, 2); $blockY = intdiv($attrY, 2);
                $attrIdx = $blockY * 8 + $blockX;
                $attrByte = (int)($firstAt[$attrIdx] ?? 0);
                $subX = $attrX % 2; $subY = $attrY % 2;
                $shift = ($subY * 2 + $subX) * 2;
                $palIdx = ($attrByte >> $shift) & 0x03;
                for ($py = 0; $py < 8; $py++) {
                    $p0 = (int)($chr[$off + $py] ?? 0);
                    $p1 = (int)($chr[$off + $py + 8] ?? 0);
                    for ($px = 0; $px < 8; $px++) {
                        $sh = 7 - $px;
                        $b0 = ($p0 >> $sh) & 1;
                        $b1 = ($p1 >> $sh) & 1;
                        $ci = ($b1 << 1) | $b0;
                        if ($ci === 0) $counts[$palIdx] = ($counts[$palIdx] ?? 0) + 1;
                    }
                }
            }
        }
        $bestPal = 0; $bestCount = -1;
        foreach ($counts as $k => $v) {
            if ($v > $bestCount) { $bestCount = $v; $bestPal = (int)$k; }
        }
        $backdropPal = is_array($pals[$bestPal] ?? null) ? $pals[$bestPal] : ($pals[0] ?? $default);
        $bytes[0] = (int)($backdropPal[0] ?? 15);

        return $bytes;
    }

    /**
     * Replica de packMultiScreenCHR() do build-rom.js.
     * Junta os tiles usados nas nametables BRUTAS de todas as telas num único
     * banco de 256 tiles ($1000), com tile 0 reservado no slot 0 (mesma
     * convenção do banco de sprites). Devolve os screens com remappedNt
     * calculado, prontos para background_data.php/background_tables.php.
     */
    /**
     * Camada 7 (mappers plugaveis): extrai os 16 bytes de cada tile "usado"
     * (usedTiles, na ordem de saida ja decidida por quem chamou) de uma
     * pagina especifica do CHR bruto do projeto, montando um bloco pronto
     * de 4KB (256 tiles). $chrPageBase e' o indice da pagina de origem (0 =
     * primeiros 4096 bytes, 1 = proximos 4096, etc) e $chrPageMod limita o
     * indice de tile de origem antes de aplicar esse offset - por padrao
     * (512) preserva o comportamento antigo (NROM: sempre paginas 0+1
     * combinadas, sem offset de pagina real); CNROM passa 256 (1 pagina so)
     * + o offset da pagina escolhida pra fase/banco em questao.
     */
    private function packChrBytesForTiles(array $usedTiles, array $chr, int $chrPageBase = 0, int $chrPageMod = 512): array
    {
        $out = array_fill(0, 4096, 0);
        foreach ($usedTiles as $i => $srcIdx) {
            $srcIdx = ((int)$srcIdx) % $chrPageMod;
            $srcOff = ($chrPageBase * 4096) + ($srcIdx * 16);
            $dstOff = $i * 16;
            for ($j = 0; $j < 16; $j++) {
                $out[$dstOff + $j] = (int)($chr[$srcOff + $j] ?? 0) & 0xFF;
            }
        }
        return $out;
    }

    /**
     * Camada 7 (mappers plugaveis): decide, a partir de project.mapper e
     * project.phases[].sprite_page/bg_page, quantos "bancos" de CHR o jogo
     * precisa e qual fase usa qual. Mappers ainda nao suportados caem no
     * mesmo comportamento fixo de sempre (1 banco so', paginas 0+1).
     *
     * CNROM troca CHR inteiro em blocos de 8KB - sprite E background juntos,
     * nao independente - entao cada combinacao DISTINTA de (sprite_page,
     * bg_page) usada por alguma fase vira 1 banco fisico, e o hardware (2
     * bits no registrador de banco do board CNROM padrao) so' suporta 4.
     */
    private function resolveMapperBanks(array $project): array
    {
        $mapper = (int)($project['mapper'] ?? 0);
        if ($mapper !== 3) {
            return [
                'mapper' => 0,
                'banks' => [['spritePage' => 0, 'bgPage' => 1]],
                'phaseBankIndex' => [],
                'defaultBankIndex' => 0,
            ];
        }

        $banks = [];
        $bankKeyToIndex = [];
        $phaseBankIndex = [];

        foreach ((is_array($project['phases'] ?? null) ? $project['phases'] : []) as $ph) {
            if (!is_array($ph) || !isset($ph['id'])) continue;
            $sp = max(0, (int)($ph['sprite_page'] ?? 0));
            $bg = max(0, (int)($ph['bg_page'] ?? 1));
            $key = $sp . ':' . $bg;
            if (!isset($bankKeyToIndex[$key])) {
                if (count($banks) >= 4) {
                    $usedList = [];
                    foreach ($banks as $bi => $b) {
                        $usedList[] = "banco {$bi} (sprites pág {$b['spritePage']} + bg pág {$b['bgPage']})";
                    }
                    $phaseName = (string)($ph['name'] ?? $ph['id']);
                    throw new RuntimeException(
                        "CNROM só suporta 4 combinações distintas de página de sprite+background em todo o jogo. " .
                        "A fase \"{$phaseName}\" pede uma 5ª combinação (sprites pág {$sp} + bg pág {$bg}). " .
                        "Já em uso: " . implode(', ', $usedList) . ". Reaproveite uma dessas combinações nessa fase, " .
                        "ou reorganize as páginas de CHR."
                    );
                }
                $bankKeyToIndex[$key] = count($banks);
                $banks[] = ['spritePage' => $sp, 'bgPage' => $bg];
            }
            $phaseBankIndex[(string)$ph['id']] = $bankKeyToIndex[$key];
        }

        if (!$banks) $banks[] = ['spritePage' => 0, 'bgPage' => 1];

        return [
            'mapper' => 3,
            'banks' => $banks,
            'phaseBankIndex' => $phaseBankIndex,
            'defaultBankIndex' => 0,
        ];
    }

    /**
     * Camada 8 (compressão por metatile): $seedMapping/$seedUsedTiles deixam
     * pré-reservar um PREFIXO do espaço compacto de 256 tiles antes de
     * varrer as telas "sujas" (nametable cru) - é assim que os slots dos
     * metatiles comprimidos (sempre em posição fixa 4*localId+subpos, sem
     * tabela de índice) convivem no MESMO banco de CHR que telas antigas
     * sem quebrar um ao outro. Sem seed, comportamento idêntico a sempre
     * (só o tile 0 reservado como "tile em branco" no slot 0).
     */
    /**
     * Camada 8 (compressão por metatile): analisa metatileGrid de cada tela
     * (por banco) e decide quais telas são "limpas" o bastante pra virar
     * MetatileIndex (240 bytes) em vez de Nametable/Collision crus (960+960).
     * Os tiles dos metatiles usados por telas limpas reservam um PREFIXO
     * fixo do espaço compacto de 256 tiles do banco - cada metatile local
     * ocupa SEMPRE 4*idLocal..4*idLocal+3 (TL,TR,BL,BR), sem tabela de
     * índice de tile nenhuma (a posição já é a própria conta). Só a COLISÃO
     * precisa de tabela (MetatileCollision_bank<N>, 1 byte por id local:
     * 4 bits de máscara de quadrante + 4 bits de tipo - ver
     * packMetatileCollisionByte()), porque isso não é computável por fórmula.
     *
     * Limite: no máx 64 metatiles distintos por banco (64*4=256, o espaço
     * compacto inteiro) - estoura vira erro claro, igual o limite de 4
     * bancos do CNROM.
     */
    private function buildMetatileCompression(array $project, array $screenData, array $screensByBank): array
    {
        $metatilesById = [];
        foreach ((is_array($project['metatiles'] ?? null) ? $project['metatiles'] : []) as $mt) {
            if (is_array($mt) && isset($mt['id'])) $metatilesById[(string)$mt['id']] = $mt;
        }

        $screenCompressed = array_fill(0, count($screenData), 0);
        $metatileIndexByScreen = [];
        $banks = [];

        foreach ($screensByBank as $bi => $idxList) {
            $localIndexByMtId = [];
            $tileRefs = [];
            $collisionBytes = [];
            $dirtyScreenIdx = [];

            foreach ($idxList as $si) {
                $sc = is_array($screenData[$si] ?? null) ? $screenData[$si] : [];
                $grid = is_array($sc['metatileGrid'] ?? null) ? $sc['metatileGrid'] : null;
                $clean = is_array($grid) && count($grid) === 240;
                if ($clean) {
                    foreach ($grid as $mtId) {
                        if ($mtId === null || $mtId === '' || !isset($metatilesById[(string)$mtId])) { $clean = false; break; }
                    }
                }
                if (!$clean) { $dirtyScreenIdx[] = $si; continue; }

                $screenCompressed[$si] = 1;
                $localIds = [];
                foreach ($grid as $mtId) {
                    $key = (string)$mtId;
                    if (!isset($localIndexByMtId[$key])) {
                        if (count($localIndexByMtId) >= 64) {
                            $screenName = (string)($sc['name'] ?? $si);
                            throw new RuntimeException(
                                "Compressão de tela: a tela \"{$screenName}\" (e outras que compartilham o mesmo banco de CHR) " .
                                "usam mais de 64 metatiles de background distintos - é o máximo que cabe comprimido num banco " .
                                "de 4KB (64 metatiles × 4 tiles = 256, o pattern table inteiro). Reduza a variedade de " .
                                "metatiles usados nesse conjunto de telas, ou separe em fases com páginas de CHR diferentes."
                            );
                        }
                        $mt = $metatilesById[$key];
                        $tiles = is_array($mt['tiles'] ?? null) ? $mt['tiles'] : [0, 0, 0, 0];
                        for ($k = 0; $k < 4; $k++) $tileRefs[] = (int)($tiles[$k] ?? 0);
                        $collisionBytes[] = $this->packMetatileCollisionByte(is_array($mt['collisions'] ?? null) ? $mt['collisions'] : []);
                        $localIndexByMtId[$key] = count($localIndexByMtId);
                    }
                    $localIds[] = $localIndexByMtId[$key];
                }
                $metatileIndexByScreen[$si] = $localIds;
            }

            $seedMapping = [];
            $seedUsedTiles = [];
            foreach ($tileRefs as $slot => $rawIdx) {
                if ($rawIdx < 0) $rawIdx = 0;
                if (!isset($seedMapping[$rawIdx])) $seedMapping[$rawIdx] = $slot;
                $seedUsedTiles[] = $rawIdx;
            }
            if (!$seedUsedTiles) { $seedMapping = [0 => 0]; $seedUsedTiles = [0]; }

            $banks[$bi] = [
                'seedMapping' => $seedMapping,
                'seedUsedTiles' => $seedUsedTiles,
                'dirtyScreenIdx' => $dirtyScreenIdx,
                'collisionBytes' => $collisionBytes,
                'metatileCount' => count($localIndexByMtId),
            ];
        }

        return [
            'screenCompressed' => $screenCompressed,
            'metatileIndexByScreen' => $metatileIndexByScreen,
            'banks' => $banks,
        ];
    }

    /**
     * Camada 8: empacota a colisão de 1 metatile num byte só - 4 bits altos
     * = máscara de quadrante (bit ligado = esse quadrante TL/TR/BL/BR faz
     * parte da hitbox), 4 bits baixos = tipo (0 Livre/1 Sólido/2
     * Plataforma/3 Dano - o mesmo metatile não pode ter 2 tipos diferentes,
     * já travado no editor - ver backgrounds.js). Tipo 4 (Warp) não
     * sobrevive à compressão de propósito: warps agora são resolvidas pela
     * tabela de instância própria (posição), não mais pintadas na colisão.
     */
    private function packMetatileCollisionByte(array $collisions): int
    {
        $type = 0;
        foreach ($collisions as $c) {
            $c = (int)$c;
            if ($c > 0) { $type = min($c, 3); break; }
        }
        $mask = 0;
        for ($i = 0; $i < 4 && $i < count($collisions); $i++) {
            if ((int)$collisions[$i] > 0) $mask |= (1 << $i);
        }
        return (($mask & 0x0F) << 4) | ($type & 0x0F);
    }

    private function packBackgroundChr(array $chr, array $screens, int $chrPageBase = 0, int $chrPageMod = 512, ?array $seedMapping = null, ?array $seedUsedTiles = null): array
    {
        $mapping = $seedMapping ?? [0 => 0];
        $usedTiles = $seedUsedTiles ?? [0];
        $overflow = [];
        foreach ($screens as $sc) {
            $nt = is_array($sc['nametable'] ?? null) ? $sc['nametable'] : [];
            foreach ($nt as $raw) {
                $orig = (int)($raw ?? 0);
                if ($orig < 0) $orig = 0;
                if (isset($mapping[$orig])) continue;
                if (count($usedTiles) >= 256) { $overflow[$orig] = true; continue; }
                $mapping[$orig] = count($usedTiles);
                $usedTiles[] = $orig;
            }
        }

        $bgChr = $this->packChrBytesForTiles($usedTiles, $chr, $chrPageBase, $chrPageMod);

        $remappedScreens = [];
        foreach ($screens as $sc) {
            $nt = is_array($sc['nametable'] ?? null) ? $sc['nametable'] : [];
            $sc['remappedNt'] = array_map(static function ($t) use ($mapping) {
                $orig = (int)($t ?? 0);
                if ($orig < 0) $orig = 0;
                return $mapping[$orig] ?? 0;
            }, $nt);
            $remappedScreens[] = $sc;
        }

        return [
            'bgChr' => $bgChr,
            'screens' => $remappedScreens,
            'usedCount' => count($usedTiles),
            'overflowCount' => count($overflow),
        ];
    }

    /**
     * Réplica completa de collectGameScreens() do build-rom.js - agora inclui
     * nametable/attributes/collisionMap BRUTOS de cada tela (Stage 21), então
     * o frontend não precisa mais pré-processar nada: só manda o project.data
     * (.nms) inteiro e o NGC resolve as telas sozinho.
     */
    /**
     * Camada 8 (compressão por metatile): varre TODAS as telas (backgrounds
     * + splashScreens) procurando metatileGrid (a grade de 240 células que o
     * editor de fundo agora salva - Camada 8, backgrounds.js) e devolve o
     * conjunto de IDs de metatile realmente carimbados em algum lugar do
     * jogo. Não confia em nenhuma flag "usado" salva no .nms - recalcula do
     * zero a cada build, a partir dos dados de verdade, pra nunca gerar uma
     * ROM incoerente com uma flag desatualizada.
     *
     * Telas sem metatileGrid (salvas antes dessa funcionalidade existir, ou
     * com edição manual que invalidou alguma célula - ver backgrounds.js)
     * simplesmente não contribuem IDs aqui; suas células nulas são tratadas
     * à parte, como fallback cru, no empacotamento da tela (ainda não
     * implementado - ver notas da Camada 8 no restante do arquivo).
     */
    private function computeUsedMetatiles(array $project): array
    {
        $used = [];
        $scan = static function ($screens) use (&$used) {
            if (!is_array($screens)) return;
            foreach ($screens as $sc) {
                if (!is_array($sc)) continue;
                $grid = is_array($sc['metatileGrid'] ?? null) ? $sc['metatileGrid'] : null;
                if (!$grid) continue;
                foreach ($grid as $mtId) {
                    if ($mtId === null || $mtId === '') continue;
                    $used[(string)$mtId] = true;
                }
            }
        };
        $scan($project['backgrounds'] ?? null);
        $scan($project['splashScreens'] ?? null);
        return $used;
    }

    private function collectGameScreens(array $project): array
    {
        $screens = [];
        $seen = [];
        $bgs = is_array($project['backgrounds'] ?? null) ? $project['backgrounds'] : [];
        $splashes = is_array($project['splashScreens'] ?? null) ? $project['splashScreens'] : [];
        $bgById = [];
        $splashById = [];
        foreach ($bgs as $bg) if (is_array($bg) && isset($bg['id'])) $bgById[(string)$bg['id']] = $bg;
        foreach ($splashes as $sp) if (is_array($sp) && isset($sp['id'])) $splashById[(string)$sp['id']] = $sp;

        $assetFields = static function (?array $asset, string $id, string $name): array {
            return [
                'id' => $asset['id'] ?? $id,
                'name' => $asset['name'] ?? $name,
                'nametable' => is_array($asset['nametable'] ?? null) ? $asset['nametable'] : array_fill(0, 960, 0),
                'attributes' => is_array($asset['attributes'] ?? null) ? $asset['attributes'] : array_fill(0, 64, 0),
                'collisionMap' => is_array($asset['collisionMap'] ?? null) ? $asset['collisionMap'] : array_fill(0, 960, 0),
                // Camada 8 (compressão por metatile): precisa passar adiante
                // pra buildMetatileCompression() decidir se essa tela é
                // "limpa" (comprimível) ou não - null preservado tal qual
                // (não confundir "ausente" com "grade de 240 nulls").
                'metatileGrid' => is_array($asset['metatileGrid'] ?? null) ? $asset['metatileGrid'] : null,
            ];
        };

        $phases = is_array($project['phases'] ?? null) ? $project['phases'] : [];
        foreach ($phases as $ph) {
            if (!is_array($ph)) continue;
            $lm = $ph['levelMap'] ?? null;
            if (!is_array($lm) || !is_array($lm['cells'] ?? null)) continue;
            $cols = max(1, (int)($lm['cols'] ?? 1));
            $rows = max(1, (int)($lm['rows'] ?? 1));
            for ($y = 0; $y < $rows; $y++) {
                for ($x = 0; $x < $cols; $x++) {
                    $cell = $lm['cells'][$x . ',' . $y] ?? null;
                    if (!is_array($cell) || empty($cell['bgId'])) continue;
                    $id = (string)$cell['bgId'];
                    if (isset($seen[$id])) continue;
                    $asset = (($cell['type'] ?? '') === 'splash')
                        ? ($splashById[$id] ?? null)
                        : ($bgById[$id] ?? null);
                    if (!is_array($asset)) continue;
                    $seen[$id] = true;
                    $isSplash = (($cell['type'] ?? '') === 'splash');
                    $screens[] = array_merge($assetFields($asset, $id, $id), [
                        'type' => $isSplash ? 'splash' : 'background',
                        'phaseId' => $ph['id'] ?? null,
                        'phaseName' => $ph['name'] ?? null,
                        'role' => $isSplash ? 'splash' : 'play',
                        'gridX' => $x,
                        'gridY' => $y,
                    ]);
                }
            }
        }

        foreach ($splashes as $sp) {
            if (!is_array($sp) || !isset($sp['id'])) continue;
            $id = (string)$sp['id'];
            if (isset($seen[$id])) continue;
            $seen[$id] = true;
            $screens[] = array_merge($assetFields($sp, $id, $id), [
                'type' => 'splash',
                'phaseId' => null,
                'phaseName' => null,
                'role' => 'gameover',
            ]);
        }

        if (!$screens) {
            $fallback = $splashes ?: $bgs;
            foreach ($fallback as $i => $asset) {
                if (!is_array($asset) || !isset($asset['id'])) continue;
                $screens[] = array_merge($assetFields($asset, (string)$asset['id'], (string)$asset['id']), [
                    'type' => $splashes ? 'splash' : 'background',
                    'phaseId' => null,
                    'phaseName' => null,
                    'role' => $i === 0 ? 'splash' : 'play',
                ]);
            }
        }

        return $screens;
    }

    // resolveSingleScreen removido (Fase 5) - modo Tela Única não existe
    // mais, build-rom.js só manda o build completo (Jogo).

    private function screenByIndex(array $project, int $index): array
    {
        $screens = $this->collectGameScreens($project);
        return is_array($screens[$index] ?? null) ? $screens[$index] : [];
    }


    private function findRoleIndex(array $screens, string $role, int $fallback): int
    {
        foreach ($screens as $i => $screen) {
            if (($screen['role'] ?? null) === $role) return $i;
        }
        return $fallback;
    }

    /**
     * Replica apenas da resolução de telas usada pelo gerador atual.
     * O empacotamento CHR continua no frontend nesta fase; o NGC precisa
     * somente dos índices das telas para gerar o RESET corretamente.
     */

}
