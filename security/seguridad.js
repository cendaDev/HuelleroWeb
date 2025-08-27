// seguridad.js — redirección segura al login si no hay token / token inválido / 401/403
(function () {
    // === Configura aquí tu URL de login (mejor absoluta al host) ===
    // Si sirves todo desde la raíz: "/login.html"
    // Si lo tienes al lado del HTML actual: "login.html"
    const LOGIN_URL = "/login.html";

    // === Helpers ===
    const TZ = "America/Bogota"; // por si lo necesitas
    function getTokenRaw() {
        return (localStorage.getItem("authToken") || "").trim();
    }
    function toBearer(tokenRaw) {
        if (!tokenRaw) return "";
        return tokenRaw.startsWith("Bearer ") ? tokenRaw : `Bearer ${tokenRaw}`;
    }
    function redirectToLogin() {
        try { localStorage.removeItem("authToken"); } catch {}
        // replace() evita regresar con botón "atrás" a la página protegida
        window.location.replace(LOGIN_URL);
    }
    // Decodifica payload del JWT para leer "exp" (no verifica firma, solo lectura)
    function parseJwtPayload(tokenRaw) {
        try {
            const t = tokenRaw.startsWith("Bearer ") ? tokenRaw.slice(7) : tokenRaw;
            const parts = t.split(".");
            if (parts.length !== 3) return null;
            const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
            const json = decodeURIComponent(atob(b64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
            return JSON.parse(json);
        } catch {
            return null;
        }
    }
    function isJwtExpired(tokenRaw, skewSec = 30) {
        const p = parseJwtPayload(tokenRaw);
        if (!p || typeof p.exp !== "number") return false; // si no hay exp, dejamos que el backend valide
        const nowSec = Math.floor(Date.now() / 1000);
        return (nowSec + skewSec) >= p.exp; // margen de 30s por desfase de reloj
    }

    // === 1) Validación inmediata antes de que la página cargue ===
    const tokenRaw = getTokenRaw();
    if (!tokenRaw) {
        redirectToLogin();
        return; // corta aquí
    }
    if (isJwtExpired(tokenRaw)) {
        redirectToLogin();
        return;
    }
    const bearer = toBearer(tokenRaw);

    // === 2) Interceptor global de fetch: agrega Authorization y maneja 401/403 ===
    (function patchFetch() {
        const nativeFetch = window.fetch.bind(window);

        function shouldAttachAuth(url) {
            try {
                const u = new URL(url, window.location.href);
                // 1) mismo origen
                if (u.origin === window.location.origin) return true;
                // 2) origen del microservicio si usas config.getServiceUrl
                try {
                    if (window.config && typeof config.getServiceUrl === "function") {
                        const svc = config.getServiceUrl("funcionariosService");
                        if (svc) {
                            const o = new URL(svc, window.location.href).origin;
                            if (u.origin === o) return true;
                        }
                    }
                } catch {}
            } catch {}
            return false;
        }

        window.fetch = async (input, init = {}) => {
            try {
                const req = (input instanceof Request) ? input : new Request(input, init);
                const url = (req.url || "").toString();

                // no adjuntes Authorization cuando pegas al login para evitar loops
                const isLoginReq = url.includes("login.html") || url.endsWith("/login") || url.endsWith("/auth/login");

                let outReq = req;
                if (!isLoginReq && shouldAttachAuth(url)) {
                    const headers = new Headers(req.headers || {});
                    if (!headers.has("Authorization")) headers.set("Authorization", bearer);
                    outReq = new Request(req, { headers });
                }

                const resp = await nativeFetch(outReq);
                if (resp && (resp.status === 401 || resp.status === 403)) {
                    redirectToLogin();
                    return resp; // por si alguien hace .then() luego; igual ya redirigimos
                }
                return resp;
            } catch (e) {
                // En error de red, por seguridad puedes redirigir o dejar pasar:
                // redirectToLogin();
                throw e;
            }
        };
    })();

    // === 3) Verificación rápida contra el backend (opcional pero recomendada) ===
    (async function pingActualUsuario() {
        try {
            let url = "";
            if (window.config && typeof config.getServiceUrl === "function") {
                url = (config.getServiceUrl("funcionariosService") || "").replace(/\/+$/, "") + "/actual-usuario";
            } else {
                // mismo host, ajusta si tu endpoint difiere
                url = "/api/v1/funcionario/actual-usuario";
            }
            const resp = await fetch(url, { method: "GET", headers: { "Authorization": bearer } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            // opcionalmente valida roles aquí con el JSON
            // const data = await resp.json().catch(()=>null);
        } catch (e) {
            redirectToLogin();
        }
    })();

    // === 4) Deslogueo cruzado entre pestañas ===
    window.addEventListener("storage", (ev) => {
        if (ev.key === "authToken" && !ev.newValue) {
            redirectToLogin();
        }
    });

    // === 5) Vuelve a verificar al volver a la pestaña (por si expiró) ===
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            const t = getTokenRaw();
            if (!t || isJwtExpired(t)) redirectToLogin();
        }
    });
})();
