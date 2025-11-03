import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import { NovaSonicBidirectionalStreamClient } from './client.ts';
import { Buffer } from 'node:buffer';
import { fromEnv } from "@aws-sdk/credential-providers";
import dotenv from 'dotenv';
import { fileURLToPath } from "url";
import { dirname } from "path";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

// 🔧 Utility for pretty timestamps
const ts = () => new Date().toISOString();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

console.log(`[${ts()}] 🚀 Starting Nova Sonic Socket Server...`);

// Create the AWS Bedrock client
const bedrockClient = new NovaSonicBidirectionalStreamClient({
  requestHandlerConfig: {
    maxConcurrentStreams: 10,
  },
  clientConfig: {
    region: process.env.AWS_REGION_VOICE || "us-east-1",
    credentials: fromEnv()
  }
});

console.log(`[${ts()}] ✅ Bedrock client initialized for region ${process.env.AWS_REGION || "us-west-2"}`);

// Periodic cleanup
setInterval(() => {
  console.log(`[${ts()}] 🧹 Session cleanup check`);
  const now = Date.now();
  bedrockClient.getActiveSessions().forEach(sessionId => {
    const lastActivity = bedrockClient.getLastActivityTime(sessionId);
    if (now - lastActivity > 5 * 60 * 1000) {
      console.log(`[${ts()}] ⚠️ Closing inactive session ${sessionId}`);
      try {
        bedrockClient.forceCloseSession(sessionId);
      } catch (error) {
        console.error(`[${ts()}] ❌ Error force closing inactive session ${sessionId}:`, error);
      }
    }
  });
}, 60000);


app.use(express.static(path.join(__dirname, '../public')));

// ✅ Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`[${ts()}] 🟢 Client connected: ${socket.id}`);

  const sessionId = socket.id;
  let selectedUserId = '123';
  let selectedVoiceId = 'tiffany';

  try {
    const session = bedrockClient.createStreamSession(sessionId);
    bedrockClient.initiateSession(sessionId);
    console.log(`[${ts()}] 🎧 Session created for socket ${sessionId}`);

    socket.on("setAgentType", ({ agentType }) => {
      console.log(`[${ts()}] 🤖 Client ${socket.id} selected agent type: ${agentType}`);
      socket.data.agentType = agentType;
    });

    socket.on("setVoice", (data) => {
      if (data?.voiceId) {
        selectedVoiceId = data.voiceId.trim();
        console.log(`[${ts()}] 🎤 Voice set for ${sessionId}: ${selectedVoiceId}`);
        socket.emit("status", { message: `Voice selected: ${selectedVoiceId}` });
      }
    });

    socket.on("setUserId", (data) => {
      if (data?.user_id) {
        selectedUserId = data.user_id.trim();
        console.log(`[${ts()}] 👤 UserId set for ${sessionId}: ${selectedUserId}`);
        bedrockClient.setSessionUserId(sessionId, selectedUserId);
      }
    });

    // === Session Event Handlers ===
    session.onEvent("contentStart", (data) => {
      console.log(`[${ts()}] ▶️ contentStart (${sessionId})`, data);
      socket.emit("contentStart", data);
    });

    session.onEvent("textOutput", (data) => {
      console.log(`[${ts()}] 💬 textOutput (${sessionId}):`, data);
      socket.emit("textOutput", data);
    });

    session.onEvent("audioOutput", (data) => {
      console.log(`[${ts()}] 🔊 audioOutput (${sessionId})`);
      socket.emit("audioOutput", data);
    });

    session.onEvent("error", (data) => {
      console.error(`[${ts()}] ❗ Error (${sessionId}):`, data);
      socket.emit("error", data);
    });

    session.onEvent("toolUse", (data) => {
      console.log(`[${ts()}] 🛠️ Tool use (${sessionId}): ${data.toolName}`);
      socket.emit("toolUse", data);
    });

    session.onEvent("toolResult", (data) => {
      console.log(`[${ts()}] 📦 Tool result (${sessionId})`);
      socket.emit("toolResult", data);
    });

    session.onEvent("streamComplete", () => {
      console.log(`[${ts()}] ✅ Stream complete (${sessionId})`);
      socket.emit("streamComplete");
    });

    // === Audio input streaming ===
    socket.on("audioInput", async (audioData) => {
      console.log(`[${ts()}] 🎙️ audioInput received (${sessionId})`);
      try {
        const buffer = typeof audioData === "string"
          ? Buffer.from(audioData, "base64")
          : Buffer.from(audioData);
        await session.streamAudio(buffer);
      } catch (error) {
        console.error(`[${ts()}] ❌ Error streaming audio (${sessionId}):`, error);
        socket.emit("error", { message: "Audio stream error", details: error });
      }
    });

    socket.on("promptStart", async () => {
      console.log(`[${ts()}] ✏️ promptStart (${sessionId})`);
      await session.setupPromptStart();
    });

    socket.on("systemPrompt", async (data) => {
      console.log(`[${ts()}] ⚙️ systemPrompt (${sessionId})`, data);
      await session.setupSystemPrompt(undefined, undefined);
    });

    socket.on("audioStart", async () => {
      console.log(`[${ts()}] ▶️ audioStart (${sessionId})`);
      bedrockClient.setSessionVoiceId?.(sessionId, selectedVoiceId);
      await session.setupStartAudio();
    });

    socket.on("stopAudio", async () => {
      console.log(`[${ts()}] ⏹️ stopAudio (${sessionId})`);
      try {
        await session.endAudioContent();
        await session.endPrompt();
        await session.close();
        console.log(`[${ts()}] 🧹 Session cleanup complete (${sessionId})`);
      } catch (error) {
        console.error(`[${ts()}] ❌ Error stopping audio (${sessionId}):`, error);
      }
    });

    socket.on("disconnect", async () => {
      console.log(`[${ts()}] 🔴 Client disconnected: ${socket.id}`);
      if (bedrockClient.isSessionActive(sessionId)) {
        try {
          console.log(`[${ts()}] 🧼 Cleaning up session ${sessionId}`);
          await session.endAudioContent();
          await session.endPrompt();
          await session.close();
        } catch (e) {
          console.error(`[${ts()}] ❌ Cleanup error (${sessionId}):`, e);
          bedrockClient.forceCloseSession(sessionId);
        }
      }
    });

  } catch (error) {
    console.error(`[${ts()}] ❌ Error creating session for ${socket.id}:`, error);
    socket.emit("error", { message: "Failed to initialize session", details: error });
    socket.disconnect();
  }
});

// Health check endpoint
app.get("/health", (_, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[${ts()}] 🟢 Server listening on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log(`[${ts()}] 🛑 Shutting down server...`);
  const forceExitTimer = setTimeout(() => {
    console.error(`[${ts()}] ⏰ Force shutdown timeout`);
    process.exit(1);
  }, 5000);

  try {
    await new Promise(resolve => io.close(resolve));
    console.log(`[${ts()}] 🧩 Socket.IO closed`);

    const activeSessions = bedrockClient.getActiveSessions();
    console.log(`[${ts()}] 🔻 Closing ${activeSessions.length} sessions`);
    for (const sessionId of activeSessions) {
      try {
        await bedrockClient.closeSession(sessionId);
      } catch {
        bedrockClient.forceCloseSession(sessionId);
      }
    }

    await new Promise(resolve => server.close(resolve));
    clearTimeout(forceExitTimer);
    console.log(`[${ts()}] ✅ Server shutdown complete`);
    process.exit(0);
  } catch (err) {
    console.error(`[${ts()}] ❌ Shutdown error:`, err);
    process.exit(1);
  }
});
