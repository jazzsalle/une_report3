"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** localStorage persist 스토어를 사용하는 화면의 SSR/CSR 불일치 방지 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
