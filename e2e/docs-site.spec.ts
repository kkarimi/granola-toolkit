import { expect, test } from "@playwright/test";

import { startDocsServer } from "./helpers.ts";

test.describe("docs site", () => {
  let server: Awaited<ReturnType<typeof startDocsServer>>;

  test.beforeAll(async () => {
    server = await startDocsServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("loads the docs home page and getting started flow", async ({ page }) => {
    await page.goto(server.url);

    await expect(
      page.getByRole("heading", { name: /local workspace for your granola archive/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/syncs your meetings locally, gives you a browser and terminal workspace/i),
    ).toBeVisible();
    await page.getByRole("link", { name: "Start here" }).click();
    await expect(page).toHaveURL(/\/docs\/getting-started/);
    await expect(page.getByRole("heading", { name: "Getting Started" })).toBeVisible();
    await expect(page.getByText("Create your default Gran setup first:")).toBeVisible();
  });
});
