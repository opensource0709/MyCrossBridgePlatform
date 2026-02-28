// src/components/VideoCall.jsx
// 視訊通話元件

import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import api from '../services/api';
import './VideoCall.css';

export default function VideoCall({ matchId, partnerId, partnerName, onClose }) {
  const [client] = useState(() =>
    AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
  );
  const [localVideoTrack, setLocalVideoTrack] = useState(null);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [error, setError] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // 開始視訊通話
  const startCall = async (withVideo = true) => {
    setIsConnecting(true);
    setError(null);

    try {
      // 1. 取得 Agora Token
      const response = await api.post('/api/agora/token', {
        channelName: matchId
      });
      const { token, appId } = response.data;

      // 2. 加入頻道
      await client.join(appId, matchId, token, null);

      // 3. 建立本地軌道
      const tracks = [];

      // 嘗試取得麥克風
      try {
        const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        setLocalAudioTrack(audioTrack);
        tracks.push(audioTrack);
      } catch (audioErr) {
        console.warn('[VideoCall] 無法取得麥克風:', audioErr);
      }

      // 嘗試取得相機（如果選擇開啟視訊）
      if (withVideo) {
        try {
          const videoTrack = await AgoraRTC.createCameraVideoTrack();
          setLocalVideoTrack(videoTrack);
          tracks.push(videoTrack);

          // 顯示本地視訊
          if (localVideoRef.current) {
            videoTrack.play(localVideoRef.current);
          }
        } catch (videoErr) {
          console.warn('[VideoCall] 無法取得相機:', videoErr);
          setError('相機被其他程式使用中，僅使用語音');
        }
      }

      // 4. 發布軌道到頻道
      if (tracks.length > 0) {
        await client.publish(tracks);
      }

      setIsConnected(true);
      console.log('[VideoCall] Connected to channel:', matchId);
    } catch (err) {
      console.error('[VideoCall] Failed to start call:', err);
      setError(err.message || '無法開始通話');
    } finally {
      setIsConnecting(false);
    }
  };

  // 監聽遠端用戶
  useEffect(() => {
    // 當遠端用戶發布媒體時
    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      console.log('[VideoCall] Subscribed to user:', user.uid, mediaType);

      if (mediaType === 'video') {
        setRemoteVideoTrack(user.videoTrack);
        if (remoteVideoRef.current) {
          user.videoTrack.play(remoteVideoRef.current);
        }
      }
      if (mediaType === 'audio') {
        user.audioTrack.play();
      }
    });

    // 當遠端用戶取消發布時
    client.on('user-unpublished', (user, mediaType) => {
      console.log('[VideoCall] User unpublished:', user.uid, mediaType);
      if (mediaType === 'video') {
        setRemoteVideoTrack(null);
      }
    });

    // 當遠端用戶離開時
    client.on('user-left', (user) => {
      console.log('[VideoCall] User left:', user.uid);
      setRemoteVideoTrack(null);
    });

    return () => {
      client.removeAllListeners();
    };
  }, [client]);

  // 結束通話
  const endCall = async () => {
    try {
      // 關閉本地軌道
      localAudioTrack?.close();
      localVideoTrack?.close();

      // 離開頻道
      await client.leave();

      setLocalAudioTrack(null);
      setLocalVideoTrack(null);
      setRemoteVideoTrack(null);
      setIsConnected(false);

      console.log('[VideoCall] Call ended');
      onClose?.();
    } catch (err) {
      console.error('[VideoCall] Error ending call:', err);
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
      client.leave().catch(() => {});
    };
  }, [client, localAudioTrack, localVideoTrack]);

  return (
    <div className="video-call-overlay">
      <div className="video-call-container">
        {/* 遠端視訊（大畫面） */}
        <div className="remote-video-container">
          <div ref={remoteVideoRef} className="remote-video">
            {!remoteVideoTrack && isConnected && (
              <div className="video-placeholder">
                <span className="placeholder-text">等待 {partnerName} 加入...</span>
              </div>
            )}
          </div>
          <div className="partner-name">{partnerName}</div>
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
              <button
                onClick={toggleVideo}
                className={`control-btn ${isVideoOff ? 'active' : ''}`}
                title={isVideoOff ? '開啟視訊' : '關閉視訊'}
              >
                {isVideoOff ? '📷' : '🎥'}
              </button>
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
