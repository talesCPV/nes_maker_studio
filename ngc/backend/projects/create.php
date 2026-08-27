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
 * DADOS RECEBIDOS
 * ---------------------------------------------------------
 */

$raw =
    file_get_contents('php://input');


$data =
    json_decode(
        $raw ?: '',
        true
    );


if (!is_array($data)) {

    response([
        'success' => false,
        'message' => 'JSON inválido.'
    ], 400);
}


$name =
    trim(
        (string) ($data['name'] ?? '')
    );


$description =
    trim(
        (string) ($data['description'] ?? '')
    );


if ($name === '') {

    response([
        'success' => false,
        'message' => 'Informe o nome do projeto.'
    ], 422);
}


if (mb_strlen($name) > 150) {

    response([
        'success' => false,
        'message' => 'O nome do projeto é muito grande.'
    ], 422);
}


if (mb_strlen($description) > 65535) {

    response([
        'success' => false,
        'message' => 'A descrição é muito grande.'
    ], 422);
}


/*
 * ---------------------------------------------------------
 * USUÁRIO
 * ---------------------------------------------------------
 */

$userId =
    (int) $_SESSION['user_id'];


$userName =
    trim(
        (string) (
            $_SESSION['user_name'] ??
            ''
        )
    );


/*
 * ---------------------------------------------------------
 * TEMPLATE
 * ---------------------------------------------------------
 *
 * Um único template mestre é utilizado para novos projetos.
 *
 * IMPORTANTE:
 *
 * Não usamos str_replace().
 *
 * O arquivo é interpretado como JSON e somente os campos
 * de metadata são alterados.
 */

$templatePath =
    dirname(__DIR__) .
    DIRECTORY_SEPARATOR .
    'templates' .
    DIRECTORY_SEPARATOR .
    'new-game.nms';


if (!is_file($templatePath)) {

    response([
        'success' => false,
        'message' =>
            'Template new-game.nms não encontrado no servidor.'
    ], 500);
}


$templateContents =
    file_get_contents($templatePath);


if ($templateContents === false) {

    response([
        'success' => false,
        'message' =>
            'Não foi possível ler o template do projeto.'
    ], 500);
}


$template =
    json_decode(
        $templateContents,
        true
    );


if (
    !is_array($template) ||
    json_last_error() !== JSON_ERROR_NONE
) {

    response([
        'success' => false,
        'message' =>
            'O template new-game.nms possui JSON inválido.'
    ], 500);
}


/*
 * ---------------------------------------------------------
 * VALIDAR ESTRUTURA MÍNIMA DO TEMPLATE
 * ---------------------------------------------------------
 *
 * O formato NMS utiliza os campos diretamente na raiz.
 * Não existe um objeto "metadata".
 */

 if (
    !array_key_exists('name', $template) ||
    !array_key_exists('author', $template) ||
    !array_key_exists('description', $template)
) {

    response([
        'success' => false,
        'message' =>
            'O template NMS não possui os campos básicos de projeto.'
    ], 500);
}


/*
 * ---------------------------------------------------------
 * PERSONALIZAR PROJETO
 * ---------------------------------------------------------
 *
 * IMPORTANTE:
 *
 * O NMS inteiro veio do template.
 *
 * Alteramos SOMENTE:
 *
 *   name
 *   author
 *   description
 *
 * CHR, palettes, phases, events, gameConfig,
 * sons etc. permanecem os do template.
 */

$template['name'] =
    $name;


$template['description'] =
    $description;


$template['author'] =
    $userName;

/*
 * ---------------------------------------------------------
 * CONECTAR AO BANCO
 * ---------------------------------------------------------
 */

$pdo = null;


try {

    $pdo =
        db();


    $pdo->beginTransaction();


    /*
     * Nome físico do arquivo.
     *
     * Não utilizamos o nome do projeto diretamente no nome
     * do arquivo para evitar problemas com caracteres especiais,
     * espaços, barras etc.
     */

    $filename =
        'project_' .
        bin2hex(
            random_bytes(8)
        ) .
        '.nms';


    /*
     * -----------------------------------------------------
     * INSERT
     * -----------------------------------------------------
     */

    $stmt =
        $pdo->prepare(
            'INSERT INTO projects
            (
                user_id,
                parent_project_id,
                name,
                description,
                filename
            )
            VALUES
            (
                :user_id,
                NULL,
                :name,
                :description,
                :filename
            )'
        );


    $stmt->execute([

        ':user_id' =>
            $userId,

        ':name' =>
            $name,

        ':description' =>
            $description,

        ':filename' =>
            $filename
    ]);


    $projectId =
        (int) $pdo->lastInsertId();


    /*
     * -----------------------------------------------------
     * DIRETÓRIO DO PROJETO
     * -----------------------------------------------------
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


    if (
        !is_dir($projectDir) &&
        !mkdir(
            $projectDir,
            0755,
            true
        )
    ) {

        throw new RuntimeException(
            'Não foi possível criar a pasta do projeto.'
        );
    }


    /*
     * -----------------------------------------------------
     * GERAR NMS
     * -----------------------------------------------------
     */

    $nms =
        json_encode(
            $template,

            JSON_PRETTY_PRINT |
            JSON_UNESCAPED_UNICODE |
            JSON_UNESCAPED_SLASHES |
            JSON_THROW_ON_ERROR
        );


    /*
     * -----------------------------------------------------
     * GRAVAR ARQUIVO
     * -----------------------------------------------------
     */

    $nmsPath =
        $projectDir .
        DIRECTORY_SEPARATOR .
        $filename;


    $written =
        file_put_contents(
            $nmsPath,
            $nms,
            LOCK_EX
        );


    if ($written === false) {

        throw new RuntimeException(
            'Não foi possível gravar o arquivo NMS.'
        );
    }


    /*
     * -----------------------------------------------------
     * FINALIZAR TRANSAÇÃO
     * -----------------------------------------------------
     */

    $pdo->commit();


    /*
     * -----------------------------------------------------
     * RETORNO
     * -----------------------------------------------------
     */

    response([

        'success' =>
            true,

        'message' =>
            'Projeto criado com sucesso.',

        'project' => [

            'id' =>
                $projectId,

            'name' =>
                $name,

            'description' =>
                $description,

            'filename' =>
                $filename

        ]

    ], 201);


} catch (Throwable $e) {

    /*
     * Rollback caso o INSERT ainda esteja em uma transação.
     */

    if (
        $pdo instanceof PDO &&
        $pdo->inTransaction()
    ) {

        $pdo->rollBack();
    }


    /*
     * Se o arquivo/pasta já foi criado e alguma etapa
     * posterior falhou, tentamos limpar o projeto físico.
     */

    if (
        isset($projectDir) &&
        is_dir($projectDir)
    ) {

        if (
            isset($nmsPath) &&
            is_file($nmsPath)
        ) {

            @unlink($nmsPath);
        }

        @rmdir($projectDir);
    }


    error_log(
        'NGC Project Create Error: ' .
        $e->getMessage()
    );


    response([

        'success' =>
            false,

        'message' =>
            'Não foi possível criar o projeto.',

        /*
         * Temporário durante desenvolvimento.
         * Retiraremos antes da produção.
         */

        'debug' =>
            $e->getMessage()

    ], 500);
}