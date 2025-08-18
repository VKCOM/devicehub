import { useMutation } from '@tanstack/react-query'

import { createTeam } from '@/api/openstf-api'

import type { AxiosError } from 'axios'
import type { UseMutationResult } from '@tanstack/react-query'
import type { UnexpectedErrorResponse } from '@/generated/types'

export const useCreateTeam = (): UseMutationResult<boolean, AxiosError<UnexpectedErrorResponse>, void> =>
  useMutation({
    mutationFn: () => createTeam(),
  })
