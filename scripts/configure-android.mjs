import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const androidRoot = resolve(projectRoot, 'android');
const manifestPath = resolve(androidRoot, 'app/src/main/AndroidManifest.xml');
const gradlePath = resolve(androidRoot, 'app/build.gradle');
const drawableRoot = resolve(androidRoot, 'app/src/main/res/drawable');
const rawRoot = resolve(androidRoot, 'app/src/main/res/raw');
const notificationIconPath = resolve(drawableRoot, 'ic_stat_campusflow.xml');
const notificationSoundPath = resolve(rawRoot, 'campusflow_reminder.wav');

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
  .replace(/versionCode\s+\d+/, 'versionCode 15')
  .replace(/versionName\s+"[^"]+"/, 'versionName "1.5.0"');
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

// Android 8+ notification channels require a real res/raw sound file. A
// short, softly faded PCM tone keeps the APK self-contained and avoids a
// silent channel when the device has no matching custom sound resource.
const sampleRate = 22050;
const durationSeconds = 0.34;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const dataSize = sampleCount * 2;
const wav = Buffer.alloc(44 + dataSize);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataSize, 40);
for (let index = 0; index < sampleCount; index += 1) {
  const progress = index / sampleCount;
  const envelope = Math.sin(Math.PI * progress) ** 2;
  const frequency = progress < 0.52 ? 784 : 988;
  const sample = Math.round(Math.sin(2 * Math.PI * frequency * index / sampleRate) * envelope * 9000);
  wav.writeInt16LE(sample, 44 + index * 2);
}
await mkdir(rawRoot, { recursive: true });
await writeFile(notificationSoundPath, wav);

console.log('CampusFlow Android permissions, version, notification icon and reminder sound configured.');
