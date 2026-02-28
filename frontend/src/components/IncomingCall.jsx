// src/components/IncomingCall.jsx
// 來電通知元件

import { useEffect, useState } from 'react';
import './IncomingCall.css';

export default function IncomingCall({ callerName, onAccept, onReject }) {
  const [secondsLeft, setSecondsLeft] = useState(30);

  // 倒數計時
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-container">
        {/* 來電者頭像 */}
        <div className="caller-avatar">
          <div className="avatar-placeholder">
            {callerName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="pulse-ring"></div>
          <div className="pulse-ring delay"></div>
        </div>

        {/* 來電資訊 */}
        <div className="caller-info">
          <h2 className="caller-name">{callerName || '未知用戶'}</h2>
          <p className="call-status">想和你視訊通話...</p>
          <p className="countdown">{secondsLeft} 秒後自動拒接</p>
        </div>

        {/* 控制按鈕 */}
        <div className="call-actions">
          <button
            className="call-btn reject"
            onClick={onReject}
            title="拒絕"
          >
            <span className="btn-icon">✕</span>
            <span className="btn-label">拒絕</span>
          </button>
          <button
            className="call-btn accept"
            onClick={onAccept}
            title="接聽"
          >
            <span className="btn-icon">📹</span>
            <span className="btn-label">接聽</span>
          </button>
        </div>
      </div>
    </div>
  );
}
