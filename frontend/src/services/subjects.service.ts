import { apiClient } from './api-client';

export interface Stream {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
}

export interface Subject {
  id: string;
  name_si: string;
  stream_ids: string[];
}

export const subjectsService = {
  async getStreams(): Promise<Stream[]> {
    return apiClient.get<Stream[]>('/streams');
  },

  async getStreamSubjects(streamId: string): Promise<Subject[]> {
    return apiClient.get<Subject[]>(`/streams/${streamId}/subjects`);
  },

  async getSubjects(): Promise<Subject[]> {
    return apiClient.get<Subject[]>('/subjects');
  },
};
