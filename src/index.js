import express from 'express';
import cors from 'cors';
import { initializeBaileys } from './baileys.js';
import { updateStatusInSupabase } from './supabase.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Map para gerenciar múltiplas conexões (uma por tenant)
const activeSockets = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeTenants: activeSockets.size,
    tenants: Array.from(activeSockets.keys())
  });
});

// Conectar WhatsApp para um tenant específico
app.post('/connect', async (req, res) => {
  const { tenant_id } = req.body;

  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id é obrigatório' });
  }

  try {
    // Verificar se já existe conexão ativa para este tenant
    if (activeSockets.has(tenant_id)) {
      return res.json({ 
        message: 'Conexão já ativa para este tenant',
        tenant_id 
      });
    }

    console.log(`🔌 Iniciando conexão para tenant ${tenant_id}`);

    const sock = await initializeBaileys(
      tenant_id,
      (qr) => console.log(`📱 QR Code gerado para tenant ${tenant_id}`),
      () => console.log(`✅ Tenant ${tenant_id} pronto`)
    );

    activeSockets.set(tenant_id, sock);

    res.json({ 
      message: 'Conexão iniciada com sucesso',
      tenant_id
    });
  } catch (error) {
    console.error(`❌ Erro ao conectar tenant ${tenant_id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Desconectar WhatsApp de um tenant específico
app.post('/disconnect', async (req, res) => {
  const { tenant_id } = req.body;

  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id é obrigatório' });
  }

  try {
    const sock = activeSockets.get(tenant_id);
    
    if (!sock) {
      return res.status(404).json({ error: 'Nenhuma conexão ativa para este tenant' });
    }

    await sock.logout();
    activeSockets.delete(tenant_id);
    await updateStatusInSupabase(tenant_id, 'disconnected');

    res.json({ message: 'Desconectado com sucesso', tenant_id });
  } catch (error) {
    console.error(`❌ Erro ao desconectar tenant ${tenant_id}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Enviar mensagem (agora com tenant_id)
app.post('/send-message', async (req, res) => {
  const { tenant_id, phone, message } = req.body;

  if (!tenant_id || !phone || !message) {
    return res.status(400).json({ 
      error: 'tenant_id, phone e message são obrigatórios' 
    });
  }

  try {
    const sock = activeSockets.get(tenant_id);

    if (!sock) {
      return res.status(404).json({ 
        error: 'Nenhuma conexão ativa para este tenant. Execute /connect primeiro.' 
      });
    }

    const formattedPhone = phone.replace(/\D/g, '') + '@s.whatsapp.net';
    await sock.sendMessage(formattedPhone, { text: message });

    res.json({ 
      success: true, 
      message: 'Mensagem enviada com sucesso',
      tenant_id,
      phone 
    });
  } catch (error) {
    console.error(`❌ Erro ao enviar mensagem (tenant ${tenant_id}):`, error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor Railway rodando na porta ${PORT}`);
  console.log(`📡 Suporte multi-tenant ativado`);
});
