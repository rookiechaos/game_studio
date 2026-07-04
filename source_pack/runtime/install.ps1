$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir = Join-Path $RootDir ".venv"
$PythonBin = if ($env:PYTHON_BIN) { $env:PYTHON_BIN } else { "python" }

Write-Host "[source-pack-runtime] creating virtual environment at $VenvDir"
& $PythonBin -m venv $VenvDir

$VenvPython = Join-Path $VenvDir "Scripts/python.exe"
$VenvPip = Join-Path $VenvDir "Scripts/pip.exe"

Write-Host "[source-pack-runtime] upgrading pip tooling"
& $VenvPython -m pip install --upgrade pip setuptools wheel

Write-Host "[source-pack-runtime] installing bundled runtime dependencies"
& $VenvPip install -r (Join-Path $RootDir "requirements/base.txt")
& $VenvPip install -e (Join-Path $RootDir "../..")

if ($env:INSTALL_SERVE_EXTRAS -eq "1") {
  Write-Host "[source-pack-runtime] installing optional serve dependencies"
  & $VenvPip install -r (Join-Path $RootDir "requirements/serve.txt")
}

Write-Host "[source-pack-runtime] install complete"
Write-Host "Next steps:"
Write-Host "1. cd source_pack/ui"
Write-Host "2. copy ui/.env.example to ui/.env.local"
Write-Host "3. keep GAME_STUDIO_RUNTIME_MODE=artifact-only until runtime validation is complete"
Write-Host "4. switch GAME_STUDIO_RUNTIME_MODE=bundled-cli when ready to invoke the packaged runtime"
Write-Host "5. set PYTHONPATH=$RootDir/python when running bundled CLI commands directly"
