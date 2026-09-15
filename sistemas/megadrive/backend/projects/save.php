<?php
header('Content-Type: application/json; charset=utf-8'); require_once dirname(__DIR__, 4) . '/backend/auth/auth_check.php';
$in=json_decode(file_get_contents('php://input'),true); $id=preg_replace('/[^A-Za-z0-9_-]/','',$in['id']??''); $project=$in['project']??null; $uid=(string)(int)$_SESSION['user_id'];
if(!$id||!is_array($project)){http_response_code(400);echo json_encode(['success'=>false,'message'=>'Dados inválidos']);exit;}
$dir=dirname(__DIR__,4).'/data/users/'.$uid.'/megadrive/projects/'.$id; $file=$dir.'/project.mdg'; if(!is_dir($dir))mkdir($dir,0775,true);
$project['id']=$project['id']??$id; $project['updated_at']=date('c'); $json=json_encode($project,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); if($json===false||file_put_contents($file,$json.LPHP_EOL,LOCK_EX)===false){http_response_code(500);echo json_encode(['success'=>false,'message'=>'Não foi possível salvar']);exit;}
echo json_encode(['success'=>true,'project'=>$project],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
