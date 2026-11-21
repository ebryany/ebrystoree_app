import { DEFAULT_THRESHOLDS } from "./lib/config.js";
import { runMarketplaceJourney } from "./lib/journeys.js";

export const options = {
  scenarios: {
    soak_stability: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || "200"),
      duration: __ENV.DURATION || "45s",
    },
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    http_req_duration: ["p(95)<1200", "p(99)<2500"],
  },
};

export default function () {
  runMarketplaceJourney();
}
