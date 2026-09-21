<?php
/**
 * Camada 7 (mappers plugáveis): emite o(s) segmento(s) de CHR-ROM da ROM
 * final. NROM sempre teve 1 segmento CHARS só (sprites + background, 8KB
 * fixos, sem bankswitch). CNROM (mapper 3) precisa de até 4 pares
 * independentes (CHARS0..CHARS3, casando com os nomes de MEMORY/SEGMENTS do
 * linker script CnromCfg.php) - 1 por combinação (sprite_page, bg_page)
 * que alguma fase usa (ver ProjectParser::resolveMapperBanks() e
 * spriteChrBanks/bgChrBanks no contexto).
 */
return [
    'chars_segments' => static function (array $ctx): string {
        $mapperInfo = is_array($ctx['mapperInfo'] ?? null)
            ? $ctx['mapperInfo']
            : ['mapper' => 0, 'banks' => [['spritePage' => 0, 'bgPage' => 1]]];
        $spriteBanks = is_array($ctx['spriteChrBanks'] ?? null) ? $ctx['spriteChrBanks'] : [];
        $bgBanks = is_array($ctx['bgChrBanks'] ?? null) ? $ctx['bgChrBanks'] : [];
        $banks = is_array($mapperInfo['banks'] ?? null) ? $mapperInfo['banks'] : [['spritePage' => 0, 'bgPage' => 1]];

        $emitBlock = static function (array $bytes, string $comment): array {
            // CHR-ROM fisica (NROM/CNROM) precisa dos 4096 bytes inteiros
            // sempre, mesmo que so' uma parte seja "significativa" - o
            // resto vira preenchimento zero. bgChrBanks/spriteChrBanks
            // pode chegar aqui MENOR que 4096 (ex: metatile+fonte cortado
            // - ver ProjectParser, texto sobreposto) porque isso e'
            // otimizacao PRA CHR-RAM do UOROM (outro branch, mais abaixo),
            // que nao passa por aqui - aqui sempre preenche de volta.
            if (count($bytes) < 4096) $bytes = array_pad($bytes, 4096, 0);
            $lines = ["  ; {$comment}"];
            for ($i = 0; $i < 4096; $i += 16) {
                $slice = array_slice($bytes, $i, 16);
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), $slice));
            }
            return $lines;
        };

        $out = [];
        if ((int)($mapperInfo['mapper'] ?? 0) === 2) {
            // UOROM etapa 2: sem chip de CHR-ROM (CHR-RAM), entao os tiles
            // realmente usados (nao os 512 slots possiveis - ver
            // ProjectParser::computeChrUploadTrim(), fonte unica de
            // verdade com o loop de upload em system.php 'reset', os dois
            // TEM que concordar exatamente no numero de bytes) viram dado
            // comum dentro do PRG_FIXED (.segment "RODATA") e sao copiados
            // pra CHR-RAM via $2007 uma vez no boot. Sprite ($0000) e
            // background ($1000) sao 2 tabelas SEPARADAS (nao contiguas em
            // PPU) - nunca uma so' emenda com a outra.
            $trim = is_array($ctx['chrUploadTrim'] ?? null) ? $ctx['chrUploadTrim'] : ['spriteBytes' => 4096, 'bgBytes' => 4096];
            $emitTrimmed = static function (array $bytes, int $n, string $label, string $comment) {
                $lines = ["  ; {$comment} ({$n} bytes)", "{$label}:"];
                for ($i = 0; $i < $n; $i += 16) {
                    $slice = array_slice($bytes, $i, 16);
                    $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), array_pad($slice, 16, 0)));
                }
                return $lines;
            };
            $out[] = '.segment "RODATA"';
            $out = array_merge($out, $emitTrimmed($spriteBanks[0] ?? [], $trim['spriteBytes'], 'ChrUploadDataSprite', 'sprites usados de verdade, empacotado pelo NGC'));
            $out = array_merge($out, $emitTrimmed($bgBanks[0] ?? [], $trim['bgBytes'], 'ChrUploadDataBg', '$1000 background usado de verdade'));
            return implode("\n", $out);
        }
        if ((int)($mapperInfo['mapper'] ?? 0) === 3) {
            // Sempre emite os 4 (mesmo os que o projeto nao usa) - o linker
            // (CnromCfg.php) declara os 4 segmentos incondicionalmente, e o
            // header sempre anuncia 32KB de CHR (Camada 7: decisao de manter
            // o tamanho padrao/comum de CNROM, nao variar com quantos bancos
            // o projeto realmente usa). Faltando um deles, o ld65 so' avisa
            // (nao erra) mas deixa a mensagem de warning suja no log de build
            // a toa - melhor emitir os 4 sempre, zerados quando sobra banco.
            for ($bi = 0; $bi < 4; $bi++) {
                $bank = $banks[$bi] ?? null;
                $sp = $bank ? (int)($bank['spritePage'] ?? 0) : null;
                $bg = $bank ? (int)($bank['bgPage'] ?? 1) : null;
                $out[] = ".segment \"CHARS{$bi}\"";
                if ($bank) {
                    $out = array_merge($out, $emitBlock($spriteBanks[$bi] ?? [], "banco {$bi}: \$0000 sprites (pág {$sp})"));
                    $out = array_merge($out, $emitBlock($bgBanks[$bi] ?? [], "banco {$bi}: \$1000 background (pág {$bg})"));
                } else {
                    $out = array_merge($out, $emitBlock([], "banco {$bi}: nao usado pelo projeto"));
                    $out = array_merge($out, $emitBlock([], "banco {$bi}: nao usado pelo projeto"));
                }
            }
        } else {
            $out[] = '.segment "CHARS"';
            $out = array_merge($out, $emitBlock($spriteBanks[0] ?? [], 'pg0 sprites empacotado pelo NGC'));
            $out = array_merge($out, $emitBlock($bgBanks[0] ?? [], '$1000 background'));
        }

        return implode("\n", $out);
    },
];
