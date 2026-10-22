"use client";

import { useTideCloak } from "@tidecloak/nextjs";
import { SIMULATED } from "./mode";
import { useSimTide } from "./sim/client";

// The one hook pages use for auth. SIMULATED is a build-time constant, so the same hook runs on
// every render.
export function useTide() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return (SIMULATED ? useSimTide() : useTideCloak()) as ReturnType<typeof useSimTide>;
}
