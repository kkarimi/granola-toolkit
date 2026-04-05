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

  test("edits and tests harnesses against the selected meeting", async ({ page }) => {
    await page.goto(server.url);

    await expect(page.getByRole("heading", { name: "Harness Editor" })).toBeVisible();
    await page.getByRole("button", { name: /Alpha Sync/i }).click();
    await expect(page.getByText("Team Notes").first()).toBeVisible();
    await expect(page.getByText("Matched selected meeting")).toBeVisible();

    await page.getByRole("button", { name: "Test Harness" }).click();
    await expect(page.getByRole("heading", { name: "Latest Test Run" })).toBeVisible();
    await expect(page.getByLabel("Structured Title")).toHaveValue("Team Notes");
    await expect(page.getByLabel("Resolved Prompt Preview")).toHaveValue(
      /Write concise internal team notes\./,
    );
  });
});
