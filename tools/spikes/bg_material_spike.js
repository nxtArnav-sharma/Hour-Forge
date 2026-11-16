const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  console.log('Spike starting...');
  console.log('OS version:', process.getSystemVersion());

  // Test 1: mica
  console.log('Step 1: mica');
  try {
    const w1 = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      backgroundMaterial: 'mica',
      show: false
    });
    console.log('Step 1 success');
    w1.destroy();
  } catch (e) {
    console.log('Step 1 failed:', e.message);
  }

  // Test 2: acrylic
  console.log('Step 2: acrylic');
  try {
    const w2 = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      backgroundMaterial: 'acrylic',
      show: false
    });
    console.log('Step 2 success');
    w2.destroy();
  } catch (e) {
    console.log('Step 2 failed:', e.message);
  }

  // Test 3: tabbed
  console.log('Step 3: tabbed');
  try {
    const w3 = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      backgroundMaterial: 'tabbed',
      show: false
    });
    console.log('Step 3 success');
    w3.destroy();
  } catch (e) {
    console.log('Step 3 failed:', e.message);
  }

  // Test 4: transparent: true + backgroundMaterial: 'acrylic'
  console.log('Step 4: transparent + acrylic');
  try {
    const w4 = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      transparent: true,
      backgroundMaterial: 'acrylic',
      show: false
    });
    console.log('Step 4 success');
    w4.destroy();
  } catch (e) {
    console.log('Step 4 failed:', e.message);
  }

  // Test 5: capturePage with acrylic
  console.log('Step 5: capturePage with acrylic');
  try {
    const w5 = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000',
      show: false
    });
    await w5.loadURL('data:text/html,<html><body style="background:transparent;color:white;">Acrylic Test</body></html>');
    const img = await w5.webContents.capturePage();
    console.log('Step 5 captured bytes:', img.toPNG().length);
    w5.destroy();
  } catch (e) {
    console.log('Step 5 failed:', e.message);
  }

  console.log('ALL SPIKE TESTS FINISHED');
  app.quit();
});
