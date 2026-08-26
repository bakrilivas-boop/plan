import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const outputRoot = resolve(projectRoot, 'dist');
const webFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.json',
  'sw.js',
  'favicon.svg',
  '.nojekyll'
];

await mkdir(outputRoot, { recursive: true });
await Promise.all(webFiles.map((file) => copyFile(resolve(projectRoot, file), resolve(outputRoot, file))));

console.log(`CampusFlow web assets copied to ${outputRoot}`);
