/** Base class for all domain errors. Messages are developer-facing (English). */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class IndexOutOfRangeError extends DomainError {
  constructor(index: number, min: number, max: number) {
    super(`Index ${index} is out of range [${min}, ${max}]`);
  }
}

export class SongNotFoundError extends DomainError {
  constructor(entryId: string) {
    super(`No entry with id "${entryId}"`);
  }
}

export class PlaylistNotFoundError extends DomainError {
  constructor(playlistId: string) {
    super(`No playlist with id "${playlistId}"`);
  }
}

export class EmptyPlaylistError extends DomainError {
  constructor() {
    super('The playlist is empty');
  }
}

export class InvalidOperationError extends DomainError {}

export class PlaybackError extends DomainError {}

export class AuthError extends DomainError {}
