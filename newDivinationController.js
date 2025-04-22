// newDivinationController.js (專注於新流程 - 靈石問籤)
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { callOpenAI, sanitizeAndParseJSON, callStabilityAI } = require('./aiUtils');

// formatPoemAnalysisToHtml 函數 (簡化後不包含interpretation部分)
function formatPoemAnalysisToHtml(analysisObj, selectedCards) {
  try {
    if (!analysisObj || typeof analysisObj !== 'object') {
      throw new Error('無效的分析物件');
    }
    const content = analysisObj.analysis_content || analysisObj.poem_analysis || analysisObj;
    const cardNames = selectedCards.map(c => c?.name || '?').join('、');
    let html = `<div class="analysis-content poem-analysis">`;
    html += '</div>';
    return html;
  } catch (error) {
    console.error('--- [API LOG/Format Poem Analysis Error] ---', error);
    const cardNamesText = selectedCards.map(c => c?.name || '?').join('、');
    return `<div class="analysis-content poem-analysis error"><h3>啟示獲取失敗</h3><p>您抽得的卦象為：${cardNamesText}</p><p>抱歉，在為您解讀天機時遇到了阻礙。請稍候片刻，再次嘗試。錯誤參考：${error.message}</p></div>`;
  }
}

// handleApiError 函數
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
  const sessionId = uuidv4();

  try {
    console.log(`--- [API LOG/${endpoint}] 開始為卡牌組合 [${cardNames}] 生成籤詩分析 (Session: ${sessionId}) ---`);

    // 1. 建構籤詩分析提示詞 - 修改為媽祖靈籤格式，移除interpretation
    const analysisPrompt = `你是一位精通易經八卦的解籤師，請根據使用者抽到的以下三張卦象，為他們提供媽祖靈籤分析。

**抽到的卦象組合**：${cardNames}

**任務**：
1. 請將前兩個卦象組合成一個「重卦」（六爻），然後與第三個卦象綜合判斷
2. 確定這個組合最符合媽祖靈籤60支中的哪一支（若有多支相近，請選擇較吉利的那一支）
3. 生成完整的靈籤分析，包含以下內容，並以JSON格式回應：

{
  "poemNumber": "籤詩編號（1-60之間的整數）",
  "poemLevel": "籤詩等級（上籤/中籤/下籤）",
  "poemSymbols": "卦象標記（如：丁庚）",
  "poemText": "完整四句籤詩，每句一行，格式為詩句文本"
}

**要求**：
- 使用台灣正體中文
- 籤詩格式必須遵循傳統格式：第X籤：上/中/下籤（卦象標記）
- 生成的籤詩必須是四句，每句七言或五言
- 解析需緊扣卦象組合`;

    // 2. 呼叫 OpenAI 獲取分析結果
    try {
      analysisResult = await callOpenAI(analysisPrompt, `analyze-poem-${sessionId}`);
    } catch (error) {
      console.warn(`--- [API LOG/${endpoint} AI Parse Warning] ---`, error.message);
      const contentMatch = error.message.match(/原始內容片段\: (.*?)\.\.\.$/);
      if (contentMatch && contentMatch[1]) {
        try { analysisResult = sanitizeAndParseJSON(contentMatch[1], `analyze-poem-recovery-${sessionId}`); console.log(`--- [API LOG/${endpoint}] 手動恢復JSON成功 ---`); }
        catch (innerError) { throw error; }
      } else { throw error; }
    }

    // 提取並確保所有必要欄位存在
    if (!analysisResult.poemNumber || !analysisResult.poemLevel || !analysisResult.poemText) {
      console.warn(`--- [API LOG/${endpoint} Warning] 分析結果缺少必要欄位 ---`, analysisResult);
      // 嘗試使用fallback值修復
      analysisResult.poemNumber = analysisResult.poemNumber || "42";
      analysisResult.poemLevel = analysisResult.poemLevel || "中籤";
      analysisResult.poemSymbols = analysisResult.poemSymbols || "天地";
      if (!analysisResult.poemText) {
        analysisResult.poemText = "富貴由天莫強求，須知機會在沙洲，\n若然得意誇前事，造化還他舊日愁。";
      }
    }

    // 3. 構建籤詩HTML
    const poemLines = analysisResult.poemText.split('\n').filter(line => line.trim());
    let customHtml = `
    <div class="poem-background">
      <div class="poem-header">
        <h3>第${numberToChinese(parseInt(analysisResult.poemNumber))}籤 ${analysisResult.poemLevel}（${analysisResult.poemSymbols || ''}）</h3>
      </div>
      <div class="poem-body">
        <!-- 圖片容器預留位置 - 前端會自動填充 -->
        <div id="finalPoemImageContainer" class="poem-image-container">
          <img id="finalPoemImage" class="poem-image" alt="籤詩意象圖" />
        </div>
        <div id="poemAnalysisText" class="poem-text">
          <div class="analysis-content poem-analysis">
            <div class="poem-content">
              ${poemLines.map(line => `<p>${line}</p>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

    analysisHtml = customHtml;

    // 4. 生成最終圖像提示詞
    console.log(`--- [API LOG/${endpoint}] 開始生成第${analysisResult.poemNumber}籤圖像 (${analysisResult.poemLevel}) ---`);
    let imagePrompt = "";
    try {
      // 使用籤詩內容生成圖像提示詞
      const poemNumber = analysisResult.poemNumber;
      const poemText = analysisResult.poemText;
      const poemLevel = analysisResult.poemLevel;
      
      const imagePromptGenPrompt = `
Based on this Chinese Mazu Temple Fortune Poem (Number ${poemNumber}, Fortune Level: ${poemLevel}):
"${poemText}"

Generate a detailed English image prompt that captures the essence and symbolism of this poem, suitable for use with AI image generation models.
The prompt should incorporate:
- Traditional Chinese temple aesthetics
- A mystical and sacred atmosphere
- Visual metaphors and symbolic imagery inspired by the poem’s meaning

The visual style must follow this description:
"In the style of a traditional Chinese woodblock print. Fine linework, minimal shading, and a muted sepia-toned or ink wash color palette. Inspired by Ming dynasty illustrations, Taoist religious iconography, and East Asian sacred art. Soft textures, flowing garments, radiant halos, and symbolic cloud and mountain motifs. Peaceful, mystical, ancient atmosphere. No modern elements or vivid colors."
`;


      const imagePromptResult = await callOpenAI(imagePromptGenPrompt, `analyze-img-prompt-${sessionId}`);
      
      // 提取提示詞
      if (typeof imagePromptResult === 'string') { 
        imagePrompt = imagePromptResult.trim(); 
      } else if (imagePromptResult.prompt) {
        imagePrompt = imagePromptResult.prompt.trim();
      } else if (imagePromptResult.content) {
        imagePrompt = imagePromptResult.content.trim();
      } else {
        // 嘗試獲取任何可能的字符串屬性
        for (const key in imagePromptResult) {
          if (typeof imagePromptResult[key] === 'string' && imagePromptResult[key].length > 20) {
            imagePrompt = imagePromptResult[key].trim();
            break;
          }
        }
      }
      
      if (!imagePrompt) {
        throw new Error("無法從回應中提取圖像提示詞");
      }
      
      console.log(`--- [API LOG/${endpoint}] 生成的圖像提示詞 (長度: ${imagePrompt.length}) ---`);
    } catch (promptError) {
      console.error(`--- [API LOG/${endpoint} Error] 生成圖像提示詞失敗:`, promptError);
      // 使用備用提示詞
      imagePrompt = `Chinese fortune poetry number ${analysisResult.poemNumber}, ${analysisResult.poemLevel} fortune. Symbolic representation of I-Ching trigrams ${cardNames}, Alphonse Mucha meets sumi-e style, fantasy realism, ethereal mist, soft light, touches of gold, tranquil, spiritual reflection. NO text.`;
      console.log(`--- [API LOG/${endpoint}] 使用備用圖像提示詞 ---`);
    }

    // 5. 呼叫 Stability AI 生成最終圖像
    if (imagePrompt) {
      try {
        const stylePreset = process.env.STABILITY_STYLE_PRESET || 'line-art';
        const options = { 
          aspect_ratio: "1:1",
          samples: 1,
          cfg_scale: 8
        };
        finalImageUrl = await callStabilityAI(imagePrompt, stylePreset, options);
        console.log(`--- [API LOG/${endpoint} Image Success] 已生成第${analysisResult.poemNumber}籤圖像 ---`);
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
      sessionId: sessionId,
      canSave: true
    });

  } catch (error) {
    // 錯誤處理
    const errorResponse = handleApiError(endpoint, error, { cardNames: selectedCards.map(c=>c.name).join(',') });
    res.status(500).json({
      ...errorResponse,
      analysis: formatPoemAnalysisToHtml({error: `生成籤詩時發生錯誤: ${error.message}`}, selectedCards),
      finalImageUrl: null,
      sessionId: null,
      canSave: false
    });
  }
});

// 輔助函數：數字轉中文數字
function numberToChinese(num) {
  const chineseNumbers = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (num <= 10) return chineseNumbers[num];
  if (num < 20) return '十' + (num > 10 ? chineseNumbers[num - 10] : '');
  const tens = Math.floor(num / 10);
  const ones = num % 10;
  return chineseNumbers[tens] + '十' + (ones > 0 ? chineseNumbers[ones] : '');
}

module.exports = router;