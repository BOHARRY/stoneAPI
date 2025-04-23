// aiUtils.js
// 載入環境變數
require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
// 新增 Google AI API 金鑰的環境變數
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY; 

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // 預設為 gpt-4o-mini
const STABILITY_MODEL = process.env.STABILITY_MODEL || 'stable-image-core'; // 預設模型
// 新增 Gemini 模型環境變數，並提供預設值
const GOOGLE_GEMINI_MODEL = process.env.GOOGLE_GEMINI_MODEL || 'gemini-2.0-flash'; // 預設使用最新的 flash 模型

// 更新 API 金鑰檢查，包含 Google AI 金鑰
if (!OPENAI_API_KEY && !STABILITY_API_KEY && !GOOGLE_AI_API_KEY) {
  console.error("錯誤：缺少 OpenAI, Stability AI 或 Google AI 的 API 金鑰。請檢查 .env 檔案。至少需要其中一個金鑰才能使用對應功能。");
  // 在實際應用中，你可能想更優雅地處理這個問題
} else {
    console.log(`AI 金鑰狀態: OpenAI: ${OPENAI_API_KEY ? '已設定' : '未設定'}, Stability AI: ${STABILITY_API_KEY ? '已設定' : '未設定'}, Google AI: ${GOOGLE_AI_API_KEY ? '已設定' : '未設定'}`);
}


/**
 * 修復並解析可能包含問題的 JSON 字串
 * 此函數與原版相同，無需修改。
 * @param {string} jsonString - 可能有問題的 JSON 字串
 * @param {string} purpose - 解析的目的 (用於日誌)
 * @returns {object} - 解析後的 JSON 物件
 * @throws {Error} 如果無法修復和解析
 */
function sanitizeAndParseJSON(jsonString, purpose) {
  console.log(`--- [AI LOG/JSON Sanitize: ${purpose}] 開始清理和解析 JSON ---`);
  
  // 移除可能的 markdown JSON 標記 (```json ... ```)
  let cleaned = jsonString.replace(/^```json\s*|```$/gi, '').trim();
  
  // 步驟 1: 先嘗試直接解析（可能本來就是有效的JSON）
  try {
    const parsed = JSON.parse(cleaned);
    console.log(`--- [AI LOG/JSON Sanitize: ${purpose}] 直接解析成功 ---`);
    return parsed;
  } catch (initialError) {
    // 如果直接解析失敗，記錄錯誤並繼續進行深度清理
    console.warn(`--- [AI LOG/JSON Sanitize: ${purpose}] 初始解析失敗，進行深度清理 (${initialError.message}) ---`);
  }

  // 步驟 2: 嘗試從JSON文本中提取有效的JSON部分 (處理Markdown或其他額外文字)
  const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
  if (jsonMatch && jsonMatch[1]) {
    cleaned = jsonMatch[1].trim();
    try {
        const parsed = JSON.parse(cleaned);
        console.log(`--- [AI LOG/JSON Sanitize: ${purpose}] 從提取的片段解析成功 ---`);
        return parsed;
    } catch (e) {
        console.warn(`--- [AI LOG/JSON Sanitize: ${purpose}] 從提取的片段解析失敗，繼續深度清理 (${e.message}) ---`);
        // 繼續嘗試其他修復方法
    }
  } else {
       console.warn(`--- [AI LOG/JSON Sanitize: ${purpose}] 未找到有效的JSON片段，使用原始內容進行深度清理 ---`);
  }

  // 步驟 3: 處理控制字元和常見錯誤
  let preFinalCleaned = cleaned;
  // 對於字串內的換行和特殊字元，將它們轉換為適當的轉義序列或移除
  preFinalCleaned = preFinalCleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, match => {
    // 保留常見的合法 JSON 字元轉義
    if (match === '\n') return '\\n'; // 實際換行轉為 \n 轉義
    if (match === '\r') return '\\r'; // 回車轉為 \r 轉義
    if (match === '\t') return '\\t'; // tab 轉為 \t 轉義
    if (match === '\b') return '\\b'; // 退格轉為 \b 轉義
    if (match === '\f') return '\\f'; // 換頁轉為 \f 轉義
    // 其他控制字元直接移除
    return '';
  });

  // 嘗試再次解析清理後的字串
  try {
      const parsed = JSON.parse(preFinalCleaned);
      console.log(`--- [AI LOG/JSON Sanitize: ${purpose}] 第二次清理後解析成功 ---`);
      return parsed;
  } catch (e) {
      console.warn(`--- [AI LOG/JSON Sanitize: ${purpose}] 第二次清理後解析失敗，嘗試更進階修復 (${e.message}) ---`);
  }
  
  // 步驟 4: 最後的嘗試 - 更激進的修復 (例如單引號轉雙引號)
  try {
      // 嘗試修復單引號 (需謹慎，可能誤傷)
      let aggressiveCleaned = preFinalCleaned.replace(/(?<!\\)'/g, '"'); // 單引號轉雙引號，排除轉義的單引號
      
      // 去除潛在的尾隨逗號 (需謹慎，可能誤傷)
      aggressiveCleaned = aggressiveCleaned.replace(/,\s*\}/g, '}').replace(/,\s*\]/g, ']');

      const parsed = JSON.parse(aggressiveCleaned);
      console.log(`--- [AI LOG/JSON Sanitize: ${purpose}] 激進修復後解析成功 ---`);
      return parsed;
  } catch (e) {
      console.error(`--- [AI LOG/JSON Error: ${purpose}] 所有修復嘗試均失敗 ---`);
      console.error(`--- [AI LOG/JSON Error: ${purpose}] 原始字串片段: "${jsonString.substring(0, 200)}..."`);
      console.error(`--- [AI LOG/JSON Error: ${purpose}] 清理中字串片段: "${cleaned.substring(0, 200)}..."`);
      console.error(`--- [AI LOG/JSON Error: ${purpose}] 最後嘗試字串片段: "${preFinalCleaned.substring(0, 200)}..."`);

      // 如果都失敗了，拋出詳細的錯誤
      throw new Error(`無法解析 JSON (所有修復嘗試均失敗): ${e.message}\n原始內容片段: ${jsonString.substring(0, 150)}...`);
  }
}


/**
 * 呼叫 OpenAI Chat Completions API (保留原功能，可能備用或用於圖像生成提示詞)
 * @param {string} prompt - 要發送給模型的提示詞
 * @param {string} purpose - 請求目的 (用於日誌)
 * @returns {Promise<object>} - 解析後的 JSON 回應
 * @throws {Error} 如果 API 請求失敗或回應格式錯誤
 */
async function callOpenAI(prompt, purpose = "general") {
  console.log(`--- [AI LOG/OpenAI Request: ${purpose}] 使用模型: ${OPENAI_MODEL} ---`); 
  if (!OPENAI_API_KEY) throw new Error("OpenAI API 金鑰未設定");

  try {
    // 在提示詞中明確請求返回標準JSON格式
    const enhancedPrompt = typeof prompt === 'string' 
      ? `${prompt}\n\n請以有效的JSON格式回覆，不要使用Markdown。確保JSON可以直接被JSON.parse()解析，沒有額外的格式或標記。`
      : prompt;
      
    const messages = Array.isArray(enhancedPrompt) ? enhancedPrompt : [{ role: "user", content: enhancedPrompt }];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        // messages: [{ role: "user", content: enhancedPrompt }], // 修改為使用 messages 變數
        messages: messages,
        temperature: 0.7, // 稍微降低以提高一致性
        // response_format: { type: "json_object" }, // 嘗試使用強制 JSON 模式，但舊模型可能不支援或行為不穩定
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
       // 檢查是否有非正常的結束原因
       if (data.choices?.[0]?.finish_reason) {
           throw new Error(`OpenAI API (${purpose}) 回傳內容為空，結束原因: ${data.choices[0].finish_reason}`);
       }
      throw new Error(`OpenAI API (${purpose}) 回傳內容為空`);
    }

    // console.log(`--- [AI LOG/OpenAI Raw Response: ${purpose}] ---`); // 不打印完整內容
    // console.log(content.substring(0, 200) + '...'); // 僅打印部分內容預覽

    // --- 使用加強版 JSON 解析邏輯 ---
    let parsed;
    try {
      parsed = sanitizeAndParseJSON(content, purpose);
      // console.log(`--- [AI LOG/OpenAI JSON Parsed: ${purpose}] ---`);
      // console.log(parsed); // 打印解析後的物件

      if (typeof parsed !== 'object' || parsed === null) { // 允許空物件，但檢查是否為物件
          console.warn(`--- [AI LOG/OpenAI Warning: ${purpose}] JSON 解析結果不是有效的物件:`, parsed);
          // throw new Error(`GPT 回傳 (${purpose}) 的 JSON 格式無效或為空`); // 根據 sanitizeAndParseJSON 的錯誤處理，這裡可能不需要再次拋錯
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
 * 呼叫 Google Gemini API
 * @param {string | Array<Object>} prompt - 要發送給模型的提示詞 (字串或包含 role/text 的訊息陣列)
 * @param {string} purpose - 請求目的 (用於日誌)
 * @returns {Promise<object | string>} - 如果預期是 JSON，則為解析後的物件；否則為原始文本回應
 * @throws {Error} 如果 API 請求失敗或回應格式錯誤
 */
async function callGeminiAPI(prompt, purpose = "general") {
    console.log(`--- [AI LOG/Gemini Request: ${purpose}] 使用模型: ${GOOGLE_GEMINI_MODEL} ---`);
    if (!GOOGLE_AI_API_KEY) {
        console.error(`--- [AI LOG/Gemini Error: ${purpose}] Google AI API 金鑰未設定 ---`);
        throw new Error("Google AI API 金鑰未設定");
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_GEMINI_MODEL}:generateContent?key=${GOOGLE_AI_API_KEY}`;

    try {
        // Gemini 的 input 格式是 contents 陣列，每個元素是 part 的陣列
        // 簡單起見，如果輸入是字串，包裝成一個 user message
        const contents = Array.isArray(prompt) ? prompt : [{ role: "user", parts: [{ text: prompt }] }];

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: contents,
                // Optional: Add generation config if needed
                // generationConfig: { temperature: 0.7 } // 溫度設置
                // response_mime_type: "application/json" // Gemini 1.5 系列支援強制 JSON 輸出 (但 beta 功能可能不穩定)
            })
        });

        if (!response.ok) {
            let errorText = '';
            try {
                // 嘗試解析錯誤回應的 JSON 內容
                const errorData = await response.json();
                errorText = errorData?.error?.message || JSON.stringify(errorData);
            } catch {
                // 如果不是 JSON 格式，直接獲取文本內容
                errorText = await response.text();
            }
            console.error(`--- [AI LOG/Gemini Error: ${purpose}] API 錯誤回應:`, response.status, response.statusText, errorText);
            throw new Error(`Gemini API (${purpose}) 請求失敗: ${response.status} ${response.statusText}. 回應: ${errorText}`);
        }

        const responseData = await response.json(); // 解析 JSON 回應數據

        // --- Token 使用量 logging ---
        // console.log(`--- [AI LOG/Gemini Raw Response: ${purpose}] ---`, responseData); // 不打印完整回應
        if (responseData.usageMetadata) {
            console.log(`--- [AI LOG/Gemini Token Usage: ${purpose}] ---`,
                `Prompt: ${responseData.usageMetadata.promptTokenCount || 0},`,
                `Candidates: ${responseData.usageMetadata.candidatesTokenCount || 0},`,
                `Total: ${responseData.usageMetadata.totalTokenCount || 0}`
            );
        }
        // --- 結束 Token 使用量 logging ---

        // --- 提取回應內容 ---
        let content = '';
        // 從回應數據結構中提取實際的文本內容
        if (responseData.candidates?.[0]?.content?.parts?.[0]?.text) {
            content = responseData.candidates[0].content.parts[0].text;
        } else {
            // 如果無法提取內容，檢查是否有完成原因 (非正常停止) 或被阻止的原因
            const finishReason = responseData.candidates?.[0]?.finishReason;
            const blockReason = responseData.promptFeedback?.blockReason;

            if (finishReason && finishReason !== "STOP") {
                console.error(`--- [AI LOG/Gemini Error: ${purpose}] 回應被終止:`, finishReason, responseData.candidates?.[0]?.safetyRatings);
                 const safetyRatings = responseData.candidates?.[0]?.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || '無安全評級詳情';
                throw new Error(`Gemini 回應 (${purpose}) 因 '${finishReason}' 而被終止。安全檢查: ${safetyRatings}`);
            } else if (blockReason) {
                console.error(`--- [AI LOG/Gemini Error: ${purpose}] 請求被阻止:`, blockReason, responseData.promptFeedback.safetyRatings);
                 const safetyRatings = responseData.promptFeedback?.safetyRatings?.map(r => `${r.category}: ${r.probability}`).join(', ') || '無安全評級詳情';
                throw new Error(`Gemini 請求 (${purpose}) 因 '${blockReason}' 而被阻止。安全檢查: ${safetyRatings}`);
            } else {
                // 其他格式不符預期的情況
                console.error(`--- [AI LOG/Gemini Error: ${purpose}] 回應格式不符預期:`, responseData);
                throw new Error(`Gemini 回應 (${purpose}) 格式不符，無法提取內容。`);
            }
        }

        // --- 嘗試解析 JSON ---
        try {
            // 使用通用的 sanitizeAndParseJSON 函數進行解析
             console.log(`--- [AI LOG/Gemini Attempting JSON Parse: ${purpose}] ---`);
            return sanitizeAndParseJSON(content, purpose);
        } catch (e) {
            // 如果 JSON 解析失敗，但我們仍然有原始文本內容
            console.warn(`--- [AI LOG/Gemini JSON Parse Failed: ${purpose}] 返回原始文本。`, e.message);
            // 根據呼叫目的，可能只需要原始文本。如果目的需要 JSON，則應在呼叫方進行驗證。
            // 這裡先返回原始文本，讓呼叫方決定如何處理。
            // 或者更嚴格地說，如果預期 JSON 但解析失敗，就應該拋錯。
            // 假設大多數情況下，我們呼叫 Gemini 是為了獲得結構化的 JSON。
            throw new Error(`Gemini 回傳 (${purpose}) 內容無法解析為 JSON: ${e.message}`);
        }

    } catch (error) {
        console.error(`--- [AI LOG/Gemini Error: ${purpose}] 呼叫失敗:`, error);
        // 重新拋出錯誤
        throw error;
    }
}


/**
 * 呼叫 Stability AI 生成圖片 (保留原功能，用於未來可能的圖像生成需求)
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
 * 獲取 Stability AI 的可用參數說明 (保留)
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

// 導出新的 callGeminiAPI 函數
module.exports = {
  callOpenAI,
  callStabilityAI,
  callGeminiAPI, // 新增
  sanitizeAndParseJSON, // 保留
  getStabilityAIParamsInfo // 保留
};