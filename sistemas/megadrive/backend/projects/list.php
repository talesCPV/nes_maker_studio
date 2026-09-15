<?php
declare(strict_types=1);
require_once dirname(__DIR__, 4) . '/backend/auth/auth_check.php';
header('Content-Type: application/json; charset=utf-8');
$userId=(int)$_SESSION['user_id'];
$dir=dirname(__DIR__,4).'/data/users/'.$userId.'/megadrive/projects';
$projects=[];
if(is_dir($dir)) foreach(glob($dir.'/*',GLOB_ONLYDIR) ?: [] as $p){
  $f=$p.'/project.mdg'; if(!is_file($f)) continue;
  $data=json_decode((string)file_get_contents($f),true); if(!is_array($data)) continue;
  $projects[]=['id'=>basename($p),'name'=>(string)($data['name']??basename($p)),'description'=>(string)($data['description']??''),'created_at'=>(string)($data['created_at']??''),'updated_at'=>(string)($data['updated_at']??'')];
}
usort($projects,fn($a,$b)=>strcmp($b['updated_at'].$b['id'],$a['updated_at'].$a['id']));
echo json_encode(['success'=>true,'projects'=>$projects],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
