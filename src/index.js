import express from 'express';
import cors from 'cors';
import { initializeBaileys, disconnectTenant, sendMessage } from './baileys.js';
import { supabase } from './supabase.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// ===== HANDLERS DE ERRO GLOBAIS =====
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ ===== UNHANDLED REJECTION =====');
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('Stack:', reason?.stack);
  console.error('================================\n');
});

process.on('uncaughtException', (error) => {
  console.error('❌ ===== UNCAUGHT EXCEPTION =====');
  console.error('Error:', error);
  console.error('Stack:', error?.stack);
  console.error('================================\n');
  process.exit(1);
});

// ===== ROTAS =====

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'whatsapp-baileys-multi-tenant'
  });
});

// Conectar WhatsApp para um tenant
app.post('/connect', async (req, res) => {
  const { tenant_id } = req.body;
  
  console.log(`\n📞 ===== REQUISIÇÃO DE CONEXÃO =====`);
  console.log('Tenant ID:', tenant_id);
  console.log('Timestamp:', new Date().toISOString());
  console.log('====================================\n');

  if (!tenant_id) {
    console.error('❌ Erro: tenant_id não fornecido');
    return res.status(400).json({ 
      error: 'tenant_id é obrigatório' 
    });
  }

  try {
    await initializeBaileys(tenant_id);
    
    res.json({ 
      success: true, 
      message: 'Conexão iniciada. Aguarde o QR Code.' 
    });
  } catch (error) {
    console.error(`❌ Erro ao conectar tenant ${tenant_id}:`, error);
    
    res.status(500).json({ 
      error: 'Erro ao iniciar conexão',
      details: error.message 
    });
  }
});

// Desconectar WhatsApp para um tenant
app.post('/disconnect', async (req, res) => {
  const { tenant_id } = req.body;
  
  console.log(`\n🔌 ===== REQUISIÇÃO DE DESCONEXÃO =====`);
  console.log('Tenant ID:', tenant_id);
  console.log('=======================================\n');

  if (!tenant_id) {
    return res.status(400).json({ 
      error: 'tenant_id é obrigatório' 
    });
  }

  try {
    const disconnected = await disconnectTenant(tenant_id);
    
    res.json({ 
      success: disconnected,
      message: disconnected ? 'Desconectado com sucesso' : 'Tenant não estava conectado'
    });
  } catch (error) {
    console.error(`❌ Erro ao desconectar tenant ${tenant_id}:`, error);
    
    res.status(500).json({ 
      error: 'Erro ao desconectar',
      details: error.message 
    });
  }
});

// Enviar mensagem
app.post('/send-message', async (req, res) => {
  const { tenant_id, phone, message } = req.body;
  
  console.log(`\n💬 ===== ENVIO DE MENSAGEM =====`);
  console.log('Tenant:', tenant_id);
  console.log('Phone:', phone);
  console.log('Message:', message);
  console.log('================================\n');

  if (!tenant_id || !phone || !message) {
    return res.status(400).json({ 
      error: 'tenant_id, phone e message são obrigatórios' 
    });
  }

  try {
    await sendMessage(tenant_id, phone, message);
    
    res.json({ 
      success: true,
      message: 'Mensagem enviada com sucesso' 
    });
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem:`, error);
    
    res.status(500).json({ 
      error: 'Erro ao enviar mensagem',
      details: error.message 
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 ===== SERVIDOR INICIADO =====`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔐 Multi-tenant: ATIVADO`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`================================\n`);
});
