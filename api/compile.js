import express from 'express';
import multer from 'multer';
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const app = express();

// IMPORTANTE: Multer DEBE usar /tmp/ como destino en Vercel
const upload = multer({ dest: '/tmp/' });

const MINDAR_COMPILER_URL = 'https://hiukim.github.io/mind-ar-js-doc/tools/compile';

app.post('/compile', upload.array('images'), async (req, res) => {
    let browser = null;
    let mindPath = '';
    const uploadedFilePaths = req.files ? req.files.map(f => f.path) : [];

    try {
        // --- 1. Inicialización de Playwright (CON ARGS ESPECÍFICOS PARA VERCELL) ---
        console.log('Iniciando Chromium en Vercel...');
        browser = await chromium.launch({
            headless: true,
            // Argumentos cruciales para entornos sin cabecera (serverless)
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Clave para evitar errores de memoria en contenedores
                '--disable-gpu',
                '--single-process'
            ]
        });

        const page = await browser.newPage();

        // --- 2. Navegación y Subida de Archivos ---
        console.log(`Navegando a ${MINDAR_COMPILER_URL}`);
        await page.goto(MINDAR_COMPILER_URL, { waitUntil: 'domcontentloaded' });

        // Esperar a que el dropzone sea visible y obtener el diálogo de subida
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 30000 }),
            page.click('.dropzone')
        ]);

        if (uploadedFilePaths.length === 0) {
            throw new Error('No se encontraron archivos subidos.');
        }

        console.log(`Subiendo ${uploadedFilePaths.length} archivo(s)...`);
        await fileChooser.setFiles(uploadedFilePaths);
        
        // --- 3. Esperar la Compilación y Descargar ---
        
        // Espera hasta que el texto del botón cambie a "Download compiled"
        console.log('Esperando el fin de la compilación (puede tardar hasta 120s)...');
        await page.waitForFunction(
            () => document.querySelector('button.startButton_OY2G') && 
                  document.querySelector('button.startButton_OY2G').textContent === 'Download compiled',
            { timeout: 100000 } // Le damos 100 segundos
        );

        // Hacer clic en el botón de descarga
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            page.click('button.startButton_OY2G')
        ]);

        // IMPORTANTE: Guardar el archivo descargado en /tmp/
        mindPath = path.join('/tmp', 'targets.mind');
        await download.saveAs(mindPath);
        
        // --- 4. Devolver el archivo al cliente ---
        console.log('Compilación exitosa. Enviando archivo al cliente.');
        
        // Usar res.download y limpiamos el archivo después de que se envíe
        res.download(mindPath, 'targets.mind', (err) => {
            if (err) console.error('Error enviando archivo:', err.message);
            // Aseguramos que el archivo descargado sea eliminado
            fs.unlink(mindPath, () => {}); 
        });

    } catch (error) {
        console.error('Fallo en la API de compilación:', error);
        // Si hay un error antes de enviar la respuesta, enviamos el estado 500
        if (!res.headersSent) {
             res.status(500).json({ 
                error: 'Fallo en el servidor al compilar el target.', 
                details: error.message 
             });
        }

    } finally {
        // --- 5. Limpieza (CRÍTICO) ---
        if (browser) {
            await browser.close();
        }
        // Eliminar todos los archivos temporales subidos por Multer
        uploadedFilePaths.forEach(filePath => {
            fs.unlink(filePath, () => {});
        });
    }
});

// Vercel espera un módulo exportado con el servidor Express
export default app;
