// src/pages/Diagnostic.jsx
// 測試診斷頁面 - 第四階段：自動校準流程

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Diagnostic.css';

// API 基礎 URL
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// localStorage key for calibration data
const CALIBRATION_KEY = 'voiceCalibration';

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
  const [peakVolume, setPeakVolume] = useState(0);
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [error, setError] = useState('');

  // 翻譯測試狀態
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [direction, setDirection] = useState('zh-to-vi');
  const [translationResult, setTranslationResult] = useState(null);
  const [translationHistory, setTranslationHistory] = useState([]);

  // 連續模式狀態
  const [translationMode, setTranslationMode] = useState('button'); // 'button' | 'continuous'
  const [continuousStatus, setContinuousStatus] = useState('idle'); // 'idle' | 'listening' | 'speaking' | 'processing'
  const [isContinuousActive, setIsContinuousActive] = useState(false); // 連續模式是否啟動
  const [isCalibrated, setIsCalibrated] = useState(false); // 是否已校準

  // TTS 狀態
  const [playingTtsId, setPlayingTtsId] = useState(null); // 正在播放的項目 ID
  const [ttsError, setTtsError] = useState('');

  // 校準狀態（新版簡化設計）
  const [calibrationStep, setCalibrationStep] = useState(0); // 0=待機, 1=靜音採樣中, 2=說話採樣中
  const [calibrationProgress, setCalibrationProgress] = useState(0); // 0-100
  const [calibrationMessage, setCalibrationMessage] = useState('');

  // 四個可手動調整的校準值
  const [silenceAvg, setSilenceAvg] = useState(5);     // 靜音平均值
  const [speechMax, setSpeechMax] = useState(40);      // 說話最大值
  const [threshold, setThreshold] = useState(22);       // 判斷門檻
  const [sentenceEndWait, setSentenceEndWait] = useState(500); // 句尾等待時間 (ms)

  // 即時說話狀態（使用滑動延伸邏輯）
  const [isSpeakingNow, setIsSpeakingNow] = useState(false);
  const speakingEndTimeRef = useRef(0); // 說話狀態結束時間（滑動延伸用）

  // 曲線圖狀態
  const [isChartPaused, setIsChartPaused] = useState(false); // 曲線圖是否暫停
  const [hoverInfo, setHoverInfo] = useState(null); // 滑鼠懸停資訊 { x, time, volume }

  // Refs
  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const spectrumCanvasRef = useRef(null);
  const peakVolumeTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const calibrationSamplesRef = useRef([]); // 校準時收集的音量樣本
  const calibrationIntervalRef = useRef(null);
  const currentVolumeRef = useRef(0); // 即時音量 ref
  const volumeHistoryRef = useRef([]); // 音量歷史（最近 10 秒）
  const calibrationChartRef = useRef(null); // 校準曲線圖 canvas
  const calibrationChartAnimationRef = useRef(null); // 校準曲線圖動畫

  // 連續模式 VAD 相關 refs
  const audioQueueRef = useRef([]); // Queue 緩衝：保留最近 300ms 的音訊
  const continuousRecorderRef = useRef(null); // 連續模式的 MediaRecorder
  const continuousChunksRef = useRef([]); // 連續模式錄音的音訊片段
  const vadSpeakingRef = useRef(false); // VAD 說話狀態
  const vadEndTimeRef = useRef(0); // VAD 說話結束時間
  const vadCheckIntervalRef = useRef(null); // VAD 檢查間隔
  const queueRecorderRef = useRef(null); // Queue 緩衝用的 MediaRecorder

  // 載入已儲存的校準資料
  useEffect(() => {
    const saved = localStorage.getItem(CALIBRATION_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setSilenceAvg(data.silenceAvg || 5);
        setSpeechMax(data.speechMax || 40);
        setThreshold(data.threshold || 22);
        setSentenceEndWait(data.sentenceEndWait || 500);
        setIsCalibrated(true);
        console.log('[校準] 載入已儲存的校準資料:', data);
      } catch (e) {
        console.error('[校準] 無法解析已儲存的校準資料');
        setIsCalibrated(false);
      }
    } else {
      setIsCalibrated(false);
    }
  }, []);

  // 自動更新判斷門檻（當靜音平均值或說話最大值改變時）
  const updateThresholdAuto = useCallback(() => {
    const newThreshold = Math.round((silenceAvg + speechMax) / 2);
    setThreshold(newThreshold);
  }, [silenceAvg, speechMax]);

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

        // 開始監測音量與繪製視覺化
        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        const timeDomainData = new Uint8Array(analyser.fftSize);

        const updateVisualization = () => {
          // 取得頻域資料（用於頻譜圖和音量）
          analyser.getByteFrequencyData(frequencyData);
          // 取得時域資料（用於波形圖）
          analyser.getByteTimeDomainData(timeDomainData);

          // 計算音量
          const average = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
          setMicVolume(average);
          currentVolumeRef.current = average; // 同步更新 ref（供校準使用）

          // 更新峰值音量（保持 1 秒）
          if (average > peakVolume) {
            setPeakVolume(average);
            if (peakVolumeTimeoutRef.current) {
              clearTimeout(peakVolumeTimeoutRef.current);
            }
            peakVolumeTimeoutRef.current = setTimeout(() => {
              setPeakVolume(0);
            }, 1000);
          }

          // 繪製波形圖
          drawWaveform(timeDomainData);
          // 繪製頻譜圖
          drawSpectrum(frequencyData);

          animationFrameRef.current = requestAnimationFrame(updateVisualization);
        };

        updateVisualization();
      } catch (err) {
        console.error('麥克風啟動失敗:', err);
        setError('麥克風啟動失敗: ' + err.message);
      }
    };

    startMicMonitor();
  }, [selectedMicrophone]);

  // 繪製波形圖（時域）
  const drawWaveform = (dataArray) => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 清除畫布
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    // 繪製波形
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4CAF50';
    ctx.beginPath();

    const sliceWidth = width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0; // 轉換為 0-2 範圍
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // 繪製中線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  };

  // 繪製頻譜圖（頻域 FFT）
  const drawSpectrum = (dataArray) => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 清除畫布
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    // 繪製頻譜條
    const barCount = dataArray.length;
    const barWidth = width / barCount;
    const barGap = 1;

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i];
      const barHeight = (value / 255) * height;

      // 漸層顏色：低頻綠色 -> 中頻黃色 -> 高頻紅色
      const hue = 120 - (i / barCount) * 120; // 120=綠, 60=黃, 0=紅
      const saturation = 80;
      const lightness = 50;

      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.fillRect(
        i * barWidth + barGap / 2,
        height - barHeight,
        barWidth - barGap,
        barHeight
      );
    }

    // 繪製頻率標籤
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px monospace';
    ctx.fillText('低頻', 5, height - 5);
    ctx.fillText('高頻', width - 30, height - 5);
  };

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

  // 開始錄音（按下按鈕）
  const startRecording = async () => {
    if (!micStreamRef.current) {
      setError('麥克風未啟動');
      return;
    }

    try {
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(micStreamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        await processRecording();
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setTranslationResult(null);
    } catch (err) {
      console.error('錄音啟動失敗:', err);
      setError('錄音啟動失敗: ' + err.message);
    }
  };

  // 停止錄音（放開按鈕）
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  // 處理錄音並送出翻譯
  const processRecording = async () => {
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

      // 檢查音訊大小
      if (audioBlob.size < 1000) {
        setTranslationResult({
          success: false,
          error: '錄音太短，請說久一點',
        });
        setIsProcessing(false);
        return;
      }

      // 轉換為 base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];

        try {
          const response = await fetch(`${API_BASE}/api/diagnostic/translate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audio: base64Audio,
              direction,
            }),
          });

          const result = await response.json();

          setTranslationResult(result);

          // 加入歷史記錄
          if (result.success) {
            setTranslationHistory(prev => [
              {
                ...result,
                timestamp: new Date().toISOString(),
              },
              ...prev.slice(0, 9), // 只保留最近 10 筆
            ]);
          }
        } catch (err) {
          console.error('翻譯 API 錯誤:', err);
          setTranslationResult({
            success: false,
            error: '無法連接伺服器: ' + err.message,
          });
        }

        setIsProcessing(false);
      };
    } catch (err) {
      console.error('處理錄音錯誤:', err);
      setTranslationResult({
        success: false,
        error: '處理錄音失敗: ' + err.message,
      });
      setIsProcessing(false);
    }
  };

  // 切換翻譯方向
  const toggleDirection = () => {
    setDirection(prev => prev === 'zh-to-vi' ? 'vi-to-zh' : 'zh-to-vi');
  };

  // 清除歷史
  const clearHistory = () => {
    setTranslationHistory([]);
    setTranslationResult(null);
  };

  // 播放 TTS 語音
  const playTts = async (text, targetLang, itemId = 'current') => {
    if (playingTtsId) return; // 已經在播放中

    setPlayingTtsId(itemId);
    setTtsError('');

    try {
      const response = await fetch(`${API_BASE}/api/diagnostic/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          language: targetLang,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'TTS 失敗');
      }

      // 播放音訊
      const audioData = `data:audio/mp3;base64,${result.audio}`;
      const audio = new Audio(audioData);

      // 設定輸出裝置（如果支援）
      if (selectedSpeaker && audio.setSinkId) {
        try {
          await audio.setSinkId(selectedSpeaker);
        } catch (e) {
          console.warn('無法設定輸出裝置:', e);
        }
      }

      audio.onended = () => {
        setPlayingTtsId(null);
      };

      audio.onerror = (e) => {
        console.error('音訊播放錯誤:', e);
        setTtsError('音訊播放失敗');
        setPlayingTtsId(null);
      };

      await audio.play();

    } catch (err) {
      console.error('TTS 錯誤:', err);
      setTtsError(err.message || 'TTS 失敗');
      setPlayingTtsId(null);
    }
  };

  // 取得翻譯後的目標語言
  const getTargetLang = (dir) => {
    return dir === 'zh-to-vi' ? 'vi' : 'zh';
  };

  // ========== 連續模式 VAD 功能 ==========

  // 啟動連續模式
  const startContinuousMode = useCallback(() => {
    if (!micStreamRef.current) {
      setError('麥克風未啟動');
      return;
    }

    if (!isCalibrated) {
      setError('請先進行校準');
      return;
    }

    console.log('[VAD] 啟動連續模式');
    setIsContinuousActive(true);
    setContinuousStatus('listening');
    vadSpeakingRef.current = false;
    vadEndTimeRef.current = 0;
    audioQueueRef.current = [];
    continuousChunksRef.current = [];

    // 啟動 Queue 緩衝錄音（持續錄音，保留最近 300ms）
    startQueueRecording();

    // 啟動 VAD 檢查
    vadCheckIntervalRef.current = setInterval(() => {
      checkVADStatus();
    }, 50); // 每 50ms 檢查一次

  }, [isCalibrated]);

  // 停止連續模式
  const stopContinuousMode = useCallback(() => {
    console.log('[VAD] 停止連續模式');
    setIsContinuousActive(false);
    setContinuousStatus('idle');

    // 停止 VAD 檢查
    if (vadCheckIntervalRef.current) {
      clearInterval(vadCheckIntervalRef.current);
      vadCheckIntervalRef.current = null;
    }

    // 停止 Queue 錄音
    if (queueRecorderRef.current && queueRecorderRef.current.state !== 'inactive') {
      queueRecorderRef.current.stop();
    }

    // 停止連續錄音
    if (continuousRecorderRef.current && continuousRecorderRef.current.state !== 'inactive') {
      continuousRecorderRef.current.stop();
    }

    vadSpeakingRef.current = false;
  }, []);

  // 啟動 Queue 緩衝錄音
  const startQueueRecording = useCallback(() => {
    if (!micStreamRef.current) return;

    try {
      const recorder = new MediaRecorder(micStreamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // 加入 Queue
          audioQueueRef.current.push({
            data: event.data,
            timestamp: Date.now(),
          });

          // 只保留最近 300ms 的音訊
          const cutoffTime = Date.now() - 300;
          audioQueueRef.current = audioQueueRef.current.filter(
            item => item.timestamp > cutoffTime
          );
        }
      };

      // 每 100ms 產生一個音訊片段
      recorder.start(100);
      queueRecorderRef.current = recorder;
      console.log('[VAD] Queue 緩衝錄音啟動');

    } catch (err) {
      console.error('[VAD] Queue 錄音啟動失敗:', err);
    }
  }, []);

  // 檢查 VAD 狀態
  const checkVADStatus = useCallback(() => {
    const currentVolume = currentVolumeRef.current;
    const now = Date.now();
    const exceedsThreshold = currentVolume > threshold;

    if (exceedsThreshold) {
      // 音量超過門檻
      if (!vadSpeakingRef.current) {
        // 剛開始說話 → 開始錄音
        console.log('[VAD] 偵測到說話起點, 音量:', currentVolume);
        vadSpeakingRef.current = true;
        setContinuousStatus('speaking');
        startContinuousRecording();
      }
      // 重置句尾計時器（滑動延伸）
      vadEndTimeRef.current = now + sentenceEndWait;

    } else if (vadSpeakingRef.current) {
      // 音量低於門檻，但還在說話狀態
      if (now > vadEndTimeRef.current) {
        // 超過句尾等待時間 → 說話結束
        console.log('[VAD] 偵測到說話終點');
        vadSpeakingRef.current = false;
        stopContinuousRecordingAndProcess();
      }
    }
  }, [threshold, sentenceEndWait]);

  // 開始連續模式錄音
  const startContinuousRecording = useCallback(() => {
    if (!micStreamRef.current) return;

    try {
      // 取出 Queue 中的緩衝音訊（說話起點前的聲音）
      const queuedChunks = audioQueueRef.current.map(item => item.data);
      continuousChunksRef.current = [...queuedChunks];
      console.log('[VAD] 取出 Queue 緩衝:', queuedChunks.length, '個片段');

      const recorder = new MediaRecorder(micStreamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          continuousChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      continuousRecorderRef.current = recorder;
      console.log('[VAD] 連續錄音開始');

    } catch (err) {
      console.error('[VAD] 連續錄音啟動失敗:', err);
    }
  }, []);

  // 停止連續錄音並處理
  const stopContinuousRecordingAndProcess = useCallback(async () => {
    setContinuousStatus('processing');

    if (continuousRecorderRef.current && continuousRecorderRef.current.state !== 'inactive') {
      continuousRecorderRef.current.stop();
    }

    // 等待最後的資料
    await new Promise(resolve => setTimeout(resolve, 200));

    const chunks = continuousChunksRef.current;
    if (chunks.length === 0) {
      console.log('[VAD] 沒有錄音資料');
      setContinuousStatus('listening');
      return;
    }

    console.log('[VAD] 處理錄音, 片段數:', chunks.length);

    try {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });

      if (audioBlob.size < 1000) {
        console.log('[VAD] 錄音太短，跳過');
        setContinuousStatus('listening');
        continuousChunksRef.current = [];
        return;
      }

      // 轉換為 base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];

        try {
          const response = await fetch(`${API_BASE}/api/diagnostic/translate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              audio: base64Audio,
              direction,
            }),
          });

          const result = await response.json();
          console.log('[VAD] 翻譯結果:', result);

          setTranslationResult(result);

          if (result.success) {
            setTranslationHistory(prev => [
              {
                ...result,
                timestamp: new Date().toISOString(),
                mode: 'continuous',
              },
              ...prev.slice(0, 9),
            ]);
          }

        } catch (err) {
          console.error('[VAD] 翻譯 API 錯誤:', err);
          setTranslationResult({
            success: false,
            error: '無法連接伺服器: ' + err.message,
          });
        }

        // 回到監聽狀態
        setContinuousStatus('listening');
        continuousChunksRef.current = [];
      };

    } catch (err) {
      console.error('[VAD] 處理錄音錯誤:', err);
      setContinuousStatus('listening');
      continuousChunksRef.current = [];
    }
  }, [direction]);

  // 切換翻譯模式
  const switchTranslationMode = useCallback((mode) => {
    if (mode === translationMode) return;

    // 停止目前的模式
    if (translationMode === 'continuous' && isContinuousActive) {
      stopContinuousMode();
    }

    setTranslationMode(mode);
  }, [translationMode, isContinuousActive, stopContinuousMode]);

  // 清理連續模式
  useEffect(() => {
    return () => {
      if (vadCheckIntervalRef.current) {
        clearInterval(vadCheckIntervalRef.current);
      }
      if (queueRecorderRef.current && queueRecorderRef.current.state !== 'inactive') {
        queueRecorderRef.current.stop();
      }
      if (continuousRecorderRef.current && continuousRecorderRef.current.state !== 'inactive') {
        continuousRecorderRef.current.stop();
      }
    };
  }, []);

  // ========== 校準功能（新版簡化設計）==========

  // 保存曲線圖狀態
  const chartStateRef = useRef({
    padding: { top: 20, right: 80, bottom: 30, left: 50 },
    maxVolume: 100,
    tenSecondsAgo: Date.now() - 10000,
  });

  // 繪製校準曲線圖（持續執行）
  const drawCalibrationChart = useCallback(() => {
    const canvas = calibrationChartRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = chartStateRef.current.padding;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // 取得即時音量
    const volume = currentVolumeRef.current;
    const now = Date.now();
    const exceedsThreshold = volume > threshold;

    // 滑動延伸邏輯：判斷說話狀態
    let speaking = false;
    if (exceedsThreshold) {
      // 音量超過門檻 → 延伸說話狀態到「現在 + 句尾等待時間」
      speakingEndTimeRef.current = now + sentenceEndWait;
      speaking = true;
    } else if (now < speakingEndTimeRef.current) {
      // 還在句尾等待時間內 → 維持說話狀態
      speaking = true;
    } else {
      // 超過句尾等待時間且音量低於門檻 → 說話結束
      speaking = false;
    }

    // 只在非暫停時加入歷史和更新
    if (!isChartPaused) {
      volumeHistoryRef.current.push({ time: now, volume, speaking });
      // 只保留最近 10 秒
      const tenSecondsAgo = now - 10000;
      volumeHistoryRef.current = volumeHistoryRef.current.filter(d => d.time > tenSecondsAgo);
      chartStateRef.current.tenSecondsAgo = tenSecondsAgo;
    }

    // 更新說話狀態
    setIsSpeakingNow(speaking);

    // 清除畫布
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, width, height);

    // 計算 Y 軸範圍（動態自動縮放）
    // 取以下三個值中的最大值 × 1.3：
    // 1. 目前畫面中曲線的最大音量
    // 2. 說話最大值欄位的數值
    // 3. 判斷門檻欄位的數值 × 2
    const chartMaxVolume = volumeHistoryRef.current.length > 0
      ? Math.max(...volumeHistoryRef.current.map(d => d.volume))
      : 0;
    const maxVolume = Math.max(chartMaxVolume, speechMax, threshold * 2) * 1.3;
    chartStateRef.current.maxVolume = maxVolume;

    // 繪製 Y 軸刻度
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.lineWidth = 1;

    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const value = Math.round((maxVolume / yTicks) * i);
      const y = padding.top + chartHeight - (i / yTicks) * chartHeight;

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();

      ctx.fillText(value.toString(), padding.left - 8, y + 4);
    }

    // 繪製 X 軸標籤
    ctx.textAlign = 'center';
    ctx.fillText('10秒前', padding.left + 30, height - 8);
    ctx.fillText('現在', padding.left + chartWidth - 20, height - 8);

    // 繪製三條水平線
    const drawHorizontalLine = (value, color, label, dashed = false) => {
      if (value <= 0 || value > maxVolume) return;
      const y = padding.top + chartHeight - (value / maxVolume) * chartHeight;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (dashed) ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // 標籤
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.font = '10px monospace';
      ctx.fillText(`${label}: ${value}`, padding.left + chartWidth + 5, y + 4);
    };

    // 藍線 = 靜音平均值
    drawHorizontalLine(silenceAvg, '#2196F3', '靜音', true);
    // 綠線 = 說話最大值
    drawHorizontalLine(speechMax, '#4CAF50', '說話', true);
    // 紅線 = 判斷門檻（最重要，實線）
    drawHorizontalLine(threshold, '#F44336', '門檻', false);

    const tenSecondsAgo = chartStateRef.current.tenSecondsAgo;

    // 繪製音量曲線
    if (volumeHistoryRef.current.length > 1) {
      ctx.lineWidth = 2;
      ctx.beginPath();

      let lastSpeaking = null;
      volumeHistoryRef.current.forEach((point, index) => {
        const x = padding.left + ((point.time - tenSecondsAgo) / 10000) * chartWidth;
        const y = padding.top + chartHeight - (Math.min(point.volume, maxVolume) / maxVolume) * chartHeight;

        if (lastSpeaking !== point.speaking) {
          if (index > 0) {
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y);
          }
          ctx.strokeStyle = point.speaking ? '#4CAF50' : 'rgba(255, 255, 255, 0.5)';
          lastSpeaking = point.speaking;
        }

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // 目前點（只在非暫停時顯示）
      if (!isChartPaused) {
        const lastPoint = volumeHistoryRef.current[volumeHistoryRef.current.length - 1];
        const lastX = padding.left + chartWidth;
        const lastY = padding.top + chartHeight - (Math.min(lastPoint.volume, maxVolume) / maxVolume) * chartHeight;

        ctx.beginPath();
        ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
        ctx.fillStyle = lastPoint.speaking ? '#4CAF50' : 'rgba(255, 255, 255, 0.6)';
        ctx.fill();
      }
    }

    // 繪製滑鼠懸停資訊
    if (hoverInfo && volumeHistoryRef.current.length > 0) {
      const { x: hoverX } = hoverInfo;

      // 繪製垂直虛線
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hoverX, padding.top);
      ctx.lineTo(hoverX, padding.top + chartHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // 找到最接近的資料點
      const relativeX = (hoverX - padding.left) / chartWidth;
      const targetTime = tenSecondsAgo + relativeX * 10000;
      let closestPoint = volumeHistoryRef.current[0];
      let minDiff = Math.abs(closestPoint.time - targetTime);

      for (const point of volumeHistoryRef.current) {
        const diff = Math.abs(point.time - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestPoint = point;
        }
      }

      // 計算時間差
      const secondsAgo = Math.round((now - closestPoint.time) / 1000 * 10) / 10;

      // 繪製資訊框
      const infoText = `${secondsAgo}秒前: ${Math.round(closestPoint.volume)}`;
      ctx.font = '12px monospace';
      const textWidth = ctx.measureText(infoText).width + 16;
      const infoX = Math.min(hoverX + 10, width - textWidth - 10);
      const infoY = padding.top + 10;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(infoX, infoY, textWidth, 24);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.strokeRect(infoX, infoY, textWidth, 24);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(infoText, infoX + 8, infoY + 16);

      // 標記該點
      const pointY = padding.top + chartHeight - (Math.min(closestPoint.volume, maxVolume) / maxVolume) * chartHeight;
      const pointX = padding.left + ((closestPoint.time - tenSecondsAgo) / 10000) * chartWidth;
      ctx.beginPath();
      ctx.arc(pointX, pointY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFC107';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 暫停時顯示暫停標記
    if (isChartPaused) {
      ctx.fillStyle = 'rgba(255, 152, 0, 0.9)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('⏸ 已暫停', width - 10, 15);
    }

    calibrationChartAnimationRef.current = requestAnimationFrame(drawCalibrationChart);
  }, [silenceAvg, speechMax, threshold, sentenceEndWait, isChartPaused, hoverInfo]);

  // 啟動校準曲線圖
  useEffect(() => {
    if (calibrationChartRef.current) {
      drawCalibrationChart();
    }
    return () => {
      if (calibrationChartAnimationRef.current) {
        cancelAnimationFrame(calibrationChartAnimationRef.current);
      }
    };
  }, [drawCalibrationChart]);

  // 處理滑鼠在曲線圖上移動
  const handleChartMouseMove = useCallback((e) => {
    const canvas = calibrationChartRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    const padding = chartStateRef.current.padding;

    // 只在圖表區域內顯示
    if (x >= padding.left && x <= canvas.width - padding.right) {
      setHoverInfo({ x });
    } else {
      setHoverInfo(null);
    }
  }, []);

  // 滑鼠離開曲線圖
  const handleChartMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  // 切換曲線圖暫停/繼續
  const toggleChartPause = () => {
    setIsChartPaused(prev => !prev);
  };

  // 開始自動校準
  const startAutoCalibration = () => {
    setCalibrationStep(1);
    setCalibrationProgress(0);
    setCalibrationMessage('請保持安靜 5 秒...');
    calibrationSamplesRef.current = [];

    console.log('[校準] 開始靜音採樣...');

    const samples = [];
    let elapsed = 0;
    const duration = 5000;
    const interval = 50;

    calibrationIntervalRef.current = setInterval(() => {
      const volume = currentVolumeRef.current;
      samples.push(volume);
      elapsed += interval;
      setCalibrationProgress(Math.round((elapsed / duration) * 100));

      if (elapsed >= duration) {
        clearInterval(calibrationIntervalRef.current);

        // 計算靜音平均值（背景噪音是持續穩定的聲音，用平均值更準確）
        const avgVal = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
        setSilenceAvg(avgVal);
        console.log('[校準] 靜音採樣完成, 平均值:', avgVal);

        // 進入說話採樣，並傳入靜音平均值
        startSpeechSampling(avgVal);
      }
    }, interval);
  };

  // 說話採樣
  const startSpeechSampling = (silenceAvgVal) => {
    setCalibrationStep(2);
    setCalibrationProgress(0);
    setCalibrationMessage('請正常說話 5 秒（例如數 1 到 10）...');

    console.log('[校準] 開始說話採樣...');

    const samples = [];
    let elapsed = 0;
    const duration = 5000;
    const interval = 50;

    calibrationIntervalRef.current = setInterval(() => {
      const volume = currentVolumeRef.current;
      samples.push(volume);
      elapsed += interval;
      setCalibrationProgress(Math.round((elapsed / duration) * 100));

      if (elapsed >= duration) {
        clearInterval(calibrationIntervalRef.current);

        // 計算說話最大值（人聲是脈衝波，用最大值才能捕捉到說話的峰值）
        const maxVal = Math.round(Math.max(...samples));
        setSpeechMax(maxVal);

        // 自動計算門檻 = (靜音平均值 + 說話最大值) / 2
        const newThreshold = Math.round((silenceAvgVal + maxVal) / 2);
        setThreshold(newThreshold);

        console.log('[校準] 說話採樣完成, 最大值:', maxVal, '門檻:', newThreshold);

        // 完成
        setCalibrationStep(0);
        setCalibrationProgress(0);
        setCalibrationMessage('校準完成！');

        // 自動儲存
        saveCalibrationData(silenceAvgVal, maxVal, newThreshold);
      }
    }, interval);
  };

  // 儲存校準資料
  const saveCalibrationData = (silence, speech, thresh) => {
    const data = {
      silenceAvg: silence,
      speechMax: speech,
      threshold: thresh,
      sentenceEndWait: sentenceEndWait,
      calibratedAt: new Date().toISOString(),
    };
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(data));
    setIsCalibrated(true);
    console.log('[校準] 已儲存:', data);
  };

  // 手動儲存
  const saveCurrentCalibration = () => {
    saveCalibrationData(silenceAvg, speechMax, threshold);
    setCalibrationMessage('已儲存！');
    setTimeout(() => setCalibrationMessage(''), 2000);
  };

  // 取消校準
  const cancelCalibration = () => {
    if (calibrationIntervalRef.current) {
      clearInterval(calibrationIntervalRef.current);
    }
    setCalibrationStep(0);
    setCalibrationProgress(0);
    setCalibrationMessage('');
  };

  // 重置為預設值
  const resetToDefaults = () => {
    setSilenceAvg(5);
    setSpeechMax(40);
    setThreshold(22);
    setSentenceEndWait(500);
    localStorage.removeItem(CALIBRATION_KEY);
    setCalibrationMessage('已重置為預設值');
    setTimeout(() => setCalibrationMessage(''), 2000);
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

        {/* 音訊視覺化區塊 */}
        <section className="device-section visualization-section">
          <h2>音訊視覺化</h2>

          {/* 音量數值顯示 */}
          <div className="volume-stats">
            <div className="stat-item">
              <span className="stat-label">目前音量</span>
              <span className="stat-value">{Math.round(micVolume)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">峰值</span>
              <span className="stat-value peak">{Math.round(peakVolume)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">狀態</span>
              <span className={`stat-value status ${micVolume > 30 ? 'speaking' : 'silent'}`}>
                {micVolume > 30 ? '說話中' : '靜音'}
              </span>
            </div>
          </div>

          {/* 波形圖 */}
          <div className="canvas-container">
            <div className="canvas-label">波形圖（時域）</div>
            <canvas
              ref={waveformCanvasRef}
              width={600}
              height={100}
              className="audio-canvas"
            />
          </div>

          {/* 頻譜圖 */}
          <div className="canvas-container">
            <div className="canvas-label">頻譜圖（FFT 頻域）</div>
            <canvas
              ref={spectrumCanvasRef}
              width={600}
              height={120}
              className="audio-canvas"
            />
          </div>

          <p className="hint">說話時波形圖和頻譜圖應該有明顯變化</p>
        </section>

        {/* 校準區塊（新版簡化設計） */}
        <section className="device-section calibration-section-v2">
          <h2>語音校準</h2>

          {/* 即時音量大數字顯示 */}
          <div className="realtime-volume-display">
            <div className="volume-number">{Math.round(micVolume)}</div>
            <div className="volume-label-big">即時音量</div>
          </div>

          {/* 四個可調整的參數輸入 */}
          <div className="calibration-inputs">
            <div className="input-group">
              <label>靜音平均值</label>
              <input
                type="number"
                value={silenceAvg}
                onChange={(e) => setSilenceAvg(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
                max="100"
              />
              <div className="input-color-indicator silence"></div>
            </div>
            <div className="input-group">
              <label>說話最大值</label>
              <input
                type="number"
                value={speechMax}
                onChange={(e) => setSpeechMax(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
                max="200"
              />
              <div className="input-color-indicator speech"></div>
            </div>
            <div className="input-group">
              <label>判斷門檻</label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                min="0"
                max="150"
              />
              <div className="input-color-indicator threshold"></div>
            </div>
            <div className="input-group sentence-wait">
              <label>句尾等待時間</label>
              <div className="input-with-unit">
                <input
                  type="number"
                  value={sentenceEndWait}
                  onChange={(e) => setSentenceEndWait(Math.max(100, parseInt(e.target.value) || 500))}
                  min="100"
                  max="3000"
                  step="100"
                />
                <span className="input-unit">ms</span>
              </div>
              <div className="input-hint">說話停止後，等待這段時間才判定為句子結束</div>
            </div>
          </div>

          {/* 自動校準按鈕 */}
          <div className="auto-calibration-area">
            {calibrationStep === 0 ? (
              <button className="calibration-btn primary large" onClick={startAutoCalibration}>
                自動校準（靜音5秒 → 說話5秒）
              </button>
            ) : (
              <div className="calibration-in-progress">
                <div className="calibration-step-indicator">
                  {calibrationStep === 1 ? '步驟 1/2: 靜音採樣中...' : '步驟 2/2: 說話採樣中...'}
                </div>
                <div className="calibration-message">{calibrationMessage}</div>
                <div className="calibration-progress-bar">
                  <div className="progress-fill" style={{ width: `${calibrationProgress}%` }} />
                </div>
                <button className="calibration-btn secondary" onClick={cancelCalibration}>
                  取消
                </button>
              </div>
            )}
          </div>

          {/* 即時音量曲線圖（持續顯示） */}
          <div className="calibration-chart-container">
            <div className="chart-header">
              <span className="chart-title">即時音量曲線（最近 10 秒）</span>
              <div className="chart-controls">
                <button
                  className={`chart-pause-btn ${isChartPaused ? 'paused' : ''}`}
                  onClick={toggleChartPause}
                >
                  {isChartPaused ? '▶ 繼續運作' : '⏸ 停止移動'}
                </button>
                <div className={`speaking-indicator ${isSpeakingNow ? 'speaking' : 'silent'}`}>
                  {isSpeakingNow ? '● 說話中' : '○ 靜音'}
                </div>
              </div>
            </div>
            <canvas
              ref={calibrationChartRef}
              width={700}
              height={200}
              className="calibration-chart"
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
            />
            <div className="chart-legend">
              <span className="legend-item">
                <span className="legend-line silence"></span>靜音平均值（藍）
              </span>
              <span className="legend-item">
                <span className="legend-line speech"></span>說話最大值（綠）
              </span>
              <span className="legend-item">
                <span className="legend-line threshold"></span>判斷門檻（紅）
              </span>
            </div>
          </div>

          {/* 校準訊息與操作 */}
          {calibrationMessage && calibrationStep === 0 && (
            <div className="calibration-status-message">{calibrationMessage}</div>
          )}

          <div className="calibration-actions-row">
            <button className="calibration-btn secondary small" onClick={saveCurrentCalibration}>
              儲存設定
            </button>
            <button className="calibration-btn secondary small" onClick={resetToDefaults}>
              重置預設
            </button>
          </div>
        </section>

        {/* 翻譯測試區塊 */}
        <section className="device-section translation-section">
          <h2>翻譯測試</h2>

          {/* 模式切換 */}
          <div className="mode-selector">
            <button
              className={`mode-btn ${translationMode === 'button' ? 'active' : ''}`}
              onClick={() => switchTranslationMode('button')}
            >
              按鈕模式
            </button>
            <button
              className={`mode-btn ${translationMode === 'continuous' ? 'active' : ''}`}
              onClick={() => switchTranslationMode('continuous')}
            >
              連續模式
            </button>
          </div>

          {/* 語言方向選擇 */}
          <div className="direction-selector">
            <button
              className={`direction-btn ${direction === 'zh-to-vi' ? 'active' : ''}`}
              onClick={() => setDirection('zh-to-vi')}
              disabled={isContinuousActive}
            >
              中文 → 越南文
            </button>
            <button
              className={`direction-btn ${direction === 'vi-to-zh' ? 'active' : ''}`}
              onClick={() => setDirection('vi-to-zh')}
              disabled={isContinuousActive}
            >
              越南文 → 中文
            </button>
          </div>

          {/* 按鈕模式 */}
          {translationMode === 'button' && (
            <>
              <button
                className={`push-to-talk-btn ${isRecording ? 'recording' : ''} ${isProcessing ? 'processing' : ''}`}
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>處理中...</>
                ) : isRecording ? (
                  <>錄音中... 放開送出</>
                ) : (
                  <>按住說話</>
                )}
              </button>

              <p className="hint">
                {direction === 'zh-to-vi'
                  ? '按住按鈕說中文，放開後會翻譯成越南文'
                  : '按住按鈕說越南文，放開後會翻譯成中文'}
              </p>
            </>
          )}

          {/* 連續模式 */}
          {translationMode === 'continuous' && (
            <div className="continuous-mode-area">
              {/* 未校準提示 */}
              {!isCalibrated && (
                <div className="calibration-warning">
                  <span className="warning-icon">⚠️</span>
                  <span>請先完成上方的「語音校準」後再使用連續模式</span>
                </div>
              )}

              {/* 校準參數顯示 */}
              {isCalibrated && (
                <div className="calibration-params-display">
                  <div className="param-badge">
                    <span className="param-name">靜音平均</span>
                    <span className="param-val">{silenceAvg}</span>
                  </div>
                  <div className="param-badge">
                    <span className="param-name">說話最大</span>
                    <span className="param-val">{speechMax}</span>
                  </div>
                  <div className="param-badge threshold">
                    <span className="param-name">判斷門檻</span>
                    <span className="param-val">{threshold}</span>
                  </div>
                  <div className="param-badge">
                    <span className="param-name">句尾等待</span>
                    <span className="param-val">{sentenceEndWait}ms</span>
                  </div>
                </div>
              )}

              {/* 啟動/停止按鈕 */}
              {isCalibrated && (
                <>
                  {!isContinuousActive ? (
                    <button
                      className="continuous-start-btn"
                      onClick={startContinuousMode}
                    >
                      ▶ 啟動連續模式
                    </button>
                  ) : (
                    <button
                      className="continuous-stop-btn"
                      onClick={stopContinuousMode}
                    >
                      ⏹ 停止連續模式
                    </button>
                  )}
                </>
              )}

              {/* 連續模式狀態顯示 */}
              {isContinuousActive && (
                <div className="continuous-status">
                  <div className={`status-indicator ${continuousStatus}`}>
                    {continuousStatus === 'listening' && (
                      <>
                        <span className="status-icon">👂</span>
                        <span className="status-text">監聽中...</span>
                      </>
                    )}
                    {continuousStatus === 'speaking' && (
                      <>
                        <span className="status-icon speaking">🎙️</span>
                        <span className="status-text">錄音中...</span>
                      </>
                    )}
                    {continuousStatus === 'processing' && (
                      <>
                        <span className="status-icon processing">⏳</span>
                        <span className="status-text">翻譯中...</span>
                      </>
                    )}
                  </div>
                  <div className="status-hint">
                    說話會自動偵測並翻譯，停止說話 {sentenceEndWait}ms 後送出
                  </div>
                </div>
              )}

              {!isContinuousActive && isCalibrated && (
                <p className="hint">
                  啟動後會自動偵測說話並翻譯，不需要按按鈕
                </p>
              )}
            </div>
          )}

          {/* TTS 錯誤訊息 */}
          {ttsError && (
            <div className="tts-error">
              {ttsError}
              <button onClick={() => setTtsError('')}>×</button>
            </div>
          )}

          {/* 翻譯結果顯示 */}
          {translationResult && (
            <div className={`translation-result ${translationResult.success ? 'success' : 'error'}`}>
              {translationResult.success ? (
                <>
                  <div className="result-row">
                    <span className="result-label">原文：</span>
                    <span className="result-text original">{translationResult.originalText}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">翻譯：</span>
                    <span className="result-text translated">{translationResult.translatedText}</span>
                    <button
                      className={`tts-btn ${playingTtsId === 'current' ? 'playing' : ''}`}
                      onClick={() => playTts(
                        translationResult.translatedText,
                        getTargetLang(translationResult.direction),
                        'current'
                      )}
                      disabled={!!playingTtsId}
                      title="播放翻譯語音"
                    >
                      {playingTtsId === 'current' ? '...' : '🔊'}
                    </button>
                  </div>
                  <div className="latency-stats">
                    <div className="latency-item">
                      <span className="latency-label">STT</span>
                      <span className="latency-value">{translationResult.timings?.stt || 0} ms</span>
                    </div>
                    <div className="latency-item">
                      <span className="latency-label">翻譯</span>
                      <span className="latency-value">{translationResult.timings?.translate || 0} ms</span>
                    </div>
                    <div className="latency-item total">
                      <span className="latency-label">總計</span>
                      <span className="latency-value">{translationResult.timings?.total || 0} ms</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="error-message">{translationResult.error}</div>
              )}
            </div>
          )}

          {/* 翻譯歷史 */}
          {translationHistory.length > 0 && (
            <div className="translation-history">
              <div className="history-header">
                <h3>歷史記錄</h3>
                <button className="clear-history-btn" onClick={clearHistory}>清除</button>
              </div>
              <div className="history-list">
                {translationHistory.map((item, index) => (
                  <div key={index} className="history-item">
                    <div className="history-texts">
                      <span className="history-original">{item.originalText}</span>
                      <span className="history-arrow">→</span>
                      <span className="history-translated">{item.translatedText}</span>
                    </div>
                    <div className="history-actions">
                      <button
                        className={`tts-btn small ${playingTtsId === `history-${index}` ? 'playing' : ''}`}
                        onClick={() => playTts(
                          item.translatedText,
                          getTargetLang(item.direction),
                          `history-${index}`
                        )}
                        disabled={!!playingTtsId}
                        title="播放翻譯語音"
                      >
                        {playingTtsId === `history-${index}` ? '...' : '🔊'}
                      </button>
                      <span className="history-latency">{item.timings?.total || 0}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
