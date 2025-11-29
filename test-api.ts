// e2e-invite-based-test.ts
/**
 * E2E test runner — Invitation-based flow (real-world style)
 * - First user: full credentials (name, email, password, phone)
 * - Other users: minimal identifiers (email OR phone OR both), no password required
 * - Owner adds members -> backend creates invites -> invitees complete via accept endpoint
 *
 * IMPORTANT:
 * - This script uses Supabase service role key to auto-verify users for tests (dev/test only).
 * - Adapt endpoints if your API differs (search for CONFIG section).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/* ---------------------- CONFIG (adjust to your API) ---------------------- */

const PORT = process.env.PORT ?? '5000';
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in env');
  process.exit(1);
}

const OUTPUT_FILE = path.join(process.cwd(), 'api_test_responses.json');
const CREDENTIALS_FILE = path.join(process.cwd(), 'test-credentials.json');

// Endpoint templates — change only if your backend uses different routes:
const REGISTER_ENDPOINT = '/api/auth/register';
const LOGIN_ENDPOINT = '/api/auth/login';
const CREATE_GROUP_ENDPOINT = '/api/groups';
const ADD_MEMBER_ENDPOINT_TEMPLATE = (groupId: string) => `/api/groups/${groupId}/members`;
const GET_GROUP_ENDPOINT = (groupId: string) => `/api/groups/${groupId}`;
const ACCEPT_MEMBER_ENDPOINT_TEMPLATE = (groupId: string, memberId: string) =>
  `/api/groups/${groupId}/members/${memberId}/accept`;
// group expense endpoints etc. are used as in your original script

/* ----------------------------- Setup ------------------------------------ */

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  validateStatus: () => true,
  timeout: 20_000,
});

const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type MinimalUser = {
  name?: string;
  email?: string;
  phone?: string;
  password?: string; // for main user only; others will get autogen
};

type AuthUser = {
  uid: string;
  token: string;
  email?: string;
  phone?: string;
  name?: string;
};

type LogEntry = { step: string; status: number | null; data: unknown };
const logs: LogEntry[] = [];

function saveLogs() {
  try {
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(logs, null, 2));
    console.log(`✅ Saved logs to ${OUTPUT_FILE}`);
  } catch (e) {
    console.error('Failed to save logs', e);
  }
}

function nice(...args: any[]) {
  console.log(...args);
}

async function apiRequest(
  token: string | null | undefined,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: any
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const resp = await axiosInstance.request({
      url: endpoint,
      method,
      data,
      headers,
    });
    logs.push({ step: `${method} ${endpoint}`, status: resp.status, data: resp.data });
    const ok = resp.status >= 200 && resp.status < 300;
    nice(ok ? '✅' : '❌', `[${method}] ${endpoint} — ${resp.status}`);
    if (!ok) nice('   ->', JSON.stringify(resp.data));
    return resp.data;
  } catch (err: any) {
    logs.push({ step: `${method} ${endpoint}`, status: null, data: err?.message ?? err });
    nice('🔥', `[${method}] ${endpoint} — error:`, err?.message ?? err);
    return null;
  }
}

/* -------------------------- Credentials loader -------------------------- */

function loadCredentials(): MinimalUser[] {
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    console.error(`❌ Credentials file missing: ${CREDENTIALS_FILE}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.users)) {
    console.error('❌ test-credentials.json must include "users": [ ... ]');
    process.exit(1);
  }
  return parsed.users as MinimalUser[];
}

/* ------------------------ Utility helpers -------------------------------- */

function generatePassword() {
  // deterministic-ish but unique for tests
  return `TmpPass!${Math.random().toString(36).slice(2, 10)}A`;
}

function ensureEmailForPhoneOnly(phone?: string) {
  if (!phone) return undefined;
  const sanitized = phone.replace(/[^0-9]/g, '');
  return `phone-${sanitized}@example.test`;
}

/* -------------------------- Auth / User helpers -------------------------- */

/**
 * Ensure main user exists and can log in. Returns AuthUser with token.
 * - expects the first user in credentials to have password and email.
 */
async function ensurePrimaryUser(user: MinimalUser): Promise<AuthUser> {
  if (!user.email || !user.password) {
    throw new Error('Primary user must have email and password in credentials file');
  }
  // Try login via app endpoint
  const loginResp = await apiRequest(null, 'POST', LOGIN_ENDPOINT, {
    email: user.email,
    password: user.password,
  });

  if (loginResp && loginResp.accessToken) {
    nice('Primary user logged in via app login');
    // Try to find uid via supabase admin by email
    const list = await supabaseAdmin.auth.admin.listUsers();
    const su = list.data.users.find((u) => u.email === user.email);
    if (!su) throw new Error('Primary user not found in Supabase after login');
    return {
      uid: su.id,
      token: loginResp.accessToken,
      email: user.email,
      name: user.name,
      phone: user.phone,
    };
  }

  // If app login didn't work, try to ensure user exists and set password via admin
  const list = await supabaseAdmin.auth.admin.listUsers();
  let existing = list.data.users.find((u) => u.email === user.email);
  if (!existing) {
    nice('Primary user not found in auth; creating via admin.createUser for tests');
    const created = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      phone: user.phone,
      email_confirm: true,
      phone_confirm: user.phone ? true : undefined,
    });
    existing = created.data.user!;
  } else {
    // ensure password & confirm flags
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: user.password,
      email_confirm: true,
      phone_confirm: user.phone ? true : undefined,
    });
  }

  // try login via Supabase auth (to obtain token) as fallback
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await supabaseClient.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (signIn.error) {
    throw new Error('Could not sign in primary user: ' + signIn.error.message);
  }
  const token = signIn.data.session?.access_token ?? '';
  return { uid: existing.id, token, email: user.email, name: user.name, phone: user.phone };
}

/**
 * Invite member(s) to group by calling app add-member endpoint.
 * Returns array of created group-member objects as returned by API.
 */
async function addMemberToGroup(
  ownerToken: string,
  groupId: string,
  payload: { email?: string; phoneNumber?: string; displayName?: string }
) {
  const res = await apiRequest(ownerToken, 'POST', ADD_MEMBER_ENDPOINT_TEMPLATE(groupId), payload);
  // we expect the API to respond with something like { data: { memberId, inviteId, ... } } or { data: member }
  return res;
}

/**
 * Ensure an invited minimal user completes registration and accepts invite:
 * Steps:
 * 1. If user doesn't exist in Auth, call /api/auth/register with password and displayName (or call admin.createUser)
 * 2. Auto-verify via supabase admin (email_confirm/phone_confirm) — test-only
 * 3. Call accept endpoint: POST /api/groups/{groupId}/members/{memberId}/accept { password, displayName }
 * 4. Login via /api/auth/login and return AuthUser
 *
 * The function is resilient: it attempts register -> verify -> accept -> login in order.
 */
async function completeInviteAndAuthenticate(
  invitee: MinimalUser,
  groupId: string,
  memberRecord: any
): Promise<AuthUser> {
  // memberRecord should ideally include memberId or inviteId and the identifier we used to invite
  const memberId =
    memberRecord?.data?.id ?? memberRecord?.id ?? memberRecord?.memberId ?? memberRecord?.inviteId;
  const invitedEmail =
    invitee.email ?? (invitee.phone ? ensureEmailForPhoneOnly(invitee.phone) : undefined);
  const invitedPhone = invitee.phone;
  const password = generatePassword();
  const displayName =
    invitee.name ?? (invitee.email ?? invitee.phone ?? 'Invited User').split('@')[0];

  // 1) Ensure auth user exists: check supabase admin
  const userList = await supabaseAdmin.auth.admin.listUsers();
  const formattedPhone = invitedPhone
    ? invitedPhone.startsWith('+')
      ? invitedPhone
      : `+${invitedPhone}`
    : undefined;
  let found = userList.data.users.find(
    (u) =>
      (invitedEmail && u.email === invitedEmail) || (formattedPhone && u.phone === formattedPhone)
  );

  if (!found) {
    // Try app register first (preferred)
    try {
      await apiRequest(null, 'POST', REGISTER_ENDPOINT, {
        email: invitedEmail,
        phoneNumber: invitedPhone,
        password,
        displayName,
      });
      // small pause might be required in real systems — but we'll proceed to check admin
    } catch (e) {
      // ignore, fallback to admin.createUser
    }

    // Re-check admin
    const after = await supabaseAdmin.auth.admin.listUsers();
    found = after.data.users.find(
      (u) =>
        (invitedEmail && u.email === invitedEmail) || (formattedPhone && u.phone === formattedPhone)
    );
    if (!found) {
      // Create via admin (test fallback)
      const created = await supabaseAdmin.auth.admin.createUser({
        email: invitedEmail,
        password,
        phone: formattedPhone,
        email_confirm: true,
        phone_confirm: formattedPhone ? true : undefined,
      });
      found = created.data.user!;
    } else {
      // update password & confirm flags
      await supabaseAdmin.auth.admin.updateUserById(found.id, {
        password,
        email_confirm: true,
        phone_confirm: formattedPhone ? true : undefined,
        // ensure email present for phone-only users (helps login)
        ...(formattedPhone && !invitedEmail
          ? { email: ensureEmailForPhoneOnly(invitedPhone) }
          : {}),
      });
    }
  } else {
    // user exists — ensure password & confirmations set for tests
    await supabaseAdmin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      phone_confirm: formattedPhone ? true : undefined,
      ...(formattedPhone && !invitedEmail ? { email: ensureEmailForPhoneOnly(invitedPhone) } : {}),
    });
  }

  // 2) Call accept-invite endpoint (preferred real-world flow)
  if (memberId) {
    const acceptEndpoint = ACCEPT_MEMBER_ENDPOINT_TEMPLATE(groupId, memberId);
    await apiRequest(null, 'POST', acceptEndpoint, {
      password,
      displayName,
    });
    // If acceptResp indicates success or redirect, proceed to login
  } else {
    // No memberId available from API response — some backends auto-link on register; we'll try login directly
    nice(
      '   ⚠️ No memberId returned by add-member API; proceeding to login and hoping backend auto-links on register'
    );
  }

  // 3) Login via app endpoint to get token
  const loginBody = { email: invitedEmail, password };
  // If invitedEmail undefined (pure phone), use a temp email we set earlier
  if (!invitedEmail && invitedPhone) {
    loginBody.email = ensureEmailForPhoneOnly(invitedPhone);
  }

  const loginResp = await apiRequest(null, 'POST', LOGIN_ENDPOINT, loginBody);
  if (!loginResp || !loginResp.accessToken) {
    // fallback: try Supabase signInWithPassword
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const emailForSignIn = loginBody.email;
    if (!emailForSignIn) throw new Error('Invitee login failed: No email available');

    const signIn = await supabaseClient.auth.signInWithPassword({
      email: emailForSignIn,
      password,
    });
    if (signIn.error) {
      throw new Error('Invitee login failed: ' + signIn.error.message);
    }
    const token = signIn.data.session?.access_token ?? '';
    // find uid from admin
    const after = await supabaseAdmin.auth.admin.listUsers();
    const su = after.data.users.find(
      (u) => u.email === loginBody.email || (formattedPhone && u.phone === formattedPhone)
    );
    if (!su) throw new Error('Could not find user after sign-in');
    return { uid: su.id, token, email: loginBody.email, phone: invitedPhone, name: displayName };
  } else {
    // success via app login
    const token = loginResp.accessToken;
    // find uid
    const after = await supabaseAdmin.auth.admin.listUsers();
    const su = after.data.users.find(
      (u) => u.email === loginBody.email || (formattedPhone && u.phone === formattedPhone)
    );
    if (!su) throw new Error('Could not find user after app login');
    return { uid: su.id, token, email: loginBody.email, phone: invitedPhone, name: displayName };
  }
}

/* ------------------------------ Test flow -------------------------------- */

async function run() {
  nice('\n🚀 Starting E2E invite-based test');

  const creds = loadCredentials();
  if (creds.length < 1) {
    nice('❌ Provide at least one (primary) user in test-credentials.json');
    process.exit(1);
  }

  // Primary user (first entry) must be full
  const primaryCfg = creds[0];
  if (!primaryCfg.email || !primaryCfg.password) {
    console.error(
      '❌ Primary user (first user) must include email and password in test-credentials.json'
    );
    process.exit(1);
  }

  // Other users are invitees (can be minimal)
  const inviteesCfg = creds.slice(1);

  // Ensure primary user exists and get token
  const primary = await ensurePrimaryUser(primaryCfg);
  nice(`Primary user ready: uid=${primary.uid}`);

  // PART 2: primary user personal actions
  nice('\n=== PART 2: Primary user personal actions ===');
  await apiRequest(primary.token, 'GET', '/api/users/profile');
  await apiRequest(primary.token, 'PUT', '/api/users/profile', {
    displayName: primaryCfg.name ?? 'Primary User',
  });

  await apiRequest(primary.token, 'POST', '/api/expenses', {
    amount: 150,
    category: 'food',
    description: 'Breakfast (primary)',
    date: new Date().toISOString(),
    currency: 'INR',
    isRecurring: false,
  });
  await apiRequest(primary.token, 'GET', '/api/expenses');
  await apiRequest(primary.token, 'GET', '/api/expenses/stats/summary');

  // PART 3: create group
  nice('\n=== PART 3: Create group & invite members ===');
  const createGroupResp = await apiRequest(primary.token, 'POST', CREATE_GROUP_ENDPOINT, {
    name: 'Goa Trip - E2E',
    description: 'Test trip',
    currency: 'INR',
    settings: { defaultSplitType: 'equal', allowMemberInvites: true, requireApproval: false },
  });
  const groupId = (createGroupResp as any)?.data?.id;
  if (!groupId) {
    nice('❌ Could not create group; exiting');
    saveLogs();
    process.exit(1);
  }
  nice('Group created:', groupId);

  // Invite each minimal user (email-only, phone-only, both)
  const invitedMemberRecords: any[] = [];
  for (const inv of inviteesCfg) {
    const payload: any = {};
    if (inv.email) payload.email = inv.email;
    if (inv.phone) payload.phoneNumber = inv.phone;
    // Optionally send displayName placeholder (not required in minimal flow)
    payload.displayName = inv.name ?? undefined;

    nice('Inviting member with payload:', payload);
    const addResp = await addMemberToGroup(primary.token, groupId, payload);
    invitedMemberRecords.push({ invitee: inv, addResp });
  }

  // PART 4: simulate invite acceptance & onboarding by each invited user
  nice('\n=== PART 4: Invitees accept invites, complete registration, and act ===');
  const authenticatedInvitees: AuthUser[] = [];

  // Fetch fresh group members to get member ids (if API exposes them)
  const groupDetails = await apiRequest(primary.token, 'GET', GET_GROUP_ENDPOINT(groupId));
  const groupMembersList = (groupDetails as any)?.data?.members ?? [];

  for (const im of invitedMemberRecords) {
    const inv = im.invitee as MinimalUser;

    // Try to map to a member record returned by group details (match by email or phone)
    const match = groupMembersList.find((m: any) => {
      if (inv.email && m.email === inv.email) return true;
      if (inv.phone && m.phone === inv.phone) return true;
      // some systems store invitee as contact (pending) — fallback: match by displayName or placeholder
      return false;
    });

    const candidateMemberRecord = match ?? im.addResp ?? {};
    try {
      const authUser = await completeInviteAndAuthenticate(inv, groupId, candidateMemberRecord);
      nice('Invitee authenticated:', authUser.uid);
      authenticatedInvitees.push(authUser);
    } catch (err) {
      nice('❌ Invitee onboarding failed for', inv, 'error:', err);
    }
  }

  // For convenience assign aliases to invitees if they exist (email-only -> invitee1, etc.)
  // const [inviteeEmailOnly, inviteePhoneOnly, inviteeBoth] = authenticatedInvitees;

  // PART 5: Group expenses — owner and invitees (if authenticated) add expenses
  nice('\n=== PART 5: Group expenses by owner and invitees ===');

  // Helper: fetch member UIDs from group
  const freshGroup = await apiRequest(primary.token, 'GET', GET_GROUP_ENDPOINT(groupId));
  const members = (freshGroup as any)?.data?.members ?? [];
  const memberUids = members.map((m: any) => m.userId).filter(Boolean);

  nice('Group member UIDs:', memberUids);

  // Owner adds a flight expense split equally
  await apiRequest(primary.token, 'POST', `/api/groups/${groupId}/expenses`, {
    amount: 40000,
    currency: 'INR',
    category: 'transportation',
    description: 'Flight Booking (owner)',
    date: new Date().toISOString(),
    splits: memberUids.length
      ? memberUids.map((uid: string) => ({ userId: uid, amount: 40000 / memberUids.length }))
      : [],
  });

  // If inviteeEmailOnly exists, let them add an expense (simulate their actions)
  for (const auth of authenticatedInvitees) {
    if (!auth.token) continue;
    await apiRequest(auth.token, 'POST', `/api/groups/${groupId}/expenses`, {
      amount: 2000,
      currency: 'INR',
      category: 'food',
      description: `Expense by ${auth.name || auth.email || auth.phone}`,
      date: new Date().toISOString(),
      splits: memberUids.length
        ? memberUids.map((uid: string) => ({ userId: uid, amount: 2000 / memberUids.length }))
        : [],
    });
  }

  // PART 6: Analytics, settlements, notifications
  nice('\n=== PART 6: Analytics, settlements, notifications ===');
  await apiRequest(primary.token, 'GET', `/api/groups/${groupId}/analytics`);
  await apiRequest(primary.token, 'POST', `/api/groups/${groupId}/settle`);

  // Invitees view notifications if authenticated
  for (const auth of authenticatedInvitees) {
    if (!auth.token) continue;
    await apiRequest(auth.token, 'GET', '/api/users/notifications');
  }

  // PART 7: Member management tests (duplicate add, leave, re-add)
  nice('\n=== PART 7: Member management tests ===');
  // Attempt duplicate addition for first invitee (should fail or return error)
  const firstInvitee = inviteesCfg[0];
  if (firstInvitee?.email) {
    await apiRequest(primary.token, 'POST', ADD_MEMBER_ENDPOINT_TEMPLATE(groupId), {
      email: firstInvitee.email,
    });
  }

  // Attempt to leave group with balance (one of authenticated invitees)
  if (authenticatedInvitees[0]?.token) {
    const leaveResp = await apiRequest(
      authenticatedInvitees[0].token,
      'POST',
      `/api/groups/${groupId}/leave`
    );
    nice('Leave response:', leaveResp);
  }

  // Generate final settlements
  await apiRequest(primary.token, 'POST', `/api/groups/${groupId}/settle`);
  await apiRequest(primary.token, 'GET', `/api/groups/${groupId}/analytics`);

  // PART 8: Additional scenarios: create second group
  nice('\n=== PART 8: Additional scenarios ===');
  const group2 = await apiRequest(primary.token, 'POST', CREATE_GROUP_ENDPOINT, {
    name: 'Weekend Trip - E2E',
    description: 'Second group test',
    currency: 'INR',
    settings: { defaultSplitType: 'equal' },
  });
  const group2Id = (group2 as any)?.data?.id;
  if (group2Id) {
    // Add one invitee
    if (authenticatedInvitees[0]?.email) {
      await apiRequest(primary.token, 'POST', ADD_MEMBER_ENDPOINT_TEMPLATE(group2Id), {
        email: authenticatedInvitees[0].email,
      });
    }
    // Add simple expense
    await apiRequest(primary.token, 'POST', `/api/groups/${group2Id}/expenses`, {
      amount: 3000,
      currency: 'INR',
      category: 'food',
      description: 'Weekend Lunch',
      date: new Date().toISOString(),
      splits: authenticatedInvitees[0]
        ? [
            { userId: primary.uid, amount: 1500 },
            { userId: authenticatedInvitees[0].uid, amount: 1500 },
          ]
        : [],
    });
  }

  // SUMMARY
  nice('\n\n🎉 E2E Test Completed — saving logs and exiting');
  saveLogs();
}

/* ------------------------------ Run script ------------------------------- */

run()
  .then(() => {
    nice('✅ Runner finished successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Runner failed:', err);
    saveLogs();
    process.exit(1);
  });
