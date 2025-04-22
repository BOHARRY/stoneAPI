// newDivinationController.js (專注於新流程 - 靈石問籤)
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { callOpenAI, sanitizeAndParseJSON, callStabilityAI } = require('./aiUtils');

// formatPoemAnalysisToHtml (保持不變 - 用於格式化籤詩)
function formatPoemAnalysisToHtml(analysisObj, selectedCards) {
  try {
    if (!analysisObj || typeof analysisObj !== 'object') {
      throw new Error('無效的分析物件');
    }
    const content = analysisObj.analysis_content || analysisObj.poem_analysis || analysisObj;
    const cardNames = selectedCards.map(c => c?.name || '?').join('、');
    let html = `<div class="analysis-content poem-analysis">`;
    html += `<div class="section trigram-summary"><h3>您抽得卦象</h3><p class="trigram-names">${cardNames}</p></div>`;
    const sections = [
      { key: '卦象總解', title: '卦象總解' }, { key: '當前運勢', title: '當前運勢' },
      { key: '應對之道', title: '應對之道' }, { key: '最終啟示', title: '最終啟示' }
    ];
    let sectionFound = false;
    sections.forEach(section => {
      if (content[section.key] && typeof content[section.key] === 'string') {
        html += `<div class="section section-${section.key}"><h3>${section.title}</h3><p>${content[section.key].replace(/\n/g, '<br>')}</p></div>`;
        sectionFound = true;
      }
    });
    if (!sectionFound) {
      html += '<div class="section section-fallback"><h3>綜合解析</h3>';
      let fallbackContent = '';
      for (const value of Object.values(content)) {
        if (typeof value === 'string') { fallbackContent += `<p>${value.replace(/\n/g, '<br>')}</p>`; }
      }
      if (!fallbackContent) {
          fallbackContent = `<pre>${JSON.stringify(content, null, 2)}</pre>`;
          html += `<p>無法提取標準格式的解析，顯示原始回應：</p>`;
      }
      html += fallbackContent;
      html += '</div>';
    }
    html += '</div>';
    return html;
  } catch (error) {
    console.error('--- [API LOG/Format Poem Analysis Error] ---', error);
    const cardNamesText = selectedCards.map(c => c?.name || '?').join('、');
    return `<div class="analysis-content poem-analysis error"><h3>啟示獲取失敗</h3><p>您抽得的卦象為：${cardNamesText}</p><p>抱歉，在為您解讀天機時遇到了阻礙。請稍候片刻，再次嘗試。錯誤參考：${error.message}</p></div>`;
  }
}

// handleApiError (保持不變 - 通用錯誤處理)
function handleApiError(endpoint, error, details = {}) {
    const errorId = uuidv4().slice(0, 8);
    const isAiError = error.message && (error.message.includes('OpenAI API') || error.message.includes('GPT 回傳') || error.message.includes('JSON') || error.message.includes('圖片生成'));
    const logDetails = { errorId, endpoint, message: error.message, stack: error.stack, ...details };
    if (isAiError) { console.warn(`--- [API LOG/${endpoint} AI Service Error ${errorId}] ---`, error.message); }
    else { console.error(`--- [API LOG/${endpoint} Error ${errorId}] ---`, logDetails); }
    let userMessage = `處理請求時發生錯誤。參考碼: ${errorId}`;
    if (isAiError) { userMessage = `與 AI 服務溝通時發生問題，請稍後再試。參考碼: ${errorId}`; }
    return { success: false, error: userMessage, errorId, errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined };
}


// --- API Endpoint: /api/divination/analyze (新流程核心) ---
router.post('/analyze', async (req, res) => {
  // 只接收 selectedCards
  const { selectedCards } = req.body;
  const endpoint = 'Divination Analyze (LingShi)';

  // 輸入驗證
  if (!Array.isArray(selectedCards) || selectedCards.length !== 3) {
    return res.status(400).json({ success: false, error: '請求數據不完整，需要包含 3 張選定的卡牌資訊 (selectedCards)', errorCode: 'INVALID_CARD_DATA' });
  }
  const invalidCard = selectedCards.find(card => !card || typeof card.name !== 'string' || !card.name);
  if (invalidCard) {
    return res.status(400).json({ success: false, error: '卡牌資訊不完整 (至少需要 name)', errorCode: 'INVALID_CARD_STRUCTURE' });
  }

  const cardNames = selectedCards.map(c => c.name).join('、');
  let analysisResult = null;
  let analysisHtml = '';
  let finalImageUrl = null;
  const sessionId = uuidv4(); // 為這次分析產生一個 ID

  try {
    console.log(`--- [API LOG/${endpoint}] 開始為卡牌組合 [${cardNames}] 生成籤詩分析 (Session: ${sessionId}) ---`);

    // 1. 建構籤詩分析提示詞
    const analysisPrompt = `你是一位精通易經八卦的解籤師，請根據使用者抽到的以下三張卦象，為他們提供一份指點迷津的籤詩分析。
**抽到的卦象組合**：${cardNames}
**任務**：生成一份包含以下部分的籤詩分析報告，並嚴格以 JSON 格式回應：
1.  **卦象總解**: 綜合解釋這三個卦象組合的整體意涵。
2.  **當前運勢**: 分析詢問者目前狀況。
3.  **應對之道**: 提供具體建議。
4.  **最終啟示**: 給予鼓勵或祝福。
**要求**：台灣正體中文，仿傳統籤詩語氣但易懂，緊扣卦象組合，每部分約50-100字。
**JSON結構**：{"poem_analysis": {"卦象總解": "...", "當前運勢": "...", "應對之道": "...", "最終啟示": "..."}}`;

    // 2. 呼叫 OpenAI 獲取分析結果
    try {
      analysisResult = await callOpenAI(analysisPrompt, `analyze-poem-${sessionId}`);
    } catch (error) { // 嘗試從錯誤中恢復 JSON
      console.warn(`--- [API LOG/${endpoint} AI Parse Warning] ---`, error.message);
      const contentMatch = error.message.match(/原始內容片段\: (.*?)\.\.\.$/);
      if (contentMatch && contentMatch[1]) {
        try { analysisResult = sanitizeAndParseJSON(contentMatch[1], `analyze-poem-recovery-${sessionId}`); console.log(`--- [API LOG/${endpoint}] 手動恢復JSON成功 ---`); }
        catch (innerError) { throw error; }
      } else { throw error; }
    }

    // 3. 格式化籤詩 HTML
    analysisHtml = formatPoemAnalysisToHtml(analysisResult, selectedCards);
    if (!analysisHtml || analysisHtml.includes("啟示獲取失敗")) {
      console.warn(`--- [API LOG/${endpoint} Warning] 分析 HTML 內容可能無效 ---`);
    }

    // 4. 生成最終圖像提示詞
    console.log(`--- [API LOG/${endpoint}] 開始生成最終圖像提示詞 (Session: ${sessionId}) ---`);
    let imagePrompt = "";
    try {
      let poemCore = cardNames; // 預設
      if (analysisResult?.poem_analysis?.卦象總解) { poemCore = analysisResult.poem_analysis.卦象總解; }
      else if (typeof analysisResult === 'string') { poemCore = analysisResult.substring(0,100); }

      const imagePromptGenPrompt = `Based on the I-Ching divination result for "${cardNames}" summarized as "${poemCore}", create a concise English image prompt for an AI image generator. Capture the essence and symbolism. Style: "Inspired by Alphonse Mucha and traditional East Asian ink wash painting (sumi-e), fantasy realism style. Focused composition, symbolic subject of [核心卦意象徵]. Setting: [相關寧靜場景]. Atmosphere: [卦意氛圍]. Lighting: ethereal soft light, drifting mist, touches of gold. Strictly no text." Respond only with the prompt string.`;

      const imagePromptResult = await callOpenAI(imagePromptGenPrompt, `analyze-img-prompt-${sessionId}`);
      if (typeof imagePromptResult === 'string') { imagePrompt = imagePromptResult.trim(); }
      else if (imagePromptResult?.choices?.[0]?.message?.content) { imagePrompt = imagePromptResult.choices[0].message.content.trim().replace(/^"|"$/g, ''); }
      else { throw new Error("無法獲取圖像提示詞"); }
      console.log(`--- [API LOG/${endpoint}] 生成的圖像提示詞 (長度: ${imagePrompt.length}) ---`);
    } catch (promptError) {
      console.error(`--- [API LOG/${endpoint} Error] 生成圖像提示詞失敗:`, promptError);
      imagePrompt = `Symbolic representation of I-Ching trigrams ${cardNames}, Alphonse Mucha meets sumi-e style, fantasy realism, ethereal mist, soft light, touches of gold, tranquil, spiritual reflection. No text.`;
      console.log(`--- [API LOG/${endpoint}] 使用備用圖像提示詞 ---`);
    }

    // 5. 呼叫 Stability AI 生成最終圖像
    if (imagePrompt) {
      try {
        const stylePreset = process.env.STABILITY_STYLE_PRESET || 'fantasy-art';
        const options = { aspect_ratio: "9:16" }; // 指定比例
        finalImageUrl = await callStabilityAI(imagePrompt, stylePreset, options);
        console.log(`--- [API LOG/${endpoint} Image Success] 已生成最終圖像 (Session: ${sessionId}) ---`);
      } catch (imageError) {
        console.error(`--- [API LOG/${endpoint} Image Error] 生成最終圖像失敗:`, imageError);
        finalImageUrl = null;
      }
    }

    // 6. 回傳結果
    console.log(`--- [API LOG/${endpoint} Success] 完成分析與圖像生成 (Session: ${sessionId}) ---`);
    res.json({
      success: true,
      analysis: analysisHtml,
      finalImageUrl: finalImageUrl,
      sessionId: sessionId, // 返回 session ID 供可能的後續操作 (如儲存)
      canSave: true // 假設總是允許儲存
    });

  } catch (error) {
    // 錯誤處理
    const errorResponse = handleApiError(endpoint, error, { cardNames: selectedCards.map(c=>c.name).join(',') });
    res.status(500).json({
      ...errorResponse,
      analysis: formatPoemAnalysisToHtml({error: `生成籤詩時發生錯誤: ${error.message}`}, selectedCards), // 返回包含錯誤訊息的HTML
      finalImageUrl: null,
      sessionId: null,
      canSave: false
    });
  }
});


module.exports = router;