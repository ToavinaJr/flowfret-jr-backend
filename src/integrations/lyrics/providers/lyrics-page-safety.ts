import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { Agent } from 'node:https';

const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00000000, 8], // This network
  [0x0a000000, 8], // Private
  [0x64400000, 10], // Shared address space
  [0x7f000000, 8], // Loopback
  [0xa9fe0000, 16], // Link local
  [0xac100000, 12], // Private
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0000200, 24], // Documentation
  [0xc0586300, 24], // 6to4 relay anycast
  [0xc0a80000, 16], // Private
  [0xc6120000, 15], // Benchmarking
  [0xc6336400, 24], // Documentation
  [0xcb007100, 24], // Documentation
  [0xe0000000, 4], // Multicast
  [0xf0000000, 4], // Reserved / broadcast
];

export interface SafeLyricsPageTarget {
  url: URL;
  agent: Agent;
}

export function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const value = octets.reduce((result, octet) => result * 256 + octet, 0);
  return !BLOCKED_IPV4_RANGES.some(([network, prefix]) => {
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (network & mask);
  });
}

export function validateLyricsPageUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

export async function resolveSafeLyricsPage(
  value: string,
): Promise<SafeLyricsPageTarget | undefined> {
  const url = validateLyricsPageUrl(value);
  if (!url) return undefined;

  let addresses: LookupAddress[];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)) {
    addresses = [{ address: url.hostname, family: 4 }];
  } else {
    try {
      addresses = await lookup(url.hostname, {
        all: true,
        family: 4,
        verbatim: true,
      });
    } catch {
      return undefined;
    }
  }

  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicIpv4(address))
  )
    return undefined;

  // Pin the connection to the address that was checked above, preventing a
  // second DNS lookup from rebinding the host to a private address.
  const address = addresses[0].address;
  const lookupPinned: LookupFunction = (hostname, _options, callback) => {
    if (hostname.toLowerCase() !== url.hostname.toLowerCase()) {
      const error = Object.assign(new Error('Unvalidated host'), {
        code: 'ENOTFOUND',
      });
      callback(error, '', 4);
      return;
    }
    callback(null, address, 4);
  };

  return { url, agent: new Agent({ lookup: lookupPinned }) };
}
