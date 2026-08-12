import { createClient, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { UserProfile, PlanType, AccountStatus, UserRole, AdminAuditLog } from "../types";

const supabaseUrl =
  (import.meta.env && import.meta.env.VITE_SUPABASE_URL) ||
  (typeof process !== "undefined" && process.env ? process.env.VITE_SUPABASE_URL : "") ||
  "";

const supabaseAnonKey =
  (import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== "undefined" && process.env ? process.env.VITE_SUPABASE_ANON_KEY : "") ||
  "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase configuration missing: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

export const isSupabaseConfigured = Boolean(supabaseUrl) && Boolean(supabaseAnonKey);
export const isSupabaseMockEnabled = false;

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  }
);

const PROFILES_TABLE = "profiles";
const CASES_TABLE = "property_cases";
const AUDIT_LOGS_TABLE = "admin_audit_logs";

export const SUPER_ADMIN_EMAILS = [
  "clearfile360@gmail.com",
  "raj.oneplus6@gmail.com",
  "clearconcept360@gmail.com",
  "admin@nilam360.ai",
  "superadmin@nilam360.ai"
];

export const checkIsSuperAdmin = (email?: string | null, role?: string | null): boolean => {
  if (!email) return false;
  if (role === "superadmin" || role === "admin" || role === "district_admin") return true;
  return SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
};

/**
 * Fetch profile from `profiles` table for a given user ID
 */
export async function getProfileFromProfilesTable(userId: string, authUser?: SupabaseUser | null): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select("*")
      .or(`id.eq.${userId},uid.eq.${userId}`)
      .maybeSingle();

    if (data) {
      const metadata = authUser?.user_metadata || {};
      const email = data.email || authUser?.email || metadata.email || "";
      const isSuperAdmin = checkIsSuperAdmin(email, data.role);
      const displayName =
        data.display_name ||
        data.displayName ||
        data.full_name ||
        metadata.full_name ||
        metadata.name ||
        metadata.displayName ||
        (email ? email.split("@")[0] : "");
      const photoURL =
        data.photo_url ||
        data.photoURL ||
        data.avatar_url ||
        metadata.avatar_url ||
        metadata.picture ||
        metadata.photoURL ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${userId}&backgroundColor=6366f1`;

      return {
        uid: data.id || data.uid || userId,
        email,
        displayName,
        photoURL,
        plan: (data.plan || (isSuperAdmin ? "enterprise" : "free")) as PlanType,
        status: (data.status || (isSuperAdmin ? "vip" : "active")) as AccountStatus,
        role: (isSuperAdmin ? "superadmin" : (data.role || "user")) as UserRole,
        customCaseLimit: data.custom_case_limit || data.customCaseLimit,
        adminNotes: data.admin_notes || data.adminNotes,
        createdAt: data.created_at || data.createdAt || new Date().toISOString(),
        lastLoginAt: data.last_login_at || data.lastLoginAt || new Date().toISOString(),
        caseCount: data.case_count ?? data.caseCount ?? 0
      };
    }
  } catch (err) {
    console.warn("Could not fetch profile from profiles table:", err);
  }
  return null;
}

/**
 * Map Supabase Auth user + profiles table record into UserProfile
 */
export async function fetchUserProfileForAuthUser(authUser: SupabaseUser | null): Promise<UserProfile | null> {
  if (!authUser) return null;

  const userId = authUser.id;
  const metadata = authUser.user_metadata || {};
  const email = authUser.email || metadata.email || "";
  const fullName = metadata.full_name || metadata.name || metadata.displayName || (email ? email.split("@")[0] : "");
  const avatarUrl = metadata.avatar_url || metadata.picture || metadata.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${userId}&backgroundColor=6366f1`;

  const dbProfile = await getProfileFromProfilesTable(userId, authUser);
  if (dbProfile) {
    return {
      ...dbProfile,
      email: dbProfile.email || email,
      displayName: dbProfile.displayName || fullName,
      photoURL: dbProfile.photoURL || avatarUrl
    };
  }

  // Save initial profile to `profiles` table if none exists yet
  return await saveOrUpdateUserProfile({
    uid: userId,
    email: email,
    displayName: fullName,
    photoURL: avatarUrl
  });
}

/**
 * Trigger Google OAuth Sign-In via Supabase Auth
 */
export const signInWithGoogle = async (options?: { useRedirect?: boolean }) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}`,
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
    },
  });

  if (error) throw error;
  return data;
};

/**
 * Sign out current user session
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const logoutUser = signOut;

export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  return user;
};

export const getCurrentSession = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;
  return session;
};

export const onAuthStateChange = (
  callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]
) => {
  return supabase.auth.onAuthStateChange(callback);
};

/**
 * Subscribe to Supabase Auth State Changes using `supabase.auth.getUser()` and `profiles` table
 */
export const subscribeToAuthChanges = (callback: (userProfile: UserProfile | null) => void) => {
  // Check active user via supabase.auth.getUser()
  supabase.auth.getUser()
    .then(async ({ data: { user }, error }) => {
      if (error || !user) {
        callback(null);
      } else {
        const profile = await fetchUserProfileForAuthUser(user);
        callback(profile);
      }
    })
    .catch((err) => {
      console.warn("Failed to retrieve user from supabase.auth.getUser():", err);
      callback(null);
    });

  // Listen for auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      const { data: { user } } = await supabase.auth.getUser();
      const profile = await fetchUserProfileForAuthUser(user || session.user);
      callback(profile);
    } else {
      callback(null);
    }
  });

  return () => {
    subscription.unsubscribe();
  };
};

// ----------------- Database Case Sync Operations -----------------
export const syncCaseToCloud = async (userId: string, caseData: any) => {
  const now = new Date().toISOString();
  const createdAt = caseData?.createdAt || now;
  const updatedAt = caseData?.updatedAt || now;

  const fullCaseData = {
    ...caseData,
    userId,
    createdAt,
    updatedAt
  };

  const payload = {
    id: caseData.id,
    user_id: userId,
    created_at: createdAt,
    updated_at: updatedAt,
    case_data: fullCaseData
  };

  const { error } = await supabase.from(CASES_TABLE).upsert(payload, { onConflict: "id" });
  if (error) {
    console.error("Supabase case sync error:", error);
    throw error;
  }
  return fullCaseData;
};

export const fetchCloudCases = async (userId: string) => {
  const { data, error } = await supabase
    .from(CASES_TABLE)
    .select("id,user_id,created_at,updated_at,case_data")
    .eq("user_id", userId);

  if (error) {
    console.error("Supabase fetch cases error:", error);
    throw error;
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return data.map((row: any) => {
    const baseCaseData = row.case_data && typeof row.case_data === "object" ? row.case_data : {};
    return {
      ...baseCaseData,
      id: row.id || baseCaseData.id,
      createdAt: row.created_at || baseCaseData.createdAt,
      updatedAt: row.updated_at || baseCaseData.updatedAt
    };
  });
};

export const deleteCloudCase = async (userId: string, caseId: string) => {
  try {
    const { error } = await supabase.from(CASES_TABLE).delete().eq("id", caseId).eq("user_id", userId);
    if (error) console.warn("Supabase delete case error:", error);
  } catch (error) {
    console.error("Supabase delete case error:", error);
  }
};

// ----------------- User Profile & Admin Operations -----------------
export const saveOrUpdateUserProfile = async (
  userInfo: { uid: string; email: string; displayName?: string; photoURL?: string },
  currentPlan: PlanType = "free"
): Promise<UserProfile> => {
  const isSuperAdminUser = checkIsSuperAdmin(userInfo.email);
  const now = new Date().toISOString();
  const userId = userInfo.uid;

  const profileData = {
    id: userId,
    uid: userId,
    email: userInfo.email,
    display_name: userInfo.displayName || userInfo.email.split("@")[0],
    displayName: userInfo.displayName || userInfo.email.split("@")[0],
    photo_url: userInfo.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${userId}&backgroundColor=6366f1`,
    photoURL: userInfo.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${userId}&backgroundColor=6366f1`,
    plan: isSuperAdminUser ? "enterprise" : currentPlan,
    status: isSuperAdminUser ? "vip" : "active",
    role: isSuperAdminUser ? "superadmin" : "user",
    last_login_at: now,
    lastLoginAt: now,
    updated_at: now
  };

  try {
    const { error } = await supabase.from(PROFILES_TABLE).upsert(profileData, { onConflict: "id" });
    if (error) {
      console.warn("Profiles table upsert warning:", error);
    }
  } catch (error) {
    console.error("Error saving profile to profiles table:", error);
  }

  return {
    uid: userId,
    email: userInfo.email,
    displayName: profileData.displayName,
    photoURL: profileData.photoURL,
    plan: profileData.plan as PlanType,
    status: profileData.status as AccountStatus,
    role: profileData.role as UserRole,
    createdAt: now,
    lastLoginAt: now,
    caseCount: 0
  };
};

export const fetchAllUsersForAdmin = async (): Promise<UserProfile[]> => {
  try {
    const { data, error } = await supabase.from(PROFILES_TABLE).select("*");
    if (error || !data) {
      console.warn("Error fetching profiles from Supabase:", error);
      return [];
    }
    return data.map((d: any) => ({
      uid: d.id || d.uid,
      email: d.email || "",
      displayName: d.display_name || d.displayName || d.email?.split("@")[0] || "User",
      photoURL: d.photo_url || d.photoURL,
      plan: (d.plan || "free") as PlanType,
      status: (d.status || "active") as AccountStatus,
      role: (d.role || (checkIsSuperAdmin(d.email) ? "superadmin" : "user")) as UserRole,
      customCaseLimit: d.custom_case_limit || d.customCaseLimit,
      adminNotes: d.admin_notes || d.adminNotes,
      createdAt: d.created_at || d.createdAt || new Date().toISOString(),
      lastLoginAt: d.last_login_at || d.lastLoginAt || new Date().toISOString(),
      caseCount: d.case_count ?? d.caseCount ?? 0
    }));
  } catch (error) {
    console.error("Error fetching admin users from profiles table:", error);
    return [];
  }
};

export const updateUserByAdmin = async (
  targetUid: string,
  updates: Partial<UserProfile>,
  adminEmail: string
): Promise<void> => {
  const now = new Date().toISOString();
  const updatePayload: any = {
    ...updates,
    updated_at: now
  };
  if (updates.displayName) updatePayload.display_name = updates.displayName;
  if (updates.photoURL) updatePayload.photo_url = updates.photoURL;

  try {
    await supabase.from(PROFILES_TABLE).update(updatePayload).or(`id.eq.${targetUid},uid.eq.${targetUid}`);

    await addAdminAuditLog({
      id: `log_${Date.now()}`,
      timestamp: now,
      adminEmail,
      action: "UPDATE_USER_ACCOUNT",
      targetUserEmail: targetUid,
      details: `Updated profile in profiles table: ${JSON.stringify(updates)}`
    });
  } catch (error) {
    console.error("Supabase update user error in profiles table:", error);
  }
};

export const deleteUserByAdmin = async (targetUid: string, adminEmail: string): Promise<void> => {
  try {
    await supabase.from(PROFILES_TABLE).delete().or(`id.eq.${targetUid},uid.eq.${targetUid}`);

    await addAdminAuditLog({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      adminEmail,
      action: "DELETE_USER_ACCOUNT",
      targetUserEmail: targetUid,
      details: "Deleted user account from profiles table"
    });
  } catch (error) {
    console.error("Supabase delete user error in profiles table:", error);
  }
};

export const addAdminAuditLog = async (logEntry: AdminAuditLog): Promise<void> => {
  try {
    await supabase.from(AUDIT_LOGS_TABLE).insert(logEntry);
  } catch (error) {
    console.warn("Audit log creation notice:", error);
  }
};

export const fetchAdminAuditLogs = async (): Promise<AdminAuditLog[]> => {
  try {
    const { data } = await supabase.from(AUDIT_LOGS_TABLE).select("*").order("timestamp", { ascending: false });
    return (data as AdminAuditLog[]) || [];
  } catch {
    return [];
  }
};
