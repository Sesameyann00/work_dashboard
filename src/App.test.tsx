import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

describe('Dashboard', () => {
  it('renders the primary operating sections', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '登录系统' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: 'vip001' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.change(screen.getByLabelText('演示角色'), { target: { value: 'management' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(screen.getByRole('heading', { name: '经营概览' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日执行中心' })).toBeInTheDocument()
    expect(screen.getByText('D0 护理确认')).toBeInTheDocument()
  })

  it('hides the operating dashboard from non-management roles', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('登录名'), { target: { value: 'vip001' } })
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'Demo123!' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(screen.queryByRole('button', { name: '经营首页' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '今日待办', level: 2 })).toBeInTheDocument()
  })
})
