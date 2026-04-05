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

  test("uses page-based navigation instead of a giant meeting sidebar", async ({ page }) => {
    await page.goto(server.url);

    await expect(page.getByRole("heading", { name: "Local meeting workspace" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "A quieter way to work through meetings" }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Start from one calm home view")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Sync health" })).toBeVisible();
    await expect(page.locator(".meeting-list")).toHaveCount(0);

    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Folders/i })
      .click();
    await expect(page.getByRole("heading", { name: "Browse by folder" })).toBeVisible({
      timeout: 20_000,
    });
    await page
      .locator(".browser-layout__sidebar")
      .getByRole("button", { name: /Team/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible({
      timeout: 20_000,
    });
    await page
      .locator(".browser-layout__main")
      .getByRole("button", { name: /Alpha Sync/i })
      .click();
    await expect(page.getByRole("heading", { name: "Alpha Sync" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: "Back to folders" })).toBeVisible();
    await expect(page.getByText("Selected meeting")).toHaveCount(0);

    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Search/i })
      .click();
    await expect(page.getByRole("heading", { name: "Search meetings on purpose" })).toBeVisible();
    await page
      .getByPlaceholder("Search titles, notes, folders, tags, and transcript text")
      .fill("Beta");
    await page.locator(".search-panel__form").getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible({
      timeout: 20_000,
    });
    await page
      .locator(".meeting-list")
      .getByRole("button", { name: /Beta Review/i })
      .click();
    await expect(page.getByRole("heading", { name: "Beta Review" })).toBeVisible({
      timeout: 20_000,
    });

    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Settings/i })
      .click();
    await page.locator(".settings-shell").getByRole("button", { name: "Diagnostics" }).click();
    await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
    await expect(page.getByText("Transcript cache")).toBeVisible();
    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Review/i })
      .click();
    await expect(page.getByText("Review Inbox")).toBeVisible();
    await expect(
      page.locator(".primary-nav").getByRole("button", { name: "Sync now" }),
    ).toBeVisible();
  });

  test("edits and tests harnesses from settings while keeping the selected meeting", async ({
    page,
  }) => {
    await page.goto(server.url);

    await expect(
      page.getByRole("heading", { name: "A quieter way to work through meetings" }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Folders/i })
      .click();
    await page
      .locator(".browser-layout__sidebar")
      .getByRole("button", { name: /Team/i })
      .first()
      .click();
    await page
      .locator(".browser-layout__main")
      .getByRole("button", { name: /Alpha Sync/i })
      .click();
    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Settings/i })
      .click();
    await page.locator(".settings-shell").getByRole("button", { name: "Automation" }).click();
    await expect(page.getByRole("heading", { name: "Harness Editor" })).toBeVisible();
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
      await expect(page.getByText(/OpenRouter requires `OPENROUTER_API_KEY`/)).toBeVisible();
      await page.getByRole("button", { name: "Create starter pipeline" }).click();

      await expect(page.getByRole("heading", { name: "Local meeting workspace" })).toBeVisible({
        timeout: 20_000,
      });
      await page
        .locator(".primary-nav")
        .getByRole("button", { name: /Settings/i })
        .click();
      await page.locator(".settings-shell").getByRole("button", { name: "Automation" }).click();
      await expect(page.getByRole("heading", { name: "Starter Meeting Notes" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        page.locator(".primary-nav").getByRole("button", { name: "Sync now" }),
      ).toBeVisible();
    } finally {
      await page.close();
      await coldServer.close();
    }
  });
});
