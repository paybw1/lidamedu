/**
 * HWP (Hangul 바이너리) → 평문.
 *
 * 본 repo `scripts/hwp-to-text.ps1` 의 PowerShell + 한컴 COM 자동화(HWPFrame.HwpObject)
 * 패턴을 차용. **Hancom Office 2020 이상 설치가 필요**한 사용자 PC 에서만 동작한다.
 *
 * 결과 캐시: `<filepath>.txt` (동일 디렉토리). 재실행 시 캐시 hit.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

export interface HwpParagraph {
  text: string;
  page: number | null;
}

/**
 * PowerShell + 한컴 COM 자동화로 .hwp → .txt 변환.
 * 캐시 파일이 .hwp 보다 새것이면 변환 skip.
 */
export function extractHwp(filepath: string): HwpParagraph[] {
  const txtPath = filepath.replace(/\.hwp$/i, '.txt');
  const needsConvert =
    !existsSync(txtPath) ||
    statSync(txtPath).mtimeMs < statSync(filepath).mtimeMs;

  if (needsConvert) {
    process.stdout.write(`  [hwp] converting via Hancom COM: ${filepath}\n`);
    // PowerShell — 한컴 COM 호출. SaveAs 의 'TEXT' 는 ANSI(CP949) 로 저장되므로
    // 직후에 CP949 → UTF-8(no BOM) 재인코딩까지 한 스크립트에서 수행.
    const psScript =
      `$ErrorActionPreference='Stop';` +
      `$Hwp = New-Object -ComObject HWPFrame.HwpObject;` +
      `$null = $Hwp.RegisterModule('FilePathCheckDLL','FilePathCheckerModule');` +
      `if (-not $Hwp.Open('${filepath.replace(/'/g, "''")}','','')) { throw '열기 실패' };` +
      `if (-not $Hwp.SaveAs('${txtPath.replace(/'/g, "''")}','TEXT','')) { throw '저장 실패' };` +
      `$Hwp.Quit() | Out-Null;` +
      `$txt = [System.IO.File]::ReadAllText('${txtPath.replace(/'/g, "''")}', [System.Text.Encoding]::GetEncoding(949));` +
      `[System.IO.File]::WriteAllText('${txtPath.replace(/'/g, "''")}', $txt, (New-Object System.Text.UTF8Encoding $false))`;
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
        stdio: ['ignore', 'inherit', 'inherit'],
      });
    } catch (e) {
      throw new Error(
        `HWP 변환 실패 (Hancom Office 미설치 가능성): ${filepath}\n` +
          `우회: 사용자가 직접 .hwp → .hwpx 또는 .txt 로 변환 후 같은 폴더에 두세요.\n` +
          `원인: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // 한컴이 만든 TXT 는 UTF-16 LE BOM 또는 CP949. 둘 다 처리.
  const buf = readFileSync(txtPath);
  let text = '';
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.toString('utf16le').replace(/^﻿/, '');
  } else if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    text = buf.toString('utf8').replace(/^﻿/, '');
  } else {
    // BOM 없음 — UTF-8 시도, 깨지면 CP949 fallback 필요하나 본 단계에선 단순 UTF-8.
    text = buf.toString('utf8');
  }
  // 한 줄 = 한 paragraph.
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ text: line, page: null }));
}
