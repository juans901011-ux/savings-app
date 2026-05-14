// =====================================================
// SAVINGS.JS - Lógica del dashboard del usuario
// =====================================================

let currentUser = null;
let hasInitialSaving = false;

// -----------------------------------------------------
// INICIALIZACIÓN DEL DASHBOARD
// -----------------------------------------------------
async function initDashboard() {
  // Verificar sesión activa
  const session = await checkSession();
  
  if (!session) {
    console.log('❌ Sin sesión, redirigiendo a login');
    window.location.href = 'login.html';
    return;
  }
  
  // Obtener profile del usuario
  currentUser = await getCurrentUserProfile();
  
  if (!currentUser) {
    alert('Error cargando tu perfil. Por favor inicia sesión de nuevo.');
    window.location.href = 'login.html';
    return;
  }
  
  console.log('✅ Usuario cargado:', currentUser.nickname);
  
  // Mostrar nickname en header
  document.getElementById('user-nickname').textContent = currentUser.nickname;
  
  // Cargar datos
  await loadDashboardData();
  
  // Ocultar loader, mostrar contenido
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  
  // Pre-rellenar fecha del periodo con hoy
  document.getElementById('recurring-date').valueAsDate = new Date();
  
  // Listeners de formularios
  document.getElementById('initial-form').addEventListener('submit', handleInitialSubmit);
  document.getElementById('recurring-form').addEventListener('submit', handleRecurringSubmit);
}

// -----------------------------------------------------
// CARGAR DATOS DEL DASHBOARD
// -----------------------------------------------------
async function loadDashboardData() {
  try {
    // Cargar ahorro inicial
    const { data: initial } = await supabaseClient
      .from('initial_savings')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    
    // Cargar ahorros recurrentes
    const { data: recurring, error: recError } = await supabaseClient
      .from('recurring_savings')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('period_date', { ascending: false });
    
    if (recError) throw recError;
    
    // Actualizar UI
    updateInitialUI(initial);
    updateRecurringUI(recurring || []);
    updateSummary(initial, recurring || []);
    
  } catch (err) {
    console.error('❌ Error cargando datos:', err);
  }
}

// -----------------------------------------------------
// ACTUALIZAR UI DE AHORRO INICIAL
// -----------------------------------------------------
function updateInitialUI(initial) {
  const section = document.getElementById('initial-section');
  
  if (initial) {
    hasInitialSaving = true;
    section.classList.add('hidden'); // Ocultar form, ya lo registró
    document.getElementById('initial-amount').textContent = 
      formatCurrency(initial.amount, initial.currency);
  } else {
    hasInitialSaving = false;
    section.classList.remove('hidden'); // Mostrar form para registrar
    document.getElementById('initial-amount').textContent = '$0';
  }
}

// -----------------------------------------------------
// ACTUALIZAR UI DE AHORROS RECURRENTES
// -----------------------------------------------------
function updateRecurringUI(recurring) {
  const body = document.getElementById('history-body');
  const empty = document.getElementById('history-empty');
  const container = document.getElementById('history-container');
  
  if (recurring.length === 0) {
    empty.classList.remove('hidden');
    container.classList.add('hidden');
    return;
  }
  
  empty.classList.add('hidden');
  container.classList.remove('hidden');
  
  body.innerHTML = recurring.map(r => `
    <tr class="border-b border-gray-700 hover:bg-gray-750">
      <td class="py-3 px-3">${formatDate(r.period_date)}</td>
      <td class="py-3 px-3">${translateFrequency(r.frequency)}</td>
      <td class="py-3 px-3 text-right font-semibold">${formatCurrency(r.amount, r.currency)}</td>
      <td class="py-3 px-3 text-gray-400">${r.currency}</td>
      <td class="py-3 px-3 text-gray-400 text-xs hidden md:table-cell">${formatDate(r.created_at)}</td>
    </tr>
  `).join('');
}

// -----------------------------------------------------
// ACTUALIZAR TARJETAS DE RESUMEN
// -----------------------------------------------------
function updateSummary(initial, recurring) {
  // Por simplicidad sumamos todo en la moneda principal del registro
  // (en Fase 2 implementaremos conversión real)
  const initialAmount = initial ? parseFloat(initial.amount) : 0;
  const recurringTotal = recurring.reduce((sum, r) => sum + parseFloat(r.amount), 0);
  const total = initialAmount + recurringTotal;
  
  const currency = initial?.currency || recurring[0]?.currency || 'USD';
  
  document.getElementById('recurring-total').textContent = formatCurrency(recurringTotal, currency);
  document.getElementById('recurring-count').textContent = `${recurring.length} aporte${recurring.length !== 1 ? 's' : ''}`;
  document.getElementById('total-saved').textContent = formatCurrency(total, currency);
}

// -----------------------------------------------------
// REGISTRAR AHORRO INICIAL
// -----------------------------------------------------
async function handleInitialSubmit(event) {
  event.preventDefault();
  
  const btn = document.getElementById('initial-submit');
  const msg = document.getElementById('initial-message');
  
  const amount = parseFloat(document.getElementById('initial-amount-input').value);
  const currency = document.getElementById('initial-currency').value;
  
  btn.disabled = true;
  btn.textContent = 'Registrando...';
  
  try {
    const { error } = await supabaseClient
      .from('initial_savings')
      .insert({
        user_id: currentUser.id,
        amount: amount,
        currency: currency
      });
    
    if (error) throw error;
    
    showMessage(msg, '✅ Ahorro inicial registrado', 'success');
    setTimeout(() => loadDashboardData(), 500);
    
  } catch (err) {
    console.error('❌ Error:', err);
    showMessage(msg, 'Error: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Registrar';
  }
}

// -----------------------------------------------------
// REGISTRAR AHORRO RECURRENTE
// -----------------------------------------------------
async function handleRecurringSubmit(event) {
  event.preventDefault();
  
  const btn = document.getElementById('recurring-submit');
  const msg = document.getElementById('recurring-message');
  
  const amount = parseFloat(document.getElementById('recurring-amount').value);
  const currency = document.getElementById('recurring-currency').value;
  const frequency = document.getElementById('recurring-frequency').value;
  const periodDate = document.getElementById('recurring-date').value;
  
  btn.disabled = true;
  btn.textContent = 'Registrando...';
  
  try {
    const { error } = await supabaseClient
      .from('recurring_savings')
      .insert({
        user_id: currentUser.id,
        amount: amount,
        currency: currency,
        frequency: frequency,
        period_date: periodDate
      });
    
    if (error) throw error;
    
    showMessage(msg, '✅ Ahorro registrado correctamente', 'success');
    
    // Limpiar formulario
    document.getElementById('recurring-amount').value = '';
    document.getElementById('recurring-date').valueAsDate = new Date();
    
    // Recargar datos
    setTimeout(() => loadDashboardData(), 500);
    
  } catch (err) {
    console.error('❌ Error:', err);
    showMessage(msg, 'Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Registrar ahorro';
  }
}

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------

function formatCurrency(amount, currency = 'USD') {
  const num = parseFloat(amount);
  if (isNaN(num)) return '$0';
  
  const formatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
  
  return formatter.format(num);
}

function formatDate(dateString) {
  if (!dateString) return '-';
  const d = new Date(dateString);
  return d.toLocaleDateString('es-CO', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function translateFrequency(freq) {
  const map = {
    'weekly': '🗓️ Semanal',
    'biweekly': '📅 Quincenal',
    'monthly': '🗓️ Mensual'
  };
  return map[freq] || freq;
}

// -----------------------------------------------------
// AUTO-INICIO si estamos en dashboard.html
// -----------------------------------------------------
if (document.getElementById('main-content')) {
  document.addEventListener('DOMContentLoaded', initDashboard);
}   