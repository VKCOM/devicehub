import { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import { useParams } from 'react-router-dom'
import { Flex } from '@vkontakte/vkui'

import { deviceConnection } from '@/store/device-connection'

import { DeviceTopBar } from './device-top-bar'
import { DeviceScreen } from './device-screen'
import { DeviceNavigationBar } from './device-navigation-bar'

export const Device = observer(() => {
  const { serial } = useParams()

  useEffect(() => {
    if (!serial) return

    deviceConnection.useDevice(serial)
  }, [])

  return (
    <Flex direction='column' noWrap>
      <DeviceTopBar />
      <DeviceScreen />
      <DeviceNavigationBar />
    </Flex>
  )
})
