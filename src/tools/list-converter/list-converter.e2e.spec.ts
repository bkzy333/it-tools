import { expect, test } from '@playwright/test';

test.describe('Tool - List converter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/list-converter');
  });

  test('Has correct title', async ({ page }) => {
    await expect(page).toHaveTitle('List converter - IT Tools');
  });

  test('Simple list should be converted with default settings', async ({ page }) => {
    await page.getByTestId('input').fill(`1
    2
    3
    4
    5`);

    const result = await page.getByTestId('area-content').innerText();

    expect(result.trim()).toEqual('1, 2, 3, 4, 5');
  });

  test('Duplicates should be removed, list should not be sorted and prefix and suffix list items', async ({ page }) => {
    await page.getByTestId('input').fill(`1
    2
    2
    4
    4
    3
    5`);
    await page.getByTestId('removeDuplicates').check();
    await page.getByTestId('itemPrefix').fill("'");
    await page.getByTestId('itemSuffix').fill("'");

    const result = await page.getByTestId('area-content').innerText();
    expect(result.trim()).toEqual("'1', '2', '4', '3', '5'");
  });

  test('List input should be converted to column output and strip wrappers', async ({ page }) => {
    await page.getByTestId('input').fill("('test','test2')");
    // 先在「非单列」状态下填好包裹字符（单列开启后这些输入框会被禁用，但已填的值仍保留并被剥离）
    await page.getByTestId('itemPrefix').fill("'");
    await page.getByTestId('itemSuffix').fill("'");
    await page.getByTestId('listPrefix').fill('(');
    await page.getByTestId('listSuffix').fill(')');
    await page.getByTestId('splitBySeparator').fill(',');
    await page.getByTestId('outputAsColumn').check();

    const result = await page.getByTestId('area-content').innerText();
    expect(result.trim()).toEqual('test\ntest2');
  });

  test('Reverse list toggle should reverse the output', async ({ page }) => {
    await page.getByTestId('input').fill(`1
2
3`);
    await page.getByTestId('reverseList').check();

    const result = await page.getByTestId('area-content').innerText();
    expect(result.trim()).toEqual('3, 2, 1');
  });
});
