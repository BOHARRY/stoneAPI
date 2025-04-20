const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

const sessions = new Map();

router.post('/analyze', async (req, res) => {
  try {
    const { initialQuestion, questions, cards } = req.body;
    
    if (!initialQuestion || !questions || !cards) {
      return res.status(400).json({
        success: false,
        error: '請求數據不完整'
      });
    }
    
    const interpretation = generateInterpretation(initialQuestion, questions, cards);
    const sessionId = uuidv4();
    
    sessions.set(sessionId, {
      sessionId,
      timestamp: new Date(),
      initialQuestion,
      questions,
      cards,
      interpretation,
      expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    
    res.json({
      success: true,
      sessionId,
      interpretation,
      canSave: false
    });
    
  } catch (error) {
    console.error('處理占卜分析失敗:', error);
    res.status(500).json({
      success: false,
      error: '分析請求處理失敗，請稍後再試'
    });
  }
});

function generateInterpretation(initialQuestion, questions, cards) {
  const cardNames = cards.map(card => card.name).join('、');
  return `
    <h4 class="interpretation-title">玄機解析</h4>
    <p>您所求問的「${initialQuestion}」，透過八卦映照天機，已有所指示。</p>
    <p>卦象呈現：${cardNames}，顯示您正處於變化之中。</p>
    <p>依據您的回答與卦象所示：</p>
    <ul>
      <li>第一問：「${questions[0]}」- 反映出您內心的真實期望。</li>
      <li>第二問：「${questions[1]}」- 指引出實現的可能路徑。</li>
      <li>第三問：「${questions[2]}」- 揭示了需要注意的關鍵要素。</li>
    </ul>
    <p>結合三卦之義，此時您宜：</p>
    <p>保持心境平和，明辨是非，把握時機行動。凡事不強求，順應自然，方能達成心願。</p>
    <p>避免：急躁冒進，盲目聽信他人，或過度憂慮未來。</p>
    <p>請記住，天機雖有指引，終究由己把握。願您智慧同行。</p>
  `;
}

module.exports = router;
