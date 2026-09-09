<?php
declare(strict_types=1); session_start(); header('Content-Type: application/json; charset=utf-8');
if(empty($_SESSION['authenticated'])||empty($_SESSION['user_id'])){http_response_code(401);echo json_encode(['success'=>false,'authenticated'=>false,'message'=>'Usuário não autenticado.'],JSON_UNESCAPED_UNICODE);exit;}
echo json_encode(['success'=>true,'authenticated'=>true,'user'=>['id'=>(int)$_SESSION['user_id'],'name'=>$_SESSION['user_name']??'','email'=>$_SESSION['user_email']??'']],JSON_UNESCAPED_UNICODE);
