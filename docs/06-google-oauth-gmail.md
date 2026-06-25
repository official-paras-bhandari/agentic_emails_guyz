# Google OAuth and Gmail

OAuth state is signed and tied to a workspace. Refresh tokens are encrypted with AES-256-GCM before persistence and refreshed token events update the encrypted value. The configured redirect URI must exactly match the Google OAuth client.

Sending first creates an idempotent delivery reservation. A successful Gmail response stores message and thread IDs. If the provider outcome is unknown, the item requires reconciliation instead of blind retry. Reply sync deduplicates on Gmail message ID and classifies replies conservatively.
