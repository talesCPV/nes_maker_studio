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

    if (!is_array($body)) {
        library_json_response([
            'success' => false,
            'message' => 'JSON inválido.',
        ], 400);
    }

    $type = library_normalize_type($body['type'] ?? null);
    $id = library_safe_id((string) ($body['id'] ?? ''));

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

    if (!@unlink($path)) {
        library_json_response([
            'success' => false,
            'message' => 'Falha ao remover arquivo.',
        ], 500);
    }

    library_json_response([
        'success' => true,
        'id' => $id,
        'type' => $type,
    ]);
} catch (Throwable $e) {
    error_log('NGC Library Delete: ' . $e->getMessage());
    library_json_response([
        'success' => false,
        'message' => 'Não foi possível remover o asset.',
    ], 500);
}
