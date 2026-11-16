const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

// If executed directly with Node, re-launch through Electron binary
if (!process.versions.electron) {
  const electronPath = require('electron');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const res = spawnSync(electronPath, [__filename, ...process.argv.slice(2)], {
    env,
    stdio: 'inherit'
  });
  process.exit(res.status ?? 0);
}

const { app, nativeImage } = require('electron');

app.whenReady().then(() => {
  const rootDir = path.resolve(__dirname, '..');
  const srcDir = path.join(rootDir, 'ads_asset');
  const targetDir = path.join(rootDir, 'src/renderer/assets/ads');

  fs.mkdirSync(targetDir, { recursive: true });

  const files = [
    {
      source: path.join(srcDir, 'Happy_Pheobe.png'),
      baseName: 'Happy_Pheobe'
    },
    {
      source: path.join(srcDir, 'Pheobe_Sob.png'),
      baseName: 'Pheobe_Sob'
    }
  ];

  console.log('\n========================================================================================');
  console.log('                            ADS ASSET OPTIMIZATION REPORT                               ');
  console.log('========================================================================================');
  console.log(
    'Asset Name'.padEnd(20) + ' | ' +
    'Variant'.padEnd(14) + ' | ' +
    'Dimensions'.padEnd(14) + ' | ' +
    'File Size'.padEnd(14) + ' | ' +
    'Target (<40KB)'
  );
  console.log('---------------------+----------------+----------------+----------------+---------------');

  for (const item of files) {
    if (!fs.existsSync(item.source)) {
      console.error(`Source not found: ${item.source}`);
      continue;
    }

    const origStat = fs.statSync(item.source);
    console.log(
      item.baseName.padEnd(20) + ' | ' +
      'Original'.padEnd(14) + ' | ' +
      'Original'.padEnd(14) + ' | ' +
      `${(origStat.size / 1024).toFixed(1)} KB`.padEnd(14) + ' | ' +
      (origStat.size < 40 * 1024 ? 'PASS' : 'EXCEEDS')
    );

    const img = nativeImage.createFromPath(item.source);

    // 1x display version: 80x80 (display size ~72-96px)
    const img1x = img.resize({ width: 80, height: 80, quality: 'best' });
    const buf1x = img1x.toPNG();
    const dest1x = path.join(targetDir, `${item.baseName}_80.png`);
    fs.writeFileSync(dest1x, buf1x);
    console.log(
      item.baseName.padEnd(20) + ' | ' +
      '1x Display'.padEnd(14) + ' | ' +
      '80x80'.padEnd(14) + ' | ' +
      `${(buf1x.length / 1024).toFixed(1)} KB`.padEnd(14) + ' | ' +
      (buf1x.length < 40 * 1024 ? 'PASS' : 'FAIL')
    );

    // 2x retina version: 160x160
    const img2x = img.resize({ width: 160, height: 160, quality: 'best' });
    const buf2x = img2x.toPNG();
    const dest2x = path.join(targetDir, `${item.baseName}_160.png`);
    fs.writeFileSync(dest2x, buf2x);
    console.log(
      item.baseName.padEnd(20) + ' | ' +
      '2x Retina'.padEnd(14) + ' | ' +
      '160x160'.padEnd(14) + ' | ' +
      `${(buf2x.length / 1024).toFixed(1)} KB`.padEnd(14) + ' | ' +
      (buf2x.length < 40 * 1024 ? 'PASS' : 'FAIL')
    );
  }

  // Remove full-size copies from src/renderer/assets if present
  const unoptimizedHappy = path.join(rootDir, 'src/renderer/assets/Happy_Pheobe.png');
  const unoptimizedSob = path.join(rootDir, 'src/renderer/assets/Pheobe_Sob.png');
  if (fs.existsSync(unoptimizedHappy)) {
    fs.unlinkSync(unoptimizedHappy);
    console.log('\nRemoved unoptimized full-size file: src/renderer/assets/Happy_Pheobe.png');
  }
  if (fs.existsSync(unoptimizedSob)) {
    fs.unlinkSync(unoptimizedSob);
    console.log('Removed unoptimized full-size file: src/renderer/assets/Pheobe_Sob.png');
  }

  console.log('========================================================================================\n');
  app.quit();
});
