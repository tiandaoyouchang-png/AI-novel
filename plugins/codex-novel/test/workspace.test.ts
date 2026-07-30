import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import JSZip from "jszip";
import { compileChapterContext } from "../src/context.js";
import {
  commitContinuityDelta,
  getContinuityCards,
  recoverContinuityTransaction,
  reopenLatestCommittedChapter
} from "../src/continuity.js";
import { fingerprintFile, pathExists, readState, writeState } from "../src/io.js";
import {
  generateOpeningMilestone,
  generateStoryMilestone,
  validateCommercialMilestoneReview
} from "../src/milestone.js";
import { generateCheckpoint } from "../src/checkpoint.js";
import {
  queryRetrievalIndex,
  rebuildRetrievalIndex
} from "../src/retrieval.js";
import { generateTopicSelectionReport } from "../src/topics.js";
import { runQualityCheck } from "../src/quality.js";
import { inspectArcGrid, validateHookExperiments } from "../src/planning.js";
import { createRevision, listRevisions, restoreRevision } from "../src/revisions.js";
import {
  generateLearningReport,
  importPublicationMetrics,
  inspectCadence,
  updatePublishedThrough
} from "../src/production.js";
import { exportDocument, importManuscript } from "../src/documents.js";
import { friendlyError, guideWorkspace, runDoctor } from "../src/diagnostics.js";
import { readLogicDebtLedger, writeLogicDebtLedger } from "../src/logic-debts.js";
import {
  prepareExternalReview,
  recordExternalReview
} from "../src/external-review.js";
import {
  advanceChapter,
  exportNovel,
  initializeWorkspace,
  invalidateArtifact,
  startNextChapter,
  transitionPhase,
  validateWorkspace
} from "../src/workspace.js";

async function temporaryWorkspace(): Promise<{ parent: string; workspace: string }> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "codex-novel-test-"));
  return { parent, workspace: path.join(parent, "novel") };
}

async function writeAcceptedArtifact(workspace: string, relative: string, body: string): Promise<void> {
  const target = path.join(workspace, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const padding = path.extname(target) === ".yaml"
    ? "# accepted artifact with enough validated content"
    : "Accepted artifact with enough concrete content to pass the gate.";
  await fs.writeFile(target, `${body}\n${padding}\n`, "utf8");
}

async function enterProduction(workspace: string): Promise<void> {
  await writeAcceptedArtifact(workspace, "planning/novel-brief.md", "# Novel Brief\nReader promise and protagonist path.");
  await writeAcceptedArtifact(workspace, "planning/market-position.yaml", marketPositionYaml());
  await writeTopicDiscovery(workspace);
  await transitionPhase(workspace, "brief_approved");
  await writeAcceptedArtifact(workspace, "planning/story-bible.md", "# Story Bible\nCore conflict and progression.");
  await writeAcceptedArtifact(workspace, "planning/world-rules.yaml", "schemaVersion: 1\nrules:\n  - id: world-001");
  await writeAcceptedArtifact(
    workspace,
    "planning/characters/character-roster.md",
    "# Character Roster\nActive protagonist and antagonist."
  );
  await writeAcceptedArtifact(
    workspace,
    "planning/characters/char-lin-yan.yaml",
    characterProfileYaml()
  );
  await writeAcceptedArtifact(workspace, "planning/story-guardrails.yaml", storyGuardrailsYaml());
  await writeAcceptedArtifact(workspace, "planning/reveal-policy.yaml", revealPolicyYaml());
  await transitionPhase(workspace, "foundation_approved");
  await writeAcceptedArtifact(
    workspace,
    "planning/volumes/current-volume.md",
    "# Current Volume\nPromise, escalation, midpoint, and payoff."
  );
  await writeAcceptedArtifact(workspace, "planning/arc-grid.yaml", arcGridYaml());
  await transitionPhase(workspace, "production");
}

async function enterShortProduction(workspace: string): Promise<void> {
  await writeAcceptedArtifact(
    workspace,
    "planning/novel-brief.md",
    "# Novel Brief\nA compact complete story with a decisive emotional payoff."
  );
  await writeAcceptedArtifact(
    workspace,
    "planning/market-position.yaml",
    marketPositionYaml()
      .replace("targetPlatform: fanqie", "targetPlatform: zhihu-salt")
      .replace("workForm: long-serial", "workForm: short-complete")
  );
  await writeTopicDiscovery(workspace);
  const candidatesPath = path.join(workspace, "discovery/topic-candidates.yaml");
  const candidates = await fs.readFile(candidatesPath, "utf8");
  await fs.writeFile(
    candidatesPath,
    candidates
      .replace("targetPlatform: fanqie", "targetPlatform: zhihu-salt")
      .replace("workForm: long-serial", "workForm: short-complete"),
    "utf8"
  );
  await generateTopicSelectionReport(workspace, new Date().toISOString().slice(0, 10));
  await transitionPhase(workspace, "brief_approved");
  await writeAcceptedArtifact(
    workspace,
    "planning/story-bible.md",
    "# Story Bible\nCompact causal chain and final reversal."
  );
  await writeAcceptedArtifact(
    workspace,
    "planning/world-rules.yaml",
    "schemaVersion: 1\nrules:\n  - id: world-001"
  );
  await writeAcceptedArtifact(
    workspace,
    "planning/characters/character-roster.md",
    "# Character Roster\nActive protagonist and antagonist."
  );
  await writeAcceptedArtifact(
    workspace,
    "planning/characters/char-lin-yan.yaml",
    characterProfileYaml()
  );
  await writeAcceptedArtifact(workspace, "planning/story-guardrails.yaml", storyGuardrailsYaml());
  await writeAcceptedArtifact(workspace, "planning/reveal-policy.yaml", revealPolicyYaml());
  await transitionPhase(workspace, "foundation_approved");
  await writeAcceptedArtifact(
    workspace,
    "planning/volumes/current-volume.md",
    "# Whole Story Plan\nOpening, escalation, reversal, and ending payoff."
  );
  await transitionPhase(workspace, "production");
}

async function writeTopicDiscovery(workspace: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await writeAcceptedArtifact(
    workspace,
    "discovery/market-scan.yaml",
    [
      "schemaVersion: 1",
      `asOf: ${today}`,
      "targetMarket: 中文历史悬疑连载",
      "targetPlatforms:",
      "  - fanqie",
      "  - zhihu-salt",
      "targetForms:",
      "  - long-serial",
      "  - short-complete",
      "sources:",
      "  - id: industry-demand",
      "    title: 行业需求报告",
      "    url: https://example.com/industry",
      "    publisher: 行业机构",
      `    publishedAt: ${today}`,
      `    accessedAt: ${today}`,
      "    type: industry-report",
      "    appliesTo:",
      "      - fanqie",
      "      - zhihu-salt",
      "    appliesToForms:",
      "      - long-serial",
      "      - short-complete",
      "    signal: 悬疑需求稳定",
      "    evidence: 目标读者持续消费证据驱动的悬疑故事",
      "    confidence: high",
      "  - id: platform-fit",
      "    title: 平台读者报告",
      "    url: https://example.com/platform",
      "    publisher: 测试平台",
      `    publishedAt: ${today}`,
      `    accessedAt: ${today}`,
      "    type: platform-data",
      "    appliesTo:",
      "      - fanqie",
      "    appliesToForms:",
      "      - long-serial",
      "    signal: 短章连载适合测试频道",
      "    evidence: 历史悬疑在目标频道保持活跃",
      "    confidence: high",
      "  - id: reader-need",
      "    title: 读者访谈",
      "    url: https://example.com/readers",
      "    publisher: 独立研究组",
      `    publishedAt: ${today}`,
      `    accessedAt: ${today}`,
      "    type: reader-research",
      "    appliesTo:",
      "      - fanqie",
      "      - zhihu-salt",
      "    appliesToForms:",
      "      - long-serial",
      "      - short-complete",
      "    signal: 读者需要可回看线索",
      "    evidence: 访谈对象偏好主动破局和阶段答案",
      "    confidence: medium"
    ].join("\n")
  );
  await writeAcceptedArtifact(
    workspace,
    "discovery/topic-candidates.yaml",
    [
      "schemaVersion: 1",
      "candidates:",
      ...topicCandidateLines("ledger-mystery", "盐仓账房", 5, 4, 5, 4, 5, 5, 5),
      ...topicCandidateLines("canal-detective", "漕河捕快", 4, 3, 4, 4, 4, 3, 4),
      ...topicCandidateLines("archive-healer", "医案藏书", 3, 4, 3, 3, 3, 4, 3)
    ].join("\n")
  );
  await writeAcceptedArtifact(
    workspace,
    "discovery/topic-decision.yaml",
    [
      "schemaVersion: 1",
      "selectedId: ledger-mystery",
      "decisionRationale: 账术证据链最符合目标读者对专业破局和可回看线索的需求",
      "selectionTradeoff: 放弃更宽泛的捕快查案受众，换取更鲜明的职业机制",
      "rejected:",
      "  - id: canal-detective",
      "    reason: 捕快查案竞争更拥挤，职业机制差异较弱",
      "  - id: archive-healer",
      "    reason: 平台适配和长线冲突强度较弱",
      "validation:",
      "  hypothesis: 目标读者会因为账术破局继续阅读",
      "  targetReaders: 喜欢历史悬疑的中文读者",
      "  minimumSampleSize: 5",
      "  successSignal: 五人中至少三人选择立即阅读下一章",
      "protectedOriginality:",
      "  - 不照搬现实案件或既有小说的标志性桥段",
      "  - 破局必须来自可验证账目与货路证据"
    ].join("\n")
  );
  await writeAcceptedArtifact(
    workspace,
    "discovery/hook-experiments.yaml",
    hookExperimentsYaml()
  );
  await generateTopicSelectionReport(workspace, today);
}

function hookExperimentsYaml(): string {
  const sampleA = "雨夜里，林砚收到一封写着自己死亡日期的信。他起初以为是恶作剧，直到信中准确写出街角即将发生的车祸，以及只有失踪父亲才知道的旧账册暗号。信纸末尾还沾着未干的盐霜，和父亲消失那晚留在门槛上的一模一样。";
  const sampleB = "审讯室的灯第三次熄灭时，桌上的死者照片突然多了一行字：下一位是林砚。他没有报警，因为照片背后盖着父亲失踪前使用的私章，而门外正有人用父亲的声音叫他回家。他摸向唯一出口，却发现门锁早已从外面焊死。";
  return [
    "schemaVersion: 1",
    "selectedHookId: hook-a",
    "candidates:",
    "  - id: hook-a",
    "    title: 死亡来信",
    "    hypothesis: 预告死亡并连接父亲失踪案能形成明确的继续阅读问题",
    `    openingSample: "${sampleA}"`,
    "    targetEmotion: 紧张和求证欲",
    "    readerQuestion: 父亲是否还活着以及来信者是谁",
    "    risks:",
    "      - 死亡预告可能显得套路化",
    "  - id: hook-b",
    "    title: 死者照片",
    "    hypothesis: 封闭审讯场景和异常证据能快速建立悬疑",
    `    openingSample: "${sampleB}"`,
    "    targetEmotion: 恐惧和怀疑",
    "    readerQuestion: 门外的人为什么知道父亲的声音",
    "    risks:",
    "      - 超自然感可能偏离写实定位",
    "testProtocol:",
    "  blindLabels: true",
    "  targetReaders: 喜欢历史悬疑和小人物升级的男频读者",
    "  minimumSampleSize: 3",
    "  questions:",
    "    - 读完后是否愿意继续阅读下一章",
    "    - 最想立刻知道的问题是什么",
    "  successSignals:",
    "    - 至少三分之二读者选择继续阅读且能复述核心悬念",
    "rejected:",
    "  - id: hook-b",
    "    reason: 超自然暗示过强，与当前写实调查定位不一致",
    "notes:",
    "  - 尚未获得真实读者数据，当前选择属于作者决策"
  ].join("\n");
}

function arcGridYaml(): string {
  return [
    "schemaVersion: 1",
    "arcs:",
    "  - id: arc-main-ledger",
    "    type: main-plot",
    "    title: 失踪账册主线",
    "    status: active",
    "    introducedIn:",
    "      volume: 1",
    "      chapter: 1",
    "    promises:",
    "      - 查明父亲失踪与账册之间的关系",
    "    dependencies: []",
    "    payoffTarget:",
    "      volume: 3",
    "      chapter: null",
    "      description: 揭示父亲保存账册的真实目的",
    "    lastAdvancedChapter: 0",
    "    maxIdleChapters: 8",
    "    dormantReason: null",
    "    volumeBeats:",
    "      - volume: 1",
    "        objective: 证明账册确实存在",
    "        status: active",
    "        payoffDebt: 交代第一位保管人的下落"
  ].join("\n");
}

function topicCandidateLines(
  id: string,
  title: string,
  demand: number,
  whitespace: number,
  channelFit: number,
  authorFit: number,
  sustainability: number,
  differentiation: number,
  evidenceQuality: number
): string[] {
  return [
    `  - id: ${id}`,
    `    workingTitle: ${title}`,
    "    targetPlatform: fanqie",
    "    workForm: long-serial",
    "    genre: 历史悬疑",
    "    targetReader: 喜欢历史悬疑的中文读者",
    "    channel: test-channel",
    "    platformRationale: 适合长篇连续更新、推荐验证和稳定的章节回报",
    "    formRationale: 故事引擎可以跨越多个案件持续升级",
    "    readerNeed: 看小人物用专业能力主动破局",
    "    emotionalReward: 每章获得一次可回看的证据翻转",
    "    coreFantasy: 用被轻视的职业技能撬动权力结构",
    "    storyEngine: 接触异常记录并现场核验，换取筹码后暴露更高层对手",
    "    differentiator: 将账目、货路和人情债组合成破案机制",
    "    openingHook: 封仓前发现一袋不该出现的禁盐",
    "    comparableAppeals:",
    "      - 专业破局",
    "      - 历史官场压力",
    "    evidenceIds:",
    "      - industry-demand",
    "      - platform-fit",
    "      - reader-need",
    "    saturationRisks:",
    "      - 历史探案同质化",
    "    originalityBoundaries:",
    "      - 不复制既有作品的案件与角色关系",
    "      - 核心证据必须由本书世界规则生成",
    "    scores:",
    `      demand: ${demand}`,
    `      competitionWhitespace: ${whitespace}`,
    `      channelFit: ${channelFit}`,
    `      authorFit: ${authorFit}`,
    `      serialSustainability: ${sustainability}`,
    `      differentiation: ${differentiation}`,
    `      evidenceQuality: ${evidenceQuality}`
  ];
}

function marketPositionYaml(): string {
  return [
    "schemaVersion: 1",
    "targetPlatform: fanqie",
    "workForm: long-serial",
    "targetReader: 喜欢历史悬疑的中文读者",
    "audienceChannel: test-channel",
    "publicationFormat: serial-fiction",
    "primaryPromise: 每章提供可验证线索和新的风险",
    "chapterLength:",
    "  min: 20",
    "  target: 100",
    "  max: 1000",
    "commercialAssumptions:",
    "  - 目标读者愿意追读证据驱动的连载",
    "contentBoundaries: []"
  ].join("\n");
}

function characterProfileYaml(): string {
  return [
    "schemaVersion: 1",
    "id: char-lin-yan",
    "name: 林砚",
    "role: 主角与盐仓账房",
    "coreMotivation: 用账术查清父亲旧案并保护家人",
    "moralBoundary: 不以无辜者的性命交换证据",
    "decisionPattern: 先核对可验证细节，再承担一次主动风险",
    "voice:",
    "  rhythm: 短句为主，压力下省略主语",
    "  diction: 使用账目、重量和货路相关的具体词",
    "  habits:",
    "    - 回答前先确认对方真正掌握的证据",
    "  avoids:",
    "    - 不发表脱离处境的长篇演说",
    "oocRisks:",
    "  - 无证据时突然相信权力人物",
    "relationshipVoices: []"
  ].join("\n");
}

function storyGuardrailsYaml(): string {
  return [
    "schemaVersion: 1",
    "corePremise:",
    "  oneSentence: 不会武功的盐仓账房用重量、账目和货路漏洞调查县域盐案",
    "  signatureMechanism: 每次关键推进必须由账目、重量或货路核验产生",
    "  protectedElements:",
    "    - 主角不会武功",
    "    - 案件以可验证的盐务细节推进",
    "  forbiddenDrift:",
    "    - 不升级为全国谋反或临时获得绝世武功",
    "maxScope: county",
    "maxHiddenAntagonistLayers: 1",
    "capabilityBoundaries:",
    "  - characterId: 林砚",
    "    allowed:",
    "      - id: ledger-audit",
    "        description: 核对账册、重量、编号和货路记录",
    "    prohibited:",
    "      - 正面对抗专业杀手",
    "      - 凭空识别毒物或施展武功",
    "    requiresSupportFor: []",
    "investigationRules:",
    "  coincidenceBudgetPerChapter: 0",
    "  requireAlternativeExplanations: true",
    "  evidenceMustNotNameCulprit: true",
    "  requireVerificationLimitation: true",
    "periodRules:",
    "  era: 架空古代县域盐政",
    "  prohibitedModernTerms:",
    "    - 媒体报道",
    "    - 鉴定报告",
    "    - 水线照片",
    "  institutionalConstraints:",
    "    - 账房发现的异常必须经书吏、典史或堂审程序转化为案证",
    "  physicalConstraints:",
    "    - 盐货重量、水线、纸张与毒性判断必须说明可观察方法及局限",
    "supportingCharacters: []",
    "consequenceRules:",
    "  failureCannotAutoReward: true",
    "  permanentCosts:",
    "    - 证人伤亡、身份暴露或证据灭失至少保留一项不可逆后果",
    "prohibitedNarrativeShortcuts:",
    "  - 反派亲口说出全部计划",
    "  - 恰好发现完整密账"
  ].join("\n");
}

function revealPolicyYaml(): string {
  return [
    "schemaVersion: 1",
    "reveals:",
    "  - id: reveal-ledger-owner",
    "    subject: 替换账册的实际责任人",
    "    earliestChapter: 3",
    "    targetChapter: 5",
    "    latestChapter: 7",
    "    prerequisiteEvidenceIds: []",
    "    status: planned",
    "    revealedChapter: null",
    "    delayReason: null"
  ].join("\n");
}

function contractYaml(chapter: number): string {
  return [
    "schemaVersion: 3",
    `chapter: ${chapter}`,
    `title: 第${chapter}章`,
    "goal: 主角必须在封锁前取得账册",
    "resistance: 巡夜使已经封锁库房",
    "requiredEvents:",
    "  - 主角进入库房",
    "protectedFacts:",
    "  - 主角尚不知道幕后主使身份",
    "prohibitedCrossings:",
    "  - 不得揭晓终局秘密",
    "participants:",
    "  - 林砚",
    "locations:",
    "  - 盐仓",
    "threadIds:",
    "  - thread-ledger",
    "resourceIds: []",
    "relationshipIds: []",
    "worldRuleIds:",
    "  - world-001",
    "keywords:",
    "  - 账册",
    "readerPromise: 本章取得关键线索并付出代价",
    "keyTurn: 账册已经被人换过",
    "netChange: 主角得到半条真线索并暴露行踪",
    "endingPull: 门外响起熟人的声音",
    "emotionalTarget: 从被迫冒险转为主动保留证据",
    "scopeLevel: county",
    "antagonistLayer: 1",
    "capabilityUses:",
    "  - characterId: 林砚",
    "    capabilityId: ledger-audit",
    "    purpose: 用账册纸张和编号差异判断替换痕迹",
    "    supportCharacterId: null",
    "investigationChain:",
    "  anomaly: 账册纸页比昨日更白且墨味新鲜",
    "  alternativeExplanations:",
    "    - 旧账册受潮后由库吏正常誊抄",
    "    - 有人替换账册以掩盖盐货差额",
    "  eliminationTests:",
    "    - 比较骑缝章、纸张批次和连续页码",
    "  result: 骑缝章断裂且页码连续，支持有人替换内页",
    "  limitation: 只能证明账册被换，不能证明替换者身份",
    "evidenceMoves: []",
    "revealIds: []",
    "coincidences: []",
    "supportingCharacterAgency: []",
    "outcomeCost: 主角取得半条线索但暴露行踪",
    "failureConsequence: 真实账册仍下落不明，后续无法直接定案",
    "periodChecks:",
    "  physical: 纸张、墨迹和骑缝章检查不依赖现代器材",
    "  institutional: 账册异常只是调查方向，尚不能直接定罪",
    "  vocabulary: 不使用现代媒体、照片或鉴定报告等词",
    "  antagonistCountermove: 对方用完整页码和伪造印章制造正常誊抄假象",
    "sceneBeats:",
    "  - id: scene-warehouse-entry",
    "    type: investigation",
    "    location: 盐仓",
    "    participants:",
    "      - 林砚",
    "    goal: 在封锁前找到真实账册",
    "    conflict: 巡夜使正在逼近且账册已经被替换",
    "    valueShift: 没有证据的怀疑转为持有半条真线索",
    "    emotionalChange: 侥幸转为警觉",
    "targetLength:",
    "  min: 20",
    "  target: 100",
    "  max: 1000"
  ].join("\n");
}

const chapterProse = [
  "# 第一章 盐仓",
  "",
  "雨水沿着盐仓的黑瓦往下淌，林砚贴住门缝，听见里面有人翻动木箱。",
  "",
  "巡夜使的灯笼从巷口逼近。他没有退路，只能把铜片插进生锈的锁眼。",
  "",
  "锁舌弹开的声音很轻，仓里却立刻静了。林砚闻到一股新鲜墨味。",
  "",
  "账册还在原处，纸页的边角却比昨日更白。有人换过它，只留下半枚盐运司的暗印。",
  "",
  "门外脚步停住。一个他绝不该在这里听见的声音，隔着木门喊出了他的乳名。"
].join("\n");

function passingReviewYaml(fingerprint: string, reviewRound = 1): string {
  return [
    "schemaVersion: 3",
    `reviewRound: ${reviewRound}`,
    `sourceFingerprint: ${fingerprint}`,
    "verdict: pass",
    "checks:",
    "  characterVoice:",
    "    status: pass",
    "    evidence: 林砚始终以账目和现场细节做判断",
    "  informationBoundaries:",
    "    status: pass",
    "    evidence: 正文没有提前揭示幕后主使",
    "  sceneValueChanges:",
    "    status: pass",
    "    evidence: 场景从怀疑推进到取得半条真线索",
    "  corePremiseAlignment:",
    "    status: pass",
    "    evidence: 关键推进来自账房职业能力而非临时武力",
    "  scopeDiscipline:",
    "    status: pass",
    "    evidence: 冲突保持在县域盐仓，没有升级为全国阴谋",
    "  capabilityBoundaries:",
    "    status: pass",
    "    evidence: 林砚只使用已登记的账册核验能力",
    "  evidenceChain:",
    "    status: pass",
    "    evidence: 异常、替代解释、验证和局限均在场景中可见",
    "  periodAuthenticity:",
    "    status: pass",
    "    evidence: 物证和用语符合故事时代与县级程序",
    "  supportingCharacterAgency:",
    "    status: pass",
    "    evidence: 本章无出场配角需要独立决策",
    "  consequenceIntegrity:",
    "    status: pass",
    "    evidence: 暴露行踪是持续代价，失败没有自动转化为奖励",
    "blockingIssues: []",
    "warnings: []"
  ].join("\n");
}

function repairReviewYaml(fingerprint: string, reviewRound: number): string {
  return [
    "schemaVersion: 3",
    `reviewRound: ${reviewRound}`,
    `sourceFingerprint: ${fingerprint}`,
    "verdict: repair",
    "checks:",
    "  characterVoice:",
    "    status: fail",
    "    evidence: 主角出现了一句脱离账房身份的空泛演说",
    "  informationBoundaries:",
    "    status: pass",
    "    evidence: 幕后主使仍未提前揭晓",
    "  sceneValueChanges:",
    "    status: pass",
    "    evidence: 场景完成了从怀疑到取得线索的变化",
    "  corePremiseAlignment:",
    "    status: pass",
    "    evidence: 调查仍由账房职业能力推进",
    "  scopeDiscipline:",
    "    status: pass",
    "    evidence: 案件保持在县域盐仓",
    "  capabilityBoundaries:",
    "    status: pass",
    "    evidence: 没有新增未登记能力",
    "  evidenceChain:",
    "    status: pass",
    "    evidence: 线索仍有替代解释与证明局限",
    "  periodAuthenticity:",
    "    status: pass",
    "    evidence: 用语与程序未越界",
    "  supportingCharacterAgency:",
    "    status: pass",
    "    evidence: 本章无出场配角需要独立决策",
    "  consequenceIntegrity:",
    "    status: pass",
    "    evidence: 失败后果没有变成奖励",
    "blockingIssues:",
    "  - id: issue-voice",
    "    category: character",
    "    evidence: 草稿末段出现与角色档案冲突的长篇演说",
    "    repair: 删除演说并改为一次可验证的账目选择",
    "warnings: []"
  ].join("\n");
}

function handoffYaml(chapter: number, fingerprint: string): string {
  return [
    "schemaVersion: 1",
    `chapter: ${chapter}`,
    `sourceFingerprint: "${fingerprint}"`,
    `summary: 第${chapter}章确认账册被替换，主角取得半条线索并暴露行踪`,
    "resolved:",
    "  - 确认盐仓账册不是原件",
    "unresolved:",
    "  - 替换账册的人仍未确认",
    "characterCarry:",
    "  - characterId: char-lin-yan",
    "    state: 已取得半枚暗印，行踪暴露",
    "emotionalCarry: 警觉压过侥幸，下一步必须主动验证线索",
    "nextConstraints:",
    "  - 不能提前揭晓幕后主使"
  ].join("\n");
}

async function commitTestChapter(workspace: string, chapter: number): Promise<void> {
  const directory = String(chapter).padStart(4, "0");
  await writeAcceptedArtifact(workspace, `chapters/${directory}/contract.yaml`, contractYaml(chapter));
  await compileChapterContext(workspace);
  await advanceChapter(workspace, "planned");
  await fs.writeFile(path.join(workspace, `chapters/${directory}/draft.md`), `${chapterProse}\n`, "utf8");
  await advanceChapter(workspace, "drafted");
  await runQualityCheck(workspace, "draft");
  const draftFingerprint = await fingerprintFile(
    path.join(workspace, `chapters/${directory}/draft.md`)
  );
  await writeAcceptedArtifact(
    workspace,
    `chapters/${directory}/review.yaml`,
    passingReviewYaml(draftFingerprint)
  );
  await advanceChapter(workspace, "reviewed");
  await fs.writeFile(path.join(workspace, `chapters/${directory}/final.md`), `${chapterProse}\n`, "utf8");
  await runQualityCheck(workspace, "final");
  await advanceChapter(workspace, "accepted");
  await writeAcceptedArtifact(
    workspace,
    `chapters/${directory}/delta.yaml`,
    [
      "schemaVersion: 1",
      `chapter: ${chapter}`,
      `sourceFingerprint: ${draftFingerprint}`,
      "changes:",
      "  - domain: facts",
      "    operation: upsert",
      `    id: fact-chapter-${chapter}`,
      "    value:",
      `      statement: 第${chapter}章已经形成可验证变化`,
      `    evidence: 第${chapter}章终稿`
    ].join("\n")
  );
  await writeAcceptedArtifact(
    workspace,
    `chapters/${directory}/handoff.yaml`,
    handoffYaml(chapter, draftFingerprint)
  );
  await advanceChapter(workspace, "continuity_committed");
}

test("initializes a valid workspace without overwriting an existing path", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));

  const state = await initializeWorkspace(workspace, { title: "测试小说" });
  assert.equal(state.workflow.phase, "preview");
  assert.equal(state.workflow.currentChapter, 1);
  await validateWorkspace(workspace);
  await assert.rejects(() => initializeWorkspace(workspace, { title: "覆盖" }), /already exists/);
});

test("phase gates reject placeholders and leave authoritative state unchanged", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "门禁测试" });

  await assert.rejects(() => transitionPhase(workspace, "brief_approved"), /placeholders/);
  assert.equal((await readState(workspace)).workflow.phase, "preview");

  await writeAcceptedArtifact(workspace, "planning/novel-brief.md", "# Novel Brief\nA confirmed reader promise.");
  await writeAcceptedArtifact(workspace, "planning/market-position.yaml", marketPositionYaml());
  await writeTopicDiscovery(workspace);
  const state = await transitionPhase(workspace, "brief_approved");
  assert.equal(state.artifacts.brief.status, "accepted");

  await writeAcceptedArtifact(workspace, "planning/story-bible.md", "# Story Bible\nA repeatable story engine.");
  await writeAcceptedArtifact(
    workspace,
    "planning/characters/character-roster.md",
    "# Character Roster\nAn active protagonist and antagonist."
  );
  await fs.writeFile(
    path.join(workspace, "planning/world-rules.yaml"),
    "rules: [\n# invalid but long enough to pass a length-only check\n",
    "utf8"
  );
  await assert.rejects(() => transitionPhase(workspace, "foundation_approved"), /placeholders/);
  assert.equal((await readState(workspace)).workflow.phase, "brief_approved");
});

test("topic selection blocks weak differentiation and stale decisions", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "选题门禁测试" });
  await writeAcceptedArtifact(
    workspace,
    "planning/novel-brief.md",
    "# Novel Brief\nEvidence-backed reader promise."
  );
  await writeAcceptedArtifact(workspace, "planning/market-position.yaml", marketPositionYaml());
  await writeTopicDiscovery(workspace);

  const candidatePath = path.join(workspace, "discovery/topic-candidates.yaml");
  const candidates = await fs.readFile(candidatePath, "utf8");
  await fs.writeFile(
    candidatePath,
    candidates.replace("      differentiation: 5", "      differentiation: 2"),
    "utf8"
  );
  const weak = await generateTopicSelectionReport(
    workspace,
    new Date().toISOString().slice(0, 10)
  );
  assert.equal(weak.report.ok, false);
  assert.match(weak.report.blockingIssues.join("\n"), /Differentiation score/);
  await assert.rejects(
    () => transitionPhase(workspace, "brief_approved"),
    /Topic selection has blocking issues/
  );

  await writeTopicDiscovery(workspace);
  await fs.appendFile(
    path.join(workspace, "discovery/topic-decision.yaml"),
    "\n# changed after ranking\n"
  );
  await assert.rejects(
    () => transitionPhase(workspace, "brief_approved"),
    /Topic selection report is stale/
  );
  assert.equal((await readState(workspace)).workflow.phase, "preview");
});

test("supports a Zhihu Salt short-complete topic independently from platform choice", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "盐选短篇测试" });
  await writeAcceptedArtifact(
    workspace,
    "planning/novel-brief.md",
    "# Novel Brief\nA complete short story with a compact emotional payoff."
  );
  await writeAcceptedArtifact(
    workspace,
    "planning/market-position.yaml",
    marketPositionYaml()
      .replace("targetPlatform: fanqie", "targetPlatform: zhihu-salt")
      .replace("workForm: long-serial", "workForm: short-complete")
  );
  await writeTopicDiscovery(workspace);
  const candidatePath = path.join(workspace, "discovery/topic-candidates.yaml");
  const candidates = await fs.readFile(candidatePath, "utf8");
  await fs.writeFile(
    candidatePath,
    candidates
      .replace("targetPlatform: fanqie", "targetPlatform: zhihu-salt")
      .replace("workForm: long-serial", "workForm: short-complete"),
    "utf8"
  );
  const report = await generateTopicSelectionReport(
    workspace,
    new Date().toISOString().slice(0, 10)
  );
  assert.equal(report.report.ok, true);
  const selected = report.report.rankings.find((candidate) => candidate.id === "ledger-mystery");
  assert.ok(selected);
  assert.equal(selected.targetPlatform, "zhihu-salt");
  assert.equal(selected.workForm, "short-complete");
  const approved = await transitionPhase(workspace, "brief_approved");
  assert.equal(approved.artifacts.brief.status, "accepted");
});

test("detects edited accepted artifacts and propagates stale state explicitly", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "失效测试" });
  await writeAcceptedArtifact(workspace, "planning/novel-brief.md", "# Novel Brief\nOriginal reader promise.");
  await writeAcceptedArtifact(workspace, "planning/market-position.yaml", marketPositionYaml());
  await writeTopicDiscovery(workspace);
  await transitionPhase(workspace, "brief_approved");

  await fs.appendFile(path.join(workspace, "planning/novel-brief.md"), "\nChanged after approval.\n");
  await assert.rejects(() => validateWorkspace(workspace), /changed after approval/);

  const invalidated = await invalidateArtifact(workspace, "brief", "Reader promise changed");
  assert.equal(invalidated.workflow.phase, "preview");
  assert.equal(invalidated.artifacts.brief.status, "stale");
  assert.equal(invalidated.workflow.blockingReason, "Reader promise changed");
});

test("mechanical quality gate blocks banned words before model review", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "质量测试" });
  await enterProduction(workspace);
  await writeAcceptedArtifact(workspace, "chapters/0001/contract.yaml", contractYaml(1));
  await compileChapterContext(workspace);
  await advanceChapter(workspace, "planned");
  await fs.writeFile(
    path.join(workspace, "planning/quality-rules.yaml"),
    [
      "schemaVersion: 1",
      "bannedWords:",
      "  - 忽然",
      "maxRepeatedPhraseOccurrences: 3",
      "repeatedPhraseLength: 8",
      "minParagraphs: 5",
      "maxParagraphLength: 500",
      ""
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(workspace, "chapters/0001/draft.md"),
    `${chapterProse}\n\n忽然，门外又响了一声。次日的媒体报道已经传遍县城。\n`,
    "utf8"
  );
  await advanceChapter(workspace, "drafted");
  const report = await runQualityCheck(workspace, "draft");
  assert.equal(report.ok, false);
  assert.match(report.blockingIssues.join("\n"), /Banned word/);
  assert.match(report.blockingIssues.join("\n"), /Period vocabulary violation/);
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/review.yaml",
    passingReviewYaml("0".repeat(64))
  );
  await assert.rejects(() => advanceChapter(workspace, "reviewed"), /quality gate/);
  assert.equal((await readState(workspace)).workflow.chapterStatus, "drafted");
});

test("chapter planning rejects a length contract outside market position", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "定位合同测试" });
  await enterProduction(workspace);
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/contract.yaml",
    contractYaml(1).replace("  min: 20", "  min: 10")
  );
  await compileChapterContext(workspace);
  await assert.rejects(() => advanceChapter(workspace, "planned"), /violates market position/);
  assert.equal((await readState(workspace)).workflow.chapterStatus, "not_started");
});

test("chapter planning blocks scope escalation and undeclared protagonist abilities", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "核心设定门禁测试" });
  await enterProduction(workspace);
  const contractPath = path.join(workspace, "chapters/0001/contract.yaml");

  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/contract.yaml",
    contractYaml(1).replace("scopeLevel: county", "scopeLevel: national")
  );
  await compileChapterContext(workspace);
  await assert.rejects(
    () => advanceChapter(workspace, "planned"),
    /scope national exceeds the approved ceiling county/
  );

  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/contract.yaml",
    contractYaml(1).replace("capabilityId: ledger-audit", "capabilityId: swordsmanship")
  );
  await compileChapterContext(workspace);
  await assert.rejects(
    () => advanceChapter(workspace, "planned"),
    /Undeclared capability swordsmanship/
  );

  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/contract.yaml",
    contractYaml(1).replace("antagonistLayer: 1", "antagonistLayer: 2")
  );
  await compileChapterContext(workspace);
  await assert.rejects(
    () => advanceChapter(workspace, "planned"),
    /Antagonist layer 2 exceeds the approved ceiling 1/
  );
  assert.equal((await readState(workspace)).workflow.chapterStatus, "not_started");
  assert.ok(await pathExists(contractPath));
});

test("blocks dead characters onstage and permits explicitly non-present appearances", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "角色生死门禁测试" });
  await enterProduction(workspace);
  await writeAcceptedArtifact(
    workspace,
    "continuity/characters.yaml",
    [
      "schemaVersion: 1",
      "entries:",
      "  - id: char-lin-yan",
      "    status: active",
      "    value:",
      "      name: 林砚",
      "      lifeStatus: dead",
      "      currentLocation: 临河县义仓遗址",
      "      currentGoal: 已无现场行动目标",
      "      knowledgeIds: []",
      "      hiddenKnowledgeIds: []",
      "      condition:",
      "        - 已确认死亡",
      "    sourceChapter: 0",
      "    evidence: 已接受的角色背景明确确认开篇前死亡",
      `    updatedAt: ${new Date().toISOString()}`
    ].join("\n")
  );
  const cards = await getContinuityCards(workspace);
  assert.equal(cards.characters[0]?.value.lifeStatus, "dead");
  const contractPath = path.join(workspace, "chapters/0001/contract.yaml");
  const deadOnstage = contractYaml(1);
  await writeAcceptedArtifact(workspace, "chapters/0001/contract.yaml", deadOnstage);
  await assert.rejects(
    () => compileChapterContext(workspace),
    /Dead characters cannot be present/
  );

  await fs.writeFile(
    contractPath,
    deadOnstage.replace(
      "locations:",
      "nonPresentParticipants:\n  - 林砚\nlocations:"
    ),
    "utf8"
  );
  const context = await compileChapterContext(workspace);
  assert.match(await fs.readFile(context.output, "utf8"), /char-lin-yan/);
});

test("context redacts protected evidence meaning before its reveal chapter", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "证据防剧透测试" });
  await enterProduction(workspace);
  await writeAcceptedArtifact(
    workspace,
    "continuity/evidence.yaml",
    [
      "schemaVersion: 1",
      "entries:",
      "  - id: evidence-protected",
      "    status: active",
      "    value:",
      "      kind: foreshadowing",
      "      status: observed",
      "      summary: 受保护的真相是旧盐引号仍在流通",
      "      supportsClaimIds: [claim-secret]",
      "      contradictsClaimIds: []",
      "      sourceIds: [chapter-zero]",
      "      verificationMethod: 对照注销簿",
      "      limitations: [尚未完成三方核验]",
      "      expectedRevealChapter: 5",
      "      revealedChapter: null",
      "    sourceChapter: 0",
      "    evidence: 已接受的基础伏笔",
      `    updatedAt: ${new Date().toISOString()}`
    ].join("\n")
  );
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/contract.yaml",
    contractYaml(1).replace(
      "evidenceMoves: []",
      [
        "evidenceMoves:",
        "  - evidenceId: evidence-protected",
        "    action: test",
        "    claimId: claim-secret",
        "    expectedResult: 只检查伏笔物证是否仍存在，不解释其含义"
      ].join("\n")
    )
  );
  await rebuildRetrievalIndex(workspace);
  const context = await compileChapterContext(workspace);
  const content = await fs.readFile(context.output, "utf8");
  assert.match(content, /protectedMeaning/);
  assert.doesNotMatch(content, /旧盐引号仍在流通/);
  assert.doesNotMatch(content, /对照注销簿/);
});

test("rejects a normal continuity delta that revives a dead character", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "禁止复活事务测试" });
  await writeAcceptedArtifact(
    workspace,
    "continuity/characters.yaml",
    [
      "schemaVersion: 1",
      "entries:",
      "  - id: char-dead-witness",
      "    status: active",
      "    value:",
      "      name: 已故证人",
      "      lifeStatus: dead",
      "      currentLocation: 城郊墓园",
      "      currentGoal: 无现场行动目标",
      "      knowledgeIds: []",
      "      hiddenKnowledgeIds: []",
      "      condition: [开篇前已确认死亡]",
      "    sourceChapter: 0",
      "    evidence: 已接受的角色背景确认死亡",
      `    updatedAt: ${new Date().toISOString()}`
    ].join("\n")
  );
  await writeAcceptedArtifact(workspace, "chapters/0001/final.md", "# 第一节\n证人只在旧录音中出现。");
  const finalFingerprint = await fingerprintFile(path.join(workspace, "chapters/0001/final.md"));
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/delta.yaml",
    [
      "schemaVersion: 1",
      "chapter: 1",
      `sourceFingerprint: ${finalFingerprint}`,
      "changes:",
      "  - domain: characters",
      "    operation: upsert",
      "    id: char-dead-witness",
      "    value:",
      "      name: 已故证人",
      "      lifeStatus: alive",
      "      currentLocation: 调查现场",
      "      currentGoal: 当面指认证人",
      "      knowledgeIds: []",
      "      hiddenKnowledgeIds: []",
      "      condition: [无解释恢复]",
      "    evidence: 无法支持的现场出现"
    ].join("\n")
  );
  const before = await readState(workspace);
  const after = structuredClone(before);
  after.continuity.lastCommittedChapter = 1;
  await assert.rejects(
    () => commitContinuityDelta(workspace, before, after),
    /Dead character cannot return to alive/
  );
  const cards = await getContinuityCards(workspace);
  assert.equal(cards.characters[0]?.value.lifeStatus, "dead");
});

test("recovers an interrupted continuity transaction from its before snapshot", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "恢复测试" });

  const runId = "continuity-recovery-test";
  const runRoot = path.join(workspace, "runtime/runs", runId);
  const beforeRoot = path.join(runRoot, "continuity.before");
  await fs.mkdir(beforeRoot, { recursive: true });
  for (const file of [
    "facts.yaml",
    "timeline.yaml",
    "threads.yaml",
    "resources.yaml",
    "relationships.yaml",
    "characters.yaml",
    "story-cards.yaml"
  ]) {
    await fs.copyFile(path.join(workspace, "continuity", file), path.join(beforeRoot, file));
  }
  await fs.copyFile(path.join(workspace, "novel-state.yaml"), path.join(runRoot, "state.before.yaml"));
  await fs.writeFile(
    path.join(workspace, "continuity/facts.yaml"),
    "schemaVersion: 1\nentries:\n  - id: partial-write\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(workspace, "runtime/pending-continuity.yaml"),
    [
      "schemaVersion: 1",
      `runId: ${runId}`,
      "chapter: 1",
      `createdAt: ${new Date().toISOString()}`,
      ""
    ].join("\n"),
    "utf8"
  );

  await recoverContinuityTransaction(workspace);
  const facts = parse(await fs.readFile(path.join(workspace, "continuity/facts.yaml"), "utf8"));
  assert.deepEqual(facts.entries, []);
  await assert.rejects(
    () => fs.stat(path.join(workspace, "runtime/pending-continuity.yaml")),
    /ENOENT/
  );
});

test("continuity commit records scheduled reveals in the same recoverable transaction", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "揭秘事务测试" });
  await writeAcceptedArtifact(
    workspace,
    "planning/reveal-policy.yaml",
    revealPolicyYaml()
      .replace("earliestChapter: 3", "earliestChapter: 1")
      .replace("targetChapter: 5", "targetChapter: 1")
  );
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/contract.yaml",
    contractYaml(1).replace("revealIds: []", "revealIds:\n  - reveal-ledger-owner")
  );
  await writeAcceptedArtifact(workspace, "chapters/0001/final.md", chapterProse);
  const finalFingerprint = await fingerprintFile(path.join(workspace, "chapters/0001/final.md"));
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/delta.yaml",
    [
      "schemaVersion: 1",
      "chapter: 1",
      `sourceFingerprint: ${finalFingerprint}`,
      "changes:",
      "  - domain: facts",
      "    operation: upsert",
      "    id: fact-reveal-test",
      "    value:",
      "      statement: 账册责任人的身份已经在正文中按计划揭示",
      "    evidence: 第一章终稿"
    ].join("\n")
  );
  const before = await readState(workspace);
  const after = structuredClone(before);
  after.continuity.lastCommittedChapter = 1;
  after.workflow.chapterStatus = "continuity_committed";
  await commitContinuityDelta(workspace, before, after);

  const policy = parse(
    await fs.readFile(path.join(workspace, "planning/reveal-policy.yaml"), "utf8")
  );
  assert.equal(policy.reveals[0].status, "revealed");
  assert.equal(policy.reveals[0].revealedChapter, 1);
  const runs = await fs.readdir(path.join(workspace, "runtime/runs"));
  const run = runs.find((name) => name.startsWith("continuity-"));
  assert.ok(run);
  assert.ok(
    await pathExists(path.join(workspace, "runtime/runs", run, "reveal-policy.before.yaml"))
  );
});

test("opening milestone separates mechanical readiness from commercial review", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "开篇评估测试" });
  await enterProduction(workspace);

  for (let chapter = 1; chapter <= 3; chapter++) {
    await commitTestChapter(workspace, chapter);
    if (chapter < 3) await startNextChapter(workspace);
  }

  const generated = await generateOpeningMilestone(workspace);
  assert.equal(generated.report.ok, true);
  assert.equal(generated.reviewStatus, "missing");
  assert.equal(generated.report.chapters.length, 3);

  const dimension = {
    score: 4,
    evidence: ["三章合同、终稿和连续性记录提供了具体证据。"],
    nextAction: "用真实目标读者进行小样测试。"
  };
  const review = {
    schemaVersion: 1,
    milestone: "opening-three",
    bundleFingerprint: generated.report.bundleFingerprint,
    verdict: "pass",
    dimensions: {
      audienceFit: dimension,
      openingHook: dimension,
      protagonistAgency: dimension,
      payoffDensity: dimension,
      escalation: dimension,
      emotionalInvestment: dimension,
      proseDistinctiveness: dimension,
      continuationIntent: dimension
    },
    blockingIssues: [],
    marketTest: {
      hypothesis: "目标读者在第三章结束后愿意继续阅读。",
      targetReader: "偏好历史悬疑与小人物升级的中文男频读者。",
      successSignal: "多数测试读者明确选择继续下一章。"
    }
  };
  await fs.writeFile(
    path.join(workspace, "reports/opening-three/review.yaml"),
    JSON.stringify(review, null, 2),
    "utf8"
  );
  const validated = await validateCommercialMilestoneReview(
    workspace,
    generated.report.bundleFingerprint
  );
  assert.equal(validated.verdict, "pass");
  await fs.appendFile(path.join(workspace, "author-intent.md"), "\nA changed creative constraint.\n");
  const regenerated = await generateOpeningMilestone(workspace);
  assert.equal(regenerated.reviewStatus, "stale-or-invalid");
});

test("chapter transitions require artifacts and only commit accepted continuity", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "章节测试" });
  await enterProduction(workspace);

  await writeAcceptedArtifact(workspace, "chapters/0001/contract.yaml", contractYaml(1));
  const context = await compileChapterContext(workspace);
  assert.equal(context.selectedEntries, 0);
  await fs.appendFile(path.join(workspace, "chapters/0001/contract.yaml"), "\n# changed after context\n");
  await assert.rejects(() => advanceChapter(workspace, "planned"), /context is stale/);
  assert.equal((await readState(workspace)).workflow.chapterStatus, "not_started");
  await compileChapterContext(workspace);
  await advanceChapter(workspace, "planned");

  await assert.rejects(() => advanceChapter(workspace, "drafted"), /draft\.md/);
  assert.equal((await readState(workspace)).workflow.chapterStatus, "planned");
  assert.equal((await readState(workspace)).continuity.lastCommittedChapter, 0);

  await fs.writeFile(path.join(workspace, "chapters/0001/draft.md"), `${chapterProse}\n`, "utf8");
  await advanceChapter(workspace, "drafted");
  assert.equal((await runQualityCheck(workspace, "draft")).ok, true);
  const draftFingerprint = await fingerprintFile(path.join(workspace, "chapters/0001/draft.md"));
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/review.yaml",
    passingReviewYaml(draftFingerprint)
  );
  await advanceChapter(workspace, "reviewed");
  await fs.writeFile(
    path.join(workspace, "chapters/0001/final.md"),
    `${chapterProse}\n\n这是一段未经审查的新终稿内容。\n`,
    "utf8"
  );
  assert.equal((await runQualityCheck(workspace, "final")).ok, true);
  await assert.rejects(() => advanceChapter(workspace, "accepted"), /differs from the reviewed draft/);
  assert.equal((await readState(workspace)).workflow.chapterStatus, "reviewed");
  await fs.writeFile(path.join(workspace, "chapters/0001/final.md"), `${chapterProse}\n`, "utf8");
  assert.equal((await runQualityCheck(workspace, "final")).ok, true);
  await advanceChapter(workspace, "accepted");
  assert.equal((await readState(workspace)).continuity.lastCommittedChapter, 0);

  const finalFingerprint = await fingerprintFile(path.join(workspace, "chapters/0001/final.md"));
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/handoff.yaml",
    handoffYaml(1, finalFingerprint)
  );
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/delta.yaml",
    [
      "schemaVersion: 1",
      "chapter: 1",
      `sourceFingerprint: "${"0".repeat(64)}"`,
      "changes:",
      "  - domain: facts",
      "    operation: upsert",
      "    id: fact-must-not-commit",
      "    value:",
      "      statement: 错误指纹不能进入连续性",
      "    evidence: 无效证据"
    ].join("\n")
  );
  await assert.rejects(
    () => advanceChapter(workspace, "continuity_committed"),
    /fingerprint does not match/
  );
  assert.equal((await readState(workspace)).continuity.lastCommittedChapter, 0);
  assert.equal(
    parse(await fs.readFile(path.join(workspace, "continuity/facts.yaml"), "utf8")).entries.length,
    0
  );

  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/delta.yaml",
    [
      "schemaVersion: 1",
      "chapter: 1",
      `sourceFingerprint: "${finalFingerprint}"`,
      "changes:",
      "  - domain: facts",
      "    operation: upsert",
      "    id: fact-ledger-swapped",
      "    value:",
      "      statement: 账册已被人调换",
      "    evidence: 第一章第四段"
    ].join("\n")
  );
  const committed = await advanceChapter(workspace, "continuity_committed");
  assert.equal(committed.continuity.lastCommittedChapter, 1);
  const facts = parse(await fs.readFile(path.join(workspace, "continuity/facts.yaml"), "utf8"));
  assert.equal(facts.entries[0].id, "fact-ledger-swapped");
  await fs.appendFile(path.join(workspace, "chapters/0001/final.md"), "\n未经提交的修改。\n");
  await assert.rejects(() => validateWorkspace(workspace), /Committed chapter integrity failed/);
  await fs.writeFile(path.join(workspace, "chapters/0001/final.md"), `${chapterProse}\n`, "utf8");
  await validateWorkspace(workspace);

  await assert.rejects(
    () => generateOpeningMilestone(workspace),
    /requires chapters 1-3/
  );

  const next = await startNextChapter(workspace);
  assert.equal(next.workflow.currentChapter, 2);
  assert.equal(next.workflow.chapterStatus, "not_started");
  assert.equal(next.continuity.lastCommittedChapter, 1);
  await writeAcceptedArtifact(workspace, "chapters/0002/contract.yaml", contractYaml(2));
  const nextContext = await compileChapterContext(workspace);
  assert.equal(nextContext.selectedEntries, 1);
  assert.match(await fs.readFile(nextContext.output, "utf8"), /fact-ledger-swapped/);

  const exported = await exportNovel(workspace, "md");
  assert.deepEqual(exported.chapters, [1]);
  assert.match(await fs.readFile(exported.output, "utf8"), /盐仓/);
});

test("context injects scene beats, selected character profiles, safe style examples, and handoff", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "上下文流水线测试" });
  await enterProduction(workspace);
  await commitTestChapter(workspace, 1);
  await startNextChapter(workspace);
  await writeAcceptedArtifact(
    workspace,
    "planning/style-examples.yaml",
    [
      "schemaVersion: 1",
      "examples:",
      "  - id: owned-investigation",
      "    title: 原创查证样例",
      "    sceneTypes: [investigation]",
      "    rights: user-owned",
      "    source: 测试作者原创",
      "    excerpt: 林砚没有先猜答案。他把三张重量记录按时辰排开，先圈出唯一无法由雨水解释的差额。",
      "    guidance: 先给可观察证据，再给角色结论"
    ].join("\n")
  );
  await rebuildRetrievalIndex(workspace);
  await writeAcceptedArtifact(workspace, "chapters/0002/contract.yaml", contractYaml(2));
  const compiled = await compileChapterContext(workspace, 20_000);
  const context = await fs.readFile(compiled.output, "utf8");
  assert.match(context, /## Scene Plan/);
  assert.match(context, /value shift:/);
  assert.match(context, /## Character Profiles/);
  assert.match(context, /短句为主，压力下省略主语/);
  assert.match(context, /## Authorized Style Examples/);
  assert.match(context, /原创查证样例/);
  assert.match(context, /## Accepted Opening Hook/);
  assert.match(context, /## Relevant Cross-Volume Arcs/);
  assert.match(context, /失踪账册主线/);
  assert.match(context, /## Previous Chapter Handoff/);
  assert.match(context, /确认账册被替换/);
});

test("review gate enforces explicit checks and a two-round repair budget", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "两轮审稿测试" });
  await enterProduction(workspace);
  await writeAcceptedArtifact(workspace, "chapters/0001/contract.yaml", contractYaml(1));
  await compileChapterContext(workspace);
  await advanceChapter(workspace, "planned");
  await fs.writeFile(path.join(workspace, "chapters/0001/draft.md"), `${chapterProse}\n`, "utf8");
  await advanceChapter(workspace, "drafted");
  await runQualityCheck(workspace, "draft");
  const fingerprint = await fingerprintFile(path.join(workspace, "chapters/0001/draft.md"));

  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/review.yaml",
    repairReviewYaml(fingerprint, 1)
  );
  await advanceChapter(workspace, "reviewed");
  await advanceChapter(workspace, "drafted");
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/review.yaml",
    repairReviewYaml(fingerprint, 2)
  );
  const second = await advanceChapter(workspace, "reviewed");
  assert.equal(second.workflow.reviewRound, 2);
  await assert.rejects(
    () => advanceChapter(workspace, "drafted"),
    /two-round repair budget is exhausted/
  );
});

test("continuity commit rejects a stale structured handoff", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "交接指纹测试" });
  await enterProduction(workspace);
  await writeAcceptedArtifact(workspace, "chapters/0001/contract.yaml", contractYaml(1));
  await compileChapterContext(workspace);
  await advanceChapter(workspace, "planned");
  await fs.writeFile(path.join(workspace, "chapters/0001/draft.md"), `${chapterProse}\n`, "utf8");
  await advanceChapter(workspace, "drafted");
  await runQualityCheck(workspace, "draft");
  const fingerprint = await fingerprintFile(path.join(workspace, "chapters/0001/draft.md"));
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/review.yaml",
    passingReviewYaml(fingerprint)
  );
  await advanceChapter(workspace, "reviewed");
  await fs.writeFile(path.join(workspace, "chapters/0001/final.md"), `${chapterProse}\n`, "utf8");
  await runQualityCheck(workspace, "final");
  await advanceChapter(workspace, "accepted");
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/delta.yaml",
    [
      "schemaVersion: 1",
      "chapter: 1",
      `sourceFingerprint: ${fingerprint}`,
      "changes: []"
    ].join("\n")
  );
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/handoff.yaml",
    handoffYaml(1, "0".repeat(64))
  );
  await assert.rejects(
    () => advanceChapter(workspace, "continuity_committed"),
    /handoff fingerprint does not match/
  );
  assert.equal((await readState(workspace)).continuity.lastCommittedChapter, 0);
});

test("retrieval index returns current sources and drops stale candidates", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "检索索引测试" });
  await enterProduction(workspace);
  await commitTestChapter(workspace, 1);
  const rebuilt = await rebuildRetrievalIndex(workspace);
  assert.ok(rebuilt.documents > 0);
  const current = await queryRetrievalIndex(workspace, ["账册"], 20);
  assert.ok(current.some((candidate) => candidate.id === "handoff:1"));
  await fs.appendFile(
    path.join(workspace, "chapters/0001/handoff.yaml"),
    "\n# stale after indexing\n"
  );
  const staleFiltered = await queryRetrievalIndex(workspace, ["账册"], 20);
  assert.equal(staleFiltered.some((candidate) => candidate.id === "handoff:1"), false);
});

test("checkpoints and milestone rules separate long serials from completed shorts", async (t) => {
  const longFixture = await temporaryWorkspace();
  t.after(() => fs.rm(longFixture.parent, { recursive: true, force: true }));
  await initializeWorkspace(longFixture.workspace, { title: "卷级检查测试" });
  await enterProduction(longFixture.workspace);
  const longState = await readState(longFixture.workspace);
  longState.continuity.checkpointInterval = 1;
  await writeState(longFixture.workspace, longState);
  await commitTestChapter(longFixture.workspace, 1);
  await fs.stat(
    path.join(longFixture.workspace, "continuity/checkpoints/chapter-1.yaml")
  );
  const volume = await generateStoryMilestone(longFixture.workspace, "volume");
  assert.equal(volume.report.ok, true);
  assert.equal(volume.report.workForm, "long-serial");
  assert.ok(volume.checkpointPath);
  await assert.rejects(
    () => generateStoryMilestone(longFixture.workspace, "short-complete"),
    /only valid for short-complete/
  );

  const shortFixture = await temporaryWorkspace();
  t.after(() => fs.rm(shortFixture.parent, { recursive: true, force: true }));
  await initializeWorkspace(shortFixture.workspace, { title: "短篇验收测试" });
  await enterShortProduction(shortFixture.workspace);
  await commitTestChapter(shortFixture.workspace, 1);
  const short = await generateStoryMilestone(shortFixture.workspace, "short-complete");
  assert.equal(short.report.ok, true);
  assert.equal(short.report.workForm, "short-complete");
  assert.equal(short.report.chapters.length, 1);
  await assert.rejects(
    () => generateStoryMilestone(shortFixture.workspace, "volume"),
    /only valid for long-serial/
  );
  const manual = await generateCheckpoint(shortFixture.workspace, "short-complete-final");
  assert.equal(manual.checkpoint.lastCommittedChapter, 1);
});

test("hook experiments are required and preserve rejected alternatives", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "钩子实验测试" });
  await writeAcceptedArtifact(workspace, "planning/market-position.yaml", marketPositionYaml());
  await writeTopicDiscovery(workspace);
  const experiments = await validateHookExperiments(workspace);
  assert.equal(experiments.candidates.length, 2);
  assert.equal(experiments.selectedHookId, "hook-a");
  assert.deepEqual(experiments.rejected.map((candidate) => candidate.id), ["hook-b"]);
  await fs.writeFile(
    path.join(workspace, "discovery/hook-experiments.yaml"),
    hookExperimentsYaml().replace("rejected:\n  - id: hook-b", "rejected:\n  - id: hook-a"),
    "utf8"
  );
  await assert.rejects(() => validateHookExperiments(workspace), /Selected hook cannot also be rejected/);
});

test("cross-volume arc grid reports idle active arcs", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "跨卷网格测试" });
  await enterProduction(workspace);
  const state = await readState(workspace);
  state.workflow.currentChapter = 13;
  state.workflow.chapterStatus = "not_started";
  state.continuity.lastCommittedChapter = 12;
  await writeState(workspace, state);
  const { report } = await inspectArcGrid(workspace);
  assert.equal(report.totalArcs, 1);
  assert.equal(report.idleArcs.length, 1);
  assert.ok(report.warnings.some((warning) => /连续 12 章未推进/.test(warning)));
});

test("latest unpublished committed chapter can reopen without rolling back current planning", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "章节安全返修测试" });
  await enterProduction(workspace);
  await commitTestChapter(workspace, 1);

  const volumePath = path.join(workspace, "planning/volumes/current-volume.md");
  const volumeBefore = await fs.readFile(volumePath, "utf8");
  const finalBefore = await fs.readFile(path.join(workspace, "chapters/0001/final.md"), "utf8");
  await updatePublishedThrough(workspace, 1);
  await assert.rejects(
    () => reopenLatestCommittedChapter(workspace, "不应允许返修"),
    /already marked published/
  );
  await updatePublishedThrough(workspace, 0);
  await fs.writeFile(
    path.join(workspace, "planning/logic-debts.yaml"),
    [
      "schemaVersion: 1",
      "debts:",
      "  - id: preserve-review-obligation",
      "    category: causality",
      "    summary: 提交后审稿新增的后续解释义务",
      "    createdAfterChapter: 1",
      "    dueChapter: 2",
      "    acceptanceCriteria:",
      "      - 第二章必须给出正文证据",
      "    status: open",
      "    resolvedChapter: null",
      "    resolutionEvidence: null"
    ].join("\n"),
    "utf8"
  );

  const reopened = await reopenLatestCommittedChapter(workspace, "第一章句子精修", 1);
  assert.equal(reopened.state.workflow.chapterStatus, "not_started");
  assert.equal(reopened.state.workflow.reviewRound, 0);
  assert.equal(reopened.state.continuity.lastCommittedChapter, 0);
  assert.equal(await fs.readFile(reopened.draft, "utf8"), finalBefore);
  assert.equal(await fs.readFile(volumePath, "utf8"), volumeBefore);
  assert.equal(await pathExists(path.join(workspace, "chapters/0001/final.md")), false);
  assert.equal(await pathExists(path.join(workspace, "chapters/0001/review.yaml")), false);
  assert.equal(await pathExists(path.join(workspace, "chapters/0001/delta.yaml")), false);
  const facts = parse(
    await fs.readFile(path.join(workspace, "continuity/facts.yaml"), "utf8")
  ) as { entries: Array<{ id: string }> };
  assert.equal(facts.entries.some((entry) => entry.id === "fact-chapter-1"), false);
  assert.equal((await readLogicDebtLedger(workspace)).debts[0]?.id, "preserve-review-obligation");
  assert.ok((await listRevisions(workspace)).some((revision) => revision.id === reopened.revisionId));
  await validateWorkspace(workspace);
});

test("due logic debts require a contract plan, passing review evidence, and transactional resolution", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "逻辑债务门禁测试" });
  await enterProduction(workspace);
  await fs.writeFile(
    path.join(workspace, "planning/logic-debts.yaml"),
    [
      "schemaVersion: 1",
      "debts:",
      "  - id: explain-prior-identity-checks",
      "    category: causality",
      "    summary: 解释旧身份为何此前未在日常业务中暴露",
      "    createdAfterChapter: 0",
      "    dueChapter: 1",
      "    acceptanceCriteria:",
      "      - 正文给出有限且可复核的触发机制",
      "    status: open",
      "    resolvedChapter: null",
      "    resolutionEvidence: null"
    ].join("\n"),
    "utf8"
  );
  await writeAcceptedArtifact(workspace, "chapters/0001/contract.yaml", contractYaml(1));
  await compileChapterContext(workspace);
  await assert.rejects(
    () => advanceChapter(workspace, "planned"),
    /must resolve due logic debts/
  );

  const contractWithDebt = contractYaml(1).replace(
    "schemaVersion: 3",
    [
      "schemaVersion: 3",
      "logicDebtResolutions:",
      "  - debtId: explain-prior-identity-checks",
      "    plannedResolution: 用当前身份核验与历史关系核验的范围差异解释"
    ].join("\n")
  );
  await writeAcceptedArtifact(workspace, "chapters/0001/contract.yaml", contractWithDebt);
  await compileChapterContext(workspace);
  await advanceChapter(workspace, "planned");
  await fs.writeFile(path.join(workspace, "chapters/0001/draft.md"), `${chapterProse}\n`, "utf8");
  await advanceChapter(workspace, "drafted");
  await runQualityCheck(workspace, "draft");
  const fingerprint = await fingerprintFile(path.join(workspace, "chapters/0001/draft.md"));
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/review.yaml",
    passingReviewYaml(fingerprint)
  );
  await assert.rejects(
    () => advanceChapter(workspace, "reviewed"),
    /Review must check planned logic debt resolutions/
  );

  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/review.yaml",
    [
      passingReviewYaml(fingerprint),
      "debtChecks:",
      "  - debtId: explain-prior-identity-checks",
      "    status: pass",
      "    evidence: 第一章明确区分当前有效身份核验与历史关系核验"
    ].join("\n")
  );
  await advanceChapter(workspace, "reviewed");
  await fs.writeFile(path.join(workspace, "chapters/0001/final.md"), `${chapterProse}\n`, "utf8");
  await runQualityCheck(workspace, "final");
  await advanceChapter(workspace, "accepted");
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/delta.yaml",
    [
      "schemaVersion: 1",
      "chapter: 1",
      `sourceFingerprint: ${fingerprint}`,
      "changes:",
      "  - domain: facts",
      "    operation: upsert",
      "    id: fact-chapter-1",
      "    value:",
      "      statement: 第一章已经形成可验证变化",
      "    evidence: 第一章终稿"
    ].join("\n")
  );
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/handoff.yaml",
    handoffYaml(1, fingerprint)
  );
  await advanceChapter(workspace, "continuity_committed");
  const debt = (await readLogicDebtLedger(workspace)).debts[0]!;
  assert.equal(debt.status, "resolved");
  assert.equal(debt.resolvedChapter, 1);
  assert.match(debt.resolutionEvidence ?? "", /历史关系核验/);
  await validateWorkspace(workspace);

  const committedLedger = await readLogicDebtLedger(workspace);
  await writeLogicDebtLedger(workspace, {
    schemaVersion: 1,
    debts: [
      ...committedLedger.debts,
      {
        id: "later-review-obligation",
        category: "evidence",
        summary: "提交后新增的后续证据义务",
        createdAfterChapter: 1,
        dueChapter: 2,
        acceptanceCriteria: ["第二章提供独立证据"],
        status: "open",
        resolvedChapter: null,
        resolutionEvidence: null
      }
    ]
  });
  await reopenLatestCommittedChapter(workspace, "回退已兑现债务并保留后续义务");
  const reopenedDebts = await readLogicDebtLedger(workspace);
  assert.equal(reopenedDebts.debts.find((item) => item.id === debt.id)?.status, "open");
  assert.equal(
    reopenedDebts.debts.find((item) => item.id === "later-review-obligation")?.status,
    "open"
  );
  await validateWorkspace(workspace);
});

test("external web review packages bind advisory feedback to committed prose", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "外部二审测试" });
  await enterProduction(workspace);
  await commitTestChapter(workspace, 1);
  await fs.writeFile(
    path.join(workspace, "planning/external-review-policy.yaml"),
    [
      "schemaVersion: 1",
      "enabled: true",
      "provider: chatgpt-web",
      "requiredBeforeNextChapter: true"
    ].join("\n"),
    "utf8"
  );
  await assert.rejects(
    () => startNextChapter(workspace),
    /requires a ChatGPT web review/
  );

  const prepared = await prepareExternalReview(workspace, 1);
  assert.equal(prepared.chapter, 1);
  assert.equal(prepared.alreadyPrepared, false);
  const request = await fs.readFile(prepared.requestPath, "utf8");
  assert.match(request, /严厉、具体、克制的中文商业小说编辑/);
  assert.match(request, /连续性／逻辑债务候选/);
  assert.match(request, /账册/);

  const repeated = await prepareExternalReview(workspace, 1);
  assert.equal(repeated.alreadyPrepared, true);
  assert.equal(repeated.requestPath, prepared.requestPath);
  await assert.rejects(
    () => startNextChapter(workspace),
    /has not received a current ChatGPT web review/
  );

  const responseSource = path.join(parent, "chatgpt-response.md");
  await fs.writeFile(
    responseSource,
    [
      "# 总体评价",
      "",
      "本节因果链完整，可以进入下一节。",
      "",
      "## 必须修复",
      "",
      "无。",
      "",
      "## 连续性／逻辑债务候选",
      "",
      "下一节需要兑现账册来源。"
    ].join("\n"),
    "utf8"
  );
  const recorded = await recordExternalReview(workspace, responseSource, 1);
  const manifest = parse(await fs.readFile(recorded.manifestPath, "utf8")) as {
    authority: string;
    response: { status: string; responseFingerprint: string };
  };
  assert.equal(manifest.authority, "advisory-only");
  assert.equal(manifest.response.status, "received");
  assert.equal(manifest.response.responseFingerprint, recorded.responseFingerprint);
  assert.match(await fs.readFile(recorded.responsePath, "utf8"), /下一节需要兑现账册来源/);
  assert.equal((await readLogicDebtLedger(workspace)).debts.length, 0);
  await validateWorkspace(workspace);
  assert.equal((await startNextChapter(workspace)).workflow.currentChapter, 2);
});

test("named revisions restore authoritative files and keep a safety snapshot", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "修订历史测试" });
  const intentPath = path.join(workspace, "author-intent.md");
  await fs.writeFile(intentPath, "# Author Intent\n\n第一版方向。\n", "utf8");
  const first = await createRevision(workspace, "第一版方向");
  await fs.writeFile(intentPath, "# Author Intent\n\n第二版方向。\n", "utf8");
  const temporaryPlan = path.join(workspace, "planning", "temporary-note.md");
  await fs.writeFile(temporaryPlan, "# Temporary\n\n只属于第二版。\n", "utf8");
  const second = await createRevision(workspace, "第二版方向");
  assert.ok(second.diffSummary.changed.includes("author-intent.md"));
  assert.ok(second.diffSummary.added.includes("planning/temporary-note.md"));
  const restored = await restoreRevision(workspace, first.id);
  assert.match(await fs.readFile(intentPath, "utf8"), /第一版方向/);
  assert.equal(await pathExists(temporaryPlan), false);
  assert.equal(restored.restored.id, first.id);
  const revisions = await listRevisions(workspace);
  assert.equal(revisions.length, 3);
  assert.match(revisions.at(-1)?.name ?? "", /恢复前自动备份/);
});

test("serial cadence and local metrics remain author-controlled", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "连载数据测试" });
  await enterProduction(workspace);
  await commitTestChapter(workspace, 1);
  const cadence = await inspectCadence(workspace);
  assert.equal(cadence.readyInventory, 1);
  assert.equal(cadence.health, "red");
  const published = await updatePublishedThrough(workspace, 1);
  assert.equal(published.readyInventory, 0);

  const metricsCsv = path.join(parent, "metrics.csv");
  await fs.writeFile(
    metricsCsv,
    [
      "chapter,observedAt,impressions,readers,completionRate,continuationRate,follows,comments",
      "1,2026-07-27,1000,600,0.7,0.55,40,12"
    ].join("\n"),
    "utf8"
  );
  const imported = await importPublicationMetrics(workspace, metricsCsv);
  assert.equal(imported.imported, 1);
  const learning = await generateLearningReport(workspace);
  assert.equal(learning.report.conclusionStatus, "needs-author-review");
  assert.equal((learning.report.averages as { continuationRate: number }).continuationRate, 0.55);
});

test("manuscript import is quarantined and committed prose exports to DOCX and EPUB", async (t) => {
  const importFixture = await temporaryWorkspace();
  t.after(() => fs.rm(importFixture.parent, { recursive: true, force: true }));
  const source = path.join(importFixture.parent, "old.md");
  await fs.writeFile(
    source,
    "# 第一章 雨夜\n\n这是第一章正文。\n\n# 第二章 来信\n\n这是第二章正文。\n",
    "utf8"
  );
  const imported = await importManuscript(importFixture.workspace, source, "旧稿导入");
  assert.equal(imported.chapters, 2);
  assert.equal((await readState(importFixture.workspace)).workflow.phase, "preview");
  assert.equal(
    await pathExists(path.join(importFixture.workspace, "chapters/0001/final.md")),
    false
  );

  const exportFixture = await temporaryWorkspace();
  t.after(() => fs.rm(exportFixture.parent, { recursive: true, force: true }));
  await initializeWorkspace(exportFixture.workspace, { title: "多格式导出" });
  await enterProduction(exportFixture.workspace);
  await commitTestChapter(exportFixture.workspace, 1);
  const docx = await exportDocument(exportFixture.workspace, "docx");
  const epub = await exportDocument(exportFixture.workspace, "epub");
  assert.ok((await fs.stat(docx.output)).size > 100);
  assert.ok((await fs.stat(epub.output)).size > 100);
  const docxZip = await JSZip.loadAsync(await fs.readFile(docx.output));
  assert.ok(docxZip.file("word/document.xml"));
  const epubZip = await JSZip.loadAsync(await fs.readFile(epub.output));
  assert.equal(await epubZip.file("mimetype")?.async("string"), "application/epub+zip");
  assert.ok(epubZip.file("OEBPS/content.opf"));
});

test("doctor and guide provide a safe next action", async (t) => {
  const { parent, workspace } = await temporaryWorkspace();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await initializeWorkspace(workspace, { title: "引导测试" });
  const doctor = await runDoctor(workspace);
  assert.equal(doctor.ok, true);
  const guide = await guideWorkspace(workspace);
  assert.equal(guide.nextAction, "完成选题与开篇钩子实验");
  assert.match(guide.prompt, /不要直接写正文/);
  assert.match(
    friendlyError(JSON.stringify([{ path: ["candidates", 0, "title"], message: "Too small" }])),
    /candidates.0.title/
  );
});
