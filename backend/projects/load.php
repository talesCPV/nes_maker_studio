<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');


function response(array $data, int $status = 200): never
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    exit;
}


/*
 * ---------------------------------------------------------
 * MÉTODO
 * ---------------------------------------------------------
 */

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {

    response([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}


/*
 * ---------------------------------------------------------
 * PROJETO
 * ---------------------------------------------------------
 */

$projectId = filter_input(
    INPUT_GET,
    'id',
    FILTER_VALIDATE_INT
);


if (
    $projectId === false ||
    $projectId === null ||
    $projectId <= 0
) {

    response([
        'success' => false,
        'message' => 'ID de projeto inválido.'
    ], 422);
}


/*
 * ---------------------------------------------------------
 * USUÁRIO
 * ---------------------------------------------------------
 */

$userId = (int) $_SESSION['user_id'];


try {

    $pdo = db();


    /*
     * Somente o proprietário pode carregar
     * o projeto.
     *
     * Projetos na lixeira não são carregados.
     */

    $stmt = $pdo->prepare(
        'SELECT
            id,
            user_id,
            parent_project_id,
            name,
            description,
            filename,
            is_deleted,
            created_at,
            updated_at,
            last_opened_at
         FROM projects
         WHERE id = :id
           AND user_id = :user_id
           AND is_deleted = 0
         LIMIT 1'
    );


    $stmt->execute([
        ':id' => $projectId,
        ':user_id' => $userId
    ]);


    $project = $stmt->fetch(PDO::FETCH_ASSOC);


    if (!$project) {

        response([
            'success' => false,
            'message' => 'Projeto não encontrado.'
        ], 404);
    }


    /*
     * -----------------------------------------------------
     * NOME DO ARQUIVO
     * -----------------------------------------------------
     *
     * O filename vem do banco, mas usamos basename()
     * para impedir que ele seja utilizado como caminho.
     */

    $filename = basename(
        (string) $project['filename']
    );


    if ($filename === '') {

        response([
            'success' => false,
            'message' => 'Arquivo NMS não definido.'
        ], 500);
    }


    /*
     * -----------------------------------------------------
     * CAMINHO DO PROJETO
     * -----------------------------------------------------
     */

    $projectDir =
        dirname(__DIR__, 2)
        . DIRECTORY_SEPARATOR . 'data'
        . DIRECTORY_SEPARATOR . 'users'
        . DIRECTORY_SEPARATOR . $userId
        . DIRECTORY_SEPARATOR . 'projects'
        . DIRECTORY_SEPARATOR . $projectId;


    $nmsPath =
        $projectDir
        . DIRECTORY_SEPARATOR
        . $filename;


    /*
     * -----------------------------------------------------
     * ARQUIVO
     * -----------------------------------------------------
     */

    if (!is_file($nmsPath)) {

        response([
            'success' => false,
            'message' =>
                'O arquivo NMS do projeto não foi encontrado.'
        ], 404);
    }


    $contents =
        file_get_contents($nmsPath);


    if ($contents === false) {

        response([
            'success' => false,
            'message' =>
                'Não foi possível ler o arquivo NMS.'
        ], 500);
    }


    /*
     * -----------------------------------------------------
     * JSON
     * -----------------------------------------------------
     */

    try {

        $nms = json_decode(
            $contents,
            true,
            512,
            JSON_THROW_ON_ERROR
        );

    } catch (JsonException $e) {

        response([
            'success' => false,
            'message' =>
                'O arquivo NMS possui JSON inválido.',
            'debug' =>
                $e->getMessage()
        ], 500);
    }


    if (!is_array($nms)) {

        response([
            'success' => false,
            'message' =>
                'O conteúdo do NMS é inválido.'
        ], 500);
    }


    /*
     * -----------------------------------------------------
     * ATUALIZA ÚLTIMO ACESSO
     * -----------------------------------------------------
     */

    $update = $pdo->prepare(
        'UPDATE projects
         SET last_opened_at = NOW()
         WHERE id = :id
           AND user_id = :user_id'
    );


    $update->execute([
        ':id' => $projectId,
        ':user_id' => $userId
    ]);


    /*
     * -----------------------------------------------------
     * RETORNO
     * -----------------------------------------------------
     *
     * O objeto "nms" contém o projeto completo.
     */

    response([

        'success' => true,

        'project' => [

            'id' =>
                (int) $project['id'],

            'name' =>
                $project['name'],

            'description' =>
                $project['description'],

            'filename' =>
                $filename,

            'parent_project_id' =>
                $project['parent_project_id'] !== null
                    ? (int) $project['parent_project_id']
                    : null,

            'created_at' =>
                $project['created_at'],

            'updated_at' =>
                $project['updated_at'],

            'last_opened_at' =>
                $project['last_opened_at']

        ],

        'nms' =>
            $nms

    ]);


} catch (Throwable $e) {

    error_log(
        'NGC Project Load Error: ' .
        $e->getMessage()
    );


    response([

        'success' => false,

        'message' =>
            'Não foi possível carregar o projeto.',

        'debug' =>
            $e->getMessage()

    ], 500);
}