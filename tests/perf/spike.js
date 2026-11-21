import { runMarketplaceJourney } from "./lib/journeys.js";

const peak = Number(__ENV.PEAK_VUS || "1000");
const fast = __ENV.FAST === "1";

export const options = {
  scenarios: {
    spike_sudden_burst: {
      executor: "ramping-vus",
      startVUs: 20,
      stages: fast
        ? [
            { duration: "5s", target: 20 },
            { duration: "8s", target: peak },
            { duration: "15s", target: peak },
            { duration: "8s", target: 20 },
            { duration: "5s", target: 0 },
          ]
        : [
            { duration: "30s", target: 20 },
            { duration: "15s", target: peak },
            { duration: "2m", target: peak },
            { duration: "30s", target: 20 },
            { duration: "30s", target: 0 },
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
