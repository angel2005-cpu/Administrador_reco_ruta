import { authService } from '../servicios/authService.js';
import { apiService } from '../servicios/apiService.js';

// Estado del mapa (Leaflet)
let mapaVivo = null;
let marcadoresCamiones = {}; // { id_vehiculo: L.Marker }
let canalVehiculos = null;
let canalIncidencias = null;
let mapaHistorial = null;
let polylineHistorial = null;
let vehiculoHistorialActual = null;

const CENTRO_TANTOYUCA = [21.3510, -98.2285];

// Icono personalizado para los camiones en el mapa
const iconoCamion = L.divIcon({
    className: 'icono-camion',
    html: '<div style="background:#2E7D32;color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fa-solid fa-truck"></i></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
});

// Router simple de vistas
const vistas = ['dashboard', 'choferes', 'camiones', 'reportes', 'incidencias'];
const titulos = {
    dashboard: 'Monitoreo en Tiempo Real',
    choferes: 'Gestionar Choferes',
    camiones: 'Camiones',
    reportes: 'Reportes Ciudadanos',
    incidencias: 'Incidencias de Choferes',
};

function mostrarVista(nombreVista) {
    vistas.forEach((v) => {
        const seccion = document.getElementById(`view-${v}`);
        if (seccion) seccion.classList.toggle('hidden', v !== nombreVista);
    });

    document.getElementById('tituloVista').innerText = titulos[nombreVista] || 'Recoruta';

    // Estilos del menú activo
    document.querySelectorAll('.nav-link').forEach((link) => {
        const esActivo = link.dataset.view === nombreVista;
        link.classList.toggle('bg-green-700', esActivo);
        link.classList.toggle('text-white', esActivo);
        link.classList.toggle('text-green-100', !esActivo);
    });

    // Cargar datos propios de cada vista
    if (nombreVista === 'dashboard') {
        cargarMetricas();
        inicializarMapa();
    } else if (nombreVista === 'choferes') {
        cargarChoferes();
        cargarOpcionesVehiculo();
    } else if (nombreVista === 'camiones') {
        cargarVehiculos();
    } else if (nombreVista === 'reportes') {
        cargarReportes();
    } else if (nombreVista === 'incidencias') {
        cargarIncidencias();
    }
}

// DASHBOARD: Métricas
async function cargarMetricas() {
    try {
        const metricas = await apiService.obtenerMetricasDashboard();
        document.getElementById('cantCamiones').innerText = metricas.camiones;
        document.getElementById('cantReportes').innerText = metricas.reportes;
        document.getElementById('cantChoferes').innerText = metricas.choferes;
    } catch (err) {
        console.error('[RECORUTA ERROR]:', err.message);
        document.getElementById('cantCamiones').innerText = 'Error';
        document.getElementById('cantReportes').innerText = 'Error';
        document.getElementById('cantChoferes').innerText = 'Error';
    }
}

// DASHBOARD: Mapa en vivo
async function inicializarMapa() {
    // Si el mapa ya existe, solo recalculamos su tamaño 
    if (mapaVivo) {
        setTimeout(() => mapaVivo.invalidateSize(), 100);
        return;
    }

    mapaVivo = L.map('mapaVivo').setView(CENTRO_TANTOYUCA, 14);

    L.tileLayer('https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap & CartoDB',
    }).addTo(mapaVivo);

    // Carga inicial de camiones
    try {
        const vehiculos = await apiService.obtenerVehiculos();
        vehiculos.forEach((v) => actualizarMarcadorCamion(v));
    } catch (err) {
        console.error('[RECORUTA ERROR mapa]:', err.message);
    }

    // Suscripción en tiempo real a cambios de posición/estado
    canalVehiculos = apiService.escucharVehiculos((payload) => {
        if (payload.eventType === 'DELETE') {
            const idEliminado = payload.old.id_vehiculo;
            if (marcadoresCamiones[idEliminado]) {
                mapaVivo.removeLayer(marcadoresCamiones[idEliminado]);
                delete marcadoresCamiones[idEliminado];
            }
            return;
        }
        actualizarMarcadorCamion(payload.new);
    });

    setTimeout(() => mapaVivo.invalidateSize(), 100);
}

function actualizarMarcadorCamion(vehiculo) {
    const { id_vehiculo, placa, estado, latitud, longitud } = vehiculo;
    if (latitud == null || longitud == null) return;

    const posicion = [Number(latitud), Number(longitud)];
    const popupHtml = `<strong>${placa}</strong><br>Estado: ${estado}`;

    if (marcadoresCamiones[id_vehiculo]) {
        marcadoresCamiones[id_vehiculo].setLatLng(posicion);
        marcadoresCamiones[id_vehiculo].setPopupContent(popupHtml);
    } else {
        const marcador = L.marker(posicion, { icon: iconoCamion })
            .bindPopup(popupHtml)
            .addTo(mapaVivo);
        marcadoresCamiones[id_vehiculo] = marcador;
    }
}

// CHOFERES
async function cargarOpcionesVehiculo() {
    const select = document.getElementById('choferVehiculo');
    try {
        const vehiculos = await apiService.obtenerVehiculos();
        select.innerHTML = '<option value="">Sin asignar</option>' +
            vehiculos.map((v) => `<option value="${v.id_vehiculo}">${v.placa} (${v.estado})</option>`).join('');
    } catch (err) {
        console.error('[RECORUTA ERROR]:', err.message);
    }
}

async function cargarChoferes() {
    const tbody = document.getElementById('tablaChoferes');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">Cargando...</td></tr>';

    try {
        const choferes = await apiService.obtenerChoferes();

        if (choferes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">No hay choferes registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = choferes.map((c) => {
            const vehiculoTexto = c.vehiculos ? `${c.vehiculos.placa} (${c.vehiculos.estado})` : 'Sin asignar';
            return `
                <tr>
                    <td class="px-6 py-4 font-medium text-gray-800">${c.nombre}</td>
                    <td class="px-6 py-4">${vehiculoTexto}</td>
                    <td class="px-6 py-4">${c.horario || '—'}</td>
                    <td class="px-6 py-4">${c.sector_asignado || '—'}</td>
                    <td class="px-6 py-4 text-right space-x-3">
    <button data-accion="editar-chofer"
        data-id="${c.id_usuario}"
        data-nombre="${c.nombre}"
        data-vehiculo="${c.id_vehiculo || ''}"
        data-horario="${c.horario || ''}"
        data-sector="${c.sector_asignado || ''}"
        class="text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
        <i class="fa-solid fa-pen mr-1"></i>Editar
    </button>
    <button data-accion="eliminar-chofer" data-id="${c.id_usuario}" data-nombre="${c.nombre}"
        class="text-red-600 hover:text-red-800 font-medium cursor-pointer">
        <i class="fa-solid fa-trash mr-1"></i>Eliminar
    </button>
</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-6 text-center text-red-500">Error: ${err.message}</td></tr>`;
    }
}

function mostrarMensajeChofer(texto, esError) {
    const div = document.getElementById('choferMensaje');
    div.innerText = texto;
    div.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
    div.classList.add(esError ? 'bg-red-100' : 'bg-green-100', esError ? 'text-red-700' : 'text-green-700');
}

async function manejarSubmitChofer(e) {
    e.preventDefault();

    const usuario = document.getElementById('choferUsuario').value.trim();
    const contrasena = document.getElementById('choferContrasena').value;
    const nombre = document.getElementById('choferNombre').value.trim();
    const idVehiculo = document.getElementById('choferVehiculo').value || null;
    const horario = document.getElementById('choferHorario').value.trim();
    const sectorAsignado = document.getElementById('choferSector').value.trim();

    if (!usuario || !contrasena || !nombre) {
        mostrarMensajeChofer('Completa usuario, contraseña y nombre.', true);
        return;
    }

    try {
        // Hasheamos la contraseña en el navegador con bcrypt (igual que el resto del sistema)
        const contrasenaHash = bcrypt.hashSync(contrasena, 10);

        await apiService.crearChofer({
            usuario,
            contrasenaHash,
            nombre,
            idVehiculo,
            horario,
            sectorAsignado,
        });

        mostrarMensajeChofer('Chofer registrado correctamente.', false);
        document.getElementById('formChofer').reset();
        cargarChoferes();
        cargarOpcionesVehiculo();
    } catch (err) {
        mostrarMensajeChofer(err.message, true);
    }
}

async function manejarClickTablaChoferes(e) {
    // editar
    const botonEditar = e.target.closest('[data-accion="editar-chofer"]');
    if (botonEditar) {
        abrirModalEditar({
            id: botonEditar.dataset.id,
            nombre: botonEditar.dataset.nombre,
            vehiculo: botonEditar.dataset.vehiculo,
            horario: botonEditar.dataset.horario,
            sector: botonEditar.dataset.sector,
        });
        return;
    }

    // eliminar
    const boton = e.target.closest('[data-accion="eliminar-chofer"]');
    if (!boton) return;

    const idUsuario = boton.dataset.id;
    const nombre = boton.dataset.nombre;

    if (!confirm(`¿Eliminar al chofer "${nombre}"? Esta acción no se puede deshacer.`)) return;

    try {
        await apiService.eliminarChofer(idUsuario);
        cargarChoferes();
        cargarMetricas();
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
}

// VEHÍCULOS
async function cargarVehiculos() {
    const tbody = document.getElementById('tablaVehiculos');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">Cargando...</td></tr>';

    try {
        const vehiculos = await apiService.obtenerVehiculos();

        if (vehiculos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">No hay camiones registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = vehiculos.map((v) => {
            const fecha = v.ultima_actualizacion ? new Date(v.ultima_actualizacion).toLocaleString('es-MX') : '—';
            const colorEstado = {
                'Disponible': 'bg-green-100 text-green-700',
                'En ruta': 'bg-blue-100 text-blue-700',
                'Mantenimiento': 'bg-yellow-100 text-yellow-700',
                'Fuera de servicio': 'bg-red-100 text-red-700',
            }[v.estado] || 'bg-gray-100 text-gray-700';

            return `
                <tr>
                    <td class="px-6 py-4 font-medium text-gray-800">${v.placa}</td>
                    <td class="px-6 py-4">
                        <select data-accion="cambiar-estado" data-id="${v.id_vehiculo}"
                            class="text-xs font-semibold px-2 py-1 rounded-lg border-0 ${colorEstado} cursor-pointer">
                            ${['Disponible', 'En ruta', 'Mantenimiento', 'Fuera de servicio'].map((opt) =>
                `<option value="${opt}" ${opt === v.estado ? 'selected' : ''}>${opt}</option>`
            ).join('')}
                        </select>
                    </td>
                    <td class="px-6 py-4 text-gray-500">${Number(v.latitud).toFixed(4)}, ${Number(v.longitud).toFixed(4)}</td>
                    <td class="px-6 py-4 text-gray-500">${fecha}</td>
<td class="px-6 py-4 text-right space-x-3">
    <button data-accion="ver-historial" data-id="${v.id_vehiculo}" data-placa="${v.placa}"
        class="text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
        <i class="fa-solid fa-route mr-1"></i>Historial
    </button>
    <button data-accion="eliminar-vehiculo" data-id="${v.id_vehiculo}" data-placa="${v.placa}"
        class="text-red-600 hover:text-red-800 font-medium cursor-pointer">
        <i class="fa-solid fa-trash mr-1"></i>Eliminar
    </button>
</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-6 text-center text-red-500">Error: ${err.message}</td></tr>`;
    }
}

function mostrarMensajeVehiculo(texto, esError) {
    const div = document.getElementById('vehiculoMensaje');
    div.innerText = texto;
    div.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
    div.classList.add(esError ? 'bg-red-100' : 'bg-green-100', esError ? 'text-red-700' : 'text-green-700');
}

async function manejarSubmitVehiculo(e) {
    e.preventDefault();

    const placa = document.getElementById('vehiculoPlaca').value.trim();
    const estado = document.getElementById('vehiculoEstado').value;

    if (!placa) {
        mostrarMensajeVehiculo('Ingresa la placa del camión.', true);
        return;
    }

    try {
        await apiService.crearVehiculo({ placa, estado });
        mostrarMensajeVehiculo('Camión registrado correctamente.', false);
        document.getElementById('formVehiculo').reset();
        cargarVehiculos();
        cargarMetricas();
    } catch (err) {
        mostrarMensajeVehiculo(err.message, true);
    }
}

async function manejarClickTablaVehiculos(e) {
    const botonHistorial = e.target.closest('[data-accion="ver-historial"]');
    if (botonHistorial) {
        abrirModalHistorial(botonHistorial.dataset.id, botonHistorial.dataset.placa);
        return;
    }
    const botonEliminar = e.target.closest('[data-accion="eliminar-vehiculo"]');
    if (botonEliminar) {
        const idVehiculo = botonEliminar.dataset.id;
        const placa = botonEliminar.dataset.placa;

        if (!confirm(`¿Eliminar el camión "${placa}"? Los choferes asignados quedarán sin vehículo.`)) return;

        try {
            await apiService.eliminarVehiculo(idVehiculo);
            cargarVehiculos();
            cargarMetricas();
        } catch (err) {
            alert('Error al eliminar: ' + err.message);
        }
    }
}

async function manejarCambioEstadoVehiculo(e) {
    const select = e.target.closest('[data-accion="cambiar-estado"]');
    if (!select) return;

    const idVehiculo = select.dataset.id;
    const nuevoEstado = select.value;

    try {
        await apiService.actualizarVehiculo(idVehiculo, { estado: nuevoEstado });
        cargarVehiculos();
    } catch (err) {
        alert('Error al actualizar estado: ' + err.message);
        cargarVehiculos();
    }
}

// REPORTES CIUDADANOS
async function cargarReportes() {
    const tbody = document.getElementById('tablaReportes');
    tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-6 text-center text-gray-400">Cargando...</td></tr>';

    try {
        const reportes = await apiService.obtenerReportes();

        if (reportes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-6 text-center text-gray-400">No hay reportes registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = reportes.map((r) => {
            const fecha = r.fecha ? new Date(r.fecha).toLocaleString('es-MX') : '—';
            const nombreCiudadano = r.ciudadanos ? r.ciudadanos.nombre : 'Desconocido';
            const esPendiente = r.estado === 'Pendiente';
            const colorEstado = esPendiente ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
            const evidencia = r.evidencia_foto
                ? `<a href="${r.evidencia_foto}" target="_blank" class="text-blue-600 hover:underline"><i class="fa-solid fa-image mr-1"></i>Ver foto</a>`
                : '—';
            const nombreChofer = r.choferes
                ? `<span class="flex items-center space-x-1">
               <i class="fa-solid fa-user-tie text-green-600"></i>
               <span>${r.choferes.nombre}</span>
           </span>`
                : '<span class="text-gray-400">Sin asignar</span>';

            return `
                <tr>
                    <td class="px-6 py-4 font-medium text-gray-800">${nombreCiudadano}</td>
                    <td class="px-6 py-4 max-w-xs">${r.descripcion}</td>
                    <td class="px-6 py-4 text-gray-500">${Number(r.latitud).toFixed(4)}, ${Number(r.longitud).toFixed(4)}</td>
                    <td class="px-6 py-4">${evidencia}</td>
                    <td class="px-6 py-4 text-gray-500">${fecha}</td>
                    <td class="px-6 py-4">
                        <span class="text-xs font-semibold px-2 py-1 rounded-lg ${colorEstado}">${r.estado}</span>
                    </td>
                    <td class="px-6 py-4">${nombreChofer}</td>
                    <td class="px-6 py-4 text-right">
                        ${esPendiente
                    ? `<button data-accion="marcar-atendido" data-id="${r.id_reporte}"
                                class="text-green-700 hover:text-green-900 font-medium cursor-pointer">
                                <i class="fa-solid fa-check mr-1"></i>Marcar atendido
                              </button>`
                    : '<span class="text-gray-400">—</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-6 text-center text-red-500">Error: ${err.message}</td></tr>`;
    }
}

async function manejarClickTablaReportes(e) {
    const boton = e.target.closest('[data-accion="marcar-atendido"]');
    if (!boton) return;

    const idReporte = boton.dataset.id;

    try {
        await apiService.marcarReporteAtendido(idReporte);
        cargarReportes();
        cargarMetricas();
    } catch (err) {
        alert('Error al actualizar: ' + err.message);
    }
}

function clasificarTipo(descripcion) {
    const lower = descripcion.toLowerCase();
    if (lower.includes('descompuest') || lower.includes('mecán') || lower.includes('llanta') || lower.includes('motor') || lower.includes('falla'))
        return { etiqueta: 'MECÁNICA', clase: 'bg-red-100 text-red-700' };
    if (lower.includes('tráfico') || lower.includes('trafico') || lower.includes('bloqueo') || lower.includes('accidente') || lower.includes('cerrada'))
        return { etiqueta: 'TRÁFICO', clase: 'bg-orange-100 text-orange-700' };
    if (lower.includes('retraso') || lower.includes('tardanza') || lower.includes('demora'))
        return { etiqueta: 'RETRASO', clase: 'bg-yellow-100 text-yellow-700' };
    if (lower.includes('cancel') || lower.includes('ruta'))
        return { etiqueta: 'RUTA', clase: 'bg-purple-100 text-purple-700' };
    return { etiqueta: 'AVISO', clase: 'bg-gray-100 text-gray-600' };
}

async function cargarIncidencias() {
    const tbody = document.getElementById('tablaIncidencias');
    tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">Cargando...</td></tr>';

    try {
        const incidencias = await apiService.obtenerIncidencias();

        document.getElementById('totalIncidencias').innerText =
            incidencias.length === 0 ? 'Sin incidencias' : `${incidencias.length} incidencia${incidencias.length > 1 ? 's' : ''}`;

        if (incidencias.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-6 text-center text-gray-400">No hay incidencias registradas.</td></tr>';
            return;
        }

        tbody.innerHTML = incidencias.map((inc) => {
            const fecha = inc.fecha_hora ? new Date(inc.fecha_hora).toLocaleString('es-MX') : '—';
            const placa = inc.vehiculos ? inc.vehiculos.placa : '—';
            const tipo = clasificarTipo(inc.descripcion || '');

            return `
                <tr>
                    <td class="px-6 py-4 font-medium text-gray-800">
                        <div class="flex items-center space-x-2">
                            <i class="fa-solid fa-truck text-green-600"></i>
                            <span>Camión #${inc.id_vehiculo}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-gray-600">${placa}</td>
                    <td class="px-6 py-4 max-w-xs text-gray-700">${inc.descripcion}</td>
                    <td class="px-6 py-4">
                        <span class="text-xs font-semibold px-2 py-1 rounded-lg ${tipo.clase}">${tipo.etiqueta}</span>
                    </td>
                    <td class="px-6 py-4 text-gray-500">${fecha}</td>
                </tr>
            `;
        }).join('');

        // Suscripción en tiempo real: si ya hay canal activo no lo duplicamos
        if (!canalIncidencias) {
            canalIncidencias = apiService.escucharIncidencias(() => {
                cargarIncidencias();
            });
        }

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-6 text-center text-red-500">Error: ${err.message}</td></tr>`;
    }
}

// EDITAR CHOFER
async function abrirModalEditar(datos) {
    document.getElementById('editChoferIdUsuario').value = datos.id;
    document.getElementById('editChoferNombre').value = datos.nombre;
    document.getElementById('editChoferHorario').value = datos.horario;
    document.getElementById('editChoferSector').value = datos.sector;

    // Llenar select de vehículos
    const select = document.getElementById('editChoferVehiculo');
    try {
        const vehiculos = await apiService.obtenerVehiculos();
        select.innerHTML = '<option value="">Sin asignar</option>' +
            vehiculos.map((v) =>
                `<option value="${v.id_vehiculo}" ${String(v.id_vehiculo) === String(datos.vehiculo) ? 'selected' : ''}>
                    ${v.placa} (${v.estado})
                </option>`
            ).join('');
    } catch { select.innerHTML = '<option value="">Sin asignar</option>'; }

    document.getElementById('editChoferMensaje').classList.add('hidden');
    document.getElementById('modalEditarChofer').classList.remove('hidden');
}

function cerrarModalEditar() {
    document.getElementById('modalEditarChofer').classList.add('hidden');
}

async function guardarCambiosChofer() {
    const idUsuario = document.getElementById('editChoferIdUsuario').value;
    const nombre = document.getElementById('editChoferNombre').value.trim();
    const idVehiculo = document.getElementById('editChoferVehiculo').value || null;
    const horario = document.getElementById('editChoferHorario').value.trim();
    const sectorAsignado = document.getElementById('editChoferSector').value.trim();

    const msgDiv = document.getElementById('editChoferMensaje');

    if (!nombre) {
        msgDiv.innerText = 'El nombre no puede estar vacío.';
        msgDiv.className = 'mt-3 p-3 rounded-xl text-sm font-medium bg-red-100 text-red-700';
        return;
    }

    try {
        await apiService.actualizarChofer(idUsuario, {
            nombre,
            id_vehiculo: idVehiculo,
            horario: horario || null,
            sector_asignado: sectorAsignado || null,
        });

        msgDiv.innerText = 'Cambios guardados correctamente.';
        msgDiv.className = 'mt-3 p-3 rounded-xl text-sm font-medium bg-green-100 text-green-700';

        setTimeout(() => {
            cerrarModalEditar();
            cargarChoferes();
        }, 1000);
    } catch (err) {
        msgDiv.innerText = err.message;
        msgDiv.className = 'mt-3 p-3 rounded-xl text-sm font-medium bg-red-100 text-red-700';
    }
}

// historial de recorrido
async function abrirModalHistorial(idVehiculo, placa) {
    vehiculoHistorialActual = idVehiculo;
    document.getElementById('historialTitulo').innerText = placa;
    document.getElementById('historialPuntos').innerText = '';

    // Fecha de hoy por defecto
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('historialFecha').value = hoy;

    document.getElementById('modalHistorial').classList.remove('hidden');

    // Inicializar mapa solo la primera vez
    if (!mapaHistorial) {
        mapaHistorial = L.map('mapaHistorial').setView(CENTRO_TANTOYUCA, 14);
        L.tileLayer('https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap & CartoDB',
        }).addTo(mapaHistorial);
    }

    setTimeout(() => mapaHistorial.invalidateSize(), 150);
    await dibujarHistorial(idVehiculo, hoy);
}

async function dibujarHistorial(idVehiculo, fecha) {
    // Limpiar capa anterior
    if (polylineHistorial) {
        mapaHistorial.removeLayer(polylineHistorial);
        polylineHistorial = null;
    }

    const puntosLabel = document.getElementById('historialPuntos');
    puntosLabel.innerText = 'Cargando...';

    try {
        const puntos = await apiService.obtenerHistorialVehiculo(idVehiculo, fecha);

        if (puntos.length === 0) {
            puntosLabel.innerText = 'Sin recorrido registrado para esta fecha.';
            mapaHistorial.setView(CENTRO_TANTOYUCA, 14);
            return;
        }

        const coordenadas = puntos.map((p) => [Number(p.latitud), Number(p.longitud)]);

        // Dibujar línea de ruta
        polylineHistorial = L.polyline(coordenadas, {
            color: '#2E7D32',
            weight: 4,
            opacity: 0.8,
        }).addTo(mapaHistorial);

        // Marcador de inicio verde y fin rojo
        L.circleMarker(coordenadas[0], {
            radius: 8, color: '#2E7D32', fillColor: '#4CAF50', fillOpacity: 1,
        }).bindPopup('Inicio de ruta').addTo(mapaHistorial);

        if (coordenadas.length > 1) {
            L.circleMarker(coordenadas[coordenadas.length - 1], {
                radius: 8, color: '#B71C1C', fillColor: '#F44336', fillOpacity: 1,
            }).bindPopup('Último punto registrado').addTo(mapaHistorial);
        }

        mapaHistorial.fitBounds(polylineHistorial.getBounds(), { padding: [20, 20] });
        puntosLabel.innerText = `${puntos.length} punto${puntos.length > 1 ? 's' : ''} registrado${puntos.length > 1 ? 's' : ''}`;

    } catch (err) {
        puntosLabel.innerText = 'Error al cargar el historial.';
    }
}

function cerrarModalHistorial() {
    document.getElementById('modalHistorial').classList.add('hidden');
}

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {

    // Botón Cerrar Sesión
    const btnCerrarSesion = document.getElementById('btnCerrarSesion');
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', () => {
            authService.cerrarSesion();
        });
    }

    // Navegación del menú lateral
    document.querySelectorAll('.nav-link').forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            mostrarVista(link.dataset.view);
        });
    });

    // Formularios
    document.getElementById('formChofer').addEventListener('submit', manejarSubmitChofer);
    document.getElementById('formVehiculo').addEventListener('submit', manejarSubmitVehiculo);

    // Delegación de eventos en tablas
    document.getElementById('tablaChoferes').addEventListener('click', manejarClickTablaChoferes);
    document.getElementById('tablaVehiculos').addEventListener('click', manejarClickTablaVehiculos);
    document.getElementById('tablaVehiculos').addEventListener('change', manejarCambioEstadoVehiculo);
    document.getElementById('tablaReportes').addEventListener('click', manejarClickTablaReportes);

    // Modal editar chofer
    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModalEditar);
    document.getElementById('btnCancelarModal').addEventListener('click', cerrarModalEditar);
    document.getElementById('btnGuardarChofer').addEventListener('click', guardarCambiosChofer);
    document.getElementById('modalEditarChofer').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalEditarChofer')) cerrarModalEditar();
    });

    // Modal historial
    document.getElementById('btnCerrarHistorial').addEventListener('click', cerrarModalHistorial);
    document.getElementById('modalHistorial').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modalHistorial')) cerrarModalHistorial();
    });
    document.getElementById('btnCargarHistorial').addEventListener('click', () => {
        const fecha = document.getElementById('historialFecha').value;
        if (fecha && vehiculoHistorialActual) dibujarHistorial(vehiculoHistorialActual, fecha);
    });

    // Vista inicial
    mostrarVista('dashboard');
});
