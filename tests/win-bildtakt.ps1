# Kurztest Bildtakt der Windows-VM nach dem kalten Neustart (halo_test.py --vm, über prlctl exec
# --current-user): ein rotes Feld ändert je Bild seine Breite, nach jedem Bild wartet DwmFlush auf die
# nächste Bildausgabe des Fensterverwalters. Schreibt die Abstände zwischen den Bildern in ms
# (Leerzeichen getrennt, Punkt als Dezimalzeichen) nach <Ausgabe>. Am 18.11.2026 kamen in der gestörten
# VM Bilder um 4 bis 12 Bilder verzögert; die Bewertung macht bildtakt_gestoert() in halo_test.py.
param([string]$Ausgabe, [int]$Bilder = 30)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Namespace Halo -Name Dwm -MemberDefinition '[DllImport("dwmapi.dll")] public static extern int DwmFlush();'
$f = New-Object System.Windows.Forms.Form
$f.Text = "halo.spaces Bildtakt"
$f.StartPosition = "Manual"
$f.Location = New-Object System.Drawing.Point(100, 100)
$f.ClientSize = New-Object System.Drawing.Size(600, 200)
$f.TopMost = $true
$f.BackColor = [System.Drawing.Color]::White
$p = New-Object System.Windows.Forms.Panel
$p.BackColor = [System.Drawing.Color]::Red
$p.Height = 200
$p.Width = 50
$f.Controls.Add($p)
$f.Show()
[System.Windows.Forms.Application]::DoEvents()
# einschwingen: Fenster ist sichtbar und gezeichnet
for ($i = 0; $i -lt 10; $i++) { [void][Halo.Dwm]::DwmFlush() }
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$t = New-Object System.Collections.Generic.List[double]
for ($i = 0; $i -le $Bilder; $i++) {
  $p.Width = 50 + ($i * 17) % 500
  $p.Refresh()
  [System.Windows.Forms.Application]::DoEvents()
  [void][Halo.Dwm]::DwmFlush()
  $t.Add($sw.Elapsed.TotalMilliseconds)
}
$f.Close()
$inv = [System.Globalization.CultureInfo]::InvariantCulture
$d = for ($i = 1; $i -lt $t.Count; $i++) { ([math]::Round($t[$i] - $t[$i - 1], 2)).ToString($inv) }
($d -join " ") | Out-File -Encoding ascii $Ausgabe
