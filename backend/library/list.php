<?php
declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/_helpers.php';

try {
    $userId = library_user_id();
    $type = library_normalize_type($_GET['type'] ?? null);
    library_ensure_dirs($userId);

    $dir = library_type_dir($userId, $type);
    $ext = library_ext($type);
    $items = [];

    $files = glob($dir . DIRECTORY_SEPARATOR . '*.' . $ext) ?: [];
    foreach ($files as $path) {
        $id = pathinfo($path, PATHINFO_FILENAME);
        $raw = @file_get_contents($path);
        $name = $id;
        $format = $type === 'tile' ? 'tile' : 'nsound';
        $extra = [];

        if ($raw !== false && $raw !== '') {
            $doc = json_decode($raw, true);
            if (is_array($doc)) {
                $name = library_doc_name($doc, $id);
                if (!empty($doc['format'])) {
                    $format = (string) $doc['format'];
                }
                if ($type === 'tile') {
                    $extra['metatile_count'] = is_array($doc['metatiles'] ?? null)
                        ? count($doc['metatiles'])
                        : 0;
                    $extra['character_count'] = is_array($doc['characters'] ?? null)
                        ? count($doc['characters'])
                        : 0;
                } else {
                    $extra['item_count'] = is_array($doc['items'] ?? null)
                        ? count($doc['items'])
                        : (isset($doc['item']) ? 1 : 0);
                }
            }
        }

        $items[] = array_merge([
            'id' => $id,
            'type' => $type,
            'name' => $name,
            'format' => $format,
            'size' => is_file($path) ? filesize($path) : 0,
            'updated_at' => is_file($path)
                ? date('c', (int) filemtime($path))
                : null,
        ], $extra);
    }

    usort($items, static function ($a, $b) {
        return strcmp($b['updated_at'] ?? '', $a['updated_at'] ?? '');
    });

    library_json_response([
        'success' => true,
        'type' => $type,
        'items' => $items,
    ]);
} catch (Throwable $e) {
    error_log('NGC Library List: ' . $e->getMessage());
    library_json_response([
        'success' => false,
        'message' => 'Não foi possível listar a biblioteca.',
    ], 500);
}
