import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const backendApiMocks = vi.hoisted(() => ({
  analyzeJob: vi.fn(),
  analyzeResume: vi.fn(),
  getCandidateProfile: vi.fn(),
  getCandidateProfileAudit: vi.fn(),
  upsertCandidateProfile: vi.fn(),
}));

vi.mock('../src/shared/services/backendApi', () => ({
  BackendApi: {
    analyzeJob: backendApiMocks.analyzeJob,
    analyzeResume: backendApiMocks.analyzeResume,
    getCandidateProfile: backendApiMocks.getCandidateProfile,
    getCandidateProfileAudit: backendApiMocks.getCandidateProfileAudit,
    upsertCandidateProfile: backendApiMocks.upsertCandidateProfile,
  },
}));

vi.mock('../src/features/resume', () => ({
  ResumeAnalyzerCard: () => <div>Resume Analyzer</div>,
}));

vi.mock('../src/features/jobs', () => ({
  JobAnalyzerCard: () => <div>Job Analyzer</div>,
}));

import CandidateProfilePanel from '../src/features/profile/components/CandidateProfilePanel';
import type { CandidateProfile, CandidateProfileAuditPageResponse } from '../src/shared/types';
import { renderWithQueryClient } from './renderWithQueryClient';

const baseProfile: CandidateProfile = {
  userId: 'user-1',
  targetRole: 'Frontend Engineer',
  experienceLevel: 'mid',
  primarySkills: ['JavaScript', 'TypeScript', 'React'],
  weakSkills: ['Docker'],
  resumeSummary: 'Desenvolvedor focado em React e TypeScript.',
  jobDescription: 'Descricao base da vaga.',
};

const baseAuditPage: CandidateProfileAuditPageResponse = {
  items: [
    {
      kind: 'job',
      source: 'hybrid',
      aiProvider: 'openai',
      aiModel: 'gpt-5.4',
      createdAt: '2026-03-24T10:00:00.000Z',
    },
  ],
  total: 1,
  offset: 0,
  limit: 6,
  hasMore: false,
  nextOffset: null,
};

describe('CandidateProfilePanel', () => {
  beforeEach(() => {
    backendApiMocks.analyzeJob.mockReset();
    backendApiMocks.analyzeResume.mockReset();
    backendApiMocks.getCandidateProfile.mockReset().mockResolvedValue(baseProfile);
    backendApiMocks.getCandidateProfileAudit.mockReset().mockResolvedValue(baseAuditPage);
    backendApiMocks.upsertCandidateProfile.mockReset().mockResolvedValue(baseProfile);
  });

  it('keeps the audit collapsed by default and shows structured profile highlights', async () => {
    renderWithQueryClient(<CandidateProfilePanel />);

    await screen.findByDisplayValue('Frontend Engineer');

    expect(screen.getByText('Base da entrevista')).toBeInTheDocument();
    expect(screen.getByText('Contexto da entrevista')).toBeInTheDocument();
    expect(screen.getAllByText('JavaScript, TypeScript, React').length).toBeGreaterThan(0);
    expect(screen.getByText('Resume Analyzer')).toBeInTheDocument();
    expect(screen.queryByText('Job Analyzer')).not.toBeInTheDocument();
    expect(screen.queryByText('openai / gpt-5.4')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir vaga' }));

    expect(await screen.findByText('Job Analyzer')).toBeInTheDocument();
    expect(screen.queryByText('Resume Analyzer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver auditoria' }));

    expect(await screen.findByText('openai / gpt-5.4')).toBeInTheDocument();
  });

  it('saves the profile using the guided form fields', async () => {
    backendApiMocks.upsertCandidateProfile.mockResolvedValue({
      ...baseProfile,
      targetRole: 'Frontend Lead',
      experienceLevel: 'senior',
      primarySkills: ['react', 'typescript'],
      weakSkills: ['graphql'],
      resumeSummary: 'Lidero entregas frontend com React.',
    });

    renderWithQueryClient(<CandidateProfilePanel />);

    await screen.findByDisplayValue('Frontend Engineer');

    fireEvent.change(screen.getByLabelText('Cargo alvo'), {
      target: { value: 'Frontend Lead' },
    });
    fireEvent.change(screen.getByLabelText('Nivel de experiencia'), {
      target: { value: 'senior' },
    });
    fireEvent.change(screen.getByPlaceholderText('react, typescript, javascript'), {
      target: { value: 'react, typescript' },
    });
    fireEvent.change(screen.getByPlaceholderText('docker, system design, graphql'), {
      target: { value: 'graphql' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Explique em poucas linhas seu foco tecnico, stack principal e contexto mais recente.'),
      {
      target: { value: 'Lidero entregas frontend com React.' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Perfil' }));

    await waitFor(() => {
      expect(backendApiMocks.upsertCandidateProfile).toHaveBeenCalledWith({
        targetRole: 'Frontend Lead',
        experienceLevel: 'senior',
        primarySkills: ['react', 'typescript'],
        weakSkills: ['graphql'],
        resumeSummary: 'Lidero entregas frontend com React.',
        jobDescription: 'Descricao base da vaga.',
      });
    });
  });
});
