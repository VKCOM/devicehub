import type { SVGProps } from 'react'

/* NOTE: Android system navigation glyphs, the strip is a part of the device */
const NavIcon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden='true'
    fill='none'
    height={22}
    stroke='currentColor'
    strokeLinecap='round'
    strokeLinejoin='round'
    strokeWidth={2}
    viewBox='0 0 24 24'
    width={22}
    {...props}
  >
    {children}
  </svg>
)

export const BackNavIcon = () => (
  <NavIcon>
    <path d='M15.5 5.5 7.5 12l8 6.5z' />
  </NavIcon>
)

export const HomeNavIcon = () => (
  <NavIcon>
    <circle cx='12' cy='12' r='6.5' />
  </NavIcon>
)

export const RecentsNavIcon = () => (
  <NavIcon>
    <rect height='12' rx='2.5' width='12' x='6' y='6' />
  </NavIcon>
)
