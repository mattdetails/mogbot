# Points CMake's assembler at the cl.exe of the newest MSVC toolset that is on disk.
#
# Why: whisper.cpp's ggml says `project(ggml C CXX ASM)`. With the Visual Studio
# generator CMake finds the C and C++ compilers through Visual Studio (the toolset
# that is installed), but looks the assembler up on its own, and on the VS 2026
# runner image (windows-2025-vs2026) that lookup answers a cl.exe in a toolset
# folder that is not there (MSVC/14.51.36231 while only 14.52.37025 is installed):
#   CMake Error at ggml/CMakeLists.txt:2 (project):
#     The CMAKE_ASM_COMPILER: ...MSVC/14.51.36231/bin/Hostx64/x64/cl.exe
#     is not a full path to an existing compiler tool.
# It fails every time on that image, not at random (CI runs 44513519829 and
# 44555831322). whisper-rs-sys forwards every CMAKE_* environment variable to
# cmake as -D, so naming the compiler here is the whole fix.
# Used by the Windows jobs in ci.yml and build-installers.yml.
$ErrorActionPreference = 'Stop'
$globs = @("$env:ProgramFiles\Microsoft Visual Studio\*\*\VC\Tools\MSVC\*\bin\Hostx64\x64\cl.exe",
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\*\*\VC\Tools\MSVC\*\bin\Hostx64\x64\cl.exe")
$cl = Get-ChildItem -Path $globs -ErrorAction SilentlyContinue |
  Sort-Object { [version]($_.FullName -replace '^.*\\MSVC\\([^\\]+)\\bin\\.*$', '$1') } -Descending |
  Select-Object -First 1
if (-not $cl) { throw 'No MSVC cl.exe (Hostx64/x64) found under Visual Studio' }
$path = $cl.FullName -replace '\\', '/'
Write-Host "CMAKE_ASM_COMPILER=$path"
"CMAKE_ASM_COMPILER=$path" | Out-File -Append -Encoding utf8 $env:GITHUB_ENV
