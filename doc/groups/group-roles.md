# Group roles and permissions

A user's rights over a group come from two sources: the global privilege of the user account and the user's role in the group.

## Global privilege

- **`admin`** — has edit rights in every group. Admins are granted and revoked with `POST /api/v1/users/grantAdmin/{email}` and `DELETE /api/v1/users/revokeAdmin/{email}`.
- **`user`** — an ordinary account. Its rights in a group depend on its role in that group.

## Roles inside a group

- **Owner** — the user stored in `group.owner`. Has full edit rights in the group, including managing users, moderators and devices, and deleting the group.
- **Moderator** — a user listed in `group.moderators`. Has edit rights in the group, including adding and removing other moderators. Moderators cannot delete the group.
- **Member** — a user listed in `group.users`. Has no edit rights in the group.

The check is implemented by `hasGroupEditPermission` in `lib/util/apiutil.js`: a user may edit a group if they are an admin, the owner, or (unless the endpoint disables it) a moderator. Deleting a group uses the same check without the moderator case, so only owners and admins can delete a group.

## Managing moderators

- `PUT /api/v1/groups/{id}/moderators/{email}` — add a moderator. The user is added to the group first if needed.
- `DELETE /api/v1/groups/{id}/moderators/{email}` — remove a moderator. The user remains a group member.

When a user is removed from a group, their moderator role is removed as well.
