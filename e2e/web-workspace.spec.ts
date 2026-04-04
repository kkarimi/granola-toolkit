import { expect, test } from "@playwright/test";

import { startToolkitWebServer } from "./helpers.ts";

test.describe("toolkit web workspace", () => {
  let server: Awaited<ReturnType<typeof startToolkitWebServer>>;

  test.beforeAll(async () => {
    server = await startToolkitWebServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("connects and shows the shared workspace surfaces", async ({ page }) => {
    await page.goto(server.url);

    await expect(page.getByRole("heading", { name: "Granola Toolkit" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Meeting Workspace" })).toBeVisible();
    await expect(page.getByText("Connected")).toBeVisible();
    await expect(page.getByText("Auth Session")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save API key" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Notes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Transcripts" })).toBeVisible();
  });
});
