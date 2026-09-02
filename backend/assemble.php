<?php
declare(strict_types=1);

/**
 * POST backend/assemble.php
 * Monta .asm + nrom.cfg com ca65/ld65 e devolve a ROM .nes (base64).
 *
 * Body JSON:
 * {
 *   "asm": "...",
 *   "cfg": "..."   // opcional — se omitido, gera NromCfg padrão
 *   "name": "meu-jogo"  // opcional, só para nome do arquivo
 * }
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/src/NromCfg.php';

/**
 * Grava a ROM em data/users/{uid}/projects/{projectId}/game.nes
 * (mesma pasta do .nms / thumbnail).
 */
function save_rom_for_project(int $userId, int $projectId, string $nesBin, string $safeName): array
{
    if ($userId <= 0 || $projectId <= 0) {
        return ['saved' => false, 'reason' => 'sem user/project id'];
    }

    $projectDir = dirname(__DIR__) .
        DIRECTORY_SEPARATOR . 'data' .
        DIRECTORY_SEPARATOR . 'users' .
        DIRECTORY_SEPARATOR . $userId .
        DIRECTORY_SEPARATOR . 'projects' .
        DIRECTORY_SEPARATOR . $projectId;

    if (!is_dir($projectDir)) {
        if (!@mkdir($projectDir, 0755, true) && !is_dir($projectDir)) {
            return ['saved' => false, 'reason' => 'não criou pasta do projeto'];
        }
    }

    $nesPath = $projectDir . DIRECTORY_SEPARATOR . 'game.nes';
    $written = file_put_contents($nesPath, $nesBin, LOCK_EX);
    if ($written === false) {
        return ['saved' => false, 'reason' => 'file_put_contents falhou'];
    }

    // Cópia com nome legível (opcional)
    $named = $projectDir . DIRECTORY_SEPARATOR . $safeName . '.nes';
    if ($named !== $nesPath) {
        @file_put_contents($named, $nesBin, LOCK_EX);
    }

    return [
        'saved' => true,
        'path' => 'data/users/' . $userId . '/projects/' . $projectId . '/game.nes',
        'bytes' => $written,
    ];
}

function assemble_json(array $data, int $status = 200): never
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
        // is_executable pode falhar em alguns ambientes; file_exists + is_file basta
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

/**
 * Executa comando. Preferência: proc_open com array (sem shell).
 * Importante: o exit code deve vir de proc_get_status()['exitcode'],
 * NÃO de proc_close() — depois de chamar proc_get_status com running=false,
 * proc_close() costuma devolver -1 mesmo com sucesso (bug/comportamento PHP).
 */
function run_cmd(array $argv, string $cwd, int $timeoutSec = 90): array
{
    if ($argv === []) {
        return ['code' => -1, 'stdout' => '', 'stderr' => 'comando vazio', 'cmd' => ''];
    }

    $cmdStr = implode(' ', array_map('escapeshellarg', $argv));
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = @proc_open($argv, $descriptors, $pipes, $cwd, null);
    // Fallback: string (shell) se a forma array não estiver disponível
    if (!is_resource($process)) {
        $process = @proc_open($cmdStr, $descriptors, $pipes, $cwd);
    }
    if (!is_resource($process)) {
        // Último recurso: exec
        $line = 'cd ' . escapeshellarg($cwd) . ' && ' . $cmdStr . ' 2>&1';
        $output = [];
        $code = 1;
        @exec($line, $output, $code);
        return [
            'code' => $code,
            'stdout' => implode("\n", $output),
            'stderr' => '',
            'cmd' => $cmdStr,
            'via' => 'exec',
        ];
    }

    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $stdout = '';
    $stderr = '';
    $exitCode = 1;
    $start = time();

    while (true) {
        $stdout .= stream_get_contents($pipes[1]) ?: '';
        $stderr .= stream_get_contents($pipes[2]) ?: '';
        $status = proc_get_status($process);
        if (!$status['running']) {
            // exitcode só é válido aqui (e só uma vez)
            if (isset($status['exitcode']) && $status['exitcode'] !== -1) {
                $exitCode = (int)$status['exitcode'];
            }
            break;
        }
        if ((time() - $start) > $timeoutSec) {
            proc_terminate($process, 9);
            $stdout .= stream_get_contents($pipes[1]) ?: '';
            $stderr .= stream_get_contents($pipes[2]) ?: '';
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($process);
            return [
                'code' => -1,
                'stdout' => $stdout,
                'stderr' => $stderr . "\n[timeout {$timeoutSec}s]",
                'cmd' => $cmdStr,
                'via' => 'proc_open',
            ];
        }
        usleep(30000);
    }

    $stdout .= stream_get_contents($pipes[1]) ?: '';
    $stderr .= stream_get_contents($pipes[2]) ?: '';
    fclose($pipes[1]);
    fclose($pipes[2]);
    // NÃO usar o retorno de proc_close como exit code
    proc_close($process);

    return [
        'code' => $exitCode,
        'stdout' => $stdout,
        'stderr' => $stderr,
        'cmd' => $cmdStr,
        'via' => 'proc_open',
    ];
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    assemble_json(['ok' => false, 'error' => 'Método não permitido. Use POST.'], 405);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);
if (!is_array($body)) {
    assemble_json(['ok' => false, 'error' => 'JSON inválido.'], 400);
}

$asm = isset($body['asm']) ? (string)$body['asm'] : '';
if (trim($asm) === '') {
    assemble_json(['ok' => false, 'error' => 'Campo asm obrigatório.'], 400);
}

$cfg = isset($body['cfg']) ? (string)$body['cfg'] : '';
if (trim($cfg) === '') {
    $project = is_array($body['project'] ?? null) ? $body['project'] : [];
    if (isset($body['name'])) {
        $project['name'] = (string)$body['name'];
    }
    $cfg = NromCfg::generate($project);
}

$safeName = preg_replace('/[^a-zA-Z0-9_\-]+/', '_', (string)($body['name'] ?? 'jogo')) ?: 'jogo';
$safeName = substr($safeName, 0, 40);

$ca65 = find_tool('ca65');
$ld65 = find_tool('ld65');
if ($ca65 === null || $ld65 === null) {
    assemble_json([
        'ok' => false,
        'error' => 'ca65/ld65 não encontrados no servidor. Instale o pacote cc65 e confira o PATH do PHP/Apache.',
        'log' => 'ca65=' . ($ca65 ?? 'null') . ' ld65=' . ($ld65 ?? 'null') .
            "\nPHP user=" . (function_exists('posix_geteuid') ? (string)posix_geteuid() : 'n/a') .
            "\nPATH=" . (getenv('PATH') ?: '(vazio)'),
    ], 500);
}

$workDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ngc_assemble_' . bin2hex(random_bytes(8));
if (!@mkdir($workDir, 0755, true) && !is_dir($workDir)) {
    assemble_json(['ok' => false, 'error' => 'Não foi possível criar pasta temporária de build: ' . $workDir], 500);
}

$asmPath = $workDir . DIRECTORY_SEPARATOR . 'jogo.asm';
$objPath = $workDir . DIRECTORY_SEPARATOR . 'jogo.o';
$cfgPath = $workDir . DIRECTORY_SEPARATOR . 'nrom.cfg';
$nesPath = $workDir . DIRECTORY_SEPARATOR . 'jogo.nes';
$logLines = [];

try {
    if (file_put_contents($asmPath, $asm) === false) {
        throw new RuntimeException('Falha ao gravar jogo.asm em ' . $asmPath);
    }
    if (file_put_contents($cfgPath, $cfg) === false) {
        throw new RuntimeException('Falha ao gravar nrom.cfg em ' . $cfgPath);
    }

    $logLines[] = 'Workdir: ' . $workDir;
    $logLines[] = 'ca65: ' . $ca65;
    $logLines[] = 'ld65: ' . $ld65;
    $logLines[] = 'PHP SAPI: ' . PHP_SAPI;
    $logLines[] = 'sys_temp: ' . sys_get_temp_dir();

    // ca65 jogo.asm -o jogo.o  (paths relativos ao cwd)
    $r1 = run_cmd([$ca65, 'jogo.asm', '-o', 'jogo.o'], $workDir, 120);
    $logLines[] = '$ ' . $r1['cmd'] . '  (via ' . ($r1['via'] ?? '?') . ')';
    if (trim($r1['stdout']) !== '') {
        $logLines[] = trim($r1['stdout']);
    }
    if (trim($r1['stderr']) !== '') {
        $logLines[] = trim($r1['stderr']);
    }
    $logLines[] = 'ca65 exit=' . $r1['code'] . ' obj=' . (is_file($objPath) ? 'yes' : 'no');

    if ($r1['code'] !== 0 || !is_file($objPath)) {
        assemble_json([
            'ok' => false,
            'error' => 'ca65 falhou (exit ' . $r1['code'] . ').',
            'log' => implode("\n", $logLines),
            'stage' => 'ca65',
        ], 400);
    }

    // ld65 -C nrom.cfg jogo.o -o jogo.nes
    $r2 = run_cmd([$ld65, '-C', 'nrom.cfg', 'jogo.o', '-o', 'jogo.nes'], $workDir, 120);
    $logLines[] = '$ ' . $r2['cmd'] . '  (via ' . ($r2['via'] ?? '?') . ')';
    if (trim($r2['stdout']) !== '') {
        $logLines[] = trim($r2['stdout']);
    }
    if (trim($r2['stderr']) !== '') {
        $logLines[] = trim($r2['stderr']);
    }
    $logLines[] = 'ld65 exit=' . $r2['code'] . ' nes=' . (is_file($nesPath) ? 'yes' : 'no');

    if ($r2['code'] !== 0 || !is_file($nesPath)) {
        assemble_json([
            'ok' => false,
            'error' => 'ld65 falhou (exit ' . $r2['code'] . ').',
            'log' => implode("\n", $logLines),
            'stage' => 'ld65',
        ], 400);
    }

    $nesBin = file_get_contents($nesPath);
    if ($nesBin === false || strlen($nesBin) < 16) {
        assemble_json([
            'ok' => false,
            'error' => 'ROM inválida ou vazia após ld65.',
            'log' => implode("\n", $logLines),
        ], 500);
    }

    $logLines[] = 'OK — ROM ' . strlen($nesBin) . ' bytes';

    // Persistir na pasta do projeto do usuário (se logado + project_id)
    $userId = (int)($_SESSION['user_id'] ?? 0);
    $projectId = (int)($body['project_id'] ?? 0);
    $saveInfo = ['saved' => false, 'reason' => 'project_id ausente ou sessão sem user'];
    if ($userId > 0 && $projectId > 0) {
        $saveInfo = save_rom_for_project($userId, $projectId, $nesBin, $safeName);
        if (!empty($saveInfo['saved'])) {
            $logLines[] = 'ROM salva: ' . ($saveInfo['path'] ?? '');
        } else {
            $logLines[] = 'ROM não persistida: ' . ($saveInfo['reason'] ?? 'desconhecido');
        }
    } else {
        $logLines[] = 'ROM não persistida (faça login e abra um projeto do dashboard).';
    }

    assemble_json([
        'ok' => true,
        'filename' => $safeName . '.nes',
        'size' => strlen($nesBin),
        'nes' => base64_encode($nesBin),
        'saved' => !empty($saveInfo['saved']),
        'saved_path' => $saveInfo['path'] ?? null,
        'project_id' => $projectId > 0 ? $projectId : null,
        'log' => implode("\n", $logLines),
    ]);
} catch (Throwable $e) {
    assemble_json([
        'ok' => false,
        'error' => $e->getMessage(),
        'log' => implode("\n", $logLines),
    ], 500);
} finally {
    foreach ([$asmPath ?? '', $objPath ?? '', $cfgPath ?? '', $nesPath ?? ''] as $f) {
        if ($f !== '' && is_file($f)) {
            @unlink($f);
        }
    }
    if (!empty($workDir) && is_dir($workDir)) {
        @rmdir($workDir);
    }
}
