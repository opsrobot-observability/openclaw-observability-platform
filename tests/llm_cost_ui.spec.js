import { test, expect } from "@playwright/test";

test.describe("LLM Cost Dashboard UI Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the LLM cost page
    await page.goto("/llm-cost");
    // Wait for the table to load
    await expect(page.locator("table")).toBeVisible();
  });

  test("should expand row and show analytical metrics", async ({ page }) => {
    // 1. Click the first row to expand
    const firstRow = page.locator("tbody tr").first();
    const modelName = await firstRow.locator("td").first().innerText();
    await firstRow.click();

    // 2. Verify expansion background color
    await expect(firstRow).toHaveClass(/bg-primary-soft/);

    // 3. Verify visibility of analytical sections
    await expect(page.getByText("应用消耗 TOP 3")).toBeVisible();
    await expect(page.getByText("稳定性指标")).toBeVisible();
    await expect(page.getByText("效能指标")).toBeVisible();
    
    // 4. Verify the action button exists
    const drillDownBtn = page.getByRole("button", { name: "查看会话详情" });
    await expect(drillDownBtn).toBeVisible();
  });

  test("should navigate to session details with model filter", async ({ page }) => {
    // 1. Expand first row
    const firstRow = page.locator("tbody tr").first();
    const modelName = (await firstRow.locator("td").first().innerText()).trim();
    await firstRow.click();

    // 2. Click drill-down button
    const drillDownBtn = page.getByRole("button", { name: "查看会话详情" });
    await drillDownBtn.click();

    // 3. Verify navigation to CostOverview2
    await expect(page).toHaveURL(/cost-overview-2/);
    
    // 4. Verify model filter is applied in the destination page
    const filterBadge = page.locator(".relative button", { hasText: `大模型：${modelName}` });
    await expect(filterBadge).toBeVisible();
  });

  test("should show pagination bar even with few records", async ({ page }) => {
    // Verify pagination existence at the bottom
    const pagination = page.locator("nav, div", { hasText: /第 \d+-\d+ 条/ });
    await expect(pagination).toBeVisible();
    await expect(page.getByText(/每页 \d+ 条/)).toBeVisible();
  });
});
