// src/components/VideoCall.jsx
// 視訊通話元件

import { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import api from '../services/api';
import './VideoCall.css';

// 設定 Agora SDK 日誌等級
AgoraRTC.setLogLevel(1); // 0: DEBUG, 1: INFO, 2: WARNING, 3: ERROR, 4: NONE

export default function VideoCall({ matchId, partnerName, onClose }) {
  // 使用 ref 來保存 tracks，確保 cleanup 時可以正確存取
  const clientRef = useRef(null);
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);

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
  const [isReady, setIsReady] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // 初始化 Agora client
  useEffect(() => {
    // 創建新的 client
    console.log('[VideoCall] Creating new Agora client');
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

    // 監聯連線狀態
    client.on('connection-state-change', (curState, prevState) => {
      console.log('[VideoCall] Connection state:', prevState, '->', curState);
      if (curState === 'DISCONNECTED') {
        setIsConnected(false);
        setStatus('已斷線');
      }
    });

    setIsReady(true);
    console.log('[VideoCall] Client initialized and ready');

    return () => {
      // 清理
      console.log('[VideoCall] Cleaning up client listeners');
      client.removeAllListeners();
    };
  }, []);

  // 開始通話
  const startCall = async (withVideo = true) => {
    if (isConnecting || isConnected) return;

    const client = clientRef.current;
    if (!client) {
      setError('系統初始化中，請稍後再試');
      return;
    }

    setIsConnecting(true);
    setError(null);
    setStatus('正在連接...');

    // 在 try 外部定義，讓 catch 可以存取
    let audioTrack = null;
    let videoTrack = null;

    try {
      // 檢查連線狀態，如果已連線則先離開
      console.log('[VideoCall] Current connection state:', client.connectionState);
      if (client.connectionState !== 'DISCONNECTED') {
        console.log('[VideoCall] Leaving previous channel...');
        await client.leave();
        // 等待一下確保狀態更新
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 1. 取得 Agora Token
      setStatus('取得授權...');
      const response = await api.post('/api/agora/token', {
        channelName: matchId
      });
      const { token, appId, uid: tokenUid } = response.data;
      console.log('[VideoCall] Got token for channel:', matchId, 'appId:', appId);

      // 2. 加入頻道 (使用 token 中的 uid，如果是 0 則讓 SDK 自動分配)
      setStatus('加入頻道...');
      const joinUid = tokenUid === 0 ? null : tokenUid;
      console.log('[VideoCall] Joining channel:', matchId, 'with uid:', joinUid);

      let actualUid;
      try {
        console.log('[VideoCall] Calling client.join...');
        actualUid = await client.join(appId, matchId, token, joinUid);
        console.log('[VideoCall] client.join() returned, uid:', actualUid);
        console.log('[VideoCall] Connection state immediately after join:', client.connectionState);
      } catch (joinError) {
        console.error('[VideoCall] Join failed with error:', joinError);
        console.error('[VideoCall] Error name:', joinError.name);
        console.error('[VideoCall] Error code:', joinError.code);
        throw new Error(`加入頻道失敗: ${joinError.message || joinError.code || 'Unknown error'}`);
      }

      // 等待連線狀態變成 CONNECTED
      let waitCount = 0;
      while (client.connectionState !== 'CONNECTED' && waitCount < 10) {
        console.log('[VideoCall] Waiting for CONNECTED state, current:', client.connectionState);
        await new Promise(resolve => setTimeout(resolve, 200));
        waitCount++;
      }

      if (client.connectionState !== 'CONNECTED') {
        console.error('[VideoCall] Failed to reach CONNECTED state, current:', client.connectionState);
        throw new Error('無法連接到頻道，請重試');
      }

      console.log('[VideoCall] Connection state confirmed CONNECTED');

      // 3. 建立本地軌道
      setStatus('取得麥克風和相機...');

      // 嘗試取得麥克風
      try {
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        localAudioTrackRef.current = audioTrack;
        setLocalAudioTrack(audioTrack);
        console.log('[VideoCall] Got audio track');
      } catch (audioErr) {
        console.warn('[VideoCall] 無法取得麥克風:', audioErr.message);
      }

      // 嘗試取得相機
      if (withVideo) {
        try {
          videoTrack = await AgoraRTC.createCameraVideoTrack();
          localVideoTrackRef.current = videoTrack;
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

      // 確認已成功加入頻道
      if (client.connectionState !== 'CONNECTED') {
        throw new Error('加入頻道失敗，請重試');
      }

      if (tracksToPublish.length > 0) {
        console.log('[VideoCall] Publishing tracks...');
        await client.publish(tracksToPublish);
        console.log('[VideoCall] Published tracks:', tracksToPublish.length);
      } else {
        console.warn('[VideoCall] No tracks to publish');
      }

      setIsConnected(true);
      setStatus('已連接，等待對方加入...');
      console.log('[VideoCall] Connected to channel:', matchId);

    } catch (err) {
      console.error('[VideoCall] Failed to start call:', err);
      setError(err.message || '無法開始通話');
      setStatus('連接失敗');

      // 清理 - 使用局部變數而非 state
      if (audioTrack) {
        audioTrack.stop();
        audioTrack.close();
      }
      if (videoTrack) {
        videoTrack.stop();
        videoTrack.close();
      }
      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;
      setLocalAudioTrack(null);
      setLocalVideoTrack(null);

      try {
        if (client.connectionState !== 'DISCONNECTED') {
          await client.leave();
        }
      } catch (e) {
        console.warn('[VideoCall] Error leaving channel:', e);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // 結束通話 - 使用 useCallback 確保穩定的引用
  const endCall = useCallback(async () => {
    const client = clientRef.current;
    console.log('[VideoCall] Ending call...');

    try {
      // 停止並關閉本地音訊軌道 - 使用 ref 確保取得最新的 track
      const audioTrack = localAudioTrackRef.current;
      if (audioTrack) {
        console.log('[VideoCall] Stopping audio track');
        try {
          audioTrack.stop();
          audioTrack.close();
        } catch (e) {
          console.warn('[VideoCall] Error stopping audio track:', e);
        }
      }

      // 停止並關閉本地視訊軌道 - 使用 ref 確保取得最新的 track
      const videoTrack = localVideoTrackRef.current;
      if (videoTrack) {
        console.log('[VideoCall] Stopping video track');
        try {
          videoTrack.stop();
          videoTrack.close();
        } catch (e) {
          console.warn('[VideoCall] Error stopping video track:', e);
        }
      }

      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;
      setLocalAudioTrack(null);
      setLocalVideoTrack(null);
      setRemoteVideoTrack(null);
      setRemoteAudioTrack(null);

      // 離開頻道
      if (client && client.connectionState !== 'DISCONNECTED') {
        console.log('[VideoCall] Leaving channel...');
        await client.leave();
      }

      setIsConnected(false);
      setStatus('');
      console.log('[VideoCall] Call ended successfully');
      onClose?.();
    } catch (err) {
      console.error('[VideoCall] Error ending call:', err);
      onClose?.();
    }
  }, [onClose]);

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

  // 元件卸載時清理 - 使用 refs 確保正確清理
  useEffect(() => {
    return () => {
      console.log('[VideoCall] Component unmounting, cleaning up...');

      // 使用 refs 而非 state 來確保取得最新的 track
      const audioTrack = localAudioTrackRef.current;
      if (audioTrack) {
        console.log('[VideoCall] Cleanup: stopping audio track');
        try {
          audioTrack.stop();
          audioTrack.close();
        } catch (e) {
          console.warn('[VideoCall] Cleanup: error stopping audio:', e);
        }
      }

      const videoTrack = localVideoTrackRef.current;
      if (videoTrack) {
        console.log('[VideoCall] Cleanup: stopping video track');
        try {
          videoTrack.stop();
          videoTrack.close();
        } catch (e) {
          console.warn('[VideoCall] Cleanup: error stopping video:', e);
        }
      }

      const client = clientRef.current;
      if (client && client.connectionState !== 'DISCONNECTED') {
        client.leave().catch((e) => {
          console.warn('[VideoCall] Error leaving on unmount:', e);
        });
      }
    };
  }, []); // 空依賴陣列，只在 unmount 時執行

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
            onClick={endCall}
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
