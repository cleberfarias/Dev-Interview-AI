import {
  QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import type { User as FirebaseUser } from 'firebase/auth';

import { BackendApi } from '../services/backendApi';
import type {
  CandidateProfile,
  CandidateProfileAuditPageResponse,
  CandidateProfileUpsertRequest,
  JobAnalyzeResponse,
  ResumeAnalyzeResponse,
  SessionReportResponse,
  User,
} from '../types';

const CANDIDATE_PROFILE_AUDIT_DEFAULT_LIMIT = 6;

export const appQueryKeys = {
  me: (uid?: string | null) => ['me', uid || 'anonymous'] as const,
  candidateProfile: (uid?: string | null) => ['candidate-profile', uid || 'anonymous'] as const,
  candidateProfileAudit: (uid?: string | null, limit = CANDIDATE_PROFILE_AUDIT_DEFAULT_LIMIT) =>
    ['candidate-profile-audit', uid || 'anonymous', limit] as const,
  sessionReport: (sessionId?: string | null) => ['session-report', sessionId || 'unknown'] as const,
};

const buildFallbackUser = (firebaseUser: FirebaseUser): User => ({
  uid: firebaseUser.uid,
  name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
  email: firebaseUser.email || '',
  avatar: firebaseUser.photoURL || undefined,
  credits: 0,
  provider: 'firebase',
  interviews: [],
});

const loadMe = async (firebaseUser: FirebaseUser): Promise<User> => {
  const token = await firebaseUser.getIdToken(false).catch(() => null);
  return token ? BackendApi.meWithToken(token) : BackendApi.me();
};

const invalidateCandidateProfileResources = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['candidate-profile'] }),
    queryClient.invalidateQueries({ queryKey: ['candidate-profile-audit'] }),
  ]);
};

export const useMe = (firebaseUser: FirebaseUser | null) =>
  useQuery({
    queryKey: appQueryKeys.me(firebaseUser?.uid),
    queryFn: () => loadMe(firebaseUser as FirebaseUser),
    enabled: Boolean(firebaseUser),
    staleTime: 60_000,
    placeholderData: firebaseUser ? buildFallbackUser(firebaseUser) : undefined,
  });

export const useCandidateProfile = (userUid?: string | null) =>
  useQuery({
    queryKey: appQueryKeys.candidateProfile(userUid),
    queryFn: () => BackendApi.getCandidateProfile(),
    enabled: Boolean(userUid),
    staleTime: 60_000,
  });

export const useCandidateProfileAudit = (
  userUid?: string | null,
  limit = CANDIDATE_PROFILE_AUDIT_DEFAULT_LIMIT,
) =>
  useInfiniteQuery<
    CandidateProfileAuditPageResponse,
    Error,
    InfiniteData<CandidateProfileAuditPageResponse>,
    ReturnType<typeof appQueryKeys.candidateProfileAudit>,
    number
  >({
    queryKey: appQueryKeys.candidateProfileAudit(userUid, limit),
    queryFn: ({ pageParam }) => BackendApi.getCandidateProfileAudit({ limit, offset: pageParam }),
    enabled: Boolean(userUid),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextOffset ?? lastPage.offset + lastPage.items.length) : undefined,
    staleTime: 30_000,
  });

export const useSessionReport = (sessionId?: string | null) =>
  useQuery({
    queryKey: appQueryKeys.sessionReport(sessionId),
    queryFn: () => BackendApi.getSessionReport(sessionId as string),
    enabled: Boolean(sessionId),
    retry: 0,
  });

export const useUpsertCandidateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CandidateProfileUpsertRequest) => BackendApi.upsertCandidateProfile(payload),
    onSuccess: async (profile: CandidateProfile) => {
      queryClient.setQueryData(appQueryKeys.candidateProfile(profile.userId), profile);
      await invalidateCandidateProfileResources(queryClient);
    },
  });
};

export const useAnalyzeResume = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Parameters<typeof BackendApi.analyzeResume>[0]) => BackendApi.analyzeResume(payload),
    onSuccess: async (_result: ResumeAnalyzeResponse) => {
      await invalidateCandidateProfileResources(queryClient);
    },
  });
};

export const useAnalyzeJob = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Parameters<typeof BackendApi.analyzeJob>[0]) => BackendApi.analyzeJob(payload),
    onSuccess: async (_result: JobAnalyzeResponse) => {
      await invalidateCandidateProfileResources(queryClient);
    },
  });
};

export const useDeleteSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => BackendApi.deleteSession(sessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['session-report'] }),
      ]);
    },
  });
};

export const usePrimeSessionReport = () => {
  const queryClient = useQueryClient();

  return async (sessionId: string): Promise<SessionReportResponse> =>
    queryClient.fetchQuery({
      queryKey: appQueryKeys.sessionReport(sessionId),
      queryFn: () => BackendApi.getSessionReport(sessionId),
      retry: 0,
    });
};
