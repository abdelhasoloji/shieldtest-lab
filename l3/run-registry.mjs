// Single-slot registry enforcing at most ONE active spoofed campaign at a time.
// A second claim is refused (fail-closed) until the first is released — this is
// the source of truth the confinement preflight's "another spoofed campaign
// active" check reads, and what keeps a spoofed run from ever overlapping.

export const MAX_CONCURRENT_SPOOF_CAMPAIGNS = 1;

export function createSpoofRunRegistry() {
  let active = null;

  return {
    /** The active run descriptor, or null. */
    active: () => active,
    isActive: () => active !== null,

    /** Claim the single slot. Returns { ok:true } or { ok:false, reason, active }. */
    claim(campaignId) {
      if (typeof campaignId !== 'string' || !campaignId.trim()) {
        throw new Error('claim requires a campaignId');
      }
      if (active !== null) {
        return { ok: false, reason: 'another spoofed campaign is active', active };
      }
      active = { campaignId, startedAt: new Date().toISOString() };
      return { ok: true, active };
    },

    /** Release the slot iff the campaignId matches the active one. */
    release(campaignId) {
      if (active && active.campaignId === campaignId) {
        active = null;
        return true;
      }
      return false;
    },
  };
}
