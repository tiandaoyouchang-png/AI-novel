import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse, stringify } from "yaml";
import {
  chapterContractSchema,
  chapterReviewSchema,
  logicDebtLedgerSchema,
  type ChapterContract,
  type LogicDebtLedger
} from "./schema.js";
import { atomicWriteText, pathExists, readState } from "./io.js";

export const LOGIC_DEBT_FILE = "planning/logic-debts.yaml";

export async function readLogicDebtLedger(workspace: string): Promise<LogicDebtLedger> {
  const target = path.join(workspace, LOGIC_DEBT_FILE);
  if (!(await pathExists(target))) {
    return { schemaVersion: 1, debts: [] };
  }
  return logicDebtLedgerSchema.parse(parse(await fs.readFile(target, "utf8")));
}

export async function writeLogicDebtLedger(
  workspace: string,
  ledger: LogicDebtLedger
): Promise<void> {
  await atomicWriteText(
    path.join(workspace, LOGIC_DEBT_FILE),
    stringify(logicDebtLedgerSchema.parse(ledger), { lineWidth: 0 })
  );
}

export async function inspectLogicDebts(workspace: string): Promise<{
  chapter: number;
  open: LogicDebtLedger["debts"];
  dueNow: LogicDebtLedger["debts"];
  overdue: LogicDebtLedger["debts"];
  upcoming: LogicDebtLedger["debts"];
}> {
  const [state, ledger] = await Promise.all([
    readState(workspace),
    readLogicDebtLedger(workspace)
  ]);
  const open = ledger.debts.filter((debt) => debt.status === "open");
  return {
    chapter: state.workflow.currentChapter,
    open,
    dueNow: open.filter((debt) => debt.dueChapter === state.workflow.currentChapter),
    overdue: open.filter((debt) => debt.dueChapter < state.workflow.currentChapter),
    upcoming: open.filter((debt) => debt.dueChapter > state.workflow.currentChapter)
  };
}

export async function validateContractLogicDebts(
  workspace: string,
  contract: ChapterContract
): Promise<void> {
  if (contract.schemaVersion !== 3) return;
  const ledger = await readLogicDebtLedger(workspace);
  const known = new Map(ledger.debts.map((debt) => [debt.id, debt]));
  const declared = new Set(contract.logicDebtResolutions.map((item) => item.debtId));
  const unknown = [...declared].filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(`Chapter contract references unknown logic debts: ${unknown.join(", ")}`);
  }
  const due = ledger.debts
    .filter((debt) => debt.status === "open" && debt.dueChapter <= contract.chapter)
    .map((debt) => debt.id);
  const missing = due.filter((id) => !declared.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Chapter ${contract.chapter} must resolve due logic debts: ${missing.join(", ")}`
    );
  }
}

export function validateReviewLogicDebts(
  contract: ChapterContract,
  review: ReturnType<typeof chapterReviewSchema.parse>
): void {
  if (contract.schemaVersion !== 3) return;
  const required = new Set(contract.logicDebtResolutions.map((item) => item.debtId));
  const checks = new Map(review.debtChecks.map((check) => [check.debtId, check]));
  const missing = [...required].filter((id) => !checks.has(id));
  if (missing.length > 0) {
    throw new Error(`Review must check planned logic debt resolutions: ${missing.join(", ")}`);
  }
  const failed = [...required].filter((id) => checks.get(id)?.status !== "pass");
  if (failed.length > 0) {
    throw new Error(`Logic debt review checks must pass before acceptance: ${failed.join(", ")}`);
  }
}

export async function resolvedLogicDebtLedger(
  workspace: string,
  contract: ReturnType<typeof chapterContractSchema.parse>,
  review: ReturnType<typeof chapterReviewSchema.parse> | null
): Promise<LogicDebtLedger> {
  const ledger = await readLogicDebtLedger(workspace);
  if (contract.schemaVersion !== 3 || contract.logicDebtResolutions.length === 0) {
    return ledger;
  }
  if (!review) {
    throw new Error("Logic debt resolution requires a source-bound chapter review.");
  }
  validateReviewLogicDebts(contract, review);
  const checks = new Map(review.debtChecks.map((check) => [check.debtId, check]));
  const targetIds = new Set(contract.logicDebtResolutions.map((item) => item.debtId));
  const updated: LogicDebtLedger = {
    schemaVersion: 1,
    debts: ledger.debts.map((debt) => {
      if (!targetIds.has(debt.id)) return debt;
      if (debt.status !== "open") {
        throw new Error(`Logic debt is not open and cannot be resolved again: ${debt.id}`);
      }
      return {
        ...debt,
        status: "resolved" as const,
        resolvedChapter: contract.chapter,
        resolutionEvidence: checks.get(debt.id)!.evidence
      };
    })
  };
  const found = new Set(updated.debts.map((debt) => debt.id));
  const unknown = [...targetIds].filter((id) => !found.has(id));
  if (unknown.length > 0) {
    throw new Error(`Cannot resolve unknown logic debts: ${unknown.join(", ")}`);
  }
  return logicDebtLedgerSchema.parse(updated);
}
