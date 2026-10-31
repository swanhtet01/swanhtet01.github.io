[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-NonReparsePath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($full)
    $current = $root
    $remainder = $full.Substring($root.Length)
    foreach ($component in $remainder.Split([System.IO.Path]::DirectorySeparatorChar,
            [System.StringSplitOptions]::RemoveEmptyEntries)) {
        $current = Join-Path $current $component
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'postgres17_broker_reparse_path_rejected'
            }
        }
    }
    return $full
}

function Get-InputHashes {
    param([Parameter(Mandatory = $true)][object[]]$RelativePaths)
    $result = [ordered]@{}
    foreach ($relative in $RelativePaths) {
        $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $relative))
        if (-not $sourcePath.StartsWith(
                $repositoryRoot + [System.IO.Path]::DirectorySeparatorChar,
                [System.StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw 'postgres17_broker_source_path_invalid'
        }
        [void](Assert-NonReparsePath $sourcePath)
        $result[$relative] = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    return $result
}

function Resolve-ToolchainPathList {
    param([Parameter(Mandatory = $true)][string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw 'postgres17_broker_toolchain_path_list_missing'
    }
    return @($Value.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries) |
        ForEach-Object {
            $resolved = Assert-NonReparsePath $_
            if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
                throw 'postgres17_broker_toolchain_directory_missing'
            }
            $resolved
        })
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
[void](Assert-NonReparsePath $repositoryRoot)
$manifestPath = Join-Path $PSScriptRoot 'postgres17_execution_broker_build.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT -or
    $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    throw 'postgres17_broker_requires_windows_x64'
}
if ($manifest.contract -ne 'supermega.postgres17-windows-broker-build.v1' -or
    $manifest.target -ne 'windows-x64' -or
    $manifest.productionAdapterEnabled -ne $false -or
    $manifest.signed -ne $false -or
    $manifest.windowsValidated -ne $false) {
    throw 'postgres17_broker_manifest_not_fail_closed'
}
$sdkVersion = if ($null -eq $env:WindowsSDKVersion) { '' } else {
    $env:WindowsSDKVersion.TrimEnd('\')
}
if ($env:VSCMD_ARG_TGT_ARCH -ne 'x64' -or
    $sdkVersion -ne $manifest.windowsSdkVersion) {
    throw 'postgres17_broker_wrong_developer_prompt_or_sdk'
}

$compiler = Get-Command cl.exe -CommandType Application -ErrorAction Stop
$linker = Get-Command link.exe -CommandType Application -ErrorAction Stop
$compilerPath = Assert-NonReparsePath $compiler.Source
$linkerPath = Assert-NonReparsePath $linker.Source
if ((Split-Path -Parent $compilerPath) -ne (Split-Path -Parent $linkerPath)) {
    throw 'postgres17_broker_compiler_linker_root_mismatch'
}
$compilerBanner = (& $compilerPath /Bv 2>&1 | Out-String)
$versionMatch = [regex]::Match($compilerBanner, 'Compiler Version ([0-9.]+) for x64')
if (-not $versionMatch.Success -or
    $versionMatch.Groups[1].Value -ne $manifest.compiler.expectedVersion) {
    throw 'postgres17_broker_compiler_version_mismatch'
}

$compilerRoot = Assert-NonReparsePath (
    Join-Path (Split-Path -Parent $compilerPath) '..\..\..'
)
$sdkRoot = Assert-NonReparsePath $env:WindowsSdkDir
$sdkIncludeRoot = Assert-NonReparsePath (
    Join-Path $sdkRoot (Join-Path 'Include' $manifest.windowsSdkVersion)
)
$sdkLibraryRoot = Assert-NonReparsePath (
    Join-Path $sdkRoot (Join-Path 'Lib' $manifest.windowsSdkVersion)
)
foreach ($requiredRoot in @($compilerRoot, $sdkIncludeRoot, $sdkLibraryRoot)) {
    if (-not (Test-Path -LiteralPath $requiredRoot -PathType Container)) {
        throw 'postgres17_broker_toolchain_root_missing'
    }
}
$includePaths = Resolve-ToolchainPathList $env:INCLUDE
$libraryPaths = Resolve-ToolchainPathList $env:LIB
foreach ($path in $includePaths) {
    $allowed = $path.StartsWith(
        $compilerRoot + [System.IO.Path]::DirectorySeparatorChar,
        [System.StringComparison]::OrdinalIgnoreCase) -or
        $path.StartsWith(
            $sdkIncludeRoot + [System.IO.Path]::DirectorySeparatorChar,
            [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $allowed) {
        throw 'postgres17_broker_include_path_outside_pinned_roots'
    }
}
foreach ($path in $libraryPaths) {
    $allowed = $path.StartsWith(
        $compilerRoot + [System.IO.Path]::DirectorySeparatorChar,
        [System.StringComparison]::OrdinalIgnoreCase) -or
        $path.StartsWith(
            $sdkLibraryRoot + [System.IO.Path]::DirectorySeparatorChar,
            [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $allowed) {
        throw 'postgres17_broker_library_path_outside_pinned_roots'
    }
}

$resolvedLibraries = [ordered]@{}
foreach ($libraryName in $manifest.systemLibraries) {
    $matches = @($libraryPaths | ForEach-Object {
        $candidate = Join-Path $_ $libraryName
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            Assert-NonReparsePath $candidate
        }
    })
    if ($matches.Count -ne 1) {
        throw 'postgres17_broker_system_library_resolution_ambiguous'
    }
    $resolvedLibraries[$libraryName] = [ordered]@{
        path = $matches[0]
        sha256 = (Get-FileHash -LiteralPath $matches[0] -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}

$outputParent = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'out'))
if (-not (Test-Path -LiteralPath $outputParent)) {
    New-Item -ItemType Directory -Path $outputParent | Out-Null
}
[void](Assert-NonReparsePath $outputParent)
$resolvedOutput = [System.IO.Path]::GetFullPath(
    (Join-Path $outputParent 'postgres17-execution-broker-msvc-x64')
)
if (Test-Path -LiteralPath $resolvedOutput) {
    [void](Assert-NonReparsePath $resolvedOutput)
    if (@(Get-ChildItem -LiteralPath $resolvedOutput -Force).Count -ne 0) {
        throw 'postgres17_broker_output_directory_not_empty'
    }
} else {
    New-Item -ItemType Directory -Path $resolvedOutput | Out-Null
    [void](Assert-NonReparsePath $resolvedOutput)
}

$trackedInputs = Get-InputHashes @($manifest.buildInputs)
$compilerSha256 = (Get-FileHash -LiteralPath $compilerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$linkerSha256 = (Get-FileHash -LiteralPath $linkerPath -Algorithm SHA256).Hash.ToLowerInvariant()
$translationUnits = @($manifest.translationUnits | ForEach-Object {
    [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $_))
})
$outputPath = Join-Path $resolvedOutput $manifest.output
$objectDirectoryArgument = '/Fo:' + $resolvedOutput + [System.IO.Path]::DirectorySeparatorChar
$arguments = @($manifest.compileFlags) + @("/pathmap:$repositoryRoot=.") +
    @($objectDirectoryArgument) + $translationUnits +
    @("/Fe:$outputPath", '/link') + @($manifest.linkFlags) +
    @($manifest.systemLibraries)

Push-Location $resolvedOutput
try {
    & $compilerPath @arguments
    if ($LASTEXITCODE -ne 0 -or
        -not (Test-Path -LiteralPath $outputPath -PathType Leaf)) {
        throw 'postgres17_broker_compile_failed'
    }
} finally {
    Pop-Location
}

$postBuildInputs = Get-InputHashes @($manifest.buildInputs)
foreach ($relative in $manifest.buildInputs) {
    if ($trackedInputs[$relative] -ne $postBuildInputs[$relative]) {
        throw 'postgres17_broker_input_changed_during_build'
    }
}
if ($compilerSha256 -ne
        (Get-FileHash -LiteralPath $compilerPath -Algorithm SHA256).Hash.ToLowerInvariant() -or
    $linkerSha256 -ne
        (Get-FileHash -LiteralPath $linkerPath -Algorithm SHA256).Hash.ToLowerInvariant()) {
    throw 'postgres17_broker_tool_changed_during_build'
}
foreach ($libraryName in $manifest.systemLibraries) {
    $library = $resolvedLibraries[$libraryName]
    $postHash = (Get-FileHash -LiteralPath $library.path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($library.sha256 -ne $postHash) {
        throw 'postgres17_broker_system_library_changed_during_build'
    }
}

$receipt = [ordered]@{
    contract = 'supermega.postgres17-windows-broker-build-receipt.v1'
    authoritative = $false
    executionLocked = $false
    windowsValidated = $false
    signed = $false
    toolchainClosureComplete = $false
    compilerPath = $compilerPath
    compilerVersion = $versionMatch.Groups[1].Value
    compilerSha256 = $compilerSha256
    linkerPath = $linkerPath
    linkerSha256 = $linkerSha256
    windowsSdkVersion = $manifest.windowsSdkVersion
    windowsSdkRoot = $sdkRoot
    includePaths = @($includePaths)
    libraryPaths = @($libraryPaths)
    resolvedLibraries = $resolvedLibraries
    invocation = @($arguments)
    trackedInputs = $trackedInputs
    outputFile = $manifest.output
    outputBytes = (Get-Item -LiteralPath $outputPath).Length
    outputSha256 = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
}
$receiptPath = Join-Path $resolvedOutput 'build-receipt.json'
$receiptJson = $receipt | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(
    $receiptPath,
    $receiptJson + [System.Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
)
Write-Output ($receipt | ConvertTo-Json -Compress -Depth 8)
