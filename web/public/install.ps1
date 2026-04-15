#Requires -Version 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = 'Stop'

$Repo    = "test-mesh/testmesh"
$Binary  = "testmesh"
$InstallDir = if ($env:TESTMESH_INSTALL_DIR) { $env:TESTMESH_INSTALL_DIR } `
              else { Join-Path $env:LOCALAPPDATA "Programs\testmesh" }

# Parse --version argument
$Version = ""
for ($i = 0; $i -lt $args.Count; $i++) {
    if ($args[$i] -match '^--version=(.+)$') { $Version = $Matches[1]; break }
    if ($args[$i] -eq '--version' -and $i + 1 -lt $args.Count) { $Version = $args[$i + 1]; break }
}

# Detect architecture
$Arch = switch ($env:PROCESSOR_ARCHITECTURE) {
    "AMD64" { "amd64" }
    "ARM64" { "arm64" }
    default { Write-Error "Unsupported architecture: $env:PROCESSOR_ARCHITECTURE"; exit 1 }
}

# Fetch latest version if not specified
if (-not $Version) {
    Write-Host "Fetching latest version..."
    $release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest"
    $Version = $release.tag_name
    if (-not $Version) { Write-Error "Failed to fetch latest version"; exit 1 }
}

$Ver     = $Version.TrimStart('v')
$Archive = "${Binary}_${Ver}_windows_${Arch}.zip"
$BaseUrl = "https://github.com/$Repo/releases/download/$Version"

Write-Host "Installing testmesh $Version (windows/$Arch)..."

# Download to temp directory
$TmpDir = Join-Path $env:TEMP ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $TmpDir | Out-Null

try {
    $ArchivePath   = Join-Path $TmpDir $Archive
    $ChecksumPath  = Join-Path $TmpDir "checksums.txt"

    Write-Host "Downloading $Archive..."
    Invoke-WebRequest "$BaseUrl/$Archive"   -OutFile $ArchivePath  -UseBasicParsing
    Invoke-WebRequest "$BaseUrl/checksums.txt" -OutFile $ChecksumPath -UseBasicParsing

    # Verify checksum
    $Expected = (Get-Content $ChecksumPath | Where-Object { $_ -match [regex]::Escape($Archive) }) -split '\s+' | Select-Object -First 1
    $Actual   = (Get-FileHash $ArchivePath -Algorithm SHA256).Hash.ToLower()
    if ($Actual -ne $Expected) {
        Write-Error "Checksum mismatch`n  expected: $Expected`n  actual:   $Actual"
        exit 1
    }

    # Extract
    Expand-Archive $ArchivePath -DestinationPath $TmpDir -Force

    # Install
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Move-Item (Join-Path $TmpDir "$Binary.exe") (Join-Path $InstallDir "$Binary.exe") -Force

    # Add to PATH for current user if not already present
    $UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($UserPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("PATH", "$UserPath;$InstallDir", "User")
        $env:PATH = "$env:PATH;$InstallDir"
        Write-Host "Added $InstallDir to PATH (restart your terminal to take effect)"
    }

    Write-Host "testmesh installed to $InstallDir\$Binary.exe"
    Write-Host "Run 'testmesh --version' to verify."
}
finally {
    Remove-Item $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
