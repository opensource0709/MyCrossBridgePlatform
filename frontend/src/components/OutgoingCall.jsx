// src/components/OutgoingCall.jsx
// 撥打中元件（等待對方接聽）

import { useEffect, useState } from 'react';
import './OutgoingCall.css';

export default function OutgoingCall({ calleeName, onCancel, status }) {
  const [dots, setDots] = useState('');

  // 動態點點動畫
  useEffect(() => {
    const timer = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(timer);
  }, []);

  const getStatusText = () => {
    switch (status) {
      case 'calling':
        return `正在呼叫${dots}`;
      case 'rejected':
        return '對方已拒絕通話';
      case 'timeout':
        return '對方未接聽';
      case 'offline':
        return '對方目前不在線上';
      default:
        return `正在呼叫${dots}`;
    }
  };

  const isError = status === 'rejected' || status === 'timeout' || status === 'offline';

  return (
    <div className="outgoing-call-overlay">
      <div className="outgoing-call-container">
        {/* 對方頭像 */}
        <div className="callee-avatar">
          <div className="avatar-placeholder">
            {calleeName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          {!isError && (
            <>
              <div className="calling-ring"></div>
              <div className="calling-ring delay"></div>
            </>
          )}
        </div>

        {/* 通話資訊 */}
        <div className="call-info">
          <h2 className="callee-name">{calleeName || '未知用戶'}</h2>
          <p className={`call-status ${isError ? 'error' : ''}`}>
            {getStatusText()}
          </p>
        </div>

        {/* 取消/關閉按鈕 */}
        <div className="call-actions">
          <button
            className="cancel-btn"
            onClick={onCancel}
            title={isError ? '關閉' : '取消'}
          >
            <span className="btn-icon">✕</span>
            <span className="btn-label">{isError ? '關閉' : '取消'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
