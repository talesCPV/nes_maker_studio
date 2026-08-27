# NGC — NES Game Compiler

Primeira etapa da migração do gerador de Assembly do NESMaker Studio para o backend.

## Endpoint

`POST /backend/build.php`

O corpo é JSON e contém:

```json
{
  "version": 1,
  "buildMode": "game",
  "project": {},
  "selection": {}
}
```

## Arquitetura inicial

- `build.php`: endpoint HTTP.
- `src/NGC.php`: núcleo do compilador.
- `src/ProjectParser.php`: normalização do projeto recebido.
- `src/AsmBuilder.php`: composição dos blocos ASM.
- `templates/`: templates Assembly externos.

A implementação atual é deliberadamente um **bootstrap**. Ela ainda não substitui o gerador local; isso permite migrar os blocos de `build-rom.js` um a um sem quebrar o jogo que já está funcionando.

## Stage 4

O NGC agora gera também a rotina NMI. O bloco é condicionado à presença da música selecionada: quando há música, a NMI chama `music_update`; caso contrário, mantém o comportamento sem APU. O frontend substitui apenas o bloco `NMI:` do ASM legado, preservando o restante do gerador durante a migração incremental.


### Stage 8
O NGC agora gera também o bloco `player`, incluindo `world_col_from`, `check_ground`, `is_solid`, `check_wall_at` e `update_player`. O frontend substitui esse bloco no ASM legado antes de `Reset:`.

## Stage 12

Migração do bloco Background / Screen Loading para o NGC. As rotinas `load_screen` e `preload_screen_nt` agora são geradas pelo backend. As tabelas/dados `ScreenNt*`, `ScreenAt*` e `ScreenCol*` continuam temporariamente no gerador legado para manter a migração incremental.


Stage 15: o NGC passou a empacotar o CHR dos sprites diretamente a partir de `project.chr`, `project.metatiles` e `project.characters`, e retorna o bloco `sprite_chr`.
