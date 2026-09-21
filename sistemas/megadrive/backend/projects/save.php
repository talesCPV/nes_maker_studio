<?php
// sistemas/megadrive/backend/projects/save.php - V17 FIX
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if($_SERVER['REQUEST_METHOD']==='OPTIONS'){ http_response_code(200); exit; }

$input = file_get_contents('php://input');
$data = json_decode($input, true);

$id = $data['id'] ?? null;
$project = $data['project'] ?? $data ?? null;

if(!$id){
  echo json_encode(['error'=>'missing id']); exit;
}
$id = preg_replace('/[^a-z0-9]/', '', strtolower($id));

// Acha pasta do usuário
$baseDirs = [
  __DIR__.'/../../../../data/users',
  __DIR__.'/../../../data/users',
  dirname(__DIR__,4).'/data/users'
];

$saved = false;
foreach($baseDirs as $base){
  if(!is_dir($base)) continue;
  $users = glob($base.'/*', GLOB_ONLYDIR);
  foreach($users as $userDir){
    $projDir = $userDir.'/megadrive/projects/'.$id;
    if(is_dir($projDir)){
      $path = $projDir.'/project.mdg';
      $json = json_encode($project, JSON_PRETTY_PRINT);
      // Garante que metatiles estão salvos
      if(isset($project['metatiles'])){
        // ok
      }
      file_put_contents($path, $json);
      echo json_encode(['ok'=>true, 'path'=>$path, 'metatiles'=>count($project['metatiles']??[]), 'backgrounds'=>isset($project['backgrounds'])]);
      $saved = true;
      break 2;
    }
  }
}

if(!$saved){
  // Cria na primeira pasta de usuário encontrada ou em data/projects
  $firstUser = null;
  foreach($baseDirs as $base){
    if(is_dir($base)){
      $users = glob($base.'/*', GLOB_ONLYDIR);
      if(!empty($users)){ $firstUser = $users[0]; break; }
    }
  }
  if($firstUser){
    $projDir = $firstUser.'/megadrive/projects/'.$id;
    @mkdir($projDir, 0777, true);
    $path = $projDir.'/project.mdg';
    $json = json_encode($project, JSON_PRETTY_PRINT);
    file_put_contents($path, $json);
    echo json_encode(['ok'=>true, 'path'=>$path, 'created'=>true, 'metatiles'=>count($project['metatiles']??[])]);
  } else {
    // Fallback local
    $path = __DIR__.'/../../../data/projects/'.$id.'.mdg';
    @mkdir(dirname($path), 0777, true);
    $json = json_encode($project, JSON_PRETTY_PRINT);
    file_put_contents($path, $json);
    echo json_encode(['ok'=>true, 'path'=>$path, 'fallback'=>true]);
  }
}
?>
