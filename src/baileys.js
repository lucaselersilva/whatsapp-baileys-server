import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { 
  saveSessionToSupabase, 
  loadSessionFromSupabase,
  clearSessionFromSupabase,
  saveQRToSupabase,
  updateStatusInSupabase 
} from './supabase.js';

let sock = null;

export async function initializeBaileys() {
  try {
    console.log('🔄 Inicializando WhatsApp...');
    
    // 1. Tentar carregar sessão do Supabase
    const savedSession = await loadSessionFromSupabase();
    
    // 2. Usar sessão salva ou criar nova
    const { state, saveCreds } = savedSession && savedSession.creds
      ? { 
          state: savedSession, 
          saveCreds: async () => {
            console.log('📝 Salvando credenciais...');
            const currentState = {
              creds: sock.authState.creds,
              keys: sock.authState.keys
            };
            await saveSessionToSupabase(currentState);
          }
        }
      : await useMultiFileAuthState('./auth_temp');

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['WhatsApp Business', 'Chrome', '4.0.0'],
    });

    // 3. Salvar credenciais no Supabase quando mudarem
    sock.ev.on('creds.update', async () => {
      console.log('🔐 Credenciais atualizadas');
      
      try {
        const currentState = {
          creds: sock.authState.creds,
          keys: sock.authState.keys
        };
        
        await saveSessionToSupabase(currentState);
        console.log('✅ Sessão salva no Supabase');
      } catch (error) {
        console.error('❌ Erro ao salvar sessão:', error);
      }
    });

    // 4. Gerenciar conexão
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📱 QR Code gerado');
        await saveQRToSupabase(qr, 'waiting_scan');
      }

      if (connection === 'close') {
        const shouldReconnect = 
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log('❌ Conexão fechada, reconectar?', shouldReconnect);

        if (shouldReconnect) {
          console.log('⏳ Aguardando 5 segundos para reconectar...');
          setTimeout(() => initializeBaileys(), 5000);
        } else {
          console.log('🚪 Usuário fez logout, limpando sessão');
          await clearSessionFromSupabase();
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp conectado!');
        await updateStatusInSupabase('connected');
      }
    });

    return sock;
  } catch (error) {
    console.error('❌ Erro ao inicializar WhatsApp:', error);
    throw error;
  }
}

export async function sendMessage(phone, message) {
  if (!sock) {
    throw new Error('WhatsApp não está conectado');
  }

  try {
    // Formatar número no padrão internacional
    const formattedPhone = phone.includes('@s.whatsapp.net') 
      ? phone 
      : `${phone.replace(/\D/g, '')}@s.whatsapp.net`;

    await sock.sendMessage(formattedPhone, { text: message });
    console.log(`✅ Mensagem enviada para ${formattedPhone}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error);
    throw error;
  }
}
