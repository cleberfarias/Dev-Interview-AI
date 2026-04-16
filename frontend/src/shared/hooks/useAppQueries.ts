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
const USER_CACHE_KEY_PREFIX = 'dev-interview-user-cache:v1:';
const CANDIDATE_PROFILE_CACHE_KEY_PREFIX = 'dev-interview-candidate-profile-cache:v1:';

export const appQueryKeys = {
  me: (uid?: string | null) => ['me', uid || 'anonymous'] as const,
  candidateProfile: (uid?: string | null) => ['candidate-profile', uid || 'anonymous'] as const,
  candidateProfileAudit: (uid?: string | null, limit = CANDIDATE_PROFILE_AUDIT_DEFAULT_LIMIT) =>
    ['candidate-profile-audit', uid || 'anonymous', limit] as const,
  sessionReport: (sessionId?: string | null) => ['session-report', sessionId || 'unknown'] as const,
};

const buildBaseFallbackUser = (firebaseUser: FirebaseUser): User => ({
  uid: firebaseUser.uid,
  name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
  email: firebaseUser.email || '',
  avatar: firebaseUser.photoURL || undefined,
  credits: 0,
  provider: 'firebase',
  interviews: [],
  tourCompletions: {},
});

const readJsonCache = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJsonCache = (key: string, value: unknown): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local cache is best-effort only.
  }
};

export const readCachedUser = (firebaseUser: FirebaseUser): User | null => {
  const cached = readJsonCache<Partial<User>>(`${USER_CACHE_KEY_PREFIX}${firebaseUser.uid}`);
  if (!cached || cached.uid !== firebaseUser.uid) return null;

  const fallback = buildBaseFallbackUser(firebaseUser);
  return {
    ...fallback,
    ...cached,
    uid: fallback.uid,
    email: cached.email || fallback.email,
    interviews: Array.isArray(cached.interviews) ? cached.interviews : [],
    tourCompletions: cached.tourCompletions || {},
  };
};

export const writeCachedUser = (user: User): void => {
  writeJsonCache(`${USER_CACHE_KEY_PREFIX}${user.uid}`, user);
};

export const readCachedCandidateProfile = (userUid?: string | null): CandidateProfile | null => {
  if (!userUid) return null;
  const cached = readJsonCache<CandidateProfile>(`${CANDIDATE_PROFILE_CACHE_KEY_PREFIX}${userUid}`);
  return cached?.userId === userUid ? cached : null;
};

export const writeCachedCandidateProfile = (profile: CandidateProfile): void => {
  writeJsonCache(`${CANDIDATE_PROFILE_CACHE_KEY_PREFIX}${profile.userId}`, profile);
};

const buildFallbackUser = (firebaseUser: FirebaseUser): User =>
  readCachedUser(firebaseUser) || buildBaseFallbackUser(firebaseUser);

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
    placeholderData: readCachedCandidateProfile(userUid) || undefined,
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
