// src/pages/Chat.jsx
// 聊天頁面（含即時翻譯和視訊通話）
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { messagesAPI, matchingAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import VideoCall from '../components/VideoCall';
import IncomingCall from '../components/IncomingCall';
import OutgoingCall from '../components/OutgoingCall';
import './Chat.css';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const CALL_TIMEOUT = 30000; // 30 秒超時

export default function Chat() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // 通話狀態
  const [callState, setCallState] = useState('idle'); // idle, outgoing, incoming, connected
  const [callStatus, setCallStatus] = useState('calling'); // calling, rejected, timeout, offline
  const [partnerInfo, setPartnerInfo] = useState({ id: null, name: '對方' });

  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const callTimeoutRef = useRef(null);

  // 載入配對資訊
  const loadPartnerInfo = useCallback(async () => {
    try {
      const res = await matchingAPI.getMatches();
      // API 回傳: match_id, id (partner's user id), display_name
      const match = res.data.find(m => m.match_id === matchId);
      console.log('[Chat] Found match:', match);
      if (match) {
        setPartnerInfo({
          id: match.id,  // partner's user id
          name: match.display_name || '對方',
        });
      }
    } catch (err) {
      console.error('載入配對資訊失敗', err);
    }
  }, [matchId]);

  const loadMessages = useCallback(async () => {
    try {
      const res = await messagesAPI.getMessages(matchId);
      setMessages(res.data);

      // 從訊息中取得對方的名字（備用）
      if (!partnerInfo.id) {
        const partnerMsg = res.data.find(m => m.sender_id !== user?.id);
        if (partnerMsg) {
          setPartnerInfo(prev => ({
            ...prev,
            name: partnerMsg.sender_name || '對方',
          }));
        }
      }
    } catch (err) {
      console.error('載入訊息失敗', err);
    } finally {
      setLoading(false);
    }
  }, [matchId, user?.id, partnerInfo.id]);

  // 初始化 WebSocket 和載入資料
  useEffect(() => {
    loadPartnerInfo();
    loadMessages();

    // 建立 WebSocket 連接
    const token = localStorage.getItem('token');
    socketRef.current = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    const socket = socketRef.current;

    // 連接成功時註冊用戶
    const registerUser = () => {
      if (user?.id) {
        console.log('[Chat] Registering user online:', user.id);
        socket.emit('user:online', user.id);
      }
      console.log('[Chat] Joining chat room:', matchId);
      socket.emit('chat:join', matchId);
    };

    // 初次連接
    socket.on('connect', () => {
      console.log('[Chat] WebSocket connected, socket.id:', socket.id);
      registerUser();
    });

    // 重新連接
    socket.on('reconnect', (attemptNumber) => {
      console.log('[Chat] WebSocket reconnected after', attemptNumber, 'attempts');
      registerUser();
    });

    // 如果已經連接，立即註冊
    if (socket.connected) {
      registerUser();
    }

    // 監聽新訊息
    socket.on('message:received', (message) => {
      if (message.matchId === matchId) {
        setMessages((prev) => {
          if (prev.find(m => m.id === message.id)) return prev;
          return [...prev, {
            id: message.id,
            sender_id: message.senderId,
            original_text: message.originalText,
            translated_text: message.translatedText,
            source_lang: message.sourceLang,
            target_lang: message.targetLang,
            created_at: message.createdAt,
            sender_name: message.senderName,
          }];
        });
      }
    });

    // === 通話信令事件 ===

    // 收到來電
    socket.on('call:incoming', (data) => {
      console.log('[Chat] Incoming call from:', data.from);
      setCallState((prevState) => {
        if (prevState === 'idle') {
          console.log('[Chat] Setting callState to incoming');
          return 'incoming';
        }
        console.log('[Chat] Ignoring incoming call, already in state:', prevState);
        return prevState;
      });
    });

    // 對方接聽
    socket.on('call:accepted', (data) => {
      console.log('[Chat] Call accepted by:', data.from);
      clearTimeout(callTimeoutRef.current);
      setCallState('connected');
    });

    // 對方拒絕
    socket.on('call:rejected', (data) => {
      console.log('[Chat] Call rejected by:', data.from);
      clearTimeout(callTimeoutRef.current);
      setCallStatus('rejected');
      setTimeout(() => {
        setCallState('idle');
        setCallStatus('calling');
      }, 3000);
    });

    // 對方取消來電
    socket.on('call:cancelled', (data) => {
      console.log('[Chat] Call cancelled by:', data.from);
      setCallState((prevState) => {
        if (prevState === 'incoming') return 'idle';
        return prevState;
      });
    });

    // 未接來電
    socket.on('call:missed', (data) => {
      console.log('[Chat] Missed call from:', data.from);
      setCallState((prevState) => {
        if (prevState === 'incoming') return 'idle';
        return prevState;
      });
    });

    // 通話結束
    socket.on('call:ended', (data) => {
      console.log('[Chat] Call ended by:', data.from);
      setCallState('idle');
      setCallStatus('calling');
    });

    // 備用：每 3 秒輪詢一次
    const pollInterval = setInterval(loadMessages, 3000);

    // 連線錯誤處理
    socket.on('connect_error', (err) => {
      console.error('[Chat] WebSocket connect error:', err.message);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Chat] WebSocket disconnected:', reason);
    });

    return () => {
      console.log('[Chat] Cleaning up WebSocket');
      clearTimeout(callTimeoutRef.current);
      socket.disconnect();
      clearInterval(pollInterval);
    };
  }, [matchId, loadMessages, loadPartnerInfo, user?.id]); // 移除 callState，避免重複連接

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // === 通話功能 ===

  // 發起通話
  const startCall = () => {
    console.log('[Chat] startCall called, partnerInfo:', partnerInfo, 'callState:', callState);

    if (!partnerInfo.id) {
      console.error('[Chat] No partner ID, cannot start call');
      alert('無法取得對方資訊，請重新整理頁面');
      return;
    }

    console.log('[Chat] Starting call to:', partnerInfo.id);
    setCallState('outgoing');
    setCallStatus('calling');

    // 發送通話邀請
    socketRef.current.emit('call:invite', {
      matchId,
      to: partnerInfo.id,
    });

    // 設定 30 秒超時
    callTimeoutRef.current = setTimeout(() => {
      console.log('[Chat] Call timeout');
      socketRef.current.emit('call:timeout', {
        matchId,
        to: partnerInfo.id,
      });
      setCallStatus('timeout');
      // 3 秒後關閉
      setTimeout(() => {
        setCallState('idle');
        setCallStatus('calling');
      }, 3000);
    }, CALL_TIMEOUT);
  };

  // 取消撥打
  const cancelCall = () => {
    console.log('[Chat] Cancelling call');
    clearTimeout(callTimeoutRef.current);

    if (callStatus === 'calling') {
      socketRef.current.emit('call:cancel', {
        matchId,
        to: partnerInfo.id,
      });
    }

    setCallState('idle');
    setCallStatus('calling');
  };

  // 接聽來電
  const acceptCall = () => {
    console.log('[Chat] Accepting call');
    socketRef.current.emit('call:accept', {
      matchId,
      to: partnerInfo.id,
    });
    setCallState('connected');
  };

  // 拒絕來電
  const rejectCall = () => {
    console.log('[Chat] Rejecting call');
    socketRef.current.emit('call:reject', {
      matchId,
      to: partnerInfo.id,
    });
    setCallState('idle');
  };

  // 結束通話
  const endCall = () => {
    console.log('[Chat] Ending call');
    socketRef.current.emit('call:end', { matchId });
    setCallState('idle');
    setCallStatus('calling');
  };

  // === 訊息功能 ===

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    const text = newMessage;
    setNewMessage('');

    try {
      const res = await messagesAPI.sendMessage(matchId, text);
      setMessages([...messages, {
        id: res.data.id,
        sender_id: user.id,
        original_text: res.data.originalText,
        translated_text: res.data.translatedText,
        source_lang: res.data.sourceLang,
        target_lang: res.data.targetLang,
        created_at: res.data.createdAt,
        sender_name: user.displayName,
      }]);
    } catch (err) {
      console.error('發送失敗', err);
      setNewMessage(text);
    } finally {
      setSending(false);
    }
  };

  const isMyMessage = (msg) => msg.sender_id === user?.id;

  if (loading) {
    return (
      <div className="chat">
        <div className="loading">載入中...</div>
      </div>
    );
  }

  return (
    <div className="chat">
      <header className="chat-header">
        <button onClick={() => navigate('/matches')} className="back-btn">
          ← 返回
        </button>
        <h1>{partnerInfo.name}</h1>
        <button
          onClick={startCall}
          className="video-call-btn"
          title="視訊通話"
          disabled={callState !== 'idle'}
        >
          📹
        </button>
      </header>

      {/* 撥打中畫面 */}
      {callState === 'outgoing' && (
        <OutgoingCall
          calleeName={partnerInfo.name}
          status={callStatus}
          onCancel={cancelCall}
        />
      )}

      {/* 來電畫面 */}
      {callState === 'incoming' && (
        <IncomingCall
          callerName={partnerInfo.name}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* 視訊通話 */}
      {callState === 'connected' && (
        <VideoCall
          matchId={matchId}
          partnerName={partnerInfo.name}
          onClose={endCall}
        />
      )}

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="no-messages">
            <p>開始你們的對話吧！</p>
            <p className="hint">訊息會自動翻譯成對方的語言</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${isMyMessage(msg) ? 'mine' : 'theirs'}`}
            >
              <div className="message-bubble">
                <div className="message-original">{msg.original_text}</div>
                {msg.translated_text && (
                  <div className="message-translated">
                    <span className="translated-label">翻譯：</span>
                    {msg.translated_text}
                  </div>
                )}
              </div>
              <div className="message-meta">
                {!isMyMessage(msg) && <span className="sender">{msg.sender_name}</span>}
                <span className="time">
                  {new Date(msg.created_at).toLocaleTimeString('zh-TW', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="message-input" onSubmit={handleSend}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="輸入訊息..."
          disabled={sending}
        />
        <button type="submit" disabled={sending || !newMessage.trim()}>
          {sending ? '...' : '發送'}
        </button>
      </form>
    </div>
  );
}
