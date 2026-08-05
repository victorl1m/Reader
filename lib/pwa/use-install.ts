"use client";

import { useSyncExternalStore } from "react";
import {
  getInstallSnapshot,
  getServerInstallSnapshot,
  subscribeInstall,
  type InstallSnapshot,
} from "./install";

export function useInstall(): InstallSnapshot {
  return useSyncExternalStore(
    subscribeInstall,
    getInstallSnapshot,
    getServerInstallSnapshot,
  );
}
