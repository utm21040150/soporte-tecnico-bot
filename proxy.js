const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// 🔥 Inicializar variable global del QR
global.currentQR = null;

// 🔥 Levantar el bot
require('./bot');

// Configura estas variables si lo deseas
const SHEET_API = process.env.SHEET_API || 'https://script.google.com/macros/s/AKfycby_P0LSgCl7VRfHtdvP8_JhA-bxN8tiGpeuj6G25gIBEPSaoqzpNXj2mFqUp5aqs3vUzA/exec';


// ✅ Ruta principal (evita Cannot GET /)
app.get('/', (req, res) => {
  res.send('Bot de Soporte Técnico funcionando correctamente 🚀');
});


// ✅ Ruta para ver el QR como imagen
app.get('/qr', (req, res) => {
  if (!global.currentQR) {
    return res.send('QR aún no generado, espera unos segundos y recarga...');
  }

  res.send(`
    <h2>Escanea el QR con WhatsApp</h2>
    <img src="${global.currentQR}" />
  `);
});


// Endpoint de proxy para lectura (GET)
app.get('/sheet-proxy', async (req, res) => {
    try {
        const url = SHEET_API + (req.url.includes('?') ? '&' : '?') +
            req.url.replace('/sheet-proxy', '').replace(/^\?/, '');

        const r = await axios.get(url, { timeout: 10000 });

        res.set('Access-Control-Allow-Origin', '*');
        res.set('Content-Type', r.headers['content-type'] || 'application/json');

        return res.status(r.status).send(r.data);

    } catch (err) {
        res.set('Access-Control-Allow-Origin', '*');
        return res.status(500).json({ error: String(err.message || err) });
    }
});


// Endpoint para recibir logs/errors desde el bot
app.post('/log', async (req, res) => {
    try {
        console.log('[LOG]', req.body);
        res.set('Access-Control-Allow-Origin', '*');
        return res.json({ ok: true });

    } catch (err) {
        res.set('Access-Control-Allow-Origin', '*');
        return res.status(500).json({ error: String(err.message || err) });
    }
});


// 🔥 Puerto dinámico obligatorio en Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
