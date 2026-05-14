// =====================================================
// CLIENTE DE SUPABASE
// =====================================================
// Inicializa la conexión usando la configuración global.
// Este cliente se usa desde auth.js, savings.js y admin.js

const { createClient } = supabase;

const supabaseClient = createClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.publishableKey
);

console.log('✅ Supabase client inicializado'); 