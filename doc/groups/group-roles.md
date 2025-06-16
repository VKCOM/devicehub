# Group Roles and Capabilities in VK DeviceHub

Based on the codebase context, the VK DeviceHub system implements a hierarchical permission structure with four distinct roles that determine what actions users can perform within groups.

## Role Hierarchy

The VK DeviceHub group system has four primary roles with escalating privileges:

### 1. **System Admin**
- **Scope**: Global system access
- **Capabilities**: Full control over all groups and users across the entire system

### 2. **Group Owner**
- **Scope**: Full control over groups they own
- **Capabilities**:
    - Create, update, and delete their groups
    - Add/remove users and moderators
    - Manage group devices and settings
    - Cannot be assigned as moderator (already has all permissions)

### 3. **Group Moderator**
- **Scope**: Elevated permissions for specific groups where they're assigned as moderator
- **Capabilities**:
    - Add/remove users from the group
    - Update group settings (with some restrictions)
    - Manage group devices
    - Add/remove other moderators

### 4. **Regular User**
- **Scope**: Basic group participation
- **Capabilities**:
    - View groups they belong to
    - Use group devices when assigned
    - Limited to read-only operations in most contexts

## Permission Validation System

The system uses a centralized permission check function that evaluates user roles hierarchically

This function is used throughout the API controllers to enforce access control, with the `allowModerator` parameter allowing fine-grained control over whether moderators can perform specific actions.

## Moderator Management

### Adding Moderators
The system automatically adds users to the group before granting moderator privileges

### Removing Moderators
Moderators can be removed while keeping them as regular group members

### Automatic Cleanup
When users are completely removed from groups, their moderator privileges are automatically revoked

## UI Permission Controls

The frontend dynamically shows different controls based on user permissions

Users with edit permissions (admins, owners, or moderators) see additional controls for managing group membership and moderator assignments

## API Endpoints

The role management is exposed through REST endpoints:
- `PUT /api/v1/groups/{id}/moderators/{email}` - Add moderator
- `DELETE /api/v1/groups/{id}/moderators/{email}` - Remove moderator

## Notes

The permission system ensures proper access control while allowing flexible delegation of group management responsibilities. The hierarchical structure prevents privilege escalation while maintaining clear boundaries between different user roles.