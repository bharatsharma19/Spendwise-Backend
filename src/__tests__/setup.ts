// Mock Firebase Admin
const mockDate = new Date('2023-01-01');

class MockTimestamp {
  constructor(private date: Date) {}

  toDate() {
    return this.date;
  }

  static now() {
    return new MockTimestamp(mockDate);
  }

  static fromDate(date: Date) {
    return new MockTimestamp(date);
  }
}

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: MockTimestamp,
}));

// Mock Firebase
jest.mock('../config/firebase', () => ({
  db: {
    collection: jest.fn(),
  },
}));

// Global Jest setup
beforeAll(() => {
  // Add any global setup here
});

afterAll(() => {
  // Add any global cleanup here
});
