// js/registros.js
(function () {
    const $ = (sel) => document.querySelector(sel);

    // === Config ===
    const TIMEZONE = 'America/Bogota';
    const API_BASE =
        (window?.config?.getServiceUrl?.('funcionariosService')) ||
        window.location.origin;

    // Endpoints candidatos (si no existen, se hace fallback con los registros)
    const SEDE_ENDPOINTS = [
        `${API_BASE}/api/v1/sede/getAll`,
        `${API_BASE}/api/v1/sede/list`,
    ];

    // === Helpers ===
    const hoyBogotaISO = () =>
        new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE }); // YYYY-MM-DD

    const urlRegistrosAbiertos = (sede) => {
        const u = new URL(`${API_BASE}/api/v1/controlregistros/abiertos`);
        u.searchParams.set('fecha', hoyBogotaISO()); // día actual
        if (sede) u.searchParams.set('sede', sede);
        return u.toString();
    };

    // Enviar Authorization EXACTAMENTE como lo guarda seguridad.js (sin 'Bearer ' extra)
    const buildHeaders = (json = false) => {
        const h = { Accept: 'application/json' };
        if (json) h['Content-Type'] = 'application/json';
        const t = localStorage.getItem('authToken');
        if (t) h['Authorization'] = t;
        return h;
    };

    // === DOM ===
    const tbody = $('#tabla-registros tbody');
    const filtroSede = $('#filtro-sede');

    // === Sedes ===
    const extractSedeNames = (arr) => {
        const names = [];
        for (const o of (arr || [])) {
            const n = o?.nombre ?? o?.name ?? o?.descripcion ?? o?.title ?? null;
            if (n && typeof n === 'string') names.push(n.trim());
        }
        return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'es'));
    };

    const fetchSedesFromServer = async () => {
        for (const url of SEDE_ENDPOINTS) {
            try {
                const res = await fetch(url, { method: 'GET', headers: buildHeaders(), mode: 'cors' });
                if (!res.ok) continue;
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data?.content || []);
                const sedes = extractSedeNames(list);
                if (sedes.length) return sedes;
            } catch (_) { /* ignorar y probar siguiente */ }
        }
        return []; // no hay endpoint o vino vacío
    };

    const setFiltroSedeOptions = (sedesList) => {
        if (!filtroSede) return;
        const prev = filtroSede.value || '';
        filtroSede.innerHTML = '';

        const optAll = document.createElement('option');
        optAll.value = '';
        optAll.textContent = 'Todas las sedes';
        filtroSede.appendChild(optAll);

        sedesList.forEach((s) => {
            const o = document.createElement('option');
            o.value = s;
            o.textContent = s;
            filtroSede.appendChild(o);
        });

        // mantener selección si existe
        filtroSede.value = sedesList.includes(prev) ? prev : '';
    };

    const hasCustomSedes = () =>
        !!Array.from(filtroSede?.options || []).find((o) => o.value && o.value.trim() !== '');

    const mergeSedesIntoFiltro = (extraNames) => {
        if (!filtroSede) return;
        const set = new Set(
            Array.from(filtroSede.options)
                .map((o) => o.value)
                .filter((v) => v && v.trim() !== '')
        );
        extraNames.forEach((n) => set.add(n));
        setFiltroSedeOptions(Array.from(set).sort((a, b) => a.localeCompare(b, 'es')));
    };

    // === Tabla ===
    const renderTable = (rows) => {
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!rows || !rows.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 4;
            td.className = 'muted';
            td.textContent = 'Sin registros abiertos para hoy.';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        for (const r of rows) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
        <td>${r.nombre ?? '(Sin nombre)'}</td>
        <td>${r.documento ?? ''}</td>
        <td>${r.horaEntrada ?? r.hora_entrada ?? ''}</td>
        <td>${r.sede ?? r.sedeNombre ?? r.sede_emp ?? ''}</td>
      `;
            tbody.appendChild(tr);
        }
    };

    const sedesFromRows = (rows) => {
        const set = new Set();
        (rows || []).forEach((r) => {
            const s = r?.sede ?? r?.sedeNombre ?? r?.sede_emp ?? '';
            if (s) set.add(String(s).trim());
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
    };

    const cargarTabla = async () => {
        try {
            const sede = filtroSede?.value || '';
            const res = await fetch(urlRegistrosAbiertos(sede || null), {
                method: 'GET',
                headers: buildHeaders(),
                mode: 'cors',
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json(); // [{documento, nombre, horaEntrada, sede}, ...]

            renderTable(data);

            // Fallback de sedes: si el select no tiene opciones reales, las tomamos de los registros
            if (!hasCustomSedes()) {
                const list = sedesFromRows(data);
                if (list.length) setFiltroSedeOptions(list);
            }
        } catch (err) {
            console.error('[registros] No se pudieron cargar los registros abiertos:', err);
            renderTable([]);
        }
    };

    // === Init ===
    document.addEventListener('DOMContentLoaded', async () => {
        // 1) Intentar sedes desde servidor (si falla/404, queda vacío)
        const sedesServidor = await fetchSedesFromServer();
        setFiltroSedeOptions(sedesServidor); // si está vacío, solo "Todas las sedes"

        // 2) Cargar tabla de HOY; si el select está vacío, se llenará con las sedes de los datos
        await cargarTabla();

        // 3) Reaccionar a cambios de sede (consulta al servidor con ?sede=)
        filtroSede?.addEventListener('change', cargarTabla);

        // 4) Refresco automático
        setInterval(cargarTabla, 60_000);
    });

    // Exponer por si necesitas recargar manualmente
    window.Registros = { reload: cargarTabla };
})();


// Actualiza reloj (12h con AM/PM) y fecha en español
function updateClock() {
    const now = new Date();

    const hora = now.toLocaleTimeString('es-CO', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const fecha = now.toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const clockEl = document.getElementById('clock');
    const dateEl  = document.getElementById('date');

    if (clockEl) clockEl.textContent = hora;                 // ej: 2:45:09 p. m.
    if (dateEl)  dateEl.textContent  = fecha[0].toUpperCase() + fecha.slice(1); // Capitaliza el día
}

// Primera ejecución inmediata y luego cada segundo
updateClock();
setInterval(updateClock, 1000);
