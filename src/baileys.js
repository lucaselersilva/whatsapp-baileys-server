import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { saveSessionToSupabase, loadSessionFromSupabase } from './supabase.js';

let sock = null;

export async function initializeWhatsApp() {
  try {
    // 1. CARREGAR SESSÃO DO SUPABASE (não do arquivo)
    const savedSession = await loadSessionFromSupabase();
    
    // 2. USAR SESSÃO SALVA OU CRIAR NOVA
    let { state, saveCreds } = savedSession 
      ? { 
          state: savedSession, 
          saveCreds: async () => {} // placeholder
        }
      : await useMultiFileAuthState('./auth_temp');

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ['WhatsApp Business', 'Chrome', '4.0.0'],
    });

    // 3. SALVAR CREDENCIAIS NO SUPABASE (não em arquivo)
    sock.ev.on('creds.update', async () => {
      console.log('🔐 Credenciais atualizadas, salvando no Supabase...');
      
      try {
        // Pegar o estado atual
        const currentState = {
          creds: sock.authState.creds,
          keys: sock.authState.keys
        };
        
        // Salvar no Supabase
        await saveSessionToSupabase(currentState);
        console.log('✅ Sessão salva no Supabase');
      } catch (error) {
        console.error('❌ Erro ao salvar sessão:', error);
      }
    });

    // 4. GERENCIAR CONEXÃO
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📱 QR Code gerado');
        await saveQRToSupabase(qr, 'qr');
      }

      if (connection === 'close') {
        const shouldReconnect = 
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log('❌ Conexão fechada, reconectar?', shouldReconnect);

        if (shouldReconnect) {
          // Aguardar 5 segundos antes de reconectar
          setTimeout(() => initializeWhatsApp(), 5000);
        } else {
          // Usuário fez logout, limpar sessão
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
