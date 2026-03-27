import { test, expect } from "@playwright/test";

/** Click the register/login tab (not the submit button). */
const clickTab = (page: import("@playwright/test").Page, name: string) =>
  page.locator(`div.flex.mb-6 button`, { hasText: name }).click();

/** Click the form submit button. */
const clickSubmit = (page: import("@playwright/test").Page) =>
  page.locator("form button[type='submit']").click();

test.describe("Authentication", () => {
  const user = {
    email: `auth-${Date.now()}@test.com`,
    password: "testpass123",
    name: "Auth Tester",
  };

  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await expect(page.locator("h1")).toContainText("Paperlens");
    await expect(page.getByPlaceholder("email@example.com")).toBeVisible();
  });

  test("user can register a new account", async ({ page }) => {
    await page.goto("/login");

    // Switch to register mode
    await clickTab(page, "회원가입");

    // Fill form
    await page.getByPlaceholder("이름").fill(user.name);
    await page.getByPlaceholder("email@example.com").fill(user.email);
    await page.getByPlaceholder("6자 이상").fill(user.password);

    // Submit
    await clickSubmit(page);

    // Should redirect to home and show user name
    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.getByText(user.name)).toBeVisible();
  });

  test("user can login with existing account", async ({ page }) => {
    // First register
    await page.goto("/login");
    const email = `login-${Date.now()}@test.com`;
    await clickTab(page, "회원가입");
    await page.getByPlaceholder("이름").fill("Login Tester");
    await page.getByPlaceholder("email@example.com").fill(email);
    await page.getByPlaceholder("6자 이상").fill("testpass123");
    await clickSubmit(page);
    await page.waitForURL("/", { timeout: 10_000 });

    // Logout
    await page.getByText("로그아웃").click();
    await page.waitForURL(/\/login/);

    // Login
    await page.getByPlaceholder("email@example.com").fill(email);
    await page.getByPlaceholder("비밀번호").fill("testpass123");
    await clickSubmit(page);

    await page.waitForURL("/", { timeout: 10_000 });
    await expect(page.getByText("Login Tester")).toBeVisible();
  });

  test("login with wrong password shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("email@example.com").fill("no@user.com");
    await page.getByPlaceholder("비밀번호").fill("wrongpassword");
    await clickSubmit(page);

    await expect(
      page.locator(".text-red-600, .text-red-400")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("duplicate email registration shows error", async ({ page }) => {
    const email = `dup-${Date.now()}@test.com`;

    // Register first time
    await page.goto("/login");
    await clickTab(page, "회원가입");
    await page.getByPlaceholder("이름").fill("First User");
    await page.getByPlaceholder("email@example.com").fill(email);
    await page.getByPlaceholder("6자 이상").fill("testpass123");
    await clickSubmit(page);
    await page.waitForURL("/", { timeout: 10_000 });

    // Logout and try to register again
    await page.getByText("로그아웃").click();
    await page.waitForURL(/\/login/);

    await clickTab(page, "회원가입");
    await page.getByPlaceholder("이름").fill("Second User");
    await page.getByPlaceholder("email@example.com").fill(email);
    await page.getByPlaceholder("6자 이상").fill("testpass123");
    await clickSubmit(page);

    await expect(
      page.locator(".text-red-600, .text-red-400")
    ).toBeVisible({ timeout: 5_000 });
  });
});
