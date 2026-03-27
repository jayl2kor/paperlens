import { type Page, expect } from "@playwright/test";

let counter = 0;

function freshUser() {
  counter++;
  return {
    email: `e2e-${Date.now()}-${counter}@test.com`,
    password: "testpass123",
    name: "E2E Tester",
  };
}

/** Register a fresh user and return auth state. */
export async function registerAndLogin(page: Page) {
  const user = freshUser();

  await page.goto("/login");
  await expect(page.locator("h1")).toContainText("Paperlens");

  // Switch to register tab (click the tab, not the submit button)
  await page.locator("div.flex.mb-6 button", { hasText: "회원가입" }).click();

  // Fill form
  await page.getByPlaceholder("이름").fill(user.name);
  await page.getByPlaceholder("email@example.com").fill(user.email);
  await page.getByPlaceholder("6자 이상").fill(user.password);

  // Submit via form button
  await page.locator("form button[type='submit']").click();

  // Should redirect to home
  await page.waitForURL("/", { timeout: 10_000 });
  await expect(page.locator("h1")).toContainText("Paperlens");

  return user;
}

/** Create a minimal valid PDF in /tmp and return its path. */
export function getTestPdfPath(): string {
  return "/tmp/e2e-test-paper.pdf";
}

/** Generate a minimal valid PDF via the backend API. */
export async function createTestPdf(): Promise<void> {
  const { writeFileSync } = await import("fs");
  // Minimal valid PDF with text content
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj",
    "4 0 obj<</Length 44>>stream",
    "BT /F1 12 Tf 100 700 Td (Test Paper) Tj ET",
    "endstream endobj",
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000266 00000 n ",
    "0000000360 00000 n ",
    "trailer<</Size 6/Root 1 0 R>>",
    "startxref",
    "430",
    "%%EOF",
  ].join("\n");
  writeFileSync(getTestPdfPath(), pdf);
}
