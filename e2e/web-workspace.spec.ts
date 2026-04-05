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

    await expect(page.getByRole("heading", { name: "Granola Toolkit" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByText("Start from a folder, recent meeting, or review queue."),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Browse with a scope")).toBeVisible();
    await expect(page.locator(".meeting-list")).toHaveCount(0);
    await page.locator(".sidebar").getByRole("button", { name: /Team/i }).first().click();
    await expect(
      page.locator(".meeting-list").getByRole("button", { name: /Alpha Sync/i }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await page
      .locator(".meeting-list")
      .getByRole("button", { name: /Alpha Sync/i })
      .click();
    await expect(page.getByText("Selected meeting")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Alpha Sync" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inbox" })).toBeVisible();
    await expect(page.getByText("Recent Export Jobs")).toBeVisible();
    await page.getByRole("button", { name: "Auth" }).click();
    await expect(page.getByText("Auth Session")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save API key" })).toBeVisible();
    await page.getByRole("button", { name: "Advanced Search" }).click();
    await page.getByPlaceholder("Exact title or meeting id").fill("doc-beta-2222");
    await page.getByRole("button", { name: "Open Meeting" }).click();
    await expect(page.getByRole("heading", { name: "Beta Review" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Diagnostics" }).click();
    await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    await expect(page.getByText("Transcript cache")).toBeVisible();
    await page.getByRole("button", { name: "Inbox" }).click();
    await expect(page.getByText("Review Inbox")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Notes" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Transcripts" })).toBeVisible();
  });

  test("edits and tests harnesses against the selected meeting", async ({ page }) => {
    await page.goto(server.url);

    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible({
      timeout: 20_000,
    });
    await page.locator(".sidebar").getByRole("button", { name: /Team/i }).first().click();
    await page.getByRole("button", { name: "Pipelines" }).click();
    await expect(page.getByRole("heading", { name: "Harness Editor" })).toBeVisible();
    await page
      .locator(".meeting-list")
      .getByRole("button", { name: /Alpha Sync/i })
      .click();
    await expect(page.getByText("Team Notes").first()).toBeVisible();
    await expect(page.getByText("Run Team Notes against Alpha Sync.")).toBeVisible({
      timeout: 20_000,
    });
    const testHarnessButton = page.getByRole("button", { name: "Test Harness" });
    await expect(testHarnessButton).toBeEnabled({
      timeout: 20_000,
    });
    await testHarnessButton.click();
    await expect(page.getByRole("heading", { name: "Latest Test Run" })).toBeVisible();
    await expect(page.getByLabel("Structured Title")).toHaveValue("Team Notes", {
      timeout: 20_000,
    });
    await expect(page.getByLabel("Resolved Prompt Preview")).toHaveValue(
      /Write concise internal team notes\./,
      {
        timeout: 20_000,
      },
    );
  });

  test("guides a first-run user through onboarding", async ({ page }) => {
    test.setTimeout(60_000);
    const coldServer = await startToolkitWebServer({ scenario: "cold-start" });

    try {
      await page.goto(coldServer.url);

      await expect(
        page.getByRole("heading", {
          name: "Set up Granola Toolkit in three steps.",
        }),
      ).toBeVisible();
      await expect(page.getByText("Background service active")).toBeVisible();
      await expect(page.getByText("Step 1")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save API key" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Import meetings now" })).toHaveCount(0);

      await page.getByPlaceholder("grn_...").fill("grn_test_123");
      await page.getByRole("button", { name: "Save API key" }).click();
      const importMeetingsButton = page.getByRole("button", { name: "Import meetings now" });
      await expect(importMeetingsButton).toBeEnabled({
        timeout: 20_000,
      });
      await importMeetingsButton.click();
      await expect(page.getByText("2 meetings indexed locally.")).toBeVisible({
        timeout: 20_000,
      });

      await page.getByRole("button", { name: "OpenRouter" }).click();
      await page.getByRole("button", { name: "Create starter pipeline" }).click();

      await expect(page.getByRole("heading", { name: "Granola Toolkit" })).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole("button", { name: "Pipelines" }).click();
      await expect(page.getByRole("heading", { name: "Starter Meeting Notes" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: "Sync now" })).toBeVisible();
    } finally {
      await page.close();
      await coldServer.close();
    }
  });
});
