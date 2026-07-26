import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { compileChapterContext } from "../src/context.js";
import {
  commitContinuityDelta,
  getContinuityCards,
  recoverContinuityTransaction
} from "../src/continuity.js";
import { fingerprintFile, readState } from "../src/io.js";
import {
  generateOpeningMilestone,
  validateCommercialMilestoneReview
} from "../src/milestone.js";
import { generateTopicSelectionReport } from "../src/topics.js";
import { runQualityCheck } from "../src/quality.js";
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
  await transitionPhase(workspace, "foundation_approved");
  await writeAcceptedArtifact(
    workspace,
    "planning/volumes/current-volume.md",
    "# Current Volume\nPromise, escalation, midpoint, and payoff."
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
  await generateTopicSelectionReport(workspace, today);
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

function contractYaml(chapter: number): string {
  return [
    "schemaVersion: 1",
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
    [
      "schemaVersion: 1",
      `sourceFingerprint: ${draftFingerprint}`,
      "verdict: pass",
      "blockingIssues: []",
      "warnings: []"
    ].join("\n")
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
    `${chapterProse}\n\n忽然，门外又响了一声。\n`,
    "utf8"
  );
  await advanceChapter(workspace, "drafted");
  const report = await runQualityCheck(workspace, "draft");
  assert.equal(report.ok, false);
  assert.match(report.blockingIssues.join("\n"), /Banned word/);
  await writeAcceptedArtifact(
    workspace,
    "chapters/0001/review.yaml",
    `schemaVersion: 1\nsourceFingerprint: ${"0".repeat(64)}\nverdict: pass\nblockingIssues: []\nwarnings: []`
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
      "  - id: char-han-jiu",
      "    status: active",
      "    value:",
      "      name: 韩九",
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
  const deadOnstage = contractYaml(1).replace("  - 林砚", "  - 韩九");
  await writeAcceptedArtifact(workspace, "chapters/0001/contract.yaml", deadOnstage);
  await assert.rejects(
    () => compileChapterContext(workspace),
    /Dead characters cannot be present/
  );

  await fs.writeFile(
    contractPath,
    deadOnstage.replace(
      "locations:",
      "nonPresentParticipants:\n  - 韩九\nlocations:"
    ),
    "utf8"
  );
  const context = await compileChapterContext(workspace);
  assert.match(await fs.readFile(context.output, "utf8"), /char-han-jiu/);
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
    `schemaVersion: 1\nsourceFingerprint: ${draftFingerprint}\nverdict: pass\nblockingIssues: []\nwarnings: []`
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
