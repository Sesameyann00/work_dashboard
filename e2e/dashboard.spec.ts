import { expect, test } from '@playwright/test'

test('dashboard exposes core daily work', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: '经营概览' })).toBeVisible()
  await expect(page.getByText('今日执行中心')).toBeVisible()
  await expect(page.getByText('会员结构')).toBeVisible()
  await page.getByRole('button', { name: '会员管理' }).click()
  await expect(page.getByRole('heading', { name: '会员管理', level: 2 })).toBeVisible()
  await expect(page.getByText('林女士')).toBeVisible()
  await page.getByRole('button', { name: '治疗到诊' }).click()
  await page.getByPlaceholder('输入完整手机号').fill('13800000005')
  await expect(page.getByText('赵女士')).toBeVisible()
  await page.getByRole('button', { name: '保存治疗并创建服务周期' }).click()
  await expect(page.getByRole('status')).toContainText('服务周期已创建')
})
