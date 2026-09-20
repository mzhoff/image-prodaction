# Workspace owns its AI budget

Accepted by the product owner, 20 September 2026.

One managed OpenRouter key belongs to a stable Workspace ID. Its name is exactly
`WSP_{workspace_id}`. Identity owns the payment ledger and provider provisioning;
Image Production owns local membership, execution authorization and usage attribution.
The payer/approver is audit data, not the key's identity. An ownership transfer must
not create a new key, move history, or reset the balance.

Before a payment is approved, the platform resolves the sender's owned Workspaces
through a signed product API. The sender chooses a Workspace when there are several.
The receipt, approval and immutable credit carry that Workspace ID. Replays cannot
change it. Projection names an explicit Workspace and never creates a personal
Workspace as an implicit side effect. Existing IDs and memberships are preserved.

Every generation and assistant provider call records the actual initiating user.
Interactive Playground and Runtime session-test runs persist their authenticated
initiator before enqueueing and charge that user, not the pipeline publisher. Old
Playground runs without an initiator fail closed and require a new submission.
Owners manage participants' AI access and spend limits; a member cannot change their
own limit. Checks run at provider dispatch as well as in the UI. Per-user admission
is serialized in PostgreSQL and unresolved provider outcomes prevent another paid
call for a limited participant. Usage reconciliation replaces an observation, not
the original initiating user or physical call identity.

USD is the common budget unit across text, images and video. Tokens are retained
as statistics where the provider supplies them. Limits do not add money to the
Workspace or change OpenRouter's overall key limit.

For beta the owner approved observed-spend admission: the next call is refused
once settled spending reaches the cap; the final admitted call may exceed it. UI
shows this warning and the actual overrun. A limited member may have only one
unsettled call, including across the UTC month boundary. Default period is lifetime;
the owner may select calendar month (UTC). Increasing a cap does not clear usage.
Known costs from failed assistant calls count too. Hidden provider retries are disabled
for the workspace assistant gateway, so each retry passes admission and creates its own
record. Removing/readding membership and transferring ownership never resets usage.

New Ask AI calls record the actual authenticated principal in a host ledger; historical
ChatModule calls lack that principal and are not reassigned to the conversation owner.
They remain in the existing aggregate dashboard. Image/video history retains its
existing initiating user. Machine Runtime calls retain their existing server-resolved
execution actor and service-client/grant fields; external consumer user attribution
requires a future trusted identity contract, not browser-supplied IDs.

Unknown costs are shown separately, never converted to zero. Existing generation
reconciliation can settle its usage observations. An ambiguous assistant failure or
crash remains unresolved and blocks limited-member calls until an operator checks
provider evidence; there is no automatic unsafe timeout release. If the provider
cannot establish the actual charge, do not invent a charge or silently clear the hold.

Rollout: apply IP migration 0032 and deploy its web and workers together before
activating the updated Identity budget worker. Verify signed workspace lookup and
explicit projection before approving receipts. Keep the global paid-key guard enabled.
Existing unmanaged credentials require explicit migration and cannot be overwritten
by managed budget projection. OpenRouter manual disable is never patched to false.
Historic user-owned platform credits require an explicit migration if present;
they must not be silently reassigned or discarded by the Workspace rollout.
