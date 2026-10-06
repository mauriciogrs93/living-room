export class RoomUnavailable extends Error {
  constructor() {
    super("The room is busy. Try again in a moment.");
    this.name = "RoomUnavailable";
  }
}

/** A look or act exceeded the hard timeout. */
export class RoomBusy extends Error {
  constructor() {
    super("The room is busy. Try again in a moment.");
    this.name = "RoomBusy";
  }
}

/** Vercel has no shared store configured. */
export class RoomOffline extends Error {
  constructor() {
    super("room offline");
    this.name = "RoomOffline";
  }
}

/** v21 r2: production has no APARTMENT_OWNER_SECRET. Account routes fail closed (503), no fallback key. */
export class OwnerSecretMissing extends Error {
  constructor() {
    super("APARTMENT_OWNER_SECRET is not set");
    this.name = "OwnerSecretMissing";
  }
}
