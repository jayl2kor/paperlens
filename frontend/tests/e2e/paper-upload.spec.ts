import { test, expect } from "@playwright/test";
import { registerAndLogin, createTestPdf, getTestPdfPath } from "./helpers";

test.describe("Paper Upload & Library", () => {
  test.beforeAll(async () => {
    await createTestPdf();
  });

  test("upload PDF and view in library", async ({ page }) => {
    await registerAndLogin(page);

    // Home should show empty state
    await expect(page.getByText("논문 라이브러리가 비어 있습니다")).toBeVisible();

    // Upload via file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestPdfPath());

    // Should navigate to paper viewer
    await page.waitForURL(/\/paper\/\d+/, { timeout: 15_000 });

    // Toolbar should show paper title
    await expect(page.locator("body")).not.toContainText("PDF를 로드할 수 없습니다");
  });

  test("uploaded paper appears in library", async ({ page }) => {
    await registerAndLogin(page);

    // Upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestPdfPath());
    await page.waitForURL(/\/paper\/\d+/, { timeout: 15_000 });

    // Go back to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Paper should be listed
    const paperCount = await page
      .locator('[class*="rounded-lg"][class*="border"][class*="cursor-pointer"]')
      .count();
    expect(paperCount).toBeGreaterThanOrEqual(1);
  });

  test("can delete a paper with confirmation", async ({ page }) => {
    await registerAndLogin(page);

    // Upload a paper first
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(getTestPdfPath());
    await page.waitForURL(/\/paper\/\d+/, { timeout: 15_000 });

    // Go home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Hover to reveal delete button and click
    const paperCard = page
      .locator('[class*="rounded-lg"][class*="border"][class*="cursor-pointer"]')
      .first();
    await paperCard.hover();
    await paperCard.locator('button[title="삭제"]').click();

    // Confirmation dialog should appear
    await expect(page.getByText("논문 삭제")).toBeVisible();
    await expect(page.getByText("이 작업은 되돌릴 수 없으며")).toBeVisible();

    // Confirm deletion (the dialog's delete button, not the card's)
    const dialog = page.locator(".fixed.z-50").filter({ hasText: "논문 삭제" });
    await dialog.getByRole("button", { name: "삭제" }).click();

    // Paper should be removed
    await expect(page.getByText("논문 라이브러리가 비어 있습니다")).toBeVisible({
      timeout: 5_000,
    });
  });
});
