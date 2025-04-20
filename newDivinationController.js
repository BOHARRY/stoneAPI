// newDivinationController.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { callOpenAI } = require('./aiUtils'); // 引入 OpenAI 輔助函數

// 注意：這裡不再需要 sessions Map，因為狀態主要由前端傳遞

// --- API Endpoint: /api/divination/start ---
router.post('/start', async (req, res) => {
  const { userInput } = req.body;

  if (!userInput || typeof userInput !== 'string') {
    return res.status(400).json({ success: false, error: '缺少有效的初始心聲 (userInput)' });
  }

  try {
    // 1. 生成第一幕內容的 Prompt
    const initialContentPrompt = `你是一位充滿智慧與慈悲的東方靈性導師，如同媽祖般溫柔。使用者此刻的心聲是：「${userInput}」

請為此心聲完成以下任務，並嚴格以 JSON 格式回應，不包含任何額外文字：
1.  **storySegment**: 寫一段全新的「寓言故事開頭」，約 50-70 字，正體中文，風格需帶有東方哲思、寧靜且富含象徵意涵。
2.  **guidingQuestion**: 根據這段故事開頭的意境，設計一個引導性的、簡單具體的問題（正體中文，約 5-20 字）。
3.  **imagePrompt**: 根據故事開頭的意境，創造一段精確的英文 Image Prompt，描述畫面主體、氛圍、光線、色彩，並融入以下風格："Inspired by Alphonse Mucha and traditional East Asian ink wash painting (sumi-e), fantasy realism style. Focused composition, symbolic subject, tranquil setting (misty mountains, serene garden, moonlit water), ethereal soft lighting, drifting mist, flowing lines, delicate textures. Mood: Sacred stillness, poetic melancholy, quiet transcendence, spiritual reflection, timeless beauty. Gentle harmonious color palette, touches of gold/luminescence. Strictly no text."

JSON 結構如下：
{
  "storySegment": "寓言故事開頭",
  "guidingQuestion": "引導性提問",
  "imagePrompt": "圖像提示詞 (英文)"
}`;

    // 2. 呼叫 OpenAI 獲取初始內容
    const initialContentResult = await callOpenAI(initialContentPrompt, 'start - content');

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

    // 5. 生成 interactionId
    const interactionId = uuidv4();

    // 6. 組合並回傳結果
    res.json({
      success: true,
      interactionId: interactionId,
      storySegment: initialContentResult.storySegment,
      guidingQuestion: initialContentResult.guidingQuestion,
      imagePrompt: initialContentResult.imagePrompt,
      options: optionsResult.options || [] // 確保是陣列
    });

  } catch (error) {
    console.error('--- [API LOG/Divination Start Error] ---', error);
    res.status(500).json({
      success: false,
      error: `處理初始請求失敗：${error.message || '內部伺服器錯誤'}`
    });
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

  // 基本驗證
  if (!interactionId || round === undefined || !userResponse || !previousStorySegment || !previousGuidingQuestion) {
    return res.status(400).json({ success: false, error: '缺少必要的請求參數' });
  }
  if (typeof round !== 'number' || round < 1 || round > 2) { // 只應處理 round 1 和 2 的回應
      return res.status(400).json({ success: false, error: '無效的輪次 (round)' });
  }

  try {
    // 1. 建構主要內容 Prompt (包含上下文、回應、卡牌提示)
    //const cardHint = drawnCard.name ? `抽到的卦象【${drawnCard.name}】暗示著某種趨勢或能量，請在續寫故事或提問時隱晦地融入其意涵，但不要直接提及卦象名稱。` : "";

    const mainContentPrompt = `你是一位充滿智慧與慈悲的東方靈性導師，擅長編織**連續性**的心靈寓言。
**這是正在進行的寓言的上一段落**：「${previousStorySegment}」
**上一個引導問題是**：「${previousGuidingQuestion}」
使用者對此的回應是：「${userResponse}」
${cardHint}

請根據使用者的回應，**巧妙地延續**這個寓言故事，並完成以下任務，嚴格以 JSON 格式回應：

1.  **aiReply**: (可選) 針對使用者的回應，寫一句不超過 30 字、充滿哲思與慈悲的回應短語（正體中文）。如果沒有特別合適的可以省略此欄位。
2.  **storySegment**: **承接**上一段落的情境與意象，並將使用者回應中流露的情感或思考融入其中，編寫故事的**下一個段落** (約 50-70 字，正體中文)。風格需保持東方哲思、寧靜、象徵性，並確保與前文有**明顯的連貫性**。
3.  **guidingQuestion**: 根據這個**故事續篇**的意境，設計一個**新的**引導性的、簡單具體的問題（正體中文，約 5-20 字），問題需與前一個不同。
4.  **imagePrompt**: 根據這個**故事續篇**的意境與畫面，創造一段精確的英文 Image Prompt。需清晰描述**續篇中**的畫面主體、氛圍、光線、色彩（考慮與前一畫面的關聯性），融合續篇的象徵意義。風格同前："Inspired by Alphonse Mucha and traditional East Asian ink wash painting (sumi-e), fantasy realism style... Strictly no text."

JSON 結構如下：
{
  "aiReply": "回應短語 (如果有的話)",
  "storySegment": "故事續篇",
  "guidingQuestion": "新的引導性提問",
  "imagePrompt": "新的圖像提示詞 (英文)"
}`;

    // 2. 呼叫 OpenAI 獲取主要內容
    const mainContentResult = await callOpenAI(mainContentPrompt, `continue R${round+1} - content`);

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

    // 5. 組合並回傳結果
    res.json({
      success: true,
      interactionId: interactionId, // 保持 ID
      aiReply: mainContentResult.aiReply || null, // 如果沒有則為 null
      storySegment: mainContentResult.storySegment,
      guidingQuestion: mainContentResult.guidingQuestion,
      imagePrompt: mainContentResult.imagePrompt,
      options: optionsResult.options || [] // 確保是陣列
    });

  } catch (error) {
    console.error(`--- [API LOG/Divination Continue Error] Round: ${round}`, error);
    res.status(500).json({
      success: false,
      error: `處理第 ${round + 1} 輪請求失敗：${error.message || '內部伺服器錯誤'}`
    });
  }
});

// --- API Endpoint: /api/divination/analyze ---
router.post('/analyze', async (req, res) => {
  const { interactionId, initialUserInput, interactions } = req.body;

  if (!interactionId || !initialUserInput || !Array.isArray(interactions) || interactions.length !== 3) {
    return res.status(400).json({ success: false, error: '缺少完整或有效的分析數據' });
  }

  try {
    // 1. 建構最終分析 Prompt
    let history = "";
    interactions.forEach((interaction, index) => {
      history += `\n--- 第 ${index + 1} 輪 ---\n`;
      history += `故事片段：${interaction.storySegment}\n`;
      history += `引導問題：${interaction.guidingQuestion}\n`;
      history += `使用者回應：${interaction.userResponse}\n`;
      history += `抽到卦象：【${interaction.drawnCard?.name || '未知'}】\n`;
      // history += `(圖像意境提示: ${interaction.imagePrompt})\n`; // 可以選擇是否包含圖像提示
    });

     const analysisPrompt = `你是一位資深的解卦師與心靈導師，請整合以下完整的互動歷程，為使用者提供一份深刻且個人化的分析報告。

**初始心聲**：「${initialUserInput}」
**互動歷程與卦象**：${history}
**任務**：
請撰寫一份綜合分析報告，需包含：
1.  **回顧與串聯**：簡要回顧故事的發展脈絡，以及使用者在每一輪的回應所體現的心境變化。
2.  **卦象解析**：結合三輪抽到的卦象（${interactions.map(i => i.drawnCard?.name || '?').join('、')}），解釋它們在此情境下可能共同揭示的整體趨勢、挑戰或機遇。
3.  **核心洞見**：提煉出整個互動過程中最關鍵的洞見或啟示，直接回應使用者的初始心聲。
4.  **祝福語**：以溫暖、鼓勵的語氣作結。

**要求**：
- 使用台灣正體中文。
- 語氣需專業、慈悲、富有同理心。
- 分析需緊密結合使用者回應、故事發展和卦象意涵，避免空泛。
- 請回覆JSON結構
**JSON結構範例**：
{
  "analysis_html": "玄機解析..."
}`;

    // 2. 呼叫 OpenAI 獲取分析結果 (注意：分析可能需要更長的 token 或時間)
    //    可能需要考慮使用 max_tokens 參數，並處理可能的超時或內容截斷
    const analysisResult = await callOpenAI(analysisPrompt, 'analyze'); // 注意: OpenAI 直接回傳 JSON，內容在某個 key 下

    // 假設 AI 回應的 JSON 結構是 { "analysis_html": "..." }
    // 如果 AI 直接回傳 HTML 字串，需要調整 callOpenAI 或這裡的處理
    let analysisHtml = '';
    if(typeof analysisResult === 'object' && analysisResult !== null) {
        // 嘗試尋找包含 HTML 的鍵，這裡假設幾個可能的鍵名
        const possibleKeys = ['analysis', 'analysis_html', 'html_report', 'interpretation'];
        for (const key of possibleKeys) {
            if (typeof analysisResult[key] === 'string') {
                analysisHtml = analysisResult[key];
                break;
            }
        }
        if (!analysisHtml && typeof analysisResult.content === 'string') { // 備用：直接取 content
             analysisHtml = analysisResult.content;
        }
    } else if (typeof analysisResult === 'string') { // 如果 callOpenAI 發生錯誤回退到直接返回字串
        analysisHtml = analysisResult;
    }


    if (!analysisHtml) {
        console.warn("--- [API LOG/Analyze Warning] AI 回應中未找到有效的 HTML 分析內容 ---", analysisResult);
        analysisHtml = "<p>抱歉，目前無法生成詳細分析，請稍後再試。</p>"; // 提供備用訊息
        // throw new Error("AI 回應中未找到有效的 HTML 分析內容");
    }


    // 3. (可選) 生成 session ID 和 canSave 標誌
    const sessionId = uuidv4(); // 或使用 interactionId 作為 Session ID
    const canSave = false; // 根據您的業務邏輯決定是否允許儲存

    res.json({
      success: true,
      analysis: analysisHtml, // 回傳 HTML 字串
      sessionId: sessionId,
      canSave: canSave
    });

  } catch (error) {
    console.error('--- [API LOG/Divination Analyze Error] ---', error);
    res.status(500).json({
      success: false,
      analysis: null,
      error: `生成最終分析失敗：${error.message || '內部伺服器錯誤'}`
    });
  }
});


module.exports = router;