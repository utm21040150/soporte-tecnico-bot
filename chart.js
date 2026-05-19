const PROXY_PORT = 8080;
const SHEET_URL = window.location.protocol.startsWith('http')
    ? `${window.location.protocol}//${window.location.hostname}:${PROXY_PORT}/sheet-proxy`
    : `http://localhost:${PROXY_PORT}/sheet-proxy`;

let chartSemana = null;

function pad2(value) {
    return String(value).padStart(2, '0');
}

function tryParseDate(dateText) {
    const d = new Date(dateText);
    return isNaN(d) ? null : d;
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
        if (value > 1e12) return new Date(value);
        if (value > 1e9) return new Date(value * 1000);
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    }

    const text = String(value).trim();
    if (!text) return null;

    let parsed = tryParseDate(text);
    if (parsed) return parsed;

    const datePart = text.split(' ')[0];
    const slashParts = datePart.split('/');
    if (slashParts.length === 3) {
        const [p1, p2, p3] = slashParts.map(part => part.padStart(2, '0'));
        parsed = tryParseDate(`${p3}-${p2}-${p1}`);
        if (parsed) return parsed;
    }

    const dashParts = datePart.split('-');
    if (dashParts.length === 3) {
        parsed = tryParseDate(datePart);
        if (parsed) return parsed;
        parsed = tryParseDate(`${dashParts[2]}-${dashParts[1]}-${dashParts[0]}`);
        if (parsed) return parsed;
    }

    return null;
}

function formatDateObject(date) {
    if (!(date instanceof Date) || isNaN(date)) return null;
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function generarGraficaSemana(rows, cols) {
    const headerMap = {};
    cols.forEach((c, i) => headerMap[c.toLowerCase()] = i);

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

        const parsedDate = parseSheetDate(fechaTexto);
        if (!parsedDate) return;

        if (parsedDate >= hace7 && parsedDate <= hoy) {
            conteo[parsedDate.getDay()]++;
        }
    });

    const canvas = document.getElementById('graficaSemana');
    if (!canvas) return;

    if (chartSemana) chartSemana.destroy();

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

    updateChartMessage('Gráfica generada correctamente.');
}

async function cargarDatosGrafica() {
    updateChartMessage('Cargando datos...');
    try {
        const res = await fetch(SHEET_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const text = await res.text();
        const json = JSON.parse(text);

        if (!json || !json.table || !Array.isArray(json.table.rows)) {
            updateChartMessage('No se encontraron registros para generar la gráfica.');
            return;
        }

        const rows = json.table.rows;
        const cols = json.table.cols.map(c => c.label);
        generarGraficaSemana(rows, cols);
    } catch (err) {
        console.error('Error al cargar datos para la gráfica:', err);
        updateChartMessage(`Error al cargar datos: ${err.message || err}`);
    }
}

const reloadChartBtn = document.getElementById('reloadChartBtn');
reloadChartBtn?.addEventListener('click', cargarDatosGrafica);
window.addEventListener('load', cargarDatosGrafica);
