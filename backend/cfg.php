<?php
declare(strict_types=1);

/**
 * GET/POST backend/cfg.php
 * Gera o nrom.cfg (NROM-256) para o projeto.
 *
 * POST JSON opcional: { "project": { "name": "...", "mapper": 0 } }
 * GET: usa defaults.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/src/NromCfg.php';

try {
    $project = [];
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
        $raw = file_get_contents('php://input');
        $body = json_decode($raw ?: '', true);
        if (is_array($body) && is_array($body['project'] ?? null)) {
            $project = $body['project'];
        } elseif (is_array($body)) {
            $project = $body;
        }
    } elseif (isset($_GET['name'])) {
        $project['name'] = (string)$_GET['name'];
        if (isset($_GET['mapper'])) {
            $project['mapper'] = (int)$_GET['mapper'];
        }
    }

    $cfg = NromCfg::generate($project);

    echo json_encode([
        'ok' => true,
        'cfg' => $cfg,
        'filename' => 'nrom.cfg',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
