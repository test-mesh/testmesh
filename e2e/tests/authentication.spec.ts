import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page for unauthenticated users', async ({ page }) => {
    await page.goto('/');

    // Should redirect to login or show login form
    await expect(page.getByRole('heading', { name: /sign in|login/i })).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard|\/flows/);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('invalid@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Should show error message
    await expect(page.getByText(/invalid|incorrect/i)).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Wait for redirect
    await page.waitForURL(/\/dashboard|\/flows/);

    // Logout
    await page.getByRole('button', { name: /profile|user/i }).click();
    await page.getByRole('menuitem', { name: /logout|sign out/i }).click();

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('should persist session on page refresh', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    await page.waitForURL(/\/dashboard|\/flows/);

    // Refresh page
    await page.reload();

    // Should still be authenticated
    await expect(page).toHaveURL(/\/dashboard|\/flows/);
  });
});

test.describe('Authorization', () => {
  test('should restrict access to admin pages', async ({ page }) => {
    // Login as regular user
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Try to access admin page
    await page.goto('/admin');

    // Should show access denied or redirect
    await expect(
      page.getByText(/access denied|unauthorized|forbidden/i)
    ).toBeVisible().catch(() => {
      expect(page).not.toHaveURL(/\/admin/);
    });
  });

  test('should show admin menu for admin users', async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('adminpassword');
    await page.getByRole('button', { name: /sign in|login/i }).click();

    // Admin menu should be visible
    await expect(page.getByRole('link', { name: /admin/i })).toBeVisible();
  });
});
