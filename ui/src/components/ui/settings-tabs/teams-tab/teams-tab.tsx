import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { Icon20UsersOutline } from '@vkontakte/icons'

import { ListHeader } from '@/components/lib/list-header'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useCreateTeam } from '@/lib/hooks/use-create-team.hook'

import { TeamList } from './team-list'

export const TeamsTab = observer(() => {
  const { t } = useTranslation()

  const { mutate: createTeam } = useCreateTeam()

  return (
    <ListHeader
      beforeIcon={<Icon20UsersOutline />}
      containerId={CONTAINER_IDS.teamSettingsService}
      skeletonHeight={74}
      title={t('Team list')}
      onAddItem={() => createTeam()}
    >
      <TeamList />
    </ListHeader>
  )
})
