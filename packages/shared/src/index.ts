export const rankingTypes = ['power', 'level', 'raid', 'tower'] as const;
export type RankingType = (typeof rankingTypes)[number];

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
}
