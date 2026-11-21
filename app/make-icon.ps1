# Draws app\icon.ico (256x256 PNG inside an ICO container). Run once; the result is committed.
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)

# rounded blue square
$r = 56
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(8, 8, $r, $r, 180, 90)
$path.AddArc($size - 8 - $r, 8, $r, $r, 270, 90)
$path.AddArc($size - 8 - $r, $size - 8 - $r, $r, $r, 0, 90)
$path.AddArc(8, $size - 8 - $r, $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(37, 99, 235))), $path)

# "</>" mark
$font = New-Object System.Drawing.Font 'Segoe UI', 92, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
$g.DrawString('</>', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 0, $size, ($size - 8)), $fmt)

# green dot = "new orders"
$g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(34, 197, 94))), 178, 22, 56, 56)
$g.Dispose()

$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$png = $ms.ToArray()

$out = Join-Path $PSScriptRoot 'icon.ico'
$fs = [System.IO.File]::Create($out)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)          # ICONDIR
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0) # 256x256, no palette
$w.Write([UInt16]1); $w.Write([UInt16]32)                              # planes, bpp
$w.Write([UInt32]$png.Length); $w.Write([UInt32]22)                    # size, offset
$w.Write($png)
$w.Close()
"icon written: $out"
