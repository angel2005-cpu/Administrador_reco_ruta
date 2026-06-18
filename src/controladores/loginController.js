import { authService } from '../servicios/authService.js';

const loginForm = document.getElementById('loginForm');
const btnIngresar = document.getElementById('btnIngresar');
const mensajeError = document.getElementById('mensajeError');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Reseteamos estados previos
        mensajeError.classList.add('hidden');
        btnIngresar.innerText = 'Cargando...';
        btnIngresar.disabled = true;

        const usuarioInput = document.getElementById('usuario').value.trim();
        const passwordInput = document.getElementById('contrasena').value;

        try {
            await authService.iniciarSesion(usuarioInput, passwordInput);
            
            // Redirección exitosa
            window.location.href = 'panel.html';
        } catch (err) {
            mensajeError.innerText = err.message;
            mensajeError.classList.remove('hidden');
        } finally {
            btnIngresar.innerText = 'Iniciar Sesión';
            btnIngresar.disabled = false;
        }
    });
}