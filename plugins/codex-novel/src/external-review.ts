import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse, stringify } from "yaml";
import { z } from "zod";
import {
  appendEvent,
  atomicWriteText,
  fingerprintFile,
  pathExists,
  readState,
  sha256Text
} from "./io.js";

const externalReviewManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    chapter: z.number().int().positive(),
    provider: z.literal("chatgpt-web"),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    preparedAt: z.string().datetime(),
    requestPath: z.string().min(1),
    authority: z.literal("advisory-only"),
    response: z
      .object({
        status: z.enum(["pending", "received"]),
        recordedAt: z.string().datetime().nullable(),
        responsePath: z.string().min(1).nullable(),
        responseFingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable()
      })
      .strict()
  })
  .strict();

const externalReviewPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    enabled: z.boolean(),
    provider: z.literal("chatgpt-web"),
    requiredBeforeNextChapter: z.boolean()
  })
  .strict()
  .superRefine((policy, context) => {
    if (!policy.enabled && policy.requiredBeforeNextChapter) {
      context.addIssue({
        code: "custom",
        path: ["requiredBeforeNextChapter"],
        message: "Disabled external review cannot be required before the next chapter."
      });
    }
  });

export type ExternalReviewManifest = z.infer<typeof externalReviewManifestSchema>;
export type ExternalReviewPolicy = z.infer<typeof externalReviewPolicySchema>;

export const EXTERNAL_REVIEW_POLICY_FILE = "planning/external-review-policy.yaml";

function now(): string {
  return new Date().toISOString();
}

function chapterDirectory(chapter: number): string {
  return String(chapter).padStart(4, "0");
}

function reviewDirectory(
  workspace: string,
  chapter: number,
  sourceFingerprint: string
): string {
  return path.join(
    workspace,
    "reports",
    "external-reviews",
    `chapter-${chapterDirectory(chapter)}-${sourceFingerprint.slice(0, 12)}`
  );
}

async function resolveCommittedChapter(
  workspace: string,
  requestedChapter?: number
): Promise<{
  chapter: number;
  finalPath: string;
  prose: string;
  sourceFingerprint: string;
}> {
  const state = await readState(workspace);
  const chapter = requestedChapter ?? state.continuity.lastCommittedChapter;
  if (!Number.isInteger(chapter) || chapter < 1) {
    throw new Error("External review requires a positive committed chapter number.");
  }
  if (chapter > state.continuity.lastCommittedChapter) {
    throw new Error(
      `Chapter ${chapter} is not continuity-committed. Latest committed chapter is ` +
      `${state.continuity.lastCommittedChapter}.`
    );
  }
  const finalPath = path.join(
    workspace,
    "chapters",
    chapterDirectory(chapter),
    "final.md"
  );
  if (!(await pathExists(finalPath))) {
    throw new Error(`Committed chapter ${chapter} is missing final.md.`);
  }
  return {
    chapter,
    finalPath,
    prose: await fs.readFile(finalPath, "utf8"),
    sourceFingerprint: await fingerprintFile(finalPath)
  };
}

function reviewRequest(
  title: string,
  audienceChannel: string,
  publicationFormat: string,
  chapter: number,
  prose: string
): string {
  return [
    "你是一名严厉、具体、克制的中文商业小说编辑。请审查下面这一节成稿。",
    "",
    `作品：${title}`,
    `目标渠道：${audienceChannel}`,
    `成稿形态：${publicationFormat}`,
    `章节：第 ${chapter} 节`,
    "",
    "审查规则：",
    "1. 只根据所给正文判断，不补造前文、后文或作者意图。",
    "2. 优先检查核心设定是否被稀释、因果与证据链、人物能力边界、配角独立性、时代或行政逻辑、场景厚度、节奏和语言。",
    "3. 区分“必须修复”“建议优化”“可以保留”，每条问题引用具体句子或场景。",
    "4. 指出可能需要在后续章节解释或兑现的事项，并给出建议最晚兑现位置；不要把猜测写成事实。",
    "5. 不要重写全文，只给可执行的局部修改建议。",
    "",
    "请按以下结构回答：",
    "- 总体评价与完成度（100 分制）",
    "- 必须修复",
    "- 建议优化",
    "- 可以保留",
    "- 连续性／逻辑债务候选",
    "- 是否建议进入下一节",
    "",
    "--- 正文开始 ---",
    prose.trim(),
    "--- 正文结束 ---",
    ""
  ].join("\n");
}

export async function readExternalReviewPolicy(
  workspace: string
): Promise<ExternalReviewPolicy> {
  const target = path.join(workspace, EXTERNAL_REVIEW_POLICY_FILE);
  if (!(await pathExists(target))) {
    return {
      schemaVersion: 1,
      enabled: false,
      provider: "chatgpt-web",
      requiredBeforeNextChapter: false
    };
  }
  return externalReviewPolicySchema.parse(parse(await fs.readFile(target, "utf8")));
}

export async function prepareExternalReview(
  workspace: string,
  requestedChapter?: number
): Promise<{
  chapter: number;
  sourceFingerprint: string;
  requestPath: string;
  manifestPath: string;
  alreadyPrepared: boolean;
}> {
  const state = await readState(workspace);
  const source = await resolveCommittedChapter(workspace, requestedChapter);
  const directory = reviewDirectory(
    workspace,
    source.chapter,
    source.sourceFingerprint
  );
  const requestPath = path.join(directory, "request.md");
  const manifestPath = path.join(directory, "manifest.yaml");
  if (await pathExists(manifestPath)) {
    const manifest = externalReviewManifestSchema.parse(
      parse(await fs.readFile(manifestPath, "utf8"))
    );
    if (manifest.sourceFingerprint !== source.sourceFingerprint) {
      throw new Error("External review manifest does not match the accepted chapter prose.");
    }
    return {
      chapter: source.chapter,
      sourceFingerprint: source.sourceFingerprint,
      requestPath,
      manifestPath,
      alreadyPrepared: true
    };
  }

  const request = reviewRequest(
    state.novel.title,
    state.novel.audienceChannel,
    state.novel.publicationFormat,
    source.chapter,
    source.prose
  );
  const relativeRequestPath = path.relative(workspace, requestPath);
  const manifest: ExternalReviewManifest = {
    schemaVersion: 1,
    chapter: source.chapter,
    provider: "chatgpt-web",
    sourceFingerprint: source.sourceFingerprint,
    preparedAt: now(),
    requestPath: relativeRequestPath,
    authority: "advisory-only",
    response: {
      status: "pending",
      recordedAt: null,
      responsePath: null,
      responseFingerprint: null
    }
  };
  await Promise.all([
    atomicWriteText(requestPath, request),
    atomicWriteText(
      manifestPath,
      stringify(externalReviewManifestSchema.parse(manifest), { lineWidth: 0 })
    )
  ]);
  await appendEvent(workspace, {
    at: manifest.preparedAt,
    action: "external_review_prepared",
    chapter: source.chapter,
    provider: manifest.provider,
    sourceFingerprint: source.sourceFingerprint
  });
  return {
    chapter: source.chapter,
    sourceFingerprint: source.sourceFingerprint,
    requestPath,
    manifestPath,
    alreadyPrepared: false
  };
}

export async function recordExternalReview(
  workspace: string,
  responseSource: string,
  requestedChapter?: number
): Promise<{
  chapter: number;
  responsePath: string;
  manifestPath: string;
  responseFingerprint: string;
}> {
  const source = await resolveCommittedChapter(workspace, requestedChapter);
  const directory = reviewDirectory(
    workspace,
    source.chapter,
    source.sourceFingerprint
  );
  const manifestPath = path.join(directory, "manifest.yaml");
  if (!(await pathExists(manifestPath))) {
    throw new Error("Prepare the external review request before recording its response.");
  }
  const manifest = externalReviewManifestSchema.parse(
    parse(await fs.readFile(manifestPath, "utf8"))
  );
  if (manifest.sourceFingerprint !== source.sourceFingerprint) {
    throw new Error("External review response is stale for the current accepted chapter prose.");
  }
  const response = (await fs.readFile(responseSource, "utf8")).trim();
  if (response.length < 20) {
    throw new Error("External review response is too short to record.");
  }
  const responsePath = path.join(directory, "response.md");
  const responseFingerprint = sha256Text(`${response}\n`);
  const recordedAt = now();
  const updated: ExternalReviewManifest = {
    ...manifest,
    response: {
      status: "received",
      recordedAt,
      responsePath: path.relative(workspace, responsePath),
      responseFingerprint
    }
  };
  await Promise.all([
    atomicWriteText(responsePath, `${response}\n`),
    atomicWriteText(
      manifestPath,
      stringify(externalReviewManifestSchema.parse(updated), { lineWidth: 0 })
    )
  ]);
  await appendEvent(workspace, {
    at: recordedAt,
    action: "external_review_recorded",
    chapter: source.chapter,
    provider: manifest.provider,
    sourceFingerprint: source.sourceFingerprint,
    responseFingerprint
  });
  return {
    chapter: source.chapter,
    responsePath,
    manifestPath,
    responseFingerprint
  };
}

export async function requireExternalReviewComplete(
  workspace: string,
  chapter: number
): Promise<void> {
  const policy = await readExternalReviewPolicy(workspace);
  if (!policy.enabled || !policy.requiredBeforeNextChapter) return;
  const source = await resolveCommittedChapter(workspace, chapter);
  const directory = reviewDirectory(
    workspace,
    source.chapter,
    source.sourceFingerprint
  );
  const manifestPath = path.join(directory, "manifest.yaml");
  if (!(await pathExists(manifestPath))) {
    throw new Error(
      `Chapter ${chapter} requires a ChatGPT web review before starting the next chapter. ` +
      "Run external-review first."
    );
  }
  const manifest = externalReviewManifestSchema.parse(
    parse(await fs.readFile(manifestPath, "utf8"))
  );
  if (
    manifest.sourceFingerprint !== source.sourceFingerprint ||
    manifest.response.status !== "received" ||
    !manifest.response.responsePath ||
    !manifest.response.responseFingerprint
  ) {
    throw new Error(
      `Chapter ${chapter} has not received a current ChatGPT web review response.`
    );
  }
  const responsePath = path.join(workspace, manifest.response.responsePath);
  if (
    !(await pathExists(responsePath)) ||
    await fingerprintFile(responsePath) !== manifest.response.responseFingerprint
  ) {
    throw new Error(`Chapter ${chapter} external review response is missing or stale.`);
  }
}
