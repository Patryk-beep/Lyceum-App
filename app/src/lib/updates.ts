import { check, type Update } from "@tauri-apps/plugin-updater";

export interface UpdateResult {
  available: boolean;
  version?: string;
  /** The pending update handle (present iff `available`) — call `downloadAndInstall()`. */
  update?: Update;
}

/**
 * Check GitHub Releases (`latest.json`) for a newer signed build. Verifies the `.sig`
 * against the configured pubkey under the hood. May throw — e.g. when no published
 * (non-draft) release exists yet — so the caller surfaces the error rather than crashing.
 */
export async function checkForUpdate(): Promise<UpdateResult> {
  const update = await check();
  if (update) {
    return { available: true, version: update.version, update };
  }
  return { available: false };
}
