# Crear Acceso Directo de Code Hub en el Escritorio
# Ejecutar una sola vez desde la carpeta del proyecto

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$batPath    = Join-Path $projectDir "Start Code Hub.bat"
$iconPath   = Join-Path $projectDir "hub-icon.ico"
$desktop    = [System.Environment]::GetFolderPath("Desktop")
$linkPath   = Join-Path $desktop "Code Hub.lnk"

# ── Generar icono .ico con System.Drawing ──────────────────────────────────
Add-Type -AssemblyName System.Drawing

$size = 64
$bmp  = New-Object System.Drawing.Bitmap($size, $size)
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode   = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Fondo redondeado violeta
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 108, 92, 231))
$rect    = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$radius  = 14
$path    = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
$path.AddArc($rect.Right - $radius, $rect.Y, $radius, $radius, 270, 90)
$path.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90)
$path.AddArc($rect.X, $rect.Bottom - $radius, $radius, $radius, 90, 90)
$path.CloseFigure()
$g.FillPath($bgBrush, $path)

# Icono terminal >_
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
# ">" chevron
$pts = @(
    [System.Drawing.Point]::new(10, 18),
    [System.Drawing.Point]::new(26, 32),
    [System.Drawing.Point]::new(10, 46)
)
$g.DrawLines($pen, $pts)
# "_" línea
$g.DrawLine($pen, 31, 46, 54, 46)

$g.Dispose()

# Guardar como ICO via handle
$iconHandle = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$stream = [System.IO.File]::Create($iconPath)
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
$bmp.Dispose()

# ── Crear acceso directo ────────────────────────────────────────────────────
$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($linkPath)
$shortcut.TargetPath       = $batPath
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation     = "$iconPath,0"
$shortcut.Description      = "Code Hub - ATT IT Tools"
$shortcut.WindowStyle      = 1
$shortcut.Save()

Write-Host ""
Write-Host "  Acceso directo creado en el Escritorio!" -ForegroundColor Green
Write-Host "  Icono guardado en: $iconPath" -ForegroundColor Cyan
Write-Host ""
