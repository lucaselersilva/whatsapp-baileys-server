import express from 'express';
import { initializeBaileys, getSession, disconnectSession } from './baileys.js';

const app = express();
const PORT = process.env.PORT || 3000;

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

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'WhatsApp Baileys Multi-tenant',
    timestamp: new Date().toISOString()
  });
});

// Conectar WhatsApp (gerar QR Code)
app.post('/connect', async (req, res) => {
  const { tenantId } = req.body;

  console.log(`\n📞 ===== REQUISIÇÃO CONNECT =====`);
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   IP: ${req.ip}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);

  if (!tenantId) {
    console.log(`❌ Tenant ID não fornecido`);
    return res.status(400).json({ error: 'tenantId é obrigatório' });
  }

  try {
    await initializeBaileys(tenantId);
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
  const { tenantId } = req.body;

  console.log(`\n🔌 ===== REQUISIÇÃO DISCONNECT =====`);
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   IP: ${req.ip}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);

  if (!tenantId) {
    console.log(`❌ Tenant ID não fornecido`);
    return res.status(400).json({ error: 'tenantId é obrigatório' });
  }

  try {
    await disconnectSession(tenantId);
    console.log(`✅ Desconexão bem-sucedida`);
    console.log(`===================================\n`);
    res.json({ success: true, message: 'Desconectado com sucesso' });
  } catch (error) {
    console.error(`❌ Erro na desconexão:`, error);
    console.log(`===================================\n`);
    res.status(500).json({ 
      error: 'Erro ao desconectar WhatsApp',
      details: error.message 
    });
  }
});

// Status da sessão
app.get('/status/:tenantId', (req, res) => {
  const { tenantId } = req.params;
  const session = getSession(tenantId);
  
  res.json({
    connected: !!session,
    tenantId
  });
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
