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

// ================= FORMATEAR FECHA (FIX 🔥) =================
function formatearFecha(fechaRaw) {
    if (!fechaRaw) return '';

    const fecha = new Date(fechaRaw);

    if (isNaN(fecha)) return fechaRaw;

    return fecha.toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
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

        const telefono = find(r, ['telefono']);
        const id = find(r, ['id']);
        const nombre = find(r, ['nombre']);
        const tipo = find(r, ['tipo']);
        const problema = find(r, ['problema']);
        const ubicacion = find(r, ['ubicacion']);
        const estado = find(r, ['estado']);
        const prioridad = find(r, ['prioridad']);
        const fecha = formatearFecha(find(r, ['fecha']));

        const tr = document.createElement('tr');

        // 🔥 DATASET (FIX IMPORTANTE)
        tr.dataset.telefono = telefono;
        tr.dataset.id = id;
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
    cols.forEach((c, i) => headerMap[c.toLowerCase()] = i);

    const get = (row, name) => {
        const idx = headerMap[name];
        return idx !== undefined ? row.c[idx]?.v : '';
    };

    const conteo = [0, 0, 0, 0, 0, 0, 0];
    const hoy = new Date();
    const hace7 = new Date();
    hace7.setDate(hoy.getDate() - 7);

    rows.forEach(r => {
        const f = new Date(get(r, 'fecha'));
        if (isNaN(f)) return;

        if (f >= hace7 && f <= hoy) {
            conteo[f.getDay()]++;
        }
    });

    const chartSection = document.getElementById('chartSection');
    if (chartSection) chartSection.style.display = 'block';

    const canvas = document.getElementById('graficaSemana');
    if (!canvas) return;

    if (chartSemana) {
        chartSemana.destroy();
    }

    chartSemana = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
            datasets: [{
                label: 'Tickets últimos 7 días',
                data: conteo,
                backgroundColor: 'rgba(33, 150, 243, 0.7)',
                borderColor: 'rgba(33, 150, 243, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
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

const botonCargar = document.getElementById('loadDataBtn');
const botonMostrarGrafica = document.getElementById('showChartBtn');

botonCargar?.addEventListener('click', cargarDatos);
botonMostrarGrafica?.addEventListener('click', () => {
    window.location.href = 'chart.html';
});
