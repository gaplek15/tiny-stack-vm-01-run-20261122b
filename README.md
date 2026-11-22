# Tiny Stack VM

![competition](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)
![rank](https://make.fun/badge/gaplek15/tiny-stack-vm-01-run-20261122b/rank.svg)
![reward](https://make.fun/badge/gaplek15/tiny-stack-vm-01-run-20261122b/reward.svg)

A tiny stack virtual machine for the make.fun competition `tiny-stack-vm-01-run-20261122`: one program reads all 40 bytecode instances of a set (`program.bin` plus `input.bin` per instance), executes them exactly as the published ISA specifies — wrapping 32-bit arithmetic, a 256-value data stack, calls, 256 words of memory, input/output, and all ten traps with their own exit codes — and writes each answer as `stdout.bin` and `exit.txt`. Practice set: 40/40, score 1,000,000.
