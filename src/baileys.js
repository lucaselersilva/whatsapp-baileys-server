import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { saveQRToSupabase, updateSessionStatus } from './supabase.js';
import fs from 'fs';
import path from 'path';

const sessions = new Map();
const logger = pino({ level: 'silent' });

// ========== NOVA FUNÇÃO: Normalizar telefone ==========
/**
 * Remove o sufixo @s.whatsapp.net do JID
 * Exemplo: 5531997655064@s.whatsapp.net -> 5531997655064
 */
export function normalizePhoneNumber(jid) {
  return jid.replace('@s.whatsapp.net', '');
}

// ========== EXPORTAR SESSIONS PARA USO EXTERNO ==========
export { sessions };

// Garantir que o diretório de sessões existe
function ensureSessionDir(tenantId) {
  const sessionDir = path.join(process.cwd(), 'sessions', tenantId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
    console.log(`📁 Diretório criado: ${sessionDir}`);
  }
  return sessionDir;
}

// ========== MODIFICADO: Aceitar callback onMessage ==========
export async function initializeBaileys(tenantId, onMessage = null) {
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

    // ========== NOVO: Capturar mensagens recebidas ==========
    if (onMessage) {
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        try {
          for (const msg of messages) {
            // Ignorar mensagens enviadas por nós
            if (msg.key.fromMe) continue;
            
            // Ignorar status broadcast
            if (msg.key.remoteJid === 'status@broadcast') continue;

            // Extrair texto da mensagem
            const messageText = msg.message?.conversation || 
                               msg.message?.extendedTextMessage?.text || 
                               '';

            if (!messageText) continue;

            console.log(`\n📩 ===== MENSAGEM RECEBIDA =====`);
            console.log(`   Tenant: ${tenantId}`);
            console.log(`   De: ${msg.key.remoteJid}`);
            console.log(`   Texto: ${messageText.substring(0, 50)}...`);
            console.log(`   Timestamp: ${new Date().toISOString()}`);
            console.log(`===============================\n`);

            // Chamar callback com os dados da mensagem
            await onMessage({
              tenantId,
              from: msg.key.remoteJid,
              text: messageText,
              timestamp: msg.messageTimestamp
            });
          }
        } catch (error) {
          console.error(`❌ Erro ao processar mensagem:`, error);
        }
      });
      console.log(`✅ Listener de mensagens registrado`);
    }

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
            initializeBaileys(tenantId, onMessage); // Passar callback na reconexão
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

// ========== FUNÇÕES PARA ENVIO DE MENSAGENS ==========

/**
 * Formata número de telefone para JID do WhatsApp
 * Exemplo: +55 31 99765-5064 -> 5531997655064@s.whatsapp.net
 */
function formatPhoneToJid(phone) {
  // Remove todos os caracteres não numéricos
  const cleaned = phone.replace(/\D/g, '');
  
  // Adiciona o sufixo do WhatsApp
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Envia uma mensagem via WhatsApp usando a sessão ativa
 */
export async function sendWhatsAppMessage(tenantId, phoneNumber, message) {
  console.log(`\n📤 ===== ENVIANDO MENSAGEM =====`);
  console.log(`   Tenant ID: ${tenantId}`);
  console.log(`   Phone: ${phoneNumber}`);
  console.log(`   Message length: ${message.length}`);
  
  try {
    // Buscar sessão ativa
    const sock = sessions.get(tenantId);
    
    if (!sock) {
      console.error(`❌ Sessão não encontrada para tenant: ${tenantId}`);
      throw new Error('Sessão WhatsApp não encontrada. Conecte-se primeiro.');
    }

    // Verificar se a conexão está aberta
    if (sock.ws?.readyState !== 1) {
      console.error(`❌ Conexão não está aberta (readyState: ${sock.ws?.readyState})`);
      throw new Error('Conexão WhatsApp não está ativa. Reconecte e tente novamente.');
    }

    // Formatar número para JID
    const jid = formatPhoneToJid(phoneNumber);
    console.log(`   JID formatado: ${jid}`);

    // Enviar mensagem
    const result = await sock.sendMessage(jid, { 
      text: message 
    });

    console.log(`✅ Mensagem enviada com sucesso`);
    console.log(`   Result:`, result);
    console.log(`===============================\n`);

    return {
      success: true,
      messageId: result.key.id,
      timestamp: result.messageTimestamp
    };
  } catch (error) {
    console.error(`\n❌ ===== ERRO AO ENVIAR MENSAGEM =====`);
    console.error(`   Tenant: ${tenantId}`);
    console.error(`   Phone: ${phoneNumber}`);
    console.error(`   Erro:`, error);
    console.error(`   Stack:`, error.stack);
    console.error(`======================================\n`);
    
    throw error;
  }
}
