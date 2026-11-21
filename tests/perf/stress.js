import { runMarketplaceJourney } from "./lib/journeys.js";

const fast = __ENV.FAST === "1";

export const options = {
  scenarios: {
    stress_beyond_1000: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: fast
        ? [
            { duration: "10s", target: 500 },
            { duration: "15s", target: 1000 },
            { duration: "15s", target: 1500 },
            { duration: "10s", target: 0 },
          ]
        : [
            { duration: "2m", target: 500 },
            { duration: "3m", target: 1000 },
            { duration: "3m", target: 1500 },
            { duration: "2m", target: 0 },
          ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

export default function () {
  runMarketplaceJourney();
}
