import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 ===== INICIALIZANDO SUPABASE =====');
console.log('   URL:', supabaseUrl);
console.log('   Key existe?', !!supabaseKey);
console.log('   Key length:', supabaseKey?.length || 0);

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis de ambiente não configuradas!');
  throw new Error('Configuração do Supabase incompleta');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Supabase Client inicializado');
console.log('=====================================\n');

export async function saveQRToSupabase(tenantId, qrCode) {
  console.log('📝 Salvando QR Code para tenant:', tenantId);
  
  try {
    const { data: existing } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .update({
          qr_code: qrCode,
          status: 'qr_code_ready',
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .select();
      
      if (error) throw error;
      result = data;
      console.log('✅ QR Code atualizado');
    } else {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .insert({
          tenant_id: tenantId,
          qr_code: qrCode,
          status: 'qr_code_ready',
          updated_at: new Date().toISOString()
        })
        .select();
      
      if (error) throw error;
      result = data;
      console.log('✅ QR Code inserido');
    }
    
    return result;
  } catch (err) {
    console.error('❌ Erro ao salvar QR Code:', err);
    throw err;
  }
}

export async function updateSessionStatus(tenantId, status) {
  console.log(`📊 Atualizando status: ${tenantId} → ${status}`);
  
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .update({
        status: status,
        updated_at: new Date().toISOString(),
        ...(status === 'connected' && { qr_code: null })
      })
      .eq('tenant_id', tenantId)
      .select();

    if (error) throw error;
    console.log('✅ Status atualizado');
    return data;
  } catch (err) {
    console.error('❌ Erro ao atualizar status:', err);
    throw err;
  }
}
