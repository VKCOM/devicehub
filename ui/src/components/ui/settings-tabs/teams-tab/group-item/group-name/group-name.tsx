import { EditableText } from '@/components/lib/editable-text'

import { useUpdateGroup } from '@/lib/hooks/use-update-group.hook'

import { validateString } from './helpers'

type GroupNameProps = {
  groupId?: string
  name?: string
}

export const GroupName = ({ groupId, name }: GroupNameProps) => {
  const { mutate: updateGroup } = useUpdateGroup(groupId || '')

  return (
    <EditableText
      initialValue={name}
      value={name}
      validateValue={(value) => {
        if (!validateString(value)) {
          return 'Only latin letters, numbers, -, _, ., /, :, and spaces allowed (1-50 chars)'
        }

        return ''
      }}
      onChange={(data) => updateGroup({ name: data })}
    />
  )
}
