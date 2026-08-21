#!/bin/bash

#instalação do lftp, caso já tinha ou depois de rodar 1x, comente a linha abaixo
#sudo apt install lftp

# Configurações de Acesso FTP da HostGator
FTP_USER="plan3411"
FTP_PASS="@Xspider0"
FTP_HOST="108.167.168.30"

# Diretórios
LOCAL_DIR="/opt/lampp/htdocs/NES/"
REMOTE_DIR="/public_html/nestudio/" # Pasta padrão de destino no cPanel

echo "Iniciando o sincronismo com o FTP da HostGator..."

# Executa o lftp com espelhamento reverso inteligente
lftp -u "$FTP_USER","$FTP_PASS" "$FTP_HOST" <<EOF
set ftp:ssl-allow false

# Espelhamento ignorando pastas e arquivos específicos
mirror -R --verbose --only-newer --delete --parallel=3 \
  --exclude="\.git/" \
  --exclude="backup.zip" \
  --exclude="nes.zip" \
  --exclude="smb.nms" \
  "$LOCAL_DIR" "$REMOTE_DIR"

bye
EOF

echo "Upload finalizado com sucesso!"