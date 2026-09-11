#!/usr/bin/env bash
# Compila debug.asm com DASM e abre no Stella
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

ASM="${1:-debug.asm}"
BIN="${ASM%.asm}.bin"
LST="${ASM%.asm}.lst"

if ! command -v dasm >/dev/null 2>&1; then
  echo "❌ dasm não encontrado no PATH. Instale ou ajuste o PATH."
  exit 1
fi

if [[ ! -f "$ASM" ]]; then
  echo "❌ Arquivo não encontrado: $ASM"
  echo "   Uso: ./make.sh [arquivo.asm]"
  exit 1
fi

echo "⚙  DASM → $BIN"
dasm "$ASM" -f3 -o"$BIN" -l"$LST"

if [[ ! -f "$BIN" ]]; then
  echo "❌ Falha: $BIN não foi gerado."
  exit 1
fi

SIZE=$(wc -c < "$BIN" | tr -d ' ')
echo "✅ OK · $BIN ($SIZE bytes) · lista $LST"

if command -v stella >/dev/null 2>&1; then
  echo "▶  Abrindo Stella..."
  stella "$BIN" &
elif command -v Stella >/dev/null 2>&1; then
  echo "▶  Abrindo Stella..."
  Stella "$BIN" &
else
  echo "⚠  Stella não encontrado no PATH."
  echo "   Rode manualmente: stella $BIN"
  echo "   Ou arraste $BIN para o Stella."
fi
