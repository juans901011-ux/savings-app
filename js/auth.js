// =====================================================
// AUTH.JS - Lógica de registro, login y logout
// =====================================================

// -----------------------------------------------------
// REGISTRO DE USUARIO
// -----------------------------------------------------
async function handleRegister(event) {
  event.preventDefault();
  
  const form = event.target;
  const submitBtn = document.getElementById('submit-btn');
  const messageEl = document.getElementById('message');
  
  // Recolectar valores del formulario
  const email = form.email.value.trim();
  const password = form.password.value;
  const nickname = form.nickname.value.trim().toLowerCase();
  const birthDate = form.birth_date.value;
  const gender = form.gender.value;
  const country = form.country.value;
  
  // Validación de edad mínima (18 años)
  const age = calculateAge(birthDate);
  if (age < 18) {
    showMessage(messageEl, 'Debes ser mayor de 18 años para registrarte', 'error');
    return;
  }
  
  // Deshabilitar botón mientras se procesa
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creando cuenta...';
  showMessage(messageEl, '', 'hidden');
  
  try {
    // Llamada a Supabase Auth con metadata
    // El trigger handle_new_user creará automáticamente
    // la fila en la tabla profiles con estos datos
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          nickname: nickname,
          birth_date: birthDate,
          gender: gender,
          country: country
        }
      }
    });
    
    if (error) throw error;
    
    // Éxito
    console.log('✅ Usuario registrado:', data);
    showMessage(messageEl, '¡Cuenta creada exitosamente! Redirigiendo...', 'success');
    
    // Redirigir al dashboard tras 1.5 seg
    setTimeout(() => {
      window.location.href = 'dashboard.html';
    }, 1500);
    
  } catch (err) {
    console.error('❌ Error en registro:', err);
    
    // Mensajes amigables según el tipo de error
    let userMessage = 'Error al crear la cuenta. Intenta de nuevo.';
    
    if (err.message.includes('already registered') || err.message.includes('already exists')) {
      userMessage = 'Este email ya está registrado. Intenta iniciar sesión.';
    } else if (err.message.includes('duplicate key value') && err.message.includes('nickname')) {
      userMessage = 'Ese nickname ya está en uso. Elige otro.';
    } else if (err.message.includes('Password')) {
      userMessage = 'La contraseña no cumple los requisitos mínimos (8+ caracteres).';
    } else if (err.message.includes('email')) {
      userMessage = 'Email inválido. Verifica el formato.';
    }
    
    showMessage(messageEl, userMessage, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Crear cuenta';
  }
}

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------

// Calcula la edad a partir de la fecha de nacimiento
function calculateAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

// Muestra mensajes con estilos según el tipo
function showMessage(element, text, type) {
  if (type === 'hidden' || !text) {
    element.classList.add('hidden');
    return;
  }
  
  element.classList.remove('hidden', 'bg-red-900', 'bg-green-900', 'text-red-300', 'text-green-300');
  
  if (type === 'success') {
    element.classList.add('bg-green-900', 'text-green-300');
  } else if (type === 'error') {
    element.classList.add('bg-red-900', 'text-red-300');
  }
  
  element.textContent = text;
}

// -----------------------------------------------------
// LOGIN DE USUARIO
// -----------------------------------------------------
async function handleLogin(event) {
  event.preventDefault();
  
  const form = event.target;
  const submitBtn = document.getElementById('submit-btn');
  const messageEl = document.getElementById('message');
  
  const email = form.email.value.trim();
  const password = form.password.value;
  
  // Deshabilitar botón mientras se procesa
  submitBtn.disabled = true;
  submitBtn.textContent = 'Iniciando sesión...';
  showMessage(messageEl, '', 'hidden');
  
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) throw error;
    
    console.log('✅ Sesión iniciada:', data.user.email);
    showMessage(messageEl, '¡Bienvenido! Redirigiendo...', 'success');
    
    // Detectar si es admin para redirigir al lugar correcto
    const { data: profileData } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();
    
    setTimeout(() => {
      if (profileData?.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'dashboard.html';
      }
    }, 1000);
    
  } catch (err) {
    console.error('❌ Error en login:', err);
    
    let userMessage = 'Error al iniciar sesión. Intenta de nuevo.';
    
    if (err.message.includes('Invalid login credentials')) {
      userMessage = 'Email o contraseña incorrectos.';
    } else if (err.message.includes('Email not confirmed')) {
      userMessage = 'Debes confirmar tu email antes de iniciar sesión.';
    } else if (err.message.includes('Too many requests')) {
      userMessage = 'Demasiados intentos. Espera unos minutos.';
    }
    
    showMessage(messageEl, userMessage, 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Iniciar sesión';
  }
}

// -----------------------------------------------------
// LOGOUT (para usar en dashboard y admin)
// -----------------------------------------------------
async function handleLogout() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    
    console.log('✅ Sesión cerrada');
    window.location.href = 'login.html';
  } catch (err) {
    console.error('❌ Error al cerrar sesión:', err);
    alert('Error al cerrar sesión: ' + err.message);
  }
}

// -----------------------------------------------------
// VERIFICAR SESIÓN ACTIVA (para proteger rutas)
// -----------------------------------------------------
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

// -----------------------------------------------------
// OBTENER USUARIO ACTUAL CON SU PROFILE COMPLETO
// -----------------------------------------------------
async function getCurrentUserProfile() {
  const session = await checkSession();
  if (!session) return null;
  
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();
  
  if (error) {
    console.error('Error obteniendo profile:', error);
    return null;
  }
  
  return { ...data, email: session.user.email };
}

// -----------------------------------------------------
// INICIALIZACIÓN
// -----------------------------------------------------
// -----------------------------------------------------
// INICIALIZACIÓN
// -----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  // Formulario de registro
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
    console.log('✅ Formulario de registro inicializado');
  }
  
  // Formulario de login
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
    console.log('✅ Formulario de login inicializado');
  }
  
  // Botón de logout (cuando exista en dashboard/admin)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
});