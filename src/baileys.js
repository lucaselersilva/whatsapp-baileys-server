import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { saveQRToSupabase, updateSessionStatus } from './supabase.js';
import fs from 'fs';
import path from 'path';

const sessions = new Map();
const logger = pino({ level: 'silent' });

// Garantir que o diretório de sessões existe
function ensureSessionDir(tenantId) {
  const sessionDir = path.join(process.cwd(), 'sessions', tenantId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    console.log(`📁 Diretório criado: ${sessionDir}`);
  }
  return sessionDir;
}

export async function initializeBaileys(tenantId) {
  console.log(`\n🚀 ===== INICIALIZANDO BAILEYS =====`);
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  
  try {
    // Verificar se já existe uma sessão ativa
    if (sessions.has(tenantId)) {
      console.log(`⚠️  Sessão já existe para tenant: ${tenantId}`);
      const existingSession = sessions.get(tenantId);
      
      // Verificar se a conexão ainda está aberta
      if (existingSession.ws?.readyState === 1) {
        console.log(`✅ Sessão existente está ativa`);
        return existingSession;
      } else {
        console.log(`🔄 Sessão existente está fechada, removendo...`);
        sessions.delete(tenantId);
      }
    }

    // Garantir que o diretório de sessões existe
    const sessionDir = ensureSessionDir(tenantId);
    console.log(`   Session dir: ${sessionDir}`);

    // Buscar versão mais recente do Baileys
    const { version } = await fetchLatestBaileysVersion();
    console.log(`   Baileys version: ${version}`);

    // Configurar autenticação multi-arquivo
    console.log(`   Carregando auth state...`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    console.log(`   Auth state carregado`);

    // Criar socket do WhatsApp
    console.log(`   Criando socket WhatsApp...`);
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ['WhatsApp Multi-tenant', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000, // 60 segundos
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
    });

    console.log(`   Socket criado com sucesso`);

    // Evento: QR Code gerado
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      console.log(`\n📡 ===== CONNECTION UPDATE =====`);
      console.log(`   Connection: ${connection}`);
      console.log(`   Has QR: ${!!qr}`);
      console.log(`   Timestamp: ${new Date().toISOString()}`);

      if (qr) {
        console.log(`\n📱 ===== QR CODE GERADO =====`);
        console.log(`   Tenant: ${tenantId}`);
        console.log(`   QR length: ${qr.length}`);
        console.log(`   QR preview: ${qr.substring(0, 50)}...`);
        
        // Mostrar QR no terminal (para debug)
        qrcode.generate(qr, { small: true });
        
        // Salvar QR Code no Supabase
        try {
          const result = await saveQRToSupabase(tenantId, qr);
          console.log(`✅ QR Code salvo no Supabase:`, result);
        } catch (error) {
          console.error(`❌ Erro ao salvar QR Code:`, error);
        }
        console.log(`============================\n`);
      }

      if (connection === 'close') {
        console.log(`\n🔴 ===== CONEXÃO FECHADA =====`);
        console.log(`   Tenant: ${tenantId}`);
        
        const statusCode = (lastDisconnect?.error instanceof Boom) 
          ? lastDisconnect.error.output.statusCode 
          : null;
        
        console.log(`   Status Code: ${statusCode}`);
        console.log(`   Reason:`, lastDisconnect?.error);

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`   Deve reconectar? ${shouldReconnect}`);

        if (shouldReconnect) {
          console.log(`   ♻️  Reconectando em 5 segundos...`);
          setTimeout(() => {
            sessions.delete(tenantId);
            initializeBaileys(tenantId);
          }, 5000);
        } else {
          console.log(`   Removendo sessão (logout)...`);
          sessions.delete(tenantId);
          await updateSessionStatus(tenantId, 'disconnected');
        }
        console.log(`==============================\n`);
      } else if (connection === 'open') {
        console.log(`\n✅ ===== CONEXÃO ESTABELECIDA =====`);
        console.log(`   Tenant: ${tenantId}`);
        console.log(`   Timestamp: ${new Date().toISOString()}`);
        console.log(`==================================\n`);
        
        await updateSessionStatus(tenantId, 'connected');
      } else if (connection === 'connecting') {
        console.log(`   🔄 Conectando...`);
      }
    });

    // Salvar credenciais quando atualizadas
    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        console.log(`💾 Credenciais atualizadas para tenant: ${tenantId}`);
      } catch (error) {
        console.error(`❌ Erro ao salvar credenciais:`, error);
      }
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
