<?php
declare(strict_types=1);

const DB_HOST = '108.167.132.56';
const DB_PORT = '3306';
const DB_NAME = 'plan3411_nms';
const DB_USER = 'plan3411_developer';
const DB_PASSWORD = 'Xspider@';

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        error_log('NGC Database Error: ' . $e->getMessage());
        throw new RuntimeException('Não foi possível conectar ao banco de dados.');
    }
}
