import { expect, test } from "@playwright/test";

// Runs against the static build (npm run build:static), so it needs no backend. A route whose
// snapshot file is missing shows an error card, which fails the check below.

const ROUTES: [string, string][] = [
  ["/", "Which scorer should recruiters trust?"],
  ["/findings/healthcare", "The rule scorer is broken for Healthcare"],
  ["/findings/thin-profiles", "knows least about them"],
  ["/findings/v2-drift", "scorer-v2 inflated every score"],
  ["/findings/country-bias", "Austrian candidates get an LLM bonus"],
  ["/findings/recruiter-trust", "stopped opening the AI panel"],
  ["/segments", "Segments"],
  ["/disagreements", "Where the two scorers disagree"],
  ["/third-opinion", "A third opinion from Jev"],
  ["/data", "Data & method"],
];

for (const [path, heading] of ROUTES) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));

    await page.goto(`#${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    await expect(page.locator(".skeleton")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("the verdict flips once Healthcare is left out", async ({ page }) => {
  await page.goto("#/?view=excluding_healthcare");
  await expect(page.getByText("Rule scorer ahead by 5.3 AUC points")).toBeVisible();
  await page.getByRole("button", { name: "All job families" }).click();
  await expect(page.getByText("LLM scorer ahead by 3.6 AUC points")).toBeVisible();
});

test("the simulated Healthcare fix restores the rule scorer", async ({ page }) => {
  await page.goto("#/findings/healthcare");
  await page.getByRole("switch", { name: "Apply the rescale" }).check();
  await expect(page.getByText("from 0.689 to 0.762")).toBeVisible();
});

test("a v2 threshold of 78 brings the flag rate back to v1's", async ({ page }) => {
  await page.goto("#/findings/v2-drift?threshold=78");
  await expect(page.getByText("At 78, v2 flags about as many applications as v1 did at 70")).toBeVisible();
});
