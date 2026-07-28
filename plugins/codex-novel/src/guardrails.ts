import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse } from "yaml";
import {
  chapterContractV3Schema,
  characterProfileSchema,
  continuityStoreSchema,
  evidenceValueSchema,
  marketPositionSchema,
  revealPolicySchema,
  scopeLevelSchema,
  storyGuardrailsSchema,
  type ScopeLevel
} from "./schema.js";
import { readState } from "./io.js";

const SCOPE_ORDER: ScopeLevel[] = [
  "household",
  "village",
  "county",
  "prefecture",
  "province",
  "court",
  "national"
];

async function readGuardrails(workspace: string) {
  return storyGuardrailsSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "story-guardrails.yaml"), "utf8"))
  );
}

async function readRevealPolicy(workspace: string) {
  return revealPolicySchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "reveal-policy.yaml"), "utf8"))
  );
}

async function readEvidence(workspace: string) {
  const store = continuityStoreSchema.parse(
    parse(await fs.readFile(path.join(workspace, "continuity", "evidence.yaml"), "utf8"))
  );
  return new Map(
    store.entries
      .filter((entry) => entry.status === "active")
      .map((entry) => [entry.id, evidenceValueSchema.parse(entry.value)])
  );
}

async function readCharacterAliases(workspace: string): Promise<Map<string, string>> {
  const profileDirectory = path.join(workspace, "planning", "characters");
  const profileFiles = (await fs.readdir(profileDirectory))
    .filter((file) => file.endsWith(".yaml"));
  const aliases = new Map<string, string>();
  for (const file of profileFiles) {
    const profile = characterProfileSchema.parse(
      parse(await fs.readFile(path.join(profileDirectory, file), "utf8"))
    );
    aliases.set(profile.id, profile.id);
    aliases.set(profile.name, profile.id);
  }
  return aliases;
}

export async function validateStoryGuardrails(workspace: string): Promise<void> {
  const guardrails = await readGuardrails(workspace);
  const policy = await readRevealPolicy(workspace);
  const position = marketPositionSchema.parse(
    parse(await fs.readFile(path.join(workspace, "planning", "market-position.yaml"), "utf8"))
  );
  if (position.workForm === "long-serial" && policy.reveals.length === 0) {
    throw new Error("Long serial production requires at least one scheduled reveal.");
  }
  const characterAliases = await readCharacterAliases(workspace);
  const unknownCapabilities = guardrails.capabilityBoundaries
    .map((boundary) => boundary.characterId)
    .filter((id) => !characterAliases.has(id));
  const unknownSupporting = guardrails.supportingCharacters
    .map((character) => character.characterId)
    .filter((id) => !characterAliases.has(id));
  if (unknownCapabilities.length > 0 || unknownSupporting.length > 0) {
    throw new Error(
      `Story guardrails reference unknown character profiles. Capabilities: ` +
      `${unknownCapabilities.join(", ") || "none"}; supporting: ` +
      `${unknownSupporting.join(", ") || "none"}.`
    );
  }
}

export async function inspectRevealPolicy(workspace: string): Promise<{
  chapter: number;
  planned: number;
  dueNow: string[];
  overdue: string[];
  delayed: Array<{ id: string; reason: string }>;
  protected: Array<{ id: string; earliestChapter: number; targetChapter: number }>;
}> {
  const [state, policy] = await Promise.all([readState(workspace), readRevealPolicy(workspace)]);
  const chapter = state.workflow.currentChapter;
  const planned = policy.reveals.filter(
    (reveal) => reveal.status === "planned" || reveal.status === "delayed"
  );
  return {
    chapter,
    planned: planned.length,
    dueNow: planned
      .filter((reveal) => reveal.targetChapter === chapter)
      .map((reveal) => reveal.id),
    overdue: planned
      .filter((reveal) => reveal.status === "planned")
      .filter((reveal) => reveal.latestChapter < chapter)
      .map((reveal) => reveal.id),
    delayed: policy.reveals
      .filter((reveal) => reveal.status === "delayed")
      .map((reveal) => ({ id: reveal.id, reason: reveal.delayReason ?? "unspecified" })),
    protected: planned
      .filter((reveal) => reveal.earliestChapter > chapter)
      .map((reveal) => ({
        id: reveal.id,
        earliestChapter: reveal.earliestChapter,
        targetChapter: reveal.targetChapter
      }))
  };
}

export async function validateChapterGuardrails(
  workspace: string,
  rawContract: unknown
): Promise<void> {
  const contract = chapterContractV3Schema.parse(rawContract);
  const [guardrails, policy, evidence, characterAliases] = await Promise.all([
    readGuardrails(workspace),
    readRevealPolicy(workspace),
    readEvidence(workspace),
    readCharacterAliases(workspace)
  ]);
  const issues: string[] = [];
  const canonical = (id: string): string => characterAliases.get(id) ?? id;
  const participants = new Set(contract.participants.map(canonical));
  const nonPresentParticipants = new Set(contract.nonPresentParticipants.map(canonical));

  if (
    SCOPE_ORDER.indexOf(scopeLevelSchema.parse(contract.scopeLevel)) >
    SCOPE_ORDER.indexOf(guardrails.maxScope)
  ) {
    issues.push(
      `Chapter scope ${contract.scopeLevel} exceeds the approved ceiling ${guardrails.maxScope}.`
    );
  }
  if (contract.antagonistLayer > guardrails.maxHiddenAntagonistLayers) {
    issues.push(
      `Antagonist layer ${contract.antagonistLayer} exceeds the approved ceiling ` +
      `${guardrails.maxHiddenAntagonistLayers}. Reinterpret existing evidence instead of adding a new mastermind.`
    );
  }

  const capabilityBoundaries = new Map(
    guardrails.capabilityBoundaries.map((boundary) => [
      canonical(boundary.characterId),
      {
        allowed: new Set(boundary.allowed.map((capability) => capability.id)),
        requiresSupportFor: new Set(boundary.requiresSupportFor)
      }
    ])
  );
  for (const use of contract.capabilityUses) {
    const characterId = canonical(use.characterId);
    if (!participants.has(characterId)) {
      issues.push(`Capability user is not a chapter participant: ${use.characterId}.`);
      continue;
    }
    if (nonPresentParticipants.has(characterId)) {
      issues.push(`A non-present character cannot perform a capability use: ${use.characterId}.`);
    }
    const boundary = capabilityBoundaries.get(characterId);
    if (!boundary?.allowed.has(use.capabilityId)) {
      issues.push(
        `Undeclared capability ${use.capabilityId} for ${use.characterId}; replan or revise guardrails explicitly.`
      );
    }
    if (boundary?.requiresSupportFor.has(use.capabilityId) && !use.supportCharacterId) {
      issues.push(
        `Capability ${use.capabilityId} for ${use.characterId} requires a named support character.`
      );
    }
    if (
      use.supportCharacterId &&
      (!participants.has(canonical(use.supportCharacterId)) ||
        nonPresentParticipants.has(canonical(use.supportCharacterId)))
    ) {
      issues.push(`Capability support character is not present: ${use.supportCharacterId}.`);
    }
  }

  if (contract.coincidences.length > guardrails.investigationRules.coincidenceBudgetPerChapter) {
    issues.push(
      `Coincidence budget exceeded: ${contract.coincidences.length}/` +
      `${guardrails.investigationRules.coincidenceBudgetPerChapter}.`
    );
  }

  const agencyIds = new Set(
    contract.supportingCharacterAgency.map((agency) => canonical(agency.characterId))
  );
  for (const supporting of guardrails.supportingCharacters) {
    const supportingId = canonical(supporting.characterId);
    if (
      participants.has(supportingId) &&
      !nonPresentParticipants.has(supportingId) &&
      !agencyIds.has(supportingId)
    ) {
      issues.push(`Participating supporting character lacks an independent decision: ${supporting.characterId}.`);
    }
  }

  const reveals = new Map(policy.reveals.map((reveal) => [reveal.id, reveal]));
  for (const revealId of contract.revealIds) {
    const reveal = reveals.get(revealId);
    if (!reveal) {
      issues.push(`Unknown reveal ID: ${revealId}.`);
      continue;
    }
    if (contract.chapter < reveal.earliestChapter) {
      issues.push(
        `Reveal ${revealId} is protected until chapter ${reveal.earliestChapter}; current chapter is ${contract.chapter}.`
      );
    }
    if (contract.chapter > reveal.latestChapter && reveal.status !== "delayed") {
      issues.push(
        `Reveal ${revealId} is past latest chapter ${reveal.latestChapter}. ` +
        "Mark it delayed with a reason before replanning the payoff."
      );
    }
    if (reveal.status === "revealed" || reveal.status === "cancelled") {
      issues.push(`Reveal ${revealId} is already ${reveal.status}.`);
    }
    const missingPrerequisites = reveal.prerequisiteEvidenceIds.filter((id) => {
      const item = evidence.get(id);
      return !item || !["corroborated", "admitted"].includes(item.status);
    });
    if (missingPrerequisites.length > 0) {
      issues.push(
        `Reveal ${revealId} lacks corroborated prerequisites: ${missingPrerequisites.join(", ")}.`
      );
    }
  }

  for (const move of contract.evidenceMoves) {
    const existing = evidence.get(move.evidenceId);
    if (move.action !== "discover" && !existing) {
      issues.push(`Evidence action ${move.action} references missing evidence: ${move.evidenceId}.`);
    }
    if (move.action === "discover" && existing) {
      issues.push(`Evidence ${move.evidenceId} already exists and cannot be discovered again.`);
    }
  }

  if (issues.length > 0) {
    throw new Error(`Chapter guardrails failed:\n- ${issues.join("\n- ")}`);
  }
}

export async function guardrailSummary(workspace: string): Promise<{
  premise: string;
  signatureMechanism: string;
  maxScope: ScopeLevel;
  maxHiddenAntagonistLayers: number;
  capabilityCharacters: number;
  coincidenceBudget: number;
  prohibitedModernTerms: string[];
  prohibitedShortcuts: string[];
}> {
  const guardrails = await readGuardrails(workspace);
  return {
    premise: guardrails.corePremise.oneSentence,
    signatureMechanism: guardrails.corePremise.signatureMechanism,
    maxScope: guardrails.maxScope,
    maxHiddenAntagonistLayers: guardrails.maxHiddenAntagonistLayers,
    capabilityCharacters: guardrails.capabilityBoundaries.length,
    coincidenceBudget: guardrails.investigationRules.coincidenceBudgetPerChapter,
    prohibitedModernTerms: guardrails.periodRules.prohibitedModernTerms,
    prohibitedShortcuts: guardrails.prohibitedNarrativeShortcuts
  };
}
