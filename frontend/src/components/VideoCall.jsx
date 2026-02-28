// src/components/VideoCall.jsx
// 視訊通話元件（含即時語音翻譯）

import { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { io } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import './VideoCall.css';

// 設定 Agora SDK 日誌等級
AgoraRTC.setLogLevel(1); // 0: DEBUG, 1: INFO, 2: WARNING, 3: ERROR, 4: NONE

const WS_URL = import.meta.env.VITE_API_URL?.replace('http', 'ws') || 'ws://localhost:3000';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function VideoCall({ matchId, partnerName, onClose }) {
  const { user } = useAuth();

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

  // 語音翻譯狀態
  const [isTranslating, setIsTranslating] = useState(false);
  const [mySubtitle, setMySubtitle] = useState('');
  const [partnerSubtitle, setPartnerSubtitle] = useState('');
  const [latency, setLatency] = useState(0);

  // Debug: 監聽字幕 state 變化
  useEffect(() => {
    console.log('[DEBUG] mySubtitle 變化:', mySubtitle);
  }, [mySubtitle]);

  useEffect(() => {
    console.log('[DEBUG] partnerSubtitle 變化:', partnerSubtitle);
  }, [partnerSubtitle]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const startCallRef = useRef(null);

  // 語音翻譯 refs
  const voiceWsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const socketRef = useRef(null);  // Socket.IO for receiving translations

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

    // 自動開始通話
    startCallRef.current?.();

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
        // 手機瀏覽器可能需要不同的音訊配置
        const audioConfigs = [
          { AEC: true, ANS: true, AGC: true }, // 啟用回音消除、降噪、自動增益
          {}, // 預設配置
        ];

        let audioError = null;
        for (let i = 0; i < audioConfigs.length; i++) {
          try {
            console.log(`[VideoCall] Trying audio config ${i + 1}:`, audioConfigs[i]);
            audioTrack = await AgoraRTC.createMicrophoneAudioTrack(audioConfigs[i]);
            console.log('[VideoCall] Audio config succeeded:', i + 1);
            break;
          } catch (configErr) {
            console.warn(`[VideoCall] Audio config ${i + 1} failed:`, configErr.message);
            audioError = configErr;
            audioTrack = null;
          }
        }

        if (audioTrack) {
          localAudioTrackRef.current = audioTrack;
          setLocalAudioTrack(audioTrack);
          console.log('[VideoCall] Got audio track');
        } else {
          console.warn('[VideoCall] 無法取得麥克風:', audioError?.message);
        }
      } catch (audioErr) {
        console.warn('[VideoCall] 無法取得麥克風:', audioErr.message);
      }

      // 嘗試取得相機
      if (withVideo) {
        try {
          // 手機瀏覽器需要指定 facingMode 和較低的解析度
          const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
          console.log('[VideoCall] Device type:', isMobile ? 'Mobile' : 'Desktop');

          // 嘗試不同的相機配置
          const cameraConfigs = [
            // 配置 1: 手機前置鏡頭，低解析度
            {
              facingMode: 'user',
              encoderConfig: isMobile ? '480p_1' : '720p_1',
            },
            // 配置 2: 不指定 facingMode
            {
              encoderConfig: isMobile ? '480p_1' : '720p_1',
            },
            // 配置 3: 最基本配置
            {},
          ];

          let cameraError = null;
          for (let i = 0; i < cameraConfigs.length; i++) {
            try {
              console.log(`[VideoCall] Trying camera config ${i + 1}:`, cameraConfigs[i]);
              videoTrack = await AgoraRTC.createCameraVideoTrack(cameraConfigs[i]);
              console.log('[VideoCall] Camera config succeeded:', i + 1);
              break; // 成功就跳出
            } catch (configErr) {
              console.warn(`[VideoCall] Camera config ${i + 1} failed:`, configErr.message);
              cameraError = configErr;
              videoTrack = null;
            }
          }

          if (!videoTrack) {
            throw cameraError || new Error('All camera configs failed');
          }

          localVideoTrackRef.current = videoTrack;
          setLocalVideoTrack(videoTrack);
          console.log('[VideoCall] Got video track');

          // 顯示本地視訊
          if (localVideoRef.current) {
            videoTrack.play(localVideoRef.current);
          }
        } catch (videoErr) {
          console.warn('[VideoCall] 無法取得相機:', videoErr.message, videoErr);
          setError(`相機無法使用：${videoErr.message || '未知錯誤'}，僅語音模式`);
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

  // 儲存 startCall 到 ref，讓 useEffect 可以呼叫
  startCallRef.current = () => startCall(true);

  // 自動開始通話
  useEffect(() => {
    if (isReady && !isConnected && !isConnecting) {
      console.log('[VideoCall] Auto-starting call...');
      startCall(true);
    }
  }, [isReady]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // === 語音翻譯功能 ===

  // 播放翻譯後的語音
  const playTranslatedAudio = useCallback(async (base64Audio) => {
    console.log('[DEBUG] playTranslatedAudio 被呼叫');
    console.log('[DEBUG] base64Audio 長度:', base64Audio?.length);
    try {
      if (!audioContextRef.current) {
        console.log('[DEBUG] 建立新的 AudioContext');
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      console.log('[DEBUG] 解碼 base64...');
      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      console.log('[DEBUG] audioData 長度:', audioData.length);

      console.log('[DEBUG] decodeAudioData...');
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.buffer);
      console.log('[DEBUG] audioBuffer 時長:', audioBuffer.duration, '秒');

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
      console.log('[DEBUG] 音訊播放開始!');
    } catch (err) {
      console.error('[DEBUG] 播放翻譯語音失敗:', err);
    }
  }, []);

  // 開始語音翻譯
  const startTranslation = useCallback(async () => {
    if (isTranslating) return;

    const token = localStorage.getItem('token');
    const direction = user?.role === 'taiwan' ? 'zh-to-vi' : 'vi-to-zh';

    console.log('========== [DEBUG] 開始語音翻譯 ==========');
    console.log('[DEBUG] user:', user);
    console.log('[DEBUG] user.id:', user?.id);
    console.log('[DEBUG] user.role:', user?.role);
    console.log('[DEBUG] direction:', direction);
    console.log('[DEBUG] matchId:', matchId);
    console.log('[DEBUG] API_URL:', API_URL);
    console.log('[DEBUG] WS_URL:', WS_URL);

    // 1. 連接 Socket.IO 來接收對方的翻譯
    console.log('[DEBUG] 步驟1: 連接 Socket.IO...');
    socketRef.current = io(API_URL);

    socketRef.current.on('connect', () => {
      console.log('[DEBUG] Socket.IO 連線成功! socket.id:', socketRef.current.id);
      // 加入 match room 以接收對方的翻譯
      console.log('[DEBUG] 發送 chat:join, matchId:', matchId);
      socketRef.current.emit('chat:join', matchId);
    });

    socketRef.current.on('connect_error', (err) => {
      console.error('[DEBUG] Socket.IO 連線錯誤:', err);
    });

    // 接收對方的翻譯（播放語音 + 顯示字幕）
    socketRef.current.on('voice:translation', (data) => {
      console.log('========== [DEBUG] 收到 voice:translation ==========');
      console.log('[DEBUG] data:', data);
      console.log('[DEBUG] data.from:', data.from);
      console.log('[DEBUG] user.id:', user?.id);
      console.log('[DEBUG] data.from === user.id?', data.from === user?.id);

      // 忽略自己發出的翻譯
      if (data.from === user?.id) {
        console.log('[DEBUG] 這是自己發的翻譯，忽略');
        return;
      }

      console.log('[DEBUG] 這是對方的翻譯，準備顯示字幕和播放音訊');
      console.log('[DEBUG] originalText:', data.originalText);
      console.log('[DEBUG] translatedText:', data.translatedText);
      console.log('[DEBUG] audio 長度:', data.audio?.length);

      // 顯示對方說的話（翻譯後的版本）
      setPartnerSubtitle(data.translatedText);
      setLatency(data.latency || 0);

      // 播放翻譯後的語音（這是對方說的話，翻譯成我的語言）
      if (data.audio) {
        console.log('[DEBUG] 播放翻譯語音...');
        playTranslatedAudio(data.audio);
      }

      // 5 秒後清除字幕
      setTimeout(() => {
        setPartnerSubtitle('');
      }, 5000);
    });

    // 2. 連接語音翻譯 WebSocket（發送自己的語音）
    const wsUrl = `${WS_URL}/ws/voice?token=${token}&direction=${direction}&matchId=${matchId}`;
    console.log('[DEBUG] 步驟2: 連接 Voice WebSocket...');
    console.log('[DEBUG] wsUrl:', wsUrl);
    voiceWsRef.current = new WebSocket(wsUrl);

    voiceWsRef.current.onopen = () => {
      console.log('[DEBUG] Voice WebSocket 連線成功!');
      setStatus('翻譯已開啟');
    };

    voiceWsRef.current.onmessage = (event) => {
      console.log('[DEBUG] Voice WebSocket 收到訊息:', event.data);
      try {
        const data = JSON.parse(event.data);
        console.log('[DEBUG] 解析後的資料:', data);
        console.log('[DEBUG] data.type:', data.type);

        // 只處理自己說的話（顯示字幕，不播放音訊）
        if (data.type === 'my-speech') {
          console.log('[DEBUG] ===== 收到 my-speech =====');
          console.log('[DEBUG] originalText:', data.originalText);
          console.log('[DEBUG] 準備呼叫 setMySubtitle...');

          // 顯示我說的話
          setMySubtitle(data.originalText);
          console.log('[DEBUG] setMySubtitle 已呼叫，值:', data.originalText);

          setLatency(data.latency?.total || 0);

          // 5 秒後清除字幕
          setTimeout(() => {
            console.log('[DEBUG] 5秒到，清除 mySubtitle');
            setMySubtitle('');
          }, 5000);
        } else if (data.type === 'connected') {
          console.log('[DEBUG] Voice WS 連線確認:', data.message);
        } else if (data.type === 'error') {
          console.error('[DEBUG] 翻譯錯誤:', data.message);
        } else {
          console.log('[DEBUG] 未知的訊息類型:', data.type);
        }
      } catch (err) {
        console.error('[DEBUG] 解析 WebSocket 訊息失敗:', err);
      }
    };

    voiceWsRef.current.onerror = (err) => {
      console.error('[DEBUG] Voice WebSocket 錯誤:', err);
    };

    voiceWsRef.current.onclose = (event) => {
      console.log('[DEBUG] Voice WebSocket 關閉, code:', event.code, 'reason:', event.reason);
    };

    // 3. 開始錄音
    console.log('[DEBUG] 步驟3: 開始錄音...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[DEBUG] 取得麥克風成功');

      // 診斷：檢查瀏覽器支援的 mimeType
      console.log('[DEBUG] ===== MediaRecorder mimeType 診斷 =====');
      console.log('[DEBUG] audio/webm;codecs=opus 支援:', MediaRecorder.isTypeSupported('audio/webm;codecs=opus'));
      console.log('[DEBUG] audio/webm 支援:', MediaRecorder.isTypeSupported('audio/webm'));
      console.log('[DEBUG] audio/ogg;codecs=opus 支援:', MediaRecorder.isTypeSupported('audio/ogg;codecs=opus'));
      console.log('[DEBUG] audio/mp4 支援:', MediaRecorder.isTypeSupported('audio/mp4'));
      console.log('[DEBUG] audio/wav 支援:', MediaRecorder.isTypeSupported('audio/wav'));

      // 選擇支援的 mimeType
      let selectedMimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
        if (MediaRecorder.isTypeSupported('audio/webm')) {
          selectedMimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          selectedMimeType = 'audio/ogg;codecs=opus';
        } else {
          selectedMimeType = ''; // 使用瀏覽器預設
        }
      }
      console.log('[DEBUG] 選擇的 mimeType:', selectedMimeType);

      const recorderOptions = selectedMimeType ? { mimeType: selectedMimeType } : {};
      mediaRecorderRef.current = new MediaRecorder(stream, recorderOptions);
      console.log('[DEBUG] 實際使用的 mimeType:', mediaRecorderRef.current.mimeType);

      let chunkCount = 0;
      mediaRecorderRef.current.ondataavailable = (event) => {
        chunkCount++;
        console.log(`[DEBUG] 錄音片段 #${chunkCount}, 大小: ${event.data.size} bytes`);
        if (event.data.size > 0 && voiceWsRef.current?.readyState === WebSocket.OPEN) {
          console.log('[DEBUG] 發送音訊到 WebSocket...');
          voiceWsRef.current.send(event.data);
        } else {
          console.log('[DEBUG] 無法發送: size=', event.data.size, 'wsState=', voiceWsRef.current?.readyState);
        }
      };

      // 每 2 秒傳一次音訊片段
      mediaRecorderRef.current.start(2000);
      setIsTranslating(true);
      console.log('[DEBUG] 錄音開始，每 2 秒發送一次');
    } catch (err) {
      console.error('[DEBUG] 錄音啟動失敗:', err);
      setError('無法啟用麥克風錄音');
    }
  }, [isTranslating, user?.role, user?.id, matchId, playTranslatedAudio]);

  // 停止語音翻譯
  const stopTranslation = useCallback(() => {
    console.log('[VideoCall] Stopping translation');

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }

    if (voiceWsRef.current) {
      voiceWsRef.current.close();
      voiceWsRef.current = null;
    }

    // 關閉 Socket.IO 連接
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsTranslating(false);
    setMySubtitle('');
    setPartnerSubtitle('');
    setStatus('');
  }, []);

  // 元件卸載時清理 - 使用 refs 確保正確清理
  useEffect(() => {
    return () => {
      console.log('[VideoCall] Component unmounting, cleaning up...');

      // 清理語音翻譯
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop());
      }
      if (voiceWsRef.current) {
        voiceWsRef.current.close();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

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
                  {isConnecting ? '連接中...' : isConnected ? `等待 ${partnerName} 的畫面...` : '準備中...'}
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

        {/* 字幕區域 - 放在最外層確保顯示 */}
        {partnerSubtitle && (
          <div className="subtitle partner-subtitle" style={{ zIndex: 999 }}>
            <span className="subtitle-label">{partnerName}:</span> {partnerSubtitle}
          </div>
        )}
        {mySubtitle && (
          <div className="subtitle my-subtitle" style={{ zIndex: 999 }}>
            <span className="subtitle-label">我:</span> {mySubtitle}
          </div>
        )}

        {/* 翻譯延遲指示器 */}
        {isTranslating && latency > 0 && (
          <div className="latency-indicator">
            AI 翻譯延遲: {(latency / 1000).toFixed(1)}s
          </div>
        )}

        {/* DEBUG: 測試字幕按鈕 */}
        <button
          onClick={() => {
            console.log('[DEBUG] 測試字幕按鈕被點擊');
            setMySubtitle('測試：我說的話');
            setPartnerSubtitle('Test: Partner speech');
            setTimeout(() => {
              setMySubtitle('');
              setPartnerSubtitle('');
            }, 3000);
          }}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 9999,
            padding: '10px',
            background: 'red',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          測試字幕
        </button>

        {/* DEBUG: 顯示當前字幕狀態 */}
        <div style={{
          position: 'absolute',
          top: '50px',
          right: '10px',
          zIndex: 9999,
          padding: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: 'lime',
          fontSize: '12px',
          maxWidth: '200px',
        }}>
          mySubtitle: "{mySubtitle}"<br/>
          partnerSubtitle: "{partnerSubtitle}"
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
          {/* 翻譯開關按鈕 */}
          <button
            onClick={isTranslating ? stopTranslation : startTranslation}
            className={`control-btn ${isTranslating ? 'active translate-on' : ''}`}
            title={isTranslating ? '關閉翻譯' : '開啟翻譯'}
            disabled={!isConnected}
          >
            {isTranslating ? '🌐' : '🗣️'}
          </button>

          {/* 靜音按鈕 */}
          <button
            onClick={toggleMute}
            className={`control-btn ${isMuted ? 'active' : ''}`}
            title={isMuted ? '取消靜音' : '靜音'}
            disabled={!localAudioTrack}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>

          {/* 視訊開關按鈕 */}
          <button
            onClick={toggleVideo}
            className={`control-btn ${isVideoOff ? 'active' : ''}`}
            title={isVideoOff ? '開啟視訊' : '關閉視訊'}
            disabled={!localVideoTrack}
          >
            {isVideoOff ? '📷' : '🎥'}
          </button>

          {/* 結束通話按鈕 */}
          <button
            onClick={endCall}
            className="control-btn end-btn"
            title="結束通話"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  );
}
