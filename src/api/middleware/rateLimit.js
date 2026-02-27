// src/api/middleware/rateLimit.js
// 簡易限流（Phase 1 用記憶體，Phase 2 改 Redis）

const requestCounts = new Map();
const WINDOW_MS = 60 * 1000;  // 1 分鐘
const MAX_REQUESTS = 100;      // 每分鐘最多 100 次

export function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // 取得或初始化該 IP 的請求記錄
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }

  const requests = requestCounts.get(ip);

  // 清除過期的請求記錄
  const validRequests = requests.filter(time => time > windowStart);

  if (validRequests.length >= MAX_REQUESTS) {
    return res.status(429).json({
      error: '請求過於頻繁，請稍後再試',
      retryAfter: Math.ceil((validRequests[0] + WINDOW_MS - now) / 1000),
    });
  }

  validRequests.push(now);
  requestCounts.set(ip, validRequests);

  next();
}

// 定期清理過期記錄（防止記憶體洩漏）
setInterval(() => {
  const windowStart = Date.now() - WINDOW_MS;
  for (const [ip, requests] of requestCounts.entries()) {
    const validRequests = requests.filter(time => time > windowStart);
    if (validRequests.length === 0) {
      requestCounts.delete(ip);
    } else {
      requestCounts.set(ip, validRequests);
    }
  }
}, WINDOW_MS);
