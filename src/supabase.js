import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function updateWhatsAppStatus(status, qrCode = null) {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .upsert({
      id: 1,
      status: status,
      qr_code: qrCode,
      updated_at: new Date().toISOString(),
    });
  
  if (error) console.error('❌ Error updating status:', error);
  else console.log(`✅ Status updated to: ${status}`);
}

export async function saveAuthState(authState) {
  const { error } = await supabase
    .from('whatsapp_sessions')
    .upsert({
      id: 1,
      session_data: authState,
      updated_at: new Date().toISOString(),
    });
  
  if (error) console.error('❌ Error saving auth:', error);
}

export async function loadAuthState() {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('session_data')
    .eq('id', 1)
    .maybeSingle();
  
  if (error) {
    console.error('❌ Error loading auth:', error);
    return null;
  }
  
  return data?.session_data;
}

export async function findOrCreateClient(phoneNumber, name) {
  // Buscar cliente existente
  let { data: client } = await supabase
    .from('clients')
    .select('id, tenant_id')
    .eq('phone', phoneNumber)
    .maybeSingle();
  
  if (!client) {
    // Buscar primeiro tenant
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .limit(1)
      .single();
    
    if (!tenant) throw new Error('No tenant found');
    
    // Criar novo cliente
    const { data: newClient, error } = await supabase
      .from('clients')
      .insert({
        tenant_id: tenant.id,
        phone: phoneNumber,
        name: name || phoneNumber,
      })
      .select()
      .single();
    
    if (error) throw error;
    client = newClient;
  }
  
  return client;
}

export async function saveMessage(tenantId, clientId, body, direction) {
  const { error } = await supabase
    .from('messages')
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      body: body,
      direction: direction,
    });
  
  if (error) throw error;
}

export async function callChatAssistant(clientId, message, tenantId) {
  const { data, error } = await supabase.functions.invoke('chat-assistant', {
    body: { client_id: clientId, message: message, tenant_id: tenantId },
  });
  
  if (error) throw error;
  return data;
}

export default supabase;
