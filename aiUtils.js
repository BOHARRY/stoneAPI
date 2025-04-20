// aiUtils.js
require('dotenv').config(); // Load environment variables

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o'; // Default to gpt-4o
const STABILITY_MODEL = process.env.STABILITY_MODEL || 'stable-image-core'; // Default model

if (!OPENAI_API_KEY || !STABILITY_API_KEY) {
  console.error("錯誤：缺少 OpenAI 或 Stability AI 的 API 金鑰。請檢查 .env 檔案。");
  // 在實際應用中，你可能想更優雅地處理這個問題，而不是僅僅打印錯誤
  // process.exit(1); // 或者在開發模式下允許繼續但功能受限
}

/**
 * 呼叫 OpenAI Chat Completions API
 * @param {string} prompt - 要發送給模型的提示詞
 * @param {string} purpose - 請求目的 (用於日誌)
 * @returns {Promise<object>} - 解析後的 JSON 回應
 * @throws {Error} 如果 API 請求失敗或回應格式錯誤
 */
async function callOpenAI(prompt, purpose = "general") {
  console.log(`--- [AI LOG/OpenAI Request: ${purpose}] ---`); // 不打印完整 prompt，避免敏感資訊洩漏
  if (!OPENAI_API_KEY) throw new Error("OpenAI API 金鑰未設定");

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8, // 保持一定的創意性
        // response_format: { type: "json_object" }, // 強制 JSON 輸出模式
      })
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = await response.text();
      }
      console.error(`--- [AI LOG/OpenAI Error: ${purpose}] Status: ${response.status}`, errorData);
      const errorMessage = errorData?.error?.message || (typeof errorData === 'string' ? errorData.substring(0, 100) : `未知 OpenAI API 錯誤 (${response.status})`);
      throw new Error(`OpenAI API (${purpose}) 請求失敗: ${errorMessage}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      console.warn(`--- [AI LOG/OpenAI Warning: ${purpose}] 回傳內容為空。`, data);
      throw new Error(`OpenAI API (${purpose}) 回傳內容為空`);
    }

    console.log(`--- [AI LOG/OpenAI Raw Response: ${purpose}] ---`); // 不打印完整內容
    // console.log(content.substring(0, 200) + '...'); // 僅打印部分內容預覽

    // --- JSON 解析邏輯 ---
    let parsed;
    try {
      // 嘗試移除可能的 markdown JSON 標記
      const cleaned = content.replace(/^```json\s*|```$/gi, '').trim();
      parsed = JSON.parse(cleaned);
      console.log(`--- [AI LOG/OpenAI JSON Parsed: ${purpose}] ---`);
      // console.log(parsed); // 打印解析後的物件

      if (typeof parsed !== 'object' || parsed === null || Object.keys(parsed).length === 0) {
          console.warn(`--- [AI LOG/OpenAI Warning: ${purpose}] JSON 解析結果不是有效的非空物件:`, parsed);
          throw new Error(`GPT 回傳 (${purpose}) 的 JSON 格式無效或為空`);
      }
      return parsed;

    } catch (e) {
        console.error(`--- [AI LOG/OpenAI Error: ${purpose}] JSON 解析失敗:`, e.message, "原始內容片段:", content.substring(0, 100));
        // 如果強制 JSON 模式失敗，這表示模型沒有遵循指示
        throw new Error(`GPT 回傳 (${purpose}) 內容無法解析為 JSON: ${e.message}`);
    }

  } catch (error) {
    console.error(`--- [AI LOG/OpenAI Error: ${purpose}] 呼叫失敗:`, error);
    // 重新拋出錯誤，讓路由處理器捕捉
    throw error;
  }
}

/**
 * 呼叫 Stability AI 生成圖片
 * @param {string} prompt - 圖像提示詞 (英文)
 * @param {string} style_preset - 風格預設 (e.g., "fantasy-art")
 * @returns {Promise<string>} - Base64 編碼的圖像數據 (包含 MIME type)
 * @throws {Error} 如果 API 請求失敗
 */
async function callStabilityAI(prompt, style_preset = "fantasy-art") {
  console.log(`--- [AI LOG/Stability Request] Style: ${style_preset} ---`); // 不打印 prompt
  if (!STABILITY_API_KEY) throw new Error("Stability AI API 金鑰未設定");

  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("output_format", "webp"); // webp 通常較小
  if (style_preset) {
      formData.append("style_preset", style_preset);
  }
  // 可以根據需要添加其他參數，例如 aspect_ratio, negative_prompt 等
  // formData.append("aspect_ratio", "1:1");

  try {
    const response = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/core`, {
    // --- 修改結束 ---
      method: "POST",
      headers: {
        Authorization: `Bearer ${STABILITY_API_KEY}`,
        Accept: "image/*"
      },
      body: formData
    });

    if (!response.ok) {
        let errorText = `圖片生成 API 請求失敗: ${response.status}`;
        try {
            // Stability AI 的錯誤通常在 header 或 text body
            const errorBody = await response.text();
            errorText += ` - ${errorBody.substring(0, 200)}`; // 限制錯誤訊息長度
        } catch (e) { /* 忽略讀取錯誤訊息的錯誤 */ }
        console.error('--- [AI LOG/Stability Error] ---', errorText);
        throw new Error(errorText);
    }

    // 將回應的 blob 轉換為 buffer，再轉為 base64
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');
    const mimeType = response.headers.get('content-type') || 'image/webp'; // 從 header 獲取 MIME type

    console.log(`--- [AI LOG/Stability Success] MimeType: ${mimeType}, Base64 Length: ${base64Image.length} ---`);
    return `data:${mimeType};base64,${base64Image}`;

  } catch (error) {
    console.error('--- [AI LOG/Stability Error] 呼叫失敗:', error);
    throw error; // 重新拋出
  }
}

module.exports = {
  callOpenAI,
  callStabilityAI
};