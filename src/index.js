import express from 'express';
import { initializeBaileys, sendMessage } from './baileys.js';
import { getStatusFromSupabase, getQRFromSupabase } from './supabase.js';

const app = express();
app.use(express.json());

// Inicializar WhatsApp na inicialização do servidor
console.log('🚀 Iniciando servidor...');
initializeBaileys().catch(console.error);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'WhatsApp Baileys Server Running' });
});

// Endpoint para pegar status e QR Code
app.get('/status', async (req, res) => {
  try {
    const status = await getStatusFromSupabase();
    const qr = await getQRFromSupabase();
    
    res.json({ 
      status, 
      qr_code: qr 
    });
  } catch (error) {
    console.error('❌ Erro ao buscar status:', error);
    res.status(500).json({ 
      error: 'Failed to get status',
      message: error.message 
    });
  }
});

// Endpoint para enviar mensagem
app.post('/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: phone and message' 
      });
    }

    await sendMessage(phone, message);
    
    res.json({ 
      success: true,
      message: 'Message sent successfully' 
    });
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    res.status(500).json({ 
      error: 'Failed to send message',
      message: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
