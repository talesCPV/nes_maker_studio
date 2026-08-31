<?php
declare(strict_types=1);
require_once __DIR__ . '/../config/database.php';
header('Content-Type: application/json; charset=utf-8');
function response(array $data,int $status=200):never{
    http_response_code($status);
    echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}
if($_SERVER['REQUEST_METHOD']!=='POST')response(['success'=>false,'message'=>'Método não permitido.'],405);
$data=json_decode(file_get_contents('php://input')?:'',true);
if(!is_array($data))response(['success'=>false,'message'=>'JSON inválido.'],400);
$email=strtolower(trim((string)($data['email']??'')));
$password=(string)($data['password']??'');
if(!filter_var($email,FILTER_VALIDATE_EMAIL)||$password==='')response(['success'=>false,'message'=>'E-mail ou senha inválidos.'],401);
try{
    $pdo=db();
    $q=$pdo->prepare('SELECT id,name,email,password_hash,status FROM users WHERE email=:email LIMIT 1');
    $q->execute([':email'=>$email]);
    $user=$q->fetch();
    if(!$user||empty($user['password_hash']))response(['success'=>false,'message'=>'E-mail ou senha inválidos.'],401);
    if($user['status']!=='active')response(['success'=>false,'message'=>'Esta conta não está disponível para login.'],403);
    if(!password_verify($password,$user['password_hash']))response(['success'=>false,'message'=>'E-mail ou senha inválidos.'],401);
    session_start();
    session_regenerate_id(true);
    $_SESSION['user_id']=(int)$user['id'];
    $_SESSION['user_name']=$user['name'];
    $_SESSION['user_email']=$user['email'];
    $_SESSION['authenticated']=true;
    $q=$pdo->prepare('UPDATE users SET last_login_at=NOW() WHERE id=:id');
    $q->execute([':id'=>$user['id']]);
    response(['success'=>true,'message'=>'Login realizado com sucesso.','user'=>['id'=>(int)$user['id'],'name'=>$user['name'],'email'=>$user['email']]]);
}catch(Throwable $e){
    error_log('NGC Login Error: '.$e->getMessage());
    response(['success'=>false,'message'=>'Não foi possível realizar o login.'],500);
}
