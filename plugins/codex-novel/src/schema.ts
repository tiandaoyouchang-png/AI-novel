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
export const scopeLevelSchema = z.enum([
  "household",
  "village",
  "county",
  "prefecture",
  "province",
  "court",
  "national"
]);

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
        reviewRound: z.number().int().min(0).max(2).default(0),
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

const sceneBeatSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    type: z.enum([
      "dialogue",
      "action",
      "investigation",
      "intimacy",
      "reveal",
      "transition",
      "other"
    ]),
    location: z.string().min(1),
    participants: z.array(z.string().min(1)).min(1),
    goal: z.string().min(1),
    conflict: z.string().min(1),
    valueShift: z.string().min(1),
    emotionalChange: z.string().min(1)
  })
  .strict();

const chapterContractBaseSchema = z
  .object({
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
    emotionalTarget: z.string().min(1),
    sceneBeats: z.array(sceneBeatSchema).min(1),
    targetLength: z
      .object({
        min: z.number().int().positive(),
        target: z.number().int().positive(),
        max: z.number().int().positive()
      })
      .strict()
  })
  .strict();

function validateContractShape(
  contract: z.infer<typeof chapterContractBaseSchema>,
  context: z.RefinementCtx
): void {
    if (!(contract.targetLength.min <= contract.targetLength.target &&
      contract.targetLength.target <= contract.targetLength.max)) {
      context.addIssue({
        code: "custom",
        path: ["targetLength"],
        message: "Expected min <= target <= max."
      });
    }
    const sceneIds = new Set<string>();
    for (const [index, scene] of contract.sceneBeats.entries()) {
      if (sceneIds.has(scene.id)) {
        context.addIssue({
          code: "custom",
          path: ["sceneBeats", index, "id"],
          message: `Duplicate scene beat id: ${scene.id}`
        });
      }
      for (const participant of scene.participants) {
        if (!contract.participants.includes(participant)) {
          context.addIssue({
            code: "custom",
            path: ["sceneBeats", index, "participants"],
            message: `Scene participant is not declared by the chapter contract: ${participant}`
          });
        }
      }
      if (!contract.locations.includes(scene.location)) {
        context.addIssue({
          code: "custom",
          path: ["sceneBeats", index, "location"],
          message: `Scene location is not declared by the chapter contract: ${scene.location}`
        });
      }
      sceneIds.add(scene.id);
    }
}

export const chapterContractV2Schema = chapterContractBaseSchema
  .extend({ schemaVersion: z.literal(2) })
  .strict()
  .superRefine(validateContractShape);

export const chapterContractV3Schema = chapterContractBaseSchema
  .extend({
    schemaVersion: z.literal(3),
    scopeLevel: scopeLevelSchema,
    antagonistLayer: z.number().int().min(0).max(3),
    capabilityUses: z.array(
      z
        .object({
          characterId: z.string().min(1),
          capabilityId: z.string().min(1),
          purpose: z.string().min(1),
          supportCharacterId: z.string().min(1).nullable()
        })
        .strict()
    ),
    investigationChain: z
      .object({
        anomaly: z.string().min(1),
        alternativeExplanations: z.array(z.string().min(1)).min(2),
        eliminationTests: z.array(z.string().min(1)).min(1),
        result: z.string().min(1),
        limitation: z.string().min(1)
      })
      .strict()
      .nullable(),
    evidenceMoves: z.array(
      z
        .object({
          evidenceId: z.string().min(1),
          action: z.enum(["discover", "hypothesize", "test", "corroborate", "challenge", "admit"]),
          claimId: z.string().min(1),
          expectedResult: z.string().min(1)
        })
        .strict()
    ),
    revealIds: z.array(z.string().min(1)),
    coincidences: z.array(
      z
        .object({
          description: z.string().min(1),
          cost: z.string().min(1)
        })
        .strict()
    ),
    supportingCharacterAgency: z.array(
      z
        .object({
          characterId: z.string().min(1),
          independentGoal: z.string().min(1),
          decision: z.string().min(1)
        })
        .strict()
    ),
    outcomeCost: z.string().min(1),
    failureConsequence: z.string().min(1),
    periodChecks: z
      .object({
        physical: z.string().min(1),
        institutional: z.string().min(1),
        vocabulary: z.string().min(1),
        antagonistCountermove: z.string().min(1)
      })
      .strict()
  })
  .strict()
  .superRefine((contract, context) => {
    validateContractShape(contract, context);
    const hasInvestigation = contract.sceneBeats.some((scene) => scene.type === "investigation");
    if (hasInvestigation && !contract.investigationChain) {
      context.addIssue({
        code: "custom",
        path: ["investigationChain"],
        message: "Investigation scenes require anomaly, alternatives, tests, result, and limitation."
      });
    }
    for (const [index, agency] of contract.supportingCharacterAgency.entries()) {
      if (!contract.participants.includes(agency.characterId)) {
        context.addIssue({
          code: "custom",
          path: ["supportingCharacterAgency", index, "characterId"],
          message: "Supporting character agency must reference a chapter participant."
        });
      }
    }
    const agencyIds = contract.supportingCharacterAgency.map((agency) => agency.characterId);
    if (new Set(agencyIds).size !== agencyIds.length) {
      context.addIssue({
        code: "custom",
        path: ["supportingCharacterAgency"],
        message: "A supporting character may have only one chapter agency commitment."
      });
    }
    if (new Set(contract.revealIds).size !== contract.revealIds.length) {
      context.addIssue({
        code: "custom",
        path: ["revealIds"],
        message: "Reveal IDs must be unique within a chapter contract."
      });
    }
  });

export const chapterContractSchema = z.union([
  chapterContractV3Schema,
  chapterContractV2Schema
]);

const reviewCheckSchema = z
  .object({
    status: z.enum(["pass", "fail"]),
    evidence: z.string().min(1)
  })
  .strict();

const chapterReviewBaseSchema = z
  .object({
    reviewRound: z.number().int().min(1).max(2),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    verdict: z.enum(["pass", "repair", "replan"]),
    blockingIssues: z.array(
      z
        .object({
          id: z.string().min(1),
          category: z.enum([
            "continuity",
            "causality",
            "character",
            "information",
            "scene",
            "pacing",
            "style",
            "contract",
            "scope",
            "capability",
            "evidence",
            "period",
            "consequence"
          ]),
          evidence: z.string().min(1),
          repair: z.string().min(1)
        })
        .strict()
    ),
    warnings: z.array(z.string().min(1))
  })
  .strict();

function validateReviewShape(
  review: z.infer<typeof chapterReviewBaseSchema> & {
    checks: Record<string, z.infer<typeof reviewCheckSchema>>;
  },
  context: z.RefinementCtx
): void {
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
    const failedChecks = Object.entries(review.checks)
      .filter(([, check]) => check.status === "fail")
      .map(([name]) => name);
    if (review.verdict === "pass" && failedChecks.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["checks"],
        message: `A passing review cannot contain failed checks: ${failedChecks.join(", ")}`
      });
    }
    if (review.verdict !== "pass" && failedChecks.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["checks"],
        message: "A non-passing review must fail at least one explicit check."
      });
    }
}

export const chapterReviewV2Schema = chapterReviewBaseSchema
  .extend({
    schemaVersion: z.literal(2),
    checks: z
      .object({
        characterVoice: reviewCheckSchema,
        informationBoundaries: reviewCheckSchema,
        sceneValueChanges: reviewCheckSchema
      })
      .strict()
  })
  .strict()
  .superRefine(validateReviewShape);

export const chapterReviewV3Schema = chapterReviewBaseSchema
  .extend({
    schemaVersion: z.literal(3),
    checks: z
      .object({
        characterVoice: reviewCheckSchema,
        informationBoundaries: reviewCheckSchema,
        sceneValueChanges: reviewCheckSchema,
        corePremiseAlignment: reviewCheckSchema,
        scopeDiscipline: reviewCheckSchema,
        capabilityBoundaries: reviewCheckSchema,
        evidenceChain: reviewCheckSchema,
        periodAuthenticity: reviewCheckSchema,
        supportingCharacterAgency: reviewCheckSchema,
        consequenceIntegrity: reviewCheckSchema
      })
      .strict()
  })
  .strict()
  .superRefine(validateReviewShape);

export const chapterReviewSchema = z.union([
  chapterReviewV3Schema,
  chapterReviewV2Schema
]);

export const characterProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    role: z.string().min(1),
    coreMotivation: z.string().min(1),
    moralBoundary: z.string().min(1),
    decisionPattern: z.string().min(1),
    voice: z
      .object({
        rhythm: z.string().min(1),
        diction: z.string().min(1),
        habits: z.array(z.string().min(1)),
        avoids: z.array(z.string().min(1))
      })
      .strict(),
    oocRisks: z.array(z.string().min(1)).min(1),
    relationshipVoices: z
      .array(
        z
          .object({
            characterId: z.string().min(1),
            difference: z.string().min(1)
          })
          .strict()
      )
  })
  .strict();

export const styleProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    pov: z.enum(["first", "third-limited", "third-omniscient"]),
    tense: z.enum(["past", "present", "mixed-intentional"]),
    pacing: z.enum(["compressed", "balanced", "expansive"]),
    dialogueDensity: z.enum(["low", "medium", "high"]),
    sentenceRhythm: z.string().min(1),
    descriptionPreferences: z.array(z.string().min(1)).min(1),
    bannedPatterns: z.array(z.string().min(1)),
    sceneGuidance: z.record(
      z.enum([
        "dialogue",
        "action",
        "investigation",
        "intimacy",
        "reveal",
        "transition",
        "other"
      ]),
      z.array(z.string().min(1)).min(1)
    )
  })
  .strict();

export const styleExamplesSchema = z
  .object({
    schemaVersion: z.literal(1),
    examples: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
          title: z.string().min(1),
          sceneTypes: z
            .array(
              z.enum([
                "dialogue",
                "action",
                "investigation",
                "intimacy",
                "reveal",
                "transition",
                "other"
              ])
            )
            .min(1),
          rights: z.enum(["user-owned", "authorized", "public-domain"]),
          source: z.string().min(1),
          excerpt: z.string().min(20).max(2_000),
          guidance: z.string().min(1)
        })
        .strict()
    )
  })
  .strict()
  .superRefine((library, context) => {
    const ids = new Set<string>();
    for (const [index, example] of library.examples.entries()) {
      if (ids.has(example.id)) {
        context.addIssue({
          code: "custom",
          path: ["examples", index, "id"],
          message: `Duplicate style example id: ${example.id}`
        });
      }
      ids.add(example.id);
    }
  });

export const chapterHandoffSchema = z
  .object({
    schemaVersion: z.literal(1),
    chapter: z.number().int().positive(),
    sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    summary: z.string().min(1),
    resolved: z.array(z.string().min(1)),
    unresolved: z.array(z.string().min(1)),
    characterCarry: z.array(
      z
        .object({
          characterId: z.string().min(1),
          state: z.string().min(1)
        })
        .strict()
    ),
    emotionalCarry: z.string().min(1),
    nextConstraints: z.array(z.string().min(1))
  })
  .strict();

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

export const storyGuardrailsSchema = z
  .object({
    schemaVersion: z.literal(1),
    corePremise: z
      .object({
        oneSentence: z.string().min(1),
        signatureMechanism: z.string().min(1),
        protectedElements: z.array(z.string().min(1)).min(2),
        forbiddenDrift: z.array(z.string().min(1)).min(1)
      })
      .strict(),
    maxScope: scopeLevelSchema,
    maxHiddenAntagonistLayers: z.number().int().min(0).max(3),
    capabilityBoundaries: z
      .array(
        z
          .object({
            characterId: z.string().min(1),
            allowed: z
              .array(
                z
                  .object({
                    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
                    description: z.string().min(1)
                  })
                  .strict()
              )
              .min(1),
            prohibited: z.array(z.string().min(1)).min(1),
            requiresSupportFor: z.array(z.string().min(1))
          })
          .strict()
      )
      .min(1),
    investigationRules: z
      .object({
        coincidenceBudgetPerChapter: z.number().int().min(0).max(2),
        requireAlternativeExplanations: z.literal(true),
        evidenceMustNotNameCulprit: z.literal(true),
        requireVerificationLimitation: z.literal(true)
      })
      .strict(),
    periodRules: z
      .object({
        era: z.string().min(1),
        prohibitedModernTerms: z.array(z.string().min(1)),
        institutionalConstraints: z.array(z.string().min(1)).min(1),
        physicalConstraints: z.array(z.string().min(1)).min(1)
      })
      .strict(),
    supportingCharacters: z.array(
      z
        .object({
          characterId: z.string().min(1),
          independentGoal: z.string().min(1),
          uniqueDomain: z.string().min(1),
          mayContradictProtagonist: z.boolean()
        })
        .strict()
    ),
    consequenceRules: z
      .object({
        failureCannotAutoReward: z.literal(true),
        permanentCosts: z.array(z.string().min(1)).min(1)
      })
      .strict(),
    prohibitedNarrativeShortcuts: z.array(z.string().min(1)).min(1)
  })
  .strict()
  .superRefine((guardrails, context) => {
    const characters = new Set<string>();
    for (const [index, boundary] of guardrails.capabilityBoundaries.entries()) {
      if (characters.has(boundary.characterId)) {
        context.addIssue({
          code: "custom",
          path: ["capabilityBoundaries", index, "characterId"],
          message: `Duplicate capability boundary: ${boundary.characterId}`
        });
      }
      const capabilityIds = boundary.allowed.map((capability) => capability.id);
      if (new Set(capabilityIds).size !== capabilityIds.length) {
        context.addIssue({
          code: "custom",
          path: ["capabilityBoundaries", index, "allowed"],
          message: "Capability IDs must be unique per character."
        });
      }
      characters.add(boundary.characterId);
    }
  });

export const revealPolicySchema = z
  .object({
    schemaVersion: z.literal(1),
    reveals: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
          subject: z.string().min(1),
          earliestChapter: z.number().int().positive(),
          targetChapter: z.number().int().positive(),
          latestChapter: z.number().int().positive(),
          prerequisiteEvidenceIds: z.array(z.string().min(1)),
          status: z.enum(["planned", "revealed", "delayed", "cancelled"]),
          revealedChapter: z.number().int().positive().nullable(),
          delayReason: z.string().min(1).nullable()
        })
        .strict()
    )
  })
  .strict()
  .superRefine((policy, context) => {
    const ids = new Set<string>();
    for (const [index, reveal] of policy.reveals.entries()) {
      if (ids.has(reveal.id)) {
        context.addIssue({
          code: "custom",
          path: ["reveals", index, "id"],
          message: `Duplicate reveal ID: ${reveal.id}`
        });
      }
      if (!(reveal.earliestChapter <= reveal.targetChapter &&
        reveal.targetChapter <= reveal.latestChapter)) {
        context.addIssue({
          code: "custom",
          path: ["reveals", index],
          message: "Expected earliestChapter <= targetChapter <= latestChapter."
        });
      }
      if (reveal.status === "revealed" && reveal.revealedChapter === null) {
        context.addIssue({
          code: "custom",
          path: ["reveals", index, "revealedChapter"],
          message: "A revealed item requires revealedChapter."
        });
      }
      if (reveal.status !== "revealed" && reveal.revealedChapter !== null) {
        context.addIssue({
          code: "custom",
          path: ["reveals", index, "revealedChapter"],
          message: "Only a revealed item may set revealedChapter."
        });
      }
      if (reveal.status === "delayed" && !reveal.delayReason) {
        context.addIssue({
          code: "custom",
          path: ["reveals", index, "delayReason"],
          message: "A delayed reveal requires a reason."
        });
      }
      ids.add(reveal.id);
    }
  });

export const continuityDomainSchema = z.enum([
  "facts",
  "timeline",
  "threads",
  "resources",
  "relationships",
  "characters",
  "storyCards",
  "evidence"
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

export const evidenceValueSchema = z
  .object({
    kind: z.enum(["anomaly", "directional", "association", "adjudicative", "foreshadowing"]),
    status: z.enum(["observed", "contested", "corroborated", "admitted", "discredited"]),
    summary: z.string().min(1),
    supportsClaimIds: z.array(z.string().min(1)),
    contradictsClaimIds: z.array(z.string().min(1)),
    sourceIds: z.array(z.string().min(1)).min(1),
    verificationMethod: z.string().min(1),
    limitations: z.array(z.string().min(1)).min(1),
    expectedRevealChapter: z.number().int().positive().nullable(),
    revealedChapter: z.number().int().positive().nullable()
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.expectedRevealChapter !== null &&
      evidence.revealedChapter !== null &&
      evidence.revealedChapter < evidence.expectedRevealChapter
    ) {
      context.addIssue({
        code: "custom",
        path: ["revealedChapter"],
        message: "Evidence cannot reveal its protected meaning before the expected chapter."
      });
    }
  });

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

export const hookExperimentsSchema = z
  .object({
    schemaVersion: z.literal(1),
    selectedHookId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    candidates: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
            title: z.string().min(1),
            hypothesis: z.string().min(1),
            openingSample: z.string().min(80).max(4_000),
            targetEmotion: z.string().min(1),
            readerQuestion: z.string().min(1),
            risks: z.array(z.string().min(1)).min(1)
          })
          .strict()
      )
      .min(2)
      .max(3),
    testProtocol: z
      .object({
        blindLabels: z.literal(true),
        targetReaders: z.string().min(1),
        minimumSampleSize: z.number().int().min(3),
        questions: z.array(z.string().min(1)).min(2),
        successSignals: z.array(z.string().min(1)).min(1)
      })
      .strict(),
    rejected: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
            reason: z.string().min(1)
          })
          .strict()
      )
      .min(1),
    notes: z.array(z.string().min(1)).default([])
  })
  .strict()
  .superRefine((experiment, context) => {
    const ids = experiment.candidates.map((candidate) => candidate.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["candidates"],
        message: "Hook candidate IDs must be unique."
      });
    }
    if (!ids.includes(experiment.selectedHookId)) {
      context.addIssue({
        code: "custom",
        path: ["selectedHookId"],
        message: "Selected hook must reference a candidate."
      });
    }
    const rejectedIds = experiment.rejected.map((candidate) => candidate.id);
    if (new Set(rejectedIds).size !== rejectedIds.length) {
      context.addIssue({
        code: "custom",
        path: ["rejected"],
        message: "Rejected hook IDs must be unique."
      });
    }
    if (rejectedIds.includes(experiment.selectedHookId)) {
      context.addIssue({
        code: "custom",
        path: ["rejected"],
        message: "Selected hook cannot also be rejected."
      });
    }
    const expectedRejected = ids.filter((id) => id !== experiment.selectedHookId);
    if (
      expectedRejected.length !== rejectedIds.length ||
      expectedRejected.some((id) => !rejectedIds.includes(id))
    ) {
      context.addIssue({
        code: "custom",
        path: ["rejected"],
        message: "Every unselected hook must have a rejection reason."
      });
    }
  });

export const arcGridSchema = z
  .object({
    schemaVersion: z.literal(1),
    arcs: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
          type: z.enum(["main-plot", "subplot", "character-arc", "mystery", "relationship"]),
          title: z.string().min(1),
          status: z.enum(["planned", "active", "dormant", "resolved", "abandoned"]),
          introducedIn: z
            .object({
              volume: z.number().int().positive(),
              chapter: z.number().int().positive().nullable()
            })
            .strict(),
          promises: z.array(z.string().min(1)).min(1),
          dependencies: z.array(z.string().min(1)),
          payoffTarget: z
            .object({
              volume: z.number().int().positive(),
              chapter: z.number().int().positive().nullable(),
              description: z.string().min(1)
            })
            .strict(),
          lastAdvancedChapter: z.number().int().nonnegative(),
          maxIdleChapters: z.number().int().positive(),
          dormantReason: z.string().min(1).nullable(),
          volumeBeats: z
            .array(
              z
                .object({
                  volume: z.number().int().positive(),
                  objective: z.string().min(1),
                  status: z.enum(["planned", "active", "delivered", "changed", "dropped"]),
                  payoffDebt: z.string().min(1)
                })
                .strict()
            )
            .min(1)
        })
        .strict()
    )
  })
  .strict()
  .superRefine((grid, context) => {
    const ids = new Set<string>();
    for (const [index, arc] of grid.arcs.entries()) {
      if (ids.has(arc.id)) {
        context.addIssue({
          code: "custom",
          path: ["arcs", index, "id"],
          message: `Duplicate arc ID: ${arc.id}`
        });
      }
      if (arc.status === "dormant" && !arc.dormantReason) {
        context.addIssue({
          code: "custom",
          path: ["arcs", index, "dormantReason"],
          message: "A deliberately dormant arc requires a reason."
        });
      }
      const volumes = arc.volumeBeats.map((beat) => beat.volume);
      if (new Set(volumes).size !== volumes.length) {
        context.addIssue({
          code: "custom",
          path: ["arcs", index, "volumeBeats"],
          message: "An arc can have only one beat per volume."
        });
      }
      ids.add(arc.id);
    }
  });

export const serialPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    updatesPerWeek: z.number().int().min(1).max(21),
    targetBufferDays: z.number().int().min(1).max(90),
    publishedThroughChapter: z.number().int().nonnegative(),
    blockedDays: z.array(
      z
        .object({
          date: isoDateSchema,
          reason: z.string().min(1)
        })
        .strict()
    )
  })
  .strict();

export const publicationMetricSchema = z
  .object({
    chapter: z.number().int().positive(),
    observedAt: isoDateSchema,
    impressions: z.number().int().nonnegative().optional(),
    readers: z.number().int().nonnegative().optional(),
    completionRate: z.number().min(0).max(1).optional(),
    continuationRate: z.number().min(0).max(1).optional(),
    follows: z.number().int().nonnegative().optional(),
    comments: z.number().int().nonnegative().optional()
  })
  .strict();

export const revisionManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    createdAt: z.string().datetime(),
    stateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    baseRevisionId: z.string().nullable(),
    files: z.array(
      z
        .object({
          path: z.string().min(1),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/)
        })
        .strict()
    ),
    diffSummary: z
      .object({
        added: z.array(z.string()),
        changed: z.array(z.string()),
        removed: z.array(z.string())
      })
      .strict()
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

export const checkpointSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    label: z.string().min(1),
    lastCommittedChapter: z.number().int().positive(),
    stateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    active: z
      .object({
        facts: z.array(z.string().min(1)),
        timeline: z.array(z.string().min(1)),
        threads: z.array(z.string().min(1)),
        resources: z.array(z.string().min(1)),
        relationships: z.array(z.string().min(1)),
        characters: z.array(z.string().min(1)),
        storyCards: z.array(z.string().min(1)),
        evidence: z.array(z.string().min(1)).default([])
      })
      .strict(),
    qualityDebt: z.array(z.string().min(1)),
    sources: z.array(
      z
        .object({
          path: z.string().min(1),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/)
        })
        .strict()
    )
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

export const storyMilestoneTypeSchema = z.enum(["short-complete", "volume"]);

const storyMilestoneChapterSchema = z
  .object({
    chapter: z.number().int().positive(),
    title: z.string().min(1),
    chineseCharacters: z.number().int().nonnegative(),
    emotionalTarget: z.string().min(1),
    sceneCount: z.number().int().positive(),
    reviewRound: z.number().int().min(1).max(2),
    sources: z.array(milestoneSourceSchema)
  })
  .strict();

export const storyMilestoneReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    milestone: storyMilestoneTypeSchema,
    workForm: workFormSchema,
    generatedAt: z.string().datetime(),
    bundleFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    throughChapter: z.number().int().positive(),
    totalChineseCharacters: z.number().int().nonnegative(),
    ok: z.boolean(),
    blockingIssues: z.array(z.string().min(1)),
    chapters: z.array(storyMilestoneChapterSchema).min(1),
    sources: z.array(milestoneSourceSchema)
  })
  .strict();

const storyReviewDimensionIdSchema = z.enum([
  "openingPull",
  "compression",
  "causality",
  "emotionalEscalation",
  "reversal",
  "endingPayoff",
  "platformFit",
  "promiseDelivery",
  "escalation",
  "characterArcs",
  "subplotControl",
  "continuityHealth",
  "climaxPayoff",
  "nextVolumePull"
]);

export const storyMilestoneReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    milestone: storyMilestoneTypeSchema,
    bundleFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    verdict: z.enum(["pass", "revise", "reposition"]),
    dimensions: z
      .array(
        z
          .object({
            id: storyReviewDimensionIdSchema,
            score: z.number().int().min(1).max(5),
            evidence: z.array(z.string().min(1)).min(1),
            nextAction: z.string().min(1)
          })
          .strict()
      )
      .min(1),
    blockingIssues: z.array(z.string().min(1)),
    readerTest: z
      .object({
        hypothesis: z.string().min(1),
        targetReader: z.string().min(1),
        successSignal: z.string().min(1)
      })
      .strict()
  })
  .strict()
  .superRefine((review, context) => {
    const required = review.milestone === "short-complete"
      ? [
          "openingPull",
          "compression",
          "causality",
          "emotionalEscalation",
          "reversal",
          "endingPayoff",
          "platformFit"
        ]
      : [
          "promiseDelivery",
          "escalation",
          "characterArcs",
          "subplotControl",
          "continuityHealth",
          "climaxPayoff",
          "nextVolumePull"
        ];
    const ids = review.dimensions.map((dimension) => dimension.id);
    const missing = required.filter((id) => !ids.includes(id as typeof ids[number]));
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: "Milestone review dimensions must be unique."
      });
    }
    if (missing.length > 0 || ids.some((id) => !required.includes(id))) {
      context.addIssue({
        code: "custom",
        path: ["dimensions"],
        message: `Expected exactly these ${review.milestone} dimensions: ${required.join(", ")}`
      });
    }
    if (review.verdict === "pass") {
      if (review.blockingIssues.length > 0 || review.dimensions.some((dimension) => dimension.score < 3)) {
        context.addIssue({
          code: "custom",
          path: ["verdict"],
          message: "A passing milestone review requires no blockers and every dimension >= 3."
        });
      }
    } else if (review.blockingIssues.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["blockingIssues"],
        message: "A non-passing milestone review must identify a blocker."
      });
    }
  });

export type NovelState = z.infer<typeof novelStateSchema>;
export type BookPhase = z.infer<typeof bookPhaseSchema>;
export type ChapterStatus = z.infer<typeof chapterStatusSchema>;
export type ChapterContract = z.infer<typeof chapterContractSchema>;
export type ChapterHandoff = z.infer<typeof chapterHandoffSchema>;
export type CharacterProfile = z.infer<typeof characterProfileSchema>;
export type StyleProfile = z.infer<typeof styleProfileSchema>;
export type StyleExamples = z.infer<typeof styleExamplesSchema>;
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
export type HookExperiments = z.infer<typeof hookExperimentsSchema>;
export type ArcGrid = z.infer<typeof arcGridSchema>;
export type SerialPlan = z.infer<typeof serialPlanSchema>;
export type PublicationMetric = z.infer<typeof publicationMetricSchema>;
export type RevisionManifest = z.infer<typeof revisionManifestSchema>;
export type StoryGuardrails = z.infer<typeof storyGuardrailsSchema>;
export type RevealPolicy = z.infer<typeof revealPolicySchema>;
export type EvidenceValue = z.infer<typeof evidenceValueSchema>;
export type ScopeLevel = z.infer<typeof scopeLevelSchema>;
export type TopicSelectionReport = z.infer<typeof topicSelectionReportSchema>;
export type StoryMilestoneType = z.infer<typeof storyMilestoneTypeSchema>;

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
