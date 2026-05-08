const axios = require('axios');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const P = require('pino');

let sock;

const SHEET_API = process.env.SHEET_API || "https://script.google.com/macros/s/AKfycbzuSeeY8zJSLkYzLZL8bSBoVyzl1d46oRc9bB9sAPOk1dI0hhUGErHfz0C2SjF8SFfo0g/exec";
const LOG_ENDPOINT = process.env.LOG_ENDPOINT || null;
const ADMIN_NUMBER = process.env.ADMIN_NUMBER || null;

global.sessions = {};
const sessions = global.sessions;

// =======================
// UTILIDADES
// =======================

function getFechaMX() {
    return new Date().toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function sendMessage(user, text) {
    await sock.sendMessage(user, { text });
}

async function reportError(err, context = {}) {
    try {

        const payload = {
            ts: new Date().toISOString(),
            message: err?.message || String(err),
            stack: err?.stack || null,
            context
        };

        if (LOG_ENDPOINT) {
            try {
                await axios.post(LOG_ENDPOINT, payload, {
                    timeout: 5000
                });
            } catch (e) {
                console.error('Error enviando log:', e.message);
            }
        }

        if (ADMIN_NUMBER && sock) {

            try {

                await sock.sendMessage(ADMIN_NUMBER, {
                    text:
                        `⚠️ Error en BOT\n\n` +
                        `Mensaje: ${payload.message}\n` +
                        `User: ${context.user || '-'}\n` +
                        `Step: ${context.step || '-'}`
                });

            } catch (e) {
                console.error('Error notificando admin:', e.message);
            }
        }

        console.error(payload);

    } catch (e) {
        console.error('reportError failed:', e);
    }
}

process.on('unhandledRejection', (err) => {
    reportError(err, {
        type: 'unhandledRejection'
    });
});

process.on('uncaughtException', (err) => {
    reportError(err, {
        type: 'uncaughtException'
    }).finally(() => process.exit(1));
});

// =======================
// BOT
// =======================

async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState('./session');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: P({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {

        const { connection, lastDisconnect } = update;

        if (connection === 'close') {

            console.log('❌ Conexión cerrada');

            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
    console.log('🔄 Reconectando...');
    setTimeout(() => {
        startBot();
    }, 5000);
}
        } else if (connection === 'open') {

            console.log('✅ Bot conectado correctamente');

        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {

        try {

            const msg = messages[0];

            if (!msg.message) return;
            if (msg.key.fromMe) return;

            const user = msg.key.remoteJid;
            if (user.endsWith('@g.us')) return;

            if (!user || user === 'status@broadcast') return;

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                '';

            console.log(`📩 ${user}: ${text}`);

            // =======================
            // SESIONES
            // =======================

            if (!sessions[user]) {
                sessions[user] = {
                    step: 0,
                    data: {}
                };
            }

            const s = sessions[user];

            // =======================
            // ENCUESTA
            // =======================

            if (
                s.step === 99 &&
                ["1", "2", "3"].includes(text.trim())
            ) {

                const calificaciones = {
                    "1": "Malo",
                    "2": "Regular",
                    "3": "Excelente"
                };

                try {

                    await axios.post(SHEET_API, {
                        telefono: user,
                        calificacion: calificaciones[text.trim()]
                    });

                    await sendMessage(
                        user,
                        `⭐ Gracias por tu evaluación

Tu opinión nos ayuda a mejorar el servicio de soporte técnico.`
                    );

                    delete sessions[user];

                } catch (e) {
                    console.error(e);
                }

                return;
            }

            // =======================
            // FLUJO PRINCIPAL
            // =======================

            switch (s.step) {

                // =======================
                // BIENVENIDA
                // =======================

                case 0:

                    await sendMessage(
                        user,
                        `*¡Hola!, Bienvenido(a) al Soporte Técnico de SEDESO*

A continuación te haremos una breve encuesta para generar tu ticket.

*Indica tu nombre:*`
                    );

                    s.step = 1;

                    break;

                // =======================
                // NOMBRE
                // =======================

                case 1:

                    s.data.nombre = text;

                    await sendMessage(
                        user,
                        `*${s.data.nombre}*, selecciona la opción deseada escribiendo solo el número:

📋 *Menú Principal:*

1️⃣ Impresoras
2️⃣ Sistema SIC
3️⃣ Servicio de Internet
4️⃣ Telefonía
5️⃣ Correo Institucional
6️⃣ Soporte Técnico

*Envía solo el número (1-6)*`
                    );

                    s.step = 2;

                    break;

                // =======================
                // MENU PRINCIPAL
                // =======================

                case 2:

                    const inputMenu = text.trim().toLowerCase();

                    if (
                        inputMenu === '0' ||
                        inputMenu === 'regresar' ||
                        inputMenu === 'volver' ||
                        inputMenu === 'atras'
                    ) {

                        await sendMessage(
                            user,
                            '🔄 Regresando. Indica tu nombre nuevamente:'
                        );

                        s.step = 1;

                        delete s.data.nombre;

                        return;
                    }

                    const numero = parseInt(inputMenu);

                    if (isNaN(numero) || numero < 1 || numero > 6) {

                        await sendMessage(
                            user,
                            '❌ Opción no válida. Envía un número del 1 al 6.'
                        );

                        return;
                    }

                    s.data.tipo = text;
                    s.data.tipo_numero = numero;

                    const menus = {

                        "1":
                            `*IMPRESORAS*\n\n` +
                            `1️⃣ Cambio de tóner\n` +
                            `2️⃣ Atasco de papel\n` +
                            `3️⃣ Revisión de cables\n` +
                            `4️⃣ Reinicio de contador\n` +
                            `0️⃣ Regresar`,

                        "2":
                            `*SISTEMA SIC*\n\n` +
                            `1️⃣ Alta de usuario\n` +
                            `2️⃣ Creación de carpetas\n` +
                            `3️⃣ Error o fuera de servicio\n` +
                            `0️⃣ Regresar`,

                        "3":
                            `*SERVICIO DE INTERNET*\n\n` +
                            `1️⃣ Permisos de navegación\n` +
                            `2️⃣ Revisión de conexión\n` +
                            `0️⃣ Regresar`,

                        "4":
                            `*TELEFONÍA*\n\n` +
                            `1️⃣ Actualizar nombre del display\n` +
                            `2️⃣ Fuera de servicio\n` +
                            `3️⃣ Revisión de conexión\n` +
                            `0️⃣ Regresar`,

                        "5":
                            `*CORREO INSTITUCIONAL*\n\n` +
                            `1️⃣ Alta de usuario\n` +
                            `2️⃣ Actualización de puesto\n` +
                            `3️⃣ Reinicio de contraseña\n` +
                            `4️⃣ Buzón lleno o sin servicio\n` +
                            `0️⃣ Regresar`,

                        "6":
                            `*SOPORTE TÉCNICO*\n\n` +
                            `1️⃣ Respaldo de información\n` +
                            `2️⃣ Reubicación de equipo\n` +
                            `3️⃣ Instalación de software o hardware\n` +
                            `4️⃣ Programar capacitaciones\n` +
                            `0️⃣ Regresar`
                    };

                    await sendMessage(user, menus[numero]);

                    s.step = 3;

                    break;

                // =======================
                // SUBMENU
                // =======================

                case 3:

                    const inputSubmenu = text.trim().toLowerCase();

                    if (
                        inputSubmenu === '0' ||
                        inputSubmenu === 'regresar' ||
                        inputSubmenu === 'volver' ||
                        inputSubmenu === 'atras'
                    ) {

                        s.step = 2;

                        await sendMessage(
                            user,
                            `📋 *Menú Principal*

1️⃣ Impresoras
2️⃣ Sistema SIC
3️⃣ Servicio de Internet
4️⃣ Telefonía
5️⃣ Correo Institucional
6️⃣ Soporte Técnico`
                        );

                        return;
                    }

                    const subopcion = parseInt(inputSubmenu);

                    let maxOpcion = 4;

                    if (s.data.tipo_numero === 2) maxOpcion = 3;
                    if (s.data.tipo_numero === 3) maxOpcion = 2;
                    if (s.data.tipo_numero === 4) maxOpcion = 3;

                    if (
                        isNaN(subopcion) ||
                        subopcion < 1 ||
                        subopcion > maxOpcion
                    ) {

                        await sendMessage(
                            user,
                            `❌ Opción inválida. Usa del 1 al ${maxOpcion}`
                        );

                        return;
                    }

                    const descripciones = {

                        "1": {
                            "1": "Cambio de tóner",
                            "2": "Atasco de papel",
                            "3": "Revisión de cables de conexión",
                            "4": "Reinicio de contador"
                        },

                        "2": {
                            "1": "Alta de usuario",
                            "2": "Creación de carpetas",
                            "3": "Error o fuera de servicio"
                        },

                        "3": {
                            "1": "Permisos de navegación",
                            "2": "Revisión de conexión"
                        },

                        "4": {
                            "1": "Actualizar nombre del display",
                            "2": "Fuera de servicio",
                            "3": "Revisión de conexión"
                        },

                        "5": {
                            "1": "Alta de usuario",
                            "2": "Actualización de puesto",
                            "3": "Reinicio de contraseña",
                            "4": "Buzón lleno o sin servicio"
                        },

                        "6": {
                            "1": "Respaldo de información",
                            "2": "Reubicación de equipo",
                            "3": "Instalación de software o hardware",
                            "4": "Programar capacitaciones"
                        }
                    };

                   s.data.problema_descripcion =
    descripciones[s.data.tipo_numero.toString()][subopcion.toString()];

                    s.step = 4;

                    await sendMessage(
                        user,
                        `✅ ${s.data.problema_descripcion}

¿Cuál es tu área de trabajo?`
                    );

                    break;

                // =======================
                // GENERAR TICKET
                // =======================

                case 4:

                    s.data.ubicacion = text;
                    s.data.id = "SRV-" + Date.now();
                    s.data.fecha = getFechaMX();

                    try {

                        await axios.post(SHEET_API, {

                            id: s.data.id,
                            nombre: s.data.nombre,
                            tipo: s.data.tipo,
                            tipo_numero: s.data.tipo_numero,
                            problema: s.data.problema_descripcion,
                            ubicacion: s.data.ubicacion,
                            fecha: s.data.fecha,
                            numero: user
                        });

                        await sendMessage(
                            user,
                            `🎫 *Ticket generado correctamente*

📋 ID: ${s.data.id}
👤 Nombre: ${s.data.nombre}
🔧 Tipo: ${s.data.tipo}
📝 Problema: ${s.data.problema_descripcion}
📅 Fecha: ${s.data.fecha}

Gracias por comunicarte con soporte técnico de SEDESO.`
                        );

                    } catch (error) {

                        console.error(error);

                        await sendMessage(
                            user,
                            `⚠️ Ticket generado pero ocurrió un error al guardarlo.`
                        );
                    }

                    delete sessions[user];

                    break;
            }

        } catch (err) {

            console.error(err);

            await reportError(err);
        }
    });
}

startBot();

