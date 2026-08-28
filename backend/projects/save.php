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
 * ---------------------------------------------------------
 * SOMENTE POST
 * ---------------------------------------------------------
 */

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {

    response([
        'success' => false,
        'message' => 'Método não permitido.'
    ], 405);
}


/*
 * ---------------------------------------------------------
 * RECEBER JSON
 * ---------------------------------------------------------
 */

$raw =
    file_get_contents('php://input');


$data =
    json_decode(
        $raw ?: '',
        true
    );


if (
    !is_array($data) ||
    json_last_error() !== JSON_ERROR_NONE
) {

    response([
        'success' => false,
        'message' => 'JSON inválido.'
    ], 400);
}


/*
 * ---------------------------------------------------------
 * PROJETO
 * ---------------------------------------------------------
 */

$projectId =
    filter_var(
        $data['project_id'] ?? null,
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
 * O conteúdo pode vir como objeto/array
 * no campo "nms".
 */

$nms =
    $data['nms'] ?? null;


if (!is_array($nms)) {

    response([
        'success' => false,
        'message' =>
            'O conteúdo NMS não foi enviado corretamente.'
    ], 422);
}


/*
 * ---------------------------------------------------------
 * VALIDAÇÃO MÍNIMA DO NMS
 * ---------------------------------------------------------
 *
 * Não alteramos o conteúdo recebido.
 *
 * Apenas garantimos que é um projeto NMS
 * minimamente válido.
 */

if (
    !array_key_exists('chr', $nms) ||
    !array_key_exists('palettes', $nms)
) {

    response([
        'success' => false,
        'message' =>
            'O arquivo NMS não possui uma estrutura válida.'
    ], 422);
}


/*
 * CHR precisa ser um array.
 */

if (!is_array($nms['chr'])) {

    response([
        'success' => false,
        'message' =>
            'O CHR do projeto é inválido.'
    ], 422);
}


/*
 * ---------------------------------------------------------
 * USUÁRIO
 * ---------------------------------------------------------
 */

$userId =
    (int) $_SESSION['user_id'];


try {

    $pdo =
        db();


    /*
     * -----------------------------------------------------
     * BUSCAR PROJETO
     * -----------------------------------------------------
     *
     * O projeto precisa pertencer ao usuário.
     *
     * Projetos na lixeira não podem ser alterados.
     */

    $stmt =
        $pdo->prepare(
            'SELECT
                id,
                name,
                description,
                filename,
                is_deleted
             FROM projects
             WHERE id = :id
               AND user_id = :user_id
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
     * Projeto na lixeira não pode ser salvo.
     */

    if ((int) $project['is_deleted'] === 1) {

        response([
            'success' => false,
            'message' =>
                'Este projeto está na lixeira.'
        ], 409);
    }


    /*
     * -----------------------------------------------------
     * NOME / DESCRIÇÃO
     * -----------------------------------------------------
     *
     * O nome e a descrição do banco acompanham
     * o conteúdo do NMS.
     */

    $name =
        trim(
            (string) (
                $nms['name'] ??
                $project['name']
            )
        );


    $description =
        trim(
            (string) (
                $nms['description'] ??
                $project['description'] ??
                ''
            )
        );


    if ($name === '') {

        response([
            'success' => false,
            'message' =>
                'O projeto precisa possuir um nome.'
        ], 422);
    }


    if (mb_strlen($name) > 150) {

        response([
            'success' => false,
            'message' =>
                'O nome do projeto é muito grande.'
        ], 422);
    }


    if (mb_strlen($description) > 65535) {

        response([
            'success' => false,
            'message' =>
                'A descrição é muito grande.'
        ], 422);
    }


    /*
     * -----------------------------------------------------
     * NORMALIZAR METADATA
     * -----------------------------------------------------
     *
     * O banco e o arquivo NMS precisam permanecer
     * sincronizados.
     */

    $nms['name'] =
        $name;

    $nms['description'] =
        $description;


    /*
     * -----------------------------------------------------
     * SERIALIZAR NMS
     * -----------------------------------------------------
     */

    $nmsContents =
        json_encode(
            $nms,
            JSON_UNESCAPED_UNICODE |
            JSON_UNESCAPED_SLASHES |
            JSON_PRETTY_PRINT
        );


    if ($nmsContents === false) {

        response([
            'success' => false,
            'message' =>
                'Não foi possível serializar o projeto NMS.'
        ], 500);
    }


    /*
     * -----------------------------------------------------
     * DIRETÓRIO DO PROJETO
     * -----------------------------------------------------
     *
     * data/
     *   users/
     *     USER_ID/
     *       projects/
     *         PROJECT_ID/
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


    /*
     * Cria o diretório caso necessário.
     */

    if (!is_dir($projectDir)) {

        if (
            !mkdir(
                $projectDir,
                0755,
                true
            ) &&
            !is_dir($projectDir)
        ) {

            response([
                'success' => false,
                'message' =>
                    'Não foi possível criar a pasta do projeto.'
            ], 500);
        }
    }


    /*
     * Nome físico vindo do banco.
     *
     * Nunca usamos um caminho enviado pelo navegador.
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


    $nmsPath =
        $projectDir .
        DIRECTORY_SEPARATOR .
        $filename;


    /*
     * -----------------------------------------------------
     * ESCRITA ATÔMICA
     * -----------------------------------------------------
     *
     * Primeiro escrevemos um arquivo temporário.
     * Depois substituímos o NMS original.
     *
     * Isso evita deixar o projeto parcialmente gravado
     * caso ocorra uma interrupção durante a escrita.
     */

    $tempPath =
        $nmsPath .
        '.tmp';


    $bytes =
        file_put_contents(
            $tempPath,
            $nmsContents,
            LOCK_EX
        );


    if (
        $bytes === false ||
        $bytes !== strlen($nmsContents)
    ) {

        @unlink($tempPath);

        response([
            'success' => false,
            'message' =>
                'Não foi possível salvar o arquivo NMS.'
        ], 500);
    }


    /*
     * Substitui o arquivo original.
     */

    if (!rename($tempPath, $nmsPath)) {

        @unlink($tempPath);

        response([
            'success' => false,
            'message' =>
                'Não foi possível finalizar o salvamento do projeto.'
        ], 500);
    }


    /*
     * -----------------------------------------------------
     * ATUALIZAR BANCO
     * -----------------------------------------------------
     */

    $update =
        $pdo->prepare(
            'UPDATE projects
             SET
                name = :name,
                description = :description,
                updated_at = NOW()
             WHERE id = :id
               AND user_id = :user_id
               AND is_deleted = 0'
        );


    $update->execute([

        ':name' =>
            $name,

        ':description' =>
            $description,

        ':id' =>
            $projectId,

        ':user_id' =>
            $userId
    ]);


    /*
     * -----------------------------------------------------
     * BUSCAR DATA ATUALIZADA
     * -----------------------------------------------------
     */

    $stmt =
        $pdo->prepare(
            'SELECT
                updated_at
             FROM projects
             WHERE id = :id
               AND user_id = :user_id
             LIMIT 1'
        );


    $stmt->execute([

        ':id' =>
            $projectId,

        ':user_id' =>
            $userId
    ]);


    $updatedAt =
        $stmt->fetchColumn();


    /*
     * -----------------------------------------------------
     * SUCESSO
     * -----------------------------------------------------
     */

    response([

        'success' =>
            true,

        'message' =>
            'Projeto salvo com sucesso.',

        'project' => [

            'id' =>
                $projectId,

            'name' =>
                $name,

            'description' =>
                $description,

            'filename' =>
                $filename,

            'updated_at' =>
                $updatedAt
        ]

    ]);


} catch (Throwable $e) {

    /*
     * Durante desenvolvimento mantemos o erro
     * para facilitar diagnóstico.
     */

    error_log(
        'NGC Project Save Error: ' .
        $e->getMessage()
    );


    response([

        'success' =>
            false,

        'message' =>
            'Não foi possível salvar o projeto.',

        'debug' =>
            $e->getMessage()

    ], 500);
}