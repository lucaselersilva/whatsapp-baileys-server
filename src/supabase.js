import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 Inicializando Supabase Client:');
console.log('   URL:', supabaseUrl);
console.log('   Key exists:', !!supabaseKey);
console.log('   Key length:', supabaseKey?.length || 0);

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO CRÍTICO: Variáveis de ambiente do Supabase não configuradas!');
  console.error('   SUPABASE_URL:', supabaseUrl || 'MISSING');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'EXISTS' : 'MISSING');
  throw new Error('Configuração do Supabase incompleta - configure as variáveis de ambiente');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Supabase Client inicializado com sucesso');

/**
 * Salva o QR Code no Supabase para um tenant específico
 */
export async function saveQRToSupabase(tenantId, qrCode) {
  console.log('📝 Salvando QR Code no Supabase:', { 
    tenantId, 
    qrCodeLength: qrCode?.length,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Primeiro, verificar se já existe um registro
    const { data: existing, error: selectError } = await supabase
      .from('whatsapp_sessions')
      .select('id, tenant_id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (selectError) {
      console.error('❌ Erro ao verificar sessão existente:', selectError);
      throw selectError;
    }

    console.log('🔍 Sessão existente:', existing ? 'SIM' : 'NÃO');

    let result;
    
    if (existing) {
      // Atualizar registro existente
      console.log('🔄 Atualizando sessão existente...');
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
    } else {
      // Inserir novo registro
      console.log('➕ Inserindo nova sessão...');
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
    }
    
    console.log('✅ QR Code salvo com sucesso:', result);
    return result;
  } catch (err) {
    console.error('❌ Exceção ao salvar QR Code:', {
      error: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint
    });
    throw err;
  }
}

/**
 * Atualiza o status da sessão WhatsApp
 */
export async function updateSessionStatus(tenantId, status, sessionData = null) {
  console.log('🔄 Atualizando status da sessão:', { tenantId, status });
  
  try {
    const updateData = {
      status,
      updated_at: new Date().toISOString()
    };

    if (sessionData) {
      updateData.session_data = sessionData;
    }

    // Se o status for 'connected', limpar o QR code
    if (status === 'connected') {
      updateData.qr_code = null;
    }

    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .update(updateData)
      .eq('tenant_id', tenantId)
      .select();
    
    if (error) throw error;
    
    console.log('✅ Status atualizado com sucesso:', data);
    return data;
  } catch (err) {
    console.error('❌ Erro ao atualizar status:', err);
    throw err;
  }
}

/**
 * Carrega a sessão do Supabase
 */
export async function loadSessionFromSupabase(tenantId) {
  console.log('📥 Carregando sessão do Supabase para tenant:', tenantId);
  
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('session_data, status')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    
    if (error) throw error;
    
    console.log('✅ Sessão carregada:', data ? 'COM DADOS' : 'VAZIA');
    return data?.session_data || null;
  } catch (err) {
    console.error('❌ Erro ao carregar sessão:', err);
    return null;
  }
}

/**
 * Salva a sessão no Supabase
 */
export async function saveSessionToSupabase(tenantId, sessionData) {
  console.log('💾 Salvando sessão no Supabase para tenant:', tenantId);
  
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .update({
        session_data: sessionData,
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .select();
    
    if (error) throw error;
    
    console.log('✅ Sessão salva com sucesso');
    return data;
  } catch (err) {
    console.error('❌ Erro ao salvar sessão:', err);
    throw err;
  }
}
