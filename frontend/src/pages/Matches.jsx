// src/pages/Matches.jsx
// 配對列表頁面
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchingAPI } from '../services/api';
import './Matches.css';

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    try {
      const res = await matchingAPI.getMatches();
      setMatches(res.data);
    } catch (err) {
      console.error('載入配對失敗', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="matches">
        <div className="loading">載入中...</div>
      </div>
    );
  }

  return (
    <div className="matches">
      <header className="matches-header">
        <button onClick={() => navigate('/discovery')} className="back-btn">
          ← 探索
        </button>
        <h1>我的配對</h1>
        <div className="header-spacer"></div>
      </header>

      <div className="matches-list">
        {matches.length === 0 ? (
          <div className="no-matches">
            <p>還沒有配對</p>
            <p>去探索頁面尋找對象吧！</p>
            <button onClick={() => navigate('/discovery')}>
              開始探索
            </button>
          </div>
        ) : (
          matches.map((match) => (
            <div
              key={match.match_id}
              className="match-item"
              onClick={() => navigate(`/chat/${match.match_id}`)}
            >
              <div className="match-avatar">
                {match.avatar_url ? (
                  <img src={match.avatar_url} alt={match.display_name} />
                ) : (
                  <div className="avatar-placeholder">
                    {match.display_name?.[0] || '?'}
                  </div>
                )}
                {match.is_online && <span className="online-dot"></span>}
              </div>
              <div className="match-info">
                <h3>
                  {match.display_name}
                  {match.is_verified && <span className="verified">✓</span>}
                </h3>
                <p className="match-date">
                  配對於 {new Date(match.matched_at).toLocaleDateString('zh-TW')}
                </p>
              </div>
              <div className="match-action">
                <span className="chat-icon">💬</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
