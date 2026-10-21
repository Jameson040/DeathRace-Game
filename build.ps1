# PowerShell builder for death-race.html
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$parts = Get-ChildItem -Path (Join-Path $dir "src") | Where-Object { $_.Name -match '^\d{2}_' } | Sort-Object Name
$chunks = foreach ($p in $parts) {
    [System.IO.File]::ReadAllText($p.FullName)
}
$content = $chunks -join "`n"
$outPath = Join-Path $dir "death-race.html"
[System.IO.File]::WriteAllText($outPath, $content, [System.Text.Encoding]::UTF8)

$startIndex = $content.IndexOf('<script type="module">')
$endIndex = $content.LastIndexOf('</script>')
if ($startIndex -ge 0 -and $endIndex -gt $startIndex) {
    $scriptContent = $content.Substring($startIndex + '<script type="module">'.Length, $endIndex - ($startIndex + '<script type="module">'.Length))
    $checkPath = Join-Path $dir ".module-check.mjs"
    [System.IO.File]::WriteAllText($checkPath, $scriptContent, [System.Text.Encoding]::UTF8)
    node --check $checkPath
    Remove-Item $checkPath -Force
    Write-Host "Built $outPath ($((Get-Item $outPath).Length) bytes) from $($parts.Count) parts. Node check OK."
} else {
    Write-Error "Could not find module script tags."
}
