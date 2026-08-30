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
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw ?: '', true);

if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
    response([
        'success' => false,
        'message' => 'JSON inválido.'
    ], 400);
}

$projectId = filter_var(
    $data['id'] ?? $data['project_id'] ?? null,
    FILTER_VALIDATE_INT
);

if ($projectId === false || $projectId <= 0) {
    response([
        'success' => false,
        'message' => 'ID de projeto inválido.'
    ], 422);
}

$name = trim((string) ($data['name'] ?? ''));
$description = trim((string) ($data['description'] ?? ''));

if ($name === '') {
    response([
        'success' => false,
        'message' => 'Informe o nome do projeto.'
    ], 422);
}

if (mb_strlen($name) > 150) {
    response([
        'success' => false,
        'message' => 'O nome do projeto é muito grande.'
    ], 422);
}

if (mb_strlen($description) > 65535) {
    response([
        'success' => false,
        'message' => 'A descrição é muito grande.'
    ], 422);
}

$userId = (int) $_SESSION['user_id'];

try {
    $pdo = db();

    $stmt = $pdo->prepare(
        'SELECT id, name, description, filename, is_deleted
         FROM projects
         WHERE id = :id
           AND user_id = :user_id
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

    if ((int) $project['is_deleted'] === 1) {
        response([
            'success' => false,
            'message' => 'Projeto está na lixeira.'
        ], 409);
    }

    $update = $pdo->prepare(
        'UPDATE projects
         SET name = :name,
             description = :description,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = :id
           AND user_id = :user_id'
    );
    $update->execute([
        ':name' => $name,
        ':description' => $description,
        ':id' => $projectId,
        ':user_id' => $userId
    ]);

    /*
     * Mantém o .nms sincronizado com o banco
     * (name / description na raiz do JSON).
     */
    $nmsPath = dirname(__DIR__, 2) .
        DIRECTORY_SEPARATOR .
        'data' .
        DIRECTORY_SEPARATOR .
        'users' .
        DIRECTORY_SEPARATOR .
        $userId .
        DIRECTORY_SEPARATOR .
        'projects' .
        DIRECTORY_SEPARATOR .
        $projectId .
        DIRECTORY_SEPARATOR .
        $project['filename'];

    if (is_file($nmsPath)) {
        $rawNms = file_get_contents($nmsPath);
        $nms = json_decode($rawNms ?: '', true);
        if (is_array($nms)) {
            $nms['name'] = $name;
            $nms['description'] = $description;
            $encoded = json_encode(
                $nms,
                JSON_UNESCAPED_UNICODE |
                JSON_UNESCAPED_SLASHES |
                JSON_PRETTY_PRINT
            );
            if ($encoded !== false) {
                file_put_contents($nmsPath, $encoded, LOCK_EX);
            }
        }
    }

    response([
        'success' => true,
        'message' => 'Projeto atualizado.',
        'project' => [
            'id' => $projectId,
            'name' => $name,
            'description' => $description
        ]
    ]);

} catch (Throwable $e) {
    error_log('NGC Project Update Error: ' . $e->getMessage());
    response([
        'success' => false,
        'message' => 'Não foi possível atualizar o projeto.',
        'debug' => $e->getMessage()
    ], 500);
}
