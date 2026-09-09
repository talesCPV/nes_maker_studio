#!/bin/bash

SOURCE="./"
VPS_USER="root"
VPS_HOST="143.95.166.26"
VPS_PORT="22022"
VPS_PATH="/var/www/html"

echo "🚀 Iniciando deploy para $VPS_USER@$VPS_HOST:$VPS_PORT..."

rsync -avz --update \
    -e "ssh -p $VPS_PORT" \
    --exclude='.git/' \
    --exclude='.gitignore' \
    --exclude='.env' \
    --exclude='.env.local' \
    --exclude='node_modules/' \
    --exclude='.vscode/' \
    --exclude='.idea/' \
    --exclude='*.log' \
    --exclude='deploy.sh' \
    --exclude='.DS_Store' \
    --exclude='uploads/' \
    "$SOURCE" "$VPS_USER@$VPS_HOST:$VPS_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Deploy concluído com sucesso!"
else
    echo " Erro no deploy."
    exit 1
fi

