<?php
declare(strict_types=1);

/**
 * Linker script NROM-256 (32KB PRG @ $8000, 8KB CHR).
 * Mesmo conteúdo que o antigo generateCFG() do build-rom.js.
 */
final class NromCfg
{
    public static function generate(array $project = []): string
    {
        $name = preg_replace('/\s+/', '_', (string)($project['name'] ?? 'projeto')) ?: 'projeto';
        $mapper = isset($project['mapper']) ? (int)$project['mapper'] : 0;

        $lines = [
            '# nrom.cfg gerado pelo NES Maker Studio (backend)',
            '# Projeto: ' . $name,
            '# Mapper: ' . $mapper . ' (NROM) | PRG 32KB @ $8000 | CHR 8KB',
            '# Header PRG banks = 2 (NROM-256)',
            'MEMORY {',
            '  ZP:     start = $0000, size = $0100, type = rw, define = yes;',
            '  RAM:    start = $0300, size = $0500, type = rw, define = yes;',
            '  HDR:    start = $0000, size = $0010, type = ro, file = %O, fill = yes;',
            '  PRG:    start = $8000, size = $8000, type = ro, file = %O, fill = yes, define = yes;',
            '  CHR:    start = $0000, size = $2000, type = ro, file = %O, fill = yes;',
            '}',
            'SEGMENTS {',
            '  HEADER:   load = HDR, type = ro;',
            '  ZEROPAGE: load = ZP,  type = zp;',
            '  RAM:      load = RAM, type = bss, optional = yes;',
            '  CODE:     load = PRG, type = ro;',
            '  RODATA:   load = PRG, type = ro, optional = yes;',
            '  VECTORS:  load = PRG, type = ro, offset = $7FFA;',
            '  CHARS:    load = CHR, type = ro;',
            '}',
            '',
        ];

        return implode("\n", $lines);
    }
}
