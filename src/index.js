import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { initializeBaileys, disconnectSession, sendWhatsAppMessage, normalizePhoneNumber } from './baileys.js';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializar Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseWebhookUrl = process.env.SUPABASE_WEBHOOK_URL;
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

// ========== FUNÇÃO: Enviar mensagem para Supabase Webhook (com debounce) ==========
async function handleIncomingMessage({ tenantId, from, text, timestamp }) {
  console.log(`\n📥 ===== MENSAGEM RECEBIDA (BAILEYS) =====`);
  console.log(`   Tenant: ${tenantId}`);
  console.log(`   From: ${from}`);
  console.log(`   Text: ${text.substring(0, 100)}...`);
  
  try {
    // 1. Normalizar telefone (remover @s.whatsapp.net)
    const phoneNumber = normalizePhoneNumber(from);
    console.log(`   📞 Número normalizado: ${phoneNumber}`);

    // 2. ENVIAR PARA SUPABASE WEBHOOK (implementa debounce automaticamente)
    console.log(`   🚀 Enviando para Supabase webhook...`);
    
    if (!supabaseWebhookUrl) {
      console.error(`❌ SUPABASE_WEBHOOK_URL não configurado!`);
      throw new Error('SUPABASE_WEBHOOK_URL não está configurado nas variáveis de ambiente');
    }

    const webhookResponse = await fetch(supabaseWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenantId,
        client_phone: phoneNumber,
        message: text,
        client_name: phoneNumber
      })
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error(`❌ Erro ao enviar para webhook:`, errorText);
      throw new Error(`Webhook falhou: ${errorText}`);
    }

    const webhookData = await webhookResponse.json();
    console.log(`   ✅ Webhook processado com sucesso:`, webhookData);
    console.log(`   ⏱️  Mensagem agendada para processamento em: ${webhookData.scheduled_at}`);
    console.log(`✅ ===== MENSAGEM ENVIADA PARA FILA DE PROCESSAMENTO =====\n`);

  } catch (error) {
    console.error(`\n❌ ===== ERRO AO PROCESSAR MENSAGEM =====`);
    console.error(`   Tenant: ${tenantId}`);
    console.error(`   Erro:`, error);
    console.error(`   Stack:`, error.stack);
    console.error(`============================================\n`);
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

// Conectar WhatsApp
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

// 🆕 NOVO ENDPOINT: Logout forçado - limpa sessão completamente
app.post('/logout', async (req, res) => {
  const { tenant_id, tenantId } = req.body;
  const finalTenantId = tenant_id || tenantId;

  console.log(`\n🗑️  ===== REQUISIÇÃO LOGOUT FORÇADO =====`);
  console.log(`   Tenant ID: ${finalTenantId}`);
  console.log(`   IP: ${req.ip}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);

  if (!finalTenantId) {
    console.log(`❌ Tenant ID não fornecido`);
    return res.status(400).json({ error: 'tenant_id ou tenantId é obrigatório' });
  }

  try {
    // 1. Desconectar socket se existir
    try {
      await disconnectSession(finalTenantId);
      console.log(`   ✅ Socket desconectado`);
    } catch (disconnectError) {
      console.log(`   ⚠️  Aviso ao desconectar socket:`, disconnectError.message);
      // Continuar mesmo se não houver socket ativo
    }

    // 2. Deletar pasta de sessão completamente
    const sessionDir = `./sessions/${finalTenantId}`;
    
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`   ✅ Pasta de sessão deletada: ${sessionDir}`);
    } else {
      console.log(`   ℹ️  Pasta de sessão não existia: ${sessionDir}`);
    }

    // 3. Atualizar status no Supabase para 'disconnected'
    const { error: updateError } = await supabase
      .from('whatsapp_sessions')
      .update({ 
        status: 'disconnected', 
        qr_code: null,
        session_data: null,
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', finalTenantId);
    
    if (updateError) {
      console.error(`   ⚠️  Erro ao atualizar status no Supabase:`, updateError);
      // Continuar mesmo se falhar - o importante é limpar os arquivos
    } else {
      console.log(`   ✅ Status atualizado no Supabase`);
    }
    
    console.log(`✅ Logout forçado concluído com sucesso`);
    console.log(`=====================================\n`);
    
    res.json({ 
      success: true, 
      message: 'Sessão limpa completamente. Você pode reconectar agora.' 
    });
  } catch (error) {
    console.error(`❌ Erro no logout forçado:`, error);
    console.error(`   Stack:`, error.stack);
    console.log(`=====================================\n`);
    
    res.status(500).json({ 
      error: 'Erro ao fazer logout forçado',
      details: error.message 
    });
  }
});

// Enviar mensagem (usado pelo Supabase process-message-queue)
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
  console.log(`🤖 AI com Debounce: ATIVADO`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`================================\n`);
});
