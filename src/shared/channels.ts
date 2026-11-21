export const IPC_CHANNELS = {
  // Engine actions
  ENGINE_START_RUN: 'engine:start-run',
  ENGINE_STOP_RUN: 'engine:stop-run',
  ENGINE_PAUSE_ALL: 'engine:pause-all',
  ENGINE_RESUME_ALL: 'engine:resume-all',
  ENGINE_TRACK_ACTION: 'engine:track-action',
  ENGINE_GET_STATE: 'engine:get-state',

  // Store queries & mutations
  STORE_GET_SETTINGS: 'store:get-settings',
  STORE_SAVE_SETTINGS: 'store:save-settings',
  STORE_GET_GAMES: 'store:get-games',
  STORE_ADD_GAME: 'store:add-game',
  STORE_REMOVE_GAME: 'store:remove-game',
  STORE_GET_PROFILES: 'store:get-profiles',
  STORE_SAVE_PROFILE: 'store:save-profile',
  STORE_GET_CUSTOM_PATTERNS: 'store:get-custom-patterns',
  STORE_SAVE_CUSTOM_PATTERN: 'store:save-custom-pattern',
  STORE_DELETE_CUSTOM_PATTERN: 'store:delete-custom-pattern',
  STORE_GET_HISTORY: 'store:get-history',

  // Steam & Client
  STEAM_RESOLVE_APP: 'steam:resolve-app',
  STEAM_ADD_FREE_LICENSE: 'steam:add-free-license',
  STEAM_GET_CLIENT_STATUS: 'steam:get-client-status',
  STEAM_LAUNCH_CLIENT: 'steam:launch-client',
  STEAM_TEST_API_KEY: 'steam:test-api-key',
  STEAM_SAVE_API_KEY: 'steam:save-api-key',
  STEAM_REMOVE_API_KEY: 'steam:remove-api-key',
  STEAM_GET_HOURS_STATUS: 'steam:get-hours-status',
  STEAM_REFRESH_HOURS: 'steam:refresh-hours',

  // System & Window
  SYSTEM_WINDOW_MINIMIZE: 'system:window-minimize',
  SYSTEM_WINDOW_CLOSE: 'system:window-close',
  SYSTEM_GET_LOGS: 'system:get-logs',
  SYSTEM_EXPORT_DIAGNOSTICS: 'system:export-diagnostics',
  SYSTEM_OPEN_EXTERNAL_URL: 'system:open-external-url',
  SYSTEM_OPEN_LAUNCH_PICKER: 'system:open-launch-picker',
  APP_CONSUME_PENDING_ROUTE: 'app:consumePendingRoute',
  APP_GET_VERSION: 'app:get-version',

  // Goals (M11 Catch-Up Goal)
  GOAL_GET_ALL: 'goal:get-all',
  GOAL_SAVE: 'goal:save',
  GOAL_DELETE: 'goal:delete',
  GOAL_GET_PACING: 'goal:get-pacing',
  GOAL_CHECK_FRIEND: 'goal:check-friend',

  // Backup & Restore (M12)
  BACKUP_EXPORT: 'backup:export',
  BACKUP_SELECT_SAVE_PATH: 'backup:select-save-path',
  BACKUP_SELECT_IMPORT_FILE: 'backup:select-import-file',
  BACKUP_PREVIEW: 'backup:preview',
  BACKUP_APPLY: 'backup:apply',
  BACKUP_GET_AUTO_LIST: 'backup:get-auto-list',
  BACKUP_RESTORE_AUTO: 'backup:restore-auto',

  // Push events to renderer
  EVENT_ENGINE_STATE: 'event:engine-state',
  EVENT_LOG_LINE: 'event:log-line',
  EVENT_TOAST: 'event:toast',
  EVENT_HOURS_UPDATED: 'event:hours-updated',
  EVENT_GOALS_UPDATED: 'event:goals-updated',
  EVENT_NAVIGATE: 'event:navigate',
  EVENT_SETTINGS_UPDATED: 'event:settings-updated'
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

