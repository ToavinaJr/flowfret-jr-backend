import { PlaylistsResolver } from './playlists.resolver';
import { PlaylistsService } from './playlists.service';

const context = {
  req: { user: { sub: '00000000-0000-4000-8000-000000000001' } },
};

describe('PlaylistsResolver', () => {
  it('always derives playlist ownership from the authenticated context', async () => {
    const playlists = {
      list: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue(null),
    };
    const resolver = new PlaylistsResolver(
      playlists as unknown as PlaylistsService,
    );

    await resolver.myPlaylists(context, 20);
    await resolver.playlist('playlist-id', context);

    expect(playlists.list).toHaveBeenCalledWith(
      context.req.user.sub,
      undefined,
      20,
    );
    expect(playlists.find).toHaveBeenCalledWith(
      'playlist-id',
      context.req.user.sub,
    );
  });

  it('does not accept an owner id from add-track input', async () => {
    const playlists = { addTrack: jest.fn().mockResolvedValue({}) };
    const resolver = new PlaylistsResolver(
      playlists as unknown as PlaylistsService,
    );
    const data = {
      playlistId: '00000000-0000-4000-8000-000000000002',
      track: {
        provider: 'AUDIUS' as const,
        providerTrackId: 'track-id',
        title: 'Track',
        artists: [{ id: 'artist-id', name: 'Artist' }],
        externalUrl: 'https://audius.co/artist/track',
        durationMs: 1000,
      },
    };

    await resolver.addTrackToPlaylist(data, context);

    expect(playlists.addTrack).toHaveBeenCalledWith(data, context.req.user.sub);
  });
});
