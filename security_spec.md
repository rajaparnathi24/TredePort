# Firestore Security Specification — My Trading Profit Tracker

## 1. Data Invariants
1. **Strict Account Ownership:** Every document under `/users/{userId}` and `/users/{userId}/trades/{tradeId}` belongs strictly to the authenticated, email-verified user whose `request.auth.uid == userId`. No cross-user read, list, create, update, or delete is ever permitted.
2. **Master Gate (Parent Profile):** A trade entry under `/users/{userId}/trades/{tradeId}` cannot be created, updated, or deleted unless the parent `/users/{userId}` document exists and its `ownerId == request.auth.uid`.
3. **Immutable Identity & Timestamps:** `ownerId`, `id`, and `createdAt` can never change after creation. `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.
4. **Strict Schema & Bounds:** Shadow fields are forbidden (`hasOnly` on create; `affectedKeys().hasOnly(...)` on update). All string fields enforce explicit `.size()` and regex bounds (`tradeDate` matches `^\d{4}-\d{2}-\d{2}$`; IDs match `^[a-zA-Z0-9_\-]+$`). `myProfit` must be a non-zero finite number within bounds; `capitalUsed` must be `null` or a non-negative number within bounds.
5. **No Blanket Listing:** Listing `/users` is denied (`allow list: if false;`). Listing `/users/{userId}/trades` enforces `userId == request.auth.uid && resource.data.ownerId == request.auth.uid` without `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated read/write:** `auth = null` attempting `get` or `create` on `/users/u1/trades/TRD-1`.
2. **Unverified email write:** `auth.token.email_verified = false` attempting to create `/users/u1`.
3. **Cross-user identity spoofing (create):** User `u2` attempting to create `/users/u1/trades/TRD-1` with `ownerId: "u1"` or `"u2"`.
4. **Cross-user PII / profile read:** User `u2` attempting `get` on `/users/u1` or `list` on `/users`.
5. **Orphaned subcollection write (Master Gate bypass):** User `u1` creating `/users/u1/trades/TRD-1` when `/users/u1` does not exist.
6. **Shadow / ghost field injection on create:** Creating `/users/u1/trades/TRD-1` with extra key `isAdmin: true` or `role: "admin"`.
7. **Shadow / ghost field injection on update:** Updating `/users/u1/trades/TRD-1` with extra key `isVerified: true`.
8. **Immutable field tampering on update:** Updating `/users/u1/trades/TRD-1` to alter `ownerId`, `id`, or `createdAt`.
9. **Client-forged timestamp:** Creating or updating a trade with a past/future client timestamp instead of `request.time`.
10. **Path variable / ID poisoning:** Creating a trade with oversized or junk `tradeId` (`"../admin;drop"` or > 64 chars).
11. **Value & type poisoning:** Updating `myProfit` to `"999999"` (string), `0`, or `capitalUsed` to `-500`, or `tradeDate` to `"invalid-date"`.
12. **Resource exhaustion (oversized string):** Updating `/users/u1` with a 5KB `spreadsheetTitle` (> 200 chars) or `spreadsheetUrl` (> 500 chars).
