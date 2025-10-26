import express from 'express';
import cors from 'cors';
import { initializeBaileys, disconnectSession, sendWhatsAppMessage, normalizePhoneNumber } from './baileys.js';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS - permitir requisições do Lovable
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Middleware
app.use(express.json());

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ ===== UNHANDLED REJECTION =====');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('Stack:', reason?.stack);
  console.error('==================================\n');
});

process.on('uncaughtException', (error) => {
  console.error('\n❌ ===== UNCAUGHT EXCEPTION =====');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('=================================\n');
  process.exit(1);
});

// ========== NOVA FUNÇÃO: Processar mensagem recebida com AI ==========
async function handleIncomingMessage({ tenantId, from, text, timestamp }) {
  console.log(`\n🤖 ===== PROCESSANDO MENSAGEM COM AI =====`);
  console.log(`   Tenant: ${tenantId}`);
  console.log(`   From: ${from}`);
  console.log(`   Text: ${text.substring(0, 100)}...`);
  
  try {
    // 1. Normalizar telefone (remover @s.whatsapp.net)
    const phoneNumber = normalizePhoneNumber(from);
    console.log(`   📞 Número normalizado: ${phoneNumber}`);

    // 2. Buscar ou criar cliente
    let { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('phone', phoneNumber)
      .maybeSingle();

    if (clientError) {
      console.error(`❌ Erro ao buscar cliente:`, clientError);
      throw clientError;
    }

    // Se cliente não existe, criar
    if (!client) {
      console.log(`   ➕ Cliente não encontrado, criando...`);
      const { data: newClient, error: createError } = await supabase
        .from('clients')
        .insert({
          tenant_id: tenantId,
          phone: phoneNumber,
          name: phoneNumber // Usar telefone como nome temporário
        })
        .select()
        .single();

      if (createError) {
        console.error(`❌ Erro ao criar cliente:`, createError);
        throw createError;
      }

      client = newClient;
      console.log(`   ✅ Cliente criado: ${client.id}`);
    } else {
      console.log(`   ✅ Cliente encontrado: ${client.id}`);
    }

    // 3. Salvar mensagem recebida (inbound)
    console.log(`   💾 Salvando mensagem inbound...`);
    const { error: saveInboundError } = await supabase
      .from('messages')
      .insert({
        tenant_id: tenantId,
        client_id: client.id,
        body: text,
        direction: 'inbound'
      });

    if (saveInboundError) {
      console.error(`❌ Erro ao salvar mensagem inbound:`, saveInboundError);
      throw saveInboundError;
    }
    console.log(`   ✅ Mensagem inbound salva`);

    // 4. Chamar Edge Function chat-assistant para gerar resposta
    console.log(`   🤖 Chamando chat-assistant...`);
    const { data: aiResponse, error: aiError } = await supabase.functions.invoke('chat-assistant', {
      body: {
        client_id: client.id,
        message: text
      }
    });

    if (aiError) {
      console.error(`❌ Erro ao chamar chat-assistant:`, aiError);
      throw aiError;
    }

    const aiMessage = aiResponse?.response || aiResponse?.message || 'Desculpe, não consegui processar sua mensagem.';
    console.log(`   ✅ Resposta da AI: ${aiMessage.substring(0, 100)}...`);

    // 5. Enviar resposta via WhatsApp
    console.log(`   📤 Enviando resposta via WhatsApp...`);
    await sendWhatsAppMessage(tenantId, phoneNumber, aiMessage);
    console.log(`   ✅ Resposta enviada via WhatsApp`);

    // 6. Salvar resposta (outbound)
    console.log(`   💾 Salvando mensagem outbound...`);
    const { error: saveOutboundError } = await supabase
      .from('messages')
      .insert({
        tenant_id: tenantId,
        client_id: client.id,
        body: aiMessage,
        direction: 'outbound'
      });

    if (saveOutboundError) {
      console.error(`❌ Erro ao salvar mensagem outbound:`, saveOutboundError);
      throw saveOutboundError;
    }
    console.log(`   ✅ Mensagem outbound salva`);

    console.log(`✅ ===== FLUXO COMPLETO COM SUCESSO =====\n`);
  } catch (error) {
    console.error(`\n❌ ===== ERRO NO FLUXO DE AI =====`);
    console.error(`   Tenant: ${tenantId}`);
    console.error(`   Erro:`, error);
    console.error(`   Stack:`, error.stack);
    console.error(`=====================================\n`);
  }
}

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'WhatsApp Baileys Multi-tenant',
    timestamp: new Date().toISOString()
  });
});

// Conectar WhatsApp (MODIFICADO: passa callback)
app.post('/connect', async (req, res) => {
  const { tenant_id, tenantId } = req.body;
  const finalTenantId = tenant_id || tenantId;

  console.log(`\n📞 ===== REQUISIÇÃO CONNECT =====`);
  console.log(`   Tenant ID: ${finalTenantId}`);
  console.log(`   IP: ${req.ip}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);

  if (!finalTenantId) {
    console.log(`❌ Tenant ID não fornecido`);
    return res.status(400).json({ error: 'tenant_id ou tenantId é obrigatório' });
  }

  try {
    // Passar handleIncomingMessage como callback
    await initializeBaileys(finalTenantId, handleIncomingMessage);
    console.log(`✅ Inicialização bem-sucedida`);
    console.log(`================================\n`);
    res.json({ success: true, message: 'Inicializando conexão WhatsApp' });
  } catch (error) {
    console.error(`❌ Erro na inicialização:`, error);
    console.log(`================================\n`);
    res.status(500).json({ 
      error: 'Erro ao conectar WhatsApp',
      details: error.message 
    });
  }
});

// Desconectar WhatsApp
app.post('/disconnect', async (req, res) => {
  const { tenant_id, tenantId } = req.body;
  const finalTenantId = tenant_id || tenantId;

  console.log(`\n🔌 ===== REQUISIÇÃO DISCONNECT =====`);
  console.log(`   Tenant ID: ${finalTenantId}`);

  if (!finalTenantId) {
    return res.status(400).json({ error: 'tenant_id ou tenantId é obrigatório' });
  }

  try {
    await disconnectSession(finalTenantId);
    res.json({ success: true, message: 'Desconectado com sucesso' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Erro ao desconectar WhatsApp',
      details: error.message 
    });
  }
});

// Enviar mensagem
app.post('/send-message', async (req, res) => {
  const { tenant_id, phone, message } = req.body;

  console.log(`\n📨 ===== REQUISIÇÃO SEND MESSAGE =====`);
  console.log(`   Tenant ID: ${tenant_id}`);
  console.log(`   Phone: ${phone}`);
  console.log(`   Message: ${message?.substring(0, 50)}...`);
  console.log(`   IP: ${req.ip}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);

  // Validações
  if (!tenant_id) {
    console.log(`❌ Tenant ID não fornecido`);
    return res.status(400).json({ error: 'tenant_id é obrigatório' });
  }

  if (!phone) {
    console.log(`❌ Phone não fornecido`);
    return res.status(400).json({ error: 'phone é obrigatório' });
  }

  if (!message || message.trim() === '') {
    console.log(`❌ Message vazia`);
    return res.status(400).json({ error: 'message não pode estar vazia' });
  }

  try {
    const result = await sendWhatsAppMessage(tenant_id, phone, message);
    
    console.log(`✅ Mensagem enviada com sucesso`);
    console.log(`=====================================\n`);
    
    res.json({ 
      success: true, 
      message: 'Mensagem enviada via WhatsApp',
      data: result
    });
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem:`, error);
    console.log(`=====================================\n`);
    
    res.status(500).json({ 
      error: 'Erro ao enviar mensagem via WhatsApp',
      details: error.message 
    });
  }
});


// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ===== SERVIDOR INICIADO =====`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
  console.log(`🔐 Multi-tenant: ATIVADO`);
  console.log(`🌍 CORS: HABILITADO`);
  console.log(`🤖 AI Auto-response: ATIVADO`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`================================\n`);
});
