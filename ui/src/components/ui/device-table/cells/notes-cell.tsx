import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, EllipsisText, FormItem, FormLayoutGroup, Popover, Textarea } from '@vkontakte/vkui'
import { Icon16PenOutline } from '@vkontakte/icons'

import { socket } from '@/api/socket'

import type { ListDevice } from '@/types/list-device.type'

type NotesCellProps = {
  notes: ListDevice['notes']
  serial: ListDevice['serial']
}

export const NotesCell = memo(({ notes, serial }: NotesCellProps) => {
  const { t } = useTranslation()
  const [newNotes, setNewNotes] = useState(notes)

  const onNotesSave = (onClose: () => void) => {
    socket.emit('device.note', {
      serial,
      note: newNotes,
    })

    onClose()
  }

  return (
    <Popover
      aria-describedby='notes-dialog'
      aria-label='Note submission form'
      role='dialog'
      trigger='click'
      content={({ onClose }) => (
        <FormLayoutGroup>
          <FormItem>
            <Textarea placeholder={t('Notes')} value={newNotes} onChange={(event) => setNewNotes(event.target.value)} />
          </FormItem>
          <FormItem>
            <Button disabled={newNotes === notes} type='submit' onClick={() => onNotesSave(onClose)}>
              {t('Save')}
            </Button>
          </FormItem>
        </FormLayoutGroup>
      )}
    >
      <Button after={<Icon16PenOutline />} align='left' id='notes-dialog' mode='link' size='m'>
        {notes ? <EllipsisText maxLines={3}>{notes}</EllipsisText> : t('Empty')}
      </Button>
    </Popover>
  )
})
