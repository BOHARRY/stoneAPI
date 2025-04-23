// --- START OF FILE newDivinationController.js ---
const express = require('express');
const router = express.Router();
const {
    v4: uuidv4
} = require('uuid');
const {
    callGeminiAPI,
    sanitizeAndParseJSON
} = require('./aiUtils'); // 確認 aiUtils 在同級或正確引入
const fs = require('fs');
const path = require('path');

// 儲存載入的籤詩資料
let fortunePoems = null;
// 籤詩 JSON 檔案的路徑
const POEM_DATA_PATH = path.join(__dirname, 'real_mazu_fortune_poems.json'); // 使用修正後的路徑

// 在模組載入時，立即讀取籤詩 JSON 檔案
try {
    console.log(`--- [DEBUG] Attempting to read poem data from: ${POEM_DATA_PATH}`);
    const data = fs.readFileSync(POEM_DATA_PATH, 'utf8');
    const parsedData = JSON.parse(data);

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
    console.error(`--- [DEBUG] Failed path was: ${POEM_DATA_PATH}`);
}


// handleApiError 函數 - 保持原樣，用於統一錯誤處理
function handleApiError(endpoint, error, details = {}) {
    const errorId = uuidv4().slice(0, 8);
    const isAiJsonError = error.message && (error.message.includes('Gemini API') || error.message.includes('Gemini 回傳') || error.message.includes('JSON')); // 簡化檢查
    const logDetails = {
        errorId,
        endpoint,
        message: error.message,
        stack: error.stack,
        ...details
    };
    if (isAiJsonError) {
        console.warn(`--- [API LOG/${endpoint} AI/JSON Service Error ${errorId}] ---`, error.message);
    } else {
        console.error(`--- [API LOG/${endpoint} Critical Error ${errorId}] ---`, logDetails);
    }
    let userMessage = `處理請求時發生錯誤。參考碼: ${errorId}`;
    if (isAiJsonError) {
        userMessage = `與 AI 服務溝通時發生問題，請稍後再試。`;
    }
    // **修改：不再需要返回 analysis HTML**
    return {
        success: false,
        error: userMessage,
        errorId,
        errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
}

// --- API Endpoint: /api/divination/analyze (新流程核心) ---
router.post('/analyze', async (req, res) => {
    const {
        selectedCards
    } = req.body;
    const endpoint = 'Divination Analyze (LingShi Gemini)';

    if (!fortunePoems) {
        const errorResponse = handleApiError(endpoint, new Error("後端籤詩資料未載入或載入失敗"), {
            step: 'LoadPoemDataCheck'
        });
        // **修改：返回結構化錯誤 JSON**
        return res.status(500).json({
            ...errorResponse,
            geminiAnalysis: null,
            matchedPoem: null,
            finalImageUrl: null,
            selectedCardNames: selectedCards?.map(c => c?.name || '?').join('、') || '', // 嘗試提供卡牌名
            sessionId: uuidv4(), // 提供一個 session ID
            canSave: false
        });
    }

    // 輸入驗證 (保持不變)
    if (!Array.isArray(selectedCards) || selectedCards.length !== 3) {
        return res.status(400).json({
            success: false,
            error: '請求數據不完整...',
            errorCode: 'INVALID_CARD_DATA'
        });
    }
    const invalidCard = selectedCards.find(card => !card || typeof card.name !== 'string' || !card.name || !card.id);
    if (invalidCard) {
        return res.status(400).json({
            success: false,
            error: '卡牌資訊不完整...',
            errorCode: 'INVALID_CARD_STRUCTURE'
        });
    }

    const cardNames = selectedCards.map(c => c.name).join('、');
    const cardIds = selectedCards.map(c => c.id).join('、');
    const sessionId = uuidv4();

    let geminiAnalysisResult = null;
    let matchedPoemData = null;
    let finalImageUrl = null;

    try {
        console.log(`--- [API LOG/${endpoint}] 開始為卡牌組合 [${cardNames}] 生成籤詩分析 (Session: ${sessionId}) ---`);
        console.log(`--- [API LOG/${endpoint}] 卦象 IDs: [${cardIds}] ---`);

        // **階段 1: 分析卦象 (保持不變)**
        console.log(`--- [API LOG/${endpoint}] 階段 1: 分析三個卦象 (${cardNames}) ---`);
        const analysisPrompt = `你是一位精通易經八卦的**台灣**解讀者。請根據使用者抽到的以下三個卦象，進行整體的卦象分析和解讀，除非卦象顯示險惡需要提醒，請盡量往支持和鼓舞的方向判斷。回應需符合 JSON 格式要求。

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
            console.error(`--- [API LOG/${endpoint}] 階段 1 Gemini 呼叫失敗:`, error.message);
            throw new Error(`AI 卦象分析失敗: ${error.message}`);
        }
        if (!phase1Result || typeof phase1Result !== 'object' || !phase1Result.title || !phase1Result.analysis) {
            console.error(`--- [API LOG/${endpoint}] 階段 1 Gemini 回應格式不符:`, phase1Result);
            throw new Error(`AI 卦象分析回傳格式不符預期`);
        }
        geminiAnalysisResult = {
            ...phase1Result
        }; // 儲存階段 1 結果

        // **階段 2: 匹配籤詩 (保持不變)**
        console.log(`--- [API LOG/${endpoint}] 階段 2: 根據分析匹配籤詩 ---`);
        const briefMeanings = fortunePoems.map((poem, index) => ({
            index: index,
            poemNumber: poem.poemNumber,
            meaning: poem.briefMeaning
        }));
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
            console.error(`--- [API LOG/${endpoint}] 階段 2 Gemini 呼叫失敗:`, error.message);
            throw new Error(`AI 籤詩匹配失敗: ${error.message}`);
        }
        if (!phase2Result || typeof phase2Result !== 'object' || !phase2Result.matchReason || !Array.isArray(phase2Result.matchedFortunes)) { // 檢查 matchedFortunes 是陣列
            console.error(`--- [API LOG/${endpoint}] 階段 2 Gemini 回應格式不符:`, phase2Result);
            throw new Error(`AI 籤詩匹配回傳格式不符預期`);
        }
        // **合併結果**
        geminiAnalysisResult = {
            ...geminiAnalysisResult,
            matchReason: phase2Result.matchReason,
            matchedFortunes: phase2Result.matchedFortunes
        };

        // **查找最佳匹配的籤詩資料 (保持不變)**
        if (geminiAnalysisResult.matchedFortunes.length > 0) {
            const bestMatch = geminiAnalysisResult.matchedFortunes[0];
            if (typeof bestMatch.index === 'number' && bestMatch.index >= 0 && bestMatch.index < fortunePoems.length) {
                matchedPoemData = fortunePoems[bestMatch.index];
                console.log(`--- [API LOG/${endpoint}] 成功匹配到第 ${matchedPoemData.poemNumber} 籤 (本地索引: ${bestMatch.index}) ---`);
            } else if (typeof bestMatch.poemNumber === 'number') { // 備用查找
                matchedPoemData = fortunePoems.find(poem => poem.poemNumber === bestMatch.poemNumber);
                if (matchedPoemData) console.log(`--- [API LOG/${endpoint}] 成功根據籤詩號碼匹配到第 ${matchedPoemData.poemNumber} 籤 ---`);
                else console.error(`--- [API LOG/${endpoint}] 無法根據 AI 提供的籤詩號碼找到本地數據`, bestMatch);
            } else {
                console.error(`--- [API LOG/${endpoint}] AI 提供的最佳匹配資訊無效`, bestMatch);
            }
        } else {
            console.warn(`--- [API LOG/${endpoint}] AI 未能匹配到任何籤詩 ---`);
            // **即使沒匹配到籤詩，也可能需要返回 geminiAnalysisResult 供前端顯示**
            // matchedPoemData 會保持為 null
        }

        // **確定靜態圖片的 URL (使用相對路徑)**
        if (matchedPoemData && matchedPoemData.poemNumber) {
            const poemNumberPadded = matchedPoemData.poemNumber.toString().padStart(2, '0');
            finalImageUrl = `assets/outputs/poem_${poemNumberPadded}.png`; // **返回相對路徑**
            console.log(`--- [API LOG/${endpoint}] 確定最終圖片 URL: ${finalImageUrl} ---`);
        } else {
            finalImageUrl = null;
            console.warn(`--- [API LOG/${endpoint}] 未匹配到籤詩，不提供圖片 URL ---`);
        }

        // **【修改】構建成功的 JSON 回應**
        console.log(`--- [API LOG/${endpoint} Success] 完成分析與匹配 (Session: ${sessionId}) ---`);
        res.json({
            success: true,
            sessionId: sessionId,
            canSave: matchedPoemData !== null, // 只有匹配到籤詩才能保存
            geminiAnalysis: geminiAnalysisResult, // 返回完整的 AI 分析和匹配結果
            matchedPoem: matchedPoemData, // 返回匹配到的完整籤詩數據 (可能為 null)
            finalImageUrl: finalImageUrl, // 圖片 URL (可能為 null)
            selectedCardNames: cardNames // 附帶卡牌名稱方便前端顯示
        });

    } catch (error) {
        // 錯誤處理
        const errorResponse = handleApiError(endpoint, error, {
            cardNames: cardNames,
            cardIds: cardIds,
            session: sessionId
        });
        // **【修改】返回結構化錯誤 JSON**
        res.status(500).json({
            ...errorResponse, // 包含 success: false, error, errorId
            geminiAnalysis: null, // 錯誤時設為 null
            matchedPoem: null, // 錯誤時設為 null
            finalImageUrl: null, // 錯誤時設為 null
            selectedCardNames: cardNames, // 仍然提供卡牌名
            sessionId: sessionId,
            canSave: false
        });
    }
});

// 輔助函數：數字轉中文數字 (用於籤詩號碼顯示)
function numberToChinese(num) {
    const chineseNumbers = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (typeof num !== 'number' || isNaN(num)) return num || ''; // 處理無效輸入
    if (num < 0) return num.toString();
    if (num >= 0 && num <= 10) {
        return chineseNumbers[num];
    } else if (num < 20) {
        return '十' + chineseNumbers[num - 10];
    } else if (num < 100) {
        const tens = Math.floor(num / 10);
        const ones = num % 10;
        if (ones === 0) {
            return chineseNumbers[tens] + '十';
        } else {
            return chineseNumbers[tens] + '十' + chineseNumbers[ones];
        }
    } else {
        return num.toString();
    }
}


module.exports = router;
// --- END OF FILE newDivinationController.js ---