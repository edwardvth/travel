import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
      return (data as Profile) ?? null
    },
  })
}
export const isFounder = (p?: Profile | null) => p?.role === 'founder'
