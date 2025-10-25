import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔧 ===== INICIALIZANDO SUPABASE CLIENT =====');
console.log('   URL:', supabaseUrl);
console.log('   Key existe?', !!supabaseKey);
console.log('   Key length:', supabaseKey?.length || 0);
console.log('   Key prefix:', supabaseKey?.substring(0, 20) + '...');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO CRÍTICO: Variáveis de ambiente não configuradas!');
  console.error('   SUPABASE_URL:', supabaseUrl || 'MISSING');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'EXISTS' : 'MISSING');
  throw new Error('❌ Configuração do Supabase incompleta');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('✅ Supabase Client inicializado com sucesso');
console.log('=========================================\n');

// Função para salvar QR Code no Supabase
export async function saveQRToSupabase(tenantId, qrCode) {
  console.log('📝 ===== SALVANDO QR CODE =====');
  console.log('   Tenant ID:', tenantId);
  console.log('   QR Code length:', qrCode?.length || 0);
  
  try {
    // Primeiro, verificar se já existe um registro para este tenant
    const { data: existing, error: selectError } = await supabase
      .from('whatsapp_sessions')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (selectError) {
      console.error('❌ Erro ao verificar registro existente:', selectError);
      throw selectError;
    }

    console.log('   Registro existente?', !!existing);

    let result;

    if (existing) {
      // UPDATE - registro já existe
      console.log('   Executando UPDATE...');
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .update({
          qr_code: qrCode,
          status: 'qr_code_ready',
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .select();

      if (error) {
        console.error('❌ Erro no UPDATE:', error);
        throw error;
      }

      result = data;
      console.log('✅ UPDATE executado com sucesso');
    } else {
      // INSERT - criar novo registro
      console.log('   Executando INSERT...');
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .insert({
          tenant_id: tenantId,
          qr_code: qrCode,
          status: 'qr_code_ready',
          updated_at: new Date().toISOString()
        })
        .select();

      if (error) {
        console.error('❌ Erro no INSERT:', error);
        throw error;
      }

      result = data;
      console.log('✅ INSERT executado com sucesso');
    }

    console.log('   Resultado:', JSON.stringify(result, null, 2));
    console.log('================================\n');
    
    return result;
  } catch (err) {
    console.error('❌ EXCEÇÃO ao salvar QR Code:', err);
    console.error('   Stack:', err.stack);
    console.log('================================\n');
    throw err;
  }
}

// Função para atualizar status da sessão
export async function updateSessionStatus(tenantId, status) {
  console.log(`📊 Atualizando status para tenant ${tenantId}: ${status}`);
  
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

    if (error) {
      console.error('❌ Erro ao atualizar status:', error);
      throw error;
    }

    console.log('✅ Status atualizado:', data);
    return data;
  } catch (err) {
    console.error('❌ Exceção ao atualizar status:', err);
    throw err;
  }
}

// Função para carregar sessão do Supabase
export async function loadSessionFromSupabase(tenantId) {
  console.log(`📂 Carregando sessão para tenant: ${tenantId}`);
  
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('session_data')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao carregar sessão:', error);
      throw error;
    }

    if (data?.session_data) {
      console.log('✅ Sessão encontrada no banco de dados');
      return data.session_data;
    }

    console.log('ℹ️  Nenhuma sessão encontrada');
    return null;
  } catch (err) {
    console.error('❌ Exceção ao carregar sessão:', err);
    throw err;
  }
}

// Função para salvar dados da sessão
export async function saveSessionToSupabase(tenantId, sessionData) {
  console.log(`💾 Salvando dados da sessão para tenant: ${tenantId}`);
  
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .update({
        session_data: sessionData,
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId)
      .select();

    if (error) {
      console.error('❌ Erro ao salvar sessão:', error);
      throw error;
    }

    console.log('✅ Sessão salva com sucesso');
    return data;
  } catch (err) {
    console.error('❌ Exceção ao salvar sessão:', err);
    throw err;
  }
}
