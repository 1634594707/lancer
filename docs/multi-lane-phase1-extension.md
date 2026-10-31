# Multi-lane chat — phase 1 extension point

Phase 1 renders **one trajectory lane** from the active session’s Pi session tree (`getSessionTree`). Parallel lanes are modeled but not fully wired in the UI.

## Lane identity

| Source                                  | Maps to                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Current workspace + session             | Primary lane (`buildDefaultLanes` in `session-trajectory/trajectory-model.ts`)                    |
| `DesktopAppState.orchestrationChildren` | Additional lane headers when `childSessionId` shares the same parent session                      |
| Git worktree per workspace              | Future: `lane = worktree` by resolving `WorkspaceRecord` / worktree metadata on each child thread |

## Recommended next steps

1. **Handoff package** — use stable Pi entry ids (`sourceMessageId` / session tree node id) plus content hashes from the session file; avoid inventing a parallel id scheme.
2. **Lane = worktree** — when `create_child_thread` gains a worktree option, set `TrajectoryLane.workspaceId` to the child workspace and load each lane’s tree via `getSessionTree` for that session.
3. **Cross-lane trajectory** — merge flattened nodes from multiple trees with `laneId` and horizontal offsets (see HTML prototype `mlc.js`).

Rollback / branch navigation remains on the existing `navigateSessionTree` path (`TreeModal`, `use-tree-fork-modals`); the trajectory panel only scrolls/highlights in phase 1.
