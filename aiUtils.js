// aiUtils.js
require('dotenv').config(); // 載入環境變數

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // 預設為 gpt-4o-mini
const STABILITY_MODEL = process.env.STABILITY_MODEL || 'stable-image-core'; // 預設模型

if (!OPENAI_API_KEY || !STABILITY_API_KEY) {
  console.error("錯誤：缺少 OpenAI 或 Stability AI 的 API 金鑰。請檢查 .env 檔案。");
  // 在實際應用中，你可能想更優雅地處理這個問題，而不是僅僅打印錯誤
  // process.exit(1); // 或者在開發模式下允許繼續但功能受限
}

/**
 * 修復並解析可能包含問題的 JSON 字串
 * @param {string} jsonString - 可能有問題的 JSON 字串
 * @param {string} purpose - 解析的目的 (用於日誌)
 * @returns {object} - 解析後的 JSON 物件
 * @throws {Error} 如果無法修復和解析
 */
function sanitizeAndParseJSON(jsonString, purpose) {
  console.log(`--- [AI LOG/JSON Sanitize: ${purpose}] 開始清理和解析 JSON ---`);
  
  // 移除可能的 markdown JSON 標記
  let cleaned = jsonString.replace(/^```json\s*|```$/gi, '').trim();
  
  // 步驟 1: 先嘗試直接解析（可能本來就是有效的JSON）
  try {
    return JSON.parse(cleaned);
  } catch (initialError) {
    // 繼續處理需要清理的情況
    console.log(`--- [AI LOG/JSON Sanitize: ${purpose}] 初始解析失敗，進行深度清理 ---`);
  }

  // 步驟 2: 處理實際的換行和空白符號
  // 先使用JSON.stringify格式化，這會正確處理換行符
  try {
    // 2.1 嘗試修復最常見的格式問題：不正確的換行
    let preProcessed = cleaned;
    
    // 如果是開頭的換行問題（根據錯誤日誌）
    if (cleaned.startsWith('{\n')) {
      // 嘗試將所有實際換行符轉換為空格
      preProcessed = cleaned.replace(/\n\s*/g, ' ');
      try {
        return JSON.parse(preProcessed);
      } catch (e) {
        // 繼續嘗試其他修復方法
      }
    }
    
    // 2.2 嘗試從JSON文本中提取有效的JSON部分
    const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        // 繼續嘗試其他修復方法
      }
    }
    
    // 步驟 3: 處理控制字元
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, match => {
      // 對於字串內的換行和特殊字元，將它們轉換為適當的轉義序列
      if (match === '\n') return ' '; // 換行改為空格，更安全
      if (match === '\r') return ' ';
      if (match === '\t') return ' ';
      if (match === '\b') return '';
      if (match === '\f') return '';
      // 其他控制字元直接移除
      return '';
    });
    
    // 步驟 4: 嘗試使用JSON5解析（更寬鬆的JSON解析）
    try {
      // 如果專案中有JSON5，可以使用它進行更寬鬆的解析
      // 目前使用標準JSON.parse
      return JSON.parse(cleaned);
    } catch (e) {
      console.warn(`--- [AI LOG/JSON Warning: ${purpose}] 清理後仍無法解析 JSON，嘗試進階修復 ---`);
      
      // 步驟 5: 最後的嘗試 - 重建JSON物件
      try {
        // 5.1 嘗試修復引號問題
        let fixedJson = cleaned.replace(/(?<!\\)'/g, '"'); // 單引號轉雙引號
        
        // 5.2 嘗試修復未閉合的引號和括號
        const openBraces = (fixedJson.match(/\{/g) || []).length;
        const closeBraces = (fixedJson.match(/\}/g) || []).length;
        if (openBraces > closeBraces) {
          fixedJson += '}'.repeat(openBraces - closeBraces);
        }
        
        // 5.3 去除潛在的尾隨逗號
        fixedJson = fixedJson.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
        
        return JSON.parse(fixedJson);
      } catch (e2) {
        // 5.4 最後的絕招：手動建立物件
        try {
          console.error(`--- [AI LOG/JSON Error: ${purpose}] 標準修復嘗試均失敗，進行深度修復 ---`);
          
          // 搜尋 key-value 對
          const keyValueRegex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
          const reconstructed = {};
          let match;
          
          while ((match = keyValueRegex.exec(cleaned)) !== null) {
            reconstructed[match[1]] = match[2];
          }
          
          // 如果找到至少一個key-value對，返回重建的物件
          if (Object.keys(reconstructed).length > 0) {
            console.log(`--- [AI LOG/JSON Success: ${purpose}] 成功通過深度修復重建JSON物件 ---`);
            return reconstructed;
          }
          
          // 如果都失敗了，記錄詳細錯誤信息
          console.error(`--- [AI LOG/JSON Error: ${purpose}] 所有修復嘗試均失敗 ---`);
          
          // 嘗試找出問題位置的字元
          const errorMatch = e.message.match(/position (\d+)/);
          if (errorMatch && errorMatch[1]) {
            const position = parseInt(errorMatch[1]);
            const problemChar = cleaned.charAt(position);
            const context = cleaned.substring(Math.max(0, position - 20), Math.min(cleaned.length, position + 20));
            console.error(`問題位置 ${position} 的字元: '${problemChar}' (ASCII: ${problemChar.charCodeAt(0)}), 上下文: "${context}"`);
          }
          
          // 拋出詳細的錯誤
          throw new Error(`無法解析 JSON: ${e.message}\n原始內容片段: ${jsonString.substring(0, 150)}...`);
        } catch (finalError) {
          throw finalError;
        }
      }
    }
  } catch (e) {
    throw new Error(`JSON處理過程中發生未預期錯誤: ${e.message}`);
  }
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
    // 在提示詞中明確請求返回標準JSON格式
    const enhancedPrompt = typeof prompt === 'string' 
      ? `${prompt}\n\n請以有效的JSON格式回覆，不要使用Markdown。確保JSON可以直接被JSON.parse()解析，沒有額外的格式或標記。`
      : prompt;
      
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: enhancedPrompt }],
        temperature: 0.7, // 稍微降低以提高一致性
        response_format: { type: "json_object" }, // 強制 JSON 輸出模式
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

    // --- 使用加強版 JSON 解析邏輯 ---
    let parsed;
    try {
      parsed = sanitizeAndParseJSON(content, purpose);
      console.log(`--- [AI LOG/OpenAI JSON Parsed: ${purpose}] ---`);
      // console.log(parsed); // 打印解析後的物件

      if (typeof parsed !== 'object' || parsed === null || Object.keys(parsed).length === 0) {
          console.warn(`--- [AI LOG/OpenAI Warning: ${purpose}] JSON 解析結果不是有效的非空物件:`, parsed);
          throw new Error(`GPT 回傳 (${purpose}) 的 JSON 格式無效或為空`);
      }
      return parsed;

    } catch (e) {
        console.error(`--- [AI LOG/OpenAI Error: ${purpose}] JSON 解析失敗:`, e.message, "原始內容片段:", content.substring(0, 150));
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
/**
 * 呼叫 Stability AI 生成圖片
 * @param {string} prompt - 圖像提示詞 (英文)
 * @param {string} style_preset - 風格預設 (e.g., "fantasy-art")
 * @param {object} options - 其他可選參數的物件
 * @returns {Promise<string>} - Base64 編碼的圖像數據 (包含 MIME type)
 * @throws {Error} 如果 API 請求失敗
 */
async function callStabilityAI(prompt, style_preset = "fantasy-art", options = {}) {
  console.log(`--- [AI LOG/Stability Request] Style: ${style_preset} ---`); // 不打印 prompt
  if (!STABILITY_API_KEY) throw new Error("Stability AI API 金鑰未設定");

  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("output_format", options.output_format || "webp"); // webp 通常較小
  
  // 添加風格預設
  if (style_preset) {
      formData.append("style_preset", style_preset);
  }
  
  // 動態添加其他支援的參數
  const validParams = [
    "negative_prompt", "seed", "steps", "cfg_scale", 
    "samples", "dimensions", "weight", "image_strength", 
    "safety_filter", "aspect_ratio"
  ];
  
  for (const param of validParams) {
    if (options[param] !== undefined) {
      formData.append(param, options[param].toString());
    }
  }

  try {
    const response = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/core`, {
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

/**
 * 獲取 Stability AI 的可用參數說明
 * @returns {object} - 參數說明物件
 */
function getStabilityAIParamsInfo() {
  return {
    prompt: "圖像生成的主要描述文字（英文效果較佳）",
    style_preset: "預設風格，例如 'fantasy-art', 'photographic', 'digital-art', 'comic-book' 等",
    negative_prompt: "指定不希望出現在生成圖像中的元素",
    seed: "控制生成的隨機性，相同的種子可以產生相似的結果（數字）",
    cfg_scale: "提示詞遵循程度，範圍通常在 0-30 之間，預設 7（數字）",
    steps: "生成過程的迭代次數，影響圖像品質和細節，通常 20-50（數字）",
    samples: "單次請求生成的圖像數量（數字）",
    dimensions: "指定圖像尺寸，例如 '1024x1024'（字串）",
    weight: "提示詞的權重，影響各部分提示的重要性（數字）",
    image_strength: "用於圖像到圖像轉換時，原始圖像的保留程度，0-1之間（數字）",
    safety_filter: "是否啟用安全過濾（布林值）",
    aspect_ratio: "圖像的長寬比，例如 '1:1', '16:9'（字串）",
    output_format: "輸出格式，如 'webp', 'png', 'jpeg'（字串）"
  };
}

module.exports = {
  callOpenAI,
  callStabilityAI,
  sanitizeAndParseJSON,
  getStabilityAIParamsInfo
};