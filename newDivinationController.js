// newDivinationController.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { callOpenAI, sanitizeAndParseJSON } = require('./aiUtils'); // 引入增強版的 AI 輔助函數

/**
 * 將分析結果物件轉換為 HTML 格式
 * @param {Object} analysisObj - 分析結果物件
 * @returns {string} - 格式化的 HTML 字串
 */
function formatAnalysisToHtml(analysisObj) {
  try {
    // 如果直接是字串，直接返回包裝後的字串
    if (typeof analysisObj === 'string') {
      return `<div class="analysis-content">${analysisObj}</div>`;
    }
    
    // 檢查是否有 analysis_word 欄位
    let content = analysisObj;
    if (analysisObj.analysis_word) {
      // 如果 analysis_word 是物件，處理嵌套結構
      if (typeof analysisObj.analysis_word === 'object' && analysisObj.analysis_word !== null) {
        content = analysisObj.analysis_word;
      } else {
        // 如果 analysis_word 是字串，直接使用
        return `<div class="analysis-content">${analysisObj.analysis_word}</div>`;
      }
    }
    
    // 生成 HTML，處理可能的嵌套結構
    let html = '<div class="analysis-content">';
    
    // 檢查是否有標準化的章節標題
    const sections = [
      { key: '回顧與串聯', title: '回顧與串聯' },
      { key: '卦象解析', title: '卦象解析' },
      { key: '核心洞見', title: '核心洞見' },
      { key: '祝福語', title: '祝福語' }
    ];
    
    // 處理各個章節
    let hasStandardSections = false;
    for (const section of sections) {
      if (content[section.key]) {
        hasStandardSections = true;
        html += `<div class="section">
          <h3>${section.title}</h3>
          <p>${content[section.key]}</p>
        </div>`;
      }
    }
    
    // 如果沒有找到標準章節，嘗試遍歷所有鍵值對
    if (!hasStandardSections) {
      for (const [key, value] of Object.entries(content)) {
        if (typeof value === 'string') {
          html += `<div class="section">
            <h3>${key}</h3>
            <p>${value}</p>
          </div>`;
        }
      }
    }
    
    html += '</div>';
    return html;
  } catch (error) {
    console.error('--- [API LOG/Format Analysis Error] ---', error);
    return `<div class="analysis-content error">
      <p>抱歉，處理分析內容時發生錯誤。以下是原始分析文字：</p>
      <pre>${JSON.stringify(analysisObj, null, 2)}</pre>
    </div>`;
  }
}

/**
 * 通用日誌與錯誤處理輔助函式
 * @param {string} endpoint - API 端點名稱
 * @param {Error} error - 錯誤物件
 * @param {Object} details - 附加資訊
 * @returns {Object} - 標準化的錯誤回應物件
 */
function handleApiError(endpoint, error, details = {}) {
  const errorId = uuidv4().slice(0, 8); // 產生簡短的錯誤識別碼，便於後續追蹤
  
  // 根據錯誤類型區分日誌級別和處理方式
  const isAiError = error.message && (
    error.message.includes('OpenAI API') || 
    error.message.includes('GPT 回傳') ||
    error.message.includes('JSON')
  );
  
  // 建構詳細錯誤日誌
  const logDetails = {
    errorId,
    endpoint,
    message: error.message,
    stack: error.stack,
    ...details
  };
  
  // 日誌輸出
  if (isAiError) {
    console.warn(`--- [API LOG/${endpoint} AI Service Error ${errorId}] ---`, error.message);
  } else {
    console.error(`--- [API LOG/${endpoint} Error ${errorId}] ---`, logDetails);
  }
  
  // 建構用戶友好的錯誤訊息
  let userMessage = `處理請求時發生錯誤：${error.message}`;
  if (isAiError) {
    userMessage = '與 AI 服務通訊時發生問題，請稍後再試。';
  }
  
  // 返回標準化的錯誤回應
  return {
    success: false,
    error: userMessage,
    errorId, // 提供錯誤識別碼，方便用戶報告問題
    errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined
  };
}

// --- API Endpoint: /api/divination/start ---
router.post('/start', async (req, res) => {
  const { userInput } = req.body;
  const endpoint = 'Divination Start';

  // 增強的輸入驗證
  if (!userInput || typeof userInput !== 'string' || userInput.trim().length < 2) {
    return res.status(400).json({ 
      success: false, 
      error: '請輸入至少兩個字的初始心聲',
      errorCode: 'INVALID_INPUT'
    });
  }

  try {
    console.log(`--- [API LOG/${endpoint}] 收到用戶初始心聲 (長度: ${userInput.length}) ---`);
    
    // 1. 生成第一幕內容的 Prompt
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

    // 2. 呼叫 OpenAI 獲取初始內容
    let initialContentResult;
    try {
      initialContentResult = await callOpenAI(initialContentPrompt, 'start - content');
    } catch (error) {
      // 嘗試手動解析回應內容，處理部分失敗情況
      console.warn(`--- [API LOG/${endpoint} AI Parse Warning] ---`, error.message);
      
      // 如果錯誤訊息中包含原始回應，嘗試手動解析
      const contentMatch = error.message.match(/原始內容片段\: (.*?)\.\.\.$/);
      if (contentMatch && contentMatch[1]) {
        try {
          initialContentResult = sanitizeAndParseJSON(contentMatch[1], 'start - content - recovery');
          console.log(`--- [API LOG/${endpoint}] 成功手動恢復JSON回應 ---`);
        } catch (innerError) {
          throw error; // 如果恢復也失敗，拋出原始錯誤
        }
      } else {
        throw error;
      }
    }

    // 驗證初始內容結果
    if (!initialContentResult || !initialContentResult.storySegment || !initialContentResult.guidingQuestion) {
      throw new Error('AI 回傳的故事內容不完整，缺少必要欄位');
    }

    // 3. 生成選項的 Prompt
    const optionsPrompt = `基於以下剛生成的寓言段落和提問：
寓言：「${initialContentResult.storySegment}」
提問：「${initialContentResult.guidingQuestion}」

請生成 3 個簡短的（5-15 字）回應選項，供使用者點選。選項需與寓言和提問相關，提供不同思考方向，避免平淡或重複。使用正體中文。

請嚴格以 JSON 格式回應，只包含選項陣列，結構如下：
{
  "options": ["選項文字一", "選項文字二", "選項文字三"]
}`;

    // 4. 呼叫 OpenAI 獲取選項
    const optionsResult = await callOpenAI(optionsPrompt, 'start - options');

    // 確保選項是有效的陣列
    const options = Array.isArray(optionsResult.options) ? optionsResult.options : 
                   (typeof optionsResult.options === 'string' ? [optionsResult.options] : 
                   ['或許可以...', '我認為...', '這讓我想到...']);

    // 5. 生成 interactionId
    const interactionId = uuidv4();

    // 6. 組合並回傳結果
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

// --- API Endpoint: /api/divination/continue ---
router.post('/continue', async (req, res) => {
  const {
    interactionId,
    round, // 目前是第幾輪的回應 (e.g., 1 代表回應第一輪, 要生成第二輪)
    userResponse,
    previousStorySegment,
    previousGuidingQuestion
    //drawnCard
  } = req.body;
  
  const endpoint = `Divination Continue R${round || '?'}`;

  // 增強的輸入驗證
  if (!interactionId || typeof interactionId !== 'string') {
    return res.status(400).json({ success: false, error: '缺少有效的互動ID', errorCode: 'MISSING_ID' });
  }
  
  if (round === undefined || typeof round !== 'number' || round < 1 || round > 2) {
    return res.status(400).json({ success: false, error: '無效的輪次 (round) 值', errorCode: 'INVALID_ROUND' });
  }
  
  if (!userResponse || typeof userResponse !== 'string' || userResponse.trim().length === 0) {
    return res.status(400).json({ success: false, error: '缺少用戶回應', errorCode: 'MISSING_RESPONSE' });
  }
  
  if (!previousStorySegment || !previousGuidingQuestion) {
    return res.status(400).json({ success: false, error: '缺少前一輪的故事內容或引導問題', errorCode: 'MISSING_CONTEXT' });
  }

  try {
    console.log(`--- [API LOG/${endpoint}] 處理互動 ${interactionId}, 第 ${round} 輪回應 ---`);
    
    // 1. 建構主要內容 Prompt
    //const cardHint = drawnCard.name ? `抽到的卦象【${drawnCard.name}】暗示著某種趨勢或能量，請在續寫故事或提問時隱晦地融入其意涵，但不要直接提及卦象名稱。` : "";

    const mainContentPrompt = `你是一位充滿智慧與慈悲的兒童心理導師，擅長編織**連續性**的心靈寓言。
**這是正在進行的寓言的上一段落**：「${previousStorySegment}」
**上一個引導問題是**：「${previousGuidingQuestion}」
使用者對此的回應是：「${userResponse}」

請根據使用者的回應，**巧妙地延續**這個寓言故事，並完成以下任務，嚴格以 JSON 格式回應：

1.  **aiReply**: (可選) 針對使用者的回應，寫一句不超過 30 字、充滿哲思與慈悲的回應短語（正體中文）。如果沒有特別合適的可以省略此欄位。
2.  **storySegment**: **承接**上一段落的情境與意象，並將使用者回應中流露的情感或思考融入其中，編寫故事的**下一個段落** (約 20-30 字，正體中文)。風格需保持東方哲思、寧靜、象徵性，並確保與前文有**明顯的連貫性**。
3.  **guidingQuestion**: 根據這個**故事續篇**的意境，設計一個**新的**引導性的、簡單具體的問題（正體中文，約 5-15 字），問題需與前一個不同。
4.  **imagePrompt**: 根據這個**故事續篇**的意境與畫面，創造一段精確的英文 Image Prompt。需清晰描述**續篇中**的畫面主體、氛圍、光線、色彩（考慮與前一畫面的關聯性），融合續篇的象徵意義。風格同前："Inspired by Alphonse Mucha and traditional East Asian ink wash painting (sumi-e), fantasy realism style... Strictly no text."

JSON 結構如下：
{
  "aiReply": "回應短語 (如果有的話)",
  "storySegment": "故事續篇",
  "guidingQuestion": "新的引導性提問",
  "imagePrompt": "新的圖像提示詞 (英文)"
}`;

    // 2. 呼叫 OpenAI 獲取主要內容
    let mainContentResult;
    try {
      mainContentResult = await callOpenAI(mainContentPrompt, `continue R${round+1} - content`);
    } catch (error) {
      // 和 start 端點類似，嘗試手動解析回應
      console.warn(`--- [API LOG/${endpoint} AI Parse Warning] ---`, error.message);
      
      const contentMatch = error.message.match(/原始內容片段\: (.*?)\.\.\.$/);
      if (contentMatch && contentMatch[1]) {
        try {
          mainContentResult = sanitizeAndParseJSON(contentMatch[1], `continue R${round+1} - content - recovery`);
          console.log(`--- [API LOG/${endpoint}] 成功手動恢復JSON回應 ---`);
        } catch (innerError) {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // 驗證主要內容結果
    if (!mainContentResult || !mainContentResult.storySegment || !mainContentResult.guidingQuestion) {
      throw new Error('AI 回傳的續篇內容不完整，缺少必要欄位');
    }

    // 3. 生成新選項的 Prompt
    const optionsPrompt = `基於以下剛生成的寓言段落和提問：
寓言：「${mainContentResult.storySegment}」
提問：「${mainContentResult.guidingQuestion}」

請生成 3 個簡短的（5-15 字）回應選項，供使用者點選。選項需與寓言和提問相關，提供不同思考方向，避免平淡或重複。使用正體中文。

請嚴格以 JSON 格式回應，只包含選項陣列，結構如下：
{
  "options": ["選項文字一", "選項文字二", "選項文字三"]
}`;

    // 4. 呼叫 OpenAI 獲取新選項
    const optionsResult = await callOpenAI(optionsPrompt, `continue R${round+1} - options`);
    
    // 確保選項是有效的陣列
    const options = Array.isArray(optionsResult.options) ? optionsResult.options : 
                   (typeof optionsResult.options === 'string' ? [optionsResult.options] : 
                   ['或許可以...', '我認為...', '這讓我想到...']);

    // 5. 組合並回傳結果
    const response = {
      success: true,
      interactionId: interactionId, // 保持 ID
      aiReply: mainContentResult.aiReply || null, // 如果沒有則為 null
      storySegment: mainContentResult.storySegment,
      guidingQuestion: mainContentResult.guidingQuestion,
      imagePrompt: mainContentResult.imagePrompt,
      options: options
    };
    
    console.log(`--- [API LOG/${endpoint} Success] 已生成第 ${round+1} 輪內容 ---`);
    res.json(response);

  } catch (error) {
    const errorResponse = handleApiError(endpoint, error, { 
      interactionId, 
      round, 
      responseLength: userResponse?.length
    });
    res.status(500).json(errorResponse);
  }
});

// --- API Endpoint: /api/divination/analyze ---
router.post('/analyze', async (req, res) => {
  const { interactionId, initialUserInput, interactions } = req.body;
  const endpoint = 'Divination Analyze';

  // 增強的輸入驗證
  if (!interactionId || typeof interactionId !== 'string') {
    return res.status(400).json({ success: false, error: '缺少有效的互動ID', errorCode: 'MISSING_ID' });
  }
  
  if (!initialUserInput || typeof initialUserInput !== 'string') {
    return res.status(400).json({ success: false, error: '缺少初始心聲', errorCode: 'MISSING_INITIAL_INPUT' });
  }
  
  if (!Array.isArray(interactions) || interactions.length === 0) {
    return res.status(400).json({ success: false, error: '缺少互動記錄', errorCode: 'MISSING_INTERACTIONS' });
  }
  
  // 驗證互動記錄的結構
  const invalidInteractions = interactions.filter(i => 
    !i.storySegment || !i.guidingQuestion || !i.userResponse
  );
  
  if (invalidInteractions.length > 0) {
    return res.status(400).json({ 
      success: false, 
      error: '互動記錄結構不完整', 
      errorCode: 'INVALID_INTERACTIONS' 
    });
  }

  try {
    console.log(`--- [API LOG/${endpoint}] 開始為互動 ${interactionId} 生成分析報告 ---`);
    
    // 1. 建構分析歷程
    let history = "";
    interactions.forEach((interaction, index) => {
      history += `\n--- 第 ${index + 1} 輪 ---\n`;
      history += `故事片段：${interaction.storySegment}\n`;
      history += `引導問題：${interaction.guidingQuestion}\n`;
      history += `使用者回應：${interaction.userResponse}\n`;
      history += `抽到卦象：【${interaction.drawnCard?.name || '未知'}】\n`;
    });

    // 2. 建構分析提示詞
    const analysisPrompt = `你是一位資深的解卦師與心靈導師，請整合以下完整的互動歷程，為用戶提供一份深刻且個人化的分析報告。

**初始心聲**：「${initialUserInput}」
**互動歷程與卦象**：${history}
**任務**：
請撰寫一份分析報告，需包含以下幾個部分：
1.  **回顧與串聯**：簡要回顧故事的發展脈絡，以及使用者在每一輪的回應所體現的心境變化。
2.  **卦象解析**：結合三輪抽到的卦象（${interactions.map(i => i.drawnCard?.name || '?').join('、')}），解釋它們在此情境下可能共同揭示的整體趨勢、挑戰或機遇。
3.  **核心洞見**：提煉出整個互動過程中最關鍵的洞見或啟示，直接回應使用者的初始心聲。
4.  **祝福語**：以溫暖、鼓勵的語氣作結。

**要求**：
- 使用台灣正體中文。
- 語氣需專業、慈悲、富有同理心。
- 分析需緊密結合使用者回應、故事發展和卦象意涵，避免空泛。
**JSON結構範例**：
{
  "analysis_word": {
    "回顧與串聯": "...",
    "卦象解析": "...",
    "核心洞見": "...",
    "祝福語": "..."
  }
}`;

    // 3. 呼叫 OpenAI 獲取分析結果
    let analysisResult;
    try {
      analysisResult = await callOpenAI(analysisPrompt, 'analyze');
    } catch (error) {
      // 嘗試手動解析回應
      console.warn(`--- [API LOG/${endpoint} AI Parse Warning] ---`, error.message);
      
      const contentMatch = error.message.match(/原始內容片段\: (.*?)\.\.\.$/);
      if (contentMatch && contentMatch[1]) {
        try {
          analysisResult = sanitizeAndParseJSON(contentMatch[1], 'analyze - recovery');
          console.log(`--- [API LOG/${endpoint}] 成功手動恢復JSON回應 ---`);
        } catch (innerError) {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // 4. 將分析結果轉換為 HTML 格式
    let analysisHtml = formatAnalysisToHtml(analysisResult);
    
    // 驗證轉換結果
    if (!analysisHtml || analysisHtml.length < 50) {
      console.warn(`--- [API LOG/${endpoint} Warning] 分析 HTML 內容過短或無效 ---`, analysisHtml);
      analysisHtml = `<div class="analysis-content fallback">
        <p>抱歉，無法生成完整的分析報告。這可能是因為您提供的資訊不足或系統暫時性問題。</p>
        <p>請稍後再試，或提供更完整的互動記錄。</p>
      </div>`;
    }

    // 5. 生成 session ID 和 canSave 標誌
    const sessionId = uuidv4(); // 或使用 interactionId 作為 Session ID
    const canSave = true; // 假設允許儲存

    console.log(`--- [API LOG/${endpoint} Success] 已生成分析報告 (長度: ${analysisHtml.length}) ---`);
    
    // 6. 回傳分析結果
    res.json({
      success: true,
      analysis: analysisHtml,
      sessionId: sessionId,
      canSave: canSave
    });

  } catch (error) {
    const errorResponse = handleApiError(endpoint, error, { interactionId, interactionsCount: interactions?.length });
    res.status(500).json({
      ...errorResponse,
      analysis: `<div class="analysis-content error">
        <p>生成分析報告時發生錯誤。</p>
        <p>錯誤代碼: ${errorResponse.errorId}</p>
        <p>請稍後再試，或聯絡客服提供此錯誤代碼。</p>
      </div>`,
      sessionId: null,
      canSave: false
    });
  }
});

module.exports = router;