#!/bin/bash
set -e
cd "$(dirname "$0")"

ASM="${1:-Tetris.asm}"
OUT="${2:-Tetris.nes}"

echo "=== ca65 $ASM ==="
ca65 "$ASM" -o Tetris.o

echo "=== ld65 -> $OUT ==="
ld65 -C tetris-nrom.cfg Tetris.o -o "$OUT"

echo "=== OK: $OUT ==="
ls -la "$OUT"

if command -v fceux >/dev/null 2>&1; then
  fceux "$OUT"
elif command -v mesen >/dev/null 2>&1; then
  mesen "$OUT"
else
  echo "Abra $OUT no emulador (Mesen/FCEUX)."
fi
