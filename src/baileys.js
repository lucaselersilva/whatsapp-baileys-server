import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { saveQRToSupabase, updateSessionStatus, loadSessionFromSupabase, saveSessionToSupabase } from './supabase.js';

const sessions = new Map();

const logger = pino({ level: 'silent' });

export async function initializeBaileys(tenantId) {
  console.log(`\n🚀 ===== INICIALIZANDO BAILEYS =====`);
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  
  try {
    // Verificar se já existe uma sessão ativa
    if (sessions.has(tenantId)) {
      console.log(`⚠️  Sessão já existe para tenant: ${tenantId}`);
      return sessions.get(tenantId);
    }

    // Carregar dados da sessão do Supabase (se existir)
    const savedSession = await loadSessionFromSupabase(tenantId);
    console.log(`   Sessão salva encontrada? ${!!savedSession}`);

    // Configurar autenticação multi-arquivo
    const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${tenantId}`);

    // Criar socket do WhatsApp
    console.log(`   Criando socket WhatsApp...`);
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
    });

    // Evento: QR Code gerado
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      console.log(`\n📡 CONNECTION UPDATE:`, {
        connection,
        hasQR: !!qr,
        timestamp: new Date().toISOString()
      });

      if (qr) {
        console.log(`\n📱 ===== QR CODE GERADO =====`);
        console.log(`   Tenant: ${tenantId}`);
        console.log(`   QR length: ${qr.length}`);
        
        // Mostrar QR no terminal (para debug)
        qrcode.generate(qr, { small: true });
        
        // Salvar QR Code no Supabase
        try {
          await saveQRToSupabase(tenantId, qr);
          console.log(`✅ QR Code salvo no Supabase`);
        } catch (error) {
          console.error(`❌ Erro ao salvar QR Code:`, error);
        }
        console.log(`============================\n`);
      }

      if (connection === 'close') {
        console.log(`\n🔴 Conexão fechada para tenant: ${tenantId}`);
        
        const shouldReconnect = (lastDisconnect?.error instanceof Boom) &&
          lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

        console.log(`   Motivo:`, lastDisconnect?.error);
        console.log(`   Deve reconectar? ${shouldReconnect}`);

        if (shouldReconnect) {
          console.log(`   Reconectando...`);
          initializeBaileys(tenantId);
        } else {
          console.log(`   Removendo sessão...`);
          sessions.delete(tenantId);
          await updateSessionStatus(tenantId, 'disconnected');
        }
      } else if (connection === 'open') {
        console.log(`\n✅ ===== CONEXÃO ESTABELECIDA =====`);
        console.log(`   Tenant: ${tenantId}`);
        console.log(`   Timestamp: ${new Date().toISOString()}`);
        console.log(`==================================\n`);
        
        await updateSessionStatus(tenantId, 'connected');
      }
    });

    // Salvar credenciais quando atualizadas
    sock.ev.on('creds.update', async () => {
      await saveCreds();
      console.log(`💾 Credenciais atualizadas para tenant: ${tenantId}`);
    });

    // Armazenar sessão
    sessions.set(tenantId, sock);
    console.log(`✅ Sessão criada e armazenada`);
    console.log(`==================================\n`);

    return sock;
  } catch (error) {
    console.error(`\n❌ ===== ERRO AO INICIALIZAR BAILEYS =====`);
    console.error(`   Tenant: ${tenantId}`);
    console.error(`   Erro:`, error);
    console.error(`   Stack:`, error.stack);
    console.error(`=========================================\n`);
    throw error;
  }
}

export function getSession(tenantId) {
  return sessions.get(tenantId);
}

export async function disconnectSession(tenantId) {
  console.log(`\n🔌 Desconectando sessão para tenant: ${tenantId}`);
  
  const sock = sessions.get(tenantId);
  if (sock) {
    try {
      await sock.logout();
      sessions.delete(tenantId);
      await updateSessionStatus(tenantId, 'disconnected');
      console.log(`✅ Sessão desconectada com sucesso`);
    } catch (error) {
      console.error(`❌ Erro ao desconectar:`, error);
      throw error;
    }
  } else {
    console.log(`⚠️  Nenhuma sessão ativa encontrada`);
  }
}
