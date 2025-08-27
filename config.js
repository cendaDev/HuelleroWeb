// config.js
window.config = {
    microservicios: {
        funcionariosService: 'http://localhost:8080', // Base URL de funcionarios y gestión
        // informesService: 'http://localhost:8080', // Base URL de control de certificados de RTM
        // informesService: 'https://api-informes-rtm-production.up.railway.app', // Base URL de control de certificados de RTM
        // funcionariosService: 'https://api-funcionarios-admin-migracion-production.up.railway.app', // Base URL de funcionarios y gestión
        // funcionariosService: 'https://painted-conservative-alexandria-liable.trycloudflare.com',
    },

    getServiceUrl: function (serviceName) {
        const baseUrl = this.microservicios[serviceName];
        if (baseUrl) {
            return baseUrl;
        } else {
            throw new Error("El microservicio ${serviceName} no está configurado.");
        }

    }
};
