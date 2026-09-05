<?php
declare(strict_types=1);

/**
 * POST backend/multicart/build-mmc3.php
 * Multicart MMC3 (mapper 4). Menu no banco FIXO $E000-$FFFF (8KB).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/_tools.php';

function mc3_json(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function mc3_sanitize(string $name, int $max = 28): string
{
    $name = preg_replace('/[^\x20-\x7E]/', '', $name) ?? '';
    $name = trim($name);
    return substr($name === '' ? 'GAME' : $name, 0, $max);
}

function mc3_asm_string(string $s): string
{
    $parts = [];
    for ($i = 0, $n = strlen($s); $i < $n; $i++) {
        $parts[] = sprintf('$%02x', ord($s[$i]));
    }
    return $parts ? implode(',', $parts) : '$20';
}

function mc3_prg_32k(string $prg): string
{
    $len = strlen($prg);
    if ($len === 32768) {
        return $prg;
    }
    if ($len === 16384) {
        return $prg . $prg;
    }
    if ($len < 32768) {
        return str_pad($prg, 32768, "\x00");
    }
    return substr($prg, 0, 32768);
}

function mc3_pow2_16k_banks(int $banks16): int
{
    $p = 1;
    while ($p < $banks16) {
        $p <<= 1;
    }
    return max(2, $p);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    mc3_json(['ok' => false, 'error' => 'Use POST.'], 405);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);
if (!is_array($body)) {
    mc3_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

$gamesIn = $body['games'] ?? null;
if (!is_array($gamesIn) || count($gamesIn) < 1) {
    mc3_json(['ok' => false, 'error' => 'Envie ao menos 1 jogo.'], 400);
}
if (count($gamesIn) > 12) {
    mc3_json(['ok' => false, 'error' => 'Máximo 12 jogos.'], 400);
}

$title = 'RETROCOMPILER';
$log = [];
$names = [];
$prgs = [];
$chrs = [];
$resetLo = [];
$resetHi = [];
$prgBank0 = [];
$chrPages = [];
$prg8kBank = 0;
$chr1kPage = 8; // 0-7 = fonte do menu (8KB)

foreach ($gamesIn as $idx => $g) {
    if (!is_array($g) || empty($g['rom'])) {
        mc3_json(['ok' => false, 'error' => "Jogo #{$idx}: rom ausente."], 400);
    }
    $bin = base64_decode((string)$g['rom'], true);
    if ($bin === false) {
        mc3_json(['ok' => false, 'error' => "Jogo #{$idx}: base64 inválido."], 400);
    }
    try {
        $ines = multicart_parse_ines($bin);
    } catch (Throwable $e) {
        mc3_json(['ok' => false, 'error' => "Jogo #{$idx}: " . $e->getMessage()], 400);
    }
    if (!in_array($ines['mapper'], [0, 3, 4], true)) {
        mc3_json(['ok' => false, 'error' => "Jogo #{$idx}: mapper {$ines['mapper']} não suportado neste endpoint."], 400);
    }
    $prg32 = mc3_prg_32k($ines['prg']);
    $rlo = ord($prg32[0x7FFC]);
    $rhi = ord($prg32[0x7FFD]);
    $chr = $ines['chr'];
    if (strlen($chr) < 8192) {
        $chr = str_pad($chr, 8192, "\x00");
    }
    $pad = (8192 - (strlen($chr) % 8192)) % 8192;
    if ($pad) {
        $chr .= str_repeat("\x00", $pad);
    }

    $prgs[] = $prg32;
    $chrs[] = $chr;
    $names[] = mc3_sanitize((string)($g['name'] ?? ('GAME' . ($idx + 1))));
    $resetLo[] = $rlo;
    $resetHi[] = $rhi;
    $prgBank0[] = $prg8kBank;
    $chrPages[] = $chr1kPage;
    $prg8kBank += 4;
    $chr1kPage += intdiv(strlen($chr), 1024);
    $log[] = "OK {$names[$idx]} m={$ines['mapper']} prg8={$prgBank0[$idx]} chr1k={$chrPages[$idx]}";
}

$n = count($names);
// 1 banco de 8KB = menu no FINAL (fixo em $E000 no MMC3)
$menuBanks8k = 1;
$totalPrg8k = $prg8kBank + $menuBanks8k;
$inesPrg16 = mc3_pow2_16k_banks(intdiv($totalPrg8k + 1, 2));
$totalChr1k = max(8, $chr1kPage);
$inesChr8 = intdiv($totalChr1k + 7, 8);

$titleAsm = mc3_asm_string($title);
$nameLo = implode(',', array_map(fn($i) => '<n' . $i, range(0, $n - 1)));
$nameHi = implode(',', array_map(fn($i) => '>n' . $i, range(0, $n - 1)));
$rstLo = implode(',', array_map(fn($v) => sprintf('$%02x', $v), $resetLo));
$rstHi = implode(',', array_map(fn($v) => sprintf('$%02x', $v), $resetHi));
$pbase = implode(',', array_map(fn($v) => sprintf('$%02x', $v & 0xFF), $prgBank0));
$cbase = implode(',', array_map(fn($v) => sprintf('$%02x', $v & 0xFF), $chrPages));
$nameBytes = '';
for ($i = 0; $i < $n; $i++) {
    $nameBytes .= 'n' . $i . ":\n  .byte " . mc3_asm_string($names[$i]) . ",0\n";
}

$asm = <<<ASM
.segment "CODE"
sel=\$10
count=\$11
joy=\$12
joy_old=\$13
tmp=\$14
row=\$15
plo=\$16
phi=\$17

reset:
  sei
  cld
  ldx #\$ff
  txs
  inx
  stx \$2000
  stx \$2001
  stx \$4010
  bit \$2002
w1: bit \$2002
  bpl w1
w2: bit \$2002
  bpl w2
  lda #0
  sta \$e000
  sta \$e001
  sta \$c000
  sta \$c001
  sta \$a001
  sta \$a000
  ; CHR modo 0: coloca pag1 do novo.chr (ASCII, 1KB banks 4-7) em \$0000-\$0FFF
  ; R0/R1 são bancos de 2KB (valor em unidades de 1KB, deve ser PAR)
  lda #0
  sta \$8000
  lda #4
  sta \$8001
  lda #1
  sta \$8000
  lda #6
  sta \$8001
  lda #2
  sta \$8000
  lda #4
  sta \$8001
  lda #3
  sta \$8000
  lda #5
  sta \$8001
  lda #4
  sta \$8000
  lda #6
  sta \$8001
  lda #5
  sta \$8000
  lda #7
  sta \$8001
  ; PRG switchavel (placeholder)
  lda #6
  sta \$8000
  lda #0
  sta \$8001
  lda #7
  sta \$8000
  lda #1
  sta \$8001
  lda #0
  tax
cl: sta \$0000,x
  sta \$0100,x
  sta \$0200,x
  inx
  bne cl
  lda #0
  sta sel
  lda #{$n}
  sta count
  jsr fill
  jsr draw
main:
  jsr vb
  jsr rjoy
  jsr input
  jmp main
nmi: rti
irq: rti
vb: bit \$2002
  bpl vb
  rts
rjoy:
  lda joy
  sta joy_old
  lda #1
  sta \$4016
  lsr a
  sta \$4016
  ldx #8
  lda #0
  sta joy
rj: lda \$4016
  and #1
  lsr a
  rol joy
  dex
  bne rj
  rts
input:
  lda joy
  eor joy_old
  and joy
  sta tmp
  and #4
  beq n_dn
  inc sel
  lda sel
  cmp count
  bcc d1
  lda #0
  sta sel
d1: jsr cursor
n_dn:
  lda tmp
  and #8
  beq n_up
  lda sel
  bne u1
  lda count
  beq n_up
  sec
  sbc #1
  sta sel
  jsr cursor
  jmp n_up
u1: dec sel
  jsr cursor
n_up:
  lda tmp
  and #144
  beq irts
  jsr boot
irts: rts
cursor:
  jsr vb
  lda sel
  asl a
  asl a
  asl a
  clc
  adc #47
  sta \$0200
  lda #0
  sta \$0201
  sta \$0202
  lda #24
  sta \$0203
  lda #\$ff
  sta \$0204
  lda #0
  sta \$2003
  lda #\$02
  sta \$4014
  rts
boot:
  sei
  lda #0
  sta \$2000
  sta \$2001
  jsr vb
  ldy sel
  lda cbase,y
  lsr a
  sta tmp
  lda #0
  sta \$8000
  lda tmp
  sta \$8001
  lda #1
  sta \$8000
  lda tmp
  clc
  adc #2
  sta \$8001
  lda #2
  sta \$8000
  lda tmp
  clc
  adc #4
  sta \$8001
  lda #3
  sta \$8000
  lda tmp
  clc
  adc #5
  sta \$8001
  lda #4
  sta \$8000
  lda tmp
  clc
  adc #6
  sta \$8001
  lda #5
  sta \$8000
  lda tmp
  clc
  adc #7
  sta \$8001
  lda #6
  sta \$8000
  lda pbase,y
  sta \$8001
  lda #7
  sta \$8000
  lda pbase,y
  clc
  adc #1
  sta \$8001
  lda rlo,y
  sta \$00
  lda rhi,y
  sta \$01
  cmp #\$e0
  bcc go
  lda #0
  sta \$00
  lda #\$80
  sta \$01
go:
  ldx #\$ff
  txs
  lda #0
  tax
  tay
  jmp (\$0000)
fill:
  lda #\$3f
  sta \$2006
  lda #0
  sta \$2006
  ldx #0
fp: lda pal,x
  sta \$2007
  inx
  cpx #16
  bne fp
  lda #\$20
  sta \$2006
  lda #0
  sta \$2006
  ldx #0
  lda #\$20
  ldy #4
fn: sta \$2007
  inx
  bne fn
  dey
  bne fn
  rts
draw:
  jsr vb
  lda #0
  sta \$2001
  sta \$2000
  lda #\$20
  sta \$2006
  lda #\$42
  sta \$2006
  ldx #0
dt: lda title,x
  beq de
  sta \$2007
  inx
  bne dt
de:
  lda #0
  sta row
di: lda row
  cmp count
  bcs dd
  lda row
  clc
  adc #6
  sta tmp
  lda #\$20
  sta phi
  lda #2
  sta plo
  ldx tmp
da: beq db
  lda plo
  clc
  adc #32
  sta plo
  lda phi
  adc #0
  sta phi
  dex
  jmp da
db: lda phi
  sta \$2006
  lda plo
  sta \$2006
  ldx row
  lda nlo,x
  sta plo
  lda nhi,x
  sta phi
  ldy #0
dc: lda (plo),y
  beq df
  sta \$2007
  iny
  cpy #28
  bne dc
df: inc row
  jmp di
dd: jsr cursor
  lda #0
  sta \$2005
  sta \$2005
  lda #%00011110
  sta \$2001
  lda #%00001000
  sta \$2000
  rts
pal:
  .byte \$0f,\$30,\$10,\$00
  .byte \$0f,\$30,\$10,\$00
  .byte \$0f,\$30,\$10,\$00
  .byte \$0f,\$30,\$10,\$00
title:
  .byte {$titleAsm},0
nlo:
  .byte {$nameLo}
nhi:
  .byte {$nameHi}
rlo:
  .byte {$rstLo}
rhi:
  .byte {$rstHi}
pbase:
  .byte {$pbase}
cbase:
  .byte {$cbase}
{$nameBytes}
.segment "VECTORS"
  .word nmi
  .word reset
  .word irq
ASM;

$cfg = <<<CFG
MEMORY {
  ZP: start = \$0000, size = \$0100, type = rw;
  RAM: start = \$0200, size = \$0600, type = rw;
  PRG: start = \$E000, size = \$2000, type = ro, file = %O, fill = yes, fillval = \$00;
}
SEGMENTS {
  CODE: load = PRG, type = ro;
  VECTORS: load = PRG, type = ro, start = \$FFFA;
}
CFG;

$ca65 = multicart_find_tool('ca65');
$ld65 = multicart_find_tool('ld65');
if ($ca65 === null || $ld65 === null) {
    mc3_json(['ok' => false, 'error' => 'ca65/ld65 não encontrados.', 'log' => implode("\n", $log)], 500);
}

$work = sys_get_temp_dir() . '/ngc_mc3_' . bin2hex(random_bytes(6));
if (!@mkdir($work, 0755, true) && !is_dir($work)) {
    mc3_json(['ok' => false, 'error' => 'Falha temp.'], 500);
}

try {
    file_put_contents($work . '/menu.asm', $asm);
    file_put_contents($work . '/menu.cfg', $cfg);

    $r1 = multicart_run_cmd([$ca65, 'menu.asm', '-o', 'menu.o'], $work, 60);
    $log[] = '$ ' . $r1['cmd'];
    if (trim($r1['stderr'] ?? '')) {
        $log[] = $r1['stderr'];
    }
    if ($r1['code'] !== 0 || !is_file($work . '/menu.o')) {
        mc3_json(['ok' => false, 'error' => 'ca65 falhou (menu MMC3).', 'log' => implode("\n", $log)], 400);
    }
    $r2 = multicart_run_cmd([$ld65, '-C', 'menu.cfg', 'menu.o', '-o', 'menu.bin'], $work, 60);
    $log[] = '$ ' . $r2['cmd'];
    if (trim($r2['stderr'] ?? '')) {
        $log[] = $r2['stderr'];
    }
    if ($r2['code'] !== 0 || !is_file($work . '/menu.bin')) {
        mc3_json(['ok' => false, 'error' => 'ld65 falhou (menu MMC3).', 'log' => implode("\n", $log)], 400);
    }

    $menuBin = file_get_contents($work . '/menu.bin');
    if ($menuBin === false) {
        mc3_json(['ok' => false, 'error' => 'menu.bin ilegível.'], 500);
    }
    if (strlen($menuBin) < 8192) {
        $menuBin = str_pad($menuBin, 8192, "\x00");
    } else {
        $menuBin = substr($menuBin, 0, 8192);
    }

    $prgOut = '';
    foreach ($prgs as $p) {
        $prgOut .= $p;
    }
    $prgOut .= $menuBin;
    $need = $inesPrg16 * 16384;
    if (strlen($prgOut) < $need) {
        $prgOut .= str_repeat("\x00", $need - strlen($prgOut));
    } else {
        // garantir menu nos últimos 8KB
        $prgOut = substr($prgOut, 0, $need - 8192) . $menuBin;
        if (strlen($prgOut) < $need) {
            $prgOut = str_pad($prgOut, $need, "\x00");
        }
    }
    // força menu nos últimos 8KB
    $prgOut = substr($prgOut, 0, $need - 8192) . $menuBin;

    // Fonte do menu (novo.chr) nos primeiros 8KB de CHR-ROM
    $candidates = [
        dirname(__DIR__, 2) . '/assets/novo.chr',
        dirname(__DIR__, 1) . '/../assets/novo.chr',
        ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/assets/novo.chr',
        ($_SERVER['DOCUMENT_ROOT'] ?? '') . '/NES/assets/novo.chr',
        __DIR__ . '/../../assets/novo.chr',
    ];
    $chrSrc = '';
    foreach ($candidates as $c) {
        $c = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $c);
        if ($c && is_file($c)) { $chrSrc = $c; break; }
        $r = realpath($c);
        if ($r && is_file($r)) { $chrSrc = $r; break; }
    }
    $font = is_file($chrSrc) ? file_get_contents($chrSrc) : false;
    if ($font === false || strlen($font) < 8192) {
        $log[] = 'AVISO: novo.chr ausente — menu sem fonte ASCII';
        $font = str_repeat("\x00", 8192);
    } else {
        $font = substr($font, 0, 8192);
        // cursor seta no tile 0
        $cursor = "\x00\x40\x60\x70\x78\x70\x60\x40\x00\x00\x00\x00\x00\x00\x00\x00";
        for ($ci = 0; $ci < 16; $ci++) {
            $font[$ci] = $cursor[$ci];
        }
        $log[] = 'CHR menu font: ' . $chrSrc;
    }
    $chrOut = $font;
    foreach ($chrs as $c) {
        $chrOut .= $c;
    }
    $chrNeed = $inesChr8 * 8192;
    if (strlen($chrOut) < $chrNeed) {
        $chrOut = str_pad($chrOut, $chrNeed, "\x00");
    } else {
        $chrOut = substr($chrOut, 0, $chrNeed);
    }

    $header = "NES\x1a" . chr($inesPrg16 & 0xFF) . chr($inesChr8 & 0xFF) . chr(0x40) . chr(0x00) . str_repeat("\x00", 8);
    $out = $header . $prgOut . $chrOut;
    $log[] = "MMC3: {$n} jogos, PRG {$inesPrg16}*16KB (pow2), CHR {$inesChr8}*8KB, menu@last8K";

    $savedPath = null;
    $uid = (int)($_SESSION['user_id'] ?? 0);
    if ($uid > 0) {
        $dir = dirname(__DIR__, 2) . '/data/users/' . $uid . '/multicarts';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $id = date('Ymd_His') . '_mmc3_' . bin2hex(random_bytes(2));
        if (@file_put_contents($dir . '/' . $id . '.nes', $out) !== false) {
            $savedPath = 'data/users/' . $uid . '/multicarts/' . $id . '.nes';
        }
    }

    mc3_json([
        'ok' => true,
        'filename' => 'RETROCOMPILER_mmc3_multicart.nes',
        'size' => strlen($out),
        'mapper' => 4,
        'games' => $names,
        'nes' => base64_encode($out),
        'saved_path' => $savedPath,
        'log' => implode("\n", $log),
        'note' => 'Menu no banco fixo \$E000. CNROM com bankswitch em \$8000 ainda pode falhar nos jogos.',
    ]);
} finally {
    foreach (glob($work . '/*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($work);
}
