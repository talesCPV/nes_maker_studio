<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');

try {

    $pdo = db();
    $userId = (int) $_SESSION['user_id'];

    $stmt = $pdo->prepare(
        'SELECT
            p.id,
            p.name,
            p.description,
            p.parent_project_id,
            p.created_at,
            p.updated_at,
            parent.name AS parent_name
         FROM projects p
         LEFT JOIN projects parent
           ON parent.id = p.parent_project_id
          AND parent.user_id = p.user_id
         WHERE p.user_id = :user_id
           AND p.is_deleted = 0
         ORDER BY p.updated_at DESC, p.id DESC'
    );

    $stmt->execute([
        ':user_id' => $userId
    ]);

    $rows = $stmt->fetchAll();
    $projects = [];

    $baseDir = dirname(__DIR__, 2) .
        DIRECTORY_SEPARATOR .
        'data' .
        DIRECTORY_SEPARATOR .
        'users' .
        DIRECTORY_SEPARATOR .
        $userId .
        DIRECTORY_SEPARATOR .
        'projects';

    foreach ($rows as $row) {
        $projectId = (int) $row['id'];
        $thumbPath = $baseDir .
            DIRECTORY_SEPARATOR .
            $projectId .
            DIRECTORY_SEPARATOR .
            'thumbnail.png';

        $projects[] = [
            'id' => $projectId,
            'name' => $row['name'],
            'description' => $row['description'],
            'parent_project_id' => $row['parent_project_id'] !== null
                ? (int) $row['parent_project_id']
                : null,
            'parent_name' => $row['parent_name'] !== null
                ? (string) $row['parent_name']
                : null,
            'has_thumbnail' => is_file($thumbPath),
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at']
        ];
    }

    echo json_encode([
        'success' => true,
        'projects' => $projects
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
