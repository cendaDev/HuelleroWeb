(function () {
    // ---- Helpers -------------------------------------------------------------
    function $(sel){ return document.querySelector(sel); }
    function setText(el, txt){ if (el) el.textContent = txt; }
    function enable(el, v){ if (el) el.disabled = !v; }

    // Convierte sample -> dataURL PNG (usa la de capture.js si existe)
    function toPngDataUrlLocal(sample){
        if (typeof window.toPngDataUrl === "function") {
            return window.toPngDataUrl(sample); // reutiliza la tuya
        }
        if (!sample) return null;
        let s = String(sample).trim();
        if (s.startsWith("data:")) return s;
        s = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g,"");
        const pad = (4 - (s.length % 4)) % 4; if (pad) s += "=".repeat(pad);
        return "data:image/png;base64," + s;
    }

    // Base URL + token
    function getBaseUrl(){
        try {
            return (window.config && typeof config.getServiceUrl === "function")
                ? config.getServiceUrl("funcionariosService") || ""
                : "";
        } catch { return ""; }
    }
    function getAuthHeader(){
        const token = localStorage.getItem("authToken") || localStorage.getItem("token");
        return token ? { Authorization: token } : {};
    }

    // ---- Estado del modal ----------------------------------------------------
    const state = {
        persona: null,
        h1: null, h2: null,
        sdk: null,
        capturing: false,
        capturingSlot: null // "h1" | "h2"
    };

    // ---- UI refs -------------------------------------------------------------
    const docInp = $("#mdl-doc");
    const btnBuscar = $("#mdl-buscar");
    const personaBox = $("#mdl-persona");

    const btnCap1 = $("#mdl-cap1");
    const btnCap2 = $("#mdl-cap2");
    const btnClr1 = $("#mdl-clr1");
    const btnClr2 = $("#mdl-clr2");
    const prog1 = $("#prog-h1");
    const prog2 = $("#prog-h2");
    const size1 = $("#size-h1");
    const size2 = $("#size-h2");
    const stateH1 = $("#state-h1");
    const stateH2 = $("#state-h2");

    const btnGuardar = $("#mdl-guardar");
    const btnCancel  = $("#mdl-cancel");
    const btnClose   = $("#mdl-close");
    const msg = $("#mdl-msg");

    // ---- Render de estado ----------------------------------------------------
    function renderPersona(){
        if (!state.persona){
            personaBox.classList.add("muted");
            personaBox.innerHTML = "Sin persona cargada.";
            enable(btnCap1, false); enable(btnCap2, false);
            enable(btnClr1, false); enable(btnClr2, false);
            enable(btnGuardar, false);
            return;
        }
        personaBox.classList.remove("muted");
        const f = state.persona;
        personaBox.innerHTML = `
      <div><strong>${f.nombre ?? f.nombres ?? "Funcionario"}</strong></div>
      <div>Documento: ${f.documento ?? f.id ?? ""}</div>
      <div>Estado: ${f.estaActivo ? "Activo" : "Inactivo"}</div>
    `;
        enable(btnCap1, true); enable(btnCap2, true);
        enable(btnClr1, !!state.h1); enable(btnClr2, !!state.h2);
        enable(btnGuardar, !!(state.h1 || state.h2));
    }

    function renderHuella(slot, dataUrl){
        if (slot === "h1"){
            setText(prog1, dataUrl ? "1/1" : "0/1");
            setText(size1, dataUrl ? (Math.round((dataUrl.length/4)*3/1024)+" KB") : "—");
            stateH1.className = "pill " + (dataUrl ? "pill-ok" : "pill-warn");
            stateH1.textContent = dataUrl ? "Lista" : "Pendiente";
            enable(btnClr1, !!dataUrl);
        } else {
            setText(prog2, dataUrl ? "1/1" : "0/1");
            setText(size2, dataUrl ? (Math.round((dataUrl.length/4)*3/1024)+" KB") : "—");
            stateH2.className = "pill " + (dataUrl ? "pill-ok" : "pill-warn");
            stateH2.textContent = dataUrl ? "Lista" : "Pendiente";
            enable(btnClr2, !!dataUrl);
        }
        enable(btnGuardar, !!(state.h1 || state.h2));
    }

    function setMsg(text, ok){
        msg.textContent = text || "—";
        msg.style.color = ok ? "green" : "";
    }

    // ---- SDK DigitalPersona --------------------------------------------------
    async function ensureSdk(){
        if (state.sdk) return state.sdk;
        if (!window.Fingerprint || !Fingerprint.WebApi) {
            throw new Error("SDK DigitalPersona no cargado");
        }
        state.sdk = new Fingerprint.WebApi();

        state.sdk.onSamplesAcquired = async (evt) => {
            try {
                // Extrae el primer sample del evento
                const samples = (typeof evt.samples === "string") ? JSON.parse(evt.samples) : evt.samples;
                const payload = Array.isArray(samples) ? samples[0]
                    : (samples?.Samples?.[0]?.Data ?? samples?.Samples?.[0] ?? samples);

                const dataUrl = toPngDataUrlLocal(payload);
                if (state.capturingSlot === "h1"){
                    state.h1 = dataUrl;
                    renderHuella("h1", state.h1);
                } else if (state.capturingSlot === "h2"){
                    state.h2 = dataUrl;
                    renderHuella("h2", state.h2);
                }
                await stopCapture(); // una captura por click
                setMsg("Muestra capturada. Puedes Guardar en BD.", true);
            } catch (e) {
                setMsg("Error al procesar la muestra", false);
                console.error(e);
            }
        };
        state.sdk.onCommunicationFailed = m => console.warn("Lecto/Comms falló:", m);
        return state.sdk;
    }

    async function startCapture(slot){
        const sdk = await ensureSdk();
        if (state.capturing) return;
        state.capturing = true; state.capturingSlot = slot;
        await sdk.startAcquisition(Fingerprint.SampleFormat.PngImage);
        setMsg("Acerca el dedo al lector...", false);
    }

    async function stopCapture(){
        if (!state.sdk || !state.capturing) return;
        try { await state.sdk.stopAcquisition(); } catch {}
        state.capturing = false; state.capturingSlot = null;
    }

    // ---- API calls -----------------------------------------------------------
    async function buscarPorDocumento(doc){
        const base = getBaseUrl().replace(/\/$/, "");
        const url = base + "/api/v1/funcionario/get/" + encodeURIComponent(doc);
        const headers = { "Content-Type": "application/json", ...getAuthHeader() };
        const resp = await fetch(url, { headers });
        if (!resp.ok) throw new Error("No encontrado (" + resp.status + ")");
        return resp.json();
    }

    async function guardarHuellas(){
        if (!state.persona) { setMsg("Primero busca la persona.", false); return; }
        if (!state.h1 && !state.h2){ setMsg("Captura al menos una huella.", false); return; }

        const base = getBaseUrl().replace(/\/$/, "");
        // Usa por DOCUMENTO (si tu controller tiene ese endpoint)
        const doc = state.persona.documento ?? state.persona.id;
        const url = base + "/api/v1/funcionario/" + encodeURIComponent(doc) + "/huellas";

        const headers = { "Content-Type": "application/json", ...getAuthHeader() };
        const body = JSON.stringify({ huella: state.h1 || null, huella2: state.h2 || null });

        const resp = await fetch(url, { method: "PUT", headers, body });
        if (!resp.ok) {
            const txt = await resp.text().catch(()=> "");
            throw new Error("Error al guardar (" + resp.status + "): " + (txt||""));
        }
        return resp.json();
    }

    // ---- Listeners del modal -------------------------------------------------
    btnBuscar?.addEventListener("click", async () => {
        try {
            const doc = (docInp?.value || "").trim();
            if (!doc) { setMsg("Escribe el documento.", false); return; }
            setMsg("Buscando...", false);
            state.persona = await buscarPorDocumento(doc);
            renderPersona();
            setMsg("Persona cargada. Ahora captura la huella 1 o 2.", true);
        } catch (e) {
            state.persona = null; renderPersona();
            setMsg("No se encontró el documento.", false);
            console.error(e);
        }
    });

    btnCap1?.addEventListener("click", () => {
        if (!state.persona){ setMsg("Primero busca la persona.", false); return; }
        startCapture("h1").catch(e => { setMsg("No se pudo iniciar captura.", false); console.error(e); });
    });
    btnCap2?.addEventListener("click", () => {
        if (!state.persona){ setMsg("Primero busca la persona.", false); return; }
        startCapture("h2").catch(e => { setMsg("No se pudo iniciar captura.", false); console.error(e); });
    });

    btnClr1?.addEventListener("click", () => { state.h1 = null; renderHuella("h1", null); setMsg("Huella 1 borrada.", false); });
    btnClr2?.addEventListener("click", () => { state.h2 = null; renderHuella("h2", null); setMsg("Huella 2 borrada.", false); });

    btnGuardar?.addEventListener("click", async () => {
        try {
            setMsg("Guardando...", false);
            const saved = await guardarHuellas();
            setMsg("✅ Huella(s) guardada(s).", true);
            console.log("Guardado OK:", saved);
        } catch (e) {
            setMsg(e.message || "Error guardando", false);
            console.error(e);
        }
    });

    btnClose?.addEventListener("click", stopCapture);
    btnCancel?.addEventListener("click", stopCapture);

    // Estado inicial
    renderPersona();
    renderHuella("h1", null);
    renderHuella("h2", null);
})();
