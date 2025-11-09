# Deployment Steps for Role System Simplification

## ⚠️ CRITICAL: Follow steps in exact order

---

## Step 1: Deploy Database Migration

### 1.1 Backup your database (IMPORTANT!)

```sql
-- Create a backup before running migration
-- Use Supabase Dashboard: Database → Backups → Create Backup
```

### 1.2 Run the migration

```bash
# Option A: Using Supabase CLI (if available)
supabase db push

# Option B: Manually via Supabase Dashboard
# Go to SQL Editor → Paste contents of:
# supabase/migrations/20251109000000_simplify_roles_to_two.sql
# → Click "Run"
```

### 1.3 Verify migration success

```sql
-- Check that enum was updated
SELECT enum_range(NULL::app_role);
-- Should return: {super_admin,customer_admin}

-- Check existing roles
SELECT role, COUNT(*) FROM public.user_roles GROUP BY role;
-- Should only show: super_admin and customer_admin

-- Check policies are updated
SELECT policyname, tablename
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
-- Should see simplified policies
```

---

## Step 2: Update Edge Function

### 2.1 Go to Supabase Dashboard

- Navigate to: **Edge Functions** → `create-customer-user`

### 2.2 Update the function code

- Copy contents from: `supabase/functions/create-customer-user/index.ts`
- Paste into the editor
- **Save/Deploy**

### 2.3 Test the Edge Function (Optional)

```bash
# Test via curl
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/create-customer-user \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123!",
    "customerId": "some-uuid",
    "role": "customer_admin",
    "firstName": "Test",
    "lastName": "User",
    "phone": "1234567890"
  }'
```

---

## Step 3: Deploy Frontend

### 3.1 Build the frontend

```bash
npm run build
```

### 3.2 Test locally first

```bash
npm run dev
# Test thoroughly before deploying!
```

### 3.3 Deploy to production

```bash
# For Vercel
vercel --prod

# Or use your deployment method
```

---

## Step 4: Verify Deployment

### 4.1 Test Admin Login

- [x] Log in as admin (`super_admin`)
- [x] Verify redirect to `/admin/dashboard`
- [x] Create a new customer with login credentials
- [x] Verify admin remains logged in after customer creation

### 4.2 Test Customer Login

- [x] Log out from admin
- [x] Log in as newly created customer
- [x] **CRITICAL**: Verify redirect to `/customer/dashboard` (NOT `/admin/dashboard`)
- [x] Verify customer can see only their own data

### 4.3 Test Edge Cases

- [x] User without role is rejected with error message
- [x] Cannot manually change role to invalid value
- [x] No CORS errors when creating customers

---

## Step 5: Monitor for Issues

### 5.1 Check application logs

```bash
# Check for any authentication errors
# Monitor Supabase logs: Dashboard → Logs
```

### 5.2 Check Edge Function logs

```bash
# Go to: Edge Functions → create-customer-user → Logs
# Look for any errors or failed requests
```

---

## Rollback Plan (If Issues Occur)

### Option A: Revert Database

```sql
-- Restore from backup created in Step 1.1
-- Go to: Database → Backups → Restore
```

### Option B: Revert Code Only

1. Revert frontend: `git revert HEAD` and redeploy
2. Revert Edge Function: restore previous version in dashboard
3. Keep database as-is (roles are already simplified)

---

## Expected Behavior After Deployment

### ✅ What Should Work

1. **Admin users**:

   - Can log in successfully
   - See admin dashboard
   - Can create/edit customers
   - Can assign `customer_admin` role
   - Remain logged in when creating customer accounts

2. **Customer users**:

   - Can log in successfully
   - See customer dashboard (NOT admin dashboard!)
   - Can view only their own data
   - Cannot access admin features

3. **Security**:
   - Users without roles are rejected
   - Invalid roles are rejected
   - RLS policies enforce data access
   - No session hijacking during customer creation

### ❌ What Should NOT Happen

1. Customer logging in and seeing admin dashboard
2. Admin being logged out when creating customer
3. Users without roles accessing any dashboard
4. CORS errors during customer creation
5. 403/401 errors for valid admin operations

---

## Troubleshooting

### Issue: "User has no role assigned"

**Solution**: Manually assign a role in Supabase Dashboard:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('user-uuid-here', 'super_admin');
```

### Issue: "Invalid role" error

**Solution**: Check database for invalid roles:

```sql
SELECT * FROM public.user_roles
WHERE role NOT IN ('super_admin', 'customer_admin');
```

### Issue: CORS errors on Edge Function

**Solution**:

1. Verify Edge Function has correct CORS headers
2. Check that function is deployed (not just saved)
3. Clear browser cache and retry

### Issue: Customer still seeing admin dashboard

**Solution**:

1. Verify migration ran successfully (Step 1.3)
2. Check user's role in database
3. Clear localStorage and cookies
4. Log out and log back in

---

## Support

If you encounter issues:

1. Check Supabase logs
2. Check browser console errors
3. Verify database migration completed
4. Contact support with specific error messages

---

## Summary

**Total Time**: ~15-30 minutes
**Downtime**: None (if done correctly)
**Risk Level**: Low (with proper backup)

**Files Modified**:

- ✅ Migration: `supabase/migrations/20251109000000_simplify_roles_to_two.sql`
- ✅ Edge Function: `supabase/functions/create-customer-user/index.ts`
- ✅ Frontend: 3 files (useAuth.tsx, Login.tsx, CustomerFormDialog.tsx)

**Database Changes**:

- ✅ Enum simplified: 5 roles → 2 roles
- ✅ Existing roles migrated automatically
- ✅ RLS policies updated
- ✅ No data loss
