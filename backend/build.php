<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode([
            'ok' => false,
            'error' => 'NGC aceita apenas POST.'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $raw = file_get_contents('php://input');
    $request = json_decode($raw ?: '', true, 512, JSON_THROW_ON_ERROR);

    $templates = require __DIR__ . '/templates/system.php';
    $templates = array_merge($templates, require __DIR__ . '/templates/background.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/background_data.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/sprites.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/sprite_data.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/sprite_chr.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/background_chr.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/palette_data.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/program.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/music.php');
    $templates = array_merge($templates, require __DIR__ . '/templates/gameflow.php');
    require_once __DIR__ . '/src/NGC.php';

    $ngc = new NGC($templates);
    echo json_encode($ngc->build($request), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
        'compiler' => 'NGC'
    ], JSON_UNESCAPED_UNICODE);
}
