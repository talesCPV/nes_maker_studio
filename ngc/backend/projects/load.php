<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth/auth_check.php';
require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json; charset=utf-8');


function response(
    array $data,
    int $status = 200
): never {

    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE |
        JSON_UNESCAPED_SLASHES
    );

    exit;
}


/*
 * Somente GET.
 */

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {

    response([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}


/*
 * ID do projeto.
 *
 * Exemplo:
 *
 * load.php?id=12
 */

$projectId =
    filter_input(
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


$userId =
    (int) $_SESSION['user_id'];


try {

    $pdo = db();


    /*
     * IMPORTANTE:
     *
     * O projeto só pode ser carregado pelo
     * usuário que é seu proprietário.
     *
     * Também ignoramos projetos na lixeira.
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

        ':id' =>
            $projectId,

        ':user_id' =>
            $userId
    ]);


    $project =
        $stmt->fetch();


    if (!$project) {

        response([
            'success' => false,
            'message' => 'Projeto não encontrado.'
        ], 404);
    }


    /*
     * Nome do arquivo vem do banco.
     *
     * Não aceitamos caminho enviado pelo navegador.
     */

    $filename =
        basename(
            (string) $project['filename']
        );


    if ($filename === '') {

        response([
            'success' => false,
            'message' =>
                'O projeto não possui arquivo NMS.'
        ], 500);
    }


    /*
     * Caminho físico:
     *
     * data/
     *   users/
     *     USER_ID/
     *       projects/
     *         PROJECT_ID/
     *           filename.nms
     */

    $projectDir =
        dirname(__DIR__, 2) .
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


    $nmsPath =
        $projectDir .
        DIRECTORY_SEPARATOR .
        $filename;


    /*
     * Segurança adicional:
     *
     * O arquivo precisa existir e estar
     * dentro da pasta do projeto.
     */

    if (!is_file($nmsPath)) {

        response([
            'success' => false,
            'message' =>
                'Arquivo do projeto não encontrado.'
        ], 404);
    }


    /*
     * Lê o NMS.
     */

    $contents =
        file_get_contents($nmsPath);


    if ($contents === false) {

        response([
            'success' => false,
            'message' =>
                'Não foi possível ler o arquivo do projeto.'
        ], 500);
    }


    /*
     * Valida o JSON.
     */

    $nms =
        json_decode(
            $contents,
            true
        );


    if (
        !is_array($nms) ||
        json_last_error() !== JSON_ERROR_NONE
    ) {

        response([
            'success' => false,
            'message' =>
                'O arquivo NMS contém JSON inválido.'
        ], 500);
    }


    /*
     * Atualiza o último acesso.
     *
     * Não fazemos isso antes da leitura para
     * evitar alterar o banco se o arquivo estiver
     * corrompido ou ausente.
     */

    $update =
        $pdo->prepare(
            'UPDATE projects
             SET last_opened_at = NOW()
             WHERE id = :id
               AND user_id = :user_id'
        );


    $update->execute([

        ':id' =>
            $projectId,

        ':user_id' =>
            $userId
    ]);


    /*
     * Retorno.
     */

    response([

        'success' =>
            true,

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

        /*
         * Aqui está o projeto NMS real.
         *
         * Mais adiante o editor NGC usará
         * diretamente este objeto para reconstruir
         * o AppState.
         */

        'nms' =>
            $nms

    ]);


} catch (Throwable $e) {

    error_log(
        'NGC Project Load Error: ' .
        $e->getMessage()
    );


    response([

        'success' =>
            false,

        'message' =>
            'Não foi possível carregar o projeto.',

        /*
         * Temporário durante desenvolvimento.
         * Remover antes da produção.
         */

        'debug' =>
            $e->getMessage()

    ], 500);
}