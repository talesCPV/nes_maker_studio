<?php
declare(strict_types=1);

/**
 * Texto sobreposto (pós-compressão por metatile): a fonte não é mais
 * desenhada pelo usuário - vem pronta do asset sistemas/nes/assets/novo.chr
 * (página 0, tabela ASCII completa, índice de tile = código ASCII - já é
 * o layout que backgrounds.js/charToTileIndex('ascii') sempre assumiu).
 *
 * Dois modos (escolha do usuário em config.js, project.textFontMode):
 * - 'ascii': tabela completa (maiúsculas+minúsculas+símbolos), 96 tiles
 *   (ASCII 32-127), extraída direto e contígua.
 * - 'smb': só dígitos+maiúsculas+espaço (estilo Super Mario Bros 1), 37
 *   glifos extraídos das MESMAS posições ASCII (0-9 en 48-57, A-Z em
 *   65-90) e reempacotados num bloco compacto de 40 tiles (múltiplo de 4,
 *   pra encaixar limpo depois dos tiles de metatile) - índice 0-9=dígito,
 *   10-35=letra, 36=espaço, 37-39=sobra em branco.
 */
final class FontAsset
{
    private const ASCII_FIRST = 32;
    private const ASCII_LAST = 127; // inclusive
    private const TILE_BYTES = 16;

    /** @return array{tiles:int, bytes:int[], map: array<int,int>} */
    public static function load(string $mode): array
    {
        $path = dirname(__DIR__, 2) . '/assets/novo.chr';
        $data = @file_get_contents($path);
        if ($data === false) {
            throw new RuntimeException("Asset de fonte não encontrado: {$path}");
        }
        $page0 = substr($data, 0, 4096);
        $tileAt = static function (int $idx) use ($page0): array {
            $off = $idx * self::TILE_BYTES;
            $chunk = substr($page0, $off, self::TILE_BYTES);
            $bytes = array_values(unpack('C*', str_pad($chunk, self::TILE_BYTES, "\0")));
            return $bytes;
        };

        if ($mode === 'smb') {
            $tiles = [];
            $map = []; // codigo ASCII -> indice no bloco compacto
            for ($d = 0; $d <= 9; $d++) { $tiles[] = $tileAt(48 + $d); $map[48 + $d] = $d; }
            for ($l = 0; $l < 26; $l++) { $tiles[] = $tileAt(65 + $l); $map[65 + $l] = 10 + $l; }
            $tiles[] = $tileAt(32); $map[32] = 36; // espaço
            while (count($tiles) % 4 !== 0) $tiles[] = array_fill(0, self::TILE_BYTES, 0);
            $bytes = [];
            foreach ($tiles as $t) $bytes = array_merge($bytes, $t);
            return ['tiles' => count($tiles), 'bytes' => $bytes, 'map' => $map];
        }

        // 'ascii' (padrão): bloco contíguo 32..127, indice = codigo-32
        $tiles = [];
        $map = [];
        for ($c = self::ASCII_FIRST; $c <= self::ASCII_LAST; $c++) {
            $tiles[] = $tileAt($c);
            $map[$c] = $c - self::ASCII_FIRST;
        }
        $bytes = [];
        foreach ($tiles as $t) $bytes = array_merge($bytes, $t);
        return ['tiles' => count($tiles), 'bytes' => $bytes, 'map' => $map];
    }

    /** Só o mapa caractere->índice relativo (sem ler novo.chr - layout puro).
     * Item fonte-no-CHR: usada pelo build agora, já que os PIXELS vêm de
     * project.chr (carimbados pelo editor), não mais lidos aqui. load()
     * continua existindo pro editor buscar os bytes originais na hora de
     * carimbar/restaurar (ver chr-editor.js).
     * @return array<int,int> */
    public static function charMap(string $mode): array
    {
        if ($mode === 'smb') {
            $map = [];
            for ($d = 0; $d <= 9; $d++) $map[48 + $d] = $d;
            for ($l = 0; $l < 26; $l++) $map[65 + $l] = 10 + $l;
            $map[32] = 36;
            return $map;
        }
        $map = [];
        for ($c = self::ASCII_FIRST; $c <= self::ASCII_LAST; $c++) $map[$c] = $c - self::ASCII_FIRST;
        return $map;
    }

    /** Código ASCII -> índice de tile relativo (dentro do próprio bloco de fonte), ou null se não suportado. */
    public static function mapChar(string $ch, array $map): ?int
    {
        $code = ord($ch);
        return $map[$code] ?? null;
    }
}
