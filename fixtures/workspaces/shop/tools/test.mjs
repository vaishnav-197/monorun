// Stand-in for a real test run. Fails when the project has not been built.
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (!existsSync('dist/build-info.json')) {
  console.error(`${pkg.name}: dist/build-info.json is missing; build the project first`);
  process.exit(1);
}
const info = JSON.parse(readFileSync('dist/build-info.json', 'utf8'));
console.log(`${pkg.name}: ${info.files.length} built ${info.files.length === 1 ? 'file' : 'files'} ok`);
