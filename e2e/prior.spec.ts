import { expect, test } from '@playwright/test';

test('nonuniform prior stays unchanged only for the independent uniform pad', async ({ page }) => {
  await page.goto('.');
  const section = page.locator('#prior-comparison');
  await expect(section).toContainText('Boneh and Shoup');
  await expect(section.locator('a')).toHaveAttribute('href', /BonehShoup_0_6\.pdf/);

  const readColumn = async (scenario: string) => section.locator(`#prior-table td[data-scenario="${scenario}"]`).allTextContents();
  expect(await readColumn('prior')).toEqual(['8/15','4/15','2/15','1/15']);
  expect(await readColumn('uniform')).toEqual(await readColumn('prior'));
  expect(await readColumn('biased')).toEqual(['32/39','4/39','2/39','1/39']);
  expect(await readColumn('reused')).toEqual(['1','0','0','0']);

  await section.locator('#prior-cipher').selectOption('2');
  expect(await readColumn('uniform')).toEqual(await readColumn('prior'));
  expect(await readColumn('reused')).toEqual(['0','0','1','0']);

  // Independently enumerate all four XOR key choices and key weights for c=2.
  const prior = [8,4,2,1], keyWeights = [4,1,1,1];
  const raw = prior.map((weight,m) => weight * keyWeights[2 ^ m]);
  const total = raw.reduce((a,b) => a+b,0);
  const gcd = (a:number,b:number):number => b ? gcd(b,a%b) : a;
  const expected = raw.map(value => {
    const divisor = gcd(value,total);
    return divisor === total ? String(value/divisor) : `${value/divisor}/${total/divisor}`;
  });
  expect(await readColumn('biased')).toEqual(expected);

  await section.locator('#prior-weight-0').fill('1');
  await section.locator('#prior-weight-1').fill('9');
  expect(await readColumn('uniform')).toEqual(await readColumn('prior'));
  expect(await readColumn('biased')).not.toEqual(await readColumn('prior'));
  await section.locator('#prior-weight-2').fill('0');
  await expect(section).toContainText('Old results cleared');
  await expect(section.locator('#prior-table')).toHaveCount(0);
  await section.locator('#prior-weight-2').fill('2');
  await expect(section.locator('#prior-table')).toHaveCount(1);
});
