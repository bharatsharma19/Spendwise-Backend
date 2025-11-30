/**
 * 🧪 Robust E2E Test Runner for Spendwise
 * Covers: Personal Expenses, Group Lifecycle, Shadow Invites, Settlements, Member Removal
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// --- CONFIGURATION ---
dotenv.config();

const PORT = process.env.PORT || '5000';
const BASE_URL = `http://localhost:${PORT}`;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const OUTPUT_FILE = path.join(process.cwd(), 'api_test_results.json');
const CREDENTIALS_FILE = path.join(process.cwd(), 'test-credentials.json');

// --- UTILS ---
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const logs: any[] = [];
const log = (emoji: string, msg: string, data?: any) => {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`${timestamp} ${emoji} ${msg}`);
  if (data) {
    const dataStr = JSON.stringify(data);
    console.log(`      ↳ ${dataStr.length > 150 ? dataStr.substring(0, 150) + '...' : dataStr}`);
  }
  logs.push({ timestamp, emoji, msg, data });
};

const saveLogs = () => {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(logs, null, 2));
  console.log(`\n📝 Test logs saved to ${OUTPUT_FILE}`);
};

// --- SUPABASE CLIENTS ---
const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- ACTOR CLASS ---
class UserActor {
  public token: string | null = null;
  public uid: string | null = null;
  public api: AxiosInstance;

  constructor(
    public name: string,
    public email?: string,
    public phone?: string,
    public password?: string
  ) {
    this.api = axios.create({
      baseURL: BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
  }

  setToken(token: string, uid: string) {
    this.token = token;
    this.uid = uid;
    this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // Calculate Shadow Email used by backend for phone-only users
  getShadowEmail(): string {
    if (this.email) return this.email;
    if (this.phone) {
      const clean = this.phone.replace(/[^0-9]/g, '');
      return `phone_${clean}@shadow.spendwise.local`;
    }
    return '';
  }

  async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, data?: any) {
    try {
      const res = await this.api.request({ method, url: endpoint, data });
      const isSuccess = res.status >= 200 && res.status < 300;
      log(
        isSuccess ? '✅' : '❌',
        `[${this.name}] ${method} ${endpoint} (${res.status})`,
        !isSuccess ? res.data : undefined
      );
      return res.data;
    } catch (error: any) {
      log('🔥', `[${this.name}] Network Error: ${error.message}`);
      return null;
    }
  }
}

// --- MAIN TEST FLOW ---

async function run() {
  log('🚀', 'Starting Real-World E2E Test');

  if (!fs.existsSync(CREDENTIALS_FILE)) throw new Error('Missing test-credentials.json');
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8')).users;

  // Dynamically create actors
  // User 0 is Owner. Users 1..N are invitees.
  const owner = new UserActor(creds[0].name, creds[0].email, creds[0].phone, creds[0].password);

  const invitees: UserActor[] = [];
  for (let i = 1; i < creds.length; i++) {
    invitees.push(new UserActor(creds[i].name, creds[i].email, creds[i].phone));
  }

  try {
    // ==========================================
    // 1. SETUP & AUTH
    // ==========================================
    log('\n🔹', 'STEP 1: Authenticate / Register Owner');

    // Ensure Owner exists
    const {
      data: { users },
    } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    let ownerUser = users.find((u) => u.email === owner.email);

    if (!ownerUser) {
      log('ℹ️', `Creating owner account for ${owner.name}...`);
      const { data } = await supabaseAdmin.auth.admin.createUser({
        email: owner.email,
        password: owner.password,
        email_confirm: true,
        user_metadata: { display_name: owner.name },
      });
      ownerUser = data.user!;
    } else {
      await supabaseAdmin.auth.admin.updateUserById(ownerUser.id, {
        password: owner.password,
        email_confirm: true,
      });
    }

    // Login Owner
    const { data: loginData } = await supabaseClient.auth.signInWithPassword({
      email: owner.email!,
      password: owner.password!,
    });
    if (!loginData.session) throw new Error('Owner login failed');
    owner.setToken(loginData.session.access_token, loginData.user.id);
    log('👤', `${owner.name} logged in`);

    // ==========================================
    // 2. PERSONAL EXPENSES
    // ==========================================
    log('\n🔹', 'STEP 2: Personal Expenses');
    await owner.request('POST', '/api/expenses', {
      amount: 50,
      currency: 'USD',
      category: 'food',
      description: 'Solo Lunch',
      date: new Date().toISOString(),
      isRecurring: false,
    });
    await owner.request('GET', '/api/expenses');

    // ==========================================
    // 3. GROUP CREATION & INVITES
    // ==========================================
    log('\n🔹', 'STEP 3: Create Group & Invite Members');

    const groupRes = await owner.request('POST', '/api/groups', {
      name: 'E2E Trip 2025',
      description: 'Automated Test Group',
      currency: 'USD',
      settings: { defaultSplitType: 'equal' },
    });
    const groupId = groupRes?.data?.id;
    if (!groupId) throw new Error('Group creation failed');

    // Invite Users
    for (const actor of invitees) {
      const payload: any = { displayName: actor.name };
      if (actor.email) payload.email = actor.email;
      if (actor.phone) payload.phoneNumber = actor.phone;

      log('📤', `Inviting ${actor.name}...`);
      const memberRes = await owner.request('POST', `/api/groups/${groupId}/members`, payload);

      // CRITICAL: Capture the Shadow User's UID immediately
      if (memberRes?.data?.user_id) {
        actor.uid = memberRes.data.user_id;
      }
    }

    await sleep(2000); // Wait for background shadow user creation

    // ==========================================
    // 4. ACCOUNT CLAIMING (Simulating Invite Acceptance)
    // ==========================================
    log('\n🔹', 'STEP 4: Shadow Users Claim Accounts');

    const commonPassword = 'Password123!';

    // Function to simulate user clicking link -> setting password -> logging in
    const claimAndLogin = async (actor: UserActor) => {
      const shadowEmail = actor.getShadowEmail();

      // 1. Find the Shadow Profile (created by invite)
      // We search in the 'profiles' table, NOT auth.users yet
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('email', shadowEmail)
        .single();

      if (profileError || !profile) {
        log('❌', `Shadow profile not found for ${actor.name} (${shadowEmail})`);
        return false;
      }

      // 2. Check if Auth User already exists (maybe from previous run)
      const {
        data: { user: existingAuth },
      } = await supabaseAdmin.auth.admin.getUserById(profile.id);

      if (!existingAuth) {
        // 3. CLAIM ACCOUNT: Create Auth User with the SAME ID as the Profile
        log('✨', `Claiming account for ${actor.name}...`);
        const { error: createError } = await supabaseAdmin.auth.admin.createUser({
          id: profile.id, // CRITICAL: Link to existing profile ID
          email: shadowEmail,
          password: commonPassword,
          email_confirm: true,
          phone_confirm: true,
          user_metadata: { display_name: actor.name },
        });

        if (createError) {
          log('❌', `Failed to create auth user for ${actor.name}: ${createError.message}`);
          return false;
        }
      } else {
        // Ensure password is set if user existed
        await supabaseAdmin.auth.admin.updateUserById(profile.id, {
          password: commonPassword,
        });
      }

      // 4. Login
      const { data } = await supabaseClient.auth.signInWithPassword({
        email: shadowEmail,
        password: commonPassword,
      });

      if (data.session) {
        actor.setToken(data.session.access_token, data.user.id);
        log('🔓', `${actor.name} claimed & logged in`);
        return true;
      } else {
        log('❌', `${actor.name} failed login`);
        return false;
      }
    };

    // Attempt to claim accounts
    const activeActors = [owner];
    for (const actor of invitees) {
      const success = await claimAndLogin(actor);
      if (success) activeActors.push(actor);
    }

    // ==========================================
    // 5. MEMBER REMOVAL (If 4 or more users, remove the last one)
    // ==========================================
    log('\n🔹', 'STEP 5: Member Management');

    // If we have at least 4 users (Owner + 3 Invitees), remove the last one
    if (activeActors.length >= 4) {
      const userToRemove = activeActors[activeActors.length - 1];
      log('🗑️', `Removing ${userToRemove.name} from group...`);

      await owner.request('DELETE', `/api/groups/${groupId}/members/${userToRemove.uid}`);

      // Remove from active list for expense calculations
      activeActors.pop();
    } else {
      log('ℹ️', 'Skipping removal test (need > 3 active users)');
    }

    // ==========================================
    // 6. GROUP EXPENSES & SPLITS
    // ==========================================
    log('\n🔹', 'STEP 6: Group Expenses');
    const groupDetails = await owner.request('GET', `/api/groups/${groupId}`);
    const memberIds = groupDetails?.data?.members?.map((m: any) => m.userId) || [];

    if (memberIds.length < 2) {
      log('⚠️', 'Not enough members to test splits properly');
    } else {
      // --- REAL WORLD SCENARIO: 5-8 Diverse Expenses ---
      const expenses = [
        { desc: 'Hotel Booking', amount: 300, cat: 'housing', payerIdx: 0 }, // Owner pays
        { desc: 'Dinner at Mario', amount: 80, cat: 'food', payerIdx: 1 }, // User 1 pays
        { desc: 'Uber to Museum', amount: 25, cat: 'transport', payerIdx: 0 }, // Owner pays
        { desc: 'Museum Tickets', amount: 60, cat: 'entertainment', payerIdx: 2 }, // User 2 pays (if exists)
        { desc: 'Drinks', amount: 40, cat: 'food', payerIdx: 1 }, // User 1 pays
        { desc: 'Breakfast', amount: 35, cat: 'food', payerIdx: 0 }, // Owner pays
        { desc: 'Souvenirs', amount: 50, cat: 'shopping', payerIdx: 0 }, // Owner pays
      ];

      for (const exp of expenses) {
        // Ensure payer exists and is active
        const payer = activeActors[exp.payerIdx] || owner;

        if (payer.token) {
          await payer.request('POST', `/api/groups/${groupId}/expenses`, {
            amount: exp.amount,
            currency: 'USD',
            category: exp.cat,
            description: exp.desc,
            date: new Date().toISOString(),
            splits: memberIds.map((uid: string) => ({
              userId: uid,
              amount: exp.amount / memberIds.length,
            })),
          });
          // Small delay to simulate real timing
          await sleep(100);
        }
      }
    }

    // ==========================================
    // 7. ANALYTICS & SETTLEMENT
    // ==========================================
    log('\n🔹', 'STEP 7: Settlements');

    const analytics = await owner.request('GET', `/api/groups/${groupId}/analytics`);
    log('📊', 'Balances:', analytics?.data?.memberBalances);

    const settlement = await owner.request('POST', `/api/groups/${groupId}/settle`);
    const plan = settlement?.data || [];

    log('💸', 'Settlement Plan:');
    if (plan.length === 0) log('👍', '   (No pending settlements)');
    plan.forEach((s: any) => {
      // Resolve IDs to Names for logging
      // Note: We search original invitees list too in case a removed user was involved
      const allKnown = [owner, ...invitees];
      const fromName = allKnown.find((a) => a && a.uid === s.from_user)?.name || s.from_user;
      const toName = allKnown.find((a) => a && a.uid === s.to_user)?.name || s.to_user;
      console.log(`      ➡ ${fromName} pays ${toName}: $${s.amount}`);
    });

    // ==========================================
    // 8. NOTIFICATIONS
    // ==========================================
    log('\n🔹', 'STEP 8: Notifications');
    // Check notifications for the 2nd user
    if (activeActors[1] && activeActors[1].token) {
      const notifs = await activeActors[1].request('GET', '/api/users/notifications');
      log('🔔', `${activeActors[1].name} has ${notifs?.data?.length} notifications`);
    }

    saveLogs();
    console.log('\n✨ Full Suite Test Completed!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Critical Failure:', error.message);
    saveLogs();
    process.exit(1);
  }
}

run();
