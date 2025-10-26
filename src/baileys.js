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
      logger,
      printQRInTerminal: false,
      auth: state,
      defaultQueryTimeoutMs: undefined,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
    });
    console.log(`   Socket criado com sucesso`);

    // Salvar credenciais quando atualizadas
    sock.ev.on('creds.update', saveCreds);

    // ========== LISTENER DE CONEXÃO ==========
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      console.log(`\n🔄 ===== CONNECTION UPDATE =====`);
      console.log(`   Tenant: ${tenantId}`);
      console.log(`   Status: ${connection || 'unknown'}`);
      console.log(`   Has QR: ${!!qr}`);

      if (qr) {
        console.log(`   📱 QR Code gerado:`);
        qrcode.generate(qr, { small: true });
        
        try {
          await saveQRToSupabase(tenantId, qr);
          console.log(`   ✅ QR salvo no Supabase`);
        } catch (error) {
          console.error(`   ❌ Erro ao salvar QR:`, error);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : undefined;

        console.log(`   🔴 Conexão fechada`);
        console.log(`   Status Code: ${statusCode}`);
        
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`   Deve reconectar: ${shouldReconnect}`);

        if (shouldReconnect) {
          console.log(`   🔄 Reconectando...`);
          setTimeout(() => {
            initializeBaileys(tenantId, onMessage);
          }, 3000);
        } else {
          console.log(`   ⚠️  Logout detectado - não reconectar`);
          sessions.delete(tenantId);
          
          try {
            await updateSessionStatus(tenantId, 'disconnected');
            console.log(`   ✅ Status atualizado no Supabase`);
          } catch (error) {
            console.error(`   ❌ Erro ao atualizar status:`, error);
          }
        }
      }

      if (connection === 'open') {
        console.log(`   ✅ Conexão estabelecida com sucesso!`);
        console.log(`   User ID: ${sock.user?.id}`);
        console.log(`   User Name: ${sock.user?.name}`);
        
        sessions.set(tenantId, sock);
        
        try {
          await updateSessionStatus(tenantId, 'connected');
          console.log(`   ✅ Status atualizado no Supabase`);
        } catch (error) {
          console.error(`   ❌ Erro ao atualizar status:`, error);
        }
      }

      console.log(`================================\n`);
    });

    // ========== NOVO: LISTENER DE MENSAGENS RECEBIDAS ==========
    if (onMessage) {
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log(`\n📨 ===== MENSAGEM RECEBIDA =====`);
        console.log(`   Tenant: ${tenantId}`);
        console.log(`   Type: ${type}`);
        console.log(`   Messages count: ${messages.length}`);

        for (const msg of messages) {
          // Ignorar mensagens próprias e de status
          if (msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') {
            console.log(`   ⏭️  Ignorando mensagem (fromMe: ${msg.key.fromMe})`);
            continue;
          }

          const from = msg.key.remoteJid; // Ex: 5531997655064@s.whatsapp.net
          const text = msg.message?.conversation || 
                      msg.message?.extendedTextMessage?.text || 
                      '';

          console.log(`   From: ${from}`);
          console.log(`   Text: ${text}`);

          // Chamar callback se fornecido
          if (text && onMessage) {
            try {
              console.log(`   🔄 Chamando onMessage callback...`);
              await onMessage(tenantId, from, text);
              console.log(`   ✅ Callback executado com sucesso`);
            } catch (error) {
              console.error(`   ❌ Erro no callback onMessage:`, error);
            }
          }
        }

        console.log(`================================\n`);
      });
    }

    console.log(`✅ Baileys inicializado com sucesso`);
    console.log(`===================================\n`);
    
    return sock;
  } catch (error) {
    console.error(`\n❌ ===== ERRO NA INICIALIZAÇÃO =====`);
    console.error(`   Tenant: ${tenantId}`);
    console.error(`   Erro:`, error);
    console.error(`   Stack:`, error.stack);
    console.error(`====================================\n`);
    
    throw error;
  }
}

/**
 * Desconecta uma sessão do WhatsApp
 */
export async function disconnectBaileys(tenantId) {
  console.log(`\n🔌 Desconectando sessão: ${tenantId}`);
  
  const sock = sessions.get(tenantId);
  if (!sock) {
    console.log(`⚠️  Nenhuma sessão ativa encontrada`);
    return { success: false, message: 'Nenhuma sessão ativa encontrada' };
  }

  try {
    await sock.logout();
    sessions.delete(tenantId);
    
    await updateSessionStatus(tenantId, 'disconnected');
    
    console.log(`✅ Sessão desconectada com sucesso`);
    return { success: true, message: 'Desconectado com sucesso' };
  } catch (error) {
    console.error(`❌ Erro ao desconectar:`, error);
    throw error;
  }
}

/**
 * Formata um número de telefone para o formato JID do WhatsApp
 */
function formatPhoneToJid(phoneNumber) {
  // Remove caracteres não numéricos
  const cleaned = phoneNumber.replace(/\D/g, '');
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

    // ✅ CORREÇÃO: Verificar se está autenticado usando sock.user
    if (!sock.user) {
      console.error(`❌ Conexão não está autenticada (sock.user: ${sock.user})`);
      throw new Error('Conexão WhatsApp não está autenticada. Reconecte e tente novamente.');
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
