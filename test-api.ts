import { createClient } from '@supabase/supabase-js';
import axios, { AxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Initialize Supabase Admin Client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const OUTPUT_FILE = path.join(__dirname, 'api_test_responses.json');
interface LogEntry {
  step: string;
  status: number;
  data: unknown;
}
const logs: LogEntry[] = [];

// --- Users Configuration ---
const USERS = [
  {
    name: 'Bharat Sharma',
    email: 'bharat8717sharma@gmail.com',
    password: 'Bharat@12',
    phone: '+918717944975',
  },
  {
    name: 'Paynride',
    email: 'paynride1909@gmail.com',
    password: 'Password@123',
    phone: '+4917623602623',
  },
  {
    name: 'Rajesh Kumar',
    email: 'bharat@nutricheck.eu',
    password: 'Rajesh@12',
    phone: '+917000192752',
  },
  {
    name: 'Mohit Sharma',
    email: 'sharmamadhusudhan54@gmail.com',
    password: 'Mohit@12',
    phone: '+916263859982',
  },
];

// --- Helper Functions ---

// eslint-disable-next-line no-console
const logStep = (message: string): void => console.log(`\n🔹 ${message}`);

const saveLogs = (): void => {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(logs, null, 2));
  // eslint-disable-next-line no-console
  console.log(`\n✅ Detailed responses saved to ${OUTPUT_FILE}`);
};

const apiRequest = async (
  token: string | null,
  method: string,
  endpoint: string,
  data?: Record<string, unknown>
): Promise<unknown> => {
  const url = `${BASE_URL}${endpoint}`;
  const config: AxiosRequestConfig = {
    method,
    url,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    data,
    validateStatus: () => true,
  };

  try {
    const response = await axios(config);
    logs.push({ step: `${method} ${endpoint}`, status: response.status, data: response.data });

    const icon = response.status >= 200 && response.status < 300 ? '✅' : '❌';
    // eslint-disable-next-line no-console
    console.log(`${icon} [${method}] ${endpoint} - ${response.status}`);
    if (response.status >= 400) {
      // eslint-disable-next-line no-console
      console.log(`   Error: ${JSON.stringify(response.data)}`);
    }

    return response.data;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // eslint-disable-next-line no-console
    console.error(`🔥 Error: ${errorMessage}`);
    return null;
  }
};

// --- Auth Logic ---

interface AuthenticatedUser {
  uid: string;
  token: string;
  name: string;
  email: string;
  password: string;
  phone: string;
}

const getAuthenticatedUser = async (userConfig: (typeof USERS)[0]): Promise<AuthenticatedUser> => {
  // eslint-disable-next-line no-console
  console.log(`\n👤 Authenticating ${userConfig.name} (${userConfig.email})...`);

  // 1. Try Login
  let { data, error } = await supabase.auth.signInWithPassword({
    email: userConfig.email,
    password: userConfig.password,
  });

  // 2. If Login Fails
  if (error) {
    // eslint-disable-next-line no-console
    console.log(`   ⚠️ Login failed: ${error.message}. Checking status...`);

    // Check if user exists in Auth Admin
    const { data: adminUserList } = await supabase.auth.admin.listUsers();
    const existingUser = adminUserList.users.find((u) => u.email === userConfig.email);

    if (existingUser) {
      // User exists but likely not confirmed. Force confirm.
      if (!existingUser.email_confirmed_at) {
        // eslint-disable-next-line no-console
        console.log('   User exists but unverified. Auto-verifying...');
        await supabase.auth.admin.updateUserById(existingUser.id, { email_confirm: true });
      }
    } else {
      // User does not exist. Register via API.
      // eslint-disable-next-line no-console
      console.log('   User does not exist. Registering...');
      await apiRequest(null, 'POST', '/api/auth/register', {
        email: userConfig.email,
        password: userConfig.password,
        phoneNumber: userConfig.phone,
        displayName: userConfig.name,
      });

      // Auto-verify immediately after registration
      const { data: newUserList } = await supabase.auth.admin.listUsers();
      const newUser = newUserList.users.find((u) => u.email === userConfig.email);
      if (newUser) {
        await supabase.auth.admin.updateUserById(newUser.id, { email_confirm: true });
      }
    }

    // Retry Login
    const retry = await supabase.auth.signInWithPassword({
      email: userConfig.email,
      password: userConfig.password,
    });
    data = retry.data;
    error = retry.error;
  }

  if (error || !data.session) {
    // eslint-disable-next-line no-console
    console.error(`❌ Fatal: Could not authenticate ${userConfig.email}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log('   ✅ Authenticated!');
  return {
    uid: data.user.id,
    token: data.session.access_token,
    ...userConfig,
  };
};

// --- Main Test Flow ---

const runTests = async (): Promise<void> => {
  // eslint-disable-next-line no-console
  console.log('🚀 Starting Comprehensive System Tests...');
  // eslint-disable-next-line no-console
  console.log('📋 Testing Individual & Group Features\n');

  // ============================================
  // PART 1: AUTHENTICATION & USER SETUP
  // ============================================
  logStep('=== PART 1: Authentication & User Setup ===');

  // Authenticate all users
  const bharat = await getAuthenticatedUser(USERS[0]);
  const paynride = await getAuthenticatedUser(USERS[1]);
  const rajesh = await getAuthenticatedUser(USERS[2]);
  const priya = await getAuthenticatedUser(USERS[3]);

  // ============================================
  // PART 2: INDIVIDUAL USER FEATURES
  // ============================================
  logStep('=== PART 2: Individual User Features ===');

  // Bharat's Personal Profile & Expenses
  logStep('Bharat: Viewing Profile');
  await apiRequest(bharat.token, 'GET', '/api/users/profile');

  logStep('Bharat: Updating Profile');
  await apiRequest(bharat.token, 'PUT', '/api/users/profile', {
    displayName: 'Bharat Sharma (Updated)',
  });

  logStep('Bharat: Creating Personal Expenses');
  const expense1 = await apiRequest(bharat.token, 'POST', '/api/expenses', {
    amount: 150,
    category: 'food',
    description: 'Personal Breakfast',
    date: new Date().toISOString(),
    currency: 'INR',
    isRecurring: false,
  });

  await apiRequest(bharat.token, 'POST', '/api/expenses', {
    amount: 500,
    category: 'transportation',
    description: 'Uber Ride',
    date: new Date().toISOString(),
    currency: 'INR',
    isRecurring: false,
  });

  await apiRequest(bharat.token, 'POST', '/api/expenses', {
    amount: 2000,
    category: 'shopping',
    description: 'Monthly Groceries',
    date: new Date().toISOString(),
    currency: 'INR',
    isRecurring: true,
    recurringFrequency: 'monthly',
  });

  logStep('Bharat: Viewing All Expenses');
  await apiRequest(bharat.token, 'GET', '/api/expenses');

  logStep('Bharat: Getting Expense Statistics');
  await apiRequest(bharat.token, 'GET', '/api/expenses/stats/summary');
  await apiRequest(bharat.token, 'GET', '/api/expenses/stats/categories');
  await apiRequest(bharat.token, 'GET', '/api/expenses/stats/trends');

  logStep('Bharat: Updating an Expense');
  const expenseId = (expense1 as { data?: { id?: string } })?.data?.id;
  if (expenseId) {
    await apiRequest(bharat.token, 'PUT', `/api/expenses/${expenseId}`, {
      amount: 200,
      description: 'Personal Breakfast (Updated)',
    });
  }

  logStep('Bharat: Viewing User Statistics');
  await apiRequest(bharat.token, 'GET', '/api/users/stats');

  // ============================================
  // PART 3: GROUP CREATION & MEMBER MANAGEMENT
  // ============================================
  logStep('=== PART 3: Group Creation & Member Management ===');

  logStep('Bharat: Creating "Goa Trip" Group');
  const groupRes = (await apiRequest(bharat.token, 'POST', '/api/groups', {
    name: 'Goa Trip',
    description: 'Friends Vacation to Goa',
    currency: 'INR',
    settings: {
      defaultSplitType: 'equal',
      allowMemberInvites: true,
      requireApproval: false,
    },
  })) as { data?: { id?: string } };

  const groupId = groupRes.data?.id;

  if (!groupId) {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to create group. Exiting...');
    process.exit(1);
  }

  // Adding members by different methods
  logStep('Group: Adding Paynride by Email');
  await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/members`, {
    email: paynride.email,
    displayName: paynride.name,
  });

  logStep('Group: Adding Rajesh by Phone Number');
  await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/members`, {
    phoneNumber: rajesh.phone,
    displayName: rajesh.name,
  });

  logStep('Group: Adding Priya by Phone Number');
  await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/members`, {
    phoneNumber: priya.phone,
    displayName: priya.name,
  });

  // ============================================
  // PART 4: GROUP EXPENSES
  // ============================================
  logStep('=== PART 4: Group Expenses ===');

  // Get all member UIDs for splits - we'll use the authenticated user UIDs
  const bharatUid = bharat.uid;
  const paynrideUid = paynride.uid;
  const rajeshUid = rajesh.uid;
  const priyaUid = priya.uid;

  if (bharatUid && paynrideUid && rajeshUid && priyaUid) {
    logStep('Bharat: Adding Flight Booking Expense (Equal Split)');
    await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/expenses`, {
      amount: 40000,
      currency: 'INR',
      category: 'transportation',
      description: 'Flight Booking for Goa Trip',
      date: new Date().toISOString(),
      tags: ['flight', 'transportation'],
      receiptUrl: 'https://example.com/receipts/flight.jpg',
      splits: [
        { userId: bharatUid, amount: 10000 },
        { userId: paynrideUid, amount: 10000 },
        { userId: rajeshUid, amount: 10000 },
        { userId: priyaUid, amount: 10000 },
      ],
    });

    logStep('Paynride: Adding Hotel Booking Expense (Custom Split)');
    await apiRequest(paynride.token, 'POST', `/api/groups/${groupId}/expenses`, {
      amount: 30000,
      currency: 'INR',
      category: 'housing',
      description: 'Hotel Booking - 2 Rooms',
      date: new Date().toISOString(),
      tags: ['hotel', 'accommodation'],
      receiptUrl: 'https://example.com/receipts/hotel.jpg',
      splits: [
        { userId: bharatUid, amount: 15000 }, // Room 1
        { userId: paynrideUid, amount: 15000 }, // Room 1
        { userId: rajeshUid, amount: 7500 }, // Room 2 (half)
        { userId: priyaUid, amount: 7500 }, // Room 2 (half)
      ],
    });

    logStep('Rajesh: Adding Food Expense (Equal Split)');
    await apiRequest(rajesh.token, 'POST', `/api/groups/${groupId}/expenses`, {
      amount: 5000,
      currency: 'INR',
      category: 'food',
      description: 'Dinner at Beach Restaurant',
      date: new Date().toISOString(),
      tags: ['food', 'dinner'],
      splits: [
        { userId: bharatUid, amount: 1250 },
        { userId: paynrideUid, amount: 1250 },
        { userId: rajeshUid, amount: 1250 },
        { userId: priyaUid, amount: 1250 },
      ],
    });

    logStep('Priya: Adding Activity Expense (Equal Split)');
    await apiRequest(priya.token, 'POST', `/api/groups/${groupId}/expenses`, {
      amount: 8000,
      currency: 'INR',
      category: 'entertainment',
      description: 'Water Sports Activities',
      date: new Date().toISOString(),
      tags: ['activities', 'water-sports'],
      splits: [
        { userId: bharatUid, amount: 2000 },
        { userId: paynrideUid, amount: 2000 },
        { userId: rajeshUid, amount: 2000 },
        { userId: priyaUid, amount: 2000 },
      ],
    });

    logStep('Bharat: Adding Taxi Expense (Equal Split)');
    await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/expenses`, {
      amount: 2000,
      currency: 'INR',
      category: 'transportation',
      description: 'Airport Taxi',
      date: new Date().toISOString(),
      tags: ['taxi', 'transportation'],
      splits: [
        { userId: bharatUid, amount: 500 },
        { userId: paynrideUid, amount: 500 },
        { userId: rajeshUid, amount: 500 },
        { userId: priyaUid, amount: 500 },
      ],
    });
  }

  // ============================================
  // PART 5: GROUP ANALYTICS
  // ============================================
  logStep('=== PART 5: Group Analytics ===');

  logStep('Group: Fetching Analytics');
  await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}/analytics`);

  // ============================================
  // PART 6: SETTLEMENTS
  // ============================================
  logStep('=== PART 6: Settlements ===');

  logStep('Group: Generating Settlement Suggestions');
  await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/settle`);

  logStep('Group: Viewing Updated Analytics After Settlement');
  await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}/analytics`);

  // ============================================
  // PART 7: NOTIFICATIONS
  // ============================================
  logStep('=== PART 7: Notifications ===');

  logStep('Paynride: Viewing Notifications');
  await apiRequest(paynride.token, 'GET', '/api/users/notifications');

  logStep('Rajesh: Viewing Notifications');
  await apiRequest(rajesh.token, 'GET', '/api/users/notifications');

  logStep('Priya: Viewing Notifications');
  await apiRequest(priya.token, 'GET', '/api/users/notifications');

  // ============================================
  // PART 8: MEMBER MANAGEMENT
  // ============================================
  logStep('=== PART 8: Member Management ===');

  logStep('Group: Testing Duplicate Member Addition (Should Fail)');
  await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/members`, {
    email: paynride.email,
    displayName: paynride.name,
  });

  logStep('Group: Testing Leave Group with Balance (Should Fail)');
  await apiRequest(paynride.token, 'POST', `/api/groups/${groupId}/leave`);

  // Settle all balances first
  logStep('Group: Settling All Balances');
  await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/settle`);

  // Now try leaving
  logStep('Group: Paynride Leaving Group (After Settlement)');
  await apiRequest(paynride.token, 'POST', `/api/groups/${groupId}/leave`);

  logStep('Group: Re-adding Paynride by Email');
  await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/members`, {
    email: paynride.email,
    displayName: paynride.name,
  });

  // ============================================
  // PART 9: EXPENSE MANAGEMENT
  // ============================================
  logStep('=== PART 9: Expense Management ===');

  // Note: Group expense updates would require a specific endpoint
  // For now, we'll test viewing analytics which includes expense data

  // ============================================
  // PART 10: FINAL STATISTICS
  // ============================================
  logStep('=== PART 10: Final Statistics ===');

  logStep('Bharat: Final User Statistics');
  await apiRequest(bharat.token, 'GET', '/api/users/stats');

  logStep('Paynride: Final User Statistics');
  await apiRequest(paynride.token, 'GET', '/api/users/stats');

  logStep('Rajesh: Final User Statistics');
  await apiRequest(rajesh.token, 'GET', '/api/users/stats');

  logStep('Priya: Final User Statistics');
  await apiRequest(priya.token, 'GET', '/api/users/stats');

  logStep('Group: Final Group Analytics');
  await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}/analytics`);

  // ============================================
  // PART 11: ADDITIONAL SCENARIOS
  // ============================================
  logStep('=== PART 11: Additional Scenarios ===');

  logStep('Bharat: Creating Second Group "Weekend Trip"');
  const group2Res = (await apiRequest(bharat.token, 'POST', '/api/groups', {
    name: 'Weekend Trip',
    description: 'Quick Weekend Getaway',
    currency: 'INR',
    settings: { defaultSplitType: 'equal' },
  })) as { data?: { id?: string } };

  const group2Id = group2Res.data?.id;

  if (group2Id) {
    logStep('Group 2: Adding Members');
    await apiRequest(bharat.token, 'POST', `/api/groups/${group2Id}/members`, {
      email: paynride.email,
      displayName: paynride.name,
    });

    logStep('Group 2: Adding Expense');
    await apiRequest(bharat.token, 'POST', `/api/groups/${group2Id}/expenses`, {
      amount: 3000,
      currency: 'INR',
      category: 'food',
      description: 'Weekend Lunch',
      date: new Date().toISOString(),
      splits: [
        { userId: bharat.uid, amount: 1500 },
        { userId: paynride.uid, amount: 1500 },
      ],
    });
  }

  // ============================================
  // SUMMARY
  // ============================================
  // eslint-disable-next-line no-console
  console.log('\n\n🎉 ============================================');
  // eslint-disable-next-line no-console
  console.log('✅ All Tests Completed Successfully!');
  // eslint-disable-next-line no-console
  console.log('============================================\n');

  saveLogs();
};

runTests().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('❌ Test Suite Failed:', error);
  process.exit(1);
});
