// =====================================================
// ADMIN.JS - Lógica del panel admin
// =====================================================

let allUsers = []; // Cache para la búsqueda

// -----------------------------------------------------
// INICIALIZACIÓN
// -----------------------------------------------------
async function initAdmin() {
  // Verificar sesión
  const session = await checkSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }
  
  // Verificar que sea admin
  const profile = await getCurrentUserProfile();
  
  if (!profile || profile.role !== 'admin') {
    document.getElementById('loader').classList.add('hidden');
    document.getElementById('no-access').classList.remove('hidden');
    console.warn('⚠️ Acceso denegado: usuario no es admin');
    return;
  }
  
  document.getElementById('admin-nickname').textContent = profile.nickname;
  console.log('✅ Admin autenticado:', profile.nickname);
  
  // Cargar datos
  await loadAdminData();
  
  // Mostrar contenido
  document.getElementById('loader').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  
  // Listeners
  document.getElementById('refresh-btn').addEventListener('click', loadAdminData);
  document.getElementById('search-input').addEventListener('input', handleSearch);
}

// -----------------------------------------------------
// CARGAR TODOS LOS DATOS
// -----------------------------------------------------
async function loadAdminData() {
  try {
    // Cargar las 4 vistas en paralelo (más rápido)
    const [usersResult, countryResult, genderResult, ageResult] = await Promise.all([
      supabaseClient.from('user_savings_summary').select('*').order('total_saved', { ascending: false }),
      supabaseClient.from('savings_by_country').select('*'),
      supabaseClient.from('savings_by_gender').select('*'),
      supabaseClient.from('savings_by_age_range').select('*')
    ]);
    
    if (usersResult.error) throw usersResult.error;
    if (countryResult.error) throw countryResult.error;
    if (genderResult.error) throw genderResult.error;
    if (ageResult.error) throw ageResult.error;
    
    allUsers = usersResult.data || [];
    
    // Renderizar
    renderKPIs(allUsers);
    renderUsersTable(allUsers);
    renderSegment('by-country', countryResult.data, 'country');
    renderSegment('by-gender', genderResult.data, 'gender', translateGender);
    renderSegment('by-age', ageResult.data, 'age_range');
    
    console.log('✅ Datos cargados:', allUsers.length, 'usuarios');
    
  } catch (err) {
    console.error('❌ Error cargando datos:', err);
    alert('Error cargando datos: ' + err.message);
  }
}

// -----------------------------------------------------
// RENDERIZAR KPIs
// -----------------------------------------------------
function renderKPIs(users) {
  const totalUsers = users.length;
  const usersWithSavings = users.filter(u => parseFloat(u.total_saved) > 0).length;
  const totalSaved = users.reduce((sum, u) => sum + parseFloat(u.total_saved || 0), 0);
  const totalDeposits = users.reduce((sum, u) => sum + parseInt(u.recurring_count || 0), 0);
  const avg = usersWithSavings > 0 ? totalSaved / usersWithSavings : 0;
  
  document.getElementById('kpi-users').textContent = totalUsers;
  document.getElementById('kpi-users-with-savings').textContent = `${usersWithSavings} con ahorros`;
  document.getElementById('kpi-total').textContent = formatCurrency(totalSaved);
  document.getElementById('kpi-avg').textContent = formatCurrency(avg);
  document.getElementById('kpi-deposits').textContent = totalDeposits;
}

// -----------------------------------------------------
// RENDERIZAR TABLA DE USUARIOS
// -----------------------------------------------------
function renderUsersTable(users) {
  const body = document.getElementById('users-body');
  
  if (users.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-8 text-gray-400">
          No hay usuarios registrados aún
        </td>
      </tr>
    `;
    return;
  }
  
  body.innerHTML = users.map(u => `
    <tr class="border-b border-gray-700 hover:bg-gray-750 transition-colors">
      <td class="py-3 px-3 font-medium">${u.nickname || '-'}</td>
      <td class="py-3 px-3 text-gray-300">${u.country || '-'}</td>
      <td class="py-3 px-3 text-gray-300 hidden md:table-cell">${translateGender(u.gender)}</td>
      <td class="py-3 px-3 text-center text-gray-300 hidden md:table-cell">${u.age || '-'}</td>
      <td class="py-3 px-3 text-right">${formatCurrency(u.initial_amount)}</td>
      <td class="py-3 px-3 text-right">${formatCurrency(u.recurring_total)}</td>
      <td class="py-3 px-3 text-right font-bold text-green-400">${formatCurrency(u.total_saved)}</td>
      <td class="py-3 px-3 text-center hidden md:table-cell">${u.recurring_count || 0}</td>
      <td class="py-3 px-3 text-gray-400 text-xs hidden lg:table-cell">${formatDate(u.last_saving_date)}</td>
    </tr>
  `).join('');
}

// -----------------------------------------------------
// RENDERIZAR SEGMENTACIONES (país, género, edad)
// -----------------------------------------------------
function renderSegment(containerId, data, labelKey, translator = null) {
  const container = document.getElementById(containerId);
  
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm">Sin datos aún</p>';
    return;
  }
  
  // Encontrar el máximo para la barra de progreso
  const maxTotal = Math.max(...data.map(d => parseFloat(d.total_saved || 0)));
  
  container.innerHTML = data.map(item => {
    const total = parseFloat(item.total_saved || 0);
    const percentage = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
    const label = translator ? translator(item[labelKey]) : item[labelKey];
    
    return `
      <div class="space-y-1">
        <div class="flex justify-between text-sm">
          <span class="font-medium">${label}</span>
          <span class="text-gray-400">${item.user_count} usuario${item.user_count !== 1 ? 's' : ''}</span>
        </div>
        <div class="relative bg-gray-700 rounded-full h-2 overflow-hidden">
          <div class="absolute h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" 
               style="width: ${percentage}%"></div>
        </div>
        <p class="text-xs text-gray-400">${formatCurrency(total)} • promedio ${formatCurrency(item.avg_per_user)}</p>
      </div>
    `;
  }).join('');
}

// -----------------------------------------------------
// BÚSQUEDA EN TABLA
// -----------------------------------------------------
function handleSearch(event) {
  const query = event.target.value.toLowerCase().trim();
  
  if (!query) {
    renderUsersTable(allUsers);
    return;
  }
  
  const filtered = allUsers.filter(u => 
    (u.nickname || '').toLowerCase().includes(query) ||
    (u.country || '').toLowerCase().includes(query)
  );
  
  renderUsersTable(filtered);
}

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------

function formatCurrency(amount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num === 0) return '$0';
  
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(num);
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

function translateGender(gender) {
  const map = {
    'masculino': '♂️ Masculino',
    'femenino': '♀️ Femenino',
    'otro': '⚧ Otro',
    'prefiero_no_decir': '🤐 N/A'
  };
  return map[gender] || gender || '-';
}

// -----------------------------------------------------
// AUTO-INICIO si estamos en admin.html
// -----------------------------------------------------
if (document.getElementById('admin-nickname')) {
  document.addEventListener('DOMContentLoaded', initAdmin);
}