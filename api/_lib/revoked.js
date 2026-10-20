/**
 * Revoked licence serials, checked on every session read.
 *
 * Empty by design: revocation has to be deliberate. The `revoke` GitHub
 * workflow rewrites this file from an operator input, which keeps an audit
 * trail in git and applies through a normal deployment.
 */
export const REVOKED = [];
