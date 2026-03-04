import { test, expect } from '@playwright/test';

test.describe('Flow Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/flows');
  });

  test('should display flow list', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /flows/i })).toBeVisible();
  });

  test('should create new flow', async ({ page }) => {
    await page.getByRole('button', { name: /new flow/i }).click();

    // Fill flow details
    await page.getByLabel('Name').fill('E2E Test Flow');
    await page.getByLabel('Description').fill('Created by Playwright E2E test');

    await page.getByRole('button', { name: /create/i }).click();

    // Should redirect to flow editor
    await expect(page).toHaveURL(/\/flows\/[a-zA-Z0-9-]+/);
  });

  test('should add HTTP step to flow', async ({ page }) => {
    // Create or open a flow first
    await page.getByRole('button', { name: /new flow/i }).click();
    await page.getByLabel('Name').fill('HTTP Test Flow');
    await page.getByRole('button', { name: /create/i }).click();

    // Add step
    await page.getByRole('button', { name: /add step/i }).click();
    await page.getByText('HTTP Request').click();

    // Configure step
    await page.getByLabel('URL').fill('https://api.example.com/users');
    await page.getByLabel('Method').selectOption('GET');

    // Save
    await page.getByRole('button', { name: /save/i }).click();

    // Verify step was added
    await expect(page.getByText('HTTP Request')).toBeVisible();
  });

  test('should validate flow before run', async ({ page }) => {
    // Create flow with invalid step
    await page.getByRole('button', { name: /new flow/i }).click();
    await page.getByLabel('Name').fill('Validation Test Flow');
    await page.getByRole('button', { name: /create/i }).click();

    // Try to run empty flow
    await page.getByRole('button', { name: /run/i }).click();

    // Should show validation error
    await expect(page.getByText(/at least one step/i)).toBeVisible();
  });

  test('should execute flow and show results', async ({ page }) => {
    // Navigate to existing flow or create one with valid step
    await page.getByRole('button', { name: /new flow/i }).click();
    await page.getByLabel('Name').fill('Execution Test Flow');
    await page.getByRole('button', { name: /create/i }).click();

    // Add HTTP step
    await page.getByRole('button', { name: /add step/i }).click();
    await page.getByText('HTTP Request').click();
    await page.getByLabel('URL').fill('https://httpbin.org/get');
    await page.getByRole('button', { name: /save/i }).click();

    // Run flow
    await page.getByRole('button', { name: /run/i }).click();

    // Wait for execution
    await expect(page.getByText(/running/i)).toBeVisible();

    // Wait for completion
    await expect(page.getByText(/passed|failed/i)).toBeVisible({ timeout: 30000 });
  });
});

test.describe('Flow Editor - Properties Panel', () => {
  test('should show step properties when step selected', async ({ page }) => {
    await page.goto('/flows/new');
    await page.getByLabel('Name').fill('Properties Test');
    await page.getByRole('button', { name: /create/i }).click();

    // Add step
    await page.getByRole('button', { name: /add step/i }).click();
    await page.getByText('HTTP Request').click();

    // Properties panel should be visible
    await expect(page.getByText('Step Properties')).toBeVisible();

    // Should have required fields
    await expect(page.getByLabel('URL')).toBeVisible();
    await expect(page.getByLabel('Method')).toBeVisible();
  });

  test('should update step when properties change', async ({ page }) => {
    await page.goto('/flows/new');
    await page.getByLabel('Name').fill('Update Test');
    await page.getByRole('button', { name: /create/i }).click();

    // Add step
    await page.getByRole('button', { name: /add step/i }).click();
    await page.getByText('HTTP Request').click();

    // Update properties
    await page.getByLabel('Step Name').fill('Get Users');
    await page.getByLabel('URL').fill('https://api.example.com/users');

    // Verify canvas updates
    await expect(page.getByText('Get Users')).toBeVisible();
  });
});

test.describe('Debug Mode', () => {
  test('should set breakpoint on step', async ({ page }) => {
    await page.goto('/flows');
    // Assuming there's a flow to test with
    await page.getByRole('link').first().click();

    // Right-click on step to add breakpoint
    const step = page.locator('[data-testid="step"]').first();
    await step.click({ button: 'right' });
    await page.getByText('Add Breakpoint').click();

    // Breakpoint indicator should appear
    await expect(step.locator('[data-testid="breakpoint"]')).toBeVisible();
  });

  test('should pause execution at breakpoint', async ({ page }) => {
    await page.goto('/flows');
    await page.getByRole('link').first().click();

    // Add breakpoint
    const step = page.locator('[data-testid="step"]').first();
    await step.click({ button: 'right' });
    await page.getByText('Add Breakpoint').click();

    // Start debug mode
    await page.getByRole('button', { name: /debug/i }).click();

    // Should show paused state
    await expect(page.getByText(/paused at breakpoint/i)).toBeVisible({ timeout: 30000 });

    // Debug controls should be visible
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /step over/i })).toBeVisible();
  });
});
