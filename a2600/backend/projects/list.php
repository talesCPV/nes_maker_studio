<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

/**
 * Lista projetos do sistema A2600.
 * Filtro por coluna `system` feito em PHP (compatível se a coluna
 * ainda não existir ou tiver valor legado).
 */
try {
    $root = dirname(__DIR__, 3);
    $auth = $root . '/backend/auth/auth_check.php';
    $db   = $root . '/backend/config/database.php';

    if (!is_file($auth)) {
        throw new RuntimeException('auth_check.php não encontrado em: ' . $auth);
    }
    if (!is_file($db)) {
        throw new RuntimeException('database.php não encontrado em: ' . $db);
    }

    require_once $auth;
    require_once $db;

    $pdo = db();
    $userId = (int) $_SESSION['user_id'];

    // SELECT amplo — não depende da coluna system existir
    $stmt = $pdo->prepare(
        "SELECT
            p.id,
            p.name,
            p.description,
            p.parent_project_id,
            p.filename,
            p.created_at,
            p.updated_at,
            parent.name AS parent_name
         FROM projects p
         LEFT JOIN projects parent
           ON parent.id = p.parent_project_id
          AND parent.user_id = p.user_id
         WHERE p.user_id = :user_id
           AND p.is_deleted = 0
         ORDER BY p.updated_at DESC, p.id DESC"
    );
    $stmt->execute([':user_id' => $userId]);
    $rows = $stmt->fetchAll();

    // Descobre se a coluna system veio no resultado (SELECT *) — aqui buscamos à parte se preciso
    $hasSystemCol = false;
    try {
        $chk = $pdo->query("SHOW COLUMNS FROM projects LIKE 'system'");
        $hasSystemCol = $chk && $chk->fetch() ? true : false;
    } catch (Throwable $e) {
        $hasSystemCol = false;
    }

    $systemById = [];
    if ($hasSystemCol && $rows) {
        $ids = array_map(static fn($r) => (int)$r['id'], $rows);
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $s = $pdo->prepare("SELECT id, `system` FROM projects WHERE id IN ($in)");
            $s->execute($ids);
            foreach ($s->fetchAll() as $sr) {
                $systemById[(int)$sr['id']] = $sr['system'];
            }
        }
    }

    $baseDir = $root .
        DIRECTORY_SEPARATOR . 'data' .
        DIRECTORY_SEPARATOR . 'users' .
        DIRECTORY_SEPARATOR . $userId .
        DIRECTORY_SEPARATOR . 'a2600' .
        DIRECTORY_SEPARATOR . 'projects';

    $projects = [];
    $want = 'A2600';
    $ext = 'agc';

    foreach ($rows as $row) {
        $projectId = (int) $row['id'];
        $sys = $systemById[$projectId] ?? null;
        $filename = (string) ($row['filename'] ?? '');

        // Prioridade: coluna system; senão extensão do arquivo
        if ($sys !== null && $sys !== '') {
            $isMatch = (strcasecmp((string) $sys, 'A2600') === 0);
        } else {
            $isMatch = (bool) preg_match('/\.agc$/i', $filename);
        }

        if (!$isMatch) {
            continue;
        }

        $projDir = $baseDir . DIRECTORY_SEPARATOR . $projectId;
        $thumbPath = $projDir . DIRECTORY_SEPARATOR . 'thumbnail.png';
        $romPath = $projDir . DIRECTORY_SEPARATOR . 'game.bin';

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
            'has_rom' => is_file($romPath),
            'rom_size' => is_file($romPath) ? (int) filesize($romPath) : 0,
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
            'system' => $sys ?: $want,
        ];
    }

    echo json_encode([
        'success' => true,
        'projects' => $projects,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

} catch (Throwable $e) {
    error_log('AGC Project List Error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Não foi possível carregar os projetos.',
        'detail' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
