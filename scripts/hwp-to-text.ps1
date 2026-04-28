# HWP/HWPX → TXT/HTML 변환 스크립트
# Hancom Office HwpAutomation COM 사용. Hancom Office 2020 이상 설치 필요.
#
# Usage:
#   pwsh -File scripts/hwp-to-text.ps1 -InputPath <input.hwp> [-OutputDir <dir>] [-Format txt|html|both]
#   pwsh -File scripts/hwp-to-text.ps1 -InputPath C:\project\lidamedu\source\*.hwp -Format txt
#
# 결과:
#   <OutputDir>/<basename>.txt  (단일 줄바꿈으로 본문)
#   <OutputDir>/<basename>.html (서식·표 보존)

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$InputPath,

  [string]$OutputDir,

  [ValidateSet('txt','html','both')]
  [string]$Format = 'txt'
)

$ErrorActionPreference = 'Stop'

function Convert-OneFile {
  param(
    [Parameter(Mandatory=$true)] $Hwp,
    [Parameter(Mandatory=$true)] [string]$Path,
    [Parameter(Mandatory=$true)] [string]$OutDir,
    [Parameter(Mandatory=$true)] [string]$Fmt
  )

  $base = [System.IO.Path]::GetFileNameWithoutExtension($Path)
  $abs  = (Resolve-Path -LiteralPath $Path).Path

  Write-Host "→ $abs"

  if (-not $Hwp.Open($abs, '', '')) {
    Write-Warning "  열기 실패: $abs"
    return
  }

  if ($Fmt -in 'txt','both') {
    $txtPath = Join-Path $OutDir "$base.txt"
    # SaveAs 형식 'TEXT' — UTF-8 출력은 별도 옵션. SaveAs 후 인코딩 변환은 필요 시 PowerShell 으로
    if ($Hwp.SaveAs($txtPath, 'TEXT', '')) {
      Write-Host "  ✓ $txtPath"
    } else {
      Write-Warning "  TEXT 저장 실패"
    }
  }

  if ($Fmt -in 'html','both') {
    $htmlPath = Join-Path $OutDir "$base.html"
    if ($Hwp.SaveAs($htmlPath, 'HTML', '')) {
      Write-Host "  ✓ $htmlPath"
    } else {
      Write-Warning "  HTML 저장 실패"
    }
  }

  $null = $Hwp.Clear(1) # 1 = discard changes
}

# 출력 디렉터리 결정
if (-not $OutputDir) {
  if (Test-Path -LiteralPath $InputPath -PathType Container) {
    $OutputDir = Join-Path $InputPath '_converted'
  } else {
    $OutputDir = Join-Path (Split-Path -Parent (Resolve-Path -LiteralPath $InputPath)) '_converted'
  }
}
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
Write-Host "Out → $OutputDir"

# 입력 파일 목록
$files = if (Test-Path -LiteralPath $InputPath -PathType Container) {
  Get-ChildItem -LiteralPath $InputPath -Recurse -Include '*.hwp','*.hwpx' -File
} else {
  Get-ChildItem -Path $InputPath -Include '*.hwp','*.hwpx' -File
}

if (-not $files) {
  Write-Warning '변환할 .hwp / .hwpx 파일이 없습니다.'
  exit 0
}

# COM 인스턴스
$Hwp = New-Object -ComObject HWPFrame.HwpObject
try {
  # 자동화 다이얼로그 차단
  $null = $Hwp.RegisterModule('FilePathCheckDLL', 'FilePathCheckerModule')

  foreach ($f in $files) {
    Convert-OneFile -Hwp $Hwp -Path $f.FullName -OutDir $OutputDir -Fmt $Format
  }
} finally {
  try { $Hwp.Quit() } catch {}
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($Hwp) | Out-Null
  [GC]::Collect()
}

Write-Host '완료.'
