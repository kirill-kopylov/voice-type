import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface WindowChange {
  change: 'focus' | 'open' | 'close'
  title: string
  app?: string
}

// Один долгоживущий PowerShell на всю запись: следит за окнами и переводит коды клавиш в символы
// с учётом раскладки активного окна (uiohook отдаёт только коды, а набирают и по-русски).
// Вывод: «W<TAB>focus|open|close<TAB>заголовок[<TAB>программа]» и «K<TAB>символ» — по строке на ответ.
// Скрипт лежит в шаблонной строке TS: обратных кавычек, «$» с фигурной скобкой и обратных слэшей в нём быть не должно.
const SCRIPT = `param([int]$ownPid)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class Watcher {
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr h, int index);
    [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint thread);
    [DllImport("user32.dll")] static extern uint MapVirtualKeyEx(uint code, uint type, IntPtr layout);
    [DllImport("user32.dll")] static extern short GetKeyState(int key);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int ToUnicodeEx(uint vk, uint scan, byte[] keys, StringBuilder buffer, int size, uint flags, IntPtr layout);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attribute, out int value, int size);

    static readonly object Gate = new object();
    static readonly char Tab = (char)9;
    static readonly string[] Noise = { "Program Manager", "Windows Input Experience", "Microsoft Text Input Application", "Task Switching" };
    static int OwnPid;
    static volatile bool Done;

    static void Emit(string line) { lock (Gate) { Console.Out.WriteLine(line); Console.Out.Flush(); } }
    static string Clean(string s) { return s.Replace(Tab, ' ').Replace((char)13, ' ').Replace((char)10, ' ').Trim(); }

    static string Title(IntPtr h) {
        StringBuilder sb = new StringBuilder(512);
        GetWindowText(h, sb, 512);
        return Clean(sb.ToString());
    }

    static uint ProcessOf(IntPtr h) { uint pid; GetWindowThreadProcessId(h, out pid); return pid; }

    static string AppName(IntPtr h) {
        try { return Process.GetProcessById((int)ProcessOf(h)).ProcessName; } catch { return ""; }
    }

    static Dictionary<IntPtr, string> VisibleWindows() {
        Dictionary<IntPtr, string> map = new Dictionary<IntPtr, string>();
        EnumWindows(delegate (IntPtr h, IntPtr l) {
            if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
            if ((GetWindowLong(h, -20) & 0x80) != 0) return true;
            int cloaked = 0;
            DwmGetWindowAttribute(h, 14, out cloaked, 4);
            if (cloaked != 0 || (int)ProcessOf(h) == OwnPid) return true;
            string title = Title(h);
            if (title.Length == 0 || Array.IndexOf(Noise, title) >= 0) return true;
            map[h] = title;
            return true;
        }, IntPtr.Zero);
        return map;
    }

    static string CharFor(uint keycode, bool shift) {
        uint scan = keycode & 0xFF;
        IntPtr foreground = GetForegroundWindow();
        uint processSink;
        IntPtr layout = GetKeyboardLayout(GetWindowThreadProcessId(foreground, out processSink));
        uint extended = (keycode & 0xE000) != 0 ? 0xE000u : 0u;
        uint vk = MapVirtualKeyEx(scan | extended, 3, layout);
        if (vk == 0) return "";
        byte[] keys = new byte[256];
        if (shift) keys[0x10] = 0x80;
        if ((GetKeyState(0x14) & 1) != 0) keys[0x14] = 1;
        StringBuilder buffer = new StringBuilder(8);
        int count = ToUnicodeEx(vk, scan, keys, buffer, 8, 4, layout);
        if (count != 1 || char.IsControl(buffer[0])) return "";
        return buffer[0].ToString();
    }

    static void ReadRequests() {
        string line;
        while ((line = Console.In.ReadLine()) != null) {
            string[] parts = line.Split(' ');
            if (parts.Length != 3 || parts[0] != "K") continue;
            string result = "";
            try { result = CharFor(uint.Parse(parts[1]), parts[2] == "1"); } catch { }
            Emit("K" + Tab + result);
        }
        Done = true;
    }

    public static void Run(int ownPid) {
        OwnPid = ownPid;
        Thread reader = new Thread(ReadRequests);
        reader.IsBackground = true;
        reader.Start();

        Dictionary<IntPtr, string> known = VisibleWindows();
        IntPtr candidate = IntPtr.Zero; string candidateTitle = ""; DateTime candidateSince = DateTime.UtcNow;
        IntPtr emitted = IntPtr.Zero; string emittedTitle = null;

        while (!Done) {
            IntPtr foreground = GetForegroundWindow();
            string title = Title(foreground);
            if (foreground != candidate || title != candidateTitle) { candidate = foreground; candidateTitle = title; candidateSince = DateTime.UtcNow; }
            bool stable = (DateTime.UtcNow - candidateSince).TotalMilliseconds >= 600;
            bool changed = candidate != emitted || candidateTitle != emittedTitle;
            if (stable && changed && candidateTitle.Length > 0 && (int)ProcessOf(candidate) != OwnPid) {
                emitted = candidate; emittedTitle = candidateTitle;
                Emit("W" + Tab + "focus" + Tab + candidateTitle + Tab + AppName(candidate));
            }

            Dictionary<IntPtr, string> now = VisibleWindows();
            foreach (KeyValuePair<IntPtr, string> window in now) if (!known.ContainsKey(window.Key)) Emit("W" + Tab + "open" + Tab + window.Value);
            foreach (KeyValuePair<IntPtr, string> window in known) if (!now.ContainsKey(window.Key)) Emit("W" + Tab + "close" + Tab + window.Value);
            known = now;
            Thread.Sleep(400);
        }
    }
}
"@
[Watcher]::Run($ownPid)
`

function scriptPath(): string {
  const file = path.join(app.getPath('userData'), 'window-watcher.ps1')
  fs.writeFileSync(file, SCRIPT, 'utf-8')
  return file
}

/** Следит за окнами и расшифровывает коды клавиш в символы. Если PowerShell недоступен, просто молчит. */
export class WindowWatcher {
  private child: ChildProcessWithoutNullStreams | null = null
  private pendingChars: Array<(char: string) => void> = []
  private buffered = ''

  start(onChange: (change: WindowChange) => void): boolean {
    try {
      const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath(), String(process.pid)], { windowsHide: true })
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (data: string) => this.handleOutput(data, onChange))
      child.stderr.on('data', (data: Buffer) => console.error('[window-watcher]', data.toString().trim()))
      child.on('exit', () => this.release())
      child.on('error', (error) => { console.error('[window-watcher] не запустился:', error.message); this.release() })
      this.child = child
      return true
    } catch (error) {
      console.error('[window-watcher] не запустился:', error instanceof Error ? error.message : error)
      return false
    }
  }

  /** Символ, который даёт клавиша в раскладке активного окна; пустая строка — не печатная. */
  requestChar(keycode: number, shift: boolean): Promise<string> {
    const child = this.child
    if (!child || child.killed) return Promise.resolve('')
    return new Promise((resolve) => {
      this.pendingChars.push(resolve)
      child.stdin.write(`K ${keycode} ${shift ? 1 : 0}\n`)
    })
  }

  stop(): void {
    this.child?.kill()
    this.release()
  }

  /** Процесса нет — ждущие ответа получают пустую строку, а не зависают */
  private release(): void {
    this.child = null
    this.pendingChars.splice(0).forEach((resolve) => resolve(''))
  }

  private handleOutput(data: string, onChange: (change: WindowChange) => void): void {
    const lines = (this.buffered + data).split('\n')
    this.buffered = lines.pop() ?? ''
    for (const raw of lines) {
      const [type, first = '', second = '', third = ''] = raw.replace(/\r$/, '').split('\t')
      if (type === 'K') this.pendingChars.shift()?.(first)
      else if (type === 'W' && (first === 'focus' || first === 'open' || first === 'close')) {
        onChange({ change: first, title: second, app: third || undefined })
      }
    }
  }
}
