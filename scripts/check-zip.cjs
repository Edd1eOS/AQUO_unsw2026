/**
 * 发布前检查：确保 .output/*.zip 内不包含 .git 或 .env 等敏感路径。
 * 用法: node scripts/check-zip.cjs [zip路径]
 * 未传路径时默认检查 .output/aquo-*-chrome.zip
 */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const require2 = createRequire(__filename);
const AdmZip = require2('adm-zip');

const outputDir = path.join(process.cwd(), '.output');

function isForbidden(entryName) {
  const name = (entryName || '').replace(/\\/g, '/');
  const parts = name.split('/').map(p => p.toLowerCase());
  return parts.some(p => p === '.git' || p.startsWith('.env'));
}

function checkZip(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const violations = entries
    .map(e => (e.entryName || '').replace(/\\/g, '/'))
    .filter(isForbidden);

  const unique = [...new Set(violations)];
  if (unique.length) {
    console.error(`[check-zip] 发现敏感路径: ${zipPath}`);
    unique.forEach(p => console.error('  -', p));
    return false;
  }
  return true;
}

function main() {
  let zipPaths = process.argv.slice(2).filter(Boolean);
  if (zipPaths.length === 0) {
    if (!fs.existsSync(outputDir)) {
      console.warn('[check-zip] .output 不存在，跳过');
      process.exit(0);
    }
    const files = fs.readdirSync(outputDir);
    zipPaths = files
      .filter(f => f.endsWith('.zip') && f.includes('chrome'))
      .map(f => path.join(outputDir, f));
  }

  if (zipPaths.length === 0) {
    console.warn('[check-zip] 未找到 chrome zip 文件，跳过');
    process.exit(0);
  }

  let ok = true;
  for (const zipPath of zipPaths) {
    if (!fs.existsSync(zipPath)) {
      console.error('[check-zip] 文件不存在:', zipPath);
      ok = false;
      continue;
    }
    if (!checkZip(zipPath)) ok = false;
  }

  if (ok) console.log('[check-zip] 通过：未发现 .git / .env');
  process.exit(ok ? 0 : 1);
}

main();
