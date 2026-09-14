<?php
/**
 * NGC Stage 19 - PaletteData (8 paletas de 4 cores + cor de fundo universal)
 * calculada pelo backend. Espelha o cálculo de paletteBytes/computeBackdropColor
 * de js/modules/build-rom.js e js/render-utils.js.
 *
 * Camada 6 (acao "Trocar Paleta"): junto tambem vai o BANCO INTEIRO de
 * paletas (project.paletteBank, nao so as 8 ativas nos slots da PPU) - cada
 * entrada vira um label PaletteBank_<indice> de 4 bytes, enderecavel pela
 * acao em tempo de compilacao (ver ProgramCompiler::compileApplyPalette).
 * So e' emitido se paletteSwapEnabled (alguma regra usa a acao) - ver
 * ProjectParser::parse().
 */
return [
    'palette_data' => static function(array $ctx): string {
        $bytes = is_array($ctx['palette'] ?? null) ? $ctx['palette'] : [];
        if (count($bytes) < 32) $bytes = array_pad($bytes, 32, 0);
        $lines = ['PaletteData:'];
        for ($i = 0; $i < 32; $i += 16) {
            $slice = array_slice($bytes, $i, 16);
            $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), $slice));
        }
        $lines[] = '';

        if (!empty($ctx['paletteSwapEnabled'])) {
            $lines[] = '; Camada 6: tabela de bits (bit 1<<X) usada pela NMI pra testar';
            $lines[] = '; qual(is) slot(s) 0-7 tem troca de paleta pendente, sem instrucao';
            $lines[] = '; nativa de "testar bit N de um byte" no 6502.';
            $lines[] = 'pal_bit_table:';
            $lines[] = '  .byte $01, $02, $04, $08, $10, $20, $40, $80';
            $lines[] = '';

            $bankBytes = is_array($ctx['paletteBankBytes'] ?? null) ? $ctx['paletteBankBytes'] : [];
            $count = intdiv(count($bankBytes), 4);
            for ($i = 0; $i < $count; $i++) {
                $slice = array_slice($bankBytes, $i * 4, 4);
                $lines[] = "PaletteBank_{$i}:";
                $lines[] = '  .byte ' . implode(', ', array_map(static fn($b) => sprintf('$%02X', ((int)$b) & 0xFF), $slice));
            }
            $lines[] = '';
        }

        return implode("\n", $lines);
    },
];
