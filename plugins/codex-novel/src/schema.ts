import * as path from "node:path";
import { z } from "zod";

export const bookPhaseSchema = z.enum([
  "preview",
  "brief_approved",
  "foundation_approved",
  "production",
  "completed"
]);

export const chapterStatusSchema = z.enum([
  "not_started",
  "planned",
  "drafted",
  "reviewed",
  "accepted",
  "continuity_committed"
]);

export const artifactStatusSchema = z.enum(["missing", "draft", "accepted", "stale"]);

export const artifactRecordSchema = z
  .object({
    status: artifactStatusSchema,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    acceptedAt: z.string().datetime().nullable()
  })
  .strict();

export const novelStateSchema = z
  .object({
    schemaVersion: z.literal(2),
    novel: z
      .object({
        id: z.string().min(1),
        title: z.string().min(1),
        language: z.string().min(1),
        audienceChannel: z.string().min(1),
        publicationFormat: z.string().min(1)
      })
      .strict(),
    workflow: z
      .object({
        phase: bookPhaseSchema,
        currentChapter: z.number().int().positive(),
        chapterStatus: chapterStatusSchema,
        delegatedThroughChapter: z.number().int().positive().nullable(),
        blockingReason: z.string().min(1).nullable(),
        updatedAt: z.string().datetime()
      })
      .strict(),
    artifacts: z
      .object({
        brief: artifactRecordSchema,
        foundation: artifactRecordSchema,
        currentVolumePlan: artifactRecordSchema
      })
      .strict(),
    continuity: z
      .object({
        lastCommittedChapter: z.number().int().nonnegative(),
        checkpointInterval: z.number().int().positive()
      })
      .strict()
  })
  .strict();

export const chapterContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    chapter: z.number().int().positive(),
    title: z.string().min(1),
    goal: z.string().min(1),
    resistance: z.string().min(1),
    requiredEvents: z.array(z.string().min(1)),
    protectedFacts: z.array(z.string().min(1)),
    prohibitedCrossings: z.array(z.string().min(1)),
    participants: z.array(z.string().min(1)),
    nonPresentParticipants: z.array(z.string().min(1)).default([]),
    locations: z.array(z.string().min(1)),
    threadIds: z.array(z.string().min(1)),
    resourceIds: z.array(z.string().min(1)),
    relationshipIds: z.array(z.string().min(1)),
    worldRuleIds: z.array(z.string().min(1)),
    keywords: z.array(z.string().min(1)),
    readerPromise: z.string().min(1),
    keyTurn: z.string().min(1),
    netChange: z.string().min(1),
    endingPull: z.string().min(1),
    targetLength: z
      .object({
        min: z.number().int().positive(),
        target: z.number().int().positive(),
        max: z.number().int().positive()
      })
      .strict()
  })
  .strict()
  .superRefine((contract, context) => {
    if (!(contract.targetLength.min <= contract.targetLength.target &&
      contract.targetLength.target <= contract.targetLength.max)) {
      context.addIssue({
        code: "custom",
        path: ["targetLength"],
        message: "Expected min <= target <= max."
      });
    }
  });

export const chapterReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    verdict: z.enum(["pass", "repair", "replan"]),
    blockingIssues: z.array(
      z
        .object({
          id: z.string().min(1),
          category: z.enum(["continuity", "causality", "character", "pacing", "style", "contract"]),
          evidence: z.string().min(1),
          repair: z.string().min(1)
        })
        .strict()
    ),
    warnings: z.array(z.string().min(1))
  })
  .strict()
  .superRefine((review, context) => {
    if (review.verdict === "pass" && review.blockingIssues.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["blockingIssues"],
        message: "A passing review cannot contain blocking issues."
      });
    }
    if (review.verdict !== "pass" && review.blockingIssues.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["blockingIssues"],
        message: "A non-passing review must contain a blocking issue."
      });
    }
  });

export const chapterContextManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    chapter: z.number().int().positive(),
    generatedAt: z.string().datetime(),
    maxChars: z.number().int().min(4_000).max(50_000),
    truncated: z.boolean(),
    outputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    sources: z.array(
      z
        .object({
          path: z.string().min(1),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/)
        })
        .strict()
    )
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = new Set<string>();
    for (const [index, source] of manifest.sources.entries()) {
      if (paths.has(source.path)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "path"],
          message: `Duplicate context source: ${source.path}`
        });
      }
      if (path.posix.isAbsolute(source.path) || source.path.split("/").includes("..")) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "path"],
          message: "Context source paths must be workspace-relative."
        });
      }
      paths.add(source.path);
    }
  });

export const continuityDomainSchema = z.enum([
  "facts",
  "timeline",
  "threads",
  "resources",
  "relationships",
  "characters",
  "storyCards"
]);

export const characterCardValueSchema = z
  .object({
    name: z.string().min(1),
    lifeStatus: z.enum(["alive", "dead", "missing", "unknown"]),
    currentLocation: z.string().min(1),
    currentGoal: z.string().min(1),
    knowledgeIds: z.array(z.string().min(1)),
    hiddenKnowledgeIds: z.array(z.string().min(1)),
    condition: z.array(z.string().min(1))
  })
  .strict();

export const storyCardValueSchema = z
  .object({
    type: z.enum(["main-plot", "subplot", "character-arc"]),
    status: z.enum(["planned", "active", "blocked", "resolved", "abandoned"]),
    summary: z.string().min(1),
    currentBeat: z.string().min(1),
    nextPressure: z.string().min(1),
    characterIds: z.array(z.string().min(1)),
    threadIds: z.array(z.string().min(1)),
    payoffDebt: z.string().min(1)
  })
  .strict();

export const continuityEntrySchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["active", "retired"]),
    value: z.record(z.string(), z.unknown()),
    sourceChapter: z.number().int().nonnegative(),
    evidence: z.string().min(1),
    updatedAt: z.string().datetime()
  })
  .strict();

export const continuityStoreSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z.array(continuityEntrySchema)
  })
  .strict()
  .superRefine((store, context) => {
    const ids = new Set<string>();
    for (const [index, entry] of store.entries.entries()) {
      if (ids.has(entry.id)) {
        context.addIssue({
          code: "custom",
          path: ["entries", index, "id"],
          message: `Duplicate continuity id: ${entry.id}`
        });
      }
      ids.add(entry.id);
    }
  });

export const continuityDeltaSchema = z
  .object({
    schemaVersion: z.literal(1),
    chapter: z.number().int().positive(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    changes: z.array(
      z
        .object({
          domain: continuityDomainSchema,
          operation: z.enum(["upsert", "retire"]),
          id: z.string().min(1),
          value: z.record(z.string(), z.unknown()),
          evidence: z.string().min(1)
        })
        .strict()
    )
  })
  .strict()
  .superRefine((delta, context) => {
    const keys = new Set<string>();
    for (const [index, change] of delta.changes.entries()) {
      const key = `${change.domain}:${change.id}`;
      if (keys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["changes", index, "id"],
          message: `Duplicate delta change: ${key}`
        });
      }
      keys.add(key);
    }
  });

export const qualityRulesSchema = z
  .object({
    schemaVersion: z.literal(1),
    bannedWords: z.array(z.string().min(1)),
    maxRepeatedPhraseOccurrences: z.number().int().min(2),
    repeatedPhraseLength: z.number().int().min(4).max(30),
    minParagraphs: z.number().int().positive(),
    maxParagraphLength: z.number().int().positive()
  })
  .strict();

export const targetPlatformSchema = z.enum(["fanqie", "zhihu-salt"]);
export const workFormSchema = z.enum(["long-serial", "short-complete"]);

export const marketPositionSchema = z
  .object({
    schemaVersion: z.literal(1),
    targetPlatform: targetPlatformSchema,
    workForm: workFormSchema,
    targetReader: z.string().min(1),
    audienceChannel: z.string().min(1),
    publicationFormat: z.string().min(1),
    primaryPromise: z.string().min(1),
    chapterLength: z
      .object({
        min: z.number().int().positive(),
        target: z.number().int().positive(),
        max: z.number().int().positive()
      })
      .strict(),
    commercialAssumptions: z.array(z.string().min(1)).min(1),
    contentBoundaries: z.array(z.string().min(1))
  })
  .strict()
  .superRefine((position, context) => {
    if (!(position.chapterLength.min <= position.chapterLength.target &&
      position.chapterLength.target <= position.chapterLength.max)) {
      context.addIssue({
        code: "custom",
        path: ["chapterLength"],
        message: "Expected min <= target <= max."
      });
    }
  });

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), {
    message: "Expected a real ISO date."
  });

export const marketSignalTypeSchema = z.enum([
  "industry-report",
  "platform-data",
  "reader-research",
  "search-trend",
  "competitor-product"
]);

export const marketScanSchema = z
  .object({
    schemaVersion: z.literal(1),
    asOf: isoDateSchema,
    targetMarket: z.string().min(1),
    targetPlatforms: z.array(targetPlatformSchema).min(1).max(2),
    targetForms: z.array(workFormSchema).min(1).max(2),
    sources: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
            title: z.string().min(1),
            url: z.url(),
            publisher: z.string().min(1),
            publishedAt: isoDateSchema,
            accessedAt: isoDateSchema,
            type: marketSignalTypeSchema,
            appliesTo: z.array(targetPlatformSchema).min(1).max(2),
            appliesToForms: z.array(workFormSchema).min(1).max(2),
            signal: z.string().min(1),
            evidence: z.string().min(1),
            confidence: z.enum(["high", "medium", "low"])
          })
          .strict()
      )
      .min(3)
  })
  .strict()
  .superRefine((scan, context) => {
    const ids = new Set<string>();
    if (new Set(scan.targetPlatforms).size !== scan.targetPlatforms.length) {
      context.addIssue({
        code: "custom",
        path: ["targetPlatforms"],
        message: "Target platforms must be unique."
      });
    }
    if (new Set(scan.targetForms).size !== scan.targetForms.length) {
      context.addIssue({
        code: "custom",
        path: ["targetForms"],
        message: "Target forms must be unique."
      });
    }
    for (const [index, source] of scan.sources.entries()) {
      if (ids.has(source.id)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "id"],
          message: `Duplicate market source id: ${source.id}`
        });
      }
      if (source.publishedAt > scan.asOf || source.accessedAt > scan.asOf) {
        context.addIssue({
          code: "custom",
          path: ["sources", index],
          message: "Market source dates cannot be after the scan asOf date."
        });
      }
      if (new Set(source.appliesTo).size !== source.appliesTo.length) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "appliesTo"],
          message: "Source platform applicability must be unique."
        });
      }
      if (new Set(source.appliesToForms).size !== source.appliesToForms.length) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "appliesToForms"],
          message: "Source form applicability must be unique."
        });
      }
      for (const platform of source.appliesTo) {
        if (!scan.targetPlatforms.includes(platform)) {
          context.addIssue({
            code: "custom",
            path: ["sources", index, "appliesTo"],
            message: `Source applies to undeclared target platform: ${platform}.`
          });
        }
      }
      for (const form of source.appliesToForms) {
        if (!scan.targetForms.includes(form)) {
          context.addIssue({
            code: "custom",
            path: ["sources", index, "appliesToForms"],
            message: `Source applies to undeclared target form: ${form}.`
          });
        }
      }
      ids.add(source.id);
    }
  });

export const topicScoresSchema = z
  .object({
    demand: z.number().int().min(1).max(5),
    competitionWhitespace: z.number().int().min(1).max(5),
    channelFit: z.number().int().min(1).max(5),
    authorFit: z.number().int().min(1).max(5),
    serialSustainability: z.number().int().min(1).max(5),
    differentiation: z.number().int().min(1).max(5),
    evidenceQuality: z.number().int().min(1).max(5)
  })
  .strict();

export const topicCandidatesSchema = z
  .object({
    schemaVersion: z.literal(1),
    candidates: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
            workingTitle: z.string().min(1),
            targetPlatform: targetPlatformSchema,
            workForm: workFormSchema,
            genre: z.string().min(1),
            targetReader: z.string().min(1),
            channel: z.string().min(1),
            platformRationale: z.string().min(1),
            formRationale: z.string().min(1),
            readerNeed: z.string().min(1),
            emotionalReward: z.string().min(1),
            coreFantasy: z.string().min(1),
            storyEngine: z.string().min(1),
            differentiator: z.string().min(1),
            openingHook: z.string().min(1),
            comparableAppeals: z.array(z.string().min(1)).min(1),
            evidenceIds: z.array(z.string().min(1)).min(2),
            saturationRisks: z.array(z.string().min(1)).min(1),
            originalityBoundaries: z.array(z.string().min(1)).min(2),
            scores: topicScoresSchema
          })
          .strict()
      )
      .min(3)
      .max(8)
  })
  .strict()
  .superRefine((slate, context) => {
    const ids = new Set<string>();
    const titles = new Set<string>();
    for (const [index, candidate] of slate.candidates.entries()) {
      const normalizedTitle = candidate.workingTitle.trim().toLocaleLowerCase();
      if (ids.has(candidate.id)) {
        context.addIssue({
          code: "custom",
          path: ["candidates", index, "id"],
          message: `Duplicate topic candidate id: ${candidate.id}`
        });
      }
      if (titles.has(normalizedTitle)) {
        context.addIssue({
          code: "custom",
          path: ["candidates", index, "workingTitle"],
          message: `Duplicate topic candidate title: ${candidate.workingTitle}`
        });
      }
      if (new Set(candidate.evidenceIds).size !== candidate.evidenceIds.length) {
        context.addIssue({
          code: "custom",
          path: ["candidates", index, "evidenceIds"],
          message: "Candidate evidence IDs must be unique."
        });
      }
      ids.add(candidate.id);
      titles.add(normalizedTitle);
    }
  });

export const topicDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedId: z.string().min(1),
    decisionRationale: z.string().min(1),
    selectionTradeoff: z.string().min(1),
    rejected:
      z.array(
        z
          .object({
            id: z.string().min(1),
            reason: z.string().min(1)
          })
          .strict()
      )
      .min(2),
    validation: z
      .object({
        hypothesis: z.string().min(1),
        targetReaders: z.string().min(1),
        minimumSampleSize: z.number().int().min(3),
        successSignal: z.string().min(1)
      })
      .strict(),
    protectedOriginality: z.array(z.string().min(1)).min(2)
  })
  .strict();

const topicRankingSchema = z
  .object({
    id: z.string().min(1),
    workingTitle: z.string().min(1),
    targetPlatform: targetPlatformSchema,
    workForm: workFormSchema,
    rank: z.number().int().positive(),
    weightedScore: z.number().min(0).max(5),
    gateOk: z.boolean(),
    issues: z.array(z.string().min(1)),
    evidenceCount: z.number().int().nonnegative()
  })
  .strict();

export const topicSelectionReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    policyDate: isoDateSchema,
    selectedId: z.string().min(1),
    selectedRank: z.number().int().positive(),
    selectedScore: z.number().min(0).max(5),
    ok: z.boolean(),
    blockingIssues: z.array(z.string().min(1)),
    rankings: z.array(topicRankingSchema).min(3),
    sources: z.array(
      z
        .object({
          path: z.string().min(1),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/)
        })
        .strict()
    ).length(3)
  })
  .strict();

export const qualityReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    chapter: z.number().int().positive(),
    source: z.enum(["draft", "final"]),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    ok: z.boolean(),
    blockingIssues: z.array(z.string()),
    warnings: z.array(z.string()),
    metrics: z
      .object({
        chineseCharacters: z.number().int().nonnegative(),
        latinWords: z.number().int().nonnegative(),
        paragraphs: z.number().int().nonnegative(),
        longestParagraph: z.number().int().nonnegative(),
        duplicateParagraphs: z.number().int().nonnegative(),
        repeatedPhrases: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();

const milestoneSourceSchema = z
  .object({
    path: z.string().min(1),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/)
  })
  .strict();

const openingChapterMetricSchema = z
  .object({
    chapter: z.number().int().min(1).max(3),
    title: z.string().min(1),
    chineseCharacters: z.number().int().nonnegative(),
    paragraphs: z.number().int().nonnegative(),
    readerPromise: z.string().min(1),
    netChange: z.string().min(1),
    endingPull: z.string().min(1),
    reviewVerdict: z.enum(["pass", "repair", "replan"]),
    qualityOk: z.boolean(),
    sources: z.array(milestoneSourceSchema)
  })
  .strict();

export const openingMilestoneReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    milestone: z.literal("opening-three"),
    generatedAt: z.string().datetime(),
    bundleFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    ok: z.boolean(),
    blockingIssues: z.array(z.string().min(1)),
    chapters: z.array(openingChapterMetricSchema).length(3),
    sources: z.array(milestoneSourceSchema)
  })
  .strict();

const commercialDimensionSchema = z
  .object({
    score: z.number().int().min(1).max(5),
    evidence: z.array(z.string().min(1)).min(1),
    nextAction: z.string().min(1)
  })
  .strict();

export const commercialMilestoneReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    milestone: z.literal("opening-three"),
    bundleFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    verdict: z.enum(["pass", "revise", "reposition"]),
    dimensions: z
      .object({
        audienceFit: commercialDimensionSchema,
        openingHook: commercialDimensionSchema,
        protagonistAgency: commercialDimensionSchema,
        payoffDensity: commercialDimensionSchema,
        escalation: commercialDimensionSchema,
        emotionalInvestment: commercialDimensionSchema,
        proseDistinctiveness: commercialDimensionSchema,
        continuationIntent: commercialDimensionSchema
      })
      .strict(),
    blockingIssues: z.array(z.string().min(1)),
    marketTest: z
      .object({
        hypothesis: z.string().min(1),
        targetReader: z.string().min(1),
        successSignal: z.string().min(1)
      })
      .strict()
  })
  .strict()
  .superRefine((review, context) => {
    const scores = Object.values(review.dimensions).map((dimension) => dimension.score);
    if (review.verdict === "pass") {
      if (review.blockingIssues.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["blockingIssues"],
          message: "A passing commercial review cannot contain blocking issues."
        });
      }
      if (scores.some((score) => score < 3) || review.dimensions.continuationIntent.score < 4) {
        context.addIssue({
          code: "custom",
          path: ["dimensions"],
          message: "A passing opening requires every dimension >= 3 and continuationIntent >= 4."
        });
      }
    } else if (review.blockingIssues.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["blockingIssues"],
        message: "A non-passing commercial review must identify a blocking issue."
      });
    }
  });

export type NovelState = z.infer<typeof novelStateSchema>;
export type BookPhase = z.infer<typeof bookPhaseSchema>;
export type ChapterStatus = z.infer<typeof chapterStatusSchema>;
export type ChapterContract = z.infer<typeof chapterContractSchema>;
export type ContinuityDomain = z.infer<typeof continuityDomainSchema>;
export type ContinuityStore = z.infer<typeof continuityStoreSchema>;
export type ContinuityDelta = z.infer<typeof continuityDeltaSchema>;
export type QualityReport = z.infer<typeof qualityReportSchema>;
export type MarketPosition = z.infer<typeof marketPositionSchema>;
export type TargetPlatform = z.infer<typeof targetPlatformSchema>;
export type WorkForm = z.infer<typeof workFormSchema>;
export type MarketScan = z.infer<typeof marketScanSchema>;
export type TopicCandidates = z.infer<typeof topicCandidatesSchema>;
export type TopicDecision = z.infer<typeof topicDecisionSchema>;
export type TopicSelectionReport = z.infer<typeof topicSelectionReportSchema>;

export function chapterLengthPolicyIssues(
  contract: ChapterContract,
  position: MarketPosition
): string[] {
  const issues: string[] = [];
  if (contract.targetLength.min < position.chapterLength.min) {
    issues.push(
      `Contract minimum ${contract.targetLength.min} is below market minimum ${position.chapterLength.min}.`
    );
  }
  if (
    contract.targetLength.target < position.chapterLength.min ||
    contract.targetLength.target > position.chapterLength.max
  ) {
    issues.push(
      `Contract target ${contract.targetLength.target} is outside market range ` +
      `${position.chapterLength.min}-${position.chapterLength.max}.`
    );
  }
  if (contract.targetLength.max > position.chapterLength.max) {
    issues.push(
      `Contract maximum ${contract.targetLength.max} exceeds market maximum ${position.chapterLength.max}.`
    );
  }
  return issues;
}

export function validateState(input: unknown): NovelState {
  const state = novelStateSchema.parse(input);
  const { currentChapter, chapterStatus } = state.workflow;
  const { lastCommittedChapter } = state.continuity;

  if (lastCommittedChapter > currentChapter) {
    throw new Error("lastCommittedChapter cannot be greater than currentChapter.");
  }
  if (currentChapter > 1 && lastCommittedChapter < currentChapter - 1) {
    throw new Error("Every earlier chapter must be continuity-committed.");
  }
  if (chapterStatus === "continuity_committed" && lastCommittedChapter !== currentChapter) {
    throw new Error("A continuity-committed chapter must update lastCommittedChapter.");
  }
  if (chapterStatus !== "continuity_committed" && lastCommittedChapter === currentChapter) {
    throw new Error("lastCommittedChapter cannot include an uncommitted current chapter.");
  }

  return state;
}
