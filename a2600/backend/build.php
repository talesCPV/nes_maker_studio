<?php
declare(strict_types=1);

/**
 * POST a2600/backend/build.php
 * Body JSON: { "project_id": N }  OU  { "project": { ...agc... } }
 * Gera ASM (DASM) a partir do projeto AGC.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once dirname(__DIR__, 2) . '/backend/auth/auth_check.php';
require_once dirname(__DIR__, 2) . '/backend/config/database.php';
require_once dirname(__DIR__, 2) . '/backend/config/paths.php';
require_once __DIR__ . '/src/AgcBuilder.php';

function agc_build_json(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    agc_build_json(['success' => false, 'message' => 'Método não permitido.'], 405);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);
if (!is_array($body)) {
    agc_build_json(['success' => false, 'message' => 'JSON inválido.'], 400);
}

$userId = (int)($_SESSION['user_id'] ?? 0);
$project = null;
$projectId = (int)($body['project_id'] ?? 0);

if (isset($body['project']) && is_array($body['project'])) {
    $project = $body['project'];
} elseif ($projectId > 0) {
    try {
        $pdo = db();
        $stmt = $pdo->prepare(
            'SELECT id, filename, name FROM projects
             WHERE id = :id AND user_id = :uid AND is_deleted = 0
               AND (system = :sys OR system IS NULL)
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $projectId,
            ':uid' => $userId,
            ':sys' => 'A2600',
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            agc_build_json(['success' => false, 'message' => 'Projeto não encontrado.'], 404);
        }
        $dir = user_projects_dir($userId, 'a2600') . DIRECTORY_SEPARATOR . $projectId;
        $fn = (string)($row['filename'] ?? '');
        if ($fn === '') {
            $fn = 'project_' . $projectId . '.agc';
        }
        $path = $dir . DIRECTORY_SEPARATOR . $fn;
        if (!is_file($path)) {
            // tenta qualquer .agc na pasta
            $found = glob($dir . DIRECTORY_SEPARATOR . '*.agc') ?: [];
            $path = $found[0] ?? '';
        }
        if ($path === '' || !is_file($path)) {
            agc_build_json(['success' => false, 'message' => 'Arquivo .agc não encontrado no disco.'], 404);
        }
        $json = json_decode((string)file_get_contents($path), true);
        if (!is_array($json)) {
            agc_build_json(['success' => false, 'message' => 'AGC inválido.'], 400);
        }
        $project = $json;
        if (empty($project['name']) && !empty($row['name'])) {
            $project['name'] = $row['name'];
        }
    } catch (Throwable $e) {
        error_log('AGC build: ' . $e->getMessage());
        agc_build_json(['success' => false, 'message' => 'Erro ao carregar projeto.', 'debug' => $e->getMessage()], 500);
    }
} else {
    agc_build_json(['success' => false, 'message' => 'Informe project_id ou project.'], 400);
}

try {
    $result = AgcBuilder::build($project);
    agc_build_json([
        'success' => true,
        'asm' => $result['asm'],
        'romSize' => $result['romSize'],
        'tv' => $result['tv'],
        'meta' => $result['meta'],
        'scoreEnabled' => $result['scoreEnabled'],
        'bytes_asm' => strlen($result['asm']),
    ]);
} catch (Throwable $e) {
    error_log('AGC build gen: ' . $e->getMessage());
    agc_build_json(['success' => false, 'message' => 'Falha ao gerar ASM.', 'debug' => $e->getMessage()], 500);
}
