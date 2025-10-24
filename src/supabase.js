import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SALVAR SESSÃO COMPLETA
export async function saveSessionToSupabase(sessionState) {
  try {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ 
        session_data: sessionState,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) throw error;
    console.log('✅ Sessão salva no Supabase');
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar sessão:', error);
    return false;
  }
}

// CARREGAR SESSÃO DO SUPABASE
export async function loadSessionFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('session_data')
      .eq('id', 1)
      .single();

    if (error) throw error;

    if (data?.session_data) {
      console.log('✅ Sessão carregada do Supabase');
      return data.session_data;
    }

    console.log('⚠️ Nenhuma sessão salva encontrada');
    return null;
  } catch (error) {
    console.error('❌ Erro ao carregar sessão:', error);
    return null;
  }
}

// LIMPAR SESSÃO (após logout)
export async function clearSessionFromSupabase() {
  try {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ 
        session_data: null,
        status: 'disconnected',
        qr_code: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) throw error;
    console.log('✅ Sessão limpa');
    return true;
  } catch (error) {
    console.error('❌ Erro ao limpar sessão:', error);
    return false;
  }
}

// SALVAR QR CODE
export async function saveQRToSupabase(qrCode, status) {
  try {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ 
        qr_code: qrCode,
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar QR:', error);
    return false;
  }
}

// ATUALIZAR STATUS
export async function updateStatusInSupabase(status) {
  try {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', 1);

    if (error) throw error;
    console.log(`✅ Status atualizado: ${status}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao atualizar status:', error);
    return false;
  }
}

// Função para pegar o status do banco
export async function getStatusFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('status')
      .eq('id', 1)
      .single();

    if (error) throw error;
    
    return data?.status || 'disconnected';
  } catch (error) {
    console.error('❌ Erro ao buscar status:', error);
    return 'disconnected';
  }
}
