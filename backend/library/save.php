<?php
declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/_helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    library_json_response([
        'success' => false,
        'message' => 'Método não permitido.',
    ], 405);
}

try {
    $userId = library_user_id();
    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '', true);

    if (!is_array($body) || json_last_error() !== JSON_ERROR_NONE) {
        library_json_response([
            'success' => false,
            'message' => 'JSON inválido.',
        ], 400);
    }

    $type = library_normalize_type($body['type'] ?? null);
    $doc = $body['data'] ?? null;
    if (!is_array($doc)) {
        library_json_response([
            'success' => false,
            'message' => 'Campo data obrigatório (objeto JSON do asset).',
        ], 400);
    }

    // Validação leve por tipo
    if ($type === 'sound') {
        $fmt = $doc['format'] ?? null;
        if ($fmt !== null && $fmt !== 'nsound') {
            // permite peças soltas sem format, mas se vier format deve ser nsound
            library_json_response([
                'success' => false,
                'message' => 'Documento de som inválido (format deve ser nsound).',
            ], 400);
        }
        if ($fmt === null) {
            $doc['format'] = 'nsound';
            $doc['version'] = $doc['version'] ?? 1;
        }
    } else {
        if (($doc['format'] ?? '') !== 'tile') {
            library_json_response([
                'success' => false,
                'message' => 'Documento .tile inválido (format: tile).',
            ], 400);
        }
        if (!isset($doc['chr']) || !isset($doc['metatiles'])) {
            library_json_response([
                'success' => false,
                'message' => 'Documento .tile precisa de chr e metatiles.',
            ], 400);
        }
    }

    library_ensure_dirs($userId);

    $id = isset($body['id']) ? library_safe_id((string) $body['id']) : '';
    if ($id === '') {
        $prefix = $type === 'tile' ? 'tile' : 'snd';
        $id = $prefix . '_' . bin2hex(random_bytes(6));
    }

    if (!empty($body['name']) && is_string($body['name'])) {
        $doc['name'] = trim($body['name']);
    } elseif (empty($doc['name'])) {
        $doc['name'] = library_doc_name($doc, $id);
    }

    $doc['library_id'] = $id;
    $doc['savedAt'] = date('c');

    $path = library_file_path($userId, $type, $id);
    $json = json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) {
        library_json_response([
            'success' => false,
            'message' => 'Falha ao serializar asset.',
        ], 500);
    }

    if (file_put_contents($path, $json, LOCK_EX) === false) {
        library_json_response([
            'success' => false,
            'message' => 'Falha ao gravar na biblioteca.',
        ], 500);
    }

    library_json_response([
        'success' => true,
        'id' => $id,
        'type' => $type,
        'name' => library_doc_name($doc, $id),
        'path' => 'library/' . library_subdir($type) . '/' . $id . '.' . library_ext($type),
        'size' => filesize($path) ?: 0,
    ]);
} catch (Throwable $e) {
    error_log('NGC Library Save: ' . $e->getMessage());
    library_json_response([
        'success' => false,
        'message' => 'Não foi possível salvar na biblioteca.',
    ], 500);
}
