<?php
declare(strict_types=1);

require_once __DIR__ . '/ProjectParser.php';

/**
 * Linker script UOROM etapa 2 (mapper 2, bankswitch de PRG de verdade):
 * BANCO = FASE, mesma unidade que o CnromCfg usa pra CHR - só que aqui é
 * PRG (código+dado), não CHR (CHR-RAM continua fixa e única desde a etapa
 * 1, nunca troca).
 *
 * Layout: PRG_FIXED (16KB @ $C000, sempre mapeado - motor de regras, NMI,
 * loop principal, SFX, tabelas genéricas do motor) + N x PRG_BANK<i> (16KB
 * cada, comutável em $8000-$BFFF, 1 por fase COM conteúdo próprio - telas
 * (nametable+colisão) e música daquela fase). Fase sem tela/música própria
 * não gasta banco (ver ProjectParser::resolveUoromPrgBanks()).
 *
 * Convenção de hardware UxROM: o banco FIXO é sempre o ÚLTIMO da ROM
 * física (não o primeiro) - por isso PRG_FIXED vem DEPOIS de todos os
 * PRG_BANK<i> na ordem de MEMORY/arquivo abaixo, apesar de "fixo" soar
 * como se devesse vir primeiro.
 *
 * Sem fase com conteúdo próprio ainda (projeto novo/sem fases usadas) →
 * cai num único PRG_BANK0 comutável + PRG_FIXED, igual etapa 1 mas já na
 * forma bankável (ROM sempre múltipla de 16KB+16KB, nunca "32KB fixos"
 * como na etapa 1 - trocar de projeto sem fase pra com fase não muda o
 * formato do header, só o conteúdo).
 */
final class UoromCfg
{
    public static function generate(array $project = []): string
    {
        $name = preg_replace('/\s+/', '_', (string)($project['name'] ?? 'projeto')) ?: 'projeto';

        $prgBanks = (new ProjectParser())->getUoromPrgBanks($project);
        $bankCount = max(1, count($prgBanks)); // pelo menos 1 banco comutavel, mesmo vazio

        $lines = [
            '# uorom.cfg gerado pelo NES Maker Studio (backend)',
            '# Projeto: ' . $name,
            '# Mapper: 2 (UOROM etapa 2 - bankswitch de PRG por FASE)',
            '# Banco fixo: 16KB @ $C000 (sempre mapeado) | Bancos comutaveis: ' . $bankCount . ' x 16KB @ $8000-$BFFF',
            '# Header PRG banks = ' . ($bankCount + 1) . ' (' . (($bankCount + 1) * 16) . 'KB) | Header CHR banks = 0 (CHR-RAM)',
        ];
        foreach ($prgBanks as $i => $b) {
            $lines[] = '#   banco ' . $i . ' = fase "' . $b['phaseName'] . '"';
        }
        $lines[] = '';
        $lines[] = 'MEMORY {';
        $lines[] = '  ZP:        start = $0000, size = $0100, type = rw, define = yes;';
        $lines[] = '  RAM:       start = $0300, size = $0500, type = rw, define = yes;';
        $lines[] = '  HDR:       start = $0000, size = $0010, type = ro, file = %O, fill = yes;';
        for ($i = 0; $i < $bankCount; $i++) {
            $lines[] = "  PRG_BANK{$i}: start = \$8000, size = \$4000, type = ro, file = %O, fill = yes;";
        }
        // banco fixo por ultimo no arquivo (convencao UxROM: fixo = ultimo banco fisico da ROM)
        $lines[] = '  PRG_FIXED: start = $C000, size = $4000, type = ro, file = %O, fill = yes, define = yes;';
        $lines[] = '}';
        $lines[] = 'SEGMENTS {';
        $lines[] = '  HEADER:   load = HDR,       type = ro;';
        $lines[] = '  ZEROPAGE: load = ZP,        type = zp;';
        $lines[] = '  RAM:      load = RAM,       type = bss, optional = yes;';
        $lines[] = '  CODE:     load = PRG_FIXED, type = ro;';
        $lines[] = '  RODATA:   load = PRG_FIXED, type = ro, optional = yes;';
        $lines[] = '  VECTORS:  load = PRG_FIXED, type = ro, offset = $3FFA;';
        for ($i = 0; $i < $bankCount; $i++) {
            $lines[] = "  BANK{$i}:    load = PRG_BANK{$i}, type = ro, optional = yes;";
        }
        $lines[] = '}';
        $lines[] = '';

        return implode("\n", $lines);
    }
}
