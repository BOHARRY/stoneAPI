// newDivinationController.js (專注於新流程 - 靈石問籤)
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
// 引入我們修改後的 aiUtils，現在包含 callGeminiAPI
const { callGeminiAPI, sanitizeAndParseJSON } = require('./aiUtils'); 
// Node.js 內建模組用於讀取檔案和處理路徑
const fs = require('fs');
const path = require('path');

// 儲存載入的籤詩資料
let fortunePoems = null;
// 籤詩 JSON 檔案的路徑
const POEM_DATA_PATH = path.join(__dirname, 'real_mazu_fortune_poems.json');

// 在模組載入時，立即讀取籤詩 JSON 檔案
// 使用同步讀取，確保啟動後資料立即可用
try {
    const data = fs.readFileSync(POEM_DATA_PATH, 'utf8');
    const parsedData = JSON.parse(data);

     // 驗證載入的資料格式是否符合預期（至少檢查前幾個和關鍵字段）
    if (Array.isArray(parsedData) && parsedData.length > 0 &&
        parsedData[0].poemNumber && parsedData[0].briefMeaning &&
        parsedData[0].poemText1 && parsedData[0].poemText2 && parsedData[0].poemText3 && parsedData[0].poemText4) {
        fortunePoems = parsedData;
        console.log(`--- [API LOG] 成功載入 ${fortunePoems.length} 支媽祖靈籤資料 ---`);
    } else {
        throw new Error('籤詩 JSON 格式不符或內容不完整');
    }
} catch (error) {
    console.error(`--- [API LOG] 載入媽祖靈籤資料失敗: ${error.message} ---`);
    // 嚴重錯誤，應用程式可能無法正常工作，可以選擇終止進程或標記狀態
    // process.exit(1); // 在生產環境可能考慮更柔和的方式
}


// formatPoemAnalysisToHtml 函數 - 重新定義，用於根據後端數據生成前端 HTML
// 它將接收 Gemini 的分析結果和從 JSON 找到的完整籤詩數據
function formatPoemAnalysisToHtml(geminiAnalysisResult, matchedPoemData, selectedCards) {
    const cardNames = selectedCards.map(c => c?.name || '?').join('、');

    // 處理無法獲取結果或錯誤的情況
    if (!geminiAnalysisResult || !matchedPoemData) {
         const errorText = geminiAnalysisResult?.error || "未能成功獲取籤詩分析或匹配結果。";
         return `
            <div class="analysis-content poem-analysis error">
                <h3>啟示獲取失敗</h3>
                <p>您抽得的卦象為：${cardNames}</p>
                <p>${errorText}</p>
                <p>請稍候片刻，再次嘗試。</p>
            </div>
         `;
    }

    // 確保所有必要的文字數據都存在
    const title = geminiAnalysisResult.title || '卦象分析';
    const analysis = geminiAnalysisResult.analysis || '未提供詳細分析。';
    const matchReason = geminiAnalysisResult.matchReason || '未提供匹配理由。';
     // 從匹配到的籤詩數據中提取信息
    const poemNumber = matchedPoemData.poemNumber;
    const poemLevel = matchedPoemData.poemLevel || '未知';
    const poemSymbols = matchedPoemData.poemSymbols || '';
    const poemLines = [
        matchedPoemData.poemText1,
        matchedPoemData.poemText2,
        matchedPoemData.poemText3,
        matchedPoemData.poemText4
    ].filter(line => line && line.trim()); // 過濾掉空行或只有空白的行

    const briefMeaning = matchedPoemData.briefMeaning || '無';
    const fullMeaning = matchedPoemData.fullMeaning || null; // 詳解可能不存在
    const drawImagePrompt = matchedPoemData.drawImage || null; // 圖像描繪提示詞可能不存在

    // 根據籤詩等級設定樣式 class (與 test.html 前端邏輯保持一致)
    let levelClass = 'middle'; // 默認值
    if (poemLevel.includes('上上')) levelClass = 'upper-upper';
    else if (poemLevel.includes('上')) levelClass = 'upper';
    else if (poemLevel.includes('中平') || poemLevel.includes('中吉') || poemLevel.includes('平')) levelClass = 'middle-fair';
    else if (poemLevel.includes('中')) levelClass = 'middle';
    else if (poemLevel.includes('下')) levelClass = 'lower';


    // 構建前端所需的 HTML 結構
    let html = `
        <div class="poem-display">
            <div class="poem-header">
                 <!-- 這裡顯示籤詩號碼和等級 -->
                <div class="poem-number">第${numberToChinese(parseInt(poemNumber, 10))}籤 ${poemSymbols ? `（${poemSymbols}）` : ''}</div>
                <div class="poem-level ${levelClass}">${poemLevel}</div>
            </div>
             <!-- 注意：圖片容器 <div id="finalPoemImageContainer"> 會由前端的 UIControllerNew 負責添加，
                 後端只需提供圖片 URL，前端收到後會更新 <img id="finalPoemImage"> 的 src -->

            <div class="poem-body">
                <!-- 顯示籤詩文本 -->
                <div class="poem-content">
                    ${poemLines.map(line => `<p>${line}</p>`).join('')}
                </div>
                <!-- 顯示籤詩簡意 -->
                <div class="poem-meaning"><strong>籤意：</strong> ${briefMeaning}</div>
                 ${drawImagePrompt ? `<div class="poem-draw-image"><strong>圖像描繪：</strong> ${drawImagePrompt}</div>` : ''}
                 ${fullMeaning ? `<div class="poem-meaning" style="border-top:1px dashed #ccc; margin-top:10px; padding-top:10px;"><strong>詳解：</strong> ${fullMeaning}</div>` : ''}
                
                 <!-- 顯示卦象分析和匹配理由 (來自 Gemini) -->
                <div class="analysis-section" style="border-top:1px dashed #ccc; margin-top:10px; padding-top:10px;">
                    <h4>卦象分析 (${cardNames})</h4>
                    <p><strong>${title}</strong></p>
                    <p>${analysis.replace(/\n/g, '<br>')}</p>
                </div>
                <div class="analysis-section">
                    <h4>籤詩匹配理由</h4>
                    <p>${matchReason}</p>
                    <!-- 可選：在這裡列出所有推薦籤詩及其匹配理由，類似 test.html -->
                </div>
            </div>
        </div>
    `;

    return html;

}


// handleApiError 函數 - 保持原樣，用於統一錯誤處理
function handleApiError(endpoint, error, details = {}) {
    const errorId = uuidv4().slice(0, 8);
    // 檢查是否是 AI 或 JSON 相關的錯誤
    const isAiJsonError = error.message && (
        error.message.includes('OpenAI API') || 
        error.message.includes('GPT 回傳') || 
        error.message.includes('Gemini API') || // 新增 Gemini 相關檢查
        error.message.includes('Gemini 回傳') || // 新增 Gemini 相關檢查
        error.message.includes('JSON') || 
        error.message.includes('圖片生成')
    );
    const logDetails = { errorId, endpoint, message: error.message, stack: error.stack, ...details };
     // 對於 AI 或 JSON 錯誤，使用 warn 級別記錄，可能不那麼嚴重
    if (isAiJsonError) { console.warn(`--- [API LOG/${endpoint} AI/JSON Service Error ${errorId}] ---`, error.message); }
    else { console.error(`--- [API LOG/${endpoint} Critical Error ${errorId}] ---`, logDetails); } // 其他錯誤使用 error 級別
    
    // 構建給使用者的錯誤訊息
    let userMessage = `處理請求時發生錯誤。參考碼: ${errorId}`;
     if (isAiJsonError) { userMessage = `與 AI 服務溝通時發生問題，請稍後再試。`; } // 對使用者隱藏具體 AI 錯誤細節

    return { success: false, error: userMessage, errorId, errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined };
}

// --- API Endpoint: /api/divination/analyze (新流程核心) ---
router.post('/analyze', async (req, res) => {
  const { selectedCards } = req.body;
  const endpoint = 'Divination Analyze (LingShi Gemini)';

  // 檢查籤詩資料是否已成功載入
  if (!fortunePoems) {
       const errorResponse = handleApiError(endpoint, new Error("後端籤詩資料未載入或載入失敗"), { step: 'LoadPoemDataCheck' });
       // 雖然是內部錯誤，但回傳符合前端預期的分析 HTML 格式，方便前端顯示錯誤
       errorResponse.analysis = formatPoemAnalysisToHtml({ error: errorResponse.error }, null, selectedCards);
       return res.status(500).json(errorResponse);
  }

  // 輸入驗證
  if (!Array.isArray(selectedCards) || selectedCards.length !== 3) {
    return res.status(400).json({ success: false, error: '請求數據不完整，需要包含 3 張選定的卡牌資訊 (selectedCards)', errorCode: 'INVALID_CARD_DATA' });
  }
  const invalidCard = selectedCards.find(card => !card || typeof card.name !== 'string' || !card.name || !card.id); // 檢查是否包含 id 和 name
  if (invalidCard) {
    return res.status(400).json({ success: false, error: '卡牌資訊不完整 (需要包含 id 和 name)', errorCode: 'INVALID_CARD_STRUCTURE' });
  }

  const cardNames = selectedCards.map(c => c.name).join('、');
  const cardIds = selectedCards.map(c => c.id).join('、'); // 記錄 id 供日誌使用
  const sessionId = uuidv4();

  let geminiAnalysisResult = null; // 儲存 Gemini 兩階段的分析結果
  let matchedPoemData = null; // 儲存從 JSON 找到的匹配籤詩數據
  let finalImageUrl = null; // 儲存最終圖片 URL

  try {
    console.log(`--- [API LOG/${endpoint}] 開始為卡牌組合 [${cardNames}] 生成籤詩分析 (Session: ${sessionId}) ---`);
    console.log(`--- [API LOG/${endpoint}] 卦象 IDs: [${cardIds}] ---`);

    // ===========================================
    // == 階段 1: 分析三個卦象的整體含義 (呼叫 Gemini)
    // ===========================================
     console.log(`--- [API LOG/${endpoint}] 階段 1: 分析三個卦象 (${cardNames}) ---`);
    const analysisPrompt = `你是一位精通易經八卦的**台灣**解讀者。請根據使用者抽到的以下三個卦象，進行整體的卦象分析和解讀，除非卦象顯示險惡，否則請盡量往希望和支持的方向判斷。回應需符合 JSON 格式要求。

卦象一: ${selectedCards[0].name} (${selectedCards[0].id})
卦象二: ${selectedCards[1].name} (${selectedCards[1].id})
卦象三: ${selectedCards[2].name} (${selectedCards[2].id})

回應要求：
*   請**務必**僅僅返回一個格式完全正確的 JSON 物件。
*   **絕對不要**在 JSON 物件之前或之後添加任何文字、解釋、註釋或 Markdown 標記。
*   JSON 物件需包含以下兩個鍵： "title" (字串，對這三個卦象組合的簡短描述或標題) 和 "analysis" (字串，對這三個卦象組合的詳細分析和解讀，使用台灣正體中文)。
*   分析內容需考慮三個卦象之間的關聯和變化。

示例：
{
  "title": "乾艮離卦象組合的啟示",
  "analysis": "此組合代表了從天行健（乾）到山止於行（艮），再到文明之光（離）的過程。暗示著事物發展中可能面臨挑戰需要暫停或轉變方向，但最終能通過智慧和光明（離）找到解決之道，重獲進展。整體而言，提醒你在追求目標時要保持剛健的同時，也要懂得適時的堅守和變通..."
}`;

    let phase1Result = null;
    try {
         phase1Result = await callGeminiAPI(analysisPrompt, `lingShi-phase1-analysis-${sessionId}`);
    } catch (error) {
         // 如果第一階段失敗，記錄錯誤並拋出，由外層 catch 統一處理
         console.error(`--- [API LOG/${endpoint}] 階段 1 Gemini 呼叫失敗:`, error.message);
         throw new Error(`AI 卦象分析失敗: ${error.message}`);
    }

    // 驗證並儲存第一階段結果
     if (!phase1Result || typeof phase1Result !== 'object' || !phase1Result.title || !phase1Result.analysis) {
        console.error(`--- [API LOG/${endpoint}] 階段 1 Gemini 回應格式不符:`, phase1Result);
         throw new Error(`AI 卦象分析回傳格式不符預期`);
     }
    geminiAnalysisResult = { ...phase1Result }; // 複製第一階段結果

    // ===========================================
    // == 階段 2: 根據分析結果匹配籤詩 (呼叫 Gemini)
    // ===========================================
     console.log(`--- [API LOG/${endpoint}] 階段 2: 根據分析匹配籤詩 ---`);

    // 提取籤詩的簡意列表供 AI 參考
    const briefMeanings = fortunePoems.map((poem, index) => ({
        index: index, // 籤詩在陣列中的索引
        poemNumber: poem.poemNumber, // 籤詩號碼
        meaning: poem.briefMeaning // 籤詩簡要含義
    }));

    // 構建第二階段的 Prompt
    const matchingPrompt = `你是一位精通易經八卦和媽祖靈籤的**台灣**解籤師。請根據以下對三個卦象的分析結果，從提供的媽祖靈籤簡意列表中，找出與之最匹配的 1 到 3 支籤詩。

卦象分析標題: ${geminiAnalysisResult.title}
卦象分析內容: ${geminiAnalysisResult.analysis}

媽祖靈籤簡意列表 (格式：索引. 第N籤：簡意)：
${briefMeanings.map(item => `${item.index}. 第${item.poemNumber}籤：${item.meaning}`).join('\n')}

回應要求：
*   請**務必**僅僅返回一個格式完全正確的 JSON 物件。
*   **絕對不要**在 JSON 物件之前或之後添加任何文字、解釋、註釋或 Markdown 標記。
*   JSON 物件需包含以下兩個鍵： "matchReason" (字串，整體匹配理由，使用台灣正體中文) 和 "matchedFortunes" (陣列，匹配的籤詩)。
*   "matchedFortunes" 陣列中的每個物件應包含： "index" (數字，對應媽祖靈籤簡意列表中的索引), "poemNumber" (數字，籤詩編號), "reasonForMatch" (字串，匹配理由，使用台灣正體中文), "matchScore" (1-10 整數，越高代表越匹配)。
*   確保 "matchedFortunes" 中的籤詩按匹配度從高到低排序。
*   如果未能匹配到任何籤詩，"matchedFortunes" 陣列應為空。

示例：
{
  "matchReason": "根據卦象分析中...",
  "matchedFortunes": [
    { "index": 5, "poemNumber": 6, "reasonForMatch": "此籤描述的轉機...", "matchScore": 9 },
    { "index": 23, "poemNumber": 24, "reasonForMatch": "...", "matchScore": 7 }
  ]
}`;

    let phase2Result = null;
    try {
         phase2Result = await callGeminiAPI(matchingPrompt, `lingShi-phase2-matching-${sessionId}`);
    } catch (error) {
         // 如果第二階段失敗，記錄錯誤並拋出
         console.error(`--- [API LOG/${endpoint}] 階段 2 Gemini 呼叫失敗:`, error.message);
         throw new Error(`AI 籤詩匹配失敗: ${error.message}`);
    }

    // 驗證並處理第二階段結果
    if (!phase2Result || typeof phase2Result !== 'object' || !phase2Result.matchReason) {
        console.error(`--- [API LOG/${endpoint}] 階段 2 Gemini 回應格式不符:`, phase2Result);
        throw new Error(`AI 籤詩匹配回傳格式不符預期`);
    }
    // 將第二階段結果合併到 geminiAnalysisResult 中
    geminiAnalysisResult = { ...geminiAnalysisResult, ...phase2Result };

    // 查找最佳匹配的籤詩資料
    if (geminiAnalysisResult.matchedFortunes && Array.isArray(geminiAnalysisResult.matchedFortunes) && geminiAnalysisResult.matchedFortunes.length > 0) {
        const bestMatch = geminiAnalysisResult.matchedFortunes[0]; // 預設取匹配度最高的第一個
        // 根據 AI 回傳的索引查找本地籤詩資料
        if (typeof bestMatch.index === 'number' && bestMatch.index >= 0 && bestMatch.index < fortunePoems.length) {
            matchedPoemData = fortunePoems[bestMatch.index];
             console.log(`--- [API LOG/${endpoint}] 成功匹配到第 ${matchedPoemData.poemNumber} 籤 (本地索引: ${bestMatch.index}) ---`);
        } else if (typeof bestMatch.poemNumber === 'number' && bestMatch.poemNumber > 0 && bestMatch.poemNumber <= 60) {
             // 如果索引無效，嘗試根據籤詩號碼查找 (效率較低，作為備用)
            matchedPoemData = fortunePoems.find(poem => poem.poemNumber === bestMatch.poemNumber);
             if(matchedPoemData) {
                console.log(`--- [API LOG/${endpoint}] 成功根據籤詩號碼匹配到第 ${matchedPoemData.poemNumber} 籤 ---`);
             } else {
                 console.error(`--- [API LOG/${endpoint}] 無法根據 AI 提供的無效索引或號碼找到本地籤詩數據`, bestMatch);
             }
        } else {
             console.error(`--- [API LOG/${endpoint}] AI 提供的最佳匹配資訊無效`, bestMatch);
        }
    } else {
         console.warn(`--- [API LOG/${endpoint}] AI 未能匹配到任何籤詩 ---`);
    }

    // ===========================================
    // == 準備最終回應數據
    // ===========================================

    // 構造前端所需的分析和籤詩 HTML
     // 即使沒有匹配到籤詩，也需要回傳包含卦象分析和匹配理由的 HTML
    const analysisHtml = formatPoemAnalysisToHtml(geminiAnalysisResult, matchedPoemData, selectedCards);

    // 確定靜態圖片的 URL
    if (matchedPoemData && matchedPoemData.poemNumber) {
        const poemNumberPadded = matchedPoemData.poemNumber.toString().padStart(2, '0');
        // 這裡構建的是前端可以直接訪問的相對路徑 URL
        finalImageUrl = `assets/outputs/poem_${poemNumberPadded}.png`;
        console.log(`--- [API LOG/${endpoint}] 確定最終圖片 URL: ${finalImageUrl} ---`);
    } else {
        // 如果沒有匹配到籤詩，圖片 URL 為空
        finalImageUrl = null;
         console.warn(`--- [API LOG/${endpoint}] 未匹配到籤詩，不提供圖片 URL ---`);
    }

    // 構建成功回應
    console.log(`--- [API LOG/${endpoint} Success] 完成分析與匹配 (Session: ${sessionId}) ---`);
    res.json({
      success: true,
      analysis: analysisHtml, // 包含所有文字資訊的 HTML 片段
      finalImageUrl: finalImageUrl, // 靜態圖片的 URL
      sessionId: sessionId,
      canSave: matchedPoemData !== null // 只有成功匹配到籤詩時才允許儲存
    });

  } catch (error) {
    // 錯誤處理
    const errorResponse = handleApiError(endpoint, error, { cardNames: cardNames, cardIds: cardIds, session: sessionId });
     // 錯誤發生時，也調用 formatPoemAnalysisToHtml 來生成包含錯誤訊息的 HTML，回傳給前端
     errorResponse.analysis = formatPoemAnalysisToHtml({ error: errorResponse.error }, null, selectedCards);
    res.status(500).json({
      ...errorResponse,
      finalImageUrl: null, // 錯誤時沒有圖片
      sessionId: sessionId, // 保留 session ID
      canSave: false // 錯誤時不能儲存
    });
  }
});

// 輔助函數：數字轉中文數字 (用於籤詩號碼顯示)
function numberToChinese(num) {
  const chineseNumbers = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (typeof num !== 'number' || isNaN(num)) return num || ''; // 處理無效輸入
  if (num < 0) return num.toString();
  if (num >= 0 && num <= 10) { return chineseNumbers[num]; }
  else if (num < 20) { return '十' + chineseNumbers[num - 10]; }
  else if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    if (ones === 0) { return chineseNumbers[tens] + '十'; }
    else { return chineseNumbers[tens] + '十' + chineseNumbers[ones]; }
  } else { return num.toString(); }
}


module.exports = router;