#!/bin/bash
# Upload files to Github - git@github.com:talesCPV/nes_maker_studio.git
# Teste de debug no sistema user: teste@Xspider0.com pass: #Master26!

read -p "Are you sure to commit nes_maker_studio Project to GitHub ? (Y/n)" -n 1 -r
echo 
if [[ $REPLY =~ ^[Yy]$ ]]
then

    # Nome do seu arquivo PHP (ajuste o caminho se necessário)
    ARQUIVO_PHP="backend/config/database.php"
    SENHA_REAL="VOLTE_COM_A_SENHA_AQUI"

    # Substitui o valor da constante por *******
    sed -i -E "s/(const DB_PASSWORD = ')[^']*(')/\1*******\2/g" "$ARQUIVO_PHP"
    sed -i -E 's/(const DB_PASSWORD = ")[^"]*(")/\1*******\2/g' "$ARQUIVO_PHP"


    cp ~/Documentos/SQL/nes_maker_studio/*.sql sql/

    git init

    git add backend/
    git add data/
    git add sistemas/
    git add app-config.js
    git add commit.sh
    git add deploy.sh
    git add next_steps.txt
    git add index.html
    git add readme.md
    git add login.html
    git add register.html
    git add config_hub.php
    
    git commit -m "by_script"

    #git branch -M main
    #git remote add origin git@github.com:talesCPV/nes_maker_studio.git
    git remote set-url origin git@github.com:talesCPV/nes_maker_studio.git

    git push -u -f origin main


    awk -v senha="$SENHA_REAL" '{
        if ($0 ~ /const DB_PASSWORD =/) {
            sub(/=.*/, "= \x27" senha "\x27;", $0)
        }
        print
    }' "$ARQUIVO_PHP" > temp.php && mv temp.php "$ARQUIVO_PHP"



fi