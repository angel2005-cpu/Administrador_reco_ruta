import { _supabase } from './supabase.js';

export const authService = {
    async iniciarSesion(usuario, password) {
        // Consultamos la tabla usuarios
        const { data: respuesta, error } = await _supabase
            .from('usuarios')
            .select('id_usuario, rol, contrasena')
            .eq('usuario', usuario);

        if (error) throw new Error('Error al conectar con la base de datos: ' + error.message);
        if (!respuesta || respuesta.length === 0) throw new Error('El usuario ingresado no existe.');

        const datosUsuario = respuesta[0];

        // Resolución dinámica de la librería BCrypt instalada
        const bcryptObj = (typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt) ? dcodeIO.bcrypt : window.bcrypt;
        if (!bcryptObj) throw new Error('Error interno: Encriptación no disponible.');

        // Comparación de contraseñas
        const passwordCorrecta = bcryptObj.compareSync(password, datosUsuario.contrasena);
        if (!passwordCorrecta) throw new Error('La contraseña ingresada es incorrecta.');

        // Restricción de privilegios
        if (datosUsuario.rol !== 'admin') {
            throw new Error('Acceso denegado. Este panel es exclusivo para administradores.');
        }

        // Persistencia del estado (Equivalente a SharedPreferences)
        localStorage.setItem('esta_logueado', 'true');
        localStorage.setItem('id_usuario', datosUsuario.id_usuario);
        localStorage.setItem('rol', datosUsuario.rol);

        return datosUsuario;
    },

    cerrarSesion() {
        localStorage.clear();
        window.location.href = 'index.html';
    },

    verificarSesion() {
        if (localStorage.getItem('esta_logueado') !== 'true' || localStorage.getItem('rol') !== 'admin') {
            window.location.href = 'index.html';
        }
    }
};