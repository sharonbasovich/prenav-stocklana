import { expect, test } from "@playwright/test";

const HOLDER = "4wa8FTHDBLNf1DCAWhNbqJ5ZRGkV8TQX1TaF2VMpNttM";

// Tests 9-12 from the acceptance list run against the local backend.

test("9: screener renders all rows and premium signs match the API", async ({ page }) => {
  const apiResp = await page.request.get("/api/tokens");
  const tokens: { symbol: string; premiumPct: number | null }[] = await apiResp.json();

  await page.goto("/");
  await expect(page.getByTestId("screener-table")).toBeVisible({ timeout: 5000 });
  for (const t of tokens) {
    await expect(page.getByTestId(`row-${t.symbol}`)).toBeVisible();
    if (t.premiumPct !== null) {
      const cell = page.getByTestId(`premium-${t.symbol}`);
      const text = await cell.innerText();
      expect(text.startsWith("+")).toBe(t.premiumPct >= 0);
    }
  }
});

test("10: token page shows safety sheet, pools, premium chart", async ({ page }) => {
  const apiResp = await page.request.get("/api/tokens/OPENAI");
  const detail = await apiResp.json();

  await page.goto("/token/OPENAI");
  await expect(page.getByTestId("safety-transfer-fee")).toBeVisible();
  const feeText = await page.getByTestId("safety-transfer-fee").innerText();
  const bps = detail.safety.transferFeeBps;
  expect(feeText).toContain(`${(bps / 100).toFixed(2)}%`);
  await expect(page.getByTestId("safety-permanent-delegate")).toBeVisible();
  await expect(page.getByTestId("pool-table").locator("tbody tr")).toHaveCount(detail.pools.length);
  await expect(page.getByTestId("premium-chart")).toBeVisible();
});

test("11: portfolio renders for example address, deep link and error states", async ({ page }) => {
  await page.goto("/portfolio");
  await page.getByTestId("address-input").fill(HOLDER);
  await page.getByTestId("address-submit").click();
  await page.waitForURL(`/portfolio/${HOLDER}`);
  await expect(page.getByTestId("portfolio-totals")).toBeVisible({ timeout: 30000 });

  await page.goto(`/portfolio/${HOLDER}`);
  await expect(page.getByTestId("portfolio-totals")).toBeVisible({ timeout: 30000 });

  await page.goto("/portfolio/not-an-address!!!");
  await expect(page.getByTestId("portfolio-error")).toBeVisible();
});

test("12: no console errors on key pages", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/");
  await expect(page.getByTestId("screener-table")).toBeVisible();
  await page.goto("/token/OPENAI");
  await expect(page.getByTestId("safety-transfer-fee")).toBeVisible();
  await page.goto(`/portfolio/${HOLDER}`);
  await expect(page.getByTestId("portfolio-totals")).toBeVisible({ timeout: 30000 });
  const real = errors.filter((e) => !e.includes("favicon"));
  expect(real).toEqual([]);
});
