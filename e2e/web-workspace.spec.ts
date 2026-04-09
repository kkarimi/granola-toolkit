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

    await expect(page.locator(".primary-nav").getByText("Gran 👵🏻")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".primary-nav").getByText("Workspace")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".page-header").getByRole("heading", { name: "Home" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Latest meetings" })).toBeVisible();
    await expect(page.getByText("Last sync", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    await expect(page.getByLabel("Meetings in the last 7 days")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
    await expect(page.locator(".meeting-list")).toHaveCount(0);
    await page
      .locator(".latest-meetings-grid")
      .getByRole("button", { name: /Alpha Sync/i })
      .click();
    await expect(
      page.locator(".page-header").getByRole("heading", { name: "Alpha Sync" }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".markdown-document")).toContainText("Alpha notes");
    await expect(page.locator(".markdown-document")).not.toContainText('id: "');
    await expect(page.locator(".page-header")).toContainText("Team");
    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(page.getByRole("heading", { name: "Latest meetings" })).toBeVisible();

    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Folders/i })
      .click();
    await expect(
      page.locator(".page-header").getByRole("heading", { name: "Folders" }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Folder directory" })).toBeVisible({
      timeout: 20_000,
    });
    await page
      .locator(".folder-directory__grid")
      .getByRole("button", { name: /Team/i })
      .first()
      .click();
    await expect(page.locator(".page-header").getByRole("heading", { name: "Team" })).toBeVisible({
      timeout: 20_000,
    });
    await page
      .locator(".meeting-list")
      .getByRole("button", { name: /Alpha Sync/i })
      .click();
    await expect(
      page.locator(".page-header").getByRole("heading", { name: "Alpha Sync" }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".page-header")).toContainText("Team");
    await expect(page.locator(".markdown-document")).toContainText("Alpha notes");
    await expect(page.getByRole("button", { name: "Back to folders" })).toBeVisible();

    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Search/i })
      .click();
    await expect(
      page.locator(".page-header").getByRole("heading", { name: "Search" }),
    ).toBeVisible();
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
    await expect(
      page.locator(".page-header").getByRole("heading", { name: "Beta Review" }),
    ).toBeVisible({
      timeout: 20_000,
    });

    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Settings/i })
      .click();
    await page.locator(".settings-shell").getByRole("button", { name: "Plugins" }).click();
    await expect(
      page
        .locator(".auth-panel")
        .getByText(
          "Render meeting notes and markdown artefacts as readable documents in the browser while keeping the raw markdown available.",
        ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Disable markdown viewer" })).toBeVisible();
    await page.locator(".settings-shell").getByRole("button", { name: "Exports" }).click();
    await expect(page.getByRole("heading", { name: "Bundled export" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export archive" })).toBeVisible();
    await expect(page.getByText("All meetings", { exact: true })).toBeVisible();
    await page.locator(".settings-shell").getByRole("button", { name: "Diagnostics" }).click();
    await expect(page.getByRole("heading", { name: "Sync and local files" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent sync runs" })).toBeVisible();
    await expect(page.locator(".sync-run-detail")).toContainText("2 meetings checked");
    await expect(page.getByText("Desktop transcript file")).toBeVisible();
    await expect(page.getByText("Sync run history")).toBeVisible();
    await expect(page.getByText("Background service log")).toBeVisible();
    await expect(
      page
        .locator(".diagnostic-file-row")
        .getByText("No custom config file", { exact: true })
        .first(),
    ).toBeVisible();
    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Review/i })
      .click();
    await expect(page.getByText("Review Inbox")).toBeVisible();
    await page
      .locator(".jobs-list")
      .getByRole("button", { name: /Team Notes/i })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Artefact Review" })).toBeVisible();
    await expect(page.getByText("Publish target")).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveValue("team-vault");
    await expect(page.locator(".publish-preview-list")).toContainText("Meeting note");
    await expect(page.locator(".publish-preview-list")).toContainText(
      "Meetings/Team/Alpha Sync-notes.md",
    );
    await expect(page.locator(".publish-preview-list")).toContainText("Daily/2024-01-01.md");
    await expect(page.getByRole("link", { name: "Open" }).first()).toBeVisible();
  });

  test("configures and tests automation from Settings -> Plugins while keeping the selected meeting", async ({
    page,
  }) => {
    await page.goto(server.url);

    await expect(page.locator(".page-header").getByRole("heading", { name: "Home" })).toBeVisible({
      timeout: 20_000,
    });
    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Folders/i })
      .click();
    await page
      .locator(".folder-directory__grid")
      .getByRole("button", { name: /Team/i })
      .first()
      .click();
    await page
      .locator(".meeting-list")
      .getByRole("button", { name: /Alpha Sync/i })
      .click();
    await page
      .locator(".primary-nav")
      .getByRole("button", { name: /Settings/i })
      .click();
    await page.locator(".settings-shell").getByRole("button", { name: "Plugins" }).click();
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

  test("guides a first-run user through onboarding, then enables automation from plugins", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const coldServer = await startToolkitWebServer({ scenario: "cold-start" });

    try {
      await page.goto(coldServer.url);

      await expect(
        page.getByRole("heading", {
          name: "Set up Gran 👵🏻 in three steps.",
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

      await expect(
        page.getByRole("heading", {
          name: "Set up Gran 👵🏻 in three steps.",
        }),
      ).toHaveCount(0, {
        timeout: 30_000,
      });
      await expect(page.locator(".page-header").getByRole("heading", { name: "Home" })).toBeVisible(
        {
          timeout: 30_000,
        },
      );
      await expect(
        page.locator(".primary-nav").getByRole("button", { name: /Review/i }),
      ).toHaveCount(0);
      await page
        .locator(".primary-nav")
        .getByRole("button", { name: /Settings/i })
        .click();
      await page.locator(".settings-shell").getByRole("button", { name: "Plugins" }).click();
      await expect(
        page.getByText("Shipped capabilities are loaded from the toolkit plugin registry"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Enable automation" }).click();
      await expect(page.getByRole("heading", { name: "Harness Editor" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole("button", { name: "New Harness" })).toBeVisible();
      await expect(
        page.locator(".primary-nav").getByRole("button", { name: /Review/i }),
      ).toBeVisible();
    } finally {
      await page.close();
      await coldServer.close();
    }
  });
});
