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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {

    response([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

$input = json_decode(
    file_get_contents('php://input'),
    true
);

if (!is_array($input)) {

    response([
        'success' => false,
        'message' => 'JSON inválido.'
    ], 422);
}

$projectId =
    filter_var(
        $input['id'] ?? null,
        FILTER_VALIDATE_INT
    );

if (
    $projectId === false ||
    $projectId === null ||
    $projectId <= 0
) {

    response([
        'success' => false,
        'message' => 'ID de projeto inválido.'
    ], 422);
}

$userId =
    (int) $_SESSION['user_id'];

try {

    $pdo = db();

    /*
     * Só permite excluir projeto pertencente
     * ao usuário atual.
     */

    $stmt = $pdo->prepare(
        'SELECT id, name
         FROM projects
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0
         LIMIT 1'
    );

    $stmt->execute([
        ':id' => $projectId,
        ':user_id' => $userId
    ]);

    $project = $stmt->fetch();

    if (!$project) {

        response([
            'success' => false,
            'message' => 'Projeto não encontrado.'
        ], 404);
    }

    /*
     * Soft delete.
     *
     * O arquivo NMS continua existindo.
     */

    $update = $pdo->prepare(
        'UPDATE projects
         SET is_deleted = 1
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0'
    );

    $update->execute([
        ':id' => $projectId,
        ':user_id' => $userId
    ]);

    response([
        'success' => true,
        'message' => 'Projeto enviado para a lixeira.',
        'project' => [
            'id' => (int) $project['id'],
            'name' => $project['name']
        ]
    ]);

} catch (Throwable $e) {

    error_log(
        'NGC Project Delete Error: ' .
        $e->getMessage()
    );

    response([
        'success' => false,
        'message' => 'Não foi possível excluir o projeto.',
        'debug' => $e->getMessage()
    ], 500);
}