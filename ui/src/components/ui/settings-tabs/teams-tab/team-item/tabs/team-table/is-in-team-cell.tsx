import { Button } from '@vkontakte/vkui'
import { Icon20Add, Icon20MinusOutline } from '@vkontakte/icons'

import { ConditionalRender } from '@/components/lib/conditional-render'

type IsInTeamCellProps = {
  isInTeam: boolean
  isAddToTeamDisabled?: boolean
  isRemoveFromTeamDisabled?: boolean
  onAddToTeam?: () => void
  onRemoveFromTeam?: () => void
}

export const IsInTeamCell = ({
  isInTeam,
  isAddToTeamDisabled,
  isRemoveFromTeamDisabled,
  onAddToTeam,
  onRemoveFromTeam,
}: IsInTeamCellProps) => (
  <>
    <ConditionalRender conditions={[!isInTeam]}>
      <Button
        before={<Icon20Add />}
        disabled={isAddToTeamDisabled}
        mode='tertiary'
        size='s'
        type='button'
        onClick={(event) => {
          event.stopPropagation()

          onAddToTeam?.()
        }}
      />
    </ConditionalRender>
    <ConditionalRender conditions={[isInTeam]}>
      <Button
        before={<Icon20MinusOutline />}
        disabled={isRemoveFromTeamDisabled}
        mode='tertiary'
        size='s'
        type='button'
        onClick={(event) => {
          event.stopPropagation()

          onRemoveFromTeam?.()
        }}
      />
    </ConditionalRender>
  </>
)
