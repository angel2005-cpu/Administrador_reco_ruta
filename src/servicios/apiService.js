import { _supabase } from './supabase.js';

export const apiService = {
    async obtenerMetricasDashboard() {
        // Hacemos consultas optimizadas por separado usando conteo exacto de filas
        const { count: camiones, error: errC } = await _supabase
            .from('vehiculos')
            .select('*', { count: 'exact', head: true });

        const { count: reportes, error: errR } = await _supabase
            .from('reportes_ciudadanos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'Pendiente');

        const { count: choferes, error: errCh } = await _supabase
            .from('choferes')
            .select('*', { count: 'exact', head: true });

        if (errC || errR || errCh) {
            throw new Error('Error al sincronizar las métricas con el servidor.');
        }

        return {
            camiones: camiones || 0,
            reportes: reportes || 0,
            choferes: choferes || 0
        };
    },

    // VEHÍCULOS

    /// Obtiene todos los vehículos registrados
    async obtenerVehiculos() {
        const { data, error } = await _supabase
            .from('vehiculos')
            .select('*')
            .order('id_vehiculo', { ascending: true });

        if (error) throw new Error('Error al obtener los vehículos: ' + error.message);
        return data || [];
    },

    /// Escucha cambios en tiempo real de los vehículos (posición/estado)
    escucharVehiculos(callback) {
        return _supabase
            .channel('admin-vehiculos')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehiculos' }, callback)
            .subscribe();
    },

    /// Registra un nuevo vehículo
    async crearVehiculo({ placa, estado = 'Disponible', latitud = 21.3510, longitud = -98.2285 }) {
        const { error } = await _supabase
            .from('vehiculos')
            .insert({ placa, estado, latitud, longitud });

        if (error) throw new Error('Error al registrar el vehículo: ' + error.message);
    },

    /// Actualiza un vehículo existente (placa y/o estado)
    async actualizarVehiculo(idVehiculo, cambios) {
        const { error } = await _supabase
            .from('vehiculos')
            .update(cambios)
            .eq('id_vehiculo', idVehiculo);

        if (error) throw new Error('Error al actualizar el vehículo: ' + error.message);
    },

    /// Elimina un vehículo (los choferes asignados quedan con id_vehiculo = NULL por ON DELETE SET NULL)
    async eliminarVehiculo(idVehiculo) {
        const { error } = await _supabase
            .from('vehiculos')
            .delete()
            .eq('id_vehiculo', idVehiculo);

        if (error) throw new Error('Error al eliminar el vehículo: ' + error.message);
    },

    // CHOFERES

    /// Obtiene los choferes junto con el nombre/placa del vehículo asignado
    async obtenerChoferes() {
        const { data, error } = await _supabase
            .from('choferes')
            .select(`
                id_chofer,
                id_usuario,
                nombre,
                horario,
                sector_asignado,
                id_vehiculo,
                vehiculos ( placa, estado )
            `)
            .order('id_chofer', { ascending: true });

        if (error) throw new Error('Error al obtener los choferes: ' + error.message);
        return data || [];
    },

    /// Crea un nuevo chofer: inserta en 'usuarios' y luego en 'choferes'
    async crearChofer({ usuario, contrasenaHash, nombre, idVehiculo, horario, sectorAsignado }) {
        // 1. Crear el usuario base con rol 'chofer'
        const { data: usuarioCreado, error: errUsuario } = await _supabase
            .from('usuarios')
            .insert({ usuario, contrasena: contrasenaHash, rol: 'chofer' })
            .select('id_usuario')
            .single();

        if (errUsuario) throw new Error('Error al crear el usuario: ' + errUsuario.message);

        // 2. Crear el registro de chofer asociado
        const { error: errChofer } = await _supabase
            .from('choferes')
            .insert({
                id_usuario: usuarioCreado.id_usuario,
                nombre,
                id_vehiculo: idVehiculo || null,
                horario: horario || null,
                sector_asignado: sectorAsignado || null
            });

        if (errChofer) throw new Error('Error al crear el chofer: ' + errChofer.message);
    },

    /// Actualiza los datos de un chofer existente
    async actualizarChofer(idChofer, cambios) {
        const { error } = await _supabase
            .from('choferes')
            .update(cambios)
            .eq('id_chofer', idChofer);

        if (error) throw new Error('Error al actualizar el chofer: ' + error.message);
    },

    /// Elimina un chofer (también elimina su usuario por ON DELETE CASCADE)
    async eliminarChofer(idUsuario) {
        const { error } = await _supabase
            .from('usuarios')
            .delete()
            .eq('id_usuario', idUsuario);

        if (error) throw new Error('Error al eliminar el chofer: ' + error.message);
    },

    // REPORTES CIUDADANOS

    /// Obtiene los reportes ciudadanos junto con el nombre del ciudadano
    async obtenerReportes() {
        const { data, error } = await _supabase
            .from('reportes_ciudadanos')
            .select(`
                id_reporte,
                descripcion,
                latitud,
                longitud,
                evidencia_foto,
                fecha,
                estado,
                id_usuario,
                ciudadanos ( nombre ),
                choferes ( nombre )
            `)
            .order('fecha', { ascending: false });

        if (error) throw new Error('Error al obtener los reportes: ' + error.message);
        return data || [];
    },

    /// Marca un reporte como atendido
    async marcarReporteAtendido(idReporte) {
        const { error } = await _supabase
            .from('reportes_ciudadanos')
            .update({ estado: 'Atendido' })
            .eq('id_reporte', idReporte);

        if (error) throw new Error('Error al actualizar el reporte: ' + error.message);
    },

    async obtenerIncidencias() {
        const { data, error } = await _supabase
            .from('incidencias')
            .select(`
            id_incidencia,
            descripcion,
            fecha_hora,
            id_vehiculo,
            vehiculos ( placa, estado )
        `)
            .order('fecha_hora', { ascending: false })
            .limit(50);

        if (error) throw new Error('Error al obtener las incidencias: ' + error.message);
        return data || [];
    },

    /// Escucha incidencias nuevas en tiempo real
    escucharIncidencias(callback) {
        return _supabase
            .channel('admin-incidencias')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incidencias' }, callback)
            .subscribe();
    },

    /// Obtiene los puntos de recorrido de un vehículo en una fecha dada
    async obtenerHistorialVehiculo(idVehiculo, fecha) {
        // Construimos el rango del día completo en UTC
        const inicio = new Date(fecha);
        inicio.setHours(0, 0, 0, 0);
        const fin = new Date(fecha);
        fin.setHours(23, 59, 59, 999);

        const { data, error } = await _supabase
            .from('historial_ubicaciones')
            .select('latitud, longitud, fecha_hora')
            .eq('id_vehiculo', idVehiculo)
            .gte('fecha_hora', inicio.toISOString())
            .lte('fecha_hora', fin.toISOString())
            .order('fecha_hora', { ascending: true });

        if (error) throw new Error('Error al obtener el historial: ' + error.message);
        return data || [];
    },

    /// Actualiza datos de un chofer
    async actualizarChofer(idUsuario, cambios) {
        const { error } = await _supabase
            .from('choferes')
            .update(cambios)
            .eq('id_usuario', idUsuario);

        if (error) throw new Error('Error al actualizar el chofer: ' + error.message);
    },

    async obtenerInspecciones() {
        try {
            // Hacemos un select anidado para traer el nombre del chofer y la placa del vehículo
            const { data, error } = await _supabase
                .from('inspecciones_vehiculos')
                .select(`
                    id_inspeccion,
                    tipo_registro,
                    kilometraje,
                    nivel_combustible,
                    estado_mecanico,
                    observaciones,
                    foto_tablero,
                    fecha_hora,
                    vehiculos ( placa ),
                    choferes ( nombre )
                `)
                .order('fecha_hora', { ascending: false });

            if (error) {
                throw error;
            }
            return data;
        } catch (error) {
            console.error('Error al obtener el historial de inspecciones:', error.message);
            return [];
        }
    },
};