<?php
declare(strict_types=1);

/**
 * Biblioteca pessoal do usuário: .nsound e .tile
 * data/users/{uid}/library/{sounds|tiles}/{id}.{ext}
 */

function library_json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function library_user_id(): int
{
    return (int) ($_SESSION['user_id'] ?? 0);
}

/** @return 'sound'|'tile' */
function library_normalize_type(?string $type): string
{
    $t = strtolower(trim((string) $type));
    if ($t === 'sounds') {
        $t = 'sound';
    }
    if ($t === 'tiles') {
        $t = 'tile';
    }
    if ($t !== 'sound' && $t !== 'tile') {
        library_json_response([
            'success' => false,
            'message' => 'Tipo inválido. Use sound ou tile.'
        ], 400);
    }
    return $t;
}

function library_subdir(string $type): string
{
    return $type === 'tile' ? 'tiles' : 'sounds';
}

function library_ext(string $type): string
{
    return $type === 'tile' ? 'tile' : 'nsound';
}

function library_base_dir(int $userId): string
{
    return dirname(__DIR__, 2)
        . DIRECTORY_SEPARATOR . 'data'
        . DIRECTORY_SEPARATOR . 'users'
        . DIRECTORY_SEPARATOR . $userId
        . DIRECTORY_SEPARATOR . 'library';
}

function library_type_dir(int $userId, string $type): string
{
    return library_base_dir($userId)
        . DIRECTORY_SEPARATOR
        . library_subdir($type);
}

function library_ensure_dirs(int $userId): void
{
    $base = library_base_dir($userId);
    $sounds = $base . DIRECTORY_SEPARATOR . 'sounds';
    $tiles = $base . DIRECTORY_SEPARATOR . 'tiles';
    foreach ([$base, $sounds, $tiles] as $dir) {
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new RuntimeException('Não foi possível criar pasta da biblioteca.');
        }
    }
}

function library_safe_id(string $id): string
{
    $id = preg_replace('/[^a-zA-Z0-9_\-]/', '', $id) ?? '';
    return substr($id, 0, 80);
}

function library_file_path(int $userId, string $type, string $id): string
{
    $safe = library_safe_id($id);
    if ($safe === '') {
        library_json_response([
            'success' => false,
            'message' => 'ID inválido.'
        ], 400);
    }
    return library_type_dir($userId, $type)
        . DIRECTORY_SEPARATOR
        . $safe
        . '.'
        . library_ext($type);
}

/**
 * Extrai nome amigável do documento JSON.
 */
function library_doc_name(array $doc, string $fallback = 'sem-titulo'): string
{
    if (!empty($doc['name']) && is_string($doc['name'])) {
        return trim($doc['name']);
    }
    if (!empty($doc['items'][0]['name']) && is_string($doc['items'][0]['name'])) {
        return trim($doc['items'][0]['name']);
    }
    if (!empty($doc['item']['name']) && is_string($doc['item']['name'])) {
        return trim($doc['item']['name']);
    }
    return $fallback;
}
