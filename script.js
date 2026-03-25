const SHEET_URL = "/sheet-proxy";

const tabla = document.getElementById("tablaServicios");

function normalizeLabel(s) {
    return (s || "").toString().trim().toLowerCase();
}

function buildSelect(options, selected, className) {
    return `<select class="${className}">
        ${options.map(o =>
        `<option value="${o}" ${o === selected ? 'selected' : ''}>${o}</option>`
    ).join('')}
    </select>`;
}

function estadoClassFromValue(v) {
    if (!v) return '';
    const n = normalizeLabel(v);
    if (n.includes('abierto')) return 'abierto';
    if (n.includes('proceso')) return 'proceso';
    if (n.includes('cerrado')) return 'cerrado';
    return '';
}

function prioridadClassFromValue(v) {
    if (!v) return 'prioridad-baja';
    const n = normalizeLabel(v);
    if (n.includes('alta')) return 'prioridad-alta';
    if (n.includes('media')) return 'prioridad-media';
    return 'prioridad-baja';
}

function updateCounters() {

    const rows = Array.from(tabla.querySelectorAll('tr'));

    let total = rows.length;
    let abiertos = 0;
    let proceso = 0;
    let cerrados = 0;

    rows.forEach(r => {

        const sel = r.querySelector('.estado-select');
        const val = sel ? sel.value : '';

        const n = normalizeLabel(val);

        if (n.includes('abierto')) abiertos++;
        else if (n.includes('proceso')) proceso++;
        else if (n.includes('cerrado')) cerrados++;

    });

    document.getElementById('total').textContent = total;
    document.getElementById('abiertos').textContent = abiertos;
    document.getElementById('proceso').textContent = proceso;
    document.getElementById('cerrados').textContent = cerrados;

}

function attachRowListeners(row) {

    const estadoSel = row.querySelector('.estado-select');
    const prioridadSel = row.querySelector('.prioridad-select');
    const tecnicoSel = row.querySelector('.tecnico-select');

    if (estadoSel) {

        estadoSel.addEventListener('change', () => {

            const v = estadoSel.value;

            estadoSel.classList.remove('abierto', 'proceso', 'cerrado');

            const estClass = estadoClassFromValue(v);

            if (estClass) estadoSel.classList.add(estClass);

            updateCounters();

        });

    }

    if (prioridadSel) {

        prioridadSel.addEventListener('change', () => {

            const v = prioridadSel.value;

            const td = prioridadSel.closest('td');

            td.classList.remove('prioridad-alta', 'prioridad-media', 'prioridad-baja');
            prioridadSel.classList.remove('prioridad-alta', 'prioridad-media', 'prioridad-baja');

            const prClass = prioridadClassFromValue(v);

            td.classList.add(prClass);
            prioridadSel.classList.add(prClass);

        });

    }

    if (tecnicoSel) {

        tecnicoSel.addEventListener('change', async () => {

            const tecnico = tecnicoSel.value;

            if (!tecnico) return;

            const idTicket = row.children[0].textContent;
            const nombre = row.children[1].textContent;
            const problema = row.children[3].textContent;

            if (!confirm(`¿Asignar ticket #${idTicket} a ${tecnico}?`)) {
                tecnicoSel.value = "";
                return;
            }

            // Se puede llamar al backend aquí si es necesario.
            // await fetch('/notificar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketId: idTicket, tecnico, nombre, problema }) });

        });

    }

}

function renderFromRows(jsonRows, cols) {

    tabla.innerHTML = '';

    const headerMap = {};
    cols.forEach((c, i) => headerMap[normalizeLabel(c)] = i);

    const find = (row, names) => {

        for (const nm of names) {

            const idx = headerMap[normalizeLabel(nm)];

            if (idx !== undefined) {

                const cell = row.c[idx];

                if (cell && cell.v !== undefined) return cell.v;

            }

        }

        return '';

    };

    jsonRows.forEach(r => {

        const id = find(r, ['id', 'idd', 'identificador']);
        const nombre = find(r, ['nombre', 'name']);
        const tipo = find(r, ['tipo', 'tipo de servicio', 'servicio']);
        const problema = find(r, ['problema', 'descripcion', 'detalle']);
        const ubicacion = find(r, ['ubicación', 'ubicacion', 'lugar']);
        const estado = find(r, ['estado', 'status']);
        const prioridad = find(r, ['prioridad', 'priority']);
        const fecha = find(r, ['fecha', 'date']);

        const estadoSel = buildSelect(['Abierto', 'En Proceso', 'Cerrado'], estado, 'estado-select');
        const prioridadSel = buildSelect(['Alta', 'Media', 'Baja'], prioridad, 'prioridad-select');

        const tecnicoSelect = `
            <select class="tecnico-select">
                <option value="">Asignar</option>
                <option value="Brandon">Brandon</option>
                <option value="Iram">Iram</option>
                <option value="Christopher">Christopher</option>
            </select>
        `;

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${id}</td>
            <td>${nombre}</td>
            <td>${tipo}</td>
            <td>${problema}</td>
            <td>${ubicacion}</td>
            <td class="estado-cell">${estadoSel}</td>
            <td class="prioridad-cell">${prioridadSel}</td>
            <td>${fecha}</td>
            <td>${tecnicoSelect}</td>
        `;

        tabla.appendChild(tr);

        const insertedEstadoSel = tr.querySelector('.estado-select');

        if (insertedEstadoSel) {
            const estClass = estadoClassFromValue(estado);
            if (estClass) insertedEstadoSel.classList.add(estClass);
        }

        const insertedPrioridadSel = tr.querySelector('.prioridad-select');
        const prioridadCell = tr.querySelector('.prioridad-cell');

        const prClass = prioridadClassFromValue(prioridad);

        if (insertedPrioridadSel) insertedPrioridadSel.classList.add(prClass);
        if (prioridadCell) prioridadCell.classList.add(prClass);

        attachRowListeners(tr);

    });

    updateCounters();

}

// CARGAR DATOS DESDE GOOGLE SHEETS

fetch(SHEET_URL)
    .then(res => {

        if (!res.ok) throw new Error('HTTP ' + res.status);

        return res.text();

    })
    .then(text => {

        let cleanedText = text;

        if (cleanedText.includes('{'))
            cleanedText = cleanedText.substring(cleanedText.indexOf('{'));

        if (cleanedText.endsWith('*/'))
            cleanedText = cleanedText.slice(0, -2);

        const json = JSON.parse(cleanedText);

        const rows = json.table?.rows || [];
        const cols = (json.table?.cols || []).map(c => c.label || '');

        if (rows.length === 0) {

            tabla.innerHTML = '<tr><td colspan="9">No hay datos disponibles</td></tr>';
            return;

        }

        renderFromRows(rows, cols);

    })
    .catch(err => {

        console.error('Error cargando datos:', err);

        tabla.innerHTML = '<tr><td colspan="9">Error al cargar los datos</td></tr>';

    });
