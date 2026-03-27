import { test, expect } from "@playwright/test";
import { registerAndLogin, createTestPdf, getTestPdfPath } from "./helpers";

test.describe("Paper Viewer", () => {
  test.beforeAll(async () => {
    await createTestPdf();
  });

  /** Register, login, upload a PDF, wait for viewer page. */
  async function setupPaperViewer(page: import("@playwright/test").Page) {
    await registerAndLogin(page);
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestPdfPath());
    await page.waitForURL(/\/paper\/\d+/, { timeout: 15_000 });
  }

  test("paper viewer loads with toolbar and sidebar", async ({ page }) => {
    await setupPaperViewer(page);

    // Toolbar should be visible with home button and zoom controls
    await expect(page.locator('button[title="홈으로"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button[title="축소"]')).toBeVisible();
    await expect(page.locator('button[title="확대"]')).toBeVisible();

    // Sidebar toggle should exist
    await expect(page.locator('button[title="사이드바 토글"]')).toBeVisible();
  });

  test("zoom controls work", async ({ page }) => {
    await setupPaperViewer(page);

    const zoomText = page.locator("span").filter({ hasText: /\d+%/ });
    const initialZoom = await zoomText.textContent();

    // Zoom in
    await page.locator('button[title="확대"]').click();
    await expect(zoomText).not.toHaveText(initialZoom!);
  });

  test("sidebar toggle works", async ({ page }) => {
    await setupPaperViewer(page);

    const toggle = page.locator('button[title="사이드바 토글"]');
    // Click twice to toggle off and on
    await toggle.click();
    await toggle.click();
  });

  test("settings drawer opens from paper view", async ({ page }) => {
    await setupPaperViewer(page);

    await page.locator('button[aria-label="설정"]').click();

    // Settings drawer should appear with language/model options
    await expect(
      page.getByText("기본 번역 언어").or(page.getByText("Claude 모델"))
    ).toBeVisible({ timeout: 3_000 });
  });

  test("can navigate back to home", async ({ page }) => {
    await setupPaperViewer(page);

    await page.locator('button[title="홈으로"]').click();
    await page.waitForURL("/", { timeout: 5_000 });
    await expect(page.locator("h1")).toContainText("Paperlens");
  });
});
