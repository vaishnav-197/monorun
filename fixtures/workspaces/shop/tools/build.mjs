// Stand-in for a real build step. Checks that every file in src/ parses, then copies src/ to
// dist/ and writes dist/build-info.json. The same input always gives the same output.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const files = readdirSync('src').filter((file) => file.endsWith('.js')).sort();

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', `src/${file}`], { stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    console.error(`build failed: src/${file} does not parse`);
    process.exit(1);
  }
}

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');
for (const file of files) copyFileSync(`src/${file}`, `dist/${file}`);
writeFileSync('dist/build-info.json', `${JSON.stringify({ name: pkg.name, version: pkg.version, files }, null, 2)}\n`);
console.log(`built ${pkg.name} (${files.length} ${files.length === 1 ? 'file' : 'files'})`);
