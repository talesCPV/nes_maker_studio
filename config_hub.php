<?php
declare(strict_types=1);

/*
 * RetroCompiler — Editor local do Hub
 *
 * Este arquivo é destinado SOMENTE ao ambiente de desenvolvimento/local.
 * Não publique este arquivo em produção.
 */

$hubFile = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'hub.json';
$message = '';
$messageType = '';

function loadHubConfig(string $file): array
{
    if (!is_file($file)) {
        return [
            'version' => 1,
            'system' => []
        ];
    }

    $raw = file_get_contents($file);
    if ($raw === false || trim($raw) === '') {
        return ['version' => 1, 'system' => []];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('O hub.json atual contém JSON inválido.');
    }

    if (!isset($data['version'])) {
        $data['version'] = 1;
    }
    if (!isset($data['system']) || !is_array($data['system'])) {
        $data['system'] = [];
    }

    return $data;
}

function cleanString($value): string
{
    return trim((string)$value);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        $action = $_POST['action'] ?? '';

        if ($action === 'save') {
            $systems = $_POST['systems'] ?? [];
            if (!is_array($systems)) {
                throw new RuntimeException('Dados de sistemas inválidos.');
            }

            $output = [
                'version' => 1,
                'system' => []
            ];

            foreach ($systems as $row) {
                if (!is_array($row)) {
                    continue;
                }

                $key = cleanString($row['key'] ?? '');
                if ($key === '') {
                    continue;
                }

                $output['system'][$key] = [
                    'label' => cleanString($row['label'] ?? $key),
                    'disponivel' => isset($row['disponivel']) && $row['disponivel'] === '1',
                    'visivel' => isset($row['visivel']) && $row['visivel'] === '1',
                    'sobre' => cleanString($row['sobre'] ?? ''),
                    'dashboard' => cleanString($row['dashboard'] ?? ''),
                    'projectExtension' => cleanString($row['projectExtension'] ?? ''),
                    'background' => cleanString($row['background'] ?? '')
                ];
            }

            $json = json_encode($output, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL;
            if ($json === false) {
                throw new RuntimeException('Não foi possível gerar o JSON.');
            }

            $dir = dirname($hubFile);
            if (!is_dir($dir)) {
                throw new RuntimeException('A pasta data/config não existe.');
            }

            // LOCK_EX evita gravações simultâneas durante o desenvolvimento.
            if (file_put_contents($hubFile, $json, LOCK_EX) === false) {
                throw new RuntimeException('Não foi possível gravar o arquivo data/config/hub.json. Verifique as permissões.');
            }

            $message = 'Configuração salva com sucesso em data/config/hub.json.';
            $messageType = 'success';
        } elseif ($action === 'reload') {
            $message = 'Configuração recarregada.';
            $messageType = 'info';
        }
    } catch (Throwable $e) {
        $message = $e->getMessage();
        $messageType = 'error';
    }
}

try {
    $config = loadHubConfig($hubFile);
} catch (Throwable $e) {
    $config = ['version' => 1, 'system' => []];
    if ($messageType !== 'error') {
        $message = $e->getMessage();
        $messageType = 'error';
    }
}

$systems = $config['system'] ?? [];

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RetroCompiler — Configuração do Hub</title>
<style>
    :root {
        color-scheme: dark;
        --bg: #101318;
        --panel: #181d25;
        --panel2: #202632;
        --line: #343c4b;
        --text: #eef2f7;
        --muted: #aeb7c5;
        --accent: #55b6ff;
        --danger: #ff6b6b;
        --success: #54d38a;
    }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .wrap { width: min(1180px, calc(100% - 32px)); margin: 28px auto 50px; }
    header { margin-bottom: 22px; }
    h1 { margin: 0 0 7px; font-size: 28px; }
    .subtitle { color: var(--muted); }
    .warning {
        margin-top: 16px; padding: 12px 14px; border: 1px solid #795d2b;
        background: #302719; border-radius: 9px; color: #f2d59b;
    }
    .toolbar {
        display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px;
    }
    button {
        border: 1px solid var(--line); border-radius: 7px; padding: 10px 14px;
        color: var(--text); background: var(--panel2); cursor: pointer; font-weight: 600;
    }
    button.primary { background: var(--accent); border-color: var(--accent); color: #07131d; }
    button.danger { color: #ffd4d4; border-color: #6e3535; background: #321d20; }
    button:hover { filter: brightness(1.08); }
    .message { margin-bottom: 18px; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--line); }
    .message.success { border-color: #2b704b; background: #152b20; color: #b5f2cc; }
    .message.error { border-color: #7a3737; background: #301b1d; color: #ffc3c3; }
    .message.info { background: var(--panel); color: var(--muted); }
    .system {
        background: var(--panel); border: 1px solid var(--line); border-radius: 11px;
        padding: 18px; margin-bottom: 16px;
    }
    .system-head { display: flex; justify-content: space-between; align-items: center; gap: 15px; margin-bottom: 16px; }
    .system-title { font-size: 18px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field.full { grid-column: 1 / -1; }
    label { font-size: 12px; color: var(--muted); font-weight: 650; }
    input, textarea {
        width: 100%; border: 1px solid var(--line); border-radius: 7px; padding: 10px 11px;
        background: #11151b; color: var(--text); font: inherit;
    }
    textarea { min-height: 76px; resize: vertical; }
    .checks { display: flex; align-items: center; gap: 20px; min-height: 41px; }
    .checks label { display: inline-flex; align-items: center; gap: 7px; color: var(--text); font-size: 14px; }
    .checks input { width: auto; }
    .empty { padding: 28px; text-align: center; border: 1px dashed var(--line); border-radius: 10px; color: var(--muted); }
    .footer-note { margin-top: 20px; color: var(--muted); font-size: 12px; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .field.full { grid-column: auto; } }
</style>
</head>
<body>
<div class="wrap">
    <header>
        <h1>Configuração do Hub</h1>
        <div class="subtitle">Editor local de <code>data/config/hub.json</code></div>
        <div class="warning"><strong>LOCAL ONLY:</strong> este arquivo é uma ferramenta de desenvolvimento. Não envie <code>config_hub.php</code> para produção.</div>
    </header>

    <?php if ($message !== ''): ?>
        <div class="message <?= h($messageType) ?>"><?= h($message) ?></div>
    <?php endif; ?>

    <form method="post" id="hubForm">
        <input type="hidden" name="action" value="save">

        <div class="toolbar">
            <button type="button" class="primary" onclick="addSystem()">+ Adicionar sistema</button>
            <button type="submit">Salvar hub.json</button>
            <button type="button" onclick="location.reload()">Recarregar</button>
        </div>

        <div id="systems">
            <?php if (!$systems): ?>
                <div class="empty" id="emptyState">Nenhum sistema cadastrado.</div>
            <?php else: ?>
                <?php foreach ($systems as $key => $system): ?>
                    <div class="system" data-system>
                        <div class="system-head">
                            <div class="system-title">Sistema</div>
                            <button type="button" class="danger" onclick="removeSystem(this)">Remover</button>
                        </div>
                        <div class="grid">
                            <div class="field">
                                <label>Chave do sistema</label>
                                <input name="systems[][key]" value="<?= h((string)$key) ?>" required>
                            </div>
                            <div class="field">
                                <label>Nome exibido (label)</label>
                                <input name="systems[][label]" value="<?= h((string)($system['label'] ?? $key)) ?>">
                            </div>
                            <div class="field full">
                                <label>Status</label>
                                <div class="checks">
                                    <label><input type="hidden" name="systems[][disponivel]" value="0"><input type="checkbox" name="systems[][disponivel]" value="1" <?= !empty($system['disponivel']) ? 'checked' : '' ?>> Disponível</label>
                                    <label><input type="hidden" name="systems[][visivel]" value="0"><input type="checkbox" name="systems[][visivel]" value="1" <?= !empty($system['visivel']) ? 'checked' : '' ?>> Visível no Hub</label>
                                </div>
                            </div>
                            <div class="field full">
                                <label>Sobre</label>
                                <textarea name="systems[][sobre]"><?= h((string)($system['sobre'] ?? '')) ?></textarea>
                            </div>
                            <div class="field">
                                <label>Dashboard</label>
                                <input name="systems[][dashboard]" value="<?= h((string)($system['dashboard'] ?? '')) ?>" placeholder="/sistemas/nes/dashboard.html">
                            </div>
                            <div class="field">
                                <label>Extensão do projeto</label>
                                <input name="systems[][projectExtension]" value="<?= h((string)($system['projectExtension'] ?? '')) ?>" placeholder=".nms">
                            </div>
                            <div class="field full">
                                <label>Background</label>
                                <input name="systems[][background]" value="<?= h((string)($system['background'] ?? '')) ?>" placeholder="/sistemas/nes/assets/wallpaper.jpg">
                            </div>
                        </div>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </form>

    <div class="footer-note">
        O editor preserva a estrutura do <code>hub.json</code> e grava JSON formatado em UTF-8. Faça o deploy apenas do <code>hub.json</code> quando estiver satisfeito com a configuração.
    </div>
</div>

<template id="systemTemplate">
    <div class="system" data-system>
        <div class="system-head">
            <div class="system-title">Novo sistema</div>
            <button type="button" class="danger" onclick="removeSystem(this)">Remover</button>
        </div>
        <div class="grid">
            <div class="field">
                <label>Chave do sistema</label>
                <input name="systems[][key]" value="" placeholder="MEGA DRIVE" required>
            </div>
            <div class="field">
                <label>Nome exibido (label)</label>
                <input name="systems[][label]" value="">
            </div>
            <div class="field full">
                <label>Status</label>
                <div class="checks">
                    <label><input type="hidden" name="systems[][disponivel]" value="0"><input type="checkbox" name="systems[][disponivel]" value="1" checked> Disponível</label>
                    <label><input type="hidden" name="systems[][visivel]" value="0"><input type="checkbox" name="systems[][visivel]" value="1" checked> Visível no Hub</label>
                </div>
            </div>
            <div class="field full">
                <label>Sobre</label>
                <textarea name="systems[][sobre]" placeholder="Descrição do sistema..."></textarea>
            </div>
            <div class="field">
                <label>Dashboard</label>
                <input name="systems[][dashboard]" placeholder="/sistemas/megadrive/dashboard.html">
            </div>
            <div class="field">
                <label>Extensão do projeto</label>
                <input name="systems[][projectExtension]" placeholder=".mdg">
            </div>
            <div class="field full">
                <label>Background</label>
                <input name="systems[][background]" placeholder="/sistemas/megadrive/assets/wallpaper.jpg">
            </div>
        </div>
    </div>
</template>

<script>
function addSystem() {
    const template = document.getElementById('systemTemplate');
    const container = document.getElementById('systems');
    const empty = document.getElementById('emptyState');
    if (empty) empty.remove();
    container.appendChild(template.content.cloneNode(true));
}

function removeSystem(button) {
    const card = button.closest('[data-system]');
    if (card) card.remove();
    if (!document.querySelector('[data-system]')) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.id = 'emptyState';
        empty.textContent = 'Nenhum sistema cadastrado.';
        document.getElementById('systems').appendChild(empty);
    }
}
</script>
</body>
</html>
