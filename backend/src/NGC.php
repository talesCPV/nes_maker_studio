<?php

require_once __DIR__ . '/ProjectParser.php';
require_once __DIR__ . '/AsmBuilder.php';
require_once __DIR__ . '/ProgramCompiler.php';

final class NGC
{
    private array $templates;

    public function __construct(array $templates)
    {
        $this->templates = $templates;
    }

    /**
     * NGC v0.21 - migração incremental dos subsistemas do gerador.
     *
     * Stage 20: o NGC monta sozinho um .asm completo e válido, na ORDEM real
     * que o ca65 precisa (HEADER -> ZEROPAGE -> CODE completo -> VECTORS ->
     * CHARS). Duas peças que só existiam no legado (".segment CODE" e o stub
     * do IRQ) foram adicionadas aqui. O bloco de música é dividido em
     * motor/dados porque cada parte fica numa posição diferente do arquivo.
     *
     * Stage 21: build-rom.js agora é só uma casca - manda o project.data
     * (.nms) bruto inteiro (a resolução de telas, tanto modo jogo quanto
     * tela única, acontece toda em ProjectParser) e recebe de volta só o
     * .asm pronto. O contrato de resposta ficou enxuto: sem o antigo
     * dicionário 'blocks' (só volta se debug=true for pedido no request,
     * útil pra depuração isolada de um bloco). O gerador legado
     * (build-rom.js/generateASM) permanece só como fallback se o NGC falhar
     * ou o backend estiver indisponível.
     */
    public function build(array $request): array
    {
        $parser = new ProjectParser();
        $context = $parser->parse($request);
        $builder = new AsmBuilder();

        $header = $this->renderTemplate('header', $context);
        $vectors = $this->renderTemplate('vectors', $context);
        $zeropage = $this->renderTemplate('zeropage', $context);
        $nmi = $this->renderTemplate('nmi', $context);
        $reset = $this->renderTemplate('reset', $context);
        $input = $this->renderTemplate('input', $context);
        $mainLoop = $this->renderTemplate('main_loop', $context);
        $collision = $this->renderTemplate('collision', $context);
        $player = $this->renderTemplate('player', $context);
        $scroll = $this->renderTemplate('scroll', $context);
        $background = $this->renderTemplate('background', $context);
        $backgroundTables = $this->renderTemplate('background_tables', $context);
        $backgroundData = $this->renderTemplate('background_data', $context);
        $spritePlayer = $this->renderTemplate('sprite_player', $context);
        $spriteEntities = $this->renderTemplate('sprite_entities', $context);
        $spriteData = $this->renderTemplate('sprite_data', $context);
        $spriteChr = $this->renderTemplate('sprite_chr', $context);
        $backgroundChr = $this->renderTemplate('background_chr', $context);
        $music = $this->renderTemplate('music', $context);
        $gameFlow = $this->renderTemplate('game_flow', $context);
        $paletteData = $this->renderTemplate('palette_data', $context);
        $programVarsZp = $this->renderTemplate('program_vars_zp', $context);
        $programVarsRam = $this->renderTemplate('program_vars_ram', $context);
        $programInit = $this->renderTemplate('program_init', $context);
        $programHitboxEngine = $this->renderTemplate('program_hitbox_engine', $context);
        $programRules = $this->renderTemplate('program_rules', $context);

        // O bloco 'music' traz motor + dados juntos, separados por um marcador
        // interno; no arquivo final eles ficam em posições bem distantes.
        $musicEngine = '';
        $musicData = '';
        if ($music !== '') {
            $marker = '; ---- NGC MUSIC DATA ----';
            $pos = strpos($music, $marker);
            if ($pos !== false) {
                $musicEngine = trim(substr($music, 0, $pos));
                $musicData = trim(substr($music, $pos));
            } else {
                $musicEngine = $music;
            }
        }

        // Ordem real exigida pelo arquivo (mapeada label a label contra o
        // gerador legado já aprovado - ver auditoria do Stage 20):
        $builder->add($header);
        $builder->add($zeropage);
        $builder->add($programVarsZp);
        if ($programVarsRam !== '') $builder->add($programVarsRam);
        $builder->add('.segment "CODE"');
        $builder->add($nmi);
        $builder->add("IRQ:\n  RTI");
        if ($musicEngine !== '') $builder->add($musicEngine);
        $builder->add($input);
        $builder->add($background);
        $builder->add($spritePlayer);
        $builder->add($scroll);
        $builder->add($spriteEntities);
        $builder->add($collision);
        $builder->add($player);
        $builder->add($reset);
        $builder->add($programInit);
        $builder->add($mainLoop);
        $builder->add($gameFlow);
        $builder->add($programHitboxEngine);
        $builder->add($programRules);
        $builder->add($paletteData);
        $builder->add($backgroundTables);
        $builder->add($spriteData);
        $builder->add($backgroundData);
        if ($musicData !== '') $builder->add($musicData);
        $builder->add($vectors);
        $builder->add('.segment "CHARS"');
        $builder->add($spriteChr);
        $builder->add("; \$1000 background");
        $builder->add($backgroundChr);

        $result = [
            'ok' => true,
            'ready' => true,
            'partial' => false,
            'compiler' => 'NGC',
            'version' => '0.23.1',
            'buildMode' => $context['buildMode'],
            'projectName' => $context['project']['name'] ?? 'meu-jogo',
            'asm' => $builder->build(),
            'migrated' => ['header', 'vectors', 'zeropage', 'nmi', 'reset', 'input', 'main_loop', 'collision', 'player', 'scroll', 'background', 'background_tables', 'background_data', 'sprite_player', 'sprite_entities', 'sprite_data', 'sprite_chr', 'background_chr', 'music', 'game_flow', 'palette_data', 'program_vars', 'program_rules', 'program_hitbox_engine'],
        ];

        if (!empty($request['debug'])) {
            $result['blocks'] = [
                'header' => $header, 'vectors' => $vectors, 'zeropage' => $zeropage, 'nmi' => $nmi,
                'reset' => $reset, 'input' => $input, 'main_loop' => $mainLoop, 'collision' => $collision,
                'player' => $player, 'scroll' => $scroll, 'background' => $background,
                'background_tables' => $backgroundTables, 'background_data' => $backgroundData,
                'sprite_player' => $spritePlayer, 'sprite_entities' => $spriteEntities, 'sprite_data' => $spriteData,
                'sprite_chr' => $spriteChr, 'background_chr' => $backgroundChr, 'music' => $music,
                'game_flow' => $gameFlow, 'palette_data' => $paletteData,
            ];
        }

        return $result;
    }

    private function renderTemplate(string $name, array $context): string
    {
        if (!isset($this->templates[$name]) || !is_callable($this->templates[$name])) {
            throw new RuntimeException("Template NGC inválido: {$name}");
        }

        return trim((string) call_user_func($this->templates[$name], $context));
    }
}
