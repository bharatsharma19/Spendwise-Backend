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
const logs: any[] = [];

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
    phone: '+919876543210',
  },
];

// --- Helper Functions ---

const logStep = (message: string) => console.log(`\n🔹 ${message}`);

const saveLogs = () => {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(logs, null, 2));
  console.log(`\n✅ Detailed responses saved to ${OUTPUT_FILE}`);
};

const apiRequest = async (token: string | null, method: string, endpoint: string, data?: any) => {
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
    console.log(`${icon} [${method}] ${endpoint} - ${response.status}`);
    if (response.status >= 400) console.log(`   Error: ${JSON.stringify(response.data)}`);

    return response.data;
  } catch (error: any) {
    console.error(`🔥 Error: ${error.message}`);
    return null;
  }
};

// --- Auth Logic ---

const getAuthenticatedUser = async (userConfig: (typeof USERS)[0]) => {
  console.log(`\n👤 Authenticating ${userConfig.name} (${userConfig.email})...`);

  // 1. Try Login
  let { data, error } = await supabase.auth.signInWithPassword({
    email: userConfig.email,
    password: userConfig.password,
  });

  // 2. If Login Fails
  if (error) {
    console.log(`   ⚠️ Login failed: ${error.message}. Checking status...`);

    // Check if user exists in Auth Admin
    const { data: adminUserList } = await supabase.auth.admin.listUsers();
    const existingUser = adminUserList.users.find((u) => u.email === userConfig.email);

    if (existingUser) {
      // User exists but likely not confirmed. Force confirm.
      if (!existingUser.email_confirmed_at) {
        console.log('   User exists but unverified. Auto-verifying...');
        await supabase.auth.admin.updateUserById(existingUser.id, { email_confirm: true });
      }
    } else {
      // User does not exist. Register via API.
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
    console.error(`❌ Fatal: Could not authenticate ${userConfig.email}`);
    process.exit(1);
  }

  console.log('   ✅ Authenticated!');
  return {
    uid: data.user.id,
    token: data.session.access_token,
    ...userConfig,
  };
};

// --- Main Test Flow ---

const runTests = async () => {
  console.log('🚀 Starting System Tests...');

  // 1. Authenticate Both Users
  const bharat = await getAuthenticatedUser(USERS[0]);
  const paynride = await getAuthenticatedUser(USERS[1]);

  // 2. Bharat Personal Tests
  logStep('Bharat: Checking Profile');
  await apiRequest(bharat.token, 'GET', '/api/users/profile');

  logStep('Bharat: Creating Personal Expense');
  await apiRequest(bharat.token, 'POST', '/api/expenses', {
    amount: 150,
    category: 'food',
    description: 'Personal Breakfast',
    date: new Date().toISOString(),
    currency: 'INR',
    isRecurring: false,
  });

  // 3. Group Tests
  logStep('Group: Bharat Creating "Goa Trip"');
  const groupRes = await apiRequest(bharat.token, 'POST', '/api/groups', {
    name: 'Goa Trip',
    description: 'Friends Vacation',
    currency: 'INR',
    settings: { defaultSplitType: 'equal' },
  });

  const groupId = groupRes.data?.id;

  if (groupId) {
    logStep('Group: Adding Paynride to Group');
    await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/members`, {
      email: paynride.email,
      displayName: paynride.name,
    });

    logStep('Group: Bharat adds Shared Expense (2000 INR)');
    await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/expenses`, {
      amount: 2000,
      currency: 'INR',
      category: 'transportation',
      description: 'Flight Booking',
      date: new Date().toISOString(),
      tags: ['flight'],
      receiptUrl: 'https://example.com/receipt.jpg',
      splits: [
        { userId: bharat.uid, amount: 1000 },
        { userId: paynride.uid, amount: 1000 },
      ],
    });

    logStep('Group: Fetching Analytics');
    await apiRequest(bharat.token, 'GET', `/api/groups/${groupId}/analytics`);

    logStep('Group: Settling Up');
    await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/settle`);

    logStep('Group: Paynride Leaving Group');
    await apiRequest(paynride.token, 'POST', `/api/groups/${groupId}/leave`);

    logStep('Group: Bharat Re-adding Paynride by Email');
    await apiRequest(bharat.token, 'POST', `/api/groups/${groupId}/members`, {
      email: paynride.email,
      displayName: paynride.name,
    });
  }

  logStep('Final Stats: Bharat');
  await apiRequest(bharat.token, 'GET', '/api/users/stats');

  saveLogs();
};

runTests().catch(console.error);
