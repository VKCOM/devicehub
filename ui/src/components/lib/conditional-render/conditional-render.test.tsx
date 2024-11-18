import { render, screen } from '@testing-library/react'

import { ConditionalRender } from './conditional-render'

const ChildrenComponent = () => <div data-testid='children' />

describe('ConditionalRender', () => {
  test('Positive case', () => {
    render(
      <ConditionalRender conditions={[true, true]}>
        <ChildrenComponent />
      </ConditionalRender>
    )

    expect(screen.queryByTestId('children')).toBeInTheDocument()
  })

  test('Negative case', () => {
    render(
      <ConditionalRender conditions={[true, false]}>
        <ChildrenComponent />
      </ConditionalRender>
    )

    expect(screen.queryByTestId('children')).not.toBeInTheDocument()
  })
})
