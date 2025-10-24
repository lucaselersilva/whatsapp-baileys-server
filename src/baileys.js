import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import P from 'pino';
import qrTerminal from 'qrcode-terminal';
import {
  updateWhatsAppStatus,
  saveAuthState,
  loadAuthState,
  findOrCreateClient,
  saveMessage,
  callChatAssistant,
} from './supabase.js';

let sock = null;
let isReady = false;
let currentQR = null;

const logger = P({ level: 'info' });

// Store auth state in memory (synced with Supabase)
class SupabaseAuthState {
  constructor() {
    this.state = { creds: null, keys: {} };
  }

  async load() {
    const savedState = await loadAuthState();
    if (savedState) {
      this.state = savedState;
    }
  }

  async save(state) {
    this.state = { ...this.state, ...state };
    await saveAuthState(this.state);
  }
}

async function connectToWhatsApp() {
  const authState = new SupabaseAuthState();
  await authState.load();

  const { version } = await fetchLatestBaileysVersion();
  
  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: authState.state.creds,
      keys: makeCacheableSignalKeyStore(authState.state.keys || {}, logger),
    },
    generateHighQualityLinkPreview: true,
  });

  // QR Code
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📱 QR Code gerado!');
      currentQR = qr;
      qrTerminal.generate(qr, { small: true });
      await updateWhatsAppStatus('waiting_scan', qr);
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      
      console.log('❌ Conexão fechada. Reconectando:', shouldReconnect);
      isReady = false;
      await updateWhatsAppStatus('disconnected');

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp conectado!');
      isReady = true;
      currentQR = null;
      await updateWhatsAppStatus('ready');
    }
  });

  // Salvar credenciais
  sock.ev.on('creds.update', async () => {
    await authState.save({
      creds: sock.authState.creds,
      keys: sock.authState.keys,
    });
  });

  // Mensagens recebidas
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const messageText =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      if (!messageText) continue;

      console.log(`📨 Mensagem de ${msg.key.remoteJid}: ${messageText}`);

      try {
        // Extrair número
        const phoneNumber = msg.key.remoteJid.replace('@s.whatsapp.net', '');
        const name = msg.pushName || phoneNumber;

        // Buscar/criar cliente
        const client = await findOrCreateClient(phoneNumber, name);

        // Salvar mensagem inbound
        await saveMessage(client.tenant_id, client.id, messageText, 'inbound');

        // Chamar assistente
        const response = await callChatAssistant(
          client.id,
          messageText,
          client.tenant_id
        );

        if (response?.response) {
          // Enviar resposta
          await sock.sendMessage(msg.key.remoteJid, {
            text: response.response,
          });

          // Salvar mensagem outbound
          await saveMessage(
            client.tenant_id,
            client.id,
            response.response,
            'outbound'
          );

          console.log('✅ Resposta enviada');
        }
      } catch (error) {
        console.error('❌ Erro processando mensagem:', error);
      }
    }
  });
}

export async function initializeBaileys() {
  await connectToWhatsApp();
}

export function getStatus() {
  return {
    ready: isReady,
    qr: currentQR,
    status: isReady ? 'ready' : currentQR ? 'waiting_scan' : 'disconnected',
  };
}

export async function sendMessage(phone, message) {
  if (!isReady || !sock) {
    throw new Error('WhatsApp não está pronto');
  }

  const jid = phone.includes('@s.whatsapp.net')
    ? phone
    : `${phone}@s.whatsapp.net`;

  await sock.sendMessage(jid, { text: message });
}
