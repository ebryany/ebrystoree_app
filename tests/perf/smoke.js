import { DEFAULT_THRESHOLDS } from "./lib/config.js";
import { runMarketplaceJourney } from "./lib/journeys.js";

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || "5"),
      duration: __ENV.DURATION || "15s",
    },
  },
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  runMarketplaceJourney();
}
