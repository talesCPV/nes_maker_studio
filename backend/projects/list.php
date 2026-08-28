<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');

try {

    $pdo = db();

    $stmt = $pdo->prepare(
        'SELECT
            id,
            name,
            description,
            created_at,
            updated_at
         FROM projects
         WHERE user_id = :user_id
         AND is_deleted = 0
         ORDER BY updated_at DESC, id DESC'
    );

    $stmt->execute([
        ':user_id' => (int) $_SESSION['user_id']
    ]);

    echo json_encode([
        'success' => true,
        'projects' => $stmt->fetchAll()
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {

    error_log(
        'NGC Project List Error: ' .
        $e->getMessage()
    );

    http_response_code(500);

    echo json_encode([
        'success' => false,
        'message' => 'Não foi possível carregar os projetos.'
    ], JSON_UNESCAPED_UNICODE);
}