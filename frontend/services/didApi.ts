/**
 * D-ID API service
 *
 * Obtém do backend as credenciais necessárias para inicializar o
 * Agents SDK no browser. O clientKey nunca deve ser hardcoded no JS.
 */

import { auth } from '../src/lib/firebase';

const BACKEND_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export interface DIDCredentials {
  clientKey: string;
  agentId: string;
}

/**
 * Busca clientKey e agentId do backend.
 * Chame uma vez ao iniciar a sessão D-ID.
 *
 * @throws Error se o backend retornar erro ou as variáveis não estiverem configuradas
 */
export async function getDIDCredentials(): Promise<DIDCredentials> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Sessao expirada. Faca login novamente.');
  }

  const res = await fetch(`${BACKEND_BASE}/did/credentials`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`D-ID credentials request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return {
    clientKey: data.client_key,
    agentId: data.agent_id,
  };
}
