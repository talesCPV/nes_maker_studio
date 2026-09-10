<?php
declare(strict_types=1);

/**
 * Linker script CNROM (mapper 3): PRG-ROM continua fixa em 32KB @ $8000,
 * igual ao NROM (CNROM nao faz bankswitch de PRG) - so' o CHR muda: em vez
 * de 1 bloco fixo de 8KB, viram 4 bancos de 8KB (32KB CHR-ROM total), e o
 * jogo troca qual deles fica visivel em $0000-$1FFF escrevendo em qualquer
 * endereco $8000-$FFFF (ver ProjectParser::resolveMapperBanks() +
 * templates/gameflow.php pro codigo de troca em tempo de execucao).
 *
 * Sempre gera os 4 bancos (32KB CHR-ROM), mesmo que o projeto use menos
 * combinacoes - os nao usados ficam com $00 (nunca sao selecionados pelo
 * codigo de troca, entao e' so' espaco morto no cartucho, igual jogos
 * comerciais que nao preenchem os 4 bancos por completo).
 */
final class CnromCfg
{
    public static function generate(array $project = []): string
    {
        $name = preg_replace('/\s+/', '_', (string)($project['name'] ?? 'projeto')) ?: 'projeto';

        $lines = [
            '# cnrom.cfg gerado pelo NES Maker Studio (backend)',
            '# Projeto: ' . $name,
            '# Mapper: 3 (CNROM) | PRG 32KB @ $8000 (fixa) | CHR 32KB (4 bancos de 8KB, trocados via escrita em $8000-$FFFF)',
            '# Header PRG banks = 2 (32KB) | Header CHR banks = 4 (32KB)',
            'MEMORY {',
            '  ZP:     start = $0000, size = $0100, type = rw, define = yes;',
            '  RAM:    start = $0300, size = $0500, type = rw, define = yes;',
            '  HDR:    start = $0000, size = $0010, type = ro, file = %O, fill = yes;',
            '  PRG:    start = $8000, size = $8000, type = ro, file = %O, fill = yes, define = yes;',
            '  CHR0:   start = $0000, size = $2000, type = ro, file = %O, fill = yes;',
            '  CHR1:   start = $2000, size = $2000, type = ro, file = %O, fill = yes;',
            '  CHR2:   start = $4000, size = $2000, type = ro, file = %O, fill = yes;',
            '  CHR3:   start = $6000, size = $2000, type = ro, file = %O, fill = yes;',
            '}',
            'SEGMENTS {',
            '  HEADER:   load = HDR,  type = ro;',
            '  ZEROPAGE: load = ZP,   type = zp;',
            '  RAM:      load = RAM,  type = bss, optional = yes;',
            '  CODE:     load = PRG,  type = ro;',
            '  RODATA:   load = PRG,  type = ro, optional = yes;',
            '  VECTORS:  load = PRG,  type = ro, offset = $7FFA;',
            '  CHARS0:   load = CHR0, type = ro;',
            '  CHARS1:   load = CHR1, type = ro;',
            '  CHARS2:   load = CHR2, type = ro;',
            '  CHARS3:   load = CHR3, type = ro;',
            '}',
            '',
        ];

        return implode("\n", $lines);
    }
}
