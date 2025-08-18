import { Container } from 'inversify'
import { List } from '@vkontakte/vkui'
import { observer } from 'mobx-react-lite'
import { useInjection, Provider as DIContainerProvider } from 'inversify-react'

import { TeamItemService } from '@/services/team-item-service'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { TeamItem } from './team-item'

const createTeamItemContainer = (teamId: string) => {
  const container = new Container()

  container.bind<string>(CONTAINER_IDS.teamId).toConstantValue(teamId)
  container.bind(CONTAINER_IDS.teamItemService).to(TeamItemService)

  return container
}

export const TeamList = observer(() => {
  const teamSettingsService = useInjection(CONTAINER_IDS.teamSettingsService)

  return (
    <List gap={5}>
      {teamSettingsService.paginatedItems.map((team) => (
        <DIContainerProvider key={team.id} container={() => createTeamItemContainer(team.id || '')}>
          <TeamItem team={team} />
        </DIContainerProvider>
      ))}
    </List>
  )
})
