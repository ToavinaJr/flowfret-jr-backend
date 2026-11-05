import { isPublicIpv4, validateLyricsPageUrl } from './lyrics-page-safety';

describe('lyrics page URL safety', () => {
  it('accepts HTTPS URLs on the default or explicit TLS port', () => {
    expect(validateLyricsPageUrl('https://lyrics.example/song')).toEqual(
      new URL('https://lyrics.example/song'),
    );
    expect(validateLyricsPageUrl('https://lyrics.example:443/song')).toEqual(
      new URL('https://lyrics.example/song'),
    );
  });

  it.each([
    'http://lyrics.example/song',
    'https://user@lyrics.example/song',
    'https://lyrics.example:8080/song',
    'not a URL',
  ])('rejects unsafe URL form %s', (value) => {
    expect(validateLyricsPageUrl(value)).toBeUndefined();
  });

  it.each([
    ['93.184.216.34', true],
    ['10.1.2.3', false],
    ['127.0.0.1', false],
    ['169.254.169.254', false],
    ['192.168.1.2', false],
    ['224.0.0.1', false],
    ['999.1.1.1', false],
  ])('classifies %s as public=%s', (address, expected) => {
    expect(isPublicIpv4(address)).toBe(expected);
  });
});
