import * as path from "node:path";
import { pathExists, readState } from "./io.js";
import { validateWorkspace } from "./workspace.js";

export type DoctorCheck = {
  id: string;
  ok: boolean;
  message: string;
  action: string | null;
};

export async function runDoctor(workspace?: string): Promise<{
  ok: boolean;
  nodeVersion: string;
  workspace: string | null;
  checks: DoctorCheck[];
}> {
  const checks: DoctorCheck[] = [];
  const major = Number(process.versions.node.split(".")[0]);
  checks.push({
    id: "node",
    ok: major >= 22,
    message: major >= 22
      ? `Node.js ${process.versions.node} 满足最低版本要求。`
      : `当前 Node.js ${process.versions.node} 低于最低要求 22。`,
    action: major >= 22 ? null : "请安装 Node.js 22 或更高版本后重新运行。"
  });
  const [nodeMajor, nodeMinor] = process.versions.node.split(".").map(Number);
  const hasNodeSqlite = (nodeMajor ?? 0) > 22 || (
    nodeMajor === 22 && (nodeMinor ?? 0) >= 5
  );
  if (hasNodeSqlite) {
    checks.push({
      id: "sqlite",
      ok: true,
      message: "全文检索组件可以使用。",
      action: null
    });
  } else {
    checks.push({
      id: "sqlite",
      ok: false,
      message: "当前 Node.js 不提供 SQLite 全文检索组件。",
      action: "升级 Node.js；其他创作功能仍可使用，但 index/search 暂不可用。"
    });
  }

  if (workspace) {
    const resolved = path.resolve(workspace);
    const statePath = path.join(resolved, "novel-state.yaml");
    const exists = await pathExists(statePath);
    checks.push({
      id: "workspace",
      ok: exists,
      message: exists ? "已找到小说工作区。" : "没有找到 novel-state.yaml。",
      action: exists ? null : `请确认路径，或运行 novelctl init ${workspace} --title "书名"。`
    });
    if (exists) {
      try {
        await validateWorkspace(resolved);
        checks.push({
          id: "integrity",
          ok: true,
          message: "工作区结构、权威状态和连续性文件验证通过。",
          action: null
        });
      } catch (error) {
        checks.push({
          id: "integrity",
          ok: false,
          message: error instanceof Error ? error.message : String(error),
          action: "先按提示恢复或修复，再继续生成正文。"
        });
      }
    }
  }

  return {
    ok: checks.every((check) => check.ok),
    nodeVersion: process.versions.node,
    workspace: workspace ? path.resolve(workspace) : null,
    checks
  };
}

export async function guideWorkspace(workspace: string): Promise<{
  title: string;
  nextAction: string;
  prompt: string;
}> {
  const state = await readState(workspace);
  if (state.workflow.blockingReason) {
    return {
      title: state.novel.title,
      nextAction: "先处理阻塞原因",
      prompt:
        `请读取 Codex Novel Skill，检查 ${workspace}。当前阻塞原因：` +
        `${state.workflow.blockingReason}。先验证并给出一个可恢复的修复动作，不要继续写正文。`
    };
  }
  if (state.workflow.phase === "preview") {
    return {
      title: state.novel.title,
      nextAction: "完成选题与开篇钩子实验",
      prompt:
        `请读取 Codex Novel Skill，继续 ${workspace}。先完成市场扫描、至少三个原创选题，` +
        "再为入选题生成二到三个匿名开篇钩子，定义读者测试信号并记录淘汰原因。不要直接写正文。"
    };
  }
  if (state.workflow.phase === "brief_approved") {
    return {
      title: state.novel.title,
      nextAction: "完成人物与世界基础设定",
      prompt:
        `请读取 Codex Novel Skill，继续 ${workspace}。根据已批准选题和开篇钩子，` +
        "完善故事圣经、世界规则、角色卡、风格设定、核心边界和揭秘时间表，重要设定等我确认。"
    };
  }
  if (state.workflow.phase === "foundation_approved") {
    return {
      title: state.novel.title,
      nextAction: "完成卷计划与弧线网格",
      prompt:
        `请读取 Codex Novel Skill，继续 ${workspace}。建立当前卷计划和跨卷弧线网格，` +
        "为主线、支线和角色弧设置推进节拍、兑现目标与最大闲置章节数。"
    };
  }
  if (state.workflow.phase === "completed") {
    return {
      title: state.novel.title,
      nextAction: "导出或复盘",
      prompt:
        `请检查 ${workspace} 的最终里程碑和发布数据，生成复盘；如已验收，导出 DOCX 或 EPUB。`
    };
  }
  const actionByStatus = {
    not_started: "规划下一章场景细纲",
    planned: "撰写章节草稿",
    drafted: "执行质量检查与审稿",
    reviewed: "按审稿结论修订或验收",
    accepted: "提交动态角色与剧情连续性",
    continuity_committed: "进入下一章"
  } as const;
  return {
    title: state.novel.title,
    nextAction: actionByStatus[state.workflow.chapterStatus],
    prompt:
      `请读取 Codex Novel Skill，检查 ${workspace} 的 status、validate、cards 和 arcs，` +
      `保留已验收内容，只执行当前章节状态 ${state.workflow.chapterStatus} 允许的下一步。`
  };
}

export function friendlyError(message: string): string {
  if (message.trimStart().startsWith("[")) {
    try {
      const issues = JSON.parse(message) as Array<{ path?: Array<string | number>; message?: string }>;
      if (Array.isArray(issues) && issues.length > 0) {
        return [
          "文件字段校验失败，权威状态没有推进。",
          "",
          ...issues.map(
            (issue) =>
              `- ${(issue.path ?? []).join(".") || "根字段"}：${issue.message ?? "值不符合格式要求"}`
          ),
          "",
          "请修正上述字段后重新运行；不要手动修改 novel-state.yaml。"
        ].join("\n");
      }
    } catch {
      // Keep the original error when it is not a Zod issue array.
    }
  }
  if (message.includes("continuity transaction is incomplete")) {
    return `${message}\n\n上一次角色/剧情状态更新没有完整结束。已验收正文不会被修改；请先运行 recover。`;
  }
  if (message.includes("Accepted artifacts changed after approval")) {
    return `${message}\n\n已批准设定后来被改动。请先确认改动范围，再使用 invalidate 让依赖内容明确失效。`;
  }
  if (
    message.includes("ENOENT") &&
    (
      message.includes("story-guardrails.yaml") ||
      message.includes("reveal-policy.yaml") ||
      message.includes("evidence.yaml")
    )
  ) {
    return (
      `${message}\n\n这是 v0.4 新增的质量门禁文件。不要让系统自动猜测旧书规则；` +
      "请参照 README 的“从 v0.3 升级工作区”补齐文件，再作废并重新批准基础设定。"
    );
  }
  if (message.includes("No continuity-committed chapters are available to export")) {
    return `${message}\n\n只有完成正文验收并提交角色/剧情连续性的章节才能导出。`;
  }
  if (message.includes("ENOENT") && message.includes("novel-state.yaml")) {
    return `${message}\n\n没有找到小说工作区。请检查路径，或先运行 init/guide 创建作品。`;
  }
  return message;
}
