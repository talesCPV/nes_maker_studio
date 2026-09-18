<?php
declare(strict_types=1);

/**
 * Linker script UOROM etapa 1 (mapper 2, header+CHR-RAM só - ver decisão
 * de escopo no histórico do projeto): PRG-ROM continua 32KB fixos @ $8000,
 * exatamente como NROM - a etapa 2 (bankswitch de PRG de verdade, pra
 * ganhar ROM extra) ainda não foi implementada.
 *
 * A diferença real pra NROM é CHR: UOROM não tem chip de CHR-ROM, o board
 * usa CHR-RAM. Por isso NÃO existe memory area "CHR" aqui - os 8KB de tile
 * (sprites+background) viram dado comum dentro do PRG (.segment "RODATA",
 * ver chars_segments.php, label ChrUploadData) e são copiados pra CHR-RAM
 * via $2006/$2007 uma única vez no Reset (ver templates/system.php).
 */
final class UoromCfg
{
    public static function generate(array $project = []): string
    {
        $name = preg_replace('/\s+/', '_', (string)($project['name'] ?? 'projeto')) ?: 'projeto';

        $lines = [
            '# uorom.cfg gerado pelo NES Maker Studio (backend)',
            '# Projeto: ' . $name,
            '# Mapper: 2 (UOROM, etapa 1 - sem bankswitch de PRG ainda) | PRG 32KB @ $8000 (fixa) | CHR-RAM 8KB (sem chip CHR-ROM)',
            '# Header PRG banks = 2 (32KB) | Header CHR banks = 0 (CHR-RAM)',
            'MEMORY {',
            '  ZP:     start = $0000, size = $0100, type = rw, define = yes;',
            '  RAM:    start = $0300, size = $0500, type = rw, define = yes;',
            '  HDR:    start = $0000, size = $0010, type = ro, file = %O, fill = yes;',
            '  PRG:    start = $8000, size = $8000, type = ro, file = %O, fill = yes, define = yes;',
            '}',
            'SEGMENTS {',
            '  HEADER:   load = HDR, type = ro;',
            '  ZEROPAGE: load = ZP,  type = zp;',
            '  RAM:      load = RAM, type = bss, optional = yes;',
            '  CODE:     load = PRG, type = ro;',
            '  RODATA:   load = PRG, type = ro, optional = yes;',
            '  VECTORS:  load = PRG, type = ro, offset = $7FFA;',
            '}',
            '',
        ];

        return implode("\n", $lines);
    }
}
