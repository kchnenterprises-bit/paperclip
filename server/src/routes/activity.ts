import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { activityService } from "../services/activity.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { issueService } from "../services/index.js";
import { sanitizeRecord } from "../redaction.js";

const createActivitySchema = z.object({
  actorType: z.enum(["agent", "user", "system"]).optional().default("system"),
  actorId: z.string().min(1),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  agentId: z.string().uuid().optional().nullable(),
  details: z.record(z.unknown()).optional().nullable(),
});

export function activityRoutes(db: Db) {
  const router = Router();
  const svc = activityService(db);
  const issueSvc = issueService(db);

  async function resolveIssueByRef(rawId: string) {
    if (/^[A-Z]+-\d+$/i.test(rawId)) {
      return issueSvc.getByIdentifier(rawId);
    }
    return issueSvc.getById(rawId);
  }

  router.get("/companies/:companyId/activity", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const filters = {
      companyId,
      agentId: req.query.agentId as string | undefined,
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
    };
    const result = await svc.list(filters);
    res.json(result);
  });

  router.post("/companies/:companyId/activity", validate(createActivitySchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const event = await svc.create({
      companyId,
      ...req.body,
      details: req.body.details ? sanitizeRecord(req.body.details) : null,
    });
    res.status(201).json(event);
  });

  router.get("/issues/:id/activity", async (req, res) => {
    const rawId = req.params.id as string;
    const issue = await resolveIssueByRef(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const result = await svc.forIssue(issue.id);
    res.json(result);
  });

  router.get("/issues/:id/runs", async (req, res) => {
    const rawId = req.params.id as string;
    const issue = await resolveIssueByRef(rawId);
    if (!issue) {
      res.status(404).json({ error: "Issue not found" });
      return;
    }
    assertCompanyAccess(req, issue.companyId);
    const [rows, activityRows] = await Promise.all([
      svc.runsForIssue(issue.companyId, issue.id),
      svc.forIssue(issue.id),
    ]);
    const runCreatedAtByRunId = new Map(
      rows.map((r: Record<string, unknown>) => [r.runId as string, new Date((r.createdAt as string) ?? 0).getTime()]),
    );
    const commentAddedWithoutRun = activityRows
      .filter(
        (evt) =>
          evt.action === "issue.comment_added" &&
          evt.runId == null &&
          typeof (evt.details as Record<string, unknown>)?.commentId === "string",
      )
      .map((evt) => ({
        commentId: (evt.details as Record<string, unknown>).commentId as string,
        createdAt: new Date(evt.createdAt).getTime(),
      }));
    const result = rows.map((row: Record<string, unknown>) => {
      let triggerCommentId =
        (row.triggerCommentId as string | null) ?? (row.trigger_comment_id as string | null) ?? null;
      if (!triggerCommentId) {
        const runCreated = runCreatedAtByRunId.get(row.runId as string);
        if (runCreated != null) {
          const beforeRun = commentAddedWithoutRun
            .filter((c) => c.createdAt < runCreated)
            .sort((a, b) => b.createdAt - a.createdAt);
          if (beforeRun.length > 0) triggerCommentId = beforeRun[0].commentId;
        }
      }
      const { trigger_comment_id: _unused, ...rest } = row;
      return { ...rest, triggerCommentId: triggerCommentId || null };
    });
    res.json(result);
  });

  router.get("/heartbeat-runs/:runId/issues", async (req, res) => {
    const runId = req.params.runId as string;
    const result = await svc.issuesForRun(runId);
    res.json(result);
  });

  return router;
}
