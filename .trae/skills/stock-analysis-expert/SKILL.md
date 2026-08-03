---
name: "stock-analysis-expert"
description: "Evaluates stock analysis reports for accuracy, completeness, and beginner-friendliness. Invoke when reviewing quantitative factors, algorithm rules, report layout, or testing prediction accuracy."
---

# Stock Analysis Expert

A professional stock analysis evaluation skill for the Guanlan Stock project. This skill provides expert-level review of quantitative analysis reports from the perspectives of professional trading, swing trading, and quantitative investing.

## When to Invoke

- User asks to evaluate the analysis report layout or structure
- User asks to review quantitative factors or algorithm rules
- User asks to check for missing key indicators (market sentiment, index, etc.)
- User asks to simplify content for beginners
- User asks to test prediction accuracy
- User asks to ensure information accuracy and avoid misleading users
- User asks to optimize from professional trading / swing / quant perspective

## Evaluation Framework

### 1. Quantitative Factor Review

Check each factor in the scoring engine for **correctness, weight fairness, and edge-case handling**:

| Factor | Weight | Check Points |
|--------|--------|--------------|
| Trend (ADX-based) | ±18 | Is ADX threshold (40) appropriate? Does shake_up/shake_down classification make sense? |
| Position (vs MA20) | ±6 | Is 15% deviation threshold reasonable? Does it unfairly penalize momentum stocks? |
| Fund Flow (5-day) | ±10 | Is 5-day window optimal? Should it weight recent days more? |
| RSI(12) | ±8 to ±15 | Are 30/55/70/80 thresholds standard? Is RSI(12) better than RSI(14)? |
| MACD Cross | ±6 | Is ±6 too small relative to trend ±18? Should histogram divergence be considered? |
| News Sentiment | ±12 | Is ±12 cap appropriate? Is the sentiment scoring model accurate? |

**Red flags to watch for:**
- Factors that double-count (e.g., trend and MA state both reward bullish alignment)
- Missing factors: market index correlation, sector rotation, volume-price divergence
- Thresholds that are too sensitive (whipsaw) or too insensitive (lagging)

### 2. Algorithm Rule Review

**Signal generation (5-level):**
- Buy/Sell signals: verify trigger conditions are logically sound
- Hold/Watch/Wait: verify they don't overlap or contradict
- Edge case: what happens when all conditions are neutral?

**Risk level:**
- Low/Medium/High: verify the scoring thresholds (70/45)
- Check if ATR%, max drawdown, and near-top flags are weighted correctly
- Verify risk elevation logic doesn't over-penalize

**Decision flags (watch/build/add/reduce):**
- Check for conflicting flags (e.g., both `add` and `reduce` could be true)
- Verify the MA20 proximity check for `add` is reasonable (3% band)
- Check if `reduce` triggers (RSI>78, near top, price>1.5×MA60) are appropriate

### 3. Key Indicator Completeness

**Must-have indicators for professional analysis:**
- [x] Trend (ADX + MA system)
- [x] Momentum (MACD, KDJ, RSI)
- [x] Volume (VMA ratio, OBV)
- [x] Volatility (ATR, Bollinger, annualized vol)
- [x] Risk (max drawdown, turnover rate)
- [x] Fund flow (main capital net inflow)
- [x] Support/Resistance (pivot-based)
- [ ] **Market index context** (大盘指数: 上证/深证/创业板 trend) — MISSING
- [ ] **Sector/industry context** (板块轮动) — MISSING
- [ ] **Market sentiment** (市场情绪: 涨跌比/涨停数/北向资金) — MISSING
- [ ] **Volume-price divergence** (量价背离检测) — PARTIAL (only VMA ratio)

**Recommended additions:**
1. Market index trend: compare stock trend vs index trend (beta-aware)
2. North-bound capital flow (北向资金): institutional sentiment proxy
3. Market breadth (涨跌家数比): overall market health
4. Sector performance: is the stock's sector leading or lagging?

### 4. Report Layout Evaluation (Beginner-Friendly)

**Reading flow should be:**
1. What's the situation? (Banner)
2. What should I do? (Signal + trigger conditions)
3. How good/bad? (Score + breakdown)
4. At what price? (Key levels + decision)
5. Show me evidence (Technical metrics)
6. What's the risk? (Risk metrics + warnings)
7. What's happening? (News)
8. Summary (Conclusion)

**Beginner unfriendly practices to flag:**
- Professional jargon without explanation (e.g., "ADX", "BIAS", "%B")
- Too many metrics shown without grouping or prioritization
- Missing plain-language interpretation of each metric
- Contradictory signals without reconciliation (e.g., MACD bullish but KDJ bearish)
- Absolute language ("will rise", "must buy") instead of probabilistic framing

**Content to simplify or remove for beginners:**
- BIAS(6/12/24) raw numbers — replace with "价格偏离均线程度"
- ADX raw number — replace with "趋势强度: 强/中/弱"
- Bollinger %B raw number — replace with "位置: 上轨/中轨/下轨"
- OBV trend text — simplify to "量能配合/不配合"
- Annualized volatility — simplify to "波动: 大/中/小"

### 5. Prediction Accuracy Testing

**Backtesting approach:**
1. Select 10+ stocks across different trends (up/down/range)
2. For each, record the signal and key levels
3. Check 5-10 trading days later:
   - Did buy signals near support result in bounces?
   - Did sell signals near resistance result in pullbacks?
   - Were support/resistance levels accurate (within 2%)?
4. Calculate hit rate: signals correct / total signals
5. Flag systematic errors (e.g., always late in trend reversals)

**Common prediction failures to check:**
- Lagging indicators (MACD, KDJ) giving signals after the move has happened
- Support/resistance from old pivots that are no longer relevant
- Trend classification failing in choppy markets (whipsaw)
- RSI overbought/oversold in strong trends (RSI can stay >70 for weeks)

### 6. Information Accuracy Checklist

- [ ] All indicator calculations use correct formulas (verify against reference)
- [ ] Score range is correctly clamped (5-95)
- [ ] Risk level elevation logic is sound
- [ ] Signal trigger conditions match the actual market logic
- [ ] Support/resistance are from valid pivot points (not arbitrary)
- [ ] Buy range calculation doesn't give misleading buy points
- [ ] News sentiment scoring is calibrated (not too aggressive/conservative)
- [ ] No data leakage (using future data in calculations)
- [ ] Turnover rate and fund flow data are from reliable sources
- [ ] All disclaimers are present ("非投资建议")

## Output Format

When evaluating, provide a structured report:

```
## 评估报告

### 1. 量化因子评估
[Factor-by-factor analysis with issues and recommendations]

### 2. 算法规则评估
[Signal logic, risk level, decision flags review]

### 3. 关键指标缺失
[List of missing indicators with priority]

### 4. 布局与可读性
[Layout flow analysis, jargon issues, beginner-friendliness]

### 5. 信息准确性
[Accuracy issues found]

### 6. 预测准确性
[If tested, backtesting results]

### 7. 改进建议
[Prioritized list of improvements]
```
