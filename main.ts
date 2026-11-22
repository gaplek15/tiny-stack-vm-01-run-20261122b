// Tiny stack VM (ISA v1): answers 40 instances; /input/<id>/{program,input}.bin -> /output/<id>/{stdout.bin,exit.txt}.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const IN_DIR = '/input';
const OUT_DIR = '/output';
const MAX_STEPS = 1_000_000;
const MAX_OUT = 65_536;

// Run one program; returns { out, exit }. HALT/EXIT return, traps throw their code.
function run(prog: Uint8Array, input: Uint8Array): { out: Uint8Array; exit: number } {
  const st = new Int32Array(256); // data stack
  const cs = new Int32Array(64); // return addresses
  const mem = new Int32Array(256);
  const out: number[] = [];
  let pc = 0, ip = 0, steps = 0, sp = 0, cp = 0;
  const done = (exit: number) => ({ out: new Uint8Array(out), exit });
  const need = (n: number) => { if (sp < n) throw 2; };
  const push = (v: number) => { if (sp >= 256) throw 3; st[sp++] = v | 0; };
  const bin = () => { need(2); return [st[--sp], st[--sp]] as const; }; // [b, a], b is top
  const op2 = (f: (a: number, b: number) => number) => { const [b, a] = bin(); push(f(a, b)); };
  const imm16 = () => { if (pc + 3 > prog.length) throw 9; return prog[pc + 1] | (prog[pc + 2] << 8); };
  const s16 = (v: number) => (v << 16) >> 16;
  try {
    for (;;) {
      if (steps >= MAX_STEPS) throw 10; // step limit
      if (pc < 0 || pc >= prog.length) throw 9;
      const op = prog[pc];
      steps++;
      let next = pc + 1;
      switch (op) {
        case 0x00: return done(0);
        case 0x01: // PUSH8, sign-extended
          if (pc + 2 > prog.length) throw 9;
          push((prog[pc + 1] << 24) >> 24);
          next = pc + 2;
          break;
        case 0x02: // PUSH32, little-endian
          if (pc + 5 > prog.length) throw 9;
          push(prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24));
          next = pc + 5;
          break;
        case 0x03: need(1); sp--; break;
        case 0x04: need(1); push(st[sp - 1]); break;
        case 0x05: { const [b, a] = bin(); push(b); push(a); break; } // SWAP
        case 0x06: need(2); push(st[sp - 2]); break;
        case 0x07: { // ROT (a b c -- b c a)
          need(3);
          const c = st[--sp], b = st[--sp], a = st[--sp];
          push(b); push(c); push(a);
          break;
        }
        case 0x10: op2((a, b) => a + b); break;
        case 0x11: op2((a, b) => a - b); break;
        case 0x12: op2((a, b) => Math.imul(a, b)); break;
        case 0x13: op2((a, b) => { if (b === 0) throw 4; return (a / b) | 0; }); break; // DIV, trunc toward zero
        case 0x14: op2((a, b) => { if (b === 0) throw 4; return (a % b) | 0; }); break; // MOD, sign of a
        case 0x15: op2((a, b) => { if (b === 0) throw 4; return ((a >>> 0) / (b >>> 0)) | 0; }); break; // DIVU
        case 0x16: op2((a, b) => { if (b === 0) throw 4; return ((a >>> 0) % (b >>> 0)) | 0; }); break; // MODU
        case 0x17: need(1); push(-st[--sp]); break;
        case 0x18: op2((a, b) => a & b); break;
        case 0x19: op2((a, b) => a | b); break;
        case 0x1a: op2((a, b) => a ^ b); break;
        case 0x1b: need(1); push(~st[--sp]); break;
        case 0x1c: op2((a, b) => a << (b & 31)); break;
        case 0x1d: op2((a, b) => a >> (b & 31)); break; // SHR, arithmetic
        case 0x1e: op2((a, b) => a >>> (b & 31)); break; // SHRU, logical
        case 0x20: op2((a, b) => (a === b ? 1 : 0)); break;
        case 0x21: op2((a, b) => (a < b ? 1 : 0)); break;
        case 0x22: op2((a, b) => ((a >>> 0) < (b >>> 0) ? 1 : 0)); break;
        case 0x30: next = pc + 3 + s16(imm16()); break; // JMP, relative to next instr
        case 0x31: { // JZ
          const off = s16(imm16());
          need(1);
          next = st[--sp] === 0 ? pc + 3 + off : pc + 3;
          break;
        }
        case 0x32: { // JNZ
          const off = s16(imm16());
          need(1);
          next = st[--sp] !== 0 ? pc + 3 + off : pc + 3;
          break;
        }
        case 0x33: { // CALL, absolute unsigned target
          const target = imm16();
          if (cp >= 64) throw 7;
          cs[cp++] = pc + 3;
          next = target;
          break;
        }
        case 0x34:
          if (cp === 0) throw 8;
          next = cs[--cp];
          break;
        case 0x40: { // LOAD
          need(1);
          const addr = st[--sp];
          if (addr < 0 || addr > 255) throw 6;
          push(mem[addr]);
          break;
        }
        case 0x41: { // STORE (v addr --): addr is top
          need(2);
          const addr = st[--sp], v = st[--sp];
          if (addr < 0 || addr > 255) throw 6;
          mem[addr] = v;
          break;
        }
        case 0x50: { // PRINT, decimal, no newline
          need(1);
          const s = String(st[--sp]);
          if (out.length + s.length > MAX_OUT) throw 11;
          for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
          break;
        }
        case 0x51:
          need(1);
          if (out.length + 1 > MAX_OUT) throw 11;
          out.push(st[--sp] & 255);
          break;
        case 0x52: push(ip < input.length ? input[ip++] : -1); break;
        case 0x53: need(1); return done(st[--sp] & 255);
        default: throw 5;
      }
      pc = next;
    }
  } catch (e) {
    return done(typeof e === 'number' ? e : 9);
  }
}

// Missing files behave as empty (empty program traps 9, IN reads -1).
for (let k = 1; k <= 40; k++) {
  const id = 'i' + String(k).padStart(3, '0');
  let prog = new Uint8Array(0);
  let input = new Uint8Array(0);
  try { prog = readFileSync(IN_DIR + '/' + id + '/program.bin'); } catch {}
  try { input = readFileSync(IN_DIR + '/' + id + '/input.bin'); } catch {}
  const { out, exit } = run(prog, input);
  const dir = OUT_DIR + '/' + id;
  mkdirSync(dir, { recursive: true });
  writeFileSync(dir + '/stdout.bin', out);
  writeFileSync(dir + '/exit.txt', exit + '\n');
}
