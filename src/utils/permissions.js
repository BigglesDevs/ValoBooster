require('dotenv').config();

function hasRole(member, roleId) {
  if (!roleId || roleId.includes('YOUR_')) return false;
  return member.roles.cache.has(roleId);
}

function isStaff(member) {
  return (
    member.permissions.has('ManageChannels') ||
    hasRole(member, process.env.STAFF_ROLE_ID) ||
    hasRole(member, process.env.ADMIN_ROLE_ID)
  );
}

function isAdmin(member) {
  return (
    member.permissions.has('Administrator') ||
    hasRole(member, process.env.ADMIN_ROLE_ID)
  );
}

module.exports = { isStaff, isAdmin };
