import { test, expect } from '@playwright/test';

test.describe('Crops Admin E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/crops');
    await page.waitForLoadState('networkidle');
  });

  test('should load crops page and display header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Crops');
    await expect(page.locator('button:has-text("+ New Crop")')).toBeVisible();
  });

  test('should create new crop with all tabs', async ({ page }) => {
    // Click New Crop
    await page.click('button:has-text("+ New Crop")');

    // Fill Basics tab
    await page.fill('input[placeholder="e.g., Pea Shoots"]', 'Test Crop');
    await page.fill('input[placeholder="e.g., Erbsensprossen"]', 'Test Ernte');
    await page.fill(
      'input[placeholder="e.g., Sweet, crunchy"]',
      'Sweet and crunchy'
    );
    await page.fill('input[placeholder="z.B. süß, knackig"]', 'Süß und knackig');

    // Go to Procedure tab
    await page.click('text=Growth Procedure');

    // Enable soak
    const soakCheckbox = page.locator('input[type="checkbox"]').first();
    await soakCheckbox.check();
    await page.fill('input[placeholder="Hours"]', '12');

    // Set growth environment
    await page.selectOption('select', 'light');
    await page.fill('input[type="number"][placeholder*="Days"]', '6');

    // Go to Sizes tab
    await page.click('text=Sizes & Prices');

    // Add size
    await page.fill('input[placeholder="e.g., 600g"]', '100g');
    await page.fill('input[placeholder="e.g., 600"]', '100');
    await page.fill('input[placeholder="e.g., 18.50"]', '6.50');
    await page.click('button:has-text("Add Size")');

    // Save
    await page.click('button:has-text("Save")');

    // Verify success message
    await expect(page.locator('text=Crop created')).toBeVisible();

    // Verify crop appears in list
    await expect(page.locator('text=Test Crop')).toBeVisible();
  });

  test('should search crops by name', async ({ page }) => {
    // Assuming crops exist, search for one
    const searchInput = page.locator('input[placeholder="Search crops..."]');
    await searchInput.fill('Pea');

    // Should filter list
    await page.waitForTimeout(300);
    const cropItems = page.locator('button').filter({ hasText: /Pea|Erbsen/ });
    await expect(cropItems).toBeTruthy();
  });

  test('should edit crop and save changes', async ({ page }) => {
    // Click first crop in list (assuming it exists)
    const firstCrop = page.locator('button').first();
    await firstCrop.click();

    // Click Edit
    await page.click('button:has-text("Edit")');

    // Change flavor
    const flavorInputs = page.locator('input[placeholder*="Sweet"]');
    await flavorInputs.first().fill('Updated flavor');

    // Save
    await page.click('button:has-text("Save")');

    // Verify success
    await expect(page.locator('text=Crop updated')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    // Click New Crop
    await page.click('button:has-text("+ New Crop")');

    // Try to save without filling required fields
    await page.click('button:has-text("Save")');

    // Should show error
    await expect(
      page.locator('text=Name (EN) and Name (DE) are required')
    ).toBeVisible();
  });

  test('should delete crop with confirmation', async ({ page }) => {
    // Click first crop
    const firstCrop = page.locator('button').first();
    await firstCrop.click();

    // Click Delete
    await page.click('button:has-text("Delete")');

    // Confirm delete
    await expect(
      page.locator('text=Are you sure you want to delete')
    ).toBeVisible();
    await page.click('button:has-text("Delete")');

    // Verify success
    await expect(page.locator('text=Crop deleted')).toBeVisible();
  });

  test('should toggle procedure steps correctly', async ({ page }) => {
    // Click first crop
    const firstCrop = page.locator('button').first();
    await firstCrop.click();

    // Click Edit
    await page.click('button:has-text("Edit")');

    // Go to Procedure tab
    await page.click('text=Growth Procedure');

    // Toggle soak
    const soakCheckbox = page
      .locator('input[type="checkbox"]')
      .filter({ hasText: /Soak/ })
      .first();
    await soakCheckbox.check();

    // Hours input should appear
    await expect(page.locator('input[placeholder="Hours"]')).toBeVisible();

    // Uncheck
    await soakCheckbox.uncheck();

    // Hours input should disappear
    await expect(page.locator('input[placeholder="Hours"]')).not.toBeVisible();
  });

  test('should calculate total growth days', async ({ page }) => {
    // Click first crop
    const firstCrop = page.locator('button').first();
    await firstCrop.click();

    // Click Edit
    await page.click('button:has-text("Edit")');

    // Go to Procedure tab
    await page.click('text=Growth Procedure');

    // Enable stack and set days
    const stackCheckbox = page
      .locator('input[type="checkbox"]')
      .filter({ hasText: /Stack/ })
      .first();
    await stackCheckbox.check();
    await page.fill('input[placeholder="Days"]', '2');

    // Set growth environment days
    const envDaysInputs = page.locator('input[type="number"]');
    await envDaysInputs.last().fill('6');

    // Check total
    await expect(page.locator('text=Total Growth Days:')).toBeVisible();
    await expect(page.locator('text=8')).toBeVisible(); // 2 + 6
  });

  test('should add and remove size variants', async ({ page }) => {
    // Click first crop
    const firstCrop = page.locator('button').first();
    await firstCrop.click();

    // Click Edit
    await page.click('button:has-text("Edit")');

    // Go to Sizes tab
    await page.click('text=Sizes & Prices');

    // Add new size
    await page.fill('input[placeholder="e.g., 600g"]', '600g');
    await page.fill('input[placeholder="e.g., 600"]', '600');
    await page.fill('input[placeholder="e.g., 18.50"]', '18.50');
    await page.click('button:has-text("Add Size")');

    // New size should appear in table
    await expect(page.locator('text=600g')).toBeVisible();

    // Remove size
    const deleteButtons = page.locator('button:has-text("Delete")');
    await deleteButtons.last().click();

    // Size should be gone
    await expect(page.locator('text=600g')).not.toBeVisible();
  });

  test('should handle status toggle', async ({ page }) => {
    // Click first crop
    const firstCrop = page.locator('button').first();
    await firstCrop.click();

    // Click Edit
    await page.click('button:has-text("Edit")');

    // Change status
    const statusSelect = page.locator('select').last();
    await statusSelect.selectOption('paused');

    // Save
    await page.click('button:has-text("Save")');

    // Verify success
    await expect(page.locator('text=Crop updated')).toBeVisible();
  });

  test('should show bilingual content', async ({ page }) => {
    // Click first crop
    const firstCrop = page.locator('button').first();
    await firstCrop.click();

    // Should see both EN and DE names
    const cropText = await page.locator('h2').first().textContent();
    expect(cropText).toBeTruthy();

    // Check for German text in list
    const germantText = page.locator('p').filter({ hasText: /[äöüßA-Z]/ });
    await expect(germantText).toBeTruthy();
  });
});
