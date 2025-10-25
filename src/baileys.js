import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import QRCode from 'qrcode';
import { 
  saveQRToSupabase, 
  updateSessionStatus, 
  loadSessionFromSupabase,
  saveSessionToSupabase 
} from './supabase.js';

// Store das conexões ativas por tenant
const activeConnections = new Map();

const logger = P({ level: 'info' });

/**
 * Inicializa conexão Baileys para um tenant específico
 */
export async function initializeBaileys(tenantId) {
  console.log(`\n🚀 ===== Inicializando Baileys para tenant: ${tenantId} =====`);
  
  try {
    // Verificar se já existe uma conexão ativa
    if (activeConnections.has(tenantId)) {
      console.log(`⚠️ Tenant ${tenantId} já possui uma conexão ativa`);
      return activeConnections.get(tenantId);
    }

    // Carregar sessão existente do Supabase
    const existingSession = await loadSessionFromSupabase(tenantId);
    
    // Usar auth state em memória (não em arquivo)
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${tenantId}`);
    
    // Obter versão mais recente do Baileys
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📱 Usando WA versão: ${version.join('.')}`);

    // Criar socket do WhatsApp
    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false, // Não imprimir no terminal
      auth: state,
      generateHighQualityLinkPreview: true
    });

    // Handler: Atualização de credenciais
    sock.ev.on('creds.update', async () => {
      await saveCreds();
      console.log(`💾 Credenciais atualizadas para tenant ${tenantId}`);
    });

    // Handler: Atualização de conexão
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      console.log(`🔄 Status de conexão para ${tenantId}:`, connection);

      // QR Code gerado
      if (qr) {
        console.log(`📱 QR Code gerado para tenant ${tenantId}`);
        try {
          const qrCodeDataURL = await QRCode.toDataURL(qr);
          await saveQRToSupabase(tenantId, qrCodeDataURL);
          console.log(`✅ QR Code salvo no Supabase para tenant ${tenantId}`);
        } catch (err) {
          console.error(`❌ Erro ao salvar QR Code para ${tenantId}:`, err);
        }
      }

      // Conexão aberta (conectado)
      if (connection === 'open') {
        console.log(`✅ WhatsApp conectado para tenant ${tenantId}`);
        await updateSessionStatus(tenantId, 'connected');
        
        // Salvar sessão completa
        try {
          await saveSessionToSupabase(tenantId, state.creds);
        } catch (err) {
          console.error(`❌ Erro ao salvar sessão para ${tenantId}:`, err);
        }
      }

      // Conexão fechada
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`❌ Conexão fechada para ${tenantId}. Código: ${statusCode}`);
        console.log(`🔄 Deve reconectar? ${shouldReconnect ? 'SIM' : 'NÃO'}`);

        if (shouldReconnect) {
          await updateSessionStatus(tenantId, 'reconnecting');
          setTimeout(() => initializeBaileys(tenantId), 5000);
        } else {
          await updateSessionStatus(tenantId, 'disconnected');
          activeConnections.delete(tenantId);
        }
      }
    });

    // Handler: Mensagens recebidas
    sock.ev.on('messages.upsert', async ({ messages }) => {
      console.log(`📨 Mensagem recebida para tenant ${tenantId}:`, messages.length);
      // Aqui você pode processar mensagens recebidas
    });

    // Armazenar conexão ativa
    activeConnections.set(tenantId, sock);
    console.log(`✅ Conexão armazenada para tenant ${tenantId}`);

    return sock;
  } catch (error) {
    console.error(`❌ Erro crítico ao inicializar Baileys para tenant ${tenantId}:`, error);
    await updateSessionStatus(tenantId, 'error');
    throw error;
  }
}

/**
 * Desconecta um tenant específico
 */
export async function disconnectTenant(tenantId) {
  console.log(`🔌 Desconectando tenant: ${tenantId}`);
  
  const sock = activeConnections.get(tenantId);
  if (sock) {
    await sock.logout();
    activeConnections.delete(tenantId);
    await updateSessionStatus(tenantId, 'disconnected');
    console.log(`✅ Tenant ${tenantId} desconectado com sucesso`);
    return true;
  }
  
  console.log(`⚠️ Tenant ${tenantId} não possui conexão ativa`);
  return false;
}

/**
 * Envia mensagem para um número específico
 */
export async function sendMessage(tenantId, phoneNumber, message) {
  const sock = activeConnections.get(tenantId);
  
  if (!sock) {
    throw new Error(`Tenant ${tenantId} não está conectado`);
  }

  const jid = `${phoneNumber}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: message });
  
  console.log(`✅ Mensagem enviada para ${phoneNumber} via tenant ${tenantId}`);
  return true;
}
