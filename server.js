const express = require("express");
const fs = require("fs");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;
let sock;
let chatLog = [];
let currentQR = null;

// Serve static files
app.use(express.static("public"));

// API kirim pesan
app.get("/api/send", async (req, res) => {
  const { to, text } = req.query;
  if (!to || !text) {
    return res.status(400).send("❌ Parameter 'to' dan 'text' wajib.");
  }
  try {
    await sock.sendMessage(`${to}@s.whatsapp.net`, { text });
    res.send(`✅ Pesan terkirim ke ${to}`);
  } catch (err) {
    console.error("❌ Gagal kirim pesan:", err.message);
    res.status(500).send("❌ Gagal kirim pesan: " + err.message);
  }
});

// API ambil pesan terakhir
app.get("/api/messages", (req, res) => {
  res.json(chatLog.slice(-50));
});

// API ambil QR
app.get("/api/qr", (req, res) => {
  res.json({ qr: currentQR });
});

// Start WA connection
async function startWA() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState("session");

  sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: state,
    syncFullHistory: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", (m) => {
    for (const msg of m.messages) {
      if (!msg.message) continue;

      const chatId = msg.key.remoteJid;
      const fromMe = msg.key.fromMe || false;
      const text = msg.message.conversation
        || msg.message.extendedTextMessage?.text
        || (msg.message.protocolMessage?.type === 'HISTORY_SYNC_NOTIFICATION'
            ? "[Protocol Message - History Sync]"
            : JSON.stringify(msg.message));

      const name = msg.pushName || "Unknown";
      const time = new Date().toISOString();

      const entry = `
------------------------
ID       : ${chatId}
Name     : ${name}
Message  : ${text}
Time     : ${time}
Type     : ${fromMe ? "OUTGOING" : "INCOMING"}
------------------------`;

      console.log(entry);
      fs.appendFileSync("chat_log_immutable.txt", entry + "\n");
      chatLog.push({ chat: chatId, name, text, time, fromMe });
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;

    if (qr) {
      currentQR = qr;
      console.log("📌 Scan QR ini di WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      console.log("❌ Disconnected, reconnecting...");
      startWA();
    } else if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
      currentQR = null;
    }
  });
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Server running at http://panzz.faanrky.my.id:${PORT}`);
  startWA();
});
