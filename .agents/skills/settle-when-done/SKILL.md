---
name: settle-when-done
description: Settle the current T3 Code thread only when the user explicitly requests it, work is complete and nothing needs attention. Outstanding queued work, deferred tasks and reminders keep the thread active.
---

# Settle when done

Settle your own T3 Code thread only when the user explicitly requests it, all assigned work is complete, required checks passed, and nothing needs the user's attention.

For completed implementation work without a passing full-suite run on the final contents, ask: "Run all test suites before settling this thread?" Wait for the answer. On approval, run [full validation](../dune-forward/SKILL.md#validation). If declined, report the skipped tests when settling. Failing tests block settlement until fixed and rerun successfully.

Before settling, review the conversation for unfinished requests and check `t3_queue_list` for newly queued messages. Check pending questions, approvals and background work when relevant. An empty execution queue does not mean the conversation has no outstanding work.

Keep the thread active if any of these remain:

- Queued or deferred work the user asked to handle later.
- A reminder the user requested that is still outstanding. Creating its timer or delivering the reminder does not mean the user has handled the reminded item.
- A failed or blocked task, required verification or activation, a question, approval, decision, or other action the user must handle.
- Work still running elsewhere whose result this thread must handle, or an explicit instruction to keep this thread open.

Invoking this skill is conditional permission to settle, not acceptance of pending decisions or cancellation of unfinished work. Clear an outstanding item only after verifying completion or the user's explicit cancellation of that specific item. A future workflow change, a mere handoff to another thread, or a settlement request does not clear it. For reminders and other user actions, wait for the user's confirmation that the item is handled or canceled. If anything remains, briefly name the blocker and leave the thread active. Do not cancel work or reminders to make the thread eligible for settlement. If uncertain, leave it active.

When the user explicitly requests settlement and nothing remains, make this your last tool call before the normal concise final reply:

```text
t3_thread_organize({ action: "settle" })
```

Omit `threadId` to target your own thread. Use the available MCP-prefixed name if needed. A response with `settlesWhenTurnEnds=true` schedules settlement after successful turn completion. A failed or interrupted turn, or a queued message, keeps it active. Do not claim it has already settled before the turn ends.

If the tool is unavailable or fails, report that limitation and leave the thread active. Do not substitute archiving or edit T3's database.
