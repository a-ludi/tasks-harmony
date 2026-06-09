import { test, expect } from '@playwright/test';
import { today, daysFromNow, waitForApp } from './helpers/idb';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForApp(page);
});

test('empty state shows "No chores yet."', async ({ page }) => {
  await expect(page.getByText('No chores yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ New Chore' })).toBeVisible();
});

test('create a valid chore', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await page.getByLabel('Title').fill('Floss');
  await page.getByLabel('XP Size').click();
  await page.getByRole('option', { name: 'S (5 XP)' }).click();
  await page.getByLabel('Frequency').click();
  await page.getByRole('option', { name: 'Daily' }).click();
  await page.getByLabel('Interval').fill('1');
  await page.getByRole('button', { name: 'Create Chore' }).click();

  const card = page.getByTestId('chore-card').filter({ hasText: 'Floss' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Due')).toBeVisible();
});

test('start date defaults to today', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await expect(page.getByLabel('Start Date')).toHaveValue(today());
});

test('name is required', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await page.getByRole('button', { name: 'Create Chore' }).click();
  await expect(page.getByText('Title is required.')).toBeVisible();
  await expect(page.getByTestId('chore-card')).not.toBeVisible();
});

test('interval must be a positive integer', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await page.getByLabel('Title').fill('Floss');
  await page.getByLabel('Interval').fill('0');
  await page.getByRole('button', { name: 'Create Chore' }).click();
  await expect(page.getByText('Interval must be a whole number of 1 or more.')).toBeVisible();
});

test('upcoming chore shows "Upcoming" badge', async ({ page }) => {
  await page.getByRole('button', { name: '+ New Chore' }).click();
  await page.getByLabel('Title').fill('Future Task');
  await page.getByLabel('Start Date').fill(daysFromNow(5));
  await page.getByRole('button', { name: 'Create Chore' }).click();

  const card = page.getByTestId('chore-card').filter({ hasText: 'Future Task' });
  await expect(card.getByText('Upcoming')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Complete' })).not.toBeVisible();
});
