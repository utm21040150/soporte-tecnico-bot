const PROXY_PORT = 8080;
const SHEET_URL = window.location.protocol.startsWith('http')
    ? `${window.location.protocol}//${window.location.hostname}:${PROXY_PORT}/sheet-proxy`
    : `http://localhost:${PROXY_PORT}/sheet-proxy`;

console.log('Página actual:', window.location.href);
console.log('Sheet URL usada:', SHEET_URL);

const tabla = document.getElementById("tablaServicios");

let datosGlobales = { rows: [], cols: [] };
let chartSemana = null;

// ================= NORMALIZAR =================
function normalizeLabel(s) {
    return (s || "").toString().trim().toLowerCase();
}

// ================= SELECTS =================
function buildSelect(options, selected, className) {
    return `<select class="${className}">
        ${options.map(o =>
        `<option value="${o}" ${o === selected ? 'selected' : ''}>${o}</option>`
    ).join('')}
    </select>`;
}

// ================= FECHAS =================
function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatDateObject(date) {
    if (!(date instanceof Date) || isNaN(date)) return null;
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function parseSheetDate(raw) {
    if (raw == null || raw === '') return null;

    let value = raw;
    if (typeof value === 'object') {
        if (value.f) value = value.f;
        else if (value.v !== undefined) value = value.v;
        else value = String(value);
    }

    if (typeof value === 'number') {
        if (value > 1e12) {
            return new Date(value);
        }
        if (value > 1e9) {
            return new Date(value * 1000);
        }
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    }

    const text = String(value).trim();
    if (!text) return null;

    const tryDate = dateText => {
        const d = new Date(dateText);
        return isNaN(d) ? null : d;
    };

    let parsed = tryDate(text);
    if (parsed) return parsed;

    const datePart = text.split(' ')[0].trim();
    const slashParts = datePart.split('/');
    if (slashParts.length === 3) {
        const [p1, p2, p3] = slashParts.map(part => part.padStart(2, '0'));
        parsed = tryDate(`${p3}-${p2}-${p1}`);
        if (parsed) return parsed;
    }

    const dashParts = datePart.split('-');
    if (dashParts.length === 3) {
        const [a, b, c] = dashParts;
        parsed = tryDate(`${a}-${b}-${c}`);
        if (parsed) return parsed;
        parsed = tryDate(`${c}-${b}-${a}`);
        if (parsed) return parsed;
    }

    return null;
}

function formatearFecha(fechaRaw) {
    const date = parseSheetDate(fechaRaw);
    return date ? formatDateObject(date) : (fechaRaw || '');
}

// ================= CLASES =================
function estadoClassFromValue(v) {
    const n = normalizeLabel(v);
    if (n.includes('abierto')) return 'abierto';
    if (n.includes('proceso')) return 'proceso';
    if (n.includes('cerrado')) return 'cerrado';
    return '';
}

function prioridadClassFromValue(v) {
    const n = normalizeLabel(v);
    if (n.includes('alta')) return 'prioridad-alta';
    if (n.includes('media')) return 'prioridad-media';
    return 'prioridad-baja';
}

// ================= CONTADORES =================
function updateCounters() {
    const rows = Array.from(tabla.querySelectorAll('tr'));

    let total = 0;
    let abiertos = 0, proceso = 0, cerrados = 0;

    rows.forEach(r => {
        const estadoSelect = r.querySelector('.estado-select');
        if (!estadoSelect) return;

        total++;
        const n = normalizeLabel(estadoSelect.value);

        if (n.includes('abierto')) abiertos++;
        else if (n.includes('proceso')) proceso++;
        else if (n.includes('cerrado')) cerrados++;
    });

    document.getElementById('total').textContent = total;
    document.getElementById('abiertos').textContent = abiertos;
    document.getElementById('proceso').textContent = proceso;
    document.getElementById('cerrados').textContent = cerrados;
}

// ================= EVENTOS =================
function attachRowListeners(row) {

    const estadoSel = row.querySelector('.estado-select');
    const prioridadSel = row.querySelector('.prioridad-select');
    const tecnicoSel = row.querySelector('.tecnico-select');

    // ===== ESTADO =====
    estadoSel?.addEventListener('change', async () => {

        const v = estadoSel.value;
        const idTicket = row.dataset.id;
        const telefono = row.dataset.telefono;

        estadoSel.className = "estado-select " + estadoClassFromValue(v);
        updateCounters();

        if (v === 'Cerrado' && telefono) {
            await fetch('/encuesta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telefono, ticketId: idTicket })
            });
        }
    });

    // ===== PRIORIDAD =====
    prioridadSel?.addEventListener('change', () => {
        const td = prioridadSel.closest('td');
        const cls = prioridadClassFromValue(prioridadSel.value);

        td.className = "prioridad-cell " + cls;
        prioridadSel.className = "prioridad-select " + cls;
    });

    // ===== TECNICO =====
    tecnicoSel?.addEventListener('change', async () => {

        const tecnico = tecnicoSel.value;
        if (!tecnico) return;

        const { id, nombre, tipo, problema, ubicacion } = row.dataset;

        if (!confirm(`Asignar ticket #${id} a ${tecnico}?`)) {
            tecnicoSel.value = "";
            return;
        }

        const res = await fetch('/notificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticketId: id, tecnico, nombre, tipo, problema, ubicacion })
        });

        const data = await res.json();

        alert(data.success ? "✅ Notificado" : "❌ Error");
    });
}

// ================= RENDER =================
function renderFromRows(jsonRows, cols) {

    tabla.innerHTML = '';

    const headerMap = {};
    cols.forEach((c, i) => headerMap[normalizeLabel(c)] = i);

    const find = (row, names) => {
        for (const nm of names) {
            const idx = headerMap[normalizeLabel(nm)];
            if (idx !== undefined) return row.c[idx]?.v || '';
        }
        return '';
    };

    jsonRows.forEach(r => {

        const tr = document.createElement('tr');

        const telefono = find(r, ['telefono', 'numero']);
        const id = find(r, ['id']);
        const nombre = find(r, ['nombre']);
        const tipo = find(r, ['tipo']);
        const problema = find(r, ['problema']);
        const ubicacion = find(r, ['ubicacion']);
        const estado = find(r, ['estado']);
        const prioridad = find(r, ['prioridad']);
        const fecha = formatearFecha(find(r, ['fecha']) || '');

        tr.dataset.id = id;
        tr.dataset.telefono = telefono;
        tr.dataset.nombre = nombre;
        tr.dataset.tipo = tipo;
        tr.dataset.problema = problema;
        tr.dataset.ubicacion = ubicacion;

        tr.innerHTML = `
        <td>${id}</td>
        <td>${nombre}</td>
        <td>${tipo}</td>
        <td>${problema}</td>
        <td>${ubicacion}</td>
        <td class="estado-cell">${buildSelect(['Abierto', 'En Proceso', 'Cerrado'], estado, 'estado-select')}</td>
        <td class="prioridad-cell">${buildSelect(['Alta', 'Media', 'Baja'], prioridad, 'prioridad-select')}</td>
        <td>${fecha}</td>
        <td>
            <select class="tecnico-select">
                <option value="">Asignar</option>
                <option>Brandon</option>
                <option>Iram</option>
                <option>Christopher</option>
                <option>Poblano</option>
                <option>NuevoTecnico</option>
            </select>
        </td>
    `;

        tabla.appendChild(tr);
        attachRowListeners(tr);
    });

    updateCounters();
}

// ================= GRAFICA =================
function generarGraficaSemana() {

    const { rows, cols } = datosGlobales;

    const headerMap = {};

    cols.forEach((c, i) => {
        headerMap[c.toLowerCase()] = i;
    });

    const get = (row, name) => {
        const idx = headerMap[name.toLowerCase()];
        return idx !== undefined ? row.c[idx]?.v : '';
    };

    const conteo = [0, 0, 0, 0, 0, 0, 0];

    const hoy = new Date();

    const hace7 = new Date();
    hace7.setDate(hoy.getDate() - 7);

    rows.forEach(r => {

        const fechaTexto = get(r, 'fecha');

        if (!fechaTexto) return;

        // FORMATO MX
        const partes = fechaTexto.split(',');

        if (partes.length < 1) return;

        const fechaPart = partes[0].trim();

        const [dia, mes, anio] = fechaPart.split('/');

        if (!dia || !mes || !anio) return;

        const fecha = new Date(
            `${anio}-${mes}-${dia}`
        );

        if (isNaN(fecha)) return;

        if (fecha >= hace7 && fecha <= hoy) {

            conteo[fecha.getDay()]++;
        }
    });

    const chartSection = document.getElementById('chartSection');

    if (chartSection) {
        chartSection.style.display = 'block';
    }

    const canvas = document.getElementById('graficaSemana');

    if (!canvas) {
        console.error('No existe canvas graficaSemana');
        return;
    }

    if (chartSemana) {
        chartSemana.destroy();
    }

    chartSemana = new Chart(canvas, {

        type: 'bar',

        data: {

            labels: [
                "Dom",
                "Lun",
                "Mar",
                "Mié",
                "Jue",
                "Vie",
                "Sáb"
            ],

            datasets: [{
                label: 'Tickets últimos 7 días',
                data: conteo,
                borderWidth: 1
            }]
        },

        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

// ================= FETCH =================
async function cargarDatos() {
    tabla.innerHTML = '<tr><td colspan="9">Cargando datos...</td></tr>';
    try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();

        const json = JSON.parse(text);
        if (!json || !json.table || !Array.isArray(json.table.rows)) {
            tabla.innerHTML = '<tr><td colspan="9">No se encontraron registros.</td></tr>';
            updateCounters();
            return;
        }

        datosGlobales.rows = json.table.rows;
        datosGlobales.cols = json.table.cols.map(c => c.label);
        renderFromRows(datosGlobales.rows, datosGlobales.cols);
    } catch (err) {
        console.error('Error al cargar datos:', err);
        tabla.innerHTML = `
            <tr>
                <td colspan="9">
                    Error al cargar datos: ${err.message || err}<br>
                    URL de petición: ${SHEET_URL}<br>
                    Origen de la página: ${window.location.origin}<br>
                    Asegúrate de iniciar y abrir el servidor Node en el mismo puerto que muestra el terminal.
                </td>
            </tr>`;
        updateCounters();
    }
}

window.addEventListener('DOMContentLoaded', () => {

    console.log('✅ DOM cargado');

    const botonCargar = document.getElementById('loadDataBtn');
    const botonMostrarGrafica = document.getElementById('showChartBtn');

    console.log('Botón cargar:', botonCargar);
    console.log('Botón gráfica:', botonMostrarGrafica);

    if (botonCargar) {

        botonCargar.addEventListener('click', () => {

            console.log('📥 Click cargar datos');

            cargarDatos();
        });
    }

    if (botonMostrarGrafica) {

        botonMostrarGrafica.addEventListener('click', () => {

            console.log('📊 Click gráfica');

            window.location.href = 'chart.html';
        });
    }

});
