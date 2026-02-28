// src/pipeline/audioConverter.js
// 音訊格式轉換工具 - 將 webm 串流片段轉換為 wav

import ffmpeg from 'fluent-ffmpeg';
import { Readable } from 'stream';

// Railway 環境有內建 ffmpeg，不需要設定路徑
// 本地開發時如果需要，可以使用 @ffmpeg-installer/ffmpeg

/**
 * 將 webm 串流片段轉換為 wav 格式
 * @param {Buffer} inputBuffer - webm 格式的音訊 Buffer
 * @returns {Promise<Buffer>} wav 格式的音訊 Buffer
 */
export function convertToWav(inputBuffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const input = new Readable();
    input.push(inputBuffer);
    input.push(null);

    ffmpeg(input)
      .inputFormat('webm')
      .audioCodec('pcm_s16le')
      .audioFrequency(16000)
      .audioChannels(1)
      .format('wav')
      .on('error', (err) => {
        console.error('[AudioConverter] ffmpeg 錯誤:', err.message);
        reject(err);
      })
      .pipe()
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => {
        const wavBuffer = Buffer.concat(chunks);
        console.log('[AudioConverter] 轉換完成:', inputBuffer.length, '→', wavBuffer.length, 'bytes');
        resolve(wavBuffer);
      })
      .on('error', reject);
  });
}
