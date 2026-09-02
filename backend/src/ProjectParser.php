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

        // Stage 21: a resolução de telas (quais backgrounds/splashes entram no
        // jogo, em que ordem, com que papel) acontece inteiramente aqui a
        // partir do project.data (.nms) bruto - sem nenhum seletor da UI.
        $screens = $this->collectGameScreens($project);

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

        // Stage 15: o empacotamento CHR dos sprites passa a ser responsabilidade do NGC.
        // O backend usa diretamente project.chr + project.metatiles + project.characters.
        $sprite = $this->buildSpriteContext($project, $screenData, $playIdxs);

        // Stage 18: o empacotamento CHR do background também é feito aqui,
        // remapeando contra project.chr e injetando remappedNt de volta em
        // screenData, mantendo background_data.php/background_tables.php inalterados.
        $chrRaw = is_array($project['chr'] ?? null) ? $project['chr'] : [];
        $bgPack = $this->packBackgroundChr($chrRaw, $screenData);
        $screenData = $bgPack['screens'];

        // Stage 19: PaletteData (as 8 paletas de 4 cores + a cor de fundo universal,
        // detectada olhando o PIXEL real do tile 0 da 1ª tela) passa a ser calculada
        // pelo NGC. Replica fielmente computeBackdropColor() de js/render-utils.js,
        // incluindo o mesmo comportamento do legado de ler o índice de tile já
        // REMAPEADO contra o banco de CHR BRUTO (não o banco empacotado) - mantido
        // assim de propósito pra não mudar o resultado visual do jogo já aprovado.
        $paletteBytes = $this->buildPaletteData($project, $chrRaw, $screenData);

        // Camada 6 - Fase 1: variáveis + motor de regras (ver ProgramCompiler.php).
        $program = (new ProgramCompiler())->compile($project, $sprite, $playIdxs, $screenData, $screenIndexById);

        return [
            'project' => $project,
            'buildMode' => 'game',
            'controlMode' => ($project['controlMode'] ?? 'auto') === 'programmed' ? 'programmed' : 'auto',
            'soundItems' => $soundItems,
            'musicEnabled' => $hasSound,
            'screens' => $screens,
            'screenData' => $screenData,
            'palette' => $paletteBytes,
            'bg' => [
                'chr' => $bgPack['bgChr'],
                'usedCount' => $bgPack['usedCount'],
                'overflowCount' => $bgPack['overflowCount'],
            ],
            'program' => $program,
            'playIdxs' => $playIdxs,
            'splashIdx' => $this->findRoleIndex($screens, 'splash', 0),
            'gameoverIdx' => $this->findRoleIndex($screens, 'gameover', max(0, count($screens) - 1)),
            'playStartIdx' => count($playIdxs) ? $playIdxs[0] : 0,
            'secondPlayScreenIdx' => count($playIdxs) > 1 ? $playIdxs[1] : null,
            'playCount' => count($playIdxs),
            'lastPlayIdx' => count($playIdxs) ? count($playIdxs) - 1 : 0,
            'sprite' => $sprite,
        ];
    }


    private function buildSpriteContext(array $project, array $screenData, array $playIdxs): array
    {
        $chars = is_array($project['characters'] ?? null) ? $project['characters'] : [];
        $packed = $this->packSpriteCHR($project, $chars);
        $charData = $packed['charData'];
        $maxCells = max(1, (int)$packed['maxCells']);
        $heroIdx = 0;
        $heroFound = false;
        foreach ($chars as $i => $c) {
            if (is_array($c) && stripos((string)($c['name'] ?? ''), 'hero') !== false) {
                $heroIdx = (int)$i;
                $heroFound = true;
                break;
            }
        }
        $heroFrames = 1;
        if (isset($charData[$heroIdx]) && is_array($charData[$heroIdx])) {
            $heroFrames = max(1, count(is_array($charData[$heroIdx]['frames'] ?? null) ? $charData[$heroIdx]['frames'] : []));
        }

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
            $id = (string)$c['id'];
            $charIndexById[$id] = (int)$i;
            if (stripos((string)($c['name'] ?? ''), 'hero') !== false) $heroIds[$id] = true;
        }

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
            'enemySpawns' => $enemySpawns,
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
    private function packSpriteCHR(array $project, array $chars): array
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
            $anim = is_array($c['animations'][0] ?? null) ? $c['animations'][0] : ['name'=>'Idle','loop'=>true,'frames'=>[]];
            $framesIn = is_array($anim['frames'] ?? null) ? $anim['frames'] : [];
            $frames = [];
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
            if (!$frames) $frames[] = ['w'=>0, 'h'=>0, 'cellsN'=>[], 'flipsN'=>[], 'cellsF'=>[], 'flipsF'=>[], 'duration'=>8, 'overlay'=>null];
            $charData[] = [
                'id' => $c['id'] ?? null,
                'name' => $c['name'] ?? "Character {$ci}",
                'frames' => $frames
            ];
        }

        $spriteChr = array_fill(0, 4096, 0);
        foreach ($usedTiles as $i => $srcIdx) {
            $srcIdx = ((int)$srcIdx) % 512;
            $srcOff = $srcIdx * 16;
            $dstOff = $i * 16;
            for ($j=0; $j<16; $j++) {
                $spriteChr[$dstOff+$j] = (int)($chr[$srcOff+$j] ?? 0) & 0xFF;
            }
        }

        return [
            'spriteChr' => $spriteChr,
            'charData' => $charData,
            'usedCount' => count($usedTiles),
            'overflowCount' => count($overflow),
            'truncated' => $truncated,
            'maxCells' => $maxCells,
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
    private function packBackgroundChr(array $chr, array $screens): array
    {
        $mapping = [0 => 0];
        $usedTiles = [0];
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

        $bgChr = array_fill(0, 4096, 0);
        foreach ($usedTiles as $i => $srcIdx) {
            $srcIdx = ((int)$srcIdx) % 512;
            $srcOff = $srcIdx * 16;
            $dstOff = $i * 16;
            for ($j = 0; $j < 16; $j++) {
                $bgChr[$dstOff + $j] = (int)($chr[$srcOff + $j] ?? 0) & 0xFF;
            }
        }

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
