import type { GroupClass, GroupOwner } from '@/generated/types'

export type TeamGroup = {
  name?: string
  id?: string
  /** Group class; privileged value => debug, bookable, standard */
  class?: GroupClass
  owner?: GroupOwner
  privilege?: string
}
