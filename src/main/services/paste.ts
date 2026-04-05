import { clipboard } from 'electron'
import { execFile } from 'child_process'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

let scriptPath: string | null = null

function ensurePasteScript(): string {
  if (scriptPath && existsSync(scriptPath)) return scriptPath

  scriptPath = join(app.getPath('userData'), 'paste-helper.ps1')

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class KeySender {
    [StructLayout(LayoutKind.Sequential)]
    struct INPUT {
        public uint type;
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
        public uint pad1;
        public uint pad2;
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_KEYUP = 0x0002;
    const ushort VK_CONTROL = 0x11;
    const ushort VK_V = 0x56;

    public static void CtrlV() {
        INPUT[] inputs = new INPUT[4];
        int size = Marshal.SizeOf(typeof(INPUT));

        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = VK_CONTROL;

        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = VK_V;

        inputs[2].type = INPUT_KEYBOARD;
        inputs[2].ki.wVk = VK_V;
        inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;

        inputs[3].type = INPUT_KEYBOARD;
        inputs[3].ki.wVk = VK_CONTROL;
        inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;

        SendInput(4, inputs, size);
    }
}
"@
Start-Sleep -Milliseconds 80
[KeySender]::CtrlV()
`

  writeFileSync(scriptPath, script, 'utf-8')
  return scriptPath
}

export function pasteText(text: string, keepInClipboard: boolean): void {
  const previousClipboard = clipboard.readText()
  clipboard.writeText(text)

  const script = ensurePasteScript()

  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], (err) => {
    if (err) {
      console.error('Ошибка вставки:', err.message)
    }

    // Восстанавливаем предыдущее содержимое буфера обмена
    if (!keepInClipboard) {
      setTimeout(() => clipboard.writeText(previousClipboard), 300)
    }
  })
}
