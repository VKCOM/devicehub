import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Slider,
  Spacing,
  FormItem,
  DateInput,
  LocaleProvider,
  FormLayoutGroup,
  FormStatus,
  Div,
} from '@vkontakte/vkui'
import { useEffect } from 'react'

import { BaseSelect } from '@/components/lib/base-select'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useUpdateGroup } from '@/lib/hooks/use-update-group.hook'
import { isRepetitionsGroup } from '@/lib/utils/is-repetitions-group.util'

import { ADMIN_CLASS_OPTIONS, USER_CLASS_OPTIONS } from '@/constants/schedule-class-configuration'

import { ScheduleFormFields } from './types'

import styles from './schedule.module.css'

import type { FormEvent } from 'react'
import type { GroupListResponseGroupsItem, GroupPayloadClass } from '@/generated/types'

type ScheduleProps = {
  group?: GroupListResponseGroupsItem
}

export const Schedule = observer(({ group }: ScheduleProps) => {
  const { t } = useTranslation()
  const { i18n } = useTranslation()
  const { mutate: updateGroup, isPending } = useUpdateGroup(group?.id || '')

  const { isAdmin } = useInjection(CONTAINER_IDS.currentUserProfileStore)
  const groupItemService = useInjection(CONTAINER_IDS.groupItemService)
  const { scheduleData, isScheduleFormErrorsEmpty, scheduleFormErrors } = groupItemService

  const { dateRange, groupClass, repetitions } = scheduleData
  const isScheduleFormDisabled = group?.state === 'ready'

  const onFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isScheduleFormErrorsEmpty) {
      updateGroup({
        class: groupClass,
        repetitions,
        startTime: dateRange[0]?.toISOString(),
        stopTime: dateRange[1]?.toISOString(),
      })
    }
  }

  useEffect(() => {
    groupItemService.setEntireScheduleData({
      dates: group?.dates,
      repetitions: group?.repetitions,
      class: group?.class,
    })
  }, [group])

  return (
    <form onSubmit={onFormSubmit}>
      <FormLayoutGroup className={styles.schedule} disabled={isScheduleFormDisabled}>
        <FormItem
          bottom={scheduleFormErrors.groupClass?.message}
          htmlFor={ScheduleFormFields.GROUP_CLASS}
          status={scheduleFormErrors.groupClass?.message ? 'error' : undefined}
          top={t('Class')}
        >
          <BaseSelect
            id={ScheduleFormFields.GROUP_CLASS}
            isDisabled={isScheduleFormDisabled}
            options={isAdmin ? ADMIN_CLASS_OPTIONS : USER_CLASS_OPTIONS}
            value={groupClass}
            onChange={(value) => {
              groupItemService.setScheduleData('groupClass', value as GroupPayloadClass)
            }}
          />
        </FormItem>
        <ConditionalRender conditions={[isRepetitionsGroup(groupClass)]}>
          <FormItem
            bottom={scheduleFormErrors.repetitions?.message}
            htmlFor={ScheduleFormFields.REPETITIONS}
            status={scheduleFormErrors.repetitions?.message ? 'error' : undefined}
            top={t('Repetitions')}
          >
            <Slider
              disabled={isScheduleFormDisabled}
              id={ScheduleFormFields.REPETITIONS}
              max={10}
              min={0}
              value={repetitions}
              withTooltip
              onChange={(value) => groupItemService.setScheduleData('repetitions', value)}
            />
          </FormItem>
        </ConditionalRender>
        <FormItem
          bottom={scheduleFormErrors.startDate?.message}
          htmlFor={ScheduleFormFields.START_DATE}
          status={scheduleFormErrors.startDate?.message ? 'error' : undefined}
          top={t('Starting Date')}
        >
          <LocaleProvider value={i18n.language}>
            <DateInput
              disabled={isScheduleFormDisabled}
              id={ScheduleFormFields.START_DATE}
              placeholder='yyyy-MM-ddTHH:mm:ss:sss'
              size='m'
              value={dateRange[0]}
              closeOnChange
              enableTime
              showNeighboringMonth
              onChange={(value) => {
                if (value) {
                  groupItemService.setScheduleData('dateRange', [value, dateRange[1]])
                }
              }}
            />
          </LocaleProvider>
        </FormItem>
        <FormItem
          bottom={scheduleFormErrors.expireDate?.message}
          htmlFor={ScheduleFormFields.EXPIRE_DATE}
          status={scheduleFormErrors.expireDate?.message ? 'error' : undefined}
          top={t('Expiration Date')}
        >
          <LocaleProvider value={i18n.language}>
            <DateInput
              disabled={isScheduleFormDisabled}
              id={ScheduleFormFields.EXPIRE_DATE}
              placeholder='yyyy-MM-ddTHH:mm:ss:sss'
              size='m'
              value={dateRange[1]}
              closeOnChange
              enableTime
              showNeighboringMonth
              onChange={(value) => {
                if (value) {
                  groupItemService.setScheduleData('dateRange', [dateRange[0], value])
                }
              }}
            />
          </LocaleProvider>
        </FormItem>
        <ConditionalRender
          conditions={[groupClass === 'bookable' || (groupClass === 'standard' && group?.state !== 'ready')]}
        >
          <Div>
            <FormStatus>{t('Saving will also get ready the group')}</FormStatus>
          </Div>
        </ConditionalRender>
        <Spacing size='l' />
        <FormItem className={styles.submitButton}>
          <Button disabled={isScheduleFormDisabled} loading={isPending} type='submit'>
            {t('Save')}
          </Button>
        </FormItem>
      </FormLayoutGroup>
    </form>
  )
})
