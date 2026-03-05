const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());

// 🔥 Inicializar variable global del QR
global.currentQR = null;

// 🔥 Levantar el bot
require('./bot');

// 🔥 Servir archivos estáticos (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Configuración Google Sheets
const SHEET_API = process.env.SHEET_API || 'https://script.google.com/macros/s/AKfycby_P0LSgCl7VRfHtdvP8_JhA-bxN8tiGpeuj6G25gIBEPSaoqzpNXj2mFqUp5aqs3vUzA/exec';


// ✅ Página principal → ahora carga index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// ✅ Ruta para ver el QR
app.get('/qr', (req, res) => {
  if (!global.currentQR) {
    return res.send('QR aún no generado, espera unos segundos y recarga...');
  }

  res.send(`
    <h2>Escanea el QR con WhatsApp</h2>
    <img src="${global.currentQR}" />
  `);
});


// ✅ Proxy Google Sheets
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


// ✅ Logs
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
// ✅ Ruta para enviar notificación WhatsApp
app.post('/notificar', async (req, res) => {
    try {
        const { ticketId, tecnico, nombre, problema } = req.body;

        if (!global.client) {
            return res.status(500).json({ error: 'WhatsApp no está listo aún' });
        }

        const numeros = {
            Brandon: '5214492056415@c.us',
            Iram: '5214491680420@c.us',
            Christopher: '521449@c.us'
        };

        const numero = numeros[tecnico];
        if (!numero) {
            return res.status(400).json({ error: 'Técnico inválido' });
        }

        await global.client.sendMessage(
            numero,
            `📌 Nuevo ticket asignado\n\nTicket: #${ticketId}\nAsignado a: ${tecnico}`
        );

        res.json({ success: true });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error enviando mensaje' });
    }
});

// 🔥 Puerto dinámico obligatorio en Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));