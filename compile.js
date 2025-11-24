const express = require('express');
const multer = require('multer');
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const app = express();
const upload = multer({ dest: 'uploads/' });

app.post('/compile', upload.array('images'), async (req, res) => {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://hiukim.github.io/mind-ar-js-doc/tools/compile');
    // Sube imágenes (adapta de tu código anterior)
    const fileChooser = await page.waitForEvent('filechooser');
    await page.click('.dropzone');
    await fileChooser.setFiles(req.files.map(f => f.path));
    // Espera compilación (usa tu waitForFunction)
    await page.waitForFunction(() => document.querySelector('button.startButton_OY2G').textContent === 'Download compiled');
    await page.click('button.startButton_OY2G');
    const download = await page.waitForEvent('download');
    const mindPath = path.join(__dirname, 'targets.mind');
    await download.saveAs(mindPath);
    await browser.close();
    res.download(mindPath, 'targets.mind', () => fs.unlinkSync(mindPath));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;  // Para Vercel: api/compile.js