import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeatChart } from './SeatChart'

const parties = [
  { partyId: 'a', seats: 160, name: '왕당보수당', color: '#2563eb' },
  { partyId: 'b', seats: 90, name: '자유당', color: '#eab308' },
  { partyId: 'c', seats: 50, name: '사회민주당', color: '#e11d48' },
]

describe('<SeatChart />', () => {
  it('draws one circle per seat in a hemicycle, coloured by party', () => {
    const { container } = render(<SeatChart total={300} parties={parties} layout="hemicycle" />)
    const circles = container.querySelectorAll('[data-testid="seat-chart"] circle')
    expect(circles).toHaveLength(300)
    const blue = [...circles].filter((c) => c.getAttribute('fill') === '#2563eb')
    expect(blue).toHaveLength(160)
    expect(screen.getByText('과반 151', { exact: false })).toBeInTheDocument()
  })

  it('shows vacant seats when parties do not fill the chamber', () => {
    const { container } = render(<SeatChart total={100} parties={[parties[0]].map((p) => ({ ...p, seats: 40 }))} layout="circle" />)
    const vacant = [...container.querySelectorAll('circle')].filter((c) => c.getAttribute('fill') === 'var(--surface-3)')
    expect(vacant).toHaveLength(60)
  })

  it('renders a stacked bar with the majority line', () => {
    render(<SeatChart total={300} parties={parties} layout="bar" />)
    expect(screen.getByTitle('과반 151석')).toBeInTheDocument()
    expect(screen.getByText('왕당보수당')).toBeInTheDocument()
  })
})
