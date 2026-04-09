import { execFile } from 'child_process'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app, clipboard } from 'electron'

let scriptPath: string | null = null
let stickyHwnd: string | null = null

function ensureScript(): string {
  if (scriptPath && existsSync(scriptPath)) return scriptPath

  scriptPath = join(app.getPath('userData'), 'sticky-window.ps1')

  const script = `
param([string]$action, [string]$hwnd)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class StickyWin {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

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

    public static void SendKeys(ushort vk) {
        INPUT[] inputs = new INPUT[2];
        int size = Marshal.SizeOf(typeof(INPUT));
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = vk;
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = vk;
        inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(2, inputs, size);
    }

    public static void CtrlV() {
        INPUT[] inputs = new INPUT[4];
        int size = Marshal.SizeOf(typeof(INPUT));
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].ki.wVk = 0x11; // VK_CONTROL
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].ki.wVk = 0x56; // VK_V
        inputs[2].type = INPUT_KEYBOARD;
        inputs[2].ki.wVk = 0x56;
        inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;
        inputs[3].type = INPUT_KEYBOARD;
        inputs[3].ki.wVk = 0x11;
        inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;
        SendInput(4, inputs, size);
    }
}
"@

if ($action -eq "capture") {
    $h = [StickyWin]::GetForegroundWindow()
    Write-Output $h.ToInt64()
}
elseif ($action -eq "paste-and-send") {
    $currentWindow = [StickyWin]::GetForegroundWindow()
    $targetHwnd = [IntPtr]::new([long]$hwnd)

    if (-not [StickyWin]::IsWindow($targetHwnd)) {
        Write-Output "INVALID"
        exit
    }

    # Переключаемся на целевое окно
    [StickyWin]::SetForegroundWindow($targetHwnd)
    Start-Sleep -Milliseconds 150

    # Ctrl+V
    [StickyWin]::CtrlV()
    Start-Sleep -Milliseconds 200

    # Enter
    [StickyWin]::SendKeys(0x0D)
    Start-Sleep -Milliseconds 150

    # Возвращаемся в исходное окно
    [StickyWin]::SetForegroundWindow($currentWindow)
    Write-Output "OK"
}
`

  writeFileSync(scriptPath, script, 'utf-8')
  return scriptPath
}

export function captureWindow(): Promise<string | null> {
  return new Promise((resolve) => {
    const script = ensureScript()
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, 'capture'], (err, stdout) => {
      if (err) {
        console.error('[sticky] Ошибка захвата:', err.message)
        resolve(null)
        return
      }
      const hwnd = stdout.trim()
      if (hwnd && hwnd !== '0') {
        stickyHwnd = hwnd
        console.log(`[sticky] Окно зафиксировано: HWND ${hwnd}`)
        resolve(hwnd)
      } else {
        resolve(null)
      }
    })
  })
}

export function pasteToStickyWindow(text: string, keepInClipboard: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (!stickyHwnd) {
      resolve(false)
      return
    }

    const previousClipboard = clipboard.readText()
    clipboard.writeText(text)

    const script = ensureScript()
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, 'paste-and-send', stickyHwnd], (err, stdout) => {
      if (err) {
        console.error('[sticky] Ошибка вставки:', err.message)
        resolve(false)
        return
      }

      if (!keepInClipboard) {
        setTimeout(() => clipboard.writeText(previousClipboard), 300)
      }

      const result = stdout.trim()
      if (result === 'INVALID') {
        console.log('[sticky] Окно больше не существует, сброс')
        stickyHwnd = null
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

export function getStickyHwnd(): string | null {
  return stickyHwnd
}

export function clearStickyWindow(): void {
  stickyHwnd = null
  console.log('[sticky] Фиксация сброшена')
}
