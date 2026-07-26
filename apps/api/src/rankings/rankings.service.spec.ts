import { ServiceUnavailableException } from '@nestjs/common';
import { RankingsService } from './rankings.service';

describe('RankingsService', () => {
  it('does not return fabricated production ranking data', async () => {
    const service = new RankingsService();
    await expect(service.get('power')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
