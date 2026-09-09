<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';
header('Content-Type: application/json; charset=utf-8');
function response(array $data, int $status = 200): never { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') response(['success'=>false,'message'=>'Método não permitido.'],405);
$data=json_decode(file_get_contents('php://input')?:'',true);
if(!is_array($data)) response(['success'=>false,'message'=>'JSON inválido.'],400);
$name=trim((string)($data['name']??'')); $email=strtolower(trim((string)($data['email']??''))); $password=(string)($data['password']??'');
if($name===''||mb_strlen($name)>100) response(['success'=>false,'message'=>'Informe um nome válido.'],422);
if(!filter_var($email,FILTER_VALIDATE_EMAIL)) response(['success'=>false,'message'=>'Informe um e-mail válido.'],422);
if(strlen($password)<8) response(['success'=>false,'message'=>'A senha deve ter pelo menos 8 caracteres.'],422);
try {
 $pdo=db(); $q=$pdo->prepare('SELECT id FROM users WHERE email=:email LIMIT 1'); $q->execute([':email'=>$email]);
 if($q->fetch()) response(['success'=>false,'message'=>'Este e-mail já está cadastrado.'],409);
 $hash=password_hash($password,PASSWORD_DEFAULT); if($hash===false) throw new RuntimeException('Hash error');
 $pdo->beginTransaction();
 $q=$pdo->prepare('INSERT INTO users (name,email,password_hash,status,email_verified) VALUES (:name,:email,:password_hash,:status,:email_verified)');
 $q->execute([':name'=>$name,':email'=>$email,':password_hash'=>$hash,':status'=>'active',':email_verified'=>0]);
 $id=(int)$pdo->lastInsertId();
 $q=$pdo->prepare('INSERT INTO user_auth (user_id,provider,provider_user_id) VALUES (:user_id,:provider,NULL)');
 $q->execute([':user_id'=>$id,':provider'=>'local']); $pdo->commit();
 response(['success'=>true,'message'=>'Usuário cadastrado com sucesso.','user'=>['id'=>$id,'name'=>$name,'email'=>$email]],201);
} catch(Throwable $e) { if(isset($pdo)&&$pdo instanceof PDO&&$pdo->inTransaction())$pdo->rollBack(); error_log('NGC Register Error: '.$e->getMessage()); response(['success'=>false,'message'=>'Não foi possível realizar o cadastro.'],500); }
