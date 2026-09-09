<?php
declare(strict_types=1);

/**
 * POST backend/multicart/build-unrom.php
 *
 * Multicart para jogos UNROM (mapper 2).
 * NÃO altera build.php (NROM/AxROM).
 *
 * Estratégia (software, jogos sem patch manual):
 *  UNROM tem 16KB em $8000 (switch) e 16KB FIXOS em $C000 (último banco).
 *  Empacotamos cada banco switchable como uma janela AxROM de 32KB:
 *     [UNROM bank i | UNROM last 16KB]
 *  Assim $C000 continua sendo o last bank do jogo.
 *  O menu fica no banco AxROM 0. Os jogos escrevem 0..N — um thunk
 *  faz ADC #BASE para não pisar no menu (BASE = primeiro banco 32KB do jogo).
 *
 * Saída: mapper 7 AxROM + CHR-RAM (UNROM já é CHR-RAM).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/_tools.php';

function u_json(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function u_sanitize(string $name, int $max = 28): string
{
    $name = preg_replace('/[^\x20-\x7E]/', '', $name) ?? '';
    $name = trim($name);
    return substr($name === '' ? 'GAME' : $name, 0, $max);
}

function u_asm_string(string $s): string
{
    $parts = [];
    $len = strlen($s);
    for ($i = 0; $i < $len; $i++) {
        $parts[] = sprintf('$%02x', ord($s[$i]));
    }
    return $parts ? implode(',', $parts) : '$20';
}

function u_split16(string $prg): array
{
    $len = strlen($prg);
    if ($len % 16384 !== 0) {
        $prg = str_pad($prg, (int) ceil($len / 16384) * 16384, "\x00");
        $len = strlen($prg);
    }
    $out = [];
    for ($o = 0; $o < $len; $o += 16384) {
        $out[] = substr($prg, $o, 16384);
    }
    return $out;
}

/** Offset 0..16383 no last bank, ou -1. Evita vetores $FFFA-$FFFF. */
function u_find_hole(string $bank, int $need = 8): int
{
    $end = min(strlen($bank), 0x3FFA);
    $ranges = [
        [0x3E00, $end],
        [0x0000, min(0x3E00, $end)],
    ];
    foreach ($ranges as [$a, $b]) {
        for ($i = $a; $i + $need <= $b; $i++) {
            $ok = true;
            for ($j = 0; $j < $need; $j++) {
                $c = ord($bank[$i + $j]);
                if ($c !== 0x00 && $c !== 0xFF) {
                    $ok = false;
                    break;
                }
            }
            if ($ok) {
                return $i;
            }
        }
    }
    return -1;
}

/**
 * Troca STA $8xxx-$Fxxx (abs / abs,x / abs,y) por JSR thunk.
 * Só writes no espaço de cartucho — no UNROM isso é bankswitch.
 */
function u_patch_sta_rom(string $bank, int $thunkAddr, int $skipFrom = -1, int $skipTo = -1): array
{
    $n = strlen($bank);
    $lo = $thunkAddr & 0xFF;
    $hi = ($thunkAddr >> 8) & 0xFF;
    $jsr = chr(0x20) . chr($lo) . chr($hi);
    $count = 0;
    $i = 0;
    while ($i + 2 < $n) {
        if ($skipFrom >= 0 && $i >= $skipFrom && $i < $skipTo) {
            $i++;
            continue;
        }
        $op = ord($bank[$i]);
        if ($op === 0x8D || $op === 0x9D || $op === 0x99) {
            $target = ord($bank[$i + 1]) | (ord($bank[$i + 2]) << 8);
            if ($target >= 0x8000) {
                $bank = substr($bank, 0, $i) . $jsr . substr($bank, $i + 3);
                $count++;
                $i += 3;
                continue;
            }
        }
        $i++;
    }
    return [$bank, $count];
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    u_json(['ok' => false, 'error' => 'Use POST.'], 405);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);
if (!is_array($body)) {
    u_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

$gamesIn = $body['games'] ?? null;
if (!is_array($gamesIn) || count($gamesIn) < 1) {
    u_json(['ok' => false, 'error' => 'Envie ao menos 1 jogo UNROM.'], 400);
}
if (count($gamesIn) > 8) {
    u_json(['ok' => false, 'error' => 'Máximo 8 jogos UNROM neste cartucho.'], 400);
}

$title = 'RETROCOMPILER';
$log = [];
$names = [];
$windows = []; // each game: list of 32KB strings
$bases = [];   // first AxROM 32KB bank index
$resetLo = [];
$resetHi = [];
$axromIndex = 1; // 0 = menu

foreach ($gamesIn as $idx => $g) {
    if (!is_array($g) || empty($g['rom'])) {
        u_json(['ok' => false, 'error' => "Jogo #{$idx}: rom ausente."], 400);
    }
    $bin = base64_decode((string) $g['rom'], true);
    if ($bin === false) {
        u_json(['ok' => false, 'error' => "Jogo #{$idx}: base64 inválido."], 400);
    }
    try {
        $ines = multicart_parse_ines($bin);
    } catch (Throwable $e) {
        u_json(['ok' => false, 'error' => "Jogo #{$idx}: " . $e->getMessage()], 400);
    }
    if ($ines['mapper'] !== 2 && $ines['mapper'] !== 71) {
        u_json([
            'ok' => false,
            'error' => "Jogo #{$idx}: mapper {$ines['mapper']} — este endpoint é só UNROM (2) / Camerica (71).",
        ], 400);
    }
    $n16 = (int) $ines['prg_banks'];
    if ($n16 < 2 || $n16 > 32) {
        u_json(['ok' => false, 'error' => "Jogo #{$idx}: PRG UNROM deve ser 32–512KB."], 400);
    }
    if ($axromIndex + $n16 > 32) {
        u_json(['ok' => false, 'error' => 'PRG total excede 1MB (limite AxROM deste merge).'], 400);
    }

    $banks = u_split16($ines['prg']);
    $last = $banks[count($banks) - 1];
    $base = $axromIndex;
    $hole = u_find_hole($last, 8);
    if ($hole < 0) {
        u_json(['ok' => false, 'error' => "Jogo #{$idx}: sem espaço no last bank para o thunk de bankswitch."], 400);
    }
    $thunkAddr = 0xC000 + $hole;
    // clc; adc #BASE; sta $8000; rts
    $thunk = chr(0x18) . chr(0x69) . chr($base & 0xFF) . chr(0x8D) . chr(0x00) . chr(0x80) . chr(0x60);
    $last = substr($last, 0, $hole) . $thunk . substr($last, $hole + 7);

    $patchedTotal = 0;
    for ($bi = 0; $bi < count($banks); $bi++) {
        $b = ($bi === count($banks) - 1) ? $last : $banks[$bi];
        $skipFrom = ($bi === count($banks) - 1) ? $hole : -1;
        $skipTo = ($bi === count($banks) - 1) ? $hole + 7 : -1;
        [$b, $pc] = u_patch_sta_rom($b, $thunkAddr, $skipFrom, $skipTo);
        $patchedTotal += $pc;
        $banks[$bi] = $b;
    }
    $last = $banks[count($banks) - 1];

    $gameWindows = [];
    foreach ($banks as $sw) {
        $gameWindows[] = $sw . $last;
    }

    $rlo = ord($last[0x3FFC]);
    $rhi = ord($last[0x3FFD]);
    $names[] = u_sanitize((string) ($g['name'] ?? ('GAME' . ($idx + 1))));
    $windows[] = $gameWindows;
    $bases[] = $base;
    $resetLo[] = $rlo;
    $resetHi[] = $rhi;
    $axromIndex += count($banks);
    $log[] = sprintf(
        'OK %s mapper=%d 16KBx%d base32=%d thunk=$%04X sta_patch=%d reset=%02X%02X',
        $names[$idx],
        $ines['mapper'],
        count($banks),
        $base,
        $thunkAddr,
        $patchedTotal,
        $rhi,
        $rlo
    );
    if ($patchedTotal < 1) {
        $log[] = "AVISO {$names[$idx]}: nenhum STA $8000+ encontrado — bankswitch pode falhar.";
    }
}

$n = count($names);
$titleAsm = u_asm_string($title);
$nameLoAsm = implode(',', array_map(fn ($i) => '<name_' . $i, range(0, $n - 1)));
$nameHiAsm = implode(',', array_map(fn ($i) => '>name_' . $i, range(0, $n - 1)));
$rstLo = implode(',', array_map(fn ($v) => sprintf('$%02x', $v), $resetLo));
$rstHi = implode(',', array_map(fn ($v) => sprintf('$%02x', $v), $resetHi));
$prgBankAsm = implode(',', array_map(fn ($v) => sprintf('$%02x', $v & 0xFF), $bases));
$nameBytes = '';
for ($i = 0; $i < $n; $i++) {
    $nameBytes .= 'name_' . $i . ":\n  .byte " . u_asm_string($names[$i]) . ", 0\n";
}

$asm = <<<ASM
; Menu UNROM→AxROM — banco 0. Jogos em bancos 1+.
.segment "CODE"

ptr_lo = \$00
ptr_hi = \$01
sel    = \$02
count  = \$03
joy    = \$04
joy_old= \$05
tmp    = \$06
row    = \$07

reset:
  sei
  cld
  ldx #\$ff
  txs
  inx
  stx \$2000
  stx \$2001
  stx \$4010
wait1:
  bit \$2002
  bpl wait1
wait2:
  bit \$2002
  bpl wait2
  lda #0
  tax
clr:
  sta \$0000,x
  sta \$0100,x
  sta \$0200,x
  sta \$0300,x
  sta \$0400,x
  sta \$0500,x
  sta \$0600,x
  sta \$0700,x
  inx
  bne clr
  jsr upload_font
  lda #0
  sta sel
  lda #{$n}
  sta count
  jsr fill_bg
  jsr draw_all
main:
  jsr wait_vblank
  jsr read_joy
  jsr handle_input
  jmp main

nmi: rti
irq: rti

wait_vblank:
  bit \$2002
  bpl wait_vblank
  rts

read_joy:
  lda joy
  sta joy_old
  lda #1
  sta \$4016
  lda #0
  sta \$4016
  ldx #8
  lda #0
  sta joy
rj:
  lda \$4016
  and #1
  lsr a
  rol joy
  dex
  bne rj
  rts

handle_input:
  lda joy
  eor joy_old
  and joy
  sta tmp
  lda tmp
  and #4
  bne do_down
  lda tmp
  and #8
  bne do_up
  jmp check_start
do_down:
  lda count
  beq check_start
  inc sel
  lda sel
  cmp count
  bcc down_ok
  lda #0
  sta sel
down_ok:
  jsr update_cursor
  jmp check_start
do_up:
  lda count
  beq check_start
  lda sel
  bne up_dec
  lda count
  sec
  sbc #1
  sta sel
  jsr update_cursor
  jmp check_start
up_dec:
  dec sel
  jsr update_cursor
check_start:
  lda tmp
  and #144
  beq hi_rts
  jsr boot_game
hi_rts:
  rts

update_cursor:
  jsr wait_vblank
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

boot_game:
  sei
  lda #0
  sta \$2000
  sta \$2001
  bit \$2002
bv1:
  bit \$2002
  bpl bv1
bv2:
  bit \$2002
  bpl bv2
  ldx #0
ctr:
  lda tramp,x
  sta \$0300,x
  inx
  cpx #tramp_end-tramp
  bne ctr
  ldy sel
  lda game_prg_bank,y
  sta \$08
  lda game_reset_lo,y
  sta \$00
  lda game_reset_hi,y
  sta \$01
  jmp \$0300

tramp:
  sei
  ldx #\$ff
  txs
  lda \$08
  sta \$8000
  lda #0
  sta \$2005
  sta \$2005
  sta \$2000
  sta \$2001
  tax
  tay
  jmp (\$0000)
tramp_end:

fill_bg:
  lda #\$3f
  sta \$2006
  lda #0
  sta \$2006
  ldx #0
palloop:
  lda pal,x
  sta \$2007
  inx
  cpx #16
  bne palloop
  lda #\$20
  sta \$2006
  lda #0
  sta \$2006
  ldx #0
  lda #\$20
  ldy #4
nt:
  sta \$2007
  inx
  bne nt
  dey
  bne nt
  rts

draw_all:
  jsr wait_vblank
  lda #0
  sta \$2001
  sta \$2000
  lda #\$20
  sta \$2006
  lda #\$49
  sta \$2006
  ldx #0
tl:
  lda title_str,x
  beq tld
  sta \$2007
  inx
  bne tl
tld:
  lda #0
  sta row
item:
  lda row
  cmp count
  bcs items_done
  lda row
  clc
  adc #6
  sta tmp
  lda #\$20
  sta ptr_hi
  lda #4
  sta ptr_lo
  ldx tmp
addr_l:
  beq addr_ok
  lda ptr_lo
  clc
  adc #32
  sta ptr_lo
  lda ptr_hi
  adc #0
  sta ptr_hi
  dex
  jmp addr_l
addr_ok:
  lda ptr_hi
  sta \$2006
  lda ptr_lo
  sta \$2006
  lda #\$20
  sta \$2007
  ldx row
  lda name_ptrs_lo,x
  sta ptr_lo
  lda name_ptrs_hi,x
  sta ptr_hi
  ldy #0
ncpy:
  lda (ptr_lo),y
  beq ncdone
  sta \$2007
  iny
  cpy #28
  bne ncpy
ncdone:
  inc row
  jmp item
items_done:
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
  lda #0
  sta \$2005
  sta \$2005
  lda #%00011110
  sta \$2001
  lda #%10010000
  sta \$2000
  rts

upload_font:
  lda #0
  sta \$2006
  sta \$2006
  lda #<chr_blob
  sta ptr_lo
  lda #>chr_blob
  sta ptr_hi
  ldx #\$20
  ldy #0
uf:
  lda (ptr_lo),y
  sta \$2007
  iny
  bne uf
  inc ptr_hi
  dex
  bne uf
  rts

pal:
  .byte \$0f,\$30,\$10,\$00
  .byte \$0f,\$30,\$10,\$00
  .byte \$0f,\$30,\$10,\$00
  .byte \$0f,\$30,\$10,\$00
title_str:
  .byte {$titleAsm}, 0
name_ptrs_lo:
  .byte {$nameLoAsm}
name_ptrs_hi:
  .byte {$nameHiAsm}
game_reset_lo:
  .byte {$rstLo}
game_reset_hi:
  .byte {$rstHi}
game_prg_bank:
  .byte {$prgBankAsm}
{$nameBytes}
chr_blob:
  .incbin "novo.chr"
.segment "VECTORS"
  .word nmi
  .word reset
  .word irq
ASM;

$cfg = <<<CFG
MEMORY {
  ZP:     start = \$0000, size = \$0100, type = rw, define = yes;
  RAM:    start = \$0200, size = \$0600, type = rw, define = yes;
  PRG:    start = \$8000, size = \$8000, type = ro, file = %O, fill = yes, fillval = \$00;
}
SEGMENTS {
  ZEROPAGE: load = ZP,  type = zp, optional = yes;
  CODE:     load = PRG, type = ro;
  RODATA:   load = PRG, type = ro, optional = yes;
  VECTORS:  load = PRG, type = ro, start = \$FFFA;
}
CFG;

$ca65 = multicart_find_tool('ca65');
$ld65 = multicart_find_tool('ld65');
if ($ca65 === null || $ld65 === null) {
    u_json(['ok' => false, 'error' => 'ca65/ld65 não encontrados.', 'log' => implode("\n", $log)], 500);
}

$work = sys_get_temp_dir() . '/ngc_unrom_' . bin2hex(random_bytes(6));
if (!@mkdir($work, 0755, true) && !is_dir($work)) {
    u_json(['ok' => false, 'error' => 'Falha ao criar temp.'], 500);
}

try {
    file_put_contents($work . '/menu.asm', $asm);
    file_put_contents($work . '/menu.cfg', $cfg);

    $chrSrc = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'novo.chr';
    if (!is_file($chrSrc)) {
        $alt = realpath(__DIR__ . '/../../assets/novo.chr');
        if ($alt !== false) {
            $chrSrc = $alt;
        }
    }
    if (!is_file($chrSrc)) {
        u_json(['ok' => false, 'error' => 'assets/novo.chr não encontrado.', 'log' => implode("\n", $log)], 500);
    }
    $chrBin = file_get_contents($chrSrc);
    if ($chrBin === false || strlen($chrBin) < 8192) {
        u_json(['ok' => false, 'error' => 'novo.chr inválido (8KB).'], 500);
    }
    $chrBin = substr($chrBin, 0, 8192);
    $cursor = "\x00\x40\x60\x70\x78\x70\x60\x40\x00\x00\x00\x00\x00\x00\x00\x00";
    for ($ci = 0; $ci < 16; $ci++) {
        $chrBin[$ci] = $cursor[$ci];
    }
    file_put_contents($work . '/novo.chr', $chrBin);

    $r1 = multicart_run_cmd([$ca65, 'menu.asm', '-o', 'menu.o'], $work, 60);
    $log[] = '$ ' . $r1['cmd'];
    if (trim($r1['stderr'] ?? '')) {
        $log[] = $r1['stderr'];
    }
    if ($r1['code'] !== 0 || !is_file($work . '/menu.o')) {
        u_json(['ok' => false, 'error' => 'ca65 falhou no menu UNROM.', 'log' => implode("\n", $log)], 400);
    }
    $r2 = multicart_run_cmd([$ld65, '-C', 'menu.cfg', 'menu.o', '-o', 'menu.bin'], $work, 60);
    $log[] = '$ ' . $r2['cmd'];
    if (trim($r2['stderr'] ?? '')) {
        $log[] = $r2['stderr'];
    }
    if ($r2['code'] !== 0 || !is_file($work . '/menu.bin')) {
        u_json(['ok' => false, 'error' => 'ld65 falhou no menu UNROM.', 'log' => implode("\n", $log)], 400);
    }

    $menuBin = file_get_contents($work . '/menu.bin');
    if ($menuBin === false) {
        u_json(['ok' => false, 'error' => 'menu.bin ilegível.'], 500);
    }
    $menuBin = strlen($menuBin) < 32768 ? str_pad($menuBin, 32768, "\x00") : substr($menuBin, 0, 32768);

    $prgOut = $menuBin;
    foreach ($windows as $ws) {
        foreach ($ws as $w) {
            $prgOut .= $w;
        }
    }
    $bank32 = intdiv(strlen($prgOut), 32768);
    // potência de 2 em unidades de 16KB
    $inesPrg16 = $bank32 * 2;
    $p2 = 1;
    while ($p2 < $inesPrg16) {
        $p2 <<= 1;
    }
    $inesPrg16 = max(2, $p2);
    $need = $inesPrg16 * 16384;
    if (strlen($prgOut) < $need) {
        $prgOut = str_pad($prgOut, $need, "\x00");
    }

    $header = "NES\x1a" . chr($inesPrg16 & 0xFF) . chr(0) . chr(0x70) . chr(0x00) . str_repeat("\x00", 8);
    $out = $header . $prgOut;
    $log[] = "UNROM merge: {$n} jogo(s), AxROM mapper7, PRG {$inesPrg16}*16KB, menu@bank0";

    $savedPath = null;
    $userId = (int) ($_SESSION['user_id'] ?? 0);
    if ($userId > 0) {
        $dir = dirname(__DIR__, 3) . '/data/users/' . $userId . '/nes/multicarts';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $id = date('Ymd_His') . '_unrom_' . bin2hex(random_bytes(2));
        $path = $dir . '/' . $id . '.nes';
        if (@file_put_contents($path, $out) !== false) {
            $savedPath = 'data/users/' . $userId . '/nes/multicarts/' . $id . '.nes';
            $log[] = 'Salvo: ' . $savedPath;
        }
    }

    u_json([
        'ok' => true,
        'filename' => 'RETROCOMPILER_unrom_multicart.nes',
        'size' => strlen($out),
        'mapper' => 7,
        'games' => $names,
        'nes' => base64_encode($out),
        'saved_path' => $savedPath,
        'log' => implode("\n", $log),
        'note' => 'UNROM empacotado em AxROM (last bank duplicado + thunk). Voltar ao menu: Reset.',
    ]);
} finally {
    foreach (glob($work . '/*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($work);
}
