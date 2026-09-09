<?php
declare(strict_types=1);

function multicart_find_tool(string $name): ?string
{
    foreach (['/usr/bin/', '/usr/local/bin/', '/bin/'] as $prefix) {
        $path = $prefix . $name;
        if (is_file($path)) {
            return $path;
        }
    }
    $which = trim((string) @shell_exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null'));
    return ($which !== '' && is_file($which)) ? $which : null;
}

function multicart_run_cmd(array $argv, string $cwd, int $timeoutSec = 90): array
{
    $cmdStr = implode(' ', array_map('escapeshellarg', $argv));
    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = @proc_open($argv, $descriptors, $pipes, $cwd, null);
    if (!is_resource($process)) {
        $process = @proc_open($cmdStr, $descriptors, $pipes, $cwd);
    }
    if (!is_resource($process)) {
        $line = 'cd ' . escapeshellarg($cwd) . ' && ' . $cmdStr . ' 2>&1';
        $output = [];
        $code = 1;
        @exec($line, $output, $code);
        return ['code' => $code, 'stdout' => implode("\n", $output), 'stderr' => '', 'cmd' => $cmdStr];
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
            if (isset($status['exitcode']) && $status['exitcode'] !== -1) {
                $exitCode = (int) $status['exitcode'];
            }
            break;
        }
        if ((time() - $start) > $timeoutSec) {
            proc_terminate($process, 9);
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($process);
            return ['code' => -1, 'stdout' => $stdout, 'stderr' => $stderr . "\n[timeout]", 'cmd' => $cmdStr];
        }
        usleep(30000);
    }
    $stdout .= stream_get_contents($pipes[1]) ?: '';
    $stderr .= stream_get_contents($pipes[2]) ?: '';
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);
    return ['code' => $exitCode, 'stdout' => $stdout, 'stderr' => $stderr, 'cmd' => $cmdStr];
}

function multicart_parse_ines(string $bin): array
{
    if (strlen($bin) < 16 || substr($bin, 0, 4) !== "NES\x1a") {
        throw new RuntimeException('Arquivo não é iNES válido.');
    }
    $b = array_values(unpack('C*', substr($bin, 0, 16)));
    // array_values → índices 0..15
    $prgBanks = $b[4];
    $chrBanks = $b[5];
    $f6 = $b[6];
    $f7 = $b[7];
    $mapper = (($f6 >> 4) & 0x0F) | ($f7 & 0xF0);
    if (($f7 & 0x0C) === 0x08) {
        $mapper = (($f6 >> 4) & 0x0F) | ($f7 & 0xF0) | (($b[8] & 0x0F) << 8);
    }
    $hasTrainer = (bool) ($f6 & 0x04);
    $offset = 16 + ($hasTrainer ? 512 : 0);
    $prgSize = $prgBanks * 16384;
    $chrSize = $chrBanks * 8192;
    if (strlen($bin) < $offset + $prgSize) {
        throw new RuntimeException('ROM truncada (PRG).');
    }
    $prg = substr($bin, $offset, $prgSize);
    $chr = $chrSize > 0 ? substr($bin, $offset + $prgSize, $chrSize) : '';
    return [
        'mapper' => $mapper,
        'prg_banks' => $prgBanks,
        'chr_banks' => $chrBanks,
        'prg' => $prg,
        'chr' => $chr,
        'mirroring' => ($f6 & 1) ? 1 : 0,
    ];
}
