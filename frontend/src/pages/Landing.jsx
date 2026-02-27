// src/pages/Landing.jsx
// 首頁
import { Link } from 'react-router-dom';
import './Landing.css';

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-header">
        <h1>LianYue</h1>
        <p className="tagline">台越跨語言交流平台</p>
      </header>

      <main className="landing-main">
        <div className="hero">
          <h2>不需要學越南語，也能和越南女生即時聊天</h2>
          <p>AI 即時翻譯，用母語自然對話</p>

          <div className="features">
            <div className="feature">
              <span className="feature-icon">🎯</span>
              <h3>智能配對</h3>
              <p>AI 分析興趣與個性，推薦最合適的對象</p>
            </div>
            <div className="feature">
              <span className="feature-icon">🌐</span>
              <h3>即時翻譯</h3>
              <p>中越雙向即時翻譯，語言不再是障礙</p>
            </div>
            <div className="feature">
              <span className="feature-icon">✅</span>
              <h3>真人驗證</h3>
              <p>所有用戶經過身份驗證，安全交流</p>
            </div>
          </div>

          <div className="cta-buttons">
            <Link to="/register" className="btn btn-primary">立即註冊</Link>
            <Link to="/login" className="btn btn-secondary">登入</Link>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <p>&copy; 2026 LianYue. 語言交換與跨文化交流平台</p>
      </footer>
    </div>
  );
}
