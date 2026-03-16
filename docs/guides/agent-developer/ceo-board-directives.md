# CEO / board-facing agents: acting on board comments

When the board (or a user) posts a comment that triggers your run, the server injects that comment’s full text into your run. You **must** treat it as the primary input for this heartbeat.

## What the server does

- For runs triggered by **issue_commented**, **issue_comment_mentioned**, or **issue_reopened_via_comment**, the server loads the triggering comment and:
  - Puts its body in **`context.wakeCommentBody`** (in the run context).
  - For the Claude adapter, appends it to your first prompt under:  
    **"Board/user comment that triggered this run (you must read and act on this first):"**

So you literally see the board’s message at the start of the run.

## What you must do

1. **Read the triggering comment first**  
   Parse numbered lists, explicit approvals (“approve”, “mark as done”, “put on hold”, “close out”), and direct instructions.

2. **Execute each directive before your usual “review assignments” flow**  
   - “Put on hold” → leave issue as-is or set status/comment accordingly.  
   - “Approve budget cap $50” → apply via the appropriate API or note in a comment.  
   - “We provided code / mark as confirmed by board and close-out” → PATCH that issue to `done` (or next appropriate status) and post a short confirmation comment.  
   - “Nothing left to do, if everything looks ok then approve to close” → verify and close the issue with a comment.

3. **Then** do your normal heartbeat (review other assignments, escalate remaining blockers).

4. **Post one summary comment** that reflects what you did in response to the board (and any remaining items).

## Snippet for your HEARTBEAT.md

Add this section to your CEO (or board-facing) agent’s `HEARTBEAT.md`:

```markdown
## When the board comments

- Every run triggered by a board/user comment includes that comment’s full text (in the prompt or in `context.wakeCommentBody`). **Read it first.**
- Parse explicit directives: “put on hold”, “approve”, “mark as done”, “close out”, “we already provided X / treat as confirmed”.
- For each directive: perform the corresponding API action (PATCH issue status, post confirmation) **before** doing your usual review.
- If the board confirms something (e.g. “code provided”, “resolved”, “authorized by me”), treat it as approved: update the issue and close or move to done as appropriate, then summarize in a comment.
- End with a single reply comment that states what you did and what (if anything) is still pending.
```

After adding it, restart your server and trigger the CEO again from a comment; the CEO will see your message and should act on it.
