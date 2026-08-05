"use client";

import { useSyncExternalStore } from "react";
import {
  getServerUpdateSnapshot,
  getUpdateSnapshot,
  subscribeUpdate,
  type UpdateSnapshot,
} from "./update";

export function useUpdate(): UpdateSnapshot {
  return useSyncExternalStore(
    subscribeUpdate,
    getUpdateSnapshot,
    getServerUpdateSnapshot,
  );
}
