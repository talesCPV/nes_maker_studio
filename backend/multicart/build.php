<?php
declare(strict_types=1);

/**
 * POST backend/multicart/build.php
 *
 * Monta multicart AxROM (mapper 7) a partir de ROMs NROM (0) ou AxROM (7)
 * com PRG de 16KB ou 32KB. Banco 0 = menu; bancos 1..N = jogos.
 * Voltar ao menu = Reset.
 *
 * Body JSON:
 * {
 *   "games": [
 *     { "name": "Meu jogo", "rom": "<base64 iNES>" },
 *     ...
 *   ],
 *   "title": "MULTICART"
 * }
 *
 * Não persiste as ROMs de entrada — só devolve a .nes (base64).
 * Opcional: grava em data/users/{uid}/multicarts/{id}/ se autenticado.
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

function mc_nes_char(string $s): string
{
    // Apenas ASCII imprimível básico para tile iguais a código ASCII no CHR padrão...
    // Usamos tiles $00-$3F como espaço/letras se CHR-RAM limpa = sem fonte.
    // Menu usa CHR-RAM: precisamos de uma fonte mínima embutida no menu bank.
    return $s;
}

function mc_sanitize_name(string $name): string
{
    $name = preg_replace('/[^\x20-\x7E]/', '', $name) ?? '';
    $name = trim($name);
    if ($name === '') {
        $name = 'GAME';
    }
    return substr($name, 0, 28);
}

/**
 * Garante PRG de exatamente 32KB (espelha 16KB se NROM-128).
 */
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

function mc_build_menu_asm(array $names, array $resetLo, array $resetHi, string $title): string
{
    $n = count($names);
    $title = mc_sanitize_name($title);
    if (strlen($title) > 20) {
        $title = substr($title, 0, 20);
    }

    $nameBytes = '';
    $nameLo = [];
    $nameHi = [];
    // Labels name_0, name_1...
    for ($i = 0; $i < $n; $i++) {
        $label = 'name_' . $i;
        $str = mc_sanitize_name($names[$i]);
        $nameBytes .= $label . ":\n  .byte " . mc_asm_string($str) . ", 0\n";
    }

    $loList = [];
    $hiList = [];
    for ($i = 0; $i < $n; $i++) {
        $loList[] = '<name_' . $i;
        $hiList[] = '>name_' . $i;
    }
    // ca65 uses .lobyte/.hibyte or < >
    $nameLoAsm = $n ? implode(',', array_map(fn($i) => '<name_' . $i, range(0, $n - 1))) : '0';
    $nameHiAsm = $n ? implode(',', array_map(fn($i) => '>name_' . $i, range(0, $n - 1))) : '0';

    $rstLo = $n ? implode(',', array_map(fn($v) => sprintf('$%02x', $v & 0xFF), $resetLo)) : '0';
    $rstHi = $n ? implode(',', array_map(fn($v) => sprintf('$%02x', $v & 0xFF), $resetHi)) : '0';

    return <<<ASM
; Auto-generated multicart menu (AxROM / mapper 7)
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

  ; CHR-RAM: fonte mínima 8x8 para $20-$5F (espaço até _)
  jsr upload_font

  lda #0
  sta sel
  lda #{$n}
  sta count

  jsr fill_bg
  jsr draw_all
  lda #0
  sta \$2005
  sta \$2005
  lda #%00011110
  sta \$2001
  lda #%10000000
  sta \$2000

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
  and #%00100000
  beq not_dn
  inc sel
  lda sel
  cmp count
  bcc dn_ok
  lda #0
  sta sel
dn_ok:
  jsr draw_all
not_dn:
  lda tmp
  and #%00010000
  beq not_up
  lda sel
  beq up_w
  dec sel
  jmp up_d
up_w:
  lda count
  beq up_d
  sec
  sbc #1
  sta sel
up_d:
  jsr draw_all
not_up:
  lda tmp
  and #%10010000
  beq not_go
  jsr boot_game
not_go:
  rts

boot_game:
  lda #0
  sta \$2000
  sta \$2001
  ldx #0
ctr:
  lda tramp,x
  sta \$0100,x
  inx
  cpx #tramp_end-tramp
  bne ctr
  lda sel
  clc
  adc #1
  tax
  ldy sel
  lda game_reset_lo,y
  sta \$00
  lda game_reset_hi,y
  sta \$01
  jmp \$0100

tramp:
  stx \$8000
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
  lda #0
  ldy #4
nt:
  sta \$2007
  inx
  bne nt
  dey
  bne nt
  rts

draw_all:
  lda #0
  sta \$2001
  sta \$2000
  ; title
  lda #\$20
  sta \$2006
  lda #\$44
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
  ; vram = $20C4 + row*32 = row 6 col 4
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
  ; cursor
  lda row
  cmp sel
  bne no_cur
  lda #\$3e
  jmp cur_w
no_cur:
  lda #\$20
cur_w:
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
  lda #0
  sta \$2005
  sta \$2005
  lda #%00011110
  sta \$2001
  lda #%10000000
  sta \$2000
  rts

; Fonte mínima: preenche tiles \$20-\$5A com padrões simples (bloco/linhas)
; Para legibilidade básica; emuladores aceitam CHR-RAM.
upload_font:
  lda #\$00
  sta \$2006
  sta \$2006
  ; tile 0-31 vazio
  ldx #0
  lda #0
z0:
  sta \$2007
  inx
  bne z0
  ; tiles \$20+ : use simple ROM patterns from font_data for 40 chars (*16 bytes)
  ldx #0
uf:
  lda font_data,x
  sta \$2007
  inx
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

{$nameBytes}

; 16 bytes * 256 = too big — only first 256 bytes of font (tiles \$00-\$0F pattern repeated)
font_data:
  .repeat 256
    .byte \$00
  .endrepeat

.segment "VECTORS"
  .word nmi
  .word reset
  .word irq
ASM;
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

// Fix title in generator - need titleAsm variable
// We'll rebuild properly below without the broken heredoc reference

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

$title = mc_sanitize_name((string)($body['title'] ?? 'MULTICART'));
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
    // Aceita NROM (0) e AxROM (7) com 1 ou 2 bancos PRG (16/32KB)
    if ($ines['mapper'] !== 0 && $ines['mapper'] !== 7) {
        mc_json([
            'ok' => false,
            'error' => "Jogo #{$idx}: mapper {$ines['mapper']} não suportado na v1 (use NROM/0 ou AxROM/7).",
        ], 400);
    }
    if ($ines['prg_banks'] < 1 || $ines['prg_banks'] > 2) {
        mc_json(['ok' => false, 'error' => "Jogo #{$idx}: PRG deve ser 16KB ou 32KB."], 400);
    }
    $prg32 = mc_prg_32k($ines['prg']);
    // Vetor de reset no fim do banco de 32KB
    $resetLo[] = ord($prg32[0x7FFC]);
    $resetHi[] = ord($prg32[0x7FFD]);
    $prgs[] = $prg32;
    $chr = $ines['chr'];
    if (strlen($chr) >= 8192) {
        $chr = substr($chr, 0, 8192);
    } elseif (strlen($chr) > 0) {
        $chr = str_pad($chr, 8192, "\x00");
    } else {
        $chr = str_repeat("\x00", 8192);
    }
    $chrs[] = $chr;
    $names[] = mc_sanitize_name((string)($g['name'] ?? ('GAME' . ($idx + 1))));
    $log[] = "OK {$names[$idx]} mapper={$ines['mapper']} prg_banks={$ines['prg_banks']} reset=" .
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

// Fonte: tiles ASCII $20-$7F com padrões legíveis mínimos (bloco para qualquer char)
// Tile index = char code; preenchemos CHR com glifos 8x8 gerados
$mcFontTiles = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 0
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 1
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 2
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 3
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 4
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 5
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 6
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 7
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 8
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 9
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 10
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 11
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 12
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 13
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 14
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 15
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 16
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 17
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 18
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 19
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 20
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 21
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 22
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 23
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 24
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 25
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 26
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 27
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 28
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 29
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 30
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 31
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 32
  [16,16,16,16,16,0,16,0,0,0,0,0,0,0,0,0], // 33
  [36,36,36,0,0,0,0,0,0,0,0,0,0,0,0,0], // 34
  [36,36,126,36,126,36,36,0,0,0,0,0,0,0,0,0], // 35
  [16,60,80,56,20,120,16,0,0,0,0,0,0,0,0,0], // 36
  [96,100,8,16,32,76,12,0,0,0,0,0,0,0,0,0], // 37
  [32,80,80,32,84,72,52,0,0,0,0,0,0,0,0,0], // 38
  [16,16,16,0,0,0,0,0,0,0,0,0,0,0,0,0], // 39
  [8,16,32,32,32,16,8,0,0,0,0,0,0,0,0,0], // 40
  [32,16,8,8,8,16,32,0,0,0,0,0,0,0,0,0], // 41
  [0,16,84,56,84,16,0,0,0,0,0,0,0,0,0,0], // 42
  [0,16,16,124,16,16,0,0,0,0,0,0,0,0,0,0], // 43
  [0,0,0,0,0,16,16,32,0,0,0,0,0,0,0,0], // 44
  [0,0,0,124,0,0,0,0,0,0,0,0,0,0,0,0], // 45
  [0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0], // 46
  [4,8,8,16,32,32,64,0,0,0,0,0,0,0,0,0], // 47
  [56,68,76,84,100,68,56,0,0,0,0,0,0,0,0,0], // 48
  [16,48,16,16,16,16,56,0,0,0,0,0,0,0,0,0], // 49
  [56,68,4,24,32,64,124,0,0,0,0,0,0,0,0,0], // 50
  [56,68,4,24,4,68,56,0,0,0,0,0,0,0,0,0], // 51
  [8,24,40,72,124,8,8,0,0,0,0,0,0,0,0,0], // 52
  [124,64,120,4,4,68,56,0,0,0,0,0,0,0,0,0], // 53
  [24,32,64,120,68,68,56,0,0,0,0,0,0,0,0,0], // 54
  [124,4,8,16,32,32,32,0,0,0,0,0,0,0,0,0], // 55
  [56,68,68,56,68,68,56,0,0,0,0,0,0,0,0,0], // 56
  [56,68,68,60,4,8,48,0,0,0,0,0,0,0,0,0], // 57
  [0,0,16,0,0,16,0,0,0,0,0,0,0,0,0,0], // 58
  [0,0,16,0,0,16,16,32,0,0,0,0,0,0,0,0], // 59
  [8,16,32,64,32,16,8,0,0,0,0,0,0,0,0,0], // 60
  [0,0,124,0,124,0,0,0,0,0,0,0,0,0,0,0], // 61
  [64,32,16,8,16,32,64,0,0,0,0,0,0,0,0,0], // 62
  [56,68,4,8,16,0,16,0,0,0,0,0,0,0,0,0], // 63
  [56,68,92,84,92,64,56,0,0,0,0,0,0,0,0,0], // 64
  [56,68,68,124,68,68,68,0,0,0,0,0,0,0,0,0], // 65
  [120,68,68,120,68,68,120,0,0,0,0,0,0,0,0,0], // 66
  [56,68,64,64,64,68,56,0,0,0,0,0,0,0,0,0], // 67
  [120,68,68,68,68,68,120,0,0,0,0,0,0,0,0,0], // 68
  [124,64,64,120,64,64,124,0,0,0,0,0,0,0,0,0], // 69
  [124,64,64,120,64,64,64,0,0,0,0,0,0,0,0,0], // 70
  [56,68,64,92,68,68,56,0,0,0,0,0,0,0,0,0], // 71
  [68,68,68,124,68,68,68,0,0,0,0,0,0,0,0,0], // 72
  [56,16,16,16,16,16,56,0,0,0,0,0,0,0,0,0], // 73
  [4,4,4,4,4,68,56,0,0,0,0,0,0,0,0,0], // 74
  [68,72,80,96,80,72,68,0,0,0,0,0,0,0,0,0], // 75
  [64,64,64,64,64,64,124,0,0,0,0,0,0,0,0,0], // 76
  [68,108,84,84,68,68,68,0,0,0,0,0,0,0,0,0], // 77
  [68,100,84,76,68,68,68,0,0,0,0,0,0,0,0,0], // 78
  [56,68,68,68,68,68,56,0,0,0,0,0,0,0,0,0], // 79
  [120,68,68,120,64,64,64,0,0,0,0,0,0,0,0,0], // 80
  [56,68,68,68,84,72,52,0,0,0,0,0,0,0,0,0], // 81
  [120,68,68,120,80,72,68,0,0,0,0,0,0,0,0,0], // 82
  [56,68,64,56,4,68,56,0,0,0,0,0,0,0,0,0], // 83
  [124,16,16,16,16,16,16,0,0,0,0,0,0,0,0,0], // 84
  [68,68,68,68,68,68,56,0,0,0,0,0,0,0,0,0], // 85
  [68,68,68,68,68,40,16,0,0,0,0,0,0,0,0,0], // 86
  [68,68,68,84,84,108,68,0,0,0,0,0,0,0,0,0], // 87
  [68,68,40,16,40,68,68,0,0,0,0,0,0,0,0,0], // 88
  [68,68,40,16,16,16,16,0,0,0,0,0,0,0,0,0], // 89
  [124,4,8,16,32,64,124,0,0,0,0,0,0,0,0,0], // 90
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 91
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 92
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 93
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 94
  [0,0,0,0,0,0,0,126,0,0,0,0,0,0,0,0], // 95
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 96
  [56,68,68,124,68,68,68,0,0,0,0,0,0,0,0,0], // 97
  [120,68,68,120,68,68,120,0,0,0,0,0,0,0,0,0], // 98
  [56,68,64,64,64,68,56,0,0,0,0,0,0,0,0,0], // 99
  [120,68,68,68,68,68,120,0,0,0,0,0,0,0,0,0], // 100
  [124,64,64,120,64,64,124,0,0,0,0,0,0,0,0,0], // 101
  [124,64,64,120,64,64,64,0,0,0,0,0,0,0,0,0], // 102
  [56,68,64,92,68,68,56,0,0,0,0,0,0,0,0,0], // 103
  [68,68,68,124,68,68,68,0,0,0,0,0,0,0,0,0], // 104
  [56,16,16,16,16,16,56,0,0,0,0,0,0,0,0,0], // 105
  [4,4,4,4,4,68,56,0,0,0,0,0,0,0,0,0], // 106
  [68,72,80,96,80,72,68,0,0,0,0,0,0,0,0,0], // 107
  [64,64,64,64,64,64,124,0,0,0,0,0,0,0,0,0], // 108
  [68,108,84,84,68,68,68,0,0,0,0,0,0,0,0,0], // 109
  [68,100,84,76,68,68,68,0,0,0,0,0,0,0,0,0], // 110
  [56,68,68,68,68,68,56,0,0,0,0,0,0,0,0,0], // 111
  [120,68,68,120,64,64,64,0,0,0,0,0,0,0,0,0], // 112
  [56,68,68,68,84,72,52,0,0,0,0,0,0,0,0,0], // 113
  [120,68,68,120,80,72,68,0,0,0,0,0,0,0,0,0], // 114
  [56,68,64,56,4,68,56,0,0,0,0,0,0,0,0,0], // 115
  [124,16,16,16,16,16,16,0,0,0,0,0,0,0,0,0], // 116
  [68,68,68,68,68,68,56,0,0,0,0,0,0,0,0,0], // 117
  [68,68,68,68,68,40,16,0,0,0,0,0,0,0,0,0], // 118
  [68,68,68,84,84,108,68,0,0,0,0,0,0,0,0,0], // 119
  [68,68,40,16,40,68,68,0,0,0,0,0,0,0,0,0], // 120
  [68,68,40,16,16,16,16,0,0,0,0,0,0,0,0,0], // 121
  [124,4,8,16,32,64,124,0,0,0,0,0,0,0,0,0], // 122
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 123
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 124
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 125
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 126
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 127
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 128
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 129
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 130
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 131
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 132
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 133
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 134
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 135
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 136
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 137
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 138
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 139
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 140
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 141
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 142
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 143
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 144
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 145
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 146
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 147
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 148
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 149
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 150
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 151
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 152
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 153
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 154
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 155
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 156
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 157
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 158
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 159
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 160
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 161
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 162
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 163
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 164
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 165
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 166
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 167
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 168
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 169
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 170
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 171
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 172
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 173
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 174
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 175
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 176
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 177
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 178
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 179
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 180
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 181
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 182
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 183
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 184
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 185
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 186
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 187
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 188
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 189
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 190
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 191
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 192
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 193
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 194
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 195
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 196
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 197
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 198
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 199
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 200
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 201
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 202
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 203
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 204
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 205
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 206
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 207
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 208
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 209
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 210
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 211
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 212
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 213
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 214
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 215
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 216
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 217
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 218
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 219
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 220
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 221
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 222
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 223
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 224
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 225
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 226
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 227
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 228
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 229
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 230
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 231
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 232
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 233
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 234
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 235
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 236
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 237
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 238
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 239
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 240
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 241
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 242
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 243
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 244
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 245
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 246
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 247
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 248
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 249
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 250
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 251
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 252
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 253
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 254
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // 255
];

$fontAsm = "font_data:
";
foreach ($mcFontTiles as $tile) {
    $fontAsm .= '  .byte ' . implode(',', array_map(fn($b) => sprintf('$%02x', $b), $tile)) . "
";
}

$asm = <<<ASM
; Auto-generated multicart menu (AxROM mapper 7)
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
  lda #0
  sta \$2005
  sta \$2005
  lda #%00011110
  sta \$2001
  lda #%10000000
  sta \$2000
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
  and #%00100000
  beq not_dn
  inc sel
  lda sel
  cmp count
  bcc dn_ok
  lda #0
  sta sel
dn_ok:
  jsr draw_all
not_dn:
  lda tmp
  and #%00010000
  beq not_up
  lda sel
  beq up_w
  dec sel
  jmp up_d
up_w:
  lda count
  beq up_d
  sec
  sbc #1
  sta sel
up_d:
  jsr draw_all
not_up:
  lda tmp
  and #%10010000
  beq not_go
  jsr boot_game
not_go:
  rts
boot_game:
  lda #0
  sta \$2000
  sta \$2001
  bit \$2002
bv1:
  bit \$2002
  bpl bv1
  ldx #0
ctr:
  lda tramp,x
  sta \$0100,x
  inx
  cpx #tramp_end-tramp
  bne ctr
  ldy sel
  lda game_prg_bank,y
  sta \$02
  lda game_chr_bank,y
  sta \$03
  lda game_reset_lo,y
  sta \$00
  lda game_reset_hi,y
  sta \$01
  jmp \$0100

; RAM trampoline: $00/$01=reset $02=prg bank $03=chr bank
tramp:
  lda \$03
  sta \$8000
  lda #0
  sta \$2006
  sta \$2006
  lda #0
  sta \$04
  lda #\$80
  sta \$05
  ldx #\$20
  ldy #0
chr_copy:
  lda (\$04),y
  sta \$2007
  iny
  bne chr_copy
  inc \$05
  dex
  bne chr_copy
  lda \$02
  sta \$8000
  lda #0
  sta \$2005
  sta \$2005
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
  lda #0
  ldy #4
nt:
  sta \$2007
  inx
  bne nt
  dey
  bne nt
  rts
draw_all:
  lda #0
  sta \$2001
  sta \$2000
  lda #\$20
  sta \$2006
  lda #\$44
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
  lda row
  cmp sel
  bne no_cur
  lda #\$3e
  jmp cur_w
no_cur:
  lda #\$20
cur_w:
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
  lda #0
  sta \$2005
  sta \$2005
  lda #%00011110
  sta \$2001
  lda #%10000000
  sta \$2000
  rts
upload_font:
  lda #\$00
  sta \$2006
  sta \$2006
  ; copia 4096 bytes (font_data) — 256 tiles
  lda #<font_data
  sta ptr_lo
  lda #>font_data
  sta ptr_hi
  ldx #\$10
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
  .byte {$rstHi}
{$nameBytes}
{$fontAsm}
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
    mc_json([
        'ok' => false,
        'error' => 'ca65/ld65 não encontrados no servidor.',
        'log' => implode("\n", $log),
    ], 500);
}

$work = sys_get_temp_dir() . '/ngc_mc_' . bin2hex(random_bytes(6));
if (!@mkdir($work, 0755, true) && !is_dir($work)) {
    mc_json(['ok' => false, 'error' => 'Falha ao criar temp.'], 500);
}

try {
    file_put_contents($work . '/menu.asm', $asm);
    file_put_contents($work . '/menu.cfg', $cfg);

    $r1 = multicart_run_cmd([$ca65, 'menu.asm', '-o', 'menu.o'], $work, 60);
    $log[] = '$ ' . $r1['cmd'];
    if (trim($r1['stderr'])) {
        $log[] = $r1['stderr'];
    }
    if (trim($r1['stdout'])) {
        $log[] = $r1['stdout'];
    }
    if ($r1['code'] !== 0 || !is_file($work . '/menu.o')) {
        mc_json(['ok' => false, 'error' => 'ca65 falhou no menu.', 'log' => implode("\n", $log)], 400);
    }

    $r2 = multicart_run_cmd([$ld65, '-C', 'menu.cfg', 'menu.o', '-o', 'menu.bin'], $work, 60);
    $log[] = '$ ' . $r2['cmd'];
    if (trim($r2['stderr'])) {
        $log[] = $r2['stderr'];
    }
    if ($r2['code'] !== 0 || !is_file($work . '/menu.bin')) {
        mc_json(['ok' => false, 'error' => 'ld65 falhou no menu.', 'log' => implode("\n", $log)], 400);
    }

    $menuBin = file_get_contents($work . '/menu.bin');
    if ($menuBin === false) {
        mc_json(['ok' => false, 'error' => 'menu.bin ilegível.'], 500);
    }
    // Garantir 32KB
    if (strlen($menuBin) < 32768) {
        $menuBin = str_pad($menuBin, 32768, "\x00");
    } else {
        $menuBin = substr($menuBin, 0, 32768);
    }
    // Vetores do menu no fim
    $menuBin[0x7FFA] = $menuBin[0x7FFA] ?? "\x00";
    // ld65 already placed vectors at $FFFA

    $axromBanks = 1 + ($n * 2);
    $inesPrg16 = $axromBanks * 2;

    $header = "NES\x1a";
    $header .= chr($inesPrg16 & 0xFF);
    $header .= chr(0);
    $header .= chr(0x70);
    $header .= chr(0x00);
    $header .= str_repeat("\x00", 8);

    $out = $header . $menuBin;
    for ($i = 0; $i < $n; $i++) {
        $out .= $prgs[$i];
        $out .= $chrs[$i] . str_repeat("\x00", 32768 - 8192);
    }

    $log[] = 'Multicart: mapper 7 AxROM, ' . $n . ' jogo(s), '
        . $axromBanks . ' bancos 32KB (menu+prg+chr), PRG ' . ($inesPrg16 * 16) . 'KB';

    // Persistência opcional do RESULTADO (não das ROMs de entrada)
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
