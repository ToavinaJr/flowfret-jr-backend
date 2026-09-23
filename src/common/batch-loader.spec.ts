import { BatchLoader } from './batch-loader';

describe('BatchLoader', () => {
  it('batches keys requested during the same event-loop turn', async () => {
    const batch = jest.fn((keys: readonly string[]) =>
      Promise.resolve(new Map(keys.map((key) => [key, key.toUpperCase()]))),
    );
    const loader = new BatchLoader(batch, () => 'missing');

    await expect(
      Promise.all([loader.load('a'), loader.load('b')]),
    ).resolves.toEqual(['A', 'B']);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith(['a', 'b']);
  });

  it('caches values for the lifetime of one loader instance', async () => {
    const batch = jest.fn((keys: readonly string[]) =>
      Promise.resolve(new Map(keys.map((key) => [key, key]))),
    );
    const loader = new BatchLoader(batch, () => 'missing');

    await loader.load('a');
    await loader.load('a');

    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('provides a deterministic missing value', async () => {
    const loader = new BatchLoader<string, string | null>(
      () => Promise.resolve(new Map<string, string | null>()),
      () => null,
    );

    await expect(loader.load('unknown')).resolves.toBeNull();
  });
});
