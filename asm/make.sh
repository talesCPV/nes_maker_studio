#!/bin/bash

#set -e
#cd "$(dirname "$0")"

#ASM="${1:-Hello.asm}"
#OUT="${2:-Hello.nes}"

#echo "=== ca65 $ASM ==="
#ca65 "$ASM" -o Hello.o

#echo "=== ld65 -> $OUT ==="
#ld65 -C nrom.cfg Hello.o -o "$OUT"

#echo "=== OK: $OUT ==="
#ls -la "$OUT"

#if command -v fceux >/dev/null 2>&1; then
#  fceux "$OUT"
#elif command -v mesen >/dev/null 2>&1; then
#  mesen "$OUT"
#else
#  echo "Abra $OUT no emulador (Mesen/FCEUX)."
#fi

#ca65 Hello.asm -o Hello.o
#ld65 -C nrom.cfg Hello.o -o Hello.nes
#fceux Hello.nes

# Encerra o script se algum comando falhar
set -e

# Verifica se o nome do arquivo foi fornecido
if [ -z "$1" ]; then
  echo "Uso: $0 <nome_do_arquivo>"
  echo "Exemplo: $0 teste"
  exit 1
fi

# Extrai apenas o nome base (remove .asm ou outra extensão se o usuário digitar)
NAME="${1%.*}"

# Executa a compilação e montagem com os nomes dinâmicos
ca65 "${NAME}.asm" -o "${NAME}.o"
ld65 -C nrom.cfg "${NAME}.o" -o "${NAME}.nes"

echo "=== Compilação concluída: ${NAME}.nes ==="

# Abre no emulador
if command -v fceux >/dev/null 2>&1; then
  fceux "${NAME}.nes"
elif command -v mesen >/dev/null 2>&1; then
  mesen "${NAME}.nes"
else
  echo "Abra ${NAME}.nes no emulador."
fi

