// src/api/server.js
// Express 主程式
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 載入根目錄的 .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Routes
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import matchingRoutes from './routes/matching.js';
import messagesRoutes from './routes/messages.js';

// Middleware
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimit.js';

const app = express();
const httpServer = createServer(app);

// WebSocket 設定
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// 基本 Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 將 io 存到 app 中，讓 routes 可以使用
app.set('io', io);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/messages', messagesRoutes);

// WebSocket 連接處理
io.on('connection', (socket) => {
  console.log(`[WebSocket] 用戶連接: ${socket.id}`);

  // 用戶上線
  socket.on('user:online', (userId) => {
    socket.join(`user:${userId}`);
    socket.userId = userId;
    console.log(`[WebSocket] 用戶上線: ${userId}`);
  });

  // 加入聊天室
  socket.on('chat:join', (matchId) => {
    socket.join(`match:${matchId}`);
    console.log(`[WebSocket] 用戶 ${socket.userId} 加入聊天室: ${matchId}`);
  });

  // 發送訊息
  socket.on('message:send', async (data) => {
    const { matchId, text } = data;
    // TODO: 儲存訊息並翻譯
    io.to(`match:${matchId}`).emit('message:received', {
      matchId,
      senderId: socket.userId,
      text,
      timestamp: new Date().toISOString(),
    });
  });

  // 用戶離線
  socket.on('disconnect', () => {
    console.log(`[WebSocket] 用戶離線: ${socket.userId || socket.id}`);
  });
});

// 錯誤處理
app.use(errorHandler);

// 404 處理
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 伺服器運行中: http://localhost:${PORT}`);
  console.log(`📡 WebSocket 已啟用`);
});

export { app, io };
