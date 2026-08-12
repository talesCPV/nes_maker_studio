
#!/bin/bash

# na pasta onde salvou main.asm e nrom.cfg
ca65 Hello.asm -o Hello.o
ld65 -C nrom.cfg Hello.o -o Hello_splash.nes
fceux Hello_splash.nes