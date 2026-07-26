import type { RankingType } from '../rankings/rankings.service';
export interface IrisProvider { getConnectionStatus():Promise<'connected'|'disconnected'>; getUserProfile(uid:string):Promise<unknown>; getRanking(type:RankingType):Promise<unknown[]>; consumeLinkToken(token:string):Promise<unknown>; }
