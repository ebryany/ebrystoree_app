import http from "k6/http";
import { check } from "k6";
import { BASE_URL, PRODUCT_SLUG } from "./lib/config.js";

const fast = __ENV.FAST === "1";

export const options = {
  scenarios: {
    breakpoint_arrival_rate: {
      executor: "ramping-arrival-rate",
      startRate: 20,
      timeUnit: "1s",
      preAllocatedVUs: 100,
      maxVUs: Number(__ENV.MAX_VUS || "800"),
      stages: fast
        ? [
            { duration: "10s", target: 50 },
            { duration: "10s", target: 120 },
            { duration: "10s", target: 250 },
            { duration: "10s", target: 400 },
            { duration: "10s", target: 600 },
          ]
        : [
            { duration: "1m", target: 50 },
            { duration: "1m", target: 150 },
            { duration: "1m", target: 300 },
            { duration: "1m", target: 500 },
            { duration: "1m", target: 800 },
          ],
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.05", abortOnFail: true, delayAbortEval: "8s" }],
    http_req_duration: [{ threshold: "p(95)<2000", abortOnFail: true, delayAbortEval: "8s" }],
  },
};

const ROUTES = ["/", "/produk", `/produk/${PRODUCT_SLUG}`, "/layanan", "/api/health"];

export default function () {
  const path = ROUTES[(__VU + __ITER) % ROUTES.length];
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Accept: "text/html,application/json", "Accept-Encoding": "gzip" },
    tags: { route: path },
  });
  check(res, { "status 200": (r) => r.status === 200 });
}
