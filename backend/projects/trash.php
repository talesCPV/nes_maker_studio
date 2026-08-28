<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');

function response(array $data, int $status = 200): never
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {

    response([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

$userId =
    (int) $_SESSION['user_id'];

try {

    $pdo = db();

    $stmt = $pdo->prepare(
        'SELECT
            id,
            parent_project_id,
            name,
            description,
            filename,
            created_at,
            updated_at,
            last_opened_at
         FROM projects
         WHERE user_id = :user_id
           AND is_deleted = 1
         ORDER BY updated_at DESC, id DESC'
    );

    $stmt->execute([
        ':user_id' => $userId
    ]);

    $rows = $stmt->fetchAll();

    $projects = [];

    foreach ($rows as $row) {

        $projects[] = [
            'id' =>
                (int) $row['id'],

            'parent_project_id' =>
                $row['parent_project_id'] !== null
                    ? (int) $row['parent_project_id']
                    : null,

            'name' =>
                $row['name'],

            'description' =>
                $row['description'],

            'filename' =>
                $row['filename'],

            'created_at' =>
                $row['created_at'],

            'updated_at' =>
                $row['updated_at'],

            'last_opened_at' =>
                $row['last_opened_at']
        ];
    }

    response([
        'success' => true,
        'projects' => $projects
    ]);

} catch (Throwable $e) {

    error_log(
        'NGC Project Trash Error: ' .
        $e->getMessage()
    );

    response([
        'success' => false,
        'message' => 'Não foi possível carregar a lixeira.',
        'debug' => $e->getMessage()
    ], 500);
}