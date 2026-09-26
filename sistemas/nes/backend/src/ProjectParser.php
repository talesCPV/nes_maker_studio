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
        $playScreenAutoH = [];
        $playScreenAutoV = [];
        $playScreenLastInPhase = [];
        $autoScrollHEnabled = false;
        $autoScrollVEnabled = false;
        foreach ($playIdxs as $k => $gi) {
            $sc = $screenData[$gi] ?? null;
            $pid = is_array($sc) ? ($sc['phaseId'] ?? null) : null;
            $tt = ($pid !== null && isset($phaseTransitionById[(string)$pid])) ? $phaseTransitionById[(string)$pid] : 'scroll_h';
            $playScreenHardCut[] = ($tt === 'hard_cut') ? 1 : 0;
            $isAutoH = ($tt === 'scroll_h_auto');
            $playScreenAutoH[] = $isAutoH ? 1 : 0;
            if ($isAutoH) $autoScrollHEnabled = true;
            // Item auto-scroll VERTICAL: mesma ideia de playScreenAutoH,
            // espelhada pro eixo Y - mutuamente exclusivo com AutoH na
            // prática (scrollOrientation é global), mas cada fase ainda
            // escolhe seu próprio transitionType, então mantém a tabela
            // separada por clareza (mesmo padrão de PlayScreenHardCut).
            $isAutoV = ($tt === 'scroll_v_auto');
            $playScreenAutoV[] = $isAutoV ? 1 : 0;
            if ($isAutoV) $autoScrollVEnabled = true;
            // Item auto-scroll (fix real - achado testando com projeto de 2
            // fases): "ultima tela" tem que ser por FASE, nao pelo total de
            // telas do projeto - senao o auto-scroll atravessa direto pra
            // tela da PROXIMA fase (mesmo ela sendo hard_cut) em vez de parar.
            // 1 = essa e' a ultima tela da sua fase (proxima tela nao existe
            // ou pertence a outra fase).
            $nextPid = null;
            if ($k + 1 < count($playIdxs)) {
                $nextSc = $screenData[$playIdxs[$k + 1]] ?? null;
                $nextPid = is_array($nextSc) ? ($nextSc['phaseId'] ?? null) : null;
            }
            $playScreenLastInPhase[] = ((string)$pid !== (string)$nextPid) ? 1 : 0;
        }
        if (!$playScreenHardCut) $playScreenHardCut[] = 0;
        if (!$playScreenAutoH) $playScreenAutoH[] = 0;
        if (!$playScreenAutoV) $playScreenAutoV[] = 0;
        if (!$playScreenLastInPhase) $playScreenLastInPhase[] = 1;

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

        // Item cutscene: tabela PARALELA à de cima, mas indexada por índice
        // GLOBAL de tela (cur_screen) em vez de play_idx - cobre TODA tela
        // (inclusive role='splash'/cutscene, que nunca entram em playIdxs).
        // Existe só pra ação "Avançar Página" ter vizinho de verdade em
        // fases de cutscene (achado num teste de build real: reaproveitar a
        // tabela de cima simplesmente não funciona pra cutscene, já que ela
        // só cobre telas jogáveis).
        $bgIdToGlobalIdx = [];
        foreach ($screenData as $gi => $sc) {
            if (is_array($sc) && isset($sc['id'])) $bgIdToGlobalIdx[(string)$sc['id']] = (int)$gi;
        }
        $screenCutRight = [];
        foreach ($screenData as $gi => $sc) {
            $nR = 255;
            if (is_array($sc) && isset($sc['gridX'], $sc['gridY'], $sc['phaseId'])) {
                $cells = $cellByPhaseXY[(string)$sc['phaseId']] ?? null;
                if (is_array($cells)) {
                    $cell = $cells[((int)$sc['gridX'] + 1) . ',' . (int)$sc['gridY']] ?? null;
                    $bgId = is_array($cell) ? (string)($cell['bgId'] ?? '') : '';
                    if ($bgId !== '' && isset($bgIdToGlobalIdx[$bgId])) $nR = $bgIdToGlobalIdx[$bgId];
                }
            }
            $screenCutRight[$gi] = $nR;
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

        // UOROM etapa 2: banco de PRG por FASE - dimensao completamente
        // separada do screenBankIndex acima (que e' so' CHR/pagina de
        // tile). null = fica no banco fixo (telas/musicas sem phaseId, ou
        // projeto sem essa fase usando banco nenhum ainda).
        $isUorom = $mapperInfo['mapper'] === 2;
        $prgBanks = $isUorom ? ($mapperInfo['prgBanks'] ?? []) : [];
        $phasePrgBankIndex = [];
        foreach ($prgBanks as $bi => $b) { $phasePrgBankIndex[(string)$b['phaseId']] = $bi; }
        $screenPrgBankIndex = array_fill(0, count($screenData), null);
        if ($isUorom) {
            foreach ($screenData as $i => $sc) {
                $pid = is_array($sc) ? ($sc['phaseId'] ?? null) : null;
                if ($pid !== null && isset($phasePrgBankIndex[(string)$pid])) {
                    $screenPrgBankIndex[$i] = $phasePrgBankIndex[(string)$pid];
                }
            }
        }

        // Item fonte-no-CHR (substituiu o esquema "pós-compressão" antigo,
        // que colava bytes de sistemas/nes/assets/novo.chr direto no banco
        // em tempo de build): a fonte agora é "carimbada" pelo PRÓPRIO
        // EDITOR dentro de project.chr, nos ÚLTIMOS N tiles de cada página
        // que precisa dela (N=96 ascii/40 smb, ver chr-editor.js) - o
        // backend só precisa saber QUANTOS tiles reservar (fontTiles, pra
        // calcular o teto de metatiles) e o MAPA caractere->índice relativo
        // (FontAsset::charMap - layout puro, não lê mais novo.chr aqui).
        // Pixel de verdade agora vem de project.chr igual qualquer tile.
        $textFontModeRaw = (string)($project['textFontMode'] ?? 'ascii');
        $textDisabled = $textFontModeRaw === 'none';
        $textFontMode = $textFontModeRaw === 'smb' ? 'smb' : 'ascii';
        $bankNeedsFont = [];
        if (!$textDisabled) {
            foreach ($screensByBank as $bi => $idxList) {
                $needs = false;
                foreach ($idxList as $si) {
                    $tl = $screenData[$si]['textLayers'] ?? [];
                    if (is_array($tl) && count($tl) > 0) { $needs = true; break; }
                }
                $bankNeedsFont[$bi] = $needs;
            }
        }
        $anyBankNeedsFont = in_array(true, $bankNeedsFont, true);
        $fontTiles = $anyBankNeedsFont ? ($textFontMode === 'smb' ? 40 : 96) : 0;
        $fontMap = $anyBankNeedsFont ? FontAsset::charMap($textFontMode) : [];

        // Camada 9 (limpeza pré-áudio): telas sempre viram MetatileIndex_<tela>
        // (240 bytes) - não existe mais fallback cru/tela suja. Precisa rodar
        // ANTES do empacotamento de CHR porque os tiles dos metatiles ocupam
        // SEMPRE os slots 4*idLocal..4*idLocal+3 do banco (posição fixa, sem
        // tabela de índice) - ver buildMetatileCompression(). Também valida
        // que nenhum metatile "normal" pisa no tile 0 (reservado pro
        // metatile "Vazio" automático) nem na faixa reservada da fonte.
        $metatileCompression = $this->buildMetatileCompression($project, $screenData, $screensByBank, $bankNeedsFont, $fontTiles, $mapperInfo['banks']);

        // Stage 15: o empacotamento CHR dos sprites passa a ser responsabilidade do NGC.
        // O backend usa diretamente project.chr + project.metatiles + project.characters.
        // Camada 7: a ATRIBUICAO de indice (qual tile usado vira qual slot 0-255) continua
        // uma unica passada global (senao o mesmo personagem podia acabar com indices
        // diferentes em bancos diferentes, e a ASM que desenha sprite usa indice fixo por
        // quadro de animacao) - so' os BYTES de origem mudam de banco pra banco (mesmo
        // indice de saida, pagina de origem diferente). Ver spriteChrBanks abaixo.
        $sprite = $this->buildSpriteContext($project, $screenData, $playIdxs, $defaultBank['spritePage'], $cnrom ? 256 : 512);

        // Stage 18/Camada 9: CHR de background agora vem 100% dos tiles dos
        // metatiles usados em cada banco - sem varredura de nametable cru,
        // sem exceção de página pro NROM (lê de bank['bgPage'] igual o
        // CNROM; a antiga leitura fixa da pág 0 era só pra não quebrar
        // projeto existente, e não existe mais projeto legado a preservar).
        $chrRaw = is_array($project['chr'] ?? null) ? $project['chr'] : [];
        $bgChrBanks = [];
        $spriteChrBanks = [];
        foreach ($mapperInfo['banks'] as $bi => $bank) {
            $mtBank = $metatileCompression['banks'][$bi] ?? ['tileRefs' => [0, 0, 0, 0]];
            $tileRefs = $mtBank['tileRefs'];
            if (!empty($bankNeedsFont[$bi]) && $fontTiles > 0) {
                // Item fonte-no-CHR: a faixa reservada é SEMPRE os últimos
                // fontTiles tiles do banco (256-fontTiles..255), relativo à
                // própria página - preenche o vão entre o que os metatiles
                // realmente usaram e essa fronteira fixa com tile 0 (em
                // branco, sem custo real - é só padding não usado de
                // qualquer forma), depois grava os índices relativos da
                // fonte em sequência. packChrBytesForTiles lê tudo isso
                // direto de project.chr (mesma origem de qualquer tile -
                // a fonte já está carimbada lá pelo editor).
                while (count($tileRefs) < 256 - $fontTiles) $tileRefs[] = 0;
                for ($i = 256 - $fontTiles; $i < 256; $i++) $tileRefs[] = $i;
            }
            $packed = $this->packChrBytesForTiles($tileRefs, $chrRaw, $bank['bgPage'], 256);
            $bgChrBanks[$bi] = $packed;

            $spriteChrBanks[$bi] = ($bi === $mapperInfo['defaultBankIndex'])
                ? $sprite['spriteChr']
                : $this->packChrBytesForTiles($sprite['usedTiles'] ?? [], $chrRaw, $bank['spritePage'], 256);
        }

        // Texto sobreposto: base da fonte é sempre 256-fontTiles (fixo,
        // relativo ao próprio banco - não depende mais de quantos metatiles
        // foram usados, ver bloco acima) - monta os dados de runtime
        // (posição + tiles) por tela.
        $textOverlayByScreen = $this->buildTextOverlays($screenData, $screensByBank, $fontTiles, $fontMap, $textFontMode);


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
            'mapperInfo' => $mapperInfo,
            'scrollOrientation' => (($project['scrollOrientation'] ?? 'horizontal') === 'vertical') ? 'vertical' : 'horizontal',
            'bgChrBanks' => $bgChrBanks,
            'spriteChrBanks' => $spriteChrBanks,
            'chrUploadTrim' => $this->computeChrUploadTrim($mapperInfo, $spriteChrBanks, $bgChrBanks),
            'screenBankIndex' => $screenBankIndex,
            'screenPrgBankIndex' => $screenPrgBankIndex,
            'phasePrgBankIndex' => $phasePrgBankIndex,
            'prgBankCount' => count($prgBanks),
            'usedMetatiles' => $usedMetatiles,
            'metatileIndexByScreen' => $metatileCompression['metatileIndexByScreen'],
            'metatileCompressionBanks' => $metatileCompression['banks'],
            'textOverlayByScreen' => $textOverlayByScreen,
            'anyBankNeedsFont' => $anyBankNeedsFont,
            'program' => $program,
            'playIdxs' => $playIdxs,
            'splashIdx' => $this->findRoleIndex($screens, 'splash', 0),
            'gameoverIdx' => $this->findRoleIndex($screens, 'gameover', max(0, count($screens) - 1)),
            'playStartIdx' => count($playIdxs) ? $playIdxs[0] : 0,
            'secondPlayScreenIdx' => count($playIdxs) > 1 ? $playIdxs[1] : null,
            'playCount' => count($playIdxs),
            'lastPlayIdx' => count($playIdxs) ? count($playIdxs) - 1 : 0,
            'playScreenHardCut' => $playScreenHardCut,
            'playScreenAutoH' => $playScreenAutoH,
            'playScreenAutoV' => $playScreenAutoV,
            'playScreenLastInPhase' => $playScreenLastInPhase,
            'autoScrollHEnabled' => $autoScrollHEnabled,
            'autoScrollVEnabled' => $autoScrollVEnabled,
            'playScreenGravityOff' => $playScreenGravityOff,
            'playScreenGravityStrength' => $playScreenGravityStrength,
            'screenNeighborRight' => $neighborRight,
            'screenCutRight' => $screenCutRight,
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
     * Camada 9: expande metatileGrid (240 células) pra um array de 960
     * índices de tile CRUS (os mesmos de project.chr, não os compactados),
     * lendo cada metatile em project.metatiles - usado por buildPaletteData
     * pra reconstruir a "1ª tela" sem depender de nametable cru nenhum.
     */
    private function expandMetatileGridToRawTiles(array $grid, array $metatilesById): array
    {
        $out = array_fill(0, 960, 0);
        foreach ($grid as $cellIdx => $mtId) {
            $mt = $metatilesById[(string)$mtId] ?? null;
            $tiles = is_array($mt['tiles'] ?? null) ? $mt['tiles'] : [0, 0, 0, 0];
            $gx = $cellIdx % 16; $gy = intdiv($cellIdx, 16);
            for ($dy = 0; $dy < 2; $dy++) {
                for ($dx = 0; $dx < 2; $dx++) {
                    $tx = $gx * 2 + $dx; $ty = $gy * 2 + $dy;
                    if ($tx >= 32 || $ty >= 30) continue;
                    $out[$ty * 32 + $tx] = (int)($tiles[$dy * 2 + $dx] ?? 0);
                }
            }
        }
        return $out;
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

        $metatilesById = [];
        foreach ((is_array($project['metatiles'] ?? null) ? $project['metatiles'] : []) as $mt) {
            if (is_array($mt) && isset($mt['id'])) $metatilesById[(string)$mt['id']] = $mt;
        }
        $firstGrid = is_array($screenData[0]['metatileGrid'] ?? null) ? $screenData[0]['metatileGrid'] : array_fill(0, 240, null);
        $firstNt = $this->expandMetatileGridToRawTiles($firstGrid, $metatilesById);
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
        if ($mapper === 2) {
            // UOROM etapa 1 (header+CHR-RAM): CHR continua fixo em 1
            // combinacao so' (paginas 0+1), exatamente como NROM - CHR-RAM
            // nunca troca em runtime, nem na etapa 2. A diferenca de UOROM
            // fica em header.php (chrBanks=0, mapper=2), no upload pra
            // CHR-RAM no Reset (chars_segments.php/system.php 'reset') e,
            // a partir da etapa 2, em prgBanks abaixo (bankswitch de PRG
            // de verdade, por FASE - nao tem nada a ver com o CHR banks[]
            // acima, que e' conceito de pagina de tile, nao de codigo/dado).
            return [
                'mapper' => 2,
                'banks' => [['spritePage' => 0, 'bgPage' => 1]],
                'phaseBankIndex' => [],
                'defaultBankIndex' => 0,
                'prgBanks' => $this->resolveUoromPrgBanks($project),
            ];
        }
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
     * UOROM (qualquer etapa com CHR-RAM): quantos bytes de verdade precisam
     * subir pra CHR-RAM no boot, por banco (sprite $0000 / bg $1000)
     * SEPARADAMENTE - nunca um só número combinado, os dois PPU-endereços
     * não são contíguos. Corta só o SUFIXO final sem nenhum tile usado
     * (procura o último tile com conteúdo não-zero e arredonda pra cima,
     * em unidade de tile = 16 bytes) - NUNCA pula tiles individuais no
     * meio mesmo que deem zero, porque um tile deliberadamente em branco
     * (ex: espaço vazio de cenário) também tem bytes zero e precisa ser
     * gravado na CHR-RAM mesmo assim (ela começa com lixo no power-on,
     * não com zero garantido). Fonte única - chars_segments.php (o que
     * grava no PRG) e system.php 'reset' (quantos bytes copia no boot)
     * usam ESTE MESMO número, senão um sobe menos do que o outro lê.
     */
    private function computeChrUploadTrim(array $mapperInfo, array $spriteChrBanks, array $bgChrBanks): array
    {
        if ((int)($mapperInfo['mapper'] ?? 0) !== 2) return ['spriteBytes' => 4096, 'bgBytes' => 4096];
        $lastUsedTileBytes = static function (array $bytes): int {
            $lastTile = -1;
            $n = count($bytes);
            for ($off = 0; $off < $n; $off += 16) {
                $nonZero = false;
                for ($k = 0; $k < 16 && $off + $k < $n; $k++) {
                    if (($bytes[$off + $k] ?? 0) !== 0) { $nonZero = true; break; }
                }
                if ($nonZero) $lastTile = (int)($off / 16);
            }
            return ($lastTile + 1) * 16; // 0 se nenhum tile usado
        };
        return [
            'spriteBytes' => max(16, $lastUsedTileBytes($spriteChrBanks[0] ?? [])),
            'bgBytes' => max(16, $lastUsedTileBytes($bgChrBanks[0] ?? [])),
        ];
    }

    /**
     * Ponto de entrada público pra quem precisa só do número de bancos de
     * PRG do UOROM etapa 2 SEM rodar o parse() inteiro (ex: UoromCfg.php,
     * que gera o .cfg do linker antes/independente da montagem do .asm
     * completo). Fonte única de verdade - resolveMapperBanks() usa a MESMA
     * função por baixo, nunca duplicar essa lista em outro lugar.
     */
    public function getUoromPrgBanks(array $project): array
    {
        return $this->resolveUoromPrgBanks($project);
    }

    /**
     * UOROM etapa 2 (bankswitch de PRG de verdade): BANCO = FASE, mesma
     * unidade que o CNROM usa pra CHR, mas aqui é PRG (código+dado) - não
     * tem nenhuma relação com o banks[]/phaseBankIndex de CHR acima (esses
     * continuam fixos em 1 combinação só, CHR-RAM nunca troca).
     *
     * Só fases com conteúdo PRÓPRIO (pelo menos 1 tela OU 1 música com
     * phaseId apontando pra ela) ganham banco - fase vazia não gasta
     * banco. Telas/músicas SEM phaseId (splash/gameover soltos, ou projeto
     * sem fase nenhuma) ficam de fora de prgBanks de propósito - o
     * consumidor (ProjectParser::parse()) trata "sem entrada aqui" como
     * "vai pro banco fixo", nunca pra um banco comutável.
     *
     * A VALIDAÇÃO de caber em 16KB por fase não acontece aqui (o tamanho
     * comprimido de tela/música só existe depois da compressão de
     * metatile/RLE, que roda depois) - ver checkUoromBankSizes() no fim do
     * parse().
     */
    private function resolveUoromPrgBanks(array $project): array
    {
        $phases = is_array($project['phases'] ?? null) ? $project['phases'] : [];
        $screens = $this->collectGameScreens($project);
        $usedPhaseIds = [];
        foreach ($screens as $sc) {
            $pid = is_array($sc) ? ($sc['phaseId'] ?? null) : null;
            if ($pid !== null && $pid !== '') $usedPhaseIds[(string)$pid] = true;
        }
        $soundItems = is_array($project['sounds']['items'] ?? null) ? $project['sounds']['items'] : [];
        foreach ($soundItems as $s) {
            if (!is_array($s) || (($s['type'] ?? 'song') === 'sfx')) continue;
            $pid = $s['phaseId'] ?? null;
            if ($pid !== null && $pid !== '') $usedPhaseIds[(string)$pid] = true;
        }

        $prgBanks = [];
        foreach ($phases as $ph) {
            if (!is_array($ph) || !isset($ph['id'])) continue;
            $pid = (string)$ph['id'];
            if (!isset($usedPhaseIds[$pid])) continue; // fase sem conteudo proprio, nao gasta banco
            $prgBanks[] = ['phaseId' => $pid, 'phaseName' => (string)($ph['name'] ?? $pid)];
        }
        return $prgBanks; // indice no array = numero do banco comutavel (0..N-1)
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
     * Camada 9 (limpeza pré-áudio): NGC agora trabalha SÓ com tabelas de
     * metatile - não existe mais "tela suja"/fallback cru. Toda tela
     * PRECISA ter metatileGrid completo (240 células, todo id existente em
     * project.metatiles) - senão é erro de build claro, não silenciosamente
     * ignorado nem fallback pra outra coisa. Cada metatile local ocupa
     * SEMPRE 4*idLocal..4*idLocal+3 (TL,TR,BL,BR) no espaço compacto de 256
     * tiles do banco - posição fixa, sem tabela de índice de tile nenhuma.
     * Só a COLISÃO precisa de tabela (MetatileCollision_bank<N>, 1 byte por
     * id local: 4 bits de máscara de quadrante + 4 bits de tipo - ver
     * packMetatileCollisionByte()), porque isso não é computável por fórmula.
     *
     * Limite: no máx 64 metatiles distintos por banco (64*4=256, o espaço
     * compacto inteiro) - estoura vira erro claro, igual o limite de 4
     * bancos do CNROM.
     */
    private function buildMetatileCompression(array $project, array $screenData, array $screensByBank, array $bankNeedsFont = [], int $fontTiles = 0, array $mapperBanks = []): array
    {
        $metatilesById = [];
        foreach ((is_array($project['metatiles'] ?? null) ? $project['metatiles'] : []) as $mt) {
            if (is_array($mt) && isset($mt['id'])) $metatilesById[(string)$mt['id']] = $mt;
        }

        $metatileIndexByScreen = [];
        $banks = [];

        foreach ($screensByBank as $bi => $idxList) {
            $localIndexByMtId = [];
            $tileRefs = [];
            $collisionBytes = [];
            // Item "célula sem metatile válido" (pedido real do usuário -
            // isso nunca mais deve aparecer como erro): se a página desse
            // banco já tem o metatile "Vazio" (mt_empty_pg<N>, criado pelo
            // editor - ver backgrounds.js getOrCreateEmptyMetatile) usa ele
            // de verdade; senão SINTETIZA um equivalente aqui na hora
            // (4 tiles = tile 0 da página, sem colisão) - mesma convenção,
            // só não depende do projeto já ter esse metatile salvo (cobre
            // telas antigas, de antes dessa peça existir no editor).
            $emptyPage = (int)($mapperBanks[$bi]['bgPage'] ?? 0);
            $emptyKey = 'mt_empty_pg' . $emptyPage;
            if (!isset($metatilesById[$emptyKey])) {
                $t0 = $emptyPage * 256;
                $metatilesById[$emptyKey] = ['id' => $emptyKey, 'name' => 'Vazio', 'w' => 2, 'h' => 2, 'tiles' => [$t0, $t0, $t0, $t0], 'collisionType' => 0, 'collisions' => [0, 0, 0, 0], 'isEmptyDefault' => true];
            }

            foreach ($idxList as $si) {
                $sc = is_array($screenData[$si] ?? null) ? $screenData[$si] : [];
                $screenName = (string)($sc['name'] ?? $si);
                $grid = is_array($sc['metatileGrid'] ?? null) ? $sc['metatileGrid'] : null;
                if (!is_array($grid) || count($grid) !== 240) {
                    throw new RuntimeException(
                        "A tela \"{$screenName}\" não tem uma grade de metatile válida (esperado 240 células, 2×2 cada). " .
                        "Reabra essa tela no editor de fundos e repinte-a inteira usando os metatiles - o NGC não trabalha " .
                        "mais com nametable cru."
                    );
                }
                foreach ($grid as $cellIdx => $mtId) {
                    if ($mtId === null || $mtId === '' || !isset($metatilesById[(string)$mtId])) {
                        $grid[$cellIdx] = $emptyKey;
                    }
                }
                $sc['metatileGrid'] = $grid;

                $localIds = [];
                $mtCap = (!empty($bankNeedsFont[$bi]) && $fontTiles > 0) ? (int)floor((256 - $fontTiles) / 4) : 64;
                foreach ($grid as $mtId) {
                    $key = (string)$mtId;
                    if (!isset($localIndexByMtId[$key])) {
                        if (count($localIndexByMtId) >= $mtCap) {
                            $fontNote = (!empty($bankNeedsFont[$bi]) && $fontTiles > 0)
                                ? " (esse banco reserva {$fontTiles} tiles pra fonte do texto sobreposto, por isso o limite caiu de 64 pra {$mtCap} - remova texto de alguma tela desse banco pra recuperar o limite cheio)"
                                : '';
                            throw new RuntimeException(
                                "Compressão de tela: a tela \"{$screenName}\" (e outras que compartilham o mesmo banco de CHR) " .
                                "usam mais de {$mtCap} metatiles de background distintos - é o máximo que cabe comprimido num banco " .
                                "de 4KB (256 tiles no total){$fontNote}. Reduza a variedade de " .
                                "metatiles usados nesse conjunto de telas, ou separe em fases com páginas de CHR diferentes."
                            );
                        }
                        $mt = $metatilesById[$key];
                        $tiles = is_array($mt['tiles'] ?? null) ? $mt['tiles'] : [0, 0, 0, 0];
                        // Item "posso usar o tile 0 num metatile normal?"
                        // (pedido do usuário, mesma lógica da faixa da fonte
                        // já liberada antes): removida a validação que
                        // bloqueava qualquer metatile diferente do "Vazio"
                        // de usar tile 0. Quem protege o conteúdo do tile 0
                        // de mudar sem querer é a TRAVA do CHR Editor, não
                        // uma regra de build - travado, qualquer metatile
                        // que o use (Vazio ou não, ex: um "céu" quase todo
                        // em branco) mostra sempre o mesmo conteúdo, sem
                        // conflito (colisão é por-metatile, não por-tile).
                        for ($k = 0; $k < 4; $k++) $tileRefs[] = (int)($tiles[$k] ?? 0);
                        $collisionBytes[] = $this->packMetatileCollisionByte(is_array($mt['collisions'] ?? null) ? $mt['collisions'] : []);
                        $localIndexByMtId[$key] = count($localIndexByMtId);
                    }
                    $localIds[] = $localIndexByMtId[$key];
                }
                $metatileIndexByScreen[$si] = $localIds;
            }

            if (!$tileRefs) $tileRefs = [0, 0, 0, 0];
            if (!$collisionBytes) $collisionBytes = [0];

            $banks[$bi] = [
                'tileRefs' => $tileRefs,
                'collisionBytes' => $collisionBytes,
                'metatileCount' => count($localIndexByMtId),
            ];
        }

        return [
            'metatileIndexByScreen' => $metatileIndexByScreen,
            'banks' => $banks,
        ];
    }

    /**
     * Texto sobreposto (pós-compressão): monta, por tela, a lista de
     * camadas de texto prontas pra runtime (posição + índice de tile já
     * somado à base da fonte daquele banco - ver fontBaseTileByBank em
     * parse()). NÃO mexe em atributo/paleta - isso já foi gravado
     * permanentemente no Attr_i normal pelo próprio editor (backgrounds.js
     * writeTextAt já mescla a paleta no array attributes[] da tela, que é
     * salvo do jeito de sempre) - aqui só falta o BYTE DE TILE em si, que
     * não existe mais em lugar nenhum desde que nametable cru parou de ser
     * lido (Camada 9).
     */
    private function buildTextOverlays(array $screenData, array $screensByBank, int $fontTiles, array $fontMap, string $textFontMode = 'ascii'): array
    {
        $out = [];
        if ($fontTiles <= 0 || !$fontMap) return $out;
        $base = 256 - $fontTiles; // fixo - ver bloco de montagem de $bgChrBanks acima
        $spaceRel = $fontMap[32] ?? 0;
        // Item texto SMB maiúsculo (pedido do usuário): a fonte "smb" só tem
        // dígitos+MAIÚSCULAS+espaço (ver FontAsset::charMap) - minúscula
        // digitada nessa fonte não existe no mapa e virava espaço em branco
        // silenciosamente. Força maiúscula ANTES do mapeamento, só na
        // compilação (o editor continua mostrando o texto como o usuário
        // digitou - não mexe em $tl['text']).
        $forceUpper = ($textFontMode === 'smb');
        foreach ($screensByBank as $bi => $idxList) {
            foreach ($idxList as $si) {
                $layers = is_array($screenData[$si]['textLayers'] ?? null) ? $screenData[$si]['textLayers'] : [];
                if (!$layers) continue;
                $entries = [];
                foreach ($layers as $tl) {
                    if (!is_array($tl)) continue;
                    $text = (string)($tl['text'] ?? '');
                    if ($text === '') continue;
                    if ($forceUpper) $text = strtoupper($text);
                    $x = max(0, min(31, (int)($tl['x'] ?? 0)));
                    $y = max(0, min(29, (int)($tl['y'] ?? 0)));
                    $tiles = [];
                    $len = strlen($text);
                    for ($i = 0; $i < $len && ($x + $i) < 32; $i++) {
                        $rel = FontAsset::mapChar($text[$i], $fontMap);
                        $tiles[] = $base + ($rel ?? $spaceRel);
                    }
                    if ($tiles) $entries[] = ['x' => $x, 'y' => $y, 'tiles' => $tiles];
                }
                if ($entries) $out[$si] = $entries;
            }
        }
        return $out;
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


    /**
     * Camada 9 (limpeza pré-áudio): varre TODAS as telas (backgrounds +
     * splashScreens) procurando metatileGrid e devolve o conjunto de IDs de
     * metatile realmente carimbados em algum lugar do jogo. Não confia em
     * nenhuma flag "usado" salva no .nms - recalcula do zero a cada build,
     * a partir dos dados de verdade, pra nunca gerar uma ROM incoerente com
     * uma flag desatualizada. Útil pro editor avisar quais metatiles
     * definidos não são usados em canto nenhum (não precisam ir pra ROM -
     * e de fato não vão, já que buildMetatileCompression() só inclui o que
     * alguma tela realmente referencia).
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

    /**
     * Réplica completa de collectGameScreens() do build-rom.js - agora inclui
     * nametable/attributes/collisionMap BRUTOS de cada tela (Stage 21), então
     * o frontend não precisa mais pré-processar nada: só manda o project.data
     * (.nms) inteiro e o NGC resolve as telas sozinho.
     */

    private function collectGameScreens(array $project): array
    {
        $screens = [];
        $seen = [];
        $bgs = is_array($project['backgrounds'] ?? null) ? $project['backgrounds'] : [];
        $splashes = is_array($project['splashScreens'] ?? null) ? $project['splashScreens'] : [];
        $bgById = [];
        // Item cutscene: unificado - tipo agora é da FASE, não da tela (ver
        // abaixo). splashScreens só é lido aqui por compat com projetos
        // salvos antes dessa mudança (o editor já migra tudo pra
        // backgrounds ao abrir - ver backgrounds.js migrateSplashScreensToBackgrounds).
        foreach ($bgs as $bg) if (is_array($bg) && isset($bg['id'])) $bgById[(string)$bg['id']] = $bg;
        foreach ($splashes as $sp) if (is_array($sp) && isset($sp['id']) && !isset($bgById[(string)$sp['id']])) $bgById[(string)$sp['id']] = $sp;

        $assetFields = static function (?array $asset, string $id, string $name): array {
            return [
                'id' => $asset['id'] ?? $id,
                'name' => $asset['name'] ?? $name,
                'attributes' => is_array($asset['attributes'] ?? null) ? $asset['attributes'] : array_fill(0, 64, 0),
                // Camada 9 (limpeza pré-áudio): metatileGrid é a ÚNICA fonte de
                // verdade de conteúdo de tela agora - nametable/collisionMap
                // crus não são mais lidos em canto nenhum (removidos daqui de
                // propósito; não existe mais "tela suja" pra sustentar).
                'metatileGrid' => is_array($asset['metatileGrid'] ?? null) ? $asset['metatileGrid'] : null,
                // Camada de texto sobreposto (pós-compressão): texto não
                // invalida mais célula de metatile nenhuma - fica guardado
                // à parte e escrito por cima em tempo de execução, depois
                // que a tela normal (via metatile) já foi desenhada. Ver
                // buildTextOverlays().
                'textLayers' => is_array($asset['textLayers'] ?? null) ? $asset['textLayers'] : [],
                // Camada 6 Fase 2b: hitbox de Dano/Warp pintada em Backgrounds (tile
                // 0-31/0-29, sparse, {x,y,hitboxObjectId}) - convertida em trigger
                // point (pixel) por ProgramCompiler::buildHbCtx, junto com os pontos
                // de spawn que já vinham de project.hitboxInstances (global).
                'hitboxInstances' => is_array($asset['hitboxInstances'] ?? null) ? $asset['hitboxInstances'] : [],
            ];
        };

        $phases = is_array($project['phases'] ?? null) ? $project['phases'] : [];
        foreach ($phases as $ph) {
            if (!is_array($ph)) continue;
            $lm = $ph['levelMap'] ?? null;
            if (!is_array($lm) || !is_array($lm['cells'] ?? null)) continue;
            $cols = max(1, (int)($lm['cols'] ?? 1));
            $rows = max(1, (int)($lm['rows'] ?? 1));
            // Item cutscene: tipo agora é da FASE inteira (nunca por-célula) -
            // impossível misturar Gameplay com Cutscene dentro da mesma fase,
            // por construção (não é mais uma regra de validação, é assim que
            // o dado é lido). Isso é a causa raiz do bug de colisão fantasma
            // ficar impossível de acontecer de novo.
            $isSplash = (($ph['type'] ?? 'gameplay') === 'cutscene');
            for ($y = 0; $y < $rows; $y++) {
                for ($x = 0; $x < $cols; $x++) {
                    $cell = $lm['cells'][$x . ',' . $y] ?? null;
                    if (!is_array($cell) || empty($cell['bgId'])) continue;
                    $id = (string)$cell['bgId'];
                    if (isset($seen[$id])) continue;
                    $asset = $bgById[$id] ?? null;
                    if (!is_array($asset)) continue;
                    $seen[$id] = true;
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
