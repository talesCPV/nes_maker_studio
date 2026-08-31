<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/../config/database.php';

/**
 * GET  ?id=N  → serve thumbnail.png (ou 404)
 * POST JSON:
 *   { project_id, image, force? } → grava thumbnail.png
 *   { project_id, action: "clear" } → remove thumbnail.png
 */

function jsonResponse(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function projectDir(int $userId, int $projectId): string
{
    return dirname(__DIR__, 2) .
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
}

function assertProjectOwned(PDO $pdo, int $userId, int $projectId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, is_deleted
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
        jsonResponse([
            'success' => false,
            'message' => 'Projeto não encontrado.'
        ], 404);
    }
    return $project;
}

$userId = (int) $_SESSION['user_id'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = db();

    if ($method === 'GET') {
        $projectId = filter_var(
            $_GET['id'] ?? null,
            FILTER_VALIDATE_INT
        );
        if ($projectId === false || $projectId <= 0) {
            http_response_code(400);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'ID inválido';
            exit;
        }

        assertProjectOwned($pdo, $userId, $projectId);

        $path = projectDir($userId, $projectId) .
            DIRECTORY_SEPARATOR .
            'thumbnail.png';

        if (!is_file($path)) {
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            echo 'Thumbnail não encontrado';
            exit;
        }

        header('Content-Type: image/png');
        header('Content-Length: ' . (string) filesize($path));
        header('Cache-Control: private, max-age=3600');
        readfile($path);
        exit;
    }

    if ($method !== 'POST') {
        jsonResponse([
            'success' => false,
            'message' => 'Método não permitido.'
        ], 405);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '', true);

    if (!is_array($data) || json_last_error() !== JSON_ERROR_NONE) {
        jsonResponse([
            'success' => false,
            'message' => 'JSON inválido.'
        ], 400);
    }

    $projectId = filter_var(
        $data['project_id'] ?? null,
        FILTER_VALIDATE_INT
    );

    if ($projectId === false || $projectId <= 0) {
        jsonResponse([
            'success' => false,
            'message' => 'ID de projeto inválido.'
        ], 422);
    }

    $project = assertProjectOwned($pdo, $userId, $projectId);

    $dir = projectDir($userId, $projectId);
    $thumbPath = $dir . DIRECTORY_SEPARATOR . 'thumbnail.png';

    /*
     * Limpar thumbnail (volta ao cartucho padrão no dashboard).
     * Permitido mesmo com projeto na lixeira.
     */
    $action = isset($data['action']) ? (string) $data['action'] : '';
    if ($action === 'clear') {
        clearstatcache(true, $thumbPath);
        $removed = false;
        if (is_file($thumbPath)) {
            @chmod($thumbPath, 0666);
            if (!@unlink($thumbPath)) {
                jsonResponse([
                    'success' => false,
                    'message' => 'Não foi possível remover o thumbnail no servidor.',
                    'debug' => $thumbPath
                ], 500);
            }
            clearstatcache(true, $thumbPath);
            if (is_file($thumbPath)) {
                jsonResponse([
                    'success' => false,
                    'message' => 'Thumbnail ainda existe após tentativa de remoção.',
                    'debug' => $thumbPath
                ], 500);
            }
            $removed = true;
        }
        jsonResponse([
            'success' => true,
            'cleared' => true,
            'removed' => $removed,
            'message' => $removed
                ? 'Thumbnail removido.'
                : 'Nenhum thumbnail para remover.'
        ]);
    }

    if ((int) $project['is_deleted'] === 1) {
        jsonResponse([
            'success' => false,
            'message' => 'Projeto está na lixeira.'
        ], 409);
    }

    /*
     * force=true: upload manual do usuário (pode sobrescrever).
     * force=false/ausente: só grava se ainda não existir
     * (ex.: gerado automaticamente no Build).
     */
    $force = !empty($data['force']);

    if (!$force && is_file($thumbPath)) {
        jsonResponse([
            'success' => true,
            'skipped' => true,
            'message' => 'Thumbnail já existe; nada foi alterado.'
        ]);
    }

    $image = $data['image'] ?? '';
    if (!is_string($image) || $image === '') {
        jsonResponse([
            'success' => false,
            'message' => 'Imagem não enviada.'
        ], 422);
    }

    // data:image/png;base64,... ou base64 puro
    if (preg_match('#^data:image/(png|jpeg|jpg);base64,#i', $image, $m)) {
        $image = substr($image, strpos($image, ',') + 1);
        $ext = strtolower($m[1]);
        if ($ext === 'jpg') {
            $ext = 'jpeg';
        }
    } else {
        $ext = 'png';
    }

    $binary = base64_decode($image, true);
    if ($binary === false || strlen($binary) < 32) {
        jsonResponse([
            'success' => false,
            'message' => 'Imagem inválida.'
        ], 422);
    }

    // Limite ~1.5MB
    if (strlen($binary) > 1_500_000) {
        jsonResponse([
            'success' => false,
            'message' => 'Imagem muito grande.'
        ], 422);
    }

    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        jsonResponse([
            'success' => false,
            'message' => 'Não foi possível criar a pasta do projeto.'
        ], 500);
    }

    // Sempre salva como PNG no destino padrão
    $written = file_put_contents($thumbPath, $binary, LOCK_EX);
    if ($written === false) {
        jsonResponse([
            'success' => false,
            'message' => 'Falha ao gravar thumbnail.'
        ], 500);
    }

    jsonResponse([
        'success' => true,
        'skipped' => false,
        'message' => 'Thumbnail salvo.'
    ]);

} catch (Throwable $e) {
    error_log('NGC Thumbnail Error: ' . $e->getMessage());
    jsonResponse([
        'success' => false,
        'message' => 'Erro ao processar thumbnail.',
        'debug' => $e->getMessage()
    ], 500);
}
