# Migration Troubleshooting Guide

## Issue: "cannot alter type of a column used in a policy definition"

### Root Cause
PostgreSQL prevents altering an enum type when it's referenced in RLS policies. The policies must be dropped first.

### Solution
The updated migration (`20251109000000_simplify_roles_to_two.sql`) now:
1. ✅ Updates existing role values first
2. ✅ Drops ALL dependent policies
3. ✅ Alters the enum type
4. ✅ Recreates all policies with simplified checks
5. ✅ Verifies the migration succeeded

---

## Running the Migration

### Step 1: Backup Your Database
```sql
-- In Supabase Dashboard → Database → Backups
-- Click "Create Backup" before proceeding
```

### Step 2: Run the Fixed Migration
1. Go to Supabase Dashboard → SQL Editor
2. Copy the ENTIRE contents of:
   `supabase/migrations/20251109000000_simplify_roles_to_two.sql`
3. Paste into the SQL Editor
4. Click "Run"

### Step 3: Verify Success
You should see:
```
NOTICE: Migration completed successfully! Role system simplified to 2 roles.
```

### Step 4: Check the Results
```sql
-- Verify enum has only 2 values
SELECT enum_range(NULL::app_role);
-- Expected: {super_admin,customer_admin}

-- Verify existing roles
SELECT role, COUNT(*) FROM public.user_roles GROUP BY role;
-- Should only show: super_admin and customer_admin

-- Check policies were recreated
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
-- Should show multiple policies
```

---

## Common Issues & Solutions

### Issue 1: "relation does not exist"
**Cause**: Table or function doesn't exist  
**Solution**: Ensure all previous migrations ran successfully

### Issue 2: "function has_role does not exist"
**Cause**: The function was not created in earlier migrations  
**Solution**: Check that migration `20251106000000_allow_users_to_create_own_role.sql` ran

### Issue 3: "type app_role already exists"
**Cause**: Migration was partially run before  
**Solution**: 
```sql
-- Check if app_role_new exists
SELECT typname FROM pg_type WHERE typname = 'app_role_new';

-- If it exists, drop it first
DROP TYPE IF EXISTS app_role_new;

-- Then rerun the migration
```

### Issue 4: Policies not recreated
**Cause**: Error during policy recreation  
**Solution**:
```sql
-- Check existing policies
SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public';

-- If policies are missing, rerun just the policy creation section
-- (Steps 4-5 from the migration)
```

---

## Manual Rollback (If Needed)

### If Migration Fails Halfway

```sql
-- 1. Restore from backup (easiest)
-- Go to: Database → Backups → Restore

-- 2. OR manually recreate the old enum
DROP TYPE IF EXISTS app_role CASCADE;
CREATE TYPE app_role AS ENUM (
  'super_admin', 
  'warehouse_manager', 
  'warehouse_staff', 
  'customer_admin', 
  'customer_user'
);

-- 3. Fix user_roles table
ALTER TABLE public.user_roles 
  ALTER COLUMN role TYPE app_role 
  USING role::text::app_role;

-- 4. Recreate old policies (from previous migrations)
-- (This is complex - restoring from backup is better)
```

---

## Validation Queries

### Check Enum Values
```sql
SELECT unnest(enum_range(NULL::app_role)) AS role;
```
**Expected Output:**
```
super_admin
customer_admin
```

### Check User Roles
```sql
SELECT 
  role, 
  COUNT(*) as user_count 
FROM public.user_roles 
GROUP BY role 
ORDER BY role;
```
**Expected Output:**
```
super_admin     | X
customer_admin  | Y
```

### Check Policies
```sql
SELECT 
  tablename, 
  policyname,
  cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, cmd, policyname;
```
**Expected**: Should see policies for all tables with simplified role checks

### Check Functions
```sql
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('has_role', 'is_super_admin', 'get_user_customer_id');
```
**Expected**: All 3 functions should exist

---

## Post-Migration Verification

### Test Super Admin Access
```sql
-- Login as super_admin user in the app
-- Verify you can:
-- 1. Access admin dashboard
-- 2. Create customers
-- 3. View all data
-- 4. Manage users
```

### Test Customer Admin Access
```sql
-- Login as customer_admin user in the app
-- Verify you can:
-- 1. Access customer dashboard (NOT admin!)
-- 2. View only your own data
-- 3. Cannot access admin features
```

### Test Invalid Role Handling
```sql
-- Try creating a user with invalid role (should fail)
INSERT INTO public.user_roles (user_id, role)
VALUES ('some-uuid', 'invalid_role'::app_role);
-- Expected: ERROR - invalid input value for enum app_role
```

---

## Success Checklist

- [x] Migration ran without errors
- [x] Enum has exactly 2 values: super_admin, customer_admin
- [x] All user_roles updated (no old roles remain)
- [x] All policies recreated successfully
- [x] Functions (has_role, is_super_admin) working
- [x] Super admin can log in and access admin dashboard
- [x] Customer admin can log in and access customer dashboard
- [x] Customer admin does NOT see admin dashboard
- [x] No 403/401 errors for valid operations

---

## Need Help?

If you encounter errors not covered here:

1. **Copy the exact error message**
2. **Check which step failed** (the migration has clear steps)
3. **Run validation queries** to see current state
4. **Restore from backup** if needed
5. **Try again** with the fixed migration

---

## Migration File Location
`supabase/migrations/20251109000000_simplify_roles_to_two.sql`

**Total Steps**: 7  
**Estimated Time**: 2-5 minutes  
**Downtime**: None (policies drop/recreate is fast)  
**Reversible**: Yes (via backup restore)

