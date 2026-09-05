<?php
declare(strict_types=1);

/**
 * POST backend/multicart/build.php
 * Multicart AxROM (mapper 7) + menu (novo.chr) + CHR por jogo.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/_tools.php';

function mc_json(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function mc_sanitize_name(string $name, int $max = 28): string
{
    $name = preg_replace('/[^\x20-\x7E]/', '', $name) ?? '';
    $name = trim($name);
    if ($name === '') {
        $name = 'GAME';
    }
    return substr($name, 0, $max);
}

function mc_asm_string(string $s): string
{
    $parts = [];
    $len = strlen($s);
    for ($i = 0; $i < $len; $i++) {
        $parts[] = sprintf('$%02x', ord($s[$i]));
    }
    return $parts ? implode(',', $parts) : '$20';
}

function mc_prg_32k(string $prg): string
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

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    mc_json(['ok' => false, 'error' => 'Use POST.'], 405);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);
if (!is_array($body)) {
    mc_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

$gamesIn = $body['games'] ?? null;
if (!is_array($gamesIn) || count($gamesIn) < 1) {
    mc_json(['ok' => false, 'error' => 'Envie ao menos 1 jogo em games[].'], 400);
}
if (count($gamesIn) > 15) {
    mc_json(['ok' => false, 'error' => 'Máximo de 15 jogos por multicart (v1).'], 400);
}

$title = 'RETROCOMPILER';
$log = [];
$names = [];
$prgs = [];
$chrs = [];
$resetLo = [];
$resetHi = [];

foreach ($gamesIn as $idx => $g) {
    if (!is_array($g) || empty($g['rom'])) {
        mc_json(['ok' => false, 'error' => "Jogo #{$idx}: rom base64 ausente."], 400);
    }
    $bin = base64_decode((string)$g['rom'], true);
    if ($bin === false) {
        mc_json(['ok' => false, 'error' => "Jogo #{$idx}: base64 inválido."], 400);
    }
    try {
        $ines = multicart_parse_ines($bin);
    } catch (Throwable $e) {
        mc_json(['ok' => false, 'error' => "Jogo #{$idx}: " . $e->getMessage()], 400);
    }
    // 0=NROM, 3=CNROM (1 banco CHR), 7=AxROM — saída sempre AxROM + CHR-RAM
    if ($ines['mapper'] !== 0 && $ines['mapper'] !== 3 && $ines['mapper'] !== 7) {
        mc_json([
            'ok' => false,
            'error' => "Jogo #{$idx}: mapper {$ines['mapper']} incompatível com o multicart AxROM. Use NROM (0), CNROM de 1 banco CHR (3) ou AxROM (7). Jogos MMC1/MMC3/VRC/UNROM não rodam neste cartucho.",
        ], 400);
    }
    if ($ines['mapper'] === 3 && (int)$ines['chr_banks'] > 1) {
        mc_json([
            'ok' => false,
            'error' => "Jogo #{$idx}: CNROM com {$ines['chr_banks']} bancos CHR. O multicart usa CHR-RAM (só 8KB); jogos que trocam banco de gráficos (ex.: Tiger-Heli) não funcionam. Use CNROM de 8KB ou NROM.",
        ], 400);
    }
    if ($ines['prg_banks'] < 1 || $ines['prg_banks'] > 2) {
        mc_json(['ok' => false, 'error' => "Jogo #{$idx}: PRG deve ser 16KB ou 32KB."], 400);
    }
    $prg32 = mc_prg_32k($ines['prg']);
    $resetLo[] = ord($prg32[0x7FFC]);
    $resetHi[] = ord($prg32[0x7FFD]);
    $prgs[] = $prg32;
    $chrRaw = $ines['chr'];
    $chrBanks = max(1, (int)$ines['chr_banks']);
    // Boot carrega o primeiro banco de 8KB na CHR-RAM (CNROM com bankswitch em runtime pode limitar)
    if (strlen($chrRaw) >= 8192) {
        $chr = substr($chrRaw, 0, 8192);
    } elseif (strlen($chrRaw) > 0) {
        $chr = str_pad($chrRaw, 8192, "\x00");
    } else {
        $chr = str_repeat("\x00", 8192);
        $chrBanks = 0;
    }
    $chrs[] = $chr;
    $names[] = mc_sanitize_name((string)($g['name'] ?? ('GAME' . ($idx + 1))));
    $extra = ($chrBanks > 1) ? (" chr_banks=" . $chrBanks . " (boot=banco0)") : '';
    $log[] = "OK {$names[$idx]} mapper={$ines['mapper']}{$extra} reset=" .
        sprintf('%02X%02X', $resetHi[$idx], $resetLo[$idx]);
}

$n = count($names);
$titleAsm = mc_asm_string($title);
$nameLoAsm = implode(',', array_map(fn($i) => '<name_' . $i, range(0, $n - 1)));
$nameHiAsm = implode(',', array_map(fn($i) => '>name_' . $i, range(0, $n - 1)));
$rstLo = implode(',', array_map(fn($v) => sprintf('$%02x', $v), $resetLo));
$rstHi = implode(',', array_map(fn($v) => sprintf('$%02x', $v), $resetHi));
$prgBankAsm = implode(',', array_map(fn($i) => sprintf('$%02x', 1 + 2 * $i), range(0, $n - 1)));
$chrBankAsm = implode(',', array_map(fn($i) => sprintf('$%02x', 2 + 2 * $i), range(0, $n - 1)));
$nameBytes = '';
for ($i = 0; $i < $n; $i++) {
    $nameBytes .= 'name_' . $i . ":\n  .byte " . mc_asm_string($names[$i]) . ", 0\n";
}

// $ no ASM precisa de \$ dentro do heredoc PHP
$asm = <<<ASM
; Menu multicart — AxROM mapper 7 — CHR = novo.chr (ASCII na pag1)
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

; byte: 7=A 6=B 5=Select 4=Start 3=Up 2=Down 1=Left 0=Right
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

; Só move o sprite — sem reescrever a nametable (evita flash)
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
  ; 2x vblank
  bit \$2002
bv1:
  bit \$2002
  bpl bv1
bv2:
  bit \$2002
  bpl bv2
  ; copia trampoline -> \$0300
  ldx #0
ctr:
  lda tramp,x
  sta \$0300,x
  inx
  cpx #tramp_end-tramp
  bne ctr
  ; params (Y = índice do jogo)
  ldy sel
  lda game_prg_bank,y
  sta \$08
  lda game_chr_bank,y
  sta \$09
  lda game_reset_lo,y
  sta \$00
  lda game_reset_hi,y
  sta \$01
  jmp \$0300

; \$00/\$01 = reset  \$08 = prg bank  \$09 = chr bank
; \$06/\$07 = ptr CHR src
tramp:
  sei
  ldx #\$ff
  txs
  ; --- CHR bank: dados em \$8000 ---
  lda \$09
  sta \$8000
  ; garante vblank para gravar CHR-RAM
  bit \$2002
tv1:
  bit \$2002
  bpl tv1
  lda #0
  sta \$2006
  sta \$2006
  lda #0
  sta \$06
  lda #\$80
  sta \$07
  ldx #\$20
  ldy #0
chr_copy:
  lda (\$06),y
  sta \$2007
  iny
  bne chr_copy
  inc \$07
  dex
  bne chr_copy
  ; --- PRG bank do jogo ---
  lda \$08
  sta \$8000
  ; PPU: scroll 0, rendering off (o reset do jogo liga)
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
  ; limpa NT com tile \$20 (espaço na pag1 ASCII) — nunca \$00 (cursor)
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
  ; título centralizado ~col 8 row 2
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
  ; sprite cursor tile \$00 pag0
  lda sel
  asl a
  asl a
  asl a
  clc
  adc #47
  sta \$0200
  lda #0
  sta \$0201
  lda #0
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
  ; NMI + sprites PT0 + BG PT1 (ASCII)
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
game_chr_bank:
  .byte {$chrBankAsm}

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
    mc_json(['ok' => false, 'error' => 'ca65/ld65 não encontrados no servidor.', 'log' => implode("\n", $log)], 500);
}

$work = sys_get_temp_dir() . '/ngc_mc_' . bin2hex(random_bytes(6));
if (!@mkdir($work, 0755, true) && !is_dir($work)) {
    mc_json(['ok' => false, 'error' => 'Falha ao criar temp.'], 500);
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
        mc_json(['ok' => false, 'error' => 'assets/novo.chr não encontrado.', 'log' => implode("\n", $log)], 500);
    }
    $chrBin = file_get_contents($chrSrc);
    if ($chrBin === false || strlen($chrBin) < 8192) {
        mc_json(['ok' => false, 'error' => 'novo.chr inválido (8KB).', 'log' => implode("\n", $log)], 500);
    }
    $chrBin = substr($chrBin, 0, 8192);
    // cursor seta no tile \$00 pag0
    $cursor = "\x00\x40\x60\x70\x78\x70\x60\x40\x00\x00\x00\x00\x00\x00\x00\x00";
    for ($ci = 0; $ci < 16; $ci++) {
        $chrBin[$ci] = $cursor[$ci];
    }
    file_put_contents($work . '/novo.chr', $chrBin);
    $log[] = 'CHR: novo.chr + cursor \$00';

    $r1 = multicart_run_cmd([$ca65, 'menu.asm', '-o', 'menu.o'], $work, 60);
    $log[] = '$ ' . $r1['cmd'];
    if (trim($r1['stderr'] ?? '')) {
        $log[] = $r1['stderr'];
    }
    if (trim($r1['stdout'] ?? '')) {
        $log[] = $r1['stdout'];
    }
    if ($r1['code'] !== 0 || !is_file($work . '/menu.o')) {
        mc_json(['ok' => false, 'error' => 'ca65 falhou no menu.', 'log' => implode("\n", $log)], 400);
    }

    $r2 = multicart_run_cmd([$ld65, '-C', 'menu.cfg', 'menu.o', '-o', 'menu.bin'], $work, 60);
    $log[] = '$ ' . $r2['cmd'];
    if (trim($r2['stderr'] ?? '')) {
        $log[] = $r2['stderr'];
    }
    if ($r2['code'] !== 0 || !is_file($work . '/menu.bin')) {
        mc_json(['ok' => false, 'error' => 'ld65 falhou no menu.', 'log' => implode("\n", $log)], 400);
    }

    $menuBin = file_get_contents($work . '/menu.bin');
    if ($menuBin === false) {
        mc_json(['ok' => false, 'error' => 'menu.bin ilegível.'], 500);
    }
    if (strlen($menuBin) < 32768) {
        $menuBin = str_pad($menuBin, 32768, "\x00");
    } else {
        $menuBin = substr($menuBin, 0, 32768);
    }

    $axromBanks = 1 + ($n * 2);
    $inesPrg16 = $axromBanks * 2;

    $header = "NES\x1a" . chr($inesPrg16 & 0xFF) . chr(0) . chr(0x70) . chr(0x00) . str_repeat("\x00", 8);
    $out = $header . $menuBin;
    for ($i = 0; $i < $n; $i++) {
        $out .= $prgs[$i];
        $out .= $chrs[$i] . str_repeat("\x00", 32768 - 8192);
    }

    $log[] = "Multicart mapper7, {$n} jogos, {$axromBanks} bancos 32KB";

    $savedPath = null;
    $userId = (int)($_SESSION['user_id'] ?? 0);
    if ($userId > 0) {
        $dir = dirname(__DIR__, 2) . '/data/users/' . $userId . '/multicarts';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $id = date('Ymd_His') . '_' . bin2hex(random_bytes(3));
        $path = $dir . '/' . $id . '.nes';
        if (@file_put_contents($path, $out) !== false) {
            $savedPath = 'data/users/' . $userId . '/multicarts/' . $id . '.nes';
            @file_put_contents($dir . '/' . $id . '.json', json_encode([
                'title' => $title,
                'games' => $names,
                'mapper' => 7,
                'created' => date('c'),
            ], JSON_UNESCAPED_UNICODE));
            $log[] = 'Salvo: ' . $savedPath;
        }
    }

    mc_json([
        'ok' => true,
        'filename' => preg_replace('/\s+/', '_', $title) . '_multicart.nes',
        'size' => strlen($out),
        'mapper' => 7,
        'games' => $names,
        'nes' => base64_encode($out),
        'saved_path' => $savedPath,
        'log' => implode("\n", $log),
    ]);
} finally {
    foreach (glob($work . '/*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($work);
}
