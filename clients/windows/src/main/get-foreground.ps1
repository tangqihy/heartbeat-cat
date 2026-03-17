Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FGWin {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
$h = [FGWin]::GetForegroundWindow()
$procId = [uint32]0
[FGWin]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
$sb = New-Object Text.StringBuilder 512
[FGWin]::GetWindowText($h, $sb, 512) | Out-Null
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
$name = if ($p) { $p.ProcessName } else { "Unknown" }
[PSCustomObject]@{ appName = $name; title = $sb.ToString() } | ConvertTo-Json -Compress
