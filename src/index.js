import express from 'express';
import { initializeBaileys, sendMessage } from './baileys.js';

const app = express();
app.use(express.json());

// Inicializar Baileys
initializeBaileys().catch(console.error);

// Endpoints
app.get('/status', (req, res) => {
  res.json(getStatus());
});

app.post('/send-message', async (req, res) => {
  try {
    const { phone, message } = req.body;
    await sendMessage(phone, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor rodando na porta ${PORT}`);
});

// Endpoint para checar status
app.get('/status', async (req, res) => {
  try {
    const status = await getStatusFromSupabase();
    res.json({ status });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});
