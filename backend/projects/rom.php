<?php
declare(strict_types=1);

/**
 * GET backend/projects/rom.php?id=N
 * Serve data/users/{uid}/projects/{id}/game.nes (somente dono).
 * Não é repositório público — exige sessão.
 */

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/../config/database.php';

$userId = (int) ($_SESSION['user_id'] ?? 0);
$projectId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

if ($projectId === false || $projectId <= 0) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'ID inválido.']);
    exit;
}

try {
    $pdo = db();
    $stmt = $pdo->prepare(
        'SELECT id, name, is_deleted
         FROM projects
         WHERE id = :id AND user_id = :user_id
         LIMIT 1'
    );
    $stmt->execute([
        ':id' => $projectId,
        ':user_id' => $userId,
    ]);
    $project = $stmt->fetch();
    if (!$project || (int) $project['is_deleted'] === 1) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'message' => 'Projeto não encontrado.']);
        exit;
    }

    $path = dirname(__DIR__, 2) .
        DIRECTORY_SEPARATOR . 'data' .
        DIRECTORY_SEPARATOR . 'users' .
        DIRECTORY_SEPARATOR . $userId .
        DIRECTORY_SEPARATOR . 'projects' .
        DIRECTORY_SEPARATOR . $projectId .
        DIRECTORY_SEPARATOR . 'game.nes';

    if (!is_file($path)) {
        http_response_code(404);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'success' => false,
            'message' => 'Este projeto ainda não tem game.nes. Faça um Build ROM no editor.',
        ]);
        exit;
    }

    $safeName = preg_replace('/[^a-zA-Z0-9_\-]+/', '_', (string) $project['name']) ?: 'game';
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . (string) filesize($path));
    header('Content-Disposition: attachment; filename="' . $safeName . '.nes"');
    header('Cache-Control: private, no-store');
    readfile($path);
    exit;
} catch (Throwable $e) {
    error_log('rom.php: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Erro ao ler a ROM.']);
}
