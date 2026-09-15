<?php
header('Content-Type: application/json; charset=utf-8');
require_once dirname(__DIR__, 4) . '/backend/auth/auth_check.php';
$id=preg_replace('/[^A-Za-z0-9_-]/','',$_GET['id']??''); $uid=(string)(int)$_SESSION['user_id'];
$base=dirname(__DIR__,4).'/data/users/'.$uid.'/megadrive/projects/'.$id.'/project.mdg';
if(!$id||!$uid||!is_file($base)){http_response_code(404);echo json_encode(['success'=>false,'message'=>'Projeto não encontrado']);exit;}
$data=json_decode(file_get_contents($base),true); if(!is_array($data)){http_response_code(500);echo json_encode(['success'=>false,'message'=>'Projeto inválido']);exit;}
echo json_encode(['success'=>true,'project'=>$data],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
