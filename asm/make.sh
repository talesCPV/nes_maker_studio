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

ca65 Hello.asm -o Hello.o
ld65 -C nrom.cfg Hello.o -o Hello.nes
fceux Hello.nes