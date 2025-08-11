import { Button } from '@vkontakte/vkui'
import { Icon20Add, Icon20MinusOutline } from '@vkontakte/icons'

import { ConditionalRender } from '@/components/lib/conditional-render'

type IsInGroupCellProps = {
  isInGroup: boolean
  isAddToGroupDisabled?: boolean
  isRemoveFromGroupDisabled?: boolean
  onAddToGroup?: () => void
  onRemoveFromGroup?: () => void
}

export const IsInGroupCell = ({
  isInGroup,
  isAddToGroupDisabled,
  isRemoveFromGroupDisabled,
  onAddToGroup,
  onRemoveFromGroup,
}: IsInGroupCellProps) => (
  <>
    <ConditionalRender conditions={[!isInGroup]}>
      <Button
        before={<Icon20Add />}
        disabled={isAddToGroupDisabled}
        mode='tertiary'
        size='s'
        type='button'
        onClick={(event) => {
          event.stopPropagation()

          onAddToGroup?.()
        }}
      />
    </ConditionalRender>
    <ConditionalRender conditions={[!!isInGroup]}>
      <Button
        before={<Icon20MinusOutline />}
        disabled={isRemoveFromGroupDisabled}
        mode='tertiary'
        size='s'
        type='button'
        onClick={(event) => {
          event.stopPropagation()

          onRemoveFromGroup?.()
        }}
      />
    </ConditionalRender>
  </>
)
