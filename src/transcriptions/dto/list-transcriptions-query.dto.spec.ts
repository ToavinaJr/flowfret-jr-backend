import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListTranscriptionsQueryDto } from './list-transcriptions-query.dto';

describe('ListTranscriptionsQueryDto', () => {
  it('applies safe pagination defaults and transforms numeric query values', async () => {
    const defaults = plainToInstance(ListTranscriptionsQueryDto, {});
    const query = plainToInstance(ListTranscriptionsQueryDto, {
      take: '50',
      skip: '100',
    });

    await expect(validate(defaults)).resolves.toHaveLength(0);
    expect(defaults).toMatchObject({ take: 20, skip: 0 });
    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({ take: 50, skip: 100 });
  });

  it.each([
    { take: '0', skip: '0' },
    { take: '101', skip: '0' },
    { take: '20.5', skip: '0' },
    { take: '20', skip: '-1' },
    { take: '20', skip: '100001' },
  ])('rejects out-of-range pagination values: %o', async (input) => {
    const query = plainToInstance(ListTranscriptionsQueryDto, input);

    await expect(validate(query)).resolves.not.toHaveLength(0);
  });
});
