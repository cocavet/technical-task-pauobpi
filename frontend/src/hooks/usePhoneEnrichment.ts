import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '../api'
import { isPhoneSearchActive } from '../../../shared/phoneEnrichment'

export function usePhoneEnrichment(leadIds: number[]) {
  const client = useQueryClient()
  const progress = useQuery({
    queryKey: ['leads', 'phoneProgress', leadIds],
    queryFn: () => api.leads.phoneProgress(),
    enabled: leadIds.length > 0,
    retry: false,
    refetchInterval: (query) =>
      query.state.error
        ? 5_000
        : query.state.data?.some((lead) => isPhoneSearchActive(lead.phoneEnrichmentStatus))
          ? 2_000
          : false,
  })
  const start = useMutation({
    mutationFn: (ids: number[]) => api.leads.enrichPhones({ leadIds: ids }),
    retry: false,
    onSuccess: async (result) => {
      const count = (outcome: string) => result.results.filter((item) => item.outcome === outcome).length
      const message = `${count('started')} searches started; ${count('already_running')} already running; ${count('preserved')} existing phones kept; ${count('error')} errors`
      if (count('error')) toast.error(message)
      else toast.success(message)
      await progress.refetch()
    },
    onError: () => {
      toast.error('Could not confirm phone searches. Check progress before retrying.')
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['leads', 'getMany'] })
      void client.invalidateQueries({ queryKey: ['leads', 'phoneProgress'] })
    },
  })
  return { progress, start }
}
