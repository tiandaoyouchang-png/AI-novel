# Topic Selection YAML Template

Replace every example value, URL, date, and score with researched project evidence. Dates use `YYYY-MM-DD`.

## `discovery/market-scan.yaml`

```yaml
schemaVersion: 1
asOf: 2026-07-26
targetMarket: 中国大陆商业故事
targetPlatforms: [fanqie, zhihu-salt]
targetForms: [long-serial, short-complete]
sources:
  - id: official-industry
    title: 行业报告标题
    url: https://example.com/industry
    publisher: 行业机构
    publishedAt: 2026-04-01
    accessedAt: 2026-07-26
    type: industry-report
    appliesTo: [fanqie, zhihu-salt]
    appliesToForms: [long-serial, short-complete]
    signal: 报告支持的市场信号
    evidence: 支持该信号的具体方法、样本或原文摘要
    confidence: high
  - id: target-platform
    title: 目标平台创作或读者报告
    url: https://example.com/platform
    publisher: 目标平台
    publishedAt: 2026-06-01
    accessedAt: 2026-07-26
    type: platform-data
    appliesTo: [zhihu-salt]
    appliesToForms: [short-complete]
    signal: 目标平台与文体的具体需求
    evidence: 可核查的平台规则或数据
    confidence: high
  - id: independent-readers
    title: 独立读者研究
    url: https://example.com/readers
    publisher: 独立研究机构
    publishedAt: 2026-05-01
    accessedAt: 2026-07-26
    type: reader-research
    appliesTo: [fanqie, zhihu-salt]
    appliesToForms: [long-serial, short-complete]
    signal: 目标读者的情绪或阅读需求
    evidence: 调研范围与可核查结论
    confidence: medium
```

Allowed `type` values: `industry-report`, `platform-data`, `reader-research`, `search-trend`, `competitor-product`. The last two cannot replace demand evidence.

## `discovery/topic-candidates.yaml`

Create three to eight full candidates. Every candidate requires exactly these keys:

```yaml
schemaVersion: 1
candidates:
  - id: candidate-one
    workingTitle: 候选一
    targetPlatform: zhihu-salt
    workForm: short-complete
    genre: 现实悬疑
    targetReader: 喜欢现实议题和强反转的盐选悬疑读者
    channel: 知乎盐选故事
    platformRationale: 为什么适合该平台
    formRationale: 为什么能在短篇内闭环
    readerNeed: 读者需要
    emotionalReward: 情绪回报
    coreFantasy: 核心幻想
    storyEngine: 可闭环的因果引擎
    differentiator: 与同类不同的机制
    openingHook: 开场钩子
    comparableAppeals: [现实压迫, 证据回看]
    evidenceIds: [official-industry, target-platform, independent-readers]
    saturationRisks: [同类反转拥挤]
    originalityBoundaries: [不复制现有作品的案件与关系, 结局必须由前文证据推出]
    scores:
      demand: 5
      competitionWhitespace: 4
      channelFit: 5
      authorFit: 4
      serialSustainability: 3
      differentiation: 5
      evidenceQuality: 5
  - id: candidate-two
    workingTitle: 候选二
    targetPlatform: zhihu-salt
    workForm: short-complete
    genre: 情感悬疑
    targetReader: 喜欢现实议题和强反转的盐选悬疑读者
    channel: 知乎盐选故事
    platformRationale: 为什么适合该平台
    formRationale: 为什么能在短篇内闭环
    readerNeed: 读者需要
    emotionalReward: 情绪回报
    coreFantasy: 核心幻想
    storyEngine: 可闭环的因果引擎
    differentiator: 与同类不同的关系机制
    openingHook: 开场钩子
    comparableAppeals: [情感浓度, 身份反转]
    evidenceIds: [official-industry, target-platform, independent-readers]
    saturationRisks: [关系反转同质化]
    originalityBoundaries: [不复制现有作品人设, 不用无证据梦境反转]
    scores:
      demand: 4
      competitionWhitespace: 3
      channelFit: 5
      authorFit: 4
      serialSustainability: 3
      differentiation: 4
      evidenceQuality: 5
  - id: candidate-three
    workingTitle: 候选三
    targetPlatform: zhihu-salt
    workForm: short-complete
    genre: 职业悬疑
    targetReader: 喜欢现实议题和强反转的盐选悬疑读者
    channel: 知乎盐选故事
    platformRationale: 为什么适合该平台
    formRationale: 为什么能在短篇内闭环
    readerNeed: 读者需要
    emotionalReward: 情绪回报
    coreFantasy: 核心幻想
    storyEngine: 可闭环的职业证据引擎
    differentiator: 与同类不同的职业机制
    openingHook: 开场钩子
    comparableAppeals: [职业细节, 程序困局]
    evidenceIds: [official-industry, target-platform, independent-readers]
    saturationRisks: [职业细节可能失真]
    originalityBoundaries: [关键流程必须核验, 不借用现成案件结构]
    scores:
      demand: 4
      competitionWhitespace: 4
      channelFit: 4
      authorFit: 3
      serialSustainability: 3
      differentiation: 4
      evidenceQuality: 4
```

For `long-serial`, set `workForm: long-serial` and give any selectable candidate `serialSustainability: 4` or `5`.

## `discovery/topic-decision.yaml`

```yaml
schemaVersion: 1
selectedId: candidate-one
decisionRationale: 为什么它最能同时满足需求、渠道、文体与差异化
selectionTradeoff: 为选择它主动放弃了什么优势
rejected:
  - id: candidate-two
    reason: 明确的落选原因
  - id: candidate-three
    reason: 明确的落选原因
validation:
  hypothesis: 目标读者将因何继续或完成付费阅读
  targetReaders: 可招募、可识别的目标读者
  minimumSampleSize: 5
  successSignal: 可观察且有阈值的成功信号
protectedOriginality:
  - 不复制现有作品的情节、人物关系、组织或标志性表达
  - 所有反转必须由本书已展示的选择和证据生成
```

`minimumSampleSize: 5` is a practical example. The CLI hard minimum is 3.

Run `novelctl topics`, then make `planning/market-position.yaml` match the selected candidate's `targetPlatform`, `workForm`, `targetReader`, and `channel` exactly.
