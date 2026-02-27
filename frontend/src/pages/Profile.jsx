// src/pages/Profile.jsx
// 個人資料頁面
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { userAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import './Profile.css';

// 預設興趣標籤選項
const INTEREST_OPTIONS = [
  '旅遊', '美食', '音樂', '電影', '運動', '閱讀', '攝影', '烹飪',
  '遊戲', '藝術', '時尚', '寵物', '健身', '舞蹈', '語言學習', '文化交流'
];

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    displayName: '',
    age: '',
    location: '',
    bio: '',
    interests: [],
    avatarUrl: '',
  });

  const [newInterest, setNewInterest] = useState('');
  const [showInterestPicker, setShowInterestPicker] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await userAPI.getMe();
      const data = res.data;
      setFormData({
        displayName: data.display_name || '',
        age: data.age || '',
        location: data.location || '',
        bio: data.bio || '',
        interests: data.interests || [],
        avatarUrl: data.avatar_url || '',
      });
    } catch (err) {
      console.error('載入失敗', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 檢查檔案大小（最大 5MB）
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: '圖片不能超過 5MB' });
      return;
    }

    // 轉換成 Base64（Phase 1 簡化版，Phase 2 改用 S3）
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result;
      setFormData({ ...formData, avatarUrl: base64 });
    };
    reader.readAsDataURL(file);
  };

  const addInterest = (interest) => {
    if (!interest.trim()) return;
    if (formData.interests.includes(interest)) return;
    if (formData.interests.length >= 10) {
      setMessage({ type: 'error', text: '最多只能選擇 10 個興趣' });
      return;
    }
    setFormData({
      ...formData,
      interests: [...formData.interests, interest.trim()],
    });
    setNewInterest('');
    setShowInterestPicker(false);
  };

  const removeInterest = (interest) => {
    setFormData({
      ...formData,
      interests: formData.interests.filter((i) => i !== interest),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // 更新個人資料
      await userAPI.updateMe({
        displayName: formData.displayName,
        age: formData.age ? parseInt(formData.age) : null,
        location: formData.location,
        bio: formData.bio,
        interests: formData.interests,
      });

      // 如果有新頭像，單獨更新
      if (formData.avatarUrl && formData.avatarUrl.startsWith('data:')) {
        await userAPI.updateMe({ avatarUrl: formData.avatarUrl });
      }

      setMessage({ type: 'success', text: '儲存成功！' });
    } catch (err) {
      setMessage({ type: 'error', text: '儲存失敗，請稍後再試' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="profile">
        <div className="loading">載入中...</div>
      </div>
    );
  }

  return (
    <div className="profile">
      <header className="profile-header">
        <button onClick={() => navigate('/discovery')} className="back-btn">
          ← 返回
        </button>
        <h1>個人資料</h1>
        <button onClick={handleLogout} className="logout-btn">
          登出
        </button>
      </header>

      <form className="profile-form" onSubmit={handleSubmit}>
        {/* 頭像區塊 */}
        <div className="avatar-section">
          <div className="avatar-wrapper" onClick={handleAvatarClick}>
            {formData.avatarUrl ? (
              <img src={formData.avatarUrl} alt="頭像" className="avatar-image" />
            ) : (
              <div className="avatar-placeholder">
                {formData.displayName?.[0] || '?'}
              </div>
            )}
            <div className="avatar-overlay">
              <span>更換照片</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
          <p className="avatar-hint">點擊更換照片</p>
        </div>

        {/* 訊息提示 */}
        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* 基本資訊 */}
        <div className="form-section">
          <h2>基本資訊</h2>

          <div className="form-group">
            <label htmlFor="displayName">顯示名稱</label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              value={formData.displayName}
              onChange={handleChange}
              placeholder="你的暱稱"
              maxLength={50}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="age">年齡</label>
              <input
                type="number"
                id="age"
                name="age"
                value={formData.age}
                onChange={handleChange}
                placeholder="18"
                min={18}
                max={100}
              />
            </div>

            <div className="form-group">
              <label htmlFor="location">所在地</label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="例：台北、胡志明市"
                maxLength={100}
              />
            </div>
          </div>
        </div>

        {/* 自我介紹 */}
        <div className="form-section">
          <h2>自我介紹</h2>
          <div className="form-group">
            <textarea
              id="bio"
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              placeholder="介紹一下自己，讓對方更了解你..."
              rows={4}
              maxLength={500}
            />
            <div className="char-count">{formData.bio.length}/500</div>
          </div>
        </div>

        {/* 興趣標籤 */}
        <div className="form-section">
          <h2>興趣愛好</h2>
          <div className="interests-container">
            {formData.interests.map((interest) => (
              <span key={interest} className="interest-tag">
                {interest}
                <button
                  type="button"
                  onClick={() => removeInterest(interest)}
                  className="remove-interest"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="add-interest-btn"
              onClick={() => setShowInterestPicker(!showInterestPicker)}
            >
              + 新增興趣
            </button>
          </div>

          {showInterestPicker && (
            <div className="interest-picker">
              <div className="interest-options">
                {INTEREST_OPTIONS.filter(i => !formData.interests.includes(i)).map((interest) => (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => addInterest(interest)}
                    className="interest-option"
                  >
                    {interest}
                  </button>
                ))}
              </div>
              <div className="custom-interest">
                <input
                  type="text"
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  placeholder="或輸入自訂興趣..."
                  maxLength={20}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addInterest(newInterest);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => addInterest(newInterest)}
                  disabled={!newInterest.trim()}
                >
                  新增
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 儲存按鈕 */}
        <button type="submit" className="save-btn" disabled={saving}>
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </form>
    </div>
  );
}
