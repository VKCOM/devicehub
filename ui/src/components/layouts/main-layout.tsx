import { Outlet } from 'react-router'

import { Header } from '@/components/ui/header'

export const MainLayout = () => (
  <>
    <Header />
    <main className='pageWrapper'>
      <Outlet />
    </main>
  </>
)
