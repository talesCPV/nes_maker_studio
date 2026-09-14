<?php
declare(strict_types=1);
require_once dirname(__DIR__, 4) . '/backend/auth/auth_check.php';
header('Content-Type: application/json; charset=utf-8');
if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);echo json_encode(['success'=>false,'message'=>'Método não permitido.']);exit;}
$d=json_decode((string)file_get_contents('php://input'),true); if(!is_array($d)){http_response_code(400);echo json_encode(['success'=>false,'message'=>'JSON inválido.']);exit;}
$name=trim((string)($d['name']??'')); $desc=trim((string)($d['description']??''));
if($name===''){http_response_code(422);echo json_encode(['success'=>false,'message'=>'Informe o nome do projeto.']);exit;}
if(mb_strlen($name)>120||mb_strlen($desc)>2000){http_response_code(422);echo json_encode(['success'=>false,'message'=>'Dados do projeto excedem o limite.']);exit;}
$userId=(int)$_SESSION['user_id']; $root=dirname(__DIR__,3); $dir=$root.'/data/users/'.$userId.'/megadrive/projects';
if(!is_dir($dir)&&!mkdir($dir,0775,true)){http_response_code(500);echo json_encode(['success'=>false,'message'=>'Não foi possível criar a pasta de projetos.']);exit;}
do{$id=bin2hex(random_bytes(8));$projectDir=$dir.'/'.$id;}while(is_dir($projectDir));
if(!mkdir($projectDir,0775,true)){http_response_code(500);echo json_encode(['success'=>false,'message'=>'Não foi possível criar o projeto.']);exit;}
$now=date('Y-m-d H:i:s'); $project=['format'=>'MDG','version'=>1,'name'=>$name,'description'=>$desc,'author'=>(string)($_SESSION['user_name']??''),'created_at'=>$now,'updated_at'=>$now,'system'=>'MEGA DRIVE'];
file_put_contents($projectDir.'/project.mdg',json_encode($project,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),LOCK_EX);
echo json_encode(['success'=>true,'project'=>['id'=>$id,'name'=>$name,'description'=>$desc]],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
