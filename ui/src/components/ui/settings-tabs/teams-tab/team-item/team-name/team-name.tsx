import { EditableText } from '@/components/lib/editable-text'

import { useUpdateTeam } from '@/lib/hooks/use-update-team.hook'

import { validateString } from './helpers'

type TeamNameProps = {
  teamId?: string
  name?: string
}

export const TeamName = ({ teamId, name }: TeamNameProps) => {
  const { mutate: updateTeam } = useUpdateTeam(teamId || '')

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
      onChange={(data) => updateTeam({ name: data })}
    />
  )
}
