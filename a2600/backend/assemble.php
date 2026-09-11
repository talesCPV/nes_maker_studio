<?php
declare(strict_types=1);

/**
 * POST a2600/backend/assemble.php
 * Body JSON: {
 *   "asm": "...",
 *   "name": "meu-jogo",
 *   "project_id": 123   // opcional — grava ROM na pasta do projeto
 * }
 *
 * Usa DASM na VPS: dasm file.asm -f3 -o file.bin
 * Devolve binário da ROM Atari (raw, sem header iNES) em base64.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once dirname(__DIR__, 2) . '/backend/auth/auth_check.php';
require_once dirname(__DIR__, 2) . '/backend/config/paths.php';

function agc_asm_json(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function find_tool(string $name): ?string
{
    $candidates = [
        '/usr/bin/' . $name,
        '/usr/local/bin/' . $name,
        '/bin/' . $name,
        '/opt/homebrew/bin/' . $name,
    ];
    foreach ($candidates as $path) {
        if (is_file($path)) {
            return $path;
        }
    }
    $which = trim((string)@shell_exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null'));
    if ($which !== '' && is_file($which)) {
        return $which;
    }
    return null;
}

function run_cmd(array $argv, string $cwd, int $timeoutSec = 60): array
{
    $cmdStr = implode(' ', array_map('escapeshellarg', $argv));
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $process = @proc_open($argv, $descriptors, $pipes, $cwd, null);
    if (!is_resource($process)) {
        $process = @proc_open($cmdStr, $descriptors, $pipes, $cwd);
    }
    if (!is_resource($process)) {
        return ['code' => -1, 'stdout' => '', 'stderr' => 'proc_open falhou', 'cmd' => $cmdStr];
    }
    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    $stdout = '';
    $stderr = '';
    $start = time();
    while (true) {
        $status = proc_get_status($process);
        $stdout .= stream_get_contents($pipes[1]) ?: '';
        $stderr .= stream_get_contents($pipes[2]) ?: '';
        if (!$status['running']) {
            $code = $status['exitcode'];
            break;
        }
        if (time() - $start > $timeoutSec) {
            proc_terminate($process, 9);
            $code = -9;
            $stderr .= "\n[timeout]";
            break;
        }
        usleep(20000);
    }
    $stdout .= stream_get_contents($pipes[1]) ?: '';
    $stderr .= stream_get_contents($pipes[2]) ?: '';
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
    return ['code' => $code ?? -1, 'stdout' => $stdout, 'stderr' => $stderr, 'cmd' => $cmdStr];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    agc_asm_json(['success' => false, 'message' => 'Método não permitido.'], 405);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);
if (!is_array($body) || empty($body['asm']) || !is_string($body['asm'])) {
    agc_asm_json(['success' => false, 'message' => 'Campo asm obrigatório.'], 400);
}

$asm = $body['asm'];
$safeName = preg_replace('/[^a-zA-Z0-9_\-]+/', '_', (string)($body['name'] ?? 'agc_game')) ?: 'agc_game';
$safeName = substr($safeName, 0, 40);
$projectId = (int)($body['project_id'] ?? 0);
$userId = (int)($_SESSION['user_id'] ?? 0);

$dasm = find_tool('dasm');
if ($dasm === null) {
    agc_asm_json([
        'success' => false,
        'message' => 'DASM não encontrado na VPS. Instale com: sudo apt-get install -y dasm',
        'hint' => 'command -v dasm',
    ], 500);
}

$tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'agc_' . bin2hex(random_bytes(8));
if (!@mkdir($tmp, 0700, true) && !is_dir($tmp)) {
    agc_asm_json(['success' => false, 'message' => 'Não criou temp dir.'], 500);
}

$asmPath = $tmp . DIRECTORY_SEPARATOR . 'game.asm';
$binPath = $tmp . DIRECTORY_SEPARATOR . 'game.bin';
$listPath = $tmp . DIRECTORY_SEPARATOR . 'game.lst';

try {
    if (file_put_contents($asmPath, $asm) === false) {
        throw new RuntimeException('falha ao gravar .asm');
    }

    // -f3 = binary format (raw ROM)
    $run = run_cmd([$dasm, $asmPath, '-f3', '-o' . $binPath, '-l' . $listPath], $tmp, 60);

    if (($run['code'] ?? -1) !== 0 || !is_file($binPath)) {
        $log = trim(($run['stderr'] ?? '') . "\n" . ($run['stdout'] ?? ''));
        if (is_file($listPath)) {
            $log .= "\n---- list (tail) ----\n" . self_tail((string)file_get_contents($listPath), 40);
        }
        agc_asm_json([
            'success' => false,
            'message' => 'DASM falhou (exit ' . ($run['code'] ?? -1) . ').',
            'log' => $log,
            'cmd' => $run['cmd'] ?? '',
        ], 400);
    }

    $bin = (string)file_get_contents($binPath);
    $bytes = strlen($bin);
    if ($bytes < 2048) {
        agc_asm_json([
            'success' => false,
            'message' => 'ROM gerada muito pequena (' . $bytes . ' bytes).',
            'log' => $run['stderr'] ?? '',
        ], 400);
    }

    $saved = null;
    if ($userId > 0 && $projectId > 0) {
        $dir = user_projects_dir($userId, 'a2600') . DIRECTORY_SEPARATOR . $projectId;
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $outRom = $dir . DIRECTORY_SEPARATOR . 'game.bin';
        $outNamed = $dir . DIRECTORY_SEPARATOR . $safeName . '.bin';
        @file_put_contents($outRom, $bin, LOCK_EX);
        @file_put_contents($outNamed, $bin, LOCK_EX);
        // também .a26 (mesmo conteúdo) para emuladores
        @file_put_contents($dir . DIRECTORY_SEPARATOR . 'game.a26', $bin, LOCK_EX);
        $saved = [
            'path' => 'data/users/' . $userId . '/a2600/projects/' . $projectId . '/game.bin',
            'bytes' => $bytes,
        ];
    }

    agc_asm_json([
        'success' => true,
        'rom_base64' => base64_encode($bin),
        'bytes' => $bytes,
        'name' => $safeName . '.bin',
        'saved' => $saved,
        'dasm' => $dasm,
        'log' => trim((string)($run['stderr'] ?? '')),
    ]);
} catch (Throwable $e) {
    agc_asm_json(['success' => false, 'message' => $e->getMessage()], 500);
} finally {
    foreach (glob($tmp . DIRECTORY_SEPARATOR . '*') ?: [] as $f) {
        @unlink($f);
    }
    @rmdir($tmp);
}

function self_tail(string $text, int $lines): string
{
    $arr = preg_split("/\r\n|\n|\r/", $text) ?: [];
    return implode("\n", array_slice($arr, -$lines));
}
