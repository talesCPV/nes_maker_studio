<?php
declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/_helpers.php';

try {
    $userId = library_user_id();
    $type = library_normalize_type($_GET['type'] ?? null);
    $id = library_safe_id((string) ($_GET['id'] ?? ''));

    if ($id === '') {
        library_json_response([
            'success' => false,
            'message' => 'ID obrigatório.',
        ], 400);
    }

    library_ensure_dirs($userId);
    $path = library_file_path($userId, $type, $id);

    if (!is_file($path)) {
        library_json_response([
            'success' => false,
            'message' => 'Asset não encontrado.',
        ], 404);
    }

    $raw = file_get_contents($path);
    $doc = json_decode($raw ?: '', true);
    if (!is_array($doc)) {
        library_json_response([
            'success' => false,
            'message' => 'Arquivo corrompido.',
        ], 500);
    }

    library_json_response([
        'success' => true,
        'id' => $id,
        'type' => $type,
        'name' => library_doc_name($doc, $id),
        'data' => $doc,
        'updated_at' => date('c', (int) filemtime($path)),
        'size' => filesize($path) ?: 0,
    ]);
} catch (Throwable $e) {
    error_log('NGC Library Load: ' . $e->getMessage());
    library_json_response([
        'success' => false,
        'message' => 'Não foi possível carregar o asset.',
    ], 500);
}
