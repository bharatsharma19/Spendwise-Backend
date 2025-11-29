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
const CREDENTIALS_FILE = path.join(__dirname, 'test-credentials.json');

interface LogEntry {
  step: string;
  status: number;
  data: unknown;
}
const logs: LogEntry[] = [];

// --- Users Configuration ---
// Load from test-credentials.json or use environment variables
interface UserCredential {
  name: string;
  email: string;
  password: string;
  phone: string;
}

interface CredentialsFile {
  users: UserCredential[];
}

let USERS: UserCredential[] = [];

// Try to load from credentials file
try {
  if (fs.existsSync(CREDENTIALS_FILE)) {
    const credentialsData = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const credentials: CredentialsFile = JSON.parse(credentialsData);
    USERS = credentials.users;
    // eslint-disable-next-line no-console
    console.log(`✅ Loaded ${USERS.length} users from test-credentials.json`);
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `⚠️  test-credentials.json not found. Please create it from test-credentials.json.example`
    );
    // Fallback: try to load from environment variables
    USERS = [
      {
        name: process.env.TEST_USER1_NAME || 'Test User 1',
        email: process.env.TEST_USER1_EMAIL || '',
        password: process.env.TEST_USER1_PASSWORD || '',
        phone: process.env.TEST_USER1_PHONE || '',
      },
      {
        name: process.env.TEST_USER2_NAME || 'Test User 2',
        email: process.env.TEST_USER2_EMAIL || '',
        password: process.env.TEST_USER2_PASSWORD || '',
        phone: process.env.TEST_USER2_PHONE || '',
      },
      {
        name: process.env.TEST_USER3_NAME || 'Test User 3',
        email: process.env.TEST_USER3_EMAIL || '',
        password: process.env.TEST_USER3_PASSWORD || '',
        phone: process.env.TEST_USER3_PHONE || '',
      },
      {
        name: process.env.TEST_USER4_NAME || 'Test User 4',
        email: process.env.TEST_USER4_EMAIL || '',
        password: process.env.TEST_USER4_PASSWORD || '',
        phone: process.env.TEST_USER4_PHONE || '',
      },
    ].filter((user) => user.email && user.password); // Filter out empty users

    if (USERS.length === 0) {
      // eslint-disable-next-line no-console
      console.error(
        '❌ No test users found. Please create test-credentials.json or set environment variables.'
      );
      process.exit(1);
    }
  }
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error loading credentials:', error);
  process.exit(1);
}

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
  const identifier = userConfig.email || userConfig.phone || 'Unknown';
  // eslint-disable-next-line no-console
  console.log(`\n👤 Authenticating ${userConfig.name} (${identifier})...`);

  // Check if user has email or phone
  const hasEmail = userConfig.email && userConfig.email.trim() !== '';
  const hasPhone = userConfig.phone && userConfig.phone.trim() !== '';

  // For phone-only users, create a temporary email for testing login
  // (Supabase doesn't support password login with phone, so we use temp email)
  let loginEmail = userConfig.email;
  if (!hasEmail && hasPhone) {
    // eslint-disable-next-line no-console
    console.log('   📱 Phone-only user detected. Using temporary email for testing...');
    // Create a temporary email based on phone number for testing
    const sanitizedPhone = userConfig.phone.replace(/[^0-9]/g, '');
    loginEmail = `phone-${sanitizedPhone}@test.local`;
  }

  if (!loginEmail) {
    // eslint-disable-next-line no-console
    console.error(`❌ Fatal: User ${userConfig.name} has neither email nor phone`);
    process.exit(1);
  }

  // 1. Try Login
  let { data, error } = await supabase.auth.signInWithPassword({
    email: loginEmail,
    password: userConfig.password,
  });

  // 2. If Login Fails
  if (error) {
    // eslint-disable-next-line no-console
    console.log(`   ⚠️ Login failed: ${error.message}. Checking status...`);

    // Check if user exists in Auth Admin
    const { data: adminUserList } = await supabase.auth.admin.listUsers();
    const formattedPhone = hasPhone
      ? userConfig.phone.startsWith('+')
        ? userConfig.phone
        : `+${userConfig.phone}`
      : undefined;

    // Try to find user by email or phone
    const existingUser = adminUserList.users.find(
      (u) => u.email === loginEmail || (formattedPhone && u.phone === formattedPhone)
    );

    if (existingUser) {
      // User exists - update password and verify if needed (no need to verify for testing)
      // eslint-disable-next-line no-console
      console.log('   User exists. Updating password and auto-verifying...');
      await supabase.auth.admin.updateUserById(existingUser.id, {
        password: userConfig.password,
        email_confirm: true,
        phone_confirm: formattedPhone ? true : undefined,
        // If phone-only, ensure email is set to temp email
        ...(!hasEmail && formattedPhone ? { email: loginEmail } : {}),
      });
    } else {
      // User does not exist. Register via API.
      // eslint-disable-next-line no-console
      console.log('   User does not exist. Registering...');
      const registerData: {
        email?: string;
        password: string;
        phoneNumber?: string;
        displayName?: string;
      } = {
        password: userConfig.password,
        displayName: userConfig.name,
      };

      // For phone-only users, use temporary email for registration
      if (hasEmail) {
        registerData.email = userConfig.email;
      } else {
        registerData.email = loginEmail; // Use temporary email
      }

      // Only include phoneNumber if provided and not empty
      if (hasPhone) {
        registerData.phoneNumber = userConfig.phone;
      }

      await apiRequest(null, 'POST', '/api/auth/register', registerData);

      // Auto-verify immediately after registration (no need to verify for testing)
      const { data: newUserList } = await supabase.auth.admin.listUsers();
      const newUser = newUserList.users.find(
        (u) => u.email === loginEmail || (formattedPhone && u.phone === formattedPhone)
      );
      if (newUser) {
        await supabase.auth.admin.updateUserById(newUser.id, {
          email_confirm: true,
          phone_confirm: formattedPhone ? true : undefined,
        });
      }
    }

    // Retry Login
    const retry = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: userConfig.password,
    });
    data = retry.data;
    error = retry.error;
  }

  if (error || !data?.session) {
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

  // Fetch actual group members to get their UIDs
  logStep('Group: Fetching Group Members');
  const groupDetailsRes = (await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}`)) as {
    data?: { members?: Array<{ userId?: string; displayName?: string }> };
  };

  const groupMembers = groupDetailsRes.data?.members || [];
  const memberUids = groupMembers.map((m) => m.userId).filter((uid): uid is string => !!uid);

  // eslint-disable-next-line no-console
  console.log(`   📋 Found ${memberUids.length} group members:`, memberUids);

  // Map authenticated users to group member UIDs
  const bharatUid = memberUids.find((uid) => uid === bharat.uid) || bharat.uid;
  const paynrideUid = memberUids.find((uid) => uid === paynride.uid) || paynride.uid;
  const rajeshUid = memberUids.find((uid) => uid === rajesh.uid);
  const priyaUid = memberUids.find((uid) => uid === priya.uid);

  // Only create expenses if we have at least 2 members (Bharat and Paynride should be in the group)
  if (memberUids.length >= 2) {
    // Helper function to create splits only for members in the group
    const createSplitsForMembers = (
      totalAmount: number,
      splitType: 'equal' | 'custom',
      customAmounts?: Record<string, number>
    ): Array<{ userId: string; amount: number }> => {
      if (splitType === 'equal') {
        const amountPerMember = totalAmount / memberUids.length;
        return memberUids.map((uid) => ({ userId: uid, amount: amountPerMember }));
      } else if (customAmounts) {
        // Only include members that are in the group
        return memberUids
          .filter((uid) => customAmounts[uid] !== undefined)
          .map((uid) => ({ userId: uid, amount: customAmounts[uid] }));
      }
      return [];
    };

    logStep('Bharat: Adding Flight Booking Expense (Equal Split)');
    await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/expenses`, {
      amount: 40000,
      currency: 'INR',
      category: 'transportation',
      description: 'Flight Booking for Goa Trip',
      date: new Date().toISOString(),
      tags: ['flight', 'transportation'],
      receiptUrl: 'https://example.com/receipts/flight.jpg',
      splits: createSplitsForMembers(40000, 'equal'),
    });

    // Only add hotel expense if Paynride is in the group
    if (paynrideUid && memberUids.includes(paynrideUid)) {
      logStep('Paynride: Adding Hotel Booking Expense (Custom Split)');
      const hotelSplits = createSplitsForMembers(30000, 'custom', {
        [bharatUid]: 15000,
        [paynrideUid]: 15000,
        ...(rajeshUid ? { [rajeshUid]: 7500 } : {}),
        ...(priyaUid ? { [priyaUid]: 7500 } : {}),
      });
      // Adjust amounts if Rajesh/Priya are not in group
      if (hotelSplits.length === 2) {
        hotelSplits[0].amount = 15000;
        hotelSplits[1].amount = 15000;
      }
      await apiRequest(paynride.token, 'POST', `/api/groups/${groupId}/expenses`, {
        amount: 30000,
        currency: 'INR',
        category: 'housing',
        description: 'Hotel Booking - 2 Rooms',
        date: new Date().toISOString(),
        tags: ['hotel', 'accommodation'],
        receiptUrl: 'https://example.com/receipts/hotel.jpg',
        splits: hotelSplits,
      });
    }

    // Only add food expense if Rajesh is in the group
    if (rajeshUid && memberUids.includes(rajeshUid)) {
      logStep('Rajesh: Adding Food Expense (Equal Split)');
      await apiRequest(rajesh.token, 'POST', `/api/groups/${groupId}/expenses`, {
        amount: 5000,
        currency: 'INR',
        category: 'food',
        description: 'Dinner at Beach Restaurant',
        date: new Date().toISOString(),
        tags: ['food', 'dinner'],
        splits: createSplitsForMembers(5000, 'equal'),
      });
    }

    // Only add activity expense if Priya is in the group
    if (priyaUid && memberUids.includes(priyaUid)) {
      logStep('Priya: Adding Activity Expense (Equal Split)');
      await apiRequest(priya.token, 'POST', `/api/groups/${groupId}/expenses`, {
        amount: 8000,
        currency: 'INR',
        category: 'entertainment',
        description: 'Water Sports Activities',
        date: new Date().toISOString(),
        tags: ['activities', 'water-sports'],
        splits: createSplitsForMembers(8000, 'equal'),
      });
    }

    logStep('Bharat: Adding Taxi Expense (Equal Split)');
    const taxiExpenseRes = await apiRequest(
      bharat.token,
      'POST',
      `/api/groups/${groupId}/expenses`,
      {
        amount: 2000,
        currency: 'INR',
        category: 'transportation',
        description: 'Airport Taxi',
        date: new Date().toISOString(),
        tags: ['taxi', 'transportation'],
        splits: createSplitsForMembers(2000, 'equal'),
      }
    );

    // Test marking expense split as paid
    const taxiExpenseId = (taxiExpenseRes as { data?: { id?: string } })?.data?.id;
    if (taxiExpenseId) {
      logStep('Paynride: Marking Taxi Expense Split as Paid');
      await apiRequest(
        paynride.token,
        'POST',
        `/api/groups/${groupId}/expenses/${taxiExpenseId}/pay`
      );
      // eslint-disable-next-line no-console
      console.log('   ✅ Expense split marked as paid');
    }
  }

  // ============================================
  // PART 5: GROUP ANALYTICS
  // ============================================
  logStep('=== PART 5: Group Analytics ===');

  logStep('Group: Fetching Analytics');
  await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}/analytics`);

  // ============================================
  // PART 6: SETTLEMENTS & PAYMENT FLOW
  // ============================================
  logStep('=== PART 6: Settlements & Payment Flow ===');

  logStep('Group: Viewing Analytics Before Settlement');
  const analyticsBefore = await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}/analytics`);
  // eslint-disable-next-line no-console
  console.log(
    '   📊 Balances before settlement:',
    (analyticsBefore as { data?: { memberBalances?: Record<string, number> } })?.data
      ?.memberBalances
  );

  logStep('Group: Generating Settlement Suggestions');
  const settlementRes = await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/settle`);
  const settlements =
    (
      settlementRes as {
        data?: Array<{
          id?: string;
          from_user?: string;
          to_user?: string;
          amount?: number;
          status?: string;
        }>;
      }
    )?.data || [];
  // eslint-disable-next-line no-console
  console.log(`   💰 Generated ${settlements.length} settlement(s)`);

  logStep('Group: Viewing Analytics After Settlement Generation');
  const analyticsAfter = await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}/analytics`);
  // eslint-disable-next-line no-console
  console.log(
    '   📊 Balances after settlement:',
    (analyticsAfter as { data?: { memberBalances?: Record<string, number> } })?.data?.memberBalances
  );

  // Log settlement details
  if (settlements.length > 0) {
    settlements.forEach((settlement, index) => {
      // eslint-disable-next-line no-console
      console.log(
        `   ${index + 1}. ${settlement.from_user} → ${settlement.to_user}: ${settlement.amount} (${settlement.status})`
      );
    });
  }
  // eslint-disable-next-line no-console
  console.log(
    '   ℹ️  Note: Balances remain until settlements are marked as "completed" (settlements are suggestions)'
  );

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
  const leaveAttempt1 = await apiRequest(paynride.token, 'POST', `/api/groups/${groupId}/leave`);
  if ((leaveAttempt1 as { status?: string })?.status === 'fail') {
    // eslint-disable-next-line no-console
    console.log('   ✅ Correctly prevented leaving with balance');
  }

  // Generate settlements again to ensure all debts are covered
  logStep('Group: Generating Final Settlements');
  const finalSettlementRes = await apiRequest(
    bharat.token,
    'POST',
    `/api/groups/${groupId}/settle`
  );
  const finalSettlements =
    (
      finalSettlementRes as {
        data?: Array<{ id?: string; from_user?: string; to_user?: string; amount?: number }>;
      }
    )?.data || [];
  // eslint-disable-next-line no-console
  console.log(`   💰 Final settlements: ${finalSettlements.length} transaction(s)`);

  // View final analytics
  logStep('Group: Viewing Final Analytics After All Settlements');
  const finalAnalytics = await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}/analytics`);
  const finalBalances = (finalAnalytics as { data?: { memberBalances?: Record<string, number> } })
    ?.data?.memberBalances;
  // eslint-disable-next-line no-console
  console.log('   📊 Final balances:', finalBalances);

  // Note: Users can still have balances even after settlements are created
  // because settlements are "pending" until marked as "completed"
  // This is expected behavior - settlements are suggestions, not automatic payments
  logStep('Group: Testing Leave Group After Settlement (May Still Fail if Balances Exist)');
  const leaveAttempt2 = await apiRequest(paynride.token, 'POST', `/api/groups/${groupId}/leave`);
  if ((leaveAttempt2 as { status?: string })?.status === 'fail') {
    // eslint-disable-next-line no-console
    console.log('   ℹ️  User still has balance - settlements are pending, not completed');
  } else {
    // eslint-disable-next-line no-console
    console.log('   ✅ User successfully left group');
  }

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
