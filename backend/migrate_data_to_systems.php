<?php
/**
 * Migra data/users/{id}/projects|library|multicarts
 *      → data/users/{id}/nes/projects|library|multicarts
 * Rodar UMA vez na raiz do site: php backend/migrate_data_to_systems.php
 */
declare(strict_types=1);
require_once __DIR__ . '/config/paths.php';

$usersRoot = APP_ROOT . '/data/users';
if (!is_dir($usersRoot)) {
    fwrite(STDERR, "Sem data/users\n");
    exit(1);
}

foreach (scandir($usersRoot) ?: [] as $uid) {
    if ($uid === '.' || $uid === '..') continue;
    $userDir = $usersRoot . '/' . $uid;
    if (!is_dir($userDir)) continue;

    foreach (['projects', 'library', 'multicarts'] as $folder) {
        $old = $userDir . '/' . $folder;
        $new = $userDir . '/nes/' . $folder;
        if (!is_dir($old)) continue;
        if (is_dir($new)) {
            echo "SKIP já existe: $new\n";
            continue;
        }
        if (!is_dir($userDir . '/nes')) {
            mkdir($userDir . '/nes', 0755, true);
        }
        if (@rename($old, $new)) {
            echo "OK $old → $new\n";
        } else {
            echo "FAIL rename $old\n";
        }
    }
}
echo "Fim.\n";
