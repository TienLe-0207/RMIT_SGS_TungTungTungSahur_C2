// Which TideCloak the app talks to. "simulated" (default, per the organisers' guidance while our
// realm's licence step fails) or "live" for a real TideCloak realm bootstrapped by `npm run init`.
export const SIMULATED = process.env.NEXT_PUBLIC_TIDE_MODE !== "live";
