<?php
// sistemas/megadrive/backend/projects/load.php - V17 FIX
// Carrega project.mdg de retrocompiler/data/users/{id}/megadrive/projects/{hash}/project.mdg

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if($_SERVER['REQUEST_METHOD']==='OPTIONS'){ http_response_code(200); exit; }

$input = file_get_contents('php://input');
$data = json_decode($input, true);
$id = $data['id'] ?? $_GET['id'] ?? $_POST['id'] ?? null;
$system = $data['system'] ?? 'megadrive';

if(!$id){
  echo json_encode(['error'=>'missing id']); exit;
}

// Sanitiza id (hash)
$id = preg_replace('/[^a-z0-9]/', '', strtolower($id));

// Tenta achar em data/users/*/megadrive/projects/{hash}/project.mdg
$baseDirs = [
  __DIR__.'/../../../../data/users', // retrocompiler/data/users
  __DIR__.'/../../../data/users', // fallback
  __DIR__.'/../../../../retrocompiler/data/users',
  dirname(__DIR__,4).'/data/users'
];

$projectData = null;
$foundPath = null;

foreach($baseDirs as $base){
  if(!is_dir($base)) continue;
  // Varre usuários
  $users = glob($base.'/*', GLOB_ONLYDIR);
  foreach($users as $userDir){
    $path = $userDir.'/megadrive/projects/'.$id.'/project.mdg';
    if(file_exists($path)){
      $projectData = file_get_contents($path);
      $foundPath = $path;
      break 2;
    }
    // Também tenta {id}.mdg
    $path2 = $userDir.'/megadrive/projects/'.$id.'.mdg';
    if(file_exists($path2)){
      $projectData = file_get_contents($path2);
      $foundPath = $path2;
      break 2;
    }
  }
}

// Se não achou, tenta localStorage fallback - retorna vazio para usar demo
if(!$projectData){
  // Tenta na pasta do projeto mesmo
  $localPath = __DIR__.'/../../../data/projects/'.$id.'.mdg';
  if(file_exists($localPath)){
    $projectData = file_get_contents($localPath);
    $foundPath = $localPath;
  }
}

if($projectData){
  // Se já é JSON, retorna como está
  $json = json_decode($projectData, true);
  if($json){
    echo json_encode(['project'=>$json, 'path'=>$foundPath]);
  } else {
    // Se for base64 ou outro, tenta decodificar
    echo $projectData;
  }
} else {
  // Não encontrado, retorna projeto vazio mas com status ok para não dar 404
  echo json_encode(['project'=>null, 'not_found'=>true, 'searched_id'=>$id]);
}
?>
