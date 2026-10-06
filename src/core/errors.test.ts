import { describe, expect, it } from 'vitest';
import { AuthError, DomainError, EmptyPlaylistError, PlaybackError } from './errors';

describe('errors', () => {
  it('set name and extend DomainError', () => {
    for (const e of [new EmptyPlaylistError(), new PlaybackError('x'), new AuthError('y')]) {
      expect(e).toBeInstanceOf(DomainError);
      expect(e.name).toBe(e.constructor.name);
    }
  });
});
