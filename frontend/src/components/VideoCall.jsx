// src/components/VideoCall.jsx
// 視訊通話元件

import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import api from '../services/api';
import './VideoCall.css';

// 設定 Agora SDK 日誌等級
AgoraRTC.setLogLevel(1); // 0: DEBUG, 1: INFO, 2: WARNING, 3: ERROR, 4: NONE

export default function VideoCall({ matchId, partnerName, onClose }) {
  const clientRef = useRef(null);
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // 初始化 Agora client
  useEffect(() => {
    clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    const client = clientRef.current;

    // 監聽遠端用戶發布
    client.on('user-published', async (user, mediaType) => {
      console.log('[VideoCall] Remote user published:', user.uid, mediaType);
      setStatus(`對方已加入 (${mediaType})`);

      await client.subscribe(user, mediaType);

      if (mediaType === 'video') {
        setRemoteVideoTrack(user.videoTrack);
        setTimeout(() => {
          if (remoteVideoRef.current && user.videoTrack) {
            user.videoTrack.play(remoteVideoRef.current);
          }
        }, 100);
      }

      if (mediaType === 'audio') {
        setRemoteAudioTrack(user.audioTrack);
        user.audioTrack.play();
      }
    });

    // 監聽遠端用戶取消發布
    client.on('user-unpublished', (user, mediaType) => {
      console.log('[VideoCall] Remote user unpublished:', user.uid, mediaType);
      if (mediaType === 'video') {
        setRemoteVideoTrack(null);
      }
      if (mediaType === 'audio') {
        setRemoteAudioTrack(null);
      }
    });

    // 監聽遠端用戶離開
    client.on('user-left', (user) => {
      console.log('[VideoCall] Remote user left:', user.uid);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);
      setStatus('對方已離開');
    });

    // 監聽連線狀態
    client.on('connection-state-change', (curState, prevState) => {
      console.log('[VideoCall] Connection state:', prevState, '->', curState);
      if (curState === 'DISCONNECTED') {
        setIsConnected(false);
        setStatus('已斷線');
      }
    });

    return () => {
      // 清理
      client.removeAllListeners();
    };
  }, []);

  // 開始通話
  const startCall = async (withVideo = true) => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setError(null);
    setStatus('正在連接...');

    const client = clientRef.current;

    try {
      // 如果已經在頻道中，先離開
      if (client.connectionState === 'CONNECTED') {
        await client.leave();
      }

      // 1. 取得 Agora Token
      setStatus('取得授權...');
      const response = await api.post('/api/agora/token', {
        channelName: matchId
      });
      const { token, appId } = response.data;
      console.log('[VideoCall] Got token for channel:', matchId);

      // 2. 加入頻道
      setStatus('加入頻道...');
      const uid = await client.join(appId, matchId, token, null);
      console.log('[VideoCall] Joined channel with uid:', uid);

      // 3. 建立本地軌道
      setStatus('取得麥克風和相機...');
      let audioTrack = null;
      let videoTrack = null;

      // 嘗試取得麥克風
      try {
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        setLocalAudioTrack(audioTrack);
        console.log('[VideoCall] Got audio track');
      } catch (audioErr) {
        console.warn('[VideoCall] 無法取得麥克風:', audioErr.message);
      }

      // 嘗試取得相機
      if (withVideo) {
        try {
          videoTrack = await AgoraRTC.createCameraVideoTrack();
          setLocalVideoTrack(videoTrack);
          console.log('[VideoCall] Got video track');

          // 顯示本地視訊
          if (localVideoRef.current) {
            videoTrack.play(localVideoRef.current);
          }
        } catch (videoErr) {
          console.warn('[VideoCall] 無法取得相機:', videoErr.message);
          setError('相機無法使用，僅語音模式');
        }
      }

      // 4. 發布軌道
      setStatus('發布媒體...');
      const tracksToPublish = [audioTrack, videoTrack].filter(Boolean);

      if (tracksToPublish.length > 0) {
        await client.publish(tracksToPublish);
        console.log('[VideoCall] Published tracks:', tracksToPublish.length);
      }

      setIsConnected(true);
      setStatus('已連接，等待對方加入...');
      console.log('[VideoCall] Connected to channel:', matchId);

    } catch (err) {
      console.error('[VideoCall] Failed to start call:', err);
      setError(err.message || '無法開始通話');
      setStatus('連接失敗');

      // 清理
      localAudioTrack?.close();
      localVideoTrack?.close();
      setLocalAudioTrack(null);
      setLocalVideoTrack(null);

      try {
        await client.leave();
      } catch (e) {
        // ignore
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // 結束通話
  const endCall = async () => {
    const client = clientRef.current;

    try {
      localAudioTrack?.close();
      localVideoTrack?.close();

      setLocalAudioTrack(null);
      setLocalVideoTrack(null);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);

      if (client.connectionState === 'CONNECTED') {
        await client.leave();
      }

      setIsConnected(false);
      setStatus('');
      console.log('[VideoCall] Call ended');
      onClose?.();
    } catch (err) {
      console.error('[VideoCall] Error ending call:', err);
      onClose?.();
    }
  };

  // 切換靜音
  const toggleMute = () => {
    if (localAudioTrack) {
      localAudioTrack.setEnabled(isMuted);
      setIsMuted(!isMuted);
    }
  };

  // 切換視訊
  const toggleVideo = () => {
    if (localVideoTrack) {
      localVideoTrack.setEnabled(isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  // 元件卸載時清理
  useEffect(() => {
    return () => {
      localAudioTrack?.close();
      localVideoTrack?.close();
      clientRef.current?.leave().catch(() => {});
    };
  }, [localAudioTrack, localVideoTrack]);

  return (
    <div className="video-call-overlay">
      <div className="video-call-container">
        {/* 遠端視訊（大畫面） */}
        <div className="remote-video-container">
          <div ref={remoteVideoRef} className="remote-video">
            {!remoteVideoTrack && (
              <div className="video-placeholder">
                <span className="placeholder-text">
                  {isConnected ? `等待 ${partnerName} 加入...` : '點擊下方按鈕開始通話'}
                </span>
              </div>
            )}
          </div>
          {remoteVideoTrack && <div className="partner-name">{partnerName}</div>}
        </div>

        {/* 本地視訊（小畫面） */}
        <div className="local-video-container">
          <div ref={localVideoRef} className="local-video">
            {!localVideoTrack && (
              <div className="video-placeholder small">
                <span>我</span>
              </div>
            )}
          </div>
        </div>

        {/* 狀態訊息 */}
        {status && (
          <div className="status-message">
            {status}
          </div>
        )}

        {/* 錯誤訊息 */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* 控制按鈕 */}
        <div className="video-controls">
          {!isConnected ? (
            <>
              <button
                onClick={() => startCall(true)}
                className="control-btn start-btn"
                disabled={isConnecting}
              >
                {isConnecting ? '連接中...' : '📹 視訊通話'}
              </button>
              <button
                onClick={() => startCall(false)}
                className="control-btn start-btn audio-only"
                disabled={isConnecting}
              >
                {isConnecting ? '連接中...' : '🎤 僅語音'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleMute}
                className={`control-btn ${isMuted ? 'active' : ''}`}
                title={isMuted ? '取消靜音' : '靜音'}
              >
                {isMuted ? '🔇' : '🎤'}
              </button>
              {localVideoTrack && (
                <button
                  onClick={toggleVideo}
                  className={`control-btn ${isVideoOff ? 'active' : ''}`}
                  title={isVideoOff ? '開啟視訊' : '關閉視訊'}
                >
                  {isVideoOff ? '📷' : '🎥'}
                </button>
              )}
              <button
                onClick={endCall}
                className="control-btn end-btn"
                title="結束通話"
              >
                📞
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="control-btn close-btn"
            title="關閉"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
