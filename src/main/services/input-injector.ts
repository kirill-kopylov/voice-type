import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Один PowerShell на всю жизнь приложения: C# с SendInput компилируется один раз, дальше команды идут
 * строками в stdin и исполняются за миллисекунды. Запуск PowerShell на каждое нажатие стоил ~секунду —
 * для пульта с мышью это неприемлемо.
 *
 * Команды (по строке): tap <vk> [ctrl|shift|alt...] · down <vk> · up <vk> · move <dx> <dy> ·
 * button <left|right> <down|up> · wheel <dy> <dx>. На каждую helper отвечает «ok».
 */
const HELPER_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class Injector {
    [StructLayout(LayoutKind.Sequential)]
    struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Explicit)]
    struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }

    [StructLayout(LayoutKind.Sequential)]
    struct INPUT { public uint type; public InputUnion u; }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    const uint KEYEVENTF_EXTENDEDKEY = 0x1, KEYEVENTF_KEYUP = 0x2;
    const uint MOUSE_MOVE = 0x1, LEFT_DOWN = 0x2, LEFT_UP = 0x4, RIGHT_DOWN = 0x8, RIGHT_UP = 0x10, WHEEL = 0x800, HWHEEL = 0x1000;

    static bool IsExtended(ushort vk) { return (vk >= 0x21 && vk <= 0x28) || vk == 0x2D || vk == 0x2E; }

    static INPUT Key(ushort vk, bool up) {
        INPUT input = new INPUT();
        input.type = 1;
        input.u.ki.wVk = vk;
        input.u.ki.dwFlags = (up ? KEYEVENTF_KEYUP : 0) | (IsExtended(vk) ? KEYEVENTF_EXTENDEDKEY : 0);
        return input;
    }

    static INPUT Mouse(uint flags, int dx, int dy, int data) {
        INPUT input = new INPUT();
        input.type = 0;
        input.u.mi.dwFlags = flags;
        input.u.mi.dx = dx;
        input.u.mi.dy = dy;
        input.u.mi.mouseData = unchecked((uint)data);
        return input;
    }

    static void Send(params INPUT[] inputs) { SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))); }

    static ushort Modifier(string name) {
        if (name == "ctrl") return 0x11;
        if (name == "shift") return 0x10;
        if (name == "alt") return 0x12;
        throw new ArgumentException(name);
    }

    public static void Run(string line) {
        string[] p = line.Split(' ');
        switch (p[0]) {
            case "tap": {
                ushort vk = ushort.Parse(p[1]);
                int mods = p.Length - 2;
                INPUT[] inputs = new INPUT[mods * 2 + 2];
                for (int i = 0; i < mods; i++) {
                    inputs[i] = Key(Modifier(p[i + 2]), false);
                    inputs[inputs.Length - 1 - i] = Key(Modifier(p[i + 2]), true);
                }
                inputs[mods] = Key(vk, false);
                inputs[mods + 1] = Key(vk, true);
                Send(inputs);
                break;
            }
            case "down": Send(Key(ushort.Parse(p[1]), false)); break;
            case "up": Send(Key(ushort.Parse(p[1]), true)); break;
            case "move": Send(Mouse(MOUSE_MOVE, int.Parse(p[1]), int.Parse(p[2]), 0)); break;
            case "button": {
                bool left = p[1] == "left", down = p[2] == "down";
                Send(Mouse(left ? (down ? LEFT_DOWN : LEFT_UP) : (down ? RIGHT_DOWN : RIGHT_UP), 0, 0, 0));
                break;
            }
            case "wheel": {
                int dy = int.Parse(p[1]), dx = int.Parse(p[2]);
                if (dy != 0) Send(Mouse(WHEEL, 0, 0, dy));
                if (dx != 0) Send(Mouse(HWHEEL, 0, 0, dx));
                break;
            }
        }
    }
}
"@
[Console]::Out.WriteLine("ready")
while ($null -ne ($line = [Console]::In.ReadLine())) {
    try { [Injector]::Run($line) } catch { [Console]::Error.WriteLine($_.Exception.Message) }
    [Console]::Out.WriteLine("ok")
}
`

type Modifier = 'ctrl' | 'shift' | 'alt'

export const VK = {
  BACKSPACE: 8, TAB: 9, ENTER: 13, ALT: 18, ESC: 27, PAGE_UP: 33, PAGE_DOWN: 34,
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, V: 0x56
} as const

class InputInjector {
  private helper: ChildProcessWithoutNullStreams | null = null
  /** Ожидающие ответа «ok» — helper отвечает строго по порядку команд */
  private waiting: Array<() => void> = []
  private stdoutTail = ''

  /** Поднимает helper заранее: первая команда тогда не ждёт компиляции C#. */
  warmUp(): void {
    this.ensureHelper()
  }

  tap(vk: number, ...modifiers: Modifier[]): Promise<void> {
    return this.send(['tap', vk, ...modifiers].join(' '))
  }

  keyDown(vk: number): Promise<void> {
    return this.send(`down ${vk}`)
  }

  keyUp(vk: number): Promise<void> {
    return this.send(`up ${vk}`)
  }

  move(dx: number, dy: number): Promise<void> {
    return this.send(`move ${Math.round(dx)} ${Math.round(dy)}`)
  }

  button(button: 'left' | 'right', pressed: boolean): Promise<void> {
    return this.send(`button ${button} ${pressed ? 'down' : 'up'}`)
  }

  /** Единица колеса Windows — 120 на щелчок; меньшие значения дают плавную прокрутку. */
  wheel(dy: number, dx: number): Promise<void> {
    return this.send(`wheel ${Math.round(dy)} ${Math.round(dx)}`)
  }

  stop(): void {
    this.helper?.kill()
    this.helper = null
  }

  private send(command: string): Promise<void> {
    const helper = this.ensureHelper()
    return new Promise((resolve) => {
      this.waiting.push(resolve)
      helper.stdin.write(`${command}\n`)
    })
  }

  private ensureHelper(): ChildProcessWithoutNullStreams {
    if (this.helper) return this.helper

    const scriptPath = join(app.getPath('userData'), 'input-helper.ps1')
    writeFileSync(scriptPath, HELPER_SCRIPT, 'utf-8')
    const helper = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true })

    helper.stdout.setEncoding('utf-8')
    helper.stdout.on('data', (chunk: string) => {
      const lines = (this.stdoutTail + chunk).split(/\r?\n/)
      this.stdoutTail = lines.pop() ?? ''
      lines.filter((line) => line.trim() === 'ok').forEach(() => this.waiting.shift()?.())
    })
    helper.stderr.on('data', (chunk: Buffer) => console.error('[input] helper:', chunk.toString().trim()))
    helper.on('exit', (code) => {
      console.warn(`[input] helper завершился (${code}), поднимется при следующей команде`)
      if (this.helper === helper) this.helper = null
      // Команды, на которые ответа уже не будет, не должны вешать вызывающих
      this.waiting.splice(0).forEach((resolve) => resolve())
      this.stdoutTail = ''
    })
    helper.stdin.on('error', (error) => console.error('[input] stdin:', error.message))

    this.helper = helper
    return helper
  }
}

export const inputInjector = new InputInjector()
