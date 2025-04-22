// newDivinationController.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { callOpenAI, sanitizeAndParseJSON } = require('./aiUtils'); // 引入增強版的 AI 輔助函數

/**
 * 將 AI 返回的籤詩分析物件轉換為 HTML 格式 (新版本)
 * @param {Object} analysisObj - AI 返回的分析結果物件
 * @param {Array<Object>} selectedCards - 用戶選擇的三張卡牌資訊
 * @returns {string} - 格式化的 HTML 字串
 */
function formatPoemAnalysisToHtml(analysisObj, selectedCards) {
  try {
    // 基本驗證
    if (!analysisObj || typeof analysisObj !== 'object') {
      throw new Error('無效的分析物件');
    }

    // 從分析物件中提取內容，優先使用 analysis_content 或 poem_analysis
    const content = analysisObj.analysis_content || analysisObj.poem_analysis || analysisObj;
    const cardNames = selectedCards.map(c => c?.name || '?').join('、'); // 提取卦名

    let html = `<div class="analysis-content poem-analysis">`; // 添加特定 class

    // 顯示抽到的卦象組合
    html += `<div class="section trigram-summary">
               <h3>您抽得卦象</h3>
               <p class="trigram-names">${cardNames}</p>
             </div>`;

    // 定義期望的籤詩章節和標題
    const sections = [
      { key: '卦象總解', title: '卦象總解' }, // e.g., "Interpretation Summary"
      { key: '當前運勢', title: '當前運勢' }, // e.g., "Current Fortune"
      { key: '應對之道', title: '應對之道' }, // e.g., "Advice"
      { key: '最終啟示', title: '最終啟示' }  // e.g., "Final Revelation/Blessing"
    ];

    // 遍歷並生成章節 HTML
    let sectionFound = false;
    sections.forEach(section => {
      if (content[section.key] && typeof content[section.key] === 'string') {
        html += `<div class="section section-${section.key}">
                   <h3>${section.title}</h3>
                   <p>${content[section.key].replace(/\n/g, '<br>')}</p>  </div>`; // 將換行符轉為 <br>
        sectionFound = true;
      }
    });

    // 如果找不到任何預期章節，嘗試顯示所有頂層字串值作為段落
    if (!sectionFound) {
      html += '<div class="section section-fallback">';
      html += '<h3>綜合解析</h3>'; // 提供一個通用標題
      let fallbackContent = '';
      for (const value of Object.values(content)) {
        if (typeof value === 'string') {
          fallbackContent += `<p>${value.replace(/\n/g, '<br>')}</p>`;
        }
      }
      // 如果連字串都找不到，顯示原始物件
      if (!fallbackContent) {
          fallbackContent = `<pre>${JSON.stringify(content, null, 2)}</pre>`;
          html += `<p>無法提取標準格式的解析，顯示原始回應：</p>`;
      }
       html += fallbackContent;
       html += '</div>';
    }

    html += '</div>'; // analysis-content 結束
    return html;

  } catch (error) {
    console.error('--- [API LOG/Format Poem Analysis Error] ---', error);
    // 提供更友好的錯誤回饋 HTML
    const cardNamesText = selectedCards.map(c => c?.name || '?').join('、');
    return `<div class="analysis-content poem-analysis error">
              <h3>啟示獲取失敗</h3>
              <p>您抽得的卦象為：${cardNamesText}</p>
              <p>抱歉，在為您解讀天機時遇到了阻礙。可能是星辰暫未排列整齊，或是網路訊號略有波動。</p>
              <p>請稍候片刻，再次嘗試，或靜心體會卦象本身的意涵。錯誤參考：${error.message}</p>
            </div>`;
  }
}


/**
 * 通用日誌與錯誤處理輔助函式 (保持不變)
 * @param {string} endpoint - API 端點名稱
 * @param {Error} error - 錯誤物件
 * @param {Object} details - 附加資訊
 * @returns {Object} - 標準化的錯誤回應物件
 */
function handleApiError(endpoint, error, details = {}) {
  const errorId = uuidv4().slice(0, 8);
  const isAiError = error.message && (error.message.includes('OpenAI API') || error.message.includes('GPT 回傳') || error.message.includes('JSON'));
  const logDetails = { errorId, endpoint, message: error.message, stack: error.stack, ...details };

  if (isAiError) {
    console.warn(`--- [API LOG/${endpoint} AI Service Error ${errorId}] ---`, error.message);
  } else {
    console.error(`--- [API LOG/${endpoint} Error ${errorId}] ---`, logDetails);
  }

  let userMessage = `處理請求時發生錯誤。參考碼: ${errorId}`;
  if (isAiError) {
    userMessage = `與 AI 服務溝通時發生問題，請稍後再試。參考碼: ${errorId}`;
  }

  return {
    success: false,
    error: userMessage,
    errorId,
    errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined
  };
}

// --- API Endpoint: /api/divination/start (保持不變) ---
router.post('/start', async (req, res) => {
  const { userInput } = req.body;
  const endpoint = 'Divination Start';

  if (!userInput || typeof userInput !== 'string' || userInput.trim().length < 2) {
    return res.status(400).json({ success: false, error: '請輸入至少兩個字的初始心聲', errorCode: 'INVALID_INPUT'});
  }

  try {
    console.log(`--- [API LOG/${endpoint}] 收到用戶初始心聲 (長度: ${userInput.length}) ---`);
    // ... (原始 /start 邏輯不變) ...
    const initialContentPrompt = `你是一位充滿智慧與慈悲的兒童心理導師，如同媽祖般溫柔親切。你了解人們在生活中的煩惱與渴望，總能用簡單的故事與柔和的語氣，安撫人心。詢問者此刻的心聲是：「${userInput}」
請根據這個心聲，回應一段**貼近日常、帶有東方象徵意涵**的寓言故事開頭，並嚴格以 JSON 格式回應，不包含任何額外文字：
1.  **storySegment**: 寫一段全新的「寓言故事開頭」，約 20-30 字，正體中文，生動、有想像力且富含象徵意涵。
2.  **guidingQuestion**: 根據這段故事開頭的意境，設計一個引導性的、簡單具體的問題（正體中文，約 5-15 字）。
3.  **imagePrompt**: 根據故事開頭的意境，創造一段精確的英文 Image Prompt，描述畫面主體、氛圍、光線、色彩，並融入以下風格："Inspired by Alphonse Mucha and traditional East Asian ink wash painting (sumi-e), fantasy realism style. Focused composition, symbolic subject, tranquil setting (misty mountains, serene garden, moonlit water), ethereal soft lighting, drifting mist, flowing lines, delicate textures. Mood: Sacred stillness, poetic melancholy, quiet transcendence, spiritual reflection, timeless beauty. Gentle harmonious color palette, touches of gold/luminescence. Strictly no text."

JSON 結構如下：
{
  "storySegment": "寓言故事開頭",
  "guidingQuestion": "引導性提問",
  "imagePrompt": "圖像提示詞 (英文)"
}`;
    let initialContentResult;
     try {
       initialContentResult = await callOpenAI(initialContentPrompt, 'start - content');
     } catch (error) {
       console.warn(`--- [API LOG/${endpoint} AI Parse Warning] ---`, error.message);
       const contentMatch = error.message.match(/原始內容片段\: (.*?)\.\.\.$/);
       if (contentMatch && contentMatch[1]) {
         try {
           initialContentResult = sanitizeAndParseJSON(contentMatch[1], 'start - content - recovery');
           console.log(`--- [API LOG/${endpoint}] 成功手動恢復JSON回應 ---`);
         } catch (innerError) { throw error; }
       } else { throw error; }
     }
     if (!initialContentResult || !initialContentResult.storySegment || !initialContentResult.guidingQuestion) {
       throw new Error('AI 回傳的故事內容不完整，缺少必要欄位');
     }
     const optionsPrompt = `基於以下剛生成的寓言段落和提問：
寓言：「${initialContentResult.storySegment}」
提問：「${initialContentResult.guidingQuestion}」
請生成 3 個簡短的（5-15 字）回應選項，供使用者點選。選項需與寓言和提問相關，提供不同思考方向，避免平淡或重複。使用正體中文。
請嚴格以 JSON 格式回應，只包含選項陣列，結構如下：
{
  "options": ["選項文字一", "選項文字二", "選項文字三"]
}`;
    const optionsResult = await callOpenAI(optionsPrompt, 'start - options');
    const options = Array.isArray(optionsResult.options) ? optionsResult.options :
                   (typeof optionsResult.options === 'string' ? [optionsResult.options] :
                   ['或許可以...', '我認為...', '這讓我想到...']);
    const interactionId = uuidv4();
    const response = {
      success: true,
      interactionId: interactionId,
      storySegment: initialContentResult.storySegment,
      guidingQuestion: initialContentResult.guidingQuestion,
      imagePrompt: initialContentResult.imagePrompt,
      options: options
    };
    console.log(`--- [API LOG/${endpoint} Success] 已生成互動ID: ${interactionId} ---`);
    res.json(response);

  } catch (error) {
    const errorResponse = handleApiError(endpoint, error, { userInputLength: userInput.length });
    res.status(500).json(errorResponse);
  }
});

// --- API Endpoint: /api/divination/continue (保持不變，因為新流程前端不會呼叫它) ---
router.post('/continue', async (req, res) => {
    // 在新流程中，這個端點理論上不會被前端呼叫
    console.warn(`--- [API LOG/Divination Continue] 收到請求，但在新流程中此端點應不被使用 ---`);
    // 可以返回一個錯誤或一個提示訊息
    res.status(404).json({
        success: false,
        error: '此 API 端點在新版請示流程中不再使用。',
        errorCode: 'ENDPOINT_DEPRECATED'
    });
    /*
    // --- 原有邏輯保留，以防萬一 ---
    const { interactionId, round, userResponse, previousStorySegment, previousGuidingQuestion, drawnCard } = req.body;
    const endpoint = `Divination Continue R${round || '?'}`;
    // ... (原有驗證和處理邏輯) ...
    */
});

// --- API Endpoint: /api/divination/analyze (修改以適應新流程) ---
router.post('/analyze', async (req, res) => {
  // *** 修改：只接收 selectedCards ***
  const { selectedCards, interactionId } = req.body; // interactionId 可選，用於日誌
  const endpoint = 'Divination Analyze (New Flow)';

  // *** 新的輸入驗證 ***
  if (!Array.isArray(selectedCards) || selectedCards.length !== 3) {
    return res.status(400).json({
      success: false,
      error: '請求數據不完整或格式錯誤，需要包含 3 張選定的卡牌資訊 (selectedCards)',
      errorCode: 'INVALID_CARD_DATA'
    });
  }
  // 驗證每張卡牌的結構 (至少需要 name)
  const invalidCard = selectedCards.find(card => !card || typeof card.name !== 'string' || !card.name);
  if (invalidCard) {
    return res.status(400).json({
      success: false,
      error: 'selectedCards 陣列中的卡牌資訊不完整 (至少需要 name)',
      errorCode: 'INVALID_CARD_STRUCTURE'
    });
  }

  try {
    const cardNames = selectedCards.map(c => c.name).join('、');
    console.log(`--- [API LOG/${endpoint}] 開始為卡牌組合 [${cardNames}] 生成籤詩分析 (ID: ${interactionId || 'N/A'}) ---`);

    // 1. *** 建構新的分析提示詞 ***
    const analysisPrompt = `你是一位精通易經八卦的解籤師，請根據使用者抽到的以下三張卦象，為他們提供一份指點迷津的籤詩分析。

**抽到的卦象組合**：${cardNames}

**任務**：
請生成一份籤詩分析報告，包含以下部分，並嚴格以 JSON 格式回應：
1.  **卦象總解**: 綜合解釋這三個卦象組合在一起所代表的整體意涵、主要趨勢或核心主題。
2.  **當前運勢**: 根據此卦象組合，分析詢問者目前可能面臨的狀況、機遇或挑戰。
3.  **應對之道**: 針對當前運勢，提供具體的行動建議、心態調整方向或需要注意的事項。
4.  **最終啟示**: 給予一段溫暖、鼓勵或帶有祝福意味的結語。

**要求**：
- 使用台灣正體中文。
- 語氣需仿照傳統籤詩，帶有玄妙與指引的意味，但也要易於理解。
- 分析需緊扣這三個卦象的組合意義，避免過於空泛。
- 每個部分內容約 50-100 字。
- 不要包含任何 JSON 格式之外的文字或 Markdown。

**JSON結構範例**：
{
  "poem_analysis": {
    "卦象總解": "...",
    "當前運勢": "...",
    "應對之道": "...",
    "最終啟示": "..."
  }
}`;

    // 2. 呼叫 OpenAI 獲取分析結果
    let analysisResult;
    try {
      analysisResult = await callOpenAI(analysisPrompt, 'analyze - poem');
    } catch (error) {
      // 嘗試手動解析回應
      console.warn(`--- [API LOG/${endpoint} AI Parse Warning] ---`, error.message);
      const contentMatch = error.message.match(/原始內容片段\: (.*?)\.\.\.$/);
      if (contentMatch && contentMatch[1]) {
        try {
          analysisResult = sanitizeAndParseJSON(contentMatch[1], 'analyze - poem - recovery');
          console.log(`--- [API LOG/${endpoint}] 成功手動恢復JSON回應 ---`);
        } catch (innerError) { throw error; }
      } else { throw error; }
    }

    // 3. *** 使用新的格式化函數 ***
    let analysisHtml = formatPoemAnalysisToHtml(analysisResult, selectedCards);

    // 驗證轉換結果
    if (!analysisHtml || analysisHtml.includes("無法提取標準格式") || analysisHtml.includes("啟示獲取失敗")) {
        console.warn(`--- [API LOG/${endpoint} Warning] 分析 HTML 內容可能無效或格式不正確 ---`);
        // 即使格式化失敗，也嘗試返回錯誤 HTML，讓前端知道
    }

    // 4. 生成 session ID 和 canSave 標誌 (邏輯可保持不變)
    const sessionId = uuidv4();
    const canSave = true; // 假設允許儲存

    console.log(`--- [API LOG/${endpoint} Success] 已生成籤詩分析 (HTML 長度: ${analysisHtml.length}) ---`);

    // 5. 回傳分析結果
    res.json({
      success: true,
      analysis: analysisHtml, // HTML 籤詩內容
      sessionId: sessionId,
      canSave: canSave
    });

  } catch (error) {
    // *** 使用新的格式化函數生成錯誤時的 HTML ***
    const errorResponse = handleApiError(endpoint, error, { interactionId, cardNames: selectedCards.map(c=>c.name).join(',') });
    res.status(500).json({
      ...errorResponse,
      analysis: formatPoemAnalysisToHtml({ // 傳入空物件和卡牌，讓格式化函數產生錯誤訊息 HTML
          error: `生成籤詩時發生錯誤: ${error.message}`
      }, selectedCards),
      sessionId: null,
      canSave: false
    });
  }
});


module.exports = router;