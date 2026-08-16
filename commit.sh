#!/bin/bash
# Upload files to Github - git@github.com:talesCPV/nes_maker_studio.git

read -p "Are you sure to commit nes_maker_studio Project to GitHub ? (Y/n)" -n 1 -r
echo 
if [[ $REPLY =~ ^[Yy]$ ]]
then

    cp ~/Documentos/SQL/nes_maker_studio/*.sql sql/

    git init

    git add asm/
    git add assets/
    git add css/
    git add js/
    git add commit.sh
    git add index.html
    git add hello.nms
    git add smb.nms
    git add historico.txt

    git commit -m "by_script"

#    git branch -M main
#    git remote add origin git@github.com:talesCPV/nes_maker_studio.git
    git remote set-url origin git@github.com:talesCPV/nes_maker_studio.git

    git push -u -f origin main

fi