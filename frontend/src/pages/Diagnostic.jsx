// src/pages/Diagnostic.jsx
// 測試診斷頁面 - 第一階段：裝置檢測基礎

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Diagnostic.css';

export default function Diagnostic() {
  const navigate = useNavigate();

  // 裝置列表
  const [cameras, setCameras] = useState([]);
  const [microphones, setMicrophones] = useState([]);
  const [speakers, setSpeakers] = useState([]);

  // 選擇的裝置
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMicrophone, setSelectedMicrophone] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');

  // 狀態
  const [cameraStream, setCameraStream] = useState(null);
  const [micVolume, setMicVolume] = useState(0);
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [error, setError] = useState('');

  // Refs
  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animationFrameRef = useRef(null);

  // 列出所有裝置
  const enumerateDevices = useCallback(async () => {
    try {
      // 先請求權限才能取得完整裝置名稱
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });

      const devices = await navigator.mediaDevices.enumerateDevices();

      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      setCameras(videoInputs);
      setMicrophones(audioInputs);
      setSpeakers(audioOutputs);

      // 設定預設裝置
      if (videoInputs.length > 0 && !selectedCamera) {
        setSelectedCamera(videoInputs[0].deviceId);
      }
      if (audioInputs.length > 0 && !selectedMicrophone) {
        setSelectedMicrophone(audioInputs[0].deviceId);
      }
      if (audioOutputs.length > 0 && !selectedSpeaker) {
        setSelectedSpeaker(audioOutputs[0].deviceId);
      }
    } catch (err) {
      console.error('無法列出裝置:', err);
      setError('無法取得裝置權限: ' + err.message);
    }
  }, [selectedCamera, selectedMicrophone, selectedSpeaker]);

  // 初始化
  useEffect(() => {
    enumerateDevices();

    return () => {
      // 清理
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // 攝影機預覽
  useEffect(() => {
    if (!selectedCamera) return;

    const startCamera = async () => {
      try {
        // 停止舊的串流
        if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: selectedCamera } }
        });

        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('攝影機啟動失敗:', err);
        setError('攝影機啟動失敗: ' + err.message);
      }
    };

    startCamera();
  }, [selectedCamera]);

  // 麥克風音量監測
  useEffect(() => {
    if (!selectedMicrophone) return;

    const startMicMonitor = async () => {
      try {
        // 停止舊的串流
        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedMicrophone } }
        });
        micStreamRef.current = stream;

        // 建立 AudioContext
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        const audioContext = audioContextRef.current;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        // 開始監測音量
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateVolume = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setMicVolume(average);
          animationFrameRef.current = requestAnimationFrame(updateVolume);
        };

        updateVolume();
      } catch (err) {
        console.error('麥克風啟動失敗:', err);
        setError('麥克風啟動失敗: ' + err.message);
      }
    };

    startMicMonitor();
  }, [selectedMicrophone]);

  // 播放測試音
  const playTestSound = async () => {
    setIsTestingAudio(true);
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // 創建簡單的測試音（三個音符）
      const playNote = (frequency, startTime, duration) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);

        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      // 播放三個音符 (Do-Mi-Sol)
      const now = audioContext.currentTime;
      playNote(523.25, now, 0.3);        // C5
      playNote(659.25, now + 0.3, 0.3);  // E5
      playNote(783.99, now + 0.6, 0.5);  // G5

      // 設定輸出裝置（如果支援）
      if (selectedSpeaker && audioContext.setSinkId) {
        await audioContext.setSinkId(selectedSpeaker);
      }

      setTimeout(() => {
        setIsTestingAudio(false);
        audioContext.close();
      }, 1200);
    } catch (err) {
      console.error('播放測試音失敗:', err);
      setError('播放測試音失敗: ' + err.message);
      setIsTestingAudio(false);
    }
  };

  // 音量條顏色
  const getVolumeColor = (volume) => {
    if (volume < 30) return '#4CAF50';  // 綠色
    if (volume < 60) return '#FFC107';  // 黃色
    return '#F44336';  // 紅色
  };

  return (
    <div className="diagnostic-page">
      <header className="diagnostic-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← 返回
        </button>
        <h1>裝置診斷</h1>
      </header>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError('')}>×</button>
        </div>
      )}

      <div className="diagnostic-content">
        {/* 攝影機區塊 */}
        <section className="device-section">
          <h2>攝影機</h2>
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="device-select"
          >
            {cameras.map(camera => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `攝影機 ${cameras.indexOf(camera) + 1}`}
              </option>
            ))}
          </select>
          <div className="camera-preview">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
            />
            {!cameraStream && (
              <div className="camera-placeholder">
                攝影機載入中...
              </div>
            )}
          </div>
        </section>

        {/* 麥克風區塊 */}
        <section className="device-section">
          <h2>麥克風</h2>
          <select
            value={selectedMicrophone}
            onChange={(e) => setSelectedMicrophone(e.target.value)}
            className="device-select"
          >
            {microphones.map(mic => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label || `麥克風 ${microphones.indexOf(mic) + 1}`}
              </option>
            ))}
          </select>
          <div className="volume-meter">
            <div className="volume-label">音量</div>
            <div className="volume-bar-container">
              <div
                className="volume-bar"
                style={{
                  width: `${Math.min(micVolume, 100)}%`,
                  backgroundColor: getVolumeColor(micVolume),
                }}
              />
            </div>
            <div className="volume-value">{Math.round(micVolume)}</div>
          </div>
          <p className="hint">對著麥克風說話，音量條應該會跳動</p>
        </section>

        {/* 喇叭區塊 */}
        <section className="device-section">
          <h2>喇叭</h2>
          <select
            value={selectedSpeaker}
            onChange={(e) => setSelectedSpeaker(e.target.value)}
            className="device-select"
          >
            {speakers.length > 0 ? (
              speakers.map(speaker => (
                <option key={speaker.deviceId} value={speaker.deviceId}>
                  {speaker.label || `喇叭 ${speakers.indexOf(speaker) + 1}`}
                </option>
              ))
            ) : (
              <option value="">使用系統預設</option>
            )}
          </select>
          <button
            className={`test-sound-btn ${isTestingAudio ? 'playing' : ''}`}
            onClick={playTestSound}
            disabled={isTestingAudio}
          >
            {isTestingAudio ? '播放中...' : '播放測試音'}
          </button>
          <p className="hint">點擊按鈕應該會聽到三個音符</p>
        </section>

        {/* 裝置狀態摘要 */}
        <section className="status-summary">
          <h2>裝置狀態</h2>
          <div className="status-grid">
            <div className={`status-item ${cameraStream ? 'ok' : 'error'}`}>
              <span className="status-icon">{cameraStream ? '✓' : '✗'}</span>
              <span>攝影機</span>
            </div>
            <div className={`status-item ${micVolume > 0 ? 'ok' : 'warning'}`}>
              <span className="status-icon">{micVolume > 0 ? '✓' : '?'}</span>
              <span>麥克風</span>
            </div>
            <div className="status-item ok">
              <span className="status-icon">✓</span>
              <span>喇叭</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
