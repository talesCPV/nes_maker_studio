<?php

final class AsmBuilder
{
    private array $parts = [];

    public function add(string $asm): self
    {
        $this->parts[] = rtrim($asm, "\r\n");
        return $this;
    }

    public function addTemplate(array $templates, string $name): self
    {
        if (!array_key_exists($name, $templates)) {
            throw new RuntimeException("Template NGC inexistente: {$name}");
        }

        return $this->add($templates[$name]);
    }

    public function build(): string
    {
        return implode("\n\n", array_filter($this->parts, static fn($p) => $p !== '')) . "\n";
    }
}
