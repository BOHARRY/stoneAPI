// imageController.js
const express = require('express');
const router = express.Router();
const { callStabilityAI } = require('./aiUtils'); // 引入輔助函數

router.post('/generate', async (req, res) => {
  const { interactionId, prompt } = req.body; // interactionId 可選

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ success: false, imageUrl: null, error: '缺少有效的圖像提示詞 (prompt)' });
  }

  try {
    // 從 .env 或預設獲取風格
    const stylePreset = process.env.STABILITY_STYLE_PRESET || 'fantasy-art';
    const base64ImageUrl = await callStabilityAI(prompt, stylePreset);

    res.json({
      success: true,
      imageUrl: base64ImageUrl
    });

  } catch (error) {
    console.error(`--- [API LOG/Image Generation Error] Interaction ID: ${interactionId || 'N/A'}`, error);
    // 向前端返回一個通用的錯誤訊息，避免洩漏過多細節
    res.status(500).json({
      success: false,
      imageUrl: null,
      error: `圖像生成失敗：${error.message || '內部伺服器錯誤'}`
    });
  }
});

module.exports = router;