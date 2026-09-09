<?php
declare(strict_types=1);
session_start();
if(empty($_SESSION['authenticated'])||empty($_SESSION['user_id'])){
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(401);
    echo json_encode(['success'=>false,'message'=>'Autenticação necessária.'],JSON_UNESCAPED_UNICODE);
    exit;
}
