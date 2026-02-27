// src/api/middleware/errorHandler.js
// 統一錯誤處理

export function errorHandler(err, req, res, next) {
  console.error(`[Error] ${err.message}`);
  console.error(err.stack);

  // JWT 驗證錯誤
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: '無效的 Token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token 已過期' });
  }

  // 資料庫錯誤
  if (err.code === '23505') {
    return res.status(409).json({ error: '資料已存在' });
  }

  // 預設錯誤
  res.status(err.status || 500).json({
    error: err.message || '伺服器內部錯誤',
  });
}
