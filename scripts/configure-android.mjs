import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const androidRoot = resolve(projectRoot, 'android');
const manifestPath = resolve(androidRoot, 'app/src/main/AndroidManifest.xml');
const gradlePath = resolve(androidRoot, 'app/build.gradle');
const drawableRoot = resolve(androidRoot, 'app/src/main/res/drawable');
const notificationIconPath = resolve(drawableRoot, 'ic_stat_campusflow.xml');

let manifest = await readFile(manifestPath, 'utf8');
const permissions = [
  'android.permission.POST_NOTIFICATIONS'
];

for (const permission of permissions) {
  if (!manifest.includes(permission)) {
    manifest = manifest.replace(
      /(<manifest\b[^>]*>)/,
      `$1\n\n    <uses-permission android:name="${permission}" />`
    );
  }
}
await writeFile(manifestPath, manifest, 'utf8');

let gradle = await readFile(gradlePath, 'utf8');
gradle = gradle
  .replace(/versionCode\s+\d+/, 'versionCode 13')
  .replace(/versionName\s+"[^"]+"/, 'versionName "1.3.0"');
await writeFile(gradlePath, gradle, 'utf8');

await mkdir(drawableRoot, { recursive: true });
await writeFile(notificationIconPath, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M9,16.17L4.83,12l-1.42,1.41L9,19 21,7l-1.41,-1.41z" />
</vector>
`, 'utf8');

console.log('CampusFlow Android permissions, version and notification icon configured.');
