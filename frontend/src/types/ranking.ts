// ─── Ranking Types ───────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  name: string;
  district: string;
  score: number;
  time_taken_secs: number;
  national_rank: number;
}

export interface MyRank {
  national_rank: number | null;
  district_rank: number | null;
  score: number;
  time_taken_secs: number;
}

export interface LeaderboardResponse {
  rows: LeaderboardEntry[];
  myRank: MyRank | null;
  total?: number;
}

export interface RankingFilters {
  type: 'daily' | 'srp';
  subject: string;
  grade: '12' | '13';
  district?: string;
}
