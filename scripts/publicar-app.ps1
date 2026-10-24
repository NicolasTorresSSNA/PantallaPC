<#
  Compila PantallaPC y actualiza la app instalada localmente SIN tocar su
  carpeta "data" (dispositivos de confianza, ajustes, fuente elegida).

  Uso:  powershell -ExecutionPolicy Bypass -File scripts\publicar-app.ps1
        (opcional) -Destino "E:\Otra\Carpeta"

  Por defecto publica en una carpeta "PantallaPC-App" junto a la del repositorio.
#>
param(
  [string]$Destino = (Join-Path (Split-Path (Split-Path $PSScriptRoot)) "PantallaPC-App")
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

if (Get-Process -Name "PantallaPC" -ErrorAction SilentlyContinue) {
  throw "PantallaPC esta abierta. Cierrala antes de publicar."
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

npm run build
if ($LASTEXITCODE -ne 0) { throw "Fallo la compilacion." }

npx electron-builder --win dir --config electron-builder.yml
if ($LASTEXITCODE -ne 0) { throw "Fallo el empaquetado." }

# /MIR refleja la carpeta nueva; /XD data protege los datos del usuario.
robocopy "dist\win-unpacked" $Destino /MIR /XD data /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Fallo la copia a $Destino (robocopy $LASTEXITCODE)." }

Write-Host "Listo: $Destino\PantallaPC.exe (datos conservados en $Destino\data)"
