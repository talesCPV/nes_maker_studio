<?php
declare(strict_types=1);
require_once dirname(__DIR__, 4) . '/backend/auth/auth_check.php';
header('Content-Type: application/json; charset=utf-8');
if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);echo json_encode(['success'=>false,'message'=>'Método não permitido.']);exit;}
$d=json_decode((string)file_get_contents('php://input'),true);$id=(string)($d['id']??'');
if(!preg_match('/^[a-f0-9]{16}$/',$id)){http_response_code(422);echo json_encode(['success'=>false,'message'=>'Projeto inválido.']);exit;}
$dir=dirname(__DIR__,3).'/data/users/'.(int)$_SESSION['user_id'].'/megadrive/projects/'.$id;
if(!is_dir($dir)){http_response_code(404);echo json_encode(['success'=>false,'message'=>'Projeto não encontrado.']);exit;}
$it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir,FilesystemIterator::SKIP_DOTS),RecursiveIteratorIterator::CHILD_FIRST);foreach($it as $f){$f->isDir()?rmdir($f->getPathname()):unlink($f->getPathname());}rmdir($dir);
echo json_encode(['success'=>true],JSON_UNESCAPED_UNICODE);
