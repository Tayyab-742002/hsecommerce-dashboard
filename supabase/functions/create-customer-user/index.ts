// Supabase Edge Function to create customer user accounts
// This uses the Admin API to create users without logging them in
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers - must be set for all responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests - MUST return 200 OK
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { email, password, customerId, role, firstName, lastName, phone } =
      await req.json();

    if (!email || !password || !customerId || !role) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: email, password, customerId, role",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Admin client with service role key (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create user using Admin API (doesn't create a session)
    const { data: authData, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email since we're creating it admin-side
        user_metadata: {
          first_name: firstName || "",
          last_name: lastName || "",
        },
      });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!authData.user) {
      return new Response(JSON.stringify({ error: "Failed to create user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create profile
    const { error: profileError } = await adminClient.from("profiles").upsert({
      id: authData.user.id,
      email,
      first_name: firstName || "",
      last_name: lastName || "",
      phone: phone || null,
      customer_id: customerId,
    });

    if (profileError) {
      // If profile creation fails, try to delete the user
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({
          error: `Profile creation failed: ${profileError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Assign role
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: authData.user.id,
      role,
      customer_id: customerId,
    });

    if (roleError) {
      // If role assignment fails, try to delete the user and profile
      await adminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({
          error: `Role assignment failed: ${roleError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success (user is created but NOT logged in)
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
