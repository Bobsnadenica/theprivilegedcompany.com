import { defineConfig, devices } from "@playwright/test";

const serverPort = Number(process.env.E2E_SERVER_PORT ?? 3102);
const clientPort = Number(process.env.E2E_CLIENT_PORT ?? 5176);
const forceRouletteResult = process.env.E2E_FORCE_ROULETTE_RESULT;
const staticSoloOnly = process.env.E2E_STATIC_SOLO_ONLY === "true";
const baseURL = `http://127.0.0.1:${clientPort}`;
const serverURL = `http://127.0.0.1:${serverPort}`;
const reportSuffix = staticSoloOnly ? "solo" : (forceRouletteResult ?? "default").toLowerCase();

function shellEnv(values: Record<string, string | undefined>) {
  return Object.entries(values)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  retries: 0,
  outputDir: `test-results/${reportSuffix}`,
  reporter: [["list"], ["html", { open: "never", outputFolder: `playwright-report/${reportSuffix}` }]],
  use: {
    baseURL,
    trace: "on-first-retry"
  },
  webServer: staticSoloOnly
    ? [
        {
          command: `${shellEnv({ VITE_STATIC_SOLO_ONLY: "true", VITE_BASE_PATH: "/" })} npm run dev --workspace @rrld/client -- --host 127.0.0.1 --port ${clientPort}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 30_000
        }
      ]
    : [
        {
          command: `${shellEnv({
            HOST: "127.0.0.1",
            PORT: String(serverPort),
            CLIENT_ORIGIN: baseURL,
            E2E_FORCE_ROULETTE_RESULT: forceRouletteResult
          })} npm run dev --workspace @rrld/server`,
          url: `${serverURL}/health`,
          reuseExistingServer: false,
          timeout: 30_000
        },
        {
          command: `${shellEnv({ VITE_SERVER_URL: serverURL })} npm run dev --workspace @rrld/client -- --host 127.0.0.1 --port ${clientPort}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 30_000
        }
      ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
