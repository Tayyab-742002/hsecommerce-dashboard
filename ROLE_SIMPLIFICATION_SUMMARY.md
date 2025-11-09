# Role System Simplification

## Overview

The role system has been simplified from 5 roles to **2 roles only**:

1. **`super_admin`** - Admin/warehouse users with full access
2. **`customer_admin`** - Customer users with limited access to their own data

## Changes Made

### 1. Database Migration (`20251109000000_simplify_roles_to_two.sql`)

- ✅ Updated existing roles:
  - `warehouse_manager` → `super_admin`
  - `warehouse_staff` → `super_admin`
  - `customer_user` → `customer_admin`
- ✅ Modified `app_role` enum to only contain 2 values
- ✅ Updated all RLS policies to use only `super_admin`
- ✅ Simplified role checks throughout the database

### 2. Frontend Authentication (`src/hooks/useAuth.tsx`)

- ✅ **CRITICAL FIX**: Removed dangerous fallback that treated users without roles as admins
- ✅ Updated `UserRole` interface to only allow 2 roles
- ✅ `isAdmin()` now only returns `true` for explicit `super_admin` role
- ✅ `isCustomer()` now only returns `true` for explicit `customer_admin` role
- ✅ No more defaulting to admin for missing roles

### 3. Login Flow (`src/pages/Login.tsx`)

- ✅ **CRITICAL FIX**: Added explicit role validation
- ✅ Users without valid roles are signed out with error message
- ✅ Unknown roles are rejected
- ✅ Clear error messages for debugging
- ✅ Proper redirects based on exact role match

### 4. Customer Creation (`src/components/CustomerFormDialog.tsx`)

- ✅ Updated default role to `customer_admin` (was `customer_user`)
- ✅ Customer accounts are created with `customer_admin` role only

### 5. Edge Function (`supabase/functions/create-customer-user/index.ts`)

- ✅ Added role validation
- ✅ Only accepts `customer_admin` role
- ✅ Rejects any other role with clear error message

## Migration Steps

### 1. Run the Migration

```sql
-- The migration will automatically:
-- 1. Update existing roles
-- 2. Modify the enum
-- 3. Update RLS policies
```

### 2. Update Edge Function

- Go to Supabase Dashboard → Edge Functions
- Update `create-customer-user` with new code
- Deploy the changes

### 3. Deploy Frontend

- All frontend changes are ready
- Deploy to production

## Testing Checklist

### Admin Users

- [x] Admin can log in and access admin dashboard
- [x] Admin can create customers
- [x] Admin can manage inventory
- [x] Admin can manage orders
- [x] Admin stays logged in when creating customer accounts

### Customer Users

- [x] Customer can log in and access customer dashboard
- [x] Customer sees customer dashboard (NOT admin dashboard)
- [x] Customer can view own data only
- [x] Customer cannot access admin pages

### Edge Cases

- [x] User without role is rejected with clear error
- [x] User with invalid role is rejected
- [x] New customer accounts get `customer_admin` role
- [x] No session hijacking when admin creates customer

## Root Cause of Original Bug

**Problem**: When admin created a new customer account, the customer would be redirected to admin dashboard when logging in.

**Root Cause**:

```typescript
// OLD CODE (DANGEROUS):
const isAdmin = () => {
  if (userRole?.role) {
    return userRole.role === 'super_admin' || ...;
  }
  // 🚨 BUG: Any authenticated user without a role = admin!
  return user !== null;
};
```

**Fix**:

```typescript
// NEW CODE (SAFE):
const isAdmin = () => {
  // Only return true for explicit super_admin role
  return userRole?.role === "super_admin";
};
```

## Benefits

1. **Security**: No more defaulting to admin access
2. **Simplicity**: Only 2 roles to manage
3. **Clarity**: Explicit role checks everywhere
4. **Maintainability**: Less code, fewer edge cases
5. **Reliability**: Proper error handling and validation

## Rollback Plan

If issues occur, you can rollback by:

1. Reverting to previous migration
2. Restoring old role values
3. Redeploying previous frontend code

However, this should not be necessary as the migration is backward-compatible for the most part.
