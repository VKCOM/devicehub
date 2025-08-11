import { Container } from 'inversify'
import { List } from '@vkontakte/vkui'
import { observer } from 'mobx-react-lite'
import { useInjection, Provider as DIContainerProvider } from 'inversify-react'

import { GroupItemService } from '@/services/group-item-service/group-item-service'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { GroupItem } from './group-item'

const createGroupItemContainer = (groupId: string) => {
  const container = new Container()

  container.bind<string>(CONTAINER_IDS.groupId).toConstantValue(groupId)
  container.bind(CONTAINER_IDS.groupItemService).to(GroupItemService)

  return container
}

export const GroupList = observer(() => {
  const groupSettingsService = useInjection(CONTAINER_IDS.groupSettingsService)

  return (
    <List gap={5}>
      {groupSettingsService.paginatedItems.map((group) => (
        <DIContainerProvider key={group.id} container={() => createGroupItemContainer(group.id || '')}>
          <GroupItem group={group} />
        </DIContainerProvider>
      ))}
    </List>
  )
})
