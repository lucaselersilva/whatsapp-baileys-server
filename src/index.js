import express from 'express';
import cors from 'cors';
import { initializeBaileys, disconnectSession } from './baileys.js';

const app = express();
const PORT = process.env.PORT || 3000;

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
    await initializeBaileys(finalTenantId);
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

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ===== SERVIDOR INICIADO =====`);
  console.log(`📡 Porta: ${PORT}`);
  console.log(`🌐 URL: http://0.0.0.0:${PORT}`);
  console.log(`🔐 Multi-tenant: ATIVADO`);
  console.log(`🌍 CORS: HABILITADO`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`================================\n`);
});
