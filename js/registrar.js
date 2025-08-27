// ==============================
// js/registrar.js
// (abre/cierra el modal)
// ==============================
(() => {
    const $ = (s) => document.querySelector(s);

    function resetModalUi() {
        const docEl = $("#mdl-doc");
        if (docEl) docEl.value = "";

        const persona = $("#mdl-persona");
        if (persona) { persona.textContent = "Sin persona cargada."; persona.classList.add("muted"); }

        const msg = $("#mdl-msg");
        if (msg) { msg.textContent = "—"; msg.className = "muted small"; }

        const progH1 = $("#prog-h1"), progH2 = $("#prog-h2");
        if (progH1) progH1.textContent = "0/1";
        if (progH2) progH2.textContent = "0/1";

        const sizeH1 = $("#size-h1"), sizeH2 = $("#size-h2");
        if (sizeH1) sizeH1.textContent = "—";
        if (sizeH2) sizeH2.textContent = "—";

        const st1 = $("#state-h1"), st2 = $("#state-h2");
        [st1, st2].forEach(pill => {
            if (!pill) return;
            pill.textContent = "Pendiente";
            pill.classList.remove("pill-ok");
            pill.classList.add("pill-warn");
        });

        const btnGuardar = $("#mdl-guardar");
        if (btnGuardar) btnGuardar.disabled = true;

        ["mdl-cap1","mdl-cap2"].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.disabled = true;
                el.title = "La captura se realiza desde otro módulo.";
            }
        });
    }

    function openModal() {
        const m = $("#modal-enroll");
        if (!m) return;
        m.classList.add("open");
        m.style.display = "grid";
        document.body.style.overflow = "hidden";
        resetModalUi();
        const inputDoc = $("#mdl-doc");
        if (inputDoc) setTimeout(() => inputDoc.focus(), 0);
    }

    function closeModal() {
        const m = $("#modal-enroll");
        if (!m) return;
        m.classList.remove("open");
        m.style.display = "none";
        document.body.style.overflow = "";
    }

    document.addEventListener("DOMContentLoaded", () => {
        const openBtn   = $("#btn-enroll-open");
        const closeBtn  = $("#mdl-close");
        const cancelBtn = $("#mdl-cancel");
        const backdrop  = $("#modal-enroll");

        if (!openBtn) console.warn('[UI] No encontré #btn-enroll-open');
        if (!backdrop) console.warn('[UI] No encontré #modal-enroll');

        openBtn?.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
        closeBtn?.addEventListener("click", (e) => { e.preventDefault(); closeModal(); });
        cancelBtn?.addEventListener("click", (e) => { e.preventDefault(); closeModal(); });
        backdrop?.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && backdrop?.classList.contains("open")) closeModal();
        });
    });
})();


// ==============================
// js/registrar.js
// (búsqueda / set de huellas desde otro módulo / guardado)
// ==============================
(function () {
    // ---------- util UI ----------
    const byId = (id)  => document.getElementById(id);
    const statusEl = () => byId("mdl-msg");

    function setMsg(txt, kind = "muted") {
        const el = statusEl();
        if (!el) return;
        el.className = `muted small ${kind}`;
        el.textContent = txt;
    }

    function humanSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
        return (bytes/1024/1024).toFixed(1) + " MB";
    }

    // ---------- DEBUG ----------
    const D = () => !!window.DEBUG_API; // activa con: window.DEBUG_API = true

    // ---------- auth + endpoints ----------
    function authHeader() {
        const raw = localStorage.getItem("authToken") || localStorage.getItem("token") || "";
        if (!raw) return {};
        return { "Authorization": raw.startsWith("Bearer ") ? raw : `Bearer ${raw}` };
    }
    function apiBase() {
        try {
            const fromConfig = (window.config && typeof config.getServiceUrl === "function")
                ? (config.getServiceUrl("funcionariosService") || "")
                : "";
            const pick = (window.API_BASE || fromConfig || window.location.origin || "").replace(/\/$/, "");
            if (D()) console.info("[API] base =", pick || "(vacío)");
            return pick;
        } catch {
            const pick = (window.API_BASE || window.location.origin || "").replace(/\/$/, "");
            if (D()) console.info("[API] base (catch) =", pick || "(vacío)");
            return pick;
        }
    }

    // Endpoints (singular como principal + plural fallback en funciones)
    const EP = {
        buscarPorDocumento_sing: (doc) => `${apiBase()}/api/v1/funcionario/get/${encodeURIComponent(doc)}`,
        buscarPorDocumento_plur: (doc) => `${apiBase()}/api/v1/funcionarios/get/${encodeURIComponent(doc)}`,

        // OJO: por ID -> /id/{id}/huellas  |  por documento -> /{documento}/huellas
        actualizarPorId_sing:  (id)  => `${apiBase()}/api/v1/funcionario/id/${encodeURIComponent(id)}/huellas`,
        actualizarPorDoc_sing: (doc) => `${apiBase()}/api/v1/funcionario/${encodeURIComponent(doc)}/huellas`,

        actualizarPorId_plur:  (id)  => `${apiBase()}/api/v1/funcionarios/id/${encodeURIComponent(id)}/huellas`,
        actualizarPorDoc_plur: (doc) => `${apiBase()}/api/v1/funcionarios/${encodeURIComponent(doc)}/huellas`,
    };

    // ---------- normalización PNG base64 ----------
    function toPngDataUrl(sample) {
        if (!sample) return null;
        let s = String(sample).trim();
        if (s.startsWith("data:")) return s;
        if (/[-_]/.test(s)) { s = s.replace(/-/g, "+").replace(/_/g, "/"); }
        s = s.replace(/\s+/g, "");
        const pad = (4 - (s.length % 4)) % 4;
        if (pad) s += "=".repeat(pad);
        return "data:image/png;base64," + s;
    }

    // ---------- estado ----------
    const state = {
        persona: null,
        h1: { best: null, bestSize: 0, dedo: "" },
        h2: { best: null, bestSize: 0, dedo: "" },
    };

    function updateUiForSlot(slot) {
        const box = state[slot];

        const progEl = byId(`prog-${slot}`);
        if (progEl) progEl.textContent = box.best ? "1/1" : "0/1";

        const sizeEl = byId(`size-${slot}`);
        if (sizeEl) sizeEl.textContent = box.bestSize ? humanSize(box.bestSize) : "—";

        const ok = !!box.best;
        const pill = byId(`state-${slot}`);
        if (pill) {
            pill.textContent = ok ? "Listo" : "Pendiente";
            pill.classList.toggle("pill-warn", !ok);
            pill.classList.toggle("pill-ok", ok);
        }
        maybeEnableGuardar();
    }

    function maybeEnableGuardar() {
        const btn = byId("mdl-guardar");
        const ready = !!state.persona && (!!state.h1.best || !!state.h2.best);
        if (btn) btn.disabled = !ready;
        document.dispatchEvent(new CustomEvent("enroll:ready-changed", { detail: { ready } }));
    }

    // ---------- API: buscar y guardar ----------
    async function buscarPorDocumento(doc) {
        // Sing -> si 404, intenta plural
        let url = EP.buscarPorDocumento_sing(doc);
        if (D()) console.info("[API] GET", url);
        setMsg(`Buscando en: ${url}`, "info");

        let resp = await fetch(url, { headers: { ...authHeader() } });
        if (resp.status === 404) {
            const url2 = EP.buscarPorDocumento_plur(doc);
            if (D()) console.info("[API] GET (fallback)", url2);
            resp = await fetch(url2, { headers: { ...authHeader() } });
        }
        if (resp.status === 404) return null;
        if (!resp.ok) throw new Error(`Error buscando: ${resp.status}`);
        return resp.json();
    }

    async function guardarHuellas() {
        if (!state.persona) throw new Error("Primero busca y selecciona un funcionario.");

        // Solo los campos que tu DTO espera:
        const body = {
            huella:  state.h1.best || null,
            huella2: state.h2.best || null
        };

        // Identificador: en tu entidad, el PK es "documento"
        const documento = state.persona.documento || state.persona.cedula || state.persona.identificacion;
        if (!documento) throw new Error("No se reconoce el documento de la persona.");

        // Intenta por documento (sing -> plur fallback). Si quieres usar /id/{id}, descomenta el bloque de id.
        let url = EP.actualizarPorDoc_sing(documento);
        if (D()) { console.info("[API] PUT", url); console.debug("[API] body", body); }
        setMsg(`Guardando en: ${url}`, "info");

        let resp = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeader() },
            body: JSON.stringify(body)
        });

        if (resp.status === 404) {
            // fallback plural
            url = EP.actualizarPorDoc_plur(documento);
            if (D()) console.info("[API] PUT (fallback)", url);
            resp = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify(body)
            });
        }

        if (!resp.ok) {
            const txt = await resp.text().catch(()=> "");
            throw new Error(`No se pudo guardar (${resp.status}): ${txt || "Sin detalle"}`);
        }
        return resp.json().catch(()=> ({}));
    }

    // ---------- Wire DOM ----------
    function init() {
        updateUiForSlot("h1");
        updateUiForSlot("h2");
        setMsg("—");
        maybeEnableGuardar();

        const btnBuscar = byId("mdl-buscar");
        if (btnBuscar) {
            btnBuscar.addEventListener("click", async () => {
                const docInput = byId("mdl-doc");
                const doc = (docInput?.value || "").trim();
                if (!doc) { setMsg("Ingresa un documento.", "warn"); return; }
                setMsg("Buscando persona...", "info");
                try {
                    const p = await buscarPorDocumento(doc);
                    const personaBox = byId("mdl-persona");
                    if (!p) {
                        state.persona = null;
                        if (personaBox) {
                            personaBox.textContent = "No se encontró persona con ese documento.";
                            personaBox.classList.add("muted");
                        }
                        setMsg("No existe, no puedes registrar huellas.", "warn");
                        document.dispatchEvent(new CustomEvent("enroll:persona-cleared"));
                        maybeEnableGuardar();
                        return;
                    }

                    state.persona = p;
                    const nombre =
                        p.nombreCompleto ||
                        [p.nombres, p.apellidos].filter(Boolean).join(" ") ||
                        [p.primerNombre, p.segundoNombre, p.primerApellido, p.segundoApellido].filter(Boolean).join(" ") ||
                        p.nombre || p.fullName || "(Sin nombre)";
                    const docShown = p.documento || p.cedula || p.identificacion || p.doc || doc;

                    if (personaBox) {
                        personaBox.textContent = `${nombre} — Doc: ${docShown}`;
                        personaBox.classList.remove("muted");
                    }
                    setMsg("Persona encontrada. Envía las huellas desde el módulo de captura y luego guarda.", "ok");

                    document.dispatchEvent(new CustomEvent("enroll:persona-found", { detail: { persona: p } }));
                    maybeEnableGuardar();
                } catch (e) {
                    console.error(e);
                    setMsg("Error consultando persona. Revisa la sesión o la API.", "warn");
                    document.dispatchEvent(new CustomEvent("enroll:persona-cleared"));
                    maybeEnableGuardar();
                }
            });
        }

        const btnClr1 = byId("mdl-clr1");
        if (btnClr1) btnClr1.addEventListener("click", () => {
            state.h1 = { best: null, bestSize: 0, dedo: "" };
            updateUiForSlot("h1");
        });
        const btnClr2 = byId("mdl-clr2");
        if (btnClr2) btnClr2.addEventListener("click", () => {
            state.h2 = { best: null, bestSize: 0, dedo: "" };
            updateUiForSlot("h2");
        });

        const btnGuardar = byId("mdl-guardar");
        if (btnGuardar) btnGuardar.addEventListener("click", async () => {
            try {
                setMsg("Guardando huellas en BD...", "info");
                const saved = await guardarHuellas();
                setMsg("✅ Huellas guardadas/actualizadas correctamente.", "ok");
                if (D()) console.log("Guardado:", saved);
            } catch (e) {
                console.error(e);
                setMsg(e.message || "Error al guardar huellas.", "warn");
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // ---------- API pública para que tu otro módulo pase las huellas ----------
    function applyHuella(slot, dataUrl, dedo) {
        if (!["h1","h2"].includes(slot)) throw new Error('slot debe ser "h1" o "h2"');
        const safeUrl = toPngDataUrl(dataUrl);
        const bytes = atob(safeUrl.split(",")[1]).length;

        state[slot].best = safeUrl;
        state[slot].bestSize = bytes;
        if (typeof dedo === "string") state[slot].dedo = dedo;

        updateUiForSlot(slot);
        setMsg(`Huella ${slot === "h1" ? "1" : "2"} recibida.`, "ok");
    }

    function clearHuella(slot) {
        if (!["h1","h2"].includes(slot)) return;
        state[slot] = { best: null, bestSize: 0, dedo: "" };
        updateUiForSlot(slot);
    }

    function getState() {
        return {
            persona: state.persona,
            h1: { has: !!state.h1.best, size: state.h1.bestSize, dedo: state.h1.dedo },
            h2: { has: !!state.h2.best, size: state.h2.bestSize, dedo: state.h2.dedo },
            canSave: !!state.persona && (!!state.h1.best || !!state.h2.best)
        };
    }

    window.RegistroHuella = {
        // setters para tu otro módulo:
        setHuella:  applyHuella,      // setHuella("h1"|"h2", dataUrlPNG, dedo?)
        setHuella1: (dataUrl, dedo) => applyHuella("h1", dataUrl, dedo),
        setHuella2: (dataUrl, dedo) => applyHuella("h2", dataUrl, dedo),
        clearHuella,
        // utilidades:
        save: guardarHuellas,
        getState
    };
})();
