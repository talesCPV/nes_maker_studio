<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');

/**
 * Exclusão permanente de projeto que já está na lixeira.
 * Remove registro do banco e a pasta física do projeto.
 */

function response(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function removeDirectory(string $dir): bool
{
    if (!is_dir($dir)) {
        return true;
    }

    $items = scandir($dir);
    if ($items === false) {
        return false;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $item;
        if (is_dir($path)) {
            if (!removeDirectory($path)) {
                return false;
            }
        } else {
            if (!@unlink($path)) {
                return false;
            }
        }
    }

    return @rmdir($dir);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    response([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}

$input = json_decode(
    file_get_contents('php://input') ?: '',
    true
);

if (!is_array($input)) {
    response([
        'success' => false,
        'message' => 'JSON inválido.'
    ], 422);
}

$projectId = filter_var(
    $input['id'] ?? $input['project_id'] ?? null,
    FILTER_VALIDATE_INT
);

if ($projectId === false || $projectId === null || $projectId <= 0) {
    response([
        'success' => false,
        'message' => 'ID de projeto inválido.'
    ], 422);
}

$userId = (int) $_SESSION['user_id'];

try {
    $pdo = db();

    $stmt = $pdo->prepare(
        'SELECT id, name, filename, is_deleted
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

    if ((int) $project['is_deleted'] !== 1) {
        response([
            'success' => false,
            'message' => 'Só é possível excluir permanentemente projetos que estão na lixeira.'
        ], 409);
    }

    $projectDir = dirname(__DIR__, 2) .
        DIRECTORY_SEPARATOR .
        'data' .
        DIRECTORY_SEPARATOR .
        'users' .
        DIRECTORY_SEPARATOR .
        $userId .
        DIRECTORY_SEPARATOR .
        'projects' .
        DIRECTORY_SEPARATOR .
        $projectId;

    $pdo->beginTransaction();

    $del = $pdo->prepare(
        'DELETE FROM projects
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 1'
    );
    $del->execute([
        ':id' => $projectId,
        ':user_id' => $userId
    ]);

    if ($del->rowCount() < 1) {
        $pdo->rollBack();
        response([
            'success' => false,
            'message' => 'Não foi possível excluir o projeto.'
        ], 500);
    }

    $pdo->commit();

    // Pasta física (NMS, thumbnail, etc.) — melhor esforço após o commit
    if (is_dir($projectDir)) {
        if (!removeDirectory($projectDir)) {
            error_log(
                "NGC Purge: registro removido, mas falhou ao apagar pasta: {$projectDir}"
            );
        }
    }

    response([
        'success' => true,
        'message' => 'Projeto excluído permanentemente.',
        'project' => [
            'id' => $projectId,
            'name' => $project['name']
        ]
    ]);

} catch (Throwable $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('NGC Project Purge Error: ' . $e->getMessage());
    response([
        'success' => false,
        'message' => 'Não foi possível excluir o projeto permanentemente.',
        'debug' => $e->getMessage()
    ], 500);
}
