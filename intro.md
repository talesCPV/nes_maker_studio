# NESMaker Studio — Documentação Técnica do Projeto

## 1. Visão Geral do Projeto
**NESMaker Studio** é um IDE (Integrated Development Environment) baseada em web/browser para desenvolvimento de jogos retro focada na arquitetura e limitações de hardware do **Nintendo Entertainment System (NES) / Famicom (6502 8-bit)**.

O sistema opera inteiramente no navegador (front-end puro em JavaScript ES6+, HTML5 Canvas e CSS3), sem dependência de servidores backend. Ele permite a criação, edição, gerenciamento de projetos e compilação/exportação completa de ROMs jogáveis (`.nes`) com suporte a emulação de hardware (assembler/compiler 6502 integrado, manipulador de arquivos CHR binários, gerenciador de paletas NES, mapas de tiles, sprites, som e scripts assembly).

---

## 2. Arquitetura de Diretórios e Estrutura do Código

```
NESMakerStudio/
├── index.html                 # Interface Principal (UI/DOM Layout, Modais, Navbars)
├── css/
│   └── style.css              # Estilização visual no estilo Dark/Pixel-Art Retro
├── js/
│   ├── core.js                # Estado Global do Projeto (App State), Event Bus, I/O (.nms), Gerenciador de Abas
│   ├── render-utils.js        # Utilitários de renderização Canvas, Decodificação CHR de 2-bitplane, Paleta NES
│   └── modules/               # Módulos Funcionais e Editores Específicos
│       ├── dashboard.js       # Visão Geral do Projeto, Metadados, Mapeador de Memória / Memory Mapper Config
│       ├── chr-editor.js      # Editor Gráfico de CHR (Pattern Table / Tiles 8x8 de 2bpp)
│       ├── backgrounds.js    # Editor de Nametables / Metatiles (Background Map 32x30)
│       ├── characters.js     # Editor de Sprites / Objetos de Personagem (OAM / Metasprites)
│       ├── level-design.js   # Editor de Níveis, Telas Interligadas, Atributos de Colisão e Entities
│       ├── sound-editor.js   # Tracker / Editor de Som para APU do NES (Canais Square1, Square2, Triangle, Noise)
│       ├── program.js        # Editor de Código Assembly 6502 (Macros, Subrotinas, Lógica de Jogo)
│       └── build-rom.js      # Assembler 6502 NATIVO, Gerador de Cabeçalho iNES e Compilador de ROM (.nes)
└── assets/
    └── novo.chr               # Arquivo padrão binário de PPU Pattern Table (4KB/8KB CHR RAM/ROM)
```

---

## 3. Especificações Técnicas e Módulos do Sistema

### 3.1. Estado Global e Persistência (`js/core.js`)
* **Global State Object (`window.AppState` ou `NESStudio.state`)**: Mantém a representação completa em memória do projeto ativo.
* **Formato de Projeto (`.nms`)**: Arquivo JSON contendo:
  * `metadata`: Nome, autor, versão, mapper (NROM/Mapper 0 por padrão, MMC1, MMC3).
  * `chrData`: Array de bytes de Pattern Tables (Bank 0 e Bank 1).
  * `palettes`: Matrizes de cores mapeadas para os índices de paleta oficial da PPU do NES ($00–$3F).
  * `nametables`: Dados de mapa de fundo, incluindo Atributos de Cor (Attribute Tables 2x2 blocks).
  * `sprites` / `metasprites`: Definições OAM (X, Y, Tile ID, Atributos de Flip V/H, Paleta).
  * `levels`: Estrutura de matriz/grid de telas e dados de colisão.
  * `soundTracks`: Sequências de notas e registram/envelopes para os canais APU.
  * `code`: Scripts ASM 6502 customizados.
* **Import/Export Engine**: Manipula conversões `Blob`, `FileReader` e download automático do `.nms` ou `.nes`.

### 3.2. Utilitários de Renderização e PPU (`js/render-utils.js`)
* **Paleta Mestra do NES**: Mapeamento hex das 64 cores nativas do chip gráfico da PPU do NES.
* **Decodificador CHR (2-bitplane)**:
  * Cada tile 8x8 pixels consome **16 bytes** de memória na PPU.
  * Byte 0–7: Plane 0 (Bit Menos Significativo - LSB).
  * Byte 8–15: Plane 1 (Bit Mais Significativo - MSB).
  * O utilitário lê os pares de bits para calcular a cor relativa (0, 1, 2 ou 3 da paleta ativa).
* **Render Loop**: Métodos otimizados `drawTileToCanvas()`, `renderNametable()`, e `renderSprite()`.

### 3.3. Módulos Editores (`js/modules/`)

1. **Dashboard (`dashboard.js`)**:
   * Configuração de metadados do jogo, Mapper selection (NROM / NES-NROM-128 / NES-NROM-256), Mirroring (Horizontal / Vertical).
   * Monitor de memória RAM/ROM e estatísticas de uso de tiles.

2. **Editor CHR (`chr-editor.js`)**:
   * Grid interativo para desenhar pixel a pixel em tiles 8x8.
   * Ferramentas: Pincel, Borracha, Balde de Tintas, Ferramenta de Espelhamento (Flip X/Y), Rotação.
   * Navegador de Pattern Table (256 tiles por banco: Bank 0 = Sprites, Bank 1 = Background).
   * Importação e Exportação de arquivos `.chr` binários puros.

3. **Backgrounds & Metatiles (`backgrounds.js`)**:
   * Edição de Nametables NES (32x30 tiles = 256x240 pixels).
   * Suporte para Atributos de Paleta da PPU (blocos 2x2 de tiles compartilham a mesma sub-paleta de 4 cores).

4. **Editor de Personagens & Sprites (`characters.js`)**:
   * Criação de Metasprites (combinação de múltiplos tiles 8x8 ou 8x16 para formar entidades maiores como Player e Inimigos).
   * Controle de Hitbox, Pontos de Ancoragem (Pivot) e Animações (Quadros por segundo/Frames).

5. **Design de Níveis (`level-design.js`)**:
   * Mapeamento de mapa do mundo/fases por telas interligadas (World Map / Screen Layout).
   * Adição de blocos de colisão (Sólido, Água, Espinhos, Plataforma Passável) e spawn points de entidades.

6. **Editor de Som APU (`sound-editor.js`)**:
   * Mapeador de áudio compatível com o chip APU de 5 canais do NES:
     * **Square Wave 1 & 2**: Melodia, harmonia, duty cycle (12.5%, 25%, 50%, 75%).
     * **Triangle**: Linhas de baixo / Basslines.
     * **Noise**: Efeitos sonoros e percussão/bateria.
   * Sintetizador em tempo real utilizando `Web Audio API` para emular os osciladores e envelopes do NES.

7. **Editor de Código Assembly (`program.js`)**:
   * Editor de texto com sintaxe direcionada para Assembly 6502 (opcodes como `LDA`, `STA`, `LDX`, `JSR`, `RTI`, `ADC`, etc.).
   * Gerenciador de vetores de interrupção (`NMI`, `RESET`, `IRQ`).

8. **Compilador e Build de ROM (`build-rom.js`)**:
   * **Assembler 6502 Integrado**:
     1. Tokenizador e Parser do código ASM.
     2. Resolução de labels e endereçamento de memória (Zero Page, Absolute, Immediate, Indexed).
     3. Emissão do bytecode binário (Machine Code).
   * **iNES Header Generator**:
     * Criação do cabeçalho binário de 16 bytes iNES:
       * Bytes 0-3: `'N'`, `'E'`, `'S'`, `0x1A`
       * Byte 4: Tamanho de PRG-ROM em blocos de 16KB.
       * Byte 5: Tamanho de CHR-ROM em blocos de 8KB.
       * Byte 6: Flags 6 (Mapper low, Mirroring, Battery RAM).
       * Byte 7: Flags 7 (Mapper high).
   * Concatenador Binário: Junta **iNES Header + PRG-ROM Binary + CHR-ROM Binary** para gerar o arquivo `.nes` final.

---

## 4. Guia para Interação via IA / Desenvolvedores

### Como estender e modificar o projeto:
* **Adicionar novas funcionalidades de edição**:
  * Adicione o módulo em `js/modules/<novo-modulo>.js`.
  * Registre os eventos de inicialização e interface em `js/core.js`.
  * Se houver estados adicionais, estenda o objeto inicial em `AppState` dentro do `core.js`.
* **Modificar o Assembler/Compilador**:
  * O motor de montagem fica em `js/modules/build-rom.js`.
  * Caso precise adicionar suporte a novas macros ou opcodes adicionais (ex: instruções não documentadas), expanda a tabela de mapeamento de instruções/opcodes 6502 presente em `build-rom.js`.
* **Fluxo de Dados CHR**:
  * Toda alteração gráfica é refletida em um `Uint8Array` de tamanho `8192` (8KB) ou `4096` (4KB).
  * A conversão entre Canvas (RGBA 32-bit) e CHR (2bpp planar) é feita via funções utilitárias em `js/render-utils.js`.

---

## 5. Como Executar
1. Clone o repositório.
2. Abra o arquivo `index.html` em qualquer navegador web moderno (Chrome, Firefox, Edge, Safari). Não é necessário rodar servidores como Node.js ou Apache, pois a comunicação é inteiramente client-side.
