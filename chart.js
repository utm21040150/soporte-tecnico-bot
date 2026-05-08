const PROXY_PORT = 8080;
const SHEET_URL = window.location.protocol.startsWith('http')
    ? `${window.location.protocol}//${window.location.hostname}:${PROXY_PORT}/sheet-proxy`
    : `http://localhost:${PROXY_PORT}/sheet-proxy`;

let chartSemana = null;

function updateChartMessage(text) {
    const msg = document.getElementById('chartMessage');
    if (msg) msg.textContent = text;
}

function generarGraficaSemana(rows, cols) {
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
