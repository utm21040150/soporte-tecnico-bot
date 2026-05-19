const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());

// BOT
global.currentQR = null;
require('./bot');

// STATIC
app.use(express.static(path.join(__dirname)));

// GOOGLE SHEETS
const SHEET_API = 'https://script.google.com/macros/s/AKfycbzuSeeY8zJSLkYzLZL8bSBoVyzl1d46oRc9bB9sAPOk1dI0hhUGErHfz0C2SjF8SFfo0g/exec';

// HOME
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// QR
app.get('/qr', (req, res) => {
    if (!global.currentQR) return res.send('Generando QR...');
    res.send(`<img src="${global.currentQR}" />`);
});

// PROXY SHEETS
app.get('/sheet-proxy', async (req, res) => {
    try {
        const r = await axios.get(SHEET_API);
        res.set('Access-Control-Allow-Origin', '*');
        res.json(r.data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// NOTIFICAR
app.post('/notificar', async (req, res) => {

    const { ticketId, tecnico, nombre, tipo, problema, ubicacion } = req.body;

    const numeros = {
        Brandon: '5214492056415@s.whatsapp.net',
        Iram: '5214491680420@s.whatsapp.net',
        Christopher: '5214493125385@s.whatsapp.net',
        Poblano: '5214494612475@s.whatsapp.net',
        NuevoTecnico: '5210000000000@s.whatsapp.net'
    };

    try {

        const numeroTecnico = numeros[tecnico];

        if (!numeroTecnico) {
            return res.json({
                success: false,
                error: 'Técnico no encontrado'
            });
        }

        const mensaje =
`🆕 NUEVO TICKET

🎫 Ticket: ${ticketId}
👤 Usuario: ${nombre}
🛠 Tipo: ${tipo}
📄 Problema: ${problema}
📍 Ubicación: ${ubicacion}
👨‍🔧 Técnico: ${tecnico}`;

        await global.client.sendMessage(
            numeroTecnico,
            { text: mensaje }
        );

        console.log('✅ Ticket enviado a técnico');

        res.json({ success: true });

    } catch (error) {

        console.log(error);

        res.json({
            success: false,
            error: error.message
        });
    }
});

// ENCUESTA
app.post('/encuesta', async (req, res) => {

    const { telefono, ticketId } = req.body;

    try {

        await global.client.sendMessage(telefono,
            `📋 Ticket #${ticketId}\nCalifica:\n1 Malo\n2 Regular\n3 Excelente`
        );

        res.json({ success: true });

    } catch {
        res.json({ success: false });
    }
});

// PORT
const rawPort = process.argv[2] || process.env.PORT;
const PORT = parseInt(rawPort, 10) || 8080;

app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
    if (process.argv[2]) {
        console.log(`Puerto recibido por argumento CLI: ${process.argv[2]}`);
    }
});