import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import pino from 'pino';
import { 
  saveSessionToSupabase, 
  loadSessionFromSupabase, 
  updateStatusInSupabase,
  saveQRToSupabase,
  clearSessionFromSupabase
} from './supabase.js';

const msgRetryCounterCache = new NodeCache();
const logger = pino({ level: 'silent' });

export async function initializeBaileys(tenantId, onQR, onReady) {
  console.log(`🚀 Inicializando Baileys para tenant ${tenantId}...`);

  try {
    // Carregar sessão do Supabase
    const savedCreds = await loadSessionFromSupabase(tenantId);
    
    let state;
    if (savedCreds) {
      console.log(`📦 Usando sessão salva para tenant ${tenantId}`);
      state = {
        creds: savedCreds.creds || {},
        keys: savedCreds.keys || {}
      };
    } else {
      console.log(`🆕 Criando nova sessão para tenant ${tenantId}`);
      state = {
        creds: {},
        keys: {}
      };
    }

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      msgRetryCounterCache,
      generateHighQualityLinkPreview: true,
    });

    // Salvar credenciais quando atualizadas
    sock.ev.on('creds.update', async () => {
      const sessionData = {
        creds: sock.authState.creds,
        keys: {}
      };
      await saveSessionToSupabase(tenantId, sessionData);
    });

    // Gerenciar conexão
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`📱 QR Code gerado para tenant ${tenantId}`);
        await saveQRToSupabase(tenantId, qr);
        if (onQR) onQR(qr);
      }

      if (connection === 'open') {
        console.log(`✅ WhatsApp conectado para tenant ${tenantId}!`);
        await updateStatusInSupabase(tenantId, 'ready');
        if (onReady) onReady();
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`❌ Conexão fechada para tenant ${tenantId}, código:`, statusCode);
        await updateStatusInSupabase(tenantId, 'disconnected');

        if (shouldReconnect) {
          console.log(`🔄 Reconectando tenant ${tenantId} em 5 segundos...`);
          setTimeout(() => initializeBaileys(tenantId, onQR, onReady), 5000);
        } else {
          console.log(`🚪 Logout detectado para tenant ${tenantId}`);
          await clearSessionFromSupabase(tenantId);
        }
      }
    });

    return sock;
  } catch (error) {
    console.error(`❌ Erro ao inicializar Baileys para tenant ${tenantId}:`, error);
    await updateStatusInSupabase(tenantId, 'disconnected');
    throw error;
  }
}
