// src/pipeline/audioConverter.js
// 音訊格式轉換工具

import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { Readable, PassThrough } from 'stream';
import { promisify } from 'util';

// 設定 ffmpeg 路徑
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * 將 webm 音訊 Buffer 轉換為 wav 格式
 * @param {Buffer} webmBuffer - webm 格式的音訊 Buffer
 * @returns {Promise<Buffer>} wav 格式的音訊 Buffer
 */
export async function webmToWav(webmBuffer) {
  return new Promise((resolve, reject) => {
    const inputStream = new Readable();
    inputStream.push(webmBuffer);
    inputStream.push(null);

    const chunks = [];
    const outputStream = new PassThrough();

    outputStream.on('data', (chunk) => chunks.push(chunk));
    outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    outputStream.on('error', reject);

    ffmpeg(inputStream)
      .inputFormat('webm')
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('error', (err) => {
        console.error('[AudioConverter] 轉換錯誤:', err.message);
        reject(err);
      })
      .pipe(outputStream);
  });
}

/**
 * 將任意音訊 Buffer 轉換為 wav 格式（自動偵測格式）
 * @param {Buffer} audioBuffer - 音訊 Buffer
 * @param {string} inputFormat - 輸入格式 (webm, mp3, etc.)
 * @returns {Promise<Buffer>} wav 格式的音訊 Buffer
 */
export async function toWav(audioBuffer, inputFormat = 'webm') {
  console.log('[DEBUG] ===== 音訊轉換診斷 =====');
  console.log('[DEBUG] 輸入 Buffer 長度:', audioBuffer?.length);
  console.log('[DEBUG] 輸入格式:', inputFormat);
  console.log('[DEBUG] ffmpeg 路徑:', ffmpegInstaller.path);

  return new Promise((resolve, reject) => {
    const inputStream = new Readable();
    inputStream.push(audioBuffer);
    inputStream.push(null);

    const chunks = [];
    const outputStream = new PassThrough();

    outputStream.on('data', (chunk) => chunks.push(chunk));
    outputStream.on('end', () => {
      const outputBuffer = Buffer.concat(chunks);
      console.log('[DEBUG] 轉換完成, 輸出大小:', outputBuffer.length);
      resolve(outputBuffer);
    });
    outputStream.on('error', (err) => {
      console.error('[DEBUG] outputStream 錯誤:', err);
      reject(err);
    });

    ffmpeg(inputStream)
      .inputFormat(inputFormat)
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('start', (cmd) => {
        console.log('[DEBUG] ffmpeg 命令:', cmd);
      })
      .on('stderr', (stderrLine) => {
        console.log('[DEBUG] ffmpeg stderr:', stderrLine);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[DEBUG] ffmpeg 錯誤:', err.message);
        console.error('[DEBUG] ffmpeg stderr:', stderr);
        reject(err);
      })
      .pipe(outputStream);
  });
}
