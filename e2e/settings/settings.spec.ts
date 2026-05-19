/**
 * User Settings E2E Tests
 *
 * End-to-end tests for the user settings functionality — theme switching
 * (light/dark mode).
 *
 * These tests verify that the selected theme is correctly applied to the
 * page. The theme is reflected in the HTML class attribute, which controls
 * the application of CSS variables for theming.
 *
 * The tests use Playwright for browser automation.
 */

import { expect, test } from "@playwright/test";

/**
 * Test suite for the Theme Switcher functionality
 *
 * These tests verify that users can switch between light and dark themes,
 * and that the selected theme is correctly applied to the page.
 *
 * The theme is reflected in the HTML class attribute, which controls
 * the application of CSS variables for theming.
 */
test.describe("Theme Switcher", () => {
  /**
   * Before each test, navigate to the home page
   * where the theme switcher is accessible in the navigation bar
   */
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  /**
   * Test that verifies switching to dark mode
   *
   * This test clicks the theme switcher dropdown, selects the "Dark" option,
   * and verifies that the HTML element has the "dark" class applied.
   *
   * The presence of the "dark" class indicates that dark mode styles
   * are being applied throughout the application.
   */
  test("should switch to dark mode", async ({ page }) => {
    // Open the theme switcher dropdown
    await page.getByTestId("theme-switcher").click();
    // Select the dark theme option
    await page.getByText("Dark", { exact: true }).click();
    // Get the class attribute from the HTML element
    const htmlClass = await page.locator("html").getAttribute("class");
    // Verify the dark class is applied
    expect(htmlClass).toContain("dark");
  });

  /**
   * Test that verifies switching to light mode
   *
   * This test clicks the theme switcher dropdown, selects the "Light" option,
   * and verifies that the HTML element has the "light" class applied.
   *
   * The presence of the "light" class indicates that light mode styles
   * are being applied throughout the application.
   */
  test("should switch to light mode", async ({ page }) => {
    // Open the theme switcher dropdown
    await page.getByTestId("theme-switcher").click();
    // Select the light theme option
    await page.getByText("Light", { exact: true }).click();
    // Get the class attribute from the HTML element
    const htmlClass = await page.locator("html").getAttribute("class");
    // Verify the light class is applied
    expect(htmlClass).toContain("light");
  });
});
