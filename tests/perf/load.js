import { DEFAULT_THRESHOLDS } from "./lib/config.js";
import { runMarketplaceJourney } from "./lib/journeys.js";

const peak = Number(__ENV.PEAK_VUS || "1000");
const fast = __ENV.FAST === "1";

export const options = {
  scenarios: {
    load_1000_vus: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: fast
        ? [
            { duration: "10s", target: Math.round(peak * 0.25) },
            { duration: "15s", target: Math.round(peak * 0.6) },
            { duration: "20s", target: peak },
            { duration: "20s", target: peak },
            { duration: "10s", target: 0 },
          ]
        : [
            { duration: "1m", target: Math.round(peak * 0.2) },
            { duration: "2m", target: Math.round(peak * 0.5) },
            { duration: "2m", target: peak },
            { duration: "5m", target: peak },
            { duration: "1m", target: 0 },
          ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    http_req_duration: ["p(95)<1500", "p(99)<3000"],
  },
};

export default function () {
  runMarketplaceJourney();
}
