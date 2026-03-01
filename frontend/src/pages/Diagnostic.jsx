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

  // TTS 狀態
  const [playingTtsId, setPlayingTtsId] = useState(null); // 正在播放的項目 ID
  const [ttsError, setTtsError] = useState('');

  // 校準狀態
  const [calibrationStep, setCalibrationStep] = useState(0); // 0=未開始, 1=靜音採樣, 2=說話採樣, 3=驗證, 4=完成
  const [calibrationProgress, setCalibrationProgress] = useState(0); // 0-100
  const [calibrationData, setCalibrationData] = useState(null); // 校準結果
  const [calibrationMessage, setCalibrationMessage] = useState('');
  const [savedCalibration, setSavedCalibration] = useState(null); // 已儲存的校準資料

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
  const currentVolumeRef = useRef(0); // 即時音量 ref（供校準使用）

  // 載入已儲存的校準資料
  useEffect(() => {
    const saved = localStorage.getItem(CALIBRATION_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setSavedCalibration(data);
        console.log('[校準] 載入已儲存的校準資料:', data);
      } catch (e) {
        console.error('[校準] 無法解析已儲存的校準資料');
      }
    }
  }, []);

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

  // ========== 校準功能 ==========

  // 開始校準流程
  const startCalibration = () => {
    setCalibrationStep(1);
    setCalibrationProgress(0);
    setCalibrationData(null);
    setCalibrationMessage('請保持安靜，正在採樣背景噪音...');
    calibrationSamplesRef.current = [];

    console.log('[校準] 開始靜音採樣...');

    // 開始收集靜音樣本 (5秒)
    const samples = [];
    let elapsed = 0;
    let secondCounter = 0;
    const duration = 5000; // 5秒
    const interval = 50; // 每50ms採樣一次

    calibrationIntervalRef.current = setInterval(() => {
      const volume = currentVolumeRef.current; // 使用 ref 取得即時音量
      samples.push(volume);
      elapsed += interval;
      setCalibrationProgress(Math.round((elapsed / duration) * 100));

      // 每秒印出一次音量
      const currentSecond = Math.floor(elapsed / 1000);
      if (currentSecond > secondCounter) {
        secondCounter = currentSecond;
        const recentSamples = samples.slice(-20); // 最近 1 秒的樣本
        const avgRecent = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
        console.log(`[校準] 靜音採樣 第${currentSecond}秒: 即時=${volume.toFixed(1)}, 平均=${avgRecent.toFixed(1)}`);
      }

      if (elapsed >= duration) {
        clearInterval(calibrationIntervalRef.current);
        finishSilenceSampling(samples);
      }
    }, interval);
  };

  // 完成靜音採樣
  const finishSilenceSampling = (samples) => {
    // 計算靜音統計
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    const stdDev = Math.sqrt(
      samples.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / samples.length
    );

    calibrationSamplesRef.current = {
      silence: { samples, avg, max, min, stdDev }
    };

    console.log('[校準] 靜音採樣完成:', {
      樣本數: samples.length,
      平均: avg.toFixed(1),
      最大: max.toFixed(1),
      最小: min.toFixed(1),
      標準差: stdDev.toFixed(1)
    });

    // 進入說話採樣階段
    setCalibrationStep(2);
    setCalibrationProgress(0);
    setCalibrationMessage('請正常說話 5 秒，例如數 1 到 10...');

    console.log('[校準] 開始說話採樣...');

    // 開始收集說話樣本 (5秒)
    const speechSamples = [];
    let elapsed = 0;
    let secondCounter = 0;
    const duration = 5000;
    const interval = 50;

    calibrationIntervalRef.current = setInterval(() => {
      const volume = currentVolumeRef.current; // 使用 ref 取得即時音量
      speechSamples.push(volume);
      elapsed += interval;
      setCalibrationProgress(Math.round((elapsed / duration) * 100));

      // 每秒印出一次音量
      const currentSecond = Math.floor(elapsed / 1000);
      if (currentSecond > secondCounter) {
        secondCounter = currentSecond;
        const recentSamples = speechSamples.slice(-20); // 最近 1 秒的樣本
        const avgRecent = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
        console.log(`[校準] 說話採樣 第${currentSecond}秒: 即時=${volume.toFixed(1)}, 平均=${avgRecent.toFixed(1)}`);
      }

      if (elapsed >= duration) {
        clearInterval(calibrationIntervalRef.current);
        finishSpeechSampling(speechSamples);
      }
    }, interval);
  };

  // 完成說話採樣
  const finishSpeechSampling = (samples) => {
    // 計算說話統計
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    const stdDev = Math.sqrt(
      samples.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / samples.length
    );

    // 過濾出說話時的音量（高於靜音平均值的樣本）
    const silenceAvg = calibrationSamplesRef.current.silence.avg;
    const speechOnlySamples = samples.filter(v => v > silenceAvg * 1.5);
    const speechAvg = speechOnlySamples.length > 0
      ? speechOnlySamples.reduce((a, b) => a + b, 0) / speechOnlySamples.length
      : avg;

    calibrationSamplesRef.current.speech = { samples, avg, max, min, stdDev, speechAvg };

    console.log('[校準] 說話採樣完成:', {
      樣本數: samples.length,
      平均: avg.toFixed(1),
      最大: max.toFixed(1),
      最小: min.toFixed(1),
      標準差: stdDev.toFixed(1),
      說話平均: speechAvg.toFixed(1),
      高於靜音的樣本數: speechOnlySamples.length
    });

    // 計算校準參數
    calculateCalibration();
  };

  // 計算校準參數
  const calculateCalibration = () => {
    const silence = calibrationSamplesRef.current.silence;
    const speech = calibrationSamplesRef.current.speech;

    console.log('[校準] 開始計算閾值...');
    console.log('[校準] 靜音數據:', {
      平均: silence.avg.toFixed(1),
      最大: silence.max.toFixed(1),
      標準差: silence.stdDev.toFixed(1)
    });
    console.log('[校準] 說話數據:', {
      平均: speech.avg.toFixed(1),
      說話平均: speech.speechAvg.toFixed(1),
      最大: speech.max.toFixed(1)
    });

    // 計算閾值
    // 靜音閾值 = 靜音平均 + 2倍標準差
    const silenceThreshold = Math.round(silence.avg + silence.stdDev * 2);
    console.log(`[校準] 靜音閾值 = ${silence.avg.toFixed(1)} + 2*${silence.stdDev.toFixed(1)} = ${silenceThreshold}`);

    // 說話閾值 = 靜音閾值和說話平均的中間值
    const speakingThreshold = Math.round((silenceThreshold + speech.speechAvg) / 2);
    console.log(`[校準] 說話閾值 = (${silenceThreshold} + ${speech.speechAvg.toFixed(1)}) / 2 = ${speakingThreshold}`);

    // VAD 開始閾值 = 說話閾值的 80%
    const vadStartThreshold = Math.round(speakingThreshold * 0.8);

    // VAD 結束閾值 = 說話閾值的 60%
    const vadEndThreshold = Math.round(speakingThreshold * 0.6);

    const calibration = {
      silenceAvg: Math.round(silence.avg),
      silenceMax: Math.round(silence.max),
      silenceStdDev: Math.round(silence.stdDev),
      speechAvg: Math.round(speech.speechAvg),
      speechMax: Math.round(speech.max),
      silenceThreshold,
      speakingThreshold,
      vadStartThreshold,
      vadEndThreshold,
      calibratedAt: new Date().toISOString(),
    };

    setCalibrationData(calibration);
    console.log('[校準] 最終結果:', calibration);

    // 進入驗證階段
    setCalibrationStep(3);
    setCalibrationProgress(0);
    setCalibrationMessage('校準完成！請說話測試效果，看綠燈是否正確亮起...');
  };

  // 儲存校準資料
  const saveCalibration = () => {
    if (!calibrationData) return;

    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibrationData));
    setSavedCalibration(calibrationData);
    setCalibrationStep(4);
    setCalibrationMessage('校準資料已儲存！');
    console.log('[校準] 已儲存到 localStorage');
  };

  // 重置校準
  const resetCalibration = () => {
    localStorage.removeItem(CALIBRATION_KEY);
    setSavedCalibration(null);
    setCalibrationStep(0);
    setCalibrationData(null);
    setCalibrationMessage('');
    console.log('[校準] 已重置');
  };

  // 取消校準
  const cancelCalibration = () => {
    if (calibrationIntervalRef.current) {
      clearInterval(calibrationIntervalRef.current);
    }
    setCalibrationStep(0);
    setCalibrationProgress(0);
    setCalibrationData(null);
    setCalibrationMessage('');
  };

  // 判斷目前是否為說話狀態（使用校準資料）
  const isSpeaking = useCallback(() => {
    const threshold = savedCalibration?.speakingThreshold || calibrationData?.speakingThreshold || 30;
    return micVolume > threshold;
  }, [micVolume, savedCalibration, calibrationData]);

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

        {/* 校準區塊 */}
        <section className="device-section calibration-section">
          <h2>自動校準</h2>

          {/* 已儲存的校準資料 */}
          {savedCalibration && calibrationStep === 0 && (
            <div className="saved-calibration">
              <div className="calibration-status">
                <span className="status-badge success">已校準</span>
                <span className="calibration-date">
                  {new Date(savedCalibration.calibratedAt).toLocaleString()}
                </span>
              </div>
              <div className="calibration-params">
                <div className="param-item">
                  <span className="param-label">靜音閾值</span>
                  <span className="param-value">{savedCalibration.silenceThreshold}</span>
                </div>
                <div className="param-item">
                  <span className="param-label">說話閾值</span>
                  <span className="param-value">{savedCalibration.speakingThreshold}</span>
                </div>
                <div className="param-item">
                  <span className="param-label">VAD 起點</span>
                  <span className="param-value">{savedCalibration.vadStartThreshold}</span>
                </div>
                <div className="param-item">
                  <span className="param-label">VAD 終點</span>
                  <span className="param-value">{savedCalibration.vadEndThreshold}</span>
                </div>
              </div>
              <div className="calibration-actions">
                <button className="calibration-btn secondary" onClick={resetCalibration}>
                  重新校準
                </button>
              </div>
            </div>
          )}

          {/* 未校準狀態 */}
          {!savedCalibration && calibrationStep === 0 && (
            <div className="no-calibration">
              <p>尚未校準，建議先進行校準以獲得最佳辨識效果。</p>
              <button className="calibration-btn primary" onClick={startCalibration}>
                開始校準
              </button>
            </div>
          )}

          {/* 校準進行中 */}
          {calibrationStep > 0 && calibrationStep < 4 && (
            <div className="calibration-progress">
              {/* 步驟指示 */}
              <div className="calibration-steps">
                <div className={`step ${calibrationStep >= 1 ? 'active' : ''} ${calibrationStep > 1 ? 'done' : ''}`}>
                  <span className="step-number">1</span>
                  <span className="step-label">靜音採樣</span>
                </div>
                <div className="step-connector" />
                <div className={`step ${calibrationStep >= 2 ? 'active' : ''} ${calibrationStep > 2 ? 'done' : ''}`}>
                  <span className="step-number">2</span>
                  <span className="step-label">說話採樣</span>
                </div>
                <div className="step-connector" />
                <div className={`step ${calibrationStep >= 3 ? 'active' : ''}`}>
                  <span className="step-number">3</span>
                  <span className="step-label">驗證測試</span>
                </div>
              </div>

              {/* 訊息 */}
              <div className="calibration-message">{calibrationMessage}</div>

              {/* 進度條 */}
              {calibrationStep < 3 && (
                <div className="calibration-progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${calibrationProgress}%` }}
                  />
                </div>
              )}

              {/* 驗證階段的即時指示器 */}
              {calibrationStep === 3 && (
                <div className="verification-indicator">
                  <div className={`speaking-light ${isSpeaking() ? 'on' : 'off'}`}>
                    {isSpeaking() ? '說話中' : '靜音'}
                  </div>
                  <div className="current-volume">
                    目前音量: {Math.round(micVolume)}
                    {calibrationData && (
                      <span className="threshold-hint">
                        （閾值: {calibrationData.speakingThreshold}）
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 校準結果預覽 */}
              {calibrationStep === 3 && calibrationData && (
                <div className="calibration-result-preview">
                  <h4>校準結果</h4>
                  <div className="calibration-params">
                    <div className="param-item">
                      <span className="param-label">靜音平均</span>
                      <span className="param-value">{calibrationData.silenceAvg}</span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">說話平均</span>
                      <span className="param-value">{calibrationData.speechAvg}</span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">說話閾值</span>
                      <span className="param-value highlight">{calibrationData.speakingThreshold}</span>
                    </div>
                    <div className="param-item">
                      <span className="param-label">VAD 起點</span>
                      <span className="param-value">{calibrationData.vadStartThreshold}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 操作按鈕 */}
              <div className="calibration-actions">
                {calibrationStep === 3 && (
                  <button className="calibration-btn primary" onClick={saveCalibration}>
                    儲存校準結果
                  </button>
                )}
                <button className="calibration-btn secondary" onClick={cancelCalibration}>
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 校準完成 */}
          {calibrationStep === 4 && (
            <div className="calibration-complete">
              <div className="success-icon">✓</div>
              <p>{calibrationMessage}</p>
              <button className="calibration-btn secondary" onClick={() => setCalibrationStep(0)}>
                完成
              </button>
            </div>
          )}
        </section>

        {/* 翻譯測試區塊 */}
        <section className="device-section translation-section">
          <h2>翻譯測試</h2>

          {/* 語言方向選擇 */}
          <div className="direction-selector">
            <button
              className={`direction-btn ${direction === 'zh-to-vi' ? 'active' : ''}`}
              onClick={() => setDirection('zh-to-vi')}
            >
              中文 → 越南文
            </button>
            <button
              className={`direction-btn ${direction === 'vi-to-zh' ? 'active' : ''}`}
              onClick={() => setDirection('vi-to-zh')}
            >
              越南文 → 中文
            </button>
          </div>

          {/* 按住說話按鈕 */}
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
