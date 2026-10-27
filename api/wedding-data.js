
const { createClient } = require("@supabase/supabase-js");

const {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY,
  ADMIN_EMAIL,
} = process.env;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_PUBLISHABLE_KEY ||
    !SUPABASE_SECRET_KEY ||
    !ADMIN_EMAIL
  ) {
    return res.status(500).json({
      error: "Server environment is not configured",
    });
  }

  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({ error: "Sign in required" });
  }

  try {
    // Verify the caller's Supabase access token.
    const authClient = createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    const { data: authData, error: authError } =
      await authClient.auth.getUser(match[1]);

    if (authError || !authData.user) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const user = authData.user;

    if (
      !user.email ||
      user.email.toLowerCase() !== ADMIN_EMAIL.trim().toLowerCase() ||
      !user.email_confirmed_at
    ) {
      return res.status(403).json({ error: "Admin access required" });
    }

    // This privileged client is used only on the server.
    const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (req.method === "GET") {
      const { data, error } = await db
        .from("wedding_data")
        .select("data, updated_at")
        .eq("id", 1)
        .single();

      if (error) throw error;

      return res.status(200).json({
        data: data.data,
        updated_at: data.updated_at,
      });
    }

    const payload = req.body;

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      !Array.isArray(payload.g) ||
      !Array.isArray(payload.d) ||
      !Array.isArray(payload.v)
    ) {
      return res.status(400).json({ error: "Invalid data format" });
    }

    const { data, error } = await db
      .from("wedding_data")
      .update({
        data: {
          g: payload.g,
          d: payload.d,
          v: payload.v,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select("updated_at")
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      updated_at: data.updated_at,
    });
  } catch (error) {
    console.error("Wedding data API error:", error.message);
    return res.status(500).json({ error: "Database operation failed" });
  }
};
