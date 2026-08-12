import { render, screen } from '@testing-library/react'

import { App } from './App'

describe('apartment planner shell', () => {
  it('shows the planner title, new scene action, and edit/preview switch', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: '暮らしの3Dプランナー' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新規シーン' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '編集' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '高品質プレビュー' }),
    ).toBeInTheDocument()
  })
})
