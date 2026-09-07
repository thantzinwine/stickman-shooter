# restart-server.ps1 [port] [file]
# Kill any node running the given server file, then start it fresh on the port.
# Usage (host PowerShell):  .\restart-server.ps1 3002    -> vulnerable on 3002
#                           .\restart-server.ps1 3001 server-secure.js
param(
    [int]$Port = 3000,
    [string]$File = "server.js"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSCommandPath -Parent

# 1. Kill every node process running this server file (handles frozen ReDoS victims)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*$File*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep 2

# 2. Env + launch with detached streams (so the console never blocks)
$env:PGUSER   = "postgres"
$env:PGPASSWORD = "postgres"
$env:PORT     = [string]$Port

$out = Join-Path $root "server-$Port.out.log"
$err = Join-Path $root "server-$Port.err.log"
$p = Start-Process -FilePath "node" -ArgumentList $File -WorkingDirectory $root `
    -RedirectStandardOutput $out -RedirectStandardError $err `
    -WindowStyle Hidden -PassThru

Start-Sleep 3
Write-Host "STARTED $File on port $Port (PID $($p.Id))"
Write-Host "  check: curl http://localhost:$Port/api/skins"
Write-Host "  logs:  $out / $err"
Write-Host "  VM:    point attacks at http://192.168.56.1:$Port"