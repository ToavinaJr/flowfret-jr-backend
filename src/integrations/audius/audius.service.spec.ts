import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { AudiusService } from './audius.service';

describe('AudiusService', () => {
  it('searches and keeps streamable tracks', async () => {
    const httpService = { get: jest.fn().mockReturnValue(of({ data: { data: [
      { id: '1', title: 'Playable', duration: 60, user: { id: 'u1', name: 'Artist' }, is_streamable: true },
      { id: '2', title: 'Locked', duration: 60, user: { id: 'u2', name: 'Artist' }, is_streamable: false },
    ] } })) };
    const configService = { get: jest.fn(() => 'access-token') };
    const service = new AudiusService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );

    const result = await service.searchTracks('song', 10);
    expect(result.tracks.map((track) => track.id)).toEqual(['1']);
    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.audius.co/v1/tracks/search',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token' },
      }),
    );
  });
});
