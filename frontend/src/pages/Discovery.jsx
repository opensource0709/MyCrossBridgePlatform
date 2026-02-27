// src/pages/Discovery.jsx
// 配對瀏覽頁面
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { matchingAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import './Discovery.css';

export default function Discovery() {
  const [suggestions, setSuggestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [matchAlert, setMatchAlert] = useState(null);

  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadSuggestions();
  }, []);

  const loadSuggestions = async () => {
    try {
      const res = await matchingAPI.getSuggestions();
      setSuggestions(res.data);
    } catch (err) {
      console.error('載入推薦失敗', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (actionLoading || !currentProfile) return;
    setActionLoading(true);

    try {
      const res = await matchingAPI.like(currentProfile.id);
      if (res.data.matched) {
        setMatchAlert({
          matchId: res.data.matchId,
          name: currentProfile.display_name,
        });
      }
      nextProfile();
    } catch (err) {
      console.error('操作失敗', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSkip = async () => {
    if (actionLoading || !currentProfile) return;
    setActionLoading(true);

    try {
      await matchingAPI.skip(currentProfile.id);
      nextProfile();
    } catch (err) {
      console.error('操作失敗', err);
    } finally {
      setActionLoading(false);
    }
  };

  const nextProfile = () => {
    if (currentIndex < suggestions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // 沒有更多推薦了，重新載入
      setLoading(true);
      setCurrentIndex(0);
      loadSuggestions();
    }
  };

  const currentProfile = suggestions[currentIndex];

  if (loading) {
    return (
      <div className="discovery">
        <div className="loading">載入中...</div>
      </div>
    );
  }

  return (
    <div className="discovery">
      <header className="discovery-header">
        <button onClick={() => navigate('/profile')} className="profile-btn">
          個人資料
        </button>
        <h1>探索</h1>
        <button onClick={() => navigate('/matches')} className="matches-btn">
          我的配對
        </button>
      </header>

      {matchAlert && (
        <div className="match-alert">
          <div className="match-alert-content">
            <h2>配對成功！</h2>
            <p>你和 {matchAlert.name} 互相喜歡</p>
            <div className="match-alert-buttons">
              <button onClick={() => navigate(`/chat/${matchAlert.matchId}`)}>
                開始聊天
              </button>
              <button onClick={() => setMatchAlert(null)} className="secondary">
                繼續探索
              </button>
            </div>
          </div>
        </div>
      )}

      {suggestions.length === 0 ? (
        <div className="no-suggestions">
          <p>目前沒有新的推薦</p>
          <p>請稍後再來看看！</p>
        </div>
      ) : (
        <div className="profile-card">
          <div className="profile-avatar">
            {currentProfile.avatar_url ? (
              <img src={currentProfile.avatar_url} alt={currentProfile.display_name} />
            ) : (
              <div className="avatar-placeholder">
                {currentProfile.display_name?.[0] || '?'}
              </div>
            )}
            {currentProfile.is_verified && (
              <span className="verified-badge" title="已驗證">✓</span>
            )}
            {currentProfile.is_online && (
              <span className="online-badge" title="在線">●</span>
            )}
          </div>

          <div className="profile-info">
            <h2>
              {currentProfile.display_name}
              {currentProfile.age && <span className="age">, {currentProfile.age}</span>}
            </h2>
            {currentProfile.location && (
              <p className="location">{currentProfile.location}</p>
            )}
            {currentProfile.bio && (
              <p className="bio">{currentProfile.bio}</p>
            )}
            {currentProfile.interests?.length > 0 && (
              <div className="interests">
                {currentProfile.interests.map((interest, i) => (
                  <span key={i} className="interest-tag">{interest}</span>
                ))}
              </div>
            )}
          </div>

          <div className="profile-actions">
            <button
              onClick={handleSkip}
              className="action-btn skip"
              disabled={actionLoading}
            >
              ✕
            </button>
            <button
              onClick={handleLike}
              className="action-btn like"
              disabled={actionLoading}
            >
              ♥
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
