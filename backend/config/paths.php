<?php
declare(strict_types=1);

/** Raiz do site (pasta que contém backend/, nes/, data/) */
if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__DIR__, 2));
}

/** Raiz do produto NES */
if (!defined('NES_ROOT')) {
    define('NES_ROOT', APP_ROOT . DIRECTORY_SEPARATOR . 'nes');
}

/**
 * data/users/{userId}/{system}/...
 * system: nes | a2600 | ...
 */
function user_system_dir(int|string $userId, string $system = 'nes'): string {
    return APP_ROOT
        . DIRECTORY_SEPARATOR . 'data'
        . DIRECTORY_SEPARATOR . 'users'
        . DIRECTORY_SEPARATOR . $userId
        . DIRECTORY_SEPARATOR . $system;
}

function user_projects_dir(int|string $userId, string $system = 'nes'): string {
    return user_system_dir($userId, $system) . DIRECTORY_SEPARATOR . 'projects';
}

function user_library_dir(int|string $userId, string $system = 'nes'): string {
    return user_system_dir($userId, $system) . DIRECTORY_SEPARATOR . 'library';
}

function user_multicarts_dir(int|string $userId, string $system = 'nes'): string {
    return user_system_dir($userId, $system) . DIRECTORY_SEPARATOR . 'multicarts';
}
