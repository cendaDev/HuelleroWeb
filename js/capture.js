// ============================
// capture.js (completo y corregido)
// ============================

// ---------------------------------------------------------
// Bloque 0) Helpers GLOBALES de huella (definidos en window)
//    - Evita "getPngBase64FromEvent is not defined"
//    - Solo se registran una vez por bandera __fpHelpersLoaded__
// ---------------------------------------------------------
(function () {
    if (window.__fpHelpersLoaded__) return;
    window.__fpHelpersLoaded__ = true;

    // Extrae base64 PNG desde el evento del SDK (Samples)
    window.getPngBase64FromEvent = function (samplesValue) {
        let parsed;
        try {
            parsed = (typeof samplesValue === "string") ? JSON.parse(samplesValue) : samplesValue;
        } catch {
            parsed = samplesValue;
        }
        const arr = (parsed && (parsed.Samples || parsed.samples)) || (Array.isArray(parsed) ? parsed : null);
        const first = Array.isArray(arr) ? arr[0] : parsed;

        const data = first && (first.Data ?? first.data);
        const fmt  = (first && (first.Format || first.format || first.DataType || first.dataType) || "").toString();

        if (!data && typeof first !== "string") throw new Error("No se encontró base64 en el sample.");
        const raw = data || (typeof first === "string" ? first : "");

        if (fmt && !/png/i.test(fmt)) throw new Error(`El SDK no entregó PNG (formato reportado: ${fmt}). Inicia con PngImage.`);

        let b64 = raw.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
        const pad = (4 - (b64.length % 4)) % 4;
        if (pad) b64 += "=".repeat(pad);

        if (!b64.startsWith("iVBORw0KGgo")) throw new Error("El sample no parece ser un PNG (firma base64 inválida).");
        return b64;
    };

    // Construye data URL desde base64 PNG
    window.toPngDataUrlFromB64 = function (b64) {
        return "data:image/png;base64," + b64;
    };

    // Renderiza la huella en #fp-img (crea el <img> si no existe)
    window.renderFingerprint = async function (dataUrl) {
        let img = document.getElementById("fp-img");
        if (!img) {
            img = document.createElement("img");
            img.id = "fp-img";
            img.alt = "Huella";
            img.style.maxWidth = "240px";
            img.style.display = "block";
            img.style.marginTop = "8px";
            img.style.borderRadius = "8px";
            document.body.appendChild(img);
        }
        if (!dataUrl) throw new Error("DataURL vacío");
        try {
            const resp = await fetch(dataUrl);
            if (!resp.ok) throw new Error("DataURL inválida");
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            img.onload = () => URL.revokeObjectURL(url);
            img.src = url;
        } catch {
            img.src = dataUrl; // fallback
        }
    };
})();

// ----------------------------
// Utils: normalización y render (resto)
// ----------------------------
function ensureStatusEl() {
    let el = document.getElementById("match-status");
    if (!el) {
        el = document.createElement("div");
        el.id = "match-status";
        el.style.marginTop = "8px";
        el.style.fontWeight = "600";
        el.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        document.body.appendChild(el);
    }
    return el;
}

// --- Alertas (SweetAlert2 centradas o fallback nativo) ---
function showAlertCentered({ title, text = "", icon = "info", timer = 2200 }) {
    if (window.Swal && typeof Swal.fire === "function") {
        return Swal.fire({
            icon,
            title,
            text,
            position: "center",
            timer,
            showConfirmButton: false,
            backdrop: true
        });
    }
    alert(`${title}${text ? `\n${text}` : ""}`);
}
function showNotDetectedAlert() { showAlertCentered({ title: "Huella no detectada", icon: "warning" }); }
function showErrorAlert(msg)   { showAlertCentered({ title: "Error", text: msg || "Ocurrió un error", icon: "error", timer: 3000 }); }

// === Helpers de hora ===
function pad2(n){ return String(n).padStart(2,'0'); }
function nowHHmmss() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function todayYYYYMMDD() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

// --- Helpers de comparación de horas para SALIDA ---
function parseHHMMSS(hhmmss){
    if (!hhmmss || typeof hhmmss !== "string") return null;
    const [h,m] = hhmmss.split(":").map(x => parseInt(x,10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return (h*60) + m; // minutos desde 00:00
}
/** Devuelve true si la hora actual está fuera del rango alrededor de la hora de salida del turno. */
function isSalidaFueraDeRango(info, toleranceMin = 10){
    const hs = info && (info.horaSalida || info.hora_salida || info.horasalida);
    const hsMin = parseHHMMSS(hs);
    if (hsMin == null) return false; // si no tenemos hora de salida de turno, no evaluamos
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    return (nowMin < (hsMin - toleranceMin)) || (nowMin > (hsMin + toleranceMin));
}

// --------- API base ---------
function getBaseUrl() {
    try {
        if (window.config && typeof config.getServiceUrl === "function") {
            return (config.getServiceUrl("funcionariosService") || "").replace(/\/+$/, "");
        }
    } catch (e) { console.warn("config.getServiceUrl no disponible:", e); }
    return ""; // relativo
}
function authHeader() {
    const t = localStorage.getItem("authToken") || localStorage.getItem("token") || "";
    if (!t) return {};
    return { "Authorization": t.startsWith("Bearer ") ? t : `Bearer ${t}` };
}
async function postJson(url, payload) {
    const headers = { "Content-Type": "application/json", ...authHeader() };
    let resp;
    try {
        resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    } catch {
        return { ok:false, status:0, msg:"No se pudo contactar el servidor" };
    }
    const text = await resp.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!resp.ok) {
        const msg = (data && data.message) || (typeof data === "string" ? data : "") || `HTTP ${resp.status}`;
        return { ok:false, status:resp.status, data, msg };
    }
    return { ok:true, status:resp.status, data };
}
async function getJson(url) {
    const headers = { ...authHeader() };
    try {
        const resp = await fetch(url, { method: "GET", headers });
        const text = await resp.text().catch(() => "");
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        return { ok: resp.ok, status: resp.status, data };
    } catch {
        return { ok: false, status: 0, data: null };
    }
}

// --------- API Anotaciones (OBLIGATORIAS cuando se exige) ---------
async function guardarAnotacion(documento, motivo, anotacion, fecha, hora) {
    const base = getBaseUrl();
    const body = {
        anotacion: (anotacion || "").trim(),
        fecha: fecha || todayYYYYMMDD(),
        hora:  hora  || nowHHmmss(),
        motivo: (motivo || "").trim(),
        documentofuncionario: documento
    };

    // Validaciones obligatorias
    if (!body.motivo)   return { ok:false, status:400, msg:"Selecciona un motivo" };
    if (!body.anotacion || body.anotacion.trim().length < 3) {
        return { ok:false, status:400, msg:"El detalle adicional es obligatorio (mín. 3 caracteres)" };
    }

    const candidates = [
        `${base}/api/v1/funcionario/${encodeURIComponent(documento)}/anotaciones`,
        `${base}/api/v1/funcionario/anotaciones`
    ];

    let last = null;
    for (const url of candidates) {
        const res = await postJson(url, body);
        if (res.ok) return res;
        last = res;
        if (res.status !== 404) break;
    }
    return last || { ok:false, status:0, msg:"Error desconocido guardando anotación" };
}

// --------- API ControlRegistro ---------
function getSelectedSedeId() {
    const sel = document.getElementById("sede-actual");
    const v = sel && sel.value;
    return (v !== undefined && v !== null && String(v).trim() !== "") ? v : null;
}
/** Consulta si habrá SALIDA (registro abierto) o ENTRADA (no abierto) */
async function hayRegistroAbiertoHoy(documento) {
    const base = getBaseUrl();
    const url  = `${base}/api/v1/control-registros/abierto-hoy?documento=${encodeURIComponent(documento)}`;
    const res = await getJson(url);
    if (!res.ok) return false;
    return !!(res.data && res.data.existe);
}

/**
 * ✅ Marca ENTRADA o SALIDA automáticamente:
 * POST /api/v1/control-registros/marcar-auto-simple
 * Body: { documento_emp, sede_emp, fecha?, hora_salida_turno?, tolerancia_min? }
 */
async function marcarAutoSimple(documento, sedeId, fechaOpt, horaSalidaTurnoOpt, toleranciaMinOpt = 10) {
    if (!documento) return { ok:false, status:400, msg:"Documento vacío" };
    if (!sedeId)     return { ok:false, status:400, msg:"Selecciona la sede antes de registrar" };

    const base = getBaseUrl();
    const body = {
        documento_emp: Number(documento),
        sede_emp: Number(sedeId)
    };
    if (fechaOpt) body.fecha = fechaOpt;
    if (horaSalidaTurnoOpt) body.hora_salida_turno = horaSalidaTurnoOpt;
    if (Number.isFinite(toleranciaMinOpt)) body.tolerancia_min = Number(toleranciaMinOpt);

    const url = `${base}/api/v1/control-registros/marcar-auto-simple`;
    return await postJson(url, body);
}

// ----------------------------
// 🔄 Señal de refresco de tabla
// ----------------------------
function refreshRegistros(payload) {
    try { window.Registros?.notifyNuevoRegistro?.(payload || null); } catch {}
    try { window.dispatchEvent(new CustomEvent('registros:nuevo', { detail: payload || null })); } catch {}
    try { localStorage.setItem('last_mark_ping', String(Date.now())); } catch {}
}

// ----------------------------
// Llamadas a API (match)
// ----------------------------
async function postMatch(url, dataUrlPng) {
    const headers = { "Content-Type": "application/json", ...authHeader() };
    let resp;
    try {
        resp = await fetch(url, { method: "POST", headers, body: JSON.stringify({ huella: dataUrlPng }) });
    } catch (e) {
        return { ok: false, networkError: true, error: e };
    }

    if (resp.ok) {
        try {
            const funcionario = await resp.json();
            return { ok: true, funcionario, status: resp.status };
        } catch {
            return { ok: false, status: resp.status, msg: "JSON inválido" };
        }
    }

    const txt = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, msg: txt || "Error" };
}

async function matchHuellaEnApi(dataUrlPng) {
    const base = getBaseUrl();
    const candidates = [
        "/api/v1/funcionario/match-estado",
        "/api/v1/funcionario/match",
        "/api/v1/funcionarios/match"
    ];

    let last = null;
    for (const path of candidates) {
        const url = base + path;
        const res = await postMatch(url, dataUrlPng);
        if (res.ok) return res;

        if (res.networkError) { last = res; continue; }
        if (res.status === 404) { last = res; continue; }
        throw new Error(`Error API (${res.status}): ${res.msg}`);
    }

    if (last && last.status === 404) return { ok: false, status: 404, msg: "Sin coincidencias o ruta no encontrada" };
    if (last && last.networkError) throw last.error || new Error("No se pudo contactar al endpoint de match");
    throw new Error("Fallo desconocido llamando a match");
}

// Trae al funcionario completo para conocer su sede
async function fetchFuncionarioById(documento) {
    const base = getBaseUrl();
    const url = `${base}/api/v1/funcionario/get/${encodeURIComponent(documento)}`;
    const resp = await fetch(url, { headers: { ...authHeader() } });
    if (!resp.ok) return null;
    return resp.json().catch(() => null);
}

// ----------------------------
// Helpers UI de post-match
// ----------------------------
function setTextValue(sel, value) {
    const el = typeof sel === "string" ? document.getElementById(sel) : sel;
    if (el) el.value = value ?? "";
}

function setSelectSede(sedeObj) {
    const sel = document.getElementById("sede-actual");
    if (!sel || !sedeObj) return;

    const id = sedeObj.sedeID ?? sedeObj.id ?? sedeObj.sedeid;
    const nombre = sedeObj.nombre ?? sedeObj.name ?? sedeObj.descripcion;

    let matched = false;
    for (let i = 0; i < sel.options.length; i++) {
        const opt = sel.options[i];
        const v = opt.value;
        const t = opt.textContent.trim();
        if ((id != null && String(v) === String(id)) ||
            (nombre && t.toLowerCase() === String(nombre).toLowerCase())) {
            sel.selectedIndex = i;
            matched = true;
            break;
        }
    }

    if (!matched) {
        sel.innerHTML = "";
        const opt = document.createElement("option");
        opt.value = id != null ? String(id) : (nombre ? String(nombre) : "sede");
        opt.textContent = nombre ? String(nombre) : (id != null ? `Sede ${id}` : "Sede");
        sel.appendChild(opt);
        sel.selectedIndex = 0;
    }
}

function paintPunctualityStatus(statusEl, fLite) {
    const estado  = (fLite && fLite.estado) || null;
    const mensaje = (fLite && fLite.mensaje) || null;
    const hi = fLite && (fLite.horaIngreso || fLite.hora_ingreso || fLite.horaentrada);
    const hs = fLite && (fLite.horaSalida  || fLite.hora_salida  || fLite.horasalida);

    if (estado || mensaje || hi || hs) {
        const turnoTxt = (hi || hs) ? ` — Turno: ${hi || "--"} a ${hs || "--"}` : "";
        statusEl.textContent = `${mensaje || "Coincidencia"}${turnoTxt}`;

        if (estado === "A_TIEMPO") statusEl.style.color = "#0a7d32";
        else if (estado === "TARDE") statusEl.style.color = "#b00020";
        else if (estado === "ANTES_DEL_TURNO" || estado === "FUERA_DE_TURNO") statusEl.style.color = "#6a5acd";
        else statusEl.style.color = "#0a7d32";
        return true;
    }
    return false;
}

// ----------------------------
// Modal: Motivo + Detalle (ambos OBLIGATORIOS cuando se exige)
// - El textarea se AUTORRELLENA con el motivo seleccionado y se actualiza
//   si el usuario aún no ha escrito texto propio.
// ----------------------------
async function promptMotivoObligatorio(nombre, doc, info) {
    const hi = info && (info.horaIngreso || info.hora_ingreso || info.horaentrada);
    const hs = info && (info.horaSalida  || info.hora_salida  || info.horasalida);
    const lineaPersona = [nombre, doc ? `(${doc})` : ""].filter(Boolean).join(" ");

    const motivos = [
        "Llegué más temprano",
        "Mucho tráfico / trancón",
        "Personal nuevo",
        "Permiso del Doctor",
        "Olvidé registrar entrada / salida",
        "Calibración/Verificación/Revisión/Mantenimiento de equipos",
        "Cambio de turno",
        "Cubriendo turno",
        "Fallas con mi vehículo (carro / moto)",
        "Asesor comercial",
        "Problemas con el transporte público",
        "Diligencias personales autorizadas"
    ];

    const options = motivos.map(m => `<option value="${m}">${m}</option>`).join("");

    const html = `
    <div style="text-align:left">
      <div><strong>${lineaPersona || "—"}</strong></div>
      ${(hi || hs) ? `<div class="text-sm">Turno: <strong>${hi || "--"} — ${hs || "--"}</strong></div>` : ""}
      <label style="display:block;margin-top:12px;font-weight:600;">Motivo (obligatorio)</label>
      <select id="motivo-select" class="swal2-input" style="width:100%;box-sizing:border-box;">
        ${options}
      </select>
      <label style="display:block;margin-top:12px;font-weight:600;">Detalle adicional (obligatorio)</label>
      <textarea id="anotacion-input"
                class="swal2-textarea"
                rows="5"
                maxlength="300"
                placeholder="Puedes añadir un detalle adicional…"
                style="width:100%;box-sizing:border-box;min-height:110px;resize:vertical;border-radius:10px;"></textarea>
      <div id="anotacion-count" class="muted" style="text-align:right;font-size:12px;margin-top:4px;">0 / 300</div>
    </div>
  `;

    if (window.Swal && typeof Swal.fire === "function") {
        const result = await Swal.fire({
            icon: "question",
            title: "Registro fuera de rango",
            html,
            showCancelButton: true,
            confirmButtonText: "Continuar",
            cancelButtonText: "Cancelar",
            focusConfirm: false,
            didOpen: (el) => {
                const sel = el.querySelector("#motivo-select");
                const ta  = el.querySelector("#anotacion-input");
                const ct  = el.querySelector("#anotacion-count");

                // Sincroniza contador
                const syncCount = () => { if (ct) ct.textContent = `${ta.value.length} / 300`; };

                // Marca que el textarea está "autorrelleno" mientras el usuario no escriba algo distinto
                const applyFromSelect = (force = false) => {
                    const m = (sel.value || "").trim();
                    if (!ta) return;
                    if (force || ta.value.trim() === "" || ta.dataset.autofill === "1") {
                        ta.value = m ? (m + " ") : "";
                        ta.dataset.autofill = "1";
                        syncCount();
                    }
                };

                // Primer autorrelleno con el motivo inicial
                applyFromSelect(true);

                // Si el usuario cambia de motivo y aún no ha escrito "texto propio", actualizamos
                sel.addEventListener("change", () => applyFromSelect(false));

                // En cuanto el usuario escriba algo distinto al motivo, desactivamos el auto-relleno
                ta.addEventListener("input", () => {
                    const currentMotivo = (sel.value || "").trim();
                    const raw = ta.value.trim();
                    // Si el contenido se aleja del motivo inicial, considerar como texto propio
                    if (raw !== currentMotivo && raw !== (currentMotivo + "")) {
                        ta.dataset.autofill = (raw.length ? "0" : "1");
                    }
                    syncCount();
                });

                syncCount();
            },
            preConfirm: () => {
                const motivo = document.getElementById("motivo-select")?.value || "";
                const anotacion = (document.getElementById("anotacion-input")?.value || "").trim();
                if (!motivo) {
                    Swal.showValidationMessage("Selecciona un motivo.");
                    return false;
                }
                if (!anotacion || anotacion.length < 3) {
                    Swal.showValidationMessage("El detalle adicional es obligatorio (mín. 3 caracteres).");
                    return false;
                }
                return { motivo, anotacion };
            }
        });
        return (result.isConfirmed && result.value) ? result.value : null;
    }

    // Fallback simple sin SweetAlert
    const motivo = prompt(`Motivo para ${lineaPersona} (obligatorio):`, motivos[0]);
    if (!motivo) return null;
    const anotacion = (prompt("Detalle adicional (obligatorio):", motivo + " ") || "").trim();
    if (!anotacion) return null;
    return { motivo, anotacion };
}

// ----------------------------
// Captura con DigitalPersona
// ----------------------------
(function () {
    const statusEl = ensureStatusEl();

    if (!window.Fingerprint || !Fingerprint.WebApi) {
        console.error("SDK de DigitalPersona no cargado.");
        statusEl.textContent = "SDK no cargado";
        statusEl.style.color = "#b00020";
        return;
    }

    const sdk = new Fingerprint.WebApi();
    let acquisitionStarted = false;
    let matching = false;

    let autoStopOnMatch = false;    // modo continuo por defecto
    let lastMatchDoc = null;
    let lastMatchAt  = 0;
    const MATCH_COOLDOWN_MS = 2000;
    const TOLERANCIA_SALIDA_MIN = 10; // puedes ajustar

    sdk.onSamplesAcquired = async (evt) => {
        if (matching) return;
        matching = true;
        statusEl.textContent = "Buscando coincidencias…";
        statusEl.style.color = "";

        try {
            // 1) Extrae y valida PNG (siempre usando window.*)
            const b64 = window.getPngBase64FromEvent(evt.samples);
            const dataUrl = window.toPngDataUrlFromB64(b64);

            // 2) Previsualizar
            await window.renderFingerprint(dataUrl);

            // 3) Consultar API de match
            const res = await matchHuellaEnApi(dataUrl);

            if (res.ok) {
                const fLite = res.funcionario || {};
                const nombre = [fLite.nombre, fLite.nombres, fLite.apellidos].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
                const doc = fLite.documento || fLite.identificacion || fLite.id || "";

                const now = Date.now();
                const isSameAsLast   = lastMatchDoc && String(lastMatchDoc) === String(doc);
                const withinCooldown = (now - lastMatchAt) < MATCH_COOLDOWN_MS;
                if (!(isSameAsLast && withinCooldown)) {
                    // Toast de match (sin bloquear)
                    const estadoToast  = fLite && fLite.estado;
                    const mensaje = fLite && fLite.mensaje;
                    const hi = fLite && (fLite.horaIngreso || fLite.hora_ingreso || fLite.horaentrada);
                    const hs = fLite && (fLite.horaSalida  || fLite.hora_salida  || fLite.horasalida);
                    const minTarde = fLite && fLite.minutosTarde;
                    const registro = nowHHmmss();
                    if (window.Swal && typeof Swal.fire === "function") {
                        const html = `
              <div style="text-align:left">
                <div><strong>${[nombre, doc ? `(${doc})` : ""].filter(Boolean).join(" ") || "—"}</strong></div>
                <div>Hora registrada: <strong>${registro}</strong></div>
                ${(hi || hs) ? `<div>Turno: <strong>${hi || "--"} — ${hs || "--"}</strong></div>` : ""}
                ${(estadoToast === "TARDE" && Number.isFinite(minTarde)) ? `<div>Retraso: <strong>${minTarde} min</strong></div>` : ""}
                ${mensaje ? `<div class="muted">${mensaje}</div>` : ""}
              </div>`;
                        Swal.fire({ icon:"info", title:"Coincidencia", html, position:"center", timer:2200, showConfirmButton:false, backdrop:true });
                    }
                    lastMatchDoc = doc || "(desconocido)";
                    lastMatchAt = now;
                }

                setTextValue("propietario", nombre || "");
                setTextValue("documento", doc || "");

                // Cargar sede del funcionario (si aplica) para preseleccionar
                let fFull = null;
                try {
                    fFull = await fetchFuncionarioById(doc);
                    const sede = fFull && (fFull.sede || fFull.Sede);
                    if (sede) setSelectSede(sede);
                } catch (e) {
                    console.warn("No se pudo cargar la sede del funcionario:", e);
                }

                const painted = paintPunctualityStatus(statusEl, fLite);

                // === Determinar acción prevista (ENTRADA/SALIDA) ANTES de marcar ===
                let sedeId = getSelectedSedeId();
                if (!sedeId) {
                    const sedeFull = fFull && (fFull.sede || fFull.Sede);
                    sedeId = sedeFull && (sedeFull.sedeID ?? sedeFull.id ?? sedeFull.sedeid);
                }
                if (!sedeId) {
                    showAlertCentered({ title: "Selecciona la sede antes de marcar", icon: "warning" });
                    return;
                }

                const existeAbierto = await hayRegistroAbiertoHoy(doc);
                const accionPrevista = existeAbierto ? "SALIDA" : "ENTRADA";

                // Determinar si se exige anotación
                const estado = fLite && fLite.estado;
                const FUERA_DE_RANGO_ENTRADA = (estado === "TARDE" || estado === "ANTES_DEL_TURNO" || estado === "FUERA_DE_TURNO");
                const horaSalidaTurno = (fLite && (fLite.horaSalida || fLite.hora_salida || fLite.horasalida)) || null;
                const FUERA_DE_RANGO_SALIDA  = isSalidaFueraDeRango(fLite, TOLERANCIA_SALIDA_MIN) || (estado === "FUERA_DE_TURNO");

                let motivoPack = null;
                const exigeAnotacion = (accionPrevista === "ENTRADA" && FUERA_DE_RANGO_ENTRADA) ||
                    (accionPrevista === "SALIDA"  && FUERA_DE_RANGO_SALIDA);

                if (exigeAnotacion) {
                    // Pedir motivo + detalle OBLIGATORIOS; cancelar si no se diligencian
                    motivoPack = await promptMotivoObligatorio(nombre, doc, fLite);
                    if (!motivoPack) {
                        showAlertCentered({ title: "Debes diligenciar motivo y detalle para continuar.", icon: "warning", timer: 2600 });
                        return; // NO marcar
                    }
                }

                // === Marcar (el backend decide realmente qué hace, pero ya validamos si exigir motivo) ===
                const resMark = await marcarAutoSimple(doc, sedeId, /*fecha*/ null, horaSalidaTurno, TOLERANCIA_SALIDA_MIN);
                if (resMark.ok) {
                    const d = resMark.data || {};
                    const accion = d.accion;

                    // 🔄 Refrescar tabla YA (entrada o salida)
                    refreshRegistros(d);

                    // Si exigimos motivo, guardar anotación obligatoria ahora
                    if (motivoPack && motivoPack.motivo && motivoPack.anotacion) {
                        await guardarAnotacion(doc, motivoPack.motivo, motivoPack.anotacion, todayYYYYMMDD(), nowHHmmss());
                    }

                    if (accion === "SALIDA") {
                        const fueraRangoSalida =
                            (typeof d.salida_fuera_rango === "boolean")
                                ? d.salida_fuera_rango
                                : FUERA_DE_RANGO_SALIDA;

                        showAlertCentered({
                            title: fueraRangoSalida
                                ? `Salida (fuera de rango) ${d.hora_salida ? `(${d.hora_salida})` : ""}`
                                : `Salida registrada ${d.hora_salida ? `(${d.hora_salida})` : ""}`,
                            text:  d.horas_trabajadas ? `Tiempo trabajado: ${d.horas_trabajadas}` : "",
                            icon:  fueraRangoSalida ? "warning" : "success",
                            timer: fueraRangoSalida ? 2600 : 2000
                        });
                    } else if (accion === "ENTRADA") {
                        showAlertCentered({
                            title: (FUERA_DE_RANGO_ENTRADA ? "Entrada (fuera de rango)" : "Entrada registrada") +
                                (d.hora_entrada ? ` (${d.hora_entrada})` : ""),
                            icon: FUERA_DE_RANGO_ENTRADA ? "warning" : "success",
                            timer: FUERA_DE_RANGO_ENTRADA ? 2200 : 1700
                        });
                    } else {
                        showAlertCentered({ title: "Marcación realizada", icon: "success", timer: 1600 });
                    }

                    if (d.accion) {
                        statusEl.textContent = (statusEl.textContent || "Marcación OK") + ` — ${d.accion}`;
                    }
                } else {
                    // ❗ También refrescamos ante 409 para sincronizar la vista
                    if (resMark.status === 409) {
                        refreshRegistros(null);
                        showAlertCentered({ title: resMark.msg || "El registro de hoy ya está cerrado.", icon: "warning", timer: 2600 });
                    } else {
                        showAlertCentered({ title: resMark.msg || "No se pudo registrar", icon: "error", timer: 2600 });
                    }
                }

                if (autoStopOnMatch) {
                    try { await sdk.stopAcquisition(); } catch {}
                    acquisitionStarted = false;

                    if (!painted) {
                        statusEl.textContent = "✅ Coincidencia. Captura detenida.";
                        statusEl.style.color = "#0a7d32";
                    } else {
                        statusEl.textContent += " — Captura detenida.";
                    }
                } else {
                    if (!painted) {
                        statusEl.textContent = "✅ Coincidencia. Listo para la siguiente huella…";
                        statusEl.style.color = "#0a7d32";
                    }
                }
            } else {
                showNotDetectedAlert();
                statusEl.textContent = "Sin coincidencias";
                statusEl.style.color = "#b00020";
            }
        } catch (e) {
            console.error("Error procesando sample/API:", e);
            statusEl.textContent = e.message || "Error al consultar la API";
            statusEl.style.color = "#b00020";
            showErrorAlert(e.message);
        } finally {
            matching = false;
        }
    };

    sdk.onCommunicationFailed = msg => console.error("Comms falló:", msg);
    sdk.onDeviceConnected     = info => console.log("Lector conectado:", info);
    sdk.onDeviceDisconnected  = info => console.warn("Lector desconectado:", info);

    async function startCapture() {
        if (acquisitionStarted) return;
        await sdk.startAcquisition(Fingerprint.SampleFormat.PngImage);
        acquisitionStarted = true;
        statusEl.textContent = "📸 Capturando huella…";
        statusEl.style.color = "";
        console.log("✅ Captura (PNG) iniciada");
    }
    async function stopCapture() {
        if (!acquisitionStarted) return;
        await sdk.stopAcquisition();
        acquisitionStarted = false;
        statusEl.textContent = "⏹️ Captura detenida";
        statusEl.style.color = "";
        console.log("⏹️ Captura detenida");
    }

    window.huella = {
        startCapture,
        stopCapture,
        setAutoStop: (v) => { autoStopOnMatch = !!v; },
        isRunning: () => acquisitionStarted
    };

    function wireCheckboxes() {
        const chkLector   = document.getElementById("chk-lector");
        const chkMultiple = document.getElementById("chk-multiple");

        if (chkMultiple) {
            chkMultiple.checked = !autoStopOnMatch;
            chkMultiple.addEventListener("change", () => {
                autoStopOnMatch = !chkMultiple.checked;
            });
        }

        if (chkLector) {
            if (chkLector.checked) {
                startCapture().catch(err => {
                    console.error("No se pudo iniciar la captura:", err);
                    statusEl.textContent = "No se pudo iniciar la captura";
                    statusEl.style.color = "#b00020";
                    showErrorAlert("No se pudo iniciar la captura");
                });
            } else {
                stopCapture().catch(() => {});
                statusEl.textContent = "Lector desactivado";
                statusEl.style.color = "#666";
            }
            chkLector.addEventListener("change", async () => {
                if (chkLector.checked) {
                    await startCapture().catch(err => {
                        console.error("No se pudo iniciar la captura:", err);
                        statusEl.textContent = "No se pudo iniciar la captura";
                        statusEl.style.color = "#b00020";
                        showErrorAlert("No se pudo iniciar la captura");
                    });
                } else {
                    await stopCapture().catch(() => {});
                    statusEl.textContent = "Lector desactivado";
                    statusEl.style.color = "#666";
                }
            });
        } else {
            startCapture().catch(err => {
                console.error("No se pudo iniciar la captura:", err);
                statusEl.textContent = "No se pudo iniciar la captura";
                statusEl.style.color = "#b00020";
                showErrorAlert("No se pudo iniciar la captura");
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", wireCheckboxes);
    } else {
        wireCheckboxes();
    }
})();
