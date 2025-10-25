import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function saveSessionToSupabase(tenantId, sessionData) {
  try {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .upsert({
        tenant_id: tenantId,
        session_data: sessionData,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id'
      });

    if (error) {
      console.error('❌ Erro ao salvar sessão no Supabase:', error);
      throw error;
    }
    console.log(`✅ Sessão salva no Supabase para tenant ${tenantId}`);
  } catch (error) {
    console.error('❌ Erro ao salvar sessão:', error);
    throw error;
  }
}

export async function loadSessionFromSupabase(tenantId) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('session_data')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao carregar sessão do Supabase:', error);
      return null;
    }

    if (data?.session_data) {
      console.log(`✅ Sessão carregada do Supabase para tenant ${tenantId}`);
      return data.session_data;
    }

    console.log(`ℹ️ Nenhuma sessão encontrada para tenant ${tenantId}`);
    return null;
  } catch (error) {
    console.error('❌ Erro ao carregar sessão:', error);
    return null;
  }
}

export async function updateStatusInSupabase(tenantId, status) {
  try {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .upsert({
        tenant_id: tenantId,
        status: status,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id'
      });

    if (error) {
      console.error('❌ Erro ao atualizar status:', error);
      throw error;
    }
    console.log(`✅ Status atualizado para "${status}" (tenant ${tenantId})`);
  } catch (error) {
    console.error('❌ Erro ao atualizar status:', error);
    throw error;
  }
}

export async function saveQRToSupabase(tenantId, qrCode) {
  try {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .upsert({
        tenant_id: tenantId,
        qr_code: qrCode,
        status: 'qr',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id'
      });

    if (error) {
      console.error('❌ Erro ao salvar QR Code:', error);
      throw error;
    }
    console.log(`✅ QR Code salvo para tenant ${tenantId}`);
  } catch (error) {
    console.error('❌ Erro ao salvar QR Code:', error);
    throw error;
  }
}

export async function clearSessionFromSupabase(tenantId) {
  try {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({
        session_data: null,
        qr_code: null,
        status: 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('❌ Erro ao limpar sessão:', error);
      throw error;
    }
    console.log(`✅ Sessão limpa para tenant ${tenantId}`);
  } catch (error) {
    console.error('❌ Erro ao limpar sessão:', error);
    throw error;
  }
}

export async function getStatusFromSupabase(tenantId) {
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('status')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao buscar status:', error);
      return 'disconnected';
    }

    return data?.status || 'disconnected';
  } catch (error) {
    console.error('❌ Erro ao buscar status:', error);
    return 'disconnected';
  }
}
