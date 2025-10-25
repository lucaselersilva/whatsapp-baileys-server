import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { saveQRToSupabase, updateSessionStatus } from './supabase.js';

const sessions = new Map();
const logger = pino({ level: 'silent' });

export async function initializeBaileys(tenantId) {
  console.log(`\n🚀 Inicializando Baileys para tenant: ${tenantId}`);
  
  try {
    if (sessions.has(tenantId)) {
      console.log(`⚠️  Sessão já existe`);
      return sessions.get(tenantId);
    }

    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${tenantId}`);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      console.log(`📡 Connection update:`, { connection, hasQR: !!qr });

      if (qr) {
        console.log(`\n📱 QR CODE GERADO (length: ${qr.length})`);
        qrcode.generate(qr, { small: true });
        
        try {
          await saveQRToSupabase(tenantId, qr);
        } catch (error) {
          console.error(`❌ Erro ao salvar QR:`, error);
        }
      }

      if (connection === 'close') {
        console.log(`🔴 Conexão fechada`);
        
        const shouldReconnect = (lastDisconnect?.error instanceof Boom) &&
          lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log(`♻️  Reconectando...`);
          initializeBaileys(tenantId);
        } else {
          sessions.delete(tenantId);
          await updateSessionStatus(tenantId, 'disconnected');
        }
      } else if (connection === 'open') {
        console.log(`✅ Conexão estabelecida!`);
        await updateSessionStatus(tenantId, 'connected');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sessions.set(tenantId, sock);
    console.log(`✅ Sessão criada\n`);

    return sock;
  } catch (error) {
    console.error(`❌ Erro ao inicializar Baileys:`, error);
    throw error;
  }
}

export async function disconnectSession(tenantId) {
  console.log(`🔌 Desconectando tenant: ${tenantId}`);
  
  const sock = sessions.get(tenantId);
  if (sock) {
    await sock.logout();
    sessions.delete(tenantId);
    await updateSessionStatus(tenantId, 'disconnected');
  }
}
