document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("loginForm");
    if (form) {
        form.addEventListener("submit", login);
    }

    verificarSesionActiva();
});

function login(event) {
    event.preventDefault();

    const documento = document.getElementById('documento').value.trim();
    const password = document.getElementById('pwd').value.trim();

    if (!documento || !password) {
        Swal.fire({
            icon: 'warning',
            title: 'Campos obligatorios',
            text: 'Por favor, completa todos los campos.',
        });
        return;
    }

    if (documento === password) {
        Swal.fire({
            icon: 'warning',
            title: 'Contraseña inválida',
            text: 'La contraseña no puede ser igual al documento.',
        });
        return;
    }

    const authUrl = config.getServiceUrl('funcionariosService') + '/generate-token';

    fetch(authUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: documento, password: password })
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.message || 'Error en la autenticación');
                });
            }
            return response.json();
        })
        .then(data => {
            const token = `Bearer ${data.token}`;
            localStorage.setItem('authToken', token);

            return obtenerUsuarioActual(token);
        })
        .catch(error => {
            console.error('Error en inicio de sesión:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error de inicio de sesión',
                text: error.message || 'Credenciales incorrectas o problema en el servidor.',
            });
        });
}

function obtenerUsuarioActual(token) {
    const userUrl = config.getServiceUrl('funcionariosService') + '/actual-usuario';

    return fetch(userUrl, {
        method: 'GET',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        }
    })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.message || 'Error al obtener información del usuario');
                });
            }
            return response.json();
        })
        .then(userData => {
            localStorage.setItem('documento', userData.documento || '');
            localStorage.setItem('email', userData.email || '');
            localStorage.setItem('nombre', userData.nombre || '');
            localStorage.setItem('username', userData.username || '');
            localStorage.setItem('enabled', userData.enabled || '');

            const roles = userData.authorities?.map(role => role.authority) || [];
            localStorage.setItem('roles', JSON.stringify(roles));

            // Validar si tiene rol necesario para continuar
            const rolesValidos = ["Administrador", "Desarrollador", "Contador", "Director Técnico", "Inspector de Línea", "Cajero"];
            const tieneAcceso = roles.some(r => rolesValidos.includes(r));

            if (!tieneAcceso) {
                Swal.fire("Acceso denegado", "No tienes permiso para acceder a esta sección.", "error");
                return;
            }

            window.location.href = 'index.html';
        });
}

// Verifica si ya hay sesión activa para redirigir automáticamente
function verificarSesionActiva() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const url = config.getServiceUrl('funcionariosService') + '/actual-usuario';

    fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        }
    })
        .then(response => {
            if (!response.ok) throw new Error();
            return response.json();
        })
        .then(data => {
            const roles = data.authorities?.map(r => r.authority) || [];
            const rolesValidos = ["Administrador", "Desarrollador", "Contador", "Director Técnico", "Inspector de Línea"];
            const tieneAcceso = roles.some(r => rolesValidos.includes(r));

            if (tieneAcceso && data.documento === localStorage.getItem('documento')) {
                window.location.href = 'index.html';
            }
        })
        .catch(() => {
            localStorage.removeItem('authToken');
        });
}
