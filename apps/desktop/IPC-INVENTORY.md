# IPC inventory (no behavior change)

Source: `apps/desktop/contracts/ipc.ts` — **135** `desktopIpc` channels.

Behavior-unchanged listing for STRUCTURE-ALIGN step 1. Suggested first move: **threads** → `contracts/ipc/threads.ts`; barrel `contracts/ipc.ts` (or `ipc/index.ts`) re-exports; `electron/ipc/register-desktop-ipc.ts` stays aggregator only.

OWNERS map: Zones & threads → `lancer-zones.ts` + thread IPC from `ipc.ts`.

## By proposed domain

### settings (27)

- `setModelSettingsScopeMode` → `pi-gui:set-model-settings-scope-mode`
- `setDefaultModel` → `pi-gui:set-default-model`
- `setDefaultThinkingLevel` → `pi-gui:set-default-thinking-level`
- `loginProvider` → `pi-gui:login-provider`
- `logoutProvider` → `pi-gui:logout-provider`
- `setProviderApiKey` → `pi-gui:set-provider-api-key`
- `listCustomProviders` → `pi-gui:list-custom-providers`
- `setCustomProvider` → `pi-gui:set-custom-provider`
- `deleteCustomProvider` → `pi-gui:delete-custom-provider`
- `probeCustomProviderModels` → `pi-gui:probe-custom-provider-models`
- `setEnableSkillCommands` → `pi-gui:set-enable-skill-commands`
- `setScopedModelPatterns` → `pi-gui:set-scoped-model-patterns`
- `setSkillEnabled` → `pi-gui:set-skill-enabled`
- `setNotificationPreferences` → `pi-gui:set-notification-preferences`
- `setIntegratedTerminalShell` → `pi-gui:set-integrated-terminal-shell`
- `setEnableTransparency` → `pi-gui:set-enable-transparency`
- `setLocalControlEnabled` → `pi-gui:set-local-control-enabled`
- `getNotificationPermissionStatus` → `pi-gui:get-notification-permission-status`
- `requestNotificationPermission` → `pi-gui:request-notification-permission`
- `openSystemNotificationSettings` → `pi-gui:open-system-notification-settings`
- `notificationPermissionStatusChanged` → `pi-gui:notification-permission-status-changed`
- `getThemeMode` → `pi-gui:get-theme-mode`
- `getResolvedTheme` → `pi-gui:get-resolved-theme`
- `setThemeMode` → `pi-gui:set-theme-mode`
- `setLanguage` → `pi-gui:set-language`
- `setThemePresetId` → `pi-gui:set-theme-preset-id`
- `themeChanged` → `pi-gui:theme-changed`

### threads (21)

- `reorderPinnedSessions` → `pi-gui:reorder-pinned-sessions`
- `selectSession` → `pi-gui:select-session`
- `renameSession` → `pi-gui:rename-session`
- `archiveSession` → `pi-gui:archive-session`
- `unarchiveSession` → `pi-gui:unarchive-session`
- `markSessionRead` → `pi-gui:mark-session-read`
- `setSessionPinned` → `pi-gui:set-session-pinned`
- `createSession` → `pi-gui:create-session`
- `startThread` → `pi-gui:start-thread`
- `forkThread` → `pi-gui:fork-thread`
- `sendChildThreadFollowUp` → `pi-gui:send-child-thread-follow-up`
- `setSidebarCollapsed` → `pi-gui:set-sidebar-collapsed`
- `setThreadGrouping` → `pi-gui:set-thread-grouping`
- `setSessionModel` → `pi-gui:set-session-model`
- `setSessionThinkingLevel` → `pi-gui:set-session-thinking-level`
- `terminalCreateSession` → `pi-gui:terminal-create-session`
- `terminalSetActiveSession` → `pi-gui:terminal-set-active-session`
- `terminalRestartSession` → `pi-gui:terminal-restart-session`
- `terminalCloseSession` → `pi-gui:terminal-close-session`
- `getSessionTree` → `pi-gui:get-session-tree`
- `navigateSessionTree` → `pi-gui:navigate-session-tree`

### other (16)

- `setChildSupervisionLoop` → `pi-gui:set-child-supervision-loop`
- `openExternal` → `app:open-external`
- `relaunchApplication` → `pi-gui:relaunch-application`
- `doubaoAppStatus` → `pi-gui:doubao-app-status`
- `doubaoAppBind` → `pi-gui:doubao-app-bind`
- `doubaoAppSend` → `pi-gui:doubao-app-send`
- `doubaoAppRefresh` → `pi-gui:doubao-app-refresh`
- `doubaoAppSelect` → `pi-gui:doubao-app-select`
- `doubaoAppSetEnabled` → `pi-gui:doubao-app-set-enabled`
- `doubaoAppOpenVideo` → `pi-gui:doubao-app-open-video`
- `doubaoAppOpenAccessibilitySettings` → `pi-gui:doubao-app-open-accessibility-settings`
- `animationRead` → `pi-gui:animation-read`
- `animationCreate` → `pi-gui:animation-create`
- `animationExport` → `pi-gui:animation-export`
- `videoLearnRun` → `pi-gui:video-learn-run`
- `videoLearnStatus` → `pi-gui:video-learn-status`

### workbench (13)

- `getTaskWorkbenchTemplate` → `pi-gui:get-task-workbench-template`
- `saveTaskWorkbenchTemplate` → `pi-gui:save-task-workbench-template`
- `listWorkspaceFiles` → `pi-gui:list-workspace-files`
- `readWorkspaceFile` → `pi-gui:read-workspace-file`
- `revealWorkspaceFile` → `pi-gui:reveal-workspace-file`
- `getChangedFiles` → `pi-gui:get-changed-files`
- `getFileDiff` → `pi-gui:get-file-diff`
- `stageFile` → `pi-gui:stage-file`
- `getTurnChanges` → `pi-gui:get-turn-changes`
- `getReview` → `pi-gui:get-review`
- `getReviewFile` → `pi-gui:get-review-file`
- `setReviewFileReviewed` → `pi-gui:set-review-file-reviewed`
- `changeReviewFileStage` → `pi-gui:change-review-file-stage`

### composer (12)

- `clipboardImagePasted` → `pi-gui:clipboard-image-pasted`
- `pickComposerAttachments` → `pi-gui:pick-composer-attachments`
- `readClipboardImage` → `pi-gui:read-clipboard-image`
- `addComposerAttachments` → `pi-gui:add-composer-attachments`
- `removeComposerAttachment` → `pi-gui:remove-composer-attachment`
- `editQueuedComposerMessage` → `pi-gui:edit-queued-composer-message`
- `cancelQueuedComposerEdit` → `pi-gui:cancel-queued-composer-edit`
- `removeQueuedComposerMessage` → `pi-gui:remove-queued-composer-message`
- `steerQueuedComposerMessage` → `pi-gui:steer-queued-composer-message`
- `persistComposerDraft` → `pi-gui:persist-composer-draft`
- `updateComposerDraft` → `pi-gui:update-composer-draft`
- `submitComposer` → `pi-gui:submit-composer`

### workspace (12)

- `workspacePicked` → `pi-gui:workspace-picked`
- `addWorkspacePath` → `pi-gui:add-workspace-path`
- `pickWorkspace` → `pi-gui:pick-workspace`
- `selectWorkspace` → `pi-gui:select-workspace`
- `renameWorkspace` → `pi-gui:rename-workspace`
- `removeWorkspace` → `pi-gui:remove-workspace`
- `reorderWorkspaces` → `pi-gui:reorder-workspaces`
- `openWorkspaceInFinder` → `pi-gui:open-workspace-in-finder`
- `createWorktree` → `pi-gui:create-worktree`
- `removeWorktree` → `pi-gui:remove-worktree`
- `openSkillInFinder` → `pi-gui:open-skill-in-finder`
- `syncCurrentWorkspace` → `pi-gui:sync-current-workspace`

### extensions (9)

- `extensionViewOpenFile` → `pi-gui:extension-view-open-file`
- `listExtensionViews` → `pi-gui:list-extension-views`
- `openExtensionView` → `pi-gui:open-extension-view`
- `sendExtensionViewMessage` → `pi-gui:send-extension-view-message`
- `closeExtensionView` → `pi-gui:close-extension-view`
- `extensionViewMessage` → `pi-gui:extension-view-message`
- `extensionViewCatalogChanged` → `pi-gui:extension-view-catalog-changed`
- `openExtensionInFinder` → `pi-gui:open-extension-in-finder`
- `setExtensionEnabled` → `pi-gui:set-extension-enabled`

### terminal (9)

- `terminalEnsurePanel` → `pi-gui:terminal-ensure-panel`
- `terminalWrite` → `pi-gui:terminal-write`
- `terminalResize` → `pi-gui:terminal-resize`
- `terminalSetTitle` → `pi-gui:terminal-set-title`
- `terminalSetFocused` → `pi-gui:terminal-set-focused`
- `sidePanelSetFocused` → `pi-gui:side-panel-set-focused`
- `terminalData` → `pi-gui:terminal-data`
- `terminalExit` → `pi-gui:terminal-exit`
- `terminalError` → `pi-gui:terminal-error`

### conversation (6)

- `selectedTranscriptRequest` → `pi-gui:selected-transcript-request`
- `selectedTranscriptChanged` → `pi-gui:selected-transcript-changed`
- `cancelCurrentRun` → `pi-gui:cancel-current-run`
- `setActiveView` → `pi-gui:set-active-view`
- `refreshRuntime` → `pi-gui:refresh-runtime`
- `respondToHostUiRequest` → `pi-gui:respond-to-host-ui-request`

### windows (6)

- `stateRequest` → `pi-gui:state-request`
- `stateChanged` → `pi-gui:state-changed`
- `appCommand` → `pi-gui:app-command`
- `toggleWindowMaximize` → `pi-gui:toggle-window-maximize`
- `windowFocused` → `pi-gui:window-focused`
- `ping` → `app:ping`

### scheduled-tasks (4)

- `createScheduledTask` → `pi-gui:create-scheduled-task`
- `updateScheduledTask` → `pi-gui:update-scheduled-task`
- `deleteScheduledTask` → `pi-gui:delete-scheduled-task`
- `beginScheduledTaskInterview` → `pi-gui:begin-scheduled-task-interview`

## 2026-10-28 implementation addition

`lancerAction` → `pi-gui:lancer-action` is registered in the threads domain. `decodeLancerAction` validates profile edits, ownership transfers, conversation creation and explicit-parent parallel dispatch. The main-frame/window action queue remains the entry point; the renderer receives no filesystem or runtime handles. `startThread` now accepts optional `assistantId` and `lancerZone` fields.
