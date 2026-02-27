// src/pages/Chat.jsx
// 聊天頁面（含即時翻譯）
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { messagesAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import './Chat.css';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function Chat() {
  const { matchId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await messagesAPI.getMessages(matchId);
      setMessages(res.data);
    } catch (err) {
      console.error('載入訊息失敗', err);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    loadMessages();

    // 建立 WebSocket 連接
    const token = localStorage.getItem('token');
    socketRef.current = io(SOCKET_URL, {
      auth: { token },
    });

    // 加入聊天室
    socketRef.current.emit('chat:join', matchId);

    // 監聽新訊息
    socketRef.current.on('message:received', (message) => {
      if (message.matchId === matchId) {
        setMessages((prev) => {
          // 避免重複訊息
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

    // 備用：每 3 秒輪詢一次（WebSocket 失敗時的 fallback）
    const pollInterval = setInterval(loadMessages, 3000);

    return () => {
      socketRef.current?.disconnect();
      clearInterval(pollInterval);
    };
  }, [matchId, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
      setNewMessage(text); // 恢復訊息
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
        <h1>聊天</h1>
        <div className="header-spacer"></div>
      </header>

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
